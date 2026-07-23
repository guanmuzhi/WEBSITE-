const STORAGE_KEY = 'web-terminal-os-data';

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac'];

class MediaPlayer {
    constructor() {
        this.player = document.getElementById('media-player');
        this.filenameEl = document.getElementById('filename');
        this.mediaInfoEl = document.getElementById('media-info');
        this.placeholder = document.getElementById('placeholder');
        this.mediaContainer = document.getElementById('media-container');
        this.audioMode = document.getElementById('audio-mode');
        this.audioTitle = document.getElementById('audio-title');
        this.audioArtist = document.getElementById('audio-artist');
        this.audioWaveform = document.getElementById('audio-waveform');
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
        this.statusDuration = document.getElementById('status-duration');
        this.statusCodec = document.getElementById('status-codec');
        this.statusType = document.getElementById('status-type');

        this.currentPath = '';
        this.currentType = 'video';
        this.isPlaying = false;
        this.volume = 0.8;
        this.currentSpeed = 1;

        this.initEvents();
        this.checkUrlParam();
        this.updateVolumeDisplay();
    }

    initEvents() {
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
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    getMediaType(extension) {
        if (VIDEO_EXTENSIONS.includes(extension)) return 'video';
        if (AUDIO_EXTENSIONS.includes(extension)) return 'audio';
        return null;
    }

    getMimeType(extension) {
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

    buildDataUrl(content, extension) {
        if (content.startsWith('data:')) {
            return content;
        }
        const mimeType = this.getMimeType(extension);
        return `data:${mimeType};base64,${content}`;
    }

    openFileByPath(path) {
        const root = this.loadFS();
        const node = this.getNodeByPath(root, path);

        if (!node || node.type !== 'file') {
            alert(`文件 "${path}" 不存在`);
            return;
        }

        const extension = this.getExtension(node.name);
        const mediaType = this.getMediaType(extension);

        if (!mediaType) {
            alert(`不支持的文件格式: ${extension}`);
            return;
        }

        this.currentPath = path;
        this.currentType = mediaType;
        
        const dataUrl = this.buildDataUrl(node.content || '', extension);
        this.player.src = dataUrl;
        
        this.filenameEl.textContent = node.name;
        this.mediaInfoEl.textContent = `${mediaType === 'video' ? '视频' : '音频'} · ${extension.toUpperCase()}`;
        
        if (mediaType === 'audio') {
            this.mediaContainer.style.display = 'none';
            this.audioMode.style.display = 'flex';
            this.audioTitle.textContent = node.name.replace(/\.[^/.]+$/, '');
            this.audioArtist.textContent = '本地文件';
        } else {
            this.mediaContainer.style.display = 'flex';
            this.audioMode.style.display = 'none';
        }
        
        this.placeholder.classList.add('hidden');
        document.title = `${node.name} - 影音播放器`;
        
        this.player.load();
        this.player.play().catch(() => {});
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
            this.statusDuration.textContent = `时长: ${duration}`;
            this.statusType.textContent = `类型: ${this.currentType === 'video' ? '视频' : '音频'}`;
        }
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
            this.fullscreenBtn.textContent = '⛶';
        } else {
            document.exitFullscreen().catch(() => {});
            this.fullscreenBtn.textContent = '⛶';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.player = new MediaPlayer();
});
