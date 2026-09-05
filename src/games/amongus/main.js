const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_FISH_MODEL = 's2.1-pro-free';
const PLAYER_DEFAULTS = [
  ['Gemini', 'gemini'], ['ChatGPT', 'openai'], ['Claude', 'anthropic'], ['Grok', 'openrouter'],
  ['Perplexity', 'gemini'], ['Firefly', 'gemini'], ['Copilot', 'openai'], ['DeepSeek', 'deepseek'],
  ['Siri', 'gemini'], ['Player 10', 'gemini']
];
const PROVIDER_MODELS = {
  gemini: DEFAULT_MODEL,
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  deepseek: 'deepseek-chat',
  openrouter: 'openai/gpt-4o-mini',
  custom: DEFAULT_MODEL
};

const byId = id => document.getElementById(id);
const readJson = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '');
    return value && typeof value === 'object' ? value : fallback;
  } catch { return fallback; }
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const makePlayer = (index, source = {}) => {
  const [defaultName, defaultProvider] = PLAYER_DEFAULTS[index] || [`Player ${index + 1}`, 'gemini'];
  const provider = source.provider || defaultProvider;
  return {
    name: source.name || defaultName,
    provider,
    endpoint: source.endpoint || '',
    model: source.model || PROVIDER_MODELS[provider] || DEFAULT_MODEL,
    apiKey: source.apiKey || '',
    personality: source.personality || 'Observant and strategic.',
    img: source.img || 'avatar_texture.png'
  };
};

const loadSharedConfig = () => {
  const saved = readJson('mafia_ai_settings_v2', {});
  let players = Array.isArray(saved.aiPlayers) ? saved.aiPlayers : readJson('mafia_ai_players', []);
  if (!Array.isArray(players)) players = [];
  const savedCount = Number(localStorage.getItem('mafia_total_slots')) || 0;
  const count = Math.max(players.length, savedCount, players.length ? 1 : 10);
  players = Array.from({ length: count }, (_, index) => makePlayer(index, players[index] || {}));
  return {
    geminiApiKey: saved.geminiApiKey || localStorage.getItem('mafia_gemini_api_key') || '',
    geminiModel: saved.geminiModel || localStorage.getItem('mafia_gemini_model') || DEFAULT_MODEL,
    schedulerApiKey: saved.schedulerApiKey || '',
    schedulerModel: saved.schedulerModel || '',
    fishApiKey: saved.fishApiKey || localStorage.getItem('mafia_fish_api_key') || '',
    fishVoiceId: saved.fishVoiceId || localStorage.getItem('mafia_fish_voice_id') || '',
    fishModel: saved.fishModel || localStorage.getItem('mafia_fish_model') || DEFAULT_FISH_MODEL,
    aiPlayers: players
  };
};

const persistSharedConfig = shared => {
  const current = readJson('mafia_ai_settings_v2', {});
  const payload = {
    ...current,
    geminiApiKey: shared.geminiApiKey,
    geminiModel: shared.geminiModel,
    schedulerApiKey: shared.schedulerApiKey,
    schedulerModel: shared.schedulerModel,
    fishApiKey: shared.fishApiKey,
    fishVoiceId: shared.fishVoiceId,
    fishModel: shared.fishModel,
    fishEnabled: Boolean(shared.fishApiKey && shared.fishVoiceId),
    aiPlayers: shared.aiPlayers
  };
  localStorage.setItem('mafia_ai_settings_v2', JSON.stringify(payload));
  localStorage.setItem('mafia_ai_players', JSON.stringify(shared.aiPlayers));
  localStorage.setItem('mafia_total_slots', String(shared.aiPlayers.length));
  localStorage.setItem('mafia_gemini_api_key', shared.geminiApiKey);
  localStorage.setItem('mafia_gemini_model', shared.geminiModel);
  localStorage.setItem('mafia_fish_api_key', shared.fishApiKey);
  localStorage.setItem('mafia_fish_voice_id', shared.fishVoiceId);
  localStorage.setItem('mafia_fish_model', shared.fishModel);
};

const storedGameSettings = readJson('among_us_settings_v1', {});
const gameSettings = {
  playWithThem: Boolean(storedGameSettings.playWithThem),
  disableAbstaining: Boolean(storedGameSettings.disableAbstaining),
  recordGame: Boolean(storedGameSettings.recordGame),
  userRole: storedGameSettings.userRole || 'RANDOM'
};
const shared = loadSharedConfig();

