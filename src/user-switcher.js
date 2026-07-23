import UserManager from './user-manager.js?v=2';

class UserSwitcher {
    constructor(options = {}) {
        this.userManager = new UserManager();
        this.onSwitch = options.onSwitch || null;
        this.onLock = options.onLock || null;
        this.el = null;
        this._pendingUsername = null;
        this._create();
    }

    _create() {
        const panel = document.createElement('div');
        panel.className = 'user-switcher';
        panel.style.display = 'none';

        const title = document.createElement('div');
        title.className = 'user-switcher-title';
        title.textContent = '切换用户';
        panel.appendChild(title);

        const list = document.createElement('div');
        list.className = 'user-switcher-list';
        panel.appendChild(list);

        const pwdArea = document.createElement('div');
        pwdArea.className = 'user-switcher-password';
        pwdArea.style.display = 'none';

        const pwdLabel = document.createElement('div');
        pwdLabel.className = 'user-switcher-password-label';
        pwdLabel.textContent = '输入密码';
        pwdArea.appendChild(pwdLabel);

        const pwdInput = document.createElement('input');
        pwdInput.type = 'password';
        pwdInput.className = 'user-switcher-password-input';
        pwdArea.appendChild(pwdInput);

        const pwdError = document.createElement('div');
        pwdError.className = 'user-switcher-password-error';
        pwdArea.appendChild(pwdError);

        const pwdButtons = document.createElement('div');
        pwdButtons.className = 'user-switcher-password-buttons';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'user-switcher-cancel-btn';
        cancelBtn.textContent = '取消';
        pwdButtons.appendChild(cancelBtn);

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'user-switcher-confirm-btn';
        confirmBtn.textContent = '确认';
        pwdButtons.appendChild(confirmBtn);

        pwdArea.appendChild(pwdButtons);
        panel.appendChild(pwdArea);

        const lockBtn = document.createElement('div');
        lockBtn.className = 'user-switcher-lock-btn';
        lockBtn.textContent = '锁定屏幕';
        lockBtn.addEventListener('click', () => {
            this.hide();
            if (typeof this.onLock === 'function') {
                this.onLock();
            }
        });
        panel.appendChild(lockBtn);

        this.el = panel;
        this._listEl = list;
        this._passwordArea = pwdArea;
        this._passwordInput = pwdInput;
        this._passwordError = pwdError;

        confirmBtn.addEventListener('click', () => this._confirmPassword());
        cancelBtn.addEventListener('click', () => this._cancelPassword());

        pwdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._confirmPassword();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this._cancelPassword();
            }
        });

        document.body.appendChild(panel);

        document.addEventListener('users-changed', () => {
            this.userManager.reload();
            if (this.el.style.display === 'block') {
                this._renderUserList();
            }
        });
    }

    show() {
        this.userManager.reload();
        this._renderUserList();
        this._passwordArea.style.display = 'none';
        this._listEl.style.display = '';
        this._pendingUsername = null;
        this.el.style.display = 'block';
    }

    hide() {
        this.el.style.display = 'none';
        this._passwordArea.style.display = 'none';
        this._listEl.style.display = '';
        this._passwordInput.value = '';
        this._passwordError.textContent = '';
        this._pendingUsername = null;
    }

    toggle() {
        if (this.el.style.display === 'none' || this.el.style.display === '') {
            this.show();
        } else {
            this.hide();
        }
    }

    _renderUserList() {
        this._listEl.innerHTML = '';
        const users = this.userManager.listUsers();
        const currentUser = this.userManager.getCurrentUser();
        const currentUsername = currentUser ? currentUser.username : null;

        users.forEach(user => {
            const item = document.createElement('div');
            item.className = 'user-switcher-item';
            if (user.username === currentUsername) {
                item.classList.add('current');
            }

            const avatar = document.createElement('div');
            avatar.className = 'user-switcher-avatar';
            avatar.textContent = user.username.charAt(0).toUpperCase();
            item.appendChild(avatar);

            const name = document.createElement('div');
            name.className = 'user-switcher-name';
            name.textContent = user.username;
            item.appendChild(name);

            if (user.username === currentUsername) {
                const badge = document.createElement('div');
                badge.className = 'user-switcher-badge';
                badge.textContent = '当前';
                item.appendChild(badge);
            }

            item.addEventListener('click', () => this._onUserClick(user.username));
            this._listEl.appendChild(item);
        });
    }

    _onUserClick(username) {
        const currentUser = this.userManager.getCurrentUser();
        if (currentUser && currentUser.username === username) {
            this.hide();
            return;
        }

        const user = this.userManager.getUser(username);
        if (!user) {
            return;
        }

        if (!user.password) {
            this._doSwitch(username);
        } else {
            this._pendingUsername = username;
            this._listEl.style.display = 'none';
            this._passwordArea.style.display = 'block';
            this._passwordInput.value = '';
            this._passwordError.textContent = '';
            this._passwordInput.focus();
        }
    }

    _confirmPassword() {
        const password = this._passwordInput.value;
        if (!this._pendingUsername) {
            return;
        }
        if (this.userManager.verifyPassword(this._pendingUsername, password)) {
            const username = this._pendingUsername;
            this._doSwitch(username);
        } else {
            this._passwordError.textContent = '密码错误';
            this._passwordInput.value = '';
            this._passwordInput.focus();
        }
    }

    _doSwitch(username) {
        this.hide();
        if (typeof this.onSwitch === 'function') {
            this.onSwitch(username);
        }
    }

    _cancelPassword() {
        this._pendingUsername = null;
        this._passwordArea.style.display = 'none';
        this._listEl.style.display = '';
        this._passwordInput.value = '';
        this._passwordError.textContent = '';
    }
}

export default UserSwitcher;
