#!/usr/bin/env python3
"""Local dev server for the Hide & Seek map.

Usage:  python3 runserver.py [port]

Serves this folder on http://localhost:5500 (or the given port), opens the
browser, and picks the next free port automatically if the default is busy.
Stop with Ctrl+C. No dependencies beyond a stock Python 3.
"""

import http.server
import os
import socket
import sys
import threading
import webbrowser

DEFAULT_PORT = 5500


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Serve files without caching so edits show up on plain reload."""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet


def find_free_port(start):
    for port in range(start, start + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    sys.exit('No free port found.')


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    wanted = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    port = find_free_port(wanted)
    url = f'http://localhost:{port}'

    if port != wanted:
        print(f'Port {wanted} is busy, using {port} instead.', flush=True)
    print(f'Hide & Seek map running at  {url}', flush=True)
    print('Stop with Ctrl+C', flush=True)

    threading.Timer(0.5, webbrowser.open, args=[url]).start()

    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')


if __name__ == '__main__':
    main()
