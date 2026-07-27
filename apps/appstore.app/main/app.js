class AppStore {
    constructor() {
        this.apps = [
            {
                id: 'calculator',
                name: '计算器',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.1.0',
                description: '功能强大的科学计算器，支持三角函数、对数、开方等运算。',
                category: 'productivity',
                icon: '/apps/calculator.app/icon.svg',
                installed: true,
                hasUpdate: true,
                downloads: 12345,
                rating: 4.5
            },
            {
                id: 'texteditor',
                name: '文本编辑器',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '简洁高效的文本编辑器，支持语法高亮和多行编辑。',
                category: 'productivity',
                icon: '/apps/texteditor.app/icon.svg',
                installed: true,
                hasUpdate: false,
                downloads: 8923,
                rating: 4.3
            },
            {
                id: 'filemanager',
                name: '文件管理器',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.2.0',
                description: '管理您的文件和文件夹，支持复制、移动、删除、网络共享等操作。',
                category: 'system',
                icon: '/apps/filemanager.app/icon.svg',
                installed: true,
                hasUpdate: true,
                downloads: 15678,
                rating: 4.7
            },
            {
                id: 'mediaviewer',
                name: '媒体查看器',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '查看图片和视频文件，支持多种格式。',
                category: 'media',
                icon: '/apps/mediaviewer.app/icon.svg',
                installed: true,
                hasUpdate: false,
                downloads: 6789,
                rating: 4.2
            },
            {
                id: 'browser',
                name: '浏览器',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.1.0',
                description: '轻量级网页浏览器，支持前进、后退、刷新、多标签页等功能。',
                category: 'productivity',
                icon: '/apps/browser.app/icon.svg',
                installed: true,
                hasUpdate: true,
                downloads: 18901,
                rating: 4.4
            },
            {
                id: 'wallpaper',
                name: '壁纸设置',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '自定义桌面壁纸，支持颜色、渐变和图片。',
                category: 'system',
                icon: '/apps/wallpaper.app/icon.svg',
                installed: true,
                hasUpdate: false,
                downloads: 5432,
                rating: 4.1
            },
            {
                id: 'terminal',
                name: '终端',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '命令行终端，支持多种Unix命令。',
                category: 'system',
                icon: '/apps/icons/terminal.svg',
                installed: true,
                hasUpdate: false,
                downloads: 7890,
                rating: 4.6
            },
            {
                id: 'appstore',
                name: '应用商店',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '浏览和安装应用程序。',
                category: 'system',
                icon: '/apps/appstore.app/icon.svg',
                installed: true,
                hasUpdate: false,
                downloads: 10234,
                rating: 4.5
            },
            {
                id: 'calendar',
                name: '日历',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '查看日期和日程安排。',
                category: 'productivity',
                icon: '/apps/icons/calendar.svg',
                installed: false,
                hasUpdate: false,
                downloads: 3456,
                rating: 4.0
            },
            {
                id: 'weather',
                name: '天气',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '查看当前天气和天气预报。',
                category: 'productivity',
                icon: '/apps/icons/cloud.svg',
                installed: false,
                hasUpdate: false,
                downloads: 4567,
                rating: 4.2
            },
            {
                id: 'notes',
                name: '记事本',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '快速记录和管理笔记。',
                category: 'productivity',
                icon: '/apps/icons/note.svg',
                installed: false,
                hasUpdate: false,
                downloads: 2345,
                rating: 4.3
            },
            {
                id: 'paint',
                name: '画图',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '简单的绘图工具，支持多种画笔和颜色。',
                category: 'media',
                icon: '/apps/icons/pencil.svg',
                installed: false,
                hasUpdate: false,
                downloads: 1234,
                rating: 3.9
            },
            {
                id: 'clock',
                name: '时钟',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '显示当前时间和闹钟功能。',
                category: 'system',
                icon: '/apps/icons/clock.svg',
                installed: false,
                hasUpdate: false,
                downloads: 5678,
                rating: 4.4
            },
            {
                id: 'contacts',
                name: '联系人',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '管理您的联系人列表。',
                category: 'productivity',
                icon: '/apps/icons/user.svg',
                installed: false,
                hasUpdate: false,
                downloads: 2341,
                rating: 4.1
            },
            {
                id: 'settings',
                name: '系统设置',
                developer: 'WebOS',
                version: '1.0.0',
                latestVersion: '1.0.0',
                description: '配置系统参数和个性化设置。',
                category: 'system',
                icon: '/apps/icons/settings.svg',
                installed: false,
                hasUpdate: false,
                downloads: 8765,
                rating: 4.0
            }
        ];

        this.currentCategory = 'all';
        this.searchQuery = '';
        this.init();
    }

    init() {
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

        this.setupEventListeners();
        this.renderApps();
        this.checkUpdates();
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

        const stars = '★'.repeat(Math.floor(app.rating)) + '☆'.repeat(5 - Math.floor(app.rating));
        
        card.innerHTML = `
            <div class="app-card-icon">
                <img src="${app.icon}" alt="${app.name}" onerror="this.style.display='none'">
                ${app.hasUpdate ? '<div class="update-indicator">更新</div>' : ''}
            </div>
            <div class="app-card-name">${app.name}</div>
            <div class="app-card-developer">${app.developer}</div>
            <div class="app-card-stats">
                <span class="star-rating">${stars}</span>
                <span class="download-count">${this.formatNumber(app.downloads)} 下载</span>
            </div>
            <div class="app-card-description">${app.description}</div>
            <button class="app-card-install ${app.installed ? (app.hasUpdate ? 'update' : 'installed') : ''}" onclick="event.stopPropagation();">
                ${app.installed ? (app.hasUpdate ? '更新' : '已安装') : '安装'}
            </button>
        `;

        return card;
    }

    formatNumber(num) {
        if (num >= 10000) {
            return (num / 10000).toFixed(1) + '万';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num.toString();
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
            statsContainer.innerHTML = `
                <span class="stat-item">评分: <span class="star-rating">${'★'.repeat(Math.floor(app.rating)) + '☆'.repeat(5 - Math.floor(app.rating))}</span></span>
                <span class="stat-item">下载量: ${this.formatNumber(app.downloads)}</span>
            `;
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

        if (app.installed && !app.hasUpdate) {
            window.parent.openApp(app.id);
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