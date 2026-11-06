#!/bin/bash
# 雙擊這個檔案就會開站並打開瀏覽器。關掉這個終端機視窗就會停止。
cd "$(dirname "$0")" || exit 1
URL="http://127.0.0.1:8765/"

if curl -s -o /dev/null --max-time 2 "$URL"; then
  echo "伺服器已經在跑了，直接開瀏覽器。"
else
  python3 tools/serve.py &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null' EXIT
  for _ in $(seq 1 20); do
    curl -s -o /dev/null --max-time 1 "$URL" && break
    sleep 0.3
  done
fi

open "$URL"
echo
echo "網頁已開啟：$URL"
echo "想同時看手機版與電腦版：雙擊「開啟版型對照.command」，或直接開 ${URL}preview.html"
echo "要停止伺服器，關掉這個視窗就好。"
wait
