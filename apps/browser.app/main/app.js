class Browser {
    constructor() {
        this.backBtn = document.getElementById('back-btn');
        this.forwardBtn = document.getElementById('forward-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
        this.newTabBtn = document.getElementById('new-tab-btn');
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
        
        this.tabs = [];
        this.currentTabIndex = 0;
        this.tabIdCounter = 1;
        this.lastUrl = null;
        
        this.bookmarks = [
            { name: 'Example', url: 'https://example.com' },
            { name: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com' },
            { name: 'HTTPBin', url: 'https://httpbin.org' }
        ];
        
        this.init();
    }
    
    init() {
        this.backBtn.addEventListener('click', () => this.goBack());
        this.forwardBtn.addEventListener('click', () => this.goForward());
        this.refreshBtn.addEventListener('click', () => this.refresh());
        this.newTabBtn.addEventListener('click', () => this.openNewTab());
        this.goBtn.addEventListener('click', () => this.navigate());
        this.addressInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.navigate();
            }
        });
        
        this.browserFrame.addEventListener('load', () => {
            this.onPageLoad();
        });
        
        this.retryBtn.addEventListener('click', () => {
            this.hideError();
            this.refresh();
        });
        
        this.openExternalBtn.addEventListener('click', () => {
            const currentTab = this.tabs[this.currentTabIndex];
            if (currentTab && currentTab.url && currentTab.url !== 'about:blank') {
                window.open(currentTab.url, '_blank', 'noopener,noreferrer');
            }
            this.hideError();
        });
        
        this.renderBookmarks();
        this.addNewTab('about:blank', '新标签页');
        this.updateNavButtons();
    }
    
    renderBookmarks() {
        if (!this.bookmarksBar) return;
        this.bookmarksBar.innerHTML = '';
        this.bookmarks.forEach(bm => {
            const link = document.createElement('button');
            link.className = 'bookmark-link';
            link.textContent = bm.name;
            link.title = bm.url;
            link.addEventListener('click', () => {
                this.addressInput.value = bm.url;
                this.navigate();
            });
            this.bookmarksBar.appendChild(link);
        });
    }
    
    addNewTab(url, title) {
        const tabId = this.tabIdCounter++;
        const tab = {
            id: tabId,
            url: url,
            title: title,
            history: [],
            historyIndex: -1
        };
        
        this.tabs.push(tab);
        this.currentTabIndex = this.tabs.length - 1;
        
        const tabElement = document.createElement('div');
        tabElement.className = 'tab active';
        tabElement.dataset.tab = tabId;
        tabElement.innerHTML = `
            <span class="tab-title">${title}</span>
            <button class="tab-close" data-tab="${tabId}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;
        
        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                this.switchTab(tabId);
            }
        });
        
        tabElement.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabId);
        });
        
        this.tabsContainer.appendChild(tabElement);
        this.updateTabsUI();
        
        if (url !== 'about:blank') {
            this.navigateTo(url);
        }
    }
    
    switchTab(tabId) {
        const index = this.tabs.findIndex(t => t.id === tabId);
        if (index === -1) return;
        
        this.currentTabIndex = index;
        const tab = this.tabs[index];
        
        this.addressInput.value = tab.url === 'about:blank' ? '' : tab.url;
        
        if (tab.url && tab.url !== 'about:blank') {
            this.loadUrl(tab.url);
        } else {
            this.browserFrame.removeAttribute('srcdoc');
            this.browserFrame.src = 'about:blank';
        }
        
        this.updateTabsUI();
        this.updateNavButtons();
    }
    
    closeTab(tabId) {
        const index = this.tabs.findIndex(t => t.id === tabId);
        if (index === -1) return;
        
        if (this.tabs.length === 1) {
            this.tabs[0].url = 'about:blank';
            this.tabs[0].title = '新标签页';
            this.tabs[0].history = [];
            this.tabs[0].historyIndex = -1;
            this.addressInput.value = '';
            this.browserFrame.removeAttribute('srcdoc');
            this.browserFrame.src = 'about:blank';
            this.updateTabsUI();
            this.updateNavButtons();
            return;
        }
        
        this.tabs.splice(index, 1);
        
        if (this.currentTabIndex >= this.tabs.length) {
            this.currentTabIndex = this.tabs.length - 1;
        }
        
        const tabElements = this.tabsContainer.querySelectorAll('.tab');
        tabElements[index].remove();
        
        this.switchTab(this.tabs[this.currentTabIndex].id);
    }
    
    updateTabsUI() {
        const tabElements = this.tabsContainer.querySelectorAll('.tab');
        tabElements.forEach((el, index) => {
            const tab = this.tabs[index];
            if (index === this.currentTabIndex) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
            el.querySelector('.tab-title').textContent = tab.title;
        });
    }
    
    openNewTab() {
        this.addNewTab('about:blank', '新标签页');
        this.addressInput.value = '';
        this.addressInput.focus();
    }
    
    validateUrl(url) {
        if (!url || url.trim() === '') {
            return null;
        }
        
        let trimmedUrl = url.trim();
        
        if (/^(https?:\/\/)/i.test(trimmedUrl)) {
            return trimmedUrl;
        }
        
        if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmedUrl)) {
            return 'https://' + trimmedUrl;
        }
        
        return 'https://www.bing.com/search?q=' + encodeURIComponent(trimmedUrl);
    }
    
    navigate() {
        const url = this.validateUrl(this.addressInput.value);
        if (!url) {
            this.statusText.textContent = '请输入有效的网址';
            return;
        }
        
        this.hideError();
        this.navigateTo(url);
    }
    
    navigateTo(url) {
        this.statusText.textContent = '正在加载...';
        
        const currentTab = this.tabs[this.currentTabIndex];
        
        if (currentTab.historyIndex < currentTab.history.length - 1) {
            currentTab.history = currentTab.history.slice(0, currentTab.historyIndex + 1);
        }
        
        currentTab.history.push(url);
        currentTab.historyIndex = currentTab.history.length - 1;
        currentTab.url = url;
        
        this.addressInput.value = url;
        
        try {
            const hostname = new URL(url).hostname;
            currentTab.title = hostname;
        } catch {
            currentTab.title = url;
        }
        
        this.updateTabsUI();
        this.loadUrl(url);
        this.updateNavButtons();
    }
    
    loadUrl(url) {
        if (this._loadCheckTimeout) {
            clearTimeout(this._loadCheckTimeout);
            this._loadCheckTimeout = null;
        }
        this.hideError();
        this.statusText.textContent = '正在加载...';
        this.lastUrl = url;

        // Clear any previous srcdoc and set the new URL
        this.browserFrame.removeAttribute('srcdoc');
        this.browserFrame.src = url;
    }
    
    goBack() {
        const currentTab = this.tabs[this.currentTabIndex];
        if (currentTab.historyIndex > 0) {
            currentTab.historyIndex--;
            const url = currentTab.history[currentTab.historyIndex];
            currentTab.url = url;
            this.addressInput.value = url;
            this.loadUrl(url);
            this.updateNavButtons();
        }
    }
    
    goForward() {
        const currentTab = this.tabs[this.currentTabIndex];
        if (currentTab.historyIndex < currentTab.history.length - 1) {
            currentTab.historyIndex++;
            const url = currentTab.history[currentTab.historyIndex];
            currentTab.url = url;
            this.addressInput.value = url;
            this.loadUrl(url);
            this.updateNavButtons();
        }
    }
    
    refresh() {
        const currentTab = this.tabs[this.currentTabIndex];
        if (currentTab.history.length > 0) {
            const url = currentTab.history[currentTab.historyIndex];
            this.loadUrl(url);
        }
    }
    
    onPageLoad() {
        const currentTab = this.tabs[this.currentTabIndex];
        const url = currentTab ? currentTab.url : null;

        // Clear any previous delayed check
        if (this._loadCheckTimeout) {
            clearTimeout(this._loadCheckTimeout);
        }

        // If we can access cross-origin document, it means same-origin — check title
        try {
            if (this.browserFrame.contentDocument && this.browserFrame.contentDocument.title) {
                currentTab.title = this.browserFrame.contentDocument.title;
                this.updateTabsUI();
            }
        } catch (e) {
            // Cross-origin - can't access title, but page likely loaded fine
        }

        // Delay the blank-document check to let SPA / slow pages render
        this._loadCheckTimeout = setTimeout(() => {
            // Only check if we're still on the same URL
            if (this.lastUrl !== url) return;

            let blocked = false;
            try {
                const doc = this.browserFrame.contentDocument;
                if (doc && (!doc.body || doc.body.innerHTML.trim() === '')) {
                    blocked = true;
                }
            } catch (e) {
                // Cross-origin throws — page actually loaded successfully
                blocked = false;
            }

            if (blocked && url && url !== 'about:blank') {
                this.showError(
                    '该网站设置了安全策略（X-Frame-Options / CSP frame-ancestors），禁止在嵌入式浏览器中显示。',
                    url
                );
                this.statusText.textContent = '加载失败';
            } else {
                this.hideError();
                this.statusText.textContent = '就绪';
            }
            this.updateNavButtons();
        }, 1200);

        this.statusText.textContent = '正在加载...';
    }
    
    showError(message, url) {
        this.errorMessage.textContent = message;
        this.openExternalBtn.dataset.url = url || '';
        this.iframeError.classList.add('show');
        this.statusText.textContent = '加载失败';
    }
    
    hideError() {
        this.iframeError.classList.remove('show');
    }
    
    updateNavButtons() {
        const currentTab = this.tabs[this.currentTabIndex];
        this.backBtn.disabled = !currentTab || currentTab.historyIndex <= 0;
        this.forwardBtn.disabled = !currentTab || currentTab.historyIndex >= currentTab.history.length - 1;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Browser();
});
