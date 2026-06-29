import * as THREE from 'three';
import { memeData } from './memeData.js';

// ─────────────────────────────────────────────
//  MEME STRATUM — Kinetic Typography Art Piece
//
//  Concept:
//    - 3D canvas is a warm wall with pinned paper notes
//    - Scrolling through time reveals meme names as huge text
//    - Current year is displayed as a giant semi-transparent number
//    - Meme images appear as pinned notes on the timeline wall
//    - Popularity duration determines paper size
//    - Older memes show yellowed, worn paper with stains
// ─────────────────────────────────────────────

const K_Z = 10;
const CURRENT_YEAR = 2026;
const START_YEAR   = 2000;
const TOTAL_YEARS  = CURRENT_YEAR - START_YEAR;

// ── State ──
const state = {
  currentZ: -245,
  targetZ:  -245,
  timeRange: { min: -TOTAL_YEARS * K_Z, max: 0 },
  activeMeme: null,
  isSerialConnected: false,
  autoScrolling: false,
};

// ── Idle / auto-scroll ──
let idleTimer = null;
const IDLE_DELAY = 20000;
const AUTO_SCROLL_SPEED = 1.5;
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  state.autoScrolling = false;
  idleTimer = setTimeout(() => { state.autoScrolling = true; }, IDLE_DELAY);
}

// ── DOM ──
const overlay        = document.getElementById('overlay');
const connectBtn     = document.getElementById('connect-btn');
const serialBtn      = document.getElementById('serial-btn');
const hud            = document.getElementById('hud');
const currentYearEl  = document.getElementById('current-year');
const eraLabel       = document.getElementById('era-label');
const memeInfo       = document.getElementById('meme-info');
const activeMemeEl   = document.getElementById('active-meme');
const activeDurEl    = document.getElementById('active-duration');
const memeBgEl       = document.getElementById('meme-bg-1');
const memeBgEl2      = document.getElementById('meme-bg-2');
let bgActiveIsFirst  = true;
const serialDot      = document.getElementById('serial-dot');
const serialStatus   = document.getElementById('serial-status');
const serialIndicator = document.getElementById('serial-indicator');
const webglCanvas    = document.getElementById('webgl');
const timelineWrapper = document.getElementById('timeline-wrapper');
const timelineRuler   = document.getElementById('timeline-ruler');

// ── Three.js ──
let scene, camera, renderer;
let particles;
const PARTICLE_COUNT = 1200;
const floatingPanels = [];

// Audio
let audioCtx, droneOsc, subOsc, filterNode, gainNode;

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

// ─────────────────────────────────────────────
//  MEME TEXTURE — paper note pinned to wall
// ─────────────────────────────────────────────
function lighten(hex, f) {
  const r = Math.min(255, parseInt(hex.slice(1,3),16) + (255-parseInt(hex.slice(1,3),16))*f|0);
  const g = Math.min(255, parseInt(hex.slice(3,5),16) + (255-parseInt(hex.slice(3,5),16))*f|0);
  const b = Math.min(255, parseInt(hex.slice(5,7),16) + (255-parseInt(hex.slice(5,7),16))*f|0);
  return `rgb(${r},${g},${b})`;
}
function darken(hex, f) {
  const r = parseInt(hex.slice(1,3),16) * f | 0;
  const g = parseInt(hex.slice(3,5),16) * f | 0;
  const b = parseInt(hex.slice(5,7),16) * f | 0;
  return `rgb(${r},${g},${b})`;
}

