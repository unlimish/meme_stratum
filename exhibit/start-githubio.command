#!/bin/bash
# ─────────────────────────────────────────
#  Meme Stratum — GitHub Pages キオスク起動
#  ダブルクリックで: スリープ抑止 → Chrome キオスクで github.io 起動
#  終了するには: Chrome を Cmd+Q → このターミナルを閉じる
# ─────────────────────────────────────────
set -e
cd "$(dirname "$0")/.."

PAGE_URL="https://unlimish.github.io/meme_stratum/"

# ディスプレイ / システムスリープを抑止
caffeinate -dis &
CAF_PID=$!

cleanup() { kill "$CAF_PID" 2>/dev/null || true; }
trap cleanup EXIT

# 専用プロファイルでキオスク起動（復元ダイアログ抑止・音の自動再生許可）
open -na "Google Chrome" --args \
  --kiosk "$PAGE_URL" \
  --user-data-dir="$HOME/.meme-stratum-kiosk" \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0

echo ""
echo "  MEME STRATUM 起動中 — $PAGE_URL"
echo "  このウィンドウは閉じてもOK（Chromeは消えません）"
echo ""

# ターミナルウィンドウを開いたままにする
wait "$CAF_PID"
