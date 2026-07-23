import UserManager from './user-manager.js?v=2';

class LockScreen {
    constructor(options = {}) {
        this.userManager = new UserManager();
        this.onUnlock = options.onUnlock || null;
        this.onUserSwitch = options.onUserSwitch || null;
        this.el = null;
        this._create();
    }

    _create() {
        const overlay = document.createElement('div');
        overlay.className = 'lock-screen';

        const lockContainer = document.createElement('div');
        lockContainer.className = 'lock-container';

        const userListBtn = document.createElement('button');
        userListBtn.className = 'lock-user-list-btn';
        userListBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
        userListBtn.addEventListener('click', () => this._toggleUserList());
        lockContainer.appendChild(userListBtn);

        const avatar = document.createElement('div');
        avatar.className = 'lock-user-avatar';
        lockContainer.appendChild(avatar);

        const username = document.createElement('div');
        username.className = 'lock-username';
        lockContainer.appendChild(username);

        const subtitle = document.createElement('div');
        subtitle.className = 'lock-subtitle';
        subtitle.textContent = '点击解锁或切换用户';
        lockContainer.appendChild(subtitle);

        const content = document.createElement('div');
        content.className = 'lock-content';
        lockContainer.appendChild(content);

        const error = document.createElement('div');
        error.className = 'lock-error';
        lockContainer.appendChild(error);

        const userList = document.createElement('div');
        userList.className = 'lock-user-list';
        userList.style.display = 'none';
        lockContainer.appendChild(userList);

        overlay.appendChild(lockContainer);
        document.body.appendChild(overlay);

        this.el = overlay;
        this.lockContainer = lockContainer;
        this.userListBtn = userListBtn;
        this.avatarEl = avatar;
        this.usernameEl = username;
        this.subtitleEl = subtitle;
        this.contentEl = content;
        this.errorEl = error;
        this.userListEl = userList;
        this.passwordInput = null;

        this._render();
    }