function createMemeTexture(meme) {
  const age = CURRENT_YEAR - meme.bornYear;
  const ageFactor = Math.min(age / 26, 1); // 0 = fresh, 1 = oldest
  const S = 512;
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d');
  cvs.width = S; cvs.height = S;

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;

  const M = 10; // margin for shadow

  function draw(img) {
    // ── Drop shadow ──
    const shadowAlpha = 0.12 + ageFactor * 0.06;
    ctx.fillStyle = `rgba(40, 30, 20, ${shadowAlpha})`;
    ctx.fillRect(M + 3, M + 4, S - M * 2, S - M * 2);

    // ── Paper base — yellowed with age ──
    const y = ageFactor * 30;
    ctx.fillStyle = `rgb(${250 - y * 0.3 | 0}, ${242 - y * 0.2 | 0}, ${220 - y * 0.6 | 0})`;
    ctx.fillRect(M, M, S - M * 2, S - M * 2);

    // ── Paper fibre noise ──
    const imageData = ctx.getImageData(0, 0, S, S);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 6;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    ctx.putImageData(imageData, 0, 0);

    // ── Stains from age ──
    if (ageFactor > 0.05) {
      for (let s = 0; s < 5 + ageFactor * 15; s++) {
        const sx = M + 20 + Math.random() * (S - M * 2 - 40);
        const sy = M + 20 + Math.random() * (S - M * 2 - 40);
        const sr = 5 + Math.random() * 20;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        grad.addColorStop(0, `rgba(160, 130, 80, ${ageFactor * 0.1})`);
        grad.addColorStop(1, 'rgba(160, 130, 80, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Corner wear ──
    const cornerR = 20 + ageFactor * 30;
    for (const [cx, cy] of [[M, M], [S - M, M], [M, S - M], [S - M, S - M]]) {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cornerR);
      grad.addColorStop(0, `rgba(120, 90, 60, ${ageFactor * 0.15})`);
      grad.addColorStop(1, 'rgba(120, 90, 60, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, cornerR, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Meme image ──
    if (img) {
      const m = 40;
      const ds = S - M * 2 - m * 2;
      const a = img.width / img.height;
      let w = ds, h = ds;
      if (a > 1) h = ds / a;
      else w = ds * a;
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      ctx.restore();
    }

    // ── Duration timeline bar ──
    const barY = S - M - 40;
    const barH = 6;
    const barMarginX = 50;
    const barW = S - M * 2 - barMarginX * 2;
    const barLeft = S / 2 - barW / 2;

    // Background track (2000 → 2026)
    ctx.fillStyle = 'rgba(40, 30, 20, 0.1)';
    ctx.fillRect(barLeft, barY, barW, barH);

    // Active period (bornYear → diedYear)
    const totalSpan = CURRENT_YEAR - START_YEAR;
    const t0 = (meme.bornYear - START_YEAR) / totalSpan;
    const t1 = (meme.diedYear - START_YEAR) / totalSpan;
    const activeLeft = barLeft + t0 * barW;
    const activeW = (t1 - t0) * barW;

    const barGrad = ctx.createLinearGradient(activeLeft, barY, activeLeft + activeW, barY);
    barGrad.addColorStop(0, meme.color + 'cc');
    barGrad.addColorStop(1, meme.color + '66');
    ctx.fillStyle = barGrad;
    ctx.fillRect(activeLeft, barY, activeW, barH);

    // Year labels
    ctx.fillStyle = `rgba(40, 30, 20, ${0.3 + ageFactor * 0.2})`;
    ctx.font = `${S * 0.022}px Inter, "Helvetica Neue", sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(meme.bornYear, barLeft, barY - 2);
    ctx.textAlign = 'right';
    ctx.fillText(meme.diedYear, barLeft + barW, barY - 2);

    // ── Meme name at bottom ──
    ctx.fillStyle = `rgba(40, 30, 20, ${0.4 + ageFactor * 0.2})`;
    ctx.font = `bold ${S * 0.03}px Inter, "Helvetica Neue", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(meme.name, S / 2, S - M - 5);

    // ── Thumbtack at top centre ──
    const px = S / 2;
    const py = M + 10;

    // Pin shadow
    ctx.beginPath();
    ctx.arc(px + 2, py + 3, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    // Pin head (meme colour)
    const pinGrad = ctx.createRadialGradient(px - 2, py - 1, 1, px, py, 8);
    pinGrad.addColorStop(0, lighten(meme.color, 0.5));
    pinGrad.addColorStop(0.4, meme.color);
    pinGrad.addColorStop(1, darken(meme.color, 0.4));
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = pinGrad;
    ctx.fill();

    // Pin highlight
    ctx.beginPath();
    ctx.arc(px - 2, py - 2, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    tex.needsUpdate = true;
  }

  draw(null);
  if (meme.imageUrl) {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => draw(im);
    im.onerror = () => {};
    im.src = meme.imageUrl;
  }
  return tex;
}

// ─────────────────────────────────────────────
//  THREE.JS SCENE — atmospheric background
// ─────────────────────────────────────────────
function initThree() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#c4b8a5', 0.006);

  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
  camera.position.set(0, 0, 10);

  renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  // Warm wall lighting
  scene.add(new THREE.AmbientLight('#fff8f0', 0.7));
  const dir = new THREE.DirectionalLight('#ffe8d0', 0.5);
  dir.position.set(5, 10, 15);
  scene.add(dir);

  // ── Floating meme panels in 3D space ──
  // Positioned along Z-axis (time) as pinned notes on a wall
  const sorted = [...memeData].sort((a,b) => a.bornYear - b.bornYear);
  const LANE_COUNT = 10;
  const LANE_W = 0.5;
  const laneMap = new Map();
  const laneNextY = new Float64Array(LANE_COUNT);
  const laneEndZ  = new Float64Array(LANE_COUNT).fill(-Infinity);

  // Round-robin lane assignment with vertical stacking within each lane
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const lane = i % LANE_COUNT;
    laneMap.set(m.id, lane);
  }

  for (const meme of memeData) {
    const dur   = Math.max(1, meme.diedYear - meme.bornYear);
    const lenZ  = Math.max(2, dur * K_Z);
    const posZ  = (meme.bornYear - CURRENT_YEAR) * K_Z + lenZ / 2;
    const lane  = laneMap.get(meme.id);
    const posX  = (lane - (LANE_COUNT - 1) / 2) * LANE_W;

    const tex  = createMemeTexture(meme);
    const mat  = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Exponential panel sizing — duration difference felt dramatically
    const panelSize = 1.0 + (Math.exp(dur / 10) - 1) * 0.7; // 1.07–6.62
    const panelH = panelSize * 1.35;
    const geo  = new THREE.PlaneGeometry(panelSize, panelH);
    const mesh = new THREE.Mesh(geo, mat);

    // Stack vertically within lane to avoid overlap (increment offset)
    const yPos = Math.max(-2.2, Math.min(2.2, (laneNextY[lane]++ / 4) * 2.0 - 1.5));
    const zJitter = (Math.random() - 0.5) * 0.3;
    mesh.position.set(posX, yPos, posZ + zJitter);
    mesh.rotation.z = (Math.random() - 0.5) * 0.06;
    scene.add(mesh);

    // ── Duration trail: meme-coloured thread from birth to death ──
    const startZ = (meme.bornYear - CURRENT_YEAR) * K_Z;
    const endZ   = startZ + lenZ;
    const trailCurve = new THREE.LineCurve3(
      new THREE.Vector3(posX, yPos, startZ),
      new THREE.Vector3(posX, yPos, endZ)
    );
    const trailMat = new THREE.MeshBasicMaterial({
      color: meme.color,
      transparent: true,
      opacity: 0.2,
    });
    const trail = new THREE.Mesh(
      new THREE.TubeGeometry(trailCurve, 1, 0.015, 6, false),
      trailMat
    );
    scene.add(trail);

    // ── End marker: tiny dot at death year ──
    const dotMat = new THREE.MeshBasicMaterial({
      color: meme.color,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 6), dotMat);
    dot.position.set(posX, yPos, endZ);
    scene.add(dot);

    floatingPanels.push({
      mesh, data: meme,
      startZ,
      endZ,
      posX, yPos,
      baseMat: mat,
    });
  }

  // ── Particles: dust / sediment in the void ──
  const pg = new THREE.BufferGeometry();
  const pp = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pp[i*3]   = (Math.random() - 0.5) * 30;
    pp[i*3+1] = (Math.random() - 0.5) * 15;
    pp[i*3+2] = Math.random() * -300 + 15;
  }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  particles = new THREE.Points(pg, new THREE.PointsMaterial({
    color: '#c4b09a',
    size: 0.035,
    transparent: true,
    opacity: 0.2,
    sizeAttenuation: true,
  }));
  scene.add(particles);

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
//  CONTROLS
// ─────────────────────────────────────────────
let isDragging = false, lastY = 0;

window.addEventListener('wheel', e => {
  state.targetZ -= e.deltaY * 0.1;
  clampZ();
  resetIdleTimer();
}, { passive: true });

window.addEventListener('mousedown', e => { isDragging = true; lastY = e.clientY; resetIdleTimer(); });
window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  state.targetZ += (e.clientY - lastY) * 0.15;
  lastY = e.clientY;
  clampZ();
  resetIdleTimer();
});
window.addEventListener('mouseup', () => { isDragging = false; resetIdleTimer(); });

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight')   state.targetZ -= K_Z;
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') state.targetZ += K_Z;
  clampZ();
  resetIdleTimer();
});

