// ============================================================================
// encoder-case.scad
// Meme Stratum 展示用 — ロータリーエンコーダー・コントローラー筐体
//
// 円筒2ピース構成（body = 受け皿 / lid = 蓋）。
// PART変数でどのパーツを出力するか選択する。
//   openscad -o encoder-case-body.stl -D 'PART="body"'   encoder-case.scad
//   openscad -o encoder-case-lid.stl  -D 'PART="lid"'    encoder-case.scad
//   openscad                          -D 'PART="assembly"' encoder-case.scad  (プレビュー専用)
//
// 収納する部品:
//   - ロータリーエンコーダー RE160F-40E3-20A-24P-003（秋月100292、φ9mmブッシュ+ナット、
//     回り止めタブ付き、A/B/COM+スイッチ2本のはんだラグが裏面に出る）
//   - メタルノブ K-29-6.1（φ29、イモネジ固定）
//   - Raspberry Pi Pico W（51×21mm）をミニブレッドボード（170ポイント、47×35×10mm、
//     裏面粘着シール）に挿した状態で収納
// ============================================================================

PART = "assembly"; // "body" | "lid" | "assembly"（CLIから -D 'PART="..."' で上書き）

$fn = 120; // 最終出力用の滑らかさ。プレビューを速くしたい時は -D '$fn=48' 等で上書き可

// ----------------------------------------------------------------------------
// パラメータ（すべてここに集約。mm単位）
// ----------------------------------------------------------------------------

// ---- 全体 ----
OUTER_D   = 70;   // 外径
WALL      = 3;    // 側壁厚
FLOOR     = 3;    // 底板厚
BODY_H    = 52;   // body の外側全高（底面〜上端リム）
CHAMFER_H = 0.6;  // 底外周のエレファントフット対策面取り高さ

OUTER_R = OUTER_D / 2;
INNER_D = OUTER_D - 2 * WALL; // 内径（内壁面までの直径）
INNER_R = INNER_D / 2;

// ---- 蓋（lid）----
LID_T       = 3;     // 蓋パネル厚（エンコーダーのブッシュねじ部長は一般的に7mm以下のため、
                      // パネル3mm + ワッシャー + ナットで十分な締め代が取れる）
LID_LIP_H   = 2;      // 蓋の位置決めリップの高さ（body内側に差し込む部分）
LID_FIT_CLR = 0.4;    // リップとbody内径のはめあいクリアランス
LID_LIP_D   = INNER_D - LID_FIT_CLR;
LID_LIP_R   = LID_LIP_D / 2;

// ---- エンコーダー取り付け穴（★実測して調整★）----
// RE160F-40E3-20A-24P-003 のブッシュ外径は公称φ9mm。印刷収縮・はめあいクリアランスを
// 見込んでφ9.2としているが、実機のノギス測定値に合わせて調整すること。
BUSHING_HOLE_D = 9.2; // ★実測して調整★ ブッシュ通し穴径

// 回り止めタブ（ブッシュ根本の小さな突起）用のスロット。
// 中心からのオフセット・角度・寸法はメーカー資料からの概算値であり、
// 現物のパネル取り付け前に必ずノギスで実測して補正すること。
TAB_SLOT_ENABLE = true;  // タブを折った場合は false にしてスロットなし（丸穴のみ）で再出力
TAB_SLOT_OFFSET = 7.5;   // ★実測して調整★ 中心からタブスロット中心までの距離
TAB_SLOT_W      = 3.2;   // ★実測して調整★ タブスロット幅（回転方向）
TAB_SLOT_H      = 2.2;   // ★実測して調整★ タブスロット高さ（半径方向）
TAB_SLOT_ANGLE  = 90;    // ★実測して調整★ ケーブルポート（0°）を基準にしたタブの角度位置

