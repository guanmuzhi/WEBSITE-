const IMAGE_EXTENSIONS = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'bmp': 'image/bmp', 'webp': 'image/webp', 'svg': 'image/svg+xml' };
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac'];
class MediaViewer {
    constructor() {
        this.strings = {};
        this.placeholder = document.getElementById('placeholder');
        this.placeholderTextEl = document.getElementById('placeholder-text');
        this.placeholderHintEl = document.getElementById('placeholder-hint');
        this.loadingTextEl = document.getElementById('loading-text');
        this.imageViewer = document.getElementById('image-viewer');
        this.mediaPlayer = document.getElementById('media-player');
        this.videoContainer = document.getElementById('video-container');
        this.audioMode = document.getElementById('audio-mode');
        this.image = document.getElementById('image');
        this.imageWrapper = document.getElementById('image-wrapper');
        this.loadingEl = document.getElementById('loading');
        this.player = document.getElementById('video-player');
        this.filenameEl = document.getElementById('filename');
        this.fileInfoEl = document.getElementById('file-info');
        this.zoomInBtn = document.getElementById('zoom-in');
        this.zoomOutBtn = document.getElementById('zoom-out');
        this.zoomLevelEl = document.getElementById('zoom-level');
        this.zoomControls = document.getElementById('zoom-controls');
        this.playBtn = document.getElementById('play-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.progressBar = document.getElementById('progress-bar');
        this.progressFill = document.getElementById('progress-fill');
        this.timeDisplay = document.getElementById('time-display');
        this.volumeBtn = document.getElementById('volume-btn');
        this.volumeSlider = document.getElementById('volume-slider');
        this.volumeFill = document.getElementById('volume-fill');
        this.speedSelector = document.getElementById('speed-selector');
        this.fullscreenBtn = document.getElementById('fullscreen-btn');
        this.openBtn = document.getElementById('open-btn');
        this.audioTitle = document.getElementById('audio-title');
        this.audioArtist = document.getElementById('audio-artist');
        this.audioWaveform = document.getElementById('audio-waveform');
        this.statusSizeEl = document.getElementById('status-size');
        this.statusDimensionsEl = document.getElementById('status-dimensions');
        this.statusFormatEl = document.getElementById('status-format');
        this.statusDurationEl = document.getElementById('status-duration');
        this.currentPath = '';
        this.currentType = '';
        this.currentFileName = '';
        this.currentFileType = '';
        this.currentExt = '';
        this.currentSizeText = '';
        this.currentDimensions = '';
        this.currentDuration = '';
        this.zoomLevel = 100;
        this.minZoom = 25;
        this.maxZoom = 400;
        this.zoomStep = 25;
        this.isPlaying = false;
        this.volume = 0.8;
        this.currentSpeed = 1;
        this.storage = window.parent.StorageService.getInstance();
        this.initEvents();
        this.initLanguage();
    }
    async initLanguage() {
        await this.loadLanguage();
        this.applyLanguage();
        this.checkUrlParam();
        this.updateVolumeDisplay();
    }
    async loadLanguage() {
        const lang = localStorage.getItem('webos-language') || 'cmn';
        const langFiles = { cmn: '/apps/mediaviewer.app/main/language/mediaviewer_cmn.json', eng: '/apps/mediaviewer.app/main/language/mediaviewer_eng.json', jpn: '/apps/mediaviewer.app/main/language/mediaviewer_jpn.json' };
        try {
            const res = await fetch(langFiles[lang] || langFiles.cmn);
            const data = await res.json();
            this.strings = data.strings || {};
        } catch (e) {
            this.strings = {};
        }
        try {
            if (!this._langBound && window.parent && window.parent !== window) {
                this._langBound = true;
                window.parent.document.addEventListener('language-changed', () => {
                    this.loadLanguage().then(() => this.applyLanguage());
                });
            }
        } catch (e) {}
    }
    t(key, fallback) {
        return this.strings[key] !== undefined ? this.strings[key] : (fallback || key);
    }
    getTypeName(type) {
        const map = { image: this.t('mv.image', '图片'), video: this.t('mv.video', '视频'), audio: this.t('mv.audio', '音频') };
        return map[type] || '';
    }
    applyLanguage() {
        this.filenameEl.textContent = this.currentFileName ? this.currentFileName : this.t('mv.no_file', '未打开文件');
        if (this.placeholderTextEl) this.placeholderTextEl.textContent = this.t('mv.placeholder_text', '点击"打开"按钮选择文件');
        if (this.placeholderHintEl) this.placeholderHintEl.textContent = this.t('mv.placeholder_hint', '支持图片、视频、音频格式');
        if (this.loadingTextEl) this.loadingTextEl.textContent = this.t('mv.loading', '加载中...');
        if (this.currentFileType !== 'audio') {
            this.audioTitle.textContent = this.t('mv.unknown', '未知');
            this.audioArtist.textContent = this.t('mv.local_file', '本地文件');
        }
        this.statusSizeEl.textContent = this.t('mv.size', '大小:') + ' ' + (this.currentSizeText || this.t('mv.unknown', '未知'));
        this.statusFormatEl.textContent = this.t('mv.format', '格式:') + ' ' + (this.currentExt ? this.currentExt.toUpperCase() : this.t('mv.unknown', '未知'));
        this.statusDimensionsEl.textContent = this.t('mv.dimensions', '尺寸:') + ' ' + (this.currentDimensions || this.t('mv.unknown', '未知'));
        this.statusDurationEl.textContent = this.t('mv.duration', '时长:') + ' ' + (this.currentDuration || this.t('mv.unknown', '未知'));
        if (this.currentFileName && this.currentFileType) {
            this.fileInfoEl.textContent = this.getTypeName(this.currentFileType) + ' · ' + (this.currentExt || '').toUpperCase();
        } else {
            this.fileInfoEl.textContent = '';
        }
        this.openBtn.title = this.t('mv.open', '打开文件');
        this.zoomInBtn.title = this.t('mv.zoom_in', '放大');
        this.zoomOutBtn.title = this.t('mv.zoom_out', '缩小');
        this.playBtn.title = this.t('mv.play_pause', '播放/暂停');
        this.prevBtn.title = this.t('mv.prev', '上一个');
        this.nextBtn.title = this.t('mv.next', '下一个');
        document.title = this.currentFileName
            ? this.currentFileName + ' - ' + this.t('app.mediaviewer', '媒体查看器')
            : this.t('app.mediaviewer', '媒体查看器');
    }
    initEvents() {
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        this.image.addEventListener('wheel', (e) => this.handleWheel(e));
        let isDragging = false; let startX, startY, imgLeft = 0, imgTop = 0;
        this.imageWrapper.addEventListener('mousedown', (e) => {
            if (this.zoomLevel > 100) { isDragging = true; startX = e.clientX - imgLeft; startY = e.clientY - imgTop; this.imageWrapper.style.cursor = 'grabbing'; e.preventDefault(); }
        });
        document.addEventListener('mousemove', (e) => {
            if (isDragging) { imgLeft = e.clientX - startX; imgTop = e.clientY - startY; this.imageWrapper.style.transform = `scale(${this.zoomLevel / 100}) translate(${imgLeft / (this.zoomLevel / 100)}px, ${imgTop / (this.zoomLevel / 100)}px)`; }
        });
        document.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; this.imageWrapper.style.cursor = this.zoomLevel > 100 ? 'grab' : 'default'; } });
        this.openBtn.addEventListener('click', () => this.showFilePicker());
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.prevBtn.addEventListener('click', () => this.skip(-10));
        this.nextBtn.addEventListener('click', () => this.skip(10));
        this.progressBar.addEventListener('click', (e) => this.seek(e));
        this.volumeBtn.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('click', (e) => this.setVolume(e));
        this.speedSelector.addEventListener('change', (e) => this.setSpeed(e));
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        this.player.addEventListener('timeupdate', () => this.updateProgress());
        this.player.addEventListener('loadedmetadata', () => this.updateMetadata());
        this.player.addEventListener('play', () => this.onPlay());
        this.player.addEventListener('pause', () => this.onPause());
        this.player.addEventListener('ended', () => this.onEnded());
        this.player.addEventListener('volumechange', () => this.updateVolumeDisplay());
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '+') { e.preventDefault(); this.zoomIn(); }
                else if (e.key === '-') { e.preventDefault(); this.zoomOut(); }
                else if (e.key === '0') { e.preventDefault(); this.resetZoom(); }
            }
        });
    }
    checkUrlParam() {
        let path = null;
        try { const params = new URLSearchParams(window.location.search); path = params.get('path'); } catch (e) {}
        if (!path && window.__APP_PARAMS__ && window.__APP_PARAMS__.path) { path = window.__APP_PARAMS__.path; }
        if (path) { this.openFileByPath(path); }
    }
    getExtension(filename) { const parts = filename.split('.'); if (parts.length > 1) { return parts[parts.length - 1].toLowerCase(); } return ''; }
    getFileType(filename) { const ext = this.getExtension(filename); if (ext in IMAGE_EXTENSIONS) return 'image'; if (VIDEO_EXTENSIONS.includes(ext)) return 'video'; if (AUDIO_EXTENSIONS.includes(ext)) return 'audio'; return null; }
    getMimeType(extension) { if (extension in IMAGE_EXTENSIONS) { return IMAGE_EXTENSIONS[extension]; } const mimeMap = { mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac' }; return mimeMap[extension] || ''; }
    buildDataUrl(content, filename) { if (content.startsWith('data:')) { return content; } const ext = this.getExtension(filename); const mimeType = this.getMimeType(ext); return 'data:' + mimeType + ';base64,' + content; }
    formatFileSize(bytes) { if (bytes === 0) return '0 B'; const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]; }
    formatTime(seconds) { if (isNaN(seconds)) return '00:00'; const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0'); }
    showAlert(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            title.textContent = this.t('mv.alert', '提示');
            dialog.appendChild(title);
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            const okBtn = document.createElement('button');
            okBtn.textContent = this.t('mv.ok', '确定');
            okBtn.style.cssText = 'padding:8px 24px;background:var(--accent-color,#3498db);border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            okBtn.addEventListener('mouseenter', () => { okBtn.style.background = 'var(--accent-hover,#2980b9)'; });
            okBtn.addEventListener('mouseleave', () => { okBtn.style.background = 'var(--accent-color,#3498db)'; });
            okBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(); });
            dialog.appendChild(okBtn);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            setTimeout(() => okBtn.focus(), 50);
        });
    }
    // ES modules 在父窗口是 deferred 加载，iframe 普通 script 可能先执行，需要轮询
    async _waitForDialogs(timeoutMs = 3000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const Dlg = (window.parent && window.parent.Dialogs) ? window.parent.Dialogs : null;
                if (Dlg && Dlg.showOpenFileDialog) return Dlg;
            } catch (_) {}
            await new Promise(r => setTimeout(r, 50));
        }
        return null;
    }
    async showFilePicker() {
        const Dlg = await this._waitForDialogs();
        if (!Dlg || !Dlg.showOpenFileDialog) { this.showAlert(this.t('mv.dialog_unavailable', '文件对话框不可用')); return; }
        const startPath = this.currentPath ? (() => { const i = this.currentPath.lastIndexOf('/'); return i <= 0 ? '/' : this.currentPath.slice(0, i); })() : null;
        const exts = [...Object.keys(IMAGE_EXTENSIONS), ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
        const result = await Dlg.showOpenFileDialog({
            title: this.t('mv.select_file', '选择媒体文件'),
            extensions: exts,
            startPath,
        });
        if (!result || !result.path) return;
        this.openFileByPath(result.path);
    }
    collectMediaFiles(node, currentPath) {
        const files = [];
        if (node.children) {
            node.children.forEach(child => {
                const childPath = currentPath === '/' ? '/' + child.name : currentPath + '/' + child.name;
                if (child.type === 'folder') { files.push(...this.collectMediaFiles(child, childPath)); }
                else { const fileType = this.getFileType(child.name); if (fileType) { files.push({ path: childPath, name: child.name, type: fileType }); } }
            });
        }
        return files;
    }
    async openFileByPath(path) {
        const content = this.storage.readFile(path);
        if (content === null) { await this.showAlert(this.t('mv.file_not_found', '文件 "{path}" 不存在').replace('{path}', path)); return; }
        const fileName = path.split('/').pop();
        const fileType = this.getFileType(fileName);
        if (!fileType) { await this.showAlert(this.t('mv.unsupported_format', '不支持的文件格式: {name}').replace('{name}', fileName)); return; }
        const ext = this.getExtension(fileName);
        this.currentPath = path; this.currentType = fileType; this.currentFileName = fileName; this.currentFileType = fileType; this.currentExt = ext;
        this.currentSizeText = this.formatFileSize((content || '').length * 0.75);
        this.currentDimensions = '';
        this.currentDuration = '';
        this.filenameEl.textContent = fileName;
        this.fileInfoEl.textContent = this.getTypeName(fileType) + ' · ' + ext.toUpperCase();
        this.statusSizeEl.textContent = this.t('mv.size', '大小:') + ' ' + this.currentSizeText;
        this.statusFormatEl.textContent = this.t('mv.format', '格式:') + ' ' + ext.toUpperCase();
        this.statusDimensionsEl.textContent = this.t('mv.dimensions', '尺寸:') + ' ' + this.t('mv.unknown', '未知');
        this.statusDurationEl.textContent = this.t('mv.duration', '时长:') + ' ' + this.t('mv.unknown', '未知');
        const fileNode = { name: fileName, content: content };
        if (fileType === 'image') { this.showImageViewer(fileNode); } else { this.showMediaPlayer(fileNode, fileType); }
        document.title = fileName + ' - ' + this.t('app.mediaviewer', '媒体查看器');
    }
    showImageViewer(node) {
        this.placeholder.style.display = 'none'; this.imageViewer.style.display = 'flex'; this.mediaPlayer.style.display = 'none'; this.zoomControls.style.display = 'flex';
        const content = node.content || '';
        if (!content) { this.showAlert(this.t('mv.empty_content', '图片内容为空')); return; }
        const dataUrl = this.buildDataUrl(content, node.name);
        this.loadingEl.style.display = 'flex'; this.resetZoom();
        this.image.onload = () => { this.loadingEl.style.display = 'none'; const dimensions = this.image.naturalWidth + ' × ' + this.image.naturalHeight; this.currentDimensions = dimensions; this.statusDimensionsEl.textContent = this.t('mv.dimensions', '尺寸:') + ' ' + dimensions; };
        this.image.onerror = () => { this.loadingEl.style.display = 'none'; this.showAlert(this.t('mv.load_failed', '图片加载失败')); };
        this.image.src = dataUrl;
    }
    showMediaPlayer(node, mediaType) {
        this.placeholder.style.display = 'none'; this.imageViewer.style.display = 'none'; this.mediaPlayer.style.display = 'flex'; this.zoomControls.style.display = 'none';
        const extension = this.getExtension(node.name);
        const dataUrl = this.buildDataUrl(node.content || '', extension);
        this.player.src = dataUrl;
        if (mediaType === 'audio') { this.videoContainer.style.display = 'none'; this.audioMode.style.display = 'flex'; this.audioTitle.textContent = node.name.replace(/\.[^/.]+$/, ''); this.audioArtist.textContent = this.t('mv.local_file', '本地文件'); }
        else { this.videoContainer.style.display = 'flex'; this.audioMode.style.display = 'none'; }
        this.player.load(); this.player.play().catch(() => {});
    }
    zoomIn() { if (this.zoomLevel < this.maxZoom) { this.zoomLevel += this.zoomStep; this.updateZoom(); } }
    zoomOut() { if (this.zoomLevel > this.minZoom) { this.zoomLevel -= this.zoomStep; this.updateZoom(); } }
    resetZoom() { this.zoomLevel = 100; this.updateZoom(); }
    updateZoom() { this.imageWrapper.style.transform = 'scale(' + (this.zoomLevel / 100) + ')'; this.zoomLevelEl.textContent = this.zoomLevel + '%'; this.imageWrapper.style.cursor = this.zoomLevel > 100 ? 'grab' : 'default'; }
    handleWheel(e) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (e.deltaY < 0) { this.zoomIn(); } else { this.zoomOut(); } } }
    togglePlay() { if (this.player.paused) { this.player.play().catch(() => {}); } else { this.player.pause(); } }
    onPlay() { this.isPlaying = true; this.playBtn.textContent = '⏸'; this.audioWaveform.classList.add('playing'); }
    onPause() { this.isPlaying = false; this.playBtn.textContent = '▶'; this.audioWaveform.classList.remove('playing'); }
    onEnded() { this.isPlaying = false; this.playBtn.textContent = '▶'; this.audioWaveform.classList.remove('playing'); }
    skip(seconds) { this.player.currentTime = Math.max(0, Math.min(this.player.currentTime + seconds, this.player.duration || 0)); }
    seek(e) { const rect = this.progressBar.getBoundingClientRect(); const percent = (e.clientX - rect.left) / rect.width; this.player.currentTime = percent * (this.player.duration || 0); }
    updateProgress() { if (isNaN(this.player.duration)) return; const percent = (this.player.currentTime / this.player.duration) * 100; this.progressFill.style.width = percent + '%'; const current = this.formatTime(this.player.currentTime); const total = this.formatTime(this.player.duration); this.timeDisplay.textContent = current + ' / ' + total; }
    updateMetadata() { if (!isNaN(this.player.duration)) { const duration = this.formatTime(this.player.duration); this.currentDuration = duration; this.statusDurationEl.textContent = this.t('mv.duration', '时长:') + ' ' + duration; } }
    toggleMute() { this.player.muted = !this.player.muted; this.volumeBtn.textContent = this.player.muted ? '🔇' : '🔊'; }
    setVolume(e) { const rect = this.volumeSlider.getBoundingClientRect(); const percent = (e.clientX - rect.left) / rect.width; this.volume = Math.max(0, Math.min(1, percent)); this.player.volume = this.volume; this.player.muted = false; this.updateVolumeDisplay(); }
    updateVolumeDisplay() { const displayVolume = this.player.muted ? 0 : this.player.volume; this.volumeFill.style.width = (displayVolume * 100) + '%'; if (this.player.muted || displayVolume === 0) { this.volumeBtn.textContent = '🔇'; } else if (displayVolume < 0.5) { this.volumeBtn.textContent = '🔉'; } else { this.volumeBtn.textContent = '🔊'; } }
    setSpeed(e) { this.currentSpeed = parseFloat(e.target.value); this.player.playbackRate = this.currentSpeed; }
    toggleFullscreen() { if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(() => {}); } else { document.exitFullscreen().catch(() => {}); } }
}
document.addEventListener('DOMContentLoaded', () => { window.viewer = new MediaViewer(); });