let lastTouchY = 0;
window.addEventListener('touchstart', e => { lastTouchY = e.touches[0].clientY; resetIdleTimer(); });
window.addEventListener('touchmove', e => {
  state.targetZ += (e.touches[0].clientY - lastTouchY) * 0.12;
  lastTouchY = e.touches[0].clientY;
  clampZ();
  resetIdleTimer();
}, { passive: true });

function clampZ() {
  state.targetZ = Math.max(state.timeRange.min - 5, Math.min(state.timeRange.max + 5, state.targetZ));
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
        if (!isNaN(v)) { state.targetZ -= v * 2.5; clampZ(); }
      }
    }
  } catch(e) { console.warn('Serial:', e); }
}

// ─────────────────────────────────────────────
//  AUDIO
// ─────────────────────────────────────────────
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  droneOsc = audioCtx.createOscillator(); droneOsc.type = 'triangle'; droneOsc.frequency.value = 55;
  subOsc   = audioCtx.createOscillator(); subOsc.type = 'sine'; subOsc.frequency.value = 27.5;
  filterNode = audioCtx.createBiquadFilter(); filterNode.type = 'lowpass'; filterNode.frequency.value = 100; filterNode.Q.value = 3;
  gainNode = audioCtx.createGain(); gainNode.gain.value = 0.0001;
  droneOsc.connect(filterNode); subOsc.connect(filterNode);
  filterNode.connect(gainNode); gainNode.connect(audioCtx.destination);
  droneOsc.start(); subOsc.start();
  gainNode.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 5);
}

