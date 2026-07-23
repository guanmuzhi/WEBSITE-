import UserManager from './user-manager.js?v=2';
import FileSystem from './file-system.js?v=2';
import ViEditor from './vi-editor.js?v=2';
import AppManager from './app-manager.js?v=1';

const HISTORY_KEY = 'web-terminal-os-history';

const COMMANDS = [
    'ls', 'pwd', 'cd', 'new', 'delete', 'rename', 'open', 'clear',
    'tree', 'move', 'copy', 'export', 'import', 'account', 'help', 'run'
];

class Terminal {
    constructor(options = {}) {
        this.fs = new FileSystem();
        this.userManager = new UserManager();
        this.container = options.container || null;
        this.skipWelcome = options.skipWelcome || false;
        this.onTitleChange = options.onTitleChange || null;
        
        if (this.container) {
            this.output = this.container.querySelector('.output');
            this.input = this.container.querySelector('.command-input');
            this.prompt = this.container.querySelector('.prompt');
            this.terminalBody = this.container.querySelector('.terminal-body');
            this.terminalTitle = this.container.querySelector('.terminal-title');
            this.editorMode = this.container.querySelector('.editor-mode');
            this.editorPosition = this.container.querySelector('.editor-position');
            this.editorStatusBar = this.container.querySelector('.editor-status-bar');
            this.editorCommandLine = this.container.querySelector('.editor-command-line');
            this.editorCommandPrompt = this.container.querySelector('.editor-command-prompt');
            this.editorCommandInput = this.container.querySelector('.editor-command-input');
            this.inputLine = this.container.querySelector('.input-line');
        } else {
            this.output = document.getElementById('output');
            this.input = document.getElementById('command-input');
            this.prompt = document.getElementById('prompt');
            this.terminalBody = document.getElementById('terminal-body');
            this.terminalTitle = document.getElementById('terminal-title');
            this.editorMode = document.getElementById('editor-mode');
            this.editorPosition = document.getElementById('editor-position');
            this.editorStatusBar = document.getElementById('editor-status-bar');
            this.editorCommandLine = document.getElementById('editor-command-line');
            this.editorCommandPrompt = document.getElementById('editor-command-prompt');
            this.editorCommandInput = document.getElementById('editor-command-input');
            this.inputLine = document.querySelector('.input-line');
        }
        
        this.viEditor = new ViEditor(this);
        this.appManager = new AppManager();
        
        this.currentUser = this.userManager.getCurrentUser();
        
        this.history = [];
        this.historyIndex = -1;
        this.currentInput = '';
        this.completionIndex = -1;
        this.completionMatches = [];
        
        this.init();
    }

    loadHistory() {
        const data = localStorage.getItem(HISTORY_KEY);
        if (data) {
            try {
                this.history = JSON.parse(data);
            } catch (e) {
                this.history = [];
            }
        }
    }

    saveHistory() {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    }

    addToHistory(command) {
        if (!command || command.trim() === '') return;
        
        const index = this.history.indexOf(command);
        if (index !== -1) {
            this.history.splice(index, 1);
        }
        
        this.history.unshift(command);
        
        if (this.history.length > 100) {
            this.history.pop();
        }
        
        this.saveHistory();
    }

    handleArrowUp() {
        if (this.history.length === 0) return;
        
        if (this.historyIndex === -1) {
            this.currentInput = this.input.value;
            this.historyIndex = 0;
        } else if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
        }
        
