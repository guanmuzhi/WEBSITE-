// src/terminal/selector.js
// [] 条件选择器的解析与匹配。
//
// 语法（附加在 file / folder 关键字之后）：
//   file[]                     所有文件
//   file[size=0..10]           大小 0~10KB
//   file[size=..100]           ≤100KB
//   file[size=1024..]          ≥1MB
//   file[size=10]              正好 10KB
//   folder[time=3600..5]       3600 秒前 ~ 5 秒前修改过
//   file[time=3600]            正好 3600 秒前修改
//   file[name=第三*.docx]       通配符（* 与 ?）
//   file[name=0..15]           文件名总长度 0~15（含扩展名）
//   file[name=15]              文件名总长度正好 15
//   file[size=0..10,name=*.txt] 多条件（逗号分隔，AND）

const KEYS = ['size', 'time', 'name'];
const RANGE_RE = /^(\d+(?:\.\d+)?)?\.\.(\d+(?:\.\d+)?)?$/;
const EXACT_RE = /^\d+(?:\.\d+)?$/;

/** 解析范围值：'a..b' / '..b' / 'a..' / 'a'。非法返回 null。 */
export function parseRange(val) {
    const m = RANGE_RE.exec(String(val));
    if (!m) return null;
    const lo = m[1] != null ? parseFloat(m[1]) : 0;
    const hi = m[2] != null ? parseFloat(m[2]) : Infinity;
    return { lo, hi };
}

/**
 * 解析选择器体（方括号内的内容）。
 * @returns {{ok:true, params:Array}|{ok:false, error:string}}
 */
export function parseSelector(body) {
    const params = [];
    const raw = String(body == null ? '' : body).trim();
    if (!raw) return { ok: true, params };
    for (const part of raw.split(',')) {
        const seg = part.trim();
        if (!seg) continue;
        const eq = seg.indexOf('=');
        if (eq === -1) return { ok: false, error: 'sel_bad_param', detail: seg };
        const key = seg.slice(0, eq).trim().toLowerCase();
        const val = seg.slice(eq + 1).trim();
        if (!KEYS.includes(key)) return { ok: false, error: 'sel_unknown_key', detail: key };
        if (!val) return { ok: false, error: 'sel_bad_range', detail: val, key };
        if (key === 'name') {
            params.push({ key: 'name', raw: val });
            continue;
        }
        if (EXACT_RE.test(val)) {
            params.push({ key, exact: parseFloat(val) });
            continue;
        }
        const range = parseRange(val);
        if (!range) return { ok: false, error: 'sel_bad_range', detail: val, key };
        params.push({ key, range });
    }
    return { ok: true, params };
}

/** 文件名匹配：长度范围 / 精确长度 / 通配符 / 精确名称。 */
export function matchName(name, raw) {
    const n = String(name);
    const v = String(raw);
    // 长度范围：0..15 / ..15 / 15..（两侧都可省）
    if (/^\d*(?:\.\d+)?\.\.\d*(?:\.\d+)?$/.test(v)) {
        const r = parseRange(v);
        return n.length >= r.lo && n.length <= r.hi;
    }
    // 纯数字 → 按“总长度精确匹配”处理（与 size/time 的精确值语义一致）
    if (/^\d+$/.test(v)) return n.length === parseInt(v, 10);
    // 通配符：* 任意多段，? 单字符
    if (v.includes('*') || v.includes('?')) {
        const re = new RegExp('^' + v.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
        return re.test(n);
    }
    return n === v;
}

/**
 * 判断节点是否满足全部参数（AND）。
 * @param {object} node  VFS 节点
 * @param {Array}  params parseSelector 的产物
 * @param {object} ctx   { now, sizeOf(node)->bytes }
 */
export function matchParams(node, params, ctx) {
    if (!params || params.length === 0) return true;
    const now = ctx.now;
    for (const p of params) {
        if (p.key === 'size') {
            const kb = ctx.sizeOf(node) / 1024;
            if (p.exact != null) {
                if (Math.abs(kb - p.exact) > 1e-6) return false;
            } else if (!(kb >= p.range.lo - 1e-6 && kb <= p.range.hi + 1e-6)) {
                return false;
            }
        } else if (p.key === 'time') {
            const age = (now - (node.mtime || 0)) / 1000;
            if (p.exact != null) {
                if (Math.round(age) !== p.exact) return false;
            } else if (!(age >= p.range.lo - 1e-6 && age <= p.range.hi + 1e-6)) {
                return false;
            }
        } else if (p.key === 'name') {
            if (!matchName(node.name, p.raw)) return false;
        }
    }
    return true;
}
