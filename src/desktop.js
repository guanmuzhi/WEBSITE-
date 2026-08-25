import UserManager from './user-manager.js?v=15';
import UserSwitcher from './user-switcher.js?v=15';
import LockScreen from './lock-screen.js?v=15';
import StorageService from './storage.js?v=15';
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
        this.userManager = UserManager.getInstance();
        this.storage = StorageService.getInstance();
        this.userSwitcher = null;
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
        this.userSwitcher = new UserSwitcher({ onSwitch: (username) => { this.switchUser(username); }, onLock: () => { this.lock(); } });
        this.setupTaskbarUser();
        await this.loadLanguageStrings();
        await this.scanApps();
        await this.seedSystemDirectories();
        this.setupDesktopIcons();
        this.setupLanguageListener();
        this.startClock();
        this.loadState();
        this.updateTaskbar();
        this.updateTaskbarUser();
        this.setupAppLaunchListeners();
        this.setupUserSwitchListener();
        this.setupWallpaper();
        this.setupTaskbarAutohideListener();
        this.setupTerminalCommandListener();
        this.setupDesktopClick();
        window.openApp = this.openAppById.bind(this);
        window.installAppFromFile = this.installAppFromFile.bind(this);
        window.getInstalledApps = () => this.apps.filter(a => !this._systemAppPaths.has(a.path));
    }
    async loadLanguageStrings() {
        const lang = localStorage.getItem('webos-language') || 'cmn';
        const langFiles = { cmn: '/languages/cmn.json', eng: '/languages/eng.json', jpn: '/languages/jpn.json' };
        try { const res = await fetch(langFiles[lang] || langFiles.cmn); const data = await res.json(); this.langStrings = data.strings || {}; } catch (e) { this.langStrings = {}; }
    }
    t(key, fallback) { return this.langStrings[key] !== undefined ? this.langStrings[key] : (fallback || key); }
    setupLanguageListener() {
        document.addEventListener('language-changed', async (e) => {
            const { lang, strings } = e.detail || {};
            if (strings) { this.langStrings = strings; } else if (lang) { await this.loadLanguageStrings(); }
            this.updateDesktopIconLabels(); this.updateTaskbar();
        });
    }
    updateDesktopIconLabels() {
        const desktopIcons = this.desktopEl.querySelector('.desktop-icons');
        if (!desktopIcons) return;
        const terminalLabel = desktopIcons.querySelector('#terminal-icon .icon-label');
        if (terminalLabel) terminalLabel.textContent = this.t('app.terminal', '终端');
        const calcLabel = desktopIcons.querySelector('#calculator-icon .icon-label');
        if (calcLabel) calcLabel.textContent = this.t('app.calculator', '计算器');
        const fmLabel = desktopIcons.querySelector('#filemanager-icon .icon-label');
        if (fmLabel) fmLabel.textContent = this.t('app.filemanager', '文件管理器');
        this.apps.forEach(app => {
            const iconEl = desktopIcons.querySelector(`[data-app="${app.id}"]`);
            if (iconEl) { const labelEl = iconEl.querySelector('.icon-label'); if (labelEl) { const key = 'app.' + app.path.replace('.app', ''); labelEl.textContent = this.t(key, app.name); } }
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
            const langFiles = [{ file: 'cmn.json', path: '/languages/cmn.json' }, { file: 'eng.json', path: '/languages/eng.json' }, { file: 'jpn.json', path: '/languages/jpn.json' }];
            for (const lang of langFiles) { if (!langDir.children.find(c => c.name === lang.file)) { try { const res = await fetch(lang.path); const content = await res.text(); langDir.children.push({ type: 'file', name: lang.file, content }); } catch (e) {} } }
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
            const { command, callbackId } = e.detail || {};
            if (!command) return;
            try {
                let terminal = null;
                let termWin = null;
                for (const [winId, term] of this.terminalWindows) { terminal = term; termWin = this.windowManager.getWindow(winId); break; }
                if (!terminal) {
                    termWin = this.openTerminalWindow();
                    await new Promise(r => setTimeout(r, 100));
                    for (const [, term] of this.terminalWindows) { terminal = term; break; }
                }
                if (!terminal) {
                    document.dispatchEvent(new CustomEvent('terminal-command-result', { detail: { callbackId, output: '无法创建终端' } }));
                    return;
                }
                if (termWin) { termWin.focus(); this.centerWindowInView(termWin); }
                const outputLines = [];
                const origPrint = terminal.print.bind(terminal);
                terminal.print = (text, cls) => { outputLines.push(text); origPrint(text, cls); };
                terminal.executeCommand(command);
                terminal.print = origPrint;
                const output = outputLines.join('\n');
                document.dispatchEvent(new CustomEvent('terminal-command-result', { detail: { callbackId, output } }));
            } catch (err) {
                document.dispatchEvent(new CustomEvent('terminal-command-result', { detail: { callbackId, output: '执行出错: ' + err.message } }));
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
        await this.seedSystemDirectories(); await this.loadState(); this.updateTaskbar();
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
            const parts = path.split('/'); const fileName = parts.pop(); const folderPath = parts.join('/') || '/';
            let node = this.storage.fs;
            for (const part of folderPath.split('/').filter(p => p)) { if (!node.children) node.children = []; let child = node.children.find(c => c.name === part && c.type === 'folder'); if (!child) { child = { type: 'folder', name: part, children: [] }; node.children.push(child); } node = child; }
            if (!node.children) node.children = [];
            const existingIndex = node.children.findIndex(c => c.name === fileName && c.type === 'file');
            const fileData = { type: 'file', name: fileName, content: JSON.stringify(state) };
            if (existingIndex !== -1) { node.children[existingIndex] = fileData; } else { node.children.push(fileData); }
            this.storage.saveFS();
        } catch (e) { console.warn('Failed to save GUI state:', e); }
    }
    setupUserSwitchListener() {
        document.addEventListener('request-user-switch', (e) => { this.switchUser(e.detail.username); });
        document.addEventListener('user-avatar-changed', () => { this.updateTaskbarUser(); });
    }
    setupTaskbarUser() {
        const taskbarUser = this.desktopEl.querySelector('#taskbar-user');
        if (taskbarUser) { taskbarUser.addEventListener('click', (e) => { e.stopPropagation(); this.userSwitcher.toggle(); }); }
        document.addEventListener('click', (e) => { if (!this.userSwitcher.el.contains(e.target) && !taskbarUser.contains(e.target)) { this.userSwitcher.hide(); } });
    }
    updateTaskbarUser() {
        const user = this.userManager.getCurrentUser();
        if (user && this.taskbarUserNameEl) { this.taskbarUserNameEl.textContent = user.username; }
        if (user && this.compactTaskbarNameEl) { this.compactTaskbarNameEl.textContent = user.username; }
        if (user && this.compactTaskbarAvatarEl) {
            let avatar = null;
            try { const username = user.username || 'public'; const avatarData = this.storage.loadJSON(`/user/${username}/info/avatar.json`); if (avatarData && avatarData.data) { avatar = avatarData.data; } } catch (e) {}
            if (!avatar) { avatar = localStorage.getItem('webos-user-avatar'); }
            if (avatar) { this.compactTaskbarAvatarEl.innerHTML = `<img src="${avatar}" alt="avatar">`; }
            else { this.compactTaskbarAvatarEl.textContent = (user.username || 'U').charAt(0).toUpperCase(); }
        }
    }
    setupCompactTaskbar() {
        if (!this.compactExpandBtn) return;
        this.compactExpandBtn.addEventListener('click', (e) => { e.stopPropagation(); this.expandTaskbarFromCompact(); });
        if (this.compactTaskbarEl) { const compactUser = this.compactTaskbarEl.querySelector('#taskbar-compact-user'); if (compactUser) { compactUser.addEventListener('click', (e) => { e.stopPropagation(); this.userSwitcher.toggle(); }); } }
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
    setupDesktopPanning() {
        const desktop = this.desktopEl;
        if (!desktop) return;
        desktop.addEventListener('wheel', (e) => {
            const overUI = e.target.closest('.window') || e.target.closest('.desktop-icon') ||
                e.target.closest('.taskbar') || e.target.closest('.taskbar-compact') ||
                e.target.closest('.user-switcher') || e.target.closest('.lock-screen');
            if (overUI && !e.altKey) return;
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
        document.addEventListener('open-file-in-editor', (e) => { const filePath = e.detail.path; this.openAppByPath({ path: 'texteditor.app', name: this.t('app.texteditor', '文本编辑器'), params: { path: filePath } }); });
        document.addEventListener('open-image-viewer', (e) => { const filePath = e.detail.path; this.openAppByPath({ path: 'mediaviewer.app', name: this.t('app.mediaviewer', '媒体查看器'), params: { path: filePath } }); });
        document.addEventListener('open-media-player', (e) => { const filePath = e.detail.path; this.openAppByPath({ path: 'mediaviewer.app', name: this.t('app.mediaviewer', '媒体查看器'), params: { path: filePath } }); });
    }
    async scanApps() {
        try { const res = await fetch('/apps/manifest.json'); if (!res.ok) return; this.apps = await res.json(); this._systemAppPaths = new Set(this.apps.map(a => a.path)); } catch (e) { console.warn('扫描应用失败:', e); this.apps = []; }
    }
    setupDesktopIcons() {
        const desktopIcons = this.desktopEl.querySelector('.desktop-icons');
        const terminalIcon = this.desktopEl.querySelector('#terminal-icon');
        if (terminalIcon) { const label = terminalIcon.querySelector('.icon-label'); if (label) label.textContent = this.t('app.terminal', '终端'); terminalIcon.addEventListener('click', () => { this.openTerminalWindow(); }); }
        const calculatorIcon = this.desktopEl.querySelector('#calculator-icon');
        if (calculatorIcon) { const label = calculatorIcon.querySelector('.icon-label'); if (label) label.textContent = this.t('app.calculator', '计算器'); calculatorIcon.addEventListener('click', () => { this.openAppByPath({ path: 'calculator.app', name: this.t('app.calculator', '计算器') }); }); }
        const filemanagerIcon = this.desktopEl.querySelector('#filemanager-icon');
        if (filemanagerIcon) { const label = filemanagerIcon.querySelector('.icon-label'); if (label) label.textContent = this.t('app.filemanager', '文件管理器'); filemanagerIcon.addEventListener('click', () => { this.openAppByPath({ path: 'filemanager.app', name: this.t('app.filemanager', '文件管理器') }); }); }
        this.apps.forEach(app => {
            let iconEl = desktopIcons.querySelector(`[data-app="${app.id}"]`);
            if (!iconEl) { iconEl = document.createElement('div'); iconEl.className = 'desktop-icon'; iconEl.setAttribute('data-app', app.id); const key = 'app.' + app.path.replace('.app', ''); const displayName = this.t(key, app.name); iconEl.innerHTML = `<div class="icon-image"><img src="/apps/${app.path}/icon.svg" alt="${displayName}" style="width:28px;height:28px;"></div><div class="icon-label">${displayName}</div>`; desktopIcons.appendChild(iconEl); }
            iconEl.addEventListener('click', () => { const key = 'app.' + app.path.replace('.app', ''); this.openAppByPath({ ...app, name: this.t(key, app.name) }); });
        });
    }
    openTerminalWindow(options = {}) {
        const template = document.getElementById('terminal-template');
        const clone = template.content.cloneNode(true);
        const terminalContainer = document.createElement('div');
        terminalContainer.style.flex = '1'; terminalContainer.style.display = 'flex'; terminalContainer.style.flexDirection = 'column'; terminalContainer.appendChild(clone);
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
        const win = this.windowManager.createWindow({ title: app.name, icon: iconUrl, content: contentContainer, width: isMobile ? window.innerWidth : (app.width || info.width || 380), height: isMobile ? (window.innerHeight - 56) : (app.height || info.height || 580), x: isMobile ? 0 : (app.x || 0), y: isMobile ? 0 : (app.y || 0), windowType: 'app', onMoveEnd: () => { this.saveState(); } });
        win.appName = app.name; win.appIcon = iconUrl; win.appPath = app.path; win.appParams = app.params;
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
            const path = this.getStateFilePath(); const parts = path.split('/'); const fileName = parts.pop(); const folderPath = parts.join('/') || '/';
            let node = this.storage.fs;
            for (const part of folderPath.split('/').filter(p => p)) { if (!node.children) node.children = []; let child = node.children.find(c => c.name === part && c.type === 'folder'); if (!child) { child = { type: 'folder', name: part, children: [] }; node.children.push(child); } node = child; }
            if (!node.children) node.children = [];
            const existingIndex = node.children.findIndex(c => c.name === fileName && c.type === 'file');
            const fileData = { type: 'file', name: fileName, content: JSON.stringify(state) };
            if (existingIndex !== -1) { node.children[existingIndex] = fileData; } else { node.children.push(fileData); }
            this.storage.saveFS();
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