import * as THREE from 'three';
import QRCode from 'qrcode';
import { memeData, getRarity, getGrade, calculateCurationScore, getCurationRank } from './memeData.js';

// Dev guard: if this module is re-executed on a live page (vite HMR re-import),
// two animate loops would fight over the DOM — force one clean page reload instead.
if (window.__memeStratumBooted) {
  location.reload();
  throw new Error('stale module instance — reloading');
}
window.__memeStratumBooted = true;

// ─────────────────────────────────────────────
//  MEME STRATUM — Geological Excavation as
//  Critique of Mass-Consumption Society
//
//  TDD Principles (Kent Beck):
//  1. Write tests first
//  2. Make them pass
//  3. Refactor
//
//  Satirical Mechanics:
//    - CONSUMPTION VELOCITY: scroll speed = waste generation rate
//    - LANDFILL DEPTH: accumulated years of meme sediment
//    - SALVAGE CAPACITY: finite attention budget (max 5)
//    - HARDNESS: older layers resist excavation (planned obsolescence)
//    - PACKAGING METAPHOR: newer memes are shinier, older compressed
// ─────────────────────────────────────────────

const K_Y = 2.5;
const K_LAYER_BASE = 0.4;
const LAYER_Z = 8;
const STRATA_Z_OFFSET = 4;
const CURRENT_YEAR = 2026;
const START_YEAR = 2000;
const TOTAL_YEARS = CURRENT_YEAR - START_YEAR;
const CONSUMPTION_LIMIT = 200;
const SALVAGE_CAPACITY_MAX = 5;

// ── State ──
// mode drives the exhibition loop:
//   attract — title overlay over a slowly drifting scene, waiting for a visitor
//   active  — a visitor is excavating
//   report  — consumption report is up (manual via Esc, or automatic at session end)
const state = {
  mode: 'attract',
  currentY: -5,
  targetY: -5,
  timeRange: { min: 0, max: TOTAL_YEARS * K_Y + 5 },
  activeMeme: null,
  isSerialConnected: false,
  autoScrolling: false,
  scrollSpeed: 0,
  excavationDepth: 0,
  // Satirical metrics
  totalConsumption: 0,
  consumptionVelocity: 0,
  landfillDepth: 0,
  salvageRemaining: SALVAGE_CAPACITY_MAX,
  salvagedMemes: new Set(),
  isWarning: false,
  // Report tracking
  autoScrollTime: 0,
  activeScrollTime: 0,
  totalMemesConsumed: 0,
  totalMemesMissed: 0,
  hoveredContemporary: null,
  lastCY: null,
  // Pinned focus (clicked from CONTEMPORARIES) — lets visitors reach long-lived
  // memes like Pepe/Doge that the auto-focus (short-lived first) never picks
  selectedMeme: null,
  // Scoreboard identity
  visitorName: '',
  scoreRecorded: false,
  sessionStartedAt: 0,
};

// ── Idle pacing (unattended gallery loop) ──
// Visitors walk away without closing anything: the piece must drift, report,
// and reset itself so the next visitor always gets a fresh dig with 5 salvages.
const IDLE_AUTO_SCROLL_MS = 30000;  // no input → the excavator keeps digging on its own
const IDLE_RESET_MS = 120000;       // no input → session ends (report if they salvaged, then attract)
const REPORT_LINGER_MS = 45000;     // report left open → back to attract
const AUTO_SCROLL_SPEED = 1.2;
let lastInputAt = performance.now();
let reportOpenedAt = 0;
function resetIdleTimer() {
  lastInputAt = performance.now();
  if (state.mode === 'active') state.autoScrolling = false;
}

// ── DOM ──
const overlay = document.getElementById('overlay');
const connectBtn = document.getElementById('connect-btn');
const serialBtn = document.getElementById('serial-btn');
const hud = document.getElementById('hud');
const currentYearEl = document.getElementById('current-year');
const eraLabel = document.getElementById('era-label');
const eraLabelJp = document.getElementById('era-label-jp');
const memeInfo = document.getElementById('meme-info');
const activeMemeEl = document.getElementById('active-meme');
const activeDurEl = document.getElementById('active-duration');
const activeSalvageEl = document.getElementById('active-salvage');
const activeDescEl = document.getElementById('active-description');
const memeBgEl = document.getElementById('meme-bg-1');
const memeBgEl2 = document.getElementById('meme-bg-2');
let bgActiveIsFirst = true;
const serialDot = document.getElementById('serial-dot');
const serialStatus = document.getElementById('serial-status');
const serialIndicator = document.getElementById('serial-indicator');
const webglCanvas = document.getElementById('webgl');
const timelineWrapper = document.getElementById('timeline-wrapper');
const timelineRuler = document.getElementById('timeline-ruler');
// Satirical DOM elements
const metricsPanel = document.getElementById('metrics-panel');
const ambientMetrics = document.getElementById('ambient-metrics');
const velocityEl = document.getElementById('consumption-velocity');
const velocityFill = document.getElementById('velocity-fill');
const warningEl = document.getElementById('consumption-warning');
const visitorNameEl = document.getElementById('visitor-name');
const scoreboardListEl = document.getElementById('scoreboard-list');
const overlayBoardEl = document.getElementById('overlay-board');
const overlayBoardListEl = document.getElementById('overlay-board-list');
const salvageBtn = document.getElementById('salvage-btn');
const reportPanel = document.getElementById('consumption-report');
const reportCloseBtn = document.getElementById('report-close');
const autoIndicator = document.getElementById('auto-indicator');
const curationScoreEl = document.getElementById('curation-score');
const curationRankEl = document.getElementById('curation-rank');
const focusLineEl = document.getElementById('focus-line');
const focusDotEl = document.getElementById('focus-dot');
const accentEl = document.getElementById('active-accent');

// ── Three.js ──
let scene, camera, renderer;
let particles, dustParticles;
let focusBracket;
const PARTICLE_COUNT = 2000;
const DUST_COUNT = 800;
const strataMeshes = [];
const memePanels = [];
const veinMeshes = [];

// Resolve asset paths against the page origin so images load whether the app is
// served from root, a subdirectory, or a static host with a <base> tag.
function assetUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//.test(path) || path.startsWith('data:')) return path;
  const cleanPath = path.replace(/^\/+/, '');
  return new URL(cleanPath, location.href).href;
}

// Audio
let audioCtx, droneOsc, subOsc, filterNode, gainNode, noiseNode, noiseGain;

// ─────────────────────────────────────────────
//  VISITOR IDENTITY + SCOREBOARD
//  Anonymous visitors get a random word-combo name so
//  strangers can compete across the exhibition day
// ─────────────────────────────────────────────
const NAME_ADJ = [
  'FERAL', 'SLEEPY', 'CURSED', 'SHINY', 'POLITE', 'DUSTY', 'TURBO', 'SILENT',
  'NOBLE', 'CHAOTIC', 'HUMBLE', 'SPICY', 'ANCIENT', 'GLITCHED', 'SOGGY', 'BASED',
];
const NAME_NOUN = [
  'ARCHIVIST', 'EXCAVATOR', 'CURATOR', 'RACCOON', 'DIGGER', 'SCHOLAR',
  'LURKER', 'HOARDER', 'PIGEON', 'GOBLIN', 'INTERN', 'PROPHET',
];
function generateVisitorName() {
  const adj = NAME_ADJ[Math.floor(Math.random() * NAME_ADJ.length)];
  const noun = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)];
  const num = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${adj} ${noun} #${num}`;
}

const SCOREBOARD_KEY = 'meme-stratum-scoreboard';
function loadScoreboard() {
  try { return JSON.parse(localStorage.getItem(SCOREBOARD_KEY)) || []; }
  catch { return []; }
}
function saveScoreboard(board) {
  board.sort((a, b) => b.score - a.score);
  try { localStorage.setItem(SCOREBOARD_KEY, JSON.stringify(board.slice(0, 50))); }
  catch { /* storage full/blocked — the board is a bonus, never break the piece */ }
}
function renderScoreboardInto(el, board, highlightTs, limit) {
  el.innerHTML = '';
  const rows = board.slice(0, limit);
  // The current visitor always sees their own position, even outside the top rows
  const ownIdx = highlightTs != null ? board.findIndex(e => e.ts === highlightTs) : -1;
  if (ownIdx >= limit) rows.push(board[ownIdx]);
  for (const entry of rows) {
    const row = document.createElement('div');
    row.className = 'sb-row' + (entry.ts === highlightTs ? ' you' : '');
    row.innerHTML = `
      <span class="sb-pos">${board.indexOf(entry) + 1}</span>
      <span class="sb-name">${entry.name}</span>
      <span class="sb-score">${entry.score}</span>
      <span class="sb-rank">RK ${entry.rank}</span>
    `;
    el.appendChild(row);
  }
}

// ─────────────────────────────────────────────
//  ERA MAPPING
// ─────────────────────────────────────────────
function getEraLabel(year) {
  if (year <= 2004) return 'THE PRIMORDIAL ERA';
  if (year <= 2008) return 'THE VIRAL VIDEO AGE';
  if (year <= 2012) return 'THE GOLDEN AGE';
  if (year <= 2016) return 'THE SOCIAL MEDIA SURGE';
  if (year <= 2020) return 'THE POST-IRONIC ERA';
  return 'THE ALGORITHMIC AGE';
}

function getEraLabelJp(year) {
  if (year <= 2004) return '原始のインターネット';
  if (year <= 2008) return 'バイラル動画の時代';
  if (year <= 2012) return 'ミーム黄金期';
  if (year <= 2016) return 'SNS爆発期';
  if (year <= 2020) return 'ポスト・アイロニーの時代';
  return 'アルゴリズムの時代';
}

// ─────────────────────────────────────────────
//  COLOR UTILS
// ─────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
}

function blendColors(colors, weights) {
  let totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) totalWeight = 1;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < colors.length; i++) {
    const c = hexToRgb(colors[i]);
    const w = weights[i] / totalWeight;
    r += c.r * w; g += c.g * w; b += c.b * w;
  }
  return rgbToHex(r, g, b);
}