const saveGameSettings = () => localStorage.setItem('among_us_settings_v1', JSON.stringify({
  playWithThem: gameSettings.playWithThem,
  disableAbstaining: gameSettings.disableAbstaining,
  recordGame: gameSettings.recordGame,
  userRole: gameSettings.userRole
}));

const amongMenu = byId('among-menu');
const settingsPanel = byId('among-settings-panel');
const loadingScreen = byId('loading-screen');
const gameScreen = byId('game-screen');

const openSettings = () => {
  amongMenu.classList.add('hidden');
  settingsPanel.classList.remove('hidden');
  renderSettings();
};
const closeSettings = () => {
  settingsPanel.classList.add('hidden');
  amongMenu.classList.remove('hidden');
};
byId('among-settings').addEventListener('click', openSettings);
byId('settings-back').addEventListener('click', closeSettings);

const capturePlayerCards = () => Array.from(document.querySelectorAll('.ai-card')).map((card, index) => {
  const read = field => card.querySelector(`[data-field="${field}"]`)?.value.trim() || '';
  const provider = read('provider') || 'gemini';
  return makePlayer(index, {
    name: read('name'), provider, endpoint: read('endpoint'), model: read('model') || PROVIDER_MODELS[provider],
    apiKey: read('apiKey'), personality: read('personality'), img: read('img')
  });
});

const syncSharedFromForm = () => {
  shared.geminiApiKey = byId('global-gemini-key').value.trim();
  shared.geminiModel = byId('global-gemini-model').value.trim() || DEFAULT_MODEL;
  shared.schedulerApiKey = byId('scheduler-gemini-key').value.trim();
  shared.schedulerModel = byId('scheduler-gemini-model').value.trim();
  shared.fishApiKey = byId('fish-api-key').value.trim();
  shared.fishVoiceId = byId('fish-voice-id').value.trim();
  shared.fishModel = byId('fish-model').value.trim() || DEFAULT_FISH_MODEL;
  shared.aiPlayers = capturePlayerCards();
  persistSharedConfig(shared);
};

const renderPlayers = () => {
  const list = byId('ai-player-list');
  list.innerHTML = '';
  shared.aiPlayers.forEach((player, index) => {
    const card = document.createElement('article');
    card.className = 'ai-card';
    card.innerHTML = `<div class="ai-card-heading"><span>AI PLAYER ${index + 1}</span>${shared.aiPlayers.length > 1 ? `<button class="remove-ai" type="button" data-remove="${index}">REMOVE</button>` : ''}</div>
      <div class="ai-card-grid">
        <label>Name<input data-field="name" value="${escapeHtml(player.name)}" maxlength="24"></label>
        <label>Provider<select data-field="provider"><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="deepseek">DeepSeek</option><option value="openrouter">OpenRouter</option><option value="custom">Custom</option></select></label>
        <label>Model<input data-field="model" value="${escapeHtml(player.model)}"></label>
        <label>Player API key<input data-field="apiKey" type="password" value="${escapeHtml(player.apiKey)}" placeholder="Provider key"></label>
        <label>Logo PNG filename<input data-field="img" value="${escapeHtml(player.img)}" placeholder="avatar_texture.png"></label>
        <label>Custom endpoint<input data-field="endpoint" value="${escapeHtml(player.endpoint)}" placeholder="Only for Custom"></label>
        <label class="wide">Personality<textarea data-field="personality" rows="2" placeholder="Calm, suspicious, dramatic...">${escapeHtml(player.personality)}</textarea></label>
      </div>`;
    list.appendChild(card);
    card.querySelector('[data-field="provider"]').value = player.provider;
    card.querySelectorAll('[data-field]').forEach(input => input.addEventListener('input', () => {
      shared.aiPlayers = capturePlayerCards();
      persistSharedConfig(shared);
    }));
  });
  list.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    shared.aiPlayers.splice(Number(button.dataset.remove), 1);
    shared.aiPlayers = shared.aiPlayers.map((player, index) => makePlayer(index, player));
    persistSharedConfig(shared);
    renderPlayers();
  }));
};

