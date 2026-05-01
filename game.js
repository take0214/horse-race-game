'use strict';

// ===== Viewport Adjustment =====
function adjustViewport() {
    const app = document.getElementById('app');
    if (!app) return;

    // Use visualViewport if available (better for mobile)
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;

    // Set CSS custom properties for dynamic sizing
    document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
    document.documentElement.style.setProperty('--vw', `${vw * 0.01}px`);

    // Adjust app height dynamically
    const isMobile = vw < 768; // Consider mobile if width < 768px
    if (isMobile) {
        app.style.height = `${vh}px`;
        app.style.maxHeight = `${vh}px`;
    } else {
        app.style.height = '100vh';
        app.style.maxHeight = '860px';
    }
}

// Initialize and listen for resize
adjustViewport();
window.addEventListener('resize', adjustViewport);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', adjustViewport);
}

// ===== Configuration =====
const CONFIG = {
    canvasW: 480,
    canvasH: 740,
    raceLength: 1500,
    finishLineY: 90,
    startLineY: 660,
};

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
};

// ===== DOM References =====
const setupScreen = document.getElementById('setupScreen');
const raceScreen = document.getElementById('raceScreen');
const resultScreen = document.getElementById('resultScreen');
const playerCountSlider = document.getElementById('playerCount');
const playerCountDisplay = document.getElementById('playerCountDisplay');
const playerListEl = document.getElementById('playerList');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const eventBanner = document.getElementById('eventBanner');
const rankingPanel = document.getElementById('rankingPanel');

