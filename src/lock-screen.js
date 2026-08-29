import UserManager from './user-manager.js?v=32';
/**
 * LockScreen · v1.6 — 稳定重写
 *  - 壁纸固定 Bing UHD（全屏覆盖 + 半透明深色渐变 + Canvas 粒子）
 *  - 两步式界面：① 时钟+提示；② 用户/密码输入（同一背景）
 *  - 无 Element.animate()（该 API 在不同浏览器上行为不一致易闪退）
 *  - 全部 DOM / storage / 事件链路 try/catch 包裹
 *  - 默认头像 /apps/icons/user-avatar.svg（Material Person Outline）
 */
const BING_WALLPAPER = 'https://bing.lbeam08.cn/img/uhd?direct=true';
class LockScreen {
    constructor(options = {}) {
        this.userManager = UserManager.getInstance();
        this.onUnlock = options.onUnlock || null;
        this.onUserSwitch = options.onUserSwitch || null;
        this.el = null;
        this.stage = 'clock';           // 'clock' | 'input'
        this.lang = localStorage.getItem('webos-language') || 'cmn';
        this.langStrings = {};
        this._particlesCanvas = null;
        this._particlesAnim = null;
        this._clockTimer = null;
        this._dragCleanups = [];
        this._init();
    }

    async _init() {
        try {
            this._build();
            this._startClock();
            this._bindEvents();
            await this._loadLanguage();
        } catch (e) { console.error('LockScreen init failed:', e); }
    }

    async _loadLanguage() {
        const files = { cmn: '/languages/cmn.json', eng: '/languages/eng.json', jpn: '/languages/jpn.json' };
        try {
            const res = await fetch(files[this.lang] || files.cmn);
            const data = await res.json();
            this.langStrings = data.strings || {};
        } catch (_) { this.langStrings = {}; }
        try { this._refreshStaticTexts(); } catch (_) {}
    }

    t(key, fallback) {
        return this.langStrings && this.langStrings[key] !== undefined ? this.langStrings[key] : (fallback || key);
    }

    /** 默认 SVG 头像路径 */
    get defaultAvatarUrl() { return '/apps/icons/user-avatar.svg'; }

    _getAvatarFor(user) {
        if (user && user.avatar) return user.avatar;
        return this.defaultAvatarUrl;
    }

    /** 构造头像元素（纯 <img>，失败也用 onerror 兜底为字母/默认 SVG） */
    _buildAvatarEl(user) {
        const url = this._getAvatarFor(user);
        const img = document.createElement('img');
        img.className = 'lock-avatar-img';
        img.alt = 'avatar';
        img.referrerPolicy = 'no-referrer';
        img.decoding = 'async';
        img.src = url;
        img.onerror = () => {
            // SVG 也挂了 → 退化成字母圆
            try {
                const letter = user && user.username ? (user.username.charAt(0) || '?').toUpperCase() : '?';
                img.style.display = 'none';
                const parent = img.parentElement;
                if (parent && !parent.querySelector('.lock-avatar-fallback')) {
                    const fb = document.createElement('div');
                    fb.className = 'lock-avatar-fallback';
                    fb.textContent = letter;
                    parent.appendChild(fb);
                }
            } catch (_) {}
        };
        return img;
    }

