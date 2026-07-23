const STORAGE_KEY = 'web-terminal-os-data';
const CURRENT_DIR_KEY = 'web-terminal-os-cwd';

class FileSystem {
    constructor() {
        this.root = null;
        this.currentDir = null;
        this.load();
    }

    createDefaultStructure() {
        this.root = {
            type: 'folder',
            name: '/',
            children: [
                {
                    type: 'folder',
                    name: 'home',
                    children: []
                },
                {
                    type: 'folder',
                    name: 'tmp',
                    children: []
                }
            ]
        };
        this.save();
    }

    createUserHome(username) {
        const homeDir = this.root.children.find(c => c.name === 'home');
        if (!homeDir) {
            return { success: false, message: 'home 目录不存在' };
        }

        if (homeDir.children.find(c => c.name === username)) {
            return { success: false, message: `用户目录 "/home/${username}" 已存在` };
        }

        const children = username === 'public' ? [
                {
                    type: 'file',
                    name: 'welcome.txt',
                    content: '欢迎使用 Web Terminal OS!\n\n这是一个基于浏览器的终端操作系统。\n\n可用命令:\n- ls: 列出当前目录内容\n- pwd: 显示当前路径\n- cd <文件夹名>: 进入指定文件夹\n- cd ..: 返回上级目录\n- new folder <文件名>: 创建文件夹\n- new file <文件名>: 创建文件\n- delete <文件名>: 删除文件或文件夹\n- open <文件名>: 使用vi编辑器打开文件\n- clear: 清空屏幕\n- help: 显示帮助信息\n- account new <用户名> [密码]: 创建新用户\n- account switch <用户名>: 切换用户\n- account delete <用户名>: 删除用户\n\nvi编辑器快捷键:\n- i: 进入插入模式\n- Esc: 返回正常模式\n- :w: 保存文件\n- :q: 退出编辑器\n- :wq: 保存并退出\n- :q!: 强制退出（不保存）\n- dd: 删除当前行\n- x: 删除当前字符\n- u: 撤销\n'
                },
                {
                    type: 'file',
                    name: 'readme.md',
                    content: '# Web Terminal OS\n\n一个网页版的终端操作系统。\n\n## 特性\n\n- 客户端数据持久化\n- 支持文件和文件夹操作\n- vi风格文本编辑器\n- 多用户支持\n'
                }
            ] : [];

        homeDir.children.push({
            type: 'folder',
            name: username,
            children: children
        });
        this.save();
        return { success: true, message: `用户目录 "/home/${username}" 创建成功` };
    }

    deleteUserHome(username) {
        const homeDir = this.root.children.find(c => c.name === 'home');
        if (!homeDir) {
            return { success: false, message: 'home 目录不存在' };
        }

        const userDirIndex = homeDir.children.findIndex(c => c.name === username);
        if (userDirIndex === -1) {
            return { success: false, message: `用户目录 "/home/${username}" 不存在` };
        }

        homeDir.children.splice(userDirIndex, 1);
        this.save();
        return { success: true, message: `用户目录 "/home/${username}" 删除成功` };
    }

    getHomeDir(username) {
        const homeDir = this.root.children.find(c => c.name === 'home');
        if (!homeDir) return null;
        return homeDir.children.find(c => c.name === username);
    }

    load() {
        const data = localStorage.getItem(STORAGE_KEY);
        const cwdPath = localStorage.getItem(CURRENT_DIR_KEY);
        
        if (data) {
            try {
                this.root = JSON.parse(data);
                if (cwdPath) {
                    this.currentDir = this.findNodeByPath(cwdPath);
                } else {
                    this.currentDir = this.root;
                }
            } catch (e) {
                this.createDefaultStructure();
            }
        } else {
            this.createDefaultStructure();
        }
    }

