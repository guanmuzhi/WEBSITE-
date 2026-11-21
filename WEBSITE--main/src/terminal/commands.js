// src/terminal/commands.js
// navore OS 终端命令层（重构版）。
//
// 设计：
//   - 每个命令一条元数据（名称/简写/分组/三语言用法与示例），help 与 Tab 补全均由本表驱动；
//   - 特殊字符（~ [] && ../）由 parser.js / selector.js 处理，本层只面对"已解析的目标"；
//   - 命令返回值语义（按需求文档）：date 整型；create/rename/delete 布尔值；
//     find 字符串数组；print 字符串；statistic 整型。
//   - 旧命令（ls/cat/mkdir/... ）通过 ALIASES 迁移到新命令，行为尽量兼容。

import { parseTarget, splitCommandLine, tokenize, stripQuotes, validateName, resolvePathStr } from './parser.js?v=54';
import { parseSelector, matchParams } from './selector.js?v=54';
import { t as T } from './i18n.js?v=54';

const LANGS = ['cmn', 'eng', 'jpn'];

// ─────────────────────────────────────────────────────────────
//  上下文辅助（全部绑定到 Terminal 实例 term）
// ─────────────────────────────────────────────────────────────
function makeCtx(term) {
    const cwd = () => term.fs.getCurrentPath();

    const err = (msg) => term.print(msg, 'error');

    /** 权限检查：拒绝时打印本地化消息并返回 false */
    const checkPerm = (absPath) => {
        const p = term.checkPathPermission(absPath);
        if (!p.allowed) { err(p.message); return false; }
        return true;
    };

    /** 目标 → 单个节点 */
    const resolveSingle = (target, opts = {}) => {
        const { allowFolder = true, allowFile = true } = opts;
        if (target.kind === 'error') return { error: T(term.lang, target.error, { path: target.detail }), key: target.error };
        if (target.kind === 'current') return { node: term.fs.currentDir, path: cwd() };
        if (target.kind === 'selector') return { error: T(term.lang, 'not_found', { path: target.dirPath }), key: 'not_found' };
        const node = term.fs.getNodeByAbsPath(target.path);
        if (!node) return { error: T(term.lang, 'not_found', { path: target.path }), key: 'not_found' };
        if (target.trailingSlash && node.type !== 'folder') return { error: T(term.lang, 'not_dir', { path: target.path }), key: 'not_dir' };
        if (!allowFolder && node.type === 'folder') return { error: T(term.lang, 'is_folder', { path: target.path }), key: 'is_folder' };
        if (!allowFile && node.type === 'file') return { error: T(term.lang, 'is_file', { path: target.path }), key: 'is_file' };
        return { node, path: target.path };
    };

    /** 目标 → 多个节点（选择器展开） */
    const resolveMulti = (target) => {
        if (target.kind === 'error') return { error: T(term.lang, target.error, { path: target.detail }) };
        if (target.kind === 'current') return { nodes: [{ node: term.fs.currentDir, path: cwd() }] };
        if (target.kind === 'selector') {
            const dir = term.fs.getNodeByAbsPath(target.dirPath);
            if (!dir || dir.type !== 'folder') return { error: T(term.lang, 'sel_dir_missing', { path: target.dirPath }), key: 'sel_dir_missing' };
            const sel = parseSelector(target.body);
            if (!sel.ok) return { error: T(term.lang, sel.error, { part: sel.detail, key: sel.key, val: sel.detail }), key: sel.error };
            const now = Date.now();
            const nodes = [];
            const denied = [];
            for (const c of (dir.children || [])) {
                term.fs.ensureMtime(c);
                const typeOk = target.nodeType === 'file' ? c.type === 'file' : c.type === 'folder';
                if (!typeOk) continue;
                if (!matchParams(c, sel.params, { now, sizeOf: n => term.fs.nodeSize(n) })) continue;
                const p = (target.dirPath === '/' ? '' : target.dirPath) + '/' + c.name;
                if (!term.checkPathPermission(p).allowed) { denied.push(c); continue; }
                nodes.push({ node: c, path: p });
            }
            return { nodes, denied };
        }
        const single = resolveSingle(target);
        if (single.error) return single;
        return { nodes: [{ node: single.node, path: single.path }] };
    };

    /** 递归遍历（跳过 info/appinfo 隐藏目录与无权限子树），回调 (node, absPath) */
    const walk = (node, path, cb) => {
        for (const c of (node.children || [])) {
            if (c.type === 'folder' && term.fs.isHiddenDir(c.name)) continue;
            const p = (path === '/' ? '' : path) + '/' + c.name;
            if (!term.checkPathPermission(p).allowed) continue;
            cb(c, p);
            if (c.type === 'folder') walk(c, p, cb);
        }
    };

    /** 递归收集文本文件节点 */
    const walkTextFiles = (node, path, out) => {
        walk(node, path, (n, p) => {
            if (n.type === 'file' && typeof n.content === 'string' && !n.content.startsWith('data:')) out.push({ node: n, path: p });
        });
    };

    const printLines = (text) => {
        String(text).split('\n').forEach(l => term.print(l));
    };

    /** create/rename/delete 的失败输出：false + 原因 */
    const printFalse = (reason) => {
        term.print('false' + (reason ? ': ' + reason : ''), 'error');
    };

    const unescapeText = (s) => String(s == null ? '' : s)
        .replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');

    const contentToBytes = (content) => {
        if (typeof content !== 'string') return new TextEncoder().encode(String(content == null ? '' : content));
        if (content.startsWith('data:')) {
            const i = content.indexOf(',');
            const meta = content.slice(0, i);
            const body = content.slice(i + 1);
            if (/;base64$/i.test(meta)) {
                const bin = atob(body);
                const arr = new Uint8Array(bin.length);
                for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
                return arr;
            }
            try { return new TextEncoder().encode(decodeURIComponent(body)); } catch (e) { return new TextEncoder().encode(body); }
        }
        return new TextEncoder().encode(content);
    };

    const isTextFile = (node) => node.type === 'file' && typeof node.content === 'string' && !node.content.startsWith('data:');

    return { cwd, err, checkPerm, resolveSingle, resolveMulti, walk, walkTextFiles, printLines, printFalse, unescapeText, contentToBytes, isTextFile };
}

// ─────────────────────────────────────────────────────────────
//  命令元数据（三语言）
// ─────────────────────────────────────────────────────────────
const GROUPS = [
    { id: 'files',  cmn: '文件与目录',   eng: 'Files & Folders', jpn: 'ファイルとフォルダ' },
    { id: 'text',   cmn: '文本与查找',   eng: 'Text & Search',   jpn: 'テキストと検索' },
    { id: 'system', cmn: '系统与个性化', eng: 'System & Personalization', jpn: 'システムとパーソナライズ' },
    { id: 'apps',   cmn: '应用',         eng: 'Applications',    jpn: 'アプリ' },
];

