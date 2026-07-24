class Dialogs {
    static showAlert(message, title = '提示') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';

            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';

            const titleEl = document.createElement('div');
            titleEl.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            titleEl.textContent = title;
            dialog.appendChild(titleEl);

            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
            msg.textContent = message;
            dialog.appendChild(msg);

            const okBtn = document.createElement('button');
            okBtn.textContent = '确定';
            okBtn.style.cssText = 'padding:8px 24px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            okBtn.addEventListener('mouseenter', () => { okBtn.style.background = '#2980b9'; });
            okBtn.addEventListener('mouseleave', () => { okBtn.style.background = '#3498db'; });
            okBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve();
            });

            dialog.appendChild(okBtn);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            setTimeout(() => okBtn.focus(), 50);
        });
    }

    static showConfirm(message, title = '确认') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';

            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';

            const titleEl = document.createElement('div');
            titleEl.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            titleEl.textContent = title;
            dialog.appendChild(titleEl);

            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
            msg.textContent = message;
            dialog.appendChild(msg);

            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
            cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
            cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(false);
            });
            btnContainer.appendChild(cancelBtn);

            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = '确定';
            confirmBtn.style.cssText = 'padding:8px 16px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = '#2980b9'; });
            confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = '#3498db'; });
            confirmBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(true);
            });
            btnContainer.appendChild(confirmBtn);

            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            setTimeout(() => confirmBtn.focus(), 50);
        });
    }

    static showPrompt(message, defaultValue = '', title = '输入') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';

            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';

            const titleEl = document.createElement('div');
            titleEl.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            titleEl.textContent = title;
            dialog.appendChild(titleEl);

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
            cancelBtn.textContent = '取消';
            cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
            cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
            cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(null);
            });
            btnContainer.appendChild(cancelBtn);

            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = '确定';
            confirmBtn.style.cssText = 'padding:8px 16px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = '#2980b9'; });
            confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = '#3498db'; });
            confirmBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(input.value);
            });
            btnContainer.appendChild(confirmBtn);

            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            setTimeout(() => { input.focus(); input.select(); }, 50);

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    document.body.removeChild(overlay);
                    resolve(input.value);
                } else if (e.key === 'Escape') {
                    document.body.removeChild(overlay);
                    resolve(null);
                }
            });
        });
    }

    static showPasswordDialog(username, onSuccess, onCancel) {
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
        input.type = 'password';
        input.placeholder = '密码';
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
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = 'padding:8px 16px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
        cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
        cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            if (onCancel) onCancel();
        });
        btnContainer.appendChild(cancelBtn);

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确认';
        confirmBtn.style.cssText = 'padding:8px 16px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
        confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = '#2980b9'; });
        confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = '#3498db'; });

        const submit = () => {
            const userInfo = Dialogs.getUserInfo(username);
            if (userInfo && userInfo.password === input.value) {
                document.body.removeChild(overlay);
                if (onSuccess) onSuccess();
            } else {
                errorMsg.textContent = '密码错误';
                input.style.borderColor = '#e74c3c';
            }
        };

        confirmBtn.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submit();
        });
        btnContainer.appendChild(confirmBtn);

        dialog.appendChild(btnContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        setTimeout(() => input.focus(), 50);
    }

    static getUserInfo(username) {
        const usersData = localStorage.getItem('web-terminal-os-users');
        if (!usersData) return null;
        try {
            const users = JSON.parse(usersData);
            const user = users.find(u => u.username === username);
            if (user) {
                return { username: user.username, password: user.password };
            }
            return null;
        } catch (e) {
            return null;
        }
    }
}

export default Dialogs;