/**
 * WebOS Browser App
 * Storage: per-user, in VFS at /user/<username>/appinfo/browser.app/
 *   - history.json   : browsing history
 *   - bookmarks.json : bookmark tree (folders + bookmarks)
 */
class Browser {
    constructor() {
        this.backBtn = document.getElementById('back-btn');
        this.forwardBtn = document.getElementById('forward-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
        this.newTabBtn = document.getElementById('new-tab-btn');
        this.historyBtn = document.getElementById('history-btn');
        this.bookmarkBtn = document.getElementById('bookmark-btn');
        this.addressInput = document.getElementById('address-input');
        this.goBtn = document.getElementById('go-btn');
        this.browserFrame = document.getElementById('browser-frame');
        this.statusText = document.getElementById('status-text');
        this.tabsContainer = document.getElementById('tabs-container');
        this.contentArea = document.getElementById('content-area');
        this.iframeError = document.getElementById('iframe-error');
        this.errorMessage = document.getElementById('error-message');
        this.retryBtn = document.getElementById('retry-btn');
        this.openExternalBtn = document.getElementById('open-external-btn');
        this.bookmarksBar = document.getElementById('bookmarks-bar');
        this.historySidebar = document.getElementById('history-sidebar');
        this.historyList = document.getElementById('history-list');
        this.closeHistoryBtn = document.getElementById('close-history');
        this.clearHistoryBtn = document.getElementById('clear-history');
        this.tabs = [];
        this.currentTabIndex = 0;
        this.tabIdCounter = 1;
        this.lastUrl = null;
        this.storage = null;
        this.userManager = null;
        this.currentUsername = null;
        this._initStorage();
        this.history = [];
        this.bookmarks = [];
        this._loadData();
        this.init();
    }
    _initStorage() {
        try {
            this.storage = window.parent.StorageService.getInstance();
            this.userManager = window.parent.UserManager.getInstance();
            const user = this.userManager.getCurrentUser();
            this.currentUsername = user ? user.username : 'public';
        } catch (e) {
            console.warn('Browser: cannot access parent VFS, falling back to localStorage', e);
            this.storage = null; this.userManager = null; this.currentUsername = 'public';
        }
    }
    _getAppDir() { return `/user/${this.currentUsername}/appinfo/browser.app`; }
    _ensureAppDir() { if (!this.storage) return; this.storage.createPath(this._getAppDir()); }
    _loadData() { this._loadHistory(); this._loadBookmarks(); }
    _loadHistory() {
        if (this.storage) {
            this._ensureAppDir();
            const data = this.storage.loadJSON(`${this._getAppDir()}/history.json`);
            if (data && Array.isArray(data)) { this.history = data; return; }
        }
        try {
            const saved = localStorage.getItem('webos-browser-history');
            if (saved) { this.history = JSON.parse(saved); this._saveHistory(); localStorage.removeItem('webos-browser-history'); return; }
        } catch (e) {}
        this.history = [];
    }
    _saveHistory() {
        if (this.storage) { this._ensureAppDir(); this.storage.saveJSON(`${this._getAppDir()}/history.json`, this.history); }
        else { try { localStorage.setItem('webos-browser-history', JSON.stringify(this.history)); } catch (e) {} }
    }
    _loadBookmarks() {
        if (this.storage) {
            this._ensureAppDir();
            const data = this.storage.loadJSON(`${this._getAppDir()}/bookmarks.json`);
            if (data && Array.isArray(data)) { this.bookmarks = data; return; }
        }
        try {
            const saved = localStorage.getItem('webos-browser-bookmarks');
            if (saved) {
                const flat = JSON.parse(saved);
                this.bookmarks = flat.map(b => ({ id: 'bm_' + Math.random().toString(36).slice(2, 9), type: 'bookmark', name: b.name, url: b.url }));
                this._saveBookmarks(); localStorage.removeItem('webos-browser-bookmarks'); return;
            }
        } catch (e) {}
        this.bookmarks = [
            { id: 'bm_default_1', type: 'bookmark', name: 'Example', url: 'https://example.com' },
            { id: 'bm_default_2', type: 'bookmark', name: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com' },
            { id: 'bm_default_3', type: 'bookmark', name: 'HTTPBin', url: 'https://httpbin.org' }
        ];
        this._saveBookmarks();
    }
    _saveBookmarks() {
        if (this.storage) { this._ensureAppDir(); this.storage.saveJSON(`${this._getAppDir()}/bookmarks.json`, this.bookmarks); }
        else {
            const flat = [];
            const flatten = (nodes) => { nodes.forEach(n => { if (n.type === 'bookmark') flat.push({ name: n.name, url: n.url }); if (n.type === 'folder' && n.children) flatten(n.children); }); };
            flatten(this.bookmarks);
            try { localStorage.setItem('webos-browser-bookmarks', JSON.stringify(flat)); } catch (e) {}
        }
    }
    init() {
        this.backBtn.addEventListener('click', () => this.goBack());
        this.forwardBtn.addEventListener('click', () => this.goForward());
        this.refreshBtn.addEventListener('click', () => this.refresh());
        this.newTabBtn.addEventListener('click', () => this.openNewTab());
        this.historyBtn.addEventListener('click', () => this.toggleHistory());
        this.bookmarkBtn.addEventListener('click', () => this.toggleBookmark());
        this.closeHistoryBtn.addEventListener('click', () => this.toggleHistory());
        this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        this.goBtn.addEventListener('click', () => this.navigate());
        this.addressInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.navigate(); });
        this._originalWindowOpen = window.open.bind(window);
        window.open = (url, target, features) => { if (url && typeof url === 'string' && (target === '_blank' || !target)) { this.openNewTabWithUrl(url); return null; } return this._originalWindowOpen(url, target, features); };
        this.browserFrame.addEventListener('load', () => this.onPageLoad());
        this.retryBtn.addEventListener('click', () => { this.hideError(); this.refresh(); });
        this.openExternalBtn.addEventListener('click', () => { const currentTab = this.tabs[this.currentTabIndex]; if (currentTab && currentTab.url && currentTab.url !== 'about:blank') { this._originalWindowOpen(currentTab.url, '_blank', 'noopener,noreferrer'); } this.hideError(); });
        document.addEventListener('user-switched', (e) => { if (e.detail && e.detail.username) { this.currentUsername = e.detail.username; this._loadData(); this.renderBookmarks(); this.renderHistory(); } });
        this.renderBookmarks();
        this.renderHistory();
        this.addNewTab('about:blank', '新标签页');
        this.updateNavButtons();
    }
    toggleHistory() { if (this.historySidebar.style.display === 'block') { this.historySidebar.style.display = 'none'; } else { this.historySidebar.style.display = 'block'; this.renderHistory(); } }
    clearHistory() { if (confirm('确定要清空所有历史记录吗？')) { this.history = []; this._saveHistory(); this.renderHistory(); } }
    renderHistory() {
        if (!this.historyList) return;
        this.historyList.innerHTML = '';
        if (this.history.length === 0) { this.historyList.innerHTML = '<div style="padding:20px;color:#888;text-align:center;">暂无历史记录</div>'; return; }
        const MAX = 100; const recent = this.history.slice(0, MAX);
        const groups = {};
        recent.forEach(item => { const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString('zh-CN') : '更早'; if (!groups[date]) groups[date] = []; groups[date].push(item); });
        for (const [date, items] of Object.entries(groups)) {
            const dateHeader = document.createElement('div'); dateHeader.className = 'history-date-header'; dateHeader.textContent = date; this.historyList.appendChild(dateHeader);
            items.forEach((item) => {
                const el = document.createElement('div'); el.className = 'history-item';
                const title = document.createElement('div'); title.className = 'history-title'; title.textContent = item.title || item.url; title.title = item.url;
                const url = document.createElement('div'); url.className = 'history-url'; url.textContent = item.url; url.title = item.url;
                el.appendChild(title); el.appendChild(url);
                el.addEventListener('click', () => { this.addressInput.value = item.url; this.navigate(); this.toggleHistory(); });
                this.historyList.appendChild(el);
            });
        }
    }
    _addToHistory(url, title) {
        if (!url || url === 'about:blank') return;
        let displayTitle = title;
        if (!displayTitle || displayTitle === url) { try { const u = new URL(url); displayTitle = u.hostname.replace(/^www\./, ''); } catch { displayTitle = url; } }
        this.history = this.history.filter(h => h.url !== url);
        this.history.unshift({ url: url, title: displayTitle, timestamp: Date.now() });
        if (this.history.length > 500) { this.history = this.history.slice(0, 500); }
        this._saveHistory();
    }
    toggleBookmark() {
        const currentTab = this.tabs[this.currentTabIndex];
        if (!currentTab || !currentTab.url || currentTab.url === 'about:blank') return;
        const existing = this._findBookmark(currentTab.url);
        if (existing) { if (confirm(`已收藏 "${existing.name}"，是否移除？`)) { this._removeBookmark(existing.id); this.renderBookmarks(); } }
        else { const name = currentTab.title || currentTab.url; this.showBookmarkFolderDialog(name, currentTab.url); }
    }
    showBookmarkFolderDialog(name, url) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:20px;width:360px;color:#ddd;font-family:inherit;';
        const title = document.createElement('div'); title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:4px;color:#eee;'; title.textContent = '添加到收藏夹'; dialog.appendChild(title);
        const nameLabel = document.createElement('div'); nameLabel.style.cssText = 'font-size:12px;color:#888;margin-bottom:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; nameLabel.textContent = name; dialog.appendChild(nameLabel);
        const folderLabel = document.createElement('div'); folderLabel.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:8px;'; folderLabel.textContent = '选择文件夹：'; dialog.appendChild(folderLabel);
        const folderList = document.createElement('div'); folderList.style.cssText = 'max-height:200px;overflow-y:auto;background:#1e1e1e;border-radius:4px;margin-bottom:12px;';
        const rootOption = document.createElement('div'); rootOption.style.cssText = 'padding:10px 12px;cursor:pointer;color:#ccc;font-size:13px;background:#3498db30;border-bottom:1px solid #333;'; rootOption.textContent = '📁 收藏夹根目录';
        rootOption.addEventListener('click', () => { this._addBookmark(name, url, null); this.renderBookmarks(); document.body.removeChild(overlay); });
        folderList.appendChild(rootOption);
        const folders = this._getAllFolders();
        if (folders.length === 0) { const empty = document.createElement('div'); empty.style.cssText = 'padding:10px 12px;color:#666;font-size:12px;'; empty.textContent = '暂无文件夹，可在收藏栏点击"+ 文件夹"创建'; folderList.appendChild(empty); }
        else {
            folders.forEach(folder => {
                const item = document.createElement('div'); item.style.cssText = 'padding:10px 12px;cursor:pointer;color:#ccc;font-size:13px;border-bottom:1px solid #333;'; item.textContent = '📂 ' + folder.name;
                item.addEventListener('mouseenter', () => { item.style.background = '#3d3d3d'; });
                item.addEventListener('mouseleave', () => { item.style.background = ''; });
                item.addEventListener('click', () => { this._addBookmark(name, url, folder.id); this.renderBookmarks(); document.body.removeChild(overlay); });
                folderList.appendChild(item);
            });
        }
        dialog.appendChild(folderList);
        const btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
        const cancelBtn = document.createElement('button'); cancelBtn.textContent = '取消'; cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;'; cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));
        btnRow.appendChild(cancelBtn); dialog.appendChild(btnRow); overlay.appendChild(dialog); document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
    }
    _getAllFolders() { const folders = []; const traverse = (nodes) => { nodes.forEach(n => { if (n.type === 'folder') { folders.push(n); if (n.children) traverse(n.children); } }); }; traverse(this.bookmarks); return folders; }
    _findBookmark(url) { const search = (nodes) => { for (const n of nodes) { if (n.type === 'bookmark' && n.url === url) return n; if (n.type === 'folder' && n.children) { const found = search(n.children); if (found) return found; } } return null; }; return search(this.bookmarks); }
    _addBookmark(name, url, parentId = null) {
        const node = { id: 'bm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: 'bookmark', name, url };
        if (parentId) { const parent = this._findNode(parentId); if (parent && parent.type === 'folder') { if (!parent.children) parent.children = []; parent.children.push(node); } }
        else { this.bookmarks.push(node); }
        this._saveBookmarks();
    }
    _addFolder(name) { this.bookmarks.push({ id: 'bm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: 'folder', name, children: [] }); this._saveBookmarks(); }
    _removeBookmark(id) { const remove = (nodes) => { const idx = nodes.findIndex(n => n.id === id); if (idx !== -1) { nodes.splice(idx, 1); return true; } for (const n of nodes) { if (n.type === 'folder' && n.children && remove(n.children)) return true; } return false; }; remove(this.bookmarks); this._saveBookmarks(); }
    _findNode(id) { const search = (nodes) => { for (const n of nodes) { if (n.id === id) return n; if (n.type === 'folder' && n.children) { const found = search(n.children); if (found) return found; } } return null; }; return search(this.bookmarks); }
    renderBookmarks() {
        if (!this.bookmarksBar) return;
        this.bookmarksBar.innerHTML = '';
        this.bookmarks.forEach(node => { if (node.type === 'folder') { this._renderBookmarkFolder(node, this.bookmarksBar); } else { this._renderBookmarkLink(node, this.bookmarksBar); } });
        const addFolderBtn = document.createElement('button'); addFolderBtn.className = 'bookmark-link bookmark-add-folder'; addFolderBtn.textContent = '+ 文件夹'; addFolderBtn.title = '新建收藏夹';
        addFolderBtn.addEventListener('click', () => { const name = prompt('文件夹名称：'); if (name && name.trim()) { this._addFolder(name.trim()); this.renderBookmarks(); } });
        this.bookmarksBar.appendChild(addFolderBtn);
    }
    _renderBookmarkLink(node, container) {
        const link = document.createElement('button'); link.className = 'bookmark-link'; link.textContent = node.name; link.title = node.url;
        link.addEventListener('click', () => { this.addressInput.value = node.url; this.navigate(); });
        link.addEventListener('contextmenu', (e) => { e.preventDefault(); if (confirm(`删除收藏 "${node.name}"？`)) { this._removeBookmark(node.id); this.renderBookmarks(); } });
        container.appendChild(link);
    }
    _renderBookmarkFolder(folder, container) {
        const wrapper = document.createElement('div'); wrapper.className = 'bookmark-folder-wrapper'; wrapper.style.position = 'relative'; wrapper.style.display = 'inline-block';
        const btn = document.createElement('button'); btn.className = 'bookmark-link bookmark-folder'; btn.textContent = '📁 ' + folder.name; btn.title = folder.name;
        const dropdown = document.createElement('div'); dropdown.className = 'bookmark-folder-dropdown'; dropdown.style.display = 'none';
        if (folder.children && folder.children.length > 0) {
            folder.children.forEach(child => {
                if (child.type === 'bookmark') {
                    const item = document.createElement('div'); item.className = 'bookmark-dropdown-item'; item.textContent = child.name; item.title = child.url;
                    item.addEventListener('click', () => { this.addressInput.value = child.url; this.navigate(); dropdown.style.display = 'none'; });
                    item.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (confirm(`删除收藏 "${child.name}"？`)) { this._removeBookmark(child.id); this.renderBookmarks(); } });
                    dropdown.appendChild(item);
                }
            });
        } else { const empty = document.createElement('div'); empty.className = 'bookmark-dropdown-item'; empty.style.color = '#666'; empty.textContent = '（空文件夹）'; dropdown.appendChild(empty); }
        const delItem = document.createElement('div'); delItem.className = 'bookmark-dropdown-item'; delItem.style.color = '#e74c3c'; delItem.style.borderTop = '1px solid #3d3d5c'; delItem.textContent = '删除文件夹';
        delItem.addEventListener('click', () => { if (confirm(`删除文件夹 "${folder.name}" 及其所有收藏？`)) { this._removeBookmark(folder.id); this.renderBookmarks(); } });
        dropdown.appendChild(delItem);
        btn.addEventListener('click', (e) => { e.stopPropagation(); const isOpen = dropdown.style.display === 'block'; document.querySelectorAll('.bookmark-folder-dropdown').forEach(d => d.style.display = 'none'); dropdown.style.display = isOpen ? 'none' : 'block'; });
        wrapper.appendChild(btn); wrapper.appendChild(dropdown); container.appendChild(wrapper);
    }
    openNewTabWithUrl(url) { const validatedUrl = this.validateUrl(url); if (!validatedUrl) return; this.addNewTab(validatedUrl, validatedUrl); }
    addNewTab(url, title) {
        const tabId = this.tabIdCounter++;
        const tab = { id: tabId, url: url, title: title, history: [], historyIndex: -1 };
        this.tabs.push(tab); this.currentTabIndex = this.tabs.length - 1;
        const tabElement = document.createElement('div'); tabElement.className = 'tab active'; tabElement.dataset.tab = tabId;
        tabElement.innerHTML = `<span class="tab-title">${title}</span><button class="tab-close" data-tab="${tabId}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
        tabElement.addEventListener('click', (e) => { if (!e.target.closest('.tab-close')) { this.switchTab(tabId); } });
        tabElement.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); this.closeTab(tabId); });
        this.tabsContainer.appendChild(tabElement); this.updateTabsUI();
        if (url !== 'about:blank') { this.navigateTo(url); }
    }
    switchTab(tabId) {
        const index = this.tabs.findIndex(t => t.id === tabId); if (index === -1) return;
        this.currentTabIndex = index; const tab = this.tabs[index];
        this.addressInput.value = tab.url === 'about:blank' ? '' : tab.url;
        if (tab.url && tab.url !== 'about:blank') { this.loadUrl(tab.url); } else { this.browserFrame.removeAttribute('srcdoc'); this.browserFrame.src = 'about:blank'; }
        this.updateTabsUI(); this.updateNavButtons();
    }
    closeTab(tabId) {
        const index = this.tabs.findIndex(t => t.id === tabId); if (index === -1) return;
        if (this.tabs.length === 1) { this.tabs[0].url = 'about:blank'; this.tabs[0].title = '新标签页'; this.tabs[0].history = []; this.tabs[0].historyIndex = -1; this.addressInput.value = ''; this.browserFrame.removeAttribute('srcdoc'); this.browserFrame.src = 'about:blank'; this.updateTabsUI(); this.updateNavButtons(); return; }
        this.tabs.splice(index, 1);
        if (this.currentTabIndex >= this.tabs.length) { this.currentTabIndex = this.tabs.length - 1; }
        const tabElements = this.tabsContainer.querySelectorAll('.tab'); if (tabElements[index]) tabElements[index].remove();
        this.switchTab(this.tabs[this.currentTabIndex].id);
    }
    updateTabsUI() { const tabElements = this.tabsContainer.querySelectorAll('.tab'); tabElements.forEach((el, index) => { const tab = this.tabs[index]; if (index === this.currentTabIndex) { el.classList.add('active'); } else { el.classList.remove('active'); } el.querySelector('.tab-title').textContent = tab.title; }); }
    openNewTab() { this.addNewTab('about:blank', '新标签页'); this.addressInput.value = ''; this.addressInput.focus(); }
    validateUrl(url) {
        if (!url || url.trim() === '') return null;
        let trimmedUrl = url.trim();
        if (/^(https?:\/\/)/i.test(trimmedUrl)) { return trimmedUrl; }
        if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmedUrl)) { return 'https://' + trimmedUrl; }
        return 'https://www.bing.com/search?q=' + encodeURIComponent(trimmedUrl);
    }
    navigate() { const url = this.validateUrl(this.addressInput.value); if (!url) { this.statusText.textContent = '请输入有效的网址'; return; } this.hideError(); this.navigateTo(url); }
    navigateTo(url) {
        this.statusText.textContent = '正在加载...';
        const currentTab = this.tabs[this.currentTabIndex];
        if (currentTab.historyIndex < currentTab.history.length - 1) { currentTab.history = currentTab.history.slice(0, currentTab.historyIndex + 1); }
        currentTab.history.push(url); currentTab.historyIndex = currentTab.history.length - 1; currentTab.url = url; this.addressInput.value = url;
        try { const u = new URL(url); currentTab.title = u.hostname.replace(/^www\./, ''); } catch { currentTab.title = url; }
        this.updateTabsUI(); this.loadUrl(url); this.updateNavButtons();
    }
    loadUrl(url) {
        if (this._loadCheckTimeout) { clearTimeout(this._loadCheckTimeout); this._loadCheckTimeout = null; }
        this.hideError(); this.statusText.textContent = '正在加载...'; this.lastUrl = url;
        this.browserFrame.removeAttribute('srcdoc'); this.browserFrame.src = url;
    }
    goBack() { const currentTab = this.tabs[this.currentTabIndex]; if (currentTab.historyIndex > 0) { currentTab.historyIndex--; const url = currentTab.history[currentTab.historyIndex]; currentTab.url = url; this.addressInput.value = url; this.loadUrl(url); this.updateNavButtons(); } }
    goForward() { const currentTab = this.tabs[this.currentTabIndex]; if (currentTab.historyIndex < currentTab.history.length - 1) { currentTab.historyIndex++; const url = currentTab.history[currentTab.historyIndex]; currentTab.url = url; this.addressInput.value = url; this.loadUrl(url); this.updateNavButtons(); } }
    refresh() { const currentTab = this.tabs[this.currentTabIndex]; if (currentTab.history.length > 0) { const url = currentTab.history[currentTab.historyIndex]; this.loadUrl(url); } }
    onPageLoad() {
        const currentTab = this.tabs[this.currentTabIndex]; const url = currentTab ? currentTab.url : null;
        if (this._loadCheckTimeout) { clearTimeout(this._loadCheckTimeout); }
        try { const childWindow = this.browserFrame.contentWindow; if (childWindow && childWindow.open) { const origOpen = childWindow.open.bind(childWindow); childWindow.open = (w, t, f) => { if (w && typeof w === 'string' && (t === '_blank' || !t)) { this.openNewTabWithUrl(w); return null; } return origOpen(w, t, f); }; } } catch (e) {}
        let pageTitle = null;
        try { if (this.browserFrame.contentDocument && this.browserFrame.contentDocument.title) { pageTitle = this.browserFrame.contentDocument.title; currentTab.title = pageTitle; this.updateTabsUI(); } } catch (e) { pageTitle = null; }
        this._addToHistory(url, pageTitle);
        this._loadCheckTimeout = setTimeout(() => {
            if (this.lastUrl !== url) return;
            let blocked = false;
            try { const doc = this.browserFrame.contentDocument; if (doc && (!doc.body || doc.body.innerHTML.trim() === '')) { blocked = true; } } catch (e) { blocked = false; }
            if (blocked && url && url !== 'about:blank') { this.showError('该网站设置了安全策略（X-Frame-Options / CSP frame-ancestors），禁止在嵌入式浏览器中显示。', url); this.statusText.textContent = '加载失败'; }
            else { this.hideError(); this.statusText.textContent = '就绪'; }
            this.updateNavButtons();
        }, 1500);
        this.statusText.textContent = '正在加载...';
    }
    showError(message, url) { this.errorMessage.textContent = message; this.openExternalBtn.dataset.url = url || ''; this.iframeError.classList.add('show'); this.statusText.textContent = '加载失败'; }
    hideError() { this.iframeError.classList.remove('show'); }
    updateNavButtons() { const currentTab = this.tabs[this.currentTabIndex]; this.backBtn.disabled = !currentTab || currentTab.historyIndex <= 0; this.forwardBtn.disabled = !currentTab || currentTab.historyIndex >= currentTab.history.length - 1; }
}
document.addEventListener('click', () => { document.querySelectorAll('.bookmark-folder-dropdown').forEach(d => d.style.display = 'none'); });
document.addEventListener('DOMContentLoaded', () => { new Browser(); });