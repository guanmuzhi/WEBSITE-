class AppStore {
    constructor() { this.languagePack = { strings: {} }; this.currentLang = localStorage.getItem('webos-language') || 'cmn'; this.apps = []; this.currentCategory = 'all'; this.searchQuery = ''; this.init(); }
    async init() {
        await this.loadLanguagePack(this.currentLang);
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
        await this.loadApps();
        this.setupEventListeners();
        this.renderApps();
        this.checkUpdates();
        this.applyLanguage();
        this.registerLanguageListener();
    }
    async loadLanguagePack(lang) {
        const langFiles = { cmn: '/apps/appstore.app/main/language/appstore_cmn.json', eng: '/apps/appstore.app/main/language/appstore_eng.json', jpn: '/apps/appstore.app/main/language/appstore_jpn.json' };
        try {
            const res = await fetch(langFiles[lang] || langFiles.cmn);
            this.languagePack = await res.json();
            this.currentLang = lang;
            localStorage.setItem('webos-language', lang);
        } catch (e) {
            this.languagePack = { strings: {} };
        }
    }
    t(key, fallback) { const s = this.languagePack.strings || {}; return s[key] !== undefined ? s[key] : (fallback || key); }
    fmt(key, vars) { let s = this.t(key); if (vars) { for (const k in vars) { s = s.split('{' + k + '}').join(String(vars[k])); } } return s; }
    applyLanguage() {
        const strings = this.languagePack.strings || {};
        document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if (strings[key] !== undefined) el.textContent = strings[key]; });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { const key = el.getAttribute('data-i18n-placeholder'); if (strings[key] !== undefined) el.placeholder = strings[key]; });
        document.querySelectorAll('[data-i18n-title]').forEach(el => { const key = el.getAttribute('data-i18n-title'); if (strings[key] !== undefined) el.title = strings[key]; });
        if (strings['app.appstore']) document.title = strings['app.appstore'];
    }
    registerLanguageListener() {
        window.addEventListener('language-changed', (e) => {
            this.currentLang = (e && e.detail && e.detail.lang) || localStorage.getItem('webos-language') || 'cmn';
            this.loadLanguagePack(this.currentLang).then(() => {
                this.applyLanguage();
                this.renderApps();
                this.checkUpdates();
                if (this.currentApp) this.showAppDetail(this.currentApp);
            });
        });
    }
    async loadApps() {
        try {
            const manifestResponse = await fetch('/apps/manifest.json');
            const manifest = await manifestResponse.json();
            const apps = [];
            for (const app of manifest) { const appInfo = await this.loadAppInfo(app); apps.push(appInfo); }
            try {
                if (window.parent && window.parent.getInstalledApps) {
                    const installedApps = window.parent.getInstalledApps();
                    for (const app of installedApps) {
                        if (!apps.find(a => a.path === app.path || a.id === app.id)) {
                            apps.push({ id: app.id, name: app.name, path: app.path, developer: this.t('appstore.user_installed_developer'), version: app.version || '1.0.0', latestVersion: app.version || '1.0.0', description: app.description || this.t('appstore.user_installed_description'), category: app.category || 'productivity', icon: this.getAppIconUrl(app.path), installed: true, hasUpdate: false, userInstalled: true });
                        }
                    }
                }
            } catch (e) { console.log('无法获取用户安装的应用:', e); }
            this.apps = apps;
        } catch (error) { console.error('Failed to load apps:', error); this.apps = this.getFallbackApps(); }
    }
    getAppIconUrl(appPath) { return 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3498db" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>'); }
    async loadAppInfo(app) {
        const defaultInfo = { id: app.id, name: app.name, path: app.path, developer: this.t('appstore.developer_default'), version: app.version || '1.0.0', latestVersion: app.version || '1.0.0', description: app.description || this.fmt('appstore.use_app', { name: app.name }), category: app.category || 'productivity', icon: `/apps/${app.path}/icon.svg`, installed: true, hasUpdate: false };
        try { const infoResponse = await fetch(`/apps/${app.path}/info.json`); if (infoResponse.ok) { const info = await infoResponse.json(); return { ...defaultInfo, ...info }; } } catch (error) { console.log(`No info.json for ${app.id}`); }
        return defaultInfo;
    }
    getFallbackApps() { return [{ id: 'calculator', name: this.t('appstore.app_calculator_name'), path: 'calculator.app', developer: this.t('appstore.developer_default'), version: '1.0.0', latestVersion: '1.0.0', description: this.t('appstore.calculator_desc'), category: 'productivity', icon: '/apps/calculator.app/icon.svg', installed: true, hasUpdate: false }, { id: 'filemanager', name: this.t('appstore.app_filemanager_name'), path: 'filemanager.app', developer: this.t('appstore.developer_default'), version: '1.0.0', latestVersion: '1.0.0', description: this.t('appstore.filemanager_desc'), category: 'system', icon: '/apps/filemanager.app/icon.svg', installed: true, hasUpdate: false }, { id: 'browser', name: this.t('appstore.app_browser_name'), path: 'browser.app', developer: this.t('appstore.developer_default'), version: '1.0.0', latestVersion: '1.0.0', description: this.t('appstore.browser_desc'), category: 'productivity', icon: '/apps/browser.app/icon.svg', installed: true, hasUpdate: false }]; }
    setupEventListeners() {
        this.searchInput.addEventListener('input', (e) => { this.searchQuery = e.target.value.toLowerCase(); this.renderApps(); });
        document.querySelectorAll('.category-btn').forEach(btn => { btn.addEventListener('click', (e) => { document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); this.currentCategory = e.target.dataset.category; this.renderApps(); }); });
        this.modalClose.addEventListener('click', () => this.closeModal());
        this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this.closeModal(); });
        this.modalInstall.addEventListener('click', () => this.handleInstallAction(this.currentApp));
        this.addAppBtn.addEventListener('click', () => this.appFileInput.click());
        this.appFileInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) await this.installAppFromFile(file); e.target.value = ''; });
    }
    async installAppFromFile(file) {
        if (!window.parent || !window.parent.installAppFromFile) { this.showDialog(this.t('appstore.install_failed_title'), this.t('appstore.install_unavailable'), 'error'); return; }
        this.showDialog(this.t('appstore.installing_title'), this.t('appstore.parsing_package'), 'info');
        this.addAppBtn.disabled = true;
        try {
            const result = await window.parent.installAppFromFile(file);
            if (result.success) { this.showDialog(this.t('appstore.install_success_title'), this.fmt('appstore.app_installed_success', { name: result.appName }), 'success'); await this.loadApps(); this.renderApps(); }
            else { this.showDialog(this.t('appstore.install_failed_title'), result.error || this.t('appstore.unknown_error'), 'error'); }
        } catch (e) { this.showDialog(this.t('appstore.install_error'), e.message, 'error'); }
        finally { this.addAppBtn.disabled = false; }
    }
    showDialog(title, message, type = 'info') {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:2000;';
        const dialog = document.createElement('div');
        const colors = { success: '#2ecc71', error: '#e74c3c', info: '#3498db' };
        const color = colors[type] || colors.info;
        dialog.style.cssText = `background:#1e1e2e;border:1px solid ${color}40;border-radius:12px;padding:28px;width:340px;color:#ddd;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;
        const icon = document.createElement('div');
        icon.style.cssText = `width:48px;height:48px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px;color:${color};`;
        icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
        dialog.appendChild(icon);
        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:8px;color:#eee;text-align:center;';
        titleEl.textContent = title;
        dialog.appendChild(titleEl);
        const msgEl = document.createElement('div');
        msgEl.style.cssText = 'font-size:14px;color:#aaa;margin-bottom:20px;text-align:center;line-height:1.5;';
        msgEl.textContent = message;
        dialog.appendChild(msgEl);
        const okBtn = document.createElement('button');
        okBtn.textContent = this.t('appstore.ok');
        okBtn.style.cssText = `width:100%;padding:10px;background:${color};border:none;border-radius:6px;color:#fff;font-size:14px;cursor:pointer;font-family:inherit;font-weight:500;`;
        okBtn.addEventListener('click', () => document.body.removeChild(overlay));
        dialog.appendChild(okBtn);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
    }
    checkUpdates() { const updateCount = this.apps.filter(app => app.installed && app.hasUpdate).length; if (this.updateBadge && updateCount > 0) { this.updateBadge.textContent = updateCount; this.updateBadge.style.display = 'block'; } }
    getFilteredApps() { return this.apps.filter(app => { const matchesCategory = this.currentCategory === 'all' || app.category === this.currentCategory; const matchesSearch = !this.searchQuery || app.name.toLowerCase().includes(this.searchQuery) || app.description.toLowerCase().includes(this.searchQuery) || app.developer.toLowerCase().includes(this.searchQuery); return matchesCategory && matchesSearch; }); }
    renderApps() {
        const filteredApps = this.getFilteredApps();
        this.appGrid.innerHTML = '';
        if (filteredApps.length === 0) { const emptyState = document.createElement('div'); emptyState.className = 'empty-state'; emptyState.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;margin-bottom:16px;opacity:0.5;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div>' + this.t('appstore.no_matching_apps') + '</div>'; this.appGrid.appendChild(emptyState); return; }
        filteredApps.forEach(app => this.appGrid.appendChild(this.createAppCard(app)));
    }
    createAppCard(app) {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.addEventListener('click', () => this.showAppDetail(app));
        card.innerHTML = `<div class="app-card-icon"><img src="${app.icon}" alt="${app.name}" onerror="this.style.display='none';this.parentNode.innerHTML='<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;#3498db&quot; stroke-width=&quot;2&quot;><rect x=&quot;3&quot; y=&quot;3&quot; width=&quot;18&quot; height=&quot;18&quot; rx=&quot;2&quot;/></svg>'">${app.hasUpdate ? '<div class="update-indicator">' + this.t('appstore.update') + '</div>' : ''}</div><div class="app-card-name">${app.name}</div><div class="app-card-developer">${app.developer}</div><div class="app-card-description">${app.description}</div><button class="app-card-install ${app.installed ? (app.hasUpdate ? 'update' : 'installed') : ''}" onclick="event.stopPropagation();">${app.installed ? (app.hasUpdate ? this.t('appstore.update') : this.t('appstore.installed')) : this.t('appstore.install')}</button>`;
        return card;
    }
    showAppDetail(app) {
        this.currentApp = app;
        const img = document.createElement('img');
        img.src = app.icon; img.alt = app.name;
        img.onerror = function() { this.style.display = 'none'; };
        this.modalIcon.innerHTML = '';
        this.modalIcon.appendChild(img);
        this.modalTitle.textContent = app.name;
        this.modalDeveloper.textContent = app.developer;
        let versionText = this.fmt('appstore.version_prefix') + app.version;
        if (app.hasUpdate) versionText += ' <span style="color:#2ecc71;">' + this.fmt('appstore.latest_version_suffix', { version: app.latestVersion }) + '</span>';
        this.modalVersion.innerHTML = versionText;
        this.modalDescription.textContent = app.description;
        this.modalInstall.textContent = app.installed ? (app.hasUpdate ? this.t('appstore.update') : this.t('appstore.installed')) : this.t('appstore.install');
        this.modalInstall.className = `modal-install ${app.installed ? (app.hasUpdate ? 'update' : 'installed') : ''}`;
        this.modal.classList.add('show');
    }
    closeModal() { this.modal.classList.remove('show'); this.currentApp = null; }
    handleInstallAction(app) {
        if (!app) return;
        if (app.installed && !app.hasUpdate) { if (window.parent && window.parent.openApp) window.parent.openApp(app.id); this.closeModal(); return; }
        this.modalInstall.textContent = app.hasUpdate ? this.t('appstore.updating') : this.t('appstore.installing');
        this.modalInstall.disabled = true;
        setTimeout(() => {
            if (app.hasUpdate) { app.version = app.latestVersion; app.hasUpdate = false; this.modalInstall.textContent = this.t('appstore.updated'); this.checkUpdates(); }
            else { app.installed = true; this.modalInstall.textContent = this.t('appstore.installed'); }
            this.modalInstall.classList.remove('update');
            this.modalInstall.classList.add('installed');
            this.modalInstall.disabled = false;
            this.renderApps();
            setTimeout(() => this.closeModal(), 1000);
        }, 1500);
    }
}
document.addEventListener('DOMContentLoaded', () => { new AppStore(); });