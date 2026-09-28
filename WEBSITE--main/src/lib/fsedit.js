// src/lib/fsedit.js
// 纯字符串级别的"文本文件行操作"工具：
//   - 支持单行替换、范围替换、正则 sed 风格、在 N 行前/后插入、删除行
//   - 保留 undo 历史（apply 返回 {undo()}）
//
// 注意：本模块不关心 Storage / FileSystem 如何落盘，只操作文本内容。
// terminal.js 的 edit 命令会负责定位文件节点、调用 apply、保存、输出 undo 令牌。

function readLines(text) {
    if (text == null) return [];
    // 兼容 \n / \r\n / \r 三种换行；保留原始换行符序列用于重组
    const raw = String(text);
    const arr = [];
    let buf = [];
    let i = 0;
    while (i < raw.length) {
        const ch = raw[i];
        if (ch === '\r') {
            if (raw[i + 1] === '\n') {
                arr.push({ content: buf.join(''), sep: '\r\n' });
                buf = []; i += 2; continue;
            } else {
                arr.push({ content: buf.join(''), sep: '\r' });
                buf = []; i += 1; continue;
            }
        } else if (ch === '\n') {
            arr.push({ content: buf.join(''), sep: '\n' });
            buf = []; i += 1; continue;
        } else {
            buf.push(ch); i++;
        }
    }
    arr.push({ content: buf.join(''), sep: '' });
    return arr;
}
function writeLines(lines) {
    return lines.map(l => l.content + l.sep).join('');
}
function getSep(text) {
    const m = /\r\n|\n|\r/.exec(String(text || ''));
    return m ? m[0] : '\n';
}

/** 行号范围：用户输入从 1 开始。内部索引从 0。
 * 越界处理：行号 <1 → 截断到 1；超过总行数 → 截断到最后一行。
 * 返回 0-based 的 startIdx/endIdx（end 含）*/
function clampRange(lineA, lineB, total) {
    let a = Math.max(1, Math.floor(Number(lineA) || 0));
    let b = (lineB == null || lineB === '') ? a : Math.max(a, Math.floor(Number(lineB) || 0));
    if (total === 0) return { startIdx: 0, endIdx: -1, clamped: true };
    if (a > total) a = total;
    if (b > total) b = total;
    return { startIdx: a - 1, endIdx: b - 1, clamped: a !== Number(lineA) || b !== Number(lineB) || (lineB != null && b !== Number(lineB)) };
}

/**
 * 通用 patch 方法：
 * ops 类型：
 *   { type:'line',   line:N,            text:'...' }                把第 N 行整行替换为 text（text 内部可换行，表示插入多行）
 *   { type:'regex',  pattern:'s/a/b/gi', scope:[start,end] }        sed 风格正则（scope 可选，指定行范围）
 *   { type:'range',  start, end,       block:'...' }                删除 start..end 行并替换为 block（block 可为多行，空串即删除）
 *   { type:'insert', before|after,     block:'...' }                在某行前/后插入多行
 *   { type:'delete', start, end }                                    删除行范围
 *   { type:'append', block:'...' }                                   文件末尾追加（会在最后一行内容后先加换行）
 *
 * 返回 { success, nextContent, diff:[{label, from, to}], undo():string }
 *   nextContent 是处理完的全文
 *   diff 列出每项操作的结果摘要（用于终端打印）
 *   undo() 应用反向操作，返回原始文本
 */
function apply(text, ops) {
    const opList = Array.isArray(ops) ? ops : [ops];
    let current = String(text || '');
    const original = current;
    const diff = [];
    for (const raw of opList) {
        const r = applyOne(current, raw);
        if (!r) {
            return { success: false, error: '无法识别的操作类型：' + JSON.stringify(raw), undo: () => original };
        }
        if (!r.success) return { success: false, error: r.error, undo: () => original };
        current = r.nextContent;
        diff.push(r.diff);
    }
    return {
        success: true,
        nextContent: current,
        diff,
        undo: () => original,
    };
}

