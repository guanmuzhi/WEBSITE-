import UserManager from './user-manager.js?v=54';
import FileSystem from './file-system.js?v=54';
import ViEditor from './vi-editor.js?v=54';
import AppManager from './app-manager.js?v=54';
import { Path, FSEdit } from './lib/index.js?v=54';
import {
    buildCommandTable, resolveAlias, printCommandHelp, printFullHelp,
    splitCommandLine, tokenize, allCommandNames, _T, LANGS,
} from './terminal/commands.js?v=54';

/* 把「相对于本文件（src/terminal.js）」的路径解析成绝对 URL（fetch 按文档 base 解析，基准与本模块不同） */
const assetUrl = (rel) => new URL(rel, import.meta.url).href;

const HISTORY_FILE_NAME = 'history.json';
const EDIT_UNDO_FILE_NAME = 'editUndoStack.json';
const EDIT_UNDO_MAX = 50;

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
        // 终端界面语言（与桌面语言键一致：localStorage webos-language）
        this.lang = this._readLang();
        // edit undo 栈保存到 /user/<name>/info/editUndoStack.json；
        // 同时在所有 Terminal 实例间共享静态缓存，避免新开窗口栈为空。
        this._editUndoStack = [];
        // 命令表（commands.js 装配，help / Tab 补全 / -h 全部由本表驱动）
        this._table = buildCommandTable(this);
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
    // ----- 语言 -----
    _readLang() {
        try {
            const v = localStorage.getItem('webos-language');
            return LANGS.includes(v) ? v : 'cmn';
        } catch (e) { return 'cmn'; }
    }
    /** 切换终端语言（由 language 命令 / language-changed 事件调用） */
    setLang(lang) {
        if (!LANGS.includes(lang)) return false;
        this.lang = lang;
        try { localStorage.setItem('webos-language', lang); } catch (e) {}
        try {
            this.fs.storage.saveJSON(`${this._userInfoDir()}/language.json`, { language: lang });
        } catch (e) {}
        return true;
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
        return allCommandNames(this._table).filter(cmd => cmd.startsWith(input.toLowerCase()));
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
        // 语言切换（可能来自设置应用 / 另一终端窗口）：同步 this.lang
        document.addEventListener('language-changed', (e) => {
            const lang = e.detail && e.detail.lang;
            if (lang && lang !== this.lang) this.setLang(lang);
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
        this.print(_T(this.lang, 'welcome'));
        this.print(_T(this.lang, 'welcome_hint'));
        this.print('');
    }
    print(text, className = '') {
        const div = document.createElement('div');
        div.textContent = text;
        // className 可能包含多个类名（如 'folder system-folder'），classList.add 不接受
        // 含空格的 token，必须按空白拆分后逐个添加
        if (className) {
            String(className).split(/\s+/).filter(Boolean).forEach(c => div.classList.add(c));
        }
        this.output.appendChild(div);
        this.scrollToBottom();
    }
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
    // ====================================================================
    //  命令分发：特殊字符层（parser.js）+ 命令表（commands.js）
    //    - && 切分为多段依次执行
    //    - <命令> -h / --help → 单命令帮助；help → 完整帮助树
    //    - 旧命令名（ls/cat/mkdir/...）由 ALIASES 迁移
    // ====================================================================
    async executeCommand(cmd) {
        if (!cmd) return;
        this.print(`${this.prompt.textContent} ${cmd}`);
        this.addToHistory(cmd);
        const segments = splitCommandLine(cmd);
        for (const seg of segments) {
            const tokens = tokenize(seg);
            if (tokens.length === 0) continue;
            const name = tokens[0].toLowerCase();
            const args = tokens.slice(1);
            // help 特殊处理（表内有元数据但无处理器）
            if (name === 'help') { this._runHelp(args); continue; }
            // 通用 -h/--help 拦截（edit 自处理，含 undo 子命令）
            if (name !== 'edit' && (args.includes('-h') || args.includes('--help'))) {
                printCommandHelp(this, this._table, name);
                continue;
            }
            const resolved = resolveAlias(this._table, name, args);
            if (!resolved) {
                this.print(_T(this.lang, 'unknown_command', { cmd: name }), 'error');
                continue;
            }
            const entry = this._table.get(resolved.name);
            try {
                await entry.run(resolved.args);
            } catch (e) {
                this.print(`${resolved.name}: ${(e && e.message) || e}`, 'error');
            }
        }
    }
    /** help [命令]：无参 → 完整帮助树；带命令名 → 该命令详细用法 */
    _runHelp(args) {
        const target = args.find(a => !a.startsWith('-'));
        if (!target) { printFullHelp(this, this._table); return; }
        printCommandHelp(this, this._table, target.toLowerCase());
    }
    // ====================================================================
    //  edit 命令：非交互式文件修改（line/range/charRange/delete/insert/append/regex）
    // ====================================================================
    async handleEdit(args) {
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
            this.print('edit: 参数不足。语法：edit <文件> <起始位置> <终止位置> [替换内容]', 'error');
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
        // ---- 解析操作：位置语法 + 6 种传统语法 --------------------------------------
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
            const D = window.Dialogs;
            const ok = D ? await D.showConfirm(`edit: 将对 "${absPath}" 执行 ${diff.length} 项修改，是否写入？\n（可用 edit undo 回滚最后一次）`) : confirm(`edit: 将对 "${absPath}" 执行 ${diff.length} 项修改，是否写入？\n（可用 edit undo 回滚最后一次）`);
            if (!ok) { this.print(_T(this.lang, 'edit_cancelled')); return; }
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
        this.print(`${_T(this.lang, 'edit_written', { path: absPath })}。撤销令牌: ${token}（执行 edit undo ${token} 或 edit undo 回滚最近一次）`, 'success');
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
            this.print('  edit file.txt 5-1 5-10 hello  将第5行第1~10个字符替换为 hello');
            this.print('  edit file.txt 5 5 hello      将第5行整行替换为 hello');
            this.print('  edit file.txt 5 "新内容"      将第5行整行替换');
            this.print('  edit file.txt 3,7 ""          删除第3-7行');
            this.print('  edit file.txt s/old/new/g     sed 正则全文件替换');
            this.print('  edit file.txt +5 "inserted"   在第5行前插入一行');
            this.print('  edit file.txt >> "line"       文件末尾追加');
            this.print('  edit undo [token]             回滚最后一次（或指定令牌）');
            return;
        }
        this.print('edit: 非交互式文件修改命令（支持相对/绝对路径，父目录不存在会自动创建）');
        this.print('  通用: edit [--confirm] [-c N] <文件路径> <操作...>');
        this.print('    (默认)                  直接写入，不再弹窗确认');
        this.print('    --confirm               改回弹窗确认（危险操作时使用）');
        this.print('    -y / --yes              兼容保留，作用同默认');
        this.print('    -c N / --context N      修改后额外打印 N 行上下文预览');
        this.print(`  撤销栈: 每用户独立，持久化于 ~/info/${EDIT_UNDO_FILE_NAME}（上限 ${EDIT_UNDO_MAX} 条，刷新/开新窗口仍可撤销）`);
        this.print('  位置语法（新，行-列均为 1 起始）:');
        this.print('    ① 字符区间替换:        edit f  <N>-<M> <X>-<Y> [text]   把第N行第M列到第X行第Y列替换为 text');
        this.print('    ② 行区间替换:          edit f  <N> <M> [text]            把第N..M行替换为 text（text 省略即删除）');
        this.print('  操作语法（传统，仍可用）:');
        this.print('    ③ 单行替换:            edit f  <N>       <text>           把第 N 行换成 text（text 可用 \\n 表示多行）');
        this.print('    ④ 范围替换:            edit f  <N>,<M>   <block>          删除 N..M 行并替换为 block（block 为空就是删除）');
        this.print('    ⑤ 正则（sed 风格）:    edit f  s/pat/repl/[flags]          flags: g/i/m 等，分隔符 / | # ! 任选');
        this.print('                            edit f /3,8/ s/pat/repl/g        仅在第 3-8 行内应用正则');
        this.print('    ⑥ 插入行:              edit f  +<N>      <block>          在第 N 行前插入；-<N> 表示第 N 行后插入');
        this.print('    ⑦ 追加到文件尾:        edit f  >>        <block>');
        this.print('    ⑧ 便捷删除:            edit f  d<N>                       删除第 N 行');
        this.print('                            edit f  d<N>,<M>                  删除 N..M 行');
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
     * 位置语法：N-M X-Y（字符区间）/ N M（行区间）；
     * 传统糖：sed s///、d3 / d3,7、+5/-5 插入、>> 追加、5 "xx" 单行、3,7 "yy\nzz" 范围。
     */
    _parseEditArgs(tokens) {
        const rawInput = tokens.join(' ');
        // 0) 新位置语法：<N>-<M> <X>-<Y> <text>  字符区间替换（行列均 1 起始）
        const posRe = /^(\d+)-(\d+)$/;
        const mPos1 = posRe.exec(tokens[0] || '');
        const mPos2 = tokens[1] ? posRe.exec(tokens[1]) : null;
        if (mPos1 && mPos2) {
            const text = this._unescapeNewlines(this._stripOptionalQuotes(tokens.slice(2).join(' ')));
            return this._applyAndWrap({
                type: 'charRange',
                sl: Number(mPos1[1]), sc: Number(mPos1[2]),
                el: Number(mPos2[1]), ec: Number(mPos2[2]),
                text,
            });
        }
        // 0b) 新位置语法：<N> <M> <text>  行区间替换（text 省略 → 删除这些行）
        if (/^\d+$/.test(tokens[0] || '') && /^\d+$/.test(tokens[1] || '')) {
            const s = Number(tokens[0]);
            const e = Number(tokens[1]);
            const block = this._unescapeNewlines(this._stripOptionalQuotes(tokens.slice(2).join(' ')));
            return this._applyAndWrap({ type: 'range', start: s, end: e, block });
        }
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
     * 真正写盘由 handleEdit 写入 absPath，undo 保存 snapshot。*/
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
        if (op.type === 'charRange') {
            if (!(op.sl >= 1 && op.sc >= 1 && op.el >= 1 && op.ec >= 1)) {
                return { ok: false, error: _T(this.lang, 'edit_bad_range', { start: `${op.sl}-${op.sc}`, end: `${op.el}-${op.ec}` }) };
            }
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
    checkNodePermission(node) {
        const oldCurrentDir = this.fs.currentDir;
        this.fs.currentDir = node;
        const nodePath = this.fs.getCurrentPath();
        this.fs.currentDir = oldCurrentDir;
        return this.checkPathPermission(nodePath);
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
            message: _T(this.lang, 'permission_denied', { user: owner })
        };
    }
    checkLogoutOnExitHome(previousPath) {
        const currentPath = this.fs.getCurrentPath();
        const homePath = `/user/${this.currentUser.username}`;
        if (previousPath.startsWith(homePath) && !currentPath.startsWith(homePath)) {
            const oldName = this.currentUser.username;
            this.currentUser = this.userManager.getDefaultUser();
            this.userManager.setCurrentUser(this.currentUser.username);
            this.updatePrompt();
            this.print(_T(this.lang, 'logged_out', { name: oldName }), 'success');
        }
    }
    // ====================================================================
    //  导出 / 导入（export / import 命令）
    // ====================================================================
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
        this.print(_T(this.lang, 'exported_file', { name: file.name }), 'success');
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
            this.print(_T(this.lang, 'exported_folder', { name: folder.name, file: folder.name + '.zip' }), 'success');
        }).catch((err) => {
            this.print(_T(this.lang, 'export_failed', { message: err.message }), 'error');
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
    /** 导入本地文件到 destDir（绝对路径；缺省当前目录） */
    importFromFile(destDir) {
        const dirPath = destDir || this.fs.getCurrentPath();
        const dirNode = this.fs.getNodeByAbsPath(dirPath);
        if (!dirNode || dirNode.type !== 'folder') {
            this.print(_T(this.lang, 'target_not_dir', { path: dirPath }), 'error');
            return;
        }
        if (!this.checkPathPermission(dirPath).allowed) {
            this.print(_T(this.lang, 'permission_denied', { user: this.fs.getPathOwner(dirPath) || '?' }), 'error');
            return;
        }
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
                if ((dirNode.children || []).find(c => c.name === name)) {
                    this.print(_T(this.lang, 'import_exists', { name }), 'error');
                    document.body.removeChild(input);
                    return;
                }
                if (!dirNode.children) {
                    dirNode.children = [];
                }
                dirNode.children.push({
                    type: 'file',
                    name: name,
                    content: content,
                    isBinary: isBinary
                });
                this.fs.save();
                this.print(_T(this.lang, 'imported_file', { name, path: dirPath }), 'success');
                document.body.removeChild(input);
            };
            reader.onerror = () => {
                this.print(_T(this.lang, 'import_read_failed'), 'error');
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
    /** 从 URL 下载文件并导入 destDir（绝对路径；缺省当前目录） */
    importFromUrl(url, destDir) {
        const dirPath = destDir || this.fs.getCurrentPath();
        const dirNode = this.fs.getNodeByAbsPath(dirPath);
        if (!dirNode || dirNode.type !== 'folder') {
            this.print(_T(this.lang, 'target_not_dir', { path: dirPath }), 'error');
            return;
        }
        this.print(_T(this.lang, 'downloading', { url }));
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
                if ((dirNode.children || []).find(c => c.name === fileName)) {
                    this.print(_T(this.lang, 'import_exists', { name: fileName }), 'error');
                    return;
                }
                if (!dirNode.children) {
                    dirNode.children = [];
                }
                dirNode.children.push({
                    type: 'file',
                    name: fileName,
                    content: content
                });
                this.fs.save();
                this.print(_T(this.lang, 'imported_file', { name: fileName, path: dirPath }), 'success');
            })
            .catch(err => {
                this.print(_T(this.lang, 'import_failed', { message: err.message }), 'error');
                this.print(_T(this.lang, 'import_cors_hint'), 'error');
            });
    }
}

Terminal._sharedUndoStack = null;
Terminal._sharedUndoStackUser = null;

export default Terminal;
