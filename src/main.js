import * as THREE from 'three';
import { memeData } from './memeData.js';

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
const state = {
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
};

// ── Idle / auto-scroll ──
let idleTimer = null;
const IDLE_DELAY = 20000;
const AUTO_SCROLL_SPEED = 1.2;
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  state.autoScrolling = false;
  idleTimer = setTimeout(() => { state.autoScrolling = true; }, IDLE_DELAY);
}

// ── DOM ──
const overlay = document.getElementById('overlay');
const connectBtn = document.getElementById('connect-btn');
const serialBtn = document.getElementById('serial-btn');
const hud = document.getElementById('hud');
const currentYearEl = document.getElementById('current-year');
const eraLabel = document.getElementById('era-label');
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
const velocityEl = document.getElementById('consumption-velocity');
const velocityFill = document.getElementById('velocity-fill');
const depthEl = document.getElementById('landfill-depth');
const salvageCapEl = document.getElementById('salvage-capacity');
const warningEl = document.querySelector('#metrics-panel .warning');
const salvageBtn = document.getElementById('salvage-btn');

// ── Three.js ──
let scene, camera, renderer;
let particles, dustParticles;
const PARTICLE_COUNT = 2000;
const DUST_COUNT = 800;
const strataMeshes = [];
const memePanels = [];
const veinMeshes = [];

// Audio
let audioCtx, droneOsc, subOsc, filterNode, gainNode, noiseNode, noiseGain;

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
    im.onerror = () => {};
    im.src = meme.imageUrl;
  }
  return tex;
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
    const strataMat = new THREE.MeshStandardMaterial({
      map: strataTex,
      roughness: 0.7 + ageFactor * 0.3,
      metalness: 0.0,
      transparent: true,
      opacity: 0.85 + ageFactor * 0.1,
    });

    const strataMesh = new THREE.Mesh(strataGeo, strataMat);
    strataMesh.position.set(0, currentY + layerThickness / 2, -STRATA_Z_OFFSET);
    scene.add(strataMesh);

    strataMeshes.push({
      mesh: strataMesh,
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
      });
    }

    currentY += layerThickness;
  }

  state.landfillDepth = currentY;

  // ── Mineral veins ──
  const memeMap = new Map(memeData.map(m => [m.id, m]));
  for (const meme of memeData) {
    if (!meme.influencedBy || meme.influencedBy.length === 0) continue;
    for (const parentId of meme.influencedBy) {
      const parent = memeMap.get(parentId);
      if (!parent) continue;
      const parentStrata = strataMeshes.find(s => s.year >= parent.bornYear && s.year <= parent.diedYear);
      const childStrata = strataMeshes.find(s => s.year >= meme.bornYear && s.year <= meme.diedYear);
      if (!parentStrata || !childStrata) continue;

      const startY = parentStrata.yStart + (parentStrata.yEnd - parentStrata.yStart) * 0.5;
      const endY = childStrata.yStart + (childStrata.yEnd - childStrata.yStart) * 0.5;
      const startX = (Math.random() - 0.5) * 4;
      const endX = (Math.random() - 0.5) * 4;
      const midY = (startY + endY) / 2;
      const midX = (startX + endX) / 2 + (Math.random() - 0.5) * 3;
      const midZ = -STRATA_Z_OFFSET + (Math.random() - 0.5) * 2;

      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(startX, startY, midZ + 1),
        new THREE.Vector3(midX, midY, midZ - 1),
        new THREE.Vector3(endX, endY, midZ + 0.5)
      );

      const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.04, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: parent.color,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tube);
      veinMeshes.push({ mesh: tube, parentColor: parent.color });
    }
  }

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

  depthEl.textContent = (state.landfillDepth / 10).toFixed(1);
  salvageCapEl.textContent = state.salvageRemaining;

  // Consumption limit warning at 90%
  const consumptionPercent = (state.totalConsumption / CONSUMPTION_LIMIT) * 100;
  state.isWarning = consumptionPercent > 90 && state.consumptionVelocity > 2;
  warningEl.style.display = state.isWarning ? 'block' : 'none';

  // Update salvage button
  if (closest && state.salvageRemaining > 0 && !state.salvagedMemes.has(closest.data.id)) {
    salvageBtn.textContent = `CLICK TO SALVAGE (${state.salvageRemaining} left)`;
    salvageBtn.classList.remove('hidden', 'exhausted');
  } else if (closest && state.salvageRemaining === 0) {
    salvageBtn.textContent = 'SALVAGE CAPACITY EXHAUSTED';
    salvageBtn.classList.remove('hidden');
    salvageBtn.classList.add('exhausted');
  } else {
    salvageBtn.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────
//  SALVAGE INTERACTION
// ─────────────────────────────────────────────
function handleSalvage() {
  if (!closest || state.salvageRemaining <= 0 || state.salvagedMemes.has(closest.data.id)) return;

  state.salvageRemaining--;
  state.salvagedMemes.add(closest.data.id);

  // Re-render fossil texture with salvage stamp
  const ageFactor = Math.min((closest.data.bornYear - START_YEAR) / TOTAL_YEARS, 1);
  const newTex = createFossilTexture(closest.data, ageFactor, true);
  closest.baseMat.map = newTex;
  closest.baseMat.needsUpdate = true;

  // Update UI
  updateMetrics();

  // Audio feedback
  if (audioCtx) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.3, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  }
}