// ---- ブレッドボード位置決めポケット（body 内側の床）----
// ミニブレッドボード本体 47×35mm に対し、各辺+0.5mmのクリアランスで
// スナップイン程度に収まるポケットを4隅のL字リブで構成する。
BB_W      = 47;    // ブレッドボード本体 長辺
BB_D      = 35;    // ブレッドボード本体 短辺
BB_CLR    = 0.5;   // 片側クリアランス
BB_POCKET_W = BB_W + 2 * BB_CLR; // 47.5 -> 実寸は BB_W+2*0.5=48だが下記で明示計算
BB_POCKET_D = BB_D + 2 * BB_CLR;
RIB_H     = 3;     // ポケットリブの高さ
RIB_ARM   = 8;     // L字リブ1辺の長さ
RIB_T     = 2.2;   // L字リブの厚み

// ---- 側面ケーブルポート（micro USBケーブル引き出し口）----
// Picoへ挿すmicro USBケーブルの成形ストレインリリーフ（コネクタ根元の膨らみ）が
// 通る大きさとして角丸スロットにしている。ブレッドボード長辺（=Picoの向き想定）に
// 合わせて角度0°（+X方向）に配置。
PORT_ANGLE = 0;   // ケーブルポートの方位角（0° = +X方向）
PORT_W     = 12;  // ポート幅（周方向）
PORT_H     = 8;   // ポート高さ（軸方向）
PORT_Z     = FLOOR + 1; // ポート下端の高さ（外側底面から。内床より+1mm上）

// ---- ストレインリリーフ（結束バンド用）穴 ----
TIE_HOLE_D   = 3.5;  // 結束バンド通し穴径
TIE_HOLE_GAP = 8;    // 2穴の間隔
TIE_INSET    = 6;    // 内壁からの半径方向インセット（穴中心が内壁からこの距離内側）

// ---- 蓋固定用ネジボス（body側、3箇所 120°等配）----
// ケーブルポート（0°）と干渉しないよう 60/180/300° に配置。
BOSS_ANGLES     = [60, 180, 300];
BOSS_D          = 7;    // ボス外径
BOSS_PILOT_D    = 2.7;  // M3タッピングビス用下穴径
BOSS_PILOT_DEPTH= 8;    // 下穴深さ
BOSS_RADIAL_IN  = 2;    // ボス中心を内壁面から何mm内側に置くか（内壁と確実に融合させるため）
BOSS_R          = INNER_R - BOSS_RADIAL_IN; // ボス中心の半径
BOSS_TOP_Z      = BODY_H - LID_LIP_H;       // ボス上端Z（リム上端からリップ高さ分下げてリップと面一）

// ---- 蓋のネジ通し穴（皿もみ、M3用）----
SCREW_THRU_D  = 3.4;  // M3通し穴
CSK_D         = 6.0;  // 皿ネジ（フラットヘッド）の皿もみ径
CSK_DEPTH     = 1.8;  // 皿もみ深さ

// ---- アセンブリプレビュー用ゴースト寸法（STLには含めない）----
KNOB_D       = 29;   // メタルノブ K-29-6.1 外径
KNOB_H       = 16;   // ノブ突き出し高さ（プレビュー用の概算）
BB_GHOST_H   = 10;   // ブレッドボード厚み
PICO_W       = 51;   // Pico W 長辺
PICO_D       = 21;   // Pico W 短辺
PICO_H       = 1;    // Pico W 基板厚（プレビュー簡略化。ピンヘッダ分は別途クリアランス考慮）
PICO_PIN_H   = 12;   // ピンヘッダ経由でブレッドボードに挿した際の実効高さ
EXPLODE_Z    = 15;   // アセンブリプレビューでの蓋の展開オフセット

// ----------------------------------------------------------------------------
// 派生寸法の検証（echo）
// ----------------------------------------------------------------------------
echo(str("=== 寸法チェック ==="));
echo(str("body 内径 INNER_D = ", INNER_D, " mm"));
echo(str("ブレッドボード対角線 = ", sqrt(BB_W*BB_W + BB_D*BB_D), " mm （内径がこれを上回っている必要あり）"));
echo(str("ブレッドボードポケット対角線 = ", sqrt(BB_POCKET_W*BB_POCKET_W + BB_POCKET_D*BB_POCKET_D), " mm"));
echo(str("内径クリアランス（内径 - ポケット対角線） = ", INNER_D - sqrt(BB_POCKET_W*BB_POCKET_W + BB_POCKET_D*BB_POCKET_D), " mm"));
echo(str("body 内部の使用可能高さ（床上面〜リム上端） = ", BODY_H - FLOOR, " mm"));
echo(str("蓋パネル下面〜リップ先端までの突き出し = ", LID_LIP_H, " mm"));
echo(str("中央部（リップの無い領域）の実質クリアハイト = ", BODY_H - FLOOR, " mm （ブレッドボード+Pico積み上げ ", BB_GHOST_H + PICO_PIN_H, " mm に対し十分な余裕）"));
echo(str("組み立て後の総高さ（body + lidパネル厚） = ", BODY_H + LID_T, " mm （上限60mm以内）"));