    // ============== DOM 构建 ==============
    _build() {
        try {
            const existing = document.querySelector('.lock-screen');
            if (existing) existing.remove();
            const overlay = document.createElement('div');
            overlay.className = 'lock-screen';

            // 0. Bing UHD 壁纸层 + 深色渐变叠层
            const wall = document.createElement('div');
            wall.className = 'lock-wallpaper';
            wall.style.backgroundImage = `url("${BING_WALLPAPER}")`;
            overlay.appendChild(wall);
            const tint = document.createElement('div');
            tint.className = 'lock-tint';
            overlay.appendChild(tint);

            // 1. 粒子 Canvas
            try {
                const canvas = document.createElement('canvas');
                canvas.className = 'lock-particles';
                overlay.appendChild(canvas);
                this._particlesCanvas = canvas;
                this._startParticles();
            } catch (_) {}

            // 2. 时钟 Stage（clock + hint + bottom bar）
            this.clockStage = document.createElement('div');
            this.clockStage.className = 'lock-stage lock-stage-clock';
            this.clockStage.innerHTML = `
                <div class="lock-clock-time" id="lock-clock-time">00:00</div>
                <div class="lock-clock-date" id="lock-clock-date">—</div>
                <div class="lock-hint" id="lock-clock-hint">点击屏幕任意位置 · 或按任意键开始</div>
            `;
            overlay.appendChild(this.clockStage);

            this.bottomBar = document.createElement('div');
            this.bottomBar.className = 'lock-bottom-bar';
            this.bottomBar.innerHTML = `<span class="lock-version">navore OS v1.6</span>`;
            overlay.appendChild(this.bottomBar);

            // 3. 登录 Stage（隐藏，时钟激活后才显示）
            this.inputStage = document.createElement('div');
            this.inputStage.className = 'lock-stage lock-stage-input';
            this.inputStage.style.display = 'none';
            const card = document.createElement('div');
            card.className = 'lock-window';

            const titlebar = document.createElement('div');
            titlebar.className = 'lock-window-titlebar';
            titlebar.innerHTML = `<span class="lock-window-title">navore OS</span>
                <div class="lock-window-controls">
                    <button class="window-btn btn-minimize" title="最小化"></button>
                    <button class="window-btn btn-close" title="关闭"></button>
                </div>`;

            const body = document.createElement('div');
            body.className = 'lock-window-body';
            body.innerHTML = `
                <div class="lock-header">
                    <div class="lock-user-avatar" id="lock-avatar"></div>
                    <div class="lock-username" id="lock-username"></div>
                </div>
                <div class="lock-content"></div>
                <div class="lock-error" id="lock-error"></div>
                <div class="lock-create-user-btn" id="lock-create-user" style="display:none;"></div>
                <div class="lock-user-list-header">切换用户 · Switch User</div>
                <div class="lock-user-list" id="lock-user-list"></div>
            `;
            card.appendChild(titlebar);
            card.appendChild(body);
            this.inputStage.appendChild(card);
            overlay.appendChild(this.inputStage);

            this.el = overlay;
            this.lockWindow = card;
            this.contentEl = body.querySelector('.lock-content');
            this.errorEl = body.querySelector('.lock-error');
            this.avatarEl = body.querySelector('#lock-avatar');
            this.usernameEl = body.querySelector('#lock-username');
            this.userListEl = body.querySelector('#lock-user-list');
            this.clockTimeEl = this.clockStage.querySelector('#lock-clock-time');
            this.clockDateEl = this.clockStage.querySelector('#lock-clock-date');
            this.hintEl = this.clockStage.querySelector('#lock-clock-hint');
            document.body.appendChild(overlay);
        } catch (e) { console.error('lock _build failed:', e); }
    }

    // ============== 事件 ==============
    _bindEvents() {
        // 任意键 / 点击 → 从 clock 切到 input
        const onWake = (ev) => {
            // 忽略 input 框本身的按键事件
            if (this.stage !== 'clock') return;
            if (ev.target && ev.target.closest && ev.target.closest('input,textarea,button')) return;
            this._switchToInput();
        };
        document.addEventListener('keydown', onWake);
        this.clockStage.addEventListener('click', onWake);

        // 标题栏拖动：用 transform 做，不干扰 CSS，且重置位置仅 reset transform
        try {
            const titlebar = this.lockWindow ? this.lockWindow.querySelector('.lock-window-titlebar') : null;
            if (titlebar && this.lockWindow) {
                let dragging = false, startX = 0, startY = 0, origRect = null;
                const onDown = (ev) => {
                    if (!this.lockWindow || ev.target.closest('button')) return;
                    ev.preventDefault();
                    origRect = this.lockWindow.getBoundingClientRect();
                    dragging = true;
                    startX = (ev.touches ? ev.touches[0].clientX : ev.clientX) - origRect.left;
                    startY = (ev.touches ? ev.touches[0].clientY : ev.clientY) - origRect.top;
                    this.lockWindow.style.transition = 'none';
                };
                const onMove = (ev) => {
                    if (!dragging || !this.lockWindow) return;
                    const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
                    const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
                    const x = cx - startX;
                    const y = cy - startY;
                    // 边界约束
                    const maxY = window.innerHeight - 60;
                    const boundedY = Math.max(0, Math.min(y, maxY));
                    this.lockWindow.style.left = x + 'px';
                    this.lockWindow.style.top = boundedY + 'px';
                    this.lockWindow.style.right = 'auto';
                    this.lockWindow.style.bottom = 'auto';
                };
                const onUp = () => {
                    if (!this.lockWindow) return;
                    dragging = false;
                    this.lockWindow.style.transition = '';
                    origRect = null;
                };
                titlebar.addEventListener('mousedown', onDown);
                titlebar.addEventListener('touchstart', onDown, { passive: false });
                document.addEventListener('mousemove', onMove);
                document.addEventListener('touchmove', onMove, { passive: false });
                document.addEventListener('mouseup', onUp);
                document.addEventListener('touchend', onUp);
                // 切阶段时复位位置
                this._resetWindowPosition = () => {
                    if (!this.lockWindow) return;
                    this.lockWindow.style.left = '';
                    this.lockWindow.style.top = '';
                    this.lockWindow.style.right = '';
                    this.lockWindow.style.bottom = '';
                };
            }
        } catch (_) {}
    }

