// ============================================================================
// encoder-case.scad
// Meme Stratum 展示用 — ロータリーエンコーダー・コントローラー筐体
//
// 小判型（角丸長方形）2ピース構成（body = 受け皿 / lid = 蓋）。
// 旧版は円筒（φ110）だったが、設置面積を減らすため小判型 116×70mm に変更。
// PART変数でどのパーツを出力するか選択する。
//   openscad -o encoder-case-body.stl -D 'PART="body"'   encoder-case.scad
//   openscad -o encoder-case-lid.stl  -D 'PART="lid"'    encoder-case.scad
//   openscad                          -D 'PART="assembly"' encoder-case.scad  (プレビュー専用)
//
// 収納する部品:
//   - ロータリーエンコーダー RE160F-40E3-20A-24P-003（秋月100292、φ9mmブッシュ+ナット、
//     回り止めタブ付き、A/B/COM+スイッチ2本のはんだラグが裏面に出る）
//   - メタルノブ K-29-6.1（φ29、イモネジ固定）
//   - Raspberry Pi Pico W（51×21mm）をハーフサイズブレッドボード（400ポイント、約83×55×10mm、
//     裏面粘着シール）に挿した状態で収納
// ============================================================================

PART = "assembly"; // "body" | "lid" | "assembly"（CLIから -D 'PART="..."' で上書き）

$fn = 120; // 最終出力用の滑らかさ。プレビューを速くしたい時は -D '$fn=48' 等で上書き可

// ----------------------------------------------------------------------------
// パラメータ（すべてここに集約。mm単位）
// ----------------------------------------------------------------------------

// ---- 全体（小判型 = 角丸長方形）----
CASE_L    = 116;  // 外形 長辺（X軸方向）
CASE_W    = 70;   // 外形 短辺（Y軸方向）
CORNER_R  = 15;   // 外形コーナー半径
WALL      = 3;    // 側壁厚
FLOOR     = 3;    // 底板厚
BODY_H    = 52;   // body の外側全高（底面〜上端リム）
CHAMFER_H = 0.6;  // 底外周のエレファントフット対策面取り高さ

// 内側寸法（内壁面まで）。コーナー半径は壁厚分だけ小さくなる（角丸長方形の内側オフセット）。
INNER_L = CASE_L - 2 * WALL; // 110
INNER_W = CASE_W - 2 * WALL; // 64
INNER_R = CORNER_R - WALL;   // 12

// ---- 蓋（lid）----
LID_T       = 3;     // 蓋パネル厚（エンコーダーのブッシュねじ部長は一般的に7mm以下のため、
                      // パネル3mm + ワッシャー + ナットで十分な締め代が取れる）
LID_LIP_H   = 2;      // 蓋の位置決めリップの高さ（body内側に差し込む部分）
LID_FIT_CLR = 0.4;    // リップとbody内側のはめあいクリアランス（全体で0.4mm＝片側0.2mm）
// 内側形状を均等に0.2mmずつ内側オフセットしたものがリップ形状
// （角丸長方形を距離dだけオフセットすると l,w は 2d、r は d だけ縮む）
LID_LIP_L = INNER_L - LID_FIT_CLR; // 109.6
LID_LIP_W = INNER_W - LID_FIT_CLR; // 63.6
LID_LIP_R = INNER_R - LID_FIT_CLR / 2; // 11.8

// ---- エンコーダー取り付け穴（★実測して調整★）----
// ケース中心（0,0）に配置。小判型でも中心位置は変わらない。
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
TAB_SLOT_ANGLE  = 90;    // ★実測して調整★ ケーブルポート（+X＝0°）を基準にしたタブの角度位置

