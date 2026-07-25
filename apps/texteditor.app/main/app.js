class TextEditor {
    constructor() {
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
    }
    
    checkUrlParam() {
        const params = new URLSearchParams(window.location.search);
        const path = params.get('path');
        if (path) {
            this.openFileByPath(path);
        }
    }
    
    initEvents() {
        document.getElementById('new-btn').addEventListener('click', () => this.newFile());
        document.getElementById('open-btn').addEventListener('click', () => this.openFile());
        document.getElementById('save-btn').addEventListener('click', () => this.saveFile());
        document.getElementById('save-as-btn').addEventListener('click', () => this.saveAs());
        
        this.textarea.addEventListener('input', () => {
            this.isSaved = false;
            this.updateStats();
            this.updateSaveStatus();
        });
        
        this.filenameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.saveFile();
            }
        });
    }
    
    updateStats() {
        const text = this.textarea.value;
        this.charCount.textContent = '字符: ' + text.length;
        this.lineCount.textContent = '行: ' + text.split('\n').length;
    }
    
    updateSaveStatus() {
        if (this.isSaved) {
            this.saveStatus.textContent = '已保存';
            this.saveStatus.className = 'saved';
        } else {
            this.saveStatus.textContent = '未保存';
            this.saveStatus.className = 'unsaved';
        }
    }
    
    showAlert(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            title.textContent = '提示';
            dialog.appendChild(title);
            
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            
            const okBtn = document.createElement('button');
            okBtn.textContent = '确定';
            okBtn.style.cssText = 'padding:8px 24px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            okBtn.addEventListener('mouseenter', () => { okBtn.style.background = '#2980b9'; });
            okBtn.addEventListener('mouseleave', () => { okBtn.style.background = '#3498db'; });
            okBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve();
            });
            
            dialog.appendChild(okBtn);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            setTimeout(() => okBtn.focus(), 50);
        });
    }
    
    showPrompt(message, defaultValue = '') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            title.textContent = '输入';
            dialog.appendChild(title);
            
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:12px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = defaultValue;
            input.style.cssText = 'width:100%;padding:10px 12px;background:#1e1e1e;border:1px solid #3d3d3d;border-radius:4px;color:#ddd;font-size:13px;font-family:inherit;margin-bottom:12px;outline:none;';
            input.addEventListener('focus', () => { input.style.borderColor = '#3498db'; });
            input.addEventListener('blur', () => { input.style.borderColor = '#3d3d3d'; });
            dialog.appendChild(input);
            
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
            cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
            cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(null);
            });
            btnContainer.appendChild(cancelBtn);
            
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = '确定';
            confirmBtn.style.cssText = 'padding:8px 16px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = '#2980b9'; });
            confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = '#3498db'; });
            confirmBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(input.value);
            });
            btnContainer.appendChild(confirmBtn);
            
            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            setTimeout(() => { input.focus(); input.select(); }, 50);
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    document.body.removeChild(overlay);
                    resolve(input.value);
                } else if (e.key === 'Escape') {
                    document.body.removeChild(overlay);
                    resolve(null);
                }
            });
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
            title.textContent = '确认';
            dialog.appendChild(title);
            
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
            cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
            cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(false);
            });
            btnContainer.appendChild(cancelBtn);
            
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = '确定';
            confirmBtn.style.cssText = 'padding:8px 16px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = '#2980b9'; });
            confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = '#3498db'; });
            confirmBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(true);
            });
            btnContainer.appendChild(confirmBtn);
            
            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            setTimeout(() => confirmBtn.focus(), 50);
        });
    }
    
    newFile() {
        if (!this.isSaved && this.textarea.value.trim()) {
            this.showConfirm('当前文件未保存，是否继续？').then((confirmed) => {
                if (confirmed) {
                    this.textarea.value = '';
                    this.filenameInput.value = '';
                    this.currentFile = '';
                    this.currentPath = '';
                    this.isSaved = true;
                    this.updateStats();
                    this.updateSaveStatus();
                }
            });
            return;
        }
        this.textarea.value = '';
        this.filenameInput.value = '';
        this.currentFile = '';
        this.currentPath = '';
        this.isSaved = true;
        this.updateStats();
        this.updateSaveStatus();
    }
    
    openFile() {
        const files = this.getFileList();
        if (files.length === 0) {
            this.showAlert('没有可打开的文件');
            return;
        }
        
        this.showPrompt('请输入要打开的文件路径：\n\n可用文件：\n' + files.join('\n')).then((filename) => {
            if (filename) {
                this.openFileByPath(filename);
            }
        });
    }
    
    openFileByPath(path) {
        const content = this.storage.readFile(path);
        
        if (content === null) {
            this.showAlert('文件 "' + path + '" 不存在');
            return;
        }
        
        this.textarea.value = content;
        this.filenameInput.value = path;
        this.currentFile = path.split('/').pop();
        this.currentPath = path;
        this.isSaved = true;
        this.updateStats();
        this.updateSaveStatus();
    }
    
    saveFile() {
        let path = this.filenameInput.value.trim();
        if (!path) {
            this.showPrompt('请输入文件路径（如 /home/public/test.txt）：').then((inputPath) => {
                if (inputPath) {
                    this.filenameInput.value = inputPath;
                    this.doSaveFile(inputPath);
                }
            });
            return;
        }
        this.doSaveFile(path);
    }
    
    doSaveFile(path) {
        this.storage.writeFile(path, this.textarea.value);
        
        this.currentFile = path.split('/').pop();
        this.currentPath = path;
        this.isSaved = true;
        this.updateSaveStatus();
        
        const event = new CustomEvent('file-saved', {
            detail: { filename: this.currentFile, path, content: this.textarea.value }
        });
        window.dispatchEvent(event);
    }
    
    saveAs() {
        this.showPrompt('请输入新文件路径：', this.currentPath || '').then((newPath) => {
            if (newPath) {
                this.filenameInput.value = newPath;
                this.saveFile();
            }
        });
    }
    
    getFileList() {
        const files = [];
        
        const traverse = (node, currentPath) => {
            if (node.type === 'file') {
                files.push(currentPath);
            } else if (node.type === 'folder' && node.children) {
                node.children.forEach(child => {
                    const childPath = currentPath === '/' ? '/' + child.name : currentPath + '/' + child.name;
                    traverse(child, childPath);
                });
            }
        };
        
        traverse(this.storage.fs, '/');
        return files.sort();
    }
    
    setContent(content, path = '') {
        this.textarea.value = content;
        this.filenameInput.value = path;
        this.currentPath = path;
        this.currentFile = path.split('/').pop();
        this.isSaved = true;
        this.updateStats();
        this.updateSaveStatus();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.editor = new TextEditor();
});
