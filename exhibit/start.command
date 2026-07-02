#!/bin/bash
# ─────────────────────────────────────────────
#  Meme Stratum — 展示起動スクリプト (macOS)
#  ダブルクリックで:
#    ビルド → ローカルサーバ起動 → スリープ抑止 → Chrome キオスク起動
#  終了するには: Chrome を Cmd+Q → このターミナルを閉じる
# ─────────────────────────────────────────────
set -e
cd "$(dirname "$0")/.."

# 依存が無ければ入れる（初回のみ時間がかかる）
[ -d node_modules ] || npm install

# 最新をビルドして dist/ を配信
npm run build

# 前回のサーバが残っていたら掃除
pkill -f "vite preview" 2>/dev/null || true

npx vite preview --port 4173 --strictPort &
SERVER_PID=$!

# ディスプレイ / システムスリープを抑止
caffeinate -dis &
CAF_PID=$!

cleanup() { kill "$SERVER_PID" "$CAF_PID" 2>/dev/null || true; }
trap cleanup EXIT

sleep 2

# 専用プロファイルでキオスク起動（「復元しますか」ダイアログ等を回避）
# autoplay-policy: 初回操作を待たずにドローン音を再生できるようにする
open -na "Google Chrome" --args \
  --kiosk "http://localhost:4173" \
  --user-data-dir="$HOME/.meme-stratum-kiosk" \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0

echo ""
echo "  MEME STRATUM 起動中 — http://localhost:4173"
echo "  このウィンドウは閉じずに最小化してください（閉じると配信が止まります）"
echo ""

wait "$SERVER_PID"
