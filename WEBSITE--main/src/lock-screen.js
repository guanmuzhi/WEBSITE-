import UserManager from './user-manager.js?v=47';
/**
 * LockScreen · v1.6 — 稳定重写
 *  - 壁纸固定 Bing UHD（全屏覆盖 + 半透明深色渐变 + Canvas 粒子）
 *  - 两步式界面：① 时钟+提示；② 用户/密码输入（同一背景）
 *  - 无 Element.animate()（该 API 在不同浏览器上行为不一致易闪退）
 *  - 全部 DOM / storage / 事件链路 try/catch 包裹
 *  - 默认头像 /apps/icons/user-avatar.svg（Material Person Outline）
 */
const BING_WALLPAPER = 'https://bing.lbeam08.cn/img/uhd?direct=true';
/* 上滑判定阈值（px）：拖过这么多就算“滑上去了” */
const SWIPE_THRESHOLD = 72;
/* 拖拽跟手系数：手指移动 1px，界面只跟 0.55px，带一点阻尼感 */
const SWIPE_DAMPING = 0.55;

/**
 * 把「相对于本文件（src/lock-screen.js）」的路径解析成绝对 URL。
 * fetch()/img.src 按「文档 base」解析，而本模块位于 src/ 下、运行在根目录 index.html 中，
 * 两套基准不一致，裸相对路径在子路径部署时会错位，因此统一在此解析。
 */
