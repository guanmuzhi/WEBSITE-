// 入口：加载公共库（Path / Dom / Obj / FSEdit 均会挂到 window.WebOS 命名空间），
// 然后初始化 boot。所有 import 加版本号参数，保证修改后不会被浏览器缓存到旧文件。
import './lib/index.js?v=32';
import Terminal from './terminal.js?v=32';
import BootManager from './boot-manager.js?v=32';
import StorageService from './storage.js?v=32';
import UserManager from './user-manager.js?v=32';
import Dialogs from './dialogs.js?v=32'; // 会自动把 Dialogs 类挂到 window.Dialogs，供 iframe 应用调用文件选择器
document.addEventListener('DOMContentLoaded', async () => {
    window.StorageService = StorageService;
    window.UserManager = UserManager;
    window.Dialogs = Dialogs; // 显式再赋值一次，确保 iframe 访问 window.parent.Dialogs 稳定
    window._isSavingDisabled = false;
    // 预加载 SVG 图标缓存：所有模块（Dialogs、lock-screen、filemanager 等）
    // 调用 WebOS.Lib.Icons.getHTML() 时可同步返回，避免异步闪烁。
    try {
        const Icons = (window.WebOS && window.WebOS.Lib && window.WebOS.Lib.Icons);
        if (Icons && typeof Icons.preload === 'function') await Icons.preload();
        if (Dialogs && typeof Dialogs._ensureIcons === 'function') await Dialogs._ensureIcons();
    } catch (e) { console.warn('preload icons failed:', e); }
    const bootManager = new BootManager(Terminal);
    window._bootManager = bootManager;
    bootManager.init();
});
