const PROVIDER_ENDPOINTS = {
    openai: 'https://api.openai.com/v1/chat/completions',
    anthropic: 'https://api.anthropic.com/v1/messages',
    deepseek: 'https://api.deepseek.com/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions'
};

const json = (body, status = 200) => Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
});

const parseJson = async (response) => {
    const raw = await response.text();
    try { return JSON.parse(raw); } catch { return { raw }; }
};

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname !== '/api/ai-chat') return new Response('Not found', { status: 404 });
        if (request.method !== 'POST') return json({ error: 'POST required.' }, 405);

        let input;
        try {
            input = await request.json();
        } catch {
            return json({ error: 'Invalid JSON request.' }, 400);
        }

        const provider = String(input.provider || 'gemini').trim().toLowerCase();
        const apiKey = String(input.apiKey || '').trim();
        const model = String(input.model || '').trim();
        const messages = Array.isArray(input.messages) ? input.messages : [];
        if (!apiKey) return json({ error: `${provider} API key is missing.` }, 400);
        if (!model) return json({ error: `${provider} model is missing.` }, 400);
        if (!messages.length) return json({ error: 'No chat messages were supplied.' }, 400);

        // Custom endpoints remain client-direct because a server-side generic
        // URL proxy would be unsafe. Built-in providers use this same-origin
        // route so browser CORS cannot block their API requests.
        if (provider === 'custom') return json({ error: 'Custom provider URLs must be called directly.' }, 400);

        let endpoint;
        let headers = { 'Content-Type': 'application/json' };
        let body;

        if (provider === 'gemini') {
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const system = messages.find(message => message.role === 'system')?.content;
            body = JSON.stringify({
                ...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
                contents: messages
                    .filter(message => message.role !== 'system')
                    .map(message => ({
                        role: message.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: String(message.content || '') }]
                    })),
                generationConfig: { temperature: 0.8 }
            });
        } else if (provider === 'anthropic') {
            endpoint = PROVIDER_ENDPOINTS.anthropic;
            headers = {
                ...headers,
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            };
            const system = messages.find(message => message.role === 'system')?.content;
            body = JSON.stringify({
                model,
                max_tokens: 256,
                ...(system ? { system } : {}),
                messages: messages.filter(message => message.role !== 'system')
            });
        } else {
            endpoint = PROVIDER_ENDPOINTS[provider];
            if (!endpoint) return json({ error: `Unsupported AI provider: ${provider}.` }, 400);
            headers.Authorization = `Bearer ${apiKey}`;
            body = JSON.stringify({ model, messages, temperature: 0.8 });
        }

        try {
            const upstream = await fetch(endpoint, { method: 'POST', headers, body });
            const data = await parseJson(upstream);
            if (!upstream.ok) {
                const detail = data?.error?.message || data?.error || data?.message || `HTTP ${upstream.status}`;
                return json({ error: `${provider} request failed: ${detail}` }, upstream.status);
            }

            const content = provider === 'gemini'
                ? data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || ''
                : provider === 'anthropic'
                    ? data?.content?.map(part => part.text || '').join('') || ''
                    : data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
            if (!content) return json({ error: `${provider} returned an empty response.` }, 502);
            return json({ content, provider, model });
        } catch (error) {
            return json({ error: `${provider} network request failed: ${error?.message || 'unknown error'}` }, 502);
        }
    }
};