const assetUrl = (rel) => new URL(rel, import.meta.url).href;

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
        this._particlesRunning = false;
        this._clockTimer = null;
        this._dragCleanups = [];
        this._animating = false;        // 解锁/切阶段动画进行中，锁住输入
        this._swipeMoved = false;       // 本次按下是否发生过滑动（用于区分 click / swipe）
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
        const files = { cmn: assetUrl('../languages/cmn.json'), eng: assetUrl('../languages/eng.json'), jpn: assetUrl('../languages/jpn.json') };
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
    get defaultAvatarUrl() { return assetUrl('../apps/icons/user-avatar.svg'); }

    _getAvatarFor(user) {
        if (user && user.avatar) return user.avatar;
        return this.defaultAvatarUrl;
    }

    /** 构造头像元素（纯 <img>，彻底无文字 fallback） */
    _buildAvatarEl(user) {
        const url = this._getAvatarFor(user);
        const img = document.createElement('img');
        img.className = 'lock-avatar-img';
        img.alt = 'avatar';
        img.referrerPolicy = 'no-referrer';
        img.decoding = 'async';
        img.src = url;
        img.onerror = () => {
            // 防止无限循环：如果当前已经是默认 SVG 还挂了就放弃
            // 注意 img.src 读回的是绝对 URL，必须用同样解析过的绝对 URL 才能比得上
            const fallback = assetUrl('../apps/icons/user-avatar.svg');
            if (img.src === fallback || img.src.endsWith('/apps/icons/user-avatar.svg')) {
                img.style.visibility = 'hidden';
                return;
            }
            img.src = fallback;
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
            //    壁纸是远程请求，可能很慢甚至失败，所以先铺一层本地渐变兜底，
            //    图片 onload 后再淡入，避免“黑屏等半天”的卡顿观感。
            const wall = document.createElement('div');
            wall.className = 'lock-wallpaper';
            overlay.appendChild(wall);
            const probe = new Image();
            let settled = false;
            const applyWallpaper = () => {
                if (settled) return;
                settled = true;
                wall.style.backgroundImage = `url("${BING_WALLPAPER}")`;
                wall.classList.add('is-loaded');
            };
            probe.onload = applyWallpaper;
            probe.onerror = () => { settled = true; };   // 失败就一直用渐变兜底
            probe.src = BING_WALLPAPER;
            setTimeout(applyWallpaper, 1200);            // 加载慢也别一直等
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
                <div class="lock-swipe-hint" id="lock-swipe-hint">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="19" x2="12" y2="6"></line>
                        <polyline points="6 12 12 6 18 12"></polyline>
                    </svg>
                    <span id="lock-swipe-hint-text">向上滑动</span>
                </div>
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
            card.className = 'lock-card';

            const header = document.createElement('div');
            header.className = 'lock-card-header';
            header.innerHTML = `
                <button class="lock-back-btn" id="lock-back-btn" title="返回时钟">
                    <img src="${assetUrl('../apps/icons/back.svg')}" alt="back">
                </button>
                <div class="lock-card-title" id="lock-card-title">navore OS</div>
                <div style="width:32px;"></div>
            `;

            const body = document.createElement('div');
            body.className = 'lock-card-body';
            body.innerHTML = `
                <div class="lock-header">
                    <div class="lock-user-avatar" id="lock-avatar"></div>
                    <div class="lock-username" id="lock-username"></div>
                </div>
                <div class="lock-content"></div>
                <div class="lock-error" id="lock-error"></div>
                <button class="lock-create-user-btn" id="lock-create-user">+ 创建新用户</button>
                <div class="lock-user-list-header">切换用户 · Switch User</div>
                <div class="lock-user-list" id="lock-user-list"></div>
            `;
            card.appendChild(header);
            card.appendChild(body);
            this.inputStage.appendChild(card);
            overlay.appendChild(this.inputStage);

            this.el = overlay;
            this.lockWindow = card;
            this.contentEl = body.querySelector('.lock-content');
            this.errorEl = body.querySelector('#lock-error');
            this.avatarEl = body.querySelector('#lock-avatar');
            this.usernameEl = body.querySelector('#lock-username');
            this.userListEl = body.querySelector('#lock-user-list');
            this.createUserBtn = body.querySelector('#lock-create-user');
            this.backBtn = header.querySelector('#lock-back-btn');
            this.cardTitleEl = header.querySelector('#lock-card-title');
            this.clockTimeEl = this.clockStage.querySelector('#lock-clock-time');
            this.clockDateEl = this.clockStage.querySelector('#lock-clock-date');
            this.hintEl = this.clockStage.querySelector('#lock-clock-hint');
            this.swipeHintEl = this.clockStage.querySelector('#lock-swipe-hint');
            this.swipeHintTextEl = this.clockStage.querySelector('#lock-swipe-hint-text');
            document.body.appendChild(overlay);
        } catch (e) { console.error('lock _build failed:', e); }
    }

    // ============== 事件 ==============
    _bindEvents() {
        const overlay = this.el;
        /* 关键修复：原来只把唤醒监听挂在 this.clockStage 上，而 .lock-stage 是
           pointer-events:none（只有它的直接子元素才 auto），于是点到时钟数字
           之间的空白处事件就穿透走了 —— 体感就是“点任意位置没反应”。
           现在挂在整个全屏 overlay 上，只有落在登录卡 / 输入控件上时跳过。 */
        overlay.addEventListener('click', (ev) => {
            if (this.stage !== 'clock' || this._animating) return;
            if (this._swipeMoved) return;                       // 刚才是滑动手势，别再当点击
            const t = ev.target;
            if (t && t.closest && t.closest('.lock-card, .lock-bottom-bar, input, textarea, button, a')) return;
            this._switchToInput();
        });

        document.addEventListener('keydown', (ev) => {
            if (!this.el || this.el.style.display === 'none') return;
            if (this.stage === 'clock') { this._switchToInput(); return; }
            if (this.stage === 'input' && ev.key === 'Escape') this._switchToClock();
        });

        try {
            if (this.backBtn) this.backBtn.addEventListener('click', (e) => { e.stopPropagation(); this._switchToClock(); });
        } catch (_) {}

        try {
            if (this.createUserBtn) this.createUserBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._promptCreateUser();
            });
        } catch (_) {}

        this._bindSwipe();
        this._resetWindowPosition = () => {};
    }

    // ============== 上滑手势 ==============
    /* 支持三个方向的语义：
       clock 阶段上滑 → 进入登录卡片（卡片从下方淡入上滑）
       input 阶段上滑 → 无密码直接解锁；有密码则等价于按“解锁”
       松手时位移不够就带过渡回弹。 */
    _bindSwipe() {
        const overlay = this.el;
        if (!overlay) return;
        let startX = 0, startY = 0, tracking = false, decided = false, isVertical = false;

        const canTrack = (target) => {
            // 卡片内部可滚动时，把竖向手势让给原生滚动
            const body = target && target.closest ? target.closest('.lock-card-body') : null;
            if (body && body.scrollHeight - body.clientHeight > 4) return false;
            // 输入类控件不劫持
            if (target && target.closest && target.closest('input, textarea, select')) return false;
            return true;
        };

        const onDown = (e) => {
            if (this._animating) return;
            if (!canTrack(e.target)) return;
            tracking = true; decided = false; isVertical = false;
            this._swipeMoved = false;
            startX = e.clientX; startY = e.clientY;
            this._setDragging(true);
        };

        const onMove = (e) => {
            if (!tracking) return;
            const dy = startY - e.clientY;      // 向上为正
            const dx = e.clientX - startX;
            if (!decided) {
                if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
                decided = true;
                isVertical = Math.abs(dy) > Math.abs(dx);
                if (!isVertical) { tracking = false; this._setDragging(false); return; }
            }
            if (!isVertical) return;
            if (dy < 0) { this._applySwipe(0); return; }   // 下拉不响应
            this._swipeMoved = true;
            this._applySwipe(dy);
        };

        const onUp = (e) => {
            if (!tracking) return;
            tracking = false;
            this._setDragging(false);
            if (!isVertical || !this._swipeMoved) return;
            const dy = startY - (e.clientY !== undefined ? e.clientY : startY);
            if (dy >= SWIPE_THRESHOLD) {
                this._swipeCommit();
            } else {
                this._swipeCancel();
            }
            // 让紧随其后的 click 事件知道自己是被滑动产生的，不要重复触发
            setTimeout(() => { this._swipeMoved = false; }, 60);
        };

        if (window.PointerEvent) {
            overlay.addEventListener('pointerdown', onDown);
            overlay.addEventListener('pointermove', onMove);
            overlay.addEventListener('pointerup', onUp);
            overlay.addEventListener('pointercancel', () => { tracking = false; this._swipeCancel(); });
        } else {
            overlay.addEventListener('mousedown', onDown);
            overlay.addEventListener('mousemove', onMove);
            overlay.addEventListener('mouseup', onUp);
            overlay.addEventListener('touchstart', (e) => {
                const t = e.touches[0]; if (t) onDown({ clientX: t.clientX, clientY: t.clientY, target: e.target });
            }, { passive: true });
            overlay.addEventListener('touchmove', (e) => {
                const t = e.touches[0]; if (t) onMove({ clientX: t.clientX, clientY: t.clientY, target: e.target });
            }, { passive: true });
            overlay.addEventListener('touchend', (e) => {
                const t = e.changedTouches[0]; if (t) onUp({ clientY: t.clientY });
            });
        }
    }

    /** 拖拽中：关掉过渡，保证跟手 */
    _setDragging(on) {
        const stage = this.stage === 'clock' ? this.clockStage : this.inputStage;
        if (!stage) return;
        stage.style.transition = on ? 'none' : '';
    }

    /** 按位移量实时渲染跟手反馈 */
    _applySwipe(dy) {
        const stage = this.stage === 'clock' ? this.clockStage : this.inputStage;
        if (!stage) return;
        const shift = -dy * SWIPE_DAMPING;
        const ratio = Math.min(1, dy / (SWIPE_THRESHOLD * 1.6));
        stage.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
        stage.style.opacity = String(Math.max(0, 1 - ratio * 0.9));
        if (this.swipeHintEl) this.swipeHintEl.style.opacity = String(Math.max(0, 1 - ratio * 2));
    }

    _resetSwipeStyles() {
        [this.clockStage, this.inputStage].forEach(el => {
            if (!el) return;
            el.style.transition = '';
            el.style.transform = '';
            el.style.opacity = '';
        });
        if (this.swipeHintEl) this.swipeHintEl.style.opacity = '';
    }

    /** 位移不够，回弹 */
    _swipeCancel() {
        const stage = this.stage === 'clock' ? this.clockStage : this.inputStage;
        if (!stage) return;
        stage.style.transition = 'transform 0.32s cubic-bezier(0.22,1,0.36,1), opacity 0.32s ease';
        stage.style.transform = '';
        stage.style.opacity = '';
        if (this.swipeHintEl) this.swipeHintEl.style.opacity = '';
        setTimeout(() => { stage.style.transition = ''; }, 340);
    }

    /** 滑够了：按当前阶段执行对应动作 */
    _swipeCommit() {
        if (this._animating) return;
        if (this.stage === 'clock') {
            this._switchToInput(true);
        } else {
            // input 阶段上滑 = 等价于“按解锁”：无密码直接解锁，有密码则校验。
            // 注意：必须走 _unlock()，校验通过后真正 dismiss；
            // 之前这里只调了 _tryUnlock() 却在成功分支什么都不做，导致
            // 用户输入正确密码再上滑时画面毫无反应，只能反复重输 —— 即“重复输入密码”的 bug。
            this._unlock(true);
        }
    }

    _shakeCard() {
        const card = this.lockWindow;
        if (!card) return;
        card.style.transition = 'transform 0.32s cubic-bezier(0.22,1,0.36,1)';
        card.style.transform = '';
        card.classList.remove('lock-card-shake');
        void card.offsetWidth;
        card.classList.add('lock-card-shake');
        setTimeout(() => { card.classList.remove('lock-card-shake'); card.style.transition = ''; }, 420);
    }

    /** 只做密码校验，返回结果，不负责动画 */
    _tryUnlock() {
        const user = this.userManager.getCurrentUser();
        if (!user) return false;
        if (!user.password) return true;
        const pwd = this.passwordInput ? this.passwordInput.value : '';
        if (this.userManager.verifyPassword(user.username, pwd)) return true;
        if (this.errorEl) this.errorEl.textContent = this.t('lock.passwordError', '密码错误');
        if (this.passwordInput) { this.passwordInput.value = ''; this.passwordInput.focus(); }
        return false;
    }

    // ============== 阶段切换 ==============
    _switchToInput(animated = false) {
        if (!this.el) return;
        this.stage = 'input';
        this._animating = true;
        this.clockStage.style.display = 'none';
        this.inputStage.style.display = 'flex';
        try { this._renderInput(); } catch (e) { console.error('renderInput failed:', e); }
        if (animated && this.lockWindow) {
            // 卡片从下方滑入，同时时钟层残留的 transform 一次性清掉
            const card = this.lockWindow;
            card.style.transition = 'none';
            card.style.transform = 'translate3d(0, 40px, 0)';
            card.style.opacity = '0';
            void card.offsetWidth;
            card.style.transition = 'transform 0.34s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease';
            card.style.transform = '';
            card.style.opacity = '';
            setTimeout(() => {
                card.style.transition = '';
                this._resetSwipeStyles();
                this._animating = false;
            }, 360);
        } else {
            this._resetSwipeStyles();
            this._animating = false;
        }
    }

    _switchToClock() {
        if (!this.el) return;
        this.stage = 'clock';
        this._resetSwipeStyles();
        this.clockStage.style.display = 'flex';
        this.inputStage.style.display = 'none';
        this._resetWindowPosition && this._resetWindowPosition();
    }

    _refreshStaticTexts() {
        if (this.hintEl) this.hintEl.textContent = this.t('lock.bottomHint', '点击屏幕任意位置 · 或按任意键开始');
        if (this.swipeHintTextEl) this.swipeHintTextEl.textContent = this.t('lock.swipeHint', '向上滑动');
    }

    // ============== 渲染 ==============
    _renderInput() {
        if (!this.contentEl) return;
        this.contentEl.innerHTML = '';
        if (this.errorEl) this.errorEl.textContent = '';
        // 创建用户表单会临时隐藏这些元素，普通渲染时务必还原
        if (this.userListEl) this.userListEl.style.display = '';
        if (this.createUserBtn) this.createUserBtn.style.display = '';

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
            // 仅为当前用户加操作按钮：重命名、删除
            if (isCurrent) {
                const actions = document.createElement('div');
                actions.className = 'lock-user-item-actions';
                const renameBtn = document.createElement('button');
                renameBtn.className = 'lock-user-action-btn lock-user-action-edit';
                renameBtn.title = this.t('lock.rename', '重命名');
                renameBtn.innerHTML = `<img src="${assetUrl('../apps/icons/edit.svg')}" alt="${this.t('lock.rename', 'Rename')}">`;
                renameBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._promptRenameUser(user.username);
                });
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'lock-user-action-btn lock-user-action-delete';
                deleteBtn.title = this.t('lock.delete', '删除');
                deleteBtn.innerHTML = `<img src="${assetUrl('../apps/icons/delete.svg')}" alt="${this.t('lock.delete', 'Delete')}">`;
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._promptDeleteUser(user.username);
                });
                actions.appendChild(renameBtn);
                actions.appendChild(deleteBtn);
                row.appendChild(actions);
            } else {
                row.addEventListener('click', async () => {
                    if (user.password) {
                        const D = window.Dialogs;
                        const pwd = D ? await D.showPrompt(this.t('lock.promptForPassword', '请输入密码'), '') : prompt(this.t('lock.promptForPassword', '请输入密码'));
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

    async _promptRenameUser(oldName) {
        try {
            const D = window.Dialogs;
            const newName = D ? await D.showPrompt(this.t('lock.newUsername', '新用户名'), oldName) : prompt(this.t('lock.newUsername', '新用户名'), oldName);
            if (!newName || newName === oldName) return;
            if (newName.indexOf('/') !== -1 || newName.indexOf('\\') !== -1) {
                if (D) await D.showAlert('用户名不能包含 / \\'); else alert('用户名不能包含 / \\'); return;
            }
            if (this.userManager.listUsers().some(u => u.username === newName)) {
                if (D) await D.showAlert('用户已存在'); else alert('用户已存在'); return;
            }
            const pwd = D ? await D.showPrompt(this.t('lock.enterCurrentPassword', '输入当前密码'), '') : prompt(this.t('lock.enterCurrentPassword', '输入当前密码'));
            if (pwd == null) return;
            const res = this.userManager.renameUser(oldName, newName, pwd);
            if (!res || !res.success) {
                if (this.errorEl) this.errorEl.textContent = (res && res.message) ? res.message : this.t('lock.passwordError', '密码错误');
                return;
            }
            this.userManager.reload();
            this._renderInput();
        } catch (e) { console.error('rename fail:', e); }
    }

    async _promptDeleteUser(name) {
        try {
            const D = window.Dialogs;
            if (this.userManager.listUsers().length <= 1) {
                if (D) await D.showAlert('至少需要保留一个用户'); else alert('至少需要保留一个用户');
                return;
            }
            const delMsg = this.t('lock.deleteUserConfirm', `确定要删除用户 "${name}" 吗？此操作无法撤销。`).replace('{name}', name);
            if (!(D ? await D.showConfirm(delMsg) : confirm(delMsg))) return;
            const pwd = D ? await D.showPrompt(this.t('lock.enterPasswordToDelete', '请输入密码以确认删除'), '') : prompt(this.t('lock.enterPasswordToDelete', '请输入密码以确认删除'));
            if (pwd == null) return;
            // 先校验密码
            if (!this.userManager.verifyPassword(name, pwd)) {
                if (this.errorEl) this.errorEl.textContent = this.t('lock.passwordError', '密码错误');
                return;
            }
            const res = this.userManager.deleteUser(name);
            if (!res || !res.success) {
                if (this.errorEl) this.errorEl.textContent = (res && res.message) ? res.message : '删除失败';
                return;
            }
            this.userManager.reload();
            const next = this.userManager.listUsers()[0];
            if (next) this.userManager.setCurrentUser(next.username);
            this._renderInput();
        } catch (e) { console.error('delete fail:', e); }
    }

    _promptCreateUser() {
        if (!this.contentEl) return;
        if (this.stage !== 'input') this._switchToInput();
        if (this.userListEl) this.userListEl.style.display = 'none';
        if (this.createUserBtn) this.createUserBtn.style.display = 'none';
        if (this.errorEl) this.errorEl.textContent = '';
        const user = this.userManager.getCurrentUser();
        if (this.usernameEl) this.usernameEl.textContent = user ? user.username : '';
        this.contentEl.innerHTML = `
            <div class="lock-create-form">
                <input class="lock-input" id="lock-new-name" type="text" placeholder="${this.t('lock.newUsername', '用户名')}" autocomplete="off" maxlength="24">
                <input class="lock-input" id="lock-new-pwd" type="password" placeholder="${this.t('lock.newPassword', '密码（可留空）')}">
                <input class="lock-input" id="lock-new-pwd2" type="password" placeholder="${this.t('lock.confirmPassword', '确认密码')}">
                <div class="lock-create-actions">
                    <button class="lock-unlock-btn" id="lock-create-ok">${this.t('lock.create', '创建')}</button>
                    <button class="lock-cancel-btn" id="lock-create-cancel">${this.t('lock.cancel', '取消')}</button>
                </div>
            </div>`;
        const nameEl = this.contentEl.querySelector('#lock-new-name');
        const pwdEl = this.contentEl.querySelector('#lock-new-pwd');
        const pwd2El = this.contentEl.querySelector('#lock-new-pwd2');
        const errEl = this.errorEl;
        setTimeout(() => nameEl && nameEl.focus(), 50);

        const cancel = () => { this._renderInput(); };
        this.contentEl.querySelector('#lock-create-cancel').addEventListener('click', cancel);

        const submit = () => {
            const name = (nameEl.value || '').trim();
            const pwd = pwdEl.value;
            const pwd2 = pwd2El.value;
            if (!name) { if (errEl) errEl.textContent = this.t('lock.usernameEmpty', '用户名不能为空'); return; }
            if (name.indexOf('/') !== -1 || name.indexOf('\\') !== -1 || name.indexOf(' ') !== -1) {
                if (errEl) errEl.textContent = this.t('lock.usernameInvalid', '用户名不能包含 / \\ 或空格'); return;
            }
            if (this.userManager.listUsers().some(u => u.username === name)) {
                if (errEl) errEl.textContent = this.t('lock.userExists', '用户已存在'); return;
            }
            if (pwd !== pwd2) { if (errEl) errEl.textContent = this.t('lock.passwordMismatch', '两次输入的密码不一致'); return; }
            const res = this.userManager.createUser(name, pwd || null);
            if (!res || !res.success) {
                if (errEl) errEl.textContent = (res && res.message) ? res.message : this.t('lock.createFailed', '创建失败');
                return;
            }
            this.userManager.reload();
            if (this.userListEl) this.userListEl.style.display = '';
            this._switchUser(name);
        };
        this.contentEl.querySelector('#lock-create-ok').addEventListener('click', submit);
        pwd2El.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') pwdEl.focus(); });
    }

    _switchUser(username) {
        // 必须先触发 onUserSwitch（desktop.switchUser 会先按“当前用户”把窗口状态存到
        // 该用户的 windows_status.json），绝不能先 setCurrentUser —— 否则 desktop.switchUser
        // 读到的“当前用户”已是新用户，会把旧用户的窗口写进新用户的文件，造成多用户窗口互相串台。
        try {
            if (typeof this.onUserSwitch === 'function') this.onUserSwitch(username);
        } catch (_) {}
        this.userManager.setCurrentUser(username);
        this.userManager.reload();
        this._renderInput();
    }

    // ============== 解锁 ==============
    _unlock(viaSwipe = false) {
        try {
            const user = this.userManager.getCurrentUser();
            if (!user) return;
            let ok = true;
            if (user.password) ok = this._tryUnlock();
            if (!ok) {
                if (viaSwipe) this._shakeCard();
                return;
            }
            this._dismiss(viaSwipe);
        } catch (e) { console.error('_unlock failed:', e); }
    }

    /** 解锁成功：播上滑出场动画，再真正隐藏并回调 */
    _dismiss(viaSwipe) {
        if (this._dismissing) return;
        this._dismissing = true;
        const finish = () => {
            this._dismissing = false;
            this._animating = false;
            this.hide();
            if (typeof this.onUnlock === 'function') this.onUnlock();
        };
        if (viaSwipe && this.inputStage) {
            this._animating = true;
            const stage = this.inputStage;
            stage.style.transition = 'transform 0.36s cubic-bezier(0.32,0,0.67,0), opacity 0.3s ease';
            stage.style.transform = 'translate3d(0, -55vh, 0)';
            stage.style.opacity = '0';
            if (this.el) this.el.classList.add('is-dismissing');
            setTimeout(finish, 260);
        } else {
            finish();
        }
    }

    // ============== Canvas 粒子（失败就静默跳过） ==============
    /* 性能说明（原来这里很卡）：
       1) 每帧对每个粒子都做 O(N²) 全量两两判定 + 逐条 stroke，1080p 下一帧上千次绘制调用；
       2) 锁屏 hide() 只是 display:none，rAF 循环照跑，白白烧一整个 CPU 核心；
       3) DPR 取到 2，等于按 2 倍分辨率重绘。
       现在：粒子数封顶 34、连线用“每个粒子最多连 4 条 + 同批 path 一次 stroke”、
       DPR 降到 1.25、动画节流到 ~33fps，并在隐藏/切后台时真正停掉 rAF。 */
    _startParticles() {
        const canvas = this._particlesCanvas;
        if (!canvas || this._particlesRunning) return;
        try {
            const ctx = canvas.getContext('2d', { alpha: true });
            if (!ctx) return;
            const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
            let W = 0, H = 0;
            const resize = () => {
                try {
                    W = window.innerWidth; H = window.innerHeight;
                    canvas.width = Math.floor(W * DPR);
                    canvas.height = Math.floor(H * DPR);
                    canvas.style.width = W + 'px';
                    canvas.style.height = H + 'px';
                    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
                } catch (_) {}
            };
            resize();
            if (!this._resizeBound) {
                this._resizeBound = () => resize();
                window.addEventListener('resize', this._resizeBound);
            }

            if (!this._particles) {
                const N = Math.min(34, Math.max(14, Math.floor((window.innerWidth * window.innerHeight) / 62000)));
                this._particles = Array.from({ length: N }, () => ({
                    x: Math.random() * (W || window.innerWidth),
                    y: Math.random() * (H || window.innerHeight),
                    r: Math.random() * 1.5 + 0.4,
                    vx: (Math.random() - 0.5) * 0.18,
                    vy: (Math.random() - 0.5) * 0.18,
                    a: Math.random() * 0.35 + 0.12,
                    hue: 180 + Math.random() * 60,
                }));
            }
            const LINK_DIST = 108, LINK_DIST2 = LINK_DIST * LINK_DIST, MAX_LINKS = 4;
            let last = 0;
            const FRAME_MS = 33;   // ~30fps，粒子这种氛围动画完全够用

            const step = (now) => {
                if (!this._particlesRunning) return;
                this._particlesAnim = requestAnimationFrame(step);
                if (now - last < FRAME_MS) return;
                last = now;
                try {
                    ctx.clearRect(0, 0, W, H);
                    const parts = this._particles;
                    for (let i = 0; i < parts.length; i++) {
                        const p = parts[i];
                        p.x += p.vx; p.y += p.vy;
                        if (p.x < 0 || p.x > W) p.vx *= -1;
                        if (p.y < 0 || p.y > H) p.vy *= -1;
                    }
                    // 连线：每个粒子最多连 MAX_LINKS 条，整批一次 stroke
                    ctx.lineWidth = 0.5;
                    ctx.strokeStyle = 'rgba(150, 220, 255, 0.10)';
                    ctx.beginPath();
                    for (let i = 0; i < parts.length; i++) {
                        const p = parts[i];
                        let links = 0;
                        for (let j = i + 1; j < parts.length && links < MAX_LINKS; j++) {
                            const q = parts[j];
                            const dx = p.x - q.x, dy = p.y - q.y;
                            if (dx * dx + dy * dy < LINK_DIST2) {
                                ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
                                links++;
                            }
                        }
                    }
                    ctx.stroke();
                    // 粒子点：同色系共用一个 fillStyle，减少状态切换
                    ctx.fillStyle = 'rgba(198, 238, 255, 0.5)';
                    ctx.beginPath();
                    for (const p of parts) {
                        ctx.moveTo(p.x + p.r, p.y);
                        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    }
                    ctx.fill();
                } catch (_) {}
            };
            this._particlesRunning = true;
            this._particlesAnim = requestAnimationFrame(step);
        } catch (_) {}
    }

    _stopParticles() {
        this._particlesRunning = false;
        if (this._particlesAnim) {
            cancelAnimationFrame(this._particlesAnim);
            this._particlesAnim = null;
        }
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
        this._resetSwipeStyles();
        this.el.classList.remove('is-dismissing');
        this.clockStage.style.display = 'flex';
        this.inputStage.style.display = 'none';
        this._resetWindowPosition && this._resetWindowPosition();
        this.el.style.display = 'flex';
        this._refreshStaticTexts();
        this._refreshClock();
        this._startParticles();
    }
    hide() {
        if (!this.el) return;
        this.el.style.display = 'none';
        this.el.classList.remove('is-dismissing');
        this._resetSwipeStyles();
        this._stopParticles();
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
            this._stopParticles();
            if (this._resizeBound) {
                window.removeEventListener('resize', this._resizeBound);
                this._resizeBound = null;
            }
            if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
        } catch (_) {}
    }
}

export default LockScreen;
