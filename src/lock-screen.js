import UserManager from './user-manager.js?v=15';
class LockScreen {
    constructor(options = {}) {
        this.userManager = UserManager.getInstance();
        this.onUnlock = options.onUnlock || null;
        this.onUserSwitch = options.onUserSwitch || null;
        this.el = null;
        this.lang = localStorage.getItem('webos-language') || 'cmn';
        this.langStrings = {};
        this._create();
        this._loadLanguage();
        document.addEventListener('language-changed', (e) => {
            if (e.detail && e.detail.lang) { this.lang = e.detail.lang; this._loadLanguage(); }
        });
    }
    async _loadLanguage() {
        const langFiles = { cmn: '/languages/cmn.json', eng: '/languages/eng.json', jpn: '/languages/jpn.json' };
        try { const res = await fetch(langFiles[this.lang] || langFiles.cmn); const data = await res.json(); this.langStrings = data.strings || {}; } catch (e) { this.langStrings = {}; }
        this._render();
    }
    t(key, fallback) { return this.langStrings[key] !== undefined ? this.langStrings[key] : (fallback || key); }
    tt(key, vars, fallback) { let s = this.t(key, fallback); for (const k in vars) { s = s.split('{' + k + '}').join(vars[k]); } return s; }
    _create() {
        // 移除已有的锁定屏幕
        const existing = document.querySelector('.lock-screen');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.className = 'lock-screen';
        // 窗口样式的登录卡
        const lockWindow = document.createElement('div');
        lockWindow.className = 'lock-window';
        // 标题栏（两个按钮无操作，仅用于拖拽）
        const titlebar = document.createElement('div');
        titlebar.className = 'lock-window-titlebar';
        const title = document.createElement('span');
        title.className = 'lock-window-title';
        title.textContent = this.t('lock.title', '锁定');
        titlebar.appendChild(title);
        const controls = document.createElement('div');
        controls.className = 'lock-window-controls';
        const minBtn = document.createElement('button');
        minBtn.className = 'window-btn btn-minimize';
        minBtn.title = this.t('lock.minimize', '最小化');
        const closeBtn = document.createElement('button');
        closeBtn.className = 'window-btn btn-close';
        closeBtn.title = this.t('lock.close', '关闭');
        controls.appendChild(minBtn);
        controls.appendChild(closeBtn);
        titlebar.appendChild(controls);
        // 窗口主体
        const body = document.createElement('div');
        body.className = 'lock-window-body';
        const header = document.createElement('div');
        header.className = 'lock-header';
        const avatar = document.createElement('div');
        avatar.className = 'lock-user-avatar';
        header.appendChild(avatar);
        const username = document.createElement('div');
        username.className = 'lock-username';
        header.appendChild(username);
        body.appendChild(header);
        // 中部：解锁区域
        const content = document.createElement('div');
        content.className = 'lock-content';
        body.appendChild(content);
        const error = document.createElement('div');
        error.className = 'lock-error';
        content.appendChild(error);
        // 底部：用户列表
        const userListHeader = document.createElement('div');
        userListHeader.className = 'lock-user-list-header';
        userListHeader.textContent = this.t('lock.switchUser', '切换用户');
        body.appendChild(userListHeader);
        const userList = document.createElement('div');
        userList.className = 'lock-user-list';
        body.appendChild(userList);
        lockWindow.appendChild(titlebar);
        lockWindow.appendChild(body);
        overlay.appendChild(lockWindow);
        document.body.appendChild(overlay);
        this.el = overlay;
        this.lockContainer = lockWindow;
        this.lockWindow = lockWindow;
        this.avatarEl = avatar;
        this.usernameEl = username;
        this.contentEl = content;
        this.errorEl = error;
        this.userListEl = userList;
        this.passwordInput = null;
        this._setupDrag(titlebar, lockWindow);
        this._render();
    }
    _setupDrag(handle, target) {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;
        const start = (clientX, clientY) => {
            dragging = true;
            const rect = target.getBoundingClientRect();
            offsetX = clientX - rect.left;
            offsetY = clientY - rect.top;
        };
        const move = (clientX, clientY) => {
            if (!dragging) return;
            target.style.left = (clientX - offsetX) + 'px';
            target.style.top = (clientY - offsetY) + 'px';
            target.classList.add('lock-window-dragged');
        };
        const stop = () => { dragging = false; };
        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            e.preventDefault();
            start(e.clientX, e.clientY);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        const onMouseMove = (e) => move(e.clientX, e.clientY);
        const onMouseUp = () => { stop(); document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
        handle.addEventListener('touchstart', (e) => {
            if (e.target.closest('button')) return;
            e.preventDefault();
            const t = e.touches[0];
            start(t.clientX, t.clientY);
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
        }, { passive: false });
        const onTouchMove = (e) => { e.preventDefault(); const t = e.touches[0]; move(t.clientX, t.clientY); };
        const onTouchEnd = () => { stop(); document.removeEventListener('touchmove', onTouchMove); document.removeEventListener('touchend', onTouchEnd); };
    }
    _render() {
        this.contentEl.innerHTML = '';
        this.contentEl.appendChild(this.errorEl);
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
            input.placeholder = this.t('lock.promptForPassword', '请输入密码');
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.unlock();
                }
            });
            this.contentEl.appendChild(input);
            const btn = document.createElement('button');
            btn.className = 'lock-unlock-btn';
            btn.textContent = this.t('lock.unlock', '解锁');
            btn.addEventListener('click', () => this.unlock());
            this.contentEl.appendChild(btn);
            this.passwordInput = input;
        } else {
            const btn = document.createElement('button');
            btn.className = 'lock-unlock-btn';
            btn.textContent = this.t('lock.clickToUnlock', '点击解锁');
            btn.addEventListener('click', () => this.unlock());
            this.contentEl.appendChild(btn);
            this.passwordInput = null;
        }
        const createUserBtn = document.createElement('button');
        createUserBtn.className = 'lock-create-user-btn';
        createUserBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg> ' + this.t('lock.createUser', '创建新用户');
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
            
            const avatar = document.createElement('div');
            avatar.className = 'lock-user-item-avatar';
            avatar.textContent = (user.username.charAt(0) || '?').toUpperCase();
            userItem.appendChild(avatar);
            const info = document.createElement('div');
            info.className = 'lock-user-item-info';
            const name = document.createElement('div');
            name.className = 'lock-user-item-name';
            name.textContent = user.username;
            info.appendChild(name);
            const status = document.createElement('div');
            status.className = 'lock-user-item-status';
            status.textContent = isCurrent ? this.t('lock.currentUser', '当前用户') : (user.password ? this.t('lock.needPassword', '需密码') : this.t('lock.noPassword', '无密码'));
            info.appendChild(status);
            userItem.appendChild(info);
            if (isCurrent) {
                const renameBtn = document.createElement('button');
                renameBtn.className = 'lock-user-item-rename';
                renameBtn.title = this.t('lock.rename', '重命名');
                renameBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
                renameBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._showRenameUser(user.username);
                });
                userItem.appendChild(renameBtn);
            } else {
                if (users.length > 1) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'lock-user-item-delete';
                    deleteBtn.title = this.t('lock.delete', '删除');
                    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._confirmDeleteUser(user.username);
                    });
                    userItem.appendChild(deleteBtn);
                }
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
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100000;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
        title.textContent = this.t('lock.deleteUser', '删除用户');
        dialog.appendChild(title);
        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
        msg.textContent = this.tt('lock.deleteUserConfirm', { name: username }, `确定要删除用户 "${username}" 吗？此操作无法撤销。`);
        dialog.appendChild(msg);
        let passwordInput = null;
        let errorDiv = null;
        if (needsPassword) {
            const pwdLabel = document.createElement('div');
            pwdLabel.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:8px;';
            pwdLabel.textContent = this.t('lock.enterPasswordToDelete', '请输入密码以确认删除');
            dialog.appendChild(pwdLabel);
            passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.placeholder = this.t('lock.promptForPassword', '请输入密码');
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
        cancelBtn.textContent = this.t('lock.cancel', '取消');
        cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
        cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
        cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        btnContainer.appendChild(cancelBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = this.t('lock.delete', '删除');
        deleteBtn.style.cssText = 'padding:8px 16px;background:#c0392b;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
        deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.background = '#a93226'; });
        deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.background = '#c0392b'; });
        const doDelete = () => {
            if (needsPassword) {
                const pwd = passwordInput.value;
                if (!this.userManager.verifyPassword(username, pwd)) {
                    if (errorDiv) {
                        errorDiv.textContent = this.t('lock.passwordError', '密码错误');
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
        const title = document.createElement('div');
        title.className = 'lock-create-title';
        title.textContent = this.t('lock.renameUser', '重命名用户');
        this.contentEl.appendChild(title);
        const currentNameLabel = document.createElement('div');
        currentNameLabel.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:8px;';
        currentNameLabel.textContent = this.tt('lock.currentUsernameLabel', { name: username }, `当前用户名: ${username}`);
        this.contentEl.appendChild(currentNameLabel);
        const usernameInput = document.createElement('input');
        usernameInput.className = 'lock-create-input';
        usernameInput.type = 'text';
        usernameInput.placeholder = this.t('lock.newUsername', '新用户名');
        this.contentEl.appendChild(usernameInput);
        const user = this.userManager.getUser(username);
        let passwordInput = null;
        if (user && user.password) {
            passwordInput = document.createElement('input');
            passwordInput.className = 'lock-create-input';
            passwordInput.type = 'password';
            passwordInput.placeholder = this.t('lock.enterCurrentPassword', '输入当前密码');
            this.contentEl.appendChild(passwordInput);
        }
        const errorDiv = document.createElement('div');
        errorDiv.className = 'lock-error';
        this.contentEl.appendChild(errorDiv);
        const btnRow = document.createElement('div');
        btnRow.className = 'lock-btn-row';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'lock-cancel-btn';
        cancelBtn.textContent = this.t('lock.cancel', '取消');
        cancelBtn.addEventListener('click', () => this._render());
        btnRow.appendChild(cancelBtn);
        const renameBtn = document.createElement('button');
        renameBtn.className = 'lock-confirm-btn';
        renameBtn.textContent = this.t('lock.rename', '重命名');
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
        btnRow.appendChild(renameBtn);
        this.contentEl.appendChild(btnRow);
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
    _showUserPassword(username) {
        this.contentEl.innerHTML = '';
        const title = document.createElement('div');
        title.className = 'lock-switch-title';
        title.textContent = this.tt('lock.switchToUser', { name: username }, `切换到 ${username}`);
        this.contentEl.appendChild(title);
        const input = document.createElement('input');
        input.className = 'lock-password-input';
        input.type = 'password';
        input.placeholder = this.t('lock.promptForPassword', '请输入密码');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._verifyAndSwitch(username, input.value);
            }
        });
        this.contentEl.appendChild(input);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'lock-error';
        this.contentEl.appendChild(errorDiv);
        const btnRow = document.createElement('div');
        btnRow.className = 'lock-btn-row';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'lock-cancel-btn';
        cancelBtn.textContent = this.t('lock.cancel', '取消');
        cancelBtn.addEventListener('click', () => this._render());
        btnRow.appendChild(cancelBtn);
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'lock-confirm-btn';
        confirmBtn.textContent = this.t('lock.confirmSwitch', '确认切换');
        confirmBtn.addEventListener('click', () => {
            this._verifyAndSwitch(username, input.value, errorDiv);
        });
        btnRow.appendChild(confirmBtn);
        this.contentEl.appendChild(btnRow);
        input.focus();
    }
    _verifyAndSwitch(username, password, errorDiv) {
        if (this.userManager.verifyPassword(username, password)) {
            this._switchToUser(username);
        } else {
            if (errorDiv) {
                errorDiv.textContent = this.t('lock.passwordError', '密码错误');
            } else {
                this.errorEl.textContent = this.t('lock.passwordError', '密码错误');
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
        const title = document.createElement('div');
        title.className = 'lock-create-title';
        title.textContent = this.t('lock.createUser', '创建新用户');
        this.contentEl.appendChild(title);
        const usernameInput = document.createElement('input');
        usernameInput.className = 'lock-create-input';
        usernameInput.type = 'text';
        usernameInput.placeholder = this.t('lock.newUsername', '新用户名');
        this.contentEl.appendChild(usernameInput);
        const passwordInput = document.createElement('input');
        passwordInput.className = 'lock-create-input';
        passwordInput.type = 'password';
        passwordInput.placeholder = this.t('lock.promptForPassword', '请输入密码');
        this.contentEl.appendChild(passwordInput);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'lock-error';
        this.contentEl.appendChild(errorDiv);
        const btnRow = document.createElement('div');
        btnRow.className = 'lock-btn-row';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'lock-cancel-btn';
        cancelBtn.textContent = this.t('lock.cancel', '取消');
        cancelBtn.addEventListener('click', () => this._render());
        btnRow.appendChild(cancelBtn);
        const createBtn = document.createElement('button');
        createBtn.className = 'lock-confirm-btn';
        createBtn.textContent = this.t('lock.create', '创建');
        createBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim() || null;
            const result = this.userManager.createUser(username, password);
            if (result.success) {
                this._render();
            } else {
                errorDiv.textContent = result.message;
            }
        });
        btnRow.appendChild(createBtn);
        this.contentEl.appendChild(btnRow);
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
        this.userListEl.style.display = 'block';
        this.el.style.display = 'flex';
        if (this.passwordInput) {
            this.passwordInput.focus();
        }
    }
    showWithUserList() {
        this.show();
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
            this.errorEl.textContent = this.t('lock.passwordError', '密码错误');
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