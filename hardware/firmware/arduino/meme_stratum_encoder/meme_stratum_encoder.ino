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
//
// 動作確認（ブラウザに繋ぐ前に IDE だけで確認できる）:
//   ツール > シリアルモニタ を開き（115200 baud）、ノブを回す。
//   0.50 / -0.50 のような数値が流れれば正常。ブラウザからも同じデータが読める。
//   ※ブラウザで接続する前にシリアルモニタは必ず閉じること（ポートは1つのアプリ専有）
//
// 導入（Arduino IDE）:
//   1. 環境設定 > 追加のボードマネージャURL に
//      https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
//   2. ボードマネージャで "Raspberry Pi Pico/RP2040" (by Earle Philhower) をインストール
//   3. ツール > ボード > "Raspberry Pi Pico W" を選択
//   4. Pico W を USB 接続（初回は BOOTSEL 押しながら挿すと確実）してポートを選び、書き込み
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

// 1detent あたりのクアドラチャ・カウント数。24detent型の一般的な個体は 4。
// カチッと1回で動きすぎる場合は 4 のまま STEP を下げる。逆に、何回か回さないと
// 動かない/取りこぼす個体は 2 や 1 にする（歯抜けの信号でも拾えるようになる）。
const int32_t COUNTS_PER_DETENT = 4;
// ────────────────────────────────────────────────────────────────

// ── クアドラチャ・デコーダ（飛び・バウンスに強い方式）──
// 「前回のAB」と「今回のAB」の組み合わせから増減を引くテーブル。
// 厳密な状態機械と違い、接点バウンスで状態が飛んでも停止せず、
// 不正な遷移（AとBが同時に変化）は 0 として捨てて次から復帰する。
//   index = (前回AB << 2) | 今回AB
const int8_t QEM[16] = {
   0, -1,  1,  0,
   1,  0,  0, -1,
  -1,  0,  0,  1,
   0,  1, -1,  0
};

volatile int32_t rawCount = 0;  // クアドラチャの生カウント（ISRで更新）
volatile uint8_t prevAB = 0;

void encoderISR() {
  uint8_t ab = (digitalRead(PIN_A) << 1) | digitalRead(PIN_B);
  rawCount += QEM[(prevAB << 2) | ab];
  prevAB = ab;
}

void setup() {
  Serial.begin(115200);          // USB CDC（Web Serial / シリアルモニタが接続する）
  pinMode(PIN_A, INPUT_PULLUP);  // COMをGNDに落とす配線なので内蔵プルアップを使用
  pinMode(PIN_B, INPUT_PULLUP);
  prevAB = (digitalRead(PIN_A) << 1) | digitalRead(PIN_B);
  attachInterrupt(digitalPinToInterrupt(PIN_A), encoderISR, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_B), encoderISR, CHANGE);
}

void loop() {
  int32_t counts;
  noInterrupts();
  counts = rawCount;
  interrupts();

  // detent単位に丸めて送る。端数は次回に持ち越すので、ゆっくり回しても取りこぼさない
  int32_t detents = counts / COUNTS_PER_DETENT;
  if (detents != 0) {
    noInterrupts();
    rawCount -= detents * COUNTS_PER_DETENT;
    interrupts();
    // 動いた分だけ送信（Web: targetY += v * 3）
    Serial.println((double)detents * STEP * DIRECTION, 2);
  }
  delay(2);
}
