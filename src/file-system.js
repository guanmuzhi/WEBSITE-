import StorageService from './storage.js?v=31';
import { Path as PathUtil } from './lib/index.js?v=31';
const CURRENT_DIR_KEY = 'web-terminal-os-cwd';
// System directories that are read-only for all users
const SYSTEM_PATHS = ['/application', '/languages'];
// Directories inside a user home that are hidden from normal ls
const HIDDEN_DIRS = new Set(['info', 'appinfo']);
class FileSystem {
    constructor() {
        this.storage = StorageService.getInstance();
        this._currentDir = null;
        this.ensureDefaultStructure();
        this.load();
    }
    get root() {
        return this.storage.fs;
    }
    set root(value) {
        // read-only facade; actual root is managed by StorageService
    }
    get currentDir() {
        return this._currentDir || this.root;
    }
    set currentDir(value) {
        this._currentDir = value;
    }
    ensureDefaultStructure() {
        const fs = this.storage.fs;
        if (!fs.children) fs.children = [];
        const required = ['application', 'user', 'languages'];
        required.forEach(name => {
            if (!fs.children.find(c => c.name === name && c.type === 'folder')) {
                fs.children.push({ type: 'folder', name, children: [] });
            }
        });
        // Remove legacy tmp directory from user-visible root
        const tmpIdx = fs.children.findIndex(c => c.name === 'tmp' && c.type === 'folder');
        if (tmpIdx !== -1) {
            fs.children.splice(tmpIdx, 1);
        }
        this.storage.saveFS();
    }
    createUserHome(username) {
        const homeDir = this.root.children.find(c => c.name === 'user');
        if (!homeDir) {
            return { success: false, message: 'user 目录不存在' };
        }
        if (homeDir.children.find(c => c.name === username)) {
            // Ensure subdirectories exist even if home already created
            this.storage.createPath(`/user/${username}/info`);
            this.storage.createPath(`/user/${username}/appinfo`);
            return { success: true, message: '用户目录已存在' };
        }
        homeDir.children.push({
            type: 'folder',
            name: username,
            children: [
                { type: 'folder', name: 'info', children: [] },
                { type: 'folder', name: 'appinfo', children: [] }
            ]
        });
        this.save();
        return { success: true, message: '用户目录 "/user/' + username + '" 创建成功' };
    }
    deleteUserHome(username) {
        const homeDir = this.root.children.find(c => c.name === 'user');
        if (!homeDir) {
            return { success: false, message: 'user 目录不存在' };
        }
        const userDirIndex = homeDir.children.findIndex(c => c.name === username);
        if (userDirIndex === -1) {
            return { success: false, message: '用户目录 "/user/' + username + '" 不存在' };
        }
        homeDir.children.splice(userDirIndex, 1);
        this.save();
        return { success: true, message: '用户目录 "/user/' + username + '" 删除成功' };
    }
    getHomeDir(username) {
        const homeDir = this.root.children.find(c => c.name === 'user');
        if (!homeDir) return null;
        return homeDir.children.find(c => c.name === username);
    }
    load() {
        const cwdPath = localStorage.getItem(CURRENT_DIR_KEY);
        if (cwdPath) {
            this._currentDir = this.findNodeByPath(cwdPath);
        }
        if (!this._currentDir) {
            this._currentDir = this.root;
        }
    }
    save() {
        this.storage.saveFS();
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
        // 公共库 normalize + split 保证路径先被规整（去除 '..'/'.' 与多斜杠），再按 '/' 取段
        const normalized = PathUtil.normalize(path);
        const segments = normalized.startsWith('/') ? normalized.slice(1) : normalized;
        const parts = segments ? segments.split('/').filter(p => p) : [];
        let node = this.root;
        for (const part of parts) {
            if (node.children) {
                node = node.children.find(c => c.name === part);
            }
            if (!node) return this.root;
        }
        return node;
    }
    /**
     * List directory contents.
     * @param {boolean} showHidden - if true, include info/ and appinfo/ system dirs
     */
    ls(showHidden = false) {
        if (!this.currentDir.children) return [];
        if (showHidden) return this.currentDir.children;
        return this.currentDir.children.filter(c => !HIDDEN_DIRS.has(c.name));
    }
    isHiddenDir(name) {
        return HIDDEN_DIRS.has(name);
    }
    /**
     * Check if a path is a read-only system path.
     */
    isSystemPath(path) {
        const normalized = path.replace(/\/+$/, '');
        if (normalized === '/' || normalized === '') return false;
        return SYSTEM_PATHS.some(sp =>
            normalized === sp || normalized.startsWith(sp + '/')
        );
    }
    /**
     * Get the username that owns a path, or null if not under /user/.
     */
    getPathOwner(path) {
        // PathUtil.split 与 normalize 统一处理相对路径与多段跳转
        const parts = PathUtil.normalize(path).split('/').filter(p => p);
        if (parts[0] === 'user' && parts[1]) {
            return parts[1];
        }
        return null;
    }
    createFolder(name) {
        if (!this.currentDir.children) this.currentDir.children = [];
        if (this.currentDir.children.find(c => c.name === name)) {
            return { success: false, message: '文件夹 "' + name + '" 已存在' };
        }
        this.currentDir.children.push({
            type: 'folder',
            name: name,
            children: []
        });
        this.save();
        return { success: true, message: '文件夹 "' + name + '" 创建成功' };
    }
    createFile(name, content = '', isBinary = false) {
        if (!this.currentDir.children) this.currentDir.children = [];
        if (this.currentDir.children.find(c => c.name === name)) {
            return { success: false, message: '文件 "' + name + '" 已存在' };
        }
        this.currentDir.children.push({
            type: 'file',
            name: name,
            content: content,
            isBinary: isBinary
        });
        this.save();
        return { success: true, message: '文件 "' + name + '" 创建成功' };
    }
    deleteNode(name) {
        if (!this.currentDir.children) {
            return { success: false, message: '当前目录为空' };
        }
        const index = this.currentDir.children.findIndex(c => c.name === name);
        if (index === -1) {
            return { success: false, message: '找不到 "' + name + '"' };
        }
        this.currentDir.children.splice(index, 1);
        this.save();
        return { success: true, message: '已删除 "' + name + '"' };
    }
    renameNode(oldName, newName) {
        if (!this.currentDir.children) {
            return { success: false, message: '当前目录为空' };
        }
        const node = this.currentDir.children.find(c => c.name === oldName);
        if (!node) {
            return { success: false, message: '找不到 "' + oldName + '"' };
        }
        const existing = this.currentDir.children.find(c => c.name === newName);
        if (existing) {
            return { success: false, message: '"' + newName + '" 已存在' };
        }
        node.name = newName;
        this.save();
        return { success: true, message: '已将 "' + oldName + '" 重命名为 "' + newName + '"' };
    }
    intoFolder(name) {
        if (!this.currentDir.children) {
            return { success: false, message: '当前目录为空' };
        }
        const folder = this.currentDir.children.find(c => c.name === name && c.type === 'folder');
        if (!folder) {
            return { success: false, message: '找不到文件夹 "' + name + '"' };
        }
        this._currentDir = folder;
        this.save();
        return { success: true, message: '' };
    }
    goUp() {
        const parent = this.findParent(this.currentDir);
        if (!parent || parent.name === '/') {
            return { success: false, message: '已经在根目录' };
        }
        this._currentDir = parent;
        this.save();
        return { success: true, message: '' };
    }
    openFile(name) {
        if (!this.currentDir.children) {
            return { success: false, message: '当前目录为空' };
        }
        const file = this.currentDir.children.find(c => c.name === name && c.type === 'file');
        if (!file) {
            return { success: false, message: '找不到文件 "' + name + '"' };
        }
        return { success: true, message: '', content: file.content, file: file };
    }
    saveFile(file, content) {
        file.content = content;
        this.save();
        return { success: true, message: '文件已保存' };
    }
    getTree(node = this.root, prefix = '', permissionCheck = null, showHidden = false) {
        let result = [];
        const children = (node.children || []).filter(c => showHidden || !HIDDEN_DIRS.has(c.name));
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
                result = result.concat(this.getTree(child, childPrefix, permissionCheck, showHidden));
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

    /**
     * 解析"文件路径"（相对当前目录或绝对），返回 { dirPath, absDirPath, fileName, absFilePath }
     * 与 resolvePath 的区别：它允许最后一段是文件名（不需要父目录存在也行，
     * 因为后续 writeFileByPath 会自动创建父目录）。
     *
     * @param {string} filePath  相对或绝对的文件路径（例如 "note.txt"、"../a/b.txt"、"/user/public/x.js"）
     * @returns {{dirPath:string, absDirPath:string, fileName:string, absFilePath:string}}
     */
    splitFilePath(filePath) {
        const p = String(filePath || '').trim();
        const abs = this._normalizeAbsFilePath(p);
        const i = abs.lastIndexOf('/');
        const absDirPath = (i === 0) ? '/' : abs.slice(0, i);
        const fileName = abs.slice(i + 1);
        // dirPath：相对当前目录的等价表示（如果目标在当前目录下就显示相对，否则保持绝对）。
        // 简化实现：直接用 absDirPath 作为 canonical。
        return { dirPath: absDirPath, absDirPath, fileName, absFilePath: abs };
    }

    _normalizeAbsFilePath(p) {
        const base = this.getCurrentPath();
        if (!p) return base + '/';
        if (p.startsWith('/')) return this._normalizePathSegs(p);
        return this._normalizePathSegs(base + '/' + p);
    }
    _normalizePathSegs(p) {
        const abs = p.startsWith('/');
        const parts = p.split('/').filter(x => x !== '' && x !== '.');
        const out = [];
        for (const seg of parts) {
            if (seg === '..') {
                if (out.length > 0) out.pop();
            } else {
                out.push(seg);
            }
        }
        return (abs ? '/' : '') + out.join('/');
    }

    /**
     * 按路径找文件节点（相对或绝对）。文件不存在返回 null。
     */
    getFileByPath(filePath) {
        const { absDirPath, fileName } = this.splitFilePath(filePath);
        const folder = this.findNodeByPath(absDirPath);
        if (!folder || !folder.children) return null;
        return folder.children.find(c => c.name === fileName && c.type === 'file') || null;
    }

    /**
     * 按路径写入文件内容：
     *   - 父目录不存在时自动创建（复用 storage.createPath）
     *   - 文件不存在时自动创建
     *   - 自动 save()
     * 返回 { success, message, file, created:boolean }
     */
    writeFileByPath(filePath, content = '') {
        const { absDirPath, fileName, absFilePath } = this.splitFilePath(filePath);
        if (!fileName) return { success: false, message: '目标路径缺少文件名' };
        const folder = this.storage.createPath(absDirPath);
        if (!folder) return { success: false, message: '无法创建父目录 "' + absDirPath + '"' };
        if (!folder.children) folder.children = [];
        let idx = folder.children.findIndex(c => c.name === fileName && c.type === 'file');
        let created = false;
        if (idx === -1) {
            folder.children.push({ type: 'file', name: fileName, content: '' });
            idx = folder.children.length - 1;
            created = true;
        }
        const file = folder.children[idx];
        file.content = typeof content === 'string' ? content : JSON.stringify(content);
        this.save();
        return { success: true, message: created ? `已创建 "${absFilePath}" 并写入` : `已写入 "${absFilePath}"`, file, created };
    }
    moveFile(filename, targetPath) {
        const file = this.currentDir.children.find(c => c.name === filename && c.type === 'file');
        if (!file) {
            return { success: false, message: '找不到文件 "' + filename + '"' };
        }
        const targetDir = this.resolvePath(targetPath);
        if (!targetDir) {
            return { success: false, message: '找不到目标路径 "' + targetPath + '"' };
        }
        if (!targetDir.children) targetDir.children = [];
        const existing = targetDir.children.find(c => c.name === filename);
        if (existing) {
            return { success: false, message: '目标目录中已存在 "' + filename + '"' };
        }
        const index = this.currentDir.children.indexOf(file);
        this.currentDir.children.splice(index, 1);
        targetDir.children.push(file);
        this.save();
        return { success: true, message: '已将 "' + filename + '" 移动到 "' + targetPath + '"' };
    }
    copyFile(filename, targetPath = '.') {
        const file = this.currentDir.children.find(c => c.name === filename && c.type === 'file');
        if (!file) {
            return { success: false, message: '找不到文件 "' + filename + '"' };
        }
        const targetDir = this.resolvePath(targetPath);
        if (!targetDir) {
            return { success: false, message: '找不到目标路径 "' + targetPath + '"' };
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
        return { success: true, message: '已将 "' + filename + '" 复制为 "' + newName + '"' };
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