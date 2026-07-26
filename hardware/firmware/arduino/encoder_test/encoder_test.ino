// ============================================================================
// Meme Stratum — エンコーダー診断スケッチ（Arduino IDE のシリアルモニタ用）
//
// ブラウザに繋ぐ前に「そもそもエンコーダーが反応しているか」をIDEだけで確認する。
// 本番用ファーム（meme_stratum_encoder.ino）とは別物。確認が済んだら本番用を
// 書き込み直すこと。
//
// 使い方:
//   1. ツール > ボード > "Raspberry Pi Pico W" を選んで、このスケッチを書き込む
//   2. ツール > シリアルモニタ を開く（右下の速度を 115200 baud にする）
//   3. ノブを回す
//
// 読み方（重要）:
//   ・何も出ない            → 書き込み失敗 / ポート違い / 速度が115200でない
//   ・「待機中」だけ出て、回してもA・Bが変化しない
//                           → 配線かハンダ不良（エンコーダーまで届いていない）
//   ・回すとA・Bが 0/1 に変化する
//                           → エンコーダーは正常。本番ファームを書き込めばOK
//
// 配線（本番と同じ）:
//   A相 → GP2 / B相 → GP3 / COM → GND
// ============================================================================

const uint8_t PIN_A = 2;  // GP2（A相）
const uint8_t PIN_B = 3;  // GP3（B相）

uint8_t lastA = 1, lastB = 1;
unsigned long changeCount = 0;   // A/Bが変化した回数（回した手応えの数値化）
unsigned long lastBeatMs = 0;

void setup() {
  Serial.begin(115200);
  // COMをGNDへ落とす配線なので内蔵プルアップを使う（未接続なら常に1のまま）
  pinMode(PIN_A, INPUT_PULLUP);
  pinMode(PIN_B, INPUT_PULLUP);
  delay(1500); // シリアルモニタを開くまでの猶予（ここでは待ち続けない）
  Serial.println();
  Serial.println(F("=== MEME STRATUM / エンコーダー診断 ==="));
  Serial.println(F("ノブを回すと A と B の値が 0/1 に変化します。"));
  Serial.println(F("変化しなければ配線・ハンダを確認してください。"));
  Serial.println();
  lastA = digitalRead(PIN_A);
  lastB = digitalRead(PIN_B);
}

void loop() {
  uint8_t a = digitalRead(PIN_A);
  uint8_t b = digitalRead(PIN_B);

  if (a != lastA || b != lastB) {
    changeCount++;
    Serial.print(F("反応あり  A="));
    Serial.print(a);
    Serial.print(F("  B="));
    Serial.print(b);
    Serial.print(F("   変化回数="));
    Serial.println(changeCount);
    lastA = a;
    lastB = b;
    lastBeatMs = millis(); // 動いている間は待機メッセージを出さない
  }

  // 2秒ごとの生存表示。これすら出ない場合はスケッチが動いていない
  if (millis() - lastBeatMs > 2000) {
    lastBeatMs = millis();
    Serial.print(F("... 待機中（回してください）  現在 A="));
    Serial.print(a);
    Serial.print(F(" B="));
    Serial.print(b);
    Serial.print(F("  累計変化="));
    Serial.println(changeCount);
  }

  delay(2); // チャタリングを軽く均す
}
