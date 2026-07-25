import Terminal from './terminal.js';
import BootManager from './boot-manager.js';
import StorageService from './storage.js';
import UserManager from './user-manager.js';

document.addEventListener('DOMContentLoaded', () => {
    window.StorageService = StorageService;
    window.UserManager = UserManager;
    window._isSavingDisabled = false;
    
    const bootManager = new BootManager(Terminal);
    window._bootManager = bootManager;
    bootManager.init();
});