function weatherColor(hex, ageFactor, densityFactor) {
  const c = hexToRgb(hex);
  const desat = 1 - ageFactor * 0.5;
  const yellowShift = ageFactor * 20;
  const darken = 1 - ageFactor * 0.3;
  const r = Math.min(255, (c.r * desat + yellowShift) * darken);
  const g = Math.min(255, (c.g * desat + yellowShift * 0.7) * darken);
  const b = Math.min(255, c.b * desat * darken * 0.8);
  return { r, g, b, hex: rgbToHex(r, g, b) };
}

// ─────────────────────────────────────────────
//  STRATA TEXTURE — geological layer surface
// ─────────────────────────────────────────────
function createStrataTexture(year, memesInLayer, ageFactor, densityFactor) {
  const S = 1024;
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d');
  cvs.width = S; cvs.height = S;

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;

  const colors = memesInLayer.map(m => m.color);
  const weights = memesInLayer.map(m => Math.max(1, m.diedYear - m.bornYear));
  const baseColor = blendColors(colors, weights);
  const w = weatherColor(baseColor, ageFactor, densityFactor);

  ctx.fillStyle = `rgb(${w.r | 0}, ${w.g | 0}, ${w.b | 0})`;
  ctx.fillRect(0, 0, S, S);

  const imageData = ctx.getImageData(0, 0, S, S);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * (15 + ageFactor * 25);
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(imageData, 0, 0);

  if (ageFactor > 0.1) {
    const lineCount = 20 + ageFactor * 80;
    ctx.strokeStyle = `rgba(40, 30, 20, ${0.03 + ageFactor * 0.08})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < lineCount; i++) {
      const y = Math.random() * S;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x < S; x += 20) {
        ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * (2 + ageFactor * 4));
      }
      ctx.stroke();
    }
  }

  if (ageFactor > 0.2) {
    const stainCount = 5 + ageFactor * 20;
    for (let s = 0; s < stainCount; s++) {
      const sx = Math.random() * S;
      const sy = Math.random() * S;
      const sr = 20 + Math.random() * 60 * ageFactor;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      grad.addColorStop(0, `rgba(140, 110, 60, ${ageFactor * 0.12})`);
      grad.addColorStop(1, 'rgba(140, 110, 60, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (ageFactor > 0.6) {
    const fractureCount = 2 + ageFactor * 8;
    ctx.strokeStyle = `rgba(60, 45, 30, ${ageFactor * 0.15})`;
    ctx.lineWidth = 1 + ageFactor;
    for (let f = 0; f < fractureCount; f++) {
      ctx.beginPath();
      let fx = Math.random() * S;
      let fy = Math.random() * S;
      ctx.moveTo(fx, fy);
      for (let step = 0; step < 5; step++) {
        fx += (Math.random() - 0.5) * 200;
        fy += (Math.random() - 0.5) * 200;
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
    }
  }

  ctx.fillStyle = `rgba(26, 20, 16, ${0.15 + ageFactor * 0.1})`;
  ctx.font = `bold ${S * 0.04}px Inter, "Helvetica Neue", sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(year.toString(), S * 0.02, S * 0.02);

  tex.needsUpdate = true;
  return tex;
}

// ─────────────────────────────────────────────
//  FOSSIL TEXTURE — embedded meme in strata
// ─────────────────────────────────────────────
function createFossilTexture(meme, ageFactor, isSalvaged) {
  const S = 512;
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d');
  cvs.width = S; cvs.height = S;

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;

  function draw(img) {
    const y = ageFactor * 40;
    ctx.fillStyle = `rgb(${240 - y * 0.5 | 0}, ${232 - y * 0.3 | 0}, ${210 - y * 0.8 | 0})`;
    ctx.fillRect(0, 0, S, S);

    const imageData = ctx.getImageData(0, 0, S, S);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * (4 + ageFactor * 10);
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(imageData, 0, 0);

    if (meme.deathType === 'sudden') {
      ctx.strokeStyle = `rgba(80, 60, 40, ${0.1 + ageFactor * 0.2})`;
      ctx.lineWidth = 2;
      for (let c = 0; c < 3 + ageFactor * 5; c++) {
        ctx.beginPath();
        const cx = Math.random() * S;
        const cy = Math.random() * S;
        ctx.moveTo(cx, cy);
        for (let r = 0; r < 4; r++) {
          ctx.lineTo(cx + (Math.random() - 0.5) * 150, cy + (Math.random() - 0.5) * 150);
        }
        ctx.stroke();
      }
    } else if (meme.deathType === 'resurrected') {
      const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.6);
      grad.addColorStop(0, `${meme.color}22`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S, S);
    }

    if (img) {
      const m = 30;
      const ds = S - m * 2;
      const a = img.width / img.height;
      let w = ds, h = ds;
      if (a > 1) h = ds / a;
      else w = ds * a;
      ctx.save();
      ctx.globalAlpha = isSalvaged ? 0.85 : (0.6 - ageFactor * 0.2);
      ctx.filter = isSalvaged ? 'none' : `blur(${ageFactor * 2}px)`;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2 - 20, w, h);
      ctx.restore();
    }

    // Salvage stamp
    if (isSalvaged) {
      ctx.strokeStyle = '#228844';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, S - 20, S - 20);
      ctx.fillStyle = '#228844';
      ctx.font = `bold ${S * 0.04}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('SALVAGED', S / 2, S - 30);
    }

    ctx.fillStyle = `rgba(26, 20, 16, ${0.5 + ageFactor * 0.2})`;
    ctx.font = `bold ${S * 0.025}px Inter, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(meme.name.toUpperCase(), S / 2, S - 15);

    const barY = S - 45;
    const barH = 4;
    const barW = S * 0.7;
    const barLeft = (S - barW) / 2;
    const dur = Math.max(1, meme.diedYear - meme.bornYear);
    const totalSpan = CURRENT_YEAR - START_YEAR;

    ctx.fillStyle = 'rgba(40, 30, 20, 0.15)';
    ctx.fillRect(barLeft, barY, barW, barH);

    const activeW = (dur / totalSpan) * barW;
    const barGrad = ctx.createLinearGradient(barLeft, barY, barLeft + activeW, barY);
    barGrad.addColorStop(0, meme.color + 'aa');
    barGrad.addColorStop(1, meme.color + '44');
    ctx.fillStyle = barGrad;
    ctx.fillRect(barLeft, barY, activeW, barH);

    const typeLabel = { sudden: '⚡ SUDDEN', fade: '⋯ FADE', resurrected: '↺ RESURRECTED' }[meme.deathType] || '';
    ctx.fillStyle = `rgba(26, 20, 16, ${0.35 + ageFactor * 0.15})`;
    ctx.font = `${S * 0.018}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(typeLabel, S / 2, barY - 5);

    if (meme.description) {
      ctx.fillStyle = `rgba(26, 20, 16, ${0.25 + ageFactor * 0.15})`;
      ctx.font = `${S * 0.016}px Inter, sans-serif`;
      ctx.textAlign = 'left';
      const words = meme.description.split('');
      let line = '';
      let lineY = S * 0.05;
      const maxWidth = S * 0.9;
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line, S * 0.05, lineY);
          line = words[i];
          lineY += S * 0.022;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, S * 0.05, lineY);
    }

    tex.needsUpdate = true;
  }

  draw(null);
  if (meme.imageUrl) {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => draw(im);
    // Images are bundled locally; fall back to the original remote URL just in case
    im.onerror = () => {
      if (meme.remoteUrl && im.src !== meme.remoteUrl) im.src = meme.remoteUrl;
    };
    im.src = assetUrl(meme.imageUrl);
  }
  return tex;
}

// ─────────────────────────────────────────────
//  FOCUS BRACKET — museum-specimen corner marks
//  around the fossil the label is describing
// ─────────────────────────────────────────────
function createBracketTexture() {
  const S = 256, L = 46, W = 7;
  const cvs = document.createElement('canvas');
  cvs.width = S; cvs.height = S;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#ffffff';
  // Four L-shaped corner brackets (drawn white, tinted per meme via material.color)
  for (const [x, y, dx, dy] of [[0, 0, 1, 1], [S, 0, -1, 1], [0, S, 1, -1], [S, S, -1, -1]]) {
    ctx.fillRect(Math.min(x, x + dx * L), Math.min(y, y + dy * W), L, W);
    ctx.fillRect(Math.min(x, x + dx * W), Math.min(y, y + dy * L), W, L);
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Some meme colours are near-black — lift them so UI accents stay visible
function uiColorFor(meme) {
  const c = new THREE.Color(meme.color);
  const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (luma < 0.35) c.lerp(new THREE.Color('#e8e0d8'), 0.55);
  return c;
}

// ─────────────────────────────────────────────
//  THREE.JS SCENE — Geological strata
// ─────────────────────────────────────────────
function initThree() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#a89888', 0.008);

  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 300);
  camera.position.set(0, -5, 18);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;

  scene.add(new THREE.AmbientLight('#f0e8e0', 0.6));
  const dir = new THREE.DirectionalLight('#ffe0c0', 0.7);
  dir.position.set(5, 8, 12); scene.add(dir);
  const fill = new THREE.DirectionalLight('#c8d8e8', 0.3);
  fill.position.set(-5, 3, 5); scene.add(fill);

  const yearGroups = new Map();
  for (const meme of memeData) {
    for (let y = meme.bornYear; y <= Math.min(meme.diedYear, CURRENT_YEAR); y++) {
      if (!yearGroups.has(y)) yearGroups.set(y, []);
      yearGroups.get(y).push(meme);
    }
  }

  const sortedYears = Array.from(yearGroups.keys()).sort((a, b) => a - b);
  let currentY = 0;

  for (const year of sortedYears) {
    const memes = yearGroups.get(year);
    const ageFactor = Math.min((year - START_YEAR) / TOTAL_YEARS, 1);
    const densityFactor = memes.length / 5;
    const layerThickness = K_LAYER_BASE + (memes.length * 0.15) + (densityFactor * 0.2);

    const strataGeo = new THREE.BoxGeometry(12, layerThickness, LAYER_Z);
    const strataTex = createStrataTexture(year, memes, ageFactor, densityFactor);
    // ── Year label in 3D space (small floating text near the layer) ──
    const yearLabelY = currentY + layerThickness / 2;
    // ── Cross-section boundary lines (top and bottom edges) ──
    const edgeGray = Math.round(120 - ageFactor * 40);
    const edgeColor = new THREE.Color(`rgb(${edgeGray}, ${edgeGray}, ${edgeGray})`);
    const edgeMat = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: 0.35 + ageFactor * 0.15,
    });
    // Top edge
    const topPts = [
      new THREE.Vector3(-6, currentY + layerThickness, -STRATA_Z_OFFSET - LAYER_Z / 2),
      new THREE.Vector3(6, currentY + layerThickness, -STRATA_Z_OFFSET - LAYER_Z / 2),
      new THREE.Vector3(6, currentY + layerThickness, -STRATA_Z_OFFSET + LAYER_Z / 2),
      new THREE.Vector3(-6, currentY + layerThickness, -STRATA_Z_OFFSET + LAYER_Z / 2),
      new THREE.Vector3(-6, currentY + layerThickness, -STRATA_Z_OFFSET - LAYER_Z / 2),
    ];
    const topGeo = new THREE.BufferGeometry().setFromPoints(topPts);
    const topLine = new THREE.Line(topGeo, edgeMat);
    scene.add(topLine);
    // Bottom edge
    const botPts = [
      new THREE.Vector3(-6, currentY, -STRATA_Z_OFFSET - LAYER_Z / 2),
      new THREE.Vector3(6, currentY, -STRATA_Z_OFFSET - LAYER_Z / 2),
      new THREE.Vector3(6, currentY, -STRATA_Z_OFFSET + LAYER_Z / 2),
      new THREE.Vector3(-6, currentY, -STRATA_Z_OFFSET + LAYER_Z / 2),
      new THREE.Vector3(-6, currentY, -STRATA_Z_OFFSET - LAYER_Z / 2),
    ];
    const botGeo = new THREE.BufferGeometry().setFromPoints(botPts);
    const botLine = new THREE.Line(botGeo, edgeMat);
    scene.add(botLine);

    // Push dummy strata record for tracking (no visible mesh)
    strataMeshes.push({
      mesh: null,
      year,
      yStart: currentY,
      yEnd: currentY + layerThickness,
      memes,
      ageFactor,
    });

    for (let i = 0; i < memes.length; i++) {
      const meme = memes[i];
      const dur = Math.max(1, meme.diedYear - meme.bornYear);
      const xPos = (i - (memes.length - 1) / 2) * 2.5;
      const yPos = currentY + (layerThickness * 0.3) + (Math.random() * layerThickness * 0.4);
      const zPos = -STRATA_Z_OFFSET + (Math.random() - 0.5) * (LAYER_Z * 0.6);

      const tex = createFossilTexture(meme, ageFactor, state.salvagedMemes.has(meme.id));
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const panelSize = 0.7 + Math.min(2.5, dur / 4);
      const geo = new THREE.PlaneGeometry(panelSize, panelSize * 1.1);
      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.set(xPos, yPos, zPos);
      mesh.rotation.set(
        (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.1
      );
      scene.add(mesh);

      memePanels.push({
        mesh,
        data: meme,
        yStart: currentY,
        yEnd: currentY + layerThickness,
        baseMat: mat,
        ageFactor,
        viewedS: 0,
      });
    }

    currentY += layerThickness;
  }

  state.landfillDepth = currentY;

  // ── Factory smoke at the top (Algorithmic Age) ──
  const smokeGeo = new THREE.BufferGeometry();
  const smokePos = new Float32Array(200 * 3);
  for (let i = 0; i < 200; i++) {
    smokePos[i * 3] = (Math.random() - 0.5) * 15;
    smokePos[i * 3 + 1] = currentY + Math.random() * 3;
    smokePos[i * 3 + 2] = (Math.random() - 0.5) * 8 - STRATA_Z_OFFSET;
  }
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  const smokeParticles = new THREE.Points(smokeGeo, new THREE.PointsMaterial({
    color: '#888888',
    size: 0.08,
    transparent: true,
    opacity: 0.2,
    sizeAttenuation: true,
  }));
  scene.add(smokeParticles);

  // ── Ambient particles ──
  const pg = new THREE.BufferGeometry();
  const pp = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pp[i * 3] = (Math.random() - 0.5) * 25;
    pp[i * 3 + 1] = Math.random() * currentY;
    pp[i * 3 + 2] = (Math.random() - 0.5) * 15;
  }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  particles = new THREE.Points(pg, new THREE.PointsMaterial({
    color: '#c4b09a',
    size: 0.03,
    transparent: true,
    opacity: 0.15,
    sizeAttenuation: true,
  }));
  scene.add(particles);

  // ── Excavation dust ──
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST_COUNT * 3);
  const dustVel = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 20;
    dustPos[i * 3 + 1] = -100;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    dustVel[i * 3] = 0;
    dustVel[i * 3 + 1] = 0;
    dustVel[i * 3 + 2] = 0;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustParticles = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: '#d4c4a8',
    size: 0.05,
    transparent: true,
    opacity: 0.0,
    sizeAttenuation: true,
  }));
  scene.add(dustParticles);
  dustParticles.userData = { velocities: dustVel };

  // ── Focus bracket: glides between fossils as the label changes ──
  focusBracket = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: createBracketTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  focusBracket.visible = false;
  scene.add(focusBracket);

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

// ─────────────────────────────────────────────
//  TIMELINE RULER
// ─────────────────────────────────────────────
function buildTimeline() {
  const PX = 56;
  for (let y = START_YEAR; y <= CURRENT_YEAR; y++) {
    const off = (y - START_YEAR) * PX;
    const major = y % 5 === 0 || y === CURRENT_YEAR;
    const tick = document.createElement('div');
    tick.className = 'timeline-tick' + (major ? ' major' : '');
    tick.style.left = off + 'px';
    timelineRuler.appendChild(tick);
    if (major) {
      const lbl = document.createElement('div');
      lbl.className = 'timeline-year-text';
      lbl.id = `tick-year-${y}`;
      lbl.textContent = y;
      lbl.style.left = off + 'px';
      timelineRuler.appendChild(lbl);
    }
  }
}

// ─────────────────────────────────────────────
//  SATIRICAL METRICS
// ─────────────────────────────────────────────
function updateMetrics() {
  // Consumption velocity: memes per second approximation
  const memesInView = memePanels.filter(p => {
    const dist = Math.abs(state.currentY - (p.yStart + p.yEnd) / 2);
    return dist < K_Y * 2;
  }).length;
  state.consumptionVelocity = state.scrollSpeed * memesInView * 0.3;
  state.totalConsumption += state.consumptionVelocity;

  // Update DOM
  velocityEl.textContent = state.consumptionVelocity.toFixed(1);
  const velPercent = Math.min(100, (state.consumptionVelocity / 20) * 100);
  velocityFill.style.width = velPercent + '%';
  velocityFill.className = 'metric-fill' + (velPercent > 80 ? ' danger' : velPercent > 50 ? ' warn' : '');

  // Consumption limit warning at 90%
  const consumptionPercent = (state.totalConsumption / CONSUMPTION_LIMIT) * 100;
  state.isWarning = consumptionPercent > 90 && state.consumptionVelocity > 2;
  warningEl.style.display = state.isWarning ? 'block' : 'none';

  // Salvage pill: capacity lives in the button itself, beside the meme name
  // (never while attract/report — it stays clickable even when faded)
  if (state.mode !== 'active') {
    salvageBtn.classList.add('hidden');
  } else if (closest && state.salvageRemaining > 0 && !state.salvagedMemes.has(closest.data.id)) {
    salvageBtn.textContent = `SALVAGE · ${state.salvageRemaining} LEFT`;
    salvageBtn.classList.remove('hidden', 'exhausted');
  } else if (closest && state.salvageRemaining === 0) {
    salvageBtn.textContent = 'NO SALVAGE LEFT';
    salvageBtn.classList.remove('hidden');
    salvageBtn.classList.add('exhausted');
  } else {
    salvageBtn.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────
//  SALVAGE INTERACTION
// ─────────────────────────────────────────────
// ── Salvage flash text (DOM overlay for visibility) ──
function showSalvageFlash() {
  // A quiet archival rite — thin rules, wide tracking, no fireworks
  const flash = document.createElement('div');
  flash.className = 'salvage-flash';
  flash.innerHTML = `
    <div class="sf-word">SALVAGED</div>
    <div class="sf-sub">永久保存 — PRESERVED IN THE ARCHIVE</div>
  `;
  document.body.appendChild(flash);
  requestAnimationFrame(() => flash.classList.add('in'));
  setTimeout(() => {
    flash.classList.remove('in');
    flash.classList.add('out');
    setTimeout(() => flash.remove(), 900);
  }, 1400);
}

const retexturedPanels = [];

function handleSalvage() {
  if (!closest || state.salvageRemaining <= 0 || state.salvagedMemes.has(closest.data.id)) return;

  state.salvageRemaining--;
  state.salvagedMemes.add(closest.data.id);

  // Re-render fossil texture with salvage stamp (sharp, bright)
  const ageFactor = Math.min((closest.data.bornYear - START_YEAR) / TOTAL_YEARS, 1);
  const newTex = createFossilTexture(closest.data, ageFactor, true);
  closest.baseMat.map = newTex;
  closest.baseMat.opacity = 1.0; // fully opaque when salvaged
  closest.baseMat.needsUpdate = true;
  retexturedPanels.push(closest);

  // Curation score (live HUD metric)
  const salvagedList = Array.from(state.salvagedMemes)
    .map(id => memeData.find(m => m.id === id)).filter(Boolean);
  const score = calculateCurationScore(salvagedList);
  curationScoreEl.textContent = score.total;
  curationRankEl.textContent = getCurationRank(score.total);

  // Fifth salvage completes the dig: the report is the payoff
  if (state.salvagedMemes.size >= SALVAGE_CAPACITY_MAX) {
    setTimeout(() => {
      if (state.mode === 'active') showConsumptionReport();
    }, 1800);
  }

  // Physical "pop" animation toward camera
  const targetZ = closest.mesh.position.z + 2.0;
  const startZ = closest.mesh.position.z;
  const startTime = performance.now();
  const duration = 400;
  function popAnim() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    closest.mesh.position.z = startZ + (targetZ - startZ) * Math.sin(ease * Math.PI);
    if (t < 1) requestAnimationFrame(popAnim);
    else closest.mesh.position.z = startZ; // return to layer
  }
  popAnim();

  // Golden glow material effect (temporary)
  const originalColor = closest.baseMat.color ? closest.baseMat.color.clone() : new THREE.Color(1,1,1);
  closest.baseMat.color = new THREE.Color(1.3, 1.1, 0.7); // gold tint
  setTimeout(() => {
    closest.baseMat.color = originalColor;
  }, 600);

  // Show flash text
  showSalvageFlash();

  // Update UI
  updateMetrics();

  playSalvageSound();
}

// ── Salvage sound: an unearthing rite, not a game chime ──
// Sub-bass thud (the fossil pulled from the stratum), a breath of dust,
// a slow low-fifth swell, and one distant bell echoing away.
function playSalvageSound() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.value = 1;
  out.connect(audioCtx.destination);

  // Shared echo space — darkened feedback delay for the tail
  const delay = audioCtx.createDelay(1.0);
  delay.delayTime.value = 0.29;
  const feedback = audioCtx.createGain();
  feedback.gain.value = 0.34;
  const damp = audioCtx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 850;
  delay.connect(feedback); feedback.connect(damp); damp.connect(delay);
  const wet = audioCtx.createGain();
  wet.gain.value = 0.4;
  delay.connect(wet); wet.connect(out);

  // 1) Earth thud — pitch drop into the sub register
  const thud = audioCtx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(120, now);
  thud.frequency.exponentialRampToValueAtTime(36, now + 0.4);
  const thudG = audioCtx.createGain();
  thudG.gain.setValueAtTime(0.0001, now);
  thudG.gain.exponentialRampToValueAtTime(0.45, now + 0.025);
  thudG.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
  thud.connect(thudG); thudG.connect(out);
  thud.start(now); thud.stop(now + 0.8);

  // 2) Dust — a short bandpass noise breath sweeping downward
  const nLen = Math.floor(audioCtx.sampleRate * 0.7);
  const nBuf = audioCtx.createBuffer(1, nLen, audioCtx.sampleRate);
  const nd = nBuf.getChannelData(0);
  for (let i = 0; i < nLen; i++) nd[i] = (Math.random() * 2 - 1);
  const noise = audioCtx.createBufferSource();
  noise.buffer = nBuf;
  const nFilt = audioCtx.createBiquadFilter();
  nFilt.type = 'bandpass';
  nFilt.Q.value = 1.1;
  nFilt.frequency.setValueAtTime(1400, now);
  nFilt.frequency.exponentialRampToValueAtTime(180, now + 0.55);
  const nG = audioCtx.createGain();
  nG.gain.setValueAtTime(0.0001, now);
  nG.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
  nG.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  noise.connect(nFilt); nFilt.connect(nG); nG.connect(out); nG.connect(delay);
  noise.start(now); noise.stop(now + 0.7);

  // 3) Reliquary swell — low perfect fifth, slow bloom, detuned pairs
  const swellFilt = audioCtx.createBiquadFilter();
  swellFilt.type = 'lowpass';
  swellFilt.frequency.value = 640;
  const swellG = audioCtx.createGain();
  swellG.gain.setValueAtTime(0.0001, now + 0.15);
  swellG.gain.exponentialRampToValueAtTime(0.11, now + 0.9);
  swellG.gain.exponentialRampToValueAtTime(0.001, now + 3.2);
  swellFilt.connect(swellG); swellG.connect(out); swellG.connect(delay);
  for (const f of [110, 110.6, 164.81, 165.6]) {
    const o = audioCtx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const og = audioCtx.createGain();
    og.gain.value = 0.25;
    o.connect(og); og.connect(swellFilt);
    o.start(now + 0.15); o.stop(now + 3.4);
  }

  // 4) One distant bell (D5), mostly heard through the echo
  const bell = audioCtx.createOscillator();
  bell.type = 'sine';
  bell.frequency.value = 587.33;
  const bellG = audioCtx.createGain();
  bellG.gain.setValueAtTime(0.0001, now + 0.35);
  bellG.gain.exponentialRampToValueAtTime(0.045, now + 0.4);
  bellG.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
  bell.connect(bellG); bellG.connect(delay); bellG.connect(out);
  bell.start(now + 0.35); bell.stop(now + 2.4);
}

salvageBtn.addEventListener('click', handleSalvage);

// ─────────────────────────────────────────────
//  CONTROLS
// ─────────────────────────────────────────────
let isDragging = false, lastY = 0;
let closest = null;

window.addEventListener('wheel', e => {
  state.targetY += e.deltaY * 0.12;
  state.selectedMeme = null; // manual navigation releases a pinned focus
  clampY();
  resetIdleTimer();
}, { passive: true });

window.addEventListener('mousedown', e => {
  isDragging = true;
  lastY = e.clientY;
  resetIdleTimer();
});
window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  if (Math.abs(e.clientY - lastY) > 2) state.selectedMeme = null; // real drag releases the pin
  state.targetY -= (e.clientY - lastY) * 0.2;
  lastY = e.clientY;
  clampY();
  resetIdleTimer();
});
window.addEventListener('mouseup', () => {
  isDragging = false;
  resetIdleTimer();
});

window.addEventListener('keydown', e => {
  if (e.key.startsWith('Arrow')) state.selectedMeme = null; // manual navigation releases the pin
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') state.targetY += K_Y;
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') state.targetY -= K_Y;
  // Space / Enter salvage from the keyboard (guard the session's first second so
  // the keypress that started the session can't instantly spend a salvage)
  if ((e.key === ' ' || e.key === 'Enter') && state.mode === 'active' &&
      performance.now() - state.sessionStartedAt > 1000) {
    handleSalvage();
  }
  if (e.key === 'Escape') {
    const shareOverlayEl = document.getElementById('share-overlay');
    if (!shareOverlayEl.classList.contains('hidden')) {
      shareOverlayEl.classList.add('hidden');
      return;
    }
    if (state.mode === 'report') {
      hideConsumptionReport();
    } else if (state.mode === 'active' && state.totalMemesConsumed >= 1) {
      // Only once the visitor has actually consumed something — a report on an
      // empty session (e.g. Escape as the very first key) would be noise
      showConsumptionReport();
    }
  }
  clampY();
  resetIdleTimer();
});

let lastTouchY = 0;
window.addEventListener('touchstart', e => {
  lastTouchY = e.touches[0].clientY;
  resetIdleTimer();
});
window.addEventListener('touchmove', e => {
  state.targetY -= (e.touches[0].clientY - lastTouchY) * 0.15;
  lastTouchY = e.touches[0].clientY;
  clampY();
  resetIdleTimer();
}, { passive: true });

function clampY() {
  state.targetY = Math.max(-2, Math.min(state.timeRange.max + 2, state.targetY));
}

// ─────────────────────────────────────────────
//  WEB SERIAL
// ─────────────────────────────────────────────
async function initSerial() {
  if (!('serial' in navigator)) {
    serialStatus.textContent = 'UNSUPPORTED';
    return;
  }
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    state.isSerialConnected = true;
    serialDot.classList.add('active');
    serialStatus.textContent = 'CONNECTED';
    const dec = new TextDecoderStream();
    port.readable.pipeTo(dec.writable);
    const reader = dec.readable.getReader();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        const v = parseFloat(l.trim());
        if (!isNaN(v)) { state.targetY += v * 3; clampY(); }
      }
    }
  } catch (e) { console.warn('Serial:', e); }
}

// ─────────────────────────────────────────────
//  AUDIO
// ─────────────────────────────────────────────
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  droneOsc = audioCtx.createOscillator();
  droneOsc.type = 'triangle';
  droneOsc.frequency.value = 55;
  subOsc = audioCtx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = 27.5;

  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 80;
  filterNode.Q.value = 3;

  gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.0001;

  const bufferSize = audioCtx.sampleRate * 2;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.5;
  }
  noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = noiseBuffer;
  noiseNode.loop = true;
  noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0.0001;
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 200;
  noiseFilter.Q.value = 1;

  droneOsc.connect(filterNode);
  subOsc.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  noiseNode.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);

  droneOsc.start();
  subOsc.start();
  noiseNode.start();

  gainNode.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 5);
}

function updateAudio() {
  if (!audioCtx) return;
  const depth = Math.max(0, Math.min(1, state.currentY / (TOTAL_YEARS * K_Y)));
  const speed = Math.abs(state.scrollSpeed);

  droneOsc.frequency.setTargetAtTime(55 - depth * 18, audioCtx.currentTime, 0.1);
  filterNode.frequency.setTargetAtTime(80 + speed * 15 + depth * 30, audioCtx.currentTime, 0.15);

  noiseGain.gain.setTargetAtTime(Math.min(0.08, speed * 0.02), audioCtx.currentTime, 0.05);

  // Quieter ambience while the piece waits for a visitor
  gainNode.gain.setTargetAtTime(state.mode === 'active' ? 0.15 : 0.05, audioCtx.currentTime, 1.5);
}

// ─────────────────────────────────────────────
//  EXHIBITION LOOP — attract ⇄ active ⇄ report
// ─────────────────────────────────────────────
function startExperience() {
  // Fresh counters: attract drift may have accumulated consumption
  state.totalConsumption = 0;
  state.totalMemesConsumed = 0;
  state.autoScrollTime = 0;
  state.activeScrollTime = 0;
  resetFomo();

  // Every visitor digs under a fresh random identity
  state.visitorName = generateVisitorName();
  visitorNameEl.textContent = state.visitorName;
  state.scoreRecorded = false;
  state.selectedMeme = null;
  state.sessionStartedAt = performance.now();

  state.mode = 'active';
  state.autoScrolling = false;
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  memeInfo.classList.remove('hidden');
  timelineWrapper.classList.remove('hidden');
  metricsPanel.classList.remove('hidden');
  ambientMetrics.classList.remove('hidden');
  initAudio();
  resetIdleTimer();
  // Auto-hide serial indicator if never connects
  setTimeout(() => {
    if (!state.isSerialConnected) {
      serialIndicator.classList.add('hidden');
    }
  }, 3000);
}

// Restore every fossil and counter so the next visitor gets a fresh dig
function resetSession() {
  for (const p of retexturedPanels) {
    const tex = createFossilTexture(p.data, p.ageFactor, false);
    p.baseMat.map = tex;
    p.baseMat.needsUpdate = true;
  }
  retexturedPanels.length = 0;

  for (const p of memePanels) {
    p.viewedS = 0;
    p.baseMat.opacity = 0.75;
    p.baseMat.color = new THREE.Color(1, 1, 1);
    p.baseMat.userData.hoverTarget = null;
    p.mesh.scale.setScalar(1.0);
  }

  lastFocusPanel = null; // camera pan drifts back to centre
  state.salvagedMemes.clear();
  state.selectedMeme = null;
  state.scoreRecorded = false;
  state.salvageRemaining = SALVAGE_CAPACITY_MAX;
  state.totalConsumption = 0;
  state.totalMemesConsumed = 0;
  state.autoScrollTime = 0;
  state.activeScrollTime = 0;
  state.isWarning = false;
  state.activeMeme = null;
  state.hoveredContemporary = null;
  state.lastCY = null;
  resetFomo();

  curationScoreEl.textContent = '0';
  curationRankEl.textContent = '-';
  activeMemeEl.textContent = '';
  activeDurEl.textContent = '';
  activeSalvageEl.classList.remove('visible');
  activeDescEl.classList.remove('visible');
  const cmContainer = document.getElementById('contemporary-memes');
  if (cmContainer) cmContainer.classList.add('hidden');
}

function enterAttract() {
  resetSession();
  state.mode = 'attract';
  reportPanel.classList.add('hidden');
  hideReportTooltip();
  document.getElementById('share-overlay').classList.add('hidden');
  overlay.classList.remove('hidden');
  hud.classList.add('hidden');
  memeInfo.classList.add('hidden');
  timelineWrapper.classList.add('hidden');
  metricsPanel.classList.add('hidden');
  ambientMetrics.classList.add('hidden');
  // Attract screen teases the day's top diggers
  const board = loadScoreboard();
  if (board.length > 0) {
    renderScoreboardInto(overlayBoardListEl, board, null, 3);
    overlayBoardEl.classList.remove('hidden');
  } else {
    overlayBoardEl.classList.add('hidden');
  }
  // Rewind to the bottom of the dig; the drift then climbs through all strata
  state.targetY = -2;
  state.autoScrolling = false; // resumes once the rewind settles (see animate)
  resetIdleTimer();
}

// Visitor walked away: wrap up their session
function endSession() {
  if (state.salvagedMemes.size > 0) {
    showConsumptionReport();
  } else {
    enterAttract();
  }
}

connectBtn.addEventListener('click', () => startExperience());
serialBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  startExperience();
  await initSerial();
});

// Any input while in attract mode starts a session (gallery visitors won't
// hunt for a button). The same gestures unlock audio if it's still suspended.
function ensureAudioRunning() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
for (const ev of ['mousedown', 'keydown', 'wheel', 'touchstart']) {
  window.addEventListener(ev, () => {
    ensureAudioRunning();
    if (state.mode === 'attract') startExperience();
  }, { capture: true, passive: true });
}

// ── Kiosk hardening ──
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('dragstart', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());

// Cursor fades out when the mouse rests
let cursorTimer = null;
function wakeCursor() {
  document.body.classList.remove('cursor-hidden');
  if (cursorTimer) clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('cursor-hidden'), 4000);
}
window.addEventListener('mousemove', wakeCursor);
wakeCursor();

// ─────────────────────────────────────────────
//  ANIMATE
// ─────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const t = performance.now() * 0.001;

  const depthFactor = Math.max(0, Math.min(1, state.currentY / (TOTAL_YEARS * K_Y)));
  const lerpFactor = 0.04 + depthFactor * 0.03;
  const prevY = state.currentY;
  state.currentY = THREE.MathUtils.lerp(state.currentY, state.targetY, lerpFactor);
  state.scrollSpeed = Math.abs(state.currentY - prevY);
  state.excavationDepth = state.currentY;

  // ── Exhibition idle loop ──
  const idleMs = performance.now() - lastInputAt;
  if (state.mode === 'active') {
    if (idleMs > IDLE_RESET_MS) {
      endSession();
    } else if (idleMs > IDLE_AUTO_SCROLL_MS) {
      state.autoScrolling = true;
    }
  } else if (state.mode === 'attract') {
    // Let the rewind glide settle, then drift endlessly through the strata
    state.autoScrolling = Math.abs(state.targetY - state.currentY) < 2;
  } else if (state.mode === 'report') {
    if (performance.now() - reportOpenedAt > REPORT_LINGER_MS) enterAttract();
  }
  autoIndicator.classList.toggle('hidden', !(state.autoScrolling && state.mode === 'active'));

  if (state.autoScrolling) {
    state.targetY += AUTO_SCROLL_SPEED * 0.016;
    if (state.targetY >= state.timeRange.max + 2) {
      state.targetY = -2;
    }
    clampY();
  }

  // Slow pan toward the focused fossil so the label always points at something visible
  const focusTargetX = (state.mode === 'active' && lastFocusPanel) ? lastFocusPanel.mesh.position.x * 0.55 : 0;
  camFocusX += (focusTargetX - camFocusX) * 0.02;

  camera.position.set(
    camFocusX + Math.sin(t * 0.1) * 0.5 + Math.sin(t * 0.3) * 0.2,
    state.currentY + 2,
    14 + Math.cos(t * 0.08) * 0.5
  );
  camera.lookAt(
    camFocusX + Math.sin(t * 0.15) * 0.3,
    state.currentY,
    -STRATA_Z_OFFSET
  );

  // Linear year mapping: floor prevents flicker at boundaries
  const progress = Math.max(0, Math.min(1, state.currentY / state.landfillDepth));
  const cYear = Math.floor(START_YEAR + progress * TOTAL_YEARS);
  currentYearEl.textContent = cYear;
  eraLabel.textContent = getEraLabel(cYear);
  eraLabelJp.textContent = getEraLabelJp(cYear);

  const PX = 56;
  const rulerOff = -((cYear - START_YEAR) / TOTAL_YEARS) * TOTAL_YEARS * PX;
  timelineRuler.style.transform = `translateX(${rulerOff}px)`;
  document.querySelectorAll('.timeline-year-text').forEach(el => {
    el.classList.toggle('active', el.id === `tick-year-${cYear}`);
  });

  // ── Find active meme — closest in current stratum, fallback to nearest ──
  let closestDist = Infinity;
  closest = null;
  // First: try memes born/died exactly in current year (non-long-lived preferred)
  const currentYearMemes = memePanels.filter(p => p.data.bornYear <= cYear && p.data.diedYear >= cYear && (p.data.diedYear - p.data.bornYear) < 10);
  const candidates = currentYearMemes.length > 0 ? currentYearMemes : memePanels.filter(p => p.data.bornYear <= cYear && p.data.diedYear >= cYear);
  for (const p of candidates) {
    const d = Math.abs(state.currentY - (p.yStart + p.yEnd) / 2);
    if (d < closestDist) {
      closestDist = d;
      closest = p;
    }
  }

  // Pinned focus (clicked in CONTEMPORARIES) overrides the auto pick — this is
  // how long-lived memes (Pepe, Doge, Rickroll…) become focusable and salvageable
  if (state.selectedMeme) {
    let pinned = null, pinnedD = Infinity;
    for (const p of memePanels) {
      if (p.data.id !== state.selectedMeme.id) continue;
      const d = Math.abs(state.currentY - (p.yStart + p.yEnd) / 2);
      if (d < pinnedD) { pinnedD = d; pinned = p; }
    }
    if (pinned) closest = pinned;
  }

  // ── Highlight active panel + salvage/decay mechanics ──
  for (const p of memePanels) {
    const isActive = closest && p === closest;
    const inRange = Math.abs(state.currentY - (p.yStart + p.yEnd) / 2) < K_Y * 1.5;
    const isSalvaged = state.salvagedMemes.has(p.data.id);
    // Contemporaries hover overrides normal opacity
    if (p.baseMat.userData.hoverTarget !== null && p.baseMat.userData.hoverTarget !== undefined) {
      p.baseMat.opacity = THREE.MathUtils.lerp(p.baseMat.opacity, p.baseMat.userData.hoverTarget, 0.15);
    } else if (isSalvaged) {
      // Salvaged: permanent golden glow, immune to decay
      p.baseMat.opacity = THREE.MathUtils.lerp(p.baseMat.opacity, 1.0, 0.03);
      // Subtle pulse for "immortal" status
      const pulse = 0.98 + Math.sin(t * 1.5) * 0.02;
      p.mesh.scale.setScalar(pulse);
    } else {
      // Unsalvaged: the longer a fossil has been consumed (in view), the more it
      // weathers into the stratum — only during a visitor's session
      if (inRange && state.mode === 'active') p.viewedS += 0.016;
      const decay = Math.min(0.35, p.viewedS * 0.006);
      // Non-focused neighbours sit back (0.55) so the bracketed fossil reads as "the one"
      const targetOpacity = isActive ? 1.0 : (inRange ? Math.max(0.15, 0.55 - decay) : Math.max(0.04, 0.12 - decay));
      p.baseMat.opacity = THREE.MathUtils.lerp(p.baseMat.opacity, targetOpacity, 0.04);
      p.mesh.scale.setScalar(THREE.MathUtils.lerp(p.mesh.scale.x, isActive ? 1.06 : 1.0, 0.1));
    }
  }

  // ── Vein pulse ──
  for (const v of veinMeshes) {
    const isActive = closest && closest.data.influencedBy && closest.data.influencedBy.some(id => {
      const parent = memeData.find(m => m.id === id);
      return parent && parent.color === v.parentColor;
    });
    v.mesh.material.opacity = THREE.MathUtils.lerp(
      v.mesh.material.opacity,
      isActive ? 0.6 : 0.25,
      0.04
    );
  }

  // ── Meme fullscreen background (very subtle, opacity 0.08) ──
  if (closest && closest.data.imageUrl) {
    if (state.activeMeme !== closest.data) {
      const cur = bgActiveIsFirst ? memeBgEl2 : memeBgEl;
      const next = bgActiveIsFirst ? memeBgEl : memeBgEl2;
      cur.classList.remove('active');
      next.style.backgroundImage = `url(${assetUrl(closest.data.imageUrl)})`;
      void next.offsetWidth;
      next.classList.add('active');
      bgActiveIsFirst = !bgActiveIsFirst;
    }
  } else {
    memeBgEl.classList.remove('active');
    memeBgEl2.classList.remove('active');
  }

  // ── Update active meme display ──
  if (state.hoveredContemporary) {
    // Hovering a contemporary: display managed by mouseenter handler, do nothing here
  } else if (closest) {
    if (state.activeMeme !== closest.data) {
      state.activeMeme = closest.data;
      activeMemeEl.textContent = closest.data.name;
      const dur = closest.data.diedYear - closest.data.bornYear || 1;
      const typeLabel = { sudden: '⚡', fade: '⋯', resurrected: '↺' }[closest.data.deathType] || '';
      activeDurEl.textContent = `${closest.data.bornYear} — ${closest.data.diedYear} · ${dur} YEAR${dur > 1 ? 'S' : ''} ${typeLabel}`;

      // Salvage value display
      const salvageValue = calculateSalvageValue(closest.data, CURRENT_YEAR);
      activeSalvageEl.textContent = `Salvage Value: ${(salvageValue * 100).toFixed(0)}%`;
      activeSalvageEl.classList.add('visible');

      // Description
      if (closest.data.description) {
        activeDescEl.textContent = closest.data.description;
        activeDescEl.classList.add('visible');
      }
    }

    // ── Contemporaries: always update when cYear changes (even if closest is same meme) ──
    if (state.lastCY !== cYear && closest) {
      state.lastCY = cYear;
      const cmList = document.getElementById('cm-list');
      if (cmList) {
        cmList.innerHTML = '';
        // Everything alive this year — long-lived memes (Pepe, Doge…) stay
        // selectable through their whole lifespan, not just near their birth
        const contemporaries = memeData
          .filter(m => m.bornYear <= cYear && m.diedYear >= cYear)
          .sort((a, b) => a.bornYear - b.bornYear)
          .slice(0, 8);
        const cmContainer = document.getElementById('contemporary-memes');
        if (contemporaries.length > 0) {
          cmContainer.classList.remove('hidden');
          for (const cm of contemporaries) {
            const item = document.createElement('div');
            item.className = 'cm-item';
            item.dataset.memeId = cm.id;
            item.innerHTML = `
              <span class="cm-name">${cm.name}</span>
              <span class="cm-years">${cm.bornYear}</span>
            `;
            item.addEventListener('mouseenter', () => {
              state.hoveredContemporary = cm;
              for (const p of memePanels) {
                p.baseMat.userData.hoverTarget = (p.data.id === cm.id) ? 1.0 : 0.06;
              }
              activeMemeEl.textContent = cm.name;
              const dur = cm.diedYear - cm.bornYear || 1;
              const typeLabel = { sudden: '⚡', fade: '⋯', resurrected: '↺' }[cm.deathType] || '';
              activeDurEl.textContent = `${cm.bornYear} — ${cm.diedYear} · ${dur} YEAR${dur > 1 ? 'S' : ''} ${typeLabel}`;
              const salvageValue = calculateSalvageValue(cm, CURRENT_YEAR);
              activeSalvageEl.textContent = `Salvage Value: ${(salvageValue * 100).toFixed(0)}%`;
              activeSalvageEl.classList.add('visible');
              if (cm.description) {
                activeDescEl.textContent = cm.description;
                activeDescEl.classList.add('visible');
              }
            });
            item.addEventListener('mouseleave', () => {
              state.hoveredContemporary = null;
              for (const p of memePanels) {
                p.baseMat.userData.hoverTarget = null;
              }
            });
            // Click pins the meme as the focused/salvageable target
            item.addEventListener('click', (e) => {
              e.stopPropagation();
              state.selectedMeme = cm;
              resetIdleTimer();
            });
            cmList.appendChild(item);
          }
        } else if (cmContainer) {
          cmContainer.classList.add('hidden');
        }
      }
    }
  } else {
    if (state.activeMeme !== null) {
      state.activeMeme = null;
      activeMemeEl.textContent = '';
      activeDurEl.textContent = '';
      activeSalvageEl.classList.remove('visible');
      activeDescEl.classList.remove('visible');
      const cmContainer = document.getElementById('contemporary-memes');
      if (cmContainer) cmContainer.classList.add('hidden');
    }
  }

  // ── Focus link: bracket + leader line tying the label to its fossil ──
  let focusPanel = closest;
  if (state.hoveredContemporary) {
    // Hovering a contemporary chip: point at that meme's nearest panel instead
    let best = null, bestD = Infinity;
    for (const p of memePanels) {
      if (p.data.id !== state.hoveredContemporary.id) continue;
      const d = Math.abs(state.currentY - (p.yStart + p.yEnd) / 2);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) focusPanel = best;
  }
  lastFocusPanel = focusPanel;
  updateFocusLink(focusPanel, t);

  // Contemporaries chip states: mark the focused one and the already-salvaged
  const cmListEl = document.getElementById('cm-list');
  if (cmListEl) {
    for (const el of cmListEl.children) {
      el.classList.toggle('active', !!closest && el.dataset.memeId === closest.data.id);
      el.classList.toggle('salvaged', state.salvagedMemes.has(el.dataset.memeId));
    }
  }

  // ── Update satirical metrics ──
  updateMetrics();

  // ── Track consumption for report ──
  state.totalMemesConsumed += state.consumptionVelocity * 0.016;
  if (state.autoScrolling) {
    state.autoScrollTime += 0.016;
  } else {
    state.activeScrollTime += 0.016;
  }

  // ── Ambient particles ──
  if (particles) {
    const arr = particles.geometry.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3 + 1] += Math.sin(i + t * 0.2) * 0.002;
      if (arr[i * 3 + 1] > state.timeRange.max + 5) arr[i * 3 + 1] = -2;
      if (arr[i * 3 + 1] < -2) arr[i * 3 + 1] = state.timeRange.max + 5;
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  // ── Packaging layer effect (newer memes = shinier plastic wrap) ──
  if (closest) {
    const memeAge = CURRENT_YEAR - closest.data.bornYear;
    const isNew = memeAge < 3;
    if (isNew && !state.salvagedMemes.has(closest.data.id)) {
      // "Fresh packaging" glow
      closest.baseMat.opacity = THREE.MathUtils.lerp(closest.baseMat.opacity, 1.0, 0.1);
      // Add slight scale pulse for "consumer appeal" (around the focused 1.06 base)
      const pulse = 1.06 + Math.sin(t * 3) * 0.02;
      closest.mesh.scale.setScalar(pulse);
    }
  }

  // ── Excavation dust ──
  if (dustParticles && state.scrollSpeed > 0.05) {
    const dustArr = dustParticles.geometry.attributes.position.array;
    const dustVel = dustParticles.userData.velocities;
    const dustOpacity = Math.min(0.5, state.scrollSpeed * 2);
    dustParticles.material.opacity = THREE.MathUtils.lerp(dustParticles.material.opacity, dustOpacity, 0.1);

    const spawnRate = Math.min(5, Math.floor(state.scrollSpeed * 3));
    for (let s = 0; s < spawnRate; s++) {
      const idx = Math.floor(Math.random() * DUST_COUNT);
      dustArr[idx * 3] = (Math.random() - 0.5) * 15;
      dustArr[idx * 3 + 1] = state.currentY + (Math.random() - 0.5) * 2;
      dustArr[idx * 3 + 2] = (Math.random() - 0.5) * 8;
      dustVel[idx * 3] = (Math.random() - 0.5) * 0.1;
      dustVel[idx * 3 + 1] = -Math.random() * 0.15;
      dustVel[idx * 3 + 2] = (Math.random() - 0.5) * 0.1;
    }

    for (let i = 0; i < DUST_COUNT; i++) {
      dustArr[i * 3] += dustVel[i * 3];
      dustArr[i * 3 + 1] += dustVel[i * 3 + 1];
      dustArr[i * 3 + 2] += dustVel[i * 3 + 2];
      if (dustArr[i * 3 + 1] < state.currentY - 5 || dustArr[i * 3 + 1] > state.currentY + 10) {
        dustArr[i * 3 + 1] = -100;
      }
    }
    dustParticles.geometry.attributes.position.needsUpdate = true;
  } else if (dustParticles) {
    dustParticles.material.opacity = THREE.MathUtils.lerp(dustParticles.material.opacity, 0, 0.05);
  }

  updateAudio();
  renderer.render(scene, camera);

  // Glitch overlay responds to consumption velocity — only while a visitor drives
  if (typeof glitchOverlay !== 'undefined') {
    glitchOverlay.update(state.mode === 'active' ? state.scrollSpeed : 0);
  }
}

// ── Focus link update (called every frame from animate) ──
const _focusTarget = new THREE.Vector3();
const _focusProj = new THREE.Vector3();
let lastFocusPanel = null; // camera pans toward this fossil (1-frame lag is fine)
let camFocusX = 0;

function updateFocusLink(panel, t) {
  const show = state.mode === 'active' && panel;
  focusBracket.visible = !!show;
  if (!show) {
    focusLineEl.setAttribute('opacity', '0');
    focusDotEl.setAttribute('opacity', '0');
    accentEl.style.opacity = '0';
    return;
  }

  // Bracket glides to the focused fossil, matching its size and tilt
  const geoP = panel.mesh.geometry.parameters;
  const targetW = geoP.width * panel.mesh.scale.x * 1.18;
  const targetH = geoP.height * panel.mesh.scale.y * 1.18;
  _focusTarget.set(panel.mesh.position.x, panel.mesh.position.y, panel.mesh.position.z + 0.08);
  focusBracket.position.lerp(_focusTarget, 0.18);
  focusBracket.scale.x += (targetW - focusBracket.scale.x) * 0.18;
  focusBracket.scale.y += (targetH - focusBracket.scale.y) * 0.18;
  focusBracket.rotation.x += (panel.mesh.rotation.x - focusBracket.rotation.x) * 0.18;
  focusBracket.rotation.y += (panel.mesh.rotation.y - focusBracket.rotation.y) * 0.18;
  focusBracket.rotation.z += (panel.mesh.rotation.z - focusBracket.rotation.z) * 0.18;

  const col = uiColorFor(panel.data);
  focusBracket.material.color.lerp(col, 0.2);
  focusBracket.material.opacity = 0.75 + Math.sin(t * 2.5) * 0.2;

  // Leader line: bottom edge of the bracket → top of the label block
  const cssCol = '#' + focusBracket.material.color.getHexString();
  _focusProj.copy(focusBracket.position);
  _focusProj.y -= focusBracket.scale.y / 2 + 0.05;
  _focusProj.project(camera);
  const onScreen = _focusProj.z < 1;
  const x1 = (_focusProj.x * 0.5 + 0.5) * innerWidth;
  const y1 = (-_focusProj.y * 0.5 + 0.5) * innerHeight;
  const rect = memeInfo.getBoundingClientRect();
  const x2 = rect.left + rect.width / 2;
  const y2 = rect.top - 8;
  // Only draw while the fossil sits above the label — no upward lines
  const lineVisible = onScreen && !memeInfo.classList.contains('hidden') && y1 < y2 - 12;
  focusLineEl.setAttribute('x1', x1);
  focusLineEl.setAttribute('y1', y1);
  focusLineEl.setAttribute('x2', x2);
  focusLineEl.setAttribute('y2', y2);
  focusLineEl.setAttribute('stroke', cssCol);
  focusLineEl.setAttribute('opacity', lineVisible ? '0.45' : '0');
  focusDotEl.setAttribute('cx', x1);
  focusDotEl.setAttribute('cy', y1);
  focusDotEl.setAttribute('fill', cssCol);
  focusDotEl.setAttribute('opacity', lineVisible ? '0.8' : '0');

  // Accent bar under the name in the same colour closes the loop
  accentEl.style.background = cssCol;
  accentEl.style.opacity = activeMemeEl.textContent ? '1' : '0';
}

// ── Helper: salvage value calculation (matches test) ──
function calculateSalvageValue(meme, currentYear) {
  const age = currentYear - meme.diedYear;
  const durability = { sudden: 0.1, fade: 0.3, resurrected: 0.8 }[meme.deathType] || 0.2;
  return Math.max(0, durability * (1 - age / 20));
}

// ─────────────────────────────────────────────
//  GLITCH OVERLAY — consumption velocity burns the screen
// ─────────────────────────────────────────────
class GlitchOverlay {
  constructor() {
    this.canvas = document.getElementById('glitch-overlay');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.burnIntensity = 0;
  }

  resize() {
    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;
  }

  update(scrollSpeed) {
    this.burnIntensity = Math.max(0, Math.min(1, (scrollSpeed - 0.3) * 2));
    this.canvas.style.opacity = this.burnIntensity * 0.6;

    if (this.burnIntensity < 0.01) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Glitch scan lines (RGB split)
    const lineCount = Math.floor(this.burnIntensity * 15);
    for (let i = 0; i < lineCount; i++) {
      const y = Math.random() * this.canvas.height;
      const h = 1 + Math.random() * 4 * this.burnIntensity;
      const shift = (Math.random() - 0.5) * 30 * this.burnIntensity;
      const r = Math.random();
      if (r < 0.33) {
        this.ctx.fillStyle = `rgba(255, 0, 0, ${0.3 * this.burnIntensity})`;
      } else if (r < 0.66) {
        this.ctx.fillStyle = `rgba(0, 255, 0, ${0.2 * this.burnIntensity})`;
      } else {
        this.ctx.fillStyle = `rgba(0, 0, 255, ${0.2 * this.burnIntensity})`;
      }
      this.ctx.fillRect(0, y, this.canvas.width, h);
      this.ctx.fillStyle = `rgba(255, 100, 0, ${0.15 * this.burnIntensity})`;
      this.ctx.fillRect(shift, y + 2, this.canvas.width * 0.3, h);
    }

    // Screen burn vignette
    const grad = this.ctx.createRadialGradient(
      this.canvas.width / 2, this.canvas.height / 2, 0,
      this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.6
    );
    grad.addColorStop(0, 'rgba(255, 80, 0, 0)');
    grad.addColorStop(1, `rgba(255, 60, 0, ${0.15 * this.burnIntensity})`);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Block noise
    const blockCount = Math.floor(this.burnIntensity * 8);
    for (let b = 0; b < blockCount; b++) {
      const bx = Math.random() * this.canvas.width;
      const by = Math.random() * this.canvas.height;
      const bw = 20 + Math.random() * 80;
      const bh = 10 + Math.random() * 40;
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.1 * this.burnIntensity})`;
      this.ctx.fillRect(bx, by, bw, bh);
    }
  }
}

