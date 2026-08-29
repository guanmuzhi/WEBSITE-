const STORAGE_KEY = 'web-terminal-os-data';

const IMAGE_EXTENSIONS = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'svg': 'image/svg+xml'
};

class ImageViewer {
    constructor() {
        this.strings = {};

        this.image = document.getElementById('image');
        this.filenameEl = document.getElementById('filename');
        this.imageInfoEl = document.getElementById('image-info');
        this.placeholder = document.getElementById('placeholder');
        this.placeholderTextEl = document.getElementById('placeholder-text');
        this.zoomInBtn = document.getElementById('zoom-in');
        this.zoomOutBtn = document.getElementById('zoom-out');
        this.zoomLevelEl = document.getElementById('zoom-level');
        this.imageWrapper = document.getElementById('image-wrapper');
        this.loadingEl = document.getElementById('loading');
        this.statusSizeEl = document.getElementById('status-size');
        this.statusDimensionsEl = document.getElementById('status-dimensions');
        this.statusFormatEl = document.getElementById('status-format');

        this.currentPath = '';
        this.currentNode = null;
        this.zoomLevel = 100;
        this.minZoom = 25;
        this.maxZoom = 400;
        this.zoomStep = 25;

        this.initEvents();
        this.initLanguage();
    }

    async initLanguage() {
        await this.loadLanguage();
        this.applyLanguage();
        this.checkUrlParam();
    }

    async loadLanguage() {
        const lang = localStorage.getItem('webos-language') || 'cmn';
        const langFiles = { cmn: '/apps/imageviewer.app/main/language/imageviewer_cmn.json', eng: '/apps/imageviewer.app/main/language/imageviewer_eng.json', jpn: '/apps/imageviewer.app/main/language/imageviewer_jpn.json' };
        try {
            const res = await fetch(langFiles[lang] || langFiles.cmn);
            const data = await res.json();
            this.strings = data.strings || {};
        } catch (e) {
            this.strings = {};
        }
        try {
            if (!this._langBound && window.parent && window.parent !== window) {
                this._langBound = true;
                window.parent.document.addEventListener('language-changed', () => {
                    this.loadLanguage().then(() => {
                        this.applyLanguage();
                        if (this.currentNode) this.updateStatusBar(this.currentNode);
                    });
                });
            }
        } catch (e) {}
    }

    t(key, fallback) {
        return this.strings[key] !== undefined ? this.strings[key] : (fallback || key);
    }

    applyLanguage() {
        if (!this.currentPath) {
            this.filenameEl.textContent = this.t('iv.no_image_open', '未打开图片');
        }
        if (this.placeholderTextEl) this.placeholderTextEl.textContent = this.t('iv.no_image', '暂无图片');
        this.image.alt = this.t('iv.image', '图片');
        if (this.loadingEl) this.loadingEl.title = this.t('iv.loading', '加载中');
        if (this.currentNode) {
            this.updateStatusBar(this.currentNode);
            this.imageInfoEl.textContent = `${this.getExtension(this.currentNode.name).toUpperCase()} ${this.t('iv.file', '文件')}`;
        } else {
            this.imageInfoEl.textContent = '';
        }
        document.title = this.t('app.imageviewer', '图片查看器');
    }