// ===== Setup logic =====
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
            <input type="text" value="${DEFAULT_NAMES[i]}" maxlength="6" data-index="${i}">
        `;
        playerListEl.appendChild(card);
    }
}
renderPlayerList();

startBtn.addEventListener('click', () => {
    initRace();
    showScreen('race');
});

restartBtn.addEventListener('click', () => {
    showScreen('setup');
});

function showScreen(name) {
    state.screen = name;
    [setupScreen, raceScreen, resultScreen].forEach(s => s.classList.remove('active'));
    if (name === 'setup') setupScreen.classList.add('active');
    else if (name === 'race') raceScreen.classList.add('active');
    else if (name === 'result') resultScreen.classList.add('active');
}

// ===== Race Init =====
function initRace() {
    state.players = [];
    state.raceTime = 0;
    state.countdown = 3 * 60 + 30; // 3.5sec countdown
    state.eventCooldown = 180; // first event delay
    state.activeEvent = null;
    state.rankings = [];
    state.finishedCount = 0;

    const inputs = playerListEl.querySelectorAll('input');
    for (let i = 0; i < state.playerCount; i++) {
        const name = (inputs[i].value || DEFAULT_NAMES[i]).trim().slice(0, 6);
        state.players.push({
            id: i,
            name: name,
            color: HORSE_COLORS[i],
            progress: 0,
            baseSpeed: 1.5 + Math.random() * 0.5,
            statusEffects: [],
            finished: false,
            finishTime: 0,
            rank: 0,
        });
    }
}

// ===== Canvas Setup =====
const canvas = document.getElementById('raceCanvas');
canvas.width = CONFIG.canvasW;
canvas.height = CONFIG.canvasH;
const ctx = canvas.getContext('2d');

// ===== Events =====
const EVENT_TYPES = [
    { id: 'lightning', emoji: '⚡', name: '稲妻が直撃！', target: 'random', duration: 70, effect: 'stun' },
    { id: 'turbo',     emoji: '💨', name: 'ターボ発動！', target: 'random', duration: 110, effect: 'speed', mul: 2.2 },
    { id: 'banana',    emoji: '🍌', name: 'バナナで転倒！', target: 'random', duration: 90, effect: 'speed', mul: 0.3 },
    { id: 'sleep',     emoji: '😴', name: '居眠り発動…', target: 'random', duration: 80, effect: 'stun' },
    { id: 'drunk',     emoji: '🍺', name: '酔っぱらいフラフラ', target: 'random', duration: 150, effect: 'drunk' },
    { id: 'rocket',    emoji: '🚀', name: 'ビリ救済ロケット！', target: 'last', duration: 110, effect: 'speed', mul: 2.6 },
    { id: 'snake',     emoji: '🐍', name: '先頭にヘビ出現！', target: 'first', duration: 70, effect: 'stun' },
    { id: 'wind',      emoji: '🌪️', name: '追い風！全員加速！', target: 'all', duration: 90, effect: 'speed', mul: 1.5 },
    { id: 'meteor',    emoji: '☄️', name: '隕石直撃で後退！', target: 'random', duration: 1, effect: 'warp', amount: -120 },
    { id: 'warp',      emoji: '✨', name: 'ワープゾーン！', target: 'random', duration: 1, effect: 'warp', amount: 100 },
    { id: 'poop',      emoji: '💩', name: '落とし物で減速…', target: 'random', duration: 100, effect: 'speed', mul: 0.5 },
];

function triggerEvent() {
    const aliveHorses = state.players.filter(p => !p.finished);
    if (aliveHorses.length === 0) return;

    const ev = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
    let targets = [];

    if (ev.target === 'random') {
        targets = [aliveHorses[Math.floor(Math.random() * aliveHorses.length)]];
    } else if (ev.target === 'all') {
        targets = aliveHorses;
    } else if (ev.target === 'last') {
        const sorted = [...aliveHorses].sort((a, b) => a.progress - b.progress);
        targets = [sorted[0]];
    } else if (ev.target === 'first') {
        const sorted = [...aliveHorses].sort((a, b) => b.progress - a.progress);
        targets = [sorted[0]];
    }

    for (const t of targets) {
        if (ev.effect === 'warp') {
            t.progress = Math.max(0, Math.min(CONFIG.raceLength, t.progress + ev.amount));
        } else {
            t.statusEffects.push({
                type: ev.effect,
                duration: ev.duration,
                mul: ev.mul || 1,
            });
        }
    }

    const targetText = targets.length > 2
        ? '全員'
        : targets.map(t => t.name).join('・');

    state.activeEvent = {
        emoji: ev.emoji,
        name: ev.name,
        targets: targetText,
        timer: 110,
    };
    eventBanner.classList.add('show');
    eventBanner.innerHTML = `${ev.emoji} ${ev.name}<br><small>${targetText}</small>`;
}

// ===== Update =====
function updateRace() {
    if (state.countdown > 0) {
        state.countdown--;
        return;
    }

    state.raceTime++;

    for (const p of state.players) {
        if (p.finished) continue;

        let speedMul = 1;
        let isStunned = false;
        let isDrunk = false;

        for (let i = p.statusEffects.length - 1; i >= 0; i--) {
            const fx = p.statusEffects[i];
            fx.duration--;
            if (fx.type === 'stun') isStunned = true;
            else if (fx.type === 'speed') speedMul *= fx.mul;
            else if (fx.type === 'drunk') isDrunk = true;
            if (fx.duration <= 0) p.statusEffects.splice(i, 1);
        }

        let progressDelta;
        if (isStunned) {
            progressDelta = 0;
        } else if (isDrunk) {
            // Drunk: random speed between -0.5 and +1.5x
            progressDelta = p.baseSpeed * (-0.3 + Math.random() * 1.8);
        } else {
            const noise = 0.7 + Math.random() * 0.6;
            progressDelta = p.baseSpeed * speedMul * noise;
        }

        p.progress += progressDelta;
        if (p.progress < 0) p.progress = 0;

        if (p.progress >= CONFIG.raceLength) {
            p.progress = CONFIG.raceLength;
            p.finished = true;
            state.finishedCount++;
            p.rank = state.finishedCount;
            p.finishTime = state.raceTime;
        }
    }

    if (state.activeEvent) {
        state.activeEvent.timer--;
        if (state.activeEvent.timer <= 0) {
            state.activeEvent = null;
            eventBanner.classList.remove('show');
        }
    }

    state.eventCooldown--;
    if (state.eventCooldown <= 0 && state.finishedCount < state.players.length) {
        triggerEvent();
        state.eventCooldown = 70 + Math.floor(Math.random() * 90);
    }

    if (state.finishedCount >= state.players.length) {
        finishRace();
    }
}

function finishRace() {
    state.rankings = [...state.players].sort((a, b) => a.rank - b.rank);

    const rankingsEl = document.getElementById('rankings');
    rankingsEl.innerHTML = '';
    state.rankings.forEach((p, i) => {
        const isLast = i === state.rankings.length - 1;
        const row = document.createElement('div');
        row.className = 'rank-row' + (isLast ? ' last-place' : '');
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}位`;
        row.innerHTML = `
            <span class="rank-medal">${medal}</span>
            <span class="rank-color" style="background:${p.color}"></span>
            <span class="rank-name">${p.name}</span>
        `;
        rankingsEl.appendChild(row);
    });

    const last = state.rankings[state.rankings.length - 1];
    document.getElementById('punishment').innerHTML =
        `🍺 罰ゲーム 🍺<br><strong>${last.name}</strong><br>のひとが飲もう！`;

    eventBanner.classList.remove('show');
    setTimeout(() => showScreen('result'), 800);
}

