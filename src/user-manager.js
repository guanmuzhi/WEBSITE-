import StorageService from './storage.js?v=17';
const CURRENT_USER_KEY = 'web-terminal-os-current-user';
class UserManager {
    static instance = null;
    static getInstance() {
        if (!UserManager.instance) {
            UserManager.instance = new UserManager();
        }
        return UserManager.instance;
    }
    constructor() {
        if (UserManager.instance) {
            return UserManager.instance;
        }
        this.storage = StorageService.getInstance();
        this.users = this.load();
        if (this.users.length === 0) {
            this.createDefaultUser();
        }
        this.ensureHomeDir();
        this.migrateLegacyStateFiles();
        UserManager.instance = this;
    }
    ensureHomeDir() {
        this.storage.createPath('/user');
        this.users.forEach(user => {
            this.ensureUserDirs(user.username);
        });
    }
    ensureUserDirs(username) {
        this.storage.createPath(`/user/${username}`);
        this.storage.createPath(`/user/${username}/info`);
        this.storage.createPath(`/user/${username}/appinfo`);
    }
    /**
     * Migrate legacy state files from home root into info/ subdirectory.
     * Old: /user/<name>/wallpaper.json, /user/<name>/windows_status.json
     * New: /user/<name>/info/wallpaper.json, /user/<name>/info/windows_status.json
     */
    migrateLegacyStateFiles() {
        this.users.forEach(user => {
            const home = this.storage.getNodeByPath(`/user/${user.username}`);
            if (!home || !home.children) return;
            const legacyFiles = ['wallpaper.json', 'windows_status.json'];
            legacyFiles.forEach(filename => {
                const idx = home.children.findIndex(c => c.name === filename && c.type === 'file');
                if (idx !== -1) {
                    const file = home.children[idx];
                    this.storage.writeFile(`/user/${user.username}/info/${filename}`, file.content);
                    home.children.splice(idx, 1);
                }
            });
        });
        this.storage.saveFS();
    }
    createDefaultUser() {
        this.users = [{
            username: 'public',
            password: null,
            createdAt: new Date().toISOString()
        }];
        this.save();
        this.ensureUserDirs('public');
        this.seedPublicHome();
    }
    seedPublicHome() {
        const home = this.storage.getNodeByPath('/user/public');
        if (!home) return;
        if (!home.children) home.children = [];
        if (!home.children.find(c => c.name === 'welcome.txt')) {
            home.children.push({
                type: 'file',
                name: 'welcome.txt',
                content: '欢迎使用 Web Terminal OS!\n\n这是一个基于浏览器的终端操作系统。\n\n可用命令:\n- ls: 列出当前目录内容\n- ls -a: 显示所有文件（包括系统目录）\n- pwd: 显示当前路径\n- cd <文件夹名>: 进入指定文件夹\n- cd ..: 返回上级目录\n- new folder <文件名>: 创建文件夹\n- new file <文件名>: 创建文件\n- delete <文件名>: 删除文件或文件夹\n- open <文件名>: 使用vi编辑器打开文件\n- clear: 清空屏幕\n- help: 显示帮助信息\n- account new <用户名> [密码]: 创建新用户\n- account switch <用户名>: 切换用户\n- account delete <用户名>: 删除用户\n\nvi编辑器快捷键:\n- i: 进入插入模式\n- Esc: 返回正常模式\n- :w: 保存文件\n- :q: 退出编辑器\n- :wq: 保存并退出\n- :q!: 强制退出（不保存）\n- dd: 删除当前行\n- x: 删除当前字符\n- u: 撤销\n'
            });
        }
        if (!home.children.find(c => c.name === 'readme.md')) {
            home.children.push({
                type: 'file',
                name: 'readme.md',
                content: '# Web Terminal OS\n\n一个网页版的终端操作系统。\n\n## 特性\n\n- 客户端数据持久化\n- 支持文件和文件夹操作\n- vi风格文本编辑器\n- 多用户支持，用户数据互相隔离\n- 每个用户拥有独立的 info（系统配置）和 appinfo（应用数据）目录\n'
            });
        }
        this.storage.saveFS();
    }
    load() {
        const data = this.storage.loadUsers();
        return data ? data : [];
    }
    save() {
        this.storage.saveUsers(this.users);
    }
    createUser(username, password = null) {
        if (this.users.find(u => u.username === username)) {
            return { success: false, message: `用户 "${username}" 已存在` };
        }
        if (!username || username.trim() === '') {
            return { success: false, message: '用户名不能为空' };
        }
        if (username.includes('/') || username.includes('\\') || username.includes(' ')) {
            return { success: false, message: '用户名不能包含 / \\ 或空格' };
        }
        this.users.push({
            username: username,
            password: password,
            createdAt: new Date().toISOString()
        });
        this.save();
        this.ensureUserDirs(username);
        return { success: true, message: `用户 "${username}" 创建成功` };
    }
    deleteUser(username) {
        const user = this.users.find(u => u.username === username);
        if (!user) {
            return { success: false, message: `用户 "${username}" 不存在` };
        }
        if (this.users.length === 1) {
            return { success: false, message: '至少保留一个用户' };
        }
        const index = this.users.indexOf(user);
        this.users.splice(index, 1);
        this.save();
        this.deleteUserDir(username);
        return { success: true, message: `用户 "${username}" 删除成功` };
    }
    deleteUserDir(username) {
        const homeDir = this.storage.getNodeByPath('/user');
        if (homeDir && homeDir.children) {
            const userDirIndex = homeDir.children.findIndex(c => c.name === username && c.type === 'folder');
            if (userDirIndex !== -1) {
                homeDir.children.splice(userDirIndex, 1);
                this.storage.saveFS();
            }
        }
    }
    renameUser(oldUsername, newUsername, password = null) {
        if (!oldUsername || !newUsername) {
            return { success: false, message: '用户名不能为空' };
        }
        if (newUsername.includes('/') || newUsername.includes('\\') || newUsername.includes(' ')) {
            return { success: false, message: '用户名不能包含 / \\ 或空格' };
        }
        const user = this.users.find(u => u.username === oldUsername);
        if (!user) {
            return { success: false, message: `用户 "${oldUsername}" 不存在` };
        }
        if (this.users.find(u => u.username === newUsername)) {
            return { success: false, message: `用户 "${newUsername}" 已存在` };
        }
        if (user.password && password !== user.password) {
            return { success: false, message: '密码错误' };
        }
        user.username = newUsername;
        this.save();
        this.renameUserDir(oldUsername, newUsername);
        if (this.getCurrentUser()?.username === oldUsername) {
            this.setCurrentUser(newUsername);
        }
        return { success: true, message: `用户 "${oldUsername}" 已重命名为 "${newUsername}"` };
    }
    renameUserDir(oldUsername, newUsername) {
        const homeDir = this.storage.getNodeByPath('/user');
        if (homeDir && homeDir.children) {
            const userDir = homeDir.children.find(c => c.name === oldUsername && c.type === 'folder');
            if (userDir) {
                userDir.name = newUsername;
                this.migrateUserState(oldUsername, newUsername);
                this.storage.saveFS();
            }
        }
    }
    migrateUserState(oldUsername, newUsername) {
        const mappings = [
            ['info/windows_status.json', 'info/windows_status.json'],
            ['info/wallpaper.json', 'info/wallpaper.json']
        ];
        mappings.forEach(([src, dst]) => {
            const content = this.storage.readFile(`/user/${oldUsername}/${src}`);
            if (content) {
                this.storage.writeFile(`/user/${newUsername}/${dst}`, content);
                this.storage.deleteFile(`/user/${oldUsername}/${src}`);
            }
        });
    }
    getUser(username) {
        return this.users.find(u => u.username === username);
    }
    verifyPassword(username, password) {
        const user = this.getUser(username);
        if (!user) return false;
        return user.password === password;
    }
    listUsers() {
        return this.users;
    }
    getCurrentUser() {
        const username = localStorage.getItem(CURRENT_USER_KEY);
        if (username) {
            return this.getUser(username);
        }
        return this.users[0];
    }
    setCurrentUser(username) {
        localStorage.setItem(CURRENT_USER_KEY, username);
    }
    getDefaultUser() {
        return this.getUser('public') || this.users[0];
    }
    reload() {
        this.users = this.load();
    }
}
export default UserManager;