    // ============== 阶段切换 ==============
    _switchToInput() {
        if (!this.el) return;
        this.stage = 'input';
        this.clockStage.style.display = 'none';
        this.inputStage.style.display = 'flex';
        this._resetWindowPosition && this._resetWindowPosition();
        try { this._renderInput(); } catch (e) { console.error('renderInput failed:', e); }
    }

    _switchToClock() {
        if (!this.el) return;
        this.stage = 'clock';
        this.clockStage.style.display = 'flex';
        this.inputStage.style.display = 'none';
        this._resetWindowPosition && this._resetWindowPosition();
    }

    _refreshStaticTexts() {
        if (this.hintEl) this.hintEl.textContent = this.t('lock.bottomHint', '点击屏幕任意位置 · 或按任意键开始');
    }

    // ============== 渲染 ==============
    _renderInput() {
        if (!this.contentEl) return;
        this.contentEl.innerHTML = '';
        if (this.errorEl) this.errorEl.textContent = '';

        const user = this.userManager.getCurrentUser();
        if (!user) return;

        if (this.usernameEl) this.usernameEl.textContent = user.username;
        if (this.avatarEl) {
            this.avatarEl.innerHTML = '';
            this.avatarEl.appendChild(this._buildAvatarEl(user));
        }

        if (user.password) {
            const input = document.createElement('input');
            input.className = 'lock-password-input';
            input.type = 'password';
            input.placeholder = this.t('lock.promptForPassword', '请输入密码');
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._unlock();
            });
            this.contentEl.appendChild(input);
            const btn = document.createElement('button');
            btn.className = 'lock-unlock-btn';
            btn.textContent = this.t('lock.unlock', '解锁');
            btn.addEventListener('click', () => this._unlock());
            this.contentEl.appendChild(btn);
            this.passwordInput = input;
        } else {
            const btn = document.createElement('button');
            btn.className = 'lock-unlock-btn';
            btn.textContent = this.t('lock.clickToUnlock', '点击解锁');
            btn.addEventListener('click', () => this._unlock());
            this.contentEl.appendChild(btn);
            this.passwordInput = null;
        }

        this._renderUserList();
        if (this.passwordInput) setTimeout(() => this.passwordInput.focus(), 50);
    }

    _renderUserList() {
        if (!this.userListEl) return;
        this.userListEl.innerHTML = '';
        const users = this.userManager.listUsers();
        const current = this.userManager.getCurrentUser();
        users.forEach(user => {
            const isCurrent = current && user.username === current.username;
            const row = document.createElement('div');
            row.className = 'lock-user-item' + (isCurrent ? ' lock-user-item-current' : '');
            const avatar = document.createElement('div');
            avatar.className = 'lock-user-item-avatar';
            avatar.appendChild(this._buildAvatarEl(user));
            row.appendChild(avatar);
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
            row.appendChild(info);
            if (!isCurrent) {
                row.addEventListener('click', () => {
                    if (user.password) {
                        const pwd = prompt(this.t('lock.promptForPassword', '请输入密码'));
                        if (pwd == null) return;
                        if (this.userManager.verifyPassword(user.username, pwd)) this._switchUser(user.username);
                        else if (this.errorEl) this.errorEl.textContent = this.t('lock.passwordError', '密码错误');
                    } else {
                        this._switchUser(user.username);
                    }
                });
            }
            this.userListEl.appendChild(row);
        });
    }

    _switchUser(username) {
        this.userManager.setCurrentUser(username);
        this.userManager.reload();
        try {
            if (typeof this.onUserSwitch === 'function') this.onUserSwitch(username);
        } catch (_) {}
        this._renderInput();
    }

    // ============== 解锁 ==============
    _unlock() {
        try {
            const user = this.userManager.getCurrentUser();
            if (!user) return;
            if (!user.password) {
                this.hide();
                if (typeof this.onUnlock === 'function') this.onUnlock();
                return;
            }
            const pwd = this.passwordInput ? this.passwordInput.value : '';
            if (this.userManager.verifyPassword(user.username, pwd)) {
                this.hide();
                if (typeof this.onUnlock === 'function') this.onUnlock();
            } else {
                if (this.errorEl) this.errorEl.textContent = this.t('lock.passwordError', '密码错误');
                if (this.passwordInput) {
                    this.passwordInput.value = '';
                    this.passwordInput.focus();
                }
            }
        } catch (e) { console.error('_unlock failed:', e); }
    }

    // ============== Canvas 粒子（失败就静默跳过） ==============
    _startParticles() {
        const canvas = this._particlesCanvas;
        if (!canvas) return;
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
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
            const N = Math.max(24, Math.floor((window.innerWidth * window.innerHeight) / 36000));
            const particles = Array.from({ length: N }, () => ({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                r: Math.random() * 1.6 + 0.3,
                vx: (Math.random() - 0.5) * 0.2,
                vy: (Math.random() - 0.5) * 0.2,
                a:  Math.random() * 0.4 + 0.1,
                hue: 180 + Math.random() * 60,
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
                            if (d2 < 120 * 120) {
                                ctx.strokeStyle = `hsla(${(p.hue + q.hue) * 0.5}, 80%, 70%, ${(1 - Math.sqrt(d2) / 120) * 0.14})`;
                                ctx.lineWidth = 0.5;
                                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
                            }
                        }
                    }
                    for (const p of particles) {
                        ctx.fillStyle = `hsla(${p.hue}, 95%, 88%, ${p.a})`;
                        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
                    }
                    this._particlesAnim = requestAnimationFrame(step);
                } catch (_) {}
            };
            step();
        } catch (_) {}
    }

    // ============== 时钟 ==============
    _startClock() {
        this._refreshClock();
        this._clockTimer = setInterval(() => this._refreshClock(), 1000);
    }
    _refreshClock() {
        if (this.clockTimeEl) {
            const now = new Date();
            this.clockTimeEl.textContent =
                `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        }
        if (this.clockDateEl) {
            const now = new Date();
            const i18n = {
                cmn: `${now.getFullYear()} 年 ${String(now.getMonth() + 1).padStart(2, '0')} 月 ${String(now.getDate()).padStart(2, '0')} 日`,
                eng: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                jpn: `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日`,
            };
            this.clockDateEl.textContent = i18n[this.lang] || i18n.cmn;
        }
    }

    // ============== 公共 API ==============
    show() {
        if (!this.el) return;
        this.stage = 'clock';
        this.clockStage.style.display = 'flex';
        this.inputStage.style.display = 'none';
        this._resetWindowPosition && this._resetWindowPosition();
        this.el.style.display = 'flex';
        this._refreshStaticTexts();
        this._refreshClock();
    }
    hide() {
        if (!this.el) return;
        this.el.style.display = 'none';
        this._switchToClock();
    }
    showWithUserList() { this.show(); }

    switchUser(username) {
        this.userManager.setCurrentUser(username);
        this.show();
    }

    destroy() {
        try {
            if (this._clockTimer) clearInterval(this._clockTimer);
            if (this._particlesAnim) cancelAnimationFrame(this._particlesAnim);
            if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
        } catch (_) {}
    }
}

export default LockScreen;
