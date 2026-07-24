const STORAGE_KEY = 'web-terminal-os-data';

const FOLDER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#f1c40f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#95a5a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

class FileManager {
    constructor() {
        this.root = null;
        this.currentDir = null;
        this.pathStack = [];
        this.authorizedUsers = new Set();
        this.clipboard = null;
        this.clipboardAction = null;

        this.filelistEl = document.getElementById('fm-filelist');
        this.pathEl = document.getElementById('fm-path');
        this.viewerEl = document.getElementById('fm-viewer');
        this.viewerTitleEl = document.getElementById('fm-viewer-title');
        this.viewerContentEl = document.getElementById('fm-viewer-content');

        this.loadFS();
        this.initEvents();
        this.render();
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
            const currentPath = this.getCurrentPath();
            this.loadFS();
            this.navigateToPath(currentPath);
        });
        document.getElementById('fm-viewer-close').addEventListener('click', () => {
            this.viewerEl.style.display = 'none';
        });
        document.getElementById('fm-new-folder').addEventListener('click', () => this.createFolder());
        document.getElementById('fm-new-file').addEventListener('click', () => this.createFile());
        document.getElementById('fm-upload').addEventListener('click', () => this.uploadFile());
        document.getElementById('fm-paste').addEventListener('click', () => this.pasteFile());

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

    getOwnerOfCurrentPath() {
        const path = this.getCurrentPath();
        if (path.startsWith('/home/')) {
            const parts = path.split('/');
            if (parts.length >= 3) {
                return parts[2];
            }
        }
        return null;
    }

    async checkPermissionForAction() {
        const owner = this.getOwnerOfCurrentPath();
        if (!owner) return true;

        const currentUser = this.getCurrentUsername();
        if (owner === currentUser) return true;

        if (this.authorizedUsers.has(owner)) return true;

        const userInfo = this.getUserInfo(owner);
        if (!userInfo || !userInfo.password) return true;

        return await this.showPasswordDialog(owner);
    }

    async openFolder(folder) {
        const path = this.getCurrentPath();
        if (path === '/' || path === '/home') {
            const allowed = await this.checkFolderPermission(folder.name);
            if (!allowed) return;
        } else {
            const allowed = await this.checkPermissionForAction();
            if (!allowed) return;
        }

        const currentPath = this.getCurrentPath();
        this.loadFS();
        const targetPath = currentPath === '/' ? `/${folder.name}` : `${currentPath}/${folder.name}`;
        this.navigateToPath(targetPath);
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

    async openFile(file) {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;

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

    async deleteFile(name) {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;

        if (this.isProtected(name)) {
            await this.showAlert('无法删除此目录');
            return;
        }
        const confirmed = await this.showConfirm(`确定删除 "${name}" 吗？`);
        if (!confirmed) return;
        if (!this.currentDir.children) return;
        const index = this.currentDir.children.findIndex(c => c.name === name);
        if (index !== -1) {
            this.currentDir.children.splice(index, 1);
            this.saveFS();
            this.render();
        }
    }

    async renameFile(oldName) {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;

        if (this.isProtected(oldName)) {
            await this.showAlert('无法重命名此目录');
            return;
        }
        const newName = await this.showPrompt(`重命名 "${oldName}" 为:`, oldName);
        if (!newName || newName === oldName) return;
        if (!this.currentDir.children) return;
        const node = this.currentDir.children.find(c => c.name === oldName);
        if (node) {
            const existing = this.currentDir.children.find(c => c.name === newName);
            if (existing) {
                await this.showAlert(`"${newName}" 已存在`);
                return;
            }
            node.name = newName;
            this.saveFS();
            this.render();
        }
    }

    async createFolder() {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;

        const name = await this.showPrompt('输入文件夹名称:', '新建文件夹');
        if (!name) return;
        if (!this.currentDir.children) this.currentDir.children = [];
        const existing = this.currentDir.children.find(c => c.name === name && c.type === 'folder');
        if (existing) {
            await this.showAlert(`文件夹 "${name}" 已存在`);
            return;
        }
        this.currentDir.children.push({
            type: 'folder',
            name: name,
            children: []
        });
        this.saveFS();
        this.render();
    }

    async createFile() {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;

        const name = await this.showPrompt('输入文件名称:', '新建文件.txt');
        if (!name) return;
        if (!this.currentDir.children) this.currentDir.children = [];
        const existing = this.currentDir.children.find(c => c.name === name && c.type === 'file');
        if (existing) {
            await this.showAlert(`文件 "${name}" 已存在`);
            return;
        }
        this.currentDir.children.push({
            type: 'file',
            name: name,
            content: ''
        });
        this.saveFS();
        this.render();
    }

    async copyFile(name) {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;

        if (!this.currentDir.children) return;
        const node = this.currentDir.children.find(c => c.name === name);
        if (!node) return;

        this.clipboard = JSON.parse(JSON.stringify(node));
        this.clipboardAction = 'copy';
        await this.showAlert(`已复制 "${name}"`);
    }

    async cutFile(name) {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;

        if (!this.currentDir.children) return;
        const node = this.currentDir.children.find(c => c.name === name);
        if (!node) return;

        this.clipboard = JSON.parse(JSON.stringify(node));
        this.clipboardAction = 'cut';
        await this.showAlert(`已剪切 "${name}"`);
    }

    async pasteFile() {
        if (!this.clipboard) {
            await this.showAlert('剪贴板为空');
            return;
        }

        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;

        const targetName = this.clipboard.name;
        if (!this.currentDir.children) this.currentDir.children = [];
        const existing = this.currentDir.children.find(c => c.name === targetName);
        
        let finalName = targetName;
        if (existing) {
            const ext = targetName.includes('.') ? targetName.substring(targetName.lastIndexOf('.')) : '';
            const base = targetName.includes('.') ? targetName.substring(0, targetName.lastIndexOf('.')) : targetName;
            let counter = 1;
            while (this.currentDir.children.find(c => c.name === `${base}(${counter})${ext}`)) {
                counter++;
            }
            finalName = `${base}(${counter})${ext}`;
        }

        const newItem = JSON.parse(JSON.stringify(this.clipboard));
        newItem.name = finalName;
        this.currentDir.children.push(newItem);

        if (this.clipboardAction === 'cut') {
            const sourcePath = this.clipboard._sourcePath || '/';
            this.removeFromPath(sourcePath, this.clipboard.name);
        }

        this.saveFS();
        this.render();
        await this.showAlert(`已粘贴 "${finalName}"`);
    }

    removeFromPath(pathStr, name) {
        const parts = pathStr.split('/').filter(p => p);
        let node = this.root;
        for (const part of parts) {
            if (node.children) {
                const child = node.children.find(c => c.name === part && c.type === 'folder');
                if (child) node = child;
            }
        }
        if (node.children) {
            const index = node.children.findIndex(c => c.name === name);
            if (index !== -1) {
                node.children.splice(index, 1);
            }
        }
    }

    uploadFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.style.display = 'none';
        input.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            const allowed = await this.checkPermissionForAction();
            if (!allowed) return;

            if (!this.currentDir.children) this.currentDir.children = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileType = this.getFileType(file.name);
                const content = fileType === 'image' || fileType === 'video' || fileType === 'audio' 
                    ? await this.readFileAsDataURL(file) 
                    : await this.readFileAsText(file);
                
                let finalName = file.name;
                const existing = this.currentDir.children.find(c => c.name === file.name);
                if (existing) {
                    const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
                    const base = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
                    let counter = 1;
                    while (this.currentDir.children.find(c => c.name === `${base}(${counter})${ext}`)) {
                        counter++;
                    }
                    finalName = `${base}(${counter})${ext}`;
                }

                this.currentDir.children.push({
                    type: 'file',
                    name: finalName,
                    content: content
                });
            }

            this.saveFS();
            this.render();
            await this.showAlert(`已上传 ${files.length} 个文件`);
        });
        document.body.appendChild(input);
        input.click();
        setTimeout(() => document.body.removeChild(input), 100);
    }

    readFileAsText(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            reader.onerror = () => {
                resolve('');
            };
            reader.readAsText(file);
        });
    }

    readFileAsDataURL(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            reader.onerror = () => {
                resolve('');
            };
            reader.readAsDataURL(file);
        });
    }

    downloadFile(name) {
        const file = this.currentDir.children?.find(c => c.name === name && c.type === 'file');
        if (!file) return;

        let blob;
        if (file.content && file.content.startsWith('data:')) {
            const parts = file.content.split(',');
            const mimeType = parts[0].split(':')[1].split(';')[0];
            const data = parts[1];
            const byteString = atob(data);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            blob = new Blob([ab], { type: mimeType });
        } else {
            blob = new Blob([file.content || ''], { type: 'text/plain' });
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    async downloadFolder(name) {
        const folder = this.currentDir.children?.find(c => c.name === name && c.type === 'folder');
        if (!folder) return;

        const zip = new JSZip();
        this.addFolderToZip(zip, folder, name);

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = name + '.zip';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    addFolderToZip(zip, folder, path) {
        if (folder.children) {
            folder.children.forEach(item => {
                const itemPath = path + '/' + item.name;
                if (item.type === 'folder') {
                    this.addFolderToZip(zip, item, itemPath);
                } else {
                    let content;
                    if (item.content && item.content.startsWith('data:')) {
                        const parts = item.content.split(',');
                        content = atob(parts[1]);
                    } else {
                        content = item.content || '';
                    }
                    zip.file(item.name, content);
                }
            });
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

            const copyBtn = document.createElement('button');
            copyBtn.className = 'fm-action-btn';
            copyBtn.textContent = '复制';
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.copyFile(item.name);
            });
            actions.appendChild(copyBtn);

            const cutBtn = document.createElement('button');
            cutBtn.className = 'fm-action-btn';
            cutBtn.textContent = '剪切';
            cutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cutFile(item.name);
            });
            actions.appendChild(cutBtn);

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

            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'fm-action-btn';
            downloadBtn.textContent = '下载';
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.type === 'file') {
                    this.downloadFile(item.name);
                } else {
                    this.downloadFolder(item.name);
                }
            });
            actions.appendChild(downloadBtn);

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

        const pasteBtn = document.getElementById('fm-paste');
        if (pasteBtn) {
            pasteBtn.style.display = this.clipboard ? 'block' : 'none';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.fileManager = new FileManager();
});