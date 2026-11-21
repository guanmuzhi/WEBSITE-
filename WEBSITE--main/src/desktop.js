import UserManager from './user-manager.js?v=54';
import LockScreen from './lock-screen.js?v=54';
import StorageService from './storage.js?v=54';
import { Path } from './lib/index.js?v=54';

/**
 * 把「相对于本文件（src/desktop.js）」的路径解析成绝对 URL。
 * 原因：import 按模块位置解析，而 fetch()/img.src 按「文档 base」解析；
 * 本模块运行在根目录的 index.html 下，两套基准不一致，裸相对路径在子路径部署时会错位。
 */
const assetUrl = (rel) => new URL(rel, import.meta.url).href;

/* 任务栏项的兜底图标：个别窗口（对话框、vi 等）没有 appIcon/icon，
   旧实现给 img.src 传空串会显示破图，看起来就像"图标和窗口对不上"。 */
const DEFAULT_WINDOW_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ecf0f1" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>'
);

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
        // 每桌面独立的 surface（独立窗口容器 + 独立任务栏）
        this.surfacesContainerEl = null;
        this.surfaces = [];
        this.activeSurface = null;
        // 桌面总览（缩略图切换 + 退出登录）
        this.overviewEl = null;
        this._overviewOpen = false;
        // 多桌面 / 工作区（虚拟桌面）状态
        this.activeWorkspace = 0;
        this.workspaceCount = 2;
        this.workspacePagerEl = null;
        // 「显示桌面」开关：记录被隐藏（最小化）的窗口 id，便于再次按下时恢复
        this._desktopHidden = false;
        this._desktopHiddenIds = [];
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
            // 文字/图标的对比色：根据任务栏颜色的亮度自动选黑或白
            const [r, g, b] = rgb.split(',').map(n => Number(n.trim()));
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            root.style.setProperty('--taskbar-fg', lum > 0.6 ? '#000000' : '#ffffff');
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
        // 明暗主题
        if (pers.theme) {
            localStorage.setItem('webos-theme', pers.theme);
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
        const tbColor = pers.taskbarColor || localStorage.getItem('webos-taskbar-color') || this.getCurrentAccent();
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
        const apply = (doc) => {
            try {
                doc.documentElement.style.setProperty('--accent-color', detail.color);
                doc.documentElement.style.setProperty('--accent-hover', detail.hover);
                if (this._themeMode) doc.documentElement.setAttribute('data-theme', this._themeMode);
            } catch (e) {}
        };
        try {
            const doc = iframe.contentDocument;
            if (!doc || !doc.documentElement) {
                iframe.addEventListener('load', () => this.applyThemeToIframe(iframe, detail), { once: true });
                return;
            }
            apply(doc);
        } catch (e) {}
    }
    applyThemeColor(color) {
        const detail = this.buildThemeDetail(color);
        const root = document.documentElement;
        root.style.setProperty('--accent-color', detail.color);
        root.style.setProperty('--accent-hover', detail.hover);
        if (this._themeMode) root.setAttribute('data-theme', this._themeMode);
        this.windowManager.getAllWindows().forEach(win => {
            const iframe = win.element && win.element.querySelector('iframe');
            this.applyThemeToIframe(iframe, detail);
        });
        return detail;
    }
    resolveThemeMode() {
        const pref = (localStorage.getItem('webos-theme') || 'dark').trim();
        if (pref === 'light' || pref === 'dark') return pref;
        try {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        } catch (e) { return 'dark'; }
    }
    getAllWindowIframes() {
        if (!this.windowManager) return [];
        const arr = [];
        this.windowManager.getAllWindows().forEach(win => {
            const iframe = win.element && win.element.querySelector('iframe');
            if (iframe) arr.push(iframe);
        });
        return arr;
    }
    applyTheme(themePref) {
        if (themePref) localStorage.setItem('webos-theme', themePref);
        const mode = this.resolveThemeMode();
        this._themeMode = mode;
        document.documentElement.setAttribute('data-theme', mode);
        // 系统模式跟随操作系统切换
        try {
            if (!this._themeMedia) {
                this._themeMedia = window.matchMedia('(prefers-color-scheme: light)');
                this._themeMedia.addEventListener('change', () => {
                    if ((localStorage.getItem('webos-theme') || 'dark') === 'system') this.applyTheme('system');
                });
            }
        } catch (e) {}
        // 已打开的窗口（iframe 文档）同步主题
        this.getAllWindowIframes().forEach(iframe => {
            try { if (iframe.contentDocument && iframe.contentDocument.documentElement) iframe.contentDocument.documentElement.setAttribute('data-theme', mode); } catch (e) {}
        });
    }
    setupThemeListener() {
        this.applyThemeColor(this.getCurrentAccent());
        this.applyTheme();
        document.addEventListener('accent-color-changed', (e) => {
            this.applyThemeColor(e.detail && e.detail.color);
            // 用户未显式设置任务栏颜色时，任务栏跟随强调色一起变
            if (!localStorage.getItem('webos-taskbar-color')) {
                const o = localStorage.getItem('webos-taskbar-opacity') || '70';
                this.applyTaskbarColor(this.getCurrentAccent(), o);
            }
        });
        document.addEventListener('theme-changed', (e) => {
            this.applyTheme(e && e.detail && e.detail.theme);
        });
    }
    getStateFilePath() {
        const user = this.userManager.getCurrentUser();
        const username = user ? user.username : 'default';
        return `/user/${username}/info/windows_status.json`;
    }
    async init() {
        // 每桌面的任务栏 / 窗口容器在 buildDesktopSurfaces() 中按工作区动态创建，
        // 这里只建立「共享」引用（紧凑任务栏 + 壁纸视频）。per-surface 的元素引用
        // 由 buildDesktopSurfaces()/setActiveSurface() 注入到 this.taskbarItemsEl 等字段。
        this.surfacesContainerEl = this.desktopEl.querySelector('#desktop-surfaces');
        this.compactTaskbarEl = this.desktopEl.querySelector('#taskbar-compact');
        this.compactTaskbarNameEl = this.desktopEl.querySelector('#taskbar-compact-name');
        this.compactTaskbarAvatarEl = this.desktopEl.querySelector('#taskbar-compact-avatar');
        this.compactExpandBtn = this.desktopEl.querySelector('#taskbar-compact-expand');
        this.wallpaperVideoEl = this.desktopEl.querySelector('#wallpaper-video');
        this.taskbarItemsEl = null;
        this.taskbarClockEl = null;
        this.taskbarUserNameEl = null;
        this.taskbarEl = null;
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
        // 任务栏用户按钮已在 buildSurface() 中绑定到「桌面总览」，无需在此单独绑定
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
        // 必须 await：loadState 内部逐个 await openAppByPath() 恢复窗口（含 fetch info.json）。
        // 旧写法不等待就继续往下建任务栏、置 _initDone，导致恢复出来的窗口
        // 与"当前工作区"判定竞态 → 应用看起来没加载 / 要切一遍桌面才出现。
        await this.loadState();
        this.buildWorkspaceTaskbars();
        this.updateTaskbar();
        this.updateTaskbarUser();
        this.setupAppLaunchListeners();
        this.setupUserSwitchListener();
        this.setupWallpaper();
        this.setupTaskbarAutohideListener();
        this.setupTaskbarThemeListener();
        this.setupThemeListener();
        this.setupWorkspaceShortcuts();
        this.setupOverviewKey();
        this.setupTerminalCommandListener();
        this.setupAppsChangedListener();
        this.setupPersonalizationListener();
        this.setupIframeFocusTracking();
        this.setupDesktopClick();
        window.openApp = this.openAppById.bind(this);
        window.installAppFromFile = this.installAppFromFile.bind(this);
        window.getInstalledApps = () => this.apps.filter(a => !this._systemAppPaths.has(a.path));
        this._initDone = true; // init 异步体执行完毕（loadState 已完成窗口恢复）
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
        const langFiles = { cmn: assetUrl('../languages/cmn.json'), eng: assetUrl('../languages/eng.json'), jpn: assetUrl('../languages/jpn.json') };
        const data = await this.fetchLangJson(langFiles[lang] || langFiles.cmn, `webos-lang-root:${lang}`);
        this.langStrings = (data && data.strings) || {};
    }
    async loadAppLanguages(lang) {
        lang = lang || this.getLangCode();
        const map = {};
        if (this.apps && this.apps.length) {
            await Promise.all(this.apps.map(async (app) => {
                const id = app.path.replace('.app', '');
                const url = assetUrl(`../apps/${encodeURI(app.path)}/main/language/${encodeURI(id)}_${lang}.json`);
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
                    try { const infoRes = await fetch(assetUrl(`../apps/${encodeURI(app.path)}/info.json`)); if (infoRes.ok) { const infoContent = await infoRes.text(); appFolder.children.push({ type: 'file', name: 'info.json', content: infoContent }); } else { appFolder.children.push({ type: 'file', name: 'info.json', content: JSON.stringify(app, null, 2) }); } } catch (e) { appFolder.children.push({ type: 'file', name: 'info.json', content: JSON.stringify(app, null, 2) }); }
                    try { const iconRes = await fetch(assetUrl(`../apps/${encodeURI(app.path)}/icon.svg`)); if (iconRes.ok) { const iconContent = await iconRes.text(); appFolder.children.push({ type: 'file', name: 'icon.svg', content: iconContent }); } } catch (e) {}
                    const mainFiles = ['index.html', 'style.css', 'app.js'];
                    const mainFolder = appFolder.children.find(c => c.name === 'main');
                    for (const mf of mainFiles) { try { const res = await fetch(assetUrl(`../apps/${encodeURI(app.path)}/main/${mf}`)); if (res.ok) { const content = await res.text(); mainFolder.children.push({ type: 'file', name: mf, content }); } } catch (e) {} }
                    appDir.children.push(appFolder);
                }
            }
            let langDir = fs.children.find(c => c.name === 'languages' && c.type === 'folder');
            if (!langDir) { langDir = { type: 'folder', name: 'languages', children: [] }; fs.children.push(langDir); }
            if (!langDir.children) langDir.children = [];
            // 每次启动都尝试用磁盘最新文件刷新 /languages/*.json（保证文件管理器可见且内容最新；小文件开销可忽略）
            const langFiles = [{ file: 'cmn.json', path: assetUrl('../languages/cmn.json') }, { file: 'eng.json', path: assetUrl('../languages/eng.json') }, { file: 'jpn.json', path: assetUrl('../languages/jpn.json') }];
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
    setupTaskbarThemeListener() {
        document.addEventListener('taskbar-theme-changed', (e) => {
            const { color, opacity } = (e.detail || {});
            this.applyTaskbarColor(color, opacity);
        });
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
            const state = { currentWorkspace: this.activeWorkspace, workspaceCount: this.workspaceCount, windows: windows.map(win => { const winState = { id: win.id, title: win.title, windowType: win.windowType || 'default', x: parseInt(win.element.style.left) || 0, y: parseInt(win.element.style.top) || 0, width: parseInt(win.element.style.width) || 600, height: parseInt(win.element.style.height) || 400, isMinimized: win.isMinimized, zIndex: parseInt(win.element.style.zIndex) || 0, workspace: win.workspaceId != null ? win.workspaceId : 0 }; if (win.windowType === 'terminal' && this.terminalWindows.has(win.id)) { const terminal = this.terminalWindows.get(win.id); winState.currentPath = terminal.fs.getCurrentPath(); } if (win.windowType === 'app') { winState.appPath = win.appPath; winState.appParams = win.appParams; } return winState; }) };
            state.windows.sort((a, b) => a.zIndex - b.zIndex);
            // 公共 StorageService.writeFile 会自动创建父目录、createPath 文件夹结构，替换手写的 split+filter 循环
            this.storage.writeFile(path, JSON.stringify(state));
        } catch (e) { console.warn('Failed to save GUI state:', e); }
    }
    setupUserSwitchListener() {
        document.addEventListener('request-user-switch', (e) => { this.switchUser(e.detail.username); });
        document.addEventListener('user-avatar-changed', () => { this.updateTaskbarUser(); });
    }
    updateTaskbarUser() {
        const user = this.userManager.getCurrentUser();
        if (!user) return;
        if (this.compactTaskbarNameEl) { this.compactTaskbarNameEl.textContent = user.username; }
        this.surfaces.forEach(s => { if (s.userNameEl) s.userNameEl.textContent = user.username; });
        let avatar = null;
        try { const username = user.username || 'public'; const avatarData = this.storage.loadJSON(`/user/${username}/info/avatar.json`); if (avatarData && avatarData.data) { avatar = avatarData.data; } } catch (e) {}
        // 不回退到全局 localStorage('webos-user-avatar')：那是跨用户的，会导致切换用户后
        // 任务栏显示上一个用户的头像（多用户隔离缺陷）。当前用户头像以 VFS avatar.json 为准，
        // 缺失时回退到本用户自身的 user.avatar，最后兜底默认 SVG。
        if (!avatar) { avatar = user.avatar || assetUrl('../apps/icons/user-avatar.svg'); }
        const html = `<img src="${avatar}" alt="avatar">`;
        if (this.compactTaskbarAvatarEl) { this.compactTaskbarAvatarEl.innerHTML = html; }
        this.surfaces.forEach(s => { if (s.userAvatarEl) s.userAvatarEl.innerHTML = html; });
    }
    setupCompactTaskbar() {
        if (!this.compactExpandBtn) return;
        this.compactExpandBtn.addEventListener('click', (e) => { e.stopPropagation(); this.expandTaskbarFromCompact(); });
        if (this.compactTaskbarEl) {
            const compactUser = this.compactTaskbarEl.querySelector('#taskbar-compact-user');
            if (compactUser) {
                compactUser.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this._overviewOpen) { this.closeOverview(); this.lock(); }
                    else this.openOverview();
                });
            }
        }
    }
    setTaskbarAutohide(enabled) {
        this._taskbarAutohide = enabled;
        if (enabled) {
            if (this.compactTaskbarEl) this.compactTaskbarEl.style.display = 'flex';
            this.surfaces.forEach(s => { s.taskbarEl.classList.add('autohide-hidden'); s.taskbarEl.classList.remove('autohide-visible'); });
        } else {
            if (this.compactTaskbarEl) this.compactTaskbarEl.style.display = 'none';
            this.surfaces.forEach(s => { s.taskbarEl.classList.remove('autohide-hidden'); s.taskbarEl.classList.remove('autohide-visible'); });
            this._clearAutohideTimer();
        }
    }
    expandTaskbarFromCompact() {
        if (!this._taskbarAutohide) return;
        const tb = this._getActiveTaskbarEl();
        if (tb) { tb.classList.remove('autohide-hidden'); tb.classList.add('autohide-visible'); }
        this._setupAutohideMouseLeave(); this._resetAutohideTimer();
    }
    _setupAutohideMouseLeave() {
        const tb = this._getActiveTaskbarEl();
        if (!tb) return;
        tb.onmouseenter = () => { this._clearAutohideTimer(); };
        tb.onmouseleave = () => { this._resetAutohideTimer(); };
    }
    _resetAutohideTimer() {
        this._clearAutohideTimer();
        this._taskbarAutohideTimer = setTimeout(() => { if (this._taskbarAutohide) { const tb = this._getActiveTaskbarEl(); if (tb) { tb.classList.remove('autohide-visible'); tb.classList.add('autohide-hidden'); } } }, 1500);
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
            const overSystemUI = e.target.closest('.taskbar') || e.target.closest('.taskbar-compact') || e.target.closest('.desktop-icons');
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
                e.target.closest('.lock-screen');
            if ((overUI && !e.altKey) || e.button !== 0) return;
            this._isPanning = true; this._panStartX = e.clientX; this._panStartY = e.clientY; this._panStartViewX = this.viewX; this._panStartViewY = this.viewY; desktop.classList.add('panning'); e.preventDefault(); e.stopPropagation();
        });
        document.addEventListener('mousedown', (e) => {
            if (!e.altKey || e.button !== 0 || this._isPanning) return;
            this._isPanning = true; this._panStartX = e.clientX; this._panStartY = e.clientY; this._panStartViewX = this.viewX; this._panStartViewY = this.viewY; desktop.classList.add('panning');
            // 拖拽平移应立即取消「居中过渡」，避免跟手延迟
            if (this.windowsContainerEl) { this.windowsContainerEl.classList.remove('view-animating'); clearTimeout(this._viewAnimTimer); }
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => { if (!this._isPanning) return; const dx = e.clientX - this._panStartX; const dy = e.clientY - this._panStartY; this.viewX = this._panStartViewX + dx; this.viewY = this._panStartViewY + dy; this.applyViewTransform(); });
        document.addEventListener('mouseup', () => { if (this._isPanning) { this._isPanning = false; desktop.classList.remove('panning'); } });
    }
    applyViewTransform(animate = false) {
        if (!this.windowsContainerEl) return;
        if (animate) {
            // 平滑过渡模式：加过渡类，动画结束后移除（期间若有拖拽会立即取消）
            this.windowsContainerEl.classList.add('view-animating');
            clearTimeout(this._viewAnimTimer);
            this._viewAnimTimer = setTimeout(() => {
                this.windowsContainerEl && this.windowsContainerEl.classList.remove('view-animating');
            }, 420);
        } else {
            this.windowsContainerEl.classList.remove('view-animating');
        }
        this.windowsContainerEl.style.transform = `translate(${this.viewX}px, ${this.viewY}px)`;
    }
    centerWindowInView(win) {
        if (!win || !win.element) return;
        const winLeft = parseInt(win.element.style.left) || 0; const winTop = parseInt(win.element.style.top) || 0; const winWidth = parseInt(win.element.style.width) || 600; const winHeight = parseInt(win.element.style.height) || 400;
        const viewCenterX = (window.innerWidth - 110) / 2; const viewCenterY = (window.innerHeight - 48) / 2;
        const winCenterX = winLeft + winWidth / 2; const winCenterY = winTop + winHeight / 2;
        this.viewX = viewCenterX - winCenterX; this.viewY = viewCenterY - winCenterY;
        this.applyViewTransform(true);
    }
    lock() {
        // 兜底：锁屏对象可能因之前的闪退/destroy 或 init 时机问题未初始化
        if (!this.lockScreen) {
            try {
                this.lockScreen = new LockScreen({
                    onUnlock: () => { this.updateTaskbarUser(); },
                    onUserSwitch: (username) => { this.switchUser(username); }
                });
            } catch (e) {
                console.error('Failed to create LockScreen in lock():', e);
                return;
            }
        }
        try { this.lockScreen.show(); } catch (e) { console.error('lockScreen.show failed:', e); }
    }
    setupAppLaunchListeners() {
        document.addEventListener('app-launch-real', (e) => { const path = e.detail.path; const app = { path: path, name: path.replace('.app', '') }; this.openAppByPath(app); });
        document.addEventListener('open-file-in-editor', (e) => { const filePath = e.detail.path; this.openAppByPath({ path: 'texteditor.app', name: this.getAppLabelForPath('texteditor.app', '文本编辑器'), params: { path: filePath } }); });
        document.addEventListener('open-image-viewer', (e) => { const filePath = e.detail.path; this.openAppByPath({ path: 'mediaviewer.app', name: this.getAppLabelForPath('mediaviewer.app', '媒体查看器'), params: { path: filePath } }); });
        document.addEventListener('open-media-player', (e) => { const filePath = e.detail.path; this.openAppByPath({ path: 'mediaviewer.app', name: this.getAppLabelForPath('mediaviewer.app', '媒体查看器'), params: { path: filePath } }); });
    }
    async scanApps() {
        try { const res = await fetch(assetUrl('../apps/manifest.json')); if (!res.ok) return; this.apps = await res.json(); this._systemAppPaths = new Set(this.apps.map(a => a.path)); } catch (e) { console.warn('扫描应用失败:', e); this.apps = []; }
        this._manifestPaths = new Set((this.apps || []).map(a => a.path));
        this._syncVfsAppsIntoList();
    }
    /** 把 VFS /application 下已安装但不在 manifest 中的应用合并进 this.apps（桌面图标 / 启动 / 列表用） */
    _syncVfsAppsIntoList() {
        try {
            const fs = this.storage.fs;
            const appDir = (fs.children || []).find(c => c.name === 'application' && c.type === 'folder');
            const vfsPaths = new Set();
            for (const c of (appDir && appDir.children) || []) {
                if (c.type !== 'folder' || !c.name.endsWith('.app')) continue;
                vfsPaths.add(c.name);
                if ((this.apps || []).some(a => a.path === c.name)) continue;
                const infoFile = (c.children || []).find(f => f.name === 'info.json' && f.type === 'file');
                let id = c.name.replace(/\.app$/, ''), name = id, version = '1.0.0', description = '', category = 'productivity';
                if (infoFile) { try { const info = JSON.parse(infoFile.content); id = info.id || id; name = info.name || name; version = info.version || version; description = info.description || ''; category = info.category || category; } catch (e) {} }
                this.apps.push({ id, name, path: c.name, description, category, version });
            }
            // 清理既不在 manifest 也不在 VFS 的残留项
            this.apps = (this.apps || []).filter(a => (this._manifestPaths && this._manifestPaths.has(a.path)) || vfsPaths.has(a.path));
        } catch (e) { console.warn('同步 VFS 应用列表失败:', e); }
    }
    /** 终端 application install/uninstall 后：刷新应用清单与桌面图标 */
    setupAppsChangedListener() {
        document.addEventListener('apps-changed', async () => {
            try {
                await this.scanApps();
                await this.refreshAppNames();
                this.setupDesktopIcons();
                this.updateTaskbar();
            } catch (e) { console.warn('apps-changed 刷新失败:', e); }
        });
    }
    /** 终端 personality 命令修改个性化后：实时应用（动画/任务栏/字体/壁纸/主题色） */
    setupPersonalizationListener() {
        document.addEventListener('personality-changed', async () => {
            try { await this.applyPersonalization(); } catch (e) { console.warn('personality-changed 应用失败:', e); }
        });
    }
    setupDesktopIcons() {
        const desktopIcons = this.desktopEl.querySelector('.desktop-icons');
        const terminalIcon = this.desktopEl.querySelector('#terminal-icon');
        if (terminalIcon) {
            const label = terminalIcon.querySelector('.icon-label'); if (label) label.textContent = this.t('app.terminal', '终端');
            // 幂等：重复调用（如应用变更刷新）不重复绑定
            if (!terminalIcon.dataset.bound) {
                terminalIcon.dataset.bound = '1';
                terminalIcon.addEventListener('click', () => { this.openTerminalWindow(); });
            }
        }
        const calculatorIcon = this.desktopEl.querySelector('#calculator-icon');
        if (calculatorIcon) {
            const label = calculatorIcon.querySelector('.icon-label'); if (label) label.textContent = this.getAppLabelForPath('calculator.app', '计算器'); calculatorIcon.dataset.manualBound = '1';
            if (!calculatorIcon.dataset.bound) { calculatorIcon.dataset.bound = '1'; calculatorIcon.addEventListener('click', () => { this.openAppByPath({ path: 'calculator.app', name: this.getAppLabelForPath('calculator.app', '计算器') }); }); }
        }
        const filemanagerIcon = this.desktopEl.querySelector('#filemanager-icon');
        if (filemanagerIcon) {
            const label = filemanagerIcon.querySelector('.icon-label'); if (label) label.textContent = this.getAppLabelForPath('filemanager.app', '文件管理器'); filemanagerIcon.dataset.manualBound = '1';
            if (!filemanagerIcon.dataset.bound) { filemanagerIcon.dataset.bound = '1'; filemanagerIcon.addEventListener('click', () => { this.openAppByPath({ path: 'filemanager.app', name: this.getAppLabelForPath('filemanager.app', '文件管理器') }); }); }
        }
        this.apps.forEach(app => {
            let iconEl = desktopIcons.querySelector(`[data-app="${app.id}"]`);
            if (!iconEl) { iconEl = document.createElement('div'); iconEl.className = 'desktop-icon'; iconEl.setAttribute('data-app', app.id); const displayName = this.getAppDisplayName(app, app.name); iconEl.innerHTML = `<div class="icon-image"><img src="${assetUrl(`../apps/${encodeURI(app.path)}/icon.svg`)}" alt="${displayName}" style="width:28px;height:28px;"></div><div class="icon-label">${displayName}</div>`; desktopIcons.appendChild(iconEl); }
            if (!iconEl.dataset.manualBound && !iconEl.dataset.bound) { iconEl.dataset.bound = '1'; iconEl.addEventListener('click', () => { this.openAppByPath({ ...app, name: this.getAppDisplayName(app, app.name) }); }); }
        });
        // 移除已卸载应用的桌面图标
        const validIds = new Set(this.apps.map(a => a.id));
        desktopIcons.querySelectorAll('.desktop-icon[data-app]').forEach(el => {
            const id = el.getAttribute('data-app');
            if (id && !validIds.has(id) && !['terminal', 'calculator', 'filemanager'].includes(id)) el.remove();
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
        const win = this.windowManager.createWindow({ title: this.t('app.terminal', '终端'), icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23ecf0f1" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>', content: terminalContainer, width: isMobile ? window.innerWidth : (options.width || 600), height: isMobile ? (window.innerHeight - 56) : (options.height || 400), x: isMobile ? 0 : options.x, y: isMobile ? 0 : options.y, windowType: 'terminal', workspaceId: options.workspaceId != null ? options.workspaceId : this.activeWorkspace, onMoveEnd: () => { this.saveState(); } });
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
    /**
     * 应用入口 HTML 的 URL。用 import.meta.url 推导（而不是写死 /apps/...），
     * 这样项目部署到任意子路径下也能正确解析。
     */
    appEntryUrl(appPath) {
        // 带缓存版本号：应用文件更新后不会被浏览器继续沿用旧缓存
        return new URL(`../apps/${encodeURI(appPath)}/main/index.html`, import.meta.url).href + '?v=54';
    }
    /** srcdoc 里要用的 base：指向该应用的 main/ 目录 */
    appBaseUrl(appPath) {
        return new URL(`../apps/${encodeURI(appPath)}/main/`, import.meta.url).href;
    }
    generateAppHtml(vfsApp, params = null, appPath = '') {
        if (!vfsApp || !vfsApp.files) return null;
        let html = vfsApp.files['index.html'] || '<html><body><h1>App load failed</h1></body></html>';
        /* srcdoc 的文档 base URL 继承自父页面（站点根），但应用里的资源引用是
           相对自身 main/ 目录写的（如 ../../icons/edit.svg）。两者不一致会让
           图标、语言包全部 404。这里显式注入 <base>，把相对路径锚定到该应用目录。
           注意：磁盘上的应用走 iframe.src，浏览器自己就会用正确的 base，无需注入。 */
        if (appPath) {
            const baseHref = this.appBaseUrl(appPath).replace(/"/g, '&quot;');
            const baseTag = `<base href="${baseHref}">`;
            if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m => m + baseTag);
            else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, m => m + '<head>' + baseTag + '</head>');
            else if (/<body[^>]*>/i.test(html)) html = html.replace(/<body[^>]*>/i, m => '<head>' + baseTag + '</head>' + m);
            else html = '<head>' + baseTag + '</head>' + html;
        }
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
        let info = { width: 380, height: 580 };
        let iconUrl = new URL(`../apps/${encodeURI(app.path)}/icon.svg`, import.meta.url).href;
        if (vfsApp && vfsApp.info) { try { info = JSON.parse(vfsApp.info); } catch (e) {} }
        else { try { const infoRes = await fetch(new URL(`../apps/${encodeURI(app.path)}/info.json`, import.meta.url).href); if (infoRes.ok) info = await infoRes.json(); } catch (e) {} }
        if (vfsApp && vfsApp.icon) { iconUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(vfsApp.icon)))}`; }
        const contentContainer = document.createElement('div'); contentContainer.style.width = '100%'; contentContainer.style.height = '100%'; contentContainer.style.overflow = 'hidden';
        const iframe = document.createElement('iframe'); iframe.style.width = '100%'; iframe.style.height = '100%'; iframe.style.border = 'none'; iframe.style.display = 'block';
        if (vfsApp) { const appHtml = this.generateAppHtml(vfsApp, app.params || null, app.path); if (appHtml) { iframe.srcdoc = appHtml; } else { iframe.src = this.appEntryUrl(app.path); } }
        else { let src = this.appEntryUrl(app.path); if (app.params) { const params = new URLSearchParams(app.params); src += (src.includes('?') ? '&' : '?') + params.toString(); } iframe.src = src; }
        contentContainer.appendChild(iframe);
        const isMobile = this.isMobile();
        const displayName = this.getAppDisplayName(app, app.name);
        const win = this.windowManager.createWindow({ title: displayName, icon: iconUrl, content: contentContainer, width: isMobile ? window.innerWidth : (app.width || info.width || 380), height: isMobile ? (window.innerHeight - 56) : (app.height || info.height || 580), x: isMobile ? 0 : app.x, y: isMobile ? 0 : app.y, windowType: 'app', workspaceId: app.workspaceId != null ? app.workspaceId : this.activeWorkspace, onMoveEnd: () => { this.saveState(); } });
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
        if (!this.surfaces || !this.surfaces.length) return;
        this.surfaces.forEach(surface => this._renderSurfaceItems(surface));
    }
    _renderSurfaceItems(surface) {
        const ws = surface.workspace;
        const itemsEl = surface.itemsEl;
        if (!itemsEl) return;
        itemsEl.innerHTML = '';
        // 仅当前桌面高亮「顶部窗口」；其它桌面各自的任务栏只列出自己的窗口
        const topWindow = (ws === this.activeWorkspace) ? this._getTopWindow() : null;
        const windows = this.windowManager.getAllWindows().filter(w => w.workspaceId === ws);
        windows.forEach(win => {
            const item = document.createElement('div'); item.className = 'taskbar-item';
            const iconEl = document.createElement('img'); iconEl.className = 'taskbar-icon';
            iconEl.src = win.appIcon || win.icon || DEFAULT_WINDOW_ICON;
            iconEl.alt = win.appName || win.title || '窗口'; iconEl.style.width = '20px'; iconEl.style.height = '20px';
            item.appendChild(iconEl);
            if (topWindow && win.id === topWindow.id && !win.isMinimized) { item.classList.add('active'); }
            item.addEventListener('click', () => {
                const switched = win.workspaceId !== this.activeWorkspace;
                if (switched) { this.setActiveWorkspace(win.workspaceId); }
                const tw = this._getTopWindow();
                if (win.isMinimized) { win.restore(); this.centerWindowInView(win); }
                else if (!switched && tw && win.id === tw.id) { win.minimize(); }
                else { win.focus(); this.centerWindowInView(win); }
            });
            itemsEl.appendChild(item);
        });
    }
    _getTopWindow() {
        // 「真实最高层」由 z-index 唯一决定，不能用 window-focused 类判断：
        // 类可能因新建窗口未自动聚焦、iframe 焦点轮询延迟、桌面点击清空等场景
        // 与真实层级脱节，导致任务栏高亮指向另一个应用。
        const activeWindows = this.windowManager.getAllWindows()
            .filter(w => w.workspaceId === this.activeWorkspace && !w.isMinimized);
        let topWin = null; let maxZIndex = -1;
        activeWindows.forEach(win => {
            const zIndex = parseInt(win.element.style.zIndex) || 0;
            if (zIndex > maxZIndex) { maxZIndex = zIndex; topWin = win; }
        });
        return topWin;
    }
    // ───────────────────────── 多桌面 / 工作区（虚拟桌面） ─────────────────────────
    // 每个工作区拥有一套「独立任务栏」（只列出本桌面的窗口）；切换桌面时整体显隐，
    // 彻底实现“不同桌面不共用任务栏”。窗口本身仍统一挂在单一的 .windows-container 中，
    // 仅按工作区控制显隐，避免在多容器间搬移 iframe 带来的重载风险。
    buildWorkspaceTaskbars() {
        const container = this.desktopEl.querySelector('#desktop-surfaces');
        if (!container) return;
        container.innerHTML = '';
        this.surfaces = [];
        const count = Math.max(1, this.workspaceCount);
        const currentUser = (this.userManager.getCurrentUser() || {}).username || 'public';
        for (let i = 0; i < count; i++) {
            const taskbar = document.createElement('div');
            taskbar.className = 'taskbar desktop-surface-taskbar';
            taskbar.style.display = (i === this.activeWorkspace) ? '' : 'none';
            taskbar.dataset.workspace = String(i);
            const items = document.createElement('div'); items.className = 'taskbar-items';
            const right = document.createElement('div'); right.className = 'taskbar-right';
            const clock = document.createElement('div'); clock.className = 'taskbar-clock';
            const user = document.createElement('div'); user.className = 'taskbar-user'; user.id = `taskbar-user-${i}`;
            const avatar = document.createElement('span'); avatar.className = 'taskbar-user-avatar'; avatar.id = `taskbar-user-avatar-${i}`;
            const name = document.createElement('span'); name.className = 'taskbar-user-name'; name.id = `taskbar-user-name-${i}`; name.textContent = currentUser;
            const logout = document.createElement('span'); logout.className = 'taskbar-logout-label'; logout.textContent = '退出登录';
            user.appendChild(avatar); user.appendChild(name); user.appendChild(logout);
            right.appendChild(clock); right.appendChild(user);
            taskbar.appendChild(items); taskbar.appendChild(right);
            container.appendChild(taskbar);
            const surface = { workspace: i, taskbarEl: taskbar, itemsEl: items, clockEl: clock, userEl: user, userNameEl: name, userAvatarEl: avatar };
            this.surfaces.push(surface);
            // 正常态：点击打开任务视图；任务视图中：按钮变「退出登录」，点击即锁屏
            user.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._overviewOpen) { this.closeOverview(); this.lock(); }
                else this.openOverview();
            });
        }
        this.updateTaskbar();
        this.updateTaskbarUser();
        this._updateClock();
    }
    _getActiveTaskbarEl() {
        const s = this.surfaces.find(s => s.workspace === this.activeWorkspace);
        return s ? s.taskbarEl : null;
    }
    setActiveWorkspace(id) {
        if (id < 0 || id >= this.workspaceCount) return;
        const changed = id !== this.activeWorkspace;
        this.activeWorkspace = id;
        this.windowManager.setActiveWorkspace(id);
        this.surfaces.forEach(s => { s.taskbarEl.style.display = (s.workspace === id) ? '' : 'none'; });
        this.updateTaskbar();
        this.saveState();
        if (changed) this._playWorkspaceEnterAnimation();
        // 任务视图打开时（例如通过底部任务栏点另一个桌面的窗口），同步刷新
        // 顶部缩略图高亮与中部窗口列表，避免显示上一个桌面的内容
        if (changed && this._overviewOpen) this.openOverview();
    }
    /** 工作区切换入场动画：容器淡入 + 任务栏上浮 + 可见窗口轻微上移渐显 */
    _playWorkspaceEnterAnimation() {
        try {
            const container = this.windowsContainerEl;
            if (container) {
                container.classList.remove('ws-enter');
                void container.offsetWidth; // 重启动画
                container.classList.add('ws-enter');
            }
            const bar = this._getActiveTaskbarEl();
            if (bar) {
                bar.classList.remove('ws-enter');
                void bar.offsetWidth;
                bar.classList.add('ws-enter');
            }
            this.windowManager.getAllWindows().forEach(win => {
                if (win.workspaceId !== this.activeWorkspace || win.isMinimized || !win.element) return;
                win.element.classList.remove('ws-win-enter');
                void win.element.offsetWidth;
                win.element.classList.add('ws-win-enter');
            });
            clearTimeout(this._wsEnterTimer);
            this._wsEnterTimer = setTimeout(() => {
                if (container) container.classList.remove('ws-enter');
                if (bar) bar.classList.remove('ws-enter');
                this.windowManager.getAllWindows().forEach(win => win.element && win.element.classList.remove('ws-win-enter'));
            }, 420);
        } catch (e) { /* 动画失败不影响功能 */ }
    }
    addWorkspace() {
        if (this.workspaceCount >= 9) return; // 数量上限保护
        this.workspaceCount++;
        const newId = this.workspaceCount - 1;
        this.activeWorkspace = newId;
        this.buildWorkspaceTaskbars();
        this.windowManager.setActiveWorkspace(newId);
        this.saveState();
    }
    removeWorkspace(id) {
        if (this.workspaceCount <= 1) return;
        if (id < 0 || id >= this.workspaceCount) return;
        // 把被删工作区的窗口归并到 0 号；编号更大的工作区整体前移，避免索引错位
        this.windowManager.getAllWindows().forEach(w => {
            if (w.workspaceId === id) w.workspaceId = 0;
            else if (w.workspaceId > id) w.workspaceId--;
        });
        this.workspaceCount--;
        if (this.activeWorkspace === id) this.activeWorkspace = 0;
        else if (this.activeWorkspace > id) this.activeWorkspace--;
        this.buildWorkspaceTaskbars();
        this.windowManager.setActiveWorkspace(this.activeWorkspace);
        this.saveState();
    }
    // ─────────────────── 任务视图（桌面总览） ───────────────────
    // 布局：顶部 = 所有桌面缩略图（窄条、横向滚动）；中部 = 当前桌面所有窗口
    // （互不重叠、按真实尺寸同一比例缩放）；底部 = 真实任务栏，用户按钮切换成
    // 「退出登录」。所有窗口只克隆展示，真实窗口始终在后台运行，状态不丢失。
    setupOverviewKey() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._overviewOpen) { e.preventDefault(); this.closeOverview(); }
        }, true);
    }
    openOverview() {
        const overlay = this.desktopEl.querySelector('#desktop-overview');
        if (!overlay) return;
        overlay.innerHTML = '';
        this._overviewOpen = true;
        document.body.classList.add('overview-active');
        // 自动隐藏任务栏时，任务视图期间强制展开，保证底部任务栏与退出登录按钮可见
        if (this._taskbarAutohide) this.expandTaskbarFromCompact();
        this._clearAutohideTimer();

        const strip = document.createElement('div'); strip.className = 'overview-topstrip';
        overlay.appendChild(strip);
        this._renderOverviewStrip(strip);

        const main = document.createElement('div'); main.className = 'overview-main';
        overlay.appendChild(main);
        this._renderOverviewWindows(main);

        overlay.style.display = 'flex';
        // 布局完成后再算一次窗口比例（首次 clientWidth/clientHeight 尚未稳定）
        requestAnimationFrame(() => {
            if (this._overviewOpen && main.isConnected) this._renderOverviewWindows(main);
        });
    }
    closeOverview() {
        const overlay = this.desktopEl.querySelector('#desktop-overview');
        if (overlay) {
            overlay.style.display = 'none';
            // 必须清空：缩略图里的克隆节点（含克隆的终端/应用 iframe）若留在 DOM 中，
            // 既会继续匹配 .window .terminal 等全局选择器造成串扰，也会白白运行
            overlay.innerHTML = '';
        }
        this._overviewOpen = false;
        document.body.classList.remove('overview-active');
        if (this._taskbarAutohide) this._resetAutohideTimer();
    }
    /** 顶部：所有桌面缩略图，窄条 + 水平滚动 */
    _renderOverviewStrip(strip) {
        strip.innerHTML = '';
        const count = Math.max(1, this.workspaceCount);
        for (let ws = 0; ws < count; ws++) {
            const card = document.createElement('div');
            card.className = 'overview-ws-card' + (ws === this.activeWorkspace ? ' active' : '');
            card.appendChild(this.renderOverviewThumbnail(ws, 150));
            const label = document.createElement('div'); label.className = 'overview-ws-label';
            label.textContent = `桌面 ${ws + 1}`;
            const wins = this.windowManager.getAllWindows().filter(w => w.workspaceId === ws && !w.isMinimized).length;
            if (wins > 0) {
                const badge = document.createElement('span'); badge.className = 'overview-badge'; badge.textContent = String(wins);
                label.appendChild(badge);
            }
            card.appendChild(label);
            if (count > 1) {
                const rm = document.createElement('div'); rm.className = 'overview-remove'; rm.textContent = '×'; rm.title = '删除此桌面';
                rm.addEventListener('click', (e) => { e.stopPropagation(); this.removeWorkspace(ws); this.openOverview(); });
                card.appendChild(rm);
            }
            card.addEventListener('click', () => {
                // 切桌面由 setActiveWorkspace 统一负责重绘（任务视图打开时会刷新
                // 条带高亮 + 中部窗口列表），这里无需再 openOverview 一次
                if (ws !== this.activeWorkspace) this.setActiveWorkspace(ws);
            });
            strip.appendChild(card);
        }
        if (count < 9) {
            const add = document.createElement('div'); add.className = 'overview-ws-card overview-add'; add.textContent = '+ 新建桌面';
            add.addEventListener('click', () => { this.addWorkspace(); this.openOverview(); });
            strip.appendChild(add);
        }
    }
    /** 中部：当前桌面所有窗口（含最小化的），按真实尺寸同一比例平铺、不重叠 */
    _renderOverviewWindows(main) {
        main.innerHTML = '';
        const wins = this.windowManager.getAllWindows().filter(w => w.workspaceId === this.activeWorkspace && w.element);
        if (!wins.length) {
            const empty = document.createElement('div'); empty.className = 'overview-empty';
            empty.textContent = '此桌面暂无窗口';
            main.appendChild(empty);
            return;
        }
        const availW = Math.max(320, main.clientWidth || (window.innerWidth - 80));
        const availH = Math.max(200, main.clientHeight || (window.innerHeight - 280));
        const dims = wins.map(w => ({
            w: Math.max(120, parseInt(w.element.style.width) || w.element.offsetWidth || 600),
            h: Math.max(90, parseInt(w.element.style.height) || w.element.offsetHeight || 400)
        }));
        const maxW = Math.max.apply(null, dims.map(d => d.w));
        const maxH = Math.max.apply(null, dims.map(d => d.h));
        // 估算列数（按可用区宽高比），再求「能让最大窗口放进一格」的统一缩放系数。
        // 所有窗口共用同一 scale，彼此的相对大小与真实桌面一致。
        const cols = Math.max(1, Math.min(wins.length, Math.ceil(Math.sqrt(wins.length * availW / availH))));
        const rows = Math.ceil(wins.length / cols);
        const gap = 18;
        const cellW = (availW - gap * (cols + 1)) / cols;
        const cellH = (availH - gap * (rows + 1)) / rows - 26; // 预留标题条
        const scale = Math.max(0.06, Math.min(0.6, cellW / maxW, Math.max(60, cellH) / maxH));

        wins.forEach((win, i) => {
            const w = dims[i].w, h = dims[i].h;
            const cw = Math.max(40, Math.round(w * scale));
            const ch = Math.max(30, Math.round(h * scale));
            const tile = document.createElement('div');
            tile.className = 'overview-win-tile' + (win.isMinimized ? ' minimized' : '');
            const canvasEl = document.createElement('div');
            canvasEl.className = 'overview-win-canvas';
            canvasEl.style.width = cw + 'px';
            canvasEl.style.height = ch + 'px';
            const stage = document.createElement('div');
            stage.className = 'overview-win-stage';
            stage.style.width = w + 'px';
            stage.style.height = h + 'px';
            stage.style.transform = `scale(${scale})`;
            const wel = this._cleanClone(win.element);
            wel.style.left = '0'; wel.style.top = '0';
            wel.style.width = w + 'px'; wel.style.height = h + 'px';
            wel.style.zIndex = '1';
            stage.appendChild(wel);
            canvasEl.appendChild(stage);
            tile.appendChild(canvasEl);
            const label = document.createElement('div'); label.className = 'overview-win-label';
            label.textContent = win.title + (win.isMinimized ? ' · 已最小化' : '');
            tile.title = win.title;
            tile.appendChild(label);
            tile.addEventListener('click', () => {
                if (win.workspaceId !== this.activeWorkspace) this.setActiveWorkspace(win.workspaceId);
                if (win.isMinimized) win.restore();
                try { win.focus(); } catch (e) {}
                this.closeOverview();
            });
            main.appendChild(tile);
        });
    }
    renderOverviewThumbnail(ws, TW = 260) {
        // 缩略图 = 真实桌面的「活镜像」：把壁纸、程序坞（.desktop-icons）、窗口
        // （.windows-container 内属于本工作区的窗口）、任务栏逐层克隆进一个与桌面
        // 等尺寸的舞台，再用 CSS transform 整体缩放到卡片宽度。这样背景、窗口、
        // 任务栏、程序坞与真实桌面完全一致（旧实现是手绘近似条带，对不上）。
        const thumb = document.createElement('div');
        thumb.className = 'overview-thumb';
        thumb.title = `桌面 ${ws + 1}`;
        const desktop = this.desktopEl;
        const stageW = Math.max(320, desktop.clientWidth || window.innerWidth || 1280);
        const stageH = Math.max(240, desktop.clientHeight || window.innerHeight || 800);
        const scale = TW / stageW;
        const TH = Math.max(80, Math.round(stageH * scale));
        thumb.style.width = TW + 'px';
        thumb.style.height = TH + 'px';

        const stage = document.createElement('div');
        stage.className = 'overview-thumb-stage';
        stage.style.width = stageW + 'px';
        stage.style.height = stageH + 'px';
        stage.style.transform = `scale(${scale})`;
        thumb.appendChild(stage);

        // ① 壁纸：复制 #desktop 的计算背景（渐变 / 纯色 / 图片）
        try {
            const dcs = getComputedStyle(desktop);
            stage.style.backgroundColor = dcs.backgroundColor;
            stage.style.backgroundImage = dcs.backgroundImage;
            stage.style.backgroundSize = dcs.backgroundSize;
            stage.style.backgroundPosition = dcs.backgroundPosition;
            stage.style.backgroundRepeat = dcs.backgroundRepeat;
        } catch (e) { /* 极端环境下取不到计算样式就保持默认 */ }
        // 视频壁纸：把当前帧画进 canvas（同源 data/blob 源可 drawImage）
        const video = this.wallpaperVideoEl || document.getElementById('wallpaper-video');
        if (video && video.classList && video.classList.contains('active')) {
            try {
                const cv = document.createElement('canvas');
                cv.className = 'overview-thumb-video';
                cv.width = Math.max(1, Math.round(stageW * scale));
                cv.height = Math.max(1, Math.round(stageH * scale));
                const ctx = cv.getContext('2d');
                if (video.readyState >= 2) ctx.drawImage(video, 0, 0, cv.width, cv.height);
                else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); }
                cv.style.width = stageW + 'px';
                cv.style.height = stageH + 'px';
                stage.appendChild(cv);
            } catch (e) { /* 视频帧抓取失败：退回纯黑背景 */ }
        }

        // ② 程序坞（桌面图标列）
        const icons = desktop.querySelector('.desktop-icons');
        if (icons) stage.appendChild(this._cleanClone(icons));

        // ③ 窗口：克隆 .windows-container 骨架，仅挂本工作区的非最小化窗口
        const wc = this.windowsContainerEl;
        if (wc) {
            const wcc = wc.cloneNode(false);
            wcc.style.transform = wc.style.transform || 'none'; // 保留视图平移，与真实可视一致
            wcc.classList.remove('view-animating', 'ws-enter');
            this.windowManager.getAllWindows().forEach(win => {
                if (!win.element || win.workspaceId !== ws || win.isMinimized) return;
                const wel = this._cleanClone(win.element); // 会清掉后台/最小化隐藏态
                wcc.appendChild(wel);
            });
            stage.appendChild(wcc);
        }

        // ④ 任务栏：克隆本工作区的真实任务栏（非活动工作区的真实态是 display:none）
        const surface = this.surfaces.find(s => s.workspace === ws);
        if (surface && surface.taskbarEl) {
            const tbc = this._cleanClone(surface.taskbarEl);
            tbc.style.display = '';
            tbc.classList.remove('ws-enter', 'autohide-hidden', 'autohide-visible');
            stage.appendChild(tbc);
        }
        return thumb;
    }
    /** 深拷贝并清理：去掉 id / 幂等标记 / 后台隐藏态与 inert，
        保证克隆出来的窗口在任务视图里是可见、可渲染的 */
    _cleanClone(el) {
        const c = el.cloneNode(true);
        if (c.id) c.removeAttribute('id');
        c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
        c.querySelectorAll('[data-bound]').forEach(n => n.removeAttribute('data-bound'));
        const reveal = (n) => {
            n.classList && n.classList.remove('window-hidden', 'window-opening', 'window-closing', 'ws-win-enter', 'view-animating');
            if (n.hasAttribute && n.hasAttribute('inert')) n.removeAttribute('inert');
        };
        reveal(c);
        c.querySelectorAll('.window-hidden, [inert]').forEach(reveal);
        return c;
    }
    setupWorkspaceShortcuts() {
        // 输入框聚焦时不触发「关闭 / 显示桌面 / 切换窗口」等高风险快捷键，避免误关正在输入的窗口
        const isTyping = () => {
            const ae = document.activeElement;
            return !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable));
        };
        document.addEventListener('keydown', (e) => {
            // 整组快捷键统一使用 Ctrl / Cmd + Alt 作为前缀，避开浏览器保留键（Ctrl+W/T/Tab 等）
            const mod = e.ctrlKey || e.metaKey;
            if (!mod || !e.altKey) return;
            const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                // 切换工作区（原有）
                e.preventDefault();
                this.setActiveWorkspace((this.activeWorkspace + 1) % Math.max(1, this.workspaceCount));
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                this.setActiveWorkspace((this.activeWorkspace - 1 + this.workspaceCount) % Math.max(1, this.workspaceCount));
            } else if (key === 'n') {
                // 新建工作区
                e.preventDefault();
                this.addWorkspace();
            } else if (key === 'w') {
                // 关闭当前聚焦窗口（输入框中跳过）
                if (isTyping()) return;
                e.preventDefault();
                const tw = this._getTopWindow();
                if (tw && typeof tw.close === 'function') tw.close();
            } else if (key === 'd') {
                // 显示 / 隐藏桌面（最小化 / 恢复所有窗口）
                if (isTyping()) return;
                e.preventDefault();
                this.toggleShowDesktop();
            } else if (e.key === 'Tab') {
                // 在当前工作区内循环切换焦点窗口
                if (isTyping()) return;
                e.preventDefault();
                this.cycleWindow();
            }
        }, true);
    }
    toggleShowDesktop() {
        const wins = this.windowManager.getAllWindows().filter(w => w.workspaceId === this.activeWorkspace && !w.isMinimized);
        if (this._desktopHidden) {
            // 再次按下：恢复此前被最小化的窗口
            (this._desktopHiddenIds || []).forEach(id => {
                const w = this.windowManager.getWindow(id);
                if (w && w.isMinimized) { w.restore(); w.focus(); }
            });
            this._desktopHidden = false;
            this._desktopHiddenIds = [];
        } else {
            this._desktopHiddenIds = wins.map(w => w.id);
            wins.forEach(w => w.minimize());
            this._desktopHidden = true;
        }
        this.updateTaskbar();
        this.saveState();
    }
    cycleWindow() {
        const wins = this.windowManager.getAllWindows().filter(w => w.workspaceId === this.activeWorkspace && !w.isMinimized);
        if (wins.length === 0) return;
        const top = this._getTopWindow();
        const idx = wins.findIndex(w => top && w.id === top.id);
        const next = wins[(idx + 1) % wins.length];
        if (next) { next.focus(); this.centerWindowInView(next); }
    }
    saveState() {
        if (window._isSavingDisabled) { return; } if (this._isLoadingState) { return; }
        try {
            const windows = this.windowManager.getAllWindows();
            const state = { currentWorkspace: this.activeWorkspace, workspaceCount: this.workspaceCount, windows: windows.map(win => { const winState = { id: win.id, title: win.title, windowType: win.windowType || 'default', x: parseInt(win.element.style.left) || 0, y: parseInt(win.element.style.top) || 0, width: parseInt(win.element.style.width) || 600, height: parseInt(win.element.style.height) || 400, isMinimized: win.isMinimized, zIndex: parseInt(win.element.style.zIndex) || 0, workspace: win.workspaceId != null ? win.workspaceId : 0 }; if (win.windowType === 'terminal' && this.terminalWindows.has(win.id)) { const terminal = this.terminalWindows.get(win.id); winState.currentPath = terminal.fs.getCurrentPath(); } if (win.windowType === 'app') { winState.appPath = win.appPath; winState.appParams = win.appParams; } return winState; }) };
            state.windows.sort((a, b) => a.zIndex - b.zIndex);
            this.storage.writeFile(this.getStateFilePath(), JSON.stringify(state));
        } catch (e) { console.warn('Failed to save GUI state:', e); }
    }
    async loadState() {
        try {
            this.storage.reload(); const data = this.storage.loadJSON(this.getStateFilePath()); if (!data) return;
            const state = data; if (!state.windows || !Array.isArray(state.windows)) return;
            this._isLoadingState = true;
            // 恢复前先记下已有窗口数量：下面用「偏移」而不是绝对下标来对应恢复的窗口，
            // 避免 init 阶段已有窗口时索引错位（把 A 窗口的坐标套到 B 窗口上）
            const baseCount = this.windowManager.getAllWindows().length;
            // 恢复工作区数量与「保存时的当前工作区」
            this.workspaceCount = Math.max(1, state.workspaceCount || 1);
            const savedWorkspace = (state.currentWorkspace != null) ? state.currentWorkspace : 0;
            for (const winState of state.windows) {
                const workspaceId = (winState.workspace != null) ? winState.workspace : 0;
                if (winState.windowType === 'terminal') { this.openTerminalWindow({ x: winState.x, y: winState.y, width: winState.width, height: winState.height, initialPath: winState.currentPath, workspaceId }); }
                else if (winState.windowType === 'app' && winState.appPath) { await this.openAppByPath({ path: winState.appPath, name: winState.title, params: winState.appParams, x: winState.x, y: winState.y, width: winState.width, height: winState.height, workspaceId }); }
            }
            const restoredWindows = this.windowManager.getAllWindows();
            state.windows.forEach((winState, index) => {
                const restoredWin = restoredWindows[baseCount + index];
                if (restoredWin) {
                    restoredWin.element.style.left = winState.x + 'px';
                    restoredWin.element.style.top = winState.y + 'px';
                    restoredWin.element.style.width = winState.width + 'px';
                    restoredWin.element.style.height = winState.height + 'px';
                    restoredWin.element.style.zIndex = winState.zIndex;
                    if (winState.isMinimized) restoredWin.isMinimized = true;
                }
            });
            // 统一按「最小化状态 + 工作区归属」重算所有窗口显隐（取代原先简单的 display=none）
            this.activeWorkspace = savedWorkspace;
            this.windowManager.setActiveWorkspace(savedWorkspace);
            this.buildWorkspaceTaskbars();
            this.updateTaskbar();
            const maxZIndex = state.windows.reduce((max, w) => Math.max(max, w.zIndex), 0); this.windowManager.zIndexCounter = maxZIndex + 1;
        } catch (e) { console.warn('Failed to load GUI state:', e); }
        finally { this._isLoadingState = false; }
    }
    startClock() { this._updateClock(); this.clockInterval = setInterval(() => { this._updateClock(); }, 1000); }
    _updateClock() {
        const now = new Date(); const hours = String(now.getHours()).padStart(2, '0'); const minutes = String(now.getMinutes()).padStart(2, '0'); const seconds = String(now.getSeconds()).padStart(2, '0');
        const t = `${hours}:${minutes}:${seconds}`;
        this.surfaces.forEach(s => { if (s.clockEl) s.clockEl.textContent = t; });
    }
}
export default DesktopManager;