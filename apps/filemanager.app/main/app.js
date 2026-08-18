const FOLDER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#f1c40f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#95a5a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

class FileManager {
    constructor() {
        this.pathStack = [];
        this.authorizedUsers = new Set();
        this.clipboard = null;
        this.clipboardAction = null;
        this.strings = {};

        this.filelistEl = document.getElementById('fm-filelist');
        this.pathEl = document.getElementById('fm-path');
        this.viewerEl = document.getElementById('fm-viewer');
        this.viewerTitleEl = document.getElementById('fm-viewer-title');
        this.viewerContentEl = document.getElementById('fm-viewer-content');

        this.storage = window.parent.StorageService.getInstance();

        this.initEvents();
        this.loadLanguage().then(() => {
            this.applyLanguage();
            this.render();
        });
    }

    async loadLanguage() {
        const lang = localStorage.getItem('webos-language') || 'cmn';
        const langFiles = { cmn: '/languages/cmn.json', eng: '/languages/eng.json', jpn: '/languages/jpn.json' };
        try {
            const res = await fetch(langFiles[lang] || langFiles.cmn);
            const data = await res.json();
            this.strings = data.strings || {};
        } catch (e) {
            this.strings = {};
        }
        try {
            if (window.parent && window.parent !== window) {
                window.parent.document.addEventListener('language-changed', (e) => {
                    if (e.detail && e.detail.strings) {
                        this.strings = e.detail.strings;
                    }
                    this.applyLanguage();
                    this.render();
                });
            }
        } catch (e) {}
    }

    t(key, fallback) {
        return this.strings[key] !== undefined ? this.strings[key] : (fallback || key);
    }

    applyLanguage() {
        const sidebarTitle = document.querySelector('.fm-sidebar-title');
        if (sidebarTitle) sidebarTitle.textContent = this.t('filemanager.nav', '导航');

        const filesItem = document.getElementById('fm-sidebar-files');
        if (filesItem) {
            const svg = filesItem.querySelector('svg');
            filesItem.innerHTML = '';
            if (svg) filesItem.appendChild(svg);
            filesItem.appendChild(document.createTextNode(' ' + this.t('filemanager.files', '文件')));
        }
        const networkItem = document.getElementById('fm-sidebar-network');
        if (networkItem) {
            const svg = networkItem.querySelector('svg');
            networkItem.innerHTML = '';
            if (svg) networkItem.appendChild(svg);
            networkItem.appendChild(document.createTextNode(' ' + this.t('filemanager.network', 'LAN Drop')));
        }

        document.getElementById('fm-back').title = this.t('filemanager.back', '返回上级');
        document.getElementById('fm-home').title = this.t('filemanager.home', '根目录');
        document.getElementById('fm-refresh').title = this.t('filemanager.refresh', '刷新');
        document.getElementById('fm-new-folder').title = this.t('filemanager.new_folder', '新建文件夹');
        document.getElementById('fm-new-file').title = this.t('filemanager.new_file', '新建文件');
        document.getElementById('fm-upload').title = this.t('filemanager.upload', '上传文件');
        document.getElementById('fm-paste').title = this.t('filemanager.paste', '粘贴');

        const viewerClose = document.getElementById('fm-viewer-close');
        if (viewerClose) viewerClose.textContent = this.t('common.close', '关闭');
    }

    get root() { return this.storage.fs; }

    get currentDir() {
        if (this.pathStack.length === 0) return this.root;
        let node = this.root;
        for (const part of this.pathStack) {
            if (node.children) {
                const child = node.children.find(c => c.name === part && c.type === 'folder');
                if (child) node = child;
            }
        }
        return node;
    }

