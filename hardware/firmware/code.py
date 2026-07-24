# ============================================================================
# Meme Stratum — ロータリーエンコーダー・コントローラー ファームウェア
# Raspberry Pi Pico W + CircuitPython
#
# 配線（このコードの前提）:
#   ロータリー A相   → GP2
#   ロータリー B相   → GP3
#   ロータリー COM   → GND（Pico の 3番ピン等）
#   （押しスイッチ SW → GP4 … 任意。下部の SWITCH_ENABLE 参照）
#
# 動作:
#   エンコーダーを回すと、動いた分の差分を1行ずつ USB シリアルに出力する。
#   Web 側（src/main.js の initSerial）は改行区切りの数値 v を読み、
#   targetY += v * 3 で地層をスクロールする。数値以外の行は無視される。
#
# インストール:
#   1. Pico W に CircuitPython を書き込む（hardware/firmware/README.md 参照）
#   2. このファイルを CIRCUITPY ドライブに code.py という名前でコピー
#   3. Web 側の「SERIAL 接続」ボタンから Pico W のポートを選ぶ
# ============================================================================

import time
import board
import rotaryio

# ── 調整パラメータ ──────────────────────────────────────────────
# 1detent（カチッと1つ）あたり Web に送る値。Web 側で ×3 されるので、
# 実際の移動量は STEP * 3。大きいほど1カチで速く掘れる。まず 0.5 で様子見。
STEP = 0.5

# スクロール方向。回す向きと掘る向きが逆なら -1 にする（配線A/Bの入れ替えでも可）。
DIRECTION = 1

# ポーリング間隔（秒）。RP2040 は PIO でカウントするので取りこぼしは無い。
POLL_INTERVAL = 0.005
# ────────────────────────────────────────────────────────────────

# A相=GP2, B相=GP3。divisor=4 で「1detent = ±1カウント」（24detent型の標準）。
# もし1カチで2ずつ動く個体なら STEP を半分にして調整する。
encoder = rotaryio.IncrementalEncoder(board.GP2, board.GP3)

last_position = encoder.position

while True:
    position = encoder.position
    delta = position - last_position
    if delta != 0:
        # 動いた分だけ送信（Web: targetY += v * 3）
        print(delta * STEP * DIRECTION)
        last_position = position
    time.sleep(POLL_INTERVAL)
