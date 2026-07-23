const USER_DATA_KEY = 'web-terminal-os-users';
const CURRENT_USER_KEY = 'web-terminal-os-current-user';

class UserManager {
    constructor() {
        this.users = this.load();
        if (this.users.length === 0) {
            this.createDefaultUser();
        }
    }

    createDefaultUser() {
        this.users = [{
            username: 'public',
            password: null,
            createdAt: new Date().toISOString()
        }];
        this.save();
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
        return { success: true, message: `用户 "${username}" 删除成功` };
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