// ─────────────────────────────────────────────
//  FOMO COUNTER — memes missed while scrolling fast
// ─────────────────────────────────────────────
const fomoCounter = document.getElementById('fomo-counter');
const fomoValue = document.getElementById('fomo-value');
let fomoCount = 0;
let lastFomoCheckY = -5;
const FOMO_THRESHOLD = 0.8;

function resetFomo() {
  fomoCount = 0;
  fomoValue.textContent = '0';
  fomoCounter.classList.add('hidden');
  fomoCounter.classList.remove('visible');
  lastFomoCheckY = state.currentY;
}

function updateFOMO() {
  // Only count "missed" memes while a visitor is actively driving
  if (state.mode !== 'active' || state.autoScrolling) {
    lastFomoCheckY = state.currentY;
    return;
  }
  if (state.scrollSpeed > FOMO_THRESHOLD) {
    const direction = state.targetY > lastFomoCheckY ? 1 : -1;
    const distance = Math.abs(state.currentY - lastFomoCheckY);
    if (distance > K_Y * 0.5) {
      const memesPassed = memePanels.filter(p => {
        const py = (p.yStart + p.yEnd) / 2;
        return (direction > 0 && py > lastFomoCheckY && py <= state.currentY) ||
               (direction < 0 && py < lastFomoCheckY && py >= state.currentY);
      }).length;
      if (memesPassed > 0) {
        fomoCount += memesPassed;
        fomoValue.textContent = fomoCount;
        fomoCounter.classList.remove('hidden');
        fomoCounter.classList.add('visible');
        fomoCounter.style.background = 'rgba(200, 30, 30, 0.95)';
        setTimeout(() => {
          fomoCounter.style.background = 'rgba(170, 17, 17, 0.85)';
        }, 200);
      }
    }
  }
  lastFomoCheckY = state.currentY;
}

