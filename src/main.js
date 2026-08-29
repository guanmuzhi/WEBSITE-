// 入口：加载公共库（Path / Dom / Obj / FSEdit 均会挂到 window.WebOS 命名空间），
// 然后初始化 boot。所有 import 加版本号参数，保证修改后不会被浏览器缓存到旧文件。
import './lib/index.js?v=21';
import Terminal from './terminal.js?v=21';
import BootManager from './boot-manager.js?v=21';
import StorageService from './storage.js?v=21';
import UserManager from './user-manager.js?v=21';
document.addEventListener('DOMContentLoaded', () => {
    window.StorageService = StorageService;
    window.UserManager = UserManager;
    window._isSavingDisabled = false;
    const bootManager = new BootManager(Terminal);
    window._bootManager = bootManager;
    bootManager.init();
});
