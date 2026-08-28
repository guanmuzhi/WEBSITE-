import UserManager from './user-manager.js?v=17';
import FileSystem from './file-system.js?v=17';
import ViEditor from './vi-editor.js?v=17';
import AppManager from './app-manager.js?v=17';
import { Path, FSEdit } from './lib/index.js?v=17';
const HISTORY_KEY = 'web-terminal-os-history';
const COMMANDS = [
    'ls', 'pwd', 'cd', 'new', 'delete', 'rename', 'open', 'clear',
    'tree', 'move', 'copy', 'export', 'import', 'account', 'help', 'run',
    'wallpaper', 'theme', 'font', 'opacity', 'animations', 'autohide',
    'language', 'apps', 'settings', 'whoami', 'date', 'echo', 'cat',
    'edit'
];
class Terminal {
    constructor(options = {}) {
        this.fs = new FileSystem();
        this.userManager = UserManager.getInstance();
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
        // edit 命令的撤销栈：{ undoText, filePath, fileNodeBefore }
        this._editUndoStack = [];
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
        const items = this.fs.ls(true);
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
        this.print('Web Terminal OS v1.6');
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
            const tb = this.terminalBody;
            // Flush any pending layout before measuring + scrolling
            const doScroll = () => {
                try {
                    tb.scrollTop = tb.scrollHeight;
                } catch (e) { /* no-op */ }
            };
            doScroll();
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => requestAnimationFrame(doScroll));
            }
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
                this.handleLs(args);
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
                this.handleTree(args);
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
            case 'wallpaper':
                this.handleWallpaper(args);
                break;
            case 'theme':
                this.handleTheme(args);
                break;
            case 'font':
                this.handleFont(args);
                break;
            case 'opacity':
                this.handleOpacity(args);
                break;
            case 'animations':
                this.handleAnimations(args);
                break;
            case 'autohide':
                this.handleAutohide(args);
                break;
            case 'language':
                this.handleLanguage(args);
                break;
            case 'apps':
                this.handleApps(args);
                break;
            case 'settings':
                this.handleSettings();
                break;
            case 'whoami':
                this.print(this.currentUser.username);
                break;
            case 'date':
                this.print(new Date().toLocaleString('zh-CN'));
                break;
            case 'echo':
                this.print(args.join(' '));
                break;
            case 'cat':
                this.handleOpen(args);
                break;
            case 'edit':
                this.handleEdit(args);
                break;
            default:
                this.print(`未知命令: ${command}，输入 "help" 查看可用命令`, 'error');
        }
    }
    handleLs(args) {
        const showHidden = args.includes('-a') || args.includes('-la') || args.includes('-al');
        const items = this.fs.ls(showHidden);
        if (items.length === 0) {
            this.print('当前目录为空');
            return;
        }
        items.forEach(item => {
            if (item.type === 'folder') {
                const tag = this.fs.isHiddenDir(item.name) ? '[SYS]' : '[DIR]';
                this.print(`${tag}  ${item.name}`, this.fs.isHiddenDir(item.name) ? 'folder system-folder' : 'folder');
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
            const targetPath = Path.resolveUnder(targetFolder, this.fs.getCurrentPath());
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
        const homePath = `/user/${this.currentUser.username}`;
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
        if (this.fs.isSystemPath(this.fs.getCurrentPath())) {
            this.print('系统目录为只读，无法在此创建文件或文件夹', 'error');
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
        if (this.fs.isSystemPath(this.fs.getCurrentPath())) {
            this.print('系统目录为只读，无法删除', 'error');
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
        if (this.fs.isSystemPath(this.fs.getCurrentPath())) {
            this.print('系统目录为只读，无法重命名', 'error');
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
        const targetPath = Path.resolveUnder(name, this.fs.getCurrentPath());
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
    // ====================================================================
    //  edit 命令：非交互式文件修改（line/range/delete/insert/append/regex）
    // ====================================================================
    handleEdit(args) {
        // ---- 特殊子命令：edit undo / edit --help --------------------------------
        if (!args[0] || args.includes('-h') || args.includes('--help')) {
            this._printEditHelp();
            return;
        }
        if (args[0] === 'undo') {
            return this._handleEditUndo(args.slice(1));
        }
        // ---- 解析标志位：-y（跳过确认）、-c（行数预览）--------------------------------
        let assumeYes = false;
        let withContext = 0;
        const flagArgs = [];
        let rest = [];
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === '-y' || a === '--yes') { assumeYes = true; continue; }
            if ((a === '-c' || a === '--context') && typeof Number(args[i + 1]) === 'number') {
                withContext = Math.max(0, Math.floor(Number(args[i + 1]) || 0));
                i++;
                continue;
            }
            if (a.startsWith('-')) { flagArgs.push(a); continue; }
            rest.push(a);
        }
        if (flagArgs.length) {
            this.print(`edit: 未知标志 ${flagArgs.join(' ')}。使用 edit --help 查看帮助。`, 'error');
            return;
        }
        if (rest.length < 2) {
            this.print('edit: 参数不足。语法：edit <文件> <操作...>', 'error');
            this._printEditHelp(true);
            return;
        }
        const [fileArg, ...restAfterFile] = rest;
        const filePath = fileArg; // 相对/绝对都可以，fs.splitFilePath 会规范化
        // ---- 路径权限检查 --------------------------------------------------------
        const splitInfo = this.fs.splitFilePath(filePath);
        const absPath = splitInfo.absFilePath;
        const perm = this.checkPathPermission(absPath);
        if (!perm.allowed) { this.print(perm.message, 'error'); return; }
        if (this.fs.isSystemPath(splitInfo.absDirPath) && !this.fs.isSystemPath(splitInfo.absDirPath + '/noop')) {
            // 不阻止系统路径下写，StorageService 不禁止；保持与 openFile 一致通过 checkPathPermission 裁决即可
        }
        // ---- 解析操作：支持 6 种语法 ----------------------------------------------
        const parsed = this._parseEditArgs(restAfterFile);
        if (!parsed.ok) { this.print('edit: ' + parsed.error, 'error'); this._printEditHelp(true); return; }
        // ---- 读文件（不存在则视为空文件；父目录不存在会在写阶段自动创建）-------------
        let existing = this.fs.getFileByPath(filePath);
        const originalText = existing && typeof existing.content === 'string' ? existing.content : '';
        // 注意：_parseEditArgs 返回的 result 只含 ops/_pendingOp；真正的 patch 计算要结合 originalText
        const ops = parsed.result.ops;
        const applied = FSEdit.apply(originalText, ops);
        if (!applied.success) {
            this.print('edit: ' + applied.error, 'error');
            return;
        }
        const { nextContent, diff, undo } = applied;
        // ---- 预览（差异摘要 + 可选上下文行）---------------------------------------
        this.print(`edit → ${absPath}`, 'success');
        for (const d of diff) this.print(`  · ${d.label}  :  ${d.from}  →  ${d.to}`);
        if (withContext > 0) this._printEditContext(nextContent, withContext);
        // ---- 确认 ---------------------------------------------------------------
        if (!assumeYes) {
            const ok = confirm(`edit: 将对 "${absPath}" 执行 ${diff.length} 项修改，是否写入？\n（可用 edit undo 回滚最后一次）`);
            if (!ok) { this.print('edit: 已取消（未写入）'); return; }
        }
        // ---- 写入 & 保存撤销 -----------------------------------------------------
        const writeRes = this.fs.writeFileByPath(filePath, nextContent);
        if (!writeRes.success) { this.print(writeRes.message, 'error'); return; }
        const token = 'U' + Date.now().toString(36);
        this._editUndoStack.push({
            token,
            filePath: absPath,
            undoText: undo ? undo() : originalText,
            ts: Date.now(),
        });
        if (this._editUndoStack.length > 50) this._editUndoStack.shift();
        this.print(`${writeRes.message}。撤销令牌: ${token}（执行 edit undo ${token} 或 edit undo 回滚最近一次）`, 'success');
    }
    _handleEditUndo(args) {
        if (this._editUndoStack.length === 0) {
            this.print('edit undo: 撤销栈为空', 'error');
            return;
        }
        const tokenArg = (args[0] || '').trim();
        let entry;
        if (tokenArg) {
            entry = this._editUndoStack.find(x => x.token === tokenArg);
            if (!entry) { this.print(`edit undo: 未找到令牌 "${tokenArg}"`, 'error'); return; }
            this._editUndoStack = this._editUndoStack.filter(x => x !== entry);
        } else {
            entry = this._editUndoStack.pop();
        }
        const perm = this.checkPathPermission(entry.filePath);
        if (!perm.allowed) { this.print(perm.message, 'error'); this._editUndoStack.push(entry); return; }
        const res = this.fs.writeFileByPath(entry.filePath, entry.undoText);
        if (!res.success) { this.print(res.message, 'error'); this._editUndoStack.push(entry); return; }
        this.print(`edit undo ${entry.token}: 已回滚 "${entry.filePath}" 到修改前内容`, 'success');
    }
    _printEditHelp(short = false) {
        if (short) {
            this.print('edit -h 查看完整用法；常用语法：');
            this.print('  edit file 5 "新内容"         将第5行整行替换');
            this.print('  edit file 3,7 ""            删除第3-7行（替换为空块）');
            this.print('  edit file 3,7 block...      把3-7行换成新内容（可用 \\n 换行）');
            this.print('  edit file s/old/new/g       sed 正则全文件替换');
            this.print('  edit file +5 "inserted"     在第5行前插入一行（-5 则在第5行后）');
            this.print('  edit file >> "line"         文件末尾追加');
            this.print('  edit undo [token]           回滚最后一次（或指定令牌）');
            return;
        }
        this.print('edit: 非交互式文件修改命令（支持相对/绝对路径，父目录不存在会自动创建）');
        this.print('  通用: edit [-y] <文件路径> <操作...>');
        this.print('    -y / --yes            跳过 confirm 直接写入');
        this.print('    -c N / --context N    修改完成后额外打印 N 行上下文预览');
        this.print('  操作语法:');
        this.print('    ① 单行替换:          edit f  <N>       <text>              把第 N 行换成 text（text 可用 \\n 表示多行）');
        this.print('    ② 范围替换:          edit f  <N>,<M>   <block>             删除 N..M 行并替换为 block（block 为空就是删除）');
        this.print('    ③ 正则（sed 风格）:  edit f  s/pat/repl/[flags]            flags: g/i/m 等，分隔符 / | # ! 任选');
        this.print('                            edit f /3,8/ s/pat/repl/g          仅在第 3-8 行内应用正则');
        this.print('    ④ 插入行:            edit f  +<N>      <block>             在第 N 行前插入；-<N> 表示第 N 行后插入');
        this.print('    ⑤ 追加到文件尾:      edit f  >>        <block>');
        this.print('    ⑥ 便捷删除:          edit f  d<N>                         删除第 N 行');
        this.print('                            edit f  d<N>,<M>                    删除 N..M 行');
        this.print('  撤销: edit undo              回滚最后一次 edit 写入');
        this.print('        edit undo U-xxxxxx     回滚 edit 打印出的指定令牌');
    }
    _printEditContext(text, n) {
        const lines = (text || '').split(/\r?\n|\r/);
        if (lines.length === 0) return;
        const head = lines.slice(0, n);
        const tail = lines.length > n * 2 ? lines.slice(-n) : [];
        const header = `── context ${n} 行（共 ${lines.length} 行） ──`;
        this.print(header, 'folder');
        head.forEach((l, i) => this.print(`${String(i + 1).padStart(4)}| ${l}`));
        if (tail.length) {
            this.print(`  ... (省略中间 ${lines.length - head.length - tail.length} 行) ...`);
            const startIdx = lines.length - tail.length;
            tail.forEach((l, i) => this.print(`${String(startIdx + i + 1).padStart(4)}| ${l}`));
        }
    }
    /**
     * 解析 "操作..." 部分为 FSEdit 可接受的 ops 数组。
     * 设计意图：用户只写一行命令，语法尽量贴合直觉；
     * 允许多种糖：sed s///、d3 / d3,7、+5/-5 插入、>> 追加、5 "xx" 单行、3,7 "yy\nzz" 范围。
     */
    _parseEditArgs(tokens) {
        const rawInput = tokens.join(' ');
        // 1) 正则 sed 风格（可前面再跟 /start,end/ scope）
        let scope = null;
        let remain = rawInput;
        const scopeRe = /^\s*\/\s*(\d+)\s*,\s*(\d+)\s*\//;
        const mScope = scopeRe.exec(remain);
        if (mScope) { scope = [Number(mScope[1]), Number(mScope[2])]; remain = remain.slice(mScope[0].length); }
        const sedRe = /^\s*s([\/|#!])((?:[^\\\1]|\\.)*?)\1((?:[^\\\1]|\\.)*?)\1([gimsuy]*)\s*/;
        let mSed = null;
        try { mSed = sedRe.exec(remain); } catch (_) { mSed = null; }
        // 若环境不支持反向引用 \1 且整段失败，退化为兼容解析：按位置找分隔符
        if (!mSed) {
            const m2 = /^\s*s([\/|#!])/.exec(remain);
            if (m2) {
                const S = m2[1];
                const restAfterS = remain.slice(m2[0].length - 1); // 从分隔符位置起
                // restAfterS[0] 就是分隔符 S
                let p1 = -1, p2 = -1, p3 = -1;
                for (let i = 1; i < restAfterS.length; i++) {
                    if (restAfterS[i] === S && restAfterS[i - 1] !== '\\') {
                        if (p1 === -1) p1 = i;
                        else if (p2 === -1) p2 = i;
                        else { p3 = i; break; }
                    }
                }
                if (p1 !== -1 && p2 !== -1) {
                    if (p3 === -1) p3 = restAfterS.length;
                    const pat = restAfterS.slice(1, p1);
                    const repl = restAfterS.slice(p1 + 1, p2);
                    const flags = restAfterS.slice(p2 + 1, p3).replace(/\s+$/,'');
                    const safeSep = S === '/' ? '|' : '/';
                    mSed = [null, S, pat, repl, flags];
                }
            }
        }
        if (mSed) {
            const pat = mSed[2];
            const repl = mSed[3];
            const flags = mSed[4];
            const sep = mSed[1];
            const pattern = `s${sep}${pat}${sep}${repl}${sep}${flags}`;
            const op = { type: 'regex', pattern };
            if (scope) op.scope = scope;
            const r = this._applyAndWrap(op);
            if (!r.ok) return r;
            return { ok: true, result: r.result };
        }
        // 2) 便捷删除 dN 或 dN,M
        const delRe = /^\s*d\s*(\d+)(?:\s*,\s*(\d+))?\s*$/;
        const mDel = delRe.exec(rawInput);
        if (mDel) {
            const s = Number(mDel[1]);
            const e = mDel[2] == null ? s : Number(mDel[2]);
            return this._applyAndWrap({ type: 'delete', start: s, end: e });
        }
        // 3) 追加 >> block
        if (/^\s*>>\s*/.test(rawInput)) {
            const block = this._unescapeNewlines(rawInput.replace(/^\s*>>\s*/, ''));
            return this._applyAndWrap({ type: 'append', block });
        }
        // 4) 插入 +N block / -N block
        const insRe = /^\s*([+-])\s*(\d+)\s+([\s\S]*)$/;
        const mIns = insRe.exec(rawInput);
        if (mIns) {
            const which = mIns[1] === '+' ? 'before' : 'after';
            const line = Number(mIns[2]);
            const block = this._unescapeNewlines(mIns[3]);
            const op = { type: 'insert', block };
            op[which] = line;
            return this._applyAndWrap(op);
        }
        // 5) 范围 N,M block  OR  单行 N <block>
        //    首 token 若为 N,M 或 N 则按此解析，剩余整体作为 text（支持空格 / 引号 / \n）
        const headTok = tokens[0] || '';
        const rangeRe = /^(\d+)\s*,\s*(\d+)$/;
        const lineRe = /^(\d+)$/;
        const mRange = rangeRe.exec(headTok);
        const mLine = lineRe.exec(headTok);
        if (mRange) {
            const s = Number(mRange[1]);
            const e = Number(mRange[2]);
            const restStr = tokens.slice(1).join(' ');
            const block = this._unescapeNewlines(this._stripOptionalQuotes(restStr));
            return this._applyAndWrap({ type: 'range', start: s, end: e, block });
        }
        if (mLine) {
            const ln = Number(mLine[1]);
            const restStr = tokens.slice(1).join(' ');
            const text = this._unescapeNewlines(this._stripOptionalQuotes(restStr));
            return this._applyAndWrap({ type: 'line', line: ln, text });
        }
        return { ok: false, error: '无法识别的操作语法。' };
    }
    _stripOptionalQuotes(s) {
        const t = (s == null ? '' : String(s));
        if (t.length >= 2) {
            const f = t[0]; const last = t[t.length - 1];
            if ((f === '"' && last === '"') || (f === "'" && last === "'")) {
                return t.slice(1, -1);
            }
        }
        return t;
    }
    _unescapeNewlines(s) {
        // 支持写 \n \r \t \\ 四个常用转义；其他保持原样
        return String(s == null ? '' : s)
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');
    }
    /** 为了打印 diff / 提供 undo，这里先在"当前原始文本"上跑一次 FSEdit.apply，
     *  返回包装过的 {ok:true, result:{ops, nextContent, diff, undo}}。
     *  真正写盘由 handleEdit 写入 absPath，undo 保存 snapshot。*/
    _applyAndWrap(op) {
        // 注意：实际使用时，读出来的文本在 handleEdit 里是 originalText，
        // 但我们这里 parse 阶段拿不到 originalText，所以改为返回 ops 让 handleEdit 去 apply。
        // 这里先做语法有效性快速检查：构造 FSEdit 所需的 op 是否能通过基本正则校验（如果是 regex type）。
        if (op.type === 'regex') {
            const raw = String(op.pattern || '');
            const sepChar = raw[1];
            if (!raw.startsWith('s') || !'/|#!'.includes(sepChar)) {
                return { ok: false, error: 'regex 模式应为 s/pattern/replacement/flags' };
            }
            const parts = raw.slice(2).split(sepChar);
            if (parts.length < 3) return { ok: false, error: 'regex 语法不完整' };
            const flags = parts.pop();
            const pattern = parts.slice(0, -1).join(sepChar);
            try { new RegExp(pattern, flags); } catch (e) { return { ok: false, error: '正则语法错误：' + e.message }; }
        }
        // 返回 ops 列表：handleEdit 会用 FSEdit.apply(originalText, [op]) 再执行一次。
        // 这里把 nextContent/diff/undo 都暂时设为 handleEdit 会填充的占位。
        return {
            ok: true,
            result: {
                ops: [op],
                nextContent: null, // 填充见 handleEdit 末尾的计算
                diff: [],
                undo: null,
                _pendingOp: op,
            },
        };
    }
    handleTree(args) {
        const showHidden = args.includes('-a');
        const currentPath = this.fs.getCurrentPath();
        const permission = this.checkPathPermission(currentPath);
        if (!permission.allowed) {
            this.print(permission.message, 'error');
            return;
        }
        const tree = this.fs.getTree(this.fs.currentDir, '', (node) => {
            return this.checkNodePermission(node);
        }, showHidden);
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
        const sourcePath = Path.resolveUnder(filename, this.fs.getCurrentPath());
        const permission1 = this.checkPathPermission(sourcePath);
        if (!permission1.allowed) {
            this.print(permission1.message, 'error');
            return;
        }
        if (this.fs.isSystemPath(this.fs.getCurrentPath())) {
            this.print('系统目录为只读，无法移动文件', 'error');
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
        if (this.fs.isSystemPath(targetDirPath)) {
            this.print('目标系统目录为只读，无法移动文件到此处', 'error');
            return;
        }
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
            return;
        }
        const filename = args[0];
        const targetPath = args.length > 1 ? args.slice(1).join(' ') : '.';
        const sourcePath = Path.resolveUnder(filename, this.fs.getCurrentPath());
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
        if (this.fs.isSystemPath(targetDirPath)) {
            this.print('目标系统目录为只读，无法复制文件到此处', 'error');
            return;
        }
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
        if (this.fs.isSystemPath(this.fs.getCurrentPath())) {
            this.print('系统目录为只读，无法导入文件', 'error');
            return;
        }
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
        if (!dirResult.success && dirResult.message !== '用户目录已存在') {
            this.userManager.deleteUser(username);
            this.print(dirResult.message, 'error');
            return;
        }
        this.print(userResult.message, 'success');
        this.print(`用户目录 "/user/${username}" 已就绪`, 'success');
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
        const isInDeletedUserDir = currentPath.includes(`/user/${username}`);
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
        const owner = this.fs.getPathOwner(targetPath);
        if (owner === null) {
            return { allowed: true };
        }
        if (owner === this.currentUser.username) {
            return { allowed: true };
        }
        return {
            allowed: false,
            message: `权限被拒绝：无法访问用户 "${owner}" 的私有目录`
        };
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
                    detail: { path: filename }
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
                detail: { appData: appData }
            });
            document.dispatchEvent(event);
        } catch (e) {
            this.print(`运行应用失败: ${e.message}`, 'error');
        }
    }
    handleWallpaper(args) {
        if (args.length === 0) {
            this.print('用法: wallpaper <solid|gradient|image|video> [参数...]', 'error');
            this.print('  wallpaper solid #ff0000');
            this.print('  wallpaper gradient #ff0000 #0000ff 135deg');
            return;
        }
        const type = args[0].toLowerCase();
        let wp;
        if (type === 'solid') {
            wp = { type: 'solid', color: args[1] || '#0c3547' };
        } else if (type === 'gradient') {
            wp = { type: 'gradient', start: args[1] || '#0c3547', end: args[2] || '#14a085', direction: args[3] || '135deg' };
        } else {
            this.print(`不支持的壁纸类型: ${type}`, 'error');
            return;
        }
        document.dispatchEvent(new CustomEvent('wallpaper-changed', { detail: wp }));
        this.print(`壁纸已设置为 ${type}`, 'success');
    }
    handleTheme(args) {
        if (args.length === 0) {
            this.print('用法: theme <颜色值>', 'error');
            this.print('  theme #1abc9c');
            return;
        }
        const color = args[0];
        localStorage.setItem('webos-accent-color', color);
        document.dispatchEvent(new CustomEvent('accent-color-changed', { detail: { color } }));
        try {
            const root = document.documentElement;
            root.style.setProperty('--accent-color', color);
        } catch (e) {}
        this.print(`主题色已设置为 ${color}`, 'success');
    }
    handleFont(args) {
        if (args.length === 0) {
            this.print('用法: font <大小>', 'error');
            this.print('  font 14');
            return;
        }
        const size = args[0];
        localStorage.setItem('webos-font-size', size);
        try { document.documentElement.style.fontSize = size + 'px'; } catch (e) {}
        this.print(`字体大小已设置为 ${size}px`, 'success');
    }
    handleOpacity(args) {
        if (args.length === 0) {
            this.print('用法: opacity <70-100>', 'error');
            return;
        }
        const value = args[0];
        localStorage.setItem('webos-window-opacity', value);
        this.print(`窗口透明度已设置为 ${value}%`, 'success');
    }
    handleAnimations(args) {
        const enabled = args[0] === 'on' || args[0] === 'true';
        localStorage.setItem('webos-animations', enabled ? 'true' : 'false');
        this.print(`窗口动画已${enabled ? '开启' : '关闭'}`, 'success');
    }
    handleAutohide(args) {
        const enabled = args[0] === 'on' || args[0] === 'true';
        localStorage.setItem('webos-taskbar-autohide', enabled ? 'true' : 'false');
        document.dispatchEvent(new CustomEvent('taskbar-autohide-changed', { detail: { enabled } }));
        this.print(`任务栏自动隐藏已${enabled ? '开启' : '关闭'}`, 'success');
    }
    handleLanguage(args) {
        if (args.length === 0) {
            this.print('用法: language <cmn|eng|jpn>', 'error');
            return;
        }
        const lang = args[0];
        localStorage.setItem('webos-language', lang);
        document.dispatchEvent(new CustomEvent('language-changed', { detail: { lang } }));
        this.print(`语言已切换为 ${lang}`, 'success');
    }
    handleApps(args) {
        if (args.length === 0 || args[0] === 'list') {
            this.print('已安装的应用:');
            try {
                const apps = window.getInstalledApps ? window.getInstalledApps() : [];
                if (apps.length === 0) {
                    this.print('  (无第三方应用)');
                } else {
                    apps.forEach(app => {
                        this.print(`  ${app.path} - ${app.name} v${app.version || '1.0.0'}`);
                    });
                }
            } catch (e) {
                this.print('  无法获取应用列表', 'error');
            }
        } else if (args[0] === 'run' && args[1]) {
            const appPath = args[1].endsWith('.app') ? args[1] : args[1] + '.app';
            document.dispatchEvent(new CustomEvent('app-launch-real', { detail: { path: appPath } }));
            this.print(`正在启动 ${appPath}...`, 'success');
        } else {
            this.print('用法: apps [list|run <应用名>]', 'error');
        }
    }
    handleSettings() {
        document.dispatchEvent(new CustomEvent('app-launch-real', { detail: { path: 'settings.app' } }));
        this.print('正在打开设置...', 'success');
    }
    handleHelp() {
        this.print('可用命令:');
        this.print('  ls [-a]                    - 列出当前目录内容 (-a 显示系统目录)');
        this.print('  pwd                       - 显示当前路径');
        this.print('  cd <文件夹名>              - 进入指定文件夹');
        this.print('  cd ..                     - 返回上级目录');
        this.print('  new folder <文件夹名>      - 创建新文件夹');
        this.print('  new file <文件名>          - 创建新文件');
        this.print('  delete <文件名>            - 删除文件或文件夹');
        this.print('  rename <旧名称> <新名称>   - 重命名文件或文件夹');
        this.print('  open <文件名>              - 使用vi编辑器打开文件');
        this.print('  tree [-a]                 - 递归显示当前目录结构');
        this.print('  move <文件名> <路径>       - 移动文件到指定路径');
        this.print('  copy <文件名> [路径]       - 复制文件到指定路径');
        this.print('  export <文件/文件夹>       - 导出文件或文件夹为zip');
        this.print('  import [URL]              - 导入本地文件或从URL导入');
        this.print('  run <appname.app>         - 运行 .app 应用程序');
        this.print('  wallpaper <类型> [参数]    - 设置壁纸 (solid/gradient)');
        this.print('  theme <颜色>               - 设置主题色');
        this.print('  font <大小>                - 设置字体大小');
        this.print('  opacity <70-100>          - 设置窗口透明度');
        this.print('  animations <on|off>       - 开关窗口动画');
        this.print('  autohide <on|off>         - 开关任务栏自动隐藏');
        this.print('  language <cmn|eng|jpn>   - 切换语言');
        this.print('  apps [list|run <名称>]    - 管理应用程序');
        this.print('  settings                   - 打开设置');
        this.print('  whoami                     - 显示当前用户');
        this.print('  date                       - 显示当前时间');
        this.print('  echo <文本>                - 输出文本');
        this.print('  cat <文件>                 - 查看文件内容');
        this.print('  account new <用户名> [密码]  - 创建新用户');
        this.print('  account switch <用户名>     - 切换用户');
        this.print('  account delete <用户名>     - 删除用户');
        this.print('  clear                     - 清空屏幕');
        this.print('  help                      - 显示此帮助信息');
        this.print('  edit -h                   - 非交互式修改文件（sed/行替换/增删/追加）');
        this.print('');
        this.print('目录说明:');
        this.print('  /application/             - 系统应用（只读）');
        this.print('  /languages/               - 语言包（只读）');
        this.print('  /user/<你的用户名>/        - 你的个人目录');
        this.print('    info/                   - 系统配置（隐藏，ls -a 可见）');
        this.print('    appinfo/                - 应用数据（隐藏，ls -a 可见）');
        this.print('  其他用户的目录             - 不可访问');
        this.print('');
        this.print('vi编辑器快捷键:');
        this.print('  i                         - 进入插入模式');
        this.print('  Esc                       - 返回正常模式');
        this.print('  :w                        - 保存文件');
        this.print('  :q                        - 退出编辑器');
        this.print('  :wq                       - 保存并退出');
        this.print('  :q!                       - 强制退出（不保存）');
        this.print('  dd                        - 删除当前行');
        this.print('  x                         - 删除当前字符');
        this.print('  u                         - 撤销');
    }
}
export default Terminal;