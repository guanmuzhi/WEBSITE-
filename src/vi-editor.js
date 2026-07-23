class ViEditor {
    constructor(terminal) {
        this.terminal = terminal;
        this.terminalTitle = terminal.terminalTitle;
        this.terminalBody = terminal.terminalBody;
        this.output = terminal.output;
        this.inputLine = terminal.inputLine;
        this.editorMode = terminal.editorMode;
        this.editorPosition = terminal.editorPosition;
        this.editorStatusBar = terminal.editorStatusBar;
        this.editorCommandLine = terminal.editorCommandLine;
        this.editorCommandPrompt = terminal.editorCommandPrompt;
        this.editorCommandInput = terminal.editorCommandInput;
        
        this.currentFile = null;
        this.mode = 'normal';
        this.commandBuffer = '';
        
        this.editorContent = document.createElement('textarea');
        this.editorContent.className = 'editor-content';
        this.editorContent.spellcheck = false;
        this.editorContent.style.display = 'none';
        
        this.terminalBody.appendChild(this.editorContent);
        
        this.init();
    }

    init() {
        this.editorContent.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.editorCommandInput.addEventListener('keydown', (e) => this.handleCommandKeyDown(e));
    }

    open(filename, content, file) {
        this.currentFile = file;
        this.terminalTitle.textContent = `vi ${filename}`;
        
        this.output.style.display = 'none';
        this.inputLine.style.display = 'none';
        this.editorContent.style.display = 'block';
        this.editorContent.value = content;
        this.editorStatusBar.style.display = 'flex';
        
        this.mode = 'normal';
        this.commandBuffer = '';
        this.updateModeDisplay();
        this.updatePosition();
        
        this.editorContent.focus();
    }

    close() {
        this.editorContent.style.display = 'none';
        this.editorStatusBar.style.display = 'none';
        this.editorCommandLine.style.display = 'none';
        
        this.output.style.display = 'block';
        this.inputLine.style.display = 'flex';
        
        this.terminalTitle.textContent = 'Web Terminal OS';
        this.currentFile = null;
        this.mode = 'normal';
        this.commandBuffer = '';
        
        this.terminal.input.focus();
    }

    save() {
        if (this.currentFile) {
            const result = this.terminal.fs.saveFile(this.currentFile, this.editorContent.value);
            return result;
        }
        return { success: false, message: '没有打开的文件' };
    }

    handleKeyDown(e) {
        if (this.mode === 'normal') {
            this.handleNormalMode(e);
        } else if (this.mode === 'insert') {
            this.handleInsertMode(e);
        }
        
        this.updatePosition();
    }

    handleNormalMode(e) {
        e.preventDefault();
        const textarea = this.editorContent;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const content = textarea.value;
        
        switch (e.key.toLowerCase()) {
            case 'i':
                e.preventDefault();
                this.mode = 'insert';
                this.updateModeDisplay();
                break;
            case 'a':
                e.preventDefault();
                this.mode = 'insert';
                this.updateModeDisplay();
                textarea.setSelectionRange(start + 1, end + 1);
                break;
            case 'o':
                e.preventDefault();
                this.mode = 'insert';
                this.updateModeDisplay();
                const lineEnd = content.indexOf('\n', start);
                const insertPos = lineEnd === -1 ? content.length : lineEnd + 1;
                textarea.value = content.substring(0, insertPos) + '\n' + content.substring(insertPos);
                textarea.setSelectionRange(insertPos + 1, insertPos + 1);
                break;
            case 'x':
                e.preventDefault();
                if (start < content.length) {
                    textarea.value = content.substring(0, start) + content.substring(end + 1);
                    textarea.setSelectionRange(start, start);
                }
                break;
            case 'd':
                e.preventDefault();
                if (this.commandBuffer === 'd') {
                    this.deleteLine();
                    this.commandBuffer = '';
                } else {
                    this.commandBuffer = 'd';
                    setTimeout(() => {
                        this.commandBuffer = '';
                    }, 1000);
                }
                break;
            case 'u':
                break;
            case ':':
                e.preventDefault();
                this.mode = 'command';
                this.updateModeDisplay();
                this.editorCommandLine.style.display = 'flex';
                this.editorCommandInput.value = '';
                this.editorCommandInput.focus();
                break;
            case 'escape':
                e.preventDefault();
                this.commandBuffer = '';
                break;
            default:
                e.preventDefault();
        }
    }

    handleInsertMode(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.mode = 'normal';
            this.commandBuffer = '';
            this.updateModeDisplay();
            const textarea = this.editorContent;
            const pos = textarea.selectionStart;
            if (pos > 0) {
                textarea.setSelectionRange(pos - 1, pos - 1);
            }
        }
    }

    handleCommandKeyDown(e) {
        if (e.key === 'Enter') {
            const cmd = this.editorCommandInput.value;
            this.executeCommand(cmd);
        } else if (e.key === 'Escape') {
            this.mode = 'normal';
            this.updateModeDisplay();
            this.editorCommandLine.style.display = 'none';
            this.editorContent.focus();
        }
    }

    executeCommand(cmd) {
        switch (cmd) {
            case 'w':
                {
                    const result = this.save();
                    this.terminal.print(result.message, result.success ? 'success' : 'error');
                }
                break;
            case 'q':
                this.close();
                break;
            case 'wq':
                {
                    const result = this.save();
                    this.terminal.print(result.message, result.success ? 'success' : 'error');
                    this.close();
                }
                break;
            case 'q!':
                this.close();
                break;
            case 'x':
                {
                    const result = this.save();
                    this.terminal.print(result.message, result.success ? 'success' : 'error');
                    this.close();
                }
                break;
        }
        
        this.mode = 'normal';
        this.updateModeDisplay();
        this.editorCommandLine.style.display = 'none';
        this.editorContent.focus();
    }

    deleteLine() {
        const textarea = this.editorContent;
        const start = textarea.selectionStart;
        const content = textarea.value;
        
        const prevNewline = content.lastIndexOf('\n', start - 1);
        const nextNewline = content.indexOf('\n', start);
        
        let newContent, newPos;
        
        if (prevNewline === -1 && nextNewline === -1) {
            newContent = '';
            newPos = 0;
        } else if (prevNewline === -1) {
            newContent = content.substring(nextNewline + 1);
            newPos = 0;
        } else if (nextNewline === -1) {
            newContent = content.substring(0, prevNewline);
            newPos = prevNewline;
        } else {
            newContent = content.substring(0, prevNewline + 1) + content.substring(nextNewline + 1);
            newPos = prevNewline + 1;
        }
        
        textarea.value = newContent;
        textarea.setSelectionRange(newPos, newPos);
    }

    updateModeDisplay() {
        this.editorMode.className = `editor-mode ${this.mode}`;
        this.editorMode.textContent = this.mode.toUpperCase();
    }

    updatePosition() {
        const textarea = this.editorContent;
        const pos = textarea.selectionStart;
        const content = textarea.value.substring(0, pos);
        
        const lines = content.split('\n');
        const line = lines.length;
        const col = lines[lines.length - 1].length + 1;
        
        this.editorPosition.textContent = `行 ${line}, 列 ${col}`;
    }
}

export default ViEditor;