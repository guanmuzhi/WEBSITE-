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
    showFilePicker() {
        const files = this.getTextFiles();
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:20px;width:420px;max-height:80vh;display:flex;flex-direction:column;color:#ddd;font-family:inherit;';
        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
        title.textContent = this.t('editor.file_picker_title');
        dialog.appendChild(title);
        if (files.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:24px;color:#888;text-align:center;font-size:13px;';
            empty.textContent = this.t('editor.file_picker_empty');
            dialog.appendChild(empty);
        } else {
            const list = document.createElement('div');
            list.style.cssText = 'flex:1;overflow-y:auto;background:#1e1e1e;border-radius:4px;margin-bottom:12px;max-height:300px;';
            files.forEach(file => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:10px 12px;cursor:pointer;border-bottom:1px solid #333;color:#ccc;font-size:13px;display:flex;align-items:center;gap:8px;';
                const icon = document.createElement('span');
                icon.textContent = '📄';
                icon.style.cssText = 'font-size:14px;';
                const name = document.createElement('span');
                name.textContent = file;
                name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                item.appendChild(icon);
                item.appendChild(name);
                item.addEventListener('mouseenter', () => { item.style.background = '#3d3d3d'; });
                item.addEventListener('mouseleave', () => { item.style.background = ''; });
                item.addEventListener('click', () => { document.body.removeChild(overlay); this.openFileByPath(file); });
                list.appendChild(item);
            });
            dialog.appendChild(list);
        }
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = this.t('editor.cancel');
        cancelBtn.style.cssText = 'padding:8px 24px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;align-self:flex-end;';
        cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
        cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
        cancelBtn.addEventListener('click', () => { document.body.removeChild(overlay); });
        dialog.appendChild(cancelBtn);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { document.body.removeChild(overlay); } });
    }
    getTextFiles() {
        const files = [];
        const textExts = ['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log', 'cfg', 'ini', 'yml', 'yaml', 'py', 'java', 'c', 'cpp', 'h', 'sh', 'bat'];
        const traverse = (node, currentPath) => {
            if (node.type === 'file') {
                const ext = node.name.split('.').pop().toLowerCase();
                if (textExts.includes(ext) || node.name.indexOf('.') === -1) { files.push(currentPath); }
            } else if (node.type === 'folder' && node.children) {
                node.children.forEach(child => { const childPath = currentPath === '/' ? '/' + child.name : currentPath + '/' + child.name; traverse(child, childPath); });
            }
        };
        traverse(this.storage.fs, '/');
        return files.sort();
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
    saveAs() { this.showPrompt(this.t('editor.prompt_new_path'), this.currentPath || '').then((newPath) => { if (newPath) { this.filenameInput.value = newPath; this.saveFile(); } }); }
    setContent(content, path = '') { this.textarea.value = content; this.filenameInput.value = path; this.currentPath = path; this.currentFile = path.split('/').pop(); this.isSaved = true; this.updateStats(); this.updateSaveStatus(); }
}
document.addEventListener('DOMContentLoaded', () => { window.editor = new TextEditor(); });