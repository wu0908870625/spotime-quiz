#!/bin/bash
# 部署正式站（spotime-quiz.spotime.workers.dev），連同兩個 secret 一起帶上去。
# 值從 .secrets/ 讀，只放在暫存檔、部署完馬上刪掉，畫面上不會印出來。
# 為什麼不用 wrangler secret put：正式 Worker 有一版上傳了沒部署，secret put 會被擋。
set -euo pipefail
cd "$(dirname "$0")/.."

tmp="$(mktemp -t spotime-secrets)"
trap 'rm -f "$tmp"' EXIT
chmod 600 "$tmp"
python3 - "$tmp" <<'EOF'
import json, sys
read = lambda p: open(p).read().strip()
json.dump({"APPS_SCRIPT_URL": read(".secrets/apps-script-url"), "PROXY_TOKEN": read(".secrets/proxy-token")}, open(sys.argv[1], "w"))
EOF

npx wrangler deploy --secrets-file "$tmp"
echo
echo "正式站部署完成。回到 Claude 說一聲，我來檢查。"
