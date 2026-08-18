// apps/settings.app/main/app.js
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
        const langFiles = {
            cmn: '/languages/cmn.json',
            eng: '/languages/eng.json',
            jpn: '/languages/jpn.json'
        };
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
        document.getElementById('sys-resolution').textContent = `${window.screen.width} x ${window.screen.height}`;
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
            });
        });

        const customColor = localStorage.getItem('webos-custom-color') || '#1a1a2e';
        const colorInput = document.getElementById('custom-color');
        if (colorInput) {
            colorInput.value = customColor;
            colorInput.addEventListener('input', (e) => {
                localStorage.setItem('webos-custom-color', e.target.value);
                this.applyWallpaper('custom');
            });
        }
    }

    applyWallpaper(type) {
        try {
            const desktop = window.parent.document.getElementById('desktop');
            if (!desktop) return;
            switch (type) {
                case 'default':
                    desktop.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)';
                    break;
                case 'dark':
                    desktop.style.background = '#0a0a0a';
                    break;
                case 'custom':
                    const color = localStorage.getItem('webos-custom-color') || '#1a1a2e';
                    desktop.style.background = color;
                    break;
                case 'gradient':
                    desktop.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    break;
            }
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
                // 通知父窗口语言已变更
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

        // 导航栏：data-section 到语言 key 的映射（修复 user -> user_info 映射错误）
        const navKeyMap = {
            system: 'system',
            user: 'user_info',
            personalization: 'personalization',
            language: 'language'
        };

        document.querySelectorAll('.settings-nav-item').forEach(item => {
            const section = item.dataset.section;
            const key = navKeyMap[section] || section;
            if (strings[key]) {
                item.textContent = strings[key];
            }
        });

        // 区块标题
        const sectionTitles = {
            'section-system': 'system',
            'section-user': 'user_info',
            'section-personalization': 'personalization',
            'section-language': 'language'
        };
        Object.entries(sectionTitles).forEach(([id, key]) => {
            const el = document.querySelector('#' + id + ' h2');
            if (el && strings[key]) {
                el.textContent = strings[key];
            }
        });

        // 系统信息标签
        const sysLabels = {
            'sys-name-label': 'settings.sys_name',
            'sys-browser-label': 'settings.sys_browser',
            'sys-os-label': 'settings.sys_os',
            'sys-resolution-label': 'settings.sys_resolution',
            'sys-online-label': 'settings.sys_online',
            'sys-version-label': 'version'
        };
        Object.entries(sysLabels).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (el && strings[key]) {
                el.textContent = strings[key];
            }
        });

        // 用户信息标签
        const userLabels = {
            'user-name-label': 'settings.user_name',
            'user-created-label': 'settings.user_created'
        };
        Object.entries(userLabels).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (el && strings[key]) {
                el.textContent = strings[key];
            }
        });

        // 个性化标签
        const persLabels = {
            'pers-wallpaper-title': 'settings.wallpaper',
            'pers-wallpaper-default': 'settings.wallpaper_default',
            'pers-wallpaper-dark': 'settings.wallpaper_dark',
            'pers-wallpaper-custom': 'settings.wallpaper_custom',
            'pers-wallpaper-gradient': 'settings.wallpaper_gradient',
            'pers-custom-color-label': 'settings.custom_color'
        };
        Object.entries(persLabels).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (el && strings[key]) {
                el.textContent = strings[key];
            }
        });

        // 语言设置标签
        const langLabels = {
            'lang-select-label': 'settings.select_language'
        };
        Object.entries(langLabels).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (el && strings[key]) {
                el.textContent = strings[key];
            }
        });

        // 版本和标题
        const versionEl = document.getElementById('settings-version');
        if (versionEl && strings['version']) {
            versionEl.textContent = strings['version'] + ' v1.0.0';
        }
        if (strings['app.settings']) {
            document.title = strings['app.settings'];
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SettingsApp();
});