    _render() {
        this.contentEl.innerHTML = '';
        this.errorEl.textContent = '';

        const user = this.userManager.getCurrentUser();
        if (!user) {
            return;
        }

        this.usernameEl.textContent = user.username;
        this.avatarEl.textContent = (user.username.charAt(0) || '?').toUpperCase();

        if (user.password) {
            const input = document.createElement('input');
            input.className = 'lock-password-input';
            input.type = 'password';
            input.placeholder = '请输入密码';
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.unlock();
                }
            });
            this.contentEl.appendChild(input);

            const btn = document.createElement('button');
            btn.className = 'lock-unlock-btn';
            btn.textContent = '解锁';
            btn.addEventListener('click', () => this.unlock());
            this.contentEl.appendChild(btn);

            this.passwordInput = input;
        } else {
            const btn = document.createElement('button');
            btn.className = 'lock-unlock-btn';
            btn.textContent = '点击解锁';
            btn.addEventListener('click', () => this.unlock());
            this.contentEl.appendChild(btn);

            this.passwordInput = null;
        }

        const createUserBtn = document.createElement('button');
        createUserBtn.className = 'lock-create-user-btn';
        createUserBtn.textContent = '+ 创建新用户';
        createUserBtn.addEventListener('click', () => this._showCreateUser());
        this.contentEl.appendChild(createUserBtn);

        this._renderUserList();
    }

    _renderUserList() {
        this.userListEl.innerHTML = '';
        
        const users = this.userManager.listUsers();
        const currentUser = this.userManager.getCurrentUser();

        users.forEach(user => {
            const isCurrent = currentUser && user.username === currentUser.username;
            
            const userItem = document.createElement('div');
            userItem.className = 'lock-user-item' + (isCurrent ? ' lock-user-item-current' : '');
            userItem.innerHTML = `
                <div class="lock-user-item-avatar">${(user.username.charAt(0) || '?').toUpperCase()}</div>
                <div class="lock-user-item-info">
                    <div class="lock-user-item-name">${user.username}</div>
                    <div class="lock-user-item-status">${isCurrent ? '当前用户' : (user.password ? '需密码' : '无密码')}</div>
                </div>
            `;
            
            if (!isCurrent) {
                userItem.addEventListener('click', () => {
                    if (user.password) {
                        this._showUserPassword(user.username);
                    } else {
                        this._switchToUser(user.username);
                    }
                });
            }
            
            this.userListEl.appendChild(userItem);
        });
    }

    _toggleUserList() {
        const isHidden = this.userListEl.style.display === 'none';
        this.userListEl.style.display = isHidden ? 'block' : 'none';
        
        if (isHidden) {
            this.userListBtn.classList.add('active');
        } else {
            this.userListBtn.classList.remove('active');
        }
    }

    _showUserPassword(username) {
        this.contentEl.innerHTML = '';
        this.userListEl.style.display = 'none';
        this.userListBtn.classList.remove('active');

        const title = document.createElement('div');
        title.className = 'lock-switch-title';
        title.textContent = `切换到 ${username}`;
        this.contentEl.appendChild(title);

        const input = document.createElement('input');
        input.className = 'lock-password-input';
        input.type = 'password';
        input.placeholder = '请输入密码';
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._verifyAndSwitch(username, input.value);
            }
        });
        this.contentEl.appendChild(input);

        const errorDiv = document.createElement('div');
        errorDiv.className = 'lock-error';
        this.contentEl.appendChild(errorDiv);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'lock-switch-cancel-btn';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => this._render());
        this.contentEl.appendChild(cancelBtn);

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'lock-switch-confirm-btn';
        confirmBtn.textContent = '确认切换';
        confirmBtn.addEventListener('click', () => {
            this._verifyAndSwitch(username, input.value, errorDiv);
        });
        this.contentEl.appendChild(confirmBtn);

        input.focus();
    }

    _verifyAndSwitch(username, password, errorDiv) {
        if (this.userManager.verifyPassword(username, password)) {
            this._switchToUser(username);
        } else {
            if (errorDiv) {
                errorDiv.textContent = '密码错误';
            } else {
                this.errorEl.textContent = '密码错误';
            }
        }
    }

    _switchToUser(username) {
        if (typeof this.onUserSwitch === 'function') {
            this.onUserSwitch(username);
        }
        
        this.userManager.reload();
        this._render();
        this.errorEl.textContent = '';
    }

    _showCreateUser() {
        this.contentEl.innerHTML = '';
        this.userListEl.style.display = 'none';
        this.userListBtn.classList.remove('active');

        const title = document.createElement('div');
        title.className = 'lock-create-title';
        title.textContent = '创建新用户';
        this.contentEl.appendChild(title);

        const usernameInput = document.createElement('input');
        usernameInput.className = 'lock-create-input';
        usernameInput.type = 'text';
        usernameInput.placeholder = '用户名';
        this.contentEl.appendChild(usernameInput);

        const passwordInput = document.createElement('input');
        passwordInput.className = 'lock-create-input';
        passwordInput.type = 'password';
        passwordInput.placeholder = '密码（可选）';
        this.contentEl.appendChild(passwordInput);

        const errorDiv = document.createElement('div');
        errorDiv.className = 'lock-error';
        this.contentEl.appendChild(errorDiv);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'lock-create-cancel-btn';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => this._render());
        this.contentEl.appendChild(cancelBtn);

        const createBtn = document.createElement('button');
        createBtn.className = 'lock-create-btn';
        createBtn.textContent = '创建';
        createBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim() || null;
            const result = this.userManager.createUser(username, password);
            if (result.success) {
                this.userManager.reload();
                if (typeof this.onUserSwitch === 'function') {
                    this.onUserSwitch(username);
                }
                this._render();
            } else {
                errorDiv.textContent = result.message;
            }
        });
        this.contentEl.appendChild(createBtn);

        usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') passwordInput.focus();
        });

        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                createBtn.click();
            }
        });

        usernameInput.focus();
    }

    show() {
        this._render();
        if (this.passwordInput) {
            this.passwordInput.value = '';
        }
        this.errorEl.textContent = '';
        this.userListEl.style.display = 'none';
        this.userListBtn.classList.remove('active');
        this.el.style.display = 'flex';
        if (this.passwordInput) {
            this.passwordInput.focus();
        }
    }

    hide() {
        this.el.style.display = 'none';
    }

    unlock() {
        const user = this.userManager.getCurrentUser();
        if (!user) {
            return;
        }

        if (!user.password) {
            this._onUnlockSuccess();
            return;
        }

        const inputPwd = this.passwordInput ? this.passwordInput.value : '';
        if (this.userManager.verifyPassword(user.username, inputPwd)) {
            this._onUnlockSuccess();
        } else {
            this.errorEl.textContent = '密码错误';
            if (this.passwordInput) {
                this.passwordInput.value = '';
                this.passwordInput.focus();
            }
        }
    }

    _onUnlockSuccess() {
        this.hide();
        if (typeof this.onUnlock === 'function') {
            this.onUnlock();
        }
    }

    switchUser(username) {
        this.userManager.setCurrentUser(username);
        this.show();
    }

    reloadUserManager() {
        this.userManager.reload();
        this._render();
    }
}

export default LockScreen;
