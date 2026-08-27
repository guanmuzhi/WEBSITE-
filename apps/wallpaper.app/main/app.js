class WallpaperApp {
    constructor() {
        this.strings = {};
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
    t(key, fallback) {
        return this.strings[key] !== undefined ? this.strings[key] : (fallback || key);
    }
    async loadLanguage() {
        const lang = localStorage.getItem('webos-language') || 'cmn';
        const langFiles = { cmn: '/apps/wallpaper.app/main/language/wallpaper_cmn.json', eng: '/apps/wallpaper.app/main/language/wallpaper_eng.json', jpn: '/apps/wallpaper.app/main/language/wallpaper_jpn.json' };
        try {
            const res = await fetch(langFiles[lang] || langFiles.cmn);
            const data = await res.json();
            this.strings = data.strings || {};
        } catch (e) {
            this.strings = {};
        }
        this.applyLanguage();
        try {
            if (window.parent && window.parent !== window) {
                window.parent.document.addEventListener('language-changed', () => { this.loadLanguage().then(() => this.applyLanguage()); });
            }
        } catch (e) {}
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
            this.currentLabel.textContent = this.t('wallpaper.current_solid').replace('{color}', value);
        } else if (type === 'gradient') {
            this.currentPreview.style.background = value;
            this.currentPreview.style.backgroundImage = value;
            this.currentLabel.textContent = this.t('wallpaper.gradient');
        } else if (type === 'image') {
            this.currentPreview.style.background = `url(${value}) center/cover`;
            this.currentPreview.style.backgroundImage = `url(${value})`;
            this.currentPreview.style.backgroundSize = 'cover';
            this.currentPreview.style.backgroundPosition = 'center';
            this.currentLabel.textContent = this.t('wallpaper.image');
        }
    }
    notifyParent(type, value) {
        window.parent.document.dispatchEvent(new CustomEvent('wallpaper-changed', {
            detail: { type, value }
        }));
    }
    applyLanguage() {
        if (this.t('app.title')) document.title = this.t('app.title');
        const titleH2 = document.querySelector('.wallpaper-app h2');
        if (titleH2) titleH2.textContent = this.t('wallpaper.title');
        const currentH3 = document.querySelector('.current-wallpaper h3');
        if (currentH3) currentH3.textContent = this.t('wallpaper.current');
        const solidLabel = document.querySelector('.custom-color label');
        if (solidLabel) solidLabel.textContent = this.t('wallpaper.custom_color_label');
        const imageUrlLabel = document.querySelector('.custom-image label');
        if (imageUrlLabel) imageUrlLabel.textContent = this.t('wallpaper.image_url_label');
        if (this.imageUrl) this.imageUrl.placeholder = this.t('wallpaper.image_url_placeholder');
        if (this.applyCustomBtn) this.applyCustomBtn.title = this.t('wallpaper.apply');
        if (this.applyImageBtn) this.applyImageBtn.title = this.t('wallpaper.apply');
        if (this.resetBtn) this.resetBtn.title = this.t('wallpaper.reset_default');
        const sectionKeys = ['wallpaper.solid_wallpaper', 'wallpaper.gradient', 'wallpaper.image', 'wallpaper.reset'];
        const sectionH3s = document.querySelectorAll('.section h3');
        sectionH3s.forEach((el, i) => { if (el && sectionKeys[i]) el.textContent = this.t(sectionKeys[i]); });
        this.updatePreview();
    }
    init() {
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

        this.loadLanguage();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WallpaperApp();
});