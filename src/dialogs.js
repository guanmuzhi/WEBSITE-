import UserManager from './user-manager.js?v=31';
import StorageService from './storage.js?v=31';

// ── 内联对话框样式（避免依赖外部 CSS；iframe 应用调 window.parent.Dialogs 也能直接看到样式） ──
const DIALOG_CSS = `
.webos-dlg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:inherit;}
.webos-dlg{background:#2d2d2d;border:1px solid #3d3d3d;border-radius:10px;color:#ddd;box-shadow:0 18px 50px rgba(0,0,0,.6);font-family:inherit;display:flex;flex-direction:column;overflow:hidden;}
.webos-dlg-title{font-size:15px;font-weight:600;padding:14px 18px;color:#eee;border-bottom:1px solid #3a3a3a;background:#252525;display:flex;align-items:center;gap:8px;}
.webos-dlg-body{padding:14px 18px;font-size:13px;color:#ccc;line-height:1.6;}
.webos-dlg-foot{padding:12px 18px;border-top:1px solid #3a3a3a;display:flex;gap:8px;justify-content:flex-end;background:#252525;}
.webos-dlg-btn{padding:7px 16px;border-radius:5px;border:1px solid transparent;font-size:13px;cursor:pointer;font-family:inherit;transition:background .15s,border-color .15s;color:#eee;}
.webos-dlg-btn-default{background:#3d3d3d;border-color:#4a4a4a;}
.webos-dlg-btn-default:hover{background:#4d4d4d;border-color:#5a5a5a;}
.webos-dlg-btn-primary{background:#3498db;border-color:#3498db;}
.webos-dlg-btn-primary:hover{background:#2980b9;border-color:#2980b9;}
.webos-dlg-btn-danger{background:#c0392b;border-color:#c0392b;}
.webos-dlg-btn-danger:hover{background:#a93226;border-color:#a93226;}
.webos-dlg-btn:disabled{opacity:.45;cursor:not-allowed;}
.webos-dlg-input{width:100%;padding:9px 12px;background:#1e1e1e;border:1px solid #3d3d3d;border-radius:5px;color:#ddd;font-size:13px;font-family:inherit;outline:none;transition:border-color .15s;}
.webos-dlg-input:focus{border-color:#3498db;}
.vfs-dlg{width:720px;max-width:92vw;max-height:86vh;}
.vfs-toolbar{display:flex;align-items:center;gap:6px;padding:10px 14px;background:#272727;border-bottom:1px solid #3a3a3a;flex-wrap:wrap;}
.vfs-crumbs{display:flex;align-items:center;gap:2px;flex:1;min-width:0;overflow-x:auto;padding:4px 0;scrollbar-width:thin;}
.vfs-crumbs::-webkit-scrollbar{height:6px;}
.vfs-crumbs::-webkit-scrollbar-thumb{background:#555;border-radius:3px;}
.vfs-crumb{padding:4px 10px;border-radius:4px;background:#1e1e1e;border:1px solid #3d3d3d;color:#ccc;font-size:12px;cursor:pointer;white-space:nowrap;font-family:inherit;}
.vfs-crumb:hover{background:#3498db15;border-color:#3498db;color:#fff;}
.vfs-crumb-current{background:#3498db22;border-color:#3498db;color:#fff;font-weight:600;}
.vfs-sep{color:#777;font-size:12px;padding:0 2px;}
.vfs-list{flex:1;min-height:240px;max-height:52vh;overflow-y:auto;background:#1e1e1e;padding:6px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px;align-content:start;}
.vfs-list::-webkit-scrollbar{width:10px;}
.vfs-list::-webkit-scrollbar-track{background:#1e1e1e;}
.vfs-list::-webkit-scrollbar-thumb{background:#444;border-radius:5px;border:2px solid #1e1e1e;}
.vfs-list::-webkit-scrollbar-thumb:hover{background:#5a5a5a;}
.vfs-item{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:5px;cursor:pointer;font-size:13px;color:#ddd;border:1px solid transparent;overflow:hidden;user-select:none;}
.vfs-item:hover{background:#3498db15;border-color:#3498db44;}
.vfs-item-active{background:#3498db25 !important;border-color:#3498db !important;}
.vfs-icon{font-size:16px;width:18px;text-align:center;flex-shrink:0;}
.vfs-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.vfs-size{color:#888;font-size:11px;flex-shrink:0;margin-left:6px;}
.vfs-empty{grid-column:1/-1;padding:40px 20px;text-align:center;color:#888;font-size:13px;}
.vfs-bottom{padding:10px 14px;background:#272727;border-top:1px solid #3a3a3a;display:flex;flex-direction:column;gap:8px;}
.vfs-file-row{display:flex;align-items:center;gap:8px;}
.vfs-file-label{font-size:12px;color:#aaa;flex-shrink:0;min-width:72px;}
.vfs-actions{display:flex;gap:6px;align-items:center;justify-content:flex-end;}
.vfs-err{color:#e74c3c;font-size:12px;min-height:16px;}
.vfs-tool-btn{padding:5px 10px;border-radius:4px;background:#3d3d3d;border:1px solid #4a4a4a;color:#ccc;font-size:12px;cursor:pointer;font-family:inherit;}
.vfs-tool-btn:hover{background:#4d4d4d;color:#fff;}
`;