const renderSettings = () => {
  byId('setting-play-with-them').checked = Boolean(gameSettings.playWithThem);
  byId('setting-disable-abstaining').checked = Boolean(gameSettings.disableAbstaining);
  byId('setting-record').checked = Boolean(gameSettings.recordGame);
  byId('setting-user-role').value = gameSettings.userRole || 'RANDOM';
  byId('role-setting-row').classList.toggle('hidden', !gameSettings.playWithThem);
  byId('global-gemini-key').value = shared.geminiApiKey;
  byId('global-gemini-model').value = shared.geminiModel;
  byId('scheduler-gemini-key').value = shared.schedulerApiKey;
  byId('scheduler-gemini-model').value = shared.schedulerModel;
  byId('fish-api-key').value = shared.fishApiKey;
  byId('fish-voice-id').value = shared.fishVoiceId;
  byId('fish-model').value = shared.fishModel;
  renderPlayers();
};

['global-gemini-key', 'global-gemini-model', 'scheduler-gemini-key', 'scheduler-gemini-model', 'fish-api-key', 'fish-voice-id', 'fish-model']
  .forEach(id => byId(id).addEventListener('input', syncSharedFromForm));
byId('setting-play-with-them').addEventListener('change', event => {
  gameSettings.playWithThem = event.target.checked;
  byId('role-setting-row').classList.toggle('hidden', !gameSettings.playWithThem);
  saveGameSettings();
});
byId('setting-disable-abstaining').addEventListener('change', event => { gameSettings.disableAbstaining = event.target.checked; saveGameSettings(); });
byId('setting-record').addEventListener('change', event => { gameSettings.recordGame = event.target.checked; saveGameSettings(); });
byId('setting-user-role').addEventListener('change', event => { gameSettings.userRole = event.target.value; saveGameSettings(); });
byId('add-ai-player').addEventListener('click', () => {
  shared.aiPlayers = capturePlayerCards();
  shared.aiPlayers.push(makePlayer(shared.aiPlayers.length));
  persistSharedConfig(shared);
  renderPlayers();
});
byId('settings-save').addEventListener('click', () => { syncSharedFromForm(); saveGameSettings(); closeSettings(); });

