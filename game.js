'use strict';

// ===== Viewport =====
function adjustViewport() {
    const app = document.getElementById('app');
    if (!app) return;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
    app.style.height = vw < 768 ? `${vh}px` : '100vh';
    app.style.maxHeight = vw < 768 ? `${vh}px` : '860px';
}
adjustViewport();
window.addEventListener('resize', adjustViewport);
if (window.visualViewport) window.visualViewport.addEventListener('resize', adjustViewport);

// ===== Horse Data =====
const HORSE_COLORS = [
    '#E53935', '#FB8C00', '#FDD835', '#43A047',
    '#29B6F6', '#3949AB', '#8E24AA', '#EC407A',
];
const DEFAULT_NAMES = [
    'アカ', 'オレンジ', 'キイロ', 'ミドリ',
    'ソラ', 'コンドル', 'ムラサキ', 'モモハナ',
];

// ===== State =====
const state = {
    screen: 'setup',
    playerCount: 4,
    players: [],
    raceTime: 0,
    countdown: 0,
    eventCooldown: 0,
    activeEvent: null,
    rankings: [],
    finishedCount: 0,
    raceEnded: false,
    camProgress: -100,
    particles: [],
};

// ===== DOM =====
const setupScreen    = document.getElementById('setupScreen');
const raceScreen     = document.getElementById('raceScreen');
const resultScreen   = document.getElementById('resultScreen');
const historyScreen  = document.getElementById('historyScreen');
const playerCountSlider  = document.getElementById('playerCount');
const playerCountDisplay = document.getElementById('playerCountDisplay');
const playerListEl   = document.getElementById('playerList');
const startBtn       = document.getElementById('startBtn');
const restartBtn     = document.getElementById('restartBtn');
const historyBtn     = document.getElementById('historyBtn');
const backFromHistoryBtn = document.getElementById('backFromHistoryBtn');
const eventBanner    = document.getElementById('eventBanner');
const rankingPanel   = document.getElementById('rankingPanel');

// ===== Name Persistence =====
function getSavedName(idx) {
    return sessionStorage.getItem(NAME_STORAGE_KEY + idx) || DEFAULT_NAMES[idx];
}
function saveName(idx, val) {
    sessionStorage.setItem(NAME_STORAGE_KEY + idx, val || DEFAULT_NAMES[idx]);
}

// ===== Setup Screen =====
playerCountSlider.addEventListener('input', e => {
    state.playerCount = parseInt(e.target.value);
    playerCountDisplay.textContent = state.playerCount;
    renderPlayerList();
});

function renderPlayerList() {
    playerListEl.innerHTML = '';
    for (let i = 0; i < state.playerCount; i++) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.style.borderColor = HORSE_COLORS[i];
        card.innerHTML = `
            <div class="horse-icon" style="background:${HORSE_COLORS[i]}">🐴</div>
            <input type="text" value="${getSavedName(i)}" maxlength="${NAME_MAX_LENGTH}" data-index="${i}" placeholder="名前">
        `;
        playerListEl.appendChild(card);
    }
    playerListEl.querySelectorAll('input').forEach((input, i) => {
        input.addEventListener('input', () => saveName(i, input.value.trim()));
    });
}
renderPlayerList();

startBtn.addEventListener('click', () => { initRace(); showScreen('race'); });
restartBtn.addEventListener('click', () => showScreen('setup'));
historyBtn.addEventListener('click', () => { renderHistory(); showScreen('history'); });
backFromHistoryBtn.addEventListener('click', () => showScreen('setup'));

function showScreen(name) {
    state.screen = name;
    [setupScreen, raceScreen, resultScreen, historyScreen].forEach(s => s.classList.remove('active'));
    ({ setup: setupScreen, race: raceScreen, result: resultScreen, history: historyScreen })[name]
        .classList.add('active');
}

// ===== Canvas =====
const canvas = document.getElementById('raceCanvas');
canvas.width  = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const ctx = canvas.getContext('2d');

// Derived track constants
const TRACK_PIXEL_HEIGHT = TRACK_BOTTOM_Y - TRACK_TOP_Y;

// ===== Coordinate Helpers =====
function worldToScreenY(progress) {
    return TRACK_BOTTOM_Y - (progress - state.camProgress) / VISIBLE_RANGE * TRACK_PIXEL_HEIGHT;
}
function getLaneX(id) {
    const laneW = (CANVAS_WIDTH - TRACK_PAD * 2) / state.playerCount;
    return TRACK_PAD + (id + 0.5) * laneW;
}

