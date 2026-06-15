import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { memeData } from './memeData.js';

// ─────────────────────────────────────────────
//  SPATIAL MODEL (revised for X-axis travel)
//
//  Concept: User stands at (x, y=8, z=12) and looks down at the strata below.
//  Each meme is a tall slab standing on the X-axis.
//    X-axis   = time (left = 2000, right = 2026)
//    Z-axis   = depth of the slab (duration of the meme)
//    Camera X = current year being explored
//
//  K_X = 12 units per year on X-axis
// ─────────────────────────────────────────────

const K_X = 12;         // 1 year = 12 units on X
const CURRENT_YEAR = 2026;
const START_YEAR   = 2000;
const TOTAL_YEARS  = CURRENT_YEAR - START_YEAR; // 26

// ── Global App State ─────────────────────────
const state = {
  currentX: 0,   // camera X position (lerped)
  targetX:  0,   // goal X
  isSerialConnected: false,
  activeMeme: null,
};

// ── DOM Elements ─────────────────────────────
const overlay       = document.getElementById('overlay');
const connectBtn    = document.getElementById('connect-btn');
const hud           = document.getElementById('hud');
const currentYearEl = document.getElementById('current-year');
const activeMemeEl  = document.getElementById('active-meme');
const activeDurationEl = document.getElementById('active-duration');
const serialDot     = document.getElementById('serial-dot');
const serialStatus  = document.getElementById('serial-status');
const webglCanvas   = document.getElementById('webgl');
const timelineWrapper = document.getElementById('timeline-wrapper');
const timelineRuler   = document.getElementById('timeline-ruler');

// ── Three.js references ───────────────────────
let scene, camera, renderer, composer, bokehPass;
const slabs = [];
let camLookAtZ = -10; // updated dynamically after row layout in initThree

// Audio
let audioCtx = null, droneOsc = null, subOsc = null, filterNode = null, gainNode = null;

// Particles
let particles;
const PARTICLE_COUNT = 800;

// ─────────────────────────────────────────────
//  TEXTURE GENERATOR
//  Draws the meme image on a canvas texture.
//  On first call draws a colored placeholder.
//  When the image loads, redraws with the real image.
// ─────────────────────────────────────────────
function createMemeTexture(meme) {
  const SIZE = 512;
  const cvs  = document.createElement('canvas');
  const ctx  = cvs.getContext('2d');
  cvs.width  = SIZE;
  cvs.height = SIZE;

  const texture = new THREE.CanvasTexture(cvs);
  texture.colorSpace = THREE.SRGBColorSpace;

  function draw(image = null) {
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Dark background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Colour wash (era color)
    const grad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE * 0.75);
    grad.addColorStop(0, meme.color + '33');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Real meme photo (centered, aspect-fit, full bleed with slight transparency)
    if (image) {
      const aspect = image.width / image.height;
      let w = SIZE, h = SIZE;
      if (aspect > 1) { h = SIZE / aspect; }
      else            { w = SIZE * aspect; }
      ctx.save();
      ctx.globalAlpha = 0.90;
      ctx.drawImage(image, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      ctx.restore();
    }

    // Very thin neon border (meme's era colour)
    ctx.strokeStyle = meme.color;
    ctx.lineWidth   = 3;
    ctx.strokeRect(4, 4, SIZE - 8, SIZE - 8);

    // Bottom gradient bar for text legibility
    const barGrad = ctx.createLinearGradient(0, SIZE - 100, 0, SIZE);
    barGrad.addColorStop(0, 'rgba(0,0,0,0)');
    barGrad.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, SIZE - 100, SIZE, 100);

    // Meme name
    ctx.fillStyle   = '#ffffff';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font        = 'bold 22px "Outfit", sans-serif';
    ctx.shadowColor  = 'rgba(0,0,0,1)';
    ctx.shadowBlur   = 8;
    ctx.fillText(meme.name.toUpperCase(), SIZE / 2, SIZE - 14);

    // Year range
    ctx.font      = '15px "Outfit", sans-serif';
    ctx.fillStyle = meme.color;
    ctx.shadowBlur = 4;
    ctx.fillText(`${meme.bornYear} – ${meme.diedYear}`, SIZE / 2, SIZE - 44);

    ctx.shadowBlur   = 0;
    texture.needsUpdate = true;
  }

  draw(); // placeholder immediately

  if (meme.imageUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => draw(img);
    img.onerror = () => console.warn('Image failed:', meme.name);
    img.src = meme.imageUrl;
  }

  return texture;
}

