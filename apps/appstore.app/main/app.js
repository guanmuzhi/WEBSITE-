class AppStore {
    constructor() {
        this.apps = [];
        this.currentCategory = 'all';
        this.searchQuery = '';
        this.init();
    }

    async init() {
        this.searchInput = document.getElementById('search-input');
        this.appGrid = document.getElementById('app-grid');
        this.modal = document.getElementById('app-modal');
        this.modalClose = document.getElementById('modal-close');
        this.modalInstall = document.getElementById('modal-install');
        this.modalIcon = document.getElementById('modal-icon');
        this.modalTitle = document.getElementById('modal-title');
        this.modalDeveloper = document.getElementById('modal-developer');
        this.modalVersion = document.getElementById('modal-version');
        this.modalDescription = document.getElementById('modal-description');
        this.updateBadge = document.getElementById('update-badge');
        this.addAppBtn = document.getElementById('add-app-btn');
        this.appFileInput = document.getElementById('app-file-input');
        this.installToast = document.getElementById('install-toast');

        await this.loadApps();
        this.setupEventListeners();
        this.renderApps();
        this.checkUpdates();
    }

    async loadApps() {
        try {
            const manifestResponse = await fetch('/apps/manifest.json');
            const manifest = await manifestResponse.json();
            
            const apps = [];
            for (const app of manifest) {
                const appInfo = await this.loadAppInfo(app);
                apps.push(appInfo);
            }
            
            try {
                if (window.parent && window.parent.getInstalledApps) {
                    const installedApps = window.parent.getInstalledApps();
                    for (const app of installedApps) {
                        if (!apps.find(a => a.path === app.path)) {
                            apps.push({
                                id: app.id,
                                name: app.name,
                                developer: '用户安装',
                                version: app.version || '1.0.0',
                                latestVersion: app.version || '1.0.0',
                                description: app.description || '用户自行安装的应用',
                                category: app.category || 'productivity',
                                icon: this.getAppIconUrl(app.path),
                                installed: true,
                                hasUpdate: false,
                                userInstalled: true
                            });
                        }
                    }
                }
            } catch (e) {
                console.log('无法获取用户安装的应用:', e);
            }
            
            this.apps = apps;
        } catch (error) {
            console.error('Failed to load apps:', error);
            this.apps = this.getFallbackApps();
        }
    }

    getAppIconUrl(appPath) {
        return 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3498db" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>');
    }

    async loadAppInfo(app) {
        const defaultInfo = {
            id: app.id,
            name: app.name,
            developer: 'WebOS',
            version: app.version || '1.0.0',
            latestVersion: app.version || '1.0.0',
            description: app.description || `使用 ${app.name} 应用`,
            category: app.category || 'productivity',
            icon: `/apps/${app.path}/icon.svg`,
            installed: true,
            hasUpdate: false
        };

        try {
            const infoResponse = await fetch(`/apps/${app.path}/info.json`);
            if (infoResponse.ok) {
                const info = await infoResponse.json();
                return { ...defaultInfo, ...info };
            }
        } catch (error) {
            console.log(`No info.json for ${app.id}`);
        }

        return defaultInfo;
    }

    getFallbackApps() {
        return [
            {
                id: 'calculator',
                name: '计算器',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '功能强大的计算器应用',
                category: 'productivity',
                icon: '/apps/calculator.app/icon.svg',
                installed: true,
                hasUpdate: false
            },
            {
                id: 'filemanager',
                name: '文件管理器',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '管理您的文件和文件夹',
                category: 'system',
                icon: '/apps/filemanager.app/icon.svg',
                installed: true,
                hasUpdate: false
            },
            {
                id: 'browser',
                name: '浏览器',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '轻量级网页浏览器',
                category: 'productivity',
                icon: '/apps/browser.app/icon.svg',
                installed: true,
                hasUpdate: false
            }
        ];
    }

    setupEventListeners() {
        this.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderApps();
        });

        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentCategory = e.target.dataset.category;
                this.renderApps();
            });
        });

        this.modalClose.addEventListener('click', () => {
            this.closeModal();
        });

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });

        this.modalInstall.addEventListener('click', () => {
            this.handleInstallAction(this.currentApp);
        });

        this.addAppBtn.addEventListener('click', () => {
            this.appFileInput.click();
        });

        this.appFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.installAppFromFile(file);
            }
            e.target.value = '';
        });
    }

    async installAppFromFile(file) {
        if (!window.parent || !window.parent.installAppFromFile) {
            this.showToast('安装功能不可用', 'error');
            return;
        }

        this.showToast('正在安装应用...', '');
        this.addAppBtn.disabled = true;

        try {
            const result = await window.parent.installAppFromFile(file);
            if (result.success) {
                this.showToast(`应用 "${result.appName}" 安装成功！`, 'success');
                await this.loadApps();
                this.renderApps();
            } else {
                this.showToast(`安装失败: ${result.error}`, 'error');
            }
        } catch (e) {
            this.showToast(`安装出错: ${e.message}`, 'error');
        } finally {
            this.addAppBtn.disabled = false;
        }
    }

    showToast(message, type = '') {
        this.installToast.textContent = message;
        this.installToast.className = 'install-toast show ' + type;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this.installToast.classList.remove('show');
        }, 3000);
    }

    checkUpdates() {
        const updateCount = this.apps.filter(app => app.installed && app.hasUpdate).length;
        if (this.updateBadge && updateCount > 0) {
            this.updateBadge.textContent = updateCount;
            this.updateBadge.style.display = 'block';
        }
    }

    getFilteredApps() {
        return this.apps.filter(app => {
            const matchesCategory = this.currentCategory === 'all' || app.category === this.currentCategory;
            const matchesSearch = !this.searchQuery || 
                app.name.toLowerCase().includes(this.searchQuery) ||
                app.description.toLowerCase().includes(this.searchQuery) ||
                app.developer.toLowerCase().includes(this.searchQuery);
            return matchesCategory && matchesSearch;
        });
    }

    renderApps() {
        const filteredApps = this.getFilteredApps();
        this.appGrid.innerHTML = '';

        if (filteredApps.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5;">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <div>没有找到匹配的应用</div>
            `;
            this.appGrid.appendChild(emptyState);
            return;
        }

        filteredApps.forEach(app => {
            const card = this.createAppCard(app);
            this.appGrid.appendChild(card);
        });
    }

    createAppCard(app) {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.addEventListener('click', () => this.showAppDetail(app));

        card.innerHTML = `
            <div class="app-card-icon">
                <img src="${app.icon}" alt="${app.name}" onerror="this.style.display='none';this.parentNode.innerHTML='<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;#3498db&quot; stroke-width=&quot;2&quot;><rect x=&quot;3&quot; y=&quot;3&quot; width=&quot;18&quot; height=&quot;18&quot; rx=&quot;2&quot;/></svg>'">
                ${app.hasUpdate ? '<div class="update-indicator">更新</div>' : ''}
            </div>
            <div class="app-card-name">${app.name}</div>
            <div class="app-card-developer">${app.developer}</div>
            <div class="app-card-description">${app.description}</div>
            <button class="app-card-install ${app.installed ? (app.hasUpdate ? 'update' : 'installed') : ''}" onclick="event.stopPropagation();">
                ${app.installed ? (app.hasUpdate ? '更新' : '已安装') : '安装'}
            </button>
        `;

        return card;
    }

    showAppDetail(app) {
        this.currentApp = app;
        
        const img = document.createElement('img');
        img.src = app.icon;
        img.alt = app.name;
        img.onerror = function() { this.style.display = 'none'; };
        this.modalIcon.innerHTML = '';
        this.modalIcon.appendChild(img);

        this.modalTitle.textContent = app.name;
        this.modalDeveloper.textContent = app.developer;
        
        let versionText = `版本 ${app.version}`;
        if (app.hasUpdate) {
            versionText += ` <span style="color:#2ecc71;">(最新: ${app.latestVersion})</span>`;
        }
        this.modalVersion.innerHTML = versionText;
        
        this.modalDescription.textContent = app.description;

        this.modalInstall.textContent = app.installed ? (app.hasUpdate ? '更新' : '已安装') : '安装';
        this.modalInstall.className = `modal-install ${app.installed ? (app.hasUpdate ? 'update' : 'installed') : ''}`;

        this.modal.classList.add('show');
    }

    closeModal() {
        this.modal.classList.remove('show');
        this.currentApp = null;
    }

    handleInstallAction(app) {
        if (!app) return;

        if (app.installed && !app.hasUpdate) {
            if (window.parent && window.parent.openApp) {
                window.parent.openApp(app.id);
            }
            this.closeModal();
            return;
        }

        this.modalInstall.textContent = app.hasUpdate ? '更新中...' : '安装中...';
        this.modalInstall.disabled = true;

        setTimeout(() => {
            if (app.hasUpdate) {
                app.version = app.latestVersion;
                app.hasUpdate = false;
                this.modalInstall.textContent = '已更新';
                this.checkUpdates();
            } else {
                app.installed = true;
                this.modalInstall.textContent = '已安装';
            }
            
            this.modalInstall.classList.remove('update');
            this.modalInstall.classList.add('installed');
            this.modalInstall.disabled = false;
            
            this.renderApps();

            setTimeout(() => {
                this.closeModal();
            }, 1000);
        }, 1500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AppStore();
});