const assetExists = async path => {
  try { const response = await fetch(`./${path}`, { method: 'HEAD', cache: 'no-store' }); return response.ok; } catch { return false; }
};
const loadImage = src => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const createFallbackFrame = (step = 0) => {
  const canvas = document.createElement('canvas'); canvas.width = 167; canvas.height = 231;
  const ctx = canvas.getContext('2d');
  const bob = step % 2 ? 5 : 0;
  ctx.fillStyle = '#7a0b22'; ctx.beginPath(); ctx.ellipse(83, 130 + bob, 57, 69, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f31e31'; ctx.beginPath(); ctx.roundRect(31, 44 + bob, 99, 108, 36); ctx.fill();
  ctx.fillStyle = '#bde9ff'; ctx.beginPath(); ctx.ellipse(89, 78 + bob, 34, 22, -.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6aa9d0'; ctx.beginPath(); ctx.ellipse(98, 73 + bob, 21, 12, -.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f31e31'; ctx.beginPath(); ctx.roundRect(22, 145 + bob, 45, 39, 17); ctx.fill(); ctx.beginPath(); ctx.roundRect(100, 147 + bob, 45, 37, 17); ctx.fill();
  return canvas.toDataURL();
};

const prepareFrames = async () => {
  const frameNames = ['walk1.png', 'walk2.png', 'walk3.png', 'walk4.png'];
  const available = await Promise.all(frameNames.map(assetExists));
  const sources = available.every(Boolean)
    ? await Promise.all(frameNames.map(name => loadImage(`./${name}`)))
    : frameNames.map((_, index) => null);

  const makeWalkSet = async (color, idlePath) => {
    const idle = await assetExists(idlePath) ? `./${idlePath}` : createFallbackFrame(0);
    if (!available.every(Boolean)) return { idle, walk: frameNames.map((_, index) => createFallbackFrame(index)) };
    const target = await loadImage(`./${idlePath}`).catch(() => null);
    if (!target) return { idle, walk: sources.map(image => image.src) };
    // These coordinates are deliberately read from the original 150x198
    // idle-color PNG. They are the palette anchors for the two colored
    // regions in every supplied walk frame.
    const paletteCanvas = document.createElement('canvas'); paletteCanvas.width = target.width; paletteCanvas.height = target.height;
    const paletteContext = paletteCanvas.getContext('2d'); paletteContext.drawImage(target, 0, 0);
    const palette = paletteContext.getImageData(0, 0, target.width, target.height).data;
    const sample = (x, y) => [palette[(y * target.width + x) * 4], palette[(y * target.width + x) * 4 + 1], palette[(y * target.width + x) * 4 + 2]];
    const redReplacement = sample(87, 103);
    const blueReplacement = sample(60, 145);
    const walk = sources.map(source => {
      const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
      const context = canvas.getContext('2d'); context.drawImage(source, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height); const pixels = imageData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) continue;
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const isRed = r > 150 && g < 85 && b < 100;
        const isBlue = b > 135 && b > r * 1.35 && b > g * 1.25;
        if (isRed || isBlue) {
          const replacement = isRed ? redReplacement : blueReplacement;
          const brightness = (r + g + b) / 765;
          pixels[i] = Math.min(255, replacement[0] * (.55 + brightness));
          pixels[i + 1] = Math.min(255, replacement[1] * (.55 + brightness));
          pixels[i + 2] = Math.min(255, replacement[2] * (.55 + brightness));
        }
      }
      context.putImageData(imageData, 0, 0); return canvas.toDataURL();
    });
    return { color, idle, walk };
  };

  const makeDeadFallback = async idlePath => {
    const source = await loadImage('./blue_dead.png').catch(() => null);
    const target = await loadImage(`./${idlePath}`).catch(() => null);
    if (!source || !target) return target ? `./${idlePath}` : createFallbackFrame(0);
    const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext('2d'); context.drawImage(source, 0, 0);
    const targetCanvas = document.createElement('canvas'); targetCanvas.width = target.width; targetCanvas.height = target.height;
    const targetContext = targetCanvas.getContext('2d'); targetContext.drawImage(target, 0, 0);
    const palette = targetContext.getImageData(0, 0, target.width, target.height).data;
    const sample = (x, y) => [palette[(y * target.width + x) * 4], palette[(y * target.width + x) * 4 + 1], palette[(y * target.width + x) * 4 + 2]];
    const body = sample(87, 103); const shadow = sample(60, 145);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height); const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const isBlueBody = b > r * 1.35 && b > g * 1.25 && (b > 100 || (b > 20 && r < 30 && g < 40));
      if (pixels[i + 3] && isBlueBody) {
        const replacement = b < 80 ? shadow : body;
        const brightness = (r + g + b) / 765;
        pixels[i] = Math.min(255, replacement[0] * (.55 + brightness));
        pixels[i + 1] = Math.min(255, replacement[1] * (.55 + brightness));
        pixels[i + 2] = Math.min(255, replacement[2] * (.55 + brightness));
      }
    }
    context.putImageData(imageData, 0, 0); return canvas.toDataURL();
  };
  const redDead = await assetExists('red_dead.png') ? './red_dead.png' : await makeDeadFallback('red.png');
  const blueDead = await assetExists('blue_dead.png') ? './blue_dead.png' : await makeDeadFallback('blue.png');
  return {
    red: { ...(await makeWalkSet('red', 'red.png')), dead: redDead },
    blue: { ...(await makeWalkSet('blue', 'blue.png')), dead: blueDead }
  };
};

const collision = { canvas: byId('collision-canvas'), context: null, ready: false, ratio: .25, grid: null, gridWidth: 0, gridHeight: 0, pathStep: 32 };
const loadCollision = async () => {
  if (!(await assetExists('skeld_collison.png'))) return;
  const image = await loadImage('./skeld_collison.png');
  collision.canvas.width = Math.floor(image.width * collision.ratio);
  collision.canvas.height = Math.floor(image.height * collision.ratio);
  collision.context = collision.canvas.getContext('2d', { willReadFrequently: true });
  collision.context.drawImage(image, 0, 0, collision.canvas.width, collision.canvas.height);
  collision.ready = true;
  buildPathGrid();
};
const isWalkable = (x, y) => {
  if (x < 180 || y < 150 || x > 8450 || y > 4720) return false;
  if (!collision.ready) return true;
  const px = Math.max(0, Math.min(collision.canvas.width - 1, Math.round(x * collision.ratio)));
  const py = Math.max(0, Math.min(collision.canvas.height - 1, Math.round(y * collision.ratio)));
  const pixel = collision.context.getImageData(px, py, 1, 1).data;
  return pixel[0] > 180 && pixel[1] > 180 && pixel[2] > 180;
};

