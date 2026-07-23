import UserManager from './user-manager.js?v=3';
import UserSwitcher from './user-switcher.js?v=2';
import LockScreen from './lock-screen.js?v=5';

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
        this.userManager = new UserManager();
        this.userSwitcher = null;
        this.lockScreen = null;
    }

    isMobile() {
        return window.innerWidth < 768;
    }

    getStorageKey() {
        const user = this.userManager.getCurrentUser();
        const username = user ? user.username : 'default';
        return `webos-gui-state-${username}`;
    }

    async init() {
        this.taskbarItemsEl = this.desktopEl.querySelector('.taskbar-items');
        this.taskbarClockEl = this.desktopEl.querySelector('.taskbar-clock');
        this.taskbarUserNameEl = this.desktopEl.querySelector('#taskbar-user-name');

        this.lockScreen = new LockScreen({
            onUnlock: () => {
                this.updateTaskbarUser();
            },
            onUserSwitch: (username) => {
                this.switchUser(username);
            }
        });

        this.userSwitcher = new UserSwitcher({
            onSwitch: (username) => {
                this.switchUser(username);
            },
            onLock: () => {
                this.lock();
            }
        });

        this.setupTaskbarUser();

        await this.scanApps();
        this.setupDesktopIcons();
        this.startClock();
        this.loadState();
        this.updateTaskbar();
        this.updateTaskbarUser();
        
        this.setupAppLaunchListeners();
        this.setupUserSwitchListener();
    }

    switchUser(username) {
        // 先保存当前用户状态（使用当前用户的存储键）
        this.saveState();

        // 关闭所有窗口
        const windows = this.windowManager.getAllWindows();
        windows.forEach(win => {
            if (this.terminalWindows.has(win.id)) {
                this.terminalWindows.delete(win.id);
            }
            win.close();
        });

        // 切换用户
        this.userManager.setCurrentUser(username);
        this.userManager.reload();
        this.updateTaskbarUser();

        // 重置窗口层级并加载新用户状态
        this.windowManager.zIndexCounter = 1;
        this._isLoadingState = true;
        this.loadState();
        this._isLoadingState = false;

        this.updateTaskbar();

        // 通知其他组件（如终端）用户已切换
        document.dispatchEvent(new CustomEvent('user-switched', { detail: { username } }));
    }

    setupUserSwitchListener() {
        // 终端请求切换用户时，由桌面统一执行完整切换流程
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
                name: '文本编辑器',
                params: { path: filePath }
            });
        });

        document.addEventListener('open-image-viewer', (e) => {
            const filePath = e.detail.path;
            this.openAppByPath({ 
                path: 'imageviewer.app', 
                name: '图片查看器',
                params: { path: filePath }
            });
        });

        document.addEventListener('open-media-player', (e) => {
            const filePath = e.detail.path;
            this.openAppByPath({ 
                path: 'mediaplayer.app', 
                name: '影音播放器',
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
            terminalIcon.addEventListener('click', () => {
                this.openTerminalWindow();
            });
        }

        const calculatorIcon = this.desktopEl.querySelector('#calculator-icon');
        if (calculatorIcon) {
            calculatorIcon.addEventListener('click', () => {
                this.openAppByPath({ path: 'calculator.app', name: '计算器' });
            });
        }

        const filemanagerIcon = this.desktopEl.querySelector('#filemanager-icon');
        if (filemanagerIcon) {
            filemanagerIcon.addEventListener('click', () => {
                this.openAppByPath({ path: 'filemanager.app', name: '文件管理器' });
            });
        }

        this.apps.forEach(app => {
            const existingIcon = this.desktopEl.querySelector(`[data-app="${app.id}"]`);
            if (existingIcon) return;
            
            const iconEl = document.createElement('div');
            iconEl.className = 'desktop-icon';
            iconEl.setAttribute('data-app', app.id);
            iconEl.innerHTML = `
                <div class="icon-image">
                    <img src="/apps/${app.path}/icon.svg" alt="${app.name}" style="width:28px;height:28px;">
                </div>
                <div class="icon-label">${app.name}</div>
            `;
            iconEl.addEventListener('click', () => {
                this.openAppByPath(app);
            });
            desktopIcons.appendChild(iconEl);
        });
    }

    openTerminalWindow(options = {}) {
        const template = document.getElementById('terminal-template');
        const clone = template.content.cloneNode(true);
        const terminalContainer = document.createElement('div');
        terminalContainer.appendChild(clone);

        const isMobile = this.isMobile();

        const win = this.windowManager.createWindow({
            title: '终端',
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

        win.appName = '终端';
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
                const shortTitle = '终端 - ' + cleanPath;
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

    async openAppByPath(app) {
        const infoRes = await fetch(`/apps/${app.path}/info.json`);
        let info = { width: 380, height: 580 };
        try { info = await infoRes.json(); } catch (e) {}

        const contentContainer = document.createElement('div');
        contentContainer.style.width = '100%';
        contentContainer.style.height = '100%';
        contentContainer.style.overflow = 'hidden';

        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.display = 'block';
        
        let src = `/apps/${app.path}/main/index.html`;
        if (app.params) {
            const params = new URLSearchParams(app.params);
            src += '?' + params.toString();
        }
        iframe.src = src;

        contentContainer.appendChild(iframe);

        const isMobile = this.isMobile();

        const win = this.windowManager.createWindow({
            title: app.name,
            icon: `/apps/${app.path}/icon.svg`,
            content: contentContainer,
            width: isMobile ? window.innerWidth : (info.width || 380),
            height: isMobile ? (window.innerHeight - 56) : (info.height || 580),
            windowType: 'app',
            onMoveEnd: () => {
                this.saveState();
            }
        });

        win.appName = app.name;
        win.appIcon = `/apps/${app.path}/icon.svg`;

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
        if (this._isLoadingState) return;
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

                    return winState;
                })
            };

            state.windows.sort((a, b) => a.zIndex - b.zIndex);

            localStorage.setItem(this.getStorageKey(), JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save GUI state:', e);
        }
    }

    loadState() {
        try {
            const data = localStorage.getItem(this.getStorageKey());
            if (!data) return;

            const state = JSON.parse(data);
            if (!state.windows || !Array.isArray(state.windows)) return;

            this._isLoadingState = true;

            state.windows.forEach(winState => {
                if (winState.windowType === 'terminal') {
                    this.openTerminalWindow({
                        x: winState.x,
                        y: winState.y,
                        width: winState.width,
                        height: winState.height,
                        initialPath: winState.currentPath
                    });
                }
            });

            const restoredWindows = this.windowManager.getAllWindows();
            state.windows.forEach((winState, index) => {
                const restoredWin = restoredWindows[index];
                if (restoredWin) {
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

            this._isLoadingState = false;
        } catch (e) {
            this._isLoadingState = false;
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
