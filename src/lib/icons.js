// src/lib/icons.js
// SVG 图标统一服务：所有 SVG 文件放 /apps/icons/<name>.svg
// 通过相对路径 fetch 读取内容并内存缓存，杜绝 inline SVG 重复代码 & emoji。
//
// 用法：
//   import Icons from './src/lib/icons.js';
//   const html = Icons.getHTML('folder', 16, '#3498db');  // 返回 SVG innerHTML（<svg>...</svg>）
//   const url  = Icons.getURL('close', 14, '#e74c3c');    // 返回带尺寸/颜色参数的 URL，适合 <img src>
//
// 注意：为兼容 iframe 内外，必须调用 init(baseUrl) 传入"图标目录的绝对/可解析根路径"。
// 默认使用 '/apps/icons'（相对于 origin），如宿主在子路径部署可通过 Icons.setBase('/prefix/apps/icons') 覆盖。

const DEFAULT_BASE = '/apps/icons';
const _cache = new Map();            // name -> Promise<string> | string   (raw svg text)
const _htmlCache = new Map();        // cacheKey -> string                (尺寸/颜色后处理过的 HTML)

let _base = DEFAULT_BASE;
let _documentEl = null;

const RE_WIDTH = /\swidth="([^"]+)"/;
const RE_HEIGHT = /\sheight="([^"]+)"/;
const RE_VIEWBOX = /\sviewBox="([^"]+)"/;
const RE_STROKE = /\sstroke="(currentColor|[^"]+)"/g;
const RE_FILL = /\sfill="(currentColor|[^"]+)"/g;
const RE_SVG_OPENTAG = /<svg([^>]*)>/;
const RE_XMLNS = /\sxmlns="[^"]+"/;

function _has(str, re) { return re.test(str); }

function _ensureXmlns(openingAttrs) {
    if (RE_XMLNS.test(openingAttrs)) return openingAttrs;
    return ' xmlns="http://www.w3.org/2000/svg"' + openingAttrs;
}

/**
 * 后处理：把原始 SVG 字符串按给定 size / color 重写 width/height/stroke/fill/currentColor。
 * 保持 viewBox，不破坏 inner path。
 */
function _processSvg(raw, size, color) {
    if (!raw) return '';
    let svg = raw.trim();
    const m = RE_SVG_OPENTAG.exec(svg);
    if (!m) return svg;
    let attrs = m[1];
    // viewBox 缺省时从 24 推断（apps/icons 默认 24x24），或从原始 w/h 推断
    let vb = '';
    const vbMatch = RE_VIEWBOX.exec(attrs);
    if (vbMatch) vb = vbMatch[1];
    if (!vb) {
        const wm = RE_WIDTH.exec(attrs); const hm = RE_HEIGHT.exec(attrs);
        const wd = wm ? parseFloat(wm[1]) : 24; const hd = hm ? parseFloat(hm[1]) : 24;
        vb = `0 0 ${wd} ${hd}`;
    }
    // 清掉旧 w/h
    attrs = attrs.replace(RE_WIDTH, '').replace(RE_HEIGHT, '').replace(RE_VIEWBOX, '');
    const sizeStr = (typeof size === 'number' || size !== undefined && size !== null) ? String(size) : '16';
    attrs += ` width="${sizeStr}" height="${sizeStr}" viewBox="${vb}"`;
    // 颜色处理
    if (color && color !== '') {
        // 1) 先把所有 currentColor 占位符、显式 stroke/fill 颜色值替换为目标 color
        const needStroke = _has(svg, RE_STROKE) || svg.indexOf('stroke=') === -1 && svg.indexOf('fill=') !== -1 ? false : _has(svg, RE_STROKE);
        const hasStroke = _has(svg, RE_STROKE);
        const hasFill = _has(svg, RE_FILL);
        if (hasStroke) {
            attrs = attrs.replace(RE_STROKE, ' stroke="' + color + '"');
            // inner tags 里的 stroke 也要替换（<path stroke="..."> 等）
            const restAfterOpen = svg.slice(m[0].length);
            const newRest = restAfterOpen.replace(/\sstroke="(currentColor|[^"]+)"/g, ' stroke="' + color + '"');
            svg = svg.slice(0, m[0].length) + newRest;
        }
        if (hasFill) {
            attrs = attrs.replace(RE_FILL, ' fill="' + color + '"');
            const restAfterOpen2 = svg.slice(m[0].length);
            const newRest2 = restAfterOpen2.replace(/\sfill="(currentColor|[^"]+)"/g, ' fill="' + color + '"');
            svg = svg.slice(0, m[0].length) + newRest2;
        }
        // 如果两个都没有，就按“线框优先”原则默认加 stroke
        if (!hasStroke && !hasFill) {
            attrs += ` stroke="${color}" fill="none"`;
        }
    } else {
        // 无 color：把 currentColor 留着（由上层 CSS color 决定），但仍补充必要默认 stroke/fill="none"
        if (!_has(attrs, /\sstroke=/) && !_has(attrs, /\sfill=/)) {
            attrs += ' stroke="currentColor" fill="none"';
        }
    }
    attrs = _ensureXmlns(attrs);
    const newOpenTag = '<svg' + attrs + '>';
    const rest = svg.slice(m[0].length);
    // 去掉可能重复的 </svg> 闭合
    return newOpenTag + rest.replace(/<\/svg>\s*$/, '') + '</svg>';
}

