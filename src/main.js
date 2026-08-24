import Terminal from './terminal.js?v=19';
import BootManager from './boot-manager.js?v=19';
import StorageService from './storage.js?v=19';
import UserManager from './user-manager.js?v=19';
document.addEventListener('DOMContentLoaded', () => {
    window.StorageService = StorageService;
    window.UserManager = UserManager;
    window._isSavingDisabled = false;
