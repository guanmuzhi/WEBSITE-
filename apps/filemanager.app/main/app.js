const STORAGE_KEY = 'web-terminal-os-data';

const FOLDER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#f1c40f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#95a5a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

class FileManager {
    constructor() {
        this.root = null;
        this.currentDir = null;
        this.pathStack = [];
        this.authorizedUsers = new Set();

        this.filelistEl = document.getElementById('fm-filelist');
        this.pathEl = document.getElementById('fm-path');
        this.viewerEl = document.getElementById('fm-viewer');
        this.viewerTitleEl = document.getElementById('fm-viewer-title');
        this.viewerContentEl = document.getElementById('fm-viewer-content');

        this.loadFS();
        this.initEvents();
        this.render();
    }

    loadFS() {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            try {
                this.root = JSON.parse(data);
                this.currentDir = this.root;
                this.pathStack = [];
            } catch (e) {
                this.root = { type: 'folder', name: '/', children: [] };
                this.currentDir = this.root;
            }
        } else {
            this.root = { type: 'folder', name: '/', children: [] };
            this.currentDir = this.root;
        }
    }

    saveFS() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.root));
    }

    initEvents() {
        document.getElementById('fm-back').addEventListener('click', () => this.goUp());
        document.getElementById('fm-home').addEventListener('click', () => this.goRoot());
        document.getElementById('fm-refresh').addEventListener('click', () => {
            this.loadFS();
            this.render();
        });
        document.getElementById('fm-viewer-close').addEventListener('click', () => {
            this.viewerEl.style.display = 'none';
        });

        document.querySelectorAll('.fm-sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const path = item.dataset.path;
                this.navigateToPath(path);
            });
        });
    }

    getCurrentPath() {
        if (this.pathStack.length === 0) return '/';
        return '/' + this.pathStack.join('/');
    }

    navigateToPath(pathStr) {
        this.loadFS();
        if (!pathStr || pathStr === '/') {
            this.currentDir = this.root;
            this.pathStack = [];
        } else {
            const parts = pathStr.split('/').filter(p => p);
            let node = this.root;
            for (const part of parts) {
                if (node.children) {
                    const child = node.children.find(c => c.name === part && c.type === 'folder');
                    if (child) {
                        node = child;
                    } else {
                        return;
                    }
                }
            }
            this.currentDir = node;
            this.pathStack = parts;
        }
        this.render();
    }

    goUp() {
        if (this.pathStack.length === 0) return;
        this.pathStack.pop();
        let node = this.root;
        for (const part of this.pathStack) {
            if (node.children) {
                const child = node.children.find(c => c.name === part && c.type === 'folder');
                if (child) node = child;
            }
        }
        this.currentDir = node;
        this.render();
    }

    goRoot() {
        this.loadFS();
        this.currentDir = this.root;
        this.pathStack = [];
        this.render();
    }

    getCurrentUsername() {
        return localStorage.getItem('web-terminal-os-current-user') || 'public';
    }

    getUserInfo(username) {
        const usersData = localStorage.getItem('web-terminal-os-users');
        if (!usersData) return null;
        try {
            const users = JSON.parse(usersData);
            const user = users.find(u => u.username === username);
            if (user) {
                return { username: user.username, password: user.password };
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    showPasswordDialog(username) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';

            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';

            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:16px;color:#eee;';
            title.textContent = `访问 ${username} 的目录`;
            dialog.appendChild(title);

            const desc = document.createElement('div');
            desc.style.cssText = 'font-size:13px;color:#888;margin-bottom:16px;';
            desc.textContent = '请输入密码以继续访问';
            dialog.appendChild(desc);

            const input = document.createElement('input');
            input.type = 'password';
            input.placeholder = '密码';
            input.style.cssText = 'width:100%;padding:10px 12px;background:#1e1e1e;border:1px solid #3d3d3d;border-radius:4px;color:#ddd;font-size:13px;font-family:inherit;margin-bottom:8px;outline:none;';
            input.addEventListener('focus', () => { input.style.borderColor = '#3498db'; });
            input.addEventListener('blur', () => { input.style.borderColor = '#3d3d3d'; });
            dialog.appendChild(input);

            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = 'color:#e74c3c;font-size:12px;margin-bottom:16px;min-height:16px;';
            dialog.appendChild(errorMsg);

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
            confirmBtn.textContent = '确认';
            confirmBtn.style.cssText = 'padding:8px 16px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = '#2980b9'; });
            confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = '#3498db'; });

            const submit = () => {
                const userInfo = this.getUserInfo(username);
                if (userInfo && userInfo.password === input.value) {
                    this.authorizedUsers.add(username);
                    document.body.removeChild(overlay);
                    resolve(true);
                } else {
                    errorMsg.textContent = '密码错误';
                    input.style.borderColor = '#e74c3c';
                }
            };

            confirmBtn.addEventListener('click', submit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit();
            });
            btnContainer.appendChild(confirmBtn);

            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            setTimeout(() => input.focus(), 50);
        });
    }

    async checkFolderPermission(folderName) {
        const currentPath = this.getCurrentPath();
        if (currentPath !== '/home') return true;

        const currentUser = this.getCurrentUsername();
        if (folderName === currentUser) return true;

        if (this.authorizedUsers.has(folderName)) return true;

        const userInfo = this.getUserInfo(folderName);
        if (!userInfo || !userInfo.password) return true;

        return await this.showPasswordDialog(folderName);
    }

    async openFolder(folder) {
        const allowed = await this.checkFolderPermission(folder.name);
        if (!allowed) return;

        const currentPath = this.getCurrentPath();
        this.loadFS();
        const targetPath = currentPath === '/' ? `/${folder.name}` : `${currentPath}/${folder.name}`;
        this.navigateToPath(targetPath);
    }

    getFileType(name) {
        const ext = name.split('.').pop().toLowerCase();
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
        const videoExts = ['mp4', 'webm', 'ogg'];
        const audioExts = ['mp3', 'wav', 'flac'];
        const textExts = ['txt', 'md', 'js', 'css', 'html', 'json', 'py', 'java', 'c', 'cpp', 'h', 'sh', 'yaml', 'yml', 'xml'];

        if (imageExts.includes(ext)) return 'image';
        if (videoExts.includes(ext)) return 'video';
        if (audioExts.includes(ext)) return 'audio';
        if (textExts.includes(ext)) return 'text';
        return 'other';
    }

    openFile(file) {
        const filePath = this.getCurrentPath() === '/' ? `/${file.name}` : `${this.getCurrentPath()}/${file.name}`;
        const fileType = this.getFileType(file.name);
        let eventName = 'open-file-in-editor';

        if (fileType === 'image') {
            eventName = 'open-image-viewer';
        } else if (fileType === 'video' || fileType === 'audio') {
            eventName = 'open-media-player';
        } else if (fileType === 'other') {
            this.viewerTitleEl.textContent = file.name;
            this.viewerContentEl.textContent = file.content || '';
            this.viewerEl.style.display = 'flex';
            return;
        }

        const event = new CustomEvent(eventName, {
            detail: { path: filePath }
        });
        window.parent.document.dispatchEvent(event);
    }

    isProtected(name) {
        const currentPath = this.getCurrentPath();
        if (currentPath === '/') {
            return ['home', 'tmp'].includes(name);
        }
        if (currentPath === '/home') {
            return true;
        }
        return false;
    }

    deleteFile(name) {
        if (this.isProtected(name)) {
            alert('无法删除此目录');
            return;
        }
        if (!confirm(`确定删除 "${name}" 吗？`)) return;
        if (!this.currentDir.children) return;
        const index = this.currentDir.children.findIndex(c => c.name === name);
        if (index !== -1) {
            this.currentDir.children.splice(index, 1);
            this.saveFS();
            this.render();
        }
    }

    renameFile(oldName) {
        if (this.isProtected(oldName)) {
            alert('无法重命名此目录');
            return;
        }
        const newName = prompt(`重命名 "${oldName}" 为:`, oldName);
        if (!newName || newName === oldName) return;
        if (!this.currentDir.children) return;
        const node = this.currentDir.children.find(c => c.name === oldName);
        if (node) {
            const existing = this.currentDir.children.find(c => c.name === newName);
            if (existing) {
                alert(`"${newName}" 已存在`);
                return;
            }
            node.name = newName;
            this.saveFS();
            this.render();
        }
    }

    getFileSize(file) {
        if (file.type === 'folder') {
            const count = file.children ? file.children.length : 0;
            return count + ' 项';
        }
        const content = file.content || '';
        return new Blob([content]).size + ' B';
    }

    render() {
        this.pathEl.textContent = this.getCurrentPath();

        document.querySelectorAll('.fm-sidebar-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.path === this.getCurrentPath()) {
                item.classList.add('active');
            }
        });

        this.filelistEl.innerHTML = '';

        const children = this.currentDir.children || [];
        if (children.length === 0) {
            this.filelistEl.innerHTML = '<div class="fm-empty">此文件夹为空</div>';
            return;
        }

        const sorted = [...children].sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        sorted.forEach(item => {
            const el = document.createElement('div');
            el.className = 'fm-file-item';

            const icon = document.createElement('div');
            icon.className = 'fm-file-icon';
            icon.innerHTML = item.type === 'folder' ? FOLDER_ICON : FILE_ICON;
            el.appendChild(icon);

            const name = document.createElement('div');
            name.className = 'fm-file-name';
            name.textContent = item.name + (item.type === 'folder' ? '/' : '');
            el.appendChild(name);

            const size = document.createElement('div');
            size.className = 'fm-file-size';
            size.textContent = this.getFileSize(item);
            el.appendChild(size);

            const actions = document.createElement('div');
            actions.className = 'fm-file-actions';

            const renameBtn = document.createElement('button');
            renameBtn.className = 'fm-action-btn';
            renameBtn.textContent = '重命名';
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.renameFile(item.name);
            });
            actions.appendChild(renameBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'fm-action-btn danger';
            deleteBtn.textContent = '删除';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(item.name);
            });
            actions.appendChild(deleteBtn);

            el.appendChild(actions);

            el.addEventListener('click', () => {
                if (item.type === 'folder') {
                    this.openFolder(item);
                } else {
                    this.openFile(item);
                }
            });

            this.filelistEl.appendChild(el);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.fileManager = new FileManager();
});