// ─────────────────────────────────────────────
//  SLAB MATERIAL BUILDER
//  Front  (+Z face): full meme texture
//  Sides  (X faces): slit-scan edge extrusion
//  Top    (+Y face): thin glowing top stripe
//  Back/Bottom:      dark absorbing material
// ─────────────────────────────────────────────
function createSlabMaterials(meme, texture) {
  const depthProgress = Math.max(0, Math.min(1, (CURRENT_YEAR - meme.bornYear) / 26));

  const vertexShader = /* glsl */`
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    void main() {
      vUv        = uv;
      vNormal    = normalize(normalMatrix * normal);
      vec4 wp    = modelMatrix * vec4(position, 1.0);
      vWorldPos  = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;

  const agingGlsl = /* glsl */`
    float hash(vec2 p){
      p = fract(p * vec2(123.34,456.21));
      p += dot(p, p+45.32);
      return fract(p.x*p.y);
    }
    vec3 applyAge(vec3 col, float depth, vec2 uv, vec3 worldPos){
      float grain   = hash(uv * 900.0 + worldPos.xz * 3.0) * 0.10 * depth;
      float scratch = step(0.994, hash(vec2(uv.x * 280.0, 0.0)))
                    * hash(vec2(0.0, worldPos.z * 12.0)) * 0.3 * depth;
      col = mix(col, vec3(dot(col, vec3(0.299,0.587,0.114))), depth * 0.45);
      col = mix(col, vec3(0.48,0.42,0.32) * dot(col, vec3(0.33)), depth * 0.25);
      return col - grain + scratch;
    }
  `;

  const frontFrag = /* glsl */`
    uniform sampler2D uTex;
    uniform float uAge;
    uniform vec3  uColor;
    varying vec2  vUv;
    varying vec3  vWorldPos;
    varying vec3  vNormal;
    ${agingGlsl}
    void main(){
      vec4 t = texture2D(uTex, vUv);
      vec3 c = applyAge(t.rgb, uAge, vUv, vWorldPos);
      gl_FragColor = vec4(c, 1.0);
    }
  `;

  const sideFrag = (edgeUv) => /* glsl */`
    uniform sampler2D uTex;
    uniform float uAge;
    uniform vec3  uColor;
    varying vec2  vUv;
    varying vec3  vWorldPos;
    varying vec3  vNormal;
    ${agingGlsl}
    void main(){
      vec2 uv2 = ${edgeUv};
      vec4 t   = texture2D(uTex, uv2);
      vec3 c   = applyAge(t.rgb, uAge, vUv, vWorldPos);

      // Vertical year-ring lines (every K_X = 12 units on X)
      float xFrac = fract(vWorldPos.x / 12.0);
      float ring  = step(0.96, xFrac) + step(xFrac, 0.04);
      c = mix(c, uColor * 1.8, ring * 0.55);

      float diff = max(0.35, dot(vNormal, normalize(vec3(0.0, 3.0, 2.0))));
      gl_FragColor = vec4(c * diff, 1.0);
    }
  `;

  const topFrag = /* glsl */`
    uniform vec3  uColor;
    varying vec3  vWorldPos;
    void main(){
      float xFrac = fract(vWorldPos.x / 12.0);
      float ring  = step(0.93, xFrac) + step(xFrac, 0.07);
      vec3  base  = uColor * 0.25;
      vec3  glow  = uColor * 1.5;
      gl_FragColor = vec4(mix(base, glow, ring), 1.0);
    }
  `;

  const darkFrag = /* glsl */`
    uniform vec3 uColor;
    void main(){
      gl_FragColor = vec4(uColor * 0.05, 1.0);
    }
  `;

  const uniforms = {
    uTex:   { value: texture },
    uAge:   { value: depthProgress },
    uColor: { value: new THREE.Color(meme.color) },
  };

  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  return [
    new THREE.ShaderMaterial({ vertexShader, fragmentShader: sideFrag(`vec2(1.0, vUv.y)`), uniforms }), // right
    new THREE.ShaderMaterial({ vertexShader, fragmentShader: sideFrag(`vec2(0.0, vUv.y)`), uniforms }), // left
    new THREE.ShaderMaterial({ vertexShader, fragmentShader: topFrag,                      uniforms }), // top
    new THREE.ShaderMaterial({ vertexShader, fragmentShader: darkFrag,                     uniforms }), // bottom
    new THREE.ShaderMaterial({ vertexShader, fragmentShader: frontFrag,                    uniforms }), // front (+Z)
    new THREE.ShaderMaterial({ vertexShader, fragmentShader: darkFrag,                     uniforms }), // back  (-Z)
  ];
}

// ─────────────────────────────────────────────
//  SCENE INIT
// ─────────────────────────────────────────────
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#030408');
  scene.fog = new THREE.Fog('#030408', 30, 180);

  // ── Camera: elevated, angled down, looking along X axis ──
  // Position: slightly elevated and forward on Z, looking toward the slabs
  camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 500);
  camera.position.set(yearToX(CURRENT_YEAR), 14, 20);
  camera.lookAt(yearToX(CURRENT_YEAR), 0, -10);

  // ── Renderer ──
  renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // ── Lighting ──
  // Very dim ambient (museum darkness)
  scene.add(new THREE.AmbientLight('#1a1a2e', 1.0));

  // Primary spotlight from above-left (dramatic raking light)
  const spot1 = new THREE.SpotLight('#ffffff', 4.5, 200, Math.PI / 6, 0.4, 1.5);
  spot1.position.set(-20, 35, 25);
  spot1.castShadow = true;
  spot1.shadow.bias = -0.001;
  scene.add(spot1);
  scene.add(spot1.target);

  // Subtle blue fill from right (cool ambient)
  const fill = new THREE.DirectionalLight('#2233aa', 0.4);
  fill.position.set(40, 10, 5);
  scene.add(fill);

  // ── Floor plane (reflective dark surface like polished concrete) ──
  const floorGeo = new THREE.PlaneGeometry(400, 200);
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#080c14',
    roughness: 0.15,
    metalness: 0.6,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.0;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── Row assignment (interval scheduling on X-axis) ──
  // Memes whose active periods overlap in X get placed in separate Z rows.
  // Sort by bornYear so earlier memes get the front row first.
  const ROW_DEPTH   = 9.0;   // gap between rows (Z direction)
  const FRONT_Z     = -8.0;  // z position of row 0 (closest to camera)
  const rowEndX     = [];    // tracks the rightmost X used in each row

  const sortedForRows = [...memeData].sort((a, b) => a.bornYear - b.bornYear);
  const rowMap        = new Map(); // meme.id → row index

  for (const meme of sortedForRows) {
    const duration = Math.max(0.5, meme.diedYear - meme.bornYear);
    const startX   = yearToX(meme.bornYear);
    const endX     = yearToX(meme.bornYear) + K_X * duration;

    // Find the first row where this meme fits (no X overlap)
    let row = rowEndX.findIndex(rx => rx + 2 <= startX);
    if (row === -1) { row = rowEndX.length; rowEndX.push(endX); }
    else              rowEndX[row] = endX;

    rowMap.set(meme.id, row);
  }

  const numRows = rowEndX.length;

  // ── Build Slabs ──
  memeData.forEach((meme) => {
    const duration = Math.max(0.5, meme.diedYear - meme.bornYear);
    const width    = K_X * (meme.bornYear === meme.diedYear ? 0.4 : duration);

    // Height: scales with longevity so long-lived memes are visually taller
    const height   = THREE.MathUtils.clamp(3.0 + duration * 0.22, 3.2, 8.5);
    const depthZ   = 5.5;

    const centerX  = yearToX(meme.bornYear) + width / 2;
    const row      = rowMap.get(meme.id);

    // Row 0 = front (closest to camera), each subsequent row steps back
    const posZ     = FRONT_Z - row * ROW_DEPTH;
    const posY     = height / 2 - 2.0; // sit on floor

    const geo  = new THREE.BoxGeometry(width, height, depthZ);
    const tex  = createMemeTexture(meme);
    const mats = createSlabMaterials(meme, tex);

    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(centerX, posY, posZ);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    slabs.push({ mesh, data: meme, startX: centerX - width / 2, endX: centerX + width / 2 });
  });

  // Pull camera back so all rows are visible
  const camZ = FRONT_Z + 30 + numRows * ROW_DEPTH * 0.5;
  const camY = 10 + numRows * 1.5;
  camLookAtZ = FRONT_Z - (numRows - 1) * ROW_DEPTH * 0.5;
  camera.position.set(yearToX(CURRENT_YEAR), camY, camZ);
  camera.lookAt(yearToX(CURRENT_YEAR), 0, camLookAtZ);
  // Update initial state.targetX to point to present (rightmost X)
  state.targetX = yearToX(CURRENT_YEAR);
  state.currentX = yearToX(CURRENT_YEAR);


  // ── Particles ──
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pPos[i * 3 + 0] = (Math.random() - 0.5) * 340;
    pPos[i * 3 + 1] =  Math.random() * 20;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color: '#88aaff', size: 0.08, transparent: true, opacity: 0.4, sizeAttenuation: true,
  }));
  scene.add(particles);

  // ── Post-processing ──
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bokehPass = new BokehPass(scene, camera, {
    focus:    26.0,   // roughly the distance from camera to slab fronts
    aperture: 0.0006, // very narrow, large depth of field → everything readable
    maxblur:  0.003,
    width:    innerWidth,
    height:   innerHeight,
  });
  composer.addPass(bokehPass);

  // ── Timeline ──
  buildTimeline();

  // ── Resize ──
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });
}

// Helper: year → scene X coordinate
function yearToX(year) {
  return (year - CURRENT_YEAR) * K_X;
}

// ─────────────────────────────────────────────
//  TIMELINE RULER (horizontal, bottom of screen)
// ─────────────────────────────────────────────
function buildTimeline() {
  const PX_PER_YEAR = 64;
  for (let y = START_YEAR; y <= CURRENT_YEAR; y++) {
    const offset = (y - START_YEAR) * PX_PER_YEAR;
    const major  = (y % 5 === 0) || y === CURRENT_YEAR;

    const tick = document.createElement('div');
    tick.className = 'timeline-tick' + (major ? ' major' : '');
    tick.style.left = offset + 'px';
    timelineRuler.appendChild(tick);

    if (major) {
      const label = document.createElement('div');
      label.className    = 'timeline-year-text';
      label.id           = `tick-year-${y}`;
      label.textContent  = y;
      label.style.left   = offset + 'px';
      timelineRuler.appendChild(label);
    }
  }
}

// ─────────────────────────────────────────────
//  CONTROLS  (scroll / drag / keyboard / serial)
// ─────────────────────────────────────────────
const PX_PER_YEAR = 64; // Must match buildTimeline

let isDragging = false, lastMouseX = 0;

window.addEventListener('wheel', e => {
  state.targetX += e.deltaY * 0.05;   // scroll up = travel to past (negative X)
  clamp();
});

window.addEventListener('mousedown', e => { isDragging = true; lastMouseX = e.clientX; });
window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  state.targetX -= (e.clientX - lastMouseX) * 0.06;
  lastMouseX = e.clientX;
  clamp();
});
window.addEventListener('mouseup', () => { isDragging = false; });

window.addEventListener('keydown', e => {
  const step = K_X;
  if (e.key === 'ArrowLeft')  state.targetX -= step;
  if (e.key === 'ArrowRight') state.targetX += step;
  clamp();
});

// Touch support
let lastTouchX = 0;
window.addEventListener('touchstart', e => { lastTouchX = e.touches[0].clientX; });
window.addEventListener('touchmove',  e => {
  state.targetX -= (e.touches[0].clientX - lastTouchX) * 0.06;
  lastTouchX = e.touches[0].clientX;
  clamp();
}, { passive: true });

function clamp() {
  const minX = yearToX(START_YEAR);
  const maxX = yearToX(CURRENT_YEAR);
  state.targetX = Math.max(minX - K_X, Math.min(maxX + K_X, state.targetX));
}

// ─────────────────────────────────────────────
//  WEB SERIAL
// ─────────────────────────────────────────────
async function initSerial() {
  if (!('serial' in navigator)) {
    serialStatus.textContent = 'UNSUPPORTED'; return;
  }
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    state.isSerialConnected = true;
    serialDot.classList.add('active');
    serialStatus.textContent = 'CONNECTED';

    const dec    = new TextDecoderStream();
    port.readable.pipeTo(dec.writable);
    const reader = dec.readable.getReader();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const v = parseFloat(line.trim());
        if (!isNaN(v)) { state.targetX += v * (K_X / 4); clamp(); }
      }
    }
  } catch (e) {
    console.warn('Serial failed:', e);
  }
}

// ─────────────────────────────────────────────
//  WEB AUDIO  (ambient museum drone)
// ─────────────────────────────────────────────
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  droneOsc = audioCtx.createOscillator(); droneOsc.type = 'triangle'; droneOsc.frequency.value = 55;
  subOsc   = audioCtx.createOscillator(); subOsc.type   = 'sine';     subOsc.frequency.value   = 27.5;

  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass'; filterNode.frequency.value = 110; filterNode.Q.value = 3.5;

  gainNode = audioCtx.createGain(); gainNode.gain.value = 0.0001;

  droneOsc.connect(filterNode); subOsc.connect(filterNode);
  filterNode.connect(gainNode); gainNode.connect(audioCtx.destination);

  droneOsc.start(); subOsc.start();
  gainNode.gain.exponentialRampToValueAtTime(0.22, audioCtx.currentTime + 4);
}

function updateAudio(t) {
  if (!audioCtx) return;
  // Pitch dips in the "past" (negative X) — older eras feel heavier
  const depth = Math.max(0, Math.min(1, -state.currentX / (TOTAL_YEARS * K_X)));
  const speed = Math.abs(state.targetX - state.currentX);
  droneOsc.frequency.setTargetAtTime(55 - depth * 18 + speed * 0.4, audioCtx.currentTime, 0.1);
  filterNode.frequency.setTargetAtTime(110 + speed * 12 + depth * 40, audioCtx.currentTime, 0.15);
}

// ─────────────────────────────────────────────
//  HUD HELPERS
// ─────────────────────────────────────────────
function xToYear(x) {
  return Math.round(CURRENT_YEAR + x / K_X);
}

// ─────────────────────────────────────────────
//  STARTUP
// ─────────────────────────────────────────────
connectBtn.addEventListener('click', async () => {
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  timelineWrapper.classList.remove('hidden');
  initAudio();
  await initSerial();
});

// ─────────────────────────────────────────────
//  ANIMATION LOOP
// ─────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  // Lerp camera X
  state.currentX = THREE.MathUtils.lerp(state.currentX, state.targetX, 0.06);

  // Camera tracks along X, maintaining elevated angle
  camera.position.x = state.currentX;
  camera.lookAt(state.currentX, 0, camLookAtZ);


  // Bokeh focus: camera is at z=20, slabs are at z≈-10 → distance ≈30
  // Adjust focus to distance to active slab (keep current for now)
  bokehPass.uniforms['focus'].value = 26.0;

  // HUD: current year
  const year = Math.max(START_YEAR, Math.min(CURRENT_YEAR, xToYear(state.currentX)));
  currentYearEl.textContent = year;

  // ── Timeline ruler scroll ──
  const PX = 64;
  const offset = -((year - START_YEAR) / TOTAL_YEARS) * TOTAL_YEARS * PX;
  timelineRuler.style.transform = `translateX(${offset}px)`;
  document.querySelectorAll('.timeline-year-text').forEach(el => {
    el.classList.toggle('active', el.id === `tick-year-${year}`);
  });

  // ── Active slab detection ──
  let activeSlab = null;
  for (const s of slabs) {
    if (state.currentX >= s.startX && state.currentX <= s.endX) {
      activeSlab = s; break;
    }
  }

  if (activeSlab) {
    const dur = activeSlab.data.diedYear - activeSlab.data.bornYear || 1;
    if (state.activeMeme !== activeSlab.data) {
      state.activeMeme = activeSlab.data;
      activeMemeEl.textContent     = activeSlab.data.name;
      activeDurationEl.textContent = `${dur} YEAR${dur > 1 ? 'S' : ''}`;
    }
  } else {
    activeMemeEl.textContent     = '— —';
    activeDurationEl.textContent = '';
    state.activeMeme = null;
  }

  // ── Particles drift ──
  if (particles) {
    const arr = particles.geometry.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3 + 1] -= 0.01;
      if (arr[i * 3 + 1] < -2) arr[i * 3 + 1] = 18;
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  updateAudio();
  composer.render();
}

// ── Init ──
initThree();
animate();
