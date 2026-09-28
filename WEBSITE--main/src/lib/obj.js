// src/lib/obj.js
// 对象 / 数组 / 深拷贝 小工具
function isPlainObj(v) {
    if (v == null || typeof v !== 'object') return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
}
function deepClone(v) {
    if (v == null || typeof v !== 'object') return v;
    if (v instanceof Date) return new Date(v.getTime());
    if (v instanceof RegExp) return new RegExp(v.source, v.flags);
    if (Array.isArray(v)) return v.map(deepClone);
    if (isPlainObj(v)) {
        const out = {};
        for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
        return out;
    }
    // 复杂对象（class instance）/ Map / Set 等：原样返回，避免丢失方法
    return v;
}
/** 深合并 target 与 sources：
 *  - 两端都是 plain object → 递归合并（target 不改，返回新对象？此实现为返回新对象避免输入污染）
 *  - 数组默认替换；传 {array:'concat'} 可改为拼接 */
function deepMerge(target, ...sources) {
    const opts = sources.length && sources[sources.length - 1] && sources[sources.length - 1].__mergeOpts
        ? sources.pop()
        : { array: 'replace' };
    let out = deepClone(target);
    for (const src of sources) {
        if (src == null) continue;
        out = _mergePair(out, src, opts);
    }
    return out;
}
function _mergePair(a, b, opts) {
    if (isPlainObj(a) && isPlainObj(b)) {
        const out = { ...a };
        for (const k of Object.keys(b)) {
            out[k] = (k in a) ? _mergePair(a[k], b[k], opts) : deepClone(b[k]);
        }
        return out;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return opts.array === 'concat' ? a.concat(deepClone(b)) : deepClone(b);
    }
    return deepClone(b);
}

const Obj = { isPlainObj, deepClone, deepMerge };
if (typeof window !== 'undefined') {
    window.WebOS = window.WebOS || {};
    window.WebOS.Obj = Obj;
}
export default Obj;
export { isPlainObj, deepClone, deepMerge };