        this.input.value = this.history[this.historyIndex];
    }

    handleArrowDown() {
        if (this.historyIndex === -1) return;
        
        if (this.historyIndex === 0) {
            this.historyIndex = -1;
            this.input.value = this.currentInput;
        } else {
            this.historyIndex--;
            this.input.value = this.history[this.historyIndex];
        }
    }

    handleTab() {
        const input = this.input.value;
        const parts = input.trim().split(' ');
        
        if (parts.length === 1 || (parts.length > 1 && input.endsWith(' '))) {
            const matches = this.completeCommand(input.trim());
            if (matches.length > 0) {
                this.completionMatches = matches;
                this.completionIndex = (this.completionIndex + 1) % matches.length;
                this.input.value = matches[this.completionIndex] + ' ';
                return;
            }
        }
        
        if (parts.length > 0) {
            const lastPart = parts[parts.length - 1];
            const matches = this.completeFilename(lastPart);
            if (matches.length > 0) {
                this.completionMatches = matches;
                this.completionIndex = (this.completionIndex + 1) % matches.length;
                parts[parts.length - 1] = matches[this.completionIndex];
                this.input.value = parts.join(' ') + (matches[this.completionIndex].endsWith('/') ? '' : ' ');
            }
        }
    }

    completeCommand(input) {
        return COMMANDS.filter(cmd => cmd.startsWith(input.toLowerCase()));
    }

    completeFilename(input) {
        const items = this.fs.ls();
        const matches = items.filter(item => {
            return item.name.startsWith(input);
        }).map(item => {
            return item.type === 'folder' ? item.name + '/' : item.name;
        });
        return matches;
    }

    init() {
        this.initUserEnvironment();
        this.updatePrompt();
        
        if (!this.skipWelcome) {
            this.printWelcome();
        }
        
        this.loadHistory();
        
        document.addEventListener('user-switched', (e) => {
            const username = e.detail.username;
            const user = this.userManager.getUser(username);
            if (user) {
                this.currentUser = user;
                this.userManager.setCurrentUser(username);
                this.initUserEnvironment();
                this.updatePrompt();
            }
        });
        
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.executeCommand(this.input.value.trim());
                this.input.value = '';
                this.historyIndex = -1;
                this.completionIndex = -1;
                this.completionMatches = [];
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.handleArrowUp();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.handleArrowDown();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.handleTab();
            } else {
                this.completionIndex = -1;
                this.completionMatches = [];
            }
        });
    }

    initUserEnvironment() {
        if (!this.fs.getHomeDir(this.currentUser.username)) {
            this.fs.createUserHome(this.currentUser.username);
        }
        this.fs.currentDir = this.fs.getHomeDir(this.currentUser.username);
        this.fs.save();
    }

    setPath(path) {
        const targetDir = this.fs.resolvePath(path);
        if (targetDir && targetDir.type === 'folder') {
            this.fs.currentDir = targetDir;
            this.updatePrompt();
            return true;
        }
        return false;
    }

    updatePrompt() {
        const path = this.fs.getCurrentPath();
        const title = `${this.currentUser.username}@web-terminal:${path}`;
        this.prompt.textContent = `${title} $`;
        if (this.onTitleChange && typeof this.onTitleChange === 'function') {
            this.onTitleChange(title);
        }
    }

    printWelcome() {
        this.print('Web Terminal OS v1.0');
        this.print('输入 "help" 查看可用命令');
        this.print('');
    }

    print(text, className = '') {
        const div = document.createElement('div');
        div.textContent = text;
        if (className) {
            div.classList.add(className);
        }
        this.output.appendChild(div);
        this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.terminalBody) {
            this.terminalBody.scrollTop = this.terminalBody.scrollHeight;
        }
    }

    executeCommand(cmd) {
        if (!cmd) return;
        
        this.print(`${this.prompt.textContent} ${cmd}`);
        this.addToHistory(cmd);
        
        const parts = cmd.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        switch (command) {
            case 'ls':
                this.handleLs();
                break;
            case 'pwd':
                this.handlePwd();
                break;
            case 'cd':
                this.handleCd(args);
                break;
            case 'new':
                this.handleNew(args);
                break;
            case 'delete':
                this.handleDelete(args);
                break;
            case 'rename':
                this.handleRename(args);
                break;
            case 'open':
                this.handleOpen(args);
                break;
            case 'clear':
                this.handleClear();
                break;
            case 'tree':
                this.handleTree();
                break;
            case 'move':
                this.handleMove(args);
                break;
            case 'copy':
                this.handleCopy(args);
                break;
            case 'account':
                this.handleAccount(args);
                break;
            case 'export':
                this.handleExport(args);
                break;
            case 'import':
                this.handleImport(args);
                break;
            case 'help':
                this.handleHelp();
                break;
            case 'run':
                this.handleRun(args);
                break;
            default:
                this.print(`未知命令: ${command}，输入 "help" 查看可用命令`, 'error');
        }
    }

    handleLs() {
        const items = this.fs.ls();
        if (items.length === 0) {
            this.print('当前目录为空');
            return;
        }
        
        items.forEach(item => {
            if (item.type === 'folder') {
                this.print(`[DIR]  ${item.name}`, 'folder');
            } else {
                this.print(`[FILE] ${item.name}`, 'file');
            }
        });
    }

    handlePwd() {
        this.print(this.fs.getCurrentPath());
    }

    handleCd(args) {
        if (!args[0]) {
            this.print('用法: cd <文件夹名> 或 cd ..', 'error');
            return;
        }

        const currentPath = this.fs.getCurrentPath();

        if (args[0] === '..') {
            const result = this.fs.goUp();
            if (result.success) {
                this.updatePrompt();
                this.checkLogoutOnExitHome(currentPath);
            } else {
                this.print(result.message, 'error');
            }
        } else {
            const targetFolder = args.join(' ');
            const targetPath = this.fs.getCurrentPath() + '/' + targetFolder;
            
            const permission = this.checkPathPermission(targetPath);
            if (!permission.allowed) {
                this.print(permission.message, 'error');
                return;
            }

            const result = this.fs.intoFolder(targetFolder);
            if (result.success) {
                this.updatePrompt();
            } else {
                this.print(result.message, 'error');
            }
        }
    }

    checkLogoutOnExitHome(previousPath) {
        const currentPath = this.fs.getCurrentPath();
        const homePath = `/home/${this.currentUser.username}`;
        
        if (previousPath.startsWith(homePath) && !currentPath.startsWith(homePath)) {
            this.currentUser = this.userManager.getDefaultUser();
            this.userManager.setCurrentUser(this.currentUser.username);
            this.updatePrompt();
            this.print(`已退出用户 "${this.currentUser.username}" 的登录`, 'success');
        }
    }

    handleNew(args) {
        if (args.length < 2) {
            this.print('用法: new folder <文件夹名> 或 new file <文件名>', 'error');
            return;
        }
        
        const type = args[0].toLowerCase();
        const name = args.slice(1).join(' ');
        
        if (type === 'folder') {
            const result = this.fs.createFolder(name);
            this.print(result.message, result.success ? 'success' : 'error');
        } else if (type === 'file') {
            const result = this.fs.createFile(name);
            this.print(result.message, result.success ? 'success' : 'error');
        } else {
            this.print('未知类型，支持: folder, file', 'error');
        }
    }

    handleDelete(args) {
        if (!args[0]) {
            this.print('用法: delete <文件或文件夹名>', 'error');
            return;
        }
        
        const name = args.join(' ');
        
        if (!confirm(`确定要删除 "${name}" 吗？`)) {
            return;
        }
        
        const result = this.fs.deleteNode(name);
        this.print(result.message, result.success ? 'success' : 'error');
    }

    handleRename(args) {
        if (args.length < 2) {
            this.print('用法: rename <旧名称> <新名称>', 'error');
            return;
        }
        
        const oldName = args[0];
        const newName = args[1];
        
        const result = this.fs.renameNode(oldName, newName);
        this.print(result.message, result.success ? 'success' : 'error');
    }

    handleOpen(args) {
        if (!args[0]) {
            this.print('用法: open <文件名>', 'error');
            return;
        }
        
        const name = args.join(' ');
        const targetPath = this.fs.getCurrentPath() + '/' + name;
        
        const permission = this.checkPathPermission(targetPath);
        if (!permission.allowed) {
            this.print(permission.message, 'error');
            return;
        }

        const result = this.fs.openFile(name);
        
        if (result.success) {
            this.viEditor.open(name, result.content, result.file);
        } else {
            this.print(result.message, 'error');
        }
    }

    handleClear() {
        this.output.innerHTML = '';
        this.printWelcome();
    }

    handleTree() {
        const currentPath = this.fs.getCurrentPath();
        const permission = this.checkPathPermission(currentPath);
        if (!permission.allowed) {
            this.print(permission.message, 'error');
            return;
        }

        const tree = this.fs.getTree(this.fs.currentDir, '', (node) => {
            return this.checkNodePermission(node);
        });
        if (tree.length === 0) {
            this.print('当前目录为空');
        } else {
            tree.forEach(line => this.print(line));
        }
    }

    checkNodePermission(node) {
        const oldCurrentDir = this.fs.currentDir;
        this.fs.currentDir = node;
        const nodePath = this.fs.getCurrentPath();
        this.fs.currentDir = oldCurrentDir;
        
        return this.checkPathPermission(nodePath);
    }

    handleMove(args) {
        if (args.length < 2) {
            this.print('用法: move <文件名> <目标路径>', 'error');
            this.print('示例: move welcome.txt ..', 'error');
            return;
        }
        
        const filename = args[0];
        const targetPath = args.slice(1).join(' ');
        
        const sourcePath = this.fs.getCurrentPath() + '/' + filename;
        const permission1 = this.checkPathPermission(sourcePath);
        if (!permission1.allowed) {
            this.print(permission1.message, 'error');
            return;
        }

        const resolvedTargetDir = this.fs.resolvePath(targetPath);
        if (!resolvedTargetDir) {
            this.print(`找不到目标路径 "${targetPath}"`, 'error');
            return;
        }
        
        const oldCurrentDir = this.fs.currentDir;
        this.fs.currentDir = resolvedTargetDir;
        const targetDirPath = this.fs.getCurrentPath();
        this.fs.currentDir = oldCurrentDir;
        
        const permission2 = this.checkPathPermission(targetDirPath);
        if (!permission2.allowed) {
            this.print(permission2.message, 'error');
            return;
        }
        
        const result = this.fs.moveFile(filename, targetPath);
        this.print(result.message, result.success ? 'success' : 'error');
    }

    handleCopy(args) {
        if (args.length < 1) {
            this.print('用法: copy <文件名> [目标路径]', 'error');
            this.print('示例: copy welcome.txt ..', 'error');
            this.print('示例: copy welcome.txt', 'error');
            return;
        }
        
        const filename = args[0];
        const targetPath = args.length > 1 ? args.slice(1).join(' ') : '.';
        
        const sourcePath = this.fs.getCurrentPath() + '/' + filename;
        const permission1 = this.checkPathPermission(sourcePath);
        if (!permission1.allowed) {
            this.print(permission1.message, 'error');
            return;
        }

        const resolvedTargetDir = this.fs.resolvePath(targetPath);
        if (!resolvedTargetDir) {
            this.print(`找不到目标路径 "${targetPath}"`, 'error');
            return;
        }
        
        const oldCurrentDir = this.fs.currentDir;
        this.fs.currentDir = resolvedTargetDir;
        const targetDirPath = this.fs.getCurrentPath();
        this.fs.currentDir = oldCurrentDir;
        
        const permission2 = this.checkPathPermission(targetDirPath);
        if (!permission2.allowed) {
            this.print(permission2.message, 'error');
            return;
        }
        
        const result = this.fs.copyFile(filename, targetPath);
        this.print(result.message, result.success ? 'success' : 'error');
    }

    handleExport(args) {
        if (args.length < 1) {
            this.print('用法: export <文件或文件夹名>', 'error');
            this.print('示例: export welcome.txt', 'error');
            this.print('示例: export myfolder', 'error');
            return;
        }

        const name = args.join(' ');
        const item = this.fs.currentDir.children ? this.fs.currentDir.children.find(c => c.name === name) : null;

        if (!item) {
            this.print(`找不到 "${name}"`, 'error');
            return;
        }

        if (item.type === 'file') {
            this.exportFile(item);
        } else {
            this.exportFolder(item);
        }
    }

    exportFile(file) {
        const blob = new Blob([file.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.print(`已导出文件 "${file.name}"`, 'success');
    }

    exportFolder(folder) {
        const zip = new JSZip();
        this.addFolderToZip(zip, folder, '');
        zip.generateAsync({ type: 'blob' }).then((content) => {
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = folder.name + '.zip';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.print(`已导出文件夹 "${folder.name}" 为 ${folder.name}.zip`, 'success');
        }).catch((err) => {
            this.print(`导出失败: ${err.message}`, 'error');
        });
    }

    addFolderToZip(zip, folder, path) {
        const children = folder.children || [];
        children.forEach(child => {
            const childPath = path ? path + '/' + child.name : child.name;
            if (child.type === 'folder') {
                zip.folder(childPath);
                this.addFolderToZip(zip, child, childPath);
            } else {
                zip.file(childPath, child.content);
            }
        });
    }

    handleImport(args) {
        if (args.length === 0) {
            this.importFromFile();
        } else {
            const url = args.join(' ');
            this.importFromUrl(url);
        }
    }

    importFromFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.style.display = 'none';
        document.body.appendChild(input);
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) {
                document.body.removeChild(input);
                return;
            }

            const name = file.name;
            const isBinary = name.toLowerCase().endsWith('.app');

            const reader = new FileReader();
            reader.onload = (event) => {
                let content = event.target.result;
                
                if (isBinary && content.startsWith('data:')) {
                    const base64Start = content.indexOf(',') + 1;
                    content = content.substring(base64Start);
                }
                
                if (this.fs.currentDir.children && this.fs.currentDir.children.find(c => c.name === name)) {
                    this.print(`文件 "${name}" 已存在`, 'error');
                    document.body.removeChild(input);
                    return;
                }

                if (!this.fs.currentDir.children) {
                    this.fs.currentDir.children = [];
                }
                
                this.fs.currentDir.children.push({
                    type: 'file',
                    name: name,
                    content: content,
                    isBinary: isBinary
                });
                this.fs.save();
                this.print(`已导入文件 "${name}"`, 'success');
                document.body.removeChild(input);
            };
            reader.onerror = () => {
                this.print('文件读取失败', 'error');
                document.body.removeChild(input);
            };
            
            if (isBinary) {
                reader.readAsDataURL(file);
            } else {
                reader.readAsText(file);
            }
        });

        input.click();
    }

    importFromUrl(url) {
        this.print(`正在从 ${url} 下载文件...`);
        
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.text();
            })
            .then(content => {
                let fileName = url.split('/').pop();
                if (!fileName || fileName.includes('?')) {
                    fileName = fileName.split('?')[0];
                }
                if (!fileName) {
                    fileName = 'downloaded_file.txt';
                }

                if (this.fs.currentDir.children && this.fs.currentDir.children.find(c => c.name === fileName)) {
                    this.print(`文件 "${fileName}" 已存在`, 'error');
                    return;
                }

                if (!this.fs.currentDir.children) {
                    this.fs.currentDir.children = [];
                }
                
                this.fs.currentDir.children.push({
                    type: 'file',
                    name: fileName,
                    content: content
                });
                this.fs.save();
                this.print(`已从 URL 导入文件 "${fileName}"`, 'success');
            })
            .catch(err => {
                this.print(`导入失败: ${err.message}`, 'error');
                this.print('提示：URL导入可能因跨域(CORS)限制而失败', 'error');
            });
    }

    handleAccount(args) {
        if (args.length === 0) {
            this.print('用法: account <new|delete|switch> [参数]', 'error');
            this.print('示例: account new john', 'error');
            this.print('示例: account new john password', 'error');
            this.print('示例: account switch john', 'error');
            this.print('示例: account delete john', 'error');
            return;
        }

        const subCommand = args[0].toLowerCase();

        switch (subCommand) {
            case 'new':
                this.handleAccountNew(args.slice(1));
                break;
            case 'delete':
                this.handleAccountDelete(args.slice(1));
                break;
            case 'switch':
                this.handleAccountSwitch(args.slice(1));
                break;
            default:
                this.print(`未知的 account 子命令: ${subCommand}`, 'error');
        }
    }

    handleAccountNew(args) {
        if (args.length === 0) {
            this.print('用法: account new <用户名> [密码]', 'error');
            return;
        }

        const username = args[0];
        const password = args.length > 1 ? args.slice(1).join(' ') : null;

        const userResult = this.userManager.createUser(username, password);
        if (!userResult.success) {
            this.print(userResult.message, 'error');
            return;
        }

        const dirResult = this.fs.createUserHome(username);
        if (!dirResult.success) {
            this.userManager.deleteUser(username);
            this.print(dirResult.message, 'error');
            return;
        }

        this.print(userResult.message, 'success');
        this.print(dirResult.message, 'success');

        document.dispatchEvent(new CustomEvent('users-changed'));
    }

    handleAccountDelete(args) {
        if (args.length === 0) {
            this.print('用法: account delete <用户名>', 'error');
            return;
        }

        const username = args[0];

        if (username === this.currentUser.username) {
            this.print('不能删除当前登录的用户', 'error');
            return;
        }

        const user = this.userManager.getUser(username);
        if (!user) {
            this.print(`用户 "${username}" 不存在`, 'error');
            return;
        }

        if (user.password) {
            const inputPassword = prompt(`请输入用户 "${username}" 的密码以确认删除:`);
            if (!inputPassword || !this.userManager.verifyPassword(username, inputPassword)) {
                this.print('密码验证失败，删除取消', 'error');
                return;
            }
        }

        const currentPath = this.fs.getCurrentPath();
        const isInDeletedUserDir = currentPath.includes(`/home/${username}`);

        const userResult = this.userManager.deleteUser(username);
        if (!userResult.success) {
            this.print(userResult.message, 'error');
            return;
        }

        const dirResult = this.fs.deleteUserHome(username);
        if (!dirResult.success) {
            this.print(userResult.message, 'success');
            this.print(dirResult.message, 'error');
            return;
        }

        this.print(userResult.message, 'success');
        this.print(dirResult.message, 'success');

        if (isInDeletedUserDir) {
                const remainingUsers = this.userManager.listUsers();
                if (remainingUsers.length > 0) {
                    const newUser = remainingUsers[0];
                    this.currentUser = newUser;
                    this.initUserEnvironment();
                    this.updatePrompt();
                    this.print(`已自动切换到用户 "${newUser.username}"`, 'success');
                    document.dispatchEvent(new CustomEvent('request-user-switch', { detail: { username: newUser.username } }));
                }
            }

        document.dispatchEvent(new CustomEvent('users-changed'));
    }

    handleAccountSwitch(args) {
        if (args.length === 0) {
            this.print('用法: account switch <用户名>', 'error');
            return;
        }

        const username = args[0];
        const user = this.userManager.getUser(username);

        if (!user) {
            this.print(`用户 "${username}" 不存在`, 'error');
            return;
        }

        if (user.password) {
            const inputPassword = prompt(`请输入用户 "${username}" 的密码:`);
            if (!inputPassword || !this.userManager.verifyPassword(username, inputPassword)) {
                this.print('密码验证失败，切换取消', 'error');
                return;
            }
        }

        this.currentUser = user;
        this.initUserEnvironment();
        this.updatePrompt();
        
        this.print(`已切换到用户 "${username}"`, 'success');
        this.print(`当前目录: ${this.fs.getCurrentPath()}`, 'success');

        document.dispatchEvent(new CustomEvent('request-user-switch', { detail: { username } }));
    }

    checkPathPermission(targetPath) {
        const pathParts = targetPath.split('/');
        const homeIndex = pathParts.indexOf('home');
        
        if (homeIndex === -1 || homeIndex + 1 >= pathParts.length) {
            return { allowed: true };
        }

        const targetUsername = pathParts[homeIndex + 1];
        
        if (targetUsername === this.currentUser.username) {
            return { allowed: true };
        }

        const targetUser = this.userManager.getUser(targetUsername);
        
        if (!targetUser || !targetUser.password) {
            return { allowed: true };
        }

        const inputPassword = prompt(`访问用户 "${targetUsername}" 的文件需要密码验证:`);
        if (!inputPassword || !this.userManager.verifyPassword(targetUsername, inputPassword)) {
            return { allowed: false, message: `用户 "${targetUsername}" 的密码验证失败，拒绝访问` };
        }

        return { allowed: true };
    }

    async handleRun(args) {
        if (!args[0]) {
            this.print('用法: run <appname.app>', 'error');
            return;
        }

        const filename = args.join(' ');
        
        if (!this.appManager.isValidAppFile(filename)) {
            this.print(`文件 "${filename}" 不是有效的 .app 文件`, 'error');
            return;
        }

        try {
            const res = await fetch(`/apps/${filename}/info.json`);
            if (res.ok) {
                const info = await res.json();
                this.print(`正在启动应用: ${info.name} v${info.version}`, 'success');
                
                const event = new CustomEvent('app-launch-real', {
                    detail: {
                        path: filename
                    }
                });
                document.dispatchEvent(event);
                return;
            }
        } catch (e) {
            console.warn('尝试从真实文件加载失败:', e);
        }

        const result = this.fs.openFile(filename);
        if (!result.success) {
            this.print(`找不到文件 "${filename}"`, 'error');
            return;
        }

        const file = result.file;
        
        if (!file.content) {
            this.print(`文件 "${filename}" 为空`, 'error');
            return;
        }

        this.print(`正在加载应用 "${filename}"...`);

        try {
            const appData = await this.appManager.parseAppFile(file.content);
            
            if (!appData.success) {
                this.print(`应用加载失败: ${appData.error}`, 'error');
                return;
            }

            this.print(`正在启动应用: ${appData.info.name} v${appData.info.version}`, 'success');
            
            const event = new CustomEvent('app-launch', {
                detail: {
                    appData: appData
                }
            });
            document.dispatchEvent(event);

        } catch (e) {
            this.print(`运行应用失败: ${e.message}`, 'error');
        }
    }

    handleHelp() {
        this.print('可用命令:');
        this.print('  ls                    - 列出当前目录内容');
        this.print('  pwd                   - 显示当前路径');
        this.print('  cd <文件夹名>          - 进入指定文件夹');
        this.print('  cd ..                 - 返回上级目录');
        this.print('  new folder <文件夹名>  - 创建新文件夹');
        this.print('  new file <文件名>      - 创建新文件');
        this.print('  delete <文件名>        - 删除文件或文件夹');
        this.print('  rename <旧名称> <新名称> - 重命名文件或文件夹');
        this.print('  open <文件名>          - 使用vi编辑器打开文件');
        this.print('  tree                  - 递归显示当前目录结构');
        this.print('  move <文件名> <路径>   - 移动文件到指定路径');
        this.print('  copy <文件名> [路径]   - 复制文件到指定路径');
        this.print('  export <文件/文件夹>   - 导出文件或文件夹为zip');
        this.print('  import [URL]          - 导入本地文件或从URL导入');
        this.print('  run <appname.app>      - 运行 .app 应用程序');
        this.print('  account new <用户名> [密码]  - 创建新用户');
        this.print('  account switch <用户名>     - 切换用户');
        this.print('  account delete <用户名>     - 删除用户');
        this.print('  clear                 - 清空屏幕');
        this.print('  help                  - 显示此帮助信息');
        this.print('');
        this.print('vi编辑器快捷键:');
        this.print('  i                     - 进入插入模式');
        this.print('  Esc                   - 返回正常模式');
        this.print('  :w                    - 保存文件');
        this.print('  :q                    - 退出编辑器');
        this.print('  :wq                   - 保存并退出');
        this.print('  :q!                   - 强制退出（不保存）');
        this.print('  dd                    - 删除当前行');
        this.print('  x                     - 删除当前字符');
        this.print('  u                     - 撤销');
    }
}

export default Terminal;