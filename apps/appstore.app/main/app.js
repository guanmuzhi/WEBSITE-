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
            
            this.apps = apps;
        } catch (error) {
            console.error('Failed to load apps:', error);
            this.apps = this.getFallbackApps();
        }
    }

    async loadAppInfo(app) {
        const defaultInfo = {
            id: app.id,
            name: app.name,
            developer: 'WebOS',
            version: '1.0.0',
            latestVersion: '1.0.0',
            description: `使用 ${app.name} 应用`,
            category: 'productivity',
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
                <img src="${app.icon}" alt="${app.name}" onerror="this.style.display='none'">
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

        const statsContainer = document.querySelector('.modal-stats');
        if (statsContainer) {
            statsContainer.style.display = 'none';
        }

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
        
        if (app.installed) {
            if (app.hasUpdate) {
                this.showAlert('应用更新成功');
                app.version = app.latestVersion;
                app.hasUpdate = false;
                this.checkUpdates();
            } else {
                this.showAlert('应用已安装');
            }
        } else {
            this.showAlert(`${app.name} 安装成功`);
            app.installed = true;
        }
        
        this.renderApps();
        this.closeModal();
    }

    showAlert(message) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
        
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
        
        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:14px;color:#ccc;margin-bottom:16px;';
        msg.textContent = message;
        dialog.appendChild(msg);
        
        const okBtn = document.createElement('button');
        okBtn.textContent = '确定';
        okBtn.style.cssText = 'padding:8px 24px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
        okBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        dialog.appendChild(okBtn);
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AppStore();
});