const buildPathGrid = () => {
  if (!collision.ready) return;
  const step = collision.pathStep;
  const width = Math.ceil(8636 / step); const height = Math.ceil(5000 / step);
  const data = collision.context.getImageData(0, 0, collision.canvas.width, collision.canvas.height).data;
  const grid = new Uint8Array(width * height);
  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const x = Math.min(8635, (gx + .5) * step);
      const y = Math.min(4999, (gy + .5) * step);
      const px = Math.max(0, Math.min(collision.canvas.width - 1, Math.round(x * collision.ratio)));
      const py = Math.max(0, Math.min(collision.canvas.height - 1, Math.round(y * collision.ratio)));
      const offset = (py * collision.canvas.width + px) * 4;
      grid[gy * width + gx] = data[offset] > 180 && data[offset + 1] > 180 && data[offset + 2] > 180 ? 1 : 0;
    }
  }
  collision.grid = grid; collision.gridWidth = width; collision.gridHeight = height;
};

const players = {
  debugtest: { id: 'debugtest', name: 'debugtest', color: 'red', x: 4380, y: 1200, direction: 1, moving: false, alive: true, role: 'CREWMATE', random: true, frameIndex: 0, lastFrameAt: 0, currentFrameSrc: '' },
  dummy1: { id: 'dummy1', name: 'dummy1', color: 'blue', x: 1250, y: 2300, direction: 1, moving: false, alive: true, role: 'CREWMATE', random: true, frameIndex: 0, lastFrameAt: 0, currentFrameSrc: '' }
};
const mapStage = byId('map-stage');
const viewport = byId('map-viewport');
const elements = {
  debugtest: { root: byId('debugtest-player'), frame: byId('player-frame') },
  dummy1: { root: byId('dummy1-player'), frame: byId('dummy1-frame') }
};
const rolePanel = byId('debug-role-panel');
const killAction = byId('kill-action');
const reportAction = byId('report-action');
const reportOverlay = byId('report-overlay');
let controlledPlayerId = 'debugtest';
let frameSets = null;
let scale = .42; let raf = 0; let reportTimer = 0;
const keys = new Set();
const joystickVector = { x: 0, y: 0 };
const randomState = { debugtest: { x: 0, y: 0, until: 0 }, dummy1: { x: 0, y: 0, until: 0 } };
const chasePaths = { debugtest: null, dummy1: null };

const controlledPlayer = () => players[controlledPlayerId];
const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const getNearbyPlayer = (source, includeDead = false) => Object.values(players)
  .filter(candidate => candidate.id !== source.id && (includeDead ? true : candidate.alive))
  .sort((a, b) => distanceBetween(source, a) - distanceBetween(source, b))[0];
const getNearbyBody = source => Object.values(players)
  .filter(candidate => candidate.id !== source.id && !candidate.alive)
  .sort((a, b) => distanceBetween(source, a) - distanceBetween(source, b))[0];

const gridIndexFor = (x, y) => {
  const gx = Math.max(0, Math.min(collision.gridWidth - 1, Math.floor(x / collision.pathStep)));
  const gy = Math.max(0, Math.min(collision.gridHeight - 1, Math.floor(y / collision.pathStep)));
  return { gx, gy, index: gy * collision.gridWidth + gx };
};

const nearestWalkableCell = (x, y) => {
  if (!collision.grid) return null;
  const origin = gridIndexFor(x, y);
  if (collision.grid[origin.index]) return origin;
  for (let radius = 1; radius <= 8; radius++) {
    for (let gy = origin.gy - radius; gy <= origin.gy + radius; gy++) {
      for (let gx = origin.gx - radius; gx <= origin.gx + radius; gx++) {
        if (gx < 0 || gy < 0 || gx >= collision.gridWidth || gy >= collision.gridHeight) continue;
        const index = gy * collision.gridWidth + gx;
        if (collision.grid[index]) return { gx, gy, index };
      }
    }
  }
  return null;
};

const findPath = (from, to) => {
  if (!collision.grid) return [];
  const start = nearestWalkableCell(from.x, from.y); const goal = nearestWalkableCell(to.x, to.y);
  if (!start || !goal) return [];
  const total = collision.grid.length; const previous = new Int32Array(total); previous.fill(-2);
  const queue = new Int32Array(total); let head = 0; let tail = 0;
  previous[start.index] = -1; queue[tail++] = start.index;
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (head < tail && previous[goal.index] === -2) {
    const current = queue[head++]; const gx = current % collision.gridWidth; const gy = Math.floor(current / collision.gridWidth);
    for (const [dx, dy] of neighbors) {
      const nx = gx + dx; const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= collision.gridWidth || ny >= collision.gridHeight) continue;
      const next = ny * collision.gridWidth + nx;
      if (!collision.grid[next] || previous[next] !== -2) continue;
      previous[next] = current; queue[tail++] = next;
    }
  }
  if (previous[goal.index] === -2) return [];
  const points = [];
  for (let current = goal.index; current !== start.index; current = previous[current]) {
    const gx = current % collision.gridWidth; const gy = Math.floor(current / collision.gridWidth);
    points.push({ x: (gx + .5) * collision.pathStep, y: (gy + .5) * collision.pathStep });
  }
  return points.reverse();
};

