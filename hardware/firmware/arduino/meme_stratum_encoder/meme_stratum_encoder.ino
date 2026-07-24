// ============================================================================
// Meme Stratum — ロータリーエンコーダー・コントローラー（Arduino版）
// Raspberry Pi Pico W + Arduino-Pico コア（Earle Philhower）
//
// つまみ（ロータリーエンコーダー）を回すと、動いた分をUSBシリアルに1行ずつ出力する。
// Web側（src/main.js の initSerial）は改行区切りの数値 v を読み、
// targetY += v * 3 で地層をスクロールする。数値以外の行は無視される。
//
// 配線:
//   ロータリー A相 → GP2
//   ロータリー B相 → GP3
//   ロータリー COM → GND（Pico の 3番ピン等）
//   （押しスイッチは今回未使用）
//
// 導入（Arduino IDE）:
//   1. 環境設定 > 追加のボードマネージャURL に
//      https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
//   2. ボードマネージャで "Raspberry Pi Pico/RP2040" (by Earle Philhower) をインストール
//   3. ツール > ボード > "Raspberry Pi Pico W" を選択
//   4. Pico W を USB 接続（初回は BOOTSEL 押しながら挿すと確実）してポートを選び、書き込み
//   5. Web側の「SERIAL 接続」ボタンから Pico W のポートを選ぶ
// ============================================================================

// ── 配線ピン ──
const uint8_t PIN_A = 2;   // GP2（A相）
const uint8_t PIN_B = 3;   // GP3（B相）

// ── 調整パラメータ ──────────────────────────────────────────────
// 1detent（カチッと1つ）あたり Web に送る値。Web 側で ×3 されるので、
// 実際の移動量は STEP * 3。大きいほど1カチで速く掘れる。まず 0.5 で様子見。
const double STEP = 0.5;

// スクロール方向。回す向きと掘る向きが逆なら -1 にする（配線A/Bの入れ替えでも可）。
const int DIRECTION = 1;
// ────────────────────────────────────────────────────────────────

// ── チャタリング耐性のあるステートマシン型デコーダ ──
// Ben Buxton方式のフルステップ・ステートテーブル。1detentの完全な遷移が
// 成立した時だけ CW/CCW を1回出力し、途中のバウンスや中間停止では動かない
// （＝止めている間に勝手にスクロールしない）。外部ライブラリ不要。
#define R_START     0x0
#define R_CW_FINAL  0x1
#define R_CW_BEGIN  0x2
#define R_CW_NEXT   0x3
#define R_CCW_BEGIN 0x4
#define R_CCW_FINAL 0x5
#define R_CCW_NEXT  0x6

#define DIR_NONE 0x0
#define DIR_CW   0x10
#define DIR_CCW  0x20

const uint8_t ttable[7][4] = {
  {R_START,    R_CW_BEGIN,  R_CCW_BEGIN, R_START},            // R_START
  {R_CW_NEXT,  R_START,     R_CW_FINAL,  R_START | DIR_CW},   // R_CW_FINAL
  {R_CW_NEXT,  R_CW_BEGIN,  R_START,     R_START},            // R_CW_BEGIN
  {R_CW_NEXT,  R_CW_BEGIN,  R_CW_FINAL,  R_START},            // R_CW_NEXT
  {R_CCW_NEXT, R_START,     R_CCW_BEGIN, R_START},            // R_CCW_BEGIN
  {R_CCW_NEXT, R_CCW_FINAL, R_START,     R_START | DIR_CCW},  // R_CCW_FINAL
  {R_CCW_NEXT, R_CCW_FINAL, R_CCW_BEGIN, R_START},            // R_CCW_NEXT
};

volatile uint8_t state = R_START;
volatile long position = 0;   // detent単位の累積位置（ISRで更新）
long lastPosition = 0;

// 両ピンの変化割り込みから呼ぶ。1detent成立で position を ±1 する。
void encoderISR() {
  uint8_t pinstate = (digitalRead(PIN_B) << 1) | digitalRead(PIN_A);
  state = ttable[state & 0x0f][pinstate];
  uint8_t result = state & 0x30;
  if (result == DIR_CW) position++;
  else if (result == DIR_CCW) position--;
}

void setup() {
  Serial.begin(115200);          // USB CDC（Web Serialが接続する）
  pinMode(PIN_A, INPUT_PULLUP);  // COMをGNDに落とす配線なので内蔵プルアップを使用
  pinMode(PIN_B, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_A), encoderISR, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_B), encoderISR, CHANGE);
}

void loop() {
  long pos;
  noInterrupts();
  pos = position;
  interrupts();

  long delta = pos - lastPosition;
  if (delta != 0) {
    // 動いた分だけ送信（Web: targetY += v * 3）
    Serial.println((double)delta * STEP * DIRECTION);
    lastPosition = pos;
  }
  delay(5);
}