    showAlert(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            title.textContent = this.t('common.alert', '提示');
            dialog.appendChild(title);
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            const okBtn = document.createElement('button');
            okBtn.textContent = this.t('common.ok', '确定');
            okBtn.style.cssText = 'padding:8px 24px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            okBtn.addEventListener('mouseenter', () => { okBtn.style.background = '#2980b9'; });
            okBtn.addEventListener('mouseleave', () => { okBtn.style.background = '#3498db'; });
            okBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(); });
            dialog.appendChild(okBtn);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            setTimeout(() => okBtn.focus(), 50);
        });
    }

    showConfirm(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            title.textContent = this.t('common.confirm', '确认');
            dialog.appendChild(title);
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = this.t('common.cancel', '取消');
            cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
            cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
            cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
            cancelBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(false); });
            btnContainer.appendChild(cancelBtn);
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = this.t('common.ok', '确定');
            confirmBtn.style.cssText = 'padding:8px 16px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = '#2980b9'; });
            confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = '#3498db'; });
            confirmBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(true); });
            btnContainer.appendChild(confirmBtn);
            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            setTimeout(() => confirmBtn.focus(), 50);
        });
    }

    showPrompt(message, defaultValue = '') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            title.textContent = this.t('common.prompt', '输入');
            dialog.appendChild(title);
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:12px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            const input = document.createElement('input');
            input.type = 'text';
            input.value = defaultValue;
            input.style.cssText = 'width:100%;padding:10px 12px;background:#1e1e1e;border:1px solid #3d3d3d;border-radius:4px;color:#ddd;font-size:13px;font-family:inherit;margin-bottom:12px;outline:none;';
            input.addEventListener('focus', () => { input.style.borderColor = '#3498db'; });
            input.addEventListener('blur', () => { input.style.borderColor = '#3d3d3d'; });
            dialog.appendChild(input);
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = this.t('common.cancel', '取消');
            cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
            cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
            cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
            cancelBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(null); });
            btnContainer.appendChild(cancelBtn);
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = this.t('common.ok', '确定');
            confirmBtn.style.cssText = 'padding:8px 16px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = '#2980b9'; });
            confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = '#3498db'; });
            confirmBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(input.value); });
            btnContainer.appendChild(confirmBtn);
            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            setTimeout(() => { input.focus(); input.select(); }, 50);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { document.body.removeChild(overlay); resolve(input.value); }
                else if (e.key === 'Escape') { document.body.removeChild(overlay); resolve(null); }
            });
        });
    }

    loadFS() { this.pathStack = []; }
    saveFS() { if (window.parent._isSavingDisabled) return; this.storage.saveFS(); }

    initEvents() {
        document.getElementById('fm-back').addEventListener('click', () => this.goUp());
        document.getElementById('fm-home').addEventListener('click', () => this.goRoot());
        document.getElementById('fm-refresh').addEventListener('click', () => {
            const currentPath = this.getCurrentPath();
            this.loadFS();
            this.navigateToPath(currentPath);
        });
        document.getElementById('fm-viewer-close').addEventListener('click', () => { this.viewerEl.style.display = 'none'; });
        document.getElementById('fm-new-folder').addEventListener('click', () => this.createFolder());
        document.getElementById('fm-new-file').addEventListener('click', () => this.createFile());
        document.getElementById('fm-upload').addEventListener('click', () => this.uploadFile());
        document.getElementById('fm-paste').addEventListener('click', () => this.pasteFile());
        document.getElementById('fm-sidebar-files').addEventListener('click', () => { this.switchToFiles(); });
        document.getElementById('fm-sidebar-network').addEventListener('click', () => { this.switchToNetwork(); });
        this.initLANDropEvents();
    }

    switchToFiles() {
        document.getElementById('fm-sidebar-files').classList.add('active');
        document.getElementById('fm-sidebar-network').classList.remove('active');
        document.getElementById('fm-filelist').style.display = 'flex';
        document.getElementById('fm-network-panel').style.display = 'none';
        this.render();
    }

    switchToNetwork() {
        document.getElementById('fm-sidebar-network').classList.add('active');
        document.getElementById('fm-sidebar-files').classList.remove('active');
        document.getElementById('fm-filelist').style.display = 'none';
        document.getElementById('fm-network-panel').style.display = 'flex';
        this.initLANDrop();
    }

    initLANDropEvents() {
        document.getElementById('fm-landrop-mode-send').addEventListener('click', () => this.switchLANDropMode('send'));
        document.getElementById('fm-landrop-mode-recv').addEventListener('click', () => this.switchLANDropMode('recv'));
        document.getElementById('fm-landrop-pick').addEventListener('click', () => { document.getElementById('fm-landrop-file-input').click(); });
        document.getElementById('fm-landrop-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.onSendFilePicked(file);
            e.target.value = '';
        });
        document.getElementById('fm-landrop-pick-fs').addEventListener('click', () => this.openFSPicker());
        document.getElementById('fm-fs-picker-close').addEventListener('click', () => this.closeFSPicker());
        document.getElementById('fm-fs-picker-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'fm-fs-picker-overlay') this.closeFSPicker();
        });
        document.getElementById('fm-landrop-copy-offer').addEventListener('click', () => this.onCopyOffer());
        document.getElementById('fm-landrop-confirm-answer').addEventListener('click', () => this.onConfirmAnswer());
        document.getElementById('fm-landrop-gen-answer').addEventListener('click', () => this.onGenAnswer());
        document.getElementById('fm-landrop-copy-answer').addEventListener('click', () => this.onCopyAnswer());
        document.getElementById('fm-landrop-save-fs').addEventListener('click', () => this.saveReceivedToFS());
        document.getElementById('fm-landrop-download').addEventListener('click', () => this.downloadReceived());
    }

    initLANDrop() {
        if (this.landropInited) return;
        this.landropInited = true;
        let name = 'WebOS用户';
        try {
            const userManager = window.parent.UserManager;
            if (userManager) {
                const instance = userManager.getInstance();
                const currentUser = instance.getCurrentUser();
                if (currentUser && currentUser.name) name = currentUser.name;
            }
        } catch (e) {}
        this.myId = 'dev-' + Math.random().toString(36).slice(2, 10);
        this.myName = name;
        this.devices = new Map();
        this.role = null;
        this.pendingFile = null;
        this.pc = null;
        this.channel = null;
        this.sendingFile = null;
        this.sentSize = 0;
        this.recvMeta = null;
        this.recvChunks = null;
        this.recvSize = 0;
        this.recvDone = false;
        this.receivedBlob = null;
        this.receivedFileName = null;
        this.switchLANDropMode('send');
        try {
            this.bc = new BroadcastChannel('landrop');
            this.bc.onmessage = (e) => this.handleBCMessage(e.data);
            this.bc.postMessage({ type: 'hello', id: this.myId, name: this.myName });
        } catch (err) { this.bc = null; }
        window.addEventListener('beforeunload', () => this.cleanupLANDrop());
        window.addEventListener('pagehide', () => this.cleanupLANDrop());
        this.renderDevices();
    }

    cleanupLANDrop() {
        try { if (this.bc) { this.bc.postMessage({ type: 'bye', id: this.myId }); this.bc.close(); this.bc = null; } } catch (e) {}
        try { if (this.pc) this.pc.close(); } catch (e) {}
    }

    handleBCMessage(msg) {
        if (!msg) return;
        switch (msg.type) {
            case 'hello':
                if (msg.id === this.myId) return;
                this.devices.set(msg.id, { id: msg.id, name: msg.name });
                if (this.bc) this.bc.postMessage({ type: 'presence', id: this.myId, name: this.myName });
                this.renderDevices();
                break;
            case 'presence':
                if (msg.id === this.myId) return;
                this.devices.set(msg.id, { id: msg.id, name: msg.name });
                this.renderDevices();
                break;
            case 'bye':
                if (msg.id === this.myId) return;
                this.devices.delete(msg.id);
                this.renderDevices();
                break;
            case 'offer':
                if (msg.target === this.myId) this.handleIncomingOffer(msg.from, msg.offer);
                break;
            case 'answer':
                if (msg.target === this.myId) this.handleIncomingAnswer(msg.from, msg.answer);
                break;
        }
    }

    renderDevices() {
        const container = document.getElementById('fm-landrop-devices');
        if (!container) return;
        if (!this.devices || this.devices.size === 0) {
            container.innerHTML = '<div class="fm-landrop-empty">暂无同浏览器标签页。在另一个标签页打开文件管理器即可自动发现。<br>跨设备传输请使用上方连接码交换。</div>';
            return;
        }
        container.innerHTML = '';
        this.devices.forEach((dev) => {
            const el = document.createElement('div');
            el.className = 'fm-landrop-device';
            const initial = (dev.name || '?').charAt(0).toUpperCase();
            el.innerHTML = '<div class="fm-landrop-device-icon">' + this.escapeHtml(initial) + '</div>' +
                '<div class="fm-landrop-device-name">' + this.escapeHtml(dev.name) + '</div>' +
                '<div class="fm-landrop-device-hint">点击发送文件</div>';
            el.addEventListener('click', () => this.connectToDevice(dev.id, dev.name));
            container.appendChild(el);
        });
    }

    escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    switchLANDropMode(mode) {
        this.landropMode = mode;
        document.getElementById('fm-landrop-mode-send').classList.toggle('active', mode === 'send');
        document.getElementById('fm-landrop-mode-recv').classList.toggle('active', mode === 'recv');
        document.getElementById('fm-landrop-send').style.display = mode === 'send' ? 'block' : 'none';
        document.getElementById('fm-landrop-recv').style.display = mode === 'recv' ? 'block' : 'none';
    }

    encodeSDP(sdp) { return btoa(encodeURIComponent(JSON.stringify(sdp))); }
    decodeSDP(code) { return JSON.parse(decodeURIComponent(atob(code))); }

    waitForIce(pc) {
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') { resolve(); return; }
            const check = () => {
                if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); }
            };
            pc.addEventListener('icegatheringstatechange', check);
            setTimeout(() => { pc.removeEventListener('icegatheringstatechange', check); resolve(); }, 5000);
        });
    }

    resetConnection() {
        try { if (this.channel) this.channel.close(); } catch (e) {}
        try { if (this.pc) this.pc.close(); } catch (e) {}
        this.pc = null; this.channel = null; this.role = null;
        this.recvMeta = null; this.recvChunks = null; this.recvSize = 0; this.recvDone = false;
        this.sentSize = 0; this.sendingFile = null;
        this.receivedBlob = null; this.receivedFileName = null;
        const actions = document.getElementById('fm-landrop-recv-actions');
        if (actions) actions.style.display = 'none';
    }

    setupChannel(channel) {
        channel.binaryType = 'arraybuffer';
        channel.onopen = () => this.onChannelOpen(channel);
        channel.onmessage = (e) => this.onChannelMessage(channel, e.data);
        channel.onclose = () => this.onChannelClose();
        channel.onerror = () => this.onChannelClose();
    }

    async createSenderConnection() {
        this.resetConnection();
        this.role = 'sender';
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
        const channel = pc.createDataChannel('file', { ordered: true });
        this.setupChannel(channel);
        this.pc = pc; this.channel = channel;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.waitForIce(pc);
        return this.encodeSDP(pc.localDescription);
    }

    async acceptSenderConnection(offerCode) {
        this.resetConnection();
        this.role = 'receiver';
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
        pc.ondatachannel = (e) => { this.channel = e.channel; this.setupChannel(e.channel); };
        this.pc = pc;
        const offer = this.decodeSDP(offerCode);
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.waitForIce(pc);
        return this.encodeSDP(pc.localDescription);
    }

    async acceptAnswer(answerCode) {
        if (!this.pc) throw new Error('未建立连接');
        const answer = this.decodeSDP(answerCode);
        await this.pc.setRemoteDescription(answer);
    }

    onChannelOpen(channel) {
        if (this.role === 'sender' && this.pendingFile) { this.showSendStatus('连接已建立，开始发送...'); this.sendFile(this.pendingFile); }
        else if (this.role === 'receiver') { this.showRecvStatus('连接已建立，等待接收文件...'); }
    }

    onChannelClose() {
        if (this.role === 'sender') this.showSendStatus('连接已关闭');
        else if (this.role === 'receiver') this.showRecvStatus('连接已关闭');
    }

    onChannelMessage(channel, data) {
        if (typeof data === 'string') {
            let msg;
            try { msg = JSON.parse(data); } catch (e) { return; }
            if (msg.type === 'file-meta') {
                this.recvMeta = msg; this.recvChunks = []; this.recvSize = 0; this.recvDone = false;
                this.receivedBlob = null; this.receivedFileName = msg.name;
                const actions = document.getElementById('fm-landrop-recv-actions');
                if (actions) actions.style.display = 'none';
                this.showRecvProgress();
                this.showRecvStatus('正在接收：' + msg.name);
            }
        } else {
            if (!this.recvMeta || this.recvDone) return;
            this.recvChunks.push(data);
            this.recvSize += data.byteLength;
            this.updateRecvProgress();
            if (this.recvSize >= this.recvMeta.size) this.finishReceive();
        }
    }

    collectFSFiles(node, path, results) {
        if (!node) return;
        if (!node.children) return;
        for (const child of node.children) {
            const childPath = path + '/' + child.name;
            if (child.type === 'file') { results.push({ name: child.name, path: childPath, content: child.content }); }
            else if (child.type === 'folder' && child.children) { this.collectFSFiles(child, childPath, results); }
        }
    }

    openFSPicker() {
        const overlay = document.getElementById('fm-fs-picker-overlay');
        const list = document.getElementById('fm-fs-picker-list');
        if (!overlay || !list) return;
        const files = [];
        this.collectFSFiles(this.storage.fs, '', files);
        if (files.length === 0) {
            list.innerHTML = '<div style="padding:24px;text-align:center;color:#666;">文件系统中暂无文件</div>';
        } else {
            list.innerHTML = '';
            files.forEach((f) => {
                const item = document.createElement('div');
                item.className = 'fm-fs-picker-item';
                let sizeStr = '';
                if (f.content && f.content.startsWith('data:')) {
                    const base64 = f.content.split(',')[1] || '';
                    sizeStr = this.formatSize(Math.ceil(base64.length * 0.75));
                }
                item.innerHTML = '<span class="fm-fs-picker-name">' + this.escapeHtml(f.name) + '</span>' +
                    '<span class="fm-fs-picker-path">' + this.escapeHtml(f.path) + '</span>' +
                    '<span class="fm-fs-picker-size">' + sizeStr + '</span>';
                item.addEventListener('click', () => { this.closeFSPicker(); this.pickFSFile(f); });
                list.appendChild(item);
            });
        }
        overlay.style.display = 'flex';
    }

    closeFSPicker() {
        const overlay = document.getElementById('fm-fs-picker-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    async pickFSFile(fileObj) {
        try {
            const dataURL = fileObj.content;
            if (!dataURL || !dataURL.startsWith('data:')) { this.showSendStatus('无法读取文件内容'); return; }
            const res = await fetch(dataURL);
            const blob = await res.blob();
            const file = new File([blob], fileObj.name, { type: blob.type || 'application/octet-stream' });
            this.onSendFilePicked(file);
        } catch (e) { this.showSendStatus('读取文件失败：' + e.message); }
    }

    async onSendFilePicked(file) {
        this.pendingFile = file;
        document.getElementById('fm-landrop-offer-code').value = '';
        document.getElementById('fm-landrop-answer-input').value = '';
        document.getElementById('fm-landrop-send-progress').style.display = 'none';
        this.showSendStatus('正在生成连接码...');
        try {
            const offerCode = await this.createSenderConnection();
            document.getElementById('fm-landrop-offer-code').value = offerCode;
            this.showSendStatus('连接码已生成，请发送给接收方并等待应答码');
        } catch (e) { this.showSendStatus('生成连接码失败：' + e.message); }
    }

    async onCopyOffer() {
        const code = document.getElementById('fm-landrop-offer-code').value;
        if (!code) { await this.showAlert('暂无连接码'); return; }
        await this.copyText(code);
        this.showSendStatus('连接码已复制到剪贴板');
    }

    async onConfirmAnswer() {
        const code = document.getElementById('fm-landrop-answer-input').value.trim();
        if (!code) { await this.showAlert('请粘贴应答码'); return; }
        if (!this.pc) { await this.showAlert('请先生成连接码'); return; }
        try { await this.acceptAnswer(code); this.showSendStatus('应答码已确认，等待连接建立...'); }
        catch (e) { await this.showAlert('应答码无效：' + e.message); }
    }

    async onGenAnswer() {
        const code = document.getElementById('fm-landrop-offer-input').value.trim();
        if (!code) { await this.showAlert('请粘贴连接码'); return; }
        document.getElementById('fm-landrop-answer-code').value = '';
        document.getElementById('fm-landrop-recv-progress').style.display = 'none';
        const actions = document.getElementById('fm-landrop-recv-actions');
        if (actions) actions.style.display = 'none';
        this.showRecvStatus('正在生成应答码...');
        try {
            const answerCode = await this.acceptSenderConnection(code);
            document.getElementById('fm-landrop-answer-code').value = answerCode;
            this.showRecvStatus('应答码已生成，请回传给发送方');
        } catch (e) { this.showRecvStatus('连接码无效：' + e.message); }
    }

    async onCopyAnswer() {
        const code = document.getElementById('fm-landrop-answer-code').value;
        if (!code) { await this.showAlert('暂无应答码'); return; }
        await this.copyText(code);
        this.showRecvStatus('应答码已复制到剪贴板');
    }

    async connectToDevice(deviceId, deviceName) {
        if (!this.pendingFile) { await this.showAlert('请先在「发送文件」模式中选择要发送的文件'); this.switchLANDropMode('send'); return; }
        if (!this.bc) { await this.showAlert('BroadcastChannel 不可用'); return; }
        this.showSendStatus('正在向 ' + deviceName + ' 发起连接...');
        try {
            const offerCode = await this.createSenderConnection();
            this.bc.postMessage({ type: 'offer', target: deviceId, from: this.myId, offer: offerCode });
            this.showSendStatus('连接码已发送给 ' + deviceName + '，等待应答...');
        } catch (e) { this.showSendStatus('发起连接失败：' + e.message); }
    }

    async handleIncomingOffer(fromId, offerCode) {
        this.showRecvStatus('收到连接请求，正在应答...');
        try {
            const answerCode = await this.acceptSenderConnection(offerCode);
            if (this.bc) this.bc.postMessage({ type: 'answer', target: fromId, from: this.myId, answer: answerCode });
            this.showRecvStatus('已应答，等待连接建立...');
        } catch (e) { this.showRecvStatus('处理连接请求失败：' + e.message); }
    }

    async handleIncomingAnswer(fromId, answerCode) {
        if (!this.pc) return;
        try { await this.acceptAnswer(answerCode); this.showSendStatus('收到应答，等待连接建立...'); }
        catch (e) { this.showSendStatus('应答码无效：' + e.message); }
    }

    async sendFile(file) {
        if (!this.channel || this.channel.readyState !== 'open') { this.showSendStatus('连接未就绪'); return; }
        this.sendingFile = file; this.sentSize = 0;
        this.showSendProgress();
        const meta = { type: 'file-meta', name: file.name, size: file.size, mime: file.type || 'application/octet-stream' };
        this.channel.send(JSON.stringify(meta));
        const chunkSize = 16384;
        const buffer = await file.arrayBuffer();
        let offset = 0; let count = 0;
        while (offset < buffer.byteLength) {
            if (!this.channel || this.channel.readyState !== 'open') { this.showSendStatus('连接已断开'); return; }
            if (this.channel.bufferedAmount > 8 * 1024 * 1024) { await new Promise(r => setTimeout(r, 20)); continue; }
            const end = Math.min(offset + chunkSize, buffer.byteLength);
            this.channel.send(buffer.slice(offset, end));
            offset = end; this.sentSize = offset; count++;
            this.updateSendProgress();
            if (count % 16 === 0) await new Promise(r => setTimeout(r, 0));
        }
        this.showSendStatus('发送完成：' + file.name);
    }

    finishReceive() {
        if (this.recvDone) return;
        this.recvDone = true;
        const blob = new Blob(this.recvChunks, { type: (this.recvMeta.mime || 'application/octet-stream') });
        this.receivedBlob = blob; this.receivedFileName = this.recvMeta.name;
        const el = document.getElementById('fm-landrop-recv-progress');
        if (el) {
            const fill = el.querySelector('.fm-landrop-progress-fill');
            const text = el.querySelector('.fm-landrop-progress-text');
            if (fill) fill.style.width = '100%';
            if (text) text.textContent = '接收完成：' + this.receivedFileName + '（' + this.formatSize(this.recvMeta.size) + '）';
        }
        const actions = document.getElementById('fm-landrop-recv-actions');
        if (actions) actions.style.display = 'flex';
        this.showRecvStatus('文件接收完成，可选择保存或下载');
    }

    saveReceivedToFS() {
        if (!this.receivedBlob) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataURL = reader.result;
            if (!this.currentDir.children) this.currentDir.children = [];
            let name = this.receivedFileName || 'received';
            const existing = this.currentDir.children.find(c => c.name === name && c.type === 'file');
            if (existing) {
                const dot = name.lastIndexOf('.');
                const base = dot > 0 ? name.substring(0, dot) : name;
                const ext = dot > 0 ? name.substring(dot) : '';
                let i = 1;
                while (this.currentDir.children.find(c => c.name === base + '(' + i + ')' + ext)) i++;
                name = base + '(' + i + ')' + ext;
            }
            this.currentDir.children.push({ type: 'file', name: name, content: dataURL });
            this.saveFS();
            this.showRecvStatus('已保存到当前目录：' + name);
        };
        reader.onerror = () => this.showRecvStatus('保存失败：读取文件出错');
        reader.readAsDataURL(this.receivedBlob);
    }

    downloadReceived() {
        if (!this.receivedBlob) return;
        const url = URL.createObjectURL(this.receivedBlob);
        const a = document.createElement('a');
        a.href = url; a.download = this.receivedFileName || 'received';
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }

    showSendStatus(text) { const el = document.getElementById('fm-landrop-send-status'); if (el) el.textContent = text; }
    showRecvStatus(text) { const el = document.getElementById('fm-landrop-recv-status'); if (el) el.textContent = text; }

    showSendProgress() {
        const el = document.getElementById('fm-landrop-send-progress');
        el.style.display = 'block';
        el.innerHTML = '<div class="fm-landrop-progress-text"></div><div class="fm-landrop-progress-bar"><div class="fm-landrop-progress-fill"></div></div>';
        this.updateSendProgress();
    }

    updateSendProgress() {
        const el = document.getElementById('fm-landrop-send-progress');
        if (!el || !this.sendingFile) return;
        const pct = this.sendingFile.size > 0 ? Math.min(100, Math.floor(this.sentSize * 100 / this.sendingFile.size)) : 100;
        const text = el.querySelector('.fm-landrop-progress-text');
        const fill = el.querySelector('.fm-landrop-progress-fill');
        if (text) text.textContent = '发送中：' + this.formatSize(this.sentSize) + ' / ' + this.formatSize(this.sendingFile.size) + '（' + pct + '%）';
        if (fill) fill.style.width = pct + '%';
    }

    showRecvProgress() {
        const el = document.getElementById('fm-landrop-recv-progress');
        el.style.display = 'block';
        el.innerHTML = '<div class="fm-landrop-progress-text"></div><div class="fm-landrop-progress-bar"><div class="fm-landrop-progress-fill"></div></div>';
        this.updateRecvProgress();
    }

    updateRecvProgress() {
        const el = document.getElementById('fm-landrop-recv-progress');
        if (!el || !this.recvMeta) return;
        const pct = this.recvMeta.size > 0 ? Math.min(100, Math.floor(this.recvSize * 100 / this.recvMeta.size)) : 100;
        const text = el.querySelector('.fm-landrop-progress-text');
        const fill = el.querySelector('.fm-landrop-progress-fill');
        if (text) text.textContent = '接收中：' + this.formatSize(this.recvSize) + ' / ' + this.formatSize(this.recvMeta.size) + '（' + pct + '%）';
        if (fill) fill.style.width = pct + '%';
    }

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }

    async copyText(text) {
        try { await navigator.clipboard.writeText(text); }
        catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch (e2) {}
            document.body.removeChild(ta);
        }
    }

    getCurrentPath() { if (this.pathStack.length === 0) return '/'; return '/' + this.pathStack.join('/'); }

    navigateToPath(pathStr) {
        this.loadFS();
        if (!pathStr || pathStr === '/') { this.pathStack = []; }
        else {
            const parts = pathStr.split('/').filter(p => p);
            let node = this.root;
            for (const part of parts) {
                if (node.children) {
                    const child = node.children.find(c => c.name === part && c.type === 'folder');
                    if (child) { node = child; } else { return; }
                }
            }
            this.pathStack = parts;
        }
        this.render();
    }

    goUp() { if (this.pathStack.length === 0) return; this.pathStack.pop(); this.render(); }
    goRoot() { this.loadFS(); this.pathStack = []; this.render(); }

    getCurrentUsername() {
        const userManager = window.parent.UserManager.getInstance();
        const user = userManager.getCurrentUser();
        return user ? user.username : 'public';
    }

    getUserInfo(username) {
        const userManager = window.parent.UserManager.getInstance();
        return userManager.getUser(username);
    }

    showPasswordDialog(username) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:16px;color:#eee;';
            title.textContent = `访问 ${username} 的目录`;
            dialog.appendChild(title);
            const desc = document.createElement('div');
            desc.style.cssText = 'font-size:13px;color:#888;margin-bottom:16px;';
            desc.textContent = '请输入密码以继续访问';
            dialog.appendChild(desc);
            const input = document.createElement('input');
            input.type = 'password'; input.placeholder = '密码';
            input.style.cssText = 'width:100%;padding:10px 12px;background:#1e1e1e;border:1px solid #3d3d3d;border-radius:4px;color:#ddd;font-size:13px;font-family:inherit;margin-bottom:8px;outline:none;';
            input.addEventListener('focus', () => { input.style.borderColor = '#3498db'; });
            input.addEventListener('blur', () => { input.style.borderColor = '#3d3d3d'; });
            dialog.appendChild(input);
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = 'color:#e74c3c;font-size:12px;margin-bottom:16px;min-height:16px;';
            dialog.appendChild(errorMsg);
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = this.t('common.cancel', '取消');
            cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
            cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
            cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
            cancelBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(false); });
            btnContainer.appendChild(cancelBtn);
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = this.t('common.ok', '确定');
            confirmBtn.style.cssText = 'padding:8px 16px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = '#2980b9'; });
            confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = '#3498db'; });
            const submit = () => {
                const userInfo = this.getUserInfo(username);
                if (userInfo && userInfo.password === input.value) {
                    this.authorizedUsers.add(username);
                    document.body.removeChild(overlay); resolve(true);
                } else { errorMsg.textContent = '密码错误'; input.style.borderColor = '#e74c3c'; }
            };
            confirmBtn.addEventListener('click', submit);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
            btnContainer.appendChild(confirmBtn);
            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            setTimeout(() => input.focus(), 50);
        });
    }

    getOwnerOfCurrentPath() {
        const path = this.getCurrentPath();
        if (path.startsWith('/user/')) {
            const parts = path.split('/');
            if (parts.length >= 3) return parts[2];
        }
        return null;
    }

    async checkPermissionForAction() {
        const owner = this.getOwnerOfCurrentPath();
        if (!owner) return true;
        const currentUser = this.getCurrentUsername();
        if (owner === currentUser) return true;
        if (this.authorizedUsers.has(owner)) return true;
        const userInfo = this.getUserInfo(owner);
        if (!userInfo || !userInfo.password) return true;
        return await this.showPasswordDialog(owner);
    }

    async openFolder(folder) {
        const path = this.getCurrentPath();
        if (path === '/' || path === '/user') {
            const allowed = await this.checkFolderPermission(folder.name);
            if (!allowed) return;
        } else {
            const allowed = await this.checkPermissionForAction();
            if (!allowed) return;
        }
        const currentPath = this.getCurrentPath();
        this.loadFS();
        const targetPath = currentPath === '/' ? `/${folder.name}` : `${currentPath}/${folder.name}`;
        this.navigateToPath(targetPath);
    }

    async checkFolderPermission(folderName) {
        const currentPath = this.getCurrentPath();
        if (currentPath !== '/user') return true;
        const currentUser = this.getCurrentUsername();
        if (folderName === currentUser) return true;
        if (this.authorizedUsers.has(folderName)) return true;
        const userInfo = this.getUserInfo(folderName);
        if (!userInfo || !userInfo.password) return true;
        return await this.showPasswordDialog(folderName);
    }

    getFileType(name) {
        const ext = name.split('.').pop().toLowerCase();
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
        const videoExts = ['mp4', 'webm', 'ogg'];
        const audioExts = ['mp3', 'wav', 'flac'];
        const textExts = ['txt', 'md', 'js', 'css', 'html', 'json', 'py', 'java', 'c', 'cpp', 'h', 'sh', 'yaml', 'yml', 'xml'];
        if (imageExts.includes(ext)) return 'image';
        if (videoExts.includes(ext)) return 'video';
        if (audioExts.includes(ext)) return 'audio';
        if (textExts.includes(ext)) return 'text';
        return 'other';
    }

    async openFile(file) {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;
        const filePath = this.getCurrentPath() === '/' ? `/${file.name}` : `${this.getCurrentPath()}/${file.name}`;
        const fileType = this.getFileType(file.name);
        let eventName = 'open-file-in-editor';
        if (fileType === 'image') { eventName = 'open-image-viewer'; }
        else if (fileType === 'video' || fileType === 'audio') { eventName = 'open-media-player'; }
        else if (fileType === 'other') {
            this.viewerTitleEl.textContent = file.name;
            this.viewerContentEl.textContent = file.content || '';
            this.viewerEl.style.display = 'flex';
            return;
        }
        const event = new CustomEvent(eventName, { detail: { path: filePath } });
        window.parent.document.dispatchEvent(event);
    }

    isProtected(name) {
        const currentPath = this.getCurrentPath();
        if (currentPath === '/') { return ['user', 'application', 'languages', 'tmp'].includes(name); }
        if (currentPath === '/user') { return true; }
        return false;
    }

    async deleteFile(name) {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;
        if (this.isProtected(name)) { await this.showAlert('无法删除此目录'); return; }
        const confirmed = await this.showConfirm(`确定删除 "${name}" 吗？`);
        if (!confirmed) return;
        if (!this.currentDir.children) return;
        const index = this.currentDir.children.findIndex(c => c.name === name);
        if (index !== -1) { this.currentDir.children.splice(index, 1); this.saveFS(); this.render(); }
    }

    async renameFile(oldName) {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;
        if (this.isProtected(oldName)) { await this.showAlert('无法重命名此目录'); return; }
        const newName = await this.showPrompt(`重命名 "${oldName}" 为:`, oldName);
        if (!newName || newName === oldName) return;
        if (!this.currentDir.children) return;
        const node = this.currentDir.children.find(c => c.name === oldName);
        if (node) {
            const existing = this.currentDir.children.find(c => c.name === newName);
            if (existing) { await this.showAlert(`"${newName}" 已存在`); return; }
            node.name = newName; this.saveFS(); this.render();
        }
    }

    async createFolder() {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;
        const name = await this.showPrompt('输入文件夹名称:', this.t('filemanager.new_folder', '新建文件夹'));
        if (!name) return;
        if (!this.currentDir.children) this.currentDir.children = [];
        const existing = this.currentDir.children.find(c => c.name === name && c.type === 'folder');
        if (existing) { await this.showAlert(`文件夹 "${name}" 已存在`); return; }
        this.currentDir.children.push({ type: 'folder', name: name, children: [] });
        this.saveFS(); this.render();
    }

    async createFile() {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;
        const name = await this.showPrompt('输入文件名称:', this.t('filemanager.new_file', '新建文件.txt'));
        if (!name) return;
        if (!this.currentDir.children) this.currentDir.children = [];
        const existing = this.currentDir.children.find(c => c.name === name && c.type === 'file');
        if (existing) { await this.showAlert(`文件 "${name}" 已存在`); return; }
        this.currentDir.children.push({ type: 'file', name: name, content: '' });
        this.saveFS(); this.render();
    }

    async copyFile(name) {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;
        if (!this.currentDir.children) return;
        const node = this.currentDir.children.find(c => c.name === name);
        if (!node) return;
        this.clipboard = JSON.parse(JSON.stringify(node));
        this.clipboardAction = 'copy';
        await this.showAlert(`已复制 "${name}"`);
    }

    async cutFile(name) {
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;
        if (!this.currentDir.children) return;
        const node = this.currentDir.children.find(c => c.name === name);
        if (!node) return;
        this.clipboard = JSON.parse(JSON.stringify(node));
        this.clipboardAction = 'cut';
        await this.showAlert(`已剪切 "${name}"`);
    }

    async pasteFile() {
        if (!this.clipboard) { await this.showAlert('剪贴板为空'); return; }
        const allowed = await this.checkPermissionForAction();
        if (!allowed) return;
        const targetName = this.clipboard.name;
        if (!this.currentDir.children) this.currentDir.children = [];
        const existing = this.currentDir.children.find(c => c.name === targetName);
        let finalName = targetName;
        if (existing) {
            const ext = targetName.includes('.') ? targetName.substring(targetName.lastIndexOf('.')) : '';
            const base = targetName.includes('.') ? targetName.substring(0, targetName.lastIndexOf('.')) : targetName;
            let counter = 1;
            while (this.currentDir.children.find(c => c.name === `${base}(${counter})${ext}`)) counter++;
            finalName = `${base}(${counter})${ext}`;
        }
        const newItem = JSON.parse(JSON.stringify(this.clipboard));
        newItem.name = finalName;
        this.currentDir.children.push(newItem);
        if (this.clipboardAction === 'cut') {
            const sourcePath = this.clipboard._sourcePath || '/';
            this.removeFromPath(sourcePath, this.clipboard.name);
        }
        this.saveFS(); this.render();
        await this.showAlert(`已粘贴 "${finalName}"`);
    }

    removeFromPath(pathStr, name) {
        const parts = pathStr.split('/').filter(p => p);
        let node = this.root;
        for (const part of parts) {
            if (node.children) {
                const child = node.children.find(c => c.name === part && c.type === 'folder');
                if (child) node = child;
            }
        }
        if (node.children) {
            const index = node.children.findIndex(c => c.name === name);
            if (index !== -1) node.children.splice(index, 1);
        }
    }

    uploadFile() {
        const input = document.createElement('input');
        input.type = 'file'; input.multiple = true; input.style.display = 'none';
        input.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            const allowed = await this.checkPermissionForAction();
            if (!allowed) return;
            if (!this.currentDir.children) this.currentDir.children = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileType = this.getFileType(file.name);
                const content = fileType === 'image' || fileType === 'video' || fileType === 'audio'
                    ? await this.readFileAsDataURL(file) : await this.readFileAsText(file);
                let finalName = file.name;
                const existing = this.currentDir.children.find(c => c.name === file.name);
                if (existing) {
                    const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
                    const base = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
                    let counter = 1;
                    while (this.currentDir.children.find(c => c.name === `${base}(${counter})${ext}`)) counter++;
                    finalName = `${base}(${counter})${ext}`;
                }
                this.currentDir.children.push({ type: 'file', name: finalName, content: content });
            }
            this.saveFS(); this.render();
            await this.showAlert(`已上传 ${files.length} 个文件`);
        });
        document.body.appendChild(input); input.click();
        setTimeout(() => document.body.removeChild(input), 100);
    }

    readFileAsText(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => { resolve(e.target.result); };
            reader.onerror = () => { resolve(''); };
            reader.readAsText(file);
        });
    }

    readFileAsDataURL(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => { resolve(e.target.result); };
            reader.onerror = () => { resolve(''); };
            reader.readAsDataURL(file);
        });
    }

    downloadFile(name) {
        const file = this.currentDir.children?.find(c => c.name === name && c.type === 'file');
        if (!file) return;
        let blob;
        if (file.content && file.content.startsWith('data:')) {
            const parts = file.content.split(',');
            const mimeType = parts[0].split(':')[1].split(';')[0];
            const data = parts[1];
            const byteString = atob(data);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) { ia[i] = byteString.charCodeAt(i); }
            blob = new Blob([ab], { type: mimeType });
        } else { blob = new Blob([file.content || ''], { type: 'text/plain' }); }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name;
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }

    async downloadFolder(name) {
        const folder = this.currentDir.children?.find(c => c.name === name && c.type === 'folder');
        if (!folder) return;
        const zip = new JSZip();
        this.addFolderToZip(zip, folder, name);
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url; a.download = name + '.zip';
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }

    addFolderToZip(zip, folder, path) {
        if (folder.children) {
            folder.children.forEach(item => {
                const itemPath = path + '/' + item.name;
                if (item.type === 'folder') { this.addFolderToZip(zip, item, itemPath); }
                else {
                    let content;
                    if (item.content && item.content.startsWith('data:')) {
                        const parts = item.content.split(',');
                        content = atob(parts[1]);
                    } else { content = item.content || ''; }
                    zip.file(item.name, content);
                }
            });
        }
    }

    getFileSize(file) {
        if (file.type === 'folder') {
            const count = file.children ? file.children.length : 0;
            return count + ' 项';
        }
        const content = file.content || '';
        return new Blob([content]).size + ' B';
    }

    render() {
        this.pathEl.textContent = this.getCurrentPath();
        document.querySelectorAll('.fm-sidebar-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.path === this.getCurrentPath()) { item.classList.add('active'); }
        });
        this.filelistEl.innerHTML = '';
        const children = this.currentDir.children || [];
        if (children.length === 0) {
            this.filelistEl.innerHTML = '<div class="fm-empty">' + this.t('filemanager.empty', '此文件夹为空') + '</div>';
            return;
        }
        const sorted = [...children].sort((a, b) => {
            if (a.type !== b.type) { return a.type === 'folder' ? -1 : 1; }
            return a.name.localeCompare(b.name);
        });
        sorted.forEach(item => {
            const currentPath = this.getCurrentPath();
            if (currentPath === '/' && item.name === 'user.json') { return; }
            const el = document.createElement('div');
            el.className = 'fm-file-item';
            const icon = document.createElement('div');
            icon.className = 'fm-file-icon';
            icon.innerHTML = item.type === 'folder' ? FOLDER_ICON : FILE_ICON;
            el.appendChild(icon);
            const name = document.createElement('div');
            name.className = 'fm-file-name';
            name.textContent = item.name + (item.type === 'folder' ? '/' : '');
            el.appendChild(name);
            const size = document.createElement('div');
            size.className = 'fm-file-size';
            size.textContent = this.getFileSize(item);
            el.appendChild(size);
            const actions = document.createElement('div');
            actions.className = 'fm-file-actions';
            const copyBtn = document.createElement('button');
            copyBtn.className = 'fm-action-btn';
            copyBtn.title = '复制';
            copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            copyBtn.addEventListener('click', (e) => { e.stopPropagation(); this.copyFile(item.name); });
            actions.appendChild(copyBtn);
            const cutBtn = document.createElement('button');
            cutBtn.className = 'fm-action-btn';
            cutBtn.title = '剪切';
            cutBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 9l7-7 7 7"/><path d="M12 12V22"/><path d="M19 21H5"/></svg>';
            cutBtn.addEventListener('click', (e) => { e.stopPropagation(); this.cutFile(item.name); });
            actions.appendChild(cutBtn);
            const renameBtn = document.createElement('button');
            renameBtn.className = 'fm-action-btn';
            renameBtn.title = '重命名';
            renameBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
            renameBtn.addEventListener('click', (e) => { e.stopPropagation(); this.renameFile(item.name); });
            actions.appendChild(renameBtn);
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'fm-action-btn danger';
            deleteBtn.title = '删除';
            deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
            deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteFile(item.name); });
            actions.appendChild(deleteBtn);
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'fm-action-btn';
            downloadBtn.title = '下载';
            downloadBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.type === 'file') { this.downloadFile(item.name); } else { this.downloadFolder(item.name); }
            });
            actions.appendChild(downloadBtn);
            el.appendChild(actions);
            el.addEventListener('click', () => {
                if (item.type === 'folder') { this.openFolder(item); } else { this.openFile(item); }
            });
            this.filelistEl.appendChild(el);
        });
        const pasteBtn = document.getElementById('fm-paste');
        if (pasteBtn) { pasteBtn.style.display = this.clipboard ? 'block' : 'none'; }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.fileManager = new FileManager();
});