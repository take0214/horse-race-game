// ===== うまレース ゲーム設定 =====

// --- レース ---
// コースの全長（ワールド座標単位）
const RACE_LENGTH = 4000;
// 画面に同時に表示されるコースの長さ（ワールド座標単位）
const VISIBLE_RANGE = 700;
// カメラが先頭馬を画面上からこの割合の位置に表示する（0=上端, 1=下端）
const CAMERA_LEADER_POSITION = 0.32;
// カメラ追従の滑らかさ（0〜1、値が小さいほど滑らか）
const CAMERA_LERP = 0.045;

// --- キャンバス ---
// キャンバス幅（ピクセル）
const CANVAS_WIDTH = 480;
// キャンバス高さ（ピクセル）
const CANVAS_HEIGHT = 740;
// トラックの左右パディング（ピクセル）
const TRACK_PAD = 24;
// トラック表示域の下端Y座標（ピクセル）
const TRACK_BOTTOM_Y = 680;
// トラック表示域の上端Y座標（ピクセル）
const TRACK_TOP_Y = 90;

// --- タイミング ---
// カウントダウンの長さ（フレーム数 / 60fps基準）
const COUNTDOWN_FRAMES = 210;
// ゲーム開始後、最初のイベントが発生するまでの遅延（フレーム）
const FIRST_EVENT_DELAY = 200;
// イベントのクールタイム最小値（フレーム）
const EVENT_COOLDOWN_MIN = 85;
// イベントのクールタイム最大値（フレーム）
const EVENT_COOLDOWN_MAX = 145;

// --- プレイヤー ---
// 馬の名前の最大文字数
const NAME_MAX_LENGTH = 5;
// 最小プレイ人数
const MIN_PLAYERS = 2;
// 最大プレイ人数
const MAX_PLAYERS = 8;

// --- 馬のスピード ---
// 基本速度の最小値（ユニット/フレーム）
const BASE_SPEED_MIN = 1.5;
// 基本速度の最大値（ユニット/フレーム）
const BASE_SPEED_MAX = 2.0;
// フレームごとの速度ノイズ乗数の最小値
const SPEED_NOISE_MIN = 0.72;
// フレームごとの速度ノイズ乗数の最大値
const SPEED_NOISE_MAX = 1.28;

// --- イベント: ターボ ---
// ターボブーストの速度倍率
const TURBO_SPEED_MUL = 1.85;
// ターボブーストの持続フレーム数
const TURBO_DURATION = 100;

// --- イベント: バナナ ---
// バナナ転倒時の速度倍率（減速）
const BANANA_SPEED_MUL = 0.35;
// バナナ転倒の持続フレーム数
const BANANA_DURATION = 95;

// --- イベント: 💩 ---
// 落とし物による減速倍率
const POOP_SPEED_MUL = 0.5;
// 落とし物の持続フレーム数
const POOP_DURATION = 100;

// --- イベント: ロケット（最下位救済） ---
// ロケットブーストの速度倍率
const ROCKET_SPEED_MUL = 2.5;
// ロケットブーストの持続フレーム数
const ROCKET_DURATION = 110;

// --- イベント: 追い風 ---
// 追い風による速度倍率（全員に適用）
const WIND_SPEED_MUL = 1.45;
// 追い風の持続フレーム数
const WIND_DURATION = 90;

// --- イベント: スタン持続フレーム数 ---
// 稲妻によるスタン持続フレーム数
const LIGHTNING_STUN_DURATION = 65;
// 居眠りによるスタン持続フレーム数
const SLEEP_STUN_DURATION = 82;
// ヘビ（先頭馬攻撃）によるスタン持続フレーム数
const SNAKE_STUN_DURATION = 60;

// --- イベント: 酔っ払い ---
// 酔い状態の速度倍率最小値（負の値 = 後退）
const DRUNK_SPEED_MIN = -0.4;
// 酔い状態の速度倍率最大値
const DRUNK_SPEED_MAX = 2.8;
// 酔い状態の持続フレーム数
const DRUNK_DURATION = 160;

// --- イベント: ワープ ---
// 隕石ヒット時の後退量（ワールド単位、負の値）
const METEOR_WARP_AMOUNT = -180;
// 前方ワープの移動量（ワールド単位）
const WARP_FORWARD_AMOUNT = 130;

// --- 履歴 ---
// sessionStorageに保存するレース結果の最大件数
const HISTORY_MAX_ENTRIES = 30;
// 履歴データのsessionStorageキー
const HISTORY_STORAGE_KEY = 'raceHistory';
// プレイヤー名のsessionStorageキープレフィックス
const NAME_STORAGE_KEY = 'playerName_';
