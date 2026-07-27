class AppStore {
    constructor() {
        this.apps = [
            {
                id: 'calculator',
                name: '计算器',
                developer: 'WebOS',
                version: '1.0.0',
                description: '功能强大的科学计算器，支持三角函数、对数、开方等运算。',
                category: 'productivity',
                icon: '/apps/calculator.app/icon.svg',
                installed: true
            },
            {
                id: 'texteditor',
                name: '文本编辑器',
                developer: 'WebOS',
                version: '1.0.0',
                description: '简洁高效的文本编辑器，支持语法高亮和多行编辑。',
                category: 'productivity',
                icon: '/apps/texteditor.app/icon.svg',
                installed: true
            },
            {
                id: 'filemanager',
                name: '文件管理器',
                developer: 'WebOS',
                version: '1.0.0',
                description: '管理您的文件和文件夹，支持复制、移动、删除等操作。',
                category: 'system',
                icon: '/apps/filemanager.app/icon.svg',
                installed: true
            },
            {
                id: 'mediaviewer',
                name: '媒体查看器',
                developer: 'WebOS',
                version: '1.0.0',
                description: '查看图片和视频文件，支持多种格式。',
                category: 'media',
                icon: '/apps/mediaviewer.app/icon.svg',
                installed: true
            },
            {
                id: 'browser',
                name: '浏览器',
                developer: 'WebOS',
                version: '1.0.0',
                description: '轻量级网页浏览器，支持前进、后退、刷新等功能。',
                category: 'productivity',
                icon: '/apps/browser.app/icon.svg',
                installed: true
            },
            {
                id: 'wallpaper',
                name: '壁纸设置',
                developer: 'WebOS',
                version: '1.0.0',
                description: '自定义桌面壁纸，支持颜色、渐变和图片。',
                category: 'system',
                icon: '/apps/wallpaper.app/icon.svg',
                installed: true
            },
            {
                id: 'terminal',
                name: '终端',
                developer: 'WebOS',
                version: '1.0.0',
                description: '命令行终端，支持多种Unix命令。',
                category: 'system',
                icon: '/apps/icons/terminal.svg',
                installed: true
            },
            {
                id: 'calendar',
                name: '日历',
                developer: 'WebOS',
                version: '1.0.0',
                description: '查看日期和日程安排。',
                category: 'productivity',
                icon: '/apps/icons/calendar.svg',
                installed: false
            },
            {
                id: 'weather',
                name: '天气',
                developer: 'WebOS',
                version: '1.0.0',
                description: '查看当前天气和天气预报。',
                category: 'productivity',
                icon: '/apps/icons/cloud.svg',
                installed: false
            },
            {
                id: 'notes',
                name: '记事本',
                developer: 'WebOS',
                version: '1.0.0',
                description: '快速记录和管理笔记。',
                category: 'productivity',
                icon: '/apps/icons/note.svg',
                installed: false
            },
            {
                id: 'paint',
                name: '画图',
                developer: 'WebOS',
                version: '1.0.0',
                description: '简单的绘图工具。',
                category: 'media',
                icon: '/apps/icons/pencil.svg',
                installed: false
            },
            {
                id: 'clock',
                name: '时钟',
                developer: 'WebOS',
                version: '1.0.0',
                description: '显示当前时间和闹钟功能。',
                category: 'system',
                icon: '/apps/icons/clock.svg',
                installed: false
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

        this.setupEventListeners();
        this.renderApps();
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
            this.installApp(this.currentApp);
        });
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
            emptyState.textContent = '没有找到匹配的应用';
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
            </div>
            <div class="app-card-name">${app.name}</div>
            <div class="app-card-developer">${app.developer}</div>
            <div class="app-card-description">${app.description}</div>
            <button class="app-card-install ${app.installed ? 'installed' : ''}" onclick="event.stopPropagation();">
                ${app.installed ? '已安装' : '安装'}
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
        this.modalVersion.textContent = `版本 ${app.version}`;
        this.modalDescription.textContent = app.description;

        this.modalInstall.textContent = app.installed ? '已安装' : '安装';
        this.modalInstall.className = `modal-install ${app.installed ? 'installed' : ''}`;

        this.modal.classList.add('show');
    }

    closeModal() {
        this.modal.classList.remove('show');
        this.currentApp = null;
    }

    installApp(app) {
        if (app.installed) return;

        app.installed = true;
        this.modalInstall.textContent = '已安装';
        this.modalInstall.classList.add('installed');
        
        this.renderApps();

        setTimeout(() => {
            this.closeModal();
        }, 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AppStore();
});