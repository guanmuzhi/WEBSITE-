class WallpaperApp {
    constructor() {
        this.currentPreview = document.getElementById('current-preview');
        this.currentLabel = document.getElementById('current-label');
        this.colorGrid = document.getElementById('color-grid');
        this.customColor = document.getElementById('custom-color');
        this.applyCustomBtn = document.getElementById('apply-custom');
        this.gradientGrid = document.getElementById('gradient-grid');
        this.imageGrid = document.getElementById('image-grid');
        this.imageUrl = document.getElementById('image-url');
        this.applyImageBtn = document.getElementById('apply-image');
        this.resetBtn = document.getElementById('reset-btn');

        this.currentWallpaper = this.loadCurrentWallpaper();
        
        this.init();
    }

    loadCurrentWallpaper() {
        const saved = localStorage.getItem('webos-wallpaper');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                return { type: 'color', value: '#1a1a2e' };
            }
        }
        return { type: 'color', value: '#1a1a2e' };
    }

    saveWallpaper(type, value) {
        const wallpaper = { type, value };
        localStorage.setItem('webos-wallpaper', JSON.stringify(wallpaper));
        this.currentWallpaper = wallpaper;
        this.updatePreview();
        this.notifyParent(type, value);
    }

    updatePreview() {
        const { type, value } = this.currentWallpaper;
        
        if (type === 'color') {
            this.currentPreview.style.background = value;
            this.currentPreview.style.backgroundImage = 'none';
            this.currentLabel.textContent = `纯色: ${value}`;
        } else if (type === 'gradient') {
            this.currentPreview.style.background = value;
            this.currentPreview.style.backgroundImage = value;
            this.currentLabel.textContent = '渐变壁纸';
        } else if (type === 'image') {
            this.currentPreview.style.background = `url(${value}) center/cover`;
            this.currentPreview.style.backgroundImage = `url(${value})`;
            this.currentPreview.style.backgroundSize = 'cover';
            this.currentPreview.style.backgroundPosition = 'center';
            this.currentLabel.textContent = '图片壁纸';
        }
    }

    notifyParent(type, value) {
        window.parent.document.dispatchEvent(new CustomEvent('wallpaper-changed', {
            detail: { type, value }
        }));
    }

    init() {
        this.updatePreview();

        this.colorGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.color-btn');
            if (btn) {
                const color = btn.dataset.color;
                this.saveWallpaper('color', color);
            }
        });

        this.applyCustomBtn.addEventListener('click', () => {
            const color = this.customColor.value;
            this.saveWallpaper('color', color);
        });

        this.gradientGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.gradient-btn');
            if (btn) {
                const gradient = btn.dataset.gradient;
                this.saveWallpaper('gradient', gradient);
            }
        });

        this.imageGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.image-btn');
            if (btn) {
                const imageUrl = btn.dataset.image;
                this.saveWallpaper('image', imageUrl);
            }
        });

        this.applyImageBtn.addEventListener('click', () => {
            const url = this.imageUrl.value.trim();
            if (url) {
                this.saveWallpaper('image', url);
            }
        });

        this.resetBtn.addEventListener('click', () => {
            this.saveWallpaper('color', '#1a1a2e');
            this.imageUrl.value = '';
            this.customColor.value = '#1a1a2e';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WallpaperApp();
});