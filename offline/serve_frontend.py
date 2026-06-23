"""
Minimal static server for the built React frontend (front-end/dist),
with SPA fallback so client-side routes work on refresh.

Uses only the Python standard library — no Node.js required on the
offline PC. Run:  python offline/serve_frontend.py
"""

import os
import sys
import http.server
import socketserver

PORT = int(os.environ.get("FRONTEND_PORT", "5173"))
DIST = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "front-end", "dist")
)


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST, **kwargs)

    def do_GET(self):
        # Serve the real file if it exists; otherwise fall back to index.html
        # so React Router can handle the route (e.g. /calendar, /notes).
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.path = "/index.html"
        return super().do_GET()

    def log_message(self, *args):
        pass  # quiet


def main():
    if not os.path.isdir(DIST):
        print("ERROR: front-end/dist not found.")
        print("Build the frontend first (npm run build) on the internet PC.")
        sys.exit(1)

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), SPAHandler) as httpd:
        print(f"Frontend serving {DIST}")
        print(f"Open http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