// ===== Drawing =====
function getHorseY(progress) {
    const t = progress / CONFIG.raceLength;
    return CONFIG.startLineY - t * (CONFIG.startLineY - CONFIG.finishLineY);
}

function getLaneX(id) {
    const trackPad = 24;
    const trackW = canvas.width - trackPad * 2;
    const laneWidth = trackW / state.playerCount;
    return trackPad + (id + 0.5) * laneWidth;
}

function drawTrack() {
    // Grass on sides
    const grassGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grassGrad.addColorStop(0, '#2E7D32');
    grassGrad.addColorStop(1, '#1B5E20');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Track surface
    const trackPad = 24;
    const trackGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    trackGrad.addColorStop(0, '#A1887F');
    trackGrad.addColorStop(1, '#8D6E63');
    ctx.fillStyle = trackGrad;
    ctx.fillRect(trackPad, 30, canvas.width - trackPad * 2, canvas.height - 60);

    // Lane dividers
    const trackW = canvas.width - trackPad * 2;
    const laneWidth = trackW / state.playerCount;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 8]);
    for (let i = 1; i < state.playerCount; i++) {
        const x = trackPad + i * laneWidth;
        ctx.beginPath();
        ctx.moveTo(x, 30);
        ctx.lineTo(x, canvas.height - 30);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Distance markers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.setLineDash([4, 4]);
    for (let p = 250; p < CONFIG.raceLength; p += 250) {
        const y = getHorseY(p);
        ctx.beginPath();
        ctx.moveTo(trackPad, y);
        ctx.lineTo(canvas.width - trackPad, y);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Start line
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(trackPad, CONFIG.startLineY, canvas.width - trackPad * 2, 4);
    const startFontSize = Math.max(8, Math.min(11, canvas.width / 43));
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${startFontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillText('START', trackPad + 4, CONFIG.startLineY - 4);

    // Finish line (checkered)
    drawCheckered(trackPad, CONFIG.finishLineY - 12, canvas.width - trackPad * 2, 12);
    const finishFontSize = Math.max(10, Math.min(13, canvas.width / 37));
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${finishFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('🏁 FINISH 🏁', canvas.width / 2, CONFIG.finishLineY - 18);
}

function drawCheckered(x, y, w, h) {
    const sq = 8;
    const cols = Math.ceil(w / sq);
    const rows = Math.ceil(h / sq);
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            ctx.fillStyle = (i + j) % 2 === 0 ? '#FFFFFF' : '#212121';
            ctx.fillRect(x + i * sq, y + j * sq, Math.min(sq, w - i * sq), Math.min(sq, h - j * sq));
        }
    }
}

function drawHorse(p, frame) {
    const x = getLaneX(p.id);
    const y = getHorseY(p.progress);

    const isStunned = p.statusEffects.some(e => e.type === 'stun');
    const isBoost = p.statusEffects.some(e => e.type === 'speed' && e.mul > 1.3);
    const isDrunk = p.statusEffects.some(e => e.type === 'drunk');
    const wobble = isDrunk ? Math.sin(frame * 0.3) * 4 : 0;

    ctx.save();
    ctx.translate(x + wobble, y);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Speed lines (boost effect)
    if (isBoost) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i += 2) {
            ctx.beginPath();
            ctx.moveTo(i * 12, 8 + (frame % 12));
            ctx.lineTo(i * 12, 22 + (frame % 12));
            ctx.stroke();
        }
    }

    // Body
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.ellipse(-3, -2, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mane
    ctx.fillStyle = '#3E2723';
    ctx.fillRect(-7, -16, 14, 5);

    // Head
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, -22, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = '#FFCDD2';
    ctx.beginPath();
    ctx.ellipse(0, -25, 3, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(-4, -26); ctx.lineTo(-6, -30); ctx.lineTo(-2, -27);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, -26); ctx.lineTo(6, -30); ctx.lineTo(2, -27);
    ctx.closePath(); ctx.fill();

    // Tail
    ctx.fillStyle = '#3E2723';
    ctx.fillRect(-2, 14, 4, 9);

    // Legs (running animation)
    const legPhase = isStunned ? 2 : Math.floor(frame / 4) % 2;
    ctx.fillStyle = '#3E2723';
    if (legPhase === 0) {
        ctx.fillRect(-11, -6, 4, 8);
        ctx.fillRect(7, 4, 4, 8);
        ctx.fillRect(-11, 4, 3, 6);
        ctx.fillRect(8, -6, 3, 6);
    } else if (legPhase === 1) {
        ctx.fillRect(7, -6, 4, 8);
        ctx.fillRect(-11, 4, 4, 8);
        ctx.fillRect(8, 4, 3, 6);
        ctx.fillRect(-11, -6, 3, 6);
    } else {
        // Stunned: legs apart
        ctx.fillRect(-11, -6, 3, 8);
        ctx.fillRect(8, -6, 3, 8);
        ctx.fillRect(-11, 4, 3, 8);
        ctx.fillRect(8, 4, 3, 8);
    }

    // Jockey
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(0, -8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.arc(0, -12, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Status effect icon
    if (isStunned) drawStatusIcon(x + 14, y - 10, '😵', frame);
    else if (isBoost) drawStatusIcon(x + 14, y - 10, '💨', frame);
    else if (isDrunk) drawStatusIcon(x + 14, y - 10, '🍺', frame);

    // Name label
    const nameFontSize = Math.max(8, Math.min(11, canvas.width / 43));
    ctx.font = `bold ${nameFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = Math.max(2, canvas.width / 240);
    ctx.strokeText(p.name, x, y - 32);
    ctx.fillText(p.name, x, y - 32);

    // Finished badge
    if (p.finished) {
        const finishFontSize = Math.max(10, Math.min(13, canvas.width / 37));
        ctx.font = `bold ${finishFontSize}px sans-serif`;
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(2, canvas.width / 240);
        const text = `${p.rank}位!`;
        ctx.strokeText(text, x, y + 30);
        ctx.fillText(text, x, y + 30);
    }
}

function drawStatusIcon(x, y, emoji, frame) {
    const bob = Math.sin(frame * 0.2) * 2;
    ctx.save();
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y + bob);
    ctx.restore();
}

function drawCountdown() {
    if (state.countdown <= 0) return;
    const sec = Math.ceil((state.countdown - 30) / 60);
    let text;
    if (state.countdown < 30) text = 'GO!';
    else if (sec <= 0) text = 'GO!';
    else text = String(sec);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.fillStyle = text === 'GO!' ? '#FFD54F' : '#FFFFFF';
    ctx.strokeStyle = '#212121';
    ctx.lineWidth = Math.max(3, canvas.width / 80);
    const fontSize = Math.min(130, canvas.width / 3.7);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const phase = state.countdown % 60;
    const scale = 1 + (60 - phase) / 200;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(scale, scale);
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function updateLiveRanking() {
    const sorted = [...state.players].sort((a, b) => {
        if (a.finished && b.finished) return a.rank - b.rank;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.progress - a.progress;
    });

    rankingPanel.innerHTML = sorted.map((p, idx) => {
        const rankNum = p.finished ? `${p.rank}位` : `${idx + 1}`;
        const cls = idx === 0 ? 'first' : (idx === sorted.length - 1 ? 'last' : '');
        return `
            <div class="live-rank ${cls}">
                <span class="rank-num">${rankNum}</span>
                <span class="rank-color" style="background:${p.color}"></span>
                <span>${p.name}</span>
            </div>
        `;
    }).join('');
}

// ===== Main Loop =====
let frameCount = 0;
let lastRankUpdate = 0;

function loop() {
    frameCount++;
    if (state.screen === 'race') {
        updateRace();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawTrack();
        for (const p of state.players) drawHorse(p, frameCount);
        drawCountdown();

        // Update rank panel ~10fps
        if (frameCount - lastRankUpdate > 6) {
            updateLiveRanking();
            lastRankUpdate = frameCount;
        }
    }
    requestAnimationFrame(loop);
}

loop();
