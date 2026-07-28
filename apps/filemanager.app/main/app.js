    async scanNetwork() {
        const scanBtn = document.getElementById('fm-network-scan');
        const usersContainer = document.getElementById('fm-network-users');
        
        scanBtn.textContent = '搜索中...';
        scanBtn.disabled = true;
        usersContainer.innerHTML = '<div class="fm-network-empty">正在获取本机信息...</div>';

        const localIP = await this.getLocalIP();
        const myInfo = await this.collectMyInfo(localIP);
        
        usersContainer.innerHTML = '';

        const localInfoEl = document.createElement('div');
        localInfoEl.className = 'fm-network-local';
        localInfoEl.innerHTML = `
            <div class="fm-network-local-header">
                <span class="fm-network-local-title">本机</span>
                <span class="fm-network-local-badge">在线</span>
            </div>
            <div class="fm-network-local-info">
                <div>用户名: ${myInfo.username}</div>
                <div>IP地址: ${myInfo.ip}</div>
                <div>共享文件夹: ${myInfo.sharedFolders.length > 0 ? myInfo.sharedFolders.join(', ') : '无'}</div>
            </div>
        `;
        usersContainer.appendChild(localInfoEl);

        const tipsEl = document.createElement('div');
        tipsEl.className = 'fm-network-empty';
        tipsEl.innerHTML = '<div class="fm-network-hint-title">网络共享说明</div><div class="fm-network-hint-text">• Web端应用受浏览器安全限制，无法直接扫描局域网设备</div><div class="fm-network-hint-text">• 如需与其他设备共享文件，请使用同一浏览器的多个标签页</div><div class="fm-network-hint-text">• 真实局域网发现需要服务端支持</div>';
        usersContainer.appendChild(tipsEl);
        
        scanBtn.textContent = '刷新信息';
        scanBtn.disabled = false;
    }

    async getLocalIP() {
        return new Promise((resolve) => {
            try {
                const rtc = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });
                let found = false;
                rtc.createDataChannel('');
                rtc.onicecandidate = (e) => {
                    if (e.candidate && !found) {
                        const candidate = e.candidate.candidate;
                        const ipMatch = candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                        if (ipMatch && !ipMatch[1].startsWith('0.')) {
                            found = true;
                            rtc.close();
                            resolve(ipMatch[1]);
                        }
                    }
                };
                rtc.createOffer().then(offer => rtc.setLocalDescription(offer));
                setTimeout(() => {
                    if (!found) {
                        rtc.close();
                        resolve(window.location.hostname || '127.0.0.1');
                    }
                }, 3000);
            } catch (e) {
                resolve(window.location.hostname || '127.0.0.1');
            }
        });
    }

    async collectMyInfo(localIP) {
        let username = 'WebOS用户';
        try {
            const userManager = window.parent.UserManager;
            if (userManager) {
                const instance = userManager.getInstance();
                const currentUser = instance.getCurrentUser();
                if (currentUser && currentUser.name) {
                    username = currentUser.name;
                }
            }
        } catch (e) {}

        let sharedFolders = [];
        try {
            const root = this.storage.fs;
            if (root && root.children) {
                sharedFolders = root.children
                    .filter(c => c.type === 'folder')
                    .map(c => c.name);
            }
        } catch (e) {}

        return {
            id: 'local-' + localIP,
            username: username,
            ip: localIP,
            sharedFolders: sharedFolders,
            timestamp: Date.now()
        };
    }

    connectToUser(user) {
        const folderList = user.sharedFolders.length > 0 
            ? user.sharedFolders.map(f => `  - ${f}`).join('\n')
            : '  无共享文件夹';
        this.showAlert(`已连接到 ${user.username} (${user.ip})\n\n共享资源:\n${folderList}`);
    }