class SettingsApp {
    constructor() {
        this.languagePack = { strings: {} };
        this.currentLang = localStorage.getItem('webos-language') || 'cmn';
        this.currentUser = 'public';
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
    getStorage() {
        try { return window.parent.StorageService || window.StorageService; } catch(e) { return null; }
    }
    getCurrentUser() {
        try {
            const um = window.parent.UserManager || window.UserManager;
            if (um && um.getInstance) return um.getInstance().getCurrentUser().username || 'public';
        } catch(e) {}
        return 'public';
    }
    getUserInfoPath(filename) {
        return `/user/${this.getCurrentUser()}/info/${filename}`;
    }
    async saveToVFS(path, data) {
        const storage = this.getStorage();
        if (!storage) return false;
        try {
            await storage.writeFile(path, typeof data === 'string' ? data : JSON.stringify(data));
            return true;
        } catch(e) { console.error('VFS save failed:', e); return false; }
    }
    async loadFromVFS(path) {
        const storage = this.getStorage();
        if (!storage) return null;
        try {
            const content = await storage.readFile(path);
            if (content === null || content === undefined) return null;
            return typeof content === 'string' ? JSON.parse(content) : content;
        } catch(e) { return null; }
    }
    async loadLanguagePack(lang) {
        const langFiles = { cmn: '/apps/settings.app/main/language/settings_cmn.json', eng: '/apps/settings.app/main/language/settings_eng.json', jpn: '/apps/settings.app/main/language/settings_jpn.json' };
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
        document.getElementById('sys-name').textContent = 'navore OS';
        document.getElementById('sys-browser').textContent = navigator.userAgent.split(') ')[0] + ')';
        document.getElementById('sys-os').textContent = navigator.platform || 'Unknown';
        document.getElementById('sys-resolution').textContent = `${window.screen.width} x ${window.screen.height}`;
        document.getElementById('sys-online').textContent = navigator.onLine ? '在线' : '离线';
        document.getElementById('sys-version').textContent = 'v1.5';
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
        this.setupUserAvatar();
    }
    async setupUserAvatar() {
        const avatarPreview = document.getElementById('user-avatar-preview');
        const avatarInput = document.getElementById('user-avatar-input');
        const avatarUploadBtn = document.getElementById('user-avatar-upload');
        const avatarRemoveBtn = document.getElementById('user-avatar-remove');
        const avatarData = await this.loadFromVFS(this.getUserInfoPath('avatar.json'));
        let savedAvatar = avatarData && avatarData.data ? avatarData.data : localStorage.getItem('webos-user-avatar');
        if (avatarPreview && savedAvatar) {
            avatarPreview.src = savedAvatar;
            avatarPreview.style.display = 'block';
        }
        if (avatarUploadBtn && avatarInput) {
            avatarUploadBtn.addEventListener('click', () => avatarInput.click());
            avatarInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return; }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    this.saveToVFS(this.getUserInfoPath('avatar.json'), { data: dataUrl, name: file.name });
                    localStorage.setItem('webos-user-avatar', dataUrl);
                    if (avatarPreview) { avatarPreview.src = dataUrl; avatarPreview.style.display = 'block'; }
                    try { window.parent.document.dispatchEvent(new CustomEvent('user-avatar-changed', { detail: { avatar: dataUrl } })); } catch (err) {}
                };
                reader.readAsDataURL(file);
                e.target.value = '';
            });
        }
        if (avatarRemoveBtn) {
            avatarRemoveBtn.addEventListener('click', () => {
                this.saveToVFS(this.getUserInfoPath('avatar.json'), { data: null, name: null });
                localStorage.removeItem('webos-user-avatar');
                if (avatarPreview) { avatarPreview.src = ''; avatarPreview.style.display = 'none'; }
                try { window.parent.document.dispatchEvent(new CustomEvent('user-avatar-changed', { detail: { avatar: null } })); } catch (err) {}
            });
        }
    }
    async loadPersonalization() {
        const pers = await this.loadFromVFS(this.getUserInfoPath('personalisation.json')) || {};
        this.setupWallpaperUI(pers.wallpaper);
        const accentColor = pers.accentColor || localStorage.getItem('webos-accent-color') || '#1abc9c';
        document.querySelectorAll('.accent-color').forEach(el => {
            if (el.dataset.color === accentColor) el.classList.add('active');
            el.addEventListener('click', () => {
                document.querySelectorAll('.accent-color').forEach(c => c.classList.remove('active'));
                el.classList.add('active');
                this.savePersonalisation({ accentColor: el.dataset.color });
                localStorage.setItem('webos-accent-color', el.dataset.color);
                this.applyAccentColor(el.dataset.color);
            });
        });
        this.applyAccentColor(accentColor);
        const fontSize = pers.fontSize || localStorage.getItem('webos-font-size') || '14';
        const fontSizeSelect = document.getElementById('font-size-select');
        if (fontSizeSelect) {
            fontSizeSelect.value = fontSize;
            fontSizeSelect.addEventListener('change', (e) => {
                this.savePersonalisation({ fontSize: e.target.value });
                localStorage.setItem('webos-font-size', e.target.value);
                this.applyFontSize(e.target.value);
            });
        }
        this.applyFontSize(fontSize);
        const opacity = pers.windowOpacity || localStorage.getItem('webos-window-opacity') || '100';
        const opacitySlider = document.getElementById('window-opacity');
        const opacityValue = document.getElementById('opacity-value');
        if (opacitySlider) {
            opacitySlider.value = opacity;
            if (opacityValue) opacityValue.textContent = opacity + '%';
            opacitySlider.addEventListener('input', (e) => {
                this.savePersonalisation({ windowOpacity: e.target.value });
                localStorage.setItem('webos-window-opacity', e.target.value);
                if (opacityValue) opacityValue.textContent = e.target.value + '%';
                this.applyWindowOpacity(e.target.value);
            });
        }
        this.applyWindowOpacity(opacity);
        const animations = pers.animations !== undefined ? pers.animations : localStorage.getItem('webos-animations') !== 'false';
        const animationsToggle = document.getElementById('animations-toggle');
        if (animationsToggle) {
            animationsToggle.checked = animations;
            animationsToggle.addEventListener('change', (e) => {
                this.savePersonalisation({ animations: e.target.checked });
                localStorage.setItem('webos-animations', e.target.checked ? 'true' : 'false');
                this.applyAnimations(e.target.checked);
            });
        }
        this.applyAnimations(animations);
        const taskbarAutohide = pers.taskbarAutohide !== undefined ? pers.taskbarAutohide : localStorage.getItem('webos-taskbar-autohide') === 'true';
        const taskbarToggle = document.getElementById('taskbar-autohide');
        if (taskbarToggle) {
            taskbarToggle.checked = taskbarAutohide;
            taskbarToggle.addEventListener('change', (e) => {
                this.savePersonalisation({ taskbarAutohide: e.target.checked });
                localStorage.setItem('webos-taskbar-autohide', e.target.checked ? 'true' : 'false');
                this.applyTaskbarAutohide(e.target.checked);
            });
        }
        this.applyTaskbarAutohide(taskbarAutohide);
    }
    async savePersonalisation(updates) {
        const path = this.getUserInfoPath('personalisation.json');
        const current = await this.loadFromVFS(path) || {};
        const merged = { ...current, ...updates };
        await this.saveToVFS(path, merged);
    }
    setupWallpaperUI(savedWallpaper) {
        const typeRadios = document.querySelectorAll('input[name="wallpaper-type"]');
        const panels = { solid: document.getElementById('wallpaper-solid-panel'), gradient: document.getElementById('wallpaper-gradient-panel'), image: document.getElementById('wallpaper-image-panel'), video: document.getElementById('wallpaper-video-panel') };
        let wp = savedWallpaper || { type: 'gradient', start: '#0c3547', end: '#14a085', direction: '135deg' };
        if (typeof wp === 'string') {
            const oldMap = { default: {type:'gradient',start:'#0c3547',end:'#14a085',direction:'135deg'}, ocean: {type:'gradient',start:'#0c3547',end:'#14a085',direction:'135deg'}, dark: {type:'solid',color:'#0a0a0a'}, custom: {type:'solid',color:localStorage.getItem('webos-custom-color')||'#1a1a2e'}, gradient: {type:'gradient',start:'#667eea',end:'#764ba2',direction:'135deg'}, sunset: {type:'gradient',start:'#2c1810',end:'#e67e22',direction:'135deg'}, forest: {type:'gradient',start:'#0d1f0d',end:'#2d7a3e',direction:'135deg'} };
            wp = oldMap[wp] || oldMap.default;
        }
        typeRadios.forEach(radio => {
            radio.checked = radio.value === wp.type;
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    Object.values(panels).forEach(p => p && (p.style.display = 'none'));
                    if (panels[radio.value]) panels[radio.value].style.display = 'block';
                }
            });
        });
        Object.values(panels).forEach(p => p && (p.style.display = 'none'));
        if (panels[wp.type]) panels[wp.type].style.display = 'block';
        const solidColor = document.getElementById('wallpaper-solid-color');
        if (solidColor) {
            solidColor.value = wp.color || '#0c3547';
            solidColor.addEventListener('input', () => {
                const newWp = { type: 'solid', color: solidColor.value };
                this.savePersonalisation({ wallpaper: newWp });
                this.dispatchWallpaperChange(newWp);
            });
        }
        const gradStart = document.getElementById('wallpaper-gradient-start');
        const gradEnd = document.getElementById('wallpaper-gradient-end');
        const gradDir = document.getElementById('wallpaper-gradient-direction');
        if (gradStart) { gradStart.value = wp.start || '#0c3547'; gradStart.addEventListener('input', () => this.applyGradient()); }
        if (gradEnd) { gradEnd.value = wp.end || '#14a085'; gradEnd.addEventListener('input', () => this.applyGradient()); }
        if (gradDir) { gradDir.value = wp.direction || '135deg'; gradDir.addEventListener('change', () => this.applyGradient()); }
        this.setupWallpaperFileUploads();
        if (wp.type === 'image' && wp.data) {
            const preview = document.getElementById('image-wallpaper-preview');
            const name = document.getElementById('image-wallpaper-name');
            if (preview) preview.style.display = 'flex';
            if (name) name.textContent = wp.name || '自定义图片';
        }
        if (wp.type === 'video' && wp.data) {
            const preview = document.getElementById('video-wallpaper-preview');
            const name = document.getElementById('video-wallpaper-name');
            if (preview) preview.style.display = 'flex';
            if (name) name.textContent = wp.name || '自定义视频';
        }
    }
    applyGradient() {
        const start = document.getElementById('wallpaper-gradient-start').value;
        const end = document.getElementById('wallpaper-gradient-end').value;
        const direction = document.getElementById('wallpaper-gradient-direction').value;
        const wp = { type: 'gradient', start, end, direction };
        this.savePersonalisation({ wallpaper: wp });
        this.dispatchWallpaperChange(wp);
    }
    setupWallpaperFileUploads() {
        const imgBtn = document.getElementById('upload-image-wallpaper');
        const imgInput = document.getElementById('image-wallpaper-input');
        const vidBtn = document.getElementById('upload-video-wallpaper');
        const vidInput = document.getElementById('video-wallpaper-input');
        const imgClear = document.getElementById('image-wallpaper-clear');
        const vidClear = document.getElementById('video-wallpaper-clear');
        if (imgBtn && imgInput) {
            imgBtn.addEventListener('click', () => imgInput.click());
            imgInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) this.handleWallpaperFile(file, 'image'); e.target.value = ''; });
        }
        if (vidBtn && vidInput) {
            vidBtn.addEventListener('click', () => vidInput.click());
            vidInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) this.handleWallpaperFile(file, 'video'); e.target.value = ''; });
        }
        if (imgClear) {
            imgClear.addEventListener('click', () => {
                const preview = document.getElementById('image-wallpaper-preview');
                if (preview) preview.style.display = 'none';
                const wp = { type: 'solid', color: '#0c3547' };
                this.savePersonalisation({ wallpaper: wp });
                this.dispatchWallpaperChange(wp);
            });
        }
        if (vidClear) {
            vidClear.addEventListener('click', () => {
                const preview = document.getElementById('video-wallpaper-preview');
                if (preview) preview.style.display = 'none';
                const wp = { type: 'solid', color: '#0c3547' };
                this.savePersonalisation({ wallpaper: wp });
                this.dispatchWallpaperChange(wp);
            });
        }
    }
    handleWallpaperFile(file, type) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const wp = { type, data: dataUrl, name: file.name };
            this.savePersonalisation({ wallpaper: wp });
            const preview = document.getElementById(type + '-wallpaper-preview');
            const nameEl = document.getElementById(type + '-wallpaper-name');
            if (preview) preview.style.display = 'flex';
            if (nameEl) nameEl.textContent = file.name;
            this.dispatchWallpaperChange(wp);
        };
        reader.readAsDataURL(file);
    }
    dispatchWallpaperChange(wp) {
        try { window.parent.document.dispatchEvent(new CustomEvent('wallpaper-changed', { detail: wp })); } catch (e) {}
    }
    applyAccentColor(color) {
        try {
            const root = window.parent.document.documentElement;
            root.style.setProperty('--accent-color', color);
            window.parent.document.dispatchEvent(new CustomEvent('accent-color-changed', { detail: { color } }));
        } catch (e) {}
    }
    applyFontSize(size) { try { const root = window.parent.document.documentElement; root.style.fontSize = size + 'px'; } catch (e) {} }
    applyWindowOpacity(value) {
        try {
            const styleId = 'webos-opacity-style';
            let styleEl = window.parent.document.getElementById(styleId);
            if (!styleEl) { styleEl = window.parent.document.createElement('style'); styleEl.id = styleId; window.parent.document.head.appendChild(styleEl); }
            const opacity = value / 100;
            styleEl.textContent = `.window { opacity: ${opacity}; } .window:hover { opacity: 1; }`;
        } catch (e) {}
    }
    applyAnimations(enabled) {
        try {
            const styleId = 'webos-animations-style';
            let styleEl = window.parent.document.getElementById(styleId);
            if (!styleEl) { styleEl = window.parent.document.createElement('style'); styleEl.id = styleId; window.parent.document.head.appendChild(styleEl); }
            styleEl.textContent = enabled ? '' : `* { transition: none !important; animation: none !important; }`;
        } catch (e) {}
    }
    applyTaskbarAutohide(enabled) { try { window.parent.document.dispatchEvent(new CustomEvent('taskbar-autohide-changed', { detail: { enabled } })); } catch (e) {} }
    loadLanguageSettings() {
        const langSelect = document.getElementById('lang-select');
        if (langSelect) {
            langSelect.value = this.currentLang;
            langSelect.addEventListener('change', async (e) => {
                const lang = e.target.value;
                await this.loadLanguagePack(lang);
                this.applyLanguage();
                try { if (window.parent && window.parent !== window) { window.parent.document.dispatchEvent(new CustomEvent('language-changed', { detail: { lang } })); } } catch (err) {}
            });
        }
    }
    applyLanguage() {
        const strings = this.languagePack.strings || {};
        const navKeyMap = { system: 'system', user: 'user_info', personalization: 'personalization', language: 'language' };
        document.querySelectorAll('.settings-nav-item').forEach(item => { const section = item.dataset.section; const key = navKeyMap[section] || section; if (strings[key]) item.textContent = strings[key]; });
        const sectionTitles = { 'section-system': 'system', 'section-user': 'user_info', 'section-personalization': 'personalization', 'section-language': 'language' };
        Object.entries(sectionTitles).forEach(([id, key]) => { const el = document.querySelector('#' + id + ' h2'); if (el && strings[key]) el.textContent = strings[key]; });
        const sysLabels = { 'sys-name-label': 'settings.sys_name', 'sys-browser-label': 'settings.sys_browser', 'sys-os-label': 'settings.sys_os', 'sys-resolution-label': 'settings.sys_resolution', 'sys-online-label': 'settings.sys_online', 'sys-version-label': 'version' };
        Object.entries(sysLabels).forEach(([id, key]) => { const el = document.getElementById(id); if (el && strings[key]) el.textContent = strings[key]; });
        const userLabels = { 'user-name-label': 'settings.user_name', 'user-created-label': 'settings.user_created' };
        Object.entries(userLabels).forEach(([id, key]) => { const el = document.getElementById(id); if (el && strings[key]) el.textContent = strings[key]; });
        const persLabels = { 'pers-wallpaper-title': 'settings.wallpaper', 'pers-accent-title': 'settings.accent_color', 'pers-appearance-title': 'settings.appearance', 'pers-fontsize-label': 'settings.font_size', 'pers-opacity-label': 'settings.window_opacity', 'pers-animations-label': 'settings.window_animations', 'pers-taskbar-autohide-label': 'settings.taskbar_autohide' };
        Object.entries(persLabels).forEach(([id, key]) => { const el = document.getElementById(id); if (el && strings[key]) el.textContent = strings[key]; });
        const langLabels = { 'lang-select-label': 'settings.select_language' };
        Object.entries(langLabels).forEach(([id, key]) => { const el = document.getElementById(id); if (el && strings[key]) el.textContent = strings[key]; });
        const versionEl = document.getElementById('settings-version');
        if (versionEl && strings['version']) versionEl.textContent = strings['version'] + ' v1.5';
        if (strings['app.settings']) document.title = strings['app.settings'];
    }
}
document.addEventListener('DOMContentLoaded', () => { new SettingsApp(); });