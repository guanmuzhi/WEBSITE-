import WindowManager from './window-manager.js?v=10';
import DesktopManager from './desktop.js?v=10';
import UserManager from './user-manager.js?v=3';
import LockScreen from './lock-screen.js?v=4';

class BootManager {
    constructor(terminalClass) {
        this.terminalClass = terminalClass;
        this.terminal = null;
        this.bootScreen = null;
        this.desktop = null;
        this.countdownTimer = null;
        this.keyHandler = null;
        this.bootCompleted = false;
        this.stayedInTerminal = false;
        this.userManager = new UserManager();
        this.lockScreen = null;
        this.desktopManager = null;
    }

    init() {
        window._bootManager = this;
        this.bootScreen = document.getElementById('boot-screen');
        this.desktop = document.getElementById('desktop');

        const bootTerminalContainer = this.bootScreen.querySelector('.terminal');
        this.terminal = new this.terminalClass({ container: bootTerminalContainer, skipWelcome: true });

        this.printBootMessage();

        this.keyHandler = (e) => {
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                e.stopPropagation();
                this.stayInTerminal();
            }
        };
        document.addEventListener('keydown', this.keyHandler, true);

        this.countdownTimer = setTimeout(() => {
            this.enterGUI();
        }, 1000);
    }

    printBootMessage() {
        this.terminal.print('WebOS 启动中...');
        this.terminal.print('');
        this.terminal.print('进入图形界面，输入s停止');
        this.terminal.print('');
    }

    enterGUI() {
        if (this.bootCompleted || this.stayedInTerminal) return;

        this.bootCompleted = true;
        this.cleanup();

        this.bootScreen.classList.add('fade-out');

        setTimeout(() => {
            this.bootScreen.style.display = 'none';
            this.desktop.style.display = 'block';
            this.desktop.classList.add('fade-in');
            requestAnimationFrame(() => {
                this.desktop.classList.add('visible');
            });
            this.initDesktop();
            this._checkLockOnBoot();
        }, 300);
    }

    _checkLockOnBoot() {
        const currentUser = this.userManager.getCurrentUser();
        if (currentUser && currentUser.password) {
            this.lockScreen = new LockScreen({
                onUnlock: () => {
                    if (this.desktopManager) {
                        this.desktopManager.updateTaskbarUser();
                    }
                }
            });
            this.lockScreen.show();
        }
    }

    stayInTerminal() {
        if (this.bootCompleted || this.stayedInTerminal) return;

        this.stayedInTerminal = true;
        this.cleanup();

        this.terminal.print('');
        this.terminal.print('已停留在终端模式', 'success');
        this.terminal.print('');
        this.terminal.input.focus();
    }

    cleanup() {
        if (this.countdownTimer) {
            clearTimeout(this.countdownTimer);
            this.countdownTimer = null;
        }
        if (this.keyHandler) {
            document.removeEventListener('keydown', this.keyHandler, true);
            this.keyHandler = null;
        }
    }

    initDesktop() {
        const windowsContainer = this.desktop.querySelector('.windows-container');
        const windowManager = new WindowManager(windowsContainer);

        this.desktopManager = new DesktopManager({
            desktopEl: this.desktop,
            terminalClass: this.terminalClass,
            windowManager: windowManager
        });

        this.desktopManager.init();
    }
}

export default BootManager;
