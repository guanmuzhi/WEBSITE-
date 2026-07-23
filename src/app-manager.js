class AppManager {
    constructor() {
        this.zip = window.JSZip || null;
    }

    async parseAppFile(base64Content) {
        if (!this.zip) {
            return { success: false, error: 'JSZip 库未加载' };
        }

        try {
            const zip = await this.zip.loadAsync(base64Content, { base64: true });

            const requiredFiles = ['main/index.html', 'info.json', 'icon.svg'];
            const missingFiles = requiredFiles.filter(file => !zip.files[file]);

            if (missingFiles.length > 0) {
                return {
                    success: false,
                    error: `缺少必需文件: ${missingFiles.join(', ')}`
                };
            }

            const infoJson = await zip.file('info.json').async('text');
            let info;
            try {
                info = JSON.parse(infoJson);
            } catch (e) {
                return { success: false, error: 'info.json 格式无效' };
            }

            const defaultInfo = {
                name: '未知应用',
                developer: '未知开发者',
                version: '1.0.0',
                width: 600,
                height: 400,
                title: '应用'
            };

            info = { ...defaultInfo, ...info };

            const iconContent = await zip.file('icon.svg').async('text');

            const mainFiles = {};
            Object.keys(zip.files).forEach(filePath => {
                if (filePath.startsWith('main/') && !zip.files[filePath].dir) {
                    const relativePath = filePath.substring('main/'.length);
                    mainFiles[relativePath] = zip.files[filePath];
                }
            });

            return {
                success: true,
                info: info,
                icon: iconContent,
                mainFiles: mainFiles,
                zip: zip
            };
        } catch (e) {
            return { success: false, error: `解析 .app 文件失败: ${e.message}` };
        }
    }

    async createAppUrl(appData) {
        if (!appData.success) {
            return null;
        }

        const contentMap = {};
        for (const [path, file] of Object.entries(appData.mainFiles)) {
            contentMap[path] = await file.async('text');
        }

        const blobParts = [];
        const boundary = '----WebOSAppBoundary';

        for (const [path, content] of Object.entries(contentMap)) {
            blobParts.push(`--${boundary}\r\n`);
            blobParts.push(`Content-Disposition: attachment; filename="${path}"\r\n`);
            blobParts.push(`Content-Type: ${this.getContentType(path)}\r\n\r\n`);
            blobParts.push(content);
            blobParts.push('\r\n');
        }
        blobParts.push(`--${boundary}--\r\n`);

        const blob = new Blob(blobParts, { type: `multipart/mixed; boundary=${boundary}` });
        return URL.createObjectURL(blob);
    }

    async createAppHtml(appData) {
        if (!appData.success) {
            return null;
        }

        const contentMap = {};
        for (const [path, file] of Object.entries(appData.mainFiles)) {
            const content = await file.async('text');
            contentMap[path] = content;
        }

        let html = contentMap['index.html'] || '<html><body><h1>应用加载失败</h1></body></html>';

        html = html.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (match, src) => {
            if (contentMap[src]) {
                return `<script>${contentMap[src]}</script>`;
            }
            return match;
        });

        html = html.replace(/<link[^>]*href="([^"]+)"[^>]*>/g, (match, href) => {
            if (contentMap[href] && href.endsWith('.css')) {
                return `<style>${contentMap[href]}</style>`;
            }
            return match;
        });

        html = html.replace(/<img[^>]*src="([^"]+)"[^>]*>/g, (match, src) => {
            if (contentMap[src]) {
                const ext = src.split('.').pop().toLowerCase();
                const contentType = this.getContentType(src);
                const base64 = btoa(contentMap[src]);
                return match.replace(src, `data:${contentType};base64,${base64}`);
            }
            return match;
        });

        return html;
    }

    getContentType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const types = {
            'html': 'text/html',
            'css': 'text/css',
            'js': 'application/javascript',
            'svg': 'image/svg+xml',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'json': 'application/json',
            'txt': 'text/plain'
        };
        return types[ext] || 'application/octet-stream';
    }

    isValidAppFile(filename) {
        return filename.toLowerCase().endsWith('.app');
    }
}

export default AppManager;