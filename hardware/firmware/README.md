# ロータリーエンコーダー ファームウェア（Pico W）

Meme Stratum の地層スクロールを、ロータリーエンコーダーの回転で操作するための
Pico W ファームウェア。回した差分を USB シリアルに出力し、Web 側（`src/main.js`）が
それを読んでスクロールする。

**2種類を同梱。どちらか片方を使えばよい（動作は同一）:**

| 版 | ファイル | 特徴 |
|----|---------|------|
| CircuitPython | `code.py` | ビルド不要。`CIRCUITPY` ドライブに置くだけ。現場で編集しやすい |
| Arduino | `arduino/meme_stratum_encoder/meme_stratum_encoder.ino` | Arduino IDE に慣れているなら。要ボードコア導入・書き込み |

## 配線

| エンコーダー | Pico W |
|-------------|--------|
| A相（3本足の外側） | GP2（4番ピン） |
| B相（3本足の反対の外側） | GP3（5番ピン） |
| COM（3本足の真ん中） | GND（3番ピン） |
| 押しスイッチ SW（任意） | GP4（6番ピン） |

※ USB 側から数えて 3=GND, 4=GP2, 5=GP3, 6=GP4 と並ぶので、左列にまとめて挿せる。

## インストール手順（A: CircuitPython）

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

## インストール手順（B: Arduino IDE）

CircuitPython を使わず Arduino IDE で書き込む場合。CircuitPython 版とは排他（どちらか一方）。

1. **ボードコアを入れる**
   - Arduino IDE > 環境設定 > 追加のボードマネージャURL に以下を追加:
     `https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json`
   - ボードマネージャで **"Raspberry Pi Pico/RP2040" (by Earle Philhower)** をインストール
2. **スケッチを開いて書き込む**
   - `arduino/meme_stratum_encoder/meme_stratum_encoder.ino` を開く
   - ツール > ボード > **"Raspberry Pi Pico W"**
   - Pico W を USB 接続（初回は BOOTSEL を押しながら挿すと確実）→ ポートを選び、書き込み
3. **Web 側と接続**（CircuitPython 版と同じ。上記手順3を参照）

## 動かない時：まず Arduino IDE だけで切り分ける

ブラウザに繋ぐ前に、**エンコーダーが反応しているか**をシリアルモニタで確認できる
診断スケッチを用意している（本番ファームとは別物）。

1. `arduino/encoder_test/encoder_test.ino` を書き込む
2. ツール > シリアルモニタ を開き、右下の速度を **115200 baud** にする
3. ノブを回す

| モニタの表示 | 判定 | 対処 |
|-------------|------|------|
| 何も出ない | スケッチが動いていない | 書き込み先ボード / ポート / 速度115200 を確認 |
| 「待機中」だけ出て、回してもA・Bが変わらない | 信号が届いていない | 配線・ハンダを確認（A→GP2 / B→GP3 / COM→GND） |
| 回すと `反応あり A=… B=…` が出る | エンコーダーは正常 | 本番ファームを書き直せばOK |

確認が済んだら **`meme_stratum_encoder.ino` を書き込み直す**こと（診断スケッチは
人間が読む文字列を出すため、Web側では数値として解釈されない）。

> **重要**: シリアルポートは1つのアプリしか掴めない。ブラウザから接続する前に
> **シリアルモニタは必ず閉じる**こと（開いたままだと Web 側が繋がらない）。

## 調整（`code.py` 冒頭の定数）

| 定数 | 既定値 | 内容 |
|------|-------|------|
| `STEP` | 0.5 | 1カチあたりの移動量。速すぎ→小さく／遅すぎ→大きく。Web 側で ×3 される |
| `DIRECTION` | 1 | 回す向きと掘る向きが逆なら `-1`（配線 A/B の入れ替えでも可） |
| `POLL_INTERVAL` | 0.005 | ポーリング間隔（秒）。RP2040 は PIO でカウントするので取りこぼしなし |

Arduino 版（`.ino` 冒頭）も同じ `STEP` / `DIRECTION` を持つ（`POLL_INTERVAL` は無く、
両ピンの変化割り込みで処理）。

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
