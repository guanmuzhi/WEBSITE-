// src/lib/dom.js
// DOM 操作的通用便捷封装：
//   - el(tag, attrs, children) : 类似 hyperscript 的小工具，取代多处
//     `const x=document.createElement('div'); x.className=...; x.innerHTML=...`
//   - on(el, type, handler, opts) / onReady(fn)
//   - qs / qsa （带类型注解语义）
//   - h(tpl) : 轻量 HTML 转义模板

function el(tag, attrs = null, children = null) {
    const node = document.createElement(tag || 'div');
    if (attrs) {
        for (const key of Object.keys(attrs)) {
            const val = attrs[key];
            if (val == null || val === false) continue;
            if (key === 'class' || key === 'className') {
                const s = typeof val === 'string' ? val : Array.isArray(val) ? val.filter(Boolean).join(' ') : '';
                if (s) node.setAttribute('class', s);
            } else if (key === 'style' && typeof val === 'object') {
                for (const sk of Object.keys(val)) {
                    if (val[sk] != null) node.style.setProperty(sk, val[sk]);
                }
            } else if (key.startsWith('on') && typeof val === 'function') {
                const ev = key.slice(2).toLowerCase();
                node.addEventListener(ev, val);
            } else if (key === 'dataset' && typeof val === 'object') {
                for (const dk of Object.keys(val)) {
                    if (val[dk] != null) node.dataset[dk] = val[dk];
                }
            } else if (key === 'html') {
                node.innerHTML = String(val);
            } else if (key === 'text') {
                node.textContent = String(val);
            } else if (key === 'attrs' && typeof val === 'object') {
                for (const ak of Object.keys(val)) {
                    if (val[ak] != null && val[ak] !== false) node.setAttribute(ak, val[ak]);
                }
            } else if (val === true) {
                node.setAttribute(key, '');
            } else {
                node.setAttribute(key, String(val));
            }
        }
    }
    if (children != null) {
        const list = Array.isArray(children) ? children : [children];
        for (const c of list) {
            if (c == null || c === false) continue;
            if (typeof c === 'string' || typeof c === 'number') {
                node.appendChild(document.createTextNode(String(c)));
            } else if (c instanceof Node) {
                node.appendChild(c);
            }
        }
    }
    return node;
}

function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch (e) { return null; }
}
function qsa(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch (e) { return []; }
}
function on(el, type, handler, opts) {
    if (el && el.addEventListener) el.addEventListener(type, handler, opts);
    return () => { if (el && el.removeEventListener) el.removeEventListener(type, handler, opts); };
}
function onReady(fn) {
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn, { once: true });
    }
}
/** HTML 转义，防止 innerHTML 引入 XSS */
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const Dom = { el, qs, qsa, on, onReady, escapeHtml };
if (typeof window !== 'undefined') {
    window.WebOS = window.WebOS || {};
    window.WebOS.Dom = Dom;
}
export default Dom;
export { el, qs, qsa, on, onReady, escapeHtml };