// ---- ブレッドボード位置決めポケット（body 内側の床）----
// ハーフサイズブレッドボード本体 約83×55mm に対し、各辺+0.5mmのクリアランスで
// スナップイン程度に収まるポケットを4隅のL字リブで構成する。中心（0,0）に配置。
// ★実測して調整★ 400穴ブレッドボードはメーカーで外形が微妙に違う（81〜84×54〜56mm）。
BB_W      = 83;    // ★実測して調整★ ブレッドボード本体 長辺
BB_D      = 55;    // ★実測して調整★ ブレッドボード本体 短辺
BB_CLR    = 0.5;   // 片側クリアランス
BB_POCKET_W = BB_W + 2 * BB_CLR; // 84
BB_POCKET_D = BB_D + 2 * BB_CLR; // 56
POCKET_HX   = BB_POCKET_W / 2;   // 42（ポケット隅のX半幅）
POCKET_HY   = BB_POCKET_D / 2;   // 28（ポケット隅のY半幅）
RIB_H     = 3;     // ポケットリブの高さ
RIB_ARM   = 8;     // L字リブ1辺の長さ
RIB_T     = 2.2;   // L字リブの厚み

// ---- 側面ケーブルポート（micro USBケーブル引き出し口）----
// +X側の端壁（平坦な短辺側）中央に配置。円筒版と違い平坦壁が明確にあるため、
// 角度パラメータは廃止し+X方向に固定。
// Picoへ挿すmicro USBケーブルの成形ストレインリリーフ（コネクタ根元の膨らみ）が
// 通る大きさとして角丸スロットにしている。
PORT_W     = 14;  // ポート幅（Y方向）
PORT_H     = 10;  // ポート高さ（Z方向）
PORT_Z     = FLOOR + 1; // ポート下端の高さ（外側底面から。内床より+1mm上）

// ---- ストレインリリーフ（結束バンド用）穴 ----
TIE_HOLE_D   = 3.5;  // 結束バンド通し穴径
TIE_HOLE_GAP = 8;    // 2穴の間隔（Y方向 ±4）
TIE_INSET    = 6;    // +X内壁からのXインセット（穴中心が内壁からこの距離内側）
TIE_X        = INNER_L / 2 - TIE_INSET; // 49（ポケット端42mmより外側＝+X壁寄り）

// ---- 蓋固定用ネジボス（body側、4箇所）----
// 小判型化により3箇所120°等配から、4隅寄り (±47, ±22) の4箇所に変更。
// ケーブルポート（+X端中央、|y|<=7）とは干渉しない位置。
BOSS_X          = 47;   // ボス中心 Xオフセット
BOSS_Y          = 22;   // ボス中心 Yオフセット
BOSS_POS        = [for (sx = [-1, 1]) for (sy = [-1, 1]) [sx * BOSS_X, sy * BOSS_Y]];
BOSS_D          = 7;    // ボス外径
BOSS_PILOT_D    = 2.7;  // M3タッピングビス用下穴径
BOSS_PILOT_DEPTH= 8;    // 下穴深さ
BOSS_TOP_Z      = BODY_H - LID_LIP_H; // ボス上端Z（リム上端からリップ高さ分下げてリップと面一）

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
PICO_EDGE_GAP= 2;    // Pico Wをブレッドボード+X端からどれだけ内側に離すか（ゴースト配置用）
EXPLODE_Z    = 15;   // アセンブリプレビューでの蓋の展開オフセット

// ----------------------------------------------------------------------------
// 幾何チェック用の関数
// ----------------------------------------------------------------------------

// 角丸長方形は「半幅(hw,hd)の矩形」と「半径rの円」のミンコフスキー和として定義できる。
// よって点(px,py)から角丸長方形の輪郭までの符号なし距離は、
// 「矩形(hw,hd)へクランプした距離」との差として一般式で求まる（角・辺どちらの領域でも成立）。
function clamp0(v) = v > 0 ? v : 0;

// 点(px,py)から半幅(hw,hd)の矩形境界までの最短距離（内側なら0）
function rect_clear(px, py, hw, hd) =
    let(dx = clamp0(abs(px) - hw), dy = clamp0(abs(py) - hd))
    sqrt(dx * dx + dy * dy);

