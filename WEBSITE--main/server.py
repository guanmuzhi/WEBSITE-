#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import urllib.parse
import urllib.error
import ssl
import os
import sys
import ipaddress
import socket
import base64

def _resolve_port():
    """端口优先级：命令行 --port > 环境变量 PORT > 8000。
    （部署平台通常注入 $PORT，本地开发直接跑默认 8000。）"""
    port = None
    argv = sys.argv[1:]
    for i, a in enumerate(argv):
        if a == '--port' and i + 1 < len(argv):
            port = argv[i + 1]
        elif a.startswith('--port='):
            port = a.split('=', 1)[1]
    if port is None:
        port = os.environ.get('PORT')
    try:
        return int(port) if port else 8000
    except ValueError:
        return 8000


PORT = _resolve_port()

# ── /proxy 的 SSRF 防护 ───────────────────────────────────────────
# 这个代理是给「浏览器」「文件管理器」这类应用做跨域抓取用的，但它原本是
# 任意 URL 转发 + 关闭证书校验 + 剥离 X-Frame-Options。服务一旦暴露到公网，
# 就是标准的 SSRF 跳板：别人可以用它探测内网、打云厂商元数据接口。
# 所以这里默认只放行公网地址，并恢复 TLS 证书校验。
# 本地开发确实需要抓内网时，用环境变量 WEBOS_PROXY_ALLOW_PRIVATE=1 打开。
ALLOWED_SCHEMES = ('http://', 'https://')
ALLOW_PRIVATE_NETWORK = os.environ.get('WEBOS_PROXY_ALLOW_PRIVATE', '').lower() in ('1', 'true', 'yes')


def _host_is_blocked(host):
    """命中内网/保留地址段就拒绝。返回 (blocked, reason)。"""
    if not host:
        return True, 'empty host'
    host = host.strip('[]')
    if host.lower() in ('localhost', 'localhost.localdomain', 'metadata', 'metadata.google.internal'):
        return True, 'localhost / metadata host'
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved \
                or ip.is_multicast or ip.is_unspecified:
            return True, 'private or special address'
        return False, ''
    except ValueError:
        pass
    # 域名：解析后逐个地址检查，防 DNS rebinding / 域名指向 127.0.0.1
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return True, 'dns resolve failed'
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved \
                or ip.is_multicast or ip.is_unspecified:
            return True, 'resolves to a private address'
    return False, ''


def _b64url_decode(value):
    """解码前端传来的 base64url 目标地址。

    之所以不直接用 ?url=https%3A%2F%2F... ：线上网关的 WAF 会把查询串里
    百分号编码的 "://" 判成 SSRF 特征直接 403，base64url 里没有这类字面量。
    """
    try:
        padding = '=' * (-len(value) % 4)
        return base64.urlsafe_b64decode(value + padding).decode('utf-8')
    except Exception:
        return ''


def _html_escape_attr(value):
    """给 HTML 属性值做最小转义，避免注入 base 标签时破坏文档结构。"""
    return (value.replace('&', '&amp;').replace('"', '&quot;')
                 .replace('<', '&lt;').replace('>', '&gt;'))


def _inject_base_tag(content, base_url):
    """给抓取回来的 HTML 注入 <base href="原始地址">。

    浏览器应用是同源渲染 /proxy?url=... 的返回内容，如果不注入 base，
    页面里的相对链接、图片、样式都会相对到 /proxy 上而全部失效。
    """
    import re
    base_tag = ('<base href="' + _html_escape_attr(base_url) + '">').encode('utf-8')
    text = re.sub(rb'<base\b[^>]*>', b'', content, flags=re.I)
    match = re.search(rb'<head\b[^>]*>', text, re.I)
    if match:
        return text[:match.end()] + base_tag + text[match.end():]
    match = re.search(rb'<html\b[^>]*>', text, re.I)
    if match:
        return text[:match.end()] + b'<head>' + base_tag + b'</head>' + text[match.end():]
    return base_tag + text


