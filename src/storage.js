const FS_KEY = 'web-terminal-os-data';

class StorageService {
    static instance = null;

    static getInstance() {
        if (!StorageService.instance) {
            StorageService.instance = new StorageService();
        }
        return StorageService.instance;
    }

    constructor() {
        if (StorageService.instance) {
            return StorageService.instance;
        }
        this.fs = this.loadFS();
        StorageService.instance = this;
    }

    loadFS() {
        const data = localStorage.getItem(FS_KEY);
        return data ? JSON.parse(data) : { type: 'folder', name: '/', children: [] };
    }

    saveFS() {
        localStorage.setItem(FS_KEY, JSON.stringify(this.fs));
    }

    getNodeByPath(path) {
        if (path === '/') return this.fs;
        
        const parts = path.split('/').filter(p => p);
        let node = this.fs;
        
        for (const part of parts) {
            if (!node.children) return null;
            node = node.children.find(c => c.name === part && c.type === 'folder');
            if (!node) return null;
        }
        
        return node;
    }

    createPath(path) {
        if (path === '/') return this.fs;
        
        const parts = path.split('/').filter(p => p);
        let node = this.fs;
        let created = false;
        
        for (const part of parts) {
            if (!node.children) node.children = [];
            let child = node.children.find(c => c.name === part && c.type === 'folder');
            if (!child) {
                child = { type: 'folder', name: part, children: [] };
                node.children.push(child);
                created = true;
            }
            node = child;
        }
        
        if (created) {
            this.saveFS();
        }
        
        return node;
    }

    writeFile(path, content) {
        const parts = path.split('/');
        const fileName = parts.pop();
        const folderPath = parts.join('/') || '/';
        
        const folder = this.createPath(folderPath);
        
        if (!folder.children) folder.children = [];
        
        const existingIndex = folder.children.findIndex(c => c.name === fileName && c.type === 'file');
        const fileData = {
            type: 'file',
            name: fileName,
            content: typeof content === 'string' ? content : JSON.stringify(content)
        };
        
        if (existingIndex !== -1) {
            folder.children[existingIndex] = fileData;
        } else {
            folder.children.push(fileData);
        }
        
        this.saveFS();
    }

    readFile(path) {
        const parts = path.split('/');
        const fileName = parts.pop();
        const folderPath = parts.join('/') || '/';
        
        const folder = this.getNodeByPath(folderPath);
        if (!folder || !folder.children) return null;
        
        const file = folder.children.find(c => c.name === fileName && c.type === 'file');
        if (!file) return null;
        
        return file.content;
    }

    deleteFile(path) {
        const parts = path.split('/');
        const fileName = parts.pop();
        const folderPath = parts.join('/') || '/';
        
        const folder = this.getNodeByPath(folderPath);
        if (!folder || !folder.children) return false;
        
        const index = folder.children.findIndex(c => c.name === fileName && c.type === 'file');
        if (index === -1) return false;
        
        folder.children.splice(index, 1);
        this.saveFS();
        return true;
    }

    fileExists(path) {
        const parts = path.split('/');
        const fileName = parts.pop();
        const folderPath = parts.join('/') || '/';
        
        const folder = this.getNodeByPath(folderPath);
        if (!folder || !folder.children) return false;
        
        return folder.children.some(c => c.name === fileName && c.type === 'file');
    }

    folderExists(path) {
        return this.getNodeByPath(path) !== null;
    }

    loadJSON(path) {
        const content = this.readFile(path);
        if (!content) return null;
        try {
            return JSON.parse(content);
        } catch (e) {
            return null;
        }
    }

    saveJSON(path, data) {
        this.writeFile(path, JSON.stringify(data));
    }

    reload() {
        this.fs = this.loadFS();
    }
}

export default StorageService;