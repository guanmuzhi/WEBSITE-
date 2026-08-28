// src/lib/path.js
// 统一的 VFS 路径规范化 / 切分 / 合并工具。
// VFS 是内部的虚拟文件树，不依赖真实 OS，所以与 Node path 略有差异：
//   - 所有分隔符统一为 '/'
//   - '..' / '.' 在 join/normalize/resolve 的中间段会被处理
//   - 绝对路径以 '/' 开头，否则视为相对
//   - 空串 '' 在 normalize() 下标准化为 '.'

const SEP = '/';

/** 清理多斜杠和末尾斜杠（根 '/' 保留），处理 '.', '..' */
function normalize(p = '') {
    if (!p) return '.';
    const abs = p.startsWith(SEP);
    // 末尾斜杠："/user/public/" 应归一化为 "/user/public"，根 "/" 保留
    let s = p.replace(/\\+/g, SEP).replace(/\/+/g, SEP);
    if (s.length > 1 && s.endsWith(SEP)) s = s.slice(0, -1);
    const segments = s.split(SEP).filter(x => x !== '' && x !== '.');
    const out = [];
    for (const seg of segments) {
        if (seg === '..') {
            if (out.length > 0 && out[out.length - 1] !== '..') {
                out.pop();
            } else if (!abs) {
                out.push('..');
            }
            // 绝对路径 + 无上级：静默丢弃（/.. => /）
        } else {
            out.push(seg);
        }
    }
    if (abs) return SEP + out.join(SEP);
    if (out.length === 0) return '.';
    return out.join(SEP);
}

/** 把 base 与多个路径片段合并，返回规范化结果 */
function join(base = '', ...parts) {
    if (parts.length === 0) return normalize(base);
    const joined = [base, ...parts].filter(x => x != null && x !== '').join(SEP);
    return normalize(joined);
}

/** 解析相对路径为绝对路径。cwd 默认为 '/'。 */
function resolve(p = '', cwd = '/') {
    if (!p) return normalize(cwd || '/');
    const abs = p.startsWith(SEP);
    return abs ? normalize(p) : normalize(join(cwd || '/', p));
}

/** 切分目录/文件名："/a/b/c.txt" → { dir: "/a/b", base: "c.txt" }
 *  目录为根时 dir="/"，根本身 dir="/", base="/"
 *  无目录（相对文件名 "a.txt"）时 dir="." */
function split(p = '') {
    const n = normalize(p);
    if (n === '/') return { dir: '/', base: '/' };
    if (n === '.') return { dir: '.', base: '.' };
    if (n === '..') return { dir: '.', base: '..' };
    const i = n.lastIndexOf(SEP);
    if (i === -1) return { dir: '.', base: n };
    if (i === 0) return { dir: '/', base: n.slice(1) };
    return { dir: n.slice(0, i), base: n.slice(i + 1) };
}

function dirname(p) { return split(p).dir; }
function basename(p) { return split(p).base; }

/** 移除末尾扩展名（只取最后一个 '.'）："a.b.txt" → "a.b"，".hidden" → ".hidden" */
function stripExt(p) {
    const { dir, base } = split(p);
    if (!base.includes('.') || base.startsWith('.') && base.indexOf('.') === base.lastIndexOf('.')) {
        return join(dir, base);
    }
    const i = base.lastIndexOf('.');
    return join(dir, base.slice(0, i));
}

/** 取扩展名（不含 '.'），无扩展名返回空串 */
function extname(p) {
    const { base } = split(p);
    if (!base.includes('.')) return '';
    if (base.startsWith('.') && base.indexOf('.') === base.lastIndexOf('.')) return '';
    return base.slice(base.lastIndexOf('.') + 1);
}

/** 判断相对路径还是绝对路径 */
function isAbsolute(p) { return typeof p === 'string' && p.startsWith(SEP); }

/** VFS 中常见的 "当前路径下的名字 → 完整绝对路径" 辅助
 *  name 已以 '/' 开头时原样归一化返回；否则 join(cwd,name)。*/
function resolveUnder(name = '', cwd = '/') {
    if (!name) return resolve(cwd);
    if (isAbsolute(name)) return normalize(name);
    return resolve(name, cwd);
}

const Path = { SEP, normalize, join, resolve, split, dirname, basename, stripExt, extname, isAbsolute, resolveUnder };

// 兼容两种加载：WebOS 全局命名空间 / ESM import
if (typeof window !== 'undefined') {
    window.WebOS = window.WebOS || {};
    window.WebOS.Path = Path;
}
export default Path;
export { SEP, normalize, join, resolve, split, dirname, basename, stripExt, extname, isAbsolute, resolveUnder };
