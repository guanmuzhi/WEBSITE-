class SettingsApp {
    constructor() {
        this.currentUser = this.getCurrentUser();
        this.currentWallpaper = this.loadWallpaper();
        this.init();
    }

    getCurrentUser() {
        try {
            const um = window.parent.UserManager;
            if (um) {
                const u = um.getInstance().getCurrentUser();
                return u || { username: 'public', createdAt: '-' };
            }
        } catch (e) {}
        return { username: 'public', createdAt: '-' };
    }

    loadWallpaper() {
        // Try file system first
        try {
            const storage = window.parent.StorageService.getInstance();
            const path = `/user/${this.currentUser.username}/info/wallpaper.json`;
            const data = storage.loadJSON(path);
            if (data) return data;
        } catch (e) {}
        // Fallback to localStorage
        const saved = localStorage.getItem('webos-wallpaper');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return { type: 'color', value: '#1a1a2e' };
    }

    saveWallpaper(type, value) {
        const wallpaper = { type, value };
        this.currentWallpaper = wallpaper;
        localStorage.setItem('webos-wallpaper', JSON.stringify(wallpaper));
        try {
            const storage = window.parent.StorageService.getInstance();
            storage.saveJSON(`/user/${this.currentUser.username}/info/wallpaper.json`, wallpaper);
        } catch (e) {}
        this.updatePreview();
        window.parent.document.dispatchEvent(new CustomEvent('wallpaper-changed', {
            detail: { type, value }
        }));
    }

    updatePreview() {
        const preview = document.getElementById('current-preview');
        const label = document.getElementById('current-label');
        if (!preview || !label) return;
        const { type, value } = this.currentWallpaper;
        if (type === 'color') {
            preview.style.background = value;
            preview.style.backgroundImage = 'none';
            label.textContent = `纯色: ${value}`;
        } else if (type === 'gradient') {
            preview.style.background = value;
            label.textContent = '渐变壁纸';
        } else if (type === 'image') {
            preview.style.background = `url(${value}) center/cover`;
            label.textContent = '图片壁纸';
        }
    }

    init() {
        // Navigation
        document.querySelectorAll('.settings-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                document.getElementById('section-' + item.dataset.section).classList.add('active');
            });
        });

        // System info
        document.getElementById('sys-browser').textContent = navigator.userAgent.split(' ').slice(-2).join(' ');
        document.getElementById('sys-os').textContent = navigator.platform || 'Unknown';
        document.getElementById('sys-resolution').textContent = `${window.screen.width}x${window.screen.height}`;
        document.getElementById('sys-language').textContent = navigator.language;
        document.getElementById('sys-online').textContent = navigator.onLine ? '在线' : '离线';

        // User info
        document.getElementById('user-name').textContent = this.currentUser.username;
        document.getElementById('user-created').textContent = this.currentUser.createdAt || '-';
        const avatar = document.getElementById('user-avatar');
        if (avatar) avatar.textContent = (this.currentUser.username || 'U').charAt(0).toUpperCase();

        // Wallpaper
        this.updatePreview();
        document.getElementById('color-grid').addEventListener('click', (e) => {
            const btn = e.target.closest('.color-btn');
            if (btn) this.saveWallpaper('color', btn.dataset.color);
        });
        document.getElementById('apply-custom').addEventListener('click', () => {
            this.saveWallpaper('color', document.getElementById('custom-color').value);
        });
        document.getElementById('gradient-grid').addEventListener('click', (e) => {
            const btn = e.target.closest('.gradient-btn');
            if (btn) this.saveWallpaper('gradient', btn.dataset.gradient);
        });
        document.getElementById('image-grid').addEventListener('click', (e) => {
            const btn = e.target.closest('.image-btn');
            if (btn) this.saveWallpaper('image', btn.dataset.image);
        });
        document.getElementById('apply-image').addEventListener('click', () => {
            const url = document.getElementById('image-url').value.trim();
            if (url) this.saveWallpaper('image', url);
        });
        document.getElementById('reset-wallpaper').addEventListener('click', () => {
            this.saveWallpaper('color', '#1a1a2e');
        });

        // Language
        const currentLang = localStorage.getItem('webos-language') || 'cmn';
        document.querySelectorAll('.lang-option').forEach(opt => {
            const lang = opt.dataset.lang;
            const check = opt.querySelector('.lang-check');
            if (lang === currentLang) check.textContent = '✓';
            opt.addEventListener('click', () => {
                localStorage.setItem('webos-language', lang);
                document.querySelectorAll('.lang-check').forEach(c => c.textContent = '');
                check.textContent = '✓';
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SettingsApp();
});