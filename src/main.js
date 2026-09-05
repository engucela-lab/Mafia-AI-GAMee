import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment, createPlayers, defaultProfiles } from './world.js';
import { MafiaGame } from './games/mafia/game.js';
import { UIController } from './ui.js';
import { AudioController } from './audio.js';
import { AchievementManager } from './achievements.js';
import { DEFAULT_AI_MODEL, DEFAULT_FISH_MODEL, PROVIDER_DEFAULT_MODELS, speakWithFish } from './ai.js';

const init = async () => {


    const container = document.getElementById('game-container');

    // Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.FogExp2(0x111111, 0.02);

    // Camera Setup
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 18, 24);
    camera.lookAt(0, 0, 0);

    // Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; 
    controls.minDistance = 1;
    controls.maxDistance = 50;

    // Camera Focus System
    const cameraLookTarget = new THREE.Vector3(0, 5.5, -10);

    window.focusCameraOn = (player) => {
        if (!player || !player.avatarGroup) return;
        const worldPos = new THREE.Vector3();
        player.avatarGroup.getWorldPosition(worldPos);
        // Focus slightly above the head area for better framing
        worldPos.y += 1.2; 
        cameraLookTarget.copy(worldPos);
    };

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 3.0); // Maximum brightness
    scene.add(ambientLight);

    const spotLight = new THREE.SpotLight(0xffeebb, 3000); // Even brighter spotlight
    spotLight.position.set(0, 35, 0);
    spotLight.angle = Math.PI / 4;
    spotLight.penumbra = 0.5;
    spotLight.decay = 2;
    spotLight.distance = 100;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    scene.add(spotLight);



    // Lightning Light
    const lightningLight = new THREE.PointLight(0xaaddff, 0, 100);
    lightningLight.position.set(0, 30, 0);
    scene.add(lightningLight);

    // Environment controls for Day/Night
    const environment = {
        setDay: () => {
            // Animate transition
            const startAmb = ambientLight.intensity;
            const startSpot = spotLight.intensity;
            const startTime = Date.now();
            
            const animateLight = () => {
                const now = Date.now();
                const progress = Math.min((now - startTime) / 1000, 1);
                
                ambientLight.intensity = startAmb + (3.0 - startAmb) * progress;
                spotLight.intensity = startSpot + (3000 - startSpot) * progress;
                spotLight.color.setHex(0xffeebb); // Warm sun
                scene.background.setHex(0x111111); // Standard dark bg
                scene.fog.color.setHex(0x111111);

                if (progress < 1) requestAnimationFrame(animateLight);
            };
            animateLight();
        },
        setNight: () => {
            const startAmb = ambientLight.intensity;
            const startSpot = spotLight.intensity;
            const startTime = Date.now();

            const animateLight = () => {
                const now = Date.now();
                const progress = Math.min((now - startTime) / 1000, 1);
                
                ambientLight.intensity = startAmb + (0.1 - startAmb) * progress; // Very dim ambient
                spotLight.intensity = startSpot + (200 - startSpot) * progress; // Dim spot
                spotLight.color.setHex(0x445588); // Cool moonlight
                scene.background.setHex(0x000000);
                scene.fog.color.setHex(0x000000);

                if (progress < 1) requestAnimationFrame(animateLight);
            };
            animateLight();
        },
        setStormy: () => {
            const startAmb = ambientLight.intensity;
            const startSpot = spotLight.intensity;
            const startTime = Date.now();

            const animateLight = () => {
                const now = Date.now();
                const progress = Math.min((now - startTime) / 1000, 1);
                
                // Darker than normal night for atmosphere
                ambientLight.intensity = startAmb + (0.05 - startAmb) * progress; 
                spotLight.intensity = startSpot + (100 - startSpot) * progress; 
                spotLight.color.setHex(0x334466); // Cold blue grey
                scene.background.setHex(0x050510);
                scene.fog.color.setHex(0x050510);

                if (progress < 1) requestAnimationFrame(animateLight);
            };
            animateLight();
        },
        triggerLightning: () => {
            lightningLight.intensity = 5000;
            scene.background.setHex(0x445566);
            setTimeout(() => {
                lightningLight.intensity = 1000;
                scene.background.setHex(0x223344);
                setTimeout(() => {
                    lightningLight.intensity = 0;
                    scene.background.setHex(0x050510);
                }, 100);
            }, 50);
        }
    };

    // Populate World
    const initialChairCount = Math.max(2, parseInt(localStorage.getItem('mafia_total_slots') || '15', 10) || 15);
    createEnvironment(scene, initialChairCount);
    let players = createPlayers(scene);

    // Audio Setup
    const audio = new AudioController();
    // Start loading but don't block render
    audio.load().then(() => {
        console.log("Audio loaded");
    });

    // Global UI Sound Handlers
    const getInteractiveElement = (target) => {
        return target.closest('button, .menu-btn, .char-list-item, .action-btn, .setting-toggle, .role-toggle');
    };

    document.addEventListener('click', (e) => {
        if (getInteractiveElement(e.target)) {
            // Slight delay to ensure context is resumed if it was suspended
            audio.playSFX('ui_click', 0.6, 0.1); 
        }
    });

    let lastHovered = null;
    document.addEventListener('mouseover', (e) => {
        const el = getInteractiveElement(e.target);
        // Ensure we only trigger when entering the element, not moving inside it
        if (el && el !== lastHovered) {
            audio.playSFX('ui_hover', 0.2); 
            lastHovered = el;
        } else if (!el) {
            lastHovered = null;
        }
    });

    // Achievement System
    const achievements = new AchievementManager(audio);

    // Game Logic
    const ui = new UIController(audio); // Pass audio to UI
    ui.onSpeak = (player, text) => speakWithFish(text, gameSettings);
    const game = new MafiaGame(players, ui, environment, audio, achievements); // Pass audio to Game
    
    // Main Menu Logic
    const dashboard = document.getElementById('game-dashboard');
    const mainMenu = document.getElementById('main-menu');
    const uiLayer = document.getElementById('ui-layer');
    const btnOpenMafia = document.getElementById('btn-open-mafia');
    const btnBackDashboard = document.getElementById('btn-back-dashboard');
    const btnPlay = document.getElementById('btn-play');
    const btnSettings = document.getElementById('btn-settings');
    const btnCustomize = document.getElementById('btn-customize');
    const btnAchievements = document.getElementById('btn-achievements');
    const btnInfo = document.getElementById('btn-info');
    const btnHowTo = document.getElementById('btn-how-to');
    
    const settingsModal = document.getElementById('settings-modal');
    const infoModal = document.getElementById('info-modal');
    const customizeModal = document.getElementById('customize-modal');
    const achievementsModal = document.getElementById('achievements-modal');
    const howToModal = document.getElementById('how-to-modal');
    
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnCloseHowTo = document.getElementById('btn-close-how-to');
    const btnResetData = document.getElementById('btn-reset-data');
    const btnExit = document.getElementById('btn-exit');

    const versionText = document.getElementById('version-text');
    const versionModal = document.getElementById('version-modal');
    const btnCloseVersion = document.getElementById('btn-close-version');

    versionText.addEventListener('click', () => {
        versionModal.classList.remove('hidden');
    });

    btnCloseVersion.addEventListener('click', () => {
        versionModal.classList.add('hidden');
    });

    const menuContent = mainMenu.querySelector('.menu-content');
    const chaosSettingContainer = document.getElementById('chaos-setting-container');
    const chaosCheckbox = document.getElementById('setting-chaos');
    const roleSelectorContainer = document.getElementById('role-selector-container');
    const roleSelect = document.getElementById('setting-user-role');
    const playWithThemCheckbox = document.getElementById('setting-play-with-them');

    const defaultRoleSettings = {
        MAFIA: { weight: 24, max: 3, enabled: true },
        SHERIFF: { weight: 12, max: 1, enabled: true },
        HEALER: { weight: 12, max: 1, enabled: true },
        CITIZEN: { weight: 46, max: 99, enabled: true },
        VIGILANTE: { weight: 6, max: 1, enabled: true }
    };

    let savedSettings = {};
    try {
        savedSettings = JSON.parse(localStorage.getItem('mafia_ai_settings_v2') || '{}');
    } catch (e) {
        savedSettings = {};
    }
    if (!savedSettings || typeof savedSettings !== 'object' || Array.isArray(savedSettings)) savedSettings = {};
    const storedSetting = (key, fallback = '') => savedSettings[key] ?? localStorage.getItem(key) ?? fallback;

    const gameSettings = {
        vigilanteBullets: 1,
        survivorVests: 2,
        playWithThem: false,
        chaosMode: false,
        ragdolls: false,
        recordGame: false,
        showTrollPanel: localStorage.getItem('mafia_show_troll_panel') !== 'false',
        hideRoles: localStorage.getItem('mafia_hide_roles') === 'true',
        disableAbstaining: false,
        userRole: 'RANDOM',
        muteMusic: localStorage.getItem('mafia_mute_music') === 'true',
        roleSettings: defaultRoleSettings,
        geminiApiKey: storedSetting('geminiApiKey', ''),
        geminiModel: storedSetting('geminiModel', DEFAULT_AI_MODEL) || DEFAULT_AI_MODEL,
        // Scheduler credentials are optional overrides. The scheduler itself
        // falls back to the global Gemini credentials when these are blank.
        schedulerApiKey: storedSetting('schedulerApiKey', ''),
        schedulerModel: storedSetting('schedulerModel', ''),
        fishApiKey: storedSetting('fishApiKey', ''),
        fishVoiceId: storedSetting('fishVoiceId', ''),
        fishModel: storedSetting('fishModel', DEFAULT_FISH_MODEL) || DEFAULT_FISH_MODEL,
        fishEnabled: savedSettings.fishEnabled ?? localStorage.getItem('mafia_fish_enabled') === 'true',
        aiPlayers: []
    };

    let savedAIPlayers = {};
    try {
        savedAIPlayers = savedSettings.aiPlayers
            ?? JSON.parse(localStorage.getItem('mafia_ai_players') || 'null')
            ?? {};
    } catch (e) {
        savedAIPlayers = savedSettings.aiPlayers || {};
    }
    if (!Array.isArray(savedAIPlayers) && (!savedAIPlayers || typeof savedAIPlayers !== 'object')) savedAIPlayers = {};
    gameSettings.aiPlayers = Array.from({ length: initialChairCount }, (_, index) => {
        const savedPlayer = savedAIPlayers[index] || {};
        const provider = savedPlayer.provider || 'gemini';
        const savedModel = String(savedPlayer.model || '').trim();
        // Repair older saves where every provider inherited Gemini's model.
        const model = savedModel && !(provider !== 'gemini' && savedModel === DEFAULT_AI_MODEL)
            ? savedModel
            : PROVIDER_DEFAULT_MODELS[provider] || DEFAULT_AI_MODEL;
        return {
            name: savedPlayer.name || savedModel || defaultProfiles[index]?.name || `Player ${index + 1}`,
            provider,
            endpoint: savedPlayer.endpoint || '',
            model,
            apiKey: savedPlayer.apiKey || '',
            personality: savedPlayer.personality || defaultProfiles[index]?.personality || 'Observant and strategic.',
            img: savedPlayer.img || defaultProfiles[index]?.img || 'avatar_texture.png'
        };
    });
    players.forEach((player, index) => { player.aiConfig = gameSettings.aiPlayers[index]; });

    // Apply initial mute setting
    if (gameSettings.muteMusic) {
        audio.setMusicMuted(true);
        document.getElementById('setting-mute-music').checked = true;
    }

    // Toggle role selector visibility based on play with them
    playWithThemCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            roleSelectorContainer.classList.remove('hidden');
        } else {
            roleSelectorContainer.classList.add('hidden');
        }
    });

    // Camera animation for menu background
    let isMenuOpen = true;

    const openMafiaMenu = () => {
        dashboard.classList.add('hidden');
        mainMenu.style.display = 'flex';
        mainMenu.style.pointerEvents = 'auto';
        requestAnimationFrame(() => mainMenu.classList.remove('hidden'));
    };

    const openDashboard = () => {
        mainMenu.classList.add('hidden');
        mainMenu.style.pointerEvents = 'none';
        menuContent.style.display = 'flex';
        dashboard.classList.remove('hidden');
    };

    btnOpenMafia.addEventListener('click', openMafiaMenu);
    btnBackDashboard.addEventListener('click', openDashboard);

    btnPlay.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent generic click sound
        if (audio) audio.playSFX('ui_start', 1.0); // Special start sound
        
        // Disable interactions immediately
        mainMenu.style.pointerEvents = 'none';
        isMenuOpen = false;

        // Handle "Play With Them" - Setup Human Player
        if (gameSettings.playWithThem) {
            const humanIndex = 0; // Replace the first player
            const humanPlayer = players[humanIndex];
            
            // Update Data
            humanPlayer.name = "You";
            humanPlayer.isHuman = true;
            humanPlayer.img = 'logo_user.png';
            
            // Update Visuals (Texture Swap)
            const textureLoader = new THREE.TextureLoader();
            const userTex = textureLoader.load('logo_user.png');
            userTex.colorSpace = THREE.SRGBColorSpace;

            // Find Sprite in Avatar Group
            const sprite = humanPlayer.avatarGroup.children[0];
            sprite.material.map = userTex;
            
            humanPlayer.avatarGroup.children[1].visible = false; // Hide label for self
        }

        // Pass settings to game
        game.settings = gameSettings;

        mainMenu.classList.add('hidden');
        uiLayer.classList.remove('hidden');
        ui.setTrollPanelVisible(gameSettings.showTrollPanel);
        ui.areRolesRevealed = !gameSettings.hideRoles; // Sync player list visibility with mystery mode
        
        // Explicitly remove from display after transition
        setTimeout(() => {
            if (!isMenuOpen) mainMenu.style.display = 'none';
        }, 600);
        
        // Reset camera to the middle of the table
        const targetPos = new THREE.Vector3(0, 6.5, 0.5); // Center of table, slightly offset for better perspective
        const startPos = camera.position.clone();
        const startTime = Date.now();
        
        controls.enabled = false; // Disable orbit controls during gameplay for cinematic feel

        const animateCam = () => {
            const now = Date.now();
            const progress = Math.min((now - startTime) / 1000, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            
            camera.position.lerpVectors(startPos, targetPos, ease);
            
            if (progress < 1) requestAnimationFrame(animateCam);
        };
        animateCam();

        // Show the priority/pause HUD before the asynchronous match begins.
        // Waiting until game.start() resolves would make it appear only after
        // the entire match had ended.
        const human = players.find(p => p.isHuman);
        ui.setPriorityHUD(true, human ? human.id : 0);
        game.start().catch(error => console.error('Game start failed:', error));
    });

    const renderAIPlayers = () => {
        const container = document.getElementById('ai-player-list');
        if (!container) return;
        container.innerHTML = '';
        gameSettings.aiPlayers.forEach((player, index) => {
            const card = document.createElement('div');
            card.className = 'ai-player-card';
            card.innerHTML = `
                <div class="ai-card-header"><span>AI PLAYER ${index + 1}</span>${gameSettings.aiPlayers.length > 2 ? `<button type="button" class="ai-remove" data-index="${index}">REMOVE</button>` : ''}</div>
                <div class="ai-player-grid">
                    <label>Name<input data-field="name" data-index="${index}" value="${escapeHtml(player.name)}" maxlength="24"></label>
                    <label>Provider<select data-field="provider" data-index="${index}">
                        <option value="gemini">Gemini</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="custom">Custom</option>
                    </select></label>
                    <label class="ai-custom-url" data-index="${index}">Custom URL (only for Custom)<input data-field="endpoint" data-index="${index}" value="${escapeHtml(player.endpoint || '')}" placeholder="https://.../chat/completions"></label>
                    <label>Model<input list="ai-model-presets" data-field="model" data-index="${index}" value="${escapeHtml(player.model || PROVIDER_DEFAULT_MODELS[player.provider] || DEFAULT_AI_MODEL)}" placeholder="Preset or custom model"></label>
                    <label>Player API key<input data-field="apiKey" data-index="${index}" type="password" value="${escapeHtml(player.apiKey || '')}" placeholder="Selected provider key"></label>
                    <label>Logo PNG filename<input data-field="img" data-index="${index}" value="${escapeHtml(player.img || '')}" placeholder="logo_gemini.png"></label>
                    <label class="ai-personality">Personality<textarea data-field="personality" data-index="${index}" rows="2" placeholder="Calm, suspicious, dramatic...">${escapeHtml(player.personality || '')}</textarea></label>
                </div>`;
            container.appendChild(card);
            const provider = card.querySelector('[data-field="provider"]');
            provider.value = player.provider || 'gemini';
            const customUrl = card.querySelector('.ai-custom-url');
            customUrl.classList.toggle('hidden', provider.value !== 'custom');
            provider.addEventListener('change', () => {
                if (provider.value !== 'custom') card.querySelector('[data-field="endpoint"]').value = '';
                const modelInput = card.querySelector('[data-field="model"]');
                const builtInModels = Object.values(PROVIDER_DEFAULT_MODELS);
                if (builtInModels.includes(modelInput.value.trim())) {
                    modelInput.value = PROVIDER_DEFAULT_MODELS[provider.value] || DEFAULT_AI_MODEL;
                }
                customUrl.classList.toggle('hidden', provider.value !== 'custom');
                gameSettings.aiPlayers = captureAIPlayers();
                persistAISettings();
            });
            card.querySelectorAll('[data-field]').forEach(field => {
                field.addEventListener('input', () => {
                    gameSettings.aiPlayers = captureAIPlayers();
                    persistAISettings();
                });
            });
        });
        container.querySelectorAll('.ai-remove').forEach(button => {
            button.addEventListener('click', () => {
                gameSettings.aiPlayers = captureAIPlayers();
                gameSettings.aiPlayers.splice(Number(button.dataset.index), 1);
                persistAISettings();
                renderAIPlayers();
            });
        });
    };

    const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

    const captureAIPlayers = () => Array.from(document.querySelectorAll('.ai-player-card')).map((card, index) => {
        const read = field => card.querySelector(`[data-field="${field}"]`)?.value.trim() || '';
        return {
            name: read('name') || read('model') || `Player ${index + 1}`,
            provider: read('provider') || 'gemini',
            endpoint: read('endpoint'),
            model: read('model') || PROVIDER_DEFAULT_MODELS[read('provider') || 'gemini'] || DEFAULT_AI_MODEL,
            apiKey: read('apiKey'),
            personality: read('personality') || defaultProfiles[index]?.personality || 'Observant and strategic.',
            img: read('img') || defaultProfiles[index]?.img || 'avatar_texture.png'
        };
    });

    const persistAISettings = () => {
        const payload = {
            geminiApiKey: gameSettings.geminiApiKey,
            geminiModel: gameSettings.geminiModel,
            schedulerApiKey: gameSettings.schedulerApiKey,
            schedulerModel: gameSettings.schedulerModel,
            fishApiKey: gameSettings.fishApiKey,
            fishVoiceId: gameSettings.fishVoiceId,
            fishModel: gameSettings.fishModel,
            fishEnabled: gameSettings.fishEnabled,
            aiPlayers: gameSettings.aiPlayers
        };
        localStorage.setItem('mafia_ai_settings_v2', JSON.stringify(payload));
        localStorage.setItem('mafia_gemini_api_key', gameSettings.geminiApiKey);
        localStorage.setItem('mafia_gemini_model', gameSettings.geminiModel);
        localStorage.setItem('mafia_fish_api_key', gameSettings.fishApiKey);
        localStorage.setItem('mafia_fish_voice_id', gameSettings.fishVoiceId);
        localStorage.setItem('mafia_fish_model', gameSettings.fishModel);
        localStorage.setItem('mafia_fish_enabled', String(gameSettings.fishEnabled));
        localStorage.setItem('mafia_ai_players', JSON.stringify(gameSettings.aiPlayers));
        localStorage.setItem('mafia_total_slots', String(gameSettings.aiPlayers.length));
    };

    const syncPlayersToSettings = () => {
        players.forEach(player => scene.remove(player.chairGroup));
        players = createPlayers(scene);
        players.forEach((player, index) => { player.aiConfig = gameSettings.aiPlayers[index]; });
        game.players = players;
        ui.renderPlayerList(players);
    };

    btnSettings.addEventListener('click', () => {
        menuContent.style.display = 'none';
        settingsModal.classList.remove('hidden');
        document.getElementById('setting-show-troll-panel').checked = gameSettings.showTrollPanel;
        document.getElementById('setting-hide-roles').checked = gameSettings.hideRoles;
        renderAIPlayers();
        document.getElementById('setting-gemini-key').value = gameSettings.geminiApiKey;
        document.getElementById('setting-gemini-model').value = gameSettings.geminiModel;
        document.getElementById('setting-scheduler-key').value = gameSettings.schedulerApiKey;
        document.getElementById('setting-scheduler-model').value = gameSettings.schedulerModel;
        document.getElementById('setting-fish-key').value = gameSettings.fishApiKey;
        document.getElementById('setting-fish-voice').value = gameSettings.fishVoiceId;
        document.getElementById('setting-fish-model').value = gameSettings.fishModel;
    });

    const syncGlobalAISettings = () => {
        gameSettings.geminiApiKey = document.getElementById('setting-gemini-key').value.trim();
        gameSettings.geminiModel = document.getElementById('setting-gemini-model').value.trim() || DEFAULT_AI_MODEL;
        gameSettings.schedulerApiKey = document.getElementById('setting-scheduler-key').value.trim();
        gameSettings.schedulerModel = document.getElementById('setting-scheduler-model').value.trim();
        gameSettings.fishApiKey = document.getElementById('setting-fish-key').value.trim();
        gameSettings.fishVoiceId = document.getElementById('setting-fish-voice').value.trim();
        gameSettings.fishModel = document.getElementById('setting-fish-model').value.trim() || DEFAULT_FISH_MODEL;
        gameSettings.fishEnabled = Boolean(gameSettings.fishApiKey && gameSettings.fishVoiceId);
        persistAISettings();
    };

    ['setting-gemini-key', 'setting-gemini-model', 'setting-scheduler-key', 'setting-scheduler-model', 'setting-fish-key', 'setting-fish-voice', 'setting-fish-model']
        .forEach(id => document.getElementById(id).addEventListener('input', syncGlobalAISettings));

    document.getElementById('btn-add-ai-player').addEventListener('click', () => {
        gameSettings.aiPlayers = captureAIPlayers();
        const index = gameSettings.aiPlayers.length;
        gameSettings.aiPlayers.push({
            name: `Player ${index + 1}`,
            provider: 'gemini',
            endpoint: '',
            model: DEFAULT_AI_MODEL,
            apiKey: '',
            personality: defaultProfiles[index]?.personality || 'Observant and strategic.',
            img: defaultProfiles[index]?.img || 'avatar_texture.png'
        });
        persistAISettings();
        renderAIPlayers();
    });

    const muteMusicCheckbox = document.getElementById('setting-mute-music');
    muteMusicCheckbox.addEventListener('change', (e) => {
        gameSettings.muteMusic = e.target.checked;
        audio.setMusicMuted(gameSettings.muteMusic);
        localStorage.setItem('mafia_mute_music', gameSettings.muteMusic);
    });

    btnCloseSettings.addEventListener('click', () => {
        gameSettings.playWithThem = document.getElementById('setting-play-with-them').checked;
        gameSettings.chaosMode = document.getElementById('setting-chaos').checked;
        gameSettings.ragdolls = document.getElementById('setting-ragdolls').checked;
        gameSettings.recordGame = document.getElementById('setting-record').checked;
        gameSettings.showTrollPanel = document.getElementById('setting-show-troll-panel').checked;
        localStorage.setItem('mafia_show_troll_panel', gameSettings.showTrollPanel);
        gameSettings.hideRoles = document.getElementById('setting-hide-roles').checked;
        localStorage.setItem('mafia_hide_roles', gameSettings.hideRoles);
        gameSettings.disableAbstaining = document.getElementById('setting-disable-abstaining').checked;
        gameSettings.userRole = document.getElementById('setting-user-role').value;
        gameSettings.muteMusic = muteMusicCheckbox.checked;

        gameSettings.vigilanteBullets = 1;
        syncGlobalAISettings();

        gameSettings.aiPlayers = captureAIPlayers();
        persistAISettings();

        syncPlayersToSettings();
        
        settingsModal.classList.add('hidden');
        menuContent.style.display = 'flex';
    });

    if (btnResetData) {
        btnResetData.addEventListener('click', () => {
            if(confirm('Reset all saved game data?')) {
                localStorage.removeItem(BP_STORAGE_KEY);
                window.location.reload();
            }
        });
    }



    // Achievements UI Handlers
    if (btnAchievements) {
        btnAchievements.addEventListener('click', () => {
            menuContent.style.display = 'none';
            achievementsModal.classList.remove('hidden');
            achievements.renderModalList(document.getElementById('achievements-list'));
        });
    }

    const btnCloseAchievements = document.getElementById('btn-close-achievements');
    if (btnCloseAchievements) {
        btnCloseAchievements.addEventListener('click', () => {
            achievementsModal.classList.add('hidden');
            menuContent.style.display = 'flex';
        });
    }

    const roleData = [
        { name: "Villager", team: "good", desc: "A town member whose vote is their greatest power." },
        { name: "Sheriff", team: "good", desc: "Investigate one player each night to learn whether they look suspicious." },
        { name: "Doctor", team: "good", desc: "Protect one player each night from the Mafia's attack." },
        { name: "Mafia", team: "evil", desc: "Choose a victim each night and survive long enough to outnumber the town." },
        { name: "Vigilante", team: "good", desc: "An innocent town role with one shot. You can use it or skip the kill." }
    ];

    if (btnInfo) {
        btnInfo.addEventListener('click', () => {
            menuContent.style.display = 'none';
            infoModal.classList.remove('hidden');
            const list = document.getElementById('role-info-list');
            list.innerHTML = '';
            roleData.forEach(role => {
                const item = document.createElement('div');
                item.className = `info-item team-${role.team}`;
                item.innerHTML = `
                    <div class="ach-info">
                        <div class="info-team-tag team-${role.team}">${role.team} team</div>
                        <div class="ach-title">${role.name}</div>
                        <div class="ach-desc">${role.desc}</div>
                    </div>
                `;
                list.appendChild(item);
            });
        });
    }

    const btnCloseInfo = document.getElementById('btn-close-info');
    if (btnCloseInfo) {
        btnCloseInfo.addEventListener('click', () => {
            infoModal.classList.add('hidden');
            menuContent.style.display = 'flex';
        });
    }

    if (btnHowTo) {
        btnHowTo.addEventListener('click', () => {
            menuContent.style.display = 'none';
            howToModal.classList.remove('hidden');
        });
    }

    if (btnCloseHowTo) {
        btnCloseHowTo.addEventListener('click', () => {
            howToModal.classList.add('hidden');
            menuContent.style.display = 'flex';
        });
    }

    // Welcome Message Logic
    const welcomeOverlay = document.getElementById('welcome-message-overlay');
    const btnCloseWelcome = document.getElementById('btn-close-welcome');

    if (welcomeOverlay && btnCloseWelcome) {
        // Show welcome message
        welcomeOverlay.classList.remove('hidden');

        btnCloseWelcome.addEventListener('click', () => {
             if (audio) audio.playSFX('ui_click', 1.0);
             welcomeOverlay.classList.add('hidden');
        });
    }

    // Customization Logic
    let currentEditingSlot = -1;
    let tempCustomData = {};
    let tempTotalSlots = parseInt(localStorage.getItem('mafia_total_slots') || '15');
    const fileInput = document.getElementById('cust-file');
    const previewImg = document.getElementById('cust-preview-img');

    // Canvas Label Helper (Duplicated from World to ensure availability for dynamic updates)
    const createLabelTexture = (text, colorStr, showBox = true, fontSize = 80) => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        if (showBox) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, 0, 512, 256);
            
            ctx.strokeStyle = colorStr;
            ctx.lineWidth = 10;
            ctx.strokeRect(5, 5, 502, 246);
        } else {
            ctx.clearRect(0, 0, 512, 256);
        }

        ctx.fillStyle = colorStr;
        ctx.font = `bold ${fontSize}px Roboto, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 128);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    };

    const loadCustomizationUI = () => {
        const list = document.getElementById('customize-char-list');
        list.innerHTML = '';
        
        // Load current data from LS to temp, if not already loaded
        if (Object.keys(tempCustomData).length === 0) {
            try {
                tempCustomData = JSON.parse(localStorage.getItem('mafia_custom_profiles') || '{}');
            } catch(e) { tempCustomData = {}; }
        }

        const defaults = defaultProfiles;
        const totalSlots = tempTotalSlots;

        // Create List Items
        for(let i=0; i<totalSlots; i++) {
            const item = document.createElement('div');
            item.className = 'char-list-item';
            
            // Container for name
            const nameSpan = document.createElement('span');
            let name = `Slot ${i+1}`;
            
            // Priority: Temp User Data -> Default Profiles -> Generic Slot Name
            if (tempCustomData[i] && tempCustomData[i].name) {
                name = tempCustomData[i].name + " *";
            } else if (i < defaults.length) {
                name = defaults[i].name;
            }
            
            nameSpan.textContent = name;
            item.appendChild(nameSpan);

            // Add Delete Button (allow deleting any slot unless it's the last 2 players)
            if (totalSlots > 2) {
                const delBtn = document.createElement('button');
                delBtn.innerHTML = '🗑️';
                delBtn.className = 'char-del-btn';
                delBtn.style.marginLeft = 'auto';
                delBtn.style.background = 'transparent';
                delBtn.style.border = 'none';
                delBtn.style.cursor = 'pointer';
                delBtn.style.fontSize = '1.2rem';
                
                delBtn.onclick = (e) => {
                    e.stopPropagation(); 
                    deleteSlot(i);
                };
                item.appendChild(delBtn);
            }

            item.onclick = () => selectSlot(i, item);
            list.appendChild(item);
        }
        
        // Add "Add Slot" Button
        const addBtn = document.createElement('div');
        addBtn.className = 'char-list-item';
        addBtn.style.textAlign = 'center';
        addBtn.style.color = '#4488ff';
        addBtn.style.fontWeight = 'bold';
        addBtn.textContent = '+ ADD CHARACTER';
        addBtn.onclick = addNewSlot;
        list.appendChild(addBtn);

        // Select first slot by default if none selected or invalid
        if (currentEditingSlot === -1 || currentEditingSlot >= totalSlots) {
             selectSlot(0, list.children[0]);
        }
    };

    const addNewSlot = () => {
        tempTotalSlots++;
        loadCustomizationUI();
        // Scroll to bottom
        const list = document.getElementById('customize-char-list');
        list.scrollTop = list.scrollHeight;
        // Select new slot
        const newIndex = tempTotalSlots - 1;
        selectSlot(newIndex, list.children[newIndex]);
    };

    const deleteSlot = (index) => {
        if (!confirm("Remove this character?")) return;

        // Shift data
        const maxIndex = tempTotalSlots - 1;
        for (let i = index; i < maxIndex; i++) {
            if (tempCustomData[i+1]) {
                tempCustomData[i] = tempCustomData[i+1];
            } else {
                delete tempCustomData[i];
            }
        }
        delete tempCustomData[maxIndex]; 
        
        tempTotalSlots--;
        if (currentEditingSlot >= index) currentEditingSlot = -1; 
        loadCustomizationUI();
    };

    const selectSlot = (index, element) => {
        currentEditingSlot = index;
        
        // Highlight
        document.querySelectorAll('.char-list-item').forEach(el => el.classList.remove('active'));
        if (element) element.classList.add('active');
        else {
             // Fallback find if element not passed directly (reloads)
             const items = document.querySelectorAll('.char-list-item');
             if(items[index]) items[index].classList.add('active');
        }

        // Populate fields
        const defaults = defaultProfiles;
        let data = tempCustomData[index] || (index < defaults.length ? defaults[index] : {
            name: `Slot ${index+1}`,
            img: 'avatar_texture.png',
            personality: 'A new challenger.'
        });

        document.getElementById('cust-name').value = data.name || '';
        document.getElementById('cust-personality').value = data.personality || '';
        previewImg.src = data.img || 'avatar_texture.png';
        
        // Setup Role Select
        const roleSelect = document.getElementById('cust-role');

        // Rebuild options to handle conditional roles
        roleSelect.innerHTML = `<option value="">Random</option>`;
        
        // Add roles that are enabled in the distribution settings
        Object.entries(gameSettings.roleSettings).forEach(([roleKey, cfg]) => {
            if (cfg.enabled) {
                // Formatting for display: e.g., EVIL_REVIVER -> Evil Reviver
                const label = ({ CITIZEN: 'Villager', HEALER: 'Doctor', MAFIA: 'Mafia', SHERIFF: 'Sheriff', VIGILANTE: 'Vigilante' })[roleKey] || roleKey;
                roleSelect.innerHTML += `<option value="${roleKey}">${label}</option>`;
            }
        });

        roleSelect.value = data.forcedRole || '';

        // Reset file input
        fileInput.value = '';
    };

    // File Input Handler
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                previewImg.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    const saveCurrentSlot = () => {
        if(currentEditingSlot === -1) return;
        
        const name = document.getElementById('cust-name').value;
        const personality = document.getElementById('cust-personality').value;
        const role = document.getElementById('cust-role').value;
        const img = previewImg.src; // Get from preview (either loaded from file or existing)
        
        // Save to temp
        tempCustomData[currentEditingSlot] = {
            name, img, personality,
            forcedRole: role,
            // Preserve color or generate random if new
            colorStr: tempCustomData[currentEditingSlot]?.colorStr || (defaultProfiles[currentEditingSlot]?.text) || '#'+Math.floor(Math.random()*16777215).toString(16)
        };

        if (Object.keys(tempCustomData).length >= 3) {
            achievements.unlock('artistic_being');
        }
        
        // Update list text
        loadCustomizationUI(); // Re-render to update names with *
        
        const btn = document.getElementById('btn-save-char');
        const originalText = btn.textContent;
        btn.textContent = "APPLIED!";
        btn.style.background = "#22aa22";
        btn.style.borderColor = "#22aa22";
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = "";
            btn.style.borderColor = "";
        }, 1000);
    };

    if (btnCustomize) {
        btnCustomize.addEventListener('click', () => {
            menuContent.style.display = 'none';
            customizeModal.classList.remove('hidden');
            loadCustomizationUI();
        });
    }

    document.getElementById('btn-save-char').addEventListener('click', saveCurrentSlot);

    const btnRandomizeBot = document.getElementById('btn-randomize-bot');
    if (btnRandomizeBot) {
        btnRandomizeBot.addEventListener('click', async () => {
            const randomNames = ["Sigma", "Nebula", "Xenon", "Cipher", "Aegis", "Pulse", "Zenith", "Glitch", "Echo", "Flux", "Nova", "Atlas", "Vortex", "Catalyst", "Onyx", "Rogue", "Mirage", "Specter", "Oracle", "Sentry", "Borealis", "Helix", "Quark", "Ion", "Synapse"];
            const randomPers = [
                "Analytical and cold.", "Bubbly and suspicious.", "Logical but prone to fits of rage.",
                "Silent and observant.", "Always tries to redirect suspicion.", "Highly aggressive and confrontational.",
                "Speaks in riddles and metaphors.", "Very apologetic but sneaky.", "Confident and charismatic.",
                "Nervous and easily startled.", "Sarcastic and pessimistic.", "Friendly and helpful, but hiding something.",
                "Paranoid about everyone.", "Quiet but watches everyone's moves.", "Determined to find the Mafia.",
                "Constantly quotes famous philosophers.", "Uses too much internet slang.", "Deeply existential and confused.",
                "Believes they are the protagonist of a movie.", "Extremely competitive and takes everything personally.",
                "Speaks in the third person.", "Has a strange obsession with ducks."
            ];
            
            const nameInput = document.getElementById('cust-name');
            const persInput = document.getElementById('cust-personality');
            const previewImg = document.getElementById('cust-preview-img');
            
            const chosenName = randomNames[Math.floor(Math.random() * randomNames.length)];
            const chosenPers = randomPers[Math.floor(Math.random() * randomPers.length)];
            
            nameInput.value = chosenName;
            persInput.value = chosenPers;
            
            if (audio) audio.playSFX('ui_buy', 0.8);
            
            // UI Feedback for randomizing
            btnRandomizeBot.disabled = true;
            btnRandomizeBot.textContent = "⌛ GENERATING...";
            btnRandomizeBot.style.opacity = "0.6";
            
            const fallback = defaultProfiles[Math.floor(Math.random() * defaultProfiles.length)].img;
            previewImg.src = fallback;
            btnRandomizeBot.disabled = false;
            btnRandomizeBot.textContent = "🎲 RANDOMIZE";
            btnRandomizeBot.style.opacity = "1";
        });
    }

    document.getElementById('btn-close-customize').addEventListener('click', () => {
        // Commit to LS
        localStorage.setItem('mafia_custom_profiles', JSON.stringify(tempCustomData));
        localStorage.setItem('mafia_total_slots', tempTotalSlots.toString());
        
        // Rebuild Players logic if count changed or data updated
        // Always rebuilding is safer to ensure consistency
        
        // 1. Remove existing chairs
        if (players) {
            players.forEach(p => {
                scene.remove(p.chairGroup);
            });
        }
        
        // 2. Recreate Players
        players = createPlayers(scene);
        
        // 3. Update references
        game.players = players;
        ui.renderPlayerList(players);

        // Close Modal
        customizeModal.classList.add('hidden');
        menuContent.style.display = 'flex';
    });

    document.getElementById('btn-reset-customize').addEventListener('click', () => {
        if(confirm("Reset all custom characters to default?")) {
            localStorage.removeItem('mafia_custom_profiles');
            localStorage.removeItem('mafia_total_slots');
            window.location.reload();
        }
    });

    // Exit Handler
    btnExit.addEventListener('click', () => {
        if (confirm("Exit to Main Menu?")) {
            // Stop Logic
            game.stop();
            ui.cancelInputs();
            
            // Clean up UI
            uiLayer.classList.add('hidden');
            mainMenu.style.display = 'flex';
            mainMenu.style.pointerEvents = 'auto';
            
            // Allow display to register before removing hidden class for transition
            setTimeout(() => {
                mainMenu.classList.remove('hidden');
            }, 10);
            
            menuContent.style.display = 'flex';
            isMenuOpen = true;

            // Reset Game Logic State
            game.reset();
            ui.setTrollPanelVisible(false);
            
            // Reset Environment (Lights)
            environment.setDay(); // Default to Day/Init lighting

            // Reset UI lists
            ui.renderPlayerList(players); // Reset list UI
            
            // Restore Camera
            // We set isMenuOpen=true, so the animation loop will take over camera control again
        }
    });

    // Resize Handler
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Animation Loop
    const animate = () => {
        requestAnimationFrame(animate);
        
        if (isMenuOpen) {
            // Slow rotation around the room for the menu background
            const time = Date.now() * 0.0001;
            camera.position.x = Math.cos(time) * 35;
            camera.position.z = Math.sin(time) * 35;
            camera.position.y = 20;
            camera.lookAt(0, 0, 0);
        } else {
            // Smoothly rotate camera to face speaker, victim, or event
            controls.target.lerp(cameraLookTarget, 0.08);
            controls.update();
        }
        


        renderer.render(scene, camera);

        // Update bubble positions after render ensures matrices are up-to-date
        ui.updateBubblePositions(camera, window.innerWidth, window.innerHeight);
    };

    animate();
};

init();
