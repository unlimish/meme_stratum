import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { memeData } from './memeData.js';

// --- Global App State ---
const state = {
  currentZ: 0,
  targetZ: 0,
  timeRange: { min: -520, max: 0 }, // 2000 to 2026. K_z = 20 units per year.
  isSerialConnected: false,
  activeMeme: null,
};

const K_Z = 20; // 1 year = 20 units

// --- DOM Elements ---
const overlay = document.getElementById('overlay');
const connectBtn = document.getElementById('connect-btn');
const hud = document.getElementById('hud');
const currentYearEl = document.getElementById('current-year');
const activeMemeEl = document.getElementById('active-meme');
const serialDot = document.getElementById('serial-dot');
const serialStatus = document.getElementById('serial-status');
const canvas = document.getElementById('webgl');

// --- Procedural Canvas Texture Generator ---
function createMemeTexture(meme) {
  const size = 512;
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = size;
  ctx.canvas.height = size;

  // Background gradient
  const grad = ctx.createRadialGradient(size/2, size/2, 50, size/2, size/2, size);
  grad.addColorStop(0, meme.color);
  grad.addColorStop(1, '#050505');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Stylized background pattern (concentric circles / grid)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let r = 50; r < size; r += 40) {
    ctx.beginPath();
    ctx.arc(size/2, size/2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Crosshairs / Tech grid elements
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.moveTo(0, size/2); ctx.lineTo(size, size/2);
  ctx.moveTo(size/2, 0); ctx.lineTo(size/2, size);
  ctx.stroke();

  // Neon boundary frame
  ctx.strokeStyle = meme.color;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, size - 20, size - 20);

  // Sub-boundary frame
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 16, size - 32, size - 32);

  // TEXT LAYER
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Header
  ctx.font = 'bold 20px "Outfit", sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('MEME LAYER', size/2, 50);

  // Era
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '16px "Outfit", sans-serif';
  ctx.fillText(`ACTIVE ERA: ${meme.bornYear} - ${meme.diedYear}`, size/2, 85);

  // Main Text (Meme representation / punchline)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px "Outfit", sans-serif';
  
  // Wrap text if long
  const words = meme.text.split(' ');
  let line = '';
  let y = size/2 - 10;
  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    if (metrics.width > size - 80 && n > 0) {
      ctx.fillText(line, size/2, y);
      line = words[n] + ' ';
      y += 36;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, size/2, y);

  // Footer: Title
  ctx.fillStyle = meme.color;
  ctx.font = 'bold 22px "Outfit", sans-serif';
  ctx.fillText(meme.name.toUpperCase(), size/2, size - 65);

  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- Custom Slit-scan & Degradation Material Builder ---