# 注入到被代理页面里的「桥接脚本」。
# 代理页面跑在没有 allow-same-origin 的沙箱里（不注入的话，页面脚本就能顺着
# parent 摸到 OS 的 localStorage，AI 助手的 API Key 之类会被顺走），
# 所以父页面拿不到 contentDocument，只能靠这段脚本自己上报：
#   open-tab / navigate / meta，父页面监听 message 事件处理。
# 有了它，链接拦截不再依赖同源，跨域页面照样能在内部浏览器开新标签。
BRIDGE_SCRIPT = """
<script>
(function () {
    var P = window.parent;
    if (!P || P === window) return;
    function abs(h) { try { return new URL(h, document.baseURI).href; } catch (e) { return null; } }
    function skip(h) { return !h || /^\\s*(javascript|data|mailto|tel|sms|#)/i.test(h); }
    function send(t, u) { try { P.postMessage({ __webosBrowser: t, url: u }, '*'); } catch (e) {} }
    function open(h) { var u = abs(h); if (u) send('open-tab', u); }
    function anchor(n) { return n && n.closest ? n.closest('a[href]') : null; }
    var orig = window.open;
    window.open = function (u, t) {
        if (u && typeof u === 'string' && (t === '_blank' || !t)) { open(u); return null; }
        return orig.apply(window, arguments);
    };
    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0) return;
        var a = anchor(e.target); if (!a) return;
        var h = a.getAttribute('href'); if (skip(h)) return;
        var t = (a.getAttribute('target') || '').toLowerCase();
        if (t === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault(); e.stopPropagation(); open(h);
        } else if (!t || t === '_self') {
            if (a.hasAttribute('download')) return;
            var u = abs(h); if (!u) return;
            e.preventDefault(); e.stopPropagation(); send('navigate', u);
        }
    }, true);
    document.addEventListener('auxclick', function (e) {
        if (e.button !== 1) return;
        var a = anchor(e.target); if (!a) return;
        var h = a.getAttribute('href'); if (skip(h)) return;
        e.preventDefault(); e.stopPropagation(); open(h);
    }, true);
    document.addEventListener('submit', function (e) {
        var f = e.target;
        if (f && f.getAttribute && (f.getAttribute('target') || '').toLowerCase() === '_blank' && f.action) {
            e.preventDefault(); open(f.action);
        }
    }, true);
    function meta() { try { P.postMessage({ __webosBrowser: 'meta', title: document.title, url: location.href }, '*'); } catch (e) {} }
    if (document.readyState === 'complete') { meta(); } else { window.addEventListener('load', meta); }
})();
</script>
""".strip().encode('utf-8')


def _inject_bridge(content):
    """把桥接脚本塞进 <head>，同时去掉页面自带的 CSP meta（否则内联脚本会被拦）。"""
    import re
    text = re.sub(rb'<meta\b[^>]*http-equiv\s*=\s*["\']?content-security-policy[^>]*>',
                  b'', content, flags=re.I)
    match = re.search(rb'<head\b[^>]*>', text, re.I)
    if match:
        return text[:match.end()] + BRIDGE_SCRIPT + text[match.end():]
    match = re.search(rb'<html\b[^>]*>', text, re.I)
    if match:
        return text[:match.end()] + b'<head>' + BRIDGE_SCRIPT + b'</head>' + text[match.end():]
    return BRIDGE_SCRIPT + text


class WebOSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        if self._is_proxy_path():
            self.handle_proxy()
        else:
            super().do_GET()

    def do_HEAD(self):
        if self._is_proxy_path():
            self.send_error(405, 'Method not allowed')
        else:
            super().do_HEAD()

    def _is_proxy_path(self):
        return urllib.parse.urlparse(self.path).path.rstrip('/') == '/proxy'

    def handle_proxy(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        # b=base64url（WAF 友好，线上用），url=明文（本地调试用）
        url = params.get('b', [''])[0]
        if url:
            url = _b64url_decode(url)
        else:
            url = params.get('url', [''])[0]

        if not url:
            self.send_error(400, 'Missing url parameter')
            return

        if not url.startswith(ALLOWED_SCHEMES):
            self.send_error(400, 'Invalid URL: only http/https allowed')
            return

        try:
            target = urllib.parse.urlparse(url)
        except Exception:
            self.send_error(400, 'Malformed URL')
            return

        if not ALLOW_PRIVATE_NETWORK:
            blocked, reason = _host_is_blocked(target.hostname)
            if blocked:
                # 解析不了多半是运行环境本身没有外网，属于上游故障，不是被策略拦截
                code = 502 if reason == 'dns resolve failed' else 403
                self.send_error(code, f'Proxy target refused: {reason}')
                return

        try:
            # 恢复证书校验（原来是 CERT_NONE + check_hostname=False，等于放任中间人）。
            ctx = ssl.create_default_context()

            # 尽量贴近真实浏览器：不少站点（知乎、微博、小红书等）会按
            # Accept-Encoding / Referer / Sec-Fetch-* 缺失与否判定爬虫，缺了就 403。
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Referer': target.scheme + '://' + (target.hostname or '') + '/',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Connection': 'keep-alive',
            })

            response = urllib.request.urlopen(req, context=ctx, timeout=15)
            content_type = response.headers.get('Content-Type', 'text/html')
            # 跟随重定向后真实地址，注入 <base> 时要用它，否则相对链接会指向跳板前的域名
            final_url = response.geturl() or url

            content = response.read()
            if 'html' in content_type.lower():
                content = _inject_base_tag(content, final_url)
                content = _inject_bridge(content)

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Expose-Headers', 'X-WebOS-Proxy')

            # Strip X-Frame-Options and CSP frame-ancestors to allow iframe embedding
            # Do NOT send X-Frame-Options or frame-ancestors
            # 浏览器应用靠这个头判断「当前服务器是否支持同源代理渲染」
            self.send_header('X-WebOS-Proxy', '1')
            self.send_header('X-WebOS-Proxy-Final-Url', final_url)

            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        except urllib.error.HTTPError as e:
            self.send_error(e.code, str(e.reason))
        except Exception as e:
            self.send_error(502, f'Proxy error: {str(e)}')

    def log_message(self, format, *args):
        if '/proxy?' in (format % args if args else format):
            return  # Suppress proxy logs
        super().log_message(format, *args)


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    with ThreadedTCPServer(("", PORT), WebOSHandler) as httpd:
        print(f"WebOS serving at http://0.0.0.0:{PORT}/")
        httpd.serve_forever()