assert(INNER_D > sqrt(BB_W*BB_W + BB_D*BB_D), "内径がブレッドボード対角線より小さい！パラメータを見直すこと");
assert(BODY_H + LID_T <= 60, "総高さが60mmを超えている！BODY_Hを見直すこと");

// ----------------------------------------------------------------------------
// 共通モジュール
// ----------------------------------------------------------------------------

// body の外殻（面取り込みの円筒）
module outer_shell() {
    union() {
        cylinder(h = CHAMFER_H, r1 = OUTER_R - CHAMFER_H, r2 = OUTER_R);
        translate([0, 0, CHAMFER_H])
            cylinder(h = BODY_H - CHAMFER_H, r = OUTER_R);
    }
}

// ブレッドボード位置決め用 L字コーナーリブ（1個分、原点=コーナー、+X/+Y方向に腕が伸びる）
module corner_rib() {
    union() {
        cube([RIB_ARM, RIB_T, RIB_H]);
        cube([RIB_T, RIB_ARM, RIB_H]);
    }
}

module breadboard_pocket_ribs() {
    hx = BB_POCKET_W / 2;
    hy = BB_POCKET_D / 2;
    for (sx = [-1, 1]) {
        for (sy = [-1, 1]) {
            translate([sx * hx, sy * hy, FLOOR])
                mirror([sx < 0 ? 1 : 0, 0, 0])
                    mirror([0, sy < 0 ? 1 : 0, 0])
                        corner_rib();
        }
    }
}

// 側面ケーブルポートの切削用ソリッド（角丸スロット、+X方向へ貫通）
module cable_port_cutter() {
    r = PORT_H / 2;
    span = max(PORT_W - PORT_H, 0);
    depth = OUTER_R + 5; // 内壁から外壁を確実に貫通する長さ
    translate([0, 0, PORT_Z + r])
        rotate([0, 0, PORT_ANGLE])
            hull() {
                for (sy = [-span / 2, span / 2])
                    translate([0, sy, 0])
                        rotate([0, 90, 0])
                            cylinder(h = depth, r = r);
            }
}

// 結束バンド用の穴2つ（ケーブルポートのすぐ内側、床を貫通）
module strain_relief_holes() {
    x = INNER_R - TIE_INSET;
    rotate([0, 0, PORT_ANGLE])
        for (sy = [-TIE_HOLE_GAP / 2, TIE_HOLE_GAP / 2])
            translate([x, sy, -1])
                cylinder(h = FLOOR + 2, r = TIE_HOLE_D / 2);
}

// 蓋固定ボス（1本）。内壁と融合させ、上からM3タッピングビス用下穴をあける。
module boss(angle) {
    x = BOSS_R * cos(angle);
    y = BOSS_R * sin(angle);
    h = BOSS_TOP_Z - FLOOR;
    translate([x, y, FLOOR])
        difference() {
            cylinder(h = h, r = BOSS_D / 2);
            translate([0, 0, h - BOSS_PILOT_DEPTH])
                cylinder(h = BOSS_PILOT_DEPTH + 1, r = BOSS_PILOT_D / 2);
        }
}

module all_bosses() {
    for (a = BOSS_ANGLES) boss(a);
}

// ----------------------------------------------------------------------------
// body（受け皿）
// ----------------------------------------------------------------------------
module body() {
    difference() {
        union() {
            difference() {
                outer_shell();
                // 内部を刳り抜く（床厚FLOORを残す）
                translate([0, 0, FLOOR])
                    cylinder(h = BODY_H, r = INNER_R);
            }
            breadboard_pocket_ribs();
            all_bosses();
        }
        cable_port_cutter();
        strain_relief_holes();
    }
}