function updateAudio() {
  if (!audioCtx) return;
  const depth = Math.max(0, Math.min(1, -state.currentZ / (TOTAL_YEARS * K_Z)));
  const speed = Math.abs(state.targetZ - state.currentZ);
  droneOsc.frequency.setTargetAtTime(55 - depth * 20 + speed * 0.3, audioCtx.currentTime, 0.1);
  filterNode.frequency.setTargetAtTime(100 + speed * 10 + depth * 40, audioCtx.currentTime, 0.15);
}

// ─────────────────────────────────────────────
//  STARTUP
// ─────────────────────────────────────────────
function startExperience() {
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  memeInfo.classList.remove('hidden');
  serialIndicator.classList.remove('hidden');
  timelineWrapper.classList.remove('hidden');
  initAudio();
  resetIdleTimer();
}

connectBtn.addEventListener('click', () => startExperience());
serialBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  startExperience();
  await initSerial();
});

// ─────────────────────────────────────────────
//  ANIMATE
// ─────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  // Smooth interpolation
  state.currentZ = THREE.MathUtils.lerp(state.currentZ, state.targetZ, 0.06);

  // Auto-scroll when idle — slowly travel forward in time
  if (state.autoScrolling) {
    state.targetZ += AUTO_SCROLL_SPEED * 0.016;
    if (state.targetZ >= state.timeRange.max + 5) {
      state.targetZ = state.timeRange.min - 5;
    }
    clampZ();
  }

  // Camera follows Z (time travel) — subtle sway
  const t = performance.now() * 0.001;
  camera.position.set(
    Math.sin(t * 0.15) * 0.8,
    Math.cos(t * 0.12) * 0.4,
    state.currentZ + 10
  );
  camera.lookAt(0, 0, state.currentZ);

  // ── Year display ──
  const year = Math.round(CURRENT_YEAR + state.currentZ / K_Z);
  const cYear = Math.max(START_YEAR, Math.min(CURRENT_YEAR, year));
  currentYearEl.textContent = cYear;
  eraLabel.textContent = getEraLabel(cYear);

  // ── Timeline ruler ──
  const PX = 56;
  const rulerOff = -((cYear - START_YEAR) / TOTAL_YEARS) * TOTAL_YEARS * PX;
  timelineRuler.style.transform = `translateX(${rulerOff}px)`;
  document.querySelectorAll('.timeline-year-text').forEach(el => {
    el.classList.toggle('active', el.id === `tick-year-${cYear}`);
  });

  // ── Find active meme (closest panels at current Z) ──
  let closest = null, closestDist = Infinity;
  for (const p of floatingPanels) {
    if (state.currentZ >= p.startZ && state.currentZ <= p.endZ) {
      const d = Math.abs(state.currentZ - (p.startZ + p.endZ) / 2);
      if (d < closestDist) { closestDist = d; closest = p; }
    }
  }

  // ── Highlight active panel, dim others ──
  for (const p of floatingPanels) {
    const inRange = state.currentZ >= p.startZ && state.currentZ <= p.endZ;
    const isActive = closest && p === closest;
    p.baseMat.opacity = THREE.MathUtils.lerp(
      p.baseMat.opacity,
      isActive ? 1.0 : (inRange ? 0.8 : 0.15),
      0.06
    );
  }

  // ── Meme fullscreen background (cross-fade between two layers) ──
  if (closest && closest.data.imageUrl) {
    if (state.activeMeme !== closest.data) {
      const cur = bgActiveIsFirst ? memeBgEl2 : memeBgEl;
      const next = bgActiveIsFirst ? memeBgEl : memeBgEl2;
      cur.classList.remove('active');
      next.style.backgroundImage = `url(${closest.data.imageUrl})`;
      // force reflow so the browser registers the new image
      void next.offsetWidth;
      next.classList.add('active');
      bgActiveIsFirst = !bgActiveIsFirst;
    }
  } else {
    memeBgEl.classList.remove('active');
    memeBgEl2.classList.remove('active');
  }

  // ── Update active meme display ──
  if (closest) {
    if (state.activeMeme !== closest.data) {
      state.activeMeme = closest.data;
      activeMemeEl.textContent = closest.data.name;
      const dur = closest.data.diedYear - closest.data.bornYear || 1;
      activeDurEl.textContent = `${closest.data.bornYear} — ${closest.data.diedYear}  ·  ${dur} YEAR${dur > 1 ? 'S' : ''}`;
    }
  } else {
    if (state.activeMeme !== null) {
      state.activeMeme = null;
      activeMemeEl.textContent = '';
      activeDurEl.textContent = '';
    }
  }

  // ── Particles drift ──
  if (particles) {
    const arr = particles.geometry.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i*3+1] -= 0.005 + Math.sin(i + t * 0.3) * 0.002;
      if (arr[i*3+1] < -8) arr[i*3+1] = 8;
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  updateAudio();
  renderer.render(scene, camera);
}

// ── Init ──
initThree();
buildTimeline();
animate();