const META = {
    print: {
        group: 'text', aliases: ['p'],
        usage: {
            cmn: 'print <输出对象...>',
            eng: 'print <target...>',
            jpn: 'print <対象...>',
        },
        desc: {
            cmn: '输出：文件先输出文件名再输出内容；多文件/选择器依次输出；~ 输出当前路径；普通文本原样输出',
            eng: 'Print: file name then content; multiple files/selectors in order; ~ prints current path; plain text prints as-is',
            jpn: '出力: ファイルは名前→内容の順。複数ファイルやセレクタは順番に出力。~ は現在のパス。プレーンテキストはそのまま',
        },
        examples: {
            cmn: ['print ~', 'print file.txt', 'print file1.txt file2.txt', 'print file[size=0..10]', 'print /user/public/file[name=file.txt]'],
            eng: ['print ~', 'print file.txt', 'print file1.txt file2.txt', 'print file[size=0..10]', 'print /user/public/file[name=file.txt]'],
            jpn: ['print ~', 'print file.txt', 'print file1.txt file2.txt', 'print file[size=0..10]', 'print /user/public/file[name=file.txt]'],
        },
    },
    statistic: {
        group: 'text', aliases: ['s'],
        usage: { cmn: 'statistic <统计范围> [统计对象...]', eng: 'statistic <scope> [object...]', jpn: 'statistic <範囲> [対象...]' },
        desc: {
            cmn: '统计（返回整型）。范围：文件/文件夹(~)/文本；对象：line 行数或项目数、word 字符数、size 大小(KB)、自定义字词出现次数；不填默认 size',
            eng: 'Count (returns integer). Scope: file / folder(~) / text; object: line, word (chars), size (KB), or a custom word; defaults to size',
            jpn: '統計（整数値を返す）。範囲: ファイル/フォルダ(~)/テキスト。対象: line（行数・項目数）、word（文字数）、size（KB）、任意の語。省略時は size',
        },
        examples: {
            cmn: ['statistic ~ file.txt', 'statistic file.txt 你好', 'statistic file.txt \\t', 'statistic file.txt line word', 'statistic 你好你好 好'],
            eng: ['statistic ~ file.txt', 'statistic file.txt hello', 'statistic file.txt \\t', 'statistic file.txt line word', 'statistic hellohello l'],
            jpn: ['statistic ~ file.txt', 'statistic file.txt こんにちは', 'statistic file.txt \\t', 'statistic file.txt line word', 'statistic こんにちこんにちは ん'],
        },
    },
    copy: {
        group: 'files', aliases: ['cp'],
        usage: { cmn: 'copy <复制对象> [复制目标]', eng: 'copy <source> [target]', jpn: 'copy <対象> [移動先]' },
        desc: {
            cmn: '复制文件或文件夹；目标不填则复制到当前目录（同名生成 (1) 副本）；支持选择器批量复制',
            eng: 'Copy file or folder; without target copies into current dir ((1) suffix on conflict); supports selectors',
            jpn: 'ファイル/フォルダをコピー。目標省略時は現在のディレクトリへ（同名は (1) 形式）。セレクタ対応',
        },
        examples: {
            cmn: ['copy file.txt /user/user2/', 'copy ~/folder/ /user/public', 'copy file.txt'],
            eng: ['copy file.txt /user/user2/', 'copy ~/folder/ /user/public', 'copy file.txt'],
            jpn: ['copy file.txt /user/user2/', 'copy ~/folder/ /user/public', 'copy file.txt'],
        },
    },
    find: {
        group: 'text', aliases: ['f'],
        usage: { cmn: 'find <查找范围> <查找对象>', eng: 'find <scope> <object>', jpn: 'find <範囲> <対象>' },
        desc: {
            cmn: '查找（返回字符串数组）。文件内查找返回 [行-起始位置,...]；文件夹内查找（递归）返回路径数组；对象为字符串或选择器',
            eng: 'Find (returns string array). In-file: [line-start,...]; in-folder (recursive): path array; object is a string or selector',
            jpn: '検索（文字列配列を返す）。ファイル内: [行-開始位置,...]。フォルダ内（再帰）: パス配列。対象は文字列またはセレクタ',
        },
        examples: {
            cmn: ['find file.txt hello', 'find ~ file[size=1024..]', 'find ~ readme'],
            eng: ['find file.txt hello', 'find ~ file[size=1024..]', 'find ~ readme'],
            jpn: ['find file.txt hello', 'find ~ file[size=1024..]', 'find ~ readme'],
        },
    },
    create: {
        group: 'files', aliases: ['c'],
        usage: { cmn: 'create <创建内容>', eng: 'create <content>', jpn: 'create <作成内容>' },
        desc: {
            cmn: '创建文件或文件夹（文件夹以 / 结尾），返回布尔值；名称不得包含 && .. * 等特殊字符',
            eng: 'Create file or folder (folder ends with /), returns boolean; names must not contain && .. * etc.',
            jpn: 'ファイル/フォルダを作成（フォルダは / で終わる）。真偽値を返す。名前に && .. * 等の特殊文字は不可',
        },
        examples: {
            cmn: ['create file.txt', 'create file/', 'create ~/docs/note.txt'],
            eng: ['create file.txt', 'create file/', 'create ~/docs/note.txt'],
            jpn: ['create file.txt', 'create file/', 'create ~/docs/note.txt'],
        },
    },
    move: {
        group: 'files', aliases: ['m'],
        usage: { cmn: 'move <移动对象> <移动目标>', eng: 'move <source> <target>', jpn: 'move <対象> <移動先>' },
        desc: {
            cmn: '移动文件或文件夹到目标文件夹（不产生副本）；目标必须是已存在的文件夹',
            eng: 'Move file or folder into target folder (no copy left); target must be an existing folder',
            jpn: 'ファイル/フォルダを目標フォルダへ移動（コピーは残らない）。目標は既存フォルダ必須',
        },
        examples: {
            cmn: ['move file.txt /user/public/', 'move ~/folder/ ../'],
            eng: ['move file.txt /user/public/', 'move ~/folder/ ../'],
            jpn: ['move file.txt /user/public/', 'move ~/folder/ ../'],
        },
    },
    rename: {
        group: 'files', aliases: ['r'],
        usage: { cmn: 'rename <重命名对象> <新名称>', eng: 'rename <target> <new name>', jpn: 'rename <対象> <新しい名前>' },
        desc: {
            cmn: '重命名，返回布尔值；新名称不得包含特殊字符；对象路径以 / 结尾表示文件夹',
            eng: 'Rename, returns boolean; new name must not contain special characters; trailing / means folder',
            jpn: '名前変更（真偽値を返す）。新しい名前に特殊文字は不可。対象パスの末尾 / はフォルダを意味する',
        },
        examples: {
            cmn: ['rename file.txt image.gif', 'rename /user/public/readme file.txt', 'rename /user/public/readme/ file'],
            eng: ['rename file.txt image.gif', 'rename /user/public/readme file.txt', 'rename /user/public/readme/ file'],
            jpn: ['rename file.txt image.gif', 'rename /user/public/readme file.txt', 'rename /user/public/readme/ file'],
        },
    },
    delete: {
        group: 'files', aliases: ['d'],
        usage: { cmn: 'delete <删除目标>', eng: 'delete <target>', jpn: 'delete <対象>' },
        desc: {
            cmn: '删除，返回布尔值；/user/public/ 与 /application 等受保护；delete ~ 非法，返回 "0"',
            eng: 'Delete, returns boolean; /user/public/ and /application are protected; delete ~ is illegal, returns "0"',
            jpn: '削除（真偽値を返す）。/user/public/ や /application は保護対象。delete ~ は不正で "0" を返す',
        },
        examples: {
            cmn: ['delete file.txt', 'delete /file/', 'delete file[size=0..1]'],
            eng: ['delete file.txt', 'delete /file/', 'delete file[size=0..1]'],
            jpn: ['delete file.txt', 'delete /file/', 'delete file[size=0..1]'],
        },
    },
    cd: {
        group: 'files', aliases: [],
        usage: { cmn: 'cd <目标路径>', eng: 'cd <path>', jpn: 'cd <パス>' },
        desc: {
            cmn: '切换目录；支持 ../ 多级回退（/../ 非法）、~ 当前路径；无参数回家目录；离开自己家目录会自动登出',
            eng: 'Change directory; supports ../ (multi-level, /../ illegal), ~ current path; no arg goes home; leaving your home logs out',
            jpn: 'ディレクトリ切替。../ は複数段可（/../ は不正）、~ は現在のパス。引数なしでホーム。ホームを出るとログアウト',
        },
        examples: {
            cmn: ['cd /user/public', 'cd ../../', 'cd ~/folder/../'],
            eng: ['cd /user/public', 'cd ../../', 'cd ~/folder/../'],
            jpn: ['cd /user/public', 'cd ../../', 'cd ~/folder/../'],
        },
    },
    list: {
        group: 'files', aliases: ['l'],
        usage: { cmn: 'list [tree] [路径]', eng: 'list [tree] [path]', jpn: 'list [tree] [パス]' },
        desc: {
            cmn: '列项：默认长列表（含隐藏项）；tree 递归树形结构；-b 仅名称',
            eng: 'List: long format by default (incl. hidden); tree for recursive tree; -b names only',
            jpn: '一覧: デフォルトは詳細（隠し項目含む）。tree で再帰的なツリー表示。-b は名前のみ',
        },
        examples: {
            cmn: ['list', 'list tree', 'list /user/public', 'list -b'],
            eng: ['list', 'list tree', 'list /user/public', 'list -b'],
            jpn: ['list', 'list tree', 'list /user/public', 'list -b'],
        },
    },
    SHA: {
        group: 'text', aliases: ['sha'],
        usage: { cmn: 'SHA <目标文件> [SHA1|SHA256]', eng: 'SHA <file> [SHA1|SHA256]', jpn: 'SHA <ファイル> [SHA1|SHA256]' },
        desc: {
            cmn: '计算文件 SHA 值（返回字符串）；不填模式则 SHA1 与 SHA256 都计算；支持选择器',
            eng: 'Compute file SHA (returns string); no mode computes both SHA1 and SHA256; supports selectors',
            jpn: 'ファイルの SHA を計算（文字列を返す）。モード省略時は SHA1 と SHA256 の両方。セレクタ対応',
        },
        examples: {
            cmn: ['SHA file.txt SHA1', 'SHA file[size=1024..] SHA256'],
            eng: ['SHA file.txt SHA1', 'SHA file[size=1024..] SHA256'],
            jpn: ['SHA file.txt SHA1', 'SHA file[size=1024..] SHA256'],
        },
    },
    Clear: {
        group: 'system', aliases: ['cl'],
        usage: { cmn: 'Clear', eng: 'Clear', jpn: 'Clear' },
        desc: { cmn: '清屏', eng: 'Clear the screen', jpn: '画面をクリア' },
        examples: { cmn: ['Clear'], eng: ['Clear'], jpn: ['Clear'] },
    },
    account: {
        group: 'system', aliases: ['a'],
        usage: { cmn: 'account <n|s|d> <用户名> [密码]', eng: 'account <n|s|d> <user> [password]', jpn: 'account <n|s|d> <ユーザー名> [パスワード]' },
        desc: {
            cmn: '用户管理：n(new) 创建、s(switch) 切换、d(delete) 删除；不填参数返回当前用户名；public 用户不可删除',
            eng: 'User management: n(new) create, s(switch) switch, d(delete) delete; no arg prints current user; public cannot be deleted',
            jpn: 'ユーザー管理: n(new) 作成、s(switch) 切替、d(delete) 削除。引数なしで現在のユーザー名を返す。public は削除不可',
        },
        examples: {
            cmn: ['account', 'a n newuser', 'a n newuser 123456', 'a s newuser', 'a d admin'],
            eng: ['account', 'a n newuser', 'a n newuser 123456', 'a s newuser', 'a d admin'],
            jpn: ['account', 'a n newuser', 'a n newuser 123456', 'a s newuser', 'a d admin'],
        },
    },
    personality: {
        group: 'system', aliases: ['ps'],
        usage: { cmn: 'personality <animation|autohide|font|opacity|theme|wallpaper> [参数...]', eng: 'personality <animation|autohide|font|opacity|theme|wallpaper> [args...]', jpn: 'personality <animation|autohide|font|opacity|theme|wallpaper> [引数...]' },
        desc: {
            cmn: '个性化配置（存于 /user/<名>/info/personalization.json）。animation/autohide 取 on/off/switch；theme 主题色；wallpaper 支持 solid/gradient/media；不填参数返回当前值',
            eng: 'Personalization (stored in /user/<name>/info/personalization.json). animation/autohide take on/off/switch; theme color; wallpaper solid/gradient/media; no arg returns current value',
            jpn: 'パーソナライズ設定（/user/<名>/info/personalization.json に保存）。animation/autohide は on/off/switch。theme はテーマカラー。wallpaper は solid/gradient/media。引数なしで現在値',
        },
        examples: {
            cmn: ['ps theme #ff3366', 'ps opacity 85', 'ps font 15', 'ps animation off', 'ps wallpaper gradient #ff0000 #0000ff 270', 'ps wallpaper media ~/pic.png'],
            eng: ['ps theme #ff3366', 'ps opacity 85', 'ps font 15', 'ps animation off', 'ps wallpaper gradient #ff0000 #0000ff 270', 'ps wallpaper media ~/pic.png'],
            jpn: ['ps theme #ff3366', 'ps opacity 85', 'ps font 15', 'ps animation off', 'ps wallpaper gradient #ff0000 #0000ff 270', 'ps wallpaper media ~/pic.png'],
        },
    },
    export: {
        group: 'files', aliases: ['ex'],
        usage: { cmn: 'export [路径]', eng: 'export [path]', jpn: 'export [パス]' },
        desc: {
            cmn: '导出：文件提供下载，文件夹打包 zip；不填参数等同 export ~（当前目录）',
            eng: 'Export: files download directly, folders as zip; no arg equals export ~ (current dir)',
            jpn: 'エクスポート: ファイルはダウンロード、フォルダは zip。引数なしは export ~（現在のディレクトリ）',
        },
        examples: { cmn: ['export', 'export /user/public/'], eng: ['export', 'export /user/public/'], jpn: ['export', 'export /user/public/'] },
    },
    import: {
        group: 'files', aliases: ['im'],
        usage: { cmn: 'import [路径] <URL>', eng: 'import [path] <URL>', jpn: 'import [パス] <URL>' },
        desc: {
            cmn: '导入：从 URL 下载到指定路径（第二项含 / 等特殊符号时可省略路径，导入到当前目录）；不填参数则从本地文件上传',
            eng: 'Import: download from URL into path (path may be omitted when the 2nd arg contains /); no arg opens local file picker',
            jpn: 'インポート: URL から指定パスへダウンロード（第2引数に / 等を含む場合はパス省略可）。引数なしでローカルファイルから取り込み',
        },
        examples: {
            cmn: ['import https://example.com/a.txt', 'import /user/public https://example.com/a.txt'],
            eng: ['import https://example.com/a.txt', 'import /user/public https://example.com/a.txt'],
            jpn: ['import https://example.com/a.txt', 'import /user/public https://example.com/a.txt'],
        },
    },
    language: {
        group: 'system', aliases: ['ln'],
        usage: { cmn: 'language <cmn|eng|jpn>', eng: 'language <cmn|eng|jpn>', jpn: 'language <cmn|eng|jpn>' },
        desc: {
            cmn: '切换语言（界面与终端输出同步切换）；不填参数列出所有语言和当前语言',
            eng: 'Switch language (UI and terminal output); no arg lists all languages and the current one',
            jpn: '言語切替（UI と端末出力に反映）。引数なしで全言語と現在の言語を表示',
        },
        examples: { cmn: ['language', 'language eng'], eng: ['language', 'language eng'], jpn: ['language', 'language eng'] },
    },
    date: {
        group: 'system', aliases: ['dt'],
        usage: { cmn: 'date', eng: 'date', jpn: 'date' },
        desc: { cmn: '当前时间（返回整型）', eng: 'Current time (returns integer)', jpn: '現在時刻（整数値を返す）' },
        examples: { cmn: ['date'], eng: ['date'], jpn: ['date'] },
    },
    application: {
        group: 'apps', aliases: ['app'],
        usage: { cmn: 'application <list|run|install|uninstall> [应用名]', eng: 'application <list|run|install|uninstall> [app]', jpn: 'application <list|run|install|uninstall> [アプリ名]' },
        desc: {
            cmn: '应用管理：list 列出已安装应用；run 运行；install 将 .app 文件夹载入 /application；uninstall 卸载',
            eng: 'App management: list installed apps; run; install a .app folder into /application; uninstall',
            jpn: 'アプリ管理: list で一覧、run で起動、install で .app フォルダを /application へ、uninstall で削除',
        },
        examples: {
            cmn: ['application list', 'app run filemanager', 'app install ~/myapp.app/', 'app uninstall myapp'],
            eng: ['application list', 'app run filemanager', 'app install ~/myapp.app/', 'app uninstall myapp'],
            jpn: ['application list', 'app run filemanager', 'app install ~/myapp.app/', 'app uninstall myapp'],
        },
    },
    history: {
        group: 'system', aliases: ['h'],
        usage: { cmn: 'history [clear]', eng: 'history [clear]', jpn: 'history [clear]' },
        desc: {
            cmn: '历史输入命令记录（存于 ~/info/history.json）；clear 清空',
            eng: 'Command history (stored in ~/info/history.json); clear empties it',
            jpn: 'コマンド履歴（~/info/history.json に保存）。clear で消去',
        },
        examples: { cmn: ['history', 'history clear'], eng: ['history', 'history clear'], jpn: ['history', 'history clear'] },
    },
    vi: {
        group: 'text', aliases: [],
        usage: { cmn: 'vi <文件>', eng: 'vi <file>', jpn: 'vi <ファイル>' },
        desc: {
            cmn: '使用 vi 编辑器打开文件（i 插入，Esc 命令模式，:w 保存，:q 退出）',
            eng: 'Open file in the vi editor (i insert, Esc command mode, :w save, :q quit)',
            jpn: 'vi エディタでファイルを開く（i 挿入、Esc コマンドモード、:w 保存、:q 終了）',
        },
        examples: { cmn: ['vi file.txt'], eng: ['vi file.txt'], jpn: ['vi file.txt'] },
    },
    edit: {
        group: 'text', aliases: ['e'],
        usage: { cmn: 'edit <文件> <起始位置> <终止位置> [文本]', eng: 'edit <file> <start> <end> [text]', jpn: 'edit <ファイル> <開始位置> <終了位置> [テキスト]' },
        desc: {
            cmn: '非交互式编辑：位置为 行-列 或 行（如 5-1 / 5）；替换起始到终止位置之间的内容，不填文本则删除该段',
            eng: 'Non-interactive edit: positions are line-col or line (e.g. 5-1 / 5); replaces content between start and end; no text deletes the range',
            jpn: '非対話式編集: 位置は 行-列 または 行（例 5-1 / 5）。開始〜終了位置の内容を置換。テキスト省略時は削除',
        },
        examples: {
            cmn: ['edit file.txt 5-1 5-10 hello', 'edit file.txt 5 5 hello', 'edit file.txt 5-1 5-10'],
            eng: ['edit file.txt 5-1 5-10 hello', 'edit file.txt 5 5 hello', 'edit file.txt 5-1 5-10'],
            jpn: ['edit file.txt 5-1 5-10 hello', 'edit file.txt 5 5 hello', 'edit file.txt 5-1 5-10'],
        },
    },
    help: {
        group: 'system', aliases: [],
        usage: { cmn: 'help [命令]', eng: 'help [command]', jpn: 'help [コマンド]' },
        desc: {
            cmn: '输出帮助：不填参数显示全部命令树；填命令名显示该命令详细用法',
            eng: 'Show help: no arg prints the full command tree; with a command name prints its detailed usage',
            jpn: 'ヘルプ: 引数なしで全コマンドツリー、コマンド名で詳細を表示',
        },
        examples: { cmn: ['help', 'help edit'], eng: ['help', 'help edit'], jpn: ['help', 'help edit'] },
    },
};