// 点(px,py)が内側キャビティ（角丸長方形、半径INNER_R）の境界からどれだけ内側にあるか（mm）。
// 正なら内側、負なら外側にはみ出している。
function inner_wall_margin(px, py) =
    INNER_R - rect_clear(px, py, INNER_L / 2 - INNER_R, INNER_W / 2 - INNER_R);

// ----------------------------------------------------------------------------
// 派生寸法の検証（echo）
// ----------------------------------------------------------------------------

pocket_corner_margin = inner_wall_margin(POCKET_HX, POCKET_HY);
boss_wall_margins    = [for (p = BOSS_POS) inner_wall_margin(p[0], p[1]) - BOSS_D / 2];
boss_pocket_margins  = [for (p = BOSS_POS) rect_clear(p[0], p[1], POCKET_HX, POCKET_HY) - BOSS_D / 2];
min_boss_wall_margin   = min(boss_wall_margins);
min_boss_pocket_margin = min(boss_pocket_margins);
port_half_y      = PORT_W / 2; // ポートのY方向半幅 = 7
port_boss_margin = (BOSS_Y - BOSS_D / 2) - port_half_y; // ポート端〜ボス内縁のYギャップ
tie_pocket_margin = (TIE_X - TIE_HOLE_D / 2) - POCKET_HX; // 結束バンド穴内縁〜ポケット端のXギャップ
plug_clearance    = INNER_L / 2 - POCKET_HX; // ポケット+X端(42)〜内壁+X端(55)のmicro USBプラグ逃げ

echo(str("=== 寸法チェック ==="));
echo(str("body 外形 = ", CASE_L, " x ", CASE_W, " mm（コーナー半径 ", CORNER_R, "mm）"));
echo(str("body 内側キャビティ = ", INNER_L, " x ", INNER_W, " mm（内側コーナー半径 ", INNER_R, "mm）"));
echo(str("ブレッドボードポケット = ", BB_POCKET_W, " x ", BB_POCKET_D, " mm（隅 (", POCKET_HX, ",", POCKET_HY, ")）"));
echo(str("ポケット隅の内壁までの余裕 = ", pocket_corner_margin, " mm（要 > 0）"));
echo(str("ポケット+X端(", POCKET_HX, ")〜内壁+X端(", INNER_L / 2, ")のmicro USBプラグ逃げ = ", plug_clearance, " mm"));
echo(str("ネジボス(±", BOSS_X, ",±", BOSS_Y, ")の内壁までの最小余裕 = ", min_boss_wall_margin, " mm（要 > 0）"));
echo(str("ネジボスのポケットまでの最小余裕 = ", min_boss_pocket_margin, " mm（要 > 0）"));
echo(str("ケーブルポート(|y|<=", port_half_y, ")とボス(|y|=", BOSS_Y, ")のYギャップ = ", port_boss_margin, " mm（要 > 0）"));
echo(str("結束バンド穴(x=", TIE_X, ")のポケットまでのXギャップ = ", tie_pocket_margin, " mm（要 > 0）"));
echo(str("body 内部の使用可能高さ（床上面〜リム上端） = ", BODY_H - FLOOR, " mm"));
echo(str("蓋パネル下面〜リップ先端までの突き出し = ", LID_LIP_H, " mm"));
echo(str("中央部（リップの無い領域）の実質クリアハイト = ", BODY_H - FLOOR, " mm （ブレッドボード+Pico積み上げ ", BB_GHOST_H + PICO_PIN_H, " mm に対し十分な余裕）"));
echo(str("組み立て後の総高さ（body + lidパネル厚） = ", BODY_H + LID_T, " mm （上限60mm以内）"));