const updateCamera = () => {
  const current = controlledPlayer();
  const centerX = viewport.clientWidth / 2; const centerY = viewport.clientHeight / 2;
  mapStage.style.transform = `translate(${centerX - current.x * scale}px, ${centerY - current.y * scale}px) scale(${scale})`;
};

const updatePlayerVisual = (player, timestamp = 0) => {
  const element = elements[player.id]; if (!element) return;
  const frame = element.frame; const root = element.root;
  root.style.left = `${player.x}px`; root.style.top = `${player.y}px`;
  root.classList.toggle('player-dead', !player.alive);
  root.classList.toggle('player-walking', player.alive && player.moving);
  root.querySelector('span').style.color = player.role === 'IMPOSTOR' ? '#ff525c' : '#fff';
  root.querySelector('span').textContent = player.name;
  frame.style.transform = `scaleX(${player.direction})`;
  if (!player.alive) {
    const deadPath = frameSets?.[player.color]?.dead || frameSets?.[player.color]?.idle;
    if (player.currentFrameSrc !== deadPath) { frame.src = deadPath; player.currentFrameSrc = deadPath; }
    return;
  }
  const set = frameSets?.[player.color]; if (!set) return;
  if (player.moving && timestamp - player.lastFrameAt > 125) {
    player.frameIndex = (player.frameIndex + 1) % set.walk.length;
    player.lastFrameAt = timestamp;
    frame.src = set.walk[player.frameIndex]; player.currentFrameSrc = frame.src;
  }
  if (!player.moving && player.currentFrameSrc !== set.idle) {
    player.frameIndex = 0; frame.src = set.idle; player.currentFrameSrc = set.idle;
  }
};

const updateActionButtons = () => {
  const current = controlledPlayer();
  const nearby = getNearbyPlayer(current);
  const canKill = current.alive && current.role === 'IMPOSTOR' && nearby && distanceBetween(current, nearby) <= 220;
  killAction.classList.toggle('hidden', !(current.alive && current.role === 'IMPOSTOR'));
  killAction.disabled = !canKill;
  const nearbyBody = getNearbyBody(current);
  reportAction.disabled = !nearbyBody || nearbyBody.alive || distanceBetween(current, nearbyBody) > 240;
};

const updatePerspectiveHud = () => {
  const current = controlledPlayer();
  const hud = byId('perspective-hud');
  hud.querySelector('strong').textContent = current.name;
  hud.style.borderLeftColor = current.role === 'IMPOSTOR' ? '#f34d57' : (current.color === 'blue' ? '#67c7ff' : '#f34d57');
  byId('debug-role-button').textContent = `DEBUG ROLE · ${current.role}`;
};

const refreshRoster = () => {
  Object.values(players).forEach(player => {
    const button = byId(`${player.id}-select`); if (!button) return;
    button.classList.toggle('selected', player.id === controlledPlayerId);
    button.querySelector('span:nth-child(2)').style.color = player.role === 'IMPOSTOR' ? '#ff525c' : '#fff';
    button.querySelector('em').textContent = !player.alive ? 'DEAD' : (player.id === 'dummy1' ? 'REACTOR' : 'CAFETERIA');
  });
};

const refreshGameUi = timestamp => {
  Object.values(players).forEach(player => updatePlayerVisual(player, timestamp));
  updateCamera(); updatePerspectiveHud(); refreshRoster(); updateActionButtons();
};

const chooseRandomDirection = (player, timestamp) => {
  const state = randomState[player.id];
  if (timestamp < state.until) return;
  const angle = Math.random() * Math.PI * 2;
  state.x = Math.cos(angle); state.y = Math.sin(angle); state.until = timestamp + 600 + Math.random() * 1700;
};

