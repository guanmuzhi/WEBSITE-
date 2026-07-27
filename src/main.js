import Terminal from './terminal.js?v=14';
import BootManager from './boot-manager.js?v=14';
import StorageService from './storage.js?v=14';
import UserManager from './user-manager.js?v=14';

document.addEventListener('DOMContentLoaded', () => {
    window.StorageService = StorageService;
    window.UserManager = UserManager;
    window._isSavingDisabled = false;
    
    fetch('/VERSION')
        .then(response => response.text())
        .then(version => {
            window.WEBOS_VERSION = version.trim();
        })
        .catch(() => {
            window.WEBOS_VERSION = '1.0.0';
        })
        .finally(() => {
            const bootManager = new BootManager(Terminal);
            window._bootManager = bootManager;
            bootManager.init();
        });
});