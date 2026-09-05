export class AchievementManager {
    constructor(audioController) {
        this.audio = audioController;
        this.STORAGE_KEY = 'mafia_achievements_v1';
        this.achievements = [
            {
                id: 'mafia_man',
                title: 'Mafia Man',
                description: 'Become the Mafia while playing as a human.',
                icon: '🕵️‍♂️'
            },
            {
                id: 'deputy',
                title: 'Deputy.',
                description: 'Become the Sheriff while playing as a human.',
                icon: '🤠'
            },
            {
                id: 'chaos_survivor',
                title: 'that was something.?',
                description: 'Finish a round of Chaos Mode.',
                icon: '🔥'
            },
            {
                id: 'slow_voter',
                title: 'take your time',
                description: 'Spend more than 30 seconds deciding on a vote.',
                icon: '⏳'
            },
            {
                id: 'artistic_being',
                title: 'Artistic being eh?',
                description: 'Customize 3 different characters.',
                icon: '🎨'
            },

            {
                id: 'ending',
                title: 'The End.',
                description: 'Complete a full game.',
                icon: '🏁'
            },
            {
                id: 'max_settings',
                title: 'oh.',
                description: 'Turn on every single game setting.',
                icon: '⚙️'
            }
        ];
        
        this.unlockedState = this.loadState();
        this.notificationQueue = [];
        this.isShowingNotification = false;
        
        // DOM Elements (lazy loaded via setters or direct access logic)
        this.notificationEl = document.getElementById('achievement-notification');
        this.notificationTitle = document.getElementById('achievement-notify-title');
        this.notificationDesc = document.getElementById('achievement-notify-desc');
        this.notificationIcon = document.getElementById('achievement-notify-icon');
    }

    loadState() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    saveState() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.unlockedState));
    }

    isUnlocked(id) {
        return this.unlockedState.includes(id);
    }

    unlock(id) {
        if (this.isUnlocked(id)) return; // Already unlocked

        const achievement = this.achievements.find(a => a.id === id);
        if (!achievement) return;

        // Unlock
        this.unlockedState.push(id);
        this.saveState();

        // Notify
        this.showNotification(achievement);
    }

    showNotification(achievement) {
        // Re-fetch in case elements were not ready during init
        if (!this.notificationEl) {
             this.notificationEl = document.getElementById('achievement-notification');
             this.notificationTitle = document.getElementById('achievement-notify-title');
             this.notificationDesc = document.getElementById('achievement-notify-desc');
             this.notificationIcon = document.getElementById('achievement-notify-icon');
        }

        this.notificationQueue.push(achievement);
        this.processQueue();
    }

    async processQueue() {
        if (this.isShowingNotification || this.notificationQueue.length === 0) return;

        this.isShowingNotification = true;
        const achievement = this.notificationQueue.shift();

        // Update DOM
        if(this.notificationTitle) this.notificationTitle.textContent = achievement.title;
        if(this.notificationDesc) this.notificationDesc.textContent = achievement.description;
        if(this.notificationIcon) this.notificationIcon.textContent = achievement.icon;
        
        // Play Sound
        if (this.audio) this.audio.playSFX('ui_buy', 1.0); // Reward sound

        // Show
        if(this.notificationEl) {
            this.notificationEl.classList.add('visible');
            
            // Wait
            await new Promise(r => setTimeout(r, 4000));
            
            // Hide
            this.notificationEl.classList.remove('visible');
            
            // Wait for transition
            await new Promise(r => setTimeout(r, 500));
        }

        this.isShowingNotification = false;
        this.processQueue();
    }

    renderModalList(container) {
        if (!container) return;
        container.innerHTML = '';
        
        // Header stats
        const validUnlocked = this.achievements.filter(a => this.isUnlocked(a.id));
        const unlockedCount = validUnlocked.length;
        const totalCount = this.achievements.length;
        const stats = document.createElement('div');
        stats.className = 'ach-stats';
        stats.textContent = `Unlocked: ${unlockedCount} / ${totalCount}`;
        container.appendChild(stats);
        
        this.achievements.forEach(ach => {
            const isUnlocked = this.isUnlocked(ach.id);
            
            const el = document.createElement('div');
            el.className = `achievement-item ${isUnlocked ? 'unlocked' : 'locked'}`;
            
            el.innerHTML = `
                <div class="ach-icon">${isUnlocked ? ach.icon : '🔒'}</div>
                <div class="ach-info">
                    <div class="ach-title">${ach.title}</div>
                    <div class="ach-desc">${isUnlocked ? ach.description : '???'}</div>
                </div>
                ${isUnlocked ? '<div class="ach-check">🏆</div>' : ''}
            `;
            
            container.appendChild(el);
        });

    }
}