const movePlayer = (player, dx, dy, speed) => {
  const length = Math.hypot(dx, dy);
  if (!length) { player.moving = false; return; }
  dx /= length; dy /= length; player.moving = true;
  const desiredAngle = Math.atan2(dy, dx);
  const steeringAngles = [0, .34, -.34, .68, -.68, 1.15, -1.15, 1.57, -1.57, 2.2, -2.2, Math.PI];
  const moved = steeringAngles.some(offset => {
    const angle = desiredAngle + offset; const steerX = Math.cos(angle); const steerY = Math.sin(angle);
    const nextX = player.x + steerX * speed; const nextY = player.y + steerY * speed;
    if (!isWalkable(nextX, player.y) && !isWalkable(player.x, nextY)) return false;
    if (Math.abs(steerX) > .08) player.direction = steerX < 0 ? -1 : 1;
    if (isWalkable(nextX, player.y)) player.x = nextX;
    if (isWalkable(player.x, nextY)) player.y = nextY;
    return true;
  });
  if (!moved) { player.moving = false; randomState[player.id].until = 0; }
};

const movePlayerAlongPath = (player, dx, dy, speed) => {
  const length = Math.hypot(dx, dy);
  if (!length) { player.moving = false; return; }
  dx /= length; dy /= length;
  if (Math.abs(dx) > .08) player.direction = dx < 0 ? -1 : 1;
  const nextX = player.x + dx * speed; const nextY = player.y + dy * speed;
  if (isWalkable(nextX, nextY)) {
    player.x = nextX; player.y = nextY; player.moving = true;
  } else if (isWalkable(nextX, player.y)) {
    player.x = nextX; player.moving = true;
  } else if (isWalkable(player.x, nextY)) {
    player.y = nextY; player.moving = true;
  } else {
    player.moving = false;
  }
};

const getChaseVector = (player, target, timestamp) => {
  const cached = chasePaths[player.id];
  const needsNewPath = !cached || timestamp - cached.updatedAt > 450
    || Math.hypot(target.x - cached.targetX, target.y - cached.targetY) > 110
    || cached.index >= cached.points.length;
  if (needsNewPath) {
    chasePaths[player.id] = {
      points: findPath(player, target), index: 0,
      targetX: target.x, targetY: target.y, updatedAt: timestamp
    };
  }
  const path = chasePaths[player.id];
  while (path.index < path.points.length && Math.hypot(player.x - path.points[path.index].x, player.y - path.points[path.index].y) < 22) path.index++;
  const waypoint = path.points[path.index];
  if (waypoint) return { x: waypoint.x - player.x, y: waypoint.y - player.y };
  return { x: target.x - player.x, y: target.y - player.y };
};

const killPlayer = (killer, target) => {
  if (!killer || !target || !killer.alive || !target.alive || killer.role !== 'IMPOSTOR') return false;
  if (distanceBetween(killer, target) > 240) return false;
  target.alive = false; target.moving = false; target.frameIndex = 0; target.currentFrameSrc = '';
  if (target.id === controlledPlayerId) controlledPlayerId = killer.id;
  refreshGameUi();
  return true;
};

const movementLoop = timestamp => {
  const current = controlledPlayer();
  const keyX = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
  const keyY = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
  let dx = keyX + joystickVector.x; let dy = keyY + joystickVector.y;
  movePlayer(current, dx, dy, 285 / 60);

  Object.values(players).filter(player => player.id !== controlledPlayerId && player.alive).forEach(player => {
    let randomX; let randomY;
    if (player.role === 'IMPOSTOR' && current.alive) {
      const chase = getChaseVector(player, current, timestamp);
      movePlayerAlongPath(player, chase.x, chase.y, 190 / 60);
    } else {
      chooseRandomDirection(player, timestamp); randomX = randomState[player.id].x; randomY = randomState[player.id].y;
      movePlayer(player, randomX, randomY, 190 / 60);
    }
    if (player.role === 'IMPOSTOR' && current.alive && distanceBetween(player, current) <= 175) killPlayer(player, current);
  });
  refreshGameUi(timestamp);
  raf = requestAnimationFrame(movementLoop);
};

const setupJoystick = () => {
  const base = byId('joystick'); const knob = byId('joystick-knob'); let pointerId = null;
  const reset = () => { pointerId = null; joystickVector.x = 0; joystickVector.y = 0; knob.style.transform = 'translate(0, 0)'; };
  const move = event => {
    if (event.pointerId !== pointerId) return;
    const rect = base.getBoundingClientRect(); const radius = rect.width * .38;
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    let x = event.clientX - center.x; let y = event.clientY - center.y; const distance = Math.hypot(x, y);
    if (distance > radius) { x = x / distance * radius; y = y / distance * radius; }
    joystickVector.x = x / radius; joystickVector.y = y / radius; knob.style.transform = `translate(${x}px, ${y}px)`;
  };
  base.addEventListener('pointerdown', event => { pointerId = event.pointerId; base.setPointerCapture(pointerId); move(event); });
  base.addEventListener('pointermove', move); base.addEventListener('pointerup', reset); base.addEventListener('pointercancel', reset); base.addEventListener('lostpointercapture', reset);
};