setInterval(updateFOMO, 500);

// ── Report tooltip: hover a salvaged fossil → its description ──
const reportTooltip = document.getElementById('report-tooltip');

function showReportTooltip(item, meme) {
  reportTooltip.innerHTML =
    `<div class="rt-name">${meme.name}</div>` +
    `<div class="rt-meta">${meme.bornYear} — ${meme.diedYear} · ${getRarity(meme)}</div>` +
    `<div class="rt-desc">${meme.description || ''}</div>`;
  const rect = item.getBoundingClientRect();
  // Measure while invisible, then place centered above the item (10px gap),
  // clamped horizontally to the viewport with 12px padding
  reportTooltip.style.left = '0px';
  reportTooltip.style.top = '0px';
  const tw = reportTooltip.offsetWidth;
  const th = reportTooltip.offsetHeight;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - tw - 12));
  const top = Math.max(12, rect.top - th - 10);
  reportTooltip.style.left = left + 'px';
  reportTooltip.style.top = top + 'px';
  reportTooltip.classList.remove('hidden');
}

function hideReportTooltip() {
  reportTooltip.classList.add('hidden');
}

// ── Consumption Report ──
function showConsumptionReport() {
  if (state.mode === 'report') return;
  state.mode = 'report';
  reportOpenedAt = performance.now();

  document.getElementById('report-consumed').textContent = Math.floor(state.totalMemesConsumed);
  document.getElementById('report-salvaged').textContent = state.salvagedMemes.size;
  document.getElementById('report-missed').textContent = fomoCount;

  const rate = state.totalMemesConsumed > 0 ? Math.round((state.salvagedMemes.size / state.totalMemesConsumed) * 100) : 0;
  document.getElementById('report-rate').textContent = rate + '%';
  document.getElementById('report-auto').textContent = Math.floor(state.autoScrollTime) + 's';

  const grade = getGrade(Math.floor(state.totalMemesConsumed), state.salvagedMemes.size, fomoCount);
  document.getElementById('report-grade').textContent = grade;

  // Generate narrative from salvaged memes
  const salvagedList = Array.from(state.salvagedMemes).map(id => memeData.find(m => m.id === id)).filter(Boolean);

  // Curation score + rank
  const score = calculateCurationScore(salvagedList);
  document.getElementById('report-score').textContent = score.total;
  document.getElementById('report-combo').textContent = '+' + score.comboBonus;
  document.getElementById('report-rank').textContent = 'RANK ' + getCurationRank(score.total);

  // The report is addressed to the visitor's random identity
  document.querySelector('.report-sub').textContent =
    (state.visitorName ? state.visitorName + ' — ' : '') + '消費完了報告書';

  // Record this dig on the shared scoreboard (once per session, only if they
  // actually preserved something) and show where they landed
  let highlightTs = null;
  if (!state.scoreRecorded && state.salvagedMemes.size > 0) {
    state.scoreRecorded = true;
    const entry = {
      name: state.visitorName || generateVisitorName(),
      score: score.total,
      rank: getCurationRank(score.total),
      ts: Date.now(),
    };
    highlightTs = entry.ts;
    const board = loadScoreboard();
    board.push(entry);
    saveScoreboard(board);
  }
  renderScoreboardInto(scoreboardListEl, loadScoreboard(), highlightTs, 8);

  const mythicCount = salvagedList.filter(m => getRarity(m) === 'MYTHIC').length;
  const suddenCount = salvagedList.filter(m => m.deathType === 'sudden').length;
  const resurrectedCount = salvagedList.filter(m => m.deathType === 'resurrected').length;

  let narrative = '';
  if (state.salvagedMemes.size === 0) {
    narrative = 'You excavated 26 years of internet strata but preserved nothing. Everything fades.';
  } else if (mythicCount >= 2) {
    narrative = 'You preserved the immortals. These memes refused death — and you refused to forget them.';
  } else if (suddenCount >= 2) {
    narrative = 'You collected the ephemeral. Ghosts of moments that burned bright and vanished.';
  } else if (resurrectedCount >= 1) {
    narrative = 'You recognized what refuses to die. The phoenix memes live in your archive.';
  } else {
    narrative = 'You curated a balanced history. Neither spectacle nor eternity — just human memory.';
  }
  document.getElementById('report-desc').textContent = narrative;
  state.lastNarrative = narrative;

  // Collection grid
  const grid = document.getElementById('report-collection');
  grid.innerHTML = '';
  for (const memeId of state.salvagedMemes) {
    const meme = memeData.find(m => m.id === memeId);
    if (!meme) continue;
    const item = document.createElement('div');
    item.className = 'collection-item';
    item.style.backgroundImage = `url(${assetUrl(meme.imageUrl)})`;
    item.setAttribute('data-rarity', getRarity(meme));
    // Hovering a fossil reveals its epitaph (shared fixed tooltip)
    item.addEventListener('mouseenter', () => showReportTooltip(item, meme));
    item.addEventListener('mouseleave', hideReportTooltip);
    grid.appendChild(item);
  }

  // Forgotten count
  const forgottenEl = document.getElementById('report-forgotten');
  if (forgottenEl) {
    const forgottenCount = memeData.length - state.salvagedMemes.size;
    forgottenEl.querySelector('.forgotten-count').textContent =
      `${forgottenCount} fossil${forgottenCount !== 1 ? 's' : ''} were left to decay`;
  }

  reportPanel.classList.remove('hidden');
  document.getElementById('share-btn').classList.toggle('hidden', state.salvagedMemes.size === 0);
}