salvageBtn.addEventListener('click', handleSalvage);

// ─────────────────────────────────────────────
//  CONTROLS
// ─────────────────────────────────────────────
let isDragging = false, lastY = 0;
let closest = null;

window.addEventListener('wheel', e => {
  state.targetY += e.deltaY * 0.12;
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
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') state.targetY += K_Y;
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') state.targetY -= K_Y;
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
  metricsPanel.classList.remove('hidden');
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

  const t = performance.now() * 0.001;

  const depthFactor = Math.max(0, Math.min(1, state.currentY / (TOTAL_YEARS * K_Y)));
  const lerpFactor = 0.04 + depthFactor * 0.03;
  const prevY = state.currentY;
  state.currentY = THREE.MathUtils.lerp(state.currentY, state.targetY, lerpFactor);
  state.scrollSpeed = Math.abs(state.currentY - prevY);
  state.excavationDepth = state.currentY;

  if (state.autoScrolling) {
    state.targetY += AUTO_SCROLL_SPEED * 0.016;
    if (state.targetY >= state.timeRange.max + 2) {
      state.targetY = -2;
    }
    clampY();
  }

  camera.position.set(
    Math.sin(t * 0.1) * 0.5 + Math.sin(t * 0.3) * 0.2,
    state.currentY + 2,
    14 + Math.cos(t * 0.08) * 0.5
  );
  camera.lookAt(
    Math.sin(t * 0.15) * 0.3,
    state.currentY,
    -STRATA_Z_OFFSET
  );

  const year = Math.round(START_YEAR + (state.currentY / K_Y) * (TOTAL_YEARS / (state.timeRange.max / K_Y)));
  const cYear = Math.max(START_YEAR, Math.min(CURRENT_YEAR, START_YEAR + Math.floor(state.currentY / K_Y)));
  currentYearEl.textContent = cYear;
  eraLabel.textContent = getEraLabel(cYear);

  const PX = 56;
  const rulerOff = -((cYear - START_YEAR) / TOTAL_YEARS) * TOTAL_YEARS * PX;
  timelineRuler.style.transform = `translateX(${rulerOff}px)`;
  document.querySelectorAll('.timeline-year-text').forEach(el => {
    el.classList.toggle('active', el.id === `tick-year-${cYear}`);
  });

  // ── Find active meme ──
  let closestDist = Infinity;
  closest = null;
  for (const p of memePanels) {
    const d = Math.abs(state.currentY - (p.yStart + p.yEnd) / 2);
    if (d < closestDist) {
      closestDist = d;
      closest = p;
    }
  }

  // ── Highlight active panel ──
  for (const p of memePanels) {
    const isActive = closest && p === closest;
    const inRange = Math.abs(state.currentY - (p.yStart + p.yEnd) / 2) < K_Y * 1.5;
    p.baseMat.opacity = THREE.MathUtils.lerp(
      p.baseMat.opacity,
      isActive ? 1.0 : (inRange ? 0.7 : 0.12),
      0.06
    );
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

  // ── Meme fullscreen background ──
  if (closest && closest.data.imageUrl) {
    if (state.activeMeme !== closest.data) {
      const cur = bgActiveIsFirst ? memeBgEl2 : memeBgEl;
      const next = bgActiveIsFirst ? memeBgEl : memeBgEl2;
      cur.classList.remove('active');
      next.style.backgroundImage = `url(${closest.data.imageUrl})`;
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
  } else {
    if (state.activeMeme !== null) {
      state.activeMeme = null;
      activeMemeEl.textContent = '';
      activeDurEl.textContent = '';
      activeSalvageEl.classList.remove('visible');
      activeDescEl.classList.remove('visible');
    }
  }

  // ── Update satirical metrics ──
  updateMetrics();

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
}

// ── Helper: salvage value calculation (matches test) ──
function calculateSalvageValue(meme, currentYear) {
  const age = currentYear - meme.diedYear;
  const durability = { sudden: 0.1, fade: 0.3, resurrected: 0.8 }[meme.deathType] || 0.2;
  return Math.max(0, durability * (1 - age / 20));
}

// ── Init ──
initThree();
buildTimeline();
animate();