let _cssInjected = false;
function _ensureCss() {
    if (_cssInjected) return;
    const tag = document.createElement('style');
    tag.setAttribute('data-webos-dialogs', '1');
    tag.textContent = DIALOG_CSS;
    document.head.appendChild(tag);
    _cssInjected = true;
}

// ── VFS/Storage 帮助（不通过 FileSystem，避免循环依赖） ──
function _getStorage() { return StorageService.getInstance(); }

function _listFolder(path) {
    const s = _getStorage();
    const node = s.getNodeByPath(path);
    if (!node || node.type !== 'folder') return null;
    const items = (node.children || []).slice();
    items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        try { return a.name.localeCompare(b.name, 'zh-Hans-CN'); } catch (e) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }
    });
    return items;
}

function _approxSize(content) {
    if (content == null) return 0;
    if (typeof content !== 'string') return String(content).length;
    if (content.startsWith('data:')) {
        const i = content.indexOf(',');
        if (i === -1) return content.length;
        const body = content.slice(i + 1);
        if (/;base64$/.test(content.slice(0, i))) {
            const b64 = body.replace(/=+$/, '');
            return Math.floor((b64.length * 3) / 4);
        }
        return body.length;
    }
    return content.length;
}

function _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    const k = bytes / 1024;
    if (k < 1024) return k.toFixed(k < 10 ? 2 : 1) + ' KB';
    return (k / 1024).toFixed(k < 10240 ? 2 : 1) + ' MB';
}

function _defaultStart() {
    try {
        const um = UserManager.getInstance();
        const cur = um && typeof um.getCurrentUser === 'function' ? um.getCurrentUser() : null;
        if (cur && cur.username) {
            const p = `/user/${cur.username}`;
            if (_getStorage().getNodeByPath(p)) return p;
        }
        if (_getStorage().getNodeByPath('/user/public')) return '/user/public';
    } catch (_) {}
    return '/';
}

class Dialogs {

    // ─────────────── 基础对话框 ───────────────
    static showAlert(message, title = '提示') {
        _ensureCss();
        return new Promise((resolve) => {
            const shell = Dialogs._buildShell(title);
            const body = document.createElement('div'); body.className = 'webos-dlg-body'; body.textContent = message;
            shell.dialog.appendChild(body);
            const foot = document.createElement('div'); foot.className = 'webos-dlg-foot';
            const ok = Dialogs._btn('确定', 'webos-dlg-btn webos-dlg-btn-primary', () => { shell.close(); resolve(); });
            foot.appendChild(ok); shell.dialog.appendChild(foot);
            shell.overlay.addEventListener('click', (e) => { if (e.target === shell.overlay) { shell.close(); resolve(); } });
            document.body.appendChild(shell.overlay);
            setTimeout(() => ok.focus(), 30);
        });
    }

