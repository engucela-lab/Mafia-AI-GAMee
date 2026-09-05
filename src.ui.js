import * as THREE from 'three';

export class UIController {
    constructor(audio) {
        this.audio = audio;
        this.statusEl = document.getElementById('game-status');
        this.phaseTimerEl = document.getElementById('phase-timer');
        this.listEl = document.getElementById('player-list');
        this.bubbleContainer = document.getElementById('bubble-container');
        
        // Dialogue Box Elements
        this.dialogueBox = document.getElementById('dialogue-box');
        this.dialogueAvatar = document.getElementById('dialogue-avatar');
        this.dialogueName = document.getElementById('dialogue-name');
        this.dialogueText = document.getElementById('dialogue-text');
        this.dialogueInterval = null;

        // Announcement Elements
        this.announcementOverlay = document.getElementById('announcement-overlay');
        this.announcementTitle = document.getElementById('announcement-title');
        this.announcementSubtitle = document.getElementById('announcement-subtitle');
        
        // List Controls
        this.listEl = document.getElementById('player-list');
        this.listToggleBtn = document.getElementById('list-toggle-btn');
        this.isListVisible = false;
        this.areRolesRevealed = false;
        this.playersCache = [];

        if (this.listToggleBtn) {
            this.listToggleBtn.addEventListener('click', () => this.toggleList());
        }

        this.onNextSpeakerRequest = null;
        this.listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.talk-next-btn');
            if (btn && this.onNextSpeakerRequest) {
                const id = parseInt(btn.dataset.id);
                this.onNextSpeakerRequest(id);
                
                // Clear other actives
                this.listEl.querySelectorAll('.talk-next-btn').forEach(b => b.classList.remove('active-request'));
                btn.classList.add('active-request');
                this.audio?.playSFX('ui_click', 0.5);
            }
        });

        this.activeBubbles = new Map(); // Map player ID to Array of bubble objects
        this.activeVoteBadges = new Map(); // Map player ID to badge element
        this.currentVotes = {}; // Track vote counts for player list display

        // User Input Elements
        this.inputContainer = document.getElementById('user-input-container');
        this.chatInput = document.getElementById('user-chat-input');
        this.chatSendBtn = document.getElementById('user-chat-send');
        
        // User Action Elements
        this.actionContainer = document.getElementById('user-action-container');
        this.actionTitle = document.getElementById('action-title');
        this.actionButtons = document.getElementById('action-buttons');

        // Priority Speak HUD Button
        this.priorityUserBtn = document.getElementById('btn-priority-user');
        if (this.priorityUserBtn) {
            this.priorityUserBtn.addEventListener('click', () => {
                if (this.onNextSpeakerRequest && this.priorityUserBtn.dataset.id) {
                    this.onNextSpeakerRequest(parseInt(this.priorityUserBtn.dataset.id));
                    this.priorityUserBtn.classList.add('active-request');
                    this.audio?.playSFX('ui_click', 0.5);
                }
            });
        }

        // Troll Panel Elements
        this.trollPanel = document.getElementById('troll-panel');
        this.trollBtns = {
            forceVote: document.getElementById('troll-force-vote'),
            killRandom: document.getElementById('troll-kill-random'),
            revealRoles: document.getElementById('troll-reveal-roles'),
            silenceAll: document.getElementById('troll-silence-all'),
            reviveAll: document.getElementById('troll-revive-all'),
            skipPhase: document.getElementById('troll-skip-phase'),
            forceSpeech: document.getElementById('troll-force-speech')
        };

        this.pauseBtn = document.getElementById('btn-pause');

        this.onPauseToggle = null;
        if (this.pauseBtn) {
            this.pauseBtn.addEventListener('click', () => {
                if (this.onPauseToggle) {
                    const isPaused = this.onPauseToggle();
                    this.pauseBtn.textContent = isPaused ? '▶' : '⏸';
                    this.pauseBtn.title = isPaused ? 'Resume Game' : 'Pause Game';
                    this.audio?.playSFX('ui_click', 0.6);
                }
            });
        }

        this.onMayorReveal = null;
        this.onDeputyExecute = null;
        this.mayorRevealBtn = document.getElementById('btn-mayor-reveal');
        this.deputyExecuteBtn = document.getElementById('btn-deputy-execute');
        this.dayActionsHud = document.getElementById('day-actions-hud');

        if (this.mayorRevealBtn) {
            this.mayorRevealBtn.addEventListener('click', () => {
                if (this.onMayorReveal && this.priorityUserBtn.dataset.id) {
                    this.onMayorReveal(parseInt(this.priorityUserBtn.dataset.id));
                    this.mayorRevealBtn.style.display = 'none';
                }
            });
        }

        if (this.deputyExecuteBtn) {
            this.deputyExecuteBtn.addEventListener('click', () => {
                if (this.onDeputyExecute && this.priorityUserBtn.dataset.id) {
                    this.onDeputyExecute(parseInt(this.priorityUserBtn.dataset.id));
                }
            });
        }

        // Loading Screen Elements
        this.loadingScreen = document.getElementById('loading-screen');
        this.loadingBarFill = document.getElementById('loading-bar-fill');
        this.loadingTipText = document.getElementById('loading-tip-text');
        this.loadingStageText = document.getElementById('loading-stage-text');
        this.loadingPercentText = document.getElementById('loading-percent');

        // Private Thought Elements
        this.thoughtBox = document.getElementById('private-thought-box');
        this.thoughtText = document.getElementById('thought-text');

        // Recording System
        this.recorder = null;
        this.isRecording = false;
        this.recordingCanvas = document.createElement('canvas');
        this.recordingCtx = this.recordingCanvas.getContext('2d');
    }

    startRecording(threeCanvas, audioStream) {
        if (this.isRecording) return;
        this.isRecording = true;
        this.threeCanvas = threeCanvas;
        
        this.recordingCanvas.width = 1280;
        this.recordingCanvas.height = 720;
        
        const videoStream = this.recordingCanvas.captureStream(30);
        const tracks = [...videoStream.getVideoTracks()];
        if (audioStream) tracks.push(...audioStream.getAudioTracks());
        
        const combinedStream = new MediaStream(tracks);
        this.mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9' });
        this.chunks = [];

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.chunks.push(e.data);
        };

        this.mediaRecorder.onstop = async () => {
            const blob = new Blob(this.chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            
            // Create a simple overlay to show the recording
            const downloadOverlay = document.createElement('div');
            downloadOverlay.id = 'download-overlay';
            downloadOverlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.9); z-index: 100000;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                gap: 20px; font-family: 'Roboto', sans-serif; color: white;
            `;
            
            const videoPreview = document.createElement('video');
            videoPreview.src = url;
            videoPreview.controls = true;
            videoPreview.style.width = '80%';
            videoPreview.style.maxWidth = '800px';
            videoPreview.style.border = '2px solid #ffd700';
            
            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '20px';

            const dlBtn = document.createElement('a');
            dlBtn.href = url;
            dlBtn.download = `Mafia_Elimination_Game_${new Date().getTime()}.webm`;
            dlBtn.className = 'menu-btn small highlight';
            dlBtn.textContent = '💾 DOWNLOAD RECORDING';
            dlBtn.style.textDecoration = 'none';

            const closeBtn = document.createElement('button');
            closeBtn.className = 'menu-btn small';
            closeBtn.textContent = 'CLOSE PREVIEW';
            closeBtn.onclick = () => {
                downloadOverlay.remove();
                URL.revokeObjectURL(url);
            };

            actions.appendChild(dlBtn);
            actions.appendChild(closeBtn);
            downloadOverlay.appendChild(videoPreview);
            downloadOverlay.appendChild(actions);
            document.body.appendChild(downloadOverlay);

            this.audio?.playSFX('ui_buy', 1.0);
        };

        this.mediaRecorder.start();
        this.requestRecordingFrame();
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        this.mediaRecorder.stop();
    }

    requestRecordingFrame() {
        if (!this.isRecording) return;
        this.drawRecordingFrame();
        requestAnimationFrame(() => this.requestRecordingFrame());
    }

    wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            let metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
                ctx.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, y);
        return y;
    }

    drawRecordingFrame() {
        const ctx = this.recordingCtx;
        const w = this.recordingCanvas.width;
        const h = this.recordingCanvas.height;

        // 1. Draw 3D Scene
        ctx.drawImage(this.threeCanvas, 0, 0, w, h);

        // 2. Draw Status
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, w, 70);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 22px Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("Mafia Table", w/2, 30);
        ctx.font = '16px Roboto, sans-serif';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(this.statusEl.textContent, w/2, 55);

        // 3. Draw Announcement Overlay
        if (this.announcementOverlay.classList.contains('visible')) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 50px Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.announcementTitle.textContent, w/2, h/2 - 20);
            ctx.fillStyle = '#ccc';
            ctx.font = '22px Roboto, sans-serif';
            this.wrapText(ctx, this.announcementSubtitle.textContent, w/2, h/2 + 30, w - 200, 28);
        }

        // 4. Draw Private Strategy (Thoughts)
        if (this.thoughtBox && !this.thoughtBox.classList.contains('hidden')) {
            ctx.fillStyle = 'rgba(10, 10, 40, 0.9)';
            ctx.strokeStyle = '#4488ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(w/2 - 250, 100, 500, 80, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#4488ff';
            ctx.font = 'bold 12px Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("🧠 PRIVATE STRATEGY", w/2, 120);
            ctx.fillStyle = '#fff';
            ctx.font = 'italic 16px Roboto, sans-serif';
            this.wrapText(ctx, this.thoughtText.textContent, w/2, 145, 460, 22);
        }

        // 5. Draw Dialogue Box
        if (this.dialogueBox.classList.contains('visible')) {
            const boxH = 140;
            const boxW = w - 200;
            const boxX = 100;
            const boxY = h - boxH - 30;

            ctx.fillStyle = 'rgba(15, 25, 20, 0.98)';
            ctx.strokeStyle = this.dialogueBox.style.borderLeftColor || '#fff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.roundRect(boxX, boxY, boxW, boxH, 8);
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = this.dialogueName.style.color || '#fff';
            ctx.font = 'bold 18px Roboto, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(this.dialogueName.textContent, boxX + 20, boxY + 30);
            
            ctx.fillStyle = '#e0e0e0';
            ctx.font = '18px Roboto, sans-serif';
            this.wrapText(ctx, this.dialogueText.textContent, boxX + 20, boxY + 65, boxW - 40, 24);
        }

        // 6. Draw Player List
        const listW = 240;
        const listX = w - listW - 20;
        const listY = 80;
        const entryH = 26;
        
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(listX, listY, listW, (this.playersCache.length * entryH) + 40, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 14px Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText("PLAYERS", listX + 15, listY + 25);

        this.playersCache.forEach((p, i) => {
            const py = listY + 50 + (i * entryH);
            const isDead = p.alive === false;
            
            // Background for entry
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(listX + 5, py - 18, listW - 10, entryH - 4);

            // Name
            ctx.fillStyle = isDead ? '#666' : '#' + p.color.toString(16).padStart(6, '0');
            ctx.font = isDead ? 'italic 14px Roboto, sans-serif' : 'bold 14px Roboto, sans-serif';
            ctx.textAlign = 'left';
            let nameTxt = p.name;
            if (isDead) nameTxt += " (Dead)";
            ctx.fillText(nameTxt, listX + 15, py);

            // Role (only if revealed or dead)
            if (this.areRolesRevealed || isDead) {
                let roleTxt = p.role || "???";
                if (p.role === "Executioner" && p.exeTarget) {
                    roleTxt = `Exe (${p.exeTarget.name})`;
                }
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = '10px Roboto, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(roleTxt, listX + listW - 15, py);
            }
        });

        // 7. Draw Speech Bubbles (simplified for recording)
        ctx.font = '14px Roboto, sans-serif';
        this.activeBubbles.forEach((bubbleList) => {
            bubbleList.forEach(b => {
                if (b.element.style.display === 'none') return;
                const rect = b.element.getBoundingClientRect();
                const scaleX = w / window.innerWidth;
                const scaleY = h / window.innerHeight;
                const bx = rect.left * scaleX + (rect.width * scaleX / 2);
                const by = rect.top * scaleY + (rect.height * scaleY / 2);
                
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.roundRect(bx - 90, by - 25, 180, 50, 10);
                ctx.fill();
                ctx.fillStyle = 'black';
                ctx.textAlign = 'center';
                this.wrapText(ctx, b.element.textContent, bx, by - 5, 160, 18);
            });
        });
    }

    showPrivateThought(text, alignment = 'good') {
        if (!this.thoughtBox) return;
        this.thoughtText.textContent = text;
        this.thoughtBox.dataset.alignment = alignment;
        this.thoughtBox.classList.remove('hidden');
    }

    hidePrivateThought() {
        if (this.thoughtBox) this.thoughtBox.classList.add('hidden');
    }

    showLoading(tip) {
        if (this.loadingTipText) this.loadingTipText.textContent = tip;
        if (this.loadingBarFill) this.loadingBarFill.style.width = '0%';
        if (this.loadingPercentText) this.loadingPercentText.textContent = '0%';
        if (this.loadingStageText) this.loadingStageText.textContent = 'Initializing...';
        if (this.loadingScreen) this.loadingScreen.classList.remove('hidden');
    }

    updateLoading(percent, stage) {
        if (this.loadingBarFill) this.loadingBarFill.style.width = `${percent}%`;
        if (this.loadingPercentText) this.loadingPercentText.textContent = `${Math.floor(percent)}%`;
        if (stage && this.loadingStageText) this.loadingStageText.textContent = stage;
    }

    hideLoading() {
        if (this.loadingScreen) this.loadingScreen.classList.add('hidden');
    }

    setPhaseTimer(seconds) {
        if (!this.phaseTimerEl) return;
        if (seconds === null || seconds === undefined) {
            this.phaseTimerEl.classList.add('hidden');
            return;
        }
        const total = Math.max(0, Math.ceil(Number(seconds)));
        const minutes = String(Math.floor(total / 60)).padStart(2, '0');
        const remaining = String(total % 60).padStart(2, '0');
        this.phaseTimerEl.textContent = `${minutes}:${remaining}`;
        this.phaseTimerEl.classList.remove('hidden');
    }

    // Returns a Promise that resolves with the user's entered text
    async getUserInput(placeholder = "Type your message...") {
        return new Promise((resolve, reject) => {
            this.pendingInputReject = reject;
            this.inputContainer.classList.remove('hidden');
            this.chatInput.placeholder = placeholder;
            this.chatInput.value = '';
            this.chatInput.focus();

            const submit = () => {
                const text = this.chatInput.value.trim();
                if (text) {
                    cleanup();
                    resolve(text);
                }
            };

            const handleKey = (e) => {
                if (e.key === 'Enter') submit();
            };

            const cleanup = () => {
                this.chatSendBtn.removeEventListener('click', submit);
                this.chatInput.removeEventListener('keydown', handleKey);
                this.inputContainer.classList.add('hidden');
                this.pendingInputReject = null;
            };

            this.chatSendBtn.addEventListener('click', submit);
            this.chatInput.addEventListener('keydown', handleKey);
        });
    }

    // Independent selection for troll actions to avoid breaking game state
    async getTrollChoice(title, options) {
        return new Promise((resolve) => {
            this.actionContainer.classList.remove('hidden');
            this.actionTitle.textContent = "😈 " + title;
            this.actionButtons.innerHTML = '';

            const cleanup = () => {
                this.actionContainer.classList.add('hidden');
            };

            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'action-btn troll-choice-btn';
                btn.innerHTML = `<span>${opt.label}</span>`;
                btn.onclick = () => {
                    cleanup();
                    resolve(opt.value);
                };
                this.actionButtons.appendChild(btn);
            });

            // Add a cancel button for the troll
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'action-btn skip';
            cancelBtn.textContent = 'CANCEL';
            cancelBtn.onclick = () => {
                cleanup();
                resolve(null);
            };
            this.actionButtons.appendChild(cancelBtn);
        });
    }

    // Returns a Promise that resolves with the selected option ID (or null/skip)
    async getUserAction(title, options) {
        return new Promise((resolve, reject) => {
            this.pendingInputReject = reject;
            this.actionContainer.classList.remove('hidden');
            this.actionTitle.textContent = title;
            this.actionButtons.innerHTML = '';

            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'action-btn';
                if (opt.isSkip) btn.classList.add('skip');
                
                btn.innerHTML = `<span>${opt.label}</span>${opt.sub ? `<span style="opacity:0.6; font-size:0.8em">${opt.sub}</span>` : ''}`;
                
                btn.onclick = () => {
                    this.actionContainer.classList.add('hidden');
                    this.pendingInputReject = null;
                    resolve(opt.value);
                };
                this.actionButtons.appendChild(btn);
            });
        });
    }

    cancelInputs() {
        if (this.pendingInputReject) {
            this.pendingInputReject(new Error("GameStopped"));
            this.pendingInputReject = null;
        }
        this.inputContainer.classList.add('hidden');
        this.actionContainer.classList.add('hidden');
        this.hideAllBubbles();
        this.hideDialogue();
        this.hideAllVoteBadges();
        this.announcementOverlay.classList.remove('visible');
    }

    toggleList() {
        this.isListVisible = !this.isListVisible;
        if (this.isListVisible) {
            this.listEl.classList.remove('hidden');
            this.listToggleBtn.style.background = 'rgba(50, 100, 200, 0.9)'; // Active state color
        } else {
            this.listEl.classList.add('hidden');
            this.listToggleBtn.style.background = '';
        }
    }

    updateVoteBadge(player, count) {
        this.currentVotes[player.id] = count;
        this.renderPlayerList(this.playersCache);

        let badge;
        if (this.activeVoteBadges.has(player.id)) {
            badge = this.activeVoteBadges.get(player.id).element;
            // Pulse animation on update
            badge.classList.remove('pulse');
            void badge.offsetWidth; // Trigger reflow
            badge.classList.add('pulse');
        } else {
            badge = document.createElement('div');
            badge.className = 'vote-badge';
            badge.style.display = 'none'; // Start hidden until positioned
            this.bubbleContainer.appendChild(badge);
            this.activeVoteBadges.set(player.id, { element: badge, player: player });
            
            // Initial appearance
            requestAnimationFrame(() => {
                badge.classList.add('visible');
            });
        }
        
        badge.textContent = count;
    }

    hideAllVoteBadges() {
        this.currentVotes = {};
        this.renderPlayerList(this.playersCache);

        this.activeVoteBadges.forEach(data => {
            data.element.classList.remove('visible');
            setTimeout(() => {
                if (data.element.parentNode) {
                    data.element.parentNode.removeChild(data.element);
                }
            }, 300);
        });
        this.activeVoteBadges.clear();
    }

    async showAnnouncement(title, subtitle, duration = 3000) {
        this.announcementTitle.textContent = title;
        this.announcementSubtitle.textContent = subtitle;
        this.announcementOverlay.classList.add('visible');
        
        // Wait
        await new Promise(resolve => setTimeout(resolve, duration));
        
        this.announcementOverlay.classList.remove('visible');
        // Small buffer to allow fade out
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    showThoughtDialogue(player, text, alignment = 'good') {
        if (this.dialogueInterval) clearInterval(this.dialogueInterval);
        this.dialogueInterval = null;
        this.dialogueAvatar.src = player.img || '';
        this.dialogueName.textContent = `${player.name} · THINKING`;
        this.dialogueName.style.color = alignment === 'evil' ? '#ff7777' : '#66aaff';
        this.dialogueBox.style.borderLeftColor = alignment === 'evil' ? '#ff4444' : '#4488ff';
        this.dialogueBox.dataset.mode = 'thought';
        this.dialogueBox.dataset.alignment = alignment;
        // Thoughts are subtitles too, but are shown immediately instead of
        // being typed so the observer can read the whole rationale.
        this.dialogueText.textContent = text || 'Thinking through the current evidence…';
        this.dialogueBox.classList.add('visible');
        if (window.focusCameraOn) window.focusCameraOn(player);
    }

    showDialogue(player, text) {
        if (this.onSpeak && text) {
            Promise.resolve(this.onSpeak(player, text)).catch(error => console.warn('Voice playback unavailable:', error));
        }
        // Clear previous typewriter
        if (this.dialogueInterval) clearInterval(this.dialogueInterval);

        // Setup Box
        this.dialogueAvatar.src = player.img || ''; // Fallback handled by css bg
        this.dialogueName.textContent = player.name;
        this.dialogueName.style.color = '#' + player.color.toString(16);
        this.dialogueBox.style.borderLeftColor = '#' + player.color.toString(16);
        this.dialogueBox.dataset.mode = 'message';
        this.dialogueBox.dataset.alignment = '';
        this.dialogueText.textContent = '';
        
        this.dialogueBox.classList.add('visible');

        // Center Camera on current speaker
        if (window.focusCameraOn) {
            window.focusCameraOn(player);
        }

        // Typewriter
        let charIndex = 0;
        const typeSpeed = 25; // Faster for dialogue box
        
        this.dialogueInterval = setInterval(() => {
            if (charIndex < text.length) {
                this.dialogueText.textContent += text.charAt(charIndex);
                // Play typing sound with slight pitch variance to sound natural
                // Don't play on spaces to reduce noise
                if (text.charAt(charIndex) !== ' ') {
                    this.audio?.playSFX('typing', 0.2, 0.2);
                }
                charIndex++;
            } else {
                clearInterval(this.dialogueInterval);
                this.dialogueInterval = null;
            }
        }, typeSpeed);
    }

    hideDialogue() {
        this.dialogueBox.classList.remove('visible');
        this.dialogueBox.dataset.mode = '';
        if (this.dialogueInterval) clearInterval(this.dialogueInterval);
    }

    showSpeechBubble(player, text) {
        // Initialize array if needed
        if (!this.activeBubbles.has(player.id)) {
            this.activeBubbles.set(player.id, []);
        }
        
        const bubbleList = this.activeBubbles.get(player.id);

        // Limit stack size (max 4 bubbles) to prevent screen clutter
        if (bubbleList.length >= 4) {
            const oldest = bubbleList.shift(); // Remove from front (oldest)
            this.removeBubbleElement(oldest);
        }

        const bubble = document.createElement('div');
        bubble.className = 'speech-bubble visible';
        bubble.textContent = ''; // Start empty for typewriter effect
        bubble.style.minWidth = '60px'; // Prevent full collapse
        
        // Style border based on role if revealed (optional, keeping neutral for now)
        bubble.style.borderColor = '#' + player.color.toString(16);

        this.bubbleContainer.appendChild(bubble);

        // Typewriter effect
        let charIndex = 0;
        const typeSpeed = 40; // ms per character
        const typeInterval = setInterval(() => {
            if (charIndex < text.length) {
                bubble.textContent += text.charAt(charIndex);
                // Play softer typing sound for bubbles
                if (text.charAt(charIndex) !== ' ') {
                    this.audio?.playSFX('typing', 0.1, 0.2); 
                }
                charIndex++;
            } else {
                clearInterval(typeInterval);
            }
        }, typeSpeed);

        const bubbleObj = { 
            element: bubble, 
            player: player, 
            interval: typeInterval 
        };

        bubbleList.push(bubbleObj);

        // Auto remove after time
        setTimeout(() => {
            const currentList = this.activeBubbles.get(player.id);
            if (currentList) {
                const idx = currentList.indexOf(bubbleObj);
                if (idx > -1) {
                    currentList.splice(idx, 1);
                    this.removeBubbleElement(bubbleObj);
                    
                    // Cleanup map entry if empty
                    if (currentList.length === 0) {
                        this.activeBubbles.delete(player.id);
                    }
                }
            }
        }, 6000); // 6 seconds duration
    }

    removeBubbleElement(bubbleObj) {
        if (bubbleObj.interval) clearInterval(bubbleObj.interval);
        
        const el = bubbleObj.element;
        el.classList.remove('visible');
        // Animate out upwards
        el.style.transform = 'translate(-50%, -150%)'; 
        el.style.opacity = '0';
        
        setTimeout(() => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }, 300);
    }

    hideSpeechBubble(player) {
        // Hides ALL bubbles for a player (used for cleanup)
        if (this.activeBubbles.has(player.id)) {
            const list = this.activeBubbles.get(player.id);
            list.forEach(b => this.removeBubbleElement(b));
            this.activeBubbles.delete(player.id);
        }
    }

    hideAllBubbles() {
        // Convert keys to array first to avoid iterator issues during deletion
        const keys = Array.from(this.activeBubbles.keys());
        keys.forEach(id => {
            this.hideSpeechBubble({ id }); // passing dummy player obj with just id
        });
    }

    updateBubblePositions(camera, width, height) {
        // Update Speech Bubbles
        this.activeBubbles.forEach((bubbleList) => {
            if (bubbleList.length === 0) return;
            
            const player = bubbleList[0].player;
            const avatarGroup = player.avatarGroup;
            const pos = new THREE.Vector3();
            pos.setFromMatrixPosition(avatarGroup.matrixWorld);
            pos.y += 4.5; // Base height above head

            pos.project(camera);

            const baseX = (pos.x * 0.5 + 0.5) * width;
            const baseY = (-(pos.y * 0.5) + 0.5) * height;

            if (pos.z > 1) {
                bubbleList.forEach(b => b.element.style.display = 'none');
                return;
            }

            // Stack Logic: Newest (end of array) is at bottom (closest to head)
            // Iterate backwards
            let currentOffset = 0;
            
            for (let i = bubbleList.length - 1; i >= 0; i--) {
                const b = bubbleList[i];
                const el = b.element;
                
                el.style.display = 'block';
                el.style.left = `${baseX}px`;
                
                // Calculate height including margin
                // offsetHeight triggers reflow, but necessary for dynamic text height
                const h = el.offsetHeight || 50; 
                const margin = 10;
                
                // Set position
                // The bubble is transform: translate(-50%, -100%)
                // So 'top' corresponds to the bottom edge of the bubble
                el.style.top = `${baseY - currentOffset}px`;
                
                // Add to offset for next (older) bubble
                currentOffset += (h + margin);
                
                // Visual stack effect
                el.style.zIndex = 100 + i; // Newest on top if they somehow overlap (they shouldn't with offsetting)
                
                // Slight opacity drop for older messages
                if (i < bubbleList.length - 1) {
                    el.style.opacity = '0.85';
                    el.style.transform = 'translate(-50%, -100%) scale(0.95)';
                } else {
                    el.style.opacity = '1';
                    el.style.transform = 'translate(-50%, -100%) scale(1)';
                }
            }
        });

        // Update Vote Badges
        this.activeVoteBadges.forEach((data) => {
            const { element, player } = data;
            const avatarGroup = player.avatarGroup;
            
            if (!avatarGroup) return;

            const pos = new THREE.Vector3();
            pos.setFromMatrixPosition(avatarGroup.matrixWorld);
            pos.y += 8.5; // Raised higher to be distinctly above head/label

            pos.project(camera);

            const x = (pos.x * 0.5 + 0.5) * width;
            const y = (-(pos.y * 0.5) + 0.5) * height;

            // Simple frustum check
            if (pos.z > 1 || Math.abs(x - width/2) > width/2 + 100 || Math.abs(y - height/2) > height/2 + 100) {
                element.style.display = 'none';
            } else {
                element.style.display = 'flex';
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;
            }
        });
    }

    updateStatus(text) {
        this.statusEl.textContent = text;
        // Simple animation effect for status change
        this.statusEl.style.opacity = '0';
        setTimeout(() => {
            this.statusEl.style.opacity = '1';
        }, 100);
    }

    setPriorityHUD(show, id) {
        if (!this.priorityUserBtn) return;
        if (show) {
            this.priorityUserBtn.classList.remove('hidden');
            this.priorityUserBtn.dataset.id = id;
            if (this.editWillBtn) this.editWillBtn.classList.remove('hidden');
            if (this.pauseBtn) this.pauseBtn.classList.remove('hidden');
        } else {
            this.priorityUserBtn.classList.add('hidden');
            if (this.editWillBtn) this.editWillBtn.classList.add('hidden');
            if (this.pauseBtn) this.pauseBtn.classList.add('hidden');
        }
    }

    showDayActions(role, revealedMayor, deputyUsed) {
        if (!this.dayActionsHud) return;
        this.dayActionsHud.classList.remove('hidden');
        
        if (role === "Mayor" && !revealedMayor) {
            this.mayorRevealBtn.style.display = 'block';
        } else {
            this.mayorRevealBtn.style.display = 'none';
        }

        if (role === "Deputy" && !deputyUsed) {
            this.deputyExecuteBtn.style.display = 'block';
        } else {
            this.deputyExecuteBtn.style.display = 'none';
        }
    }

    hideDayActions() {
        if (this.dayActionsHud) this.dayActionsHud.classList.add('hidden');
    }

    setTrollPanelVisible(visible) {
        if (!this.trollPanel) return;
        if (visible) {
            this.trollPanel.classList.remove('hidden');
        } else {
            this.trollPanel.classList.add('hidden');
        }
    }

    clearPriorityVisuals() {
        // Clear HUD button state
        if (this.priorityUserBtn) {
            this.priorityUserBtn.classList.remove('active-request');
        }
        // Clear all list button states
        if (this.listEl) {
            this.listEl.querySelectorAll('.talk-next-btn').forEach(btn => {
                btn.classList.remove('active-request');
            });
        }
    }

    renderPlayerList(players) {
        this.playersCache = players;
        this.listEl.innerHTML = '';

        // Add Header with Toggle
        const header = document.createElement('div');
        header.className = 'player-list-header';
        header.innerHTML = `
            <span>Players</span>
            <label class="role-toggle" title="Reveal hidden roles">
                <input type="checkbox" id="role-reveal-checkbox" ${this.areRolesRevealed ? 'checked' : ''}>
                <span>Show Roles</span>
            </label>
        `;
        this.listEl.appendChild(header);

        // Re-attach listener
        const checkbox = this.listEl.querySelector('#role-reveal-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                this.areRolesRevealed = e.target.checked;
                this.renderPlayerList(this.playersCache);
            });
        }

        players.forEach(p => {
            const div = document.createElement('div');
            div.className = 'player-entry';
            
            const isDead = p.alive === false;
            // Show role if dead OR if user opted to reveal roles
            const shouldShowRole = this.areRolesRevealed || isDead;

            let roleClass = '';
            let roleText = '???';

            if (shouldShowRole) {
                roleClass = p.role ? `role-${p.role.toLowerCase()}` : '';
                roleText = p.role || '...';
                if (p.role === "Executioner" && p.exeTarget) {
                    roleText = `Executioner (${p.exeTarget.name})`;
                }
                if (isDead) roleText = 'DEAD (' + roleText + ')';
            } else {
                roleClass = 'role-citizen'; // Neutral style for hidden
            }
            
            // Name Styling
            let style = `color: #${p.color.toString(16)};`;
            if (isDead) {
                 style = 'color: #666; text-decoration: line-through;';
            }

            const isMe = p.isHuman === true;
            const priorityBtnHtml = !isDead ? `<button class="talk-next-btn ${isMe ? 'user-priority' : ''}" data-id="${p.id}" title="${isMe ? 'Talk next' : 'Make this player talk next'}">${isMe ? '🗣️ SPEAK NEXT' : '🗣️'}</button>` : '';
            
            const voteCount = this.currentVotes[p.id] || 0;
            const voteHtml = voteCount > 0 ? `<span class="list-vote-badge">${voteCount} 🗳️</span>` : '';

            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${priorityBtnHtml}
                    <span class="player-name" style="${style}">${p.name}</span>
                    ${voteHtml}
                </div>
                <span class="player-role ${roleClass}">${roleText}</span>
            `;
            this.listEl.appendChild(div);
        });
    }
}