// ===== Race Init =====
function initRace() {
    state.players      = [];
    state.raceTime     = 0;
    state.countdown    = COUNTDOWN_FRAMES;
    state.eventCooldown = FIRST_EVENT_DELAY;
    state.activeEvent  = null;
    state.rankings     = [];
    state.finishedCount = 0;
    state.raceEnded    = false;
    state.camProgress  = -100;
    state.particles    = [];

    const inputs = playerListEl.querySelectorAll('input');
    for (let i = 0; i < state.playerCount; i++) {
        const rawName = (inputs[i]?.value || getSavedName(i)).trim();
        state.players.push({
            id: i,
            name: (rawName || DEFAULT_NAMES[i]).slice(0, NAME_MAX_LENGTH),
            color: HORSE_COLORS[i],
            progress: 0,
            baseSpeed: BASE_SPEED_MIN + Math.random() * (BASE_SPEED_MAX - BASE_SPEED_MIN),
            statusEffects: [],
            finished: false,
            finishTime: 0,
            rank: 0,
        });
    }
}

// ===== Events =====
// impact: 'negative' = 対象に不利, 'positive' = 対象に有利 (target:'random' のときの重み付けに使用)
const EVENT_TYPES = [
    { id: 'lightning', emoji: '⚡', name: '稲妻が直撃！',      target: 'random', impact: 'negative', duration: LIGHTNING_STUN_DURATION, effect: 'stun' },
    { id: 'turbo',     emoji: '💨', name: 'ターボ発動！',      target: 'random', impact: 'positive', duration: TURBO_DURATION,          effect: 'speed', mul: TURBO_SPEED_MUL },
    { id: 'banana',    emoji: '🍌', name: 'バナナで転倒！',    target: 'random', impact: 'negative', duration: BANANA_DURATION,         effect: 'speed', mul: BANANA_SPEED_MUL },
    { id: 'sleep',     emoji: '😴', name: '居眠り発動…',      target: 'random', impact: 'negative', duration: SLEEP_STUN_DURATION,     effect: 'stun' },
    { id: 'drunk',     emoji: '🍺', name: '酔っぱらいフラフラ',target: 'random', impact: 'negative', duration: DRUNK_DURATION,          effect: 'drunk' },
    { id: 'rocket',    emoji: '🚀', name: 'ビリ救済ロケット！',target: 'last',                       duration: ROCKET_DURATION,         effect: 'speed', mul: ROCKET_SPEED_MUL },
    { id: 'snake',     emoji: '🐍', name: '先頭にヘビ出現！',  target: 'first',                      duration: SNAKE_STUN_DURATION,     effect: 'stun' },
    { id: 'wind',      emoji: '🌪️', name: '追い風！全員加速！',target: 'all',                        duration: WIND_DURATION,           effect: 'speed', mul: WIND_SPEED_MUL },
    { id: 'meteor',    emoji: '☄️', name: '隕石直撃で後退！',  target: 'random', impact: 'negative', duration: 1,                       effect: 'warp',  amount: METEOR_WARP_AMOUNT },
    { id: 'warp',      emoji: '✨', name: 'ワープゾーン！',    target: 'random', impact: 'positive', duration: 1,                       effect: 'warp',  amount: WARP_FORWARD_AMOUNT },
    { id: 'poop',      emoji: '💩', name: '落とし物で減速…',  target: 'random', impact: 'negative', duration: POOP_DURATION,           effect: 'speed', mul: POOP_SPEED_MUL },
];

// 順位に基づいた重み付きランダム選択
// isNegative=true のとき上位馬ほど選ばれやすく、false のとき下位馬ほど選ばれやすい
function getWeightedTarget(horses, isNegative) {
    const ranked = [...horses].sort((a, b) => b.progress - a.progress);
    const n = ranked.length;
    const weights = ranked.map((_, i) => {
        const pos = i + 1; // 1=先頭, n=最下位
        return isNegative
            ? Math.pow(n + 1 - pos, RANK_WEIGHT_EXPONENT) // 先頭ほど大きい
            : Math.pow(pos, RANK_WEIGHT_EXPONENT);         // 最下位ほど大きい
    });
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < ranked.length; i++) {
        r -= weights[i];
        if (r <= 0) return ranked[i];
    }
    return ranked[ranked.length - 1];
}