assert(pocket_corner_margin > 0, "ブレッドボードポケットの隅がbody内側キャビティからはみ出している！CORNER_R/WALL/BB_*を見直すこと");
assert(min_boss_wall_margin > 0, "ネジボスが内壁からはみ出している（body外壁と干渉）！BOSS_X/BOSS_Y/BOSS_Dを見直すこと");
assert(min_boss_pocket_margin > 0, "ネジボスがブレッドボードポケットと干渉している！BOSS_X/BOSS_Y/BOSS_Dを見直すこと");
assert(port_boss_margin > 0, "ケーブルポートがネジボスと干渉している！PORT_W/BOSS_Yを見直すこと");
assert(tie_pocket_margin > 0, "結束バンド穴がブレッドボードポケットと干渉している！TIE_INSET/TIE_HOLE_Dを見直すこと");
assert(BODY_H + LID_T <= 60, "総高さが60mmを超えている！BODY_Hを見直すこと");

// ----------------------------------------------------------------------------
// 共通モジュール
// ----------------------------------------------------------------------------

// 小判型（角丸長方形）の2D形状。半径rの円4個を長方形の4隅に置いてhullを取ることで、
// 「半幅(l/2-r, w/2-r)の矩形」と「半径rの円」のミンコフスキー和＝角丸長方形を得る。
// offset()によるCGALオフセットより高速・頑健なため、この方式を採用。
module oblong2d(l, w, r) {
    hx = l / 2 - r;
    hy = w / 2 - r;
    hull() {
        for (sx = [-1, 1])
            for (sy = [-1, 1])
                translate([sx * hx, sy * hy])
                    circle(r = r);
    }
}

// body の外殻（面取り込みの角丸長方形柱）
// エレファントフット面取り: 円筒版では cylinder(r1,r2) で45°テーパーの円錐台を直接
// 作れたが、角丸長方形にはその機能が無い。minkowski()は低速なので、代わりに
// 「内側にCHAMFER_H分オフセットした断面(薄いスラブ)」と「通常断面(薄いスラブ)」を
// 異なる高さに置いてhull()を取ることで同等のテーパーを得る（凸形状同士のhullなので
// 途中の断面も線形補間された正しい形状になる）。
module outer_shell() {
    e = 0.01; // hull用の極薄スラブ厚み
    union() {
        hull() {
            linear_extrude(height = e)
                oblong2d(CASE_L - 2 * CHAMFER_H, CASE_W - 2 * CHAMFER_H, CORNER_R - CHAMFER_H);
            translate([0, 0, CHAMFER_H - e])
                linear_extrude(height = e)
                    oblong2d(CASE_L, CASE_W, CORNER_R);
        }
        translate([0, 0, CHAMFER_H])
            linear_extrude(height = BODY_H - CHAMFER_H)
                oblong2d(CASE_L, CASE_W, CORNER_R);
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
    for (sx = [-1, 1]) {
        for (sy = [-1, 1]) {
            translate([sx * POCKET_HX, sy * POCKET_HY, FLOOR])
                mirror([sx < 0 ? 1 : 0, 0, 0])
                    mirror([0, sy < 0 ? 1 : 0, 0])
                        corner_rib();
        }
    }
}

// 側面ケーブルポートの切削用ソリッド（角丸スロット、+X端壁を貫通）
module cable_port_cutter() {
    r = PORT_H / 2;
    span = max(PORT_W - PORT_H, 0);
    depth = CASE_L / 2 + 5; // 中心から+X外壁を確実に貫通する長さ
    translate([0, 0, PORT_Z + r])
        hull() {
            for (sy = [-span / 2, span / 2])
                translate([0, sy, 0])
                    rotate([0, 90, 0])
                        cylinder(h = depth, r = r);
        }
}

// 結束バンド用の穴2つ（ケーブルポートのすぐ内側、床を貫通）
module strain_relief_holes() {
    for (sy = [-TIE_HOLE_GAP / 2, TIE_HOLE_GAP / 2])
        translate([TIE_X, sy, -1])
            cylinder(h = FLOOR + 2, r = TIE_HOLE_D / 2);
}

// 蓋固定ボス（1本）。床（FLOOR厚みのスラブ）に融合し、上からM3タッピングビス用下穴をあける。
// ボスは内壁面には接していないが（min_boss_wall_marginのechoを参照）、床スラブが
// ボス・側壁・コーナーリブ全てを底面で一体化しているため強度上問題ない。
module boss(x, y) {
    h = BOSS_TOP_Z - FLOOR;
    translate([x, y, FLOOR])
        difference() {
            cylinder(h = h, r = BOSS_D / 2);
            translate([0, 0, h - BOSS_PILOT_DEPTH])
                cylinder(h = BOSS_PILOT_DEPTH + 1, r = BOSS_PILOT_D / 2);
        }
}

module all_bosses() {
    for (p = BOSS_POS) boss(p[0], p[1]);
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
                    linear_extrude(height = BODY_H)
                        oblong2d(INNER_L, INNER_W, INNER_R);
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
            // 位置決めリップ（内側キャビティを0.2mmずつ内側オフセットした角丸長方形）
            linear_extrude(height = LID_LIP_H)
                oblong2d(LID_LIP_L, LID_LIP_W, LID_LIP_R);
            // パネル本体（外形と同じ角丸長方形）
            translate([0, 0, LID_LIP_H])
                linear_extrude(height = LID_T)
                    oblong2d(CASE_L, CASE_W, CORNER_R);
        }

