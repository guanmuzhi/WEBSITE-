import UserManager from './user-manager.js?v=31';
import LockScreen from './lock-screen.js?v=31';
import StorageService from './storage.js?v=31';
import { Path } from './lib/index.js?v=31';
class DesktopManager {
    constructor(options = {}) {
        this.desktopEl = options.desktopEl || null;
        this.terminalClass = options.terminalClass || null;
        this.windowManager = options.windowManager || null;
        this.taskbarItemsEl = null;
        this.taskbarClockEl = null;
        this.taskbarUserNameEl = null;
        this.taskbarEl = null;
        this.compactTaskbarEl = null;
        this.compactTaskbarNameEl = null;
        this.compactTaskbarAvatarEl = null;
        this.compactExpandBtn = null;
        this._taskbarAutohide = false;
        this._taskbarAutohideTimer = null;
        this.wallpaperVideoEl = null;
        this.clockInterval = null;
        this.terminalWindows = new Map();
        this._isLoadingState = false;
        this.apps = [];
        this._systemAppPaths = new Set();
        this.langStrings = {};
        this.appLangStrings = {};
        this.userManager = UserManager.getInstance();
        this.storage = StorageService.getInstance();
        this.lockScreen = null;
        this.viewX = 0;
        this.viewY = 0;
        this._isPanning = false;
        this._panStartX = 0;
        this._panStartY = 0;
        this._panStartViewX = 0;
        this._panStartViewY = 0;
        this.windowsContainerEl = null;
    }
    isMobile() { return window.innerWidth < 768; }
    darkenHex(hex, amount = 0.15) {
        let c = String(hex || '').replace('#', '');
        if (!c) return '#1abc9c';
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const num = parseInt(c, 16);
        if (isNaN(num)) return '#1abc9c';
        const r = Math.max(0, Math.round(((num >> 16) & 255) * (1 - amount)));
        const g = Math.max(0, Math.round(((num >> 8) & 255) * (1 - amount)));
        const b = Math.max(0, Math.round((num & 255) * (1 - amount)));
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    hexToRgb(hex) {
        let c = String(hex || '').replace('#', '');
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const num = parseInt(c, 16);
        if (isNaN(num)) return '26, 188, 156';
        const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
        return `${r}, ${g}, ${b}`;
    }
    getPersonalizationPath() {
        const user = this.userManager.getCurrentUser();
        const username = user ? user.username : 'default';
        return `/user/${username}/info/personalization.json`;
    }
    loadPersonalization() {
        try {
            let data = this.storage.loadJSON(this.getPersonalizationPath());
            // 迁移：美式拼写 personalization 已统一；若未找到则尝试英式拼写
            if (!data) {
                const alt = this.storage.loadJSON(`/user/${(this.userManager.getCurrentUser()||{}).username || 'default'}/info/personalisation.json`);
                if (alt) data = alt;
            }
            return (data && typeof data === 'object') ? data : {};
        } catch (e) { return {}; }
    }
    applyTaskbarColor(color, opacityPercent) {
        try {
            const c = color || '#1abc9c';
            const o = Math.max(0, Math.min(100, Number(opacityPercent != null ? opacityPercent : 70))) / 100;
            const rgb = this.hexToRgb(c);
            const root = document.documentElement;
            root.style.setProperty('--taskbar-color', c);
            root.style.setProperty('--taskbar-opacity', o);
            root.style.setProperty('--taskbar-bg', `rgba(${rgb}, ${o})`);
            root.style.setProperty('--taskbar-border', `rgba(${rgb}, ${Math.min(o + 0.2, 1)})`);
        } catch (e) {}
    }
    applyFontSize(size) {
        try { document.documentElement.style.fontSize = (size || 14) + 'px'; } catch (e) {}
    }
    applyWindowOpacity(value) {
        try {
            const styleId = 'webos-opacity-style';
            let styleEl = document.getElementById(styleId);
            if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
            const opacity = Math.max(0, Math.min(100, Number(value || 100))) / 100;
            styleEl.textContent = `.window { opacity: ${opacity}; } .window:hover { opacity: 1; }`;
        } catch (e) {}
    }
    applyAnimations(enabled) {
        try {
            const styleId = 'webos-animations-style';
            let styleEl = document.getElementById(styleId);
            if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
            styleEl.textContent = enabled ? '' : `* { transition: none !important; animation: none !important; }`;
        } catch (e) {}
    }
    async applyPersonalization() {
        const pers = this.loadPersonalization();
        // 语言（先于 loadLanguageStrings 之后再次同步，保证个性化优先级最高）
        if (pers.language) {
            localStorage.setItem('webos-language', pers.language);
            this.lang = pers.language;
            document.dispatchEvent(new CustomEvent('language-changed', { detail: { lang: pers.language } }));
        }
        // 壁纸：若 personalization 有就覆盖 VFS/wallpaper.json
        if (pers.wallpaper) {
            this.applyWallpaper(pers.wallpaper);
            try { this.storage.saveJSON(`/user/${(this.userManager.getCurrentUser()||{}).username || 'default'}/info/wallpaper.json`, pers.wallpaper); } catch (_) {}
            localStorage.setItem('webos-wallpaper', JSON.stringify(pers.wallpaper));
        }
        // 主题色
        if (pers.accentColor) {
            localStorage.setItem('webos-accent-color', pers.accentColor);
            this.applyThemeColor(pers.accentColor);
        }
        // 字体大小
        if (pers.fontSize) {
            localStorage.setItem('webos-font-size', String(pers.fontSize));
            this.applyFontSize(pers.fontSize);
        }
        // 窗口不透明度
        if (pers.windowOpacity != null) {
            localStorage.setItem('webos-window-opacity', String(pers.windowOpacity));
            this.applyWindowOpacity(pers.windowOpacity);
        }
        // 动画开关
        if (pers.animations !== undefined) {
            localStorage.setItem('webos-animations', pers.animations ? 'true' : 'false');
            this.applyAnimations(!!pers.animations);
        }
        // 任务栏自动隐藏
        if (pers.taskbarAutohide !== undefined) {
            localStorage.setItem('webos-taskbar-autohide', pers.taskbarAutohide ? 'true' : 'false');
            this.setTaskbarAutohide(!!pers.taskbarAutohide);
        }
        // 任务栏颜色 + 不透明度
        const tbColor = pers.taskbarColor || localStorage.getItem('webos-taskbar-color') || '#1abc9c';
        const tbOpacity = pers.taskbarOpacity != null ? String(pers.taskbarOpacity) : (localStorage.getItem('webos-taskbar-opacity') || '70');
        localStorage.setItem('webos-taskbar-color', tbColor);
        localStorage.setItem('webos-taskbar-opacity', String(tbOpacity));
        this.applyTaskbarColor(tbColor, tbOpacity);
    }
    getCurrentAccent() {
        return localStorage.getItem('webos-accent-color') || '#1abc9c';
    }
    buildThemeDetail(color) {
        color = color || this.getCurrentAccent();
        return { color, hover: this.darkenHex(color, 0.15) };
    }
    applyThemeToIframe(iframe, detail) {
        if (!iframe) return;
        try {
            const doc = iframe.contentDocument;
            if (!doc || !doc.documentElement) {
                iframe.addEventListener('load', () => this.applyThemeToIframe(iframe, detail), { once: true });
                return;
            }
            doc.documentElement.style.setProperty('--accent-color', detail.color);
            doc.documentElement.style.setProperty('--accent-hover', detail.hover);
        } catch (e) {}
    }
    applyThemeColor(color) {
        const detail = this.buildThemeDetail(color);
        const root = document.documentElement;
        root.style.setProperty('--accent-color', detail.color);
        root.style.setProperty('--accent-hover', detail.hover);
        this.windowManager.getAllWindows().forEach(win => {
            const iframe = win.element && win.element.querySelector('iframe');
            this.applyThemeToIframe(iframe, detail);
        });
        return detail;
    }
    setupThemeListener() {
        this.applyThemeColor(this.getCurrentAccent());
        document.addEventListener('accent-color-changed', (e) => {
            this.applyThemeColor(e.detail && e.detail.color);
        });
    }
    getStateFilePath() {
        const user = this.userManager.getCurrentUser();
        const username = user ? user.username : 'default';
        return `/user/${username}/info/windows_status.json`;
    }
    async init() {
        this.taskbarItemsEl = this.desktopEl.querySelector('.taskbar-items');
        this.taskbarClockEl = this.desktopEl.querySelector('.taskbar-clock');
        this.taskbarUserNameEl = this.desktopEl.querySelector('#taskbar-user-name');
        this.taskbarEl = this.desktopEl.querySelector('.taskbar');
        this.compactTaskbarEl = this.desktopEl.querySelector('#taskbar-compact');
        this.compactTaskbarNameEl = this.desktopEl.querySelector('#taskbar-compact-name');
        this.compactTaskbarAvatarEl = this.desktopEl.querySelector('#taskbar-compact-avatar');
        this.compactExpandBtn = this.desktopEl.querySelector('#taskbar-compact-expand');
        this.wallpaperVideoEl = this.desktopEl.querySelector('#wallpaper-video');
        this.windowsContainerEl = this.desktopEl.querySelector('.windows-container');
        this.setupCompactTaskbar();
        this.setupDesktopPanning();
        if (window._bootManager && window._bootManager.lockScreen) {
            this.lockScreen = window._bootManager.lockScreen;
            this.lockScreen.onUnlock = () => { this.updateTaskbarUser(); };
            this.lockScreen.onUserSwitch = (username) => { this.switchUser(username); };
        } else {
            this.lockScreen = new LockScreen({ onUnlock: () => { this.updateTaskbarUser(); }, onUserSwitch: (username) => { this.switchUser(username); } });
        }
        this.setupTaskbarUser();
        await this.loadLanguageStrings();
        await this.scanApps();
        await this.refreshAppNames();
        await this.seedSystemDirectories();
        try { await this.migrateLegacyLanguageCacheToVFS(); } catch (e) { console.warn('migrate language cache failed:', e); }
        this.setupDesktopIcons();
        this.setupLanguageListener();
        this.startClock();
        // 在恢复窗口和应用主题前，先应用 personalization.json（含语言/任务栏/动画/字体/壁纸/主题色）
        try { await this.applyPersonalization(); } catch (e) { console.warn('apply personalization failed:', e); }
        this.loadState();
        this.updateTaskbar();
        this.updateTaskbarUser();
        this.setupAppLaunchListeners();
        this.setupUserSwitchListener();
        this.setupWallpaper();
        this.setupTaskbarAutohideListener();
        this.setupThemeListener();
        this.setupTerminalCommandListener();
        this.setupIframeFocusTracking();
        this.setupDesktopClick();
        window.openApp = this.openAppById.bind(this);
        window.installAppFromFile = this.installAppFromFile.bind(this);
        window.getInstalledApps = () => this.apps.filter(a => !this._systemAppPaths.has(a.path));
    }
    getLangCode() { return localStorage.getItem('webos-language') || 'cmn'; }
    async fetchLangJson(url, cacheKey) {
        // 优先 VFS：根语言文件位于 /languages/*.json，文件管理器 / ls -a 下可见
        if (url && /^\/languages\/[^\/]+\.json$/.test(url)) {
            const vfsContent = this.storage ? this.storage.readFile(url) : null;
            if (vfsContent && typeof vfsContent === 'string') {
                try { return JSON.parse(vfsContent); } catch (e) {}
            }
        }
        // 回退：localStorage 旧缓存（兼容历史数据）
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try { const data = JSON.parse(cached); if (data) return data; } catch (e) {}
        }
        // 最终回退：网络 fetch；成功后写入 VFS 对应路径（若可推导）并移除旧 localStorage 键
        try {
            const res = await fetch(url);
            if (res.ok) {
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { return null; }
                if (url && /^\/languages\/[^\/]+\.json$/.test(url) && this.storage) {
                    try { this.storage.writeFile(url, text); } catch (e) {}
                    try { localStorage.removeItem(cacheKey); } catch (e) {}
                } else {
                    try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
                }
                return data;
            }
        } catch (e) {}
        return null;
    }
    // 把旧 localStorage 里以 language.xxx / webos-lang-* 形式缓存的语言 JSON 迁移到 VFS /languages/*.json
    async migrateLegacyLanguageCacheToVFS() {
        if (!this.storage) return;
        const known = ['cmn', 'eng', 'jpn'];
        const keysToClear = [];
        for (const code of known) {
            const candidates = [`language.${code}`, `webos-lang-root:${code}`];
            for (const k of candidates) {
                let raw = null;
                try { raw = localStorage.getItem(k); } catch (e) { raw = null; }
                if (!raw) continue;
                let data = null;
                try { data = JSON.parse(raw); } catch (e) { continue; }
                const destPath = `/languages/${code}.json`;
                try {
                    const normalized = typeof data === 'string' ? data : JSON.stringify(data);
                    this.storage.writeFile(destPath, normalized);
                } catch (e) {}
                keysToClear.push(k);
            }
        }
        // 所有 webos-lang:*:*.app 应用级旧缓存也清理（应用级不在 /languages 下，按需重取）
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('webos-lang:'))) { keysToClear.push(k); }
        }
        for (const k of keysToClear) { try { localStorage.removeItem(k); } catch (e) {} }
    }
    async loadLanguageStrings(lang) {
        lang = lang || this.getLangCode();
        const langFiles = { cmn: '/languages/cmn.json', eng: '/languages/eng.json', jpn: '/languages/jpn.json' };
        const data = await this.fetchLangJson(langFiles[lang] || langFiles.cmn, `webos-lang-root:${lang}`);
        this.langStrings = (data && data.strings) || {};
    }
    async loadAppLanguages(lang) {
        lang = lang || this.getLangCode();
        const map = {};
        if (this.apps && this.apps.length) {
            await Promise.all(this.apps.map(async (app) => {
                const id = app.path.replace('.app', '');
                const url = `/apps/${app.path}/main/language/${id}_${lang}.json`;
                const data = await this.fetchLangJson(url, `webos-lang:${lang}:${app.path}`);
                if (data && data.strings) map[app.path] = data.strings;
            }));
        }
        this.appLangStrings = map;
    }
    getAppDisplayName(app, fallback) {
        const id = app.path.replace('.app', '');
        const strs = (this.appLangStrings && this.appLangStrings[app.path]) || {};
        if (strs['app.' + id] !== undefined) return strs['app.' + id];
        if (strs['app.title'] !== undefined) return strs['app.title'];
        return fallback || app.name;
    }
    getAppLabelForPath(path, fallback) {
        const app = (this.apps || []).find(a => a.path === path);
        if (app) return this.getAppDisplayName(app, fallback);
        return fallback;
    }
    async refreshAppNames() {
        await this.loadAppLanguages();
        this.updateDesktopIconLabels();
        this.updateAllWindowTitles();
        this.updateTaskbar();
    }
    updateAllWindowTitles() {
        if (!this.windowManager) return;
        this.windowManager.getAllWindows().forEach(win => {
            if (win.windowType === 'app') {
                const path = (win._appObj && win._appObj.path) || win.appPath;
                const appObj = win._appObj || { path: path, name: win.appName || path };
                win.setTitle(this.getAppDisplayName(appObj, win.appName || path));
            }
            else if (win.windowType === 'terminal') { win.setTitle(this.t('app.terminal', '终端')); }
        });
    }
    t(key, fallback) { return this.langStrings[key] !== undefined ? this.langStrings[key] : (fallback || key); }
    setupLanguageListener() {
        document.addEventListener('language-changed', async (e) => {
            const { lang, strings } = e.detail || {};
            if (strings) { this.langStrings = strings; } else { await this.loadLanguageStrings(lang); }
            await this.refreshAppNames();
            this.updateDesktopIconLabels(); this.updateTaskbar();
        });
    }
    updateDesktopIconLabels() {
        const desktopIcons = this.desktopEl.querySelector('.desktop-icons');
        if (!desktopIcons) return;
        const terminalLabel = desktopIcons.querySelector('#terminal-icon .icon-label');
        if (terminalLabel) terminalLabel.textContent = this.t('app.terminal', '终端');
        const calcLabel = desktopIcons.querySelector('#calculator-icon .icon-label');
        if (calcLabel) calcLabel.textContent = this.getAppLabelForPath('calculator.app', '计算器');
        const fmLabel = desktopIcons.querySelector('#filemanager-icon .icon-label');
        if (fmLabel) fmLabel.textContent = this.getAppLabelForPath('filemanager.app', '文件管理器');
        this.apps.forEach(app => {
            const iconEl = desktopIcons.querySelector(`[data-app="${app.id}"]`);
            if (iconEl) { const labelEl = iconEl.querySelector('.icon-label'); if (labelEl) { labelEl.textContent = this.getAppDisplayName(app, app.name); } }
        });
    }
    async seedSystemDirectories() {
        try {
            const fs = this.storage.fs;
            if (!fs.children) fs.children = [];
            let appDir = fs.children.find(c => c.name === 'application' && c.type === 'folder');
            if (!appDir) { appDir = { type: 'folder', name: 'application', children: [] }; fs.children.push(appDir); }
            if (!appDir.children) appDir.children = [];
            for (const app of this.apps) {
                if (!appDir.children.find(c => c.name === app.path)) {
                    const appFolder = { type: 'folder', name: app.path, children: [{ type: 'folder', name: 'main', children: [] }] };
                    try { const infoRes = await fetch(`/apps/${app.path}/info.json`); if (infoRes.ok) { const infoContent = await infoRes.text(); appFolder.children.push({ type: 'file', name: 'info.json', content: infoContent }); } else { appFolder.children.push({ type: 'file', name: 'info.json', content: JSON.stringify(app, null, 2) }); } } catch (e) { appFolder.children.push({ type: 'file', name: 'info.json', content: JSON.stringify(app, null, 2) }); }
                    try { const iconRes = await fetch(`/apps/${app.path}/icon.svg`); if (iconRes.ok) { const iconContent = await iconRes.text(); appFolder.children.push({ type: 'file', name: 'icon.svg', content: iconContent }); } } catch (e) {}
                    const mainFiles = ['index.html', 'style.css', 'app.js'];
                    const mainFolder = appFolder.children.find(c => c.name === 'main');
                    for (const mf of mainFiles) { try { const res = await fetch(`/apps/${app.path}/main/${mf}`); if (res.ok) { const content = await res.text(); mainFolder.children.push({ type: 'file', name: mf, content }); } } catch (e) {} }
                    appDir.children.push(appFolder);
                }
            }
            let langDir = fs.children.find(c => c.name === 'languages' && c.type === 'folder');
            if (!langDir) { langDir = { type: 'folder', name: 'languages', children: [] }; fs.children.push(langDir); }
            if (!langDir.children) langDir.children = [];
            // 每次启动都尝试用磁盘最新文件刷新 /languages/*.json（保证文件管理器可见且内容最新；小文件开销可忽略）
            const langFiles = [{ file: 'cmn.json', path: '/languages/cmn.json' }, { file: 'eng.json', path: '/languages/eng.json' }, { file: 'jpn.json', path: '/languages/jpn.json' }];
            for (const lang of langFiles) {
                try {
                    const res = await fetch(lang.path);
                    if (!res.ok) continue;
                    const content = await res.text();
                    const existing = langDir.children.find(c => c.name === lang.file);
                    if (existing) existing.content = content;
                    else langDir.children.push({ type: 'file', name: lang.file, content });
                } catch (e) {}
            }
            const user = this.userManager.getCurrentUser();
            if (user) {
                const username = user.username;
                let userDir = fs.children.find(c => c.name === 'user' && c.type === 'folder');
                if (userDir) {
                    if (!userDir.children) userDir.children = [];
                    let uDir = userDir.children.find(c => c.name === username && c.type === 'folder');
                    if (uDir) {
                        if (!uDir.children) uDir.children = [];
                        let infoDir = uDir.children.find(c => c.name === 'info' && c.type === 'folder');
                        if (!infoDir) { infoDir = { type: 'folder', name: 'info', children: [] }; uDir.children.push(infoDir); }
                        if (!infoDir.children) infoDir.children = [];
                        let appInfoDir = uDir.children.find(c => c.name === 'appinfo' && c.type === 'folder');
                        if (!appInfoDir) { appInfoDir = { type: 'folder', name: 'appinfo', children: [] }; uDir.children.push(appInfoDir); }
                        if (!appInfoDir.children) appInfoDir.children = [];
                        if (!appInfoDir.children.find(c => c.name === 'browser.app')) { appInfoDir.children.push({ type: 'folder', name: 'browser.app', children: [{ type: 'file', name: 'history.json', content: '[]' }, { type: 'file', name: 'bookmarks.json', content: '[]' }] }); }
                    }
                }
            }
            this.storage.saveFS();
        } catch (e) { console.warn('seedSystemDirectories failed:', e); }
    }
    setupWallpaper() {
        this.loadWallpaper();
        document.addEventListener('wallpaper-changed', (e) => { const wp = e.detail; this.applyWallpaper(wp); this.saveWallpaperToFS(wp); });
    }
    setupTaskbarAutohideListener() {
        document.addEventListener('taskbar-autohide-changed', (e) => { const { enabled } = e.detail; this.setTaskbarAutohide(enabled); });
    }
    setupTerminalCommandListener() {
        document.addEventListener('run-terminal-command', async (e) => {
            const { command, callbackId, target } = e.detail || {};
            if (!command) return;
            const emitResult = (output) => {
                const detail = { callbackId, output };
                if (target && typeof target.dispatchEvent === 'function') { target.dispatchEvent(new CustomEvent('terminal-command-result', { detail })); }
                else { document.dispatchEvent(new CustomEvent('terminal-command-result', { detail })); }
            };
            try {
                let terminal = null;
                let termWin = null;
                for (const [winId, term] of this.terminalWindows) { terminal = term; termWin = this.windowManager.getWindow(winId); break; }
                let newlyCreated = false;
                if (!terminal) {
                    termWin = this.openTerminalWindow();
                    newlyCreated = true;
                    await new Promise(r => setTimeout(r, 100));
                    for (const [, term] of this.terminalWindows) { terminal = term; break; }
                }
                if (!terminal) {
                    emitResult('无法创建终端');
                    return;
                }
                // 静默执行：不弹出/前置终端窗口；新创建的终端直接最小化隐藏
                if (newlyCreated && termWin && typeof termWin.minimize === 'function') { termWin.minimize(); }
                const outputLines = [];
                const origPrint = terminal.print.bind(terminal);
                terminal.print = (text, cls) => { outputLines.push(text); origPrint(text, cls); };
                terminal.executeCommand(command);
                setTimeout(() => {
                    terminal.print = origPrint;
                    emitResult(outputLines.join('\n'));
                }, 200);
            } catch (err) {
                emitResult('执行出错: ' + err.message);
            }
        });
    }
    setupDesktopClick() {
        this.desktopEl.addEventListener('mousedown', (e) => {
            if (e.target === this.desktopEl || e.target.classList.contains('windows-container')) {
                const windows = this.windowManager.getAllWindows();
                windows.forEach(w => { w.element.classList.remove('window-focused'); });
                this.updateTaskbar();
            }
        });
    }
    loadWallpaper() {
        try {
            const user = this.userManager.getCurrentUser();
            const username = user ? user.username : 'public';
            const path = `/user/${username}/info/wallpaper.json`;
            const data = this.storage.loadJSON(path);
            if (data) { this.applyWallpaper(data); return; }
        } catch (e) {}
        const saved = localStorage.getItem('webos-wallpaper');
        if (saved) { try { const wallpaper = JSON.parse(saved); this.applyWallpaper(wallpaper); } catch (e) { this.applyWallpaper({ type: 'gradient', start: '#0c3547', end: '#14a085', direction: '135deg' }); } }
        else { this.applyWallpaper({ type: 'gradient', start: '#0c3547', end: '#14a085', direction: '135deg' }); }
    }
    saveWallpaperToFS(wp) {
        try { const user = this.userManager.getCurrentUser(); const username = user ? user.username : 'public'; this.storage.saveJSON(`/user/${username}/info/wallpaper.json`, wp); } catch (e) {}
    }
    applyWallpaper(type, value) {
        try {
            const desktop = document.getElementById('desktop');
            if (!desktop) return;
            const video = this.wallpaperVideoEl || document.getElementById('wallpaper-video');
            if (video) { video.pause(); video.classList.remove('active'); video.removeAttribute('src'); video.load(); }
            let wp;
            if (typeof type === 'object' && type !== null) { wp = type; } else { wp = { type, value }; }
            const presets = { default: 'linear-gradient(135deg, #0c3547 0%, #0d7377 50%, #14a085 100%)', ocean: 'linear-gradient(135deg, #0c3547 0%, #0d7377 50%, #14a085 100%)', dark: '#0a0a0a', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', sunset: 'linear-gradient(135deg, #2c1810 0%, #c0392b 50%, #e67e22 100%)', forest: 'linear-gradient(135deg, #0d1f0d 0%, #1e4d2b 50%, #2d7a3e 100%)' };
            if (wp.type === 'solid' || wp.type === 'color') { desktop.style.background = wp.color || wp.value || '#0c3547'; desktop.style.backgroundImage = 'none'; }
            else if (wp.type === 'gradient') {
                if (wp.start && wp.end) { const dir = wp.direction || '135deg'; if (dir === 'circle') { desktop.style.background = `radial-gradient(circle, ${wp.start} 0%, ${wp.end} 100%)`; } else { desktop.style.background = `linear-gradient(${dir}, ${wp.start} 0%, ${wp.end} 100%)`; } }
                else if (wp.value) { desktop.style.background = wp.value; } else { desktop.style.background = presets.ocean; }
            }
            else if (wp.type === 'image') { const data = wp.data || wp.value; if (data) { desktop.style.background = `url(${data}) center/cover fixed`; } else { desktop.style.background = presets.ocean; } }
            else if (wp.type === 'video') { const data = wp.data || wp.value; if (video && data) { desktop.style.background = '#000'; video.src = data; video.classList.add('active'); video.play().catch(() => {}); } else { desktop.style.background = presets.ocean; } }
            else if (presets[wp.type]) { desktop.style.background = presets[wp.type]; }
            else { desktop.style.background = presets.ocean; }
        } catch (e) { console.warn('applyWallpaper failed:', e); }
    }
    async switchUser(username) {
        const currentUser = this.userManager.getCurrentUser();
        const currentUsername = currentUser ? currentUser.username : 'default';
        window._isSavingDisabled = true; this._isLoadingState = true;
        const currentStatePath = `/user/${currentUsername}/info/windows_status.json`;
        this.saveStateToPath(currentStatePath);
        const windows = this.windowManager.getAllWindows();
        windows.forEach(win => { if (this.terminalWindows.has(win.id)) { this.terminalWindows.delete(win.id); } win.close(); });
        this.userManager.setCurrentUser(username); this.updateTaskbarUser(); this.windowManager.zIndexCounter = 1; this.storage.reload(); this.userManager.reload();
        await this.seedSystemDirectories();
        try { await this.applyPersonalization(); } catch (e) { console.warn('apply personalization after user switch failed:', e); }
        this.loadLanguageStrings().then(() => this.refreshAppNames()).catch(() => {});
        await this.loadState(); this.updateTaskbar();
        const desktopIcons = this.desktopEl.querySelector('.desktop-icons');
        if (desktopIcons) { desktopIcons.style.display = ''; }
        document.dispatchEvent(new CustomEvent('user-switched', { detail: { username } }));
        setTimeout(() => { this._isLoadingState = false; window._isSavingDisabled = false; }, 3000);
    }
    saveStateToPath(path) {
        try {
            const windows = this.windowManager.getAllWindows();
            const state = { windows: windows.map(win => { const winState = { id: win.id, title: win.title, windowType: win.windowType || 'default', x: parseInt(win.element.style.left) || 0, y: parseInt(win.element.style.top) || 0, width: parseInt(win.element.style.width) || 600, height: parseInt(win.element.style.height) || 400, isMinimized: win.isMinimized, zIndex: parseInt(win.element.style.zIndex) || 0 }; if (win.windowType === 'terminal' && this.terminalWindows.has(win.id)) { const terminal = this.terminalWindows.get(win.id); winState.currentPath = terminal.fs.getCurrentPath(); } if (win.windowType === 'app') { winState.appPath = win.appPath; winState.appParams = win.appParams; } return winState; }) };
            state.windows.sort((a, b) => a.zIndex - b.zIndex);
            // 公共 StorageService.writeFile 会自动创建父目录、createPath 文件夹结构，替换手写的 split+filter 循环
            this.storage.writeFile(path, JSON.stringify(state));
        } catch (e) { console.warn('Failed to save GUI state:', e); }
    }
    setupUserSwitchListener() {
        document.addEventListener('request-user-switch', (e) => { this.switchUser(e.detail.username); });
        document.addEventListener('user-avatar-changed', () => { this.updateTaskbarUser(); });
    }
    setupTaskbarUser() {
        const taskbarUser = this.desktopEl.querySelector('#taskbar-user');
        if (taskbarUser) { taskbarUser.addEventListener('click', (e) => { e.stopPropagation(); this.lock(); }); }
    }
    updateTaskbarUser() {
        const user = this.userManager.getCurrentUser();
        if (user && this.taskbarUserNameEl) { this.taskbarUserNameEl.textContent = user.username; }
        if (user && this.compactTaskbarNameEl) { this.compactTaskbarNameEl.textContent = user.username; }
        const taskbarUserAvatarEl = this.desktopEl ? this.desktopEl.querySelector('#taskbar-user-avatar') : null;
        if (user && (this.compactTaskbarAvatarEl || taskbarUserAvatarEl)) {
            let avatar = null;
            try { const username = user.username || 'public'; const avatarData = this.storage.loadJSON(`/user/${username}/info/avatar.json`); if (avatarData && avatarData.data) { avatar = avatarData.data; } } catch (e) {}
            if (!avatar) { avatar = localStorage.getItem('webos-user-avatar'); }
            if (!avatar) { avatar = user.avatar || '/apps/icons/user-avatar.svg'; }
            const html = avatar ? `<img src="${avatar}" alt="avatar">` : (user.username || 'U').charAt(0).toUpperCase();
            if (this.compactTaskbarAvatarEl) { this.compactTaskbarAvatarEl.innerHTML = html; }
            if (taskbarUserAvatarEl) { taskbarUserAvatarEl.innerHTML = html; }
        }
    }
    setupCompactTaskbar() {
        if (!this.compactExpandBtn) return;
        this.compactExpandBtn.addEventListener('click', (e) => { e.stopPropagation(); this.expandTaskbarFromCompact(); });
        if (this.compactTaskbarEl) { const compactUser = this.compactTaskbarEl.querySelector('#taskbar-compact-user'); if (compactUser) { compactUser.addEventListener('click', (e) => { e.stopPropagation(); this.lock(); }); } }
    }
    setTaskbarAutohide(enabled) {
        this._taskbarAutohide = enabled;
        if (enabled) { if (this.compactTaskbarEl) this.compactTaskbarEl.style.display = 'flex'; if (this.taskbarEl) { this.taskbarEl.classList.add('autohide-hidden'); this.taskbarEl.classList.remove('autohide-visible'); } }
        else { if (this.compactTaskbarEl) this.compactTaskbarEl.style.display = 'none'; if (this.taskbarEl) { this.taskbarEl.classList.remove('autohide-hidden'); this.taskbarEl.classList.remove('autohide-visible'); } this._clearAutohideTimer(); }
    }
    expandTaskbarFromCompact() {
        if (!this._taskbarAutohide) return;
        if (this.taskbarEl) { this.taskbarEl.classList.remove('autohide-hidden'); this.taskbarEl.classList.add('autohide-visible'); }
        this._setupAutohideMouseLeave(); this._resetAutohideTimer();
    }
    _setupAutohideMouseLeave() {
        if (!this.taskbarEl) return;
        this.taskbarEl.onmouseenter = () => { this._clearAutohideTimer(); };
        this.taskbarEl.onmouseleave = () => { this._resetAutohideTimer(); };
    }
    _resetAutohideTimer() {
        this._clearAutohideTimer();
        this._taskbarAutohideTimer = setTimeout(() => { if (this._taskbarAutohide && this.taskbarEl) { this.taskbarEl.classList.remove('autohide-visible'); this.taskbarEl.classList.add('autohide-hidden'); } }, 1500);
    }
    _clearAutohideTimer() { if (this._taskbarAutohideTimer) { clearTimeout(this._taskbarAutohideTimer); this._taskbarAutohideTimer = null; } }
    setupIframeFocusTracking() {
        // === 1) 统一监听 WindowManager.focusWindow 派发的焦点变化事件 ===
        //     无论什么路径触发 focusWindow（titlebar 拖拽、缩放、winEl mousedown/touchstart、
        //     新建窗口、win.focus 包装器等），此处都会收到事件并刷新任务栏高亮。
        const onFocusChanged = () => { this.updateTaskbar(); };
        document.addEventListener('wm-window-focus-changed', onFocusChanged, true);
        // DOMContentLoaded / 窗口首次渲染后也强制刷新一次，保证启动时类未初始化的场景高亮正确
        setTimeout(() => this.updateTaskbar(), 0);

        // === 2) 修复 iframe 焦点不前置对应窗口的问题 ===
        // 根因：<iframe> 内外是不同 document 上下文，用户点击 iframe 内部时，
        // mousedown / touchstart 事件不会越过 iframe 边界冒泡到父文档，
        // 导致 window-manager.js 和 desktop.js 的 winEl mousedown 监听都不触发，
        // focusWindow() 不被调用 → z-index 不更新 → window-focused 类不切换 → 任务栏高亮错误。
        //
        // 解决：当用户点击/切进 iframe 时，父文档的 document.activeElement 会变成该 iframe 元素。
        // 我们用 activeElement 轮询 + iframe 元素自身 focus 事件 + focusin 全局捕获 多通道捕捉。
        let lastIframeFocused = null;
        const checkActive = () => {
            try {
                const ae = document.activeElement;
                if (ae && ae.tagName === 'IFRAME' && ae !== lastIframeFocused) {
                    const winEl = ae.closest ? ae.closest('.window') : null;
                    if (winEl) {
                        const win = this.windowManager.getAllWindows().find(w => w.element === winEl);
                        if (win && !win.isMinimized && !winEl.classList.contains('window-focused') && typeof win.focus === 'function') {
                            win.focus(); // 走包装器，会调用 originalFocus → focusWindow → 触发事件 → updateTaskbar
                        }
                        lastIframeFocused = ae;
                    }
                } else if (!ae || ae.tagName !== 'IFRAME') {
                    lastIframeFocused = null;
                }
            } catch (e) {}
        };
        // 轮询（300ms 对用户完全无感，但不会像 blur 监听那样漏掉焦点在文档内部移动的场景）
        setInterval(checkActive, 300);
        // 顶层 window blur/focus/任何指针按下：立即检查
        window.addEventListener('blur', () => setTimeout(checkActive, 0));
        window.addEventListener('focus', () => setTimeout(checkActive, 0));
        document.addEventListener('pointerdown', () => setTimeout(checkActive, 0), true);
        document.addEventListener('touchstart', () => setTimeout(checkActive, 0), true);
        document.addEventListener('keydown', () => setTimeout(checkActive, 0), true);
        // 全局 focusin（捕获阶段）：切到 iframe 时在支持的浏览器里能立刻捕捉
        document.addEventListener('focusin', () => setTimeout(checkActive, 0), true);
        document.addEventListener('focusout', () => setTimeout(checkActive, 50), true);
    }
    setupDesktopPanning() {
        const desktop = this.desktopEl;
        if (!desktop) return;
        desktop.addEventListener('wheel', (e) => {
            // 桌布移动优先级：应用内容(iframe/可滚动区域)或系统UI内部让浏览器原生滚动，
            // 其它情况（桌面空白、窗口标题栏/边框、桌面图标）一律用于移动桌布。
            const overIframe = !!e.target.closest('iframe');
            const overSystemUI = e.target.closest('.taskbar') || e.target.closest('.taskbar-compact') || e.target.closest('.user-switcher') || e.target.closest('.desktop-icons');
            // 检查指针是否位于窗口内可滚动元素（如终端 terminal-body）上：是则交给浏览器原生滚动，避免终端无法垂直滚动
            let overScrollable = false;
            let node = e.target;
            while (node && node !== desktop && node !== document.body) {
                if (node.nodeType === 1) {
                    const cs = window.getComputedStyle(node);
                    if (/(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflow)) { overScrollable = true; break; }
                }
                node = node.parentElement || (node.getRootNode && node.getRootNode().host);
            }
            if ((overIframe || overSystemUI || overScrollable) && !e.altKey) return;
            e.preventDefault();
            let dx = e.deltaX; let dy = e.deltaY;
            if (e.shiftKey && dx === 0) { dx = dy; dy = 0; }
            this.viewX -= dx; this.viewY -= dy; this.applyViewTransform();
        }, { passive: false });
        desktop.addEventListener('mousedown', (e) => {
            const overUI = e.target.closest('.window') || e.target.closest('.desktop-icon') ||
                e.target.closest('.taskbar') || e.target.closest('.taskbar-compact') ||
                e.target.closest('.user-switcher') || e.target.closest('.lock-screen');
            if ((overUI && !e.altKey) || e.button !== 0) return;
            this._isPanning = true; this._panStartX = e.clientX; this._panStartY = e.clientY; this._panStartViewX = this.viewX; this._panStartViewY = this.viewY; desktop.classList.add('panning'); e.preventDefault(); e.stopPropagation();
        });
        document.addEventListener('mousedown', (e) => {
            if (!e.altKey || e.button !== 0 || this._isPanning) return;
            this._isPanning = true; this._panStartX = e.clientX; this._panStartY = e.clientY; this._panStartViewX = this.viewX; this._panStartViewY = this.viewY; desktop.classList.add('panning'); e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => { if (!this._isPanning) return; const dx = e.clientX - this._panStartX; const dy = e.clientY - this._panStartY; this.viewX = this._panStartViewX + dx; this.viewY = this._panStartViewY + dy; this.applyViewTransform(); });
        document.addEventListener('mouseup', () => { if (this._isPanning) { this._isPanning = false; desktop.classList.remove('panning'); } });
    }
    applyViewTransform() { if (this.windowsContainerEl) { this.windowsContainerEl.style.transform = `translate(${this.viewX}px, ${this.viewY}px)`; } }
    centerWindowInView(win) {
        if (!win || !win.element) return;
        const winLeft = parseInt(win.element.style.left) || 0; const winTop = parseInt(win.element.style.top) || 0; const winWidth = parseInt(win.element.style.width) || 600; const winHeight = parseInt(win.element.style.height) || 400;
        const viewCenterX = (window.innerWidth - 110) / 2; const viewCenterY = (window.innerHeight - 48) / 2;
        const winCenterX = winLeft + winWidth / 2; const winCenterY = winTop + winHeight / 2;
        this.viewX = viewCenterX - winCenterX; this.viewY = viewCenterY - winCenterY; this.applyViewTransform();
    }
    lock() { this.lockScreen.show(); }
    setupAppLaunchListeners() {
        document.addEventListener('app-launch-real', (e) => { const path = e.detail.path; const app = { path: path, name: path.replace('.app', '') }; this.openAppByPath(app); });
        document.addEventListener('open-file-in-editor', (e) => { const filePath = e.detail.path; this.openAppByPath({ path: 'texteditor.app', name: this.getAppLabelForPath('texteditor.app', '文本编辑器'), params: { path: filePath } }); });
        document.addEventListener('open-image-viewer', (e) => { const filePath = e.detail.path; this.openAppByPath({ path: 'mediaviewer.app', name: this.getAppLabelForPath('mediaviewer.app', '媒体查看器'), params: { path: filePath } }); });
        document.addEventListener('open-media-player', (e) => { const filePath = e.detail.path; this.openAppByPath({ path: 'mediaviewer.app', name: this.getAppLabelForPath('mediaviewer.app', '媒体查看器'), params: { path: filePath } }); });
    }
    async scanApps() {
        try { const res = await fetch('/apps/manifest.json'); if (!res.ok) return; this.apps = await res.json(); this._systemAppPaths = new Set(this.apps.map(a => a.path)); } catch (e) { console.warn('扫描应用失败:', e); this.apps = []; }
    }
    setupDesktopIcons() {
        const desktopIcons = this.desktopEl.querySelector('.desktop-icons');
        const terminalIcon = this.desktopEl.querySelector('#terminal-icon');
        if (terminalIcon) { const label = terminalIcon.querySelector('.icon-label'); if (label) label.textContent = this.t('app.terminal', '终端'); terminalIcon.addEventListener('click', () => { this.openTerminalWindow(); }); }
        const calculatorIcon = this.desktopEl.querySelector('#calculator-icon');
        if (calculatorIcon) { const label = calculatorIcon.querySelector('.icon-label'); if (label) label.textContent = this.getAppLabelForPath('calculator.app', '计算器'); calculatorIcon.dataset.manualBound = '1'; calculatorIcon.addEventListener('click', () => { this.openAppByPath({ path: 'calculator.app', name: this.getAppLabelForPath('calculator.app', '计算器') }); }); }
        const filemanagerIcon = this.desktopEl.querySelector('#filemanager-icon');
        if (filemanagerIcon) { const label = filemanagerIcon.querySelector('.icon-label'); if (label) label.textContent = this.getAppLabelForPath('filemanager.app', '文件管理器'); filemanagerIcon.dataset.manualBound = '1'; filemanagerIcon.addEventListener('click', () => { this.openAppByPath({ path: 'filemanager.app', name: this.getAppLabelForPath('filemanager.app', '文件管理器') }); }); }
        this.apps.forEach(app => {
            let iconEl = desktopIcons.querySelector(`[data-app="${app.id}"]`);
            if (!iconEl) { iconEl = document.createElement('div'); iconEl.className = 'desktop-icon'; iconEl.setAttribute('data-app', app.id); const displayName = this.getAppDisplayName(app, app.name); iconEl.innerHTML = `<div class="icon-image"><img src="/apps/${app.path}/icon.svg" alt="${displayName}" style="width:28px;height:28px;"></div><div class="icon-label">${displayName}</div>`; desktopIcons.appendChild(iconEl); }
            if (!iconEl.dataset.manualBound) { iconEl.addEventListener('click', () => { this.openAppByPath({ ...app, name: this.getAppDisplayName(app, app.name) }); }); }
        });
    }
    openTerminalWindow(options = {}) {
        const template = document.getElementById('terminal-template');
        const clone = template.content.cloneNode(true);
        const terminalContainer = document.createElement('div');
        // 注意：flex:1 + height:0 是嵌套 flex 中"让高度由外层决定"的标准组合。
        // 缺 height:0 时子元素的 height:100% 无法解析为具体数值，会造成 .terminal 不溢出。
        terminalContainer.style.cssText = 'flex:1;height:0;min-height:0;display:flex;flex-direction:column;width:100%;overflow:hidden;';
        terminalContainer.appendChild(clone);
        const isMobile = this.isMobile();
        const win = this.windowManager.createWindow({ title: this.t('app.terminal', '终端'), icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23ecf0f1" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>', content: terminalContainer, width: isMobile ? window.innerWidth : (options.width || 600), height: isMobile ? (window.innerHeight - 56) : (options.height || 400), x: isMobile ? 0 : options.x, y: isMobile ? 0 : options.y, windowType: 'terminal', onMoveEnd: () => { this.saveState(); } });
        win.appName = this.t('app.terminal', '终端');
        win.appIcon = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23ecf0f1" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
        if (isMobile) { win.isMaximized = true; }
        const terminalEl = terminalContainer.querySelector('.terminal');
        const terminal = new this.terminalClass({ container: terminalEl, onTitleChange: (fullTitle) => { const path = fullTitle.split(':')[1] || fullTitle; const cleanPath = path.replace(/^\/+/, '/'); const shortTitle = this.t('app.terminal', '终端') + ' - ' + cleanPath; win.setTitle(shortTitle); this.updateTaskbar(); this.saveState(); } });
        if (options.initialPath) { terminal.setPath(options.initialPath); }
        this.terminalWindows.set(win.id, terminal);
        const originalClose = win.close; win.close = () => { originalClose.call(win); this.terminalWindows.delete(win.id); this.updateTaskbar(); this.saveState(); };
        const originalMinimize = win.minimize; win.minimize = () => { originalMinimize.call(win); this.updateTaskbar(); this.saveState(); };
        const originalRestore = win.restore; win.restore = () => { originalRestore.call(win); this.updateTaskbar(); this.saveState(); };
        const originalFocus = win.focus; win.focus = () => { originalFocus.call(win); this.updateTaskbar(); this.saveState(); };
        win.element.addEventListener('mousedown', () => { this.updateTaskbar(); });
        this.updateTaskbar(); this.saveState(); return win;
    }
    getAppFromVFS(appPath) {
        const fs = this.storage.fs; if (!fs.children) return null;
        const appDir = fs.children.find(c => c.name === 'application' && c.type === 'folder'); if (!appDir || !appDir.children) return null;
        const appFolder = appDir.children.find(c => c.name === appPath && c.type === 'folder'); if (!appFolder || !appFolder.children) return null;
        const mainFolder = appFolder.children.find(c => c.name === 'main' && c.type === 'folder'); if (!mainFolder || !mainFolder.children) return null;
        const indexFile = mainFolder.children.find(c => c.name === 'index.html' && c.type === 'file'); if (!indexFile) return null;
        const files = {}; mainFolder.children.forEach(f => { if (f.type === 'file') files[f.name] = f.content; });
        const infoFile = appFolder.children.find(c => c.name === 'info.json' && c.type === 'file');
        const iconFile = appFolder.children.find(c => c.name === 'icon.svg' && c.type === 'file');
        return { files: files, info: infoFile ? infoFile.content : null, icon: iconFile ? iconFile.content : null };
    }
    generateAppHtml(vfsApp, params = null) {
        if (!vfsApp || !vfsApp.files) return null;
        let html = vfsApp.files['index.html'] || '<html><body><h1>App load failed</h1></body></html>';
        if (params && Object.keys(params).length > 0) { const paramsJson = JSON.stringify(params); const injectScript = `<script>window.__APP_PARAMS__=${paramsJson};try{Object.defineProperty(window.location,'search',{get:function(){return '?'+new URLSearchParams(window.__APP_PARAMS__).toString();}});}catch(e){}</script>`; if (html.includes('<head>')) { html = html.replace('<head>', '<head>' + injectScript); } else if (html.includes('<body>')) { html = html.replace('<body>', injectScript + '<body>'); } else { html = injectScript + html; } }
        html = html.replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (match, href) => { const fileName = href.split('/').pop(); if (vfsApp.files[fileName]) { return `<style>${vfsApp.files[fileName]}</style>`; } return match; });
        html = html.replace(/<script[^>]*src=["']([^"']+\.js)["'][^>]*><\/script>/gi, (match, src) => { const fileName = src.split('/').pop(); if (vfsApp.files[fileName]) { return `<script>${vfsApp.files[fileName]}</script>`; } return match; });
        html = html.replace(/<img[^>]*src=["']([^"']+\.svg)["'][^>]*>/gi, (match, src) => { const fileName = src.split('/').pop(); if (vfsApp.files[fileName]) { const svgContent = vfsApp.files[fileName]; return match.replace(src, `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`); } return match; });
        return html;
    }
    async installAppFromFile(file) {
        if (!window.JSZip) { return { success: false, error: 'JSZip 未加载' }; }
        try {
            const arrayBuffer = await file.arrayBuffer(); const zip = await window.JSZip.loadAsync(arrayBuffer);
            const requiredFiles = ['main/index.html', 'info.json', 'icon.svg'];
            const missing = requiredFiles.filter(f => !zip.files[f]);
            if (missing.length > 0) { return { success: false, error: `缺少必需文件: ${missing.join(', ')}` }; }
            const infoText = await zip.file('info.json').async('text');
            let info; try { info = JSON.parse(infoText); } catch (e) { return { success: false, error: 'info.json 格式无效' }; }
            const appPath = info.id ? `${info.id}.app` : file.name.replace(/\.app$/i, '.app').replace(/\.zip$/i, '.app');
            const appName = info.name || appPath.replace('.app', '');
            const mainFiles = {};
            for (const [filePath, zipFile] of Object.entries(zip.files)) { if (filePath.startsWith('main/') && !zipFile.dir) { const relativePath = filePath.substring('main/'.length); mainFiles[relativePath] = await zipFile.async('text'); } }
            const iconContent = await zip.file('icon.svg').async('text');
            const fs = this.storage.fs; if (!fs.children) fs.children = [];
            let appDir = fs.children.find(c => c.name === 'application' && c.type === 'folder');
            if (!appDir) { appDir = { type: 'folder', name: 'application', children: [] }; fs.children.push(appDir); }
            if (!appDir.children) appDir.children = [];
            appDir.children = appDir.children.filter(c => c.name !== appPath);
            const mainChildren = [];
            for (const [name, content] of Object.entries(mainFiles)) { mainChildren.push({ type: 'file', name, content }); }
            const appFolder = { type: 'folder', name: appPath, children: [{ type: 'folder', name: 'main', children: mainChildren }, { type: 'file', name: 'info.json', content: infoText }, { type: 'file', name: 'icon.svg', content: iconContent }] };
            appDir.children.push(appFolder); this.storage.saveFS();
            if (!this.apps.find(a => a.path === appPath)) { this.apps.push({ id: info.id || appPath.replace('.app', ''), name: appName, path: appPath, description: info.description || '', category: info.category || 'productivity', version: info.version || '1.0.0' }); }
            this.setupDesktopIcons();
            return { success: true, appPath, appName };
        } catch (e) { return { success: false, error: `安装失败: ${e.message}` }; }
    }
    openAppById(appId) { const app = this.apps.find(a => a.id === appId || a.path === `${appId}.app`); if (app) { this.openAppByPath(app); } }
    async openAppByPath(app) {
        const vfsApp = this.getAppFromVFS(app.path);
        let info = { width: 380, height: 580 }; let iconUrl = `/apps/${app.path}/icon.svg`;
        if (vfsApp && vfsApp.info) { try { info = JSON.parse(vfsApp.info); } catch (e) {} }
        else { try { const infoRes = await fetch(`/apps/${app.path}/info.json`); if (infoRes.ok) info = await infoRes.json(); } catch (e) {} }
        if (vfsApp && vfsApp.icon) { iconUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(vfsApp.icon)))}`; }
        const contentContainer = document.createElement('div'); contentContainer.style.width = '100%'; contentContainer.style.height = '100%'; contentContainer.style.overflow = 'hidden';
        const iframe = document.createElement('iframe'); iframe.style.width = '100%'; iframe.style.height = '100%'; iframe.style.border = 'none'; iframe.style.display = 'block';
        if (vfsApp) { const appHtml = this.generateAppHtml(vfsApp, app.params || null); if (appHtml) { iframe.srcdoc = appHtml; } else { iframe.src = `/apps/${app.path}/main/index.html`; } }
        else { let src = `/apps/${app.path}/main/index.html`; if (app.params) { const params = new URLSearchParams(app.params); src += '?' + params.toString(); } iframe.src = src; }
        contentContainer.appendChild(iframe);
        const isMobile = this.isMobile();
        const displayName = this.getAppDisplayName(app, app.name);
        const win = this.windowManager.createWindow({ title: displayName, icon: iconUrl, content: contentContainer, width: isMobile ? window.innerWidth : (app.width || info.width || 380), height: isMobile ? (window.innerHeight - 56) : (app.height || info.height || 580), x: isMobile ? 0 : app.x, y: isMobile ? 0 : app.y, windowType: 'app', onMoveEnd: () => { this.saveState(); } });
        win.appName = displayName; win.appIcon = iconUrl; win.appPath = app.path; win.appParams = app.params; win._appObj = app;
        // ========== iframe 焦点捕获（注意：必须在 const win 之后，避免 TDZ） ==========
        // 进入 iframe 内部点击时 mousedown 等事件不会越界冒泡，必须在 iframe 层主动拦截：
        // ① iframe 元素自身 focus/load 事件  ② 同源则穿透挂 idoc 的 pointerdown/focusin
        // ③ 仍然保留 setupIframeFocusTracking 的 activeElement 轮询作为跨域兜底
        const focusIframeOwner = () => {
            if (!win || win.isMinimized) return;
            if (!win.element.classList.contains('window-focused')) { try { win.focus(); } catch(e){} }
            else { this.updateTaskbar(); }
        };
        iframe.addEventListener('focus', focusIframeOwner, true);
        iframe.addEventListener('load', () => {
            try {
                try {
                    const iwin = iframe.contentWindow;
                    const idoc = iframe.contentDocument || (iwin && iwin.document);
                    if (idoc && idoc.addEventListener) {
                        idoc.addEventListener('pointerdown', focusIframeOwner, true);
                        idoc.addEventListener('mousedown', focusIframeOwner, true);
                        idoc.addEventListener('focusin', focusIframeOwner, true);
                    }
                } catch (_) { /* 跨域 iframe：交由 activeElement 轮询兜底（setupIframeFocusTracking） */ }
                this.applyThemeToIframe(iframe, this.buildThemeDetail());
                focusIframeOwner();
            } catch (e) {}
        });
        const originalClose = win.close; win.close = () => { originalClose.call(win); this.updateTaskbar(); this.saveState(); };
        const originalMinimize = win.minimize; win.minimize = () => { originalMinimize.call(win); this.updateTaskbar(); this.saveState(); };
        const originalRestore = win.restore; win.restore = () => { originalRestore.call(win); this.updateTaskbar(); this.saveState(); };
        const originalFocus = win.focus; win.focus = () => { originalFocus.call(win); this.updateTaskbar(); this.saveState(); };
        win.element.addEventListener('mousedown', () => { this.updateTaskbar(); });
        this.updateTaskbar(); this.saveState(); return win;
    }
    updateTaskbar() {
        if (!this.taskbarItemsEl) return;
        const windows = this.windowManager.getAllWindows(); this.taskbarItemsEl.innerHTML = '';
        const topWindow = this._getTopWindow();
        windows.forEach(win => {
            const item = document.createElement('div'); item.className = 'taskbar-item';
            const iconEl = document.createElement('img'); iconEl.className = 'taskbar-icon'; iconEl.src = win.appIcon || ''; iconEl.alt = win.appName || win.title || '窗口'; iconEl.style.width = '20px'; iconEl.style.height = '20px';
            item.appendChild(iconEl);
            if (topWindow && win.id === topWindow.id && !win.isMinimized) { item.classList.add('active'); }
            item.addEventListener('click', () => { if (win.isMinimized) { win.restore(); this.centerWindowInView(win); } else if (topWindow && win.id === topWindow.id) { win.minimize(); } else { win.focus(); this.centerWindowInView(win); } });
            this.taskbarItemsEl.appendChild(item);
        });
    }
    _getTopWindow() {
        const windows = this.windowManager.getAllWindows(); if (windows.length === 0) return null;
        // 优先以 window-focused 类为准（focusWindow 每次都会切换此类，表示真正的当前焦点）
        let focused = null;
        for (const w of windows) {
            if (!w.isMinimized && w.element.classList.contains('window-focused')) { focused = w; break; }
        }
        if (focused) return focused;
        // 兜底：z-index 最大（兼容首次加载 state、或某些路径没设置类的情况）
        let topWin = null; let maxZIndex = -1;
        windows.forEach(win => { if (win.isMinimized) return; const zIndex = parseInt(win.element.style.zIndex) || 0; if (zIndex > maxZIndex) { maxZIndex = zIndex; topWin = win; } });
        return topWin;
    }
    saveState() {
        if (window._isSavingDisabled) { return; } if (this._isLoadingState) { return; }
        try {
            const windows = this.windowManager.getAllWindows();
            const state = { windows: windows.map(win => { const winState = { id: win.id, title: win.title, windowType: win.windowType || 'default', x: parseInt(win.element.style.left) || 0, y: parseInt(win.element.style.top) || 0, width: parseInt(win.element.style.width) || 600, height: parseInt(win.element.style.height) || 400, isMinimized: win.isMinimized, zIndex: parseInt(win.element.style.zIndex) || 0 }; if (win.windowType === 'terminal' && this.terminalWindows.has(win.id)) { const terminal = this.terminalWindows.get(win.id); winState.currentPath = terminal.fs.getCurrentPath(); } if (win.windowType === 'app') { winState.appPath = win.appPath; winState.appParams = win.appParams; } return winState; }) };
            state.windows.sort((a, b) => a.zIndex - b.zIndex);
            this.storage.writeFile(this.getStateFilePath(), JSON.stringify(state));
        } catch (e) { console.warn('Failed to save GUI state:', e); }
    }
    async loadState() {
        try {
            this.storage.reload(); const data = this.storage.loadJSON(this.getStateFilePath()); if (!data) return;
            const state = data; if (!state.windows || !Array.isArray(state.windows)) return;
            this._isLoadingState = true;
            for (const winState of state.windows) {
                if (winState.windowType === 'terminal') { this.openTerminalWindow({ x: winState.x, y: winState.y, width: winState.width, height: winState.height, initialPath: winState.currentPath }); }
                else if (winState.windowType === 'app' && winState.appPath) { await this.openAppByPath({ path: winState.appPath, name: winState.title, params: winState.appParams, x: winState.x, y: winState.y, width: winState.width, height: winState.height }); }
            }
            const restoredWindows = this.windowManager.getAllWindows();
            state.windows.forEach((winState, index) => { const restoredWin = restoredWindows[index]; if (restoredWin) { restoredWin.element.style.left = winState.x + 'px'; restoredWin.element.style.top = winState.y + 'px'; restoredWin.element.style.width = winState.width + 'px'; restoredWin.element.style.height = winState.height + 'px'; restoredWin.element.style.zIndex = winState.zIndex; if (winState.isMinimized) { restoredWin.isMinimized = true; restoredWin.element.style.display = 'none'; } } });
            this.updateTaskbar(); const maxZIndex = state.windows.reduce((max, w) => Math.max(max, w.zIndex), 0); this.windowManager.zIndexCounter = maxZIndex + 1;
        } catch (e) { console.warn('Failed to load GUI state:', e); }
    }
    startClock() { this._updateClock(); this.clockInterval = setInterval(() => { this._updateClock(); }, 1000); }
    _updateClock() {
        if (!this.taskbarClockEl) return;
        const now = new Date(); const hours = String(now.getHours()).padStart(2, '0'); const minutes = String(now.getMinutes()).padStart(2, '0'); const seconds = String(now.getSeconds()).padStart(2, '0');
        this.taskbarClockEl.textContent = `${hours}:${minutes}:${seconds}`;
    }
}
export default DesktopManager;