// "EXCAVATE AGAIN" — a visitor is still here: reset and hand them a fresh dig
function hideConsumptionReport() {
  if (state.mode !== 'report') return;
  reportPanel.classList.add('hidden');
  hideReportTooltip();
  resetSession();
  state.mode = 'active';
  // Rewind to the bottom; the long glide back through the strata is the transition
  state.targetY = -2;
  resetIdleTimer();
}

reportCloseBtn.addEventListener('click', hideConsumptionReport);

// ─────────────────────────────────────────────
//  SHARE FLOW — 発掘証明書 (Excavation Certificate)
//  Kiosk has no SNS login: certificate is rendered BIG so visitors can
//  photograph it, plus a QR code opening a pre-filled X compose intent.
// ─────────────────────────────────────────────
const shareOverlay = document.getElementById('share-overlay');
const shareBtn = document.getElementById('share-btn');
const shareCloseBtn = document.getElementById('share-close');
const shareCardCanvas = document.getElementById('share-card');
const shareQrCanvas = document.getElementById('share-qr');

function loadImageSafe(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function renderShareCard(canvas, salvagedList, narrative = '') {
  const W = 900, H = 1150, SCALE = 2;
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  // Display size is handled by CSS (#share-card: height min(82vh, 920px)) so
  // the certificate always fits the screen; only the aspect ratio is fixed here
  canvas.style.aspectRatio = `${W} / ${H}`;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = '#12100d';
  ctx.fillRect(0, 0, W, H);

  // Paper-of-darkness noise
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.random() < 0.04) {
      const a = Math.random() * 0.03 * 255;
      d[i] = Math.min(255, d[i] + a);
      d[i + 1] = Math.min(255, d[i + 1] + a);
      d[i + 2] = Math.min(255, d[i + 2] + a);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Double rule border
  ctx.strokeStyle = 'rgba(255,204,102,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.strokeStyle = 'rgba(255,204,102,0.3)';
  ctx.strokeRect(36, 36, W - 72, H - 72);

  // Header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8e0d8';
  ctx.font = '300 54px Outfit, sans-serif';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.35em';
  ctx.fillText('MEME STRATUM', W / 2 + 20, 130);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  ctx.font = '16px Inter, sans-serif';
  ctx.fillStyle = 'rgba(232,224,216,0.5)';
  ctx.fillText('ミームの地層 — 発掘証明書 / EXCAVATION CERTIFICATE', W / 2, 165);

  // Gold rule
  ctx.strokeStyle = 'rgba(255,204,102,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 100, 190);
  ctx.lineTo(W / 2 + 100, 190);
  ctx.stroke();

  // Digger ID
  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = 'rgba(232,224,216,0.45)';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.2em';
  ctx.fillText('DIGGER ID', W / 2, 235);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  ctx.font = '700 34px Outfit, sans-serif';
  ctx.fillStyle = '#ffcc66';
  ctx.fillText(state.visitorName || '—', W / 2, 280);

  // Fossil tiles — 150px, 5 across, centered as a group
  const TILE = 150, GAP = 16;
  const n = salvagedList.length;
  const totalW = n * TILE + (n - 1) * GAP;
  const startX = (W - totalW) / 2;
  const tileY = 330;

  const images = await Promise.all(salvagedList.map(m => m.imageUrl ? loadImageSafe(assetUrl(m.imageUrl)) : Promise.resolve(null)));

  const rarityColor = (r) => ({
    MYTHIC: '#ffcc66',
    RARE: '#cc99ff',
    UNCOMMON: '#88aacc',
    DISPOSABLE: 'rgba(232,224,216,0.4)',
  }[r] || 'rgba(232,224,216,0.4)');

  for (let i = 0; i < n; i++) {
    const meme = salvagedList[i];
    const img = images[i];
    const x = startX + i * (TILE + GAP);
    const y = tileY;

    if (img) {
      const a = img.width / img.height;
      let sx, sy, sw, sh;
      if (a > 1) {
        sh = img.height; sw = img.height;
        sx = (img.width - sw) / 2; sy = 0;
      } else {
        sw = img.width; sh = img.width;
        sx = 0; sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, TILE, TILE);
    } else {
      ctx.fillStyle = (meme.color || '#888888') + '55';
      ctx.fillRect(x, y, TILE, TILE);
    }

    ctx.strokeStyle = 'rgba(232,224,216,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);

    // Name (ellipsized to tile width)
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = 'rgba(232,224,216,0.8)';
    let name = meme.name || '';
    while (ctx.measureText(name).width > TILE - 6 && name.length > 1) {
      name = name.slice(0, -1);
    }
    if (name !== meme.name && name.length > 1) name = name.slice(0, -1) + '…';
    ctx.fillText(name, x + TILE / 2, y + TILE + 16);

    // Lifespan
    ctx.font = '9px Inter, sans-serif';
    ctx.fillStyle = 'rgba(232,224,216,0.5)';
    ctx.fillText(`${meme.bornYear}–${meme.diedYear}`, x + TILE / 2, y + TILE + 30);

    // Rarity
    const rarity = getRarity(meme);
    ctx.font = '9px Inter, sans-serif';
    ctx.fillStyle = rarityColor(rarity);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.15em';
    ctx.fillText(rarity, x + TILE / 2, y + TILE + 44);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  // Score block — small label, big number, rank
  const score = calculateCurationScore(salvagedList);
  const rank = getCurationRank(score.total);
  ctx.font = '10px Inter, sans-serif';
  ctx.fillStyle = 'rgba(232,224,216,0.45)';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.25em';
  ctx.fillText('CURATION SCORE', W / 2, 630);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  ctx.font = '700 64px Outfit, sans-serif';
  ctx.fillStyle = '#ffcc66';
  ctx.fillText(String(score.total), W / 2, 700);

  ctx.font = '16px Inter, sans-serif';
  ctx.fillStyle = '#e8e0d8';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.2em';
  ctx.fillText(`RANK ${rank}`, W / 2, 735);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  // Narrative — the report's verdict, word-wrapped and centered
  if (narrative) {
    ctx.font = 'italic 300 15px Inter, sans-serif';
    ctx.fillStyle = 'rgba(232,224,216,0.6)';
    const maxW = 640;
    const words = narrative.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 800 + i * 24));
  }

  // Date
  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = 'rgba(232,224,216,0.45)';
  const dateStr = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillText(dateStr, W / 2, 880);

  // Strata band — a quiet echo of the geological piece
  const strataColors = [];
  const fillers = ['#443322', '#8a8078'];
  for (let i = 0; i < 7; i++) {
    const memeColor = salvagedList[i % Math.max(1, salvagedList.length)]?.color;
    strataColors.push(i % 2 === 0 && memeColor ? memeColor : fillers[i % fillers.length]);
  }
  ctx.save();
  ctx.globalAlpha = 0.28;
  let strataY = 940;
  for (let i = 0; i < 7; i++) {
    const h = 3 + ((i * 7) % 4); // 3–6px
    ctx.fillStyle = strataColors[i];
    ctx.fillRect(60, strataY, W - 120, h);
    strataY += h + 10 + ((i * 5) % 5); // 10–14px gaps
  }
  ctx.restore();

  // Footer
  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = 'rgba(232,224,216,0.35)';
  ctx.fillText('消費完了報告書 · 53体のうち5体だけが記憶される · #MemeStratum', W / 2, H - 50);
}

async function openShareOverlay() {
  const salvagedList = Array.from(state.salvagedMemes)
    .map(id => memeData.find(m => m.id === id)).filter(Boolean);

  await renderShareCard(shareCardCanvas, salvagedList, state.lastNarrative || '');
  shareOverlay.classList.remove('hidden');

  const score = calculateCurationScore(salvagedList);
  const rank = getCurationRank(score.total);
  const names = salvagedList.map(m => m.name).join(', ');
  const text = `MEME STRATUM — 発掘報告\nDIGGER: ${state.visitorName}\n永久保存: ${names}\nSCORE ${score.total} / RANK ${rank}\n#MemeStratum`;
  const url = 'https://x.com/intent/post?text=' + encodeURIComponent(text);
  // Standard dark-on-light modules: inverted QRs fail on many phone scanners
  QRCode.toCanvas(shareQrCanvas, url, { width: 200, margin: 2, color: { dark: '#12100d', light: '#e8e0d8' } });
}

shareBtn.addEventListener('click', openShareOverlay);
shareCloseBtn.addEventListener('click', () => shareOverlay.classList.add('hidden'));

// ── Init ──
const glitchOverlay = new GlitchOverlay();
initThree();
buildTimeline();
enterAttract();
animate();
