export class AudioController {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.buffers = {};
        this.sources = {}; // Keep track of active sources for stopping/looping
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.5; // Default volume

        this.bgmGain = this.ctx.createGain();
        this.bgmGain.connect(this.masterGain);
        this.defaultBgmVolume = 0.4;
        this.bgmGain.gain.value = this.defaultBgmVolume;

        this.ambienceGain = this.ctx.createGain();
        this.ambienceGain.connect(this.masterGain);
        this.ambienceGain.gain.value = 0.5;

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.connect(this.masterGain);
        this.sfxGain.gain.value = 0.6;

        // Visualizer Setup
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.masterGain.connect(this.analyser);
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        // Setup stream for recording
        this.recorderDest = this.ctx.createMediaStreamDestination();
        this.masterGain.connect(this.recorderDest);

        this.currentBgmSource = null;
        this.currentBgmType = null;
        this.currentAmbienceSource = null;
        
        this.enabled = false;
        
        // Unlock audio context on first user interaction
        window.addEventListener('click', () => {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            this.enabled = true;
        }, { once: true });
    }

    async load() {
        const assets = {
            'gun_equip': 'asset_gun_equip.mp3',
            'gun_unequip': 'asset_gun_unequip.mp3',
            'gunshot': 'gunshot.mp3',
            'night_transition': 'asset_night_transition.mp3',
            'day_transition': 'asset_day_transition.mp3',
            'typing': 'asset_typing.mp3',
            'bgm_day': 'asset_bgm_suspicious_day.mp3',
            'bgm_night': null,
            'bgm_final': 'asset_bgm_final.mp3',
            'rain_loop': 'asset_rain_loop.mp3',
            'thunder': 'asset_thunder.mp3',
            'talking_sound': '/I Got This Sound Effect.mp3',
            'ui_hover': 'asset_ui_hover.ogg',
            'ui_click': 'asset_ui_click.wav',
            'ui_start': 'asset_ui_start.wav',
            'ui_buy': 'asset_ui_buy.mp3'
        };

        const promises = Object.entries(assets).map(async ([name, path]) => {
            try {
                const response = await fetch(path);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                this.buffers[name] = audioBuffer;
            } catch (e) {
                console.error(`Failed to load sound ${name}:`, e);
            }
        });

        await Promise.all(promises);
    }

    playSFX(name, volume = 1.0, pitchVariance = 0) {
        if (!this.buffers[name]) return;
        
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name];
        
        // Randomize pitch slightly if requested (good for typing)
        if (pitchVariance > 0) {
            const detune = (Math.random() * pitchVariance * 2) - pitchVariance;
            source.detune.value = detune * 100; 
        }

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(this.sfxGain);
        source.start(0);
    }

    playAmbience(name) {
        // Stop current ambience if any
        if (this.currentAmbienceSource) {
            try { this.currentAmbienceSource.stop(); } catch(e){}
            this.currentAmbienceSource = null;
        }

        if (!name || !this.buffers[name]) return;

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name];
        source.loop = true;
        
        source.connect(this.ambienceGain);
        source.start(0);
        this.currentAmbienceSource = source;
    }

    stopAmbience() {
        if (this.currentAmbienceSource) {
            try { this.currentAmbienceSource.stop(); } catch(e){}
            this.currentAmbienceSource = null;
        }
    }

    getVolume() {
        if (!this.analyser) return 0;
        this.analyser.getByteFrequencyData(this.dataArray);
        
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        // Return normalized volume 0..1
        return (sum / this.dataArray.length) / 255;
    }

    getStream() {
        return this.recorderDest.stream;
    }

    setMusicMuted(muted) {
        this.musicMuted = muted;
        const targetVolume = muted ? 0 : this.defaultBgmVolume;
        this.bgmGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.1);
    }

    playBGM(type) {
        if (this.currentBgmType === type) return; // Already playing
        
        let bufferName = '';
        if (type === 'day') bufferName = 'bgm_day';
        else if (type === 'night') bufferName = 'bgm_night';
        else if (type === 'final') bufferName = 'bgm_final';
        
        // Fade out current even if new type is silent
        if (this.currentBgmSource) {
            const oldSource = this.currentBgmSource;
            const oldGain = this.sources[oldSource.id + '_gain'];
            
            if (oldGain) {
                oldGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.0);
            }
            setTimeout(() => {
                try { oldSource.stop(); } catch(e){}
            }, 1000);
        }

        // Start new if buffer exists
        if (!this.buffers[bufferName]) {
            this.currentBgmType = type;
            this.currentBgmSource = null;
            return;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[bufferName];
        source.loop = true;
        source.id = Date.now(); // Simple ID

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0; // Start silent
        
        source.connect(gainNode);
        gainNode.connect(this.bgmGain);
        source.start(0);
        
        // Fade in
        gainNode.gain.linearRampToValueAtTime(1.0, this.ctx.currentTime + 2.0);

        this.currentBgmSource = source;
        this.sources[source.id + '_gain'] = gainNode;
        this.currentBgmType = type;
    }
}

