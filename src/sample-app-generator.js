class SampleAppGenerator {
    static async generateSampleApp() {
        if (!window.JSZip) {
            console.error('JSZip 库未加载');
            return null;
        }

        const zip = new JSZip();

        const infoJson = {
            name: '我的应用',
            developer: 'WebOS Team',
            version: '1.0.0',
            width: 600,
            height: 400,
            title: '示例应用'
        };
        zip.file('info.json', JSON.stringify(infoJson, null, 2));

        const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
</svg>`;
        zip.file('icon.svg', iconSvg);

        const mainFolder = zip.folder('main');

        const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>示例应用</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="app-container">
        <header>
            <h1>欢迎使用示例应用</h1>
            <p>这是一个运行在 Web Terminal OS 中的应用程序</p>
        </header>
        
        <main>
            <div class="card">
                <h2>功能演示</h2>
                <p>点击按钮查看效果：</p>
                <button id="click-btn">点击我</button>
                <p id="counter">点击次数: 0</p>
            </div>
            
            <div class="card">
                <h2>关于应用</h2>
                <ul>
                    <li>开发者: WebOS Team</li>
                    <li>版本: 1.0.0</li>
                    <li>格式: .app</li>
                </ul>
            </div>
        </main>
        
        <footer>
            <p>© 2024 Web Terminal OS</p>
        </footer>
    </div>
    
    <script src="app.js"></script>
</body>
</html>`;
        mainFolder.file('index.html', indexHtml);

        const styleCss = `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    color: #333;
}

.app-container {
    max-width: 500px;
    margin: 0 auto;
    padding: 20px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

header {
    text-align: center;
    margin-bottom: 30px;
    color: white;
}

header h1 {
    font-size: 28px;
    margin-bottom: 10px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

header p {
    font-size: 14px;
    opacity: 0.9;
}

main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.card {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

.card h2 {
    font-size: 18px;
    color: #4a5568;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid #e2e8f0;
}

.card p {
    font-size: 14px;
    color: #718096;
    line-height: 1.6;
    margin-bottom: 16px;
}

.card ul {
    list-style: none;
}

.card li {
    font-size: 14px;
    color: #718096;
    padding: 8px 0;
    border-bottom: 1px solid #e2e8f0;
}

.card li:last-child {
    border-bottom: none;
}

button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
}

button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

button:active {
    transform: translateY(0);
}

#counter {
    font-weight: 600;
    color: #667eea !important;
}

footer {
    text-align: center;
    margin-top: 30px;
    color: white;
    font-size: 12px;
    opacity: 0.8;
}`;
        mainFolder.file('style.css', styleCss);

        const appJs = `let count = 0;

const btn = document.getElementById('click-btn');
const counter = document.getElementById('counter');

btn.addEventListener('click', () => {
    count++;
    counter.textContent = '点击次数: ' + count;
    
    if (count === 1) {
        counter.style.color = '#27c93f';
    } else if (count === 5) {
        counter.style.color = '#ffbd2e';
        alert('恭喜！你已经点击了 5 次！');
    } else if (count === 10) {
        counter.style.color = '#ff5f56';
        alert('太厉害了！你已经点击了 10 次！');
    }
});

console.log('示例应用已加载');`;
        mainFolder.file('app.js', appJs);

        const content = await zip.generateAsync({ type: 'base64' });
        return content;
    }
}

export default SampleAppGenerator;