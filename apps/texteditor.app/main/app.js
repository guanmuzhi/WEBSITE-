class TextEditor {
    constructor() {
        this.strings = {};
        this.textarea = document.getElementById('editor-textarea');
        this.filenameInput = document.getElementById('filename-input');
        this.charCount = document.getElementById('char-count');
        this.lineCount = document.getElementById('line-count');
        this.saveStatus = document.getElementById('save-status');
        this.currentFile = '';
        this.currentPath = '';
        this.isSaved = true;
        this.storage = window.parent.StorageService.getInstance();
        this.initEvents();
        this.updateStats();
        this.checkUrlParam();
        this.loadLanguage();
    }
    t(key, fallback) {
        return this.strings[key] !== undefined ? this.strings[key] : (fallback || key);
    }
    async loadLanguage() {
        const lang = localStorage.getItem('webos-language') || 'cmn';
        const langFiles = { cmn: '/apps/texteditor.app/main/language/texteditor_cmn.json', eng: '/apps/texteditor.app/main/language/texteditor_eng.json', jpn: '/apps/texteditor.app/main/language/texteditor_jpn.json' };
        try {
            const res = await fetch(langFiles[lang] || langFiles.cmn);
            const data = await res.json();
            this.strings = data.strings || {};
        } catch (e) {
            this.strings = {};
        }
        this.applyLanguage();
        try {
            if (window.parent && window.parent !== window) {
                window.parent.document.addEventListener('language-changed', () => { this.loadLanguage().then(() => this.applyLanguage()); });
            }
        } catch (e) {}
    }
    checkUrlParam() {
        let path = null;
        try { const params = new URLSearchParams(window.location.search); path = params.get('path'); } catch (e) {}
        if (!path && window.__APP_PARAMS__ && window.__APP_PARAMS__.path) { path = window.__APP_PARAMS__.path; }
        if (path) { this.openFileByPath(path); }
    }
    initEvents() {
        document.getElementById('new-btn').addEventListener('click', () => this.newFile());
        document.getElementById('open-btn').addEventListener('click', () => this.showFilePicker());
        document.getElementById('save-btn').addEventListener('click', () => this.saveFile());
        document.getElementById('save-as-btn').addEventListener('click', () => this.saveAs());
        this.textarea.addEventListener('input', () => { this.isSaved = false; this.updateStats(); this.updateSaveStatus(); });
        this.filenameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.saveFile(); } });
    }
    updateStats() { const text = this.textarea.value; this.charCount.textContent = this.t('editor.status_chars').replace('{n}', text.length); this.lineCount.textContent = this.t('editor.status_lines').replace('{n}', text.split('\n').length); }
    updateSaveStatus() { if (this.isSaved) { this.saveStatus.textContent = this.t('editor.saved'); this.saveStatus.className = 'saved'; } else { this.saveStatus.textContent = this.t('editor.unsaved'); this.saveStatus.className = 'unsaved'; } }
    applyLanguage() {
        const btnTitles = { 'new-btn': 'editor.new', 'open-btn': 'editor.open', 'save-btn': 'editor.save', 'save-as-btn': 'editor.save_as' };
        Object.entries(btnTitles).forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.title = this.t(key); });
        if (this.filenameInput) this.filenameInput.placeholder = this.t('editor.filename_placeholder');
        if (this.textarea) this.textarea.placeholder = this.t('editor.textarea_placeholder');
        if (this.t('app.title')) document.title = this.t('app.title');
        this.updateStats();
        this.updateSaveStatus();
    }
    showAlert(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            title.textContent = this.t('editor.title_info');
            dialog.appendChild(title);
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            const okBtn = document.createElement('button');
            okBtn.textContent = this.t('editor.ok');
            okBtn.style.cssText = 'padding:8px 24px;background:var(--accent-color,#3498db);border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            okBtn.addEventListener('mouseenter', () => { okBtn.style.background = 'var(--accent-hover,#2980b9)'; });
            okBtn.addEventListener('mouseleave', () => { okBtn.style.background = 'var(--accent-color,#3498db)'; });
            okBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(); });
            dialog.appendChild(okBtn);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            setTimeout(() => okBtn.focus(), 50);
        });
    }
    _textExts() {
        return ['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log', 'cfg', 'ini', 'yml', 'yaml', 'py', 'java', 'c', 'cpp', 'h', 'sh', 'bat'];
    }
    // ES modules 在父窗口是 deferred 加载，iframe 普通 script 可能先执行，
    // 所以需要轮询等待 window.parent.Dialogs 就绪（最多 3s）
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
        try {
            const Dlg = await this._waitForDialogs();
            if (!Dlg || !Dlg.showOpenFileDialog) { this.showAlert(this.t('editor.dialog_unavailable', '文件对话框不可用')); return; }
            const start = this.currentPath ? this._parentOf(this.currentPath) : null;
            const result = await Dlg.showOpenFileDialog({
                title: this.t('editor.file_picker_title', '打开文本文件'),
                extensions: this._textExts(),
                startPath: start,
            });
            if (!result || !result.path) return;
            this.openFileByPath(result.path);
        } catch (e) {
            this.showAlert(this.t('editor.open_failed', '打开失败: ') + (e.message || e));
        }
    }
    _parentOf(path) {
        if (!path || path === '/') return '/';
        const i = path.lastIndexOf('/');
        if (i === -1) return '/';
        if (i === 0) return '/';
        return path.slice(0, i);
    }
    showPrompt(message, defaultValue = '') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            title.textContent = this.t('editor.title_input');
            dialog.appendChild(title);
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:12px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            const input = document.createElement('input');
            input.type = 'text';
            input.value = defaultValue;
            input.style.cssText = 'width:100%;padding:10px 12px;background:#1e1e1e;border:1px solid #3d3d3d;border-radius:4px;color:#ddd;font-size:13px;font-family:inherit;margin-bottom:12px;outline:none;';
            input.addEventListener('focus', () => { input.style.borderColor = 'var(--accent-color,#3498db)'; });
            input.addEventListener('blur', () => { input.style.borderColor = '#3d3d3d'; });
            dialog.appendChild(input);
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = this.t('editor.cancel');
            cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
            cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
            cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
            cancelBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(null); });
            btnContainer.appendChild(cancelBtn);
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = this.t('editor.ok');
            confirmBtn.style.cssText = 'padding:8px 16px;background:var(--accent-color,#3498db);border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = 'var(--accent-hover,#2980b9)'; });
            confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = 'var(--accent-color,#3498db)'; });
            confirmBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(input.value); });
            btnContainer.appendChild(confirmBtn);
            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            setTimeout(() => { input.focus(); input.select(); }, 50);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { document.body.removeChild(overlay); resolve(input.value); } else if (e.key === 'Escape') { document.body.removeChild(overlay); resolve(null); } });
        });
    }
    showConfirm(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            title.textContent = this.t('editor.title_confirm');
            dialog.appendChild(title);
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = this.t('editor.cancel');
            cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
            cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
            cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
            cancelBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(false); });
            btnContainer.appendChild(cancelBtn);
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = this.t('editor.ok');
            confirmBtn.style.cssText = 'padding:8px 16px;background:var(--accent-color,#3498db);border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = 'var(--accent-hover,#2980b9)'; });
            confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = 'var(--accent-color,#3498db)'; });
            confirmBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(true); });
            btnContainer.appendChild(confirmBtn);
            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            setTimeout(() => confirmBtn.focus(), 50);
        });
    }
    newFile() {
        if (!this.isSaved && this.textarea.value.trim()) {
            this.showConfirm(this.t('editor.confirm_discard')).then((confirmed) => {
                if (confirmed) { this.textarea.value = ''; this.filenameInput.value = ''; this.currentFile = ''; this.currentPath = ''; this.isSaved = true; this.updateStats(); this.updateSaveStatus(); }
            });
            return;
        }
        this.textarea.value = ''; this.filenameInput.value = ''; this.currentFile = ''; this.currentPath = ''; this.isSaved = true; this.updateStats(); this.updateSaveStatus();
    }
    openFileByPath(path) {
        const content = this.storage.readFile(path);
        if (content === null) { this.showAlert(this.t('editor.file_not_found').replace('{file}', path)); return; }
        this.textarea.value = content; this.filenameInput.value = path; this.currentFile = path.split('/').pop(); this.currentPath = path; this.isSaved = true; this.updateStats(); this.updateSaveStatus();
    }
    saveFile() {
        let path = this.filenameInput.value.trim();
        if (!path) { this.showPrompt(this.t('editor.prompt_path')).then((inputPath) => { if (inputPath) { this.filenameInput.value = inputPath; this.doSaveFile(inputPath); } }); return; }
        this.doSaveFile(path);
    }
    doSaveFile(path) {
        this.storage.writeFile(path, this.textarea.value);
        this.currentFile = path.split('/').pop(); this.currentPath = path; this.isSaved = true; this.updateSaveStatus();
        const event = new CustomEvent('file-saved', { detail: { filename: this.currentFile, path, content: this.textarea.value } });
        window.dispatchEvent(event);
    }
    async saveAs() {
        try {
            const Dlg = await this._waitForDialogs();
            if (!Dlg || !Dlg.showSaveFileDialog) {
                const newPath = await this.showPrompt(this.t('editor.prompt_new_path'), this.currentPath || '');
                if (newPath) { this.filenameInput.value = newPath; this.saveFile(); }
                return;
            }
            const defaultName = this.currentFile || (this.filenameInput ? this.filenameInput.value : '') || '未命名.txt';
            const startPath = this.currentPath ? this._parentOf(this.currentPath) : null;
            const result = await Dlg.showSaveFileDialog({
                title: this.t('editor.save_as', '另存为'),
                extensions: this._textExts(),
                startPath,
                defaultFileName: defaultName,
            });
            if (!result || !result.path) return;
            this.filenameInput.value = result.path;
            this.doSaveFile(result.path);
        } catch (e) {
            this.showAlert(this.t('editor.save_failed', '保存失败: ') + (e.message || e));
        }
    }
    setContent(content, path = '') { this.textarea.value = content; this.filenameInput.value = path; this.currentPath = path; this.currentFile = path.split('/').pop(); this.isSaved = true; this.updateStats(); this.updateSaveStatus(); }
}
document.addEventListener('DOMContentLoaded', () => { window.editor = new TextEditor(); });