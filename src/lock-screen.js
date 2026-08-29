import UserManager from './user-manager.js?v=31';
/**
 * LockScreen · v1.6 重新设计
 *  - Glass morphism 玻璃态卡片
 *  - Aurora 渐变 + Canvas 粒子背景
 *  - 超大时钟 (时间 + 日期 + 星期)
 *  - 默认 SVG 用户头像（非字母占位符）
 */
class LockScreen {
    constructor(options = {}) {
        try {
            this.userManager = UserManager.getInstance();
            this.onUnlock = options.onUnlock || null;
            this.onUserSwitch = options.onUserSwitch || null;
            this.el = null;
            this.lang = localStorage.getItem('webos-language') || 'cmn';
            this.langStrings = {};
            this._particlesCanvas = null;
            this._particlesAnim = null;
            this._clockTimer = null;
            this._create();
            this._loadLanguage();
            document.addEventListener('language-changed', (e) => {
                try {
                    if (e.detail && e.detail.lang) { this.lang = e.detail.lang; this._loadLanguage(); }
                } catch (_) {}
            });
        } catch (e) {
            console.error('LockScreen construction failed:', e);
        }
    }
    async _loadLanguage() {
        const langFiles = { cmn: '/languages/cmn.json', eng: '/languages/eng.json', jpn: '/languages/jpn.json' };
        try { const res = await fetch(langFiles[this.lang] || langFiles.cmn); const data = await res.json(); this.langStrings = data.strings || {}; } catch (e) { this.langStrings = {}; }
        this._render();
        this._refreshClock();
    }
    t(key, fallback) { return this.langStrings[key] !== undefined ? this.langStrings[key] : (fallback || key); }
    tt(key, vars, fallback) { let s = this.t(key, fallback); for (const k in vars) { s = s.split('{' + k + '}').join(vars[k]); } return s; }

    /** 默认 SVG 头像路径（用户无自定义头像时使用） */
    get defaultAvatarUrl() { return '/apps/icons/user-avatar.svg'; }

    /** 根据用户对象取头像 DataURL，若无则返回 default SVG 路径 */
    _getAvatarFor(user) {
        if (user && user.avatar) return user.avatar;
        // 尝试从 VFS avatar.json 读取（settings 应用会写入这里）
        return this.defaultAvatarUrl;
    }

    /** 构造 <img> 或 fallback <div> 作为头像内部元素 */
    _buildAvatarInner(user, sizeClass = 'large') {
        const wrap = document.createElement('div');
        const url = this._getAvatarFor(user);
        const fallbackLetter = user && user.username ? (user.username.charAt(0) || '?').toUpperCase() : '?';
        const fallbackCls = sizeClass === 'large' ? 'lock-avatar-fallback' : 'lock-item-avatar-fallback';
        const img = document.createElement('img');
        img.alt = 'avatar';
        img.referrerPolicy = 'no-referrer';
        img.src = url;
        img.onerror = () => {
            // SVG/图片加载失败 → fallback 字母底纹（浅灰 + 主题色字）
            try { wrap.removeChild(img); } catch (_) {}
            const fb = document.createElement('div');
            fb.className = fallbackCls;
            fb.textContent = fallbackLetter;
            wrap.appendChild(fb);
        };
        wrap.appendChild(img);
        return wrap;
    }