function applyOne(text, op) {
    switch (op.type) {
        case 'line': {
            const lines = readLines(text);
            const { startIdx, clamped } = clampRange(op.line, null, lines.length);
            if (lines.length === 0 || startIdx >= lines.length) {
                // 文件为空 或 行号越界：自动按 append 方式补空行。这样 "edit f 99 hello" 不会报错而是把内容放到第 99 行（中间自动填充空行）。
                const sep = getSep(text);
                while (lines.length <= startIdx) {
                    lines.push({ content: '', sep });
                }
            }
            const target = lines[startIdx];
            const sep = target ? target.sep : getSep(text);
            const incoming = readLines(String(op.text == null ? '' : op.text));
            // 把替换段末尾的换行与被替换行的换行保持一致（否则会多 / 少一空行）
            if (incoming.length > 0) {
                const last = incoming[incoming.length - 1];
                last.sep = sep;
            }
            const before = lines.slice(0, startIdx);
            const after = lines.slice(startIdx + 1);
            const merged = before.concat(incoming).concat(after);
            const diff = { label: `line #${startIdx + 1}`, from: target ? target.content : '<EOF>', to: writeLines(incoming).replace(/(\r\n|\r|\n)$/, '') };
            return { success: true, nextContent: writeLines(merged), diff };
        }
        case 'range': {
            const lines = readLines(text);
            const { startIdx, endIdx } = clampRange(op.start, op.end, lines.length);
            if (startIdx > endIdx || lines.length === 0) {
                return { success: false, error: `范围无效：${op.start},${op.end}` };
            }
            const sep = getSep(text);
            const before = lines.slice(0, startIdx);
            const after = lines.slice(endIdx + 1);
            const block = String(op.block == null ? '' : op.block);
            const incoming = readLines(block);
            // 末尾段与删除尾段的分隔符一致：取删除最后一行的 sep，若无则取 EOL 默认
            const tailSep = (lines[endIdx] && lines[endIdx].sep) || sep;
            if (incoming.length > 0) {
                const last = incoming[incoming.length - 1];
                if (after.length === 0) {
                    last.sep = tailSep; // 替换范围是末尾：保留文件尾部原来的换行
                } else {
                    last.sep = sep;
                }
            } else if (after.length === 0) {
                // 完全删除且是文件尾：保留最后一行结尾的换行形态
                if (before.length > 0) before[before.length - 1].sep = tailSep;
            }
            const removedCount = endIdx - startIdx + 1;
            const diff = {
                label: `range #${startIdx + 1}-${endIdx + 1}`,
                from: `删除 ${removedCount} 行`,
                to: incoming.length ? `替换为 ${incoming.length} 行` : '删除为 0 行',
            };
            return { success: true, nextContent: writeLines(before.concat(incoming).concat(after)), diff };
        }
        case 'delete': {
            return applyOne(text, { type: 'range', start: op.start, end: op.end, block: '' });
        }
        case 'insert': {
            const lines = readLines(text);
            const total = lines.length;
            const { startIdx, clamped } = clampRange(op.before || op.after, null, total);
            // 插入位置：before=N → 放在第 N 行之前（startIdx 处）；after=N → 放在第 N 行之后（startIdx+1 处）
            const pos = (op.before != null) ? startIdx : Math.min(startIdx + 1, total);
            const sep = getSep(text);
            const block = String(op.block == null ? '' : op.block);
            let incoming = readLines(block);
            if (incoming.length === 0) incoming = [{ content: '', sep: '' }];
            // 给新块最后一行加上正确 sep：若插到文件末尾保留为 sep；否则用常规 sep
            if (incoming.length > 0) {
                const last = incoming[incoming.length - 1];
                if (pos < total) last.sep = sep; // 原行在后面，用文件常用换行
            }
            const before = lines.slice(0, pos);
            const after = lines.slice(pos);
            // 修正前项换行：若 before 的最后一项是空结尾（例如新文件），给它 sep
            if (before.length > 0 && before[before.length - 1].sep === '' && incoming.length > 0) {
                before[before.length - 1].sep = sep;
            }
            const merged = before.concat(incoming).concat(after);
            const which = op.before != null ? `before #${startIdx + 1}` : `after #${startIdx + 1}`;
            const diff = { label: 'insert ' + which, from: '(原该行或 EOF)', to: `插入 ${incoming.length} 行` };
            return { success: true, nextContent: writeLines(merged), diff };
        }
        case 'append': {
            const lines = readLines(text);
            const sep = getSep(text);
            let block = String(op.block == null ? '' : op.block);
            if (block === '') return { success: true, nextContent: text, diff: { label: 'append', from: '', to: '<no-op>' } };
            // 如果文件非空且最后一行不是以换行结尾 → 在 block 前先补一个换行
            if (lines.length > 0) {
                const last = lines[lines.length - 1];
                if (last.sep === '' && last.content !== '') {
                    lines[lines.length - 1].sep = sep;
                } else if (last.content === '' && last.sep === '' && lines.length === 1) {
                    // 文件为空：不补多余换行
                }
            }
            const incoming = readLines(block);
            // 插入行继承文件常用换行（最后一行保持为空 sep 以不强行额外换行，除非用户 block 本身就有）
            const merged = lines.concat(incoming);
            const diff = { label: 'append', from: `原 ${Math.max(lines.length - (lines.length && lines[lines.length - 1].content === '' && lines[lines.length - 1].sep === '' ? 1 : 0), 0)} 行`, to: `追加 ${incoming.length} 行` };
            return { success: true, nextContent: writeLines(merged), diff };
        }
        case 'regex': {
            // 支持 sed 风格 "s/pattern/replacement/flags" 或 "s|pat|repl|flags"（分隔符支持 /|#!）
            const raw = String(op.pattern || '');
            const sepChar = raw[1];
            if (!raw.startsWith('s') || !'/|#!'.includes(sepChar)) {
                return { success: false, error: 'regex 模式应为 s/pattern/replacement/flags（分隔符 / | # !）' };
            }
            const parts = raw.slice(2).split(sepChar);
            if (parts.length < 3) return { success: false, error: 'regex 语法不完整' };
            const flags = parts.pop() || '';
            const replacement = parts.pop();
            const pattern = parts.join(sepChar); // 允许模式里出现分隔符时被误切，但一般够用
            let regex;
            try { regex = new RegExp(pattern, flags); }
            catch (e) { return { success: false, error: '正则语法错误：' + e.message }; }
            // scope 支持 [start, end]（行号 1-based）
            let scopeStart = 0, scopeEnd = null;
            if (op.scope && Array.isArray(op.scope) && op.scope.length >= 1) {
                scopeStart = Math.max(0, (Number(op.scope[0]) || 1) - 1);
                if (op.scope[1] != null) scopeEnd = Number(op.scope[1]) - 1;
            }
            const lines = readLines(text);
            let matches = 0;
            const end = scopeEnd == null ? lines.length - 1 : Math.min(scopeEnd, lines.length - 1);
            for (let i = scopeStart; i <= end; i++) {
                const line = lines[i];
                const original = line.content;
                if (regex.global) {
                    let m, replaced = original, count = 0;
                    const localRe = new RegExp(pattern, flags);
                    while ((m = localRe.exec(replaced)) !== null) {
                        replaced = replaced.replace(localRe, replacement);
                        count++;
                        if (!localRe.global) break;
                    }
                    matches += count;
                    line.content = replaced;
                } else {
                    if (regex.test(original)) {
                        line.content = original.replace(new RegExp(pattern, flags), replacement);
                        matches++;
                    }
                }
            }
            const diff = { label: 'regex ' + raw, from: `扫描 ${end - scopeStart + 1} 行`, to: `命中替换 ${matches} 处` };
            return { success: true, nextContent: writeLines(lines), diff };
        }
    }
    return null;
}

const FSEdit = { readLines, writeLines, getSep, clampRange, apply };
if (typeof window !== 'undefined') {
    window.WebOS = window.WebOS || {};
    window.WebOS.FSEdit = FSEdit;
}
export default FSEdit;
export { readLines, writeLines, getSep, clampRange, apply };
