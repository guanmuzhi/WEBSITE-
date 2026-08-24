import Terminal from './terminal.js?v=20';
import BootManager from './boot-manager.js?v=20';
import StorageService from './storage.js?v=20';
import UserManager from './user-manager.js?v=20';
document.addEventListener('DOMContentLoaded', () => {
    window.StorageService = StorageService;
    window.UserManager = UserManager;
    window._isSavingDisabled = false;
    const bootManager = new BootManager(Terminal);
    window._bootManager = bootManager;
    bootManager.init();
});