function triggerEvent() {
    const alive = state.players.filter(p => !p.finished);
    if (!alive.length) return;

    const ev = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
    let targets;
    if      (ev.target === 'random') targets = [getWeightedTarget(alive, ev.impact === 'negative')];
    else if (ev.target === 'all')    targets = alive;
    else if (ev.target === 'last')   targets = [[...alive].sort((a, b) => a.progress - b.progress)[0]];
    else if (ev.target === 'first')  targets = [[...alive].sort((a, b) => b.progress - a.progress)[0]];

    for (const t of targets) {
        const sx = getLaneX(t.id);
        const sy = worldToScreenY(t.progress);
        if (ev.effect === 'warp') {
            t.progress = Math.max(0, Math.min(RACE_LENGTH, t.progress + ev.amount));
            spawnParticles(sx, sy, ev.id === 'meteor' ? 'meteor' : 'warp');
        } else {
            t.statusEffects.push({ type: ev.effect, duration: ev.duration, mul: ev.mul || 1 });
            spawnParticles(sx, sy, ev.effect === 'stun' ? 'stun' : ev.id === 'drunk' ? 'drunk' : 'boost');
        }
    }

    const targetText = targets.length > 2 ? '全員' : targets.map(t => t.name).join('・');
    state.activeEvent = { emoji: ev.emoji, name: ev.name, targets: targetText, timer: 110 };
    eventBanner.innerHTML = `${ev.emoji} ${ev.name}<br><small>${targetText}</small>`;
    eventBanner.classList.add('show');
}

// ===== Particles =====
const PARTICLE_CONFIGS = {
    stun:   { colors: ['#FFD700', '#FF9800', '#FF5722', '#FFF59D'], count: 12, speed: 2.8, size: 5 },
    boost:  { colors: ['#E3F2FD', '#64B5F6', '#00BCD4', '#fff'],    count: 14, speed: 3.2, size: 4 },
    drunk:  { colors: ['#CE93D8', '#E91E63', '#FF5722', '#4CAF50'], count: 9,  speed: 2.0, size: 5 },
    meteor: { colors: ['#FF6B6B', '#FF5722', '#FFAB40', '#FFF'],    count: 18, speed: 4.5, size: 7 },
    warp:   { colors: ['#B39DDB', '#7C4DFF', '#EA80FC', '#E8EAF6'], count: 14, speed: 3.2, size: 5 },
};

function spawnParticles(x, y, type) {
    const cfg = PARTICLE_CONFIGS[type] || PARTICLE_CONFIGS.stun;
    for (let i = 0; i < cfg.count; i++) {
        const angle = (Math.PI * 2 * i / cfg.count) + (Math.random() - 0.5) * 0.8;
        const spd = cfg.speed * (0.6 + Math.random() * 0.8);
        state.particles.push({
            x, y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd - 1.5,
            life: 45 + Math.random() * 30,
            maxLife: 75,
            color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
            size: cfg.size * (0.6 + Math.random() * 0.7),
        });
    }
    // Burst ring for impact events
    if (type === 'meteor' || type === 'stun') {
        state.particles.push({ x, y, vx: 0, vy: 0, life: 20, maxLife: 20, color: '#FFD700', size: 20, ring: true });
    }
}

function updateParticles() {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        if (!p.ring) { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.vx *= 0.96; }
        p.life--;
        if (p.life <= 0) state.particles.splice(i, 1);
    }
}