    save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.root));
        localStorage.setItem(CURRENT_DIR_KEY, this.getCurrentPath());
    }

    getCurrentPath() {
        const path = [];
        let node = this.currentDir;
        
        while (node) {
            path.unshift(node.name);
            if (node.name === '/') break;
            node = this.findParent(node);
        }
        
        return path.join('/');
    }

    findParent(node) {
        const find = (current) => {
            if (current.children && current.children.includes(node)) {
                return current;
            }
            for (const child of current.children || []) {
                if (child.type === 'folder') {
                    const result = find(child);
                    if (result) return result;
                }
            }
            return null;
        };
        return find(this.root);
    }

    findNodeByPath(path) {
        const parts = path.split('/').filter(p => p);
        let node = this.root;
        
        for (const part of parts) {
            if (part === 'home') {
                node = node.children.find(c => c.name === 'home');
            } else if (node.children) {
                node = node.children.find(c => c.name === part);
            }
            if (!node) return this.root;
        }
        
        return node;
    }

    ls() {
        if (!this.currentDir.children) return [];
        return this.currentDir.children;
    }

    createFolder(name) {
        if (!this.currentDir.children) this.currentDir.children = [];
        
        if (this.currentDir.children.find(c => c.name === name)) {
            return { success: false, message: `文件夹 "${name}" 已存在` };
        }
        
        this.currentDir.children.push({
            type: 'folder',
            name: name,
            children: []
        });
        this.save();
        return { success: true, message: `文件夹 "${name}" 创建成功` };
    }

    createFile(name, content = '', isBinary = false) {
        if (!this.currentDir.children) this.currentDir.children = [];
        
        if (this.currentDir.children.find(c => c.name === name)) {
            return { success: false, message: `文件 "${name}" 已存在` };
        }
        
        this.currentDir.children.push({
            type: 'file',
            name: name,
            content: content,
            isBinary: isBinary
        });
        this.save();
        return { success: true, message: `文件 "${name}" 创建成功` };
    }

    deleteNode(name) {
        if (!this.currentDir.children) {
            return { success: false, message: '当前目录为空' };
        }
        
        const index = this.currentDir.children.findIndex(c => c.name === name);
        if (index === -1) {
            return { success: false, message: `找不到 "${name}"` };
        }
        
        this.currentDir.children.splice(index, 1);
        this.save();
        return { success: true, message: `已删除 "${name}"` };
    }

    renameNode(oldName, newName) {
        if (!this.currentDir.children) {
            return { success: false, message: '当前目录为空' };
        }
        
        const node = this.currentDir.children.find(c => c.name === oldName);
        if (!node) {
            return { success: false, message: `找不到 "${oldName}"` };
        }
        
        const existing = this.currentDir.children.find(c => c.name === newName);
        if (existing) {
            return { success: false, message: `"${newName}" 已存在` };
        }
        
        node.name = newName;
        this.save();
        return { success: true, message: `已将 "${oldName}" 重命名为 "${newName}"` };
    }

    intoFolder(name) {
        if (!this.currentDir.children) {
            return { success: false, message: '当前目录为空' };
        }
        
        const folder = this.currentDir.children.find(c => c.name === name && c.type === 'folder');
        if (!folder) {
            return { success: false, message: `找不到文件夹 "${name}"` };
        }
        
        this.currentDir = folder;
        this.save();
        return { success: true, message: '' };
    }

    goUp() {
        const parent = this.findParent(this.currentDir);
        if (!parent || parent.name === '/') {
            return { success: false, message: '已经在根目录' };
        }
        
        this.currentDir = parent;
        this.save();
        return { success: true, message: '' };
    }

    openFile(name) {
        if (!this.currentDir.children) {
            return { success: false, message: '当前目录为空' };
        }
        
        const file = this.currentDir.children.find(c => c.name === name && c.type === 'file');
        if (!file) {
            return { success: false, message: `找不到文件 "${name}"` };
        }
        
        return { success: true, message: '', content: file.content, file: file };
    }

    saveFile(file, content) {
        file.content = content;
        this.save();
        return { success: true, message: '文件已保存' };
    }

    getTree(node = this.root, prefix = '', permissionCheck = null) {
        let result = [];
        const children = node.children || [];
        
        children.forEach((child, index) => {
            const isLast = index === children.length - 1;
            const linePrefix = prefix + (isLast ? '└── ' : '├── ');

            if (permissionCheck) {
                const permission = permissionCheck(child);
                if (!permission.allowed) {
                    if (child.type === 'folder') {
                        result.push(linePrefix + child.name + '/ [权限被拒绝]');
                    } else {
                        result.push(linePrefix + child.name + ' [权限被拒绝]');
                    }
                    return;
                }
            }
            
            if (child.type === 'folder') {
                result.push(linePrefix + child.name + '/');
                const childPrefix = prefix + (isLast ? '    ' : '│   ');
                result = result.concat(this.getTree(child, childPrefix, permissionCheck));
            } else {
                result.push(linePrefix + child.name);
            }
        });
        
        return result;
    }

    resolvePath(pathStr) {
        if (!pathStr || pathStr === '.') {
            return this.currentDir;
        }
        
        if (pathStr === '..') {
            const parent = this.findParent(this.currentDir);
            return parent && parent.name !== '/' ? parent : null;
        }
        
        if (pathStr.startsWith('/')) {
            return this.findNodeByPath(pathStr);
        }
        
        const parts = pathStr.split('/');
        let current = this.currentDir;
        
        for (const part of parts) {
            if (!part || part === '.') continue;
            
            if (part === '..') {
                current = this.findParent(current);
                if (!current || current.name === '/') return null;
            } else {
                const child = current.children.find(c => c.name === part && c.type === 'folder');
                if (!child) return null;
                current = child;
            }
        }
        
        return current;
    }

    moveFile(filename, targetPath) {
        const file = this.currentDir.children.find(c => c.name === filename && c.type === 'file');
        if (!file) {
            return { success: false, message: `找不到文件 "${filename}"` };
        }
        
        const targetDir = this.resolvePath(targetPath);
        if (!targetDir) {
            return { success: false, message: `找不到目标路径 "${targetPath}"` };
        }
        
        if (!targetDir.children) targetDir.children = [];
        
        const existing = targetDir.children.find(c => c.name === filename);
        if (existing) {
            return { success: false, message: `目标目录中已存在 "${filename}"` };
        }
        
        const index = this.currentDir.children.indexOf(file);
        this.currentDir.children.splice(index, 1);
        targetDir.children.push(file);
        this.save();
        
        return { success: true, message: `已将 "${filename}" 移动到 "${targetPath}"` };
    }

    copyFile(filename, targetPath = '.') {
        const file = this.currentDir.children.find(c => c.name === filename && c.type === 'file');
        if (!file) {
            return { success: false, message: `找不到文件 "${filename}"` };
        }
        
        const targetDir = this.resolvePath(targetPath);
        if (!targetDir) {
            return { success: false, message: `找不到目标路径 "${targetPath}"` };
        }
        
        if (!targetDir.children) targetDir.children = [];
        
        const newName = this.generateCopyName(filename, targetDir);
        
        const copy = {
            type: 'file',
            name: newName,
            content: file.content
        };
        
        targetDir.children.push(copy);
        this.save();
        
        return { success: true, message: `已将 "${filename}" 复制为 "${newName}"` };
    }

    generateCopyName(filename, targetDir) {
        const nameParts = filename.split('.');
        let nameWithoutExt;
        let extension = '';
        
        if (nameParts.length > 1) {
            extension = '.' + nameParts.pop();
            nameWithoutExt = nameParts.join('.');
        } else {
            nameWithoutExt = filename;
        }
        
        let newName = nameWithoutExt + '副本' + extension;
        let counter = 2;
        
        while (targetDir.children.find(c => c.name === newName)) {
            newName = nameWithoutExt + '副本' + counter + extension;
            counter++;
        }
        
        return newName;
    }
}

export default FileSystem;