const STORAGE_KEY = 'web-terminal-os-data';

const IMAGE_EXTENSIONS = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'svg': 'image/svg+xml'
};

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac'];

class MediaViewer {
    constructor() {
        this.placeholder = document.getElementById('placeholder');
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
        this.zoomLevel = 100;
        this.minZoom = 25;
        this.maxZoom = 400;
        this.zoomStep = 25;
        this.isPlaying = false;
        this.volume = 0.8;
        this.currentSpeed = 1;
        
        this.initEvents();
        this.checkUrlParam();
        this.updateVolumeDisplay();
    }
    
    initEvents() {
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        this.image.addEventListener('wheel', (e) => this.handleWheel(e));
        
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
                if (e.key === '+') {
                    e.preventDefault();
                    this.zoomIn();
                } else if (e.key === '-') {
                    e.preventDefault();
                    this.zoomOut();
                } else if (e.key === '0') {
                    e.preventDefault();
                    this.resetZoom();
                }
            }
        });
    }
    
    checkUrlParam() {
        const params = new URLSearchParams(window.location.search);
        const path = params.get('path');
        if (path) {
            this.openFileByPath(path);
        }
    }
    
    loadFS() {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : { type: 'folder', name: '/', children: [] };
    }
    
    getNodeByPath(root, path) {
        if (path === '/') return root;
        const parts = path.split('/').filter(p => p);
        let node = root;
        for (const part of parts) {
            if (node.children) {
                const child = node.children.find(c => c.name === part);
                if (child) {
                    node = child;
                } else {
                    return null;
                }
            } else {
                return null;
            }
        }
        return node;
    }
    
    getExtension(filename) {
        const parts = filename.split('.');
        if (parts.length > 1) {
            return parts[parts.length - 1].toLowerCase();
        }
        return '';
    }
    
    getFileType(filename) {
        const ext = this.getExtension(filename);
        if (ext in IMAGE_EXTENSIONS) return 'image';
        if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
        if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
        return null;
    }
    
    getMimeType(extension) {
        if (extension in IMAGE_EXTENSIONS) {
            return IMAGE_EXTENSIONS[extension];
        }
        const mimeMap = {
            mp4: 'video/mp4',
            webm: 'video/webm',
            ogg: 'video/ogg',
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            flac: 'audio/flac'
        };
        return mimeMap[extension] || '';
    }
    
    buildDataUrl(content, filename) {
        if (content.startsWith('data:')) {
            return content;
        }
        const ext = this.getExtension(filename);
        const mimeType = this.getMimeType(ext);
        return `data:${mimeType};base64,${content}`;
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    showAlert(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
            
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:320px;color:#ddd;font-family:inherit;';
            
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
            title.textContent = '提示';
            dialog.appendChild(title);
            
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:16px;';
            msg.textContent = message;
            dialog.appendChild(msg);
            
            const okBtn = document.createElement('button');
            okBtn.textContent = '确定';
            okBtn.style.cssText = 'padding:8px 24px;background:#3498db;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;';
            okBtn.addEventListener('mouseenter', () => { okBtn.style.background = '#2980b9'; });
            okBtn.addEventListener('mouseleave', () => { okBtn.style.background = '#3498db'; });
            okBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve();
            });
            
            dialog.appendChild(okBtn);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            setTimeout(() => okBtn.focus(), 50);
        });
    }
    
    showFilePicker() {
        const root = this.loadFS();
        const files = this.collectMediaFiles(root, '/');
        
        if (files.length === 0) {
            this.showAlert('未找到支持的媒体文件');
            return;
        }
        
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
        
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#2d2d2d;border:1px solid #3d3d3d;border-radius:8px;padding:24px;width:400px;color:#ddd;font-family:inherit;';
        
        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;font-weight:500;margin-bottom:12px;color:#eee;';
        title.textContent = '选择文件';
        dialog.appendChild(title);
        
        const list = document.createElement('div');
        list.style.cssText = 'max-height:300px;overflow-y:auto;background:#1e1e1e;border-radius:4px;margin-bottom:16px;';
        
        files.forEach(file => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:10px 12px;cursor:pointer;border-bottom:1px solid #333;color:#ccc;font-size:13px;';
            item.textContent = file.path;
            item.addEventListener('mouseenter', () => { item.style.background = '#3d3d3d'; });
            item.addEventListener('mouseleave', () => { item.style.background = ''; });
            item.addEventListener('click', () => {
                document.body.removeChild(overlay);
                this.openFileByPath(file.path);
            });
            list.appendChild(item);
        });
        dialog.appendChild(list);
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = 'padding:8px 24px;background:#3d3d3d;border:none;border-radius:4px;color:#ccc;font-size:13px;cursor:pointer;font-family:inherit;';
        cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#4d4d4d'; });
        cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#3d3d3d'; });
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        
        dialog.appendChild(cancelBtn);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }
    
    collectMediaFiles(node, currentPath) {
        const files = [];
        if (node.children) {
            node.children.forEach(child => {
                const childPath = currentPath === '/' ? `/${child.name}` : `${currentPath}/${child.name}`;
                if (child.type === 'folder') {
                    files.push(...this.collectMediaFiles(child, childPath));
                } else {
                    const fileType = this.getFileType(child.name);
                    if (fileType) {
                        files.push({ path: childPath, name: child.name, type: fileType });
                    }
                }
            });
        }
        return files;
    }
    
    async openFileByPath(path) {
        const root = this.loadFS();
        const node = this.getNodeByPath(root, path);
        
        if (!node || node.type !== 'file') {
            await this.showAlert(`文件 "${path}" 不存在`);
            return;
        }
        
        const fileType = this.getFileType(node.name);
        if (!fileType) {
            await this.showAlert(`不支持的文件格式: ${node.name}`);
            return;
        }
        
        this.currentPath = path;
        this.currentType = fileType;
        this.filenameEl.textContent = node.name;
        
        const ext = this.getExtension(node.name);
        const typeNames = { image: '图片', video: '视频', audio: '音频' };
        this.fileInfoEl.textContent = `${typeNames[fileType]} · ${ext.toUpperCase()}`;
        
        this.statusSizeEl.textContent = `大小: ${this.formatFileSize((node.content || '').length * 0.75)}`;
        this.statusFormatEl.textContent = `格式: ${ext.toUpperCase()}`;
        this.statusDimensionsEl.textContent = '尺寸: 未知';
        this.statusDurationEl.textContent = '时长: 未知';
        
        if (fileType === 'image') {
            this.showImageViewer(node);
        } else {
            this.showMediaPlayer(node, fileType);
        }
        
        document.title = `${node.name} - 媒体查看器`;
    }
    
    showImageViewer(node) {
        this.placeholder.style.display = 'none';
        this.imageViewer.style.display = 'flex';
        this.mediaPlayer.style.display = 'none';
        this.zoomControls.style.display = 'flex';
        
        const content = node.content || '';
        if (!content) {
            this.showAlert('图片内容为空');
            return;
        }
        
        const dataUrl = this.buildDataUrl(content, node.name);
        
        this.loadingEl.style.display = 'flex';
        this.resetZoom();
        
        this.image.onload = () => {
            this.loadingEl.style.display = 'none';
            
            const dimensions = `${this.image.naturalWidth} × ${this.image.naturalHeight}`;
            this.statusDimensionsEl.textContent = `尺寸: ${dimensions}`;
        };
        
        this.image.onerror = () => {
            this.loadingEl.style.display = 'none';
            this.showAlert('图片加载失败');
        };
        
        this.image.src = dataUrl;
    }
    
    showMediaPlayer(node, mediaType) {
        this.placeholder.style.display = 'none';
        this.imageViewer.style.display = 'none';
        this.mediaPlayer.style.display = 'flex';
        this.zoomControls.style.display = 'none';
        
        const extension = this.getExtension(node.name);
        const dataUrl = this.buildDataUrl(node.content || '', extension);
        
        this.player.src = dataUrl;
        
        if (mediaType === 'audio') {
            this.videoContainer.style.display = 'none';
            this.audioMode.style.display = 'flex';
            this.audioTitle.textContent = node.name.replace(/\.[^/.]+$/, '');
            this.audioArtist.textContent = '本地文件';
        } else {
            this.videoContainer.style.display = 'flex';
            this.audioMode.style.display = 'none';
        }
        
        this.player.load();
        this.player.play().catch(() => {});
    }
    
    zoomIn() {
        if (this.zoomLevel < this.maxZoom) {
            this.zoomLevel += this.zoomStep;
            this.updateZoom();
        }
    }
    
    zoomOut() {
        if (this.zoomLevel > this.minZoom) {
            this.zoomLevel -= this.zoomStep;
            this.updateZoom();
        }
    }
    
    resetZoom() {
        this.zoomLevel = 100;
        this.updateZoom();
    }
    
    updateZoom() {
        this.imageWrapper.style.transform = `scale(${this.zoomLevel / 100})`;
        this.zoomLevelEl.textContent = `${this.zoomLevel}%`;
    }
    
    handleWheel(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        }
    }
    
    togglePlay() {
        if (this.player.paused) {
            this.player.play().catch(() => {});
        } else {
            this.player.pause();
        }
    }
    
    onPlay() {
        this.isPlaying = true;
        this.playBtn.textContent = '⏸';
        this.audioWaveform.classList.add('playing');
    }
    
    onPause() {
        this.isPlaying = false;
        this.playBtn.textContent = '▶';
        this.audioWaveform.classList.remove('playing');
    }
    
    onEnded() {
        this.isPlaying = false;
        this.playBtn.textContent = '▶';
        this.audioWaveform.classList.remove('playing');
    }
    
    skip(seconds) {
        this.player.currentTime = Math.max(0, Math.min(this.player.currentTime + seconds, this.player.duration || 0));
    }
    
    seek(e) {
        const rect = this.progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.player.currentTime = percent * (this.player.duration || 0);
    }
    
    updateProgress() {
        if (isNaN(this.player.duration)) return;
        
        const percent = (this.player.currentTime / this.player.duration) * 100;
        this.progressFill.style.width = `${percent}%`;
        
        const current = this.formatTime(this.player.currentTime);
        const total = this.formatTime(this.player.duration);
        this.timeDisplay.textContent = `${current} / ${total}`;
    }
    
    updateMetadata() {
        if (!isNaN(this.player.duration)) {
            const duration = this.formatTime(this.player.duration);
            this.statusDurationEl.textContent = `时长: ${duration}`;
            this.statusType.textContent = `类型: ${this.currentType === 'video' ? '视频' : '音频'}`;
        }
    }
    
    toggleMute() {
        this.player.muted = !this.player.muted;
        this.volumeBtn.textContent = this.player.muted ? '🔇' : '🔊';
    }
    
    setVolume(e) {
        const rect = this.volumeSlider.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.volume = Math.max(0, Math.min(1, percent));
        this.player.volume = this.volume;
        this.player.muted = false;
        this.updateVolumeDisplay();
    }
    
    updateVolumeDisplay() {
        const displayVolume = this.player.muted ? 0 : this.player.volume;
        this.volumeFill.style.width = `${displayVolume * 100}%`;
        
        if (this.player.muted || displayVolume === 0) {
            this.volumeBtn.textContent = '🔇';
        } else if (displayVolume < 0.5) {
            this.volumeBtn.textContent = '🔉';
        } else {
            this.volumeBtn.textContent = '🔊';
        }
    }
    
    setSpeed(e) {
        this.currentSpeed = parseFloat(e.target.value);
        this.player.playbackRate = this.currentSpeed;
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.viewer = new MediaViewer();
});