class SettingsApp {
    constructor() {
        this.currentUser = this.getCurrentUser();
        this.currentWallpaper = this.loadWallpaper();
        this.init();
    }

    loadLanguagePack(lang) {
        const paths = {
            cmn: '/languages/cmn.json',
            eng: '/languages/eng.json',
            jpn: '/languages/jpn.json'
        };
        return fetch(paths[lang] || paths.cmn)
            .then(r => r.json())
            .then(data => data.strings || {})
            .catch(() => ({}));
    }

    async applyLanguage(lang) {
        const strings = await this.loadLanguagePack(lang);
        localStorage.setItem('webos-language', lang);

        document.querySelectorAll('.settings-nav-item').forEach(item => {
            const section = item.dataset.section;
            if (strings[section]) {
                item.textContent = strings[section];
            }
        });

        const sectionTitles = {
            'section-system': 'system',
            'section-user': 'user_info',
            'section-personalization': 'personalization',
            'section-language': 'language'
        };

        for (const [id, key] of Object.entries(sectionTitles)) {
            const el = document.querySelector(`#${id} h2`);
            if (el && strings[key]) el.textContent = strings[key];
        }

        const version = strings.version || '版本';
        const label = document.querySelector('#section-system .info-row:nth-child(2) .info-label');
        if (label && version) label.textContent = version;

        document.querySelectorAll('.lang-option').forEach(opt => {
            const l = opt.dataset.lang;
            const check = opt.querySelector('.lang-check');
            if (l === lang) {
                check.textContent = '✓';
            } else {
                check.textContent = '';
            }
        });

        document.title = strings.app_title || '设置';
    }

    async loadVersion() {
        try {
            const res = await fetch('/apps/settings.app/info.json');
            const data = await res.json();
            const versionEl = document.getElementById('sys-version');
            if (versionEl && data.version) {
                versionEl.textContent = data.version;
            }
        } catch (e) {}
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
        try {
            const storage = window.parent.StorageService.getInstance();
            const path = `/user/${this.currentUser.username}/info/wallpaper.json`;
            const data = storage.loadJSON(path);
            if (data) return data;
        } catch (e) {}
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
        document.querySelectorAll('.settings-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                document.getElementById('section-' + item.dataset.section).classList.add('active');
            });
        });

        document.getElementById('sys-browser').textContent = navigator.userAgent.split(' ').slice(-2).join(' ');
        document.getElementById('sys-os').textContent = navigator.platform || 'Unknown';
        document.getElementById('sys-resolution').textContent = `${window.screen.width}x${window.screen.height}`;
        document.getElementById('sys-language').textContent = navigator.language;
        document.getElementById('sys-online').textContent = navigator.onLine ? '在线' : '离线';

        document.getElementById('user-name').textContent = this.currentUser.username;
        document.getElementById('user-created').textContent = this.currentUser.createdAt || '-';
        const avatar = document.getElementById('user-avatar');
        if (avatar) avatar.textContent = (this.currentUser.username || 'U').charAt(0).toUpperCase();

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

        const currentLang = localStorage.getItem('webos-language') || 'cmn';
        document.querySelectorAll('.lang-option').forEach(opt => {
            const lang = opt.dataset.lang;
            const check = opt.querySelector('.lang-check');
            if (lang === currentLang) check.textContent = '✓';
            opt.addEventListener('click', () => {
                this.applyLanguage(lang);
            });
        });

        this.applyLanguage(currentLang);
        this.loadVersion();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SettingsApp();
});