// ----------------------------------------------------------------------------
// lid（蓋）
// 座標系: z=0 がリップ先端（body内部に差し込まれる側）、
//         z=LID_LIP_H〜LID_LIP_H+LID_T がパネル本体（外側=ノブ側がz最大側）。
// ----------------------------------------------------------------------------
module lid() {
    difference() {
        union() {
            // 位置決めリップ
            cylinder(h = LID_LIP_H, r = LID_LIP_R);
            // パネル本体
            translate([0, 0, LID_LIP_H])
                cylinder(h = LID_T, r = OUTER_R);
        }

        // エンコーダーブッシュ通し穴（中心、全高貫通）
        translate([0, 0, -1])
            cylinder(h = LID_LIP_H + LID_T + 2, r = BUSHING_HOLE_D / 2);

        // 回り止めタブスロット
        if (TAB_SLOT_ENABLE) {
            rotate([0, 0, TAB_SLOT_ANGLE])
                translate([TAB_SLOT_OFFSET, 0, -1])
                    cube([TAB_SLOT_W, TAB_SLOT_H, LID_LIP_H + LID_T + 2], center = true);
        }

        // M3通し穴＋皿もみ（body側ボスと同じ角度に配置）
        for (a = BOSS_ANGLES) {
            x = BOSS_R * cos(a);
            y = BOSS_R * sin(a);
            translate([x, y, -1])
                cylinder(h = LID_LIP_H + LID_T + 2, r = SCREW_THRU_D / 2);
            // 皿もみは外側（パネル上面 = ノブ側）から
            translate([x, y, LID_LIP_H + LID_T - CSK_DEPTH])
                cylinder(h = CSK_DEPTH + 1, r1 = SCREW_THRU_D / 2, r2 = CSK_D / 2);
        }
    }
}

// ----------------------------------------------------------------------------
// アセンブリプレビュー（ゴースト付き、STL出力には使わない）
// ----------------------------------------------------------------------------
module assembly() {
    // body はそのまま
    body();

    // lid は body の上に載せ、視認性のため EXPLODE_Z 分だけ持ち上げる。
    // lid のローカルz=0（リップ先端）が body の内壁上端（BODY_H - LID_LIP_H）に
    // 一致する位置が正しい組み立て位置。
    translate([0, 0, BODY_H - LID_LIP_H + EXPLODE_Z])
        lid();

    // ゴースト: ノブ（lid上面よりさらに上）
    %translate([0, 0, BODY_H - LID_LIP_H + EXPLODE_Z + LID_LIP_H + LID_T])
        cylinder(h = KNOB_H, r = KNOB_D / 2);

    // ゴースト: ブレッドボード（床の上、中心に位置決め）
    %translate([-BB_W / 2, -BB_D / 2, FLOOR])
        cube([BB_W, BB_D, BB_GHOST_H]);

    // ゴースト: Pico W（ブレッドボードの片端に挿す想定。中心直下＝エンコーダー本体の
    // 真下を避けるため、長辺方向にオフセットして配置している）
    pico_offset_x = BB_W / 2 - PICO_W / 2 - 3; // ブレッドボードの端に寄せる
    %translate([pico_offset_x - PICO_W / 2, -PICO_D / 2, FLOOR + BB_GHOST_H + PICO_PIN_H])
        cube([PICO_W, PICO_D, PICO_H]);
}

// ----------------------------------------------------------------------------
// エントリポイント
// ----------------------------------------------------------------------------
if (PART == "body") {
    body();
} else if (PART == "lid") {
    // 印刷向き: 見せ面（ノブ側=パネル上面）を下にして印刷するため180°反転して出力する。
    // （皿もみ穴がベッドに接するため、サポート無しで綺麗な皿もみ面が得られる）
    translate([0, 0, LID_LIP_H + LID_T])
        rotate([180, 0, 0])
            lid();
} else if (PART == "assembly") {
    assembly();
} else {
    echo(str("不明な PART: ", PART, " — \"body\" / \"lid\" / \"assembly\" のいずれかを指定してください"));
}
