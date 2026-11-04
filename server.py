"""Local-only HTTP API, no third-party runtime packages."""
import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import assistant
import providers

ROOT = Path(__file__).resolve().parent
CHAT_LOCK = threading.BoundedSemaphore(1)
STATIC = {'/':('index.html','text/html'), '/index.html':('index.html','text/html'),
          '/style.css':('style.css','text/css'), '/app.js':('app.js','text/javascript'),
          '/ui.js':('ui.js','text/javascript'), '/favicon.svg':('favicon.svg','image/svg+xml')}


class Handler(BaseHTTPRequestHandler):
    server_version = 'LocalFinance/1.0'

    def log_message(self, *_args):
        pass  # No questions, credentials, or upstream bodies in access logs.

    def allowed(self, post=False):
        host = self.headers.get('Host','')
        expected = {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
        if host not in expected:
            self.send_json({'error':'只允许本机访问'},403)
            return False
        origin = self.headers.get('Origin')
        if (post or origin is not None) and origin != 'http://'+host:
            self.send_json({'error':'不允许跨站请求'},403)
            return False
        return True

    def send_content(self,content,mime,status=200):
        self.send_response(status)
        self.send_header('Content-Type',mime+'; charset=utf-8')
        self.send_header('Content-Length',str(len(content)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.send_header('Referrer-Policy','no-referrer')
        self.end_headers()
        try:
            self.wfile.write(content)
        except (BrokenPipeError,ConnectionResetError):
            pass

    def send_json(self,payload,status=200):
        self.send_content(json.dumps(payload,ensure_ascii=False,allow_nan=False).encode('utf-8'),'application/json',status)

    def do_GET(self):
        if not self.allowed():
            return
        path = urlsplit(self.path).path
        if path == '/api/status':
            self.send_json({**assistant.settings(),'companies':providers.COMPANIES,
                            'sample_range':['2023-01-01','2025-12-31'],'version':'1.0.0'})
        elif path in STATIC:
            name,mime = STATIC[path]
            file = ROOT / 'static' / name
            if file.is_file():
                self.send_content(file.read_bytes(),mime)
            else:
                self.send_json({'error':'页面尚未生成'},404)
        else:
            self.send_json({'error':'页面不存在'},404)

    def do_POST(self):
        if not self.allowed(post=True):
            return
        if self.headers.get('Content-Type','').split(';')[0] != 'application/json':
            self.send_json({'error':'请求必须为 JSON'},415)
            return
        try:
            length = int(self.headers.get('Content-Length','0'))
            if not 0 < length <= 24000:
                raise ValueError('请求体为空或过大')
            self.connection.settimeout(10)
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload,dict):
                raise ValueError('请求参数必须为对象')
            path = urlsplit(self.path).path
            if path == '/api/history':
                result = providers.history(payload.get('symbol','600519'),payload.get('mode','sample'),payload.get('start','2024-01-01'),payload.get('end','2024-12-31'))
            elif path == '/api/compare':
                result = providers.compare(payload.get('symbols'),payload.get('mode','sample'),payload.get('period','2024-12-31'))
            elif path == '/api/backtest':
                keys = ('symbol','mode','start','end','short','long','capital','fee_bps','slippage_bps')
                if set(payload)-set(keys):
                    raise ValueError('不支持的回测参数')
                result = providers.strategy(**payload)
            elif path == '/api/demo':
                result = assistant.demo(payload.get('context',{}))
            elif path == '/api/chat':
                if not CHAT_LOCK.acquire(blocking=False):
                    self.send_json({'error':'已有 AI 分析进行中，请等待完成'},429)
                    return
                try:
                    result = assistant.chat(payload.get('question'),payload.get('context',{}),payload.get('history'))
                finally:
                    CHAT_LOCK.release()
            else:
                self.send_json({'error':'接口不存在'},404)
                return
            self.send_json(result)
        except (ValueError,TypeError,KeyError,UnicodeError):
            # Validation errors are safe text we control. Type/key errors are generic.
            import sys
            error = sys.exc_info()[1]
            message = str(error) if type(error) is ValueError else '请求格式或数据格式无效'
            self.send_json({'error':message},400)
        except Exception:
            self.send_json({'error':'处理失败，请检查网络或输入后重试'},500)


def make_server(port=8765):
    return ThreadingHTTPServer(('127.0.0.1',port),Handler)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--open',action='store_true',dest='open_browser')
    args = parser.parse_args()
    httpd = make_server(args.port)
    print(f'Financial assistant: http://127.0.0.1:{httpd.server_port}',flush=True)
    print('DeepSeek: '+('configured' if assistant.settings()['configured'] else 'not configured; local analysis available'),flush=True)
    if args.open_browser:
        import webbrowser
        threading.Timer(.7, lambda: webbrowser.open(f'http://127.0.0.1:{httpd.server_port}')).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
