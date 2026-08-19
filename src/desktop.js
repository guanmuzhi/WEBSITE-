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
        this.clockInterval = null;
        this.terminalWindows = new Map();
        this._isLoadingState = false;
        this.apps = [];
        this.langStrings = {};
        this.userManager = UserManager.getInstance();
        this.storage = StorageService.getInstance();
        this.userSwitcher = null;
        this.lockScreen = null;
    }
    isMobile() {
        return window.innerWidth < 768;
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
        if (window._bootManager && window._bootManager.lockScreen) {
            this.lockScreen = window._bootManager.lockScreen;
            this.lockScreen.onUnlock = () => {
                this.updateTaskbarUser();
            };
            this.lockScreen.onUserSwitch = (username) => {
                this.switchUser(username);
            };
        } else {
            this.lockScreen = new LockScreen({
                onUnlock: () => {
                    this.updateTaskbarUser();
                },
                onUserSwitch: (username) => {
                    this.switchUser(username);
                }
            });
        }
        this.userSwitcher = new UserSwitcher({
            onSwitch: (username) => {
                this.switchUser(username);
            },
            onLock: () => {
                this.lock();
            }
        });
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
        window.openApp = this.openAppById.bind(this);
        window.installAppFromFile = this.installAppFromFile.bind(this);
        window.getInstalledApps = () => this.apps;
    }
    async loadLanguageStrings() {
        const lang = localStorage.getItem('webos-language') || 'cmn';
        const langFiles = { cmn: '/languages/cmn.json', eng: '/languages/eng.json', jpn: '/languages/jpn.json' };
        try {
            const res = await fetch(langFiles[lang] || langFiles.cmn);
            const data = await res.json();
            this.langStrings = data.strings || {};
        } catch (e) {
            this.langStrings = {};
        }
    }
    t(key, fallback) {
        return this.langStrings[key] !== undefined ? this.langStrings[key] : (fallback || key);
    }
    setupLanguageListener() {
        document.addEventListener('language-changed', async (e) => {
            const { lang, strings } = e.detail || {};
            if (strings) {
                this.langStrings = strings;
            } else if (lang) {
                await this.loadLanguageStrings();
            }
            this.updateDesktopIconLabels();
            this.updateTaskbar();
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
            if (iconEl) {
                const labelEl = iconEl.querySelector('.icon-label');
                if (labelEl) {
                    const key = 'app.' + app.path.replace('.app', '');
                    labelEl.textContent = this.t(key, app.name);
                }
            }
        });
    }
    async seedSystemDirectories() {
        try {
            const fs = this.storage.fs;
            if (!fs.children) fs.children = [];
            let appDir = fs.children.find(c => c.name === 'application' && c.type === 'folder');
            if (!appDir) {
                appDir = { type: 'folder', name: 'application', children: [] };
                fs.children.push(appDir);
            }
            if (!appDir.children) appDir.children = [];
            for (const app of this.apps) {
                if (!appDir.children.find(c => c.name === app.path)) {
                    const appFolder = {
                        type: 'folder',
                        name: app.path,
                        children: [
                            { type: 'folder', name: 'main', children: [] }
                        ]
                    };
                    try {
                        const infoRes = await fetch(`/apps/${app.path}/info.json`);
                        if (infoRes.ok) {
                            const infoContent = await infoRes.text();
                            appFolder.children.push({ type: 'file', name: 'info.json', content: infoContent });
                        } else {
                            appFolder.children.push({ type: 'file', name: 'info.json', content: JSON.stringify(app, null, 2) });
                        }
                    } catch (e) {
                        appFolder.children.push({ type: 'file', name: 'info.json', content: JSON.stringify(app, null, 2) });
                    }
                    try {
                        const iconRes = await fetch(`/apps/${app.path}/icon.svg`);
                        if (iconRes.ok) {
                            const iconContent = await iconRes.text();
                            appFolder.children.push({ type: 'file', name: 'icon.svg', content: iconContent });
                        }
                    } catch (e) {}
                    const mainFiles = ['index.html', 'style.css', 'app.js'];
                    const mainFolder = appFolder.children.find(c => c.name === 'main');
                    for (const mf of mainFiles) {
                        try {
                            const res = await fetch(`/apps/${app.path}/main/${mf}`);
                            if (res.ok) {
                                const content = await res.text();
                                mainFolder.children.push({ type: 'file', name: mf, content });
                            }
                        } catch (e) {}
                    }
                    appDir.children.push(appFolder);
                }
            }
            let langDir = fs.children.find(c => c.name === 'languages' && c.type === 'folder');
            if (!langDir) {
                langDir = { type: 'folder', name: 'languages', children: [] };
                fs.children.push(langDir);
            }
            if (!langDir.children) langDir.children = [];
            const langFiles = [
                { file: 'cmn.json', path: '/languages/cmn.json' },
                { file: 'eng.json', path: '/languages/eng.json' },
                { file: 'jpn.json', path: '/languages/jpn.json' }
            ];
            for (const lang of langFiles) {
                if (!langDir.children.find(c => c.name === lang.file)) {
                    try {
                        const res = await fetch(lang.path);
                        const content = await res.text();
                        langDir.children.push({ type: 'file', name: lang.file, content });
                    } catch (e) {}
                }
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
                        let appInfoDir = uDir.children.find(c => c.name === 'appinfo' && c.type === 'folder');
                        if (!appInfoDir) {
                            appInfoDir = { type: 'folder', name: 'appinfo', children: [] };
                            uDir.children.push(appInfoDir);
                        }
                        if (!appInfoDir.children) appInfoDir.children = [];
                        if (!appInfoDir.children.find(c => c.name === 'browser.app')) {
                            appInfoDir.children.push({
                                type: 'folder',
                                name: 'browser.app',
                                children: [
                                    { type: 'file', name: 'history.json', content: '[]' },
                                    { type: 'file', name: 'bookmarks.json', content: '[]' }
                                ]
                            });
                        }
                    }
                }
            }
            this.storage.saveFS();
        } catch (e) {
            console.warn('seedSystemDirectories failed:', e);
        }
    }
    setupWallpaper() {
        this.loadWallpaper();
        document.addEventListener('wallpaper-changed', (e) => {
            const { type, value } = e.detail;
            this.applyWallpaper(type, value);
            this.saveWallpaperToFS(type, value);
        });
    }
    loadWallpaper() {
        try {
            const user = this.userManager.getCurrentUser();
            const username = user ? user.username : 'public';
            const path = `/user/${username}/info/wallpaper.json`;
            const data = this.storage.loadJSON(path);
            if (data) {
                this.applyWallpaper(data.type, data.value);
                return;
            }
        } catch (e) {}
        const saved = localStorage.getItem('webos-wallpaper');
        if (saved) {
            try {
                const wallpaper = JSON.parse(saved);
                this.applyWallpaper(wallpaper.type, wallpaper.value);
            } catch (e) {
                this.applyWallpaper('color', '#1a1a2e');
            }
        }
    }
    saveWallpaperToFS(type, value) {
        try {
            const user = this.userManager.getCurrentUser();
            const username = user ? user.username : 'public';
            const wallpaper = { type, value };
            this.storage.saveJSON(`/user/${username}/info/wallpaper.json`, wallpaper);
        } catch (e) {}
    }
    applyWallpaper(type, value) {
        const desktop = document.getElementById('desktop');
        if (!desktop) return;
        if (type === 'color') {
            desktop.style.background = value;
            desktop.style.backgroundImage = 'none';
        } else if (type === 'gradient') {
            desktop.style.background = value;
        } else if (type === 'image') {
            desktop.style.background = `url(${value}) center/cover fixed`;
        }
    }
    async switchUser(username) {
        const currentUser = this.userManager.getCurrentUser();
        const currentUsername = currentUser ? currentUser.username : 'default';
        window._isSavingDisabled = true;
        this._isLoadingState = true;
        const currentStatePath = `/user/${currentUsername}/info/windows_status.json`;
        this.saveStateToPath(currentStatePath);
        const windows = this.windowManager.getAllWindows();
        windows.forEach(win => {
            if (this.terminalWindows.has(win.id)) {
                this.terminalWindows.delete(win.id);
            }
            win.close();
        });
        this.userManager.setCurrentUser(username);
        this.updateTaskbarUser();
        this.windowManager.zIndexCounter = 1;
        this.storage.reload();
        this.userManager.reload();
        await this.seedSystemDirectories();
        await this.loadState();
        this.updateTaskbar();
        const desktopIcons = this.desktopEl.querySelector('.desktop-icons');
        if (desktopIcons) {
            desktopIcons.style.display = '';
        }
        document.dispatchEvent(new CustomEvent('user-switched', { detail: { username } }));
        setTimeout(() => {
            this._isLoadingState = false;
            window._isSavingDisabled = false;
        }, 3000);
    }
    saveStateToPath(path) {
        try {
            const windows = this.windowManager.getAllWindows();
            const state = {
                windows: windows.map(win => {
                    const winState = {
                        id: win.id,
                        title: win.title,
                        windowType: win.windowType || 'default',
                        x: parseInt(win.element.style.left) || 0,
                        y: parseInt(win.element.style.top) || 0,
                        width: parseInt(win.element.style.width) || 600,
                        height: parseInt(win.element.style.height) || 400,
                        isMinimized: win.isMinimized,
                        zIndex: parseInt(win.element.style.zIndex) || 0
                    };
                    if (win.windowType === 'terminal' && this.terminalWindows.has(win.id)) {
                        const terminal = this.terminalWindows.get(win.id);
                        winState.currentPath = terminal.fs.getCurrentPath();
                    }
                    if (win.windowType === 'app') {
                        winState.appPath = win.appPath;
                        winState.appParams = win.appParams;
                    }
                    return winState;
                })
            };
            state.windows.sort((a, b) => a.zIndex - b.zIndex);
            const parts = path.split('/');
            const fileName = parts.pop();
            const folderPath = parts.join('/') || '/';
            let node = this.storage.fs;
            for (const part of folderPath.split('/').filter(p => p)) {
                if (!node.children) node.children = [];
                let child = node.children.find(c => c.name === part && c.type === 'folder');
                if (!child) {
                    child = { type: 'folder', name: part, children: [] };
                    node.children.push(child);
                }
                node = child;
            }
            if (!node.children) node.children = [];
            const existingIndex = node.children.findIndex(c => c.name === fileName && c.type === 'file');
            const fileData = {
                type: 'file',
                name: fileName,
                content: JSON.stringify(state)
            };
            if (existingIndex !== -1) {
                node.children[existingIndex] = fileData;
            } else {
                node.children.push(fileData);
            }
            this.storage.saveFS();
        } catch (e) {
            console.warn('Failed to save GUI state:', e);
        }
    }
    setupUserSwitchListener() {
        document.addEventListener('request-user-switch', (e) => {
            this.switchUser(e.detail.username);
        });
    }
    setupTaskbarUser() {
        const taskbarUser = this.desktopEl.querySelector('#taskbar-user');
        if (taskbarUser) {
            taskbarUser.addEventListener('click', (e) => {
                e.stopPropagation();
                this.userSwitcher.toggle();
            });
        }
        document.addEventListener('click', (e) => {
            if (!this.userSwitcher.el.contains(e.target) &&
                !taskbarUser.contains(e.target)) {
                this.userSwitcher.hide();
            }
        });
    }
    updateTaskbarUser() {
        const user = this.userManager.getCurrentUser();
        if (user && this.taskbarUserNameEl) {
            this.taskbarUserNameEl.textContent = user.username;
        }
    }
    lock() {
        this.lockScreen.show();
    }
    setupAppLaunchListeners() {
        document.addEventListener('app-launch-real', (e) => {
            const path = e.detail.path;
            const app = { path: path, name: path.replace('.app', '') };
            this.openAppByPath(app);
        });
        document.addEventListener('open-file-in-editor', (e) => {
            const filePath = e.detail.path;
            this.openAppByPath({
                path: 'texteditor.app',
                name: this.t('app.texteditor', '文本编辑器'),
                params: { path: filePath }
            });
        });
        document.addEventListener('open-image-viewer', (e) => {
            const filePath = e.detail.path;
            this.openAppByPath({
                path: 'mediaviewer.app',
                name: this.t('app.mediaviewer', '媒体查看器'),
                params: { path: filePath }
            });
        });
        document.addEventListener('open-media-player', (e) => {
            const filePath = e.detail.path;
            this.openAppByPath({
                path: 'mediaviewer.app',
                name: this.t('app.mediaviewer', '媒体查看器'),
                params: { path: filePath }
            });
        });
    }
    async scanApps() {
        try {
            const res = await fetch('/apps/manifest.json');
            if (!res.ok) return;
            this.apps = await res.json();
        } catch (e) {
            console.warn('扫描应用失败:', e);
            this.apps = [];
        }
    }
    setupDesktopIcons() {
        const desktopIcons = this.desktopEl.querySelector('.desktop-icons');
        const terminalIcon = this.desktopEl.querySelector('#terminal-icon');
        if (terminalIcon) {
            const label = terminalIcon.querySelector('.icon-label');
            if (label) label.textContent = this.t('app.terminal', '终端');
            terminalIcon.addEventListener('click', () => {
                this.openTerminalWindow();
            });
        }
        const calculatorIcon = this.desktopEl.querySelector('#calculator-icon');
        if (calculatorIcon) {
            const label = calculatorIcon.querySelector('.icon-label');
            if (label) label.textContent = this.t('app.calculator', '计算器');
            calculatorIcon.addEventListener('click', () => {
                this.openAppByPath({ path: 'calculator.app', name: this.t('app.calculator', '计算器') });
            });
        }
        const filemanagerIcon = this.desktopEl.querySelector('#filemanager-icon');
        if (filemanagerIcon) {
            const label = filemanagerIcon.querySelector('.icon-label');
            if (label) label.textContent = this.t('app.filemanager', '文件管理器');
            filemanagerIcon.addEventListener('click', () => {
                this.openAppByPath({ path: 'filemanager.app', name: this.t('app.filemanager', '文件管理器') });
            });
        }
        this.apps.forEach(app => {
            let iconEl = this.desktopEl.querySelector(`[data-app="${app.id}"]`);
            if (!iconEl) {
                iconEl = document.createElement('div');
                iconEl.className = 'desktop-icon';
                iconEl.setAttribute('data-app', app.id);
                const key = 'app.' + app.path.replace('.app', '');
                const displayName = this.t(key, app.name);
                iconEl.innerHTML = `
                    <div class="icon-image">
                        <img src="/apps/${app.path}/icon.svg" alt="${displayName}" style="width:28px;height:28px;">
                    </div>
                    <div class="icon-label">${displayName}</div>
                `;
                desktopIcons.appendChild(iconEl);
            }
            iconEl.addEventListener('click', () => {
                const key = 'app.' + app.path.replace('.app', '');
                this.openAppByPath({ ...app, name: this.t(key, app.name) });
            });
        });
    }
    openTerminalWindow(options = {}) {
        const template = document.getElementById('terminal-template');
        const clone = template.content.cloneNode(true);
        const terminalContainer = document.createElement('div');
        terminalContainer.style.flex = '1';
        terminalContainer.style.display = 'flex';
        terminalContainer.style.flexDirection = 'column';
        terminalContainer.appendChild(clone);
        const isMobile = this.isMobile();
        const win = this.windowManager.createWindow({
            title: this.t('app.terminal', '终端'),
            icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23ecf0f1" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
            content: terminalContainer,
            width: isMobile ? window.innerWidth : (options.width || 600),
            height: isMobile ? (window.innerHeight - 56) : (options.height || 400),
            x: isMobile ? 0 : options.x,
            y: isMobile ? 0 : options.y,
            windowType: 'terminal',
            onMoveEnd: () => {
                this.saveState();
            }
        });
        win.appName = this.t('app.terminal', '终端');
        win.appIcon = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23ecf0f1" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
        if (isMobile) {
            win.isMaximized = true;
        }
        const terminalEl = terminalContainer.querySelector('.terminal');
        const terminal = new this.terminalClass({
            container: terminalEl,
            onTitleChange: (fullTitle) => {
                const path = fullTitle.split(':')[1] || fullTitle;
                const cleanPath = path.replace(/^\/+/, '/');
                const shortTitle = this.t('app.terminal', '终端') + ' - ' + cleanPath;
                win.setTitle(shortTitle);
                this.updateTaskbar();
                this.saveState();
            }
        });
        if (options.initialPath) {
            terminal.setPath(options.initialPath);
        }
        this.terminalWindows.set(win.id, terminal);
        const originalClose = win.close;
        win.close = () => {
            originalClose.call(win);
            this.terminalWindows.delete(win.id);
            this.updateTaskbar();
            this.saveState();
        };
        const originalMinimize = win.minimize;
        win.minimize = () => {
            originalMinimize.call(win);
            this.updateTaskbar();
            this.saveState();
        };
        const originalRestore = win.restore;
        win.restore = () => {
            originalRestore.call(win);
            this.updateTaskbar();
            this.saveState();
        };
        const originalFocus = win.focus;
        win.focus = () => {
            originalFocus.call(win);
            this.updateTaskbar();
            this.saveState();
        };
        win.element.addEventListener('mousedown', () => {
            this.updateTaskbar();
        });
        this.updateTaskbar();
        this.saveState();
        return win;
    }
    getAppFromVFS(appPath) {
        const fs = this.storage.fs;
        if (!fs.children) return null;
        const appDir = fs.children.find(c => c.name === 'application' && c.type === 'folder');
        if (!appDir || !appDir.children) return null;
        const appFolder = appDir.children.find(c => c.name === appPath && c.type === 'folder');
        if (!appFolder || !appFolder.children) return null;
        const mainFolder = appFolder.children.find(c => c.name === 'main' && c.type === 'folder');
        if (!mainFolder || !mainFolder.children) return null;
        const indexFile = mainFolder.children.find(c => c.name === 'index.html' && c.type === 'file');
        if (!indexFile) return null;
        const files = {};
        mainFolder.children.forEach(f => {
            if (f.type === 'file') files[f.name] = f.content;
        });
        const infoFile = appFolder.children.find(c => c.name === 'info.json' && c.type === 'file');
        const iconFile = appFolder.children.find(c => c.name === 'icon.svg' && c.type === 'file');
        return {
            files: files,
            info: infoFile ? infoFile.content : null,
            icon: iconFile ? iconFile.content : null
        };
    }
    generateAppHtml(vfsApp) {
        if (!vfsApp || !vfsApp.files) return null;
        let html = vfsApp.files['index.html'] || '<html><body><h1>App load failed</h1></body></html>';
        html = html.replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (match, href) => {
            const fileName = href.split('/').pop();
            if (vfsApp.files[fileName]) {
                return `<style>${vfsApp.files[fileName]}</style>`;
            }
            return match;
        });
        html = html.replace(/<script[^>]*src=["']([^"']+\.js)["'][^>]*><\/script>/gi, (match, src) => {
            const fileName = src.split('/').pop();
            if (vfsApp.files[fileName]) {
                return `<script>${vfsApp.files[fileName]}</script>`;
            }
            return match;
        });
        html = html.replace(/<img[^>]*src=["']([^"']+\.svg)["'][^>]*>/gi, (match, src) => {
            const fileName = src.split('/').pop();
            if (vfsApp.files[fileName]) {
                const svgContent = vfsApp.files[fileName];
                return match.replace(src, `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`);
            }
            return match;
        });
        return html;
    }
    async installAppFromFile(file) {
        if (!window.JSZip) {
            return { success: false, error: 'JSZip 未加载' };
        }
        try {
            const arrayBuffer = await file.arrayBuffer();
            const zip = await window.JSZip.loadAsync(arrayBuffer);
            const requiredFiles = ['main/index.html', 'info.json', 'icon.svg'];
            const missing = requiredFiles.filter(f => !zip.files[f]);
            if (missing.length > 0) {
                return { success: false, error: `缺少必需文件: ${missing.join(', ')}` };
            }
            const infoText = await zip.file('info.json').async('text');
            let info;
            try {
                info = JSON.parse(infoText);
            } catch (e) {
                return { success: false, error: 'info.json 格式无效' };
            }
            const appPath = info.id ? `${info.id}.app` : file.name.replace(/\.app$/i, '.app').replace(/\.zip$/i, '.app');
            const appName = info.name || appPath.replace('.app', '');
            const mainFiles = {};
            for (const [filePath, zipFile] of Object.entries(zip.files)) {
                if (filePath.startsWith('main/') && !zipFile.dir) {
                    const relativePath = filePath.substring('main/'.length);
                    mainFiles[relativePath] = await zipFile.async('text');
                }
            }
            const iconContent = await zip.file('icon.svg').async('text');
            const fs = this.storage.fs;
            if (!fs.children) fs.children = [];
            let appDir = fs.children.find(c => c.name === 'application' && c.type === 'folder');
            if (!appDir) {
                appDir = { type: 'folder', name: 'application', children: [] };
                fs.children.push(appDir);
            }
            if (!appDir.children) appDir.children = [];
            appDir.children = appDir.children.filter(c => c.name !== appPath);
            const mainChildren = [];
            for (const [name, content] of Object.entries(mainFiles)) {
                mainChildren.push({ type: 'file', name, content });
            }
            const appFolder = {
                type: 'folder',
                name: appPath,
                children: [
                    { type: 'folder', name: 'main', children: mainChildren },
                    { type: 'file', name: 'info.json', content: infoText },
                    { type: 'file', name: 'icon.svg', content: iconContent }
                ]
            };
            appDir.children.push(appFolder);
            this.storage.saveFS();
            if (!this.apps.find(a => a.path === appPath)) {
                this.apps.push({
                    id: info.id || appPath.replace('.app', ''),
                    name: appName,
                    path: appPath,
                    description: info.description || '',
                    category: info.category || 'productivity',
                    version: info.version || '1.0.0'
                });
            }
            this.setupDesktopIcons();
            return { success: true, appPath, appName };
        } catch (e) {
            return { success: false, error: `安装失败: ${e.message}` };
        }
    }
    openAppById(appId) {
        const app = this.apps.find(a => a.id === appId || a.path === `${appId}.app`);
        if (app) {
            this.openAppByPath(app);
        }
    }
    async openAppByPath(app) {
        const vfsApp = this.getAppFromVFS(app.path);
        let info = { width: 380, height: 580 };
        let iconUrl = `/apps/${app.path}/icon.svg`;
        if (vfsApp && vfsApp.info) {
            try { info = JSON.parse(vfsApp.info); } catch (e) {}
        } else {
            try {
                const infoRes = await fetch(`/apps/${app.path}/info.json`);
                if (infoRes.ok) info = await infoRes.json();
            } catch (e) {}
        }
        if (vfsApp && vfsApp.icon) {
            iconUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(vfsApp.icon)))}`;
        }
        const contentContainer = document.createElement('div');
        contentContainer.style.width = '100%';
        contentContainer.style.height = '100%';
        contentContainer.style.overflow = 'hidden';
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.display = 'block';
        if (vfsApp) {
            const appHtml = this.generateAppHtml(vfsApp);
            if (appHtml) {
                iframe.srcdoc = appHtml;
            } else {
                iframe.src = `/apps/${app.path}/main/index.html`;
            }
        } else {
            let src = `/apps/${app.path}/main/index.html`;
            if (app.params) {
                const params = new URLSearchParams(app.params);
                src += '?' + params.toString();
            }
            iframe.src = src;
        }
        contentContainer.appendChild(iframe);
        const isMobile = this.isMobile();
        const win = this.windowManager.createWindow({
            title: app.name,
            icon: iconUrl,
            content: contentContainer,
            width: isMobile ? window.innerWidth : (app.width || info.width || 380),
            height: isMobile ? (window.innerHeight - 56) : (app.height || info.height || 580),
            x: isMobile ? 0 : (app.x || 0),
            y: isMobile ? 0 : (app.y || 0),
            windowType: 'app',
            onMoveEnd: () => {
                this.saveState();
            }
        });
        win.appName = app.name;
        win.appIcon = iconUrl;
        win.appPath = app.path;
        win.appParams = app.params;
        const originalClose = win.close;
        win.close = () => {
            originalClose.call(win);
            this.updateTaskbar();
            this.saveState();
        };
        const originalMinimize = win.minimize;
        win.minimize = () => {
            originalMinimize.call(win);
            this.updateTaskbar();
            this.saveState();
        };
        const originalRestore = win.restore;
        win.restore = () => {
            originalRestore.call(win);
            this.updateTaskbar();
            this.saveState();
        };
        const originalFocus = win.focus;
        win.focus = () => {
            originalFocus.call(win);
            this.updateTaskbar();
            this.saveState();
        };
        win.element.addEventListener('mousedown', () => {
            this.updateTaskbar();
        });
        this.updateTaskbar();
        this.saveState();
        return win;
    }
    updateTaskbar() {
        if (!this.taskbarItemsEl) return;
        const windows = this.windowManager.getAllWindows();
        this.taskbarItemsEl.innerHTML = '';
        const topWindow = this._getTopWindow();
        windows.forEach(win => {
            const item = document.createElement('div');
            item.className = 'taskbar-item';
            const iconEl = document.createElement('img');
            iconEl.className = 'taskbar-icon';
            iconEl.src = win.appIcon || '';
            iconEl.alt = win.appName || win.title || '窗口';
            iconEl.style.width = '20px';
            iconEl.style.height = '20px';
            item.appendChild(iconEl);
            if (topWindow && win.id === topWindow.id && !win.isMinimized) {
                item.classList.add('active');
            }
            item.addEventListener('click', () => {
                if (win.isMinimized) {
                    win.restore();
                } else if (topWindow && win.id === topWindow.id) {
                    win.minimize();
                } else {
                    win.focus();
                }
            });
            this.taskbarItemsEl.appendChild(item);
        });
    }
    _getTopWindow() {
        const windows = this.windowManager.getAllWindows();
        if (windows.length === 0) return null;
        let topWin = null;
        let maxZIndex = -1;
        windows.forEach(win => {
            if (win.isMinimized) return;
            const zIndex = parseInt(win.element.style.zIndex) || 0;
            if (zIndex > maxZIndex) {
                maxZIndex = zIndex;
                topWin = win;
            }
        });
        return topWin;
    }
    saveState() {
        if (window._isSavingDisabled) {
            return;
        }
        if (this._isLoadingState) {
            return;
        }
        try {
            const windows = this.windowManager.getAllWindows();
            const state = {
                windows: windows.map(win => {
                    const winState = {
                        id: win.id,
                        title: win.title,
                        windowType: win.windowType || 'default',
                        x: parseInt(win.element.style.left) || 0,
                        y: parseInt(win.element.style.top) || 0,
                        width: parseInt(win.element.style.width) || 600,
                        height: parseInt(win.element.style.height) || 400,
                        isMinimized: win.isMinimized,
                        zIndex: parseInt(win.element.style.zIndex) || 0
                    };
                    if (win.windowType === 'terminal' && this.terminalWindows.has(win.id)) {
                        const terminal = this.terminalWindows.get(win.id);
                        winState.currentPath = terminal.fs.getCurrentPath();
                    }
                    if (win.windowType === 'app') {
                        winState.appPath = win.appPath;
                        winState.appParams = win.appParams;
                    }
                    return winState;
                })
            };
            state.windows.sort((a, b) => a.zIndex - b.zIndex);
            const path = this.getStateFilePath();
            const parts = path.split('/');
            const fileName = parts.pop();
            const folderPath = parts.join('/') || '/';
            let node = this.storage.fs;
            for (const part of folderPath.split('/').filter(p => p)) {
                if (!node.children) node.children = [];
                let child = node.children.find(c => c.name === part && c.type === 'folder');
                if (!child) {
                    child = { type: 'folder', name: part, children: [] };
                    node.children.push(child);
                }
                node = child;
            }
            if (!node.children) node.children = [];
            const existingIndex = node.children.findIndex(c => c.name === fileName && c.type === 'file');
            const fileData = {
                type: 'file',
                name: fileName,
                content: JSON.stringify(state)
            };
            if (existingIndex !== -1) {
                node.children[existingIndex] = fileData;
            } else {
                node.children.push(fileData);
            }
            this.storage.saveFS();
        } catch (e) {
            console.warn('Failed to save GUI state:', e);
        }
    }
    async loadState() {
        try {
            this.storage.reload();
            const data = this.storage.loadJSON(this.getStateFilePath());
            if (!data) return;
            const state = data;
            if (!state.windows || !Array.isArray(state.windows)) return;
            this._isLoadingState = true;
            for (const winState of state.windows) {
                if (winState.windowType === 'terminal') {
                    this.openTerminalWindow({
                        x: winState.x,
                        y: winState.y,
                        width: winState.width,
                        height: winState.height,
                        initialPath: winState.currentPath
                    });
                } else if (winState.windowType === 'app' && winState.appPath) {
                    await this.openAppByPath({
                        path: winState.appPath,
                        name: winState.title,
                        params: winState.appParams,
                        x: winState.x,
                        y: winState.y,
                        width: winState.width,
                        height: winState.height
                    });
                }
            }
            const restoredWindows = this.windowManager.getAllWindows();
            state.windows.forEach((winState, index) => {
                const restoredWin = restoredWindows[index];
                if (restoredWin) {
                    restoredWin.element.style.left = winState.x + 'px';
                    restoredWin.element.style.top = winState.y + 'px';
                    restoredWin.element.style.width = winState.width + 'px';
                    restoredWin.element.style.height = winState.height + 'px';
                    restoredWin.element.style.zIndex = winState.zIndex;
                    if (winState.isMinimized) {
                        restoredWin.isMinimized = true;
                        restoredWin.element.style.display = 'none';
                    }
                }
            });
            this.updateTaskbar();
            const maxZIndex = state.windows.reduce((max, w) => Math.max(max, w.zIndex), 0);
            this.windowManager.zIndexCounter = maxZIndex + 1;
        } catch (e) {
            console.warn('Failed to load GUI state:', e);
        }
    }
    startClock() {
        this._updateClock();
        this.clockInterval = setInterval(() => {
            this._updateClock();
        }, 1000);
    }
    _updateClock() {
        if (!this.taskbarClockEl) return;
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        this.taskbarClockEl.textContent = `${hours}:${minutes}:${seconds}`;
    }
}
export default DesktopManager;