function drawParticles() {
    for (const p of state.particles) {
        const alpha = p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        if (p.ring) {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 - alpha) * 3, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// ===== Camera =====
function updateCamera() {
    const pool = state.players.filter(p => !p.finished);
    const leader = (pool.length ? pool : state.players)
        .reduce((a, b) => a.progress > b.progress ? a : b);
    const target = leader.progress - VISIBLE_RANGE * (1 - CAMERA_LEADER_POSITION);
    state.camProgress += (target - state.camProgress) * CAMERA_LERP;
}

// ===== Update Race =====
function updateRace() {
    if (state.countdown > 0) { state.countdown--; return; }
    state.raceTime++;

    for (const p of state.players) {
        if (p.finished) continue;

        let speedMul = 1, isStunned = false, isDrunk = false;
        for (let i = p.statusEffects.length - 1; i >= 0; i--) {
            const fx = p.statusEffects[i];
            fx.duration--;
            if (fx.type === 'stun')  isStunned = true;
            if (fx.type === 'speed') speedMul *= fx.mul;
            if (fx.type === 'drunk') isDrunk = true;
            if (fx.duration <= 0)    p.statusEffects.splice(i, 1);
        }

        let delta;
        if (isStunned) {
            delta = 0;
        } else if (isDrunk) {
            delta = p.baseSpeed * (DRUNK_SPEED_MIN + Math.random() * (DRUNK_SPEED_MAX - DRUNK_SPEED_MIN));
        } else {
            const noise = SPEED_NOISE_MIN + Math.random() * (SPEED_NOISE_MAX - SPEED_NOISE_MIN);
            delta = p.baseSpeed * speedMul * noise;
        }

        p.progress += delta;
        if (p.progress < 0) p.progress = 0;
        if (p.progress >= RACE_LENGTH) {
            p.progress = RACE_LENGTH;
            p.finished = true;
            state.finishedCount++;
            p.rank = state.finishedCount;
        }
    }

    updateCamera();
    updateParticles();

    if (state.activeEvent) {
        state.activeEvent.timer--;
        if (state.activeEvent.timer <= 0) { state.activeEvent = null; eventBanner.classList.remove('show'); }
    }

    state.eventCooldown--;
    if (state.eventCooldown <= 0 && state.finishedCount < state.players.length) {
        triggerEvent();
        state.eventCooldown = EVENT_COOLDOWN_MIN + Math.floor(Math.random() * (EVENT_COOLDOWN_MAX - EVENT_COOLDOWN_MIN));
    }

    if (!state.raceEnded && state.finishedCount >= state.players.length) {
        state.raceEnded = true;
        eventBanner.classList.remove('show');
        setTimeout(finishRace, 700);
    }
}

// ===== Draw Track =====
function drawTrack() {
    // Grass
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bg.addColorStop(0, '#1B5E20'); bg.addColorStop(1, '#2E7D32');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Dirt track
    const tL = TRACK_PAD, tR = CANVAS_WIDTH - TRACK_PAD, tW = tR - tL;
    const dirt = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    dirt.addColorStop(0, '#8D6E63'); dirt.addColorStop(1, '#6D4C41');
    ctx.fillStyle = dirt;
    ctx.fillRect(tL, TRACK_TOP_Y - 20, tW, CANVAS_HEIGHT - (TRACK_TOP_Y - 20));

    // Lane dividers
    const laneW = tW / state.playerCount;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 8]);
    for (let i = 1; i < state.playerCount; i++) {
        const lx = tL + i * laneW;
        ctx.beginPath(); ctx.moveTo(lx, TRACK_TOP_Y - 20); ctx.lineTo(lx, CANVAS_HEIGHT); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Distance markers
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.setLineDash([4, 5]);
    for (let p = 500; p < RACE_LENGTH; p += 500) {
        const my = worldToScreenY(p);
        if (my > TRACK_TOP_Y && my < TRACK_BOTTOM_Y) {
            ctx.beginPath(); ctx.moveTo(tL, my); ctx.lineTo(tR - 14, my); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${p}m`, tR - 16, my - 2);
        }
    }
    ctx.setLineDash([]);

    // Start line
    const sy = worldToScreenY(0);
    if (sy > TRACK_TOP_Y - 10 && sy < CANVAS_HEIGHT + 10) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(tL, sy, tW, 4);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('START', tL + 4, sy - 5);
    }

    // Finish line
    const fy = worldToScreenY(RACE_LENGTH);
    if (fy > TRACK_TOP_Y - 20 && fy < CANVAS_HEIGHT) {
        drawCheckered(tL, fy - 12, tW, 12);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🏁 FINISH 🏁', CANVAS_WIDTH / 2, fy - 16);
    }

    drawProgressBar();
}

function drawCheckered(x, y, w, h) {
    const sq = 8;
    for (let i = 0; i * sq < w; i++)
        for (let j = 0; j * sq < h; j++) {
            ctx.fillStyle = (i + j) % 2 === 0 ? '#FFF' : '#212121';
            ctx.fillRect(x + i * sq, y + j * sq, Math.min(sq, w - i * sq), Math.min(sq, h - j * sq));
        }
}

function drawProgressBar() {
    const bx = CANVAS_WIDTH - 14, by = TRACK_TOP_Y, bh = TRACK_PIXEL_HEIGHT;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(bx, by, 8, bh);
    // Finish marker
    ctx.fillStyle = '#FFD700'; ctx.fillRect(bx, by, 8, 3);
    // Start marker
    ctx.fillStyle = '#fff'; ctx.fillRect(bx, by + bh - 3, 8, 3);
    // Horse dots
    for (const p of state.players) {
        const t = p.progress / RACE_LENGTH;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(bx + 4, by + bh - t * bh, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ===== Draw Horse =====
function drawHorse(p, frame) {
    const x = getLaneX(p.id);
    const y = worldToScreenY(p.progress);

    // Off-screen indicator
    if (y > CANVAS_HEIGHT + 60 || y < TRACK_TOP_Y - 60) {
        if (y > CANVAS_HEIGHT + 60) {
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.85;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`▼ ${p.name}`, x, CANVAS_HEIGHT - 70);
            ctx.restore();
        }
        return;
    }

    const isStunned = p.statusEffects.some(e => e.type === 'stun');
    const isBoost   = p.statusEffects.some(e => e.type === 'speed' && e.mul > 1.3);
    const isDrunk   = p.statusEffects.some(e => e.type === 'drunk');
    const wobble    = isDrunk ? Math.sin(frame * 0.3) * 5 : 0;

    ctx.save();
    ctx.translate(x + wobble, y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 18, 13, 4, 0, 0, Math.PI * 2); ctx.fill();

    // Boost lines
    if (isBoost) {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 2;
        for (let side = -1; side <= 1; side += 2) {
            const off = (frame * 3) % 14;
            ctx.beginPath(); ctx.moveTo(side * 13, 6 + off); ctx.lineTo(side * 13, 20 + off); ctx.stroke();
        }
    }

    // Body
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(-3, -3, 5, 8, 0, 0, Math.PI * 2); ctx.fill();

    // Mane
    ctx.fillStyle = '#3E2723'; ctx.fillRect(-7, -16, 14, 5);

    // Head
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.ellipse(0, -22, 6, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFCDD2';
    ctx.beginPath(); ctx.ellipse(0, -25, 3, 3, 0, 0, Math.PI * 2); ctx.fill();

    // Ears
    ctx.fillStyle = p.color;
    [[- 4, -26, -6, -31, -2, -27], [4, -26, 6, -31, 2, -27]].forEach(([x1, y1, x2, y2, x3, y3]) => {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    });

    // Tail
    ctx.fillStyle = '#3E2723'; ctx.fillRect(-2, 14, 4, 9);

    // Legs
    const legPhase = isStunned ? 2 : Math.floor(frame / 4) % 2;
    ctx.fillStyle = '#3E2723';
    if      (legPhase === 0) { ctx.fillRect(-11,-6,4,8); ctx.fillRect(7,4,4,8); ctx.fillRect(-11,4,3,6); ctx.fillRect(8,-6,3,6); }
    else if (legPhase === 1) { ctx.fillRect(7,-6,4,8); ctx.fillRect(-11,4,4,8); ctx.fillRect(8,4,3,6);  ctx.fillRect(-11,-6,3,6); }
    else                     { ctx.fillRect(-11,-6,3,8); ctx.fillRect(8,-6,3,8); ctx.fillRect(-11,4,3,8); ctx.fillRect(8,4,3,8); }

    // Jockey
    ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(0,-8,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#FFCC80'; ctx.beginPath(); ctx.arc(0,-12,3,0,Math.PI*2); ctx.fill();

    ctx.restore();

    // Status icon
    if      (isStunned) drawStatusIcon(x + 15, y - 10, '😵', frame);
    else if (isBoost)   drawStatusIcon(x + 15, y - 10, '💨', frame);
    else if (isDrunk)   drawStatusIcon(x + 15, y - 10, '🍺', frame);

    // Name label
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
    ctx.strokeText(p.name, x, y - 32);
    ctx.fillStyle = '#fff'; ctx.fillText(p.name, x, y - 32);

    // Finish badge
    if (p.finished) {
        ctx.font = 'bold 13px sans-serif';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.strokeText(`${p.rank}位!`, x, y + 34);
        ctx.fillStyle = '#FFD700'; ctx.fillText(`${p.rank}位!`, x, y + 34);
    }
}

function drawStatusIcon(x, y, emoji, frame) {
    const bob = Math.sin(frame * 0.2) * 2;
    ctx.save();
    ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y + bob);
    ctx.restore();
}

// ===== Countdown =====
function drawCountdown() {
    if (state.countdown <= 0) return;
    const remaining = state.countdown - 30;
    const sec = Math.ceil(remaining / 60);
    const text = remaining <= 0 ? 'GO!' : String(sec);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    ctx.fillStyle = text === 'GO!' ? '#FFD54F' : '#FFF';
    ctx.strokeStyle = '#212121'; ctx.lineWidth = 6;
    ctx.font = 'bold 130px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const scale = 1 + Math.max(0, 60 - state.countdown % 60) / 200;
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.scale(scale, scale);
    ctx.strokeText(text, 0, 0); ctx.fillText(text, 0, 0);
    ctx.restore();
}

// ===== Live Ranking =====
let lastRankFrame = 0;
function updateLiveRanking(frame) {
    if (frame - lastRankFrame < 6) return;
    lastRankFrame = frame;

    const sorted = [...state.players].sort((a, b) => {
        if (a.finished && b.finished) return a.rank - b.rank;
        if (a.finished) return -1; if (b.finished) return 1;
        return b.progress - a.progress;
    });
    rankingPanel.innerHTML = sorted.map((p, i) => {
        const label = p.finished ? `${p.rank}位` : `${i + 1}`;
        const cls   = i === 0 ? 'first' : (i === sorted.length - 1 ? 'last' : '');
        return `<div class="live-rank ${cls}">
            <span class="rank-num">${label}</span>
            <span class="rank-color" style="background:${p.color}"></span>
            <span>${p.name}</span>
        </div>`;
    }).join('');
}

// ===== Rank Badge =====
function getRankBadge(rank) {
    const MEDALS = ['🥇', '🥈', '🥉'];
    if (rank <= 3) return MEDALS[rank - 1];
    const BADGE_COLORS = ['#8D6E63', '#607D8B', '#546E7A', '#455A64', '#37474F'];
    const bg = BADGE_COLORS[rank - 4] || '#37474F';
    return `<span class="rank-badge" style="background:${bg}">${rank}</span>`;
}

// ===== Result Screen =====
function finishRace() {
    state.rankings = [...state.players].sort((a, b) => a.rank - b.rank);
    saveRaceResult();

    const rankingsEl = document.getElementById('rankings');
    rankingsEl.innerHTML = '';
    state.rankings.forEach((p, i) => {
        const isLast = i === state.rankings.length - 1;
        const row = document.createElement('div');
        row.className = 'rank-row' + (isLast ? ' last-place' : '');
        row.innerHTML = `
            <span class="rank-medal">${getRankBadge(p.rank)}</span>
            <span class="rank-color" style="background:${p.color}"></span>
            <span class="rank-name">${p.name}</span>
        `;
        rankingsEl.appendChild(row);
    });

    const last = state.rankings[state.rankings.length - 1];
    document.getElementById('punishment').innerHTML =
        `🍺 罰ゲーム 🍺<br><strong>${last.name}</strong><br>のひとが飲もう！`;

    showScreen('result');
}

// ===== History =====
function saveRaceResult() {
    const entry = {
        date: new Date().toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        results: state.rankings.map(p => ({ name: p.name, rank: p.rank, color: p.color })),
    };
    const history = getHistory();
    history.unshift(entry);
    if (history.length > HISTORY_MAX_ENTRIES) history.splice(HISTORY_MAX_ENTRIES);
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
}

function getHistory() {
    try { return JSON.parse(sessionStorage.getItem(HISTORY_STORAGE_KEY) || '[]'); }
    catch { return []; }
}

function renderHistory() {
    const listEl = document.getElementById('historyList');
    const history = getHistory();
    if (!history.length) {
        listEl.innerHTML = '<div class="history-empty">まだ履歴がありません</div>';
        return;
    }
    listEl.innerHTML = history.map(entry => {
        const last   = entry.results[entry.results.length - 1];
        const rankRows = entry.results.map(r => `
            <div class="history-rank-row">
                <span class="history-badge">${getRankBadge(r.rank)}</span>
                <span class="rank-color" style="background:${r.color}"></span>
                <span>${r.name}</span>
            </div>
        `).join('');
        return `
            <div class="history-entry">
                <div class="history-meta">
                    <span class="history-date">${entry.date}</span>
                    <span class="history-count">${entry.results.length}名</span>
                </div>
                <div class="history-ranks">${rankRows}</div>
                <div class="history-punishment">🍺 罰: <strong>${last.name}</strong></div>
            </div>
        `;
    }).join('');
}

// ===== Main Loop =====
let frameCount = 0;
function loop() {
    frameCount++;
    if (state.screen === 'race') {
        updateRace();
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        drawTrack();
        for (const p of state.players) drawHorse(p, frameCount);
        drawParticles();
        drawCountdown();
        updateLiveRanking(frameCount);
    }
    requestAnimationFrame(loop);
}
loop();
