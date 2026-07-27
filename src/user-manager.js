import StorageService from './storage.js?v=14';

const CURRENT_USER_KEY = 'web-terminal-os-current-user';
const USERS_FILE_PATH = '/etc/users.json';

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
        UserManager.instance = this;
    }

    ensureHomeDir() {
        this.storage.createPath('/home');
        
        const homeDir = this.storage.getNodeByPath('/home');
        if (!homeDir || !homeDir.children) return;

        this.users.forEach(user => {
            const userDirPath = `/home/${user.username}`;
            this.storage.createPath(userDirPath);
        });
    }

    createDefaultUser() {
        this.users = [{
            username: 'public',
            password: null,
            createdAt: new Date().toISOString()
        }];
        this.save();
        this.createUserDir('public');
    }

    load() {
        const data = this.storage.loadJSON(USERS_FILE_PATH);
        return data ? data : [];
    }

    save() {
        this.storage.saveJSON(USERS_FILE_PATH, this.users);
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
        this.storage.createPath(`/home/${username}`);
        
        return { success: true, message: `用户 "${username}" 创建成功` };
    }

    createUserDir(username) {
        const userDirPath = `/home/${username}`;
        this.storage.createPath(userDirPath);
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
        const homeDir = this.storage.getNodeByPath('/home');
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
        const homeDir = this.storage.getNodeByPath('/home');
        if (homeDir && homeDir.children) {
            const userDir = homeDir.children.find(c => c.name === oldUsername && c.type === 'folder');
            if (userDir) {
                userDir.name = newUsername;
                this.storage.saveFS();
            }
        }
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
