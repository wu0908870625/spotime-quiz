"""本機預覽伺服器。

直接用 file:// 開 index.html 是行不通的：Chrome 會以 CORS 為由擋掉
type="module" 的腳本，畫面會永遠停在讀取動畫。所以一定要走 http。
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent / "web"
HOST = "127.0.0.1"
PORT = 8765


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # 沒有這行的話，改過的 .js 模組會一直吃到 Chrome 的舊快取
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, *args):
        pass


def main():
    if not ROOT.is_dir():
        sys.exit(f"找不到網站資料夾：{ROOT}")
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as error:
        sys.exit(f"無法在 {HOST}:{PORT} 開站（{error}）。可能已經有一個在跑了。")
    print(f"預覽網址 http://{HOST}:{PORT}/   （關掉這個視窗就會停止）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
