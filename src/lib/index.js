// src/lib/index.js
// 库入口：把四个子库挂到 window.WebOS 命名空间，并导出 ES module 供 import。
import Path from './path.js';
import Dom from './dom.js';
import Obj from './obj.js';
import FSEdit from './fsedit.js';

const Lib = { Path, Dom, Obj, FSEdit, version: '1.0.0' };
if (typeof window !== 'undefined') {
    window.WebOS = window.WebOS || {};
    window.WebOS.Lib = Lib;
}
export default Lib;
export { Path, Dom, Obj, FSEdit };