    initEvents() {
        const openBtn = document.getElementById('open-btn');
        if (openBtn) openBtn.addEventListener('click', () => this.showFilePicker());
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        this.image.addEventListener('wheel', (e) => this.handleWheel(e));
        
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '+') {
                    e.preventDefault();
                    this.zoomIn();
                } else if (e.key === '-') {
                    e.preventDefault();
                    this.zoomOut();
                } else if (e.key === '0') {
                    e.preventDefault();
                    this.resetZoom();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
                e.preventDefault();
                this.showFilePicker();
            }
        });
    }

    // ES modules 在父窗口是 deferred 加载，iframe 普通 script 可能先执行，需要轮询
    async _waitForDialogs(timeoutMs = 3000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const Dlg = (window.parent && window.parent.Dialogs) ? window.parent.Dialogs : null;
                if (Dlg && Dlg.showOpenFileDialog) return Dlg;
            } catch (_) {}
            await new Promise(r => setTimeout(r, 50));
        }
        return null;
    }
    async showFilePicker() {
        const Dlg = await this._waitForDialogs();
        if (!Dlg || !Dlg.showOpenFileDialog) { alert(this.t('iv.dialog_unavailable', '文件对话框不可用')); return; }
        const startPath = this.currentPath ? (() => { const i = this.currentPath.lastIndexOf('/'); return i <= 0 ? '/' : this.currentPath.slice(0, i); })() : null;
        const result = await Dlg.showOpenFileDialog({
            title: this.t('iv.file_picker_title', '打开图片'),
            extensions: Object.keys(IMAGE_EXTENSIONS),
            startPath,
        });
        if (!result || !result.path) return;
        this.openFileByPath(result.path);
    }

    checkUrlParam() {
        const params = new URLSearchParams(window.location.search);
        const path = params.get('path');
        if (path) {
            this.openFileByPath(path);
        }
    }

    loadFS() {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : { type: 'folder', name: '/', children: [] };
    }

    getNodeByPath(root, path) {
        if (path === '/') return root;
        const parts = path.split('/').filter(p => p);
        let node = root;
        for (const part of parts) {
            if (node.children) {
                const child = node.children.find(c => c.name === part);
                if (child) {
                    node = child;
                } else {
                    return null;
                }
            } else {
                return null;
            }
        }
        return node;
    }

    getExtension(filename) {
        const parts = filename.split('.');
        if (parts.length > 1) {
            return parts[parts.length - 1].toLowerCase();
        }
        return '';
    }

    isImageFile(filename) {
        const ext = this.getExtension(filename);
        return ext in IMAGE_EXTENSIONS;
    }

    buildDataUrl(content, filename) {
        if (content.startsWith('data:image/')) {
            return content;
        }

        const ext = this.getExtension(filename);
        const mimeType = IMAGE_EXTENSIONS[ext] || 'image/png';
        return `data:${mimeType};base64,${content}`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    openFileByPath(path) {
        const root = this.loadFS();
        const node = this.getNodeByPath(root, path);

        if (!node || node.type !== 'file') {
            alert(this.t('iv.file_not_found', '文件 "{path}" 不存在').replace('{path}', path));
            return;
        }

        if (!this.isImageFile(node.name)) {
            alert(this.t('iv.unsupported_format', '不支持的图片格式: {name}').replace('{name}', node.name));
            return;
        }

        const content = node.content || '';
        if (!content) {
            alert(this.t('iv.empty_content', '图片内容为空'));
            return;
        }

        const dataUrl = this.buildDataUrl(content, node.name);
        
        this.loadingEl.style.display = 'flex';
        this.resetZoom();

        this.image.onload = () => {
            this.loadingEl.style.display = 'none';
            this.placeholder.classList.add('hidden');
            this.image.classList.add('visible');
            
            this.updateStatusBar(node);
        };

        this.image.onerror = () => {
            this.loadingEl.style.display = 'none';
            alert(this.t('iv.load_failed', '图片加载失败'));
            this.image.classList.remove('visible');
            this.placeholder.classList.remove('hidden');
        };

        this.image.src = dataUrl;
        this.currentNode = node;
        this.filenameEl.textContent = node.name;
        
        const ext = this.getExtension(node.name);
        this.imageInfoEl.textContent = `${ext.toUpperCase()} ${this.t('iv.file', '文件')}`;
        
        this.currentPath = path;
        document.title = `${node.name} - ${this.t('app.imageviewer', '图片查看器')}`;
    }

    updateStatusBar(node) {
        const ext = this.getExtension(node.name);
        const format = ext.toUpperCase();
        const dimensions = `${this.image.naturalWidth} × ${this.image.naturalHeight}`;
        
        let size = this.t('iv.unknown', '未知');
        if (node.content) {
            const byteSize = node.content.length * 0.75;
            size = this.formatFileSize(byteSize);
        }

        this.statusSizeEl.textContent = `${this.t('iv.size', '大小:')} ${size}`;
        this.statusDimensionsEl.textContent = `${this.t('iv.dimensions', '尺寸:')} ${dimensions}`;
        this.statusFormatEl.textContent = `${this.t('iv.format', '格式:')} ${format}`;
    }

    zoomIn() {
        if (this.zoomLevel < this.maxZoom) {
            this.zoomLevel += this.zoomStep;
            this.updateZoom();
        }
    }

    zoomOut() {
        if (this.zoomLevel > this.minZoom) {
            this.zoomLevel -= this.zoomStep;
            this.updateZoom();
        }
    }

    resetZoom() {
        this.zoomLevel = 100;
        this.updateZoom();
    }

    updateZoom() {
        this.imageWrapper.style.transform = `scale(${this.zoomLevel / 100})`;
        this.zoomLevelEl.textContent = `${this.zoomLevel}%`;
    }

    handleWheel(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.viewer = new ImageViewer();
});