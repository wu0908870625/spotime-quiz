#!/bin/bash
# 雙擊這個檔案會開「手機／電腦版並排對照」那一頁。
# 只是我們自己檢查版型用的工具頁，不會上線。
cd "$(dirname "$0")" || exit 1
URL="http://127.0.0.1:8765/preview.html"

if ! curl -s -o /dev/null --max-time 2 "http://127.0.0.1:8765/"; then
  python3 tools/serve.py &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null' EXIT
  for _ in $(seq 1 20); do
    curl -s -o /dev/null --max-time 1 "http://127.0.0.1:8765/" && break
    sleep 0.3
  done
  open "$URL"
  echo "版型對照頁已開啟：$URL"
  echo "要停止伺服器，關掉這個視窗就好。"
  wait
else
  open "$URL"
  echo "伺服器已經在跑了，直接開瀏覽器：$URL"
fi
