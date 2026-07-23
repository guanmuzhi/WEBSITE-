import Terminal from './terminal.js?v=12';
import BootManager from './boot-manager.js?v=12';

document.addEventListener('DOMContentLoaded', () => {
    const bootManager = new BootManager(Terminal);
    window._bootManager = bootManager;
    bootManager.init();
});