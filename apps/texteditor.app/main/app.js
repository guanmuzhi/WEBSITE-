const STORAGE_KEY = 'web-terminal-os-data';

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
        this.charCount.textContent = `字符: ${text.length}`;
        this.lineCount.textContent = `行: ${text.split('\n').length}`;
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
    
    loadFS() {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : { type: 'folder', name: '/', children: [] };
    }
    
    saveFS(root) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
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
    
    getParentPath(path) {
        const parts = path.split('/').filter(p => p);
        parts.pop();
        return parts.length === 0 ? '/' : '/' + parts.join('/');
    }
    
    newFile() {
        if (!this.isSaved && this.textarea.value.trim()) {
            if (!confirm('当前文件未保存，是否继续？')) {
                return;
            }
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
            alert('没有可打开的文件');
            return;
        }
        
        const filename = prompt('请输入要打开的文件路径：\n\n可用文件：\n' + files.join('\n'));
        if (!filename) return;
        
        this.openFileByPath(filename);
    }
    
    openFileByPath(path) {
        const root = this.loadFS();
        const node = this.getNodeByPath(root, path);
        
        if (!node || node.type !== 'file') {
            alert(`文件 "${path}" 不存在`);
            return;
        }
        
        this.textarea.value = node.content || '';
        this.filenameInput.value = path;
        this.currentFile = node.name;
        this.currentPath = path;
        this.isSaved = true;
        this.updateStats();
        this.updateSaveStatus();
    }
    
    saveFile() {
        let path = this.filenameInput.value.trim();
        if (!path) {
            path = prompt('请输入文件路径（如 /home/public/test.txt）：');
            if (!path) return;
            this.filenameInput.value = path;
        }
        
        const root = this.loadFS();
        const parentPath = this.getParentPath(path);
        const fileName = path.split('/').pop();
        
        let parent = this.getNodeByPath(root, parentPath);
        if (!parent || parent.type !== 'folder') {
            alert('无效的目录路径');
            return;
        }
        
        const existingIndex = parent.children.findIndex(c => c.name === fileName);
        if (existingIndex !== -1) {
            parent.children[existingIndex].content = this.textarea.value;
        } else {
            parent.children.push({
                type: 'file',
                name: fileName,
                content: this.textarea.value
            });
        }
        
        this.saveFS(root);
        this.currentFile = fileName;
        this.currentPath = path;
        this.isSaved = true;
        this.updateSaveStatus();
        
        const event = new CustomEvent('file-saved', {
            detail: { filename: fileName, path, content: this.textarea.value }
        });
        window.dispatchEvent(event);
    }
    
    saveAs() {
        const newPath = prompt('请输入新文件路径：', this.currentPath || '');
        if (!newPath) return;
        
        this.filenameInput.value = newPath;
        this.saveFile();
    }
    
    getFileList() {
        const root = this.loadFS();
        const files = [];
        
        const traverse = (node, currentPath) => {
            if (node.type === 'file') {
                files.push(currentPath);
            } else if (node.type === 'folder' && node.children) {
                node.children.forEach(child => {
                    const childPath = currentPath === '/' ? `/${child.name}` : `${currentPath}/${child.name}`;
                    traverse(child, childPath);
                });
            }
        };
        
        traverse(root, '/');
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