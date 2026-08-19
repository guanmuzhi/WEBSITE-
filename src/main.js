import Terminal from './terminal.js?v=16';
import BootManager from './boot-manager.js?v=16';
import StorageService from './storage.js?v=16';
import UserManager from './user-manager.js?v=16';
document.addEventListener('DOMContentLoaded', () => {
    window.StorageService = StorageService;
    window.UserManager = UserManager;
    window._isSavingDisabled = false;
    const bootManager = new BootManager(Terminal);
    window._bootManager = bootManager;
    bootManager.init();
});