function createPillarMaterials(meme, texture) {
  // Compute depth progress based on birth year relative to timeline
  // Current (2026) is 0.0, Oldest (2000) is 1.0
  const depthProgress = Math.max(0, Math.min(1, (2026 - meme.bornYear) / 26));

  // Shared parameters
  const baseRoughness = 0.1 + depthProgress * 0.7; // Deep Z (older) is rougher
  const baseMetalness = 0.1;

  // Custom vertex shader helper for passing world position to compute degradation
  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  // Custom fragment shader for side stretching (slit-scan) and aging noise
  const fragmentShaderSide = (edgeUvExpr) => `
    uniform sampler2D uTexture;
    uniform float uDepthProgress;
    uniform float uRoughness;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      // Slit-scan: clamp UV to the edge of the texture
      vec2 stretchedUv = ${edgeUvExpr};
      vec4 texColor = texture2D(uTexture, stretchedUv);

      // Procedural age degradation
      // 1. High frequency noise (scratches / dust)
      float grain = hash(vWorldPosition.xy * 120.0 + vWorldPosition.z * 5.0) * 0.12 * uDepthProgress;
      
      // 2. Vertical long scratches
      float scratchPattern = step(0.994, hash(vec2(vUv.x * 250.0, 0.0))) * hash(vec2(0.0, vWorldPosition.z * 15.0)) * 0.35 * uDepthProgress;

      // Color degradation: tint older layers with yellow/gray cast
      vec3 agedColor = texColor.rgb;
      agedColor = mix(agedColor, vec3(dot(agedColor, vec3(0.299, 0.587, 0.114))), uDepthProgress * 0.4); // Desaturate
      agedColor = mix(agedColor, vec3(0.5, 0.45, 0.35) * dot(agedColor, vec3(0.33)), uDepthProgress * 0.3); // Yellow tint
      
      // Combine lighting effects
      vec3 finalColor = agedColor - vec3(grain) + vec3(scratchPattern);
      
      // Simple lighting simulation for standard look
      float diffuse = max(0.4, dot(vNormal, normalize(vec3(1.0, 2.0, 3.0))));
      gl_FragColor = vec4(finalColor * diffuse, 1.0);
    }
  `;

  const fragmentShaderFront = `
    uniform sampler2D uTexture;
    uniform float uDepthProgress;
    uniform float uRoughness;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec4 texColor = texture2D(uTexture, vUv);

      // Procedural age degradation (dust/grain)
      float grain = hash(vUv * 800.0) * 0.08 * uDepthProgress;
      float scratchPattern = step(0.995, hash(vec2(vUv.x * 300.0, 0.0))) * hash(vec2(0.0, vUv.y * 300.0)) * 0.25 * uDepthProgress;

      vec3 agedColor = texColor.rgb;
      agedColor = mix(agedColor, vec3(dot(agedColor, vec3(0.299, 0.587, 0.114))), uDepthProgress * 0.4);
      
      vec3 finalColor = agedColor - vec3(grain) + vec3(scratchPattern);
      
      float diffuse = max(0.6, dot(vNormal, normalize(vec3(1.0, 2.0, 3.0))));
      gl_FragColor = vec4(finalColor * diffuse, 1.0);
    }
  `;

  // Create uniforms
  const uniforms = {
    uTexture: { value: texture },
    uDepthProgress: { value: depthProgress },
    uRoughness: { value: baseRoughness },
    uColor: { value: new THREE.Color(meme.color) }
  };

  // Materials for the 6 faces:
  // 0: right (+X), 1: left (-X), 2: top (+Y), 3: bottom (-Y), 4: front (+Z), 5: back (-Z)
  return [
    // Right (+X) - Clamps to right edge (1.0, y)
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: fragmentShaderSide(`vec2(1.0, vUv.y)`),
      uniforms
    }),
    // Left (-X) - Clamps to left edge (0.0, y)
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: fragmentShaderSide(`vec2(0.0, vUv.y)`),
      uniforms
    }),
    // Top (+Y) - Clamps to top edge (x, 1.0)
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: fragmentShaderSide(`vec2(vUv.x, 1.0)`),
      uniforms
    }),
    // Bottom (-Y) - Clamps to bottom edge (x, 0.0)
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: fragmentShaderSide(`vec2(vUv.x, 0.0)`),
      uniforms
    }),
    // Front (+Z) - standard UV
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: fragmentShaderFront,
      uniforms
    }),
    // Back (-Z) - standard UV
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: fragmentShaderFront,
      uniforms
    })
  ];
}

// --- Setup Three.js Scene ---
let scene, camera, renderer, composer, bokehPass;
const pillars = [];

