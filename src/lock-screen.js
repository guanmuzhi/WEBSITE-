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
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'lock-user-item-delete';
            deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._confirmDeleteUser(user.username);
            });

            const renameBtn = document.createElement('button');
            renameBtn.className = 'lock-user-item-rename';
            renameBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._showRenameUser(user.username);
            });
            
            userItem.innerHTML = `
                <div class="lock-user-item-avatar">${(user.username.charAt(0) || '?').toUpperCase()}</div>
                <div class="lock-user-item-info">
                    <div class="lock-user-item-name">${user.username}</div>
                    <div class="lock-user-item-status">${isCurrent ? '当前用户' : (user.password ? '需密码' : '无密码')}</div>
                </div>
            `;
            
            if (!isCurrent && users.length > 1) {
                userItem.appendChild(deleteBtn);
            }

            if (isCurrent) {
                userItem.appendChild(renameBtn);
            }
            
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

    _confirmDeleteUser(username) {
        const user = this.userManager.getUser(username);
        const needsPassword = user && user.password;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
        title.textContent = '删除用户';
        dialog.appendChild(title);

        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
        msg.textContent = `确定要删除用户 "${username}" 吗？此操作无法撤销。`;
        dialog.appendChild(msg);

        let passwordInput = null;
        let errorDiv = null;

        if (needsPassword) {
            const pwdLabel = document.createElement('div');
            pwdLabel.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:8px;';
            pwdLabel.textContent = '请输入密码以确认删除';
            dialog.appendChild(pwdLabel);

            passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.placeholder = '密码';
            passwordInput.style.cssText = 'width:100%;padding:10px 12px;background:#1e1e1e;border:1px solid #3d3d3d;border-radius:4px;color:#ddd;font-size:13px;font-family:inherit;margin-bottom:8px;outline:none;';
            passwordInput.addEventListener('focus', () => { passwordInput.style.borderColor = '#3498db'; });
            passwordInput.addEventListener('blur', () => { passwordInput.style.borderColor = '#3d3d3d'; });
            dialog.appendChild(passwordInput);

            errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'color:#e74c3c;font-size:12px;margin-bottom:16px;min-height:16px;';
            dialog.appendChild(errorDiv);
        }

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
        cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
        cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        btnContainer.appendChild(cancelBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '删除';
        deleteBtn.style.cssText = 'padding:8px 16px;background:#c0392b;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
        deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.background = '#a93226'; });
        deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.background = '#c0392b'; });

        const doDelete = () => {
            if (needsPassword) {
                const pwd = passwordInput.value;
                if (!this.userManager.verifyPassword(username, pwd)) {
                    if (errorDiv) {
                        errorDiv.textContent = '密码错误';
                        passwordInput.style.borderColor = '#e74c3c';
                    }
                    return;
                }
            }

            const result = this.userManager.deleteUser(username);
            if (result.success) {
                this.userManager.reload();
                this._render();
            }
            document.body.removeChild(overlay);
        };

        deleteBtn.addEventListener('click', doDelete);

        if (passwordInput) {
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    doDelete();
                }
            });
        }

        btnContainer.appendChild(deleteBtn);

        dialog.appendChild(btnContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        setTimeout(() => {
            if (passwordInput) {
                passwordInput.focus();
            } else {
                deleteBtn.focus();
            }
        }, 50);
    }

    _showRenameUser(username) {
        this.contentEl.innerHTML = '';
        this.userListEl.style.display = 'none';
        this.userListBtn.classList.remove('active');

        const title = document.createElement('div');
        title.className = 'lock-create-title';
        title.textContent = '重命名用户';
        this.contentEl.appendChild(title);

        const currentNameLabel = document.createElement('div');
        currentNameLabel.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:8px;';
        currentNameLabel.textContent = `当前用户名: ${username}`;
        this.contentEl.appendChild(currentNameLabel);

        const usernameInput = document.createElement('input');
        usernameInput.className = 'lock-create-input';
        usernameInput.type = 'text';
        usernameInput.placeholder = '新用户名';
        this.contentEl.appendChild(usernameInput);

        const user = this.userManager.getUser(username);
        let passwordInput = null;
        if (user && user.password) {
            passwordInput = document.createElement('input');
            passwordInput.className = 'lock-create-input';
            passwordInput.type = 'password';
            passwordInput.placeholder = '输入当前密码';
            this.contentEl.appendChild(passwordInput);
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'lock-error';
        this.contentEl.appendChild(errorDiv);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'lock-create-cancel-btn';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => this._render());
        this.contentEl.appendChild(cancelBtn);

        const renameBtn = document.createElement('button');
        renameBtn.className = 'lock-create-btn';
        renameBtn.textContent = '重命名';
        renameBtn.addEventListener('click', () => {
            const newUsername = usernameInput.value.trim();
            const password = passwordInput ? passwordInput.value.trim() : null;
            const result = this.userManager.renameUser(username, newUsername, password);
            if (result.success) {
                this.userManager.reload();
                if (typeof this.onUserSwitch === 'function') {
                    this.onUserSwitch(newUsername);
                }
                this._render();
            } else {
                errorDiv.textContent = result.message;
            }
        });
        this.contentEl.appendChild(renameBtn);

        usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && passwordInput) {
                passwordInput.focus();
            } else if (e.key === 'Enter') {
                renameBtn.click();
            }
        });

        if (passwordInput) {
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    renameBtn.click();
                }
            });
        }

        setTimeout(() => usernameInput.focus(), 50);
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
        
        this.userManager.setCurrentUser(username);
        this.userManager.reload();
        this.hide();
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

    show(options = {}) {
        this._render();
        if (this.passwordInput) {
            this.passwordInput.value = '';
        }
        this.errorEl.textContent = '';
        if (options.showUserList) {
            this.userListEl.style.display = 'block';
            this.userListBtn.classList.add('active');
        } else {
            this.userListEl.style.display = 'none';
            this.userListBtn.classList.remove('active');
        }
        this.el.style.display = 'flex';
        if (this.passwordInput && !options.showUserList) {
            this.passwordInput.focus();
        }
    }

    showWithUserList() {
        this._render();
        if (this.passwordInput) {
            this.passwordInput.value = '';
        }
        this.errorEl.textContent = '';
        this.userListEl.style.display = 'block';
        this.userListBtn.classList.add('active');
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
