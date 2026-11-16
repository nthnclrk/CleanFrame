"""Serve the actual TV UI on this computer."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


class PreviewServer(ThreadingHTTPServer):
    request_queue_size = 128


class Preview(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        route = urlsplit(path).path
        # Serve only the packaged UI.
        if route == '/' or route == '/home':
            return str(ROOT / 'app/index.html')
        self.directory = str(ROOT / 'app')
        return super().translate_path(route[5:] if route.startswith('/home/') else route)

    def do_GET(self):
        if urlsplit(self.path).path == '/':
            self.send_response(302)
            self.send_header('Location', '/home/')
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4795)
    args = parser.parse_args()
    server = PreviewServer(('127.0.0.1', args.port), Preview)
    print('CleanFrame preview: http://127.0.0.1:' + str(server.server_port) + '/home/', flush=True)
    server.serve_forever()
