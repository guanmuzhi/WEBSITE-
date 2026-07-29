#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import urllib.parse
import urllib.error
import ssl

class WebOSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        if self.path.startswith('/proxy?url='):
            self.handle_proxy()
        else:
            super().do_GET()

    def handle_proxy(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        url = params.get('url', [''])[0]

        if not url:
            self.send_error(400, 'Missing url parameter')
            return

        if not url.startswith(('http://', 'https://')):
            self.send_error(400, 'Invalid URL')
            return

        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            })

            response = urllib.request.urlopen(req, context=ctx, timeout=15)
            content_type = response.headers.get('Content-Type', 'text/html')

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')

            # Strip X-Frame-Options and CSP frame-ancestors to allow iframe embedding
            # Do NOT send X-Frame-Options or frame-ancestors

            content = response.read()
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

PORT = 8000
with socketserver.TCPServer(("", PORT), WebOSHandler) as httpd:
    print(f"WebOS serving at http://localhost:{PORT}/")
    httpd.serve_forever()