const showPerspective = () => { gameScreen.classList.add('perspective-active'); byId('perspective-hud').classList.remove('hidden'); byId('player-roster').classList.add('hidden'); refreshGameUi(); };
const selectPerspective = id => { if (!players[id]) return; controlledPlayerId = id; showPerspective(); };
const resetPlayers = () => {
  Object.assign(players.debugtest, { x: 4380, y: 1200, direction: 1, moving: false, alive: true, role: 'CREWMATE', frameIndex: 0, lastFrameAt: 0, currentFrameSrc: '' });
  Object.assign(players.dummy1, { x: 1250, y: 2300, direction: 1, moving: false, alive: true, role: 'CREWMATE', frameIndex: 0, lastFrameAt: 0, currentFrameSrc: '' });
  controlledPlayerId = 'debugtest';
  randomState.debugtest.until = 0; randomState.dummy1.until = 0;
  chasePaths.debugtest = null; chasePaths.dummy1 = null;
};
const startGame = async () => {
  resetPlayers();
  amongMenu.classList.add('hidden'); loadingScreen.classList.remove('hidden');
  const status = byId('loading-status-text'); const percent = byId('loading-percent'); const fill = byId('loading-fill');
  const phases = [['Preparing Cafeteria + Reactor spawn', 22], ['Loading Skeld map', 52], ['Reading collision mask', 76], ['Waking dummy1', 100]];
  const mapReadyPromise = assetExists('skeld_map.png');
  const [mapReady, frameSet] = await Promise.all([mapReadyPromise, prepareFrames(), loadCollision()]).then(values => [values[0], values[1]]);
  frameSets = frameSet;
  if (mapReady) { byId('skeld-map').src = './skeld_map.png'; byId('map-fallback').style.display = 'none'; }
  else { byId('map-fallback').style.display = 'block'; }
  for (const [label, value] of phases) { status.textContent = label; percent.textContent = `${value}%`; fill.style.width = `${value}%`; await new Promise(resolve => setTimeout(resolve, 170)); }
  loadingScreen.classList.add('hidden'); gameScreen.classList.remove('hidden');
  scale = Math.max(.3, Math.min(.52, Math.min(innerWidth / 760, innerHeight / 630)));
  updateCamera(); setupJoystick(); refreshGameUi();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(movementLoop);
};

byId('among-play').addEventListener('click', startGame);
byId('player-toggle').addEventListener('click', () => byId('player-roster').classList.toggle('hidden'));
byId('debugtest-select').addEventListener('click', () => selectPerspective('debugtest'));
byId('dummy1-select').addEventListener('click', () => selectPerspective('dummy1'));
byId('debug-role-button').addEventListener('click', () => rolePanel.classList.remove('hidden'));
byId('debug-role-close').addEventListener('click', () => rolePanel.classList.add('hidden'));
const setCurrentRole = role => { controlledPlayer().role = role; rolePanel.classList.add('hidden'); refreshGameUi(); };
byId('debug-crewmate').addEventListener('click', () => setCurrentRole('CREWMATE'));
byId('debug-impostor').addEventListener('click', () => setCurrentRole('IMPOSTOR'));
killAction.addEventListener('click', () => { const target = getNearbyPlayer(controlledPlayer()); if (target && killPlayer(controlledPlayer(), target)) refreshGameUi(); });
reportAction.addEventListener('click', () => {
  if (reportAction.disabled) return;
  reportOverlay.classList.remove('hidden'); clearTimeout(reportTimer);
  reportTimer = setTimeout(() => reportOverlay.classList.add('hidden'), 5000);
});
byId('game-exit').addEventListener('click', () => { cancelAnimationFrame(raf); gameScreen.classList.add('hidden'); gameScreen.classList.remove('perspective-active'); rolePanel.classList.add('hidden'); amongMenu.classList.remove('hidden'); });
window.addEventListener('keydown', event => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) { keys.add(event.key); event.preventDefault(); } });
window.addEventListener('keyup', event => keys.delete(event.key));
window.addEventListener('resize', updateCamera);
