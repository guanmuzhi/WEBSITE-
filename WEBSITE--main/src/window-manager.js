class WindowManager {
    constructor(container) {
        this.container = container;
        this.windows = [];
        this.zIndexCounter = 100;
        this.windowIdCounter = 0;
        this.activeWorkspace = 0;
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
        winEl.classList.add('window-opening');
        const containerRect = this.container.getBoundingClientRect();
        // 以整个视口为中心（扣除程序坞/任务栏占用区域），确保新窗口落在屏幕中央
        let x = options.x !== undefined ? options.x : (window.innerWidth - width) / 2 - containerRect.left;
        let y = options.y !== undefined ? options.y : (containerRect.height - height) / 2;
        x = Math.max(0, Math.min(x, containerRect.width - 60));
        y = Math.max(0, Math.min(y, containerRect.height - 60));
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
        minimizeBtn.type = 'button';
        minimizeBtn.title = '最小化';
        minimizeBtn.setAttribute('aria-label', '最小化');
        const closeBtn = document.createElement('button');
        closeBtn.className = 'window-btn btn-close';
        closeBtn.type = 'button';
        closeBtn.title = '关闭';
        closeBtn.setAttribute('aria-label', '关闭');
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
            // 工作区（虚拟桌面）归属：窗口创建时记录到当前激活工作区
            workspaceId: options.workspaceId != null ? options.workspaceId : this.activeWorkspace,
            setTitle(newTitle) {
                this.title = newTitle;
                titleEl.textContent = newTitle;
                titleEl.style.display = newTitle ? '' : 'none';
            },
            focus: () => {
                this.focusWindow(id);
            },
            minimize: () => {
                if (winObj.isMinimized) {
                    winObj.restore();
                } else {
                    winObj.isMinimized = true;
                    winEl.style.display = 'none';
                }
            },
            restore: () => {
                winObj.isMinimized = false;
                winEl.style.display = 'flex';
                winEl.classList.remove('window-opening');
                void winEl.offsetWidth;
                winEl.classList.add('window-opening');
                this.focusWindow(id);
                // 恢复后重新计算可见性：若窗口不属于当前工作区，仍应隐藏
                this._applyVisibility(winObj);
            },
            close: () => {
                this.closeWindow(id);
            }
        };
        this.windows.push(winObj);

        /* ── 拖拽 / 缩放 ────────────────────────────────────────────────
           历史 bug（标题栏按钮“点了没反应”的真正原因）：
           原来是 mousedown + 挂在 document 上的 mousemove/mouseup。
           一旦拖拽途中指针划过窗口里的 iframe，mouseup 就在 iframe 自己的
           document 里派发，永远不会冒泡回父页面 → onMouseUp 从不执行 →
           isDragging 永久卡在 true → 之后窗口一直黏着鼠标跑，
           于是任何按钮都点不中（按钮跟着窗口一起跑）。
           现在统一用 Pointer Events + setPointerCapture 把后续指针事件锁到
           本元素，并在拖拽期间屏蔽窗口内容的 pointer-events，双保险；
           再补 pointercancel / window blur 兜底，确保状态一定能复位。 */
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let dragPointerId = null;

        const pointOf = (e) => {
            if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        };
        const clampPos = (nx, ny) => {
            const containerRect = this.container.getBoundingClientRect();
            return [
                Math.max(-winEl.offsetWidth + 50, Math.min(nx, containerRect.width - 50)),
                Math.max(-winEl.offsetHeight + 50, Math.min(ny, containerRect.height - 50))
            ];
        };

        const onDragMove = (e) => {
            if (!isDragging) return;
            const containerRect = this.container.getBoundingClientRect();
            const pt = pointOf(e);
            const [nx, ny] = clampPos(pt.x - containerRect.left - dragOffsetX, pt.y - containerRect.top - dragOffsetY);
            winEl.style.left = nx + 'px';
            winEl.style.top = ny + 'px';
            if (e.cancelable) e.preventDefault();
        };

        const fireMoveEnd = () => {
            if (winObj.onMoveEnd && typeof winObj.onMoveEnd === 'function') {
                try { winObj.onMoveEnd(winObj); } catch (_) {}
            }
        };

        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            winEl.classList.remove('window-dragging');
            window.removeEventListener('pointermove', onDragMove, true);
            window.removeEventListener('pointerup', endDrag, true);
            window.removeEventListener('pointercancel', endDrag, true);
            window.removeEventListener('mousemove', onDragMove, true);
            window.removeEventListener('mouseup', endDrag, true);
            window.removeEventListener('blur', endDrag);
            if (dragPointerId !== null) {
                try { winEl.releasePointerCapture(dragPointerId); } catch (_) {}
                dragPointerId = null;
            }
            fireMoveEnd();
        };

        const startDrag = (e) => {
            if (e.target.closest && e.target.closest('.window-controls')) return;
            if (e.button !== undefined && e.button !== 0) return;
            const pt = pointOf(e);
            const rect = winEl.getBoundingClientRect();
            const containerRect = this.container.getBoundingClientRect();
            isDragging = true;
            dragOffsetX = pt.x - rect.left;
            dragOffsetY = pt.y - rect.top;
            this.focusWindow(id);
            // 拖拽期间屏蔽内容区，杜绝 iframe 吃掉指针事件
            winEl.classList.add('window-dragging');
            if (e.pointerId !== undefined && winEl.setPointerCapture) {
                try { winEl.setPointerCapture(e.pointerId); dragPointerId = e.pointerId; } catch (_) {}
            }
            if (e.pointerId !== undefined) {
                window.addEventListener('pointermove', onDragMove, true);
                window.addEventListener('pointerup', endDrag, true);
                window.addEventListener('pointercancel', endDrag, true);
            } else {
                window.addEventListener('mousemove', onDragMove, true);
                window.addEventListener('mouseup', endDrag, true);
            }
            window.addEventListener('blur', endDrag);
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
        };

        if (window.PointerEvent) {
            titlebar.addEventListener('pointerdown', startDrag);
        } else {
            titlebar.addEventListener('mousedown', startDrag);
            titlebar.addEventListener('touchstart', startDrag, { passive: false });
        }
        winEl.addEventListener('mousedown', () => {
            this.focusWindow(id);
        });
        winEl.addEventListener('touchstart', () => {
            this.focusWindow(id);
        }, { passive: true });
        /* 标题栏按钮：用 pointerdown 立即响应，并在捕获前掐断冒泡。
           之前只挂 click，而标题栏的 mousedown 拖拽逻辑 + 桌面平移逻辑
           会先跑一遍（拖拽虽已用 closest('.window-controls') 放行，但
           桌面 pan / winEl mousedown 的 focusWindow 仍会插一脚），
           在真机上 14px 的纯色圆点又极小，体感就是“点了没反应”。 */
        const bindWindowButton = (btn, action) => {
            let fired = false;
            const run = (e) => {
                if (fired) return;
                fired = true;
                setTimeout(() => { fired = false; }, 400);
                if (e) {
                    // 阻止标题栏拖拽 / 桌面平移 / 窗口聚焦在这一次交互里介入
                    e.preventDefault();
                    e.stopPropagation();
                }
                action();
            };
            const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
            btn.addEventListener('mousedown', swallow);
            btn.addEventListener('touchstart', swallow, { passive: false });
            btn.addEventListener('pointerdown', run);
            btn.addEventListener('click', swallow);
        };
        bindWindowButton(minimizeBtn, () => winObj.minimize());
        bindWindowButton(closeBtn, () => winObj.close());
        let isResizing = false;
        let resizeStartX = 0;
        let resizeStartY = 0;
        let resizeStartWidth = 0;
        let resizeStartHeight = 0;
        let resizePointerId = null;
        const onResizeMove = (e) => {
            if (!isResizing) return;
            const pt = pointOf(e);
            const newWidth = Math.max(300, resizeStartWidth + pt.x - resizeStartX);
            const newHeight = Math.max(200, resizeStartHeight + pt.y - resizeStartY);
            const containerRect = this.container.getBoundingClientRect();
            const maxWidth = containerRect.width - (parseInt(winEl.style.left) || 0);
            const maxHeight = containerRect.height - (parseInt(winEl.style.top) || 0);
            winEl.style.width = Math.min(newWidth, maxWidth) + 'px';
            winEl.style.height = Math.min(newHeight, maxHeight) + 'px';
            if (e.cancelable) e.preventDefault();
        };
        const endResize = () => {
            if (!isResizing) return;
            isResizing = false;
            winEl.classList.remove('window-resizing');
            window.removeEventListener('pointermove', onResizeMove, true);
            window.removeEventListener('pointerup', endResize, true);
            window.removeEventListener('pointercancel', endResize, true);
            window.removeEventListener('mousemove', onResizeMove, true);
            window.removeEventListener('mouseup', endResize, true);
            window.removeEventListener('blur', endResize);
            if (resizePointerId !== null) {
                try { resizeHandle.releasePointerCapture(resizePointerId); } catch (_) {}
                resizePointerId = null;
            }
            fireMoveEnd();
        };
        const startResize = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            const pt = pointOf(e);
            isResizing = true;
            resizeStartX = pt.x;
            resizeStartY = pt.y;
            resizeStartWidth = winEl.offsetWidth;
            resizeStartHeight = winEl.offsetHeight;
            this.focusWindow(id);
            winEl.classList.add('window-resizing');
            if (e.pointerId !== undefined && resizeHandle.setPointerCapture) {
                try { resizeHandle.setPointerCapture(e.pointerId); resizePointerId = e.pointerId; } catch (_) {}
            }
            if (e.pointerId !== undefined) {
                window.addEventListener('pointermove', onResizeMove, true);
                window.addEventListener('pointerup', endResize, true);
                window.addEventListener('pointercancel', endResize, true);
            } else {
                window.addEventListener('mousemove', onResizeMove, true);
                window.addEventListener('mouseup', endResize, true);
            }
            window.addEventListener('blur', endResize);
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
        };
        if (window.PointerEvent) {
            resizeHandle.addEventListener('pointerdown', startResize);
        } else {
            resizeHandle.addEventListener('mousedown', startResize);
            resizeHandle.addEventListener('touchstart', startResize, { passive: false });
        }
        return winObj;
    }
    getWindow(id) {
        return this.windows.find(w => w.id === id) || null;
    }
    /* 多桌面 / 工作区：根据「是否最小化」+「是否属于当前工作区」决定窗口显隐。
       要点：最小化 (isMinimized) 优先于工作区归属——最小化窗口无论如何都隐藏；
       非最小化但不在当前工作区的窗口同样隐藏，从而实现「切走即隐藏、切回即恢复」。 */
    _applyVisibility(win) {
        if (!win || !win.element) return;
        const visible = !win.isMinimized && win.workspaceId === this.activeWorkspace;
        win.element.style.display = visible ? 'flex' : 'none';
    }
    setActiveWorkspace(id) {
        this.activeWorkspace = id;
        this.windows.forEach(w => this._applyVisibility(w));
    }
    getAllWindows() {
        return [...this.windows];
    }
    focusWindow(id) {
        const win = this.getWindow(id);
        if (!win) return;
        this.windows.forEach(w => w.element.classList.remove('window-focused'));
        win.element.classList.add('window-focused');
        win.element.style.zIndex = this.zIndexCounter++;
        /* 关键修复：通知 desktop 焦点变化，刷新任务栏高亮。
           之前 focusWindow 被以下场景直接调用（不经过 win.focus 的包装器）：
           - 窗口任意区域的 mousedown / touchstart (createWindow 内部监听)
           - 标题栏拖拽开始、缩放手柄开始
           - 新建窗口时自动聚焦
           这些路径都没有调用 updateTaskbar()，导致“最高层窗口”判断错误、任务栏高亮不更新。
           通过派发带 bubbles 的自定义事件，desktop 可在容器或 document 层统一监听。 */
        try {
            const detail = { id: win.id, bubbles: true };
            const evt = new CustomEvent('wm-window-focus-changed', { bubbles: true, detail });
            if (this.container && typeof this.container.dispatchEvent === 'function') {
                this.container.dispatchEvent(evt);
            } else {
                document.dispatchEvent(evt);
            }
        } catch (e) { /* 环境不支持 CustomEvent 时静默 */ }
    }
    closeWindow(id) {
        const index = this.windows.findIndex(w => w.id === id);
        if (index === -1) return;
        const win = this.windows[index];
        win.element.classList.add('window-closing');
        setTimeout(() => { win.element.remove(); }, 200);
        this.windows.splice(index, 1);
        if (win.onClose && typeof win.onClose === 'function') {
            win.onClose();
        }
    }
}
export default WindowManager;