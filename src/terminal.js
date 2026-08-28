import UserManager from './user-manager.js?v=18';
import FileSystem from './file-system.js?v=18';
import ViEditor from './vi-editor.js?v=18';
import AppManager from './app-manager.js?v=18';
import { Path, FSEdit } from './lib/index.js?v=18';
const HISTORY_FILE_NAME = 'history.json';
const EDIT_UNDO_FILE_NAME = 'editUndoStack.json';
const EDIT_UNDO_MAX = 50;
// 命令按字母顺序排列（此数组也用于 Tab 补全）
const COMMANDS = [
    'account', 'animations', 'apps', 'autohide',
    'cat', 'cd', 'clear', 'copy',
    'date', 'delete',
    'echo', 'edit', 'export',
    'font',
    'help', 'history',
    'import',
    'language', 'ls',
    'move', 'new',
    'open', 'opacity',
    'pwd',
    'rename', 'run',
    'settings',
    'theme', 'tree',
    'wallpaper', 'whoami',
];
// 命令帮助元数据（按字母顺序），help 输出直接从此表生成并做两列对齐
const HELP_ROWS = [
    ['account <new|switch|delete> [用户名] [密码]', '创建 / 切换 / 删除用户'],
    ['animations <on|off>',                      '开启或关闭窗口动画'],
    ['apps [list|run <应用名>]',                 '列出 / 启动已安装应用'],
    ['autohide <on|off>',                        '开启或关闭任务栏自动隐藏'],
    ['cat [-n] <文件|路径> [...]',               '直接在终端输出文件内容（不进入 vi）'],
    ['cd <目录|..> [..]',                        '进入指定目录；cd .. 返回上级；cd 回到家目录'],
    ['clear',                                    '清空终端屏幕'],
    ['copy <源文件> [目标路径]',                 '复制文件到目标路径（缺省则复制到当前目录同名副本）'],
    ['date',                                     '显示当前日期与时间'],
    ['delete <文件或目录>',                      '删除文件或文件夹（需要确认）'],
    ['echo [-n] [-e] <文本...>',                 '输出文本到终端（-n 不换行，-e 解析 \\n \\t \\ 转义）'],
    ['edit [-y|--confirm] [-c N] <路径> <操作>', '非交互式修改文件；edit undo [令牌] 撤销'],
    ['export <文件|目录>',                       '把文件或目录下载到本地（目录打包为 zip）'],
    ['font <大小>',                              '设置系统字体大小（单位 px）'],
    ['help [-a] [-c <命令>]',                    '显示本帮助；-c 查看某条命令的详细用法'],
    ['history [-c|--clear] [N]',                 '查看 / 清空命令历史（存于 ~/info/history.json）'],
    ['import [URL]',                             '从本地文件或 URL 导入内容到当前目录'],
    ['language <cmn|eng|jpn>',                   '切换界面语言'],
    ['ls [-a] [-l] [路径]',                      '列出目录内容（-a 显示隐藏/系统目录，-l 含行号/大小）'],
    ['move <源> <目标路径>',                     '移动文件或目录到指定位置'],
    ['new <folder|file> <名称>',                 '在当前目录创建新文件夹或新文件'],
    ['open <文件>',                              '在 vi 编辑器中打开文件（可编辑并保存）'],
    ['opacity <70-100>',                         '设置窗口透明度百分比'],
    ['pwd',                                      '打印当前工作目录的绝对路径'],
    ['rename <旧名称> <新名称>',                 '重命名当前目录下的文件或文件夹'],
    ['run <xxx.app>',                            '运行 .app 应用（等同于从桌面打开）'],
    ['settings',                                 '打开设置应用'],
    ['theme <颜色>',                             '设置系统主题色（#rrggbb）'],
    ['tree [-a] [路径]',                         '以树形递归显示目录结构'],
    ['wallpaper <solid|gradient> [颜色...]',     '设置桌面壁纸（纯色 / 渐变）'],
    ['whoami',                                   '显示当前登录用户名'],
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
        // edit undo 栈保存到 /user/<name>/info/editUndoStack.json；
        // 同时在所有 Terminal 实例间共享静态缓存，避免新开窗口栈为空。
        this._editUndoStack = [];
        this.init();
    }
    // ----- 路径辅助：当前用户 info 目录绝对路径 -----
    _userInfoDir() {
        const username = (this.currentUser && this.currentUser.username) || 'public';
        return `/user/${username}/info`;
    }
    _historyFile() { return `${this._userInfoDir()}/${HISTORY_FILE_NAME}`; }
    _undoFile()    { return `${this._userInfoDir()}/${EDIT_UNDO_FILE_NAME}`; }
    // ----- 持久化：统一走 storage，父目录不存在会自动创建 -----
    _readVfsText(path) {
        try {
            const storage = this.fs.storage;
            if (!storage || typeof storage.readFile !== 'function') return null;
            const c = storage.readFile(path);
            return typeof c === 'string' ? c : null;
        } catch (e) { return null; }
    }
    _writeVfsText(path, text) {
        try {
            const storage = this.fs.storage;
            if (!storage || typeof storage.writeFile !== 'function') return false;
            storage.writeFile(path, text);
            return true;
        } catch (e) { return false; }
    }
    loadHistory() {
        // 1) 从 VFS ~/info/history.json 读取；
        // 2) 若不存在，尝试迁移旧 localStorage `web-terminal-os-history`，写回 VFS。
        const file = this._historyFile();
        const raw = this._readVfsText(file);
        if (raw) {
            try { this.history = JSON.parse(raw); return; } catch (e) { this.history = []; }
        }
        const legacy = localStorage.getItem('web-terminal-os-history');
        if (legacy) {
            try { this.history = JSON.parse(legacy); } catch (e) { this.history = []; }
            this.saveHistory();
            try { localStorage.removeItem('web-terminal-os-history'); } catch (e) {}
        }
    }
    saveHistory() {
        const payload = JSON.stringify(this.history || []);
        this._writeVfsText(this._historyFile(), payload);
    }
    _loadUndoStack() {
        // 多 Terminal 实例共享：优先用静态单例，其次读 VFS 文件
        const S = Terminal;
        if (S._sharedUndoStack && S._sharedUndoStackUser === this.currentUser.username) {
            this._editUndoStack = S._sharedUndoStack;
            return;
        }
        const raw = this._readVfsText(this._undoFile());
        if (raw) {
            try { this._editUndoStack = JSON.parse(raw); } catch (e) { this._editUndoStack = []; }
            if (!Array.isArray(this._editUndoStack)) this._editUndoStack = [];
        } else {
            this._editUndoStack = [];
        }
        S._sharedUndoStack = this._editUndoStack;
        S._sharedUndoStackUser = this.currentUser.username;
    }
    _saveUndoStack() {
        // 裁到 MAX 再写；同时刷新静态共享指针
        if (this._editUndoStack.length > EDIT_UNDO_MAX) {
            this._editUndoStack.splice(0, this._editUndoStack.length - EDIT_UNDO_MAX);
        }
        Terminal._sharedUndoStack = this._editUndoStack;
        Terminal._sharedUndoStackUser = this.currentUser.username;
        this._writeVfsText(this._undoFile(), JSON.stringify(this._editUndoStack));
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
        this._loadUndoStack();
        document.addEventListener('user-switched', (e) => {
            const username = e.detail.username;
            const user = this.userManager.getUser(username);
            if (user) {
                this.currentUser = user;
                this.userManager.setCurrentUser(username);
                this.initUserEnvironment();
                this.updatePrompt();
                this.loadHistory();
                this._loadUndoStack();
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
        // 通用 -h/--help 拦截（edit/help 自处理，不在这里拦截以便 edit undo / help -c 等子命令）
        if (command !== 'edit' && command !== 'help' && (args.includes('-h') || args.includes('--help'))) {
            this._printCommandHelp(command);
            return;
        }
        switch (command) {
            case 'account':      this.handleAccount(args);      break;
            case 'animations':   this.handleAnimations(args);   break;
            case 'apps':         this.handleApps(args);         break;
            case 'autohide':     this.handleAutohide(args);     break;
            case 'cat':          this.handleCat(args);          break;
            case 'cd':           this.handleCd(args);           break;
            case 'clear':        this.handleClear();            break;
            case 'copy':         this.handleCopy(args);         break;
            case 'date':
                if (args.length === 0) this.print(new Date().toLocaleString('zh-CN'));
                else this.print(new Date().toLocaleString(args[0]));
                break;
            case 'delete':       this.handleDelete(args);       break;
            case 'echo':         this.handleEcho(args);         break;
            case 'edit':         this.handleEdit(args);         break;
            case 'export':       this.handleExport(args);       break;
            case 'font':         this.handleFont(args);         break;
            case 'help':         this.handleHelp(args);         break;
            case 'history':      this.handleHistory(args);      break;
            case 'import':       this.handleImport(args);       break;
            case 'language':     this.handleLanguage(args);     break;
            case 'ls':           this.handleLs(args);           break;
            case 'move':         this.handleMove(args);         break;
            case 'new':          this.handleNew(args);          break;
            case 'open':         this.handleOpen(args);         break;
            case 'opacity':      this.handleOpacity(args);      break;
            case 'pwd':          this.handlePwd();              break;
            case 'rename':       this.handleRename(args);       break;
            case 'run':          this.handleRun(args);          break;
            case 'settings':     this.handleSettings();         break;
            case 'theme':        this.handleTheme(args);        break;
            case 'tree':         this.handleTree(args);         break;
            case 'wallpaper':    this.handleWallpaper(args);    break;
            case 'whoami':       this.print(this.currentUser.username); break;
            default:
                this.print(`未知命令: ${command}，输入 "help" 查看可用命令`, 'error');
        }
    }
    // 单命令详细帮助（按命令名分发）：每个命令都配一份 -h 输出
    _printCommandHelp(name) {
        const pad = (s, n) => { const t = s || ''; return t.length >= n ? t : t + ' '.repeat(n - t.length); };
        const lines = (lns) => { lns.forEach(l => this.print(l)); };
        this.print(`${name} - 详细用法`, 'folder');
        switch (name) {
            case 'ls':
                lines([
                    `  ${pad('ls [-a] [-l] [路径]', 34)}  列出目录内容`,
                    `  ${pad('-a / --all', 34)}  显示隐藏目录 (info/appinfo) 与系统目录 (/languages /application)`,
                    `  ${pad('-l / --long', 34)}  显示为「长列表」：类型 + 名称 + 大小(字节)`,
                    `  ${pad('路径', 34)}  支持相对/绝对；缺省为当前目录`,
                ]);
                break;
            case 'pwd':
                lines([`  ${pad('pwd', 34)}  打印当前工作目录的绝对路径`]); break;
            case 'cd':
                lines([
                    `  ${pad('cd <目录名|绝对路径>', 34)}  切换到目标目录`,
                    `  ${pad('cd ..', 34)}  回到上级目录（离开自己家目录会自动登出）`,
                    `  ${pad('cd  （无参数）', 34)}  回到 ~/ 家目录`,
                ]);
                break;
            case 'new':
                lines([
                    `  ${pad('new folder <名称>', 34)}  在当前目录创建新文件夹`,
                    `  ${pad('new file   <名称>', 34)}  在当前目录创建新文件（空内容）`,
                    '  * 系统目录 (/application /languages) 与其他用户家目录为只读。',
                ]);
                break;
            case 'delete':
                lines([
                    `  ${pad('delete <名称>', 34)}  删除当前目录下的文件或文件夹（需确认）`,
                ]);
                break;
            case 'rename':
                lines([`  ${pad('rename <旧名称> <新名称>', 34)}  重命名当前目录下的文件或文件夹`]); break;
            case 'open':
                lines([
                    `  ${pad('open <文件名|路径>', 34)}  在 vi 编辑器中打开文件（可编辑 / 保存 / 退出）`,
                    '  vi 常用键：i 插入  Esc 命令模式  :w 保存  :q 退出  :wq 保存退出  :q! 放弃  u 撤销',
                ]);
                break;
            case 'clear':
                lines([`  ${pad('clear', 34)}  清空终端屏幕，重新打印欢迎信息`]); break;
            case 'tree':
                lines([
                    `  ${pad('tree [-a] [路径]', 34)}  递归显示目录结构（树状）`,
                    `  ${pad('-a', 34)}  同时显示隐藏目录 (info/appinfo)`,
                ]);
                break;
            case 'move': case 'mv':
                lines([
                    `  ${pad('move <源名称> <目标路径>', 34)}  把文件或文件夹移动到目标位置`,
                    `  ${pad('', 34)}  目标路径可以是相对路径、.. 或绝对路径`,
                ]);
                break;
            case 'copy': case 'cp':
                lines([
                    `  ${pad('copy <源名称> [目标路径]', 34)}  复制文件到目标（目录相同会生成「源名 副本」）`,
                    `  ${pad('', 34)}  目标路径缺省为当前目录`,
                ]);
                break;
            case 'export':
                lines([
                    `  ${pad('export <文件|目录>', 34)}  从 VFS 下载到本地：文件直接下载；目录打包为 .zip`,
                ]);
                break;
            case 'import':
                lines([
                    `  ${pad('import', 34)}  弹出本地文件选择器导入到当前目录`,
                    `  ${pad('import <URL>', 34)}  从 URL 下载文件并导入（可能受 CORS 限制）`,
                ]);
                break;
            case 'account':
                lines([
                    `  ${pad('account new    <用户名> [密码]', 34)}  创建新用户（自动创建 /user/<name>）`,
                    `  ${pad('account switch <用户名>', 34)}  切换当前登录用户（若设密码需验证）`,
                    `  ${pad('account delete <用户名>', 34)}  删除用户（需密码；当前登录用户不可删）`,
                ]);
                break;
            case 'run':
                lines([`  ${pad('run <xxx.app>', 34)}  运行已安装的 .app 应用（等同桌面/任务栏打开）`]); break;
            case 'wallpaper':
                lines([
                    `  ${pad('wallpaper solid    <#color>', 34)}  设置纯色壁纸`,
                    `  ${pad('wallpaper gradient <#start> <#end> [deg]', 34)}  设置线性渐变壁纸（角度默认 135deg）`,
                ]);
                break;
            case 'theme':
                lines([`  ${pad('theme <#rrggbb>', 34)}  设置主题色（保存到 localStorage 并即时生效）`]); break;
            case 'font':
                lines([`  ${pad('font <数字>', 34)}  设置系统字体大小（像素），例如 font 14`]); break;
            case 'opacity':
                lines([`  ${pad('opacity <70..100>', 34)}  设置窗口透明度百分比（<70 会被 UI 拒绝）`]); break;
            case 'animations':
                lines([`  ${pad('animations <on|off>', 34)}  开关窗口动画（off 时全局注入 transition:none）`]); break;
            case 'autohide':
                lines([`  ${pad('autohide <on|off>', 34)}  开关任务栏自动隐藏`]); break;
            case 'language':
                lines([
                    `  ${pad('language cmn', 34)}  切换为简体中文`,
                    `  ${pad('language eng', 34)}  切换为英文`,
                    `  ${pad('language jpn', 34)}  切换为日文`,
                    '  语言文件位于 /languages/ 目录（可在文件管理器中查看）。',
                ]);
                break;
            case 'apps':
                lines([
                    `  ${pad('apps', 34)}  同 apps list`,
                    `  ${pad('apps list', 34)}  列出已安装的第三方应用（不显示内置系统应用）`,
                    `  ${pad('apps run <名称>[.app]', 34)}  按名称启动应用（自动补 .app）`,
                ]);
                break;
            case 'settings':
                lines([`  ${pad('settings', 34)}  打开设置应用（图形界面）`]); break;
            case 'whoami':
                lines([`  ${pad('whoami', 34)}  打印当前登录用户名`]); break;
            case 'date':
                lines([
                    `  ${pad('date', 34)}  以 zh-CN 本地化格式打印当前时间`,
                    `  ${pad('date <locale>', 34)}  以指定 locale 打印，例如 date en-US / date ja-JP`,
                ]);
                break;
            case 'echo':
                lines([
                    `  ${pad('echo [-n] [-e] <文本...>', 34)}  把参数原样打印到终端（不进 vi、不触发 open）`,
                    `  ${pad('  -n', 34)}  末尾不补换行（和 bash 一致）`,
                    `  ${pad('  -e', 34)}  解析 \\n / \\t / \\\\ / \\0 转义（默认只当纯文本）`,
                    '  典型用途：快速构造文本后配合 edit / copy / export 落地成文件，或测试转义输出。',
                ]);
                break;
            case 'cat':
                lines([
                    `  ${pad('cat [-n] <文件|路径> [...]', 34)}  直接在终端打印一个或多个文件的全文（不进入 vi）`,
                    `  ${pad('  -n', 34)}  每行前面打印行号（1 起）`,
                    `  ${pad('', 34)}  遇到文件夹 / 二进制 data: URL 会打印对应提示或跳过`,
                ]);
                break;
            case 'history':
                lines([
                    `  ${pad('history [N]', 34)}  打印最近 N 条历史（缺省全部，上限 100）`,
                    `  ${pad('history -c / --clear', 34)}  清空当前用户的命令历史`,
                    `  存储位置：~/info/${HISTORY_FILE_NAME}（文件管理器 ls -a ~/info 可见）。`,
                ]);
                break;
            case 'help':
                lines([
                    `  ${pad('help', 34)}  按字母顺序打印所有命令及中文说明（两列对齐）`,
                    `  ${pad('help -a', 34)}  打印完整帮助（命令表 + 目录说明 + vi 快捷键）`,
                    `  ${pad('help -c <命令>', 34)}  查看某条命令的详细用法（等同 <命令> -h）`,
                ]);
                break;
            default:
                this.print(`  暂无单独帮助条目。输入 help 查看总览。`);
        }
    }
    handleLs(args) {
        let pathArg = null;
        const flags = [];
        for (const a of args) {
            if (a.startsWith('-') && a.length > 1) flags.push(...a.slice(1).split(''));
            else pathArg = a;
        }
        const showHidden = flags.includes('a');
        const longFmt  = flags.includes('l');
        const oldDir = this.fs.currentDir;
        if (pathArg) {
            const abs = Path.resolveUnder(pathArg, this.fs.getCurrentPath());
            const perm = this.checkPathPermission(abs);
            if (!perm.allowed) { this.print(perm.message, 'error'); return; }
            const node = this.fs.resolvePath(abs);
            if (!node) { this.print(`ls: 找不到路径 "${pathArg}"`, 'error'); return; }
            if (node.type === 'file') {
                // ls 单个文件
                const size = this._approxSize(node.content);
                this.print(longFmt ? `[FILE]  ${String(size).padStart(8)}  ${node.name}` : `[FILE] ${node.name}`, 'file');
                return;
            }
            this.fs.currentDir = node;
        }
        const items = this.fs.ls(showHidden);
        if (items.length === 0) { this.print('当前目录为空'); if (pathArg) this.fs.currentDir = oldDir; return; }
        items.forEach(item => {
            const tag = item.type === 'folder'
                ? (this.fs.isHiddenDir(item.name) ? '[SYS] ' : '[DIR] ')
                : '[FILE]';
            const cls = item.type === 'folder'
                ? (this.fs.isHiddenDir(item.name) ? 'folder system-folder' : 'folder')
                : 'file';
            if (longFmt) {
                const size = item.type === 'file' ? this._approxSize(item.content) : '-';
                this.print(`${tag}  ${String(size).padStart(8)}  ${item.name}`, cls);
            } else {
                this.print(`${tag}  ${item.name}`, cls);
            }
        });
        if (pathArg) this.fs.currentDir = oldDir;
    }
    _approxSize(content) {
        if (content == null) return 0;
        if (typeof content !== 'string') return String(content).length;
        if (content.startsWith('data:')) {
            // data:[<mediatype>][;base64],<data> — base64 段按 3/4 估算二进制字节
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
    handlePwd() {
        this.print(this.fs.getCurrentPath());
    }
    handleCd(args) {
        if (!args[0]) {
            // 无参数：回家目录
            const home = this.fs.getHomeDir(this.currentUser.username);
            if (home) {
                const currentPath = this.fs.getCurrentPath();
                this.fs.currentDir = home;
                this.updatePrompt();
                this.checkLogoutOnExitHome(currentPath);
            }
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
    //  cat / echo / history — 输出类
    // ====================================================================
    handleCat(args) {
        if (args.length === 0) { this.print('cat: 需要至少一个文件路径。cat -h 查看用法。', 'error'); return; }
        let showLineNo = false;
        const files = [];
        let dashDash = false;
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (dashDash) { files.push(a); continue; }
            if (a === '--') { dashDash = true; continue; }
            if (a === '-n') { showLineNo = true; continue; }
            if (a.startsWith('-')) {
                this.print(`cat: 忽略未知标志 "${a}"`, 'error');
                continue;
            }
            files.push(a);
        }
        if (files.length === 0) { this.print('cat: 需要至少一个文件路径。', 'error'); return; }
        for (let idx = 0; idx < files.length; idx++) {
            const f = files[idx];
            const abs = Path.resolveUnder(f, this.fs.getCurrentPath());
            const perm = this.checkPathPermission(abs);
            if (!perm.allowed) { this.print(perm.message, 'error'); continue; }
            const file = this.fs.getFileByPath(f);
            if (!file) { this.print(`cat: 找不到文件 "${f}"`, 'error'); continue; }
            if (file.type !== 'file') {
                this.print(`cat: "${f}" 是文件夹，跳过`, 'error'); continue;
            }
            const content = file.content;
            if (typeof content !== 'string') {
                this.print(`cat: "${f}" 内容无法读取`, 'error'); continue;
            }
            if (content.startsWith('data:')) {
                // 二进制 / 资源型 dataURL：不直接展开，给出大小提示
                const size = this._approxSize(content);
                this.print(`cat: "${f}" 为二进制/嵌入资源（约 ${size} 字节），不在终端展开`, 'folder');
                continue;
            }
            if (files.length > 1) this.print(`──── ${f} ────`, 'folder');
            const lines = content.length === 0 ? [''] : content.split(/\r?\n|\r/);
            // 末尾空换行如果是因最后一个 \n 切出的空串，保留（cat 通常按字节原样；我们逐行打印也等价）
            const width = String(lines.length).length;
            for (let i = 0; i < lines.length; i++) {
                const prefix = showLineNo ? `${String(i + 1).padStart(width)}  ` : '';
                this.printRaw(prefix + lines[i]);
            }
        }
    }
    handleEcho(args) {
        // bash 风格：-n 不换行；-e 启用 \n \t \\ \0；顺序不敏感
        let noNewline = false;
        let escapeOn = false;
        const rest = [];
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === '--') { rest.push(...args.slice(i + 1)); break; }
            if (a === '-n') { noNewline = true; continue; }
            if (a === '-e') { escapeOn  = true; continue; }
            if (a === '-ne' || a === '-en') { noNewline = true; escapeOn = true; continue; }
            rest.push(a);
        }
        let text = rest.join(' ');
        // 剥用户可能加的首尾一对引号（双或单），便于 echo -e "a\nb" -> a<newline>b
        text = this._stripOptionalQuotes(text);
        if (escapeOn) {
            // 常见 bash echo -e 子集：\n \r \t \\ \0 \a \b \f \v
            text = text
                .replace(/\\0/g, '\0').replace(/\\a/g, '\x07').replace(/\\b/g, '\x08')
                .replace(/\\f/g, '\f').replace(/\\n/g, '\n').replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t').replace(/\\v/g, '\v').replace(/\\\\/g, '\\');
        }
        // noNewline 模式下：一行输出不补换行；普通模式补换行
        if (noNewline) this.printRawInline(text || '');
        else {
            // 支持 \n 多行打印（保留换行分割语义）
            if (text.indexOf('\n') === -1) this.print(text);
            else for (const ln of text.split('\n')) this.print(ln);
        }
    }
    handleHistory(args) {
        if (args.includes('-c') || args.includes('--clear')) {
            this.history = [];
            this.saveHistory();
            this.print('命令历史已清空', 'success');
            return;
        }
        const maxN = args.length > 0 && /^\d+$/.test(args[0]) ? parseInt(args[0], 10) : this.history.length;
        if (maxN <= 0) return;
        const slice = this.history.slice(0, maxN);
        const width = String(slice.length).length;
        for (let i = 0; i < slice.length; i++) {
            this.print(`${String(i + 1).padStart(width)}  ${slice[i]}`);
        }
    }
    // print 辅助：不自动换行（用于 echo -n 及 cat 保留原文）
    printRaw(text) {
        // 用 div，每段一行；内容完全原样（textContent）
        const div = document.createElement('div');
        div.textContent = text;
        this.output.appendChild(div);
        this.scrollToBottom();
    }
    printRawInline(text) {
        // 用 span，不换行（只适合 echo -n 之类少量内联输出）
        const span = document.createElement('div');
        span.style.whiteSpace = 'pre';
        span.style.display = 'inline-block';
        span.textContent = text;
        this.output.appendChild(span);
        this.scrollToBottom();
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
        // ---- 解析标志位（默认不再弹 confirm；若需要确认用 --confirm）---------------
        //   -y / --yes       保留（向后兼容，同默认）
        //   --confirm        反而需要 confirm
        //   -c N / --context N  上下文预览
        let assumeYes = true;
        let withContext = 0;
        const flagArgs = [];
        let rest = [];
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === '-y' || a === '--yes') { assumeYes = true; continue; }
            if (a === '--confirm') { assumeYes = false; continue; }
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
        this._saveUndoStack(); // 同时写 ~/info/editUndoStack.json + 共享静态栈
        this.print(`${writeRes.message}。撤销令牌: ${token}（执行 edit undo ${token} 或 edit undo 回滚最近一次）`, 'success');
    }
    _handleEditUndo(args) {
        // 确保栈最新：以防别的 Terminal 窗口 / 上次页面关闭后从 VFS 回灌
        this._loadUndoStack();
        if (this._editUndoStack.length === 0) {
            this.print('edit undo: 撤销栈为空', 'error');
            this.print('  提示：撤销栈保存在 ~/info/editUndoStack.json，新开窗口 / 刷新后仍可撤销。', 'folder');
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
        if (!perm.allowed) { this.print(perm.message, 'error'); this._editUndoStack.push(entry); this._saveUndoStack(); return; }
        const res = this.fs.writeFileByPath(entry.filePath, entry.undoText);
        if (!res.success) { this.print(res.message, 'error'); this._editUndoStack.push(entry); this._saveUndoStack(); return; }
        this._saveUndoStack();
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
        this.print('  通用: edit [--confirm] [-c N] <文件路径> <操作...>');
        this.print('    (默认)                  直接写入，不再弹窗确认');
        this.print('    --confirm               改回弹窗确认（危险操作时使用）');
        this.print('    -y / --yes              兼容保留，作用同默认');
        this.print('    -c N / --context N      修改后额外打印 N 行上下文预览');
        this.print(`  撤销栈: 每用户独立，持久化于 ~/info/${EDIT_UNDO_FILE_NAME}（上限 ${EDIT_UNDO_MAX} 条，刷新/开新窗口仍可撤销）`);
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
    handleHelp(args = []) {
        // help -c <cmd>  → 单命令详细帮助
        const ci = args.indexOf('-c');
        if (ci !== -1 && args[ci + 1]) {
            this._printCommandHelp(args[ci + 1].toLowerCase());
            return;
        }
        const full = args.includes('-a') || args.includes('--all');
        const pad = (s, n) => { const t = s || ''; return t.length >= n ? t : t + ' '.repeat(n - t.length); };
        this.print('可用命令（按字母顺序，<命令> -h 查看详细用法）:', 'folder');
        // HELP_ROWS 按字母顺序；统一列宽 + 两列对齐
        const cmdWidth = HELP_ROWS.reduce((m, r) => Math.max(m, r[0].length), 10) + 4;
        for (const [sig, desc] of HELP_ROWS) {
            this.print(`  ${pad(sig, cmdWidth)} ${desc}`);
        }
        this.print('');
        this.print(`  ${pad('help -c <命令>', cmdWidth)} 查看某条命令的详细用法（例：help -c edit / help -c ls）`, '');
        this.print(`  ${pad('<命令> -h / --help', cmdWidth)} 同上，任意命令都支持这两个标志。`, '');
        if (!full) {
            this.print('');
            this.print('（help -a 可查看完整内容：目录说明 + vi 编辑器快捷键）', 'folder');
            return;
        }
        this.print('');
        this.print('目录说明:', 'folder');
        this.print(`  ${pad('/application/', 28)} 系统应用（只读，文件管理器可见）`);
        this.print(`  ${pad('/languages/', 28)} 语言包（只读，存储 JSON 字符串，文件管理器可见）`);
        this.print(`  ${pad('/user/<你的用户名>/', 28)} 你的个人目录（其他用户无法访问）`);
        this.print(`  ${pad('  /user/<名>/info/', 28)} 系统配置（隐藏，ls -a 可见；存放 history.json / editUndoStack.json / 个性化设置 等）`);
        this.print(`  ${pad('  /user/<名>/appinfo/', 28)} 应用私有数据（隐藏，ls -a 可见）`);
        this.print('');
        this.print('vi 编辑器快捷键（open 命令进入）:', 'folder');
        const w = 28;
        this.print(`  ${pad('i', w)} 进入插入模式`);
        this.print(`  ${pad('Esc', w)} 返回命令模式`);
        this.print(`  ${pad(':w', w)} 保存文件`);
        this.print(`  ${pad(':q', w)} 退出编辑器`);
        this.print(`  ${pad(':wq', w)} 保存并退出`);
        this.print(`  ${pad(':q!', w)} 强制退出（不保存）`);
        this.print(`  ${pad('dd', w)} 删除当前行`);
        this.print(`  ${pad('x', w)} 删除当前字符`);
        this.print(`  ${pad('u', w)} 撤销`);
        this.print(`  ${pad('Ctrl + r', w)} 重做`);
    }
}
export default Terminal;