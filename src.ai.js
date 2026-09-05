export const DEFAULT_AI_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_FISH_MODEL = 's2.1-pro-free';
export const PROVIDER_DEFAULT_MODELS = {
    gemini: DEFAULT_AI_MODEL,
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    deepseek: 'deepseek-chat',
    openrouter: 'openai/gpt-4o-mini',
    custom: DEFAULT_AI_MODEL
};

const providerDefaults = {
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
    openai: 'https://api.openai.com/v1/chat/completions',
    anthropic: 'https://api.anthropic.com/v1/messages',
    deepseek: 'https://api.deepseek.com/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions'
};

const cleanText = (value) => String(value || '').replace(/^```[\s\S]*?\n|```$/g, '').trim();

const callAIProxy = async (messages, config, settings) => {
    const provider = String(config.provider || 'gemini').trim().toLowerCase();
    const key = config.apiKey || (provider === 'gemini' ? settings.geminiApiKey : '');
    const playerModel = String(config.model || '').trim();
    const model = provider === 'gemini' && (!playerModel || playerModel === DEFAULT_AI_MODEL)
        ? settings.geminiModel || DEFAULT_AI_MODEL
        : playerModel || PROVIDER_DEFAULT_MODELS[provider] || DEFAULT_AI_MODEL;
    if (!key) throw new Error(`${provider} API key is not configured.`);

    const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, apiKey: key, messages })
    });
    if (response.status === 404) return null;
    let data = {};
    try { data = await response.json(); } catch { /* handled below */ }
    if (!response.ok) throw new Error(data.error || `${provider} proxy request failed (${response.status}).`);
    if (!data.content) throw new Error(`${provider} proxy returned an empty response.`);
    return { role: 'assistant', content: cleanText(data.content) };
};

const getGeminiText = (data) => data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';

const callGemini = async (messages, config, settings) => {
    const key = config.apiKey || settings.geminiApiKey;
    // The global Gemini model is the fallback for players still using the
    // default model. A player-specific model always wins when explicitly set.
    const playerModel = String(config.model || '').trim();
    const model = playerModel && playerModel !== DEFAULT_AI_MODEL
        ? playerModel
        : settings.geminiModel || DEFAULT_AI_MODEL;
    if (!key) throw new Error('Gemini API key is not configured.');

    const system = messages.find(message => message.role === 'system')?.content;
    const contents = messages
        .filter(message => message.role !== 'system')
        .map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(message.content || '') }]
        }));

    const response = await fetch(`${providerDefaults.gemini}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents,
            generationConfig: { temperature: 0.8 }
        })
    });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
    const data = await response.json();
    const content = getGeminiText(data);
    if (!content) throw new Error('Gemini returned an empty response.');
    return { role: 'assistant', content: cleanText(content) };
};

const callOpenAICompatible = async (messages, config, settings) => {
    const provider = String(config.provider || 'openai').toLowerCase();
    const key = config.apiKey || (provider === 'gemini' ? settings.geminiApiKey : '');
    if (!key) throw new Error(`${provider} API key is not configured.`);

    // A custom URL is only valid for the Custom provider. This prevents a URL
    // left over from a previous Custom selection from hijacking another provider.
    const endpoint = provider === 'custom'
        ? String(config.endpoint || '').trim()
        : providerDefaults[provider];
    if (provider === 'custom' && !endpoint) throw new Error('Custom provider URL is not configured.');
    if (!endpoint) throw new Error(`Unsupported AI provider: ${provider}.`);
    const model = config.model || PROVIDER_DEFAULT_MODELS[provider] || DEFAULT_AI_MODEL;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({ model, messages, temperature: 0.8 })
    });
    if (!response.ok) throw new Error(`${provider} request failed (${response.status}).`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
    if (!content) throw new Error(`${provider} returned an empty response.`);
    return { role: 'assistant', content: cleanText(content) };
};

const callAnthropic = async (messages, config) => {
    if (!config.apiKey) throw new Error('Anthropic API key is not configured.');
    const system = messages.find(message => message.role === 'system')?.content;
    const response = await fetch(providerDefaults.anthropic, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: config.model || 'claude-3-5-haiku-latest',
            max_tokens: 256,
            ...(system ? { system } : {}),
            messages: messages.filter(message => message.role !== 'system')
        })
    });
    if (!response.ok) throw new Error(`Anthropic request failed (${response.status}).`);
    const data = await response.json();
    const content = data?.content?.map(part => part.text || '').join('') || '';
    if (!content) throw new Error('Anthropic returned an empty response.');
    return { role: 'assistant', content: cleanText(content) };
};

export async function generateAIText(messages, playerConfig = {}, settings = {}) {
    const config = { ...playerConfig };
    const provider = String(config.provider || 'gemini').trim().toLowerCase();
    if (provider !== 'custom') {
        const proxied = await callAIProxy(messages, { ...config, provider }, settings);
        if (proxied) return proxied;
    }
    if (provider === 'gemini') return callGemini(messages, config, settings);
    if (provider === 'anthropic') return callAnthropic(messages, config);
    return callOpenAICompatible(messages, config, settings);
}

// This model is deliberately separate from player generation. It is only the
// neutral scheduler assistant: it chooses the next speaker from player-rated
// priority, fairness, cooldown, and message context, but never rates priority
// or chooses a game target.
export async function generateSchedulerText(messages, settings = {}) {
    const apiKey = String(settings.schedulerApiKey || settings.geminiApiKey || '').trim();
    const model = String(settings.schedulerModel || settings.geminiModel || DEFAULT_AI_MODEL).trim();
    if (!apiKey) throw new Error('Scheduler or global Gemini API key is not configured.');
    return generateAIText(messages, { provider: 'gemini', model, apiKey }, {
        ...settings,
        geminiApiKey: apiKey,
        geminiModel: model
    });
}

let activeSpeechController = null;
let activeSpeechAudio = null;

export async function speakWithFish(text, settings = {}) {
    const key = settings.fishApiKey?.trim();
    const referenceId = settings.fishVoiceId?.trim();
    if (!key || !referenceId || !settings.fishEnabled) return;

    activeSpeechController?.abort();
    activeSpeechAudio?.pause();
    activeSpeechController = new AbortController();

    const response = await fetch(settings.fishEndpoint || 'https://api.fish.audio/v1/tts', {
        method: 'POST',
        signal: activeSpeechController.signal,
        headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'model': settings.fishModel || DEFAULT_FISH_MODEL
        },
        body: JSON.stringify({
            text,
            reference_id: referenceId,
            format: 'mp3',
            chunk_length: 300,
            latency: 'low',
            normalize: true
        })
    });
    if (!response.ok) throw new Error(`Fish Audio request failed (${response.status}).`);

    // Read the response as network chunks so the setting has true streamed transport.
    const reader = response.body?.getReader();
    const chunks = [];
    if (reader) {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
        }
    } else {
        chunks.push(new Uint8Array(await response.arrayBuffer()));
    }

    const blob = new Blob(chunks, { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    activeSpeechAudio = audio;
    audio.volume = 0.85;
    audio.addEventListener('ended', () => {
        URL.revokeObjectURL(url);
        if (activeSpeechAudio === audio) activeSpeechAudio = null;
    }, { once: true });
    await audio.play();
}
