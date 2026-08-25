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