const Icons = {
    get base() { return _base; },
    setBase(b) { _base = (b || '').replace(/\/+$/, '') || DEFAULT_BASE; },

    /**
     * 预加载一批图标，避免首次渲染时出现短暂空白。返回全部加载的 Promise。
     * names 可省：省略时预加载所有【最常用】图标类型
     */
    async preload(names) {
        const list = names || [
            'folder','file','home','back','close','minus','save','undo','redo','copy','move',
            'delete','edit','search','upload','download','refresh','new-folder','new-file','open',
            'plus','play','pause','volume','volume-off','zoom-in','zoom-out','rotate','user-avatar',
            'arrow-left','arrow-right',
            // file subtypes
            'type-image','type-video','type-audio','type-zip','type-code','type-sheet',
            'type-doc','type-shell','type-config','type-logo','type-db','type-app',
            'new-folder-action','up','alert','info','check','menu','rename','trash','spinner'
        ];
        await Promise.all(list.map(n => this._loadRaw(n)));
        return true;
    },

    async _loadRaw(name) {
        if (!name) return '';
        const cached = _cache.get(name);
        if (cached !== undefined) {
            return (typeof cached === 'string') ? cached : await cached;
        }
        const safeName = String(name).replace(/[^a-zA-Z0-9_-]/g, '');
        const url = `${_base}/${safeName}.svg`;
        const p = (async () => {
            try {
                const res = await fetch(url, { cache: 'force-cache' });
                if (!res.ok) {
                    // 404：尝试 type-* 不带前缀回退，否则返回占位 svg
                    if (safeName.startsWith('type-')) {
                        const alt = safeName.slice(5);
                        const r2 = await fetch(`${_base}/${alt}.svg`, { cache: 'force-cache' });
                        if (r2.ok) { const t = await r2.text(); _cache.set(name, t); return t; }
                    }
                    return '';
                }
                const txt = await res.text();
                _cache.set(name, txt);
                return txt;
            } catch (e) {
                return '';
            }
        })();
        _cache.set(name, p);
        return await p;
    },

    /** 同步版本：若未预加载则返回占位（透明 1x1 SVG），下次重绘再调用异步版本即可。 */
    getHTML(name, size, color) {
        const cacheKey = `${name}|${size ?? 16}|${color || ''}`;
        const hit = _htmlCache.get(cacheKey);
        if (hit) return hit;
        const raw = _cache.get(name);
        if (typeof raw === 'string' && raw.length) {
            const out = _processSvg(raw, size, color);
            if (out) { _htmlCache.set(cacheKey, out); return out; }
        }
        // 占位（不影响布局 & 无 emoji）
        const s = typeof size === 'number' ? size : (size !== undefined && size !== null ? Number(size) || 16 : 16);
        const c = color || 'transparent';
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5"></svg>`;
    },

    /** 异步版本：保证能拿到真实 SVG（或 fallback 占位）。适合一次性渲染场景。 */
    async getHTMLAsync(name, size, color) {
        const cacheKey = `${name}|${size ?? 16}|${color || ''}`;
        const hit = _htmlCache.get(cacheKey);
        if (hit) return hit;
        const raw = await this._loadRaw(name);
        if (!raw) return this.getHTML(name, size, color);
        const out = _processSvg(raw, size, color);
        _htmlCache.set(cacheKey, out);
        return out;
    },

    /**
     * 生成一个可给 <img src=...> 直接使用的 URL（带参数）。
     * 因为颜色和尺寸需要服务端处理，这里我们改用 data URI：
     *   - 如果 svg 已缓存，直接输出 data:image/svg+xml;utf8,...
     *   - 否则退化为 ${base}/name.svg，让浏览器自己取（尺寸/颜色在 <img> CSS 控制）
     */
    async getDataURL(name, size, color) {
        const html = await this.getHTMLAsync(name, size, color);
        if (!html) return `${_base}/${name}.svg`;
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(html);
    },

    /** 同步版：拿不到时退化为文件路径。 */
    getURL(name, size, color) {
        const html = this.getHTML(name, size, color);
        if (_cache.get(name) && typeof _cache.get(name) === 'string') {
            return 'data:image/svg+xml;utf8,' + encodeURIComponent(html);
        }
        return `${_base}/${name}.svg`;
    },

    /** 文件类型映射：根据扩展名返回图标名。返回的都是 apps/icons/type-*.svg 或基础 file/folder。 */
    iconNameForFile(filename) {
        if (!filename) return 'file';
        const name = String(filename);
        const lower = name.toLowerCase();
        if (/\/$/.test(name)) return 'folder';
        const ext = (lower.lastIndexOf('.') > 0 ? lower.slice(lower.lastIndexOf('.') + 1) : '');
        const map = {
            folder: 'folder',
            png: 'type-image', jpg: 'type-image', jpeg: 'type-image', gif: 'type-image', webp: 'type-image',
            svg: 'type-image', bmp: 'type-image', ico: 'type-image', avif: 'type-image', heic: 'type-image',
            mp4: 'type-video', mov: 'type-video', webm: 'type-video', mkv: 'type-video', avi: 'type-video',
            flv: 'type-video', m4v: 'type-video',
            mp3: 'type-audio', wav: 'type-audio', ogg: 'type-audio', flac: 'type-audio', m4a: 'type-audio',
            aac: 'type-audio', opus: 'type-audio',
            zip: 'type-zip', rar: 'type-zip', '7z': 'type-zip', tar: 'type-zip', gz: 'type-zip',
            bz2: 'type-zip', xz: 'type-zip',
            js: 'type-code', ts: 'type-code', mjs: 'type-code', cjs: 'type-code', jsx: 'type-code',
            tsx: 'type-code', py: 'type-code', java: 'type-code', c: 'type-code', h: 'type-code',
            cpp: 'type-code', cc: 'type-code', hpp: 'type-code', cs: 'type-code', go: 'type-code',
            rs: 'type-code', rb: 'type-code', php: 'type-code', swift: 'type-code', kt: 'type-code',
            lua: 'type-code', sh: 'type-shell', bash: 'type-shell', zsh: 'type-shell', bat: 'type-shell',
            cmd: 'type-shell',
            html: 'type-code', css: 'type-code', scss: 'type-code', sass: 'type-code', less: 'type-code',
            vue: 'type-code', svelte: 'type-code', json: 'type-config', yaml: 'type-config',
            yml: 'type-config', toml: 'type-config', ini: 'type-config', conf: 'type-config',
            cfg: 'type-config', env: 'type-config', xml: 'type-config', plist: 'type-config',
            md: 'type-doc', markdown: 'type-doc', txt: 'type-doc', rtf: 'type-doc',
            doc: 'type-doc', docx: 'type-doc', odt: 'type-doc', pages: 'type-doc',
            pdf: 'type-doc',
            xls: 'type-sheet', xlsx: 'type-sheet', csv: 'type-sheet', ods: 'type-sheet', numbers: 'type-sheet',
            ppt: 'type-doc', pptx: 'type-doc', key: 'type-doc',
            app: 'type-app', exe: 'type-app', dmg: 'type-app', apk: 'type-app', deb: 'type-app',
            rpm: 'type-app', msi: 'type-app',
            db: 'type-db', sqlite: 'type-db', sqlite3: 'type-db', sql: 'type-db',
        };
        if (map[ext]) return map[ext];
        if (lower.endsWith('.app')) return 'type-app';
        return 'file';
    },

    // 测试用
    _clearCache() { _cache.clear(); _htmlCache.clear(); },
    _processSvg,
};

// 挂到 window.WebOS 命名空间，方便 iframe 内通过 window.parent.WebOS.Lib.Icons 复用
if (typeof window !== 'undefined') {
    window.WebOS = window.WebOS || {};
    window.WebOS.Lib = window.WebOS.Lib || {};
    window.WebOS.Lib.Icons = Icons;
}

export default Icons;
