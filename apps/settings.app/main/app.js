class SettingsApp {
    constructor() {
        this.languagePack = { strings: {} };
        this.currentLang = localStorage.getItem('webos-language') || 'cmn';
        this.init();
    }
    async init() {
        await this.loadLanguagePack(this.currentLang);
        this.setupNavigation();
        this.loadSystemInfo();
        this.loadUserInfo();
        this.loadPersonalization();
        this.loadLanguageSettings();
        this.applyLanguage();
    }
    async loadLanguagePack(lang) {
        const langFiles = { cmn: '/languages/cmn.json', eng: '/languages/eng.json', jpn: '/languages/jpn.json' };
        try {
            const res = await fetch(langFiles[lang] || langFiles.cmn);
            this.languagePack = await res.json();
            this.currentLang = lang;
            localStorage.setItem('webos-language', lang);
        } catch (e) {
            this.languagePack = { strings: {} };
        }
    }
    t(key, fallback) {
        const strings = this.languagePack.strings || {};
        return strings[key] !== undefined ? strings[key] : (fallback || key);
    }
    setupNavigation() {
        const navItems = document.querySelectorAll('.settings-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                const section = item.dataset.section;
                document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                document.getElementById('section-' + section).classList.add('active');
            });
        });
    }
    loadSystemInfo() {
        document.getElementById('sys-name').textContent = 'Web Terminal OS';
        document.getElementById('sys-browser').textContent = navigator.userAgent.split(') ')[0] + ')';
        document.getElementById('sys-os').textContent = navigator.platform || 'Unknown';
        document.getElementById('sys-resolution').textContent = window.screen.width + ' x ' + window.screen.height;
        document.getElementById('sys-online').textContent = navigator.onLine ? '在线' : '离线';
        document.getElementById('sys-version').textContent = 'v1.0.0';
    }
    loadUserInfo() {
        try {
            const userManager = window.parent.UserManager.getInstance();
            const user = userManager.getCurrentUser();
            if (user) {
                document.getElementById('user-name').textContent = user.name || user.username;
                document.getElementById('user-created').textContent = user.createdAt || '未知';
            }
        } catch (e) {}
    }
    loadPersonalization() {
        const wallpaper = localStorage.getItem('webos-wallpaper') || 'default';
        document.querySelectorAll('input[name="wallpaper"]').forEach(radio => {
            radio.checked = radio.value === wallpaper;
            radio.addEventListener('change', (e) => {
                localStorage.setItem('webos-wallpaper', e.target.value);
                this.applyWallpaper(e.target.value);
                this.dispatchWallpaperChange(e.target.value);
            });
        });
        const customColor = localStorage.getItem('webos-custom-color') || '#1a1a2e';
        const colorInput = document.getElementById('custom-color');
        if (colorInput) {
            colorInput.value = customColor;
            colorInput.addEventListener('input', (e) => {
                localStorage.setItem('webos-custom-color', e.target.value);
                this.applyWallpaper('custom');
                this.dispatchWallpaperChange('custom');
            });
        }
        this.setupWallpaperUploads();
        this.loadCustomWallpaper();
        const accentColor = localStorage.getItem('webos-accent-color') || '#3498db';
        document.querySelectorAll('.accent-color').forEach(el => {
            if (el.dataset.color === accentColor) el.classList.add('active');
            el.addEventListener('click', () => {
                document.querySelectorAll('.accent-color').forEach(c => c.classList.remove('active'));
                el.classList.add('active');
                localStorage.setItem('webos-accent-color', el.dataset.color);
                this.applyAccentColor(el.dataset.color);
            });
        });
        this.applyAccentColor(accentColor);
        const fontSize = localStorage.getItem('webos-font-size') || '14';
        const fontSizeSelect = document.getElementById('font-size-select');
        if (fontSizeSelect) {
            fontSizeSelect.value = fontSize;
            fontSizeSelect.addEventListener('change', (e) => {
                localStorage.setItem('webos-font-size', e.target.value);
                this.applyFontSize(e.target.value);
            });
        }
        this.applyFontSize(fontSize);
        const opacity = localStorage.getItem('webos-window-opacity') || '100';
        const opacitySlider = document.getElementById('window-opacity');
        const opacityValue = document.getElementById('opacity-value');
        if (opacitySlider) {
            opacitySlider.value = opacity;
            if (opacityValue) opacityValue.textContent = opacity + '%';
            opacitySlider.addEventListener('input', (e) => {
                localStorage.setItem('webos-window-opacity', e.target.value);
                if (opacityValue) opacityValue.textContent = e.target.value + '%';
                this.applyWindowOpacity(e.target.value);
            });
        }
        this.applyWindowOpacity(opacity);
        const animations = localStorage.getItem('webos-animations') !== 'false';
        const animationsToggle = document.getElementById('animations-toggle');
        if (animationsToggle) {
            animationsToggle.checked = animations;
            animationsToggle.addEventListener('change', (e) => {
                localStorage.setItem('webos-animations', e.target.checked ? 'true' : 'false');
                this.applyAnimations(e.target.checked);
            });
        }
        this.applyAnimations(animations);
        const taskbarAutohide = localStorage.getItem('webos-taskbar-autohide') === 'true';
        const taskbarToggle = document.getElementById('taskbar-autohide');
        if (taskbarToggle) {
            taskbarToggle.checked = taskbarAutohide;
            taskbarToggle.addEventListener('change', (e) => {
                localStorage.setItem('webos-taskbar-autohide', e.target.checked ? 'true' : 'false');
                this.applyTaskbarAutohide(e.target.checked);
            });
        }
        this.applyTaskbarAutohide(taskbarAutohide);
    }
    dispatchWallpaperChange(type) {
        try {
            let value;
            if (type === 'custom') {
                value = localStorage.getItem('webos-custom-color') || '#1a1a2e';
            } else if (type === 'image' || type === 'video') {
                value = localStorage.getItem('webos-custom-wallpaper-data') || '';
            } else {
                value = type;
            }
            window.parent.document.dispatchEvent(new CustomEvent('wallpaper-changed', { detail: { type, value } }));
        } catch (e) {}
    }
    setupWallpaperUploads() {
        const imgBtn = document.getElementById('upload-image-wallpaper');
        const imgInput = document.getElementById('image-wallpaper-input');
        const vidBtn = document.getElementById('upload-video-wallpaper');
        const vidInput = document.getElementById('video-wallpaper-input');
        const clearBtn = document.getElementById('wallpaper-preview-clear');
        if (imgBtn && imgInput) {
            imgBtn.addEventListener('click', () => imgInput.click());
            imgInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.handleWallpaperFile(file, 'image');
                e.target.value = '';
            });
        }
        if (vidBtn && vidInput) {
            vidBtn.addEventListener('click', () => vidInput.click());
            vidInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.handleWallpaperFile(file, 'video');
                e.target.value = '';
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                localStorage.removeItem('webos-custom-wallpaper-data');
                localStorage.removeItem('webos-custom-wallpaper-type');
                localStorage.removeItem('webos-custom-wallpaper-name');
                const preview = document.getElementById('wallpaper-preview');
                if (preview) preview.style.display = 'none';
                localStorage.setItem('webos-wallpaper', 'default');
                this.applyWallpaper('default');
                this.dispatchWallpaperChange('default');
            });
        }
    }
    handleWallpaperFile(file, type) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            localStorage.setItem('webos-custom-wallpaper-data', dataUrl);
            localStorage.setItem('webos-custom-wallpaper-type', type);
            localStorage.setItem('webos-custom-wallpaper-name', file.name);
            localStorage.setItem('webos-wallpaper', type);
            const preview = document.getElementById('wallpaper-preview');
            const previewName = document.getElementById('wallpaper-preview-name');
            if (preview) preview.style.display = 'flex';
            if (previewName) previewName.textContent = file.name + ' (' + (type === 'image' ? '图片' : '视频') + ')';
            this.applyCustomWallpaper(type, dataUrl);
            this.dispatchWallpaperChange(type);
        };
        reader.readAsDataURL(file);
    }
    loadCustomWallpaper() {
        const type = localStorage.getItem('webos-custom-wallpaper-type');
        const data = localStorage.getItem('webos-custom-wallpaper-data');
        const name = localStorage.getItem('webos-custom-wallpaper-name');
        if (type && data) {
            const preview = document.getElementById('wallpaper-preview');
            const previewName = document.getElementById('wallpaper-preview-name');
            if (preview) preview.style.display = 'flex';
            if (previewName) previewName.textContent = (name || '自定义') + ' (' + (type === 'image' ? '图片' : '视频') + ')';
        }
    }
    applyCustomWallpaper(type, dataUrl) {
        try {
            const desktop = window.parent.document.getElementById('desktop');
            const video = window.parent.document.getElementById('wallpaper-video');
            if (!desktop) return;
            if (video) {
                video.pause();
                video.classList.remove('active');
                video.removeAttribute('src');
                video.load();
            }
            if (type === 'image') {
                desktop.style.background = 'url(' + dataUrl + ') center/cover fixed';
            } else if (type === 'video') {
                desktop.style.background = '#000';
                if (video) {
                    video.src = dataUrl;
                    video.classList.add('active');
                    video.play().catch(() => {});
                }
            }
        } catch (e) {}
    }
    applyWallpaper(type) {
        try {
            const desktop = window.parent.document.getElementById('desktop');
            if (!desktop) return;
            const wallpapers = {
                default: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                dark: '#0a0a0a',
                custom: localStorage.getItem('webos-custom-color') || '#1a1a2e',
                gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                ocean: 'linear-gradient(135deg, #0c3547 0%, #0d7377 50%, #14a085 100%)',
                sunset: 'linear-gradient(135deg, #2c1810 0%, #c0392b 50%, #e67e22 100%)',
                forest: 'linear-gradient(135deg, #0d1f0d 0%, #1e4d2b 50%, #2d7a3e 100%)'
            };
            const bg = wallpapers[type] || wallpapers.default;
            desktop.style.background = bg;
            if (type === 'custom') desktop.style.backgroundImage = 'none';
        } catch (e) {}
    }
    applyAccentColor(color) {
        try {
            const root = window.parent.document.documentElement;
            root.style.setProperty('--accent-color', color);
            const styleId = 'webos-accent-style';
            let styleEl = window.parent.document.getElementById(styleId);
            if (!styleEl) {
                styleEl = window.parent.document.createElement('style');
                styleEl.id = styleId;
                window.parent.document.head.appendChild(styleEl);
            }
            styleEl.textContent = '.taskbar-item.active { background-color: ' + color + ' !important; } .window-titlebar { background-color: ' + color + ' !important; }';
        } catch (e) {}
    }
    applyFontSize(size) {
        try { window.parent.document.documentElement.style.fontSize = size + 'px'; } catch (e) {}
    }
    applyWindowOpacity(value) {
        try {
            const styleId = 'webos-opacity-style';
            let styleEl = window.parent.document.getElementById(styleId);
            if (!styleEl) {
                styleEl = window.parent.document.createElement('style');
                styleEl.id = styleId;
                window.parent.document.head.appendChild(styleEl);
            }
            const opacity = value / 100;
            styleEl.textContent = '.window { opacity: ' + opacity + '; } .window:hover { opacity: 1; }';
        } catch (e) {}
    }
    applyAnimations(enabled) {
        try {
            const styleId = 'webos-animations-style';
            let styleEl = window.parent.document.getElementById(styleId);
            if (!styleEl) {
                styleEl = window.parent.document.createElement('style');
                styleEl.id = styleId;
                window.parent.document.head.appendChild(styleEl);
            }
            styleEl.textContent = enabled ? '' : '* { transition: none !important; animation: none !important; }';
        } catch (e) {}
    }
    applyTaskbarAutohide(enabled) {
        try {
            window.parent.document.dispatchEvent(new CustomEvent('taskbar-autohide-changed', { detail: { enabled } }));
        } catch (e) {}
    }
    loadLanguageSettings() {
        const langSelect = document.getElementById('lang-select');
        if (langSelect) {
            langSelect.value = this.currentLang;
            langSelect.addEventListener('change', async (e) => {
                const lang = e.target.value;
                await this.loadLanguagePack(lang);
                this.applyLanguage();
                try {
                    if (window.parent && window.parent !== window) {
                        window.parent.document.dispatchEvent(new CustomEvent('language-changed', {
                            detail: { lang, strings: this.languagePack.strings }
                        }));
                    }
                } catch (err) {}
            });
        }
    }
    applyLanguage() {
        const strings = this.languagePack.strings || {};
        const navKeyMap = { system: 'system', user: 'user_info', personalization: 'personalization', language: 'language' };
        document.querySelectorAll('.settings-nav-item').forEach(item => {
            const section = item.dataset.section;
            const key = navKeyMap[section] || section;
            if (strings[key]) item.textContent = strings[key];
        });
        const sectionTitles = { 'section-system': 'system', 'section-user': 'user_info', 'section-personalization': 'personalization', 'section-language': 'language' };
        Object.entries(sectionTitles).forEach(([id, key]) => {
            const el = document.querySelector('#' + id + ' h2');
            if (el && strings[key]) el.textContent = strings[key];
        });
        const langLabels = { 'lang-select-label': 'settings.select_language' };
        Object.entries(langLabels).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (el && strings[key]) el.textContent = strings[key];
        });
    }
}
document.addEventListener('DOMContentLoaded', () => { new SettingsApp(); });