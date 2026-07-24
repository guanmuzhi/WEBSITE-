const USER_DATA_KEY = 'web-terminal-os-users';
const CURRENT_USER_KEY = 'web-terminal-os-current-user';
const FS_KEY = 'web-terminal-os-data';

class UserManager {
    constructor() {
        this.users = this.load();
        if (this.users.length === 0) {
            this.createDefaultUser();
        }
        this.ensureHomeDir();
    }

    ensureHomeDir() {
        const fs = this.loadFS();
        if (!fs.children) fs.children = [];
        let homeDir = fs.children.find(c => c.name === 'home' && c.type === 'folder');
        if (!homeDir) {
            homeDir = { type: 'folder', name: 'home', children: [] };
            fs.children.push(homeDir);
            this.saveFS(fs);
        }

        this.users.forEach(user => {
            const userDir = homeDir.children.find(c => c.name === user.username && c.type === 'folder');
            if (!userDir) {
                homeDir.children.push({ type: 'folder', name: user.username, children: [] });
            }
        });
        this.saveFS(fs);
    }

    loadFS() {
        const data = localStorage.getItem(FS_KEY);
        return data ? JSON.parse(data) : { type: 'folder', name: '/', children: [] };
    }

    saveFS(fs) {
        localStorage.setItem(FS_KEY, JSON.stringify(fs));
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
        const data = localStorage.getItem(USER_DATA_KEY);
        return data ? JSON.parse(data) : [];
    }

    save() {
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(this.users));
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
        this.createUserDir(username);
        return { success: true, message: `用户 "${username}" 创建成功` };
    }

    createUserDir(username) {
        const fs = this.loadFS();
        if (!fs.children) fs.children = [];
        let homeDir = fs.children.find(c => c.name === 'home' && c.type === 'folder');
        if (!homeDir) {
            homeDir = { type: 'folder', name: 'home', children: [] };
            fs.children.push(homeDir);
        }
        const existingDir = homeDir.children.find(c => c.name === username && c.type === 'folder');
        if (!existingDir) {
            homeDir.children.push({ type: 'folder', name: username, children: [] });
            this.saveFS(fs);
        }
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
        const fs = this.loadFS();
        if (!fs.children) fs.children = [];
        const homeDir = fs.children.find(c => c.name === 'home' && c.type === 'folder');
        if (homeDir && homeDir.children) {
            const userDirIndex = homeDir.children.findIndex(c => c.name === username && c.type === 'folder');
            if (userDirIndex !== -1) {
                homeDir.children.splice(userDirIndex, 1);
                this.saveFS(fs);
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
        const fs = this.loadFS();
        if (!fs.children) fs.children = [];
        const homeDir = fs.children.find(c => c.name === 'home' && c.type === 'folder');
        if (homeDir && homeDir.children) {
            const userDir = homeDir.children.find(c => c.name === oldUsername && c.type === 'folder');
            if (userDir) {
                userDir.name = newUsername;
                this.saveFS(fs);
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