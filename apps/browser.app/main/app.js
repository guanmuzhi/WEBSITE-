class Browser {
    constructor() {
        this.backBtn = document.getElementById('back-btn');
        this.forwardBtn = document.getElementById('forward-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
        this.addressInput = document.getElementById('address-input');
        this.goBtn = document.getElementById('go-btn');
        this.browserFrame = document.getElementById('browser-frame');
        this.statusText = document.getElementById('status-text');
        
        this.history = [];
        this.historyIndex = -1;
        
        this.init();
    }
    
    init() {
        this.backBtn.addEventListener('click', () => this.goBack());
        this.forwardBtn.addEventListener('click', () => this.goForward());
        this.refreshBtn.addEventListener('click', () => this.refresh());
        this.goBtn.addEventListener('click', () => this.navigate());
        this.addressInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.navigate();
            }
        });
        
        this.browserFrame.addEventListener('load', () => {
            this.onPageLoad();
        });
        
        this.updateNavButtons();
        this.navigateTo(this.addressInput.value);
    }
    
    validateUrl(url) {
        if (!url || url.trim() === '') {
            return null;
        }
        
        let trimmedUrl = url.trim();
        
        if (/^(https?:\/\/|ftp:\/\/)/i.test(trimmedUrl)) {
            return trimmedUrl;
        }
        
        if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmedUrl)) {
            return 'https://' + trimmedUrl;
        }
        
        if (/^[a-z0-9]+$/i.test(trimmedUrl)) {
            return 'https://' + trimmedUrl + '.com';
        }
        
        return 'https://www.baidu.com/s?wd=' + encodeURIComponent(trimmedUrl);
    }
    
    navigate() {
        const url = this.validateUrl(this.addressInput.value);
        if (!url) {
            this.statusText.textContent = '请输入有效的网址';
            return;
        }
        this.navigateTo(url);
    }
    
    navigateTo(url) {
        this.statusText.textContent = '正在加载...';
        
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        this.history.push(url);
        this.historyIndex = this.history.length - 1;
        
        this.addressInput.value = url;
        this.browserFrame.src = url;
        
        this.updateNavButtons();
    }
    
    goBack() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const url = this.history[this.historyIndex];
            this.addressInput.value = url;
            this.browserFrame.src = url;
            this.updateNavButtons();
        }
    }
    
    goForward() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const url = this.history[this.historyIndex];
            this.addressInput.value = url;
            this.browserFrame.src = url;
            this.updateNavButtons();
        }
    }
    
    refresh() {
        if (this.history.length > 0) {
            this.browserFrame.src = this.history[this.historyIndex];
            this.statusText.textContent = '正在刷新...';
        }
    }
    
    onPageLoad() {
        this.statusText.textContent = '就绪';
        this.updateNavButtons();
    }
    
    updateNavButtons() {
        this.backBtn.disabled = this.historyIndex <= 0;
        this.forwardBtn.disabled = this.historyIndex >= this.history.length - 1;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Browser();
});