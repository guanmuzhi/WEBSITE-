class WindowManager {
    constructor(container) {
        this.container = container;
        this.windows = [];
        this.zIndexCounter = 100;
        this.windowIdCounter = 0;
    }

    createWindow(options = {}) {
        const id = 'win-' + (++this.windowIdCounter);
        const width = options.width || 600;
        const height = options.height || 400;
        const title = options.title || 'Untitled';
        const icon = options.icon || '';
        const content = options.content || document.createElement('div');
        const onMoveEnd = options.onMoveEnd || null;

        const winEl = document.createElement('div');
        winEl.className = 'window';
        winEl.style.width = width + 'px';
        winEl.style.height = height + 'px';
        winEl.style.zIndex = this.zIndexCounter++;

        const containerRect = this.container.getBoundingClientRect();
        let x = options.x !== undefined ? options.x : (containerRect.width - width) / 2;
        let y = options.y !== undefined ? options.y : (containerRect.height - height) / 2;

        x = Math.max(0, Math.min(x, containerRect.width - 100));
        y = Math.max(0, Math.min(y, containerRect.height - 100));

        winEl.style.left = x + 'px';
        winEl.style.top = y + 'px';

        const titlebar = document.createElement('div');
        titlebar.className = 'window-titlebar';

        const titleEl = document.createElement('span');
        titleEl.className = 'window-title';
        titleEl.textContent = title;
        if (!title) {
            titleEl.style.display = 'none';
        }

        const controls = document.createElement('div');
        controls.className = 'window-controls';

        const minimizeBtn = document.createElement('button');
        minimizeBtn.className = 'window-btn btn-minimize';
        minimizeBtn.title = '最小化';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'window-btn btn-close';
        closeBtn.title = '关闭';

        controls.appendChild(minimizeBtn);
        controls.appendChild(closeBtn);

        titlebar.appendChild(titleEl);
        titlebar.appendChild(controls);

        const contentEl = document.createElement('div');
        contentEl.className = 'window-content';
        if (content) {
            contentEl.appendChild(content);
        }

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'window-resize-handle';
        resizeHandle.title = '调整大小';

        winEl.appendChild(titlebar);
        winEl.appendChild(contentEl);
        winEl.appendChild(resizeHandle);

        this.container.appendChild(winEl);

        const winObj = {
            id: id,
            element: winEl,
            title: title,
            icon: icon,
            isMinimized: false,
            isMaximized: false,
            _prevState: null,
            onMoveEnd: onMoveEnd,
            windowType: options.windowType || 'default',

            setTitle(newTitle) {
                this.title = newTitle;
                titleEl.textContent = newTitle;
                titleEl.style.display = newTitle ? '' : 'none';
            },

            focus: () => {
                this.focusWindow(id);
            },

            minimize: () => {
                if (this.isMinimized) {
                    this.restore();
                } else {
                    winObj.isMinimized = true;
                    winEl.style.display = 'none';
                }
            },

            restore: () => {
                winObj.isMinimized = false;
                winEl.style.display = 'flex';
                this.focusWindow(id);
            },

            close: () => {
                this.closeWindow(id);
            }
        };

        this.windows.push(winObj);

        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        const onMouseDown = (e) => {
            if (e.target.closest('.window-controls')) return;
            
            isDragging = true;
            const rect = winEl.getBoundingClientRect();
            const containerRect = this.container.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            this.focusWindow(id);

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;

            const containerRect = this.container.getBoundingClientRect();
            let newX = e.clientX - containerRect.left - dragOffsetX;
            let newY = e.clientY - containerRect.top - dragOffsetY;

            const maxX = containerRect.width - 50;
            const maxY = containerRect.height - 50;
            newX = Math.max(-winEl.offsetWidth + 50, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));

            winEl.style.left = newX + 'px';
            winEl.style.top = newY + 'px';
        };

        const onMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (winObj.onMoveEnd && typeof winObj.onMoveEnd === 'function') {
                winObj.onMoveEnd(winObj);
            }
        };

        titlebar.addEventListener('mousedown', onMouseDown);

        const onTouchStart = (e) => {
            if (e.target.closest('.window-controls')) return;
            
            e.preventDefault();
            isDragging = true;
            const touch = e.touches[0];
            const rect = winEl.getBoundingClientRect();
            const containerRect = this.container.getBoundingClientRect();
            dragOffsetX = touch.clientX - rect.left;
            dragOffsetY = touch.clientY - rect.top;
            this.focusWindow(id);

            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
        };

        const onTouchMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();

            const touch = e.touches[0];
            const containerRect = this.container.getBoundingClientRect();
            let newX = touch.clientX - containerRect.left - dragOffsetX;
            let newY = touch.clientY - containerRect.top - dragOffsetY;

            const maxX = containerRect.width - 50;
            const maxY = containerRect.height - 50;
            newX = Math.max(-winEl.offsetWidth + 50, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));

            winEl.style.left = newX + 'px';
            winEl.style.top = newY + 'px';
        };

        const onTouchEnd = () => {
            isDragging = false;
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
            if (winObj.onMoveEnd && typeof winObj.onMoveEnd === 'function') {
                winObj.onMoveEnd(winObj);
            }
        };

        titlebar.addEventListener('touchstart', onTouchStart, { passive: false });

        winEl.addEventListener('mousedown', () => {
            this.focusWindow(id);
        });

        winEl.addEventListener('touchstart', () => {
            this.focusWindow(id);
        }, { passive: true });

        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            winObj.minimize();
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            winObj.close();
        });

        let isResizing = false;
        let resizeStartX = 0;
        let resizeStartY = 0;
        let resizeStartWidth = 0;
        let resizeStartHeight = 0;

        const onResizeMouseDown = (e) => {
            console.log('resize mousedown', e.clientX, e.clientY);
            e.stopPropagation();
            e.preventDefault();
            isResizing = true;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            resizeStartWidth = winEl.offsetWidth;
            resizeStartHeight = winEl.offsetHeight;
            this.focusWindow(id);

            document.addEventListener('mousemove', onResizeMouseMove);
            document.addEventListener('mouseup', onResizeMouseUp);
        };

        const onResizeMouseMove = (e) => {
            if (!isResizing) return;
            console.log('resize mousemove', isResizing, e.clientX, e.clientY);
            e.preventDefault();

            const newWidth = Math.max(300, resizeStartWidth + e.clientX - resizeStartX);
            const newHeight = Math.max(200, resizeStartHeight + e.clientY - resizeStartY);

            const containerRect = this.container.getBoundingClientRect();
            const maxWidth = containerRect.width - parseInt(winEl.style.left);
            const maxHeight = containerRect.height - parseInt(winEl.style.top);

            winEl.style.width = Math.min(newWidth, maxWidth) + 'px';
            winEl.style.height = Math.min(newHeight, maxHeight) + 'px';
        };

        const onResizeMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', onResizeMouseMove);
            document.removeEventListener('mouseup', onResizeMouseUp);
            if (winObj.onMoveEnd && typeof winObj.onMoveEnd === 'function') {
                winObj.onMoveEnd(winObj);
            }
        };

        const onResizeTouchStart = (e) => {
            e.stopPropagation();
            e.preventDefault();
            isResizing = true;
            const touch = e.touches[0];
            resizeStartX = touch.clientX;
            resizeStartY = touch.clientY;
            resizeStartWidth = winEl.offsetWidth;
            resizeStartHeight = winEl.offsetHeight;
            this.focusWindow(id);

            document.addEventListener('touchmove', onResizeTouchMove, { passive: false });
            document.addEventListener('touchend', onResizeTouchEnd);
        };

        const onResizeTouchMove = (e) => {
            if (!isResizing) return;
            e.preventDefault();

            const touch = e.touches[0];
            const newWidth = Math.max(300, resizeStartWidth + touch.clientX - resizeStartX);
            const newHeight = Math.max(200, resizeStartHeight + touch.clientY - resizeStartY);

            const containerRect = this.container.getBoundingClientRect();
            const maxWidth = containerRect.width - parseInt(winEl.style.left);
            const maxHeight = containerRect.height - parseInt(winEl.style.top);

            winEl.style.width = Math.min(newWidth, maxWidth) + 'px';
            winEl.style.height = Math.min(newHeight, maxHeight) + 'px';
        };

        const onResizeTouchEnd = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('touchmove', onResizeTouchMove);
            document.removeEventListener('touchend', onResizeTouchEnd);
            if (winObj.onMoveEnd && typeof winObj.onMoveEnd === 'function') {
                winObj.onMoveEnd(winObj);
            }
        };

        resizeHandle.addEventListener('mousedown', onResizeMouseDown);
        resizeHandle.addEventListener('touchstart', onResizeTouchStart, { passive: false });

        return winObj;
    }

    getWindow(id) {
        return this.windows.find(w => w.id === id) || null;
    }

    getAllWindows() {
        return [...this.windows];
    }

    focusWindow(id) {
        const win = this.getWindow(id);
        if (!win) return;
        win.element.style.zIndex = this.zIndexCounter++;
    }

    closeWindow(id) {
        const index = this.windows.findIndex(w => w.id === id);
        if (index === -1) return;

        const win = this.windows[index];
        win.element.remove();
        this.windows.splice(index, 1);

        if (win.onClose && typeof win.onClose === 'function') {
            win.onClose();
        }
    }
}

export default WindowManager;