// 旧命令 → 新命令 别名迁移（不在 help 中展示，保持肌肉记忆兼容）
const ALIASES = {
    ls:      { target: 'list',  transform: (a) => a },
    cat:     { target: 'print', transform: (a) => a.filter(x => !/^-[a-zA-Z]+$/.test(x)) },
    pwd:     { target: 'print', transform: () => ['~'] },
    echo:    { target: 'print', transform: (a) => a.filter(x => !/^-[a-zA-Z]+$/.test(x)) },
    mkdir:   { target: 'create', transform: (a) => a.map(x => x.replace(/\/?$/, '/')) },
    touch:   { target: 'create', transform: (a) => a },
    new:     { target: 'create', transform: (a) => (a[0] === 'folder' ? a.slice(1).map(x => x.replace(/\/?$/, '/')) : (a[0] === 'file' ? a.slice(1) : a)) },
    rm:      { target: 'delete', transform: (a) => a.filter(x => !/^-[a-zA-Z]+$/.test(x)) },
    mv:      { target: 'move',   transform: (a) => a },
    whoami:  { target: 'account', transform: () => [] },
    run:     { target: 'application', transform: (a) => ['run', ...a] },
    apps:    { target: 'application', transform: (a) => (a[0] === 'run' ? a : ['list']) },
    settings:{ target: 'application', transform: () => ['run', 'settings.app'] },
    tree:    { target: 'list',   transform: (a) => ['tree', ...a.filter(x => !x.startsWith('-'))] },
    theme:   { target: 'personality', transform: (a) => ['theme', ...a] },
    wallpaper:{ target: 'personality', transform: (a) => ['wallpaper', ...a] },
    font:    { target: 'personality', transform: (a) => ['font', ...a] },
    opacity: { target: 'personality', transform: (a) => ['opacity', ...a] },
    animations:{ target: 'personality', transform: (a) => ['animation', ...a] },
    autohide:{ target: 'personality', transform: (a) => ['autohide', ...a] },
    open:    { target: 'vi',     transform: (a) => a },
};

// ─────────────────────────────────────────────────────────────
//  各命令实现
// ─────────────────────────────────────────────────────────────
function buildHandlers(term) {
    const { cwd, err, checkPerm, resolveSingle, resolveMulti, walk, walkTextFiles, printLines, printFalse, unescapeText, contentToBytes, isTextFile } = makeCtx(term);
    const L = () => term.lang;

    // ---------- print ----------
    const printFileNode = (node, path, multi) => {
        if (typeof node.content !== 'string') { err(T(L(), 'not_text', { path })); return; }
        if (node.content.startsWith('data:')) { err(T(L(), 'binary_file', { path })); return; }
        if (multi) term.print(`──── ${path} ────`, 'folder');
        else term.print(node.name, 'folder');
        const lines = node.content.length === 0 ? [''] : node.content.split(/\r?\n|\r/);
        lines.forEach(l => term.printRaw(l));
    };
    const cmdPrint = async (args) => {
        if (!args.length) { err(T(L(), 'print_need_arg')); return; }
        for (const raw of args) {
            const target = parseTarget(raw, cwd());
            if (target.kind === 'error') { err(T(L(), target.error, { path: target.detail })); continue; }
            if (target.kind === 'current') { term.print(cwd()); continue; }
            const multi = resolveMulti(target);
            if (multi.error) {
                // 路径完全不存在 → 按字面量输出（print hello）；
                // 语义错误（如尾斜杠指向文件 / 选择器语法错误）→ 报错
                if (multi.key === 'not_found' || multi.key === 'not_found_name' || multi.key === 'sel_dir_missing') {
                    term.print(stripQuotes(raw));
                } else {
                    err(multi.error);
                }
                continue;
            }
            if (multi.denied && multi.denied.length) {
                err(T(L(), 'permission_denied', { user: term.fs.getPathOwner(target.dirPath || cwd()) || '' }));
            }
            const many = multi.nodes.length > 1;
            for (const { node, path } of multi.nodes) {
                if (node.type === 'folder') { term.print(node.name + '/', 'folder'); continue; }
                printFileNode(node, path, many);
            }
        }
    };

    // ---------- statistic ----------
    const statScopeResolve = (scopeRaw) => {
        const target = parseTarget(scopeRaw, cwd());
        const single = resolveSingle(target);
        if (!single.error) {
            return single.node.type === 'folder'
                ? { kind: 'folder', node: single.node, path: single.path }
                : { kind: 'file', node: single.node, path: single.path };
        }
        const multi = resolveMulti(target);
        if (!multi.error && multi.nodes.length) return { kind: 'multi', nodes: multi.nodes };
        return { kind: 'text', text: stripQuotes(scopeRaw) };
    };
    const countLine = (scope) => {
        if (scope.kind === 'file') return isTextFile(scope.node) ? (scope.node.content.length === 0 ? 0 : scope.node.content.split(/\r?\n|\r/).length) : 0;
        if (scope.kind === 'text') return scope.text.length === 0 ? 0 : scope.text.split(/\r?\n|\r/).length;
        const files = [];
        if (scope.kind === 'multi') files.push(...scope.nodes.filter(n => n.type === 'file'));
        else walkTextFiles(scope.node, scope.path, files);
        return files.reduce((s, f) => s + (f.node.content.length === 0 ? 0 : f.node.content.split(/\r?\n|\r/).length), 0);
    };
    const countWord = (scope) => {
        if (scope.kind === 'file') return isTextFile(scope.node) ? scope.node.content.length : 0;
        if (scope.kind === 'text') return scope.text.length;
        const files = [];
        if (scope.kind === 'multi') files.push(...scope.nodes.filter(n => n.type === 'file'));
        else walkTextFiles(scope.node, scope.path, files);
        return files.reduce((s, f) => s + f.node.content.length, 0);
    };
    const countSize = (scope) => {
        if (scope.kind === 'file') return term.fs.nodeSize(scope.node) / 1024;
        if (scope.kind === 'text') return new TextEncoder().encode(scope.text).length / 1024;
        if (scope.kind === 'multi') return scope.nodes.reduce((s, n) => s + term.fs.nodeSize(n), 0) / 1024;
        return term.fs.nodeSize(scope.node) / 1024;
    };
    const countCustom = (scope, word) => {
        const countIn = (text) => {
            if (!word) return 0;
            let n = 0, idx = text.indexOf(word);
            while (idx !== -1) { n++; idx = text.indexOf(word, idx + word.length); }
            return n;
        };
        if (scope.kind === 'file') return isTextFile(scope.node) ? countIn(scope.node.content) : 0;
        if (scope.kind === 'text') return countIn(scope.text);
        const files = [];
        if (scope.kind === 'multi') files.push(...scope.nodes.filter(n => n.type === 'file'));
        else walkTextFiles(scope.node, scope.path, files);
        return files.reduce((s, f) => s + countIn(f.node.content), 0);
    };
    const cmdStatistic = async (args) => {
        if (!args.length) { err(T(L(), 'stat_need_scope')); return; }
        const scope = statScopeResolve(args[0]);
        const objects = args.length > 1 ? args.slice(1) : ['size'];
        for (const obj of objects) {
            const low = obj.toLowerCase();
            if (low === 'line') {
                term.print(`${T(L(), 'stat_line')}: ${countLine(scope)}`);
            } else if (low === 'word') {
                term.print(`${T(L(), 'stat_word')}: ${countWord(scope)}`);
            } else if (low === 'size') {
                const kb = countSize(scope);
                term.print(`${T(L(), 'stat_size')}: ${Number.isInteger(kb) ? kb : kb.toFixed(2)} KB`);
            } else {
                const word = unescapeText(stripQuotes(obj));
                term.print(`${obj}: ${countCustom(scope, word)}`);
            }
        }
    };

    // ---------- copy ----------
    const resolveDestDir = (destArg) => {
        if (!destArg) return { path: cwd() };
        const dt = parseTarget(destArg, cwd());
        if (dt.kind === 'error') return { error: T(L(), dt.error, { path: dt.detail }) };
        if (dt.kind === 'current') return { path: cwd() };
        if (dt.kind === 'path') {
            const dn = term.fs.getNodeByAbsPath(dt.path);
            if (!dn) return { error: T(L(), 'target_missing', { path: dt.path }) };
            if (dn.type !== 'folder') return { error: T(L(), 'target_not_dir', { path: dt.path }) };
            return { path: dt.path };
        }
        return { error: T(L(), 'target_not_dir', { path: destArg }) };
    };
    const cmdCopy = async (args) => {
        if (!args.length) { err(T(L(), 'copy_need_arg')); return; }
        const dest = resolveDestDir(args[1]);
        if (dest.error) { err(dest.error); return; }
        if (term.fs.isSystemPath(dest.path)) { err(T(L(), 'system_readonly', { path: dest.path })); return; }
        if (!checkPerm(dest.path)) return;
        const destDir = term.fs.getNodeByAbsPath(dest.path);
        const multi = resolveMulti(parseTarget(args[0], cwd()));
        if (multi.error) { err(multi.error); return; }
        if (!multi.nodes.length) { err(T(L(), 'no_matches')); return; }
        for (const { node, path } of multi.nodes) {
            if (!checkPerm(path)) continue;
            if (term.fs.isSystemPath(path)) { err(T(L(), 'system_readonly', { path })); continue; }
            const r = term.fs.copyNodeTo(node, destDir);
            if (r.success) term.print(T(L(), 'copy_done', { src: node.name, dst: r.name }), 'success');
            else err(r.message);
        }
    };

    // ---------- move ----------
    const cmdMove = async (args) => {
        if (args.length < 2) { err(T(L(), 'move_need_arg')); return; }
        const dest = resolveDestDir(args[1]);
        if (dest.error) { err(dest.error); return; }
        if (term.fs.isSystemPath(dest.path)) { err(T(L(), 'system_readonly', { path: dest.path })); return; }
        if (!checkPerm(dest.path)) return;
        const destDir = term.fs.getNodeByAbsPath(dest.path);
        const multi = resolveMulti(parseTarget(args[0], cwd()));
        if (multi.error) { err(multi.error); return; }
        if (!multi.nodes.length) { err(T(L(), 'no_matches')); return; }
        for (const { node, path } of multi.nodes) {
            if (!checkPerm(path)) continue;
            if (term.fs.isSystemPath(path)) { err(T(L(), 'system_readonly', { path })); continue; }
            const r = term.fs.moveNodeTo(node, destDir);
            if (r.success) term.print(T(L(), 'move_done', { src: node.name, dst: dest.path }), 'success');
            else err(r.message);
        }
    };

    // ---------- find ----------
    const findPositions = (content, word) => {
        const out = [];
        if (!word) return out;
        content.split(/\r?\n|\r/).forEach((line, li) => {
            let idx = line.indexOf(word);
            while (idx !== -1) {
                out.push(`${li + 1}-${idx + 1}`);
                idx = line.indexOf(word, idx + 1);
            }
        });
        return out;
    };
    const cmdFind = async (args) => {
        if (args.length < 2) { err(T(L(), 'find_need_args')); return; }
        const scope = resolveSingle(parseTarget(args[0], cwd()));
        if (scope.error) { err(scope.error); return; }
        if (scope.node.type === 'file') {
            if (!isTextFile(scope.node)) { err(T(L(), 'binary_file', { path: scope.path })); return; }
            const positions = findPositions(scope.node.content, unescapeText(stripQuotes(args[1])));
            term.print('[' + positions.join(',') + ']');
            return;
        }
        // 文件夹内递归查找
        const objTarget = parseTarget(args[1], cwd());
        let params = null, nodeType = null, nameEq = null;
        if (objTarget.kind === 'selector') {
            const sel = parseSelector(objTarget.body);
            if (!sel.ok) { err(T(L(), sel.error, { part: sel.detail, key: sel.key, val: sel.detail })); return; }
            params = sel.params;
            nodeType = objTarget.nodeType;
        } else {
            nameEq = stripQuotes(args[1]);
        }
        const results = [];
        const now = Date.now();
        walk(scope.node, scope.path, (n, p) => {
            if (nodeType && (nodeType === 'file' ? n.type !== 'file' : n.type !== 'folder')) return;
            if (params && !matchParams(n, params, { now, sizeOf: x => term.fs.nodeSize(x) })) return;
            if (nameEq != null && n.name !== nameEq) return;
            results.push(p);
        });
        if (!results.length) { term.print(T(L(), 'find_empty')); return; }
        term.print('[' + results.join(' ,') + ']');
    };

    // ---------- create ----------
    const cmdCreate = async (args) => {
        const raw = stripQuotes(args[0] || '');
        if (!raw) { err(T(L(), 'create_need_arg')); return; }
        const isFolder = /\/+$/.test(raw);
        const core = raw.replace(/\/+$/, '');
        if (core.split('/').includes('..')) { printFalse(T(L(), 'name_special', { name: raw })); return; }
        const target = parseTarget(core, cwd());
        if (target.kind === 'error') { printFalse(T(L(), target.error, { path: target.detail })); return; }
        if (target.kind !== 'path') { printFalse(T(L(), 'create_need_arg')); return; }
        const path = target.path;
        const li = path.lastIndexOf('/');
        const parentPath = li <= 0 ? '/' : path.slice(0, li);
        const name = path.slice(li + 1);
        const v = validateName(name);
        if (!v.ok) { printFalse(T(L(), v.error, { name })); return; }
        if (term.fs.isSystemPath(parentPath)) { printFalse(T(L(), 'system_readonly', { path: parentPath })); return; }
        if (!checkPerm(parentPath)) { term.print('false', 'error'); return; }
        const parent = term.fs.getNodeByAbsPath(parentPath);
        if (!parent || parent.type !== 'folder') { printFalse(T(L(), 'not_found', { path: parentPath })); return; }
        if ((parent.children || []).some(c => c.name === name)) { printFalse(T(L(), 'already_exists', { name })); return; }
        if (!parent.children) parent.children = [];
        const node = isFolder ? { type: 'folder', name, children: [] } : { type: 'file', name, content: '' };
        term.fs._touch(node);
        parent.children.push(node);
        term.fs.save();
        term.print('true', 'success');
    };

    // ---------- rename ----------
    const cmdRename = async (args) => {
        if (args.length < 2) { err(T(L(), 'rename_need_args')); return; }
        const newName = stripQuotes(args[1]);
        const v = validateName(newName);
        if (!v.ok) { printFalse(T(L(), v.error, { name: newName })); return; }
        const single = resolveSingle(parseTarget(args[0], cwd()));
        if (single.error) { printFalse(single.error); return; }
        if (!checkPerm(single.path)) { term.print('false', 'error'); return; }
        if (term.fs.isSystemPath(single.path)) { printFalse(T(L(), 'system_readonly', { path: single.path })); return; }
        const r = term.fs.renameNodeAny(single.node, newName);
        if (r.success) term.print('true', 'success');
        else printFalse(r.message);
    };

    // ---------- delete ----------
    const PROTECTED_PATHS = ['/', '/application', '/languages', '/user/public'];
    const cmdDelete = async (args) => {
        const raw = stripQuotes(args[0] || '');
        if (!raw) { err(T(L(), 'delete_need_arg')); return; }
        const target = parseTarget(raw, cwd());
        if (target.kind === 'error') { printFalse(T(L(), target.error, { path: target.detail })); return; }
        if (target.kind === 'current') { term.print('0'); return; }
        const multi = resolveMulti(target);
        if (multi.error) { printFalse(multi.error); return; }
        if (!multi.nodes.length) { printFalse(T(L(), 'no_matches')); return; }
        const cur = cwd();
        for (const { node, path } of multi.nodes) {
            if (PROTECTED_PATHS.includes(path)) { printFalse(T(L(), 'protected_path', { path })); continue; }
            if (path === cur || cur.startsWith(path + '/')) { term.print('0'); continue; }
            if (term.fs.isSystemPath(path)) { printFalse(T(L(), 'protected_path', { path })); continue; }
            if (!checkPerm(path)) { term.print('false', 'error'); continue; }
            const r = term.fs.deleteNodeAny(node);
            if (r.success) term.print('true', 'success');
            else printFalse(r.message);
        }
    };

    // ---------- cd ----------
    const cmdCd = async (args) => {
        if (!args.length) {
            const home = term.fs.getHomeDir(term.currentUser.username);
            if (home) {
                const prev = cwd();
                term.fs.currentDir = home;
                term.fs.save();
                term.updatePrompt();
                term.checkLogoutOnExitHome(prev);
            }
            return;
        }
        const raw = stripQuotes(args.join(' '));
        const target = parseTarget(raw, cwd());
        if (target.kind === 'error') { err(T(L(), target.error, { path: target.detail })); return; }
        let node, path;
        if (target.kind === 'current') { node = term.fs.currentDir; path = cwd(); }
        else if (target.kind === 'path') {
            node = term.fs.getNodeByAbsPath(target.path);
            if (!node) { err(T(L(), 'not_found', { path: target.path })); return; }
            if (node.type !== 'folder') { err(T(L(), 'not_dir', { path: target.path })); return; }
            path = target.path;
        } else { err(T(L(), 'not_dir', { path: raw })); return; }
        if (!checkPerm(path)) return;
        const prev = cwd();
        term.fs.currentDir = node;
        term.fs.save();
        term.updatePrompt();
        term.checkLogoutOnExitHome(prev);
    };

    // ---------- list ----------
    const cmdList = async (args) => {
        let brief = false, tree = false, pathArg = null;
        for (const a of args) {
            if (a === '-b' || a === '--brief') { brief = true; continue; }
            if (a === 'tree') { tree = true; continue; }
            if (a.startsWith('-')) continue;
            if (!pathArg) pathArg = a;
        }
        const target = pathArg ? parseTarget(pathArg, cwd()) : { kind: 'current' };
        let node, path;
        if (target.kind === 'error') { err(T(L(), target.error, { path: target.detail })); return; }
        if (target.kind === 'current') { node = term.fs.currentDir; path = cwd(); }
        else if (target.kind === 'path') {
            node = term.fs.getNodeByAbsPath(target.path);
            if (!node) { err(T(L(), 'not_found', { path: target.path })); return; }
            if (node.type !== 'folder') {
                const size = term.fs.nodeSize(node);
                term.print(`[FILE]  ${String(size).padStart(8)}  ${node.name}`, 'file');
                return;
            }
            path = target.path;
        } else { err(T(L(), 'not_dir', { path: pathArg })); return; }
        if (!checkPerm(path)) return;
        if (tree) {
            const lines = term.fs.getTree(node, '', (n) => term.checkNodePermission(n), true);
            if (!lines.length) { term.print(T(L(), 'tree_empty')); return; }
            lines.forEach(l => term.print(l));
            return;
        }
        const items = node.children || [];
        if (!items.length) { term.print(T(L(), 'list_empty')); return; }
        items.forEach(item => {
            const isSys = item.type === 'folder' && term.fs.isHiddenDir(item.name);
            const tag = item.type === 'folder' ? (isSys ? '[SYS] ' : '[DIR] ') : '[FILE]';
            const cls = item.type === 'folder' ? (isSys ? 'folder system-folder' : 'folder') : 'file';
            if (brief) { term.print(`${tag}  ${item.name}`, cls); return; }
            const size = item.type === 'file' ? term.fs.nodeSize(item) : '-';
            term.print(`${tag}  ${String(size).padStart(8)}  ${item.name}`, cls);
        });
    };

    // ---------- SHA ----------
    const cmdSha = async (args) => {
        if (!args.length) { err(T(L(), 'sha_need_file')); return; }
        const mode = (args[1] || '').toUpperCase().replace(/[-_]/g, '');
        let algos;
        if (!mode) algos = ['SHA1', 'SHA256'];
        else if (mode === 'SHA1') algos = ['SHA1'];
        else if (mode === 'SHA256') algos = ['SHA256'];
        else { err(T(L(), 'sha_bad_mode', { mode: args[1] })); return; }
        const multi = resolveMulti(parseTarget(args[0], cwd()));
        if (multi.error) { err(multi.error); return; }
        if (!multi.nodes.length) { err(T(L(), 'no_matches')); return; }
        for (const { node, path } of multi.nodes) {
            if (node.type !== 'file') { err(T(L(), 'not_file', { path })); continue; }
            const bytes = contentToBytes(node.content);
            for (const algo of algos) {
                try {
                    const buf = await crypto.subtle.digest(algo === 'SHA1' ? 'SHA-1' : 'SHA-256', bytes);
                    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
                    term.print(T(L(), 'sha_result', { algo, path, hash: hex }));
                } catch (e) {
                    err(T(L(), 'sha_bad_mode', { mode: algo }) + ': ' + e.message);
                }
            }
        }
    };

    // ---------- Clear ----------
    const cmdClear = async () => {
        term.output.innerHTML = '';
        term.printWelcome();
    };

    // ---------- account ----------
    const cmdAccount = async (args) => {
        if (!args.length) { term.print(term.currentUser.username); return; }
        const mode = args[0].toLowerCase();
        const m = (mode === 'new' || mode === 'n') ? 'new'
            : (mode === 'switch' || mode === 's') ? 'switch'
                : (mode === 'delete' || mode === 'd') ? 'delete' : null;
        if (!m) { err(T(L(), 'account_unknown_mode', { mode: args[0] })); err(T(L(), 'account_usage')); return; }
        const username = args[1];
        if (!username) { err(T(L(), 'account_need_user')); return; }
        if (m === 'new') {
            const password = args[2] || null;
            const userResult = term.userManager.createUser(username, password);
            if (!userResult.success) { err(userResult.message); return; }
            const dirResult = term.fs.createUserHome(username);
            if (!dirResult.success && dirResult.message !== '用户目录已存在') {
                term.userManager.deleteUser(username);
                err(dirResult.message);
                return;
            }
            term.print(T(L(), 'user_created', { name: username }), 'success');
            document.dispatchEvent(new CustomEvent('users-changed'));
            return;
        }
        if (m === 'switch') {
            const user = term.userManager.getUser(username);
            if (!user) { err(T(L(), 'user_not_exist', { name: username })); return; }
            if (user.password) {
                const D = window.Dialogs;
                const inputPassword = D ? await D.showPrompt(T(L(), 'enter_password', { name: username }), '') : prompt(T(L(), 'enter_password', { name: username }));
                if (!inputPassword || !term.userManager.verifyPassword(username, inputPassword)) {
                    err(T(L(), 'password_wrong'));
                    return;
                }
            }
            term.currentUser = user;
            term.initUserEnvironment();
            term.updatePrompt();
            term.print(T(L(), 'switch_done', { name: username }), 'success');
            term.print(T(L(), 'current_dir_note', { path: cwd() }), 'success');
            document.dispatchEvent(new CustomEvent('request-user-switch', { detail: { username } }));
            return;
        }
        // delete
        if (username === 'public') { err(T(L(), 'public_protected')); return; }
        if (username === term.currentUser.username) { err(T(L(), 'cannot_delete_self')); return; }
        const user = term.userManager.getUser(username);
        if (!user) { err(T(L(), 'user_not_exist', { name: username })); return; }
        if (user.password) { err(T(L(), 'user_has_password', { name: username })); return; }
        const currentPath = cwd();
        const isInDeletedUserDir = currentPath.startsWith(`/user/${username}`);
        const userResult = term.userManager.deleteUser(username);
        if (!userResult.success) { err(userResult.message); return; }
        const dirResult = term.fs.deleteUserHome(username);
        term.print(T(L(), 'user_deleted', { name: username }), 'success');
        if (!dirResult.success) err(dirResult.message);
        if (isInDeletedUserDir) {
            const remaining = term.userManager.listUsers();
            if (remaining.length > 0) {
                const newUser = remaining[0];
                term.currentUser = newUser;
                term.initUserEnvironment();
                term.updatePrompt();
                term.print(T(L(), 'auto_switched', { name: newUser.username }), 'success');
                document.dispatchEvent(new CustomEvent('request-user-switch', { detail: { username: newUser.username } }));
            }
        }
        document.dispatchEvent(new CustomEvent('users-changed'));
    };

    // ---------- personality ----------
    const persPath = () => `/user/${term.currentUser.username}/info/personalization.json`;
    const loadPers = () => { try { return term.fs.storage.loadJSON(persPath()) || {}; } catch (e) { return {}; } };
    const savePers = (pers) => {
        try { term.fs.storage.saveJSON(persPath(), pers); } catch (e) {}
        document.dispatchEvent(new CustomEvent('personality-changed'));
    };
    const ls = (k, dflt) => { try { return localStorage.getItem(k) != null ? localStorage.getItem(k) : dflt; } catch (e) { return dflt; } };
    const normHex = (v) => {
        let s = String(v || '').trim();
        if (!s.startsWith('#')) s = '#' + s;
        if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
        return s.toLowerCase();
    };
    const describeWallpaper = (wp) => {
        if (!wp || !wp.type) return '-';
        if (wp.type === 'solid' || wp.type === 'color') return T(L(), 'ps_wp_solid_set', { color: wp.color || wp.value || '-' });
        if (wp.type === 'gradient') {
            const dir = wp.direction === 'circle' ? T(L(), 'ps_wp_radial') : T(L(), 'ps_wp_linear', { deg: String(wp.direction || '135deg').replace('deg', '') });
            return T(L(), 'ps_wp_gradient_set', { start: wp.start || '-', end: wp.end || '-', direction: dir });
        }
        const v = String(wp.value || wp.data || '');
        return T(L(), 'ps_wp_media_set', { value: v.length > 60 ? v.slice(0, 60) + '…' : v });
    };
    const applyWallpaperMedia = (value) => {
        const lower = String(value).toLowerCase();
        const isVideo = /\.(mp4|webm|ogg|mov)(\?|$)/.test(lower) || /^data:video\//.test(lower);
        return { type: isVideo ? 'video' : 'image', value };
    };
    const cmdPersonality = async (args) => {
        const key = (args[0] || '').toLowerCase();
        if (!key) { err(T(L(), 'ps_usage')); return; }
        const pers = loadPers();
        if (key === 'animation' || key === 'autohide') {
            const isAnim = key === 'animation';
            const cur = isAnim ? (pers.animations !== undefined ? !!pers.animations : ls('webos-animations', 'true') !== 'false')
                : (pers.taskbarAutohide !== undefined ? !!pers.taskbarAutohide : ls('webos-taskbar-autohide', 'false') === 'true');
            if (!args[1]) {
                term.print(T(L(), isAnim ? 'ps_animation_current' : 'ps_autohide_current', { state: cur ? T(L(), 'state_on') : T(L(), 'state_off') }));
                return;
            }
            const v = args[1].toLowerCase();
            if (!['on', 'off', 'switch', 'true', 'false'].includes(v)) { err(T(L(), 'ps_bad_onoff')); return; }
            const next = v === 'switch' ? !cur : (v === 'on' || v === 'true');
            if (isAnim) { pers.animations = next; try { localStorage.setItem('webos-animations', next ? 'true' : 'false'); } catch (e) {} }
            else { pers.taskbarAutohide = next; try { localStorage.setItem('webos-taskbar-autohide', next ? 'true' : 'false'); } catch (e) {} }
            savePers(pers);
            term.print(T(L(), isAnim ? 'ps_animation_set' : 'ps_autohide_set', { state: next ? T(L(), 'state_on') : T(L(), 'state_off') }), 'success');
            return;
        }
        if (key === 'font') {
            const cur = pers.fontSize != null ? pers.fontSize : (parseInt(ls('webos-font-size', '14'), 10) || 14);
            if (!args[1]) { term.print(T(L(), 'ps_font_current', { value: cur })); return; }
            const n = parseInt(args[1], 10);
            if (!Number.isFinite(n) || n <= 0 || String(n) !== String(args[1]).trim()) { err(T(L(), 'ps_font_invalid')); return; }
            pers.fontSize = n;
            try { localStorage.setItem('webos-font-size', String(n)); } catch (e) {}
            savePers(pers);
            term.print(T(L(), 'ps_font_set', { value: n }), 'success');
            return;
        }
        if (key === 'opacity') {
            const cur = pers.windowOpacity != null ? pers.windowOpacity : (parseInt(ls('webos-window-opacity', '100'), 10) || 100);
            if (!args[1]) { term.print(T(L(), 'ps_opacity_current', { value: cur })); return; }
            const n = parseInt(args[1], 10);
            if (!Number.isFinite(n) || n < 70 || n > 100) { err(T(L(), 'ps_opacity_range')); return; }
            pers.windowOpacity = n;
            try { localStorage.setItem('webos-window-opacity', String(n)); } catch (e) {}
            savePers(pers);
            term.print(T(L(), 'ps_opacity_set', { value: n }), 'success');
            return;
        }
        if (key === 'theme') {
            const cur = pers.accentColor || ls('webos-accent-color', '#1abc9c');
            if (!args[1]) { term.print(T(L(), 'ps_theme_current', { color: cur })); return; }
            const color = normHex(args[1]);
            if (!color) { err(T(L(), 'ps_bad_hex', { value: args[1] })); return; }
            pers.accentColor = color;
            try { localStorage.setItem('webos-accent-color', color); } catch (e) {}
            savePers(pers);
            term.print(T(L(), 'ps_theme_set', { color }), 'success');
            return;
        }
        if (key === 'wallpaper') {
            const sub = (args[1] || '').toLowerCase();
            if (!sub) {
                term.print(T(L(), 'ps_wallpaper_current', { desc: describeWallpaper(pers.wallpaper) }));
                return;
            }
            if (sub === 'solid') {
                const color = normHex(args[2]);
                if (!color) { err(T(L(), 'ps_bad_hex', { value: args[2] || '' })); return; }
                pers.wallpaper = { type: 'solid', color };
                savePers(pers);
                term.print(T(L(), 'ps_wp_solid_set', { color }), 'success');
                return;
            }
            if (sub === 'gradient') {
                const start = normHex(args[2]);
                const end = normHex(args[3]);
                if (!start || !end) { err(T(L(), 'ps_bad_hex', { value: !start ? (args[2] || '') : (args[3] || '') })); return; }
                let direction = args[4] || '135deg';
                if (/^\d+$/.test(direction)) direction = direction + 'deg';
                if (direction.toLowerCase() === 'radial') direction = 'circle';
                pers.wallpaper = { type: 'gradient', start, end, direction };
                savePers(pers);
                term.print(T(L(), 'ps_wp_gradient_set', { start, end, direction: direction === 'circle' ? T(L(), 'ps_wp_radial') : T(L(), 'ps_wp_linear', { deg: direction.replace('deg', '') }) }), 'success');
                return;
            }
            if (sub === 'media') {
                if (!args[2]) {
                    // 不填参数 → 弹出上传文件窗口
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*,video/*';
                    input.style.display = 'none';
                    document.body.appendChild(input);
                    input.addEventListener('change', () => {
                        const file = input.files && input.files[0];
                        if (!file) { document.body.removeChild(input); return; }
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            const data = ev.target.result;
                            const p2 = loadPers();
                            p2.wallpaper = applyWallpaperMedia(data);
                            savePers(p2);
                            term.print(T(L(), 'ps_wp_media_set', { value: file.name }), 'success');
                            document.body.removeChild(input);
                        };
                        reader.onerror = () => { err(T(L(), 'import_read_failed')); document.body.removeChild(input); };
                        reader.readAsDataURL(file);
                    });
                    input.click();
                    return;
                }
                const raw = stripQuotes(args[2]);
                let value = raw;
                if (!/^(https?:)?\/\//i.test(raw) && !raw.startsWith('data:')) {
                    const target = parseTarget(raw, cwd());
                    if (target.kind === 'path') {
                        const node = term.fs.getNodeByAbsPath(target.path);
                        if (!node || node.type !== 'file') { err(T(L(), 'not_found', { path: target.path })); return; }
                        value = node.content;
                    } else {
                        err(T(L(), 'not_found', { path: raw }));
                        return;
                    }
                }
                pers.wallpaper = applyWallpaperMedia(value);
                savePers(pers);
                term.print(T(L(), 'ps_wp_media_set', { value: raw.length > 60 ? raw.slice(0, 60) + '…' : raw }), 'success');
                return;
            }
            err(T(L(), 'ps_wp_unknown', { type: args[1] }));
            err(T(L(), 'ps_wallpaper_usage'));
            return;
        }
        err(T(L(), 'ps_unknown', { key: args[0] }));
        err(T(L(), 'ps_usage'));
    };

    // ---------- export ----------
    const cmdExport = async (args) => {
        const raw = args[0] ? stripQuotes(args[0]) : '~';
        const target = parseTarget(raw, cwd());
        if (target.kind === 'error') { err(T(L(), target.error, { path: target.detail })); return; }
        const multi = resolveMulti(target);
        if (multi.error) { err(multi.error); return; }
        if (!multi.nodes.length) { err(T(L(), 'no_matches')); return; }
        for (const { node, path } of multi.nodes) {
            if (!checkPerm(path)) continue;
            if (node.type === 'file') term.exportFile(node);
            else term.exportFolder(node);
        }
    };

    // ---------- import ----------
    const cmdImport = async (args) => {
        if (term.fs.isSystemPath(cwd())) { err(T(L(), 'import_system_readonly')); return; }
        if (args.length >= 2) {
            const dt = parseTarget(args[0], cwd());
            let dirPath = cwd();
            if (dt.kind === 'path') {
                const dn = term.fs.getNodeByAbsPath(dt.path);
                if (!dn || dn.type !== 'folder') { err(T(L(), 'target_not_dir', { path: args[0] })); return; }
                dirPath = dt.path;
            } else if (dt.kind === 'current') {
                dirPath = cwd();
            } else { err(T(L(), 'import_usage')); return; }
            term.importFromUrl(args[1], dirPath);
            return;
        }
        if (args.length === 1) {
            const a = stripQuotes(args[0]);
            if (/^(https?:)?\/\//i.test(a)) { term.importFromUrl(a, cwd()); return; }
            const dt = parseTarget(a, cwd());
            if (dt.kind === 'path') {
                const dn = term.fs.getNodeByAbsPath(dt.path);
                if (!dn || dn.type !== 'folder') { err(T(L(), 'target_not_dir', { path: a })); return; }
                term.importFromFile(dt.path);
                return;
            }
            err(T(L(), 'import_usage'));
            return;
        }
        term.importFromFile(cwd());
    };

    // ---------- language ----------
    const langName = (code) => T(L(), 'lang_' + code, {});
    const cmdLanguage = async (args) => {
        if (!args.length) {
            printLines(T(L(), 'lang_list', { current: langName(term.lang) }));
            return;
        }
        const lang = args[0].toLowerCase();
        if (!LANGS.includes(lang)) { err(T(L(), 'lang_unknown', { lang: args[0] })); return; }
        try { localStorage.setItem('webos-language', lang); } catch (e) {}
        try { term.fs.storage.saveJSON(`/user/${term.currentUser.username}/info/language.json`, { language: lang }); } catch (e) {}
        document.dispatchEvent(new CustomEvent('language-changed', { detail: { lang } }));
        term.setLang(lang);
        term.print(T(lang, 'lang_switched', { name: T(lang, 'lang_' + lang, {}), code: lang }), 'success');
    };

    // ---------- date ----------
    const cmdDate = async () => {
        term.print(String(Date.now()));
    };

    // ---------- application ----------
    const getSystemAppPaths = async () => {
        if (term._systemAppPaths) return term._systemAppPaths;
        let paths = new Set();
        try {
            const res = await fetch(new URL('../apps/manifest.json', import.meta.url).href);
            if (res.ok) {
                const manifest = await res.json();
                (manifest || []).forEach(a => { if (a && a.path) paths.add(a.path); });
            }
        } catch (e) { /* 离线/失败时无保护集 */ }
        term._systemAppPaths = paths;
        return paths;
    };
    const listInstalledApps = () => {
        const appDir = term.fs.getNodeByAbsPath('/application');
        const out = [];
        for (const c of (appDir && appDir.children) || []) {
            if (c.type !== 'folder' || !c.name.endsWith('.app')) continue;
            const infoFile = (c.children || []).find(f => f.name === 'info.json' && f.type === 'file');
            let name = c.name.replace(/\.app$/, ''), version = '1.0.0';
            if (infoFile) { try { const info = JSON.parse(infoFile.content); name = info.name || name; version = info.version || version; } catch (e) {} }
            out.push({ path: c.name, name, version });
        }
        return out;
    };
    const cmdApplication = async (args) => {
        const op = (args[0] || 'list').toLowerCase();
        if (op === 'list') {
            const apps = listInstalledApps();
            if (!apps.length) { term.print(T(L(), 'app_none')); return; }
            apps.forEach(a => term.print(`  ${a.path} - ${a.name} v${a.version}`));
            return;
        }
        if (op === 'run') {
            if (!args[1]) { err(T(L(), 'app_need_name')); return; }
            let name = args[1].endsWith('.app') ? args[1] : args[1] + '.app';
            const node = term.fs.getNodeByAbsPath('/application/' + name);
            if (!node) { err(T(L(), 'app_not_found', { name: args[1] })); return; }
            document.dispatchEvent(new CustomEvent('app-launch-real', { detail: { path: name } }));
            term.print(T(L(), 'app_running', { name }), 'success');
            return;
        }
        if (op === 'install') {
            if (!args[1]) { err(T(L(), 'app_install_need_path')); return; }
            const target = parseTarget(args[1], cwd());
            if (target.kind !== 'path') { err(T(L(), 'app_install_need_path')); return; }
            const src = term.fs.getNodeByAbsPath(target.path);
            if (!src || src.type !== 'folder' || !src.name.endsWith('.app')) {
                err(T(L(), 'app_not_found', { name: args[1] }));
                return;
            }
            const infoFile = (src.children || []).find(c => c.name === 'info.json' && c.type === 'file');
            if (!infoFile) { err(T(L(), 'app_no_info', { path: target.path })); return; }
            let info;
            try { info = JSON.parse(infoFile.content); } catch (e) { err(T(L(), 'app_bad_info', { detail: e.message })); return; }
            const appPath = info.id ? `${info.id}.app` : src.name;
            const appDir = term.fs.getNodeByAbsPath('/application');
            if (!appDir) { err(T(L(), 'app_install_failed', { detail: '/application 不存在' })); return; }
            const existing = (appDir.children || []).find(c => c.name === appPath);
            if (existing) term.fs.deleteNodeAny(existing);
            const r = term.fs.copyNodeTo(src, appDir, appPath);
            if (!r.success) { err(T(L(), 'app_install_failed', { detail: r.message })); return; }
            document.dispatchEvent(new CustomEvent('apps-changed', { detail: { action: 'install', path: appPath } }));
            term.print(T(L(), 'app_installed', { name: info.name || appPath, path: appPath }), 'success');
            return;
        }
        if (op === 'uninstall') {
            if (!args[1]) { err(T(L(), 'app_need_name')); return; }
            const name = args[1].endsWith('.app') ? args[1] : args[1] + '.app';
            const systemPaths = await getSystemAppPaths();
            if (systemPaths.has(name)) { err(T(L(), 'app_protected', { name })); return; }
            const node = term.fs.getNodeByAbsPath('/application/' + name);
            if (!node) { err(T(L(), 'app_not_found', { name: args[1] })); return; }
            const r = term.fs.deleteNodeAny(node);
            if (!r.success) { err(T(L(), 'app_install_failed', { detail: r.message })); return; }
            document.dispatchEvent(new CustomEvent('apps-changed', { detail: { action: 'uninstall', path: name } }));
            term.print(T(L(), 'app_uninstalled', { name }), 'success');
            return;
        }
        err(T(L(), 'app_unknown_op', { op: args[0] || '' }));
        err(T(L(), 'app_usage'));
    };

    // ---------- history ----------
    const cmdHistory = async (args) => {
        const a = (args[0] || '').toLowerCase();
        if (a === 'clear' || a === '-c' || a === '--clear') {
            term.history = [];
            term.saveHistory();
            term.print(T(L(), 'history_cleared'), 'success');
            return;
        }
        if (args.length && a !== 'clear' && !/^\d+$/.test(a)) { err(T(L(), 'history_usage')); return; }
        if (!term.history.length) { term.print(T(L(), 'history_empty')); return; }
        const maxN = args.length && /^\d+$/.test(a) ? parseInt(a, 10) : term.history.length;
        const slice = term.history.slice(0, Math.max(0, maxN));
        const width = String(slice.length).length;
        slice.forEach((h, i) => term.print(`${String(i + 1).padStart(width)}  ${h}`));
    };

    // ---------- vi ----------
    const cmdVi = async (args) => {
        if (!args.length) { err(T(L(), 'vi_need_file')); return; }
        const target = parseTarget(args[0], cwd());
        if (target.kind === 'error') { err(T(L(), target.error, { path: target.detail })); return; }
        if (target.kind === 'current') { err(T(L(), 'vi_is_folder', { path: cwd() })); return; }
        const node = term.fs.getNodeByAbsPath(target.path);
        if (!node) { err(T(L(), 'vi_not_found', { path: target.path })); return; }
        if (node.type !== 'file') { err(T(L(), 'vi_is_folder', { path: target.path })); return; }
        if (!checkPerm(target.path)) return;
        term.viEditor.open(node.name, node.content, node);
    };

    return {
        print: cmdPrint,
        statistic: cmdStatistic,
        copy: cmdCopy,
        find: cmdFind,
        create: cmdCreate,
        move: cmdMove,
        rename: cmdRename,
        delete: cmdDelete,
        cd: cmdCd,
        list: cmdList,
        SHA: cmdSha,
        Clear: cmdClear,
        account: cmdAccount,
        personality: cmdPersonality,
        export: cmdExport,
        import: cmdImport,
        language: cmdLanguage,
        date: cmdDate,
        application: cmdApplication,
        history: cmdHistory,
        vi: cmdVi,
        edit: async (args) => term.handleEdit(args),
    };
}

// ─────────────────────────────────────────────────────────────
//  表装配
// ─────────────────────────────────────────────────────────────

/** 构建命令表：{ name → entry }，entry.run 已绑定 term。 */
export function buildCommandTable(term) {
    const handlers = buildHandlers(term);
    const table = new Map();
    for (const [name, meta] of Object.entries(META)) {
        const run = handlers[name];
        if (!run) continue;
        table.set(name, {
            name,
            aliases: meta.aliases || [],
            group: meta.group,
            usage: meta.usage,
            desc: meta.desc,
            examples: meta.examples,
            run,
        });
    }
    return table;
}

/** 别名解析：旧命令名/简写 → { name, args } */
export function resolveAlias(table, name, args) {
    const direct = table.get(name);
    if (direct) return { name, args };
    // 简写（p/s/cp/...）
    for (const entry of table.values()) {
        if (entry.aliases.includes(name)) return { name: entry.name, args };
    }
    // 旧命令迁移
    const legacy = ALIASES[name];
    if (legacy) {
        const target = legacy.target;
        if (table.has(target)) return { name: target, args: legacy.transform(args) };
    }
    return null;
}

/** 全部可补全的命令名（含简写与旧别名） */
export function allCommandNames(table) {
    const names = new Set();
    for (const entry of table.values()) {
        names.add(entry.name);
        (entry.aliases || []).forEach(a => names.add(a));
    }
    Object.keys(ALIASES).forEach(a => names.add(a));
    return [...names];
}

/** help 分组（按 GROUPS 顺序，命令按名称字母序） */
export function helpGroups(table, lang) {
    return GROUPS.map(g => {
        const rows = [];
        for (const entry of table.values()) {
            if (entry.group !== g.id) continue;
            rows.push(entry);
        }
        rows.sort((a, b) => a.name.localeCompare(b.name));
        return {
            id: g.id,
            title: g[lang] || g.cmn,
            rows: rows.map(e => {
                const sig = e.aliases.length ? `${e.name} (${e.aliases.join('/')})` : e.name;
                const usage = e.usage[lang] || e.usage.cmn;
                const desc = e.desc[lang] || e.desc.cmn;
                const sigFull = usage.replace(/^[^\s<]+/, (m) => sig);
                return { name: e.name, sig: sigFull, desc, examples: e.examples[lang] || e.examples.cmn };
            }),
        };
    }).filter(g => g.rows.length > 0);
}

/** 单命令详细帮助（本地化） */
export function printCommandHelp(term, table, name) {
    const L = () => term.lang;
    const resolved = resolveAlias(table, String(name || '').toLowerCase(), []);
    const entry = resolved ? table.get(resolved.name) : null;
    if (!entry) {
        term.print(T(L(), 'unknown_command', { cmd: name }));
        return;
    }
    const usage = entry.usage[L()] || entry.usage.cmn;
    const desc = entry.desc[L()] || entry.desc.cmn;
    const examples = entry.examples[L()] || entry.examples.cmn;
    const pad = (s, n) => { const t2 = s || ''; return t2.length >= n ? t2 : t2 + ' '.repeat(n - t2.length); };
    term.print(`${entry.name} - ${desc}`, 'folder');
    term.print(`  ${pad(usage, 46)}  ${entry.aliases.length ? T(L(), 'help_hint') : ''}`.trimEnd());
    if (entry.aliases.length) term.print(`  ${pad(T(L(), 'usage') + ': ' + entry.name, 46)}  简写: ${entry.aliases.join(' / ')}`);
    if (examples && examples.length) {
        term.print(`  ${T(L(), 'usage')}:`, 'folder');
        examples.forEach(ex => term.print(`    ${ex}`));
    }
}

/** 完整 help 树（本地化） */
export function printFullHelp(term, table) {
    const L = () => term.lang;
    term.print(T(L(), 'help_title'), 'folder');
    term.print(`└─ ${T(L(), 'help_hint')}`);
    const pad = (s, n) => { const t2 = s || ''; return t2.length >= n ? t2 : t2 + ' '.repeat(n - t2.length); };
    const groups = helpGroups(table, L());
    const sigWidth = Math.min(46, groups.reduce((m, g) => g.rows.reduce((mm, r) => Math.max(mm, r.sig.length), m), 10));
    groups.forEach((g, gi) => {
        const isLastGroup = gi === groups.length - 1;
        term.print('');
        term.print((isLastGroup ? '└── ' : '├── ') + `[${g.title}]`, 'folder');
        g.rows.forEach((r, ri) => {
            const isLastRow = ri === g.rows.length - 1;
            const br1 = isLastGroup ? '    ' : '│   ';
            const br2 = isLastRow ? '└─ ' : '├─ ';
            const sigTrim = r.sig.length > sigWidth ? r.sig.slice(0, sigWidth - 1) + '…' : r.sig;
            term.print(`${br1}${br2}${pad(sigTrim, sigWidth + 2)} ${r.desc}`);
        });
    });
    term.print('');
    term.print(`├── ${T(L(), 'help_special_title')}`, 'folder');
    term.print(`│   ${pad('~', sigWidth + 2)} ${T(L(), 'help_special_tilde')}`);
    term.print(`│   ${pad('[]', sigWidth + 2)} ${T(L(), 'help_special_selector')}`);
    term.print(`│   ${pad('&&', sigWidth + 2)} ${T(L(), 'help_special_and')}`);
    term.print(`│   ${pad('../', sigWidth + 2)} ${T(L(), 'help_special_dotdot')}`);
    term.print(`└   ${pad('name', sigWidth + 2)} ${T(L(), 'help_special_namelimit')}`);
    term.print('');
    term.print(T(L(), 'help_dir_title'), 'folder');
    const w = 30;
    term.print(`  ${pad('/application/', w)} ${T(L(), 'help_dir_application')}`);
    term.print(`  ${pad('/languages/', w)} ${T(L(), 'help_dir_languages')}`);
    term.print(`  ${pad('/user/<用户名>/', w)} ${T(L(), 'help_dir_user')}`);
    term.print(`  ${pad('  /user/<名>/info/', w)} ${T(L(), 'help_dir_info')}`);
    term.print(`  ${pad('  /user/<名>/appinfo/', w)} ${T(L(), 'help_dir_appinfo')}`);
    term.print('');
    term.print(T(L(), 'help_vi_title'), 'folder');
    term.print(`  ${pad('i', w)} ${T(L(), 'help_vi_i')}`);
    term.print(`  ${pad('Esc', w)} ${T(L(), 'help_vi_esc')}`);
    term.print(`  ${pad(':w', w)} ${T(L(), 'help_vi_w')}`);
    term.print(`  ${pad(':q', w)} ${T(L(), 'help_vi_q')}`);
    term.print(`  ${pad(':wq', w)} ${T(L(), 'help_vi_wq')}`);
    term.print(`  ${pad(':q!', w)} ${T(L(), 'help_vi_qforce')}`);
    term.print(`  ${pad('dd', w)} ${T(L(), 'help_vi_dd')}`);
    term.print(`  ${pad('x', w)} ${T(L(), 'help_vi_x')}`);
    term.print(`  ${pad('u', w)} ${T(L(), 'help_vi_u')}`);
    term.print(`  ${pad('Ctrl + r', w)} ${T(L(), 'help_vi_ctrlr')}`);
}

export { splitCommandLine, tokenize, parseTarget, stripQuotes, validateName, resolvePathStr, parseSelector, matchParams, T as _T, LANGS, META, GROUPS, ALIASES };
