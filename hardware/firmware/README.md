# ロータリーエンコーダー ファームウェア（Pico W / CircuitPython）

Meme Stratum の地層スクロールを、ロータリーエンコーダーの回転で操作するための
Pico W ファームウェア。回した差分を USB シリアルに出力し、Web 側（`src/main.js`）が
それを読んでスクロールする。

## 配線

| エンコーダー | Pico W |
|-------------|--------|
| A相（3本足の外側） | GP2（4番ピン） |
| B相（3本足の反対の外側） | GP3（5番ピン） |
| COM（3本足の真ん中） | GND（3番ピン） |
| 押しスイッチ SW（任意） | GP4（6番ピン） |

※ USB 側から数えて 3=GND, 4=GP2, 5=GP3, 6=GP4 と並ぶので、左列にまとめて挿せる。

## インストール手順

1. **CircuitPython を書き込む**
   - [circuitpython.org](https://circuitpython.org/board/raspberry_pi_pico_w/) から
     Pico W 用の `.uf2` をダウンロード
   - Pico W の BOOTSEL ボタンを押しながら USB を挿す → `RPI-RP2` ドライブが出る
   - `.uf2` をそのドライブにドラッグ → 自動で再起動し `CIRCUITPY` ドライブが出る
2. **ファームをコピー**
   - このフォルダの `code.py` を `CIRCUITPY` ドライブの直下にコピー
   - CircuitPython は保存すると自動で `code.py` を実行する（追加ライブラリ不要。
     `rotaryio` は本体内蔵モジュール）
3. **Web 側と接続**
   - Chrome など Web Serial 対応ブラウザで作品を開く
   - タイトル画面の「SERIAL 接続」ボタン → Pico W のポートを選択
   - エンコーダーを回すと地層がスクロールすれば成功

## 調整（`code.py` 冒頭の定数）

| 定数 | 既定値 | 内容 |
|------|-------|------|
| `STEP` | 0.5 | 1カチあたりの移動量。速すぎ→小さく／遅すぎ→大きく。Web 側で ×3 される |
| `DIRECTION` | 1 | 回す向きと掘る向きが逆なら `-1`（配線 A/B の入れ替えでも可） |
| `POLL_INTERVAL` | 0.005 | ポーリング間隔（秒）。RP2040 は PIO でカウントするので取りこぼしなし |

- 1カチで2ずつ動く個体（ハーフステップ型）は `STEP` を半分にする。

## 動作の仕組み

`rotaryio.IncrementalEncoder(GP2, GP3)` がクアドラチャ信号をハードウェアで処理し、
`.position` にカウントが溜まる。前回との差分だけを `print()` で USB シリアルへ送る。
Web 側は改行区切りの数値だけを拾い（`parseFloat`、数値以外の行＝REPLの出力等は無視）、
`targetY += v * 3` でスクロールする。

## 押しスイッチ（SALVAGE）について

現状の Web 側シリアル処理は**回転の数値のみ**を解釈する（押しスイッチのコマンドは
未対応）。SALVAGE は画面上の SALVAGE ボタン、または Space / Enter キーで実行できる。

物理ボタンで SALVAGE したい場合は、Pico W を USB HID キーボードとして振る舞わせ、
押下時に Space を送る方式が Web 側の改修なしで実現できる（`adafruit_hid` ライブラリが
別途必要）。必要なら対応版のファームを用意する。