    static showConfirm(message, title = '确认') {
        _ensureCss();
        return new Promise((resolve) => {
            const shell = Dialogs._buildShell(title);
            const body = document.createElement('div'); body.className = 'webos-dlg-body'; body.textContent = message;
            shell.dialog.appendChild(body);
            const foot = document.createElement('div'); foot.className = 'webos-dlg-foot';
            const cancel = Dialogs._btn('取消', 'webos-dlg-btn webos-dlg-btn-default', () => { shell.close(); resolve(false); });
            const confirm = Dialogs._btn('确定', 'webos-dlg-btn webos-dlg-btn-primary', () => { shell.close(); resolve(true); });
            foot.appendChild(cancel); foot.appendChild(confirm); shell.dialog.appendChild(foot);
            shell.overlay.addEventListener('click', (e) => { if (e.target === shell.overlay) { shell.close(); resolve(false); } });
            document.body.appendChild(shell.overlay);
            setTimeout(() => confirm.focus(), 30);
        });
    }

    static showPrompt(message, defaultValue = '', title = '输入') {
        _ensureCss();
        return new Promise((resolve) => {
            const shell = Dialogs._buildShell(title);
            const body = document.createElement('div'); body.className = 'webos-dlg-body';
            const msg = document.createElement('div'); msg.style.marginBottom = '12px'; msg.style.fontSize = '13px'; msg.style.color = '#ccc'; msg.textContent = message;
            const input = document.createElement('input'); input.type = 'text'; input.value = defaultValue; input.className = 'webos-dlg-input';
            body.appendChild(msg); body.appendChild(input); shell.dialog.appendChild(body);
            const foot = document.createElement('div'); foot.className = 'webos-dlg-foot';
            const cancel = Dialogs._btn('取消', 'webos-dlg-btn webos-dlg-btn-default', () => { shell.close(); resolve(null); });
            const ok = Dialogs._btn('确定', 'webos-dlg-btn webos-dlg-btn-primary', () => { shell.close(); resolve(input.value); });
            foot.appendChild(cancel); foot.appendChild(ok); shell.dialog.appendChild(foot);
            shell.overlay.addEventListener('click', (e) => { if (e.target === shell.overlay) { shell.close(); resolve(null); } });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { shell.close(); resolve(input.value); }
                else if (e.key === 'Escape') { shell.close(); resolve(null); }
            });
            document.body.appendChild(shell.overlay);
            setTimeout(() => { input.focus(); input.select(); }, 30);
        });
    }

    static showPasswordDialog(username, onSuccess, onCancel) {
        _ensureCss();
        const shell = Dialogs._buildShell(`访问 ${username} 的目录`);
        const body = document.createElement('div'); body.className = 'webos-dlg-body';
        const desc = document.createElement('div'); desc.style.cssText = 'font-size:13px;color:#888;margin-bottom:16px;'; desc.textContent = '请输入密码以继续访问';
        const input = document.createElement('input'); input.type = 'password'; input.placeholder = '密码'; input.className = 'webos-dlg-input';
        const err = document.createElement('div'); err.className = 'vfs-err';
        body.appendChild(desc); body.appendChild(input); body.appendChild(err); shell.dialog.appendChild(body);
        const foot = document.createElement('div'); foot.className = 'webos-dlg-foot';
        const cancel = Dialogs._btn('取消', 'webos-dlg-btn webos-dlg-btn-default', () => { shell.close(); if (onCancel) onCancel(); });
        const submit = () => {
            const info = Dialogs.getUserInfo(username);
            if (info && info.password === input.value) { shell.close(); if (onSuccess) onSuccess(); }
            else { err.textContent = '密码错误'; input.style.borderColor = '#e74c3c'; }
        };
        const ok = Dialogs._btn('确认', 'webos-dlg-btn webos-dlg-btn-primary', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); else if (e.key === 'Escape') { shell.close(); if (onCancel) onCancel(); } });
        foot.appendChild(cancel); foot.appendChild(ok); shell.dialog.appendChild(foot);
        document.body.appendChild(shell.overlay);
        setTimeout(() => input.focus(), 30);
    }

    static getUserInfo(username) {
        const userManager = UserManager.getInstance();
        const user = userManager.getUser(username);
        if (user) return { username: user.username, password: user.password };
        return null;
    }

    // ─────────────── VFS 文件对话框（层层点击，面包屑 + 双击进入 + 新建文件夹） ───────────────
    /**
     * @param {object} opts
     * @param {'open'|'save'|'folder'} opts.mode
     * @param {string} [opts.title]
     * @param {string} [opts.startPath]
     * @param {string[]} [opts.extensions]
     * @param {string} [opts.defaultFileName]
     * @param {boolean} [opts.canCreateFolder]
     */
    static showVfsFileDialog(opts = {}) {
        _ensureCss();
        const mode = opts.mode || 'open';
        const title = opts.title || (mode === 'open' ? '打开文件' : mode === 'save' ? '另存为' : '选择文件夹');
        const exts = (opts.extensions || []).map(e => String(e).toLowerCase().replace(/^\.+/, ''));
        const extSet = new Set(exts);
        let currentPath = opts.startPath && _getStorage().getNodeByPath(opts.startPath) ? opts.startPath : _defaultStart();

        return new Promise((resolve) => {
            const shell = Dialogs._buildShell(title, 'vfs-dlg');
            shell.dialog.style.minWidth = '';
            let closed = false;
            function close() {
                if (closed) return; closed = true;
                document.removeEventListener('keydown', onKey, true);
                try { document.body.removeChild(shell.overlay); } catch (_) {}
            }

            // toolbar
            const toolbar = document.createElement('div'); toolbar.className = 'vfs-toolbar';
            const upBtn = document.createElement('button'); upBtn.className = 'vfs-tool-btn'; upBtn.innerHTML = '⬆ 上级'; upBtn.title = '回到上级目录 (Backspace)';
            const homeBtn = document.createElement('button'); homeBtn.className = 'vfs-tool-btn'; homeBtn.innerHTML = '🏠 家'; homeBtn.title = '回到当前用户家目录';
            const newFolderBtn = document.createElement('button'); newFolderBtn.className = 'vfs-tool-btn'; newFolderBtn.innerHTML = '📁 新建文件夹';
            if (opts.canCreateFolder === false) newFolderBtn.style.display = 'none';
            if (mode === 'open') newFolderBtn.style.display = 'none';
            const crumbs = document.createElement('div'); crumbs.className = 'vfs-crumbs';
            toolbar.append(upBtn, homeBtn, newFolderBtn, crumbs);
            shell.dialog.appendChild(toolbar);

            // list
            const list = document.createElement('div'); list.className = 'vfs-list';
            shell.dialog.appendChild(list);

            // bottom
            const bottom = document.createElement('div'); bottom.className = 'vfs-bottom';
            const fileRow = document.createElement('div'); fileRow.className = 'vfs-file-row';
            const label = document.createElement('span'); label.className = 'vfs-file-label';
            label.textContent = mode === 'folder' ? '当前文件夹:' : '文件名:';
            const nameInput = document.createElement('input');
            nameInput.type = 'text'; nameInput.className = 'webos-dlg-input';
            nameInput.placeholder = mode === 'save' ? '请输入要保存的文件名' : mode === 'folder' ? '选择一个文件夹' : '选择或键入要打开的文件名';
            if (opts.defaultFileName) nameInput.value = opts.defaultFileName;
            nameInput.style.flex = '1';
            if (mode === 'folder') { nameInput.readOnly = true; nameInput.style.background = '#252525'; }
            fileRow.append(label, nameInput); bottom.appendChild(fileRow);

            const err = document.createElement('div'); err.className = 'vfs-err'; bottom.appendChild(err);
            const actions = document.createElement('div'); actions.className = 'vfs-actions';
            const cancelBtn = Dialogs._btn('取消', 'webos-dlg-btn webos-dlg-btn-default', () => { close(); resolve(null); });
            const okBtn = Dialogs._btn(mode === 'open' ? '打开' : mode === 'save' ? '保存' : '选择',
                                        'webos-dlg-btn webos-dlg-btn-primary', doConfirm);
            actions.append(cancelBtn, okBtn); bottom.appendChild(actions);
            shell.dialog.appendChild(bottom);

            function setErr(s) { err.textContent = s || ''; }
            function isExtAllowed(name) {
                if (extSet.size === 0) return true;
                const dot = name.lastIndexOf('.');
                if (dot === -1) return false;
                return extSet.has(name.slice(dot + 1).toLowerCase());
            }

            function breadcrumbFor(p) {
                crumbs.innerHTML = '';
                const segs = p === '/' ? [] : p.split('/').filter(Boolean);
                const chain = ['/', ...segs];
                let acc = '';
                chain.forEach((seg, idx) => {
                    if (idx > 0) {
                        const sep = document.createElement('span'); sep.className = 'vfs-sep'; sep.textContent = '›';
                        crumbs.appendChild(sep); acc += '/' + seg;
                    } else acc = '/';
                    const crumb = document.createElement('button');
                    crumb.className = 'vfs-crumb' + (idx === chain.length - 1 ? ' vfs-crumb-current' : '');
                    crumb.type = 'button';
                    crumb.textContent = seg === '/' ? ' 根目录 / ' : seg;
                    crumb.addEventListener('click', () => { currentPath = acc || '/'; render(); });
                    crumbs.appendChild(crumb);
                });
            }

            function render() {
                breadcrumbFor(currentPath); setErr(''); list.innerHTML = '';
                const items = _listFolder(currentPath);
                if (!items) {
                    list.appendChild(Object.assign(document.createElement('div'), { className: 'vfs-empty', textContent: '无法访问该目录' }));
                    return;
                }
                const shown = items.filter(it => it.type === 'folder' || isExtAllowed(it.name));
                if (shown.length === 0) {
                    const empty = document.createElement('div'); empty.className = 'vfs-empty';
                    empty.textContent = (mode === 'open' && extSet.size > 0)
                        ? '此目录没有符合类型的文件，双击文件夹进入'
                        : '此目录为空';
                    list.appendChild(empty); return;
                }
                for (const it of shown) {
                    const row = document.createElement('div'); row.className = 'vfs-item'; row.title = it.name;
                    const icon = document.createElement('span'); icon.className = 'vfs-icon';
                    icon.textContent = it.type === 'folder' ? '📁' : Dialogs._iconFor(it.name);
                    const nm = document.createElement('span'); nm.className = 'vfs-name'; nm.textContent = it.name;
                    row.append(icon, nm);
                    if (it.type === 'file') {
                        const sz = document.createElement('span'); sz.className = 'vfs-size';
                        sz.textContent = _formatSize(_approxSize(it.content)); row.appendChild(sz);
                    }
                    const select = (ev) => {
                        if (ev && ev.stopPropagation) ev.stopPropagation();
                        list.querySelectorAll('.vfs-item').forEach(c => c.classList.remove('vfs-item-active'));
                        row.classList.add('vfs-item-active');
                        if (it.type === 'file' || mode === 'folder') nameInput.value = it.name;
                    };
                    row.addEventListener('click', select);
                    row.addEventListener('dblclick', () => {
                        if (it.type === 'folder') {
                            currentPath = currentPath === '/' ? '/' + it.name : currentPath + '/' + it.name;
                            render();
                        } else if (mode === 'open') { select(); doConfirm(); }
                    });
                    list.appendChild(row);
                }
                upBtn.disabled = currentPath === '/';
            }

            function doConfirm() {
                setErr('');
                if (mode === 'folder') { close(); resolve({ folderPath: currentPath, path: currentPath }); return; }
                const name = (nameInput.value || '').trim();
                if (!name) { setErr(mode === 'save' ? '请输入要保存的文件名' : '请选择或输入要打开的文件名'); return; }
                if (name.indexOf('/') !== -1) { setErr('文件名不能包含 "/"'); return; }
                if (name === '.' || name === '..') { setErr('文件名非法'); return; }
                const folderNode = _getStorage().getNodeByPath(currentPath);
                if (!folderNode || folderNode.type !== 'folder') { setErr('当前目录无效'); return; }
                const absPath = currentPath === '/' ? '/' + name : currentPath + '/' + name;
                if (mode === 'open') {
                    const child = (folderNode.children || []).find(c => c.name === name);
                    if (!child) { setErr(`文件 "${name}" 不存在`); return; }
                    if (child.type !== 'file') { setErr(`"${name}" 是文件夹，请双击进入`); return; }
                    if (!isExtAllowed(child.name)) { setErr(`不支持的文件类型`); return; }
                    close(); resolve({ folderPath: currentPath, fileName: name, path: absPath });
                } else {
                    const same = (folderNode.children || []).find(c => c.name === name);
                    if (same && same.type === 'folder') { setErr(`已存在同名文件夹 "${name}"`); return; }
                    close(); resolve({ folderPath: currentPath, fileName: name, path: absPath, overwriting: !!(same && same.type === 'file') });
                }
            }

            upBtn.addEventListener('click', () => {
                if (currentPath === '/') return;
                const i = currentPath.lastIndexOf('/');
                currentPath = i === 0 ? '/' : currentPath.slice(0, i);
                render();
            });
            homeBtn.addEventListener('click', () => { const p = _defaultStart(); if (p) { currentPath = p; render(); } });
            newFolderBtn.addEventListener('click', async () => {
                const nm = await Dialogs.showPrompt('输入新文件夹名称：', '新建文件夹', '新建文件夹');
                if (nm == null) return;
                const name = String(nm).trim();
                if (!name) return;
                if (name.indexOf('/') !== -1 || name === '.' || name === '..') { setErr('文件夹名称非法'); return; }
                const storage = _getStorage();
                const folder = storage.getNodeByPath(currentPath);
                if (!folder || folder.type !== 'folder') { setErr('当前目录无效'); return; }
                if (!folder.children) folder.children = [];
                if (folder.children.find(c => c.name === name)) { setErr(`已存在 "${name}"`); render(); return; }
                folder.children.push({ type: 'folder', name, children: [] });
                storage.saveFS(); render();
            });

            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); doConfirm(); }
                else if (e.key === 'Escape') { close(); resolve(null); }
            });
            shell.overlay.addEventListener('click', (e) => { if (e.target === shell.overlay) { close(); resolve(null); } });

            function onKey(e) {
                if (!document.body.contains(shell.overlay)) { document.removeEventListener('keydown', onKey, true); return; }
                const ae = document.activeElement;
                if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
                if (e.key === 'Backspace') { e.preventDefault(); upBtn.click(); }
            }
            document.addEventListener('keydown', onKey, true);

            document.body.appendChild(shell.overlay);
            render();
            setTimeout(() => {
                if (mode !== 'folder') { nameInput.focus(); try { nameInput.select(); } catch (_) {} }
                else okBtn.focus();
            }, 40);
        });
    }

    static showOpenFileDialog(opts = {})   { return Dialogs.showVfsFileDialog({ ...opts, mode: 'open' }); }
    static showSaveFileDialog(opts = {})   { return Dialogs.showVfsFileDialog({ ...opts, mode: 'save', canCreateFolder: true }); }
    static showSelectFolderDialog(opts = {}) { return Dialogs.showVfsFileDialog({ ...opts, mode: 'folder', canCreateFolder: true }); }

    static _iconFor(name) {
        const ext = (name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');
        const map = {
            txt:'📄', md:'📝', json:'🧾', js:'💛', ts:'💙', css:'🎨', html:'🌐', xml:'📋', csv:'📊', log:'📜',
            sh:'🖥️', py:'🐍', java:'☕', c:'🔧', cpp:'🔧', h:'🔧', yml:'🧾', yaml:'🧾', ini:'⚙️', cfg:'⚙️', bat:'🪟',
            png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🖼️', webp:'🖼️', svg:'🖼️', bmp:'🖼️',
            mp4:'🎞️', webm:'🎞️', ogg:'🎧', mp3:'🎵', wav:'🎵', flac:'🎵',
            zip:'🗜️', rar:'🗜️', '7z':'🗜️', gz:'🗜️', app:'🧩'
        };
        return map[ext] || '📄';
    }

    static _btn(text, cls, onClick) {
        const b = document.createElement('button'); b.className = cls; b.textContent = text;
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }

    static _buildShell(title, extraDlgClass = '') {
        const overlay = document.createElement('div'); overlay.className = 'webos-dlg-overlay';
        const dialog = document.createElement('div');
        dialog.className = 'webos-dlg' + (extraDlgClass ? ' ' + extraDlgClass : '');
        dialog.style.minWidth = '320px';
        const titleEl = document.createElement('div'); titleEl.className = 'webos-dlg-title'; titleEl.textContent = title;
        dialog.appendChild(titleEl); overlay.appendChild(dialog);
        function close() { try { document.body.removeChild(overlay); } catch (_) {} }
        return { overlay, dialog, close, titleEl };
    }
}

// 暴露给 iframe 应用：window.parent.Dialogs.showOpenFileDialog(...)
if (typeof window !== 'undefined') window.Dialogs = Dialogs;

export default Dialogs;
