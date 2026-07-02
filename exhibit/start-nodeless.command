#!/bin/bash
# ─────────────────────────────────────────────
#  Meme Stratum — 展示起動スクリプト（Node / npm / brew 不要版）
#
#  リポジトリに同梱済みのビルド (dist/) を、macOS に元から入っている
#  python3 または ruby で配信して Chrome キオスクを開きます。
#  展示 iMac に必要なのは「このリポジトリ一式」と「Google Chrome」だけ。
#
#  終了するには: Chrome を Cmd+Q → このターミナルを閉じる
# ─────────────────────────────────────────────
set -e
cd "$(dirname "$0")/.."

PORT=4173

if [ ! -f dist/index.html ]; then
  echo "エラー: dist/ が見つかりません。リポジトリを完全な形で配置してください。"
  read -r -p "Enterで閉じる" _
  exit 1
fi

# 前回のサーバが残っていたら掃除
pkill -f "http.server $PORT" 2>/dev/null || true
pkill -f "httpd.*$PORT" 2>/dev/null || true

# macOS 標準のランタイムで静的配信（python3 → ruby の順で試す）
if command -v python3 >/dev/null 2>&1 && xcode-select -p >/dev/null 2>&1; then
  python3 -m http.server "$PORT" --directory dist --bind 127.0.0.1 &
elif command -v python3 >/dev/null 2>&1 && python3 -c 'pass' 2>/dev/null; then
  python3 -m http.server "$PORT" --directory dist --bind 127.0.0.1 &
elif command -v ruby >/dev/null 2>&1; then
  ruby -run -e httpd dist -p "$PORT" -b 127.0.0.1 &
else
  echo "エラー: python3 も ruby も見つかりません。"
  echo "「ソフトウェアアップデート」からコマンドラインツールを入れるか、"
  echo "Node.js を入れて exhibit/start.command を使ってください。"
  read -r -p "Enterで閉じる" _
  exit 1
fi
SERVER_PID=$!

# ディスプレイ / システムスリープを抑止
caffeinate -dis &
CAF_PID=$!

cleanup() { kill "$SERVER_PID" "$CAF_PID" 2>/dev/null || true; }
trap cleanup EXIT

sleep 1

# 専用プロファイルでキオスク起動（復元ダイアログ抑止・音の自動再生許可）
open -na "Google Chrome" --args \
  --kiosk "http://localhost:$PORT" \
  --user-data-dir="$HOME/.meme-stratum-kiosk" \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0

echo ""
echo "  MEME STRATUM 起動中 — http://localhost:$PORT (dist/ 同梱ビルドを配信)"
echo "  このウィンドウは閉じずに最小化してください（閉じると配信が止まります）"
echo ""

wait "$SERVER_PID"