        // エンコーダーブッシュ通し穴（ケース中心、全高貫通）
        translate([0, 0, -1])
            cylinder(h = LID_LIP_H + LID_T + 2, r = BUSHING_HOLE_D / 2);

        // 回り止めタブスロット
        if (TAB_SLOT_ENABLE) {
            rotate([0, 0, TAB_SLOT_ANGLE])
                translate([TAB_SLOT_OFFSET, 0, -1])
                    cube([TAB_SLOT_W, TAB_SLOT_H, LID_LIP_H + LID_T + 2], center = true);
        }

        // M3通し穴＋皿もみ（body側ボスと同じ4箇所に配置）
        for (p = BOSS_POS) {
            translate([p[0], p[1], -1])
                cylinder(h = LID_LIP_H + LID_T + 2, r = SCREW_THRU_D / 2);
            // 皿もみは外側（パネル上面 = ノブ側）から
            translate([p[0], p[1], LID_LIP_H + LID_T - CSK_DEPTH])
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

    // ゴースト: ノブ（lid上面よりさらに上、ケース中心）
    %translate([0, 0, BODY_H - LID_LIP_H + EXPLODE_Z + LID_LIP_H + LID_T])
        cylinder(h = KNOB_H, r = KNOB_D / 2);

    // ゴースト: ブレッドボード（床の上、中心に位置決め）
    %translate([-BB_W / 2, -BB_D / 2, FLOOR])
        cube([BB_W, BB_D, BB_GHOST_H]);

    // ゴースト: Pico W（ブレッドボードの+X端＝ケーブルポート側に挿す想定。
    // エンコーダー本体・配線がケース中心真下に垂れるため、Pico Wをそこから
    // 離してポート側に寄せることで干渉を避ける）
    pico_x0 = BB_W / 2 - PICO_EDGE_GAP - PICO_W;
    %translate([pico_x0, -PICO_D / 2, FLOOR + BB_GHOST_H + PICO_PIN_H])
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
    // 角丸長方形はX軸・Y軸ともに左右対称な形状なので、180°反転してもXY輪郭は変わらない。
    translate([0, 0, LID_LIP_H + LID_T])
        rotate([180, 0, 0])
            lid();
} else if (PART == "assembly") {
    assembly();
} else {
    echo(str("不明な PART: ", PART, " — \"body\" / \"lid\" / \"assembly\" のいずれかを指定してください"));
}
