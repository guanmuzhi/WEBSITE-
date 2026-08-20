import Terminal from './terminal.js?v=17';
import BootManager from './boot-manager.js?v=17';
import StorageService from './storage.js?v=17';
import UserManager from './user-manager.js?v=17';
document.addEventListener('DOMContentLoaded', () => {
    window.StorageService = StorageService;
    window.UserManager = UserManager;
    window._isSavingDisabled = false;
    const bootManager = new BootManager(Terminal);
    window._bootManager = bootManager;
    bootManager.init();
});