    _create() {
        try {
            const existing = document.querySelector('.lock-screen');
            if (existing) existing.remove();
            const overlay = document.createElement('div');
            overlay.className = 'lock-screen';

            // ── 1. 粒子画布（失败则跳过动画，不让锁屏挂掉） ──
            try {
                const canvas = document.createElement('canvas');
                canvas.className = 'lock-particles';
                overlay.appendChild(canvas);
                this._particlesCanvas = canvas;
                this._initParticles();
            } catch (_) { this._particlesCanvas = null; }

            // ── 2. 顶部大时钟 ──
            const clockArea = document.createElement('div');
            clockArea.className = 'lock-clock-area';
            clockArea.innerHTML = `
                <div class="lock-clock-time" id="lock-clock-time">00:00</div>
                <div class="lock-clock-date" id="lock-clock-date">—</div>
                <div class="lock-clock-weekday" id="lock-clock-weekday">—</div>
            `;
            overlay.appendChild(clockArea);

            // ── 3. 底部版本 + 提示条 ──
            const bottomBar = document.createElement('div');
            bottomBar.className = 'lock-bottom-bar';
            bottomBar.innerHTML = `
                <span class="lock-hint" id="lock-bottom-hint">点击屏幕任意位置 · 或按任意键开始</span>
                <span class="lock-version">navore OS v1.6</span>
            `;
            overlay.appendChild(bottomBar);
            this._hintEl = bottomBar.querySelector('#lock-bottom-hint');
            this._clockTimeEl = clockArea.querySelector('#lock-clock-time');
            this._clockDateEl = clockArea.querySelector('#lock-clock-date');
            this._clockWeekdayEl = clockArea.querySelector('#lock-clock-weekday');
            this._startClock();

            // ── 4. 中央 Glass 登录卡 ──
            const lockWindow = document.createElement('div');
            lockWindow.className = 'lock-window';

            const titlebar = document.createElement('div');
            titlebar.className = 'lock-window-titlebar';
            const title = document.createElement('span');
            title.className = 'lock-window-title';
            title.textContent = 'navore OS';
            titlebar.appendChild(title);
            const controls = document.createElement('div');
            controls.className = 'lock-window-controls';
            const minBtn = document.createElement('button');
            minBtn.className = 'window-btn btn-minimize';
            minBtn.title = '最小化';
            const closeBtn = document.createElement('button');
            closeBtn.className = 'window-btn btn-close';
            closeBtn.title = '关闭';
            controls.appendChild(minBtn);
            controls.appendChild(closeBtn);
            titlebar.appendChild(controls);

            // 主体
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
            userListHeader.textContent = '切换用户 · Switch User';
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
            try { this._setupDrag(titlebar, lockWindow); } catch (_) {}

            // 开始/任意键唤醒
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay && this.passwordInput) {
                    this.passwordInput.focus();
                }
            });
            const onWakeKey = (e) => {
                if (this.el.style.display !== 'none' && this.passwordInput && document.activeElement !== this.passwordInput) {
                    this.passwordInput.focus();
                    e.preventDefault();
                }
            };
            document.addEventListener('keydown', onWakeKey);
            this._onWakeKeyCleanup = () => document.removeEventListener('keydown', onWakeKey);

            this._render();
        } catch (e) {
            console.error('LockScreen _create failed:', e);
        }
    }

    // ========== 动态粒子背景 ==========
    _initParticles() {
        try {
            const canvas = this._particlesCanvas;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return; // 浏览器不支持 Canvas，直接跳过
            const DPR = Math.min(window.devicePixelRatio || 1, 2);
            const resize = () => {
                try {
                    canvas.width = window.innerWidth * DPR;
                    canvas.height = window.innerHeight * DPR;
                    canvas.style.width = window.innerWidth + 'px';
                    canvas.style.height = window.innerHeight + 'px';
                    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
                } catch (_) {}
            };
            resize();
            window.addEventListener('resize', resize);
            const N = Math.max(32, Math.floor((window.innerWidth * window.innerHeight) / 28000));
            const particles = Array.from({ length: N }, () => ({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                r: Math.random() * 1.8 + 0.4,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
                a:  Math.random() * 0.55 + 0.15,
                hue: 170 + Math.random() * 90,
            }));
            const step = () => {
                try {
                    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
                    const W = window.innerWidth, H = window.innerHeight;
                    for (let i = 0; i < particles.length; i++) {
                        const p = particles[i];
                        p.x += p.vx; p.y += p.vy;
                        if (p.x < 0 || p.x > W) p.vx *= -1;
                        if (p.y < 0 || p.y > H) p.vy *= -1;
                        for (let j = i + 1; j < particles.length; j++) {
                            const q = particles[j];
                            const dx = p.x - q.x, dy = p.y - q.y;
                            const d2 = dx * dx + dy * dy;
                            if (d2 < 150 * 150) {
                                const alpha = (1 - Math.sqrt(d2) / 150) * 0.18;
                                ctx.strokeStyle = `hsla(${(p.hue + q.hue) * 0.5}, 85%, 72%, ${alpha})`;
                                ctx.lineWidth = 0.6;
                                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
                            }
                        }
                    }
                    for (const p of particles) {
                        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
                        g.addColorStop(0, `hsla(${p.hue}, 90%, 78%, ${p.a})`);
                        g.addColorStop(1, `hsla(${p.hue}, 90%, 78%, 0)`);
                        ctx.fillStyle = g;
                        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = `hsla(${p.hue}, 100%, 92%, ${Math.min(1, p.a + 0.2)})`;
                        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
                    }
                    this._particlesAnim = requestAnimationFrame(step);
                } catch (_) { /* particle loop broken; silently stop */ }
            };
            step();
        } catch (_) { /* 粒子初始化完全失败，锁屏仍应正常显示 */ }
    }

    // ========== 时钟 ==========
    _startClock() {
        this._refreshClock();
        this._clockTimer = setInterval(() => this._refreshClock(), 1000);
    }
    _refreshClock() {
        if (!this._clockTimeEl) return;
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        this._clockTimeEl.textContent = `${hh}:${mm}`;
        if (this._clockDateEl) {
            const y = now.getFullYear();
            const mo = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const fmt = this.lang === 'cmn' ? `${y} 年 ${mo} 月 ${d} 日`
                    : this.lang === 'jpn' ? `${y} 年 ${mo} 月 ${d} 日`
                    : now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            this._clockDateEl.textContent = fmt;
        }
        if (this._clockWeekdayEl) {
            const i18n = {
                cmn: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
                eng: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
                jpn: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
            };
            const arr = i18n[this.lang] || i18n.cmn;
            this._clockWeekdayEl.textContent = arr[now.getDay()];
        }
        if (this._hintEl) {
            this._hintEl.textContent = this.t('lock.bottomHint', '点击屏幕任意位置 · 或按任意键开始');
        }
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
            target.classList.add('lock-window-dragged');
        };
        const move = (clientX, clientY) => {
            if (!dragging) return;
            target.style.left = (clientX - offsetX) + 'px';
            target.style.top = (clientY - offsetY) + 'px';
            target.style.transform = 'none';
        };
        const stop = () => { dragging = false; };
        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            e.preventDefault();
            start(e.clientX, e.clientY);
            const onMouseMove = (e) => move(e.clientX, e.clientY);
            const onMouseUp = () => { stop(); document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        handle.addEventListener('touchstart', (e) => {
            if (e.target.closest('button')) return;
            e.preventDefault();
            const t = e.touches[0];
            start(t.clientX, t.clientY);
            const onTouchMove = (e) => { e.preventDefault(); const t = e.touches[0]; move(t.clientX, t.clientY); };
            const onTouchEnd = () => { stop(); document.removeEventListener('touchmove', onTouchMove); document.removeEventListener('touchend', onTouchEnd); };
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
        }, { passive: false });
    }

    _render() {
        this.contentEl.innerHTML = '';
        this.contentEl.appendChild(this.errorEl);
        this.errorEl.textContent = '';
        const user = this.userManager.getCurrentUser();
        if (!user) return;
        this.usernameEl.textContent = user.username;
        // 头像：用 SVG/img（不再是纯字母）
        this.avatarEl.innerHTML = '';
        const inner = this._buildAvatarInner(user, 'large');
        [...inner.childNodes].forEach(c => this.avatarEl.appendChild(c));

        if (user.password) {
            const input = document.createElement('input');
            input.className = 'lock-password-input';
            input.type = 'password';
            input.placeholder = this.t('lock.promptForPassword', '请输入密码');
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.unlock(); });
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
            const inner = this._buildAvatarInner(user, 'small');
            [...inner.childNodes].forEach(c => avatar.appendChild(c));
            userItem.appendChild(avatar);
            const info = document.createElement('div');
            info.className = 'lock-user-item-info';
            const name = document.createElement('div');
            name.className = 'lock-user-item-name';
            name.textContent = user.username;
            info.appendChild(name);
            const status = document.createElement('div');
            status.className = 'lock-user-item-status';
            status.textContent = isCurrent
                ? this.t('lock.currentUser', '当前用户')
                : (user.password ? this.t('lock.needPassword', '需密码') : this.t('lock.noPassword', '无密码'));
            info.appendChild(status);
            userItem.appendChild(info);
            if (isCurrent) {
                const renameBtn = document.createElement('button');
                renameBtn.className = 'lock-user-item-rename';
                renameBtn.title = this.t('lock.rename', '重命名');
                renameBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
                renameBtn.addEventListener('click', (e) => { e.stopPropagation(); this._showRenameUser(user.username); });
                userItem.appendChild(renameBtn);
            } else {
                if (users.length > 1) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'lock-user-item-delete';
                    deleteBtn.title = this.t('lock.delete', '删除');
                    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
                    deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); this._confirmDeleteUser(user.username); });
                    userItem.appendChild(deleteBtn);
                }
                userItem.addEventListener('click', () => {
                    if (user.password) this._showUserPassword(user.username);
                    else this._switchToUser(user.username);
                });
            }
            this.userListEl.appendChild(userItem);
        });
    }

    _confirmDeleteUser(username) {
        const user = this.userManager.getUser(username);
        const needsPassword = user && user.password;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:100000;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:rgba(30,30,46,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:24px;width:320px;color:#ddd;font-family:inherit;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 10px 40px rgba(0,0,0,0.5);';
        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:12px;color:#fff;';
        title.textContent = this.t('lock.deleteUser', '删除用户');
        dialog.appendChild(title);
        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:16px;line-height:1.55;';
        msg.textContent = this.tt('lock.deleteUserConfirm', { name: username }, `确定要删除用户 "${username}" 吗？此操作无法撤销。`);
        dialog.appendChild(msg);
        let passwordInput = null, errorDiv = null;
        if (needsPassword) {
            const pwdLabel = document.createElement('div');
            pwdLabel.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:8px;';
            pwdLabel.textContent = this.t('lock.enterPasswordToDelete', '请输入密码以确认删除');
            dialog.appendChild(pwdLabel);
            passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.placeholder = this.t('lock.promptForPassword', '请输入密码');
            passwordInput.style.cssText = 'width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;font-family:inherit;margin-bottom:8px;outline:none;box-sizing:border-box;';
            passwordInput.addEventListener('focus', () => { passwordInput.style.borderColor = 'var(--accent-color,#3498db)'; });
            passwordInput.addEventListener('blur',  () => { passwordInput.style.borderColor = 'rgba(255,255,255,0.12)'; });
            dialog.appendChild(passwordInput);
            errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'color:#ff7675;font-size:12px;margin-bottom:16px;min-height:16px;';
            dialog.appendChild(errorDiv);
        }
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = this.t('lock.cancel', '取消');
        cancelBtn.style.cssText = 'padding:9px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:rgba(255,255,255,0.78);font-size:13px;cursor:pointer;font-family:inherit;transition:all 0.15s;';
        cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = 'rgba(255,255,255,0.12)'; });
        cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = 'rgba(255,255,255,0.06)'; });
        cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));
        btnContainer.appendChild(cancelBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = this.t('lock.delete', '删除');
        deleteBtn.style.cssText = 'padding:9px 16px;background:#c0392b;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;';
        deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.filter = 'brightness(1.12)'; });
        deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.filter = 'none'; });
        const doDelete = () => {
            if (needsPassword) {
                const pwd = passwordInput.value;
                if (!this.userManager.verifyPassword(username, pwd)) {
                    if (errorDiv) { errorDiv.textContent = this.t('lock.passwordError', '密码错误'); passwordInput.style.borderColor = '#e74c3c'; }
                    return;
                }
            }
            const result = this.userManager.deleteUser(username);
            if (result.success) { this.userManager.reload(); this._render(); }
            document.body.removeChild(overlay);
        };
        deleteBtn.addEventListener('click', doDelete);
        if (passwordInput) passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doDelete(); });
        btnContainer.appendChild(deleteBtn);
        dialog.appendChild(btnContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        setTimeout(() => (passwordInput || deleteBtn).focus(), 60);
    }

    _showRenameUser(username) {
        this.contentEl.innerHTML = '';
        const title = document.createElement('div');
        title.className = 'lock-create-title';
        title.textContent = this.t('lock.renameUser', '重命名用户');
        this.contentEl.appendChild(title);
        const currentNameLabel = document.createElement('div');
        currentNameLabel.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:8px;';
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
                if (typeof this.onUserSwitch === 'function') this.onUserSwitch(newUsername);
                this._render();
            } else errorDiv.textContent = result.message;
        });
        btnRow.appendChild(renameBtn);
        this.contentEl.appendChild(btnRow);
        usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && passwordInput) passwordInput.focus();
            else if (e.key === 'Enter') renameBtn.click();
        });
        if (passwordInput) passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') renameBtn.click(); });
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
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._verifyAndSwitch(username, input.value); });
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
        confirmBtn.addEventListener('click', () => this._verifyAndSwitch(username, input.value, errorDiv));
        btnRow.appendChild(confirmBtn);
        this.contentEl.appendChild(btnRow);
        input.focus();
    }

    _verifyAndSwitch(username, password, errorDiv) {
        if (this.userManager.verifyPassword(username, password)) this._switchToUser(username);
        else if (errorDiv) errorDiv.textContent = this.t('lock.passwordError', '密码错误');
        else this.errorEl.textContent = this.t('lock.passwordError', '密码错误');
    }

    _switchToUser(username) {
        if (typeof this.onUserSwitch === 'function') this.onUserSwitch(username);
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
            if (result.success) this._render();
            else errorDiv.textContent = result.message;
        });
        btnRow.appendChild(createBtn);
        this.contentEl.appendChild(btnRow);
        usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passwordInput.focus(); });
        passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') createBtn.click(); });
        usernameInput.focus();
    }

    show(options = {}) {
        this._render();
        if (this.passwordInput) this.passwordInput.value = '';
        this.errorEl.textContent = '';
        this.userListEl.style.display = 'grid';
        this.el.style.display = 'flex';
        // 重置卡片位置
        if (this.lockWindow) {
            this.lockWindow.style.left = '';
            this.lockWindow.style.top = '';
            this.lockWindow.style.transform = '';
            this.lockWindow.classList.remove('lock-window-dragged');
        }
        this._refreshClock();
        if (this.passwordInput) setTimeout(() => this.passwordInput.focus(), 120);
    }
    showWithUserList() { this.show(); }

    hide() {
        this.el.style.display = 'none';
    }

    unlock() {
        try {
            const user = this.userManager.getCurrentUser();
            if (!user) return;
            if (!user.password) { this._onUnlockSuccess(); return; }
            const inputPwd = this.passwordInput ? this.passwordInput.value : '';
            if (this.userManager.verifyPassword(user.username, inputPwd)) this._onUnlockSuccess();
            else {
                if (this.errorEl) this.errorEl.textContent = '密码错误';
                if (this.passwordInput && this.lockWindow && typeof this.lockWindow.animate === 'function') {
                    try {
                        this.lockWindow.animate(
                            [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
                            { duration: 260, easing: 'ease-in-out' }
                        );
                    } catch (_) {}
                    this.passwordInput.value = '';
                    this.passwordInput.focus();
                }
            }
        } catch (e) { console.error('unlock failed:', e); }
    }

    _onUnlockSuccess() {
        // 成功进入桌面的滑出动画（只使用 Web Animations API 可靠支持的属性：opacity + transform）
        try {
            if (this.el && typeof this.el.animate === 'function') {
                const anim = this.el.animate([
                    { opacity: 1, transform: 'translateY(0)' },
                    { opacity: 0, transform: 'translateY(-20px)' }
                ], { duration: 360, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
                anim.addEventListener('finish', () => {
                    this.hide();
                    if (this.el) {
                        this.el.style.opacity = '';
                        this.el.style.transform = '';
                    }
                });
            } else {
                this.hide();
            }
        } catch (_) {
            this.hide();
        }
        try { if (typeof this.onUnlock === 'function') this.onUnlock(); } catch (_) {}
    }

    switchUser(username) {
        this.userManager.setCurrentUser(username);
        this.show();
    }

    reloadUserManager() {
        this.userManager.reload();
        this._render();
    }

    destroy() {
        if (this._clockTimer) clearInterval(this._clockTimer);
        if (this._particlesAnim) cancelAnimationFrame(this._particlesAnim);
        if (this._onWakeKeyCleanup) this._onWakeKeyCleanup();
        if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    }
}
export default LockScreen;