function initThree() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#050505', 0.012);

  // Camera
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 15);

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  // Add Lights (ambient and spotlights for plastic transparency reflections)
  const ambientLight = new THREE.AmbientLight('#ffffff', 0.35);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight('#ffffff', 0.85);
  dirLight1.position.set(5, 15, 10);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight('#ffffff', 0.25);
  dirLight2.position.set(-5, -5, -15);
  scene.add(dirLight2);

  // Generate Pillars
  memeData.forEach((meme, index) => {
    // 1. Z-axis mapping
    const lengthZ = Math.max(0.8, (meme.diedYear - meme.bornYear) * K_Z);
    // Position: Center is offset by (bornYear - 2026) * K_Z + half length
    const posZ = (meme.bornYear - 2026) * K_Z + (lengthZ / 2);

    // 2. Geometry
    // We alternate X and Y positions to lay them out dynamically as a gorgeous staggered pathway
    const staggerX = (index % 3 - 1) * 4.5;
    const staggerY = ((Math.floor(index / 3) % 2) - 0.5) * 3;
    const geometry = new THREE.BoxGeometry(3, 3, lengthZ);

    // 3. Materials
    const texture = createMemeTexture(meme);
    const materials = createPillarMaterials(meme, texture);

    // 4. Mesh
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.set(staggerX, staggerY, posZ);
    scene.add(mesh);

    pillars.push({
      mesh,
      data: meme,
      startZ: posZ - (lengthZ / 2),
      endZ: posZ + (lengthZ / 2),
    });
  });

  // Post-processing setup
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // BokehPass for Depth of Field
  bokehPass = new BokehPass(scene, camera, {
    focus: 15.0,
    aperture: 0.025,
    maxblur: 0.015,
    width: window.innerWidth,
    height: window.innerHeight
  });
  composer.addPass(bokehPass);

  // Handle Resize
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// --- Interaction Handlers ---

// Mouse and Keyboard fallbacks
let isDragging = false;
let previousMouseY = 0;

window.addEventListener('wheel', (e) => {
  // Zoom on wheel
  state.targetZ += e.deltaY * 0.05;
  clampTargetZ();
});

window.addEventListener('mousedown', (e) => {
  isDragging = true;
  previousMouseY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const deltaY = e.clientY - previousMouseY;
  state.targetZ += deltaY * 0.15;
  clampTargetZ();
  previousMouseY = e.clientY;
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
    state.targetZ += 5;
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
    state.targetZ -= 5;
  }
  clampTargetZ();
});

function clampTargetZ() {
  state.targetZ = Math.max(state.timeRange.min - 10, Math.min(state.timeRange.max + 15, state.targetZ));
}

// --- Web Serial API ---
async function initSerial() {
  if ('serial' in navigator) {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });

      state.isSerialConnected = true;
      serialDot.classList.add('active');
      serialStatus.textContent = 'CONNECTED';

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          break;
        }
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          // Keep last incomplete line in buffer
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              const val = parseInt(trimmed, 10);
              if (!isNaN(val)) {
                // Adjust target Z based on relative rotary encoder step
                state.targetZ += val * 1.5;
                clampTargetZ();
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Web Serial port initialization failed or cancelled:', err);
    }
  } else {
    console.warn('Web Serial API is not supported in this browser.');
    serialStatus.textContent = 'UNSUPPORTED';
  }
}

// --- Startup Click Event ---
connectBtn.addEventListener('click', async () => {
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');

  // Trigger web audio or other features if needed, and start serial
  await initSerial();
});

// --- Main Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

  // Smooth easing for camera position
  state.currentZ = THREE.MathUtils.lerp(state.currentZ, state.targetZ, 0.08);
  camera.position.z = state.currentZ + 15; // Maintain a slight offset in front of camera focus

  // Update HUD year indicator
  // Z = 0 corresponds to 2026, Z = -520 is 2000
  const computedYear = Math.round(2026 + (state.currentZ / K_Z));
  const activeYear = Math.max(2000, Math.min(2026, computedYear));
  currentYearEl.textContent = activeYear;

  // Track active layer
  let activeMeme = null;
  // Look for the meme whose depth coordinates contain the camera position
  for (const pillar of pillars) {
    if (state.currentZ >= pillar.startZ && state.currentZ <= pillar.endZ) {
      activeMeme = pillar.data;
      break;
    }
  }

  // Update Active Meme HUD
  if (activeMeme) {
    if (state.activeMeme !== activeMeme) {
      state.activeMeme = activeMeme;
      activeMemeEl.textContent = activeMeme.name;
    }
  } else {
    activeMemeEl.textContent = 'TRANSITION SPACE';
  }

  // Bokeh Focus follows the camera target (always sharp at current year depth)
  // The focus parameter is relative distance from camera. Since camera is at Z+15 relative to current time:
  bokehPass.uniforms['focus'].value = 15.0;

  // Render Scene
  composer.render();
}

// Initialize and start
initThree();
animate();
