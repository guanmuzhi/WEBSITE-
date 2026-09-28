/**
 * navore OS 缓存自愈 Service Worker
 *
 * 背景：这个项目是纯前端，所有模块靠 import 串起来。一旦浏览器缓存了旧的
 * index.html / boot-manager.js，就会继续按旧版本号去取旧模块，改了代码线上也不生效，
 * 用户得手动强刷（还不一定刷得掉）。
 *
 * 这里做两件事：
 *   1. 接管同源请求后，一旦发现 VERSION 变了，就清空所有 Cache Storage；
 *   2. 对 HTML/JS 这类代码文件走 network-first，永远优先取线上最新版本，
 *      只有断网时才回退缓存（保证离线可用）。
 *
 * 发版流程：改了代码 → 改这里的 VERSION → 客户端首次访问即自动更新，无需用户强刷。
 */
const VERSION = '47';
const CACHE_NAME = 'navore-os-v' + VERSION;

self.addEventListener('install', (event) => {
    // 新版本立即激活，不等旧页面关掉
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // 清掉所有非当前版本的缓存（含旧版本留下的）
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data === 'skip-waiting') { self.skipWaiting(); }
});

const NETWORK_FIRST = /(\/|\.(html|js|mjs|css|json))$/i;

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (url.origin !== self.location.origin) return;   // 第三方 CDN / 代理内容不接管

    // 代理渲染的页面（/proxy?b=...）本身就是动态内容，交给网络
    if (url.pathname === '/proxy') return;

    event.respondWith((async () => {
        if (!NETWORK_FIRST.test(url.pathname)) {
            // 图标、字体等静态资源：缓存优先，命中即返回
            const cached = await caches.match(req);
            if (cached) return cached;
        }
        try {
            const resp = await fetch(req);
            if (resp && resp.ok && resp.type === 'basic') {
                const copy = resp.clone();
                caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
            }
            return resp;
        } catch (e) {
            const cached = await caches.match(req);
            if (cached) return cached;
            throw e;
        }
    })());
});
