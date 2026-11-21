// src/terminal/parser.js
// 终端特殊字符解析层：
//   ~        当前路径（~ 或 ~/folder/file.txt）
//   []       条件选择器（file[...] / folder[...]）
//   &&       依次运行多条命令
//   ../      上级目录（/../ 非法）
//   名字合法性 文件/文件夹名禁止包含特殊字符（~ [ ] & * 以及 ..）
//
// 本模块只做“语法层”解析，不触碰 VFS。

const SPECIAL_CHAR_RE = /[~[\]&*]/;

/** 名称是否包含特殊字符（含 .. 序列）。 */
export function hasSpecialChars(name) {
    const n = String(name == null ? '' : name);
    if (!n) return false;
    return SPECIAL_CHAR_RE.test(n) || n.includes('..');
}

/** 名称合法性校验：禁止特殊字符、禁止 / 、禁止为空。 */
export function validateName(name) {
    const n = String(name == null ? '' : name).trim();
    if (!n) return { ok: false, error: 'name_empty' };
    if (n.includes('/')) return { ok: false, error: 'name_special', detail: n };
    if (hasSpecialChars(n)) return { ok: false, error: 'name_special', detail: n };
    return { ok: true, name: n };
}

/** 去掉 token 首尾一对引号（双或单）。 */
export function stripQuotes(token) {
    const s = String(token == null ? '' : token);
    if (s.length >= 2) {
        const f = s[0], l = s[s.length - 1];
        if ((f === '"' && l === '"') || (f === "'" && l === "'")) return s.slice(1, -1);
    }
    return s;
}

/**
 * 把一行命令按 && 切成多条（引号内的 && 不切分）。
 * @returns {string[]} 各条命令（已 trim，空段已过滤）
 */
export function splitCommandLine(line) {
    const segments = [];
    let cur = '';
    let inQuote = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
            cur += ch;
            if (ch === inQuote) inQuote = null;
            continue;
        }
        if (ch === '"' || ch === "'") { inQuote = ch; cur += ch; continue; }
        if (ch === '&' && line[i + 1] === '&') {
            segments.push(cur);
            cur = '';
            i++;
            continue;
        }
        cur += ch;
    }
    segments.push(cur);
    return segments.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * 把一条命令切成 token（按空白，引号内的空白保留，引号本身保留在 token 里）。
 */
export function tokenize(segment) {
    const tokens = [];
    let cur = '';
    let inQuote = null;
    let has = false;
    const push = () => { if (has) { tokens.push(cur); cur = ''; has = false; } };
    for (let i = 0; i < segment.length; i++) {
        const ch = segment[i];
        if (inQuote) {
            cur += ch;
            if (ch === inQuote) inQuote = null;
            continue;
        }
        if (ch === '"' || ch === "'") { inQuote = ch; cur += ch; has = true; continue; }
        if (/\s/.test(ch)) { push(); continue; }
        cur += ch;
        has = true;
    }
    push();
    return tokens;
}

/**
 * 把路径字符串解析为规范化绝对路径（支持 ~ 前缀与 ../ 多级回退）。
 * @returns {{path:string}|{error:'illegal_parent', detail:string}}
 */
export function resolvePathStr(p, cwd) {
    let s = String(p == null ? '' : p);
    if (s === '' || s === '.') return { path: cwd };
    if (s === '~') return { path: cwd };
    if (s.startsWith('~/')) s = cwd.replace(/\/+$/, '') + '/' + s.slice(2);
    // ~ 后直接跟非斜杠内容（如 ~abc）不展开，按普通相对名处理
    if (!s.startsWith('/')) s = cwd.replace(/\/+$/, '') + '/' + s;
    const out = [];
    for (const seg of s.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') {
            if (out.length === 0) return { error: 'illegal_parent', detail: p };
            out.pop();
            continue;
        }
        out.push(seg);
    }
    return { path: '/' + out.join('/') };
}

const SELECTOR_RE = /^(.*?)(file|folder)\[([^\]]*)\]$/;

/**
 * 解析一个“目标 token”（路径 / 选择器 / 当前路径）。
 * @returns {{kind:'current'}}
 *         | {{kind:'path', path:string, trailingSlash:boolean}}
 *         | {{kind:'selector', dirPath:string, nodeType:'file'|'folder', body:string}}
 *         | {{kind:'error', error:string, detail:string}}
 */
export function parseTarget(rawToken, cwd) {
    const token = stripQuotes(rawToken);
    if (token === '') return { kind: 'error', error: 'name_empty' };
    if (token === '~') return { kind: 'current' };
    const m = SELECTOR_RE.exec(token);
    if (m && (m[1] === '' || m[1].endsWith('/'))) {
        const dirPart = m[1] ? m[1].replace(/\/+$/, '') : '';
        const dirRes = dirPart ? resolvePathStr(dirPart, cwd) : { path: cwd };
        if (dirRes.error) return { kind: 'error', error: dirRes.error, detail: dirRes.detail };
        return { kind: 'selector', dirPath: dirRes.path, nodeType: m[2], body: m[3] };
    }
    const trailingSlash = token !== '/' && /\/+$/.test(token);
    const core = trailingSlash ? token.replace(/\/+$/, '') : token;
    if (core === '') return { kind: 'path', path: '/', trailingSlash: false };
    const res = resolvePathStr(core, cwd);
    if (res.error) return { kind: 'error', error: res.error, detail: res.detail };
    return { kind: 'path', path: res.path, trailingSlash };
}
