const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const body = document.body;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasGSAP = Boolean(window.gsap && window.ScrollTrigger);

const levels = $$('.level');
const barFill = $('#bar-fill');
const worldEl = $('#world');
const levelEl = $('#level');
const hint = $('#hint');
const replay = $('#replay');
const transition = $('#transition');
const transitionWorld = $('#transition-world');
const transitionName = $('#transition-name');
const flash = $('#flash');
const journey = $('#journey');

const view = { progress: 0, warp: 0 };

let current = -1;
let lastBurst = 0;
let sceneReady = false;

function markReady() {
  if (sceneReady) return;
  sceneReady = true;
  body.classList.add('is-ready');
}

function animateLevel(section) {
  if (!hasGSAP || reduceMotion) return;
  const items = $$('[data-reveal]', section);
  if (!items.length) return;
  gsap.killTweensOf(items);
  gsap.fromTo(items,
    { y: 18, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, duration: .5, stagger: .05, ease: 'power2.out', overwrite: true }
  );
}

function portalBurst(index) {
  const now = performance.now();
  if (now - lastBurst < 650) return;
  lastBurst = now;

  const section = levels[index];
  transitionWorld.textContent = 'MONDE ' + (index + 1);
  transitionName.textContent = section.dataset.name;
  view.warp = 1;

  if (hasGSAP && !reduceMotion) {
    const ring = $('.transition-ring', transition);
    gsap.killTweensOf([transition, flash, ring, transitionName]);
    gsap.timeline({ defaults: { ease: 'power2.out' } })
      .set(ring, { scale: .35, opacity: 0 })
      .set(transitionName, { y: 12, autoAlpha: 0 })
      .set(transition, { opacity: 0 })
      .to(flash, { opacity: .72, duration: .08 }, 0)
      .to(transition, { opacity: 1, duration: .16 }, 0)
      .to(ring, { scale: 2.35, opacity: .95, duration: .62 }, 0)
      .to(transitionName, { y: 0, autoAlpha: 1, duration: .24 }, .07)
      .to(flash, { opacity: 0, duration: .34 }, .12)
      .to(transition, { opacity: 0, duration: .3 }, .52)
      .to(ring, { opacity: 0, duration: .2 }, .52)
      .to(view, { warp: 0, duration: .85, ease: 'power2.inOut' }, 0);
    return;
  }

  transition.classList.remove('burst');
  void transition.offsetWidth;
  transition.classList.add('burst');
  window.setTimeout(() => transition.classList.remove('burst'), 950);
  view.warp = reduceMotion ? 0 : 1;
}

function setLevel(index) {
  if (index === current) return;
  const previous = current;
  current = index;

  levels.forEach((section, i) => {
    const active = i === index;
    section.classList.toggle('is-active', active);
    section.setAttribute('aria-hidden', active ? 'false' : 'true');
  });

  const section = levels[index];
  document.documentElement.style.setProperty('--accent', section.dataset.accent);
  worldEl.textContent = 'MONDE ' + (index + 1);
  levelEl.textContent = 'NIVEAU ' + (index + 1);
  animateLevel(section);

  if (previous !== -1) portalBurst(index);
}

function onProgress(value) {
  const progress = Math.max(0, Math.min(1, value));
  view.progress = progress;
  barFill.style.transform = 'scaleX(' + progress.toFixed(4) + ')';

  const index = Math.min(levels.length - 1, Math.floor(progress * levels.length + 1e-7));
  setLevel(index);

  hint.classList.toggle('is-hidden', progress > .02);
  replay.classList.toggle('is-visible', progress > .94);
}

function initScroll() {
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.create({
      trigger: journey,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => onProgress(self.progress)
    });
    return;
  }

  const update = () => {
    const max = journey.offsetHeight - window.innerHeight;
    const top = journey.getBoundingClientRect().top;
    onProgress(max > 0 ? -top / max : 0);
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

function initReplay() {
  $$('[data-replay]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });
}

async function initScene() {
  const canvas = $('#scene');
  if (!canvas) {
    markReady();
    return;
  }

  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js');
  } catch (error) {
    body.classList.add('no-webgl');
    markReady();
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance'
    });
  } catch (error) {
    body.classList.add('no-webgl');
    markReady();
    return;
  }

  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#5C94FC');
  scene.fog = new THREE.Fog('#5C94FC', 55, 210);

  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, .1, 460);
  camera.position.set(0, 6, 8);

  const skyStops = [
    new THREE.Color('#5C94FC'),
    new THREE.Color('#3B2A6B'),
    new THREE.Color('#16224A'),
    new THREE.Color('#0B1020')
  ];
  const skyTarget = new THREE.Color('#5C94FC');
  const skyCurrent = scene.background;

  const portalsRoot = new THREE.Group();
  scene.add(portalsRoot);

  /* --- Sol en grille --- */

  const gridPoints = [];
  const halfWidth = 44;
  const step = 4;
  for (let x = -halfWidth; x <= halfWidth; x += step) {
    gridPoints.push(x, -2.5, 30, x, -2.5, -420);
  }
  for (let z = 30; z >= -420; z -= step) {
    gridPoints.push(-halfWidth, -2.5, z, halfWidth, -2.5, z);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const grid = new THREE.LineSegments(
    gridGeometry,
    new THREE.LineBasicMaterial({ color: 0x1E4FB8, transparent: true, opacity: .55 })
  );
  scene.add(grid);

  /* --- Silhouettes et plateformes --- */

  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  const buildingMaterials = [
    new THREE.MeshBasicMaterial({ color: 0x16234F }),
    new THREE.MeshBasicMaterial({ color: 0x1B3B33 }),
    new THREE.MeshBasicMaterial({ color: 0x241B44 })
  ];
  for (let i = 0; i < 44; i += 1) {
    const building = new THREE.Mesh(buildingGeometry, buildingMaterials[i % buildingMaterials.length]);
    const side = i % 2 === 0 ? 1 : -1;
    const height = 3 + Math.random() * 12;
    const width = 2 + Math.random() * 4;
    building.scale.set(width, height, width);
    building.position.set(side * (22 + Math.random() * 16), height / 2 - 3, 20 - Math.random() * 470);
    building.rotation.y = Math.random() * .4;
    scene.add(building);
  }

  const brickMaterial = new THREE.MeshBasicMaterial({ color: 0xC84C0C });
  const brickGeometry = new THREE.BoxGeometry(4, 1, 2);
  for (let i = 0; i < 12; i += 1) {
    const platform = new THREE.Mesh(brickGeometry, brickMaterial);
    const side = i % 2 === 0 ? 1 : -1;
    platform.position.set(side * (7 + Math.random() * 7), 1 + Math.random() * 2.4, 4 - i * 22 - Math.random() * 8);
    scene.add(platform);
  }

  /* --- Nuages pixel --- */

  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xFFF6DC,
    transparent: true,
    opacity: .9
  });
  const cloudGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 9; i += 1) {
    const cloud = new THREE.Group();
    const side = i % 2 === 0 ? 1 : -1;
    cloud.position.set(side * (17 + Math.random() * 22), 22 + Math.random() * 14, 20 - Math.random() * 340);
    const puffs = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < puffs; j += 1) {
      const puff = new THREE.Mesh(cloudGeometry, cloudMaterial);
      puff.scale.set(2.5 + Math.random() * 3, 1.1 + Math.random() * .6, 1.6 + Math.random() * .8);
      puff.position.set((j - puffs / 2) * 2.2, Math.random() * .8, Math.random() * 1.2);
      cloud.add(puff);
    }
    scene.add(cloud);
  }

  /* --- Étoiles --- */

  const starCount = reduceMotion ? 300 : 900;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    starPositions[i * 3] = (Math.random() - .5) * 150;
    starPositions[i * 3 + 1] = 2 + Math.random() * 62;
    starPositions[i * 3 + 2] = 40 - Math.random() * 480;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xFFF6DC,
    size: .8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  /* --- Portails --- */

  const portalColors = ['#5C94FC', '#E52521', '#00A800', '#7C3AED'];
  const portalProgress = [.25, .5, .75, 1.12];
  const portals = [];

  const swirlVertex = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const swirlFragment = `
    varying vec2 vUv;
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uOpacity;
    void main() {
      vec2 p = vUv - 0.5;
      float radius = length(p) * 2.0;
      float angle = atan(p.y, p.x);
      float spiral = sin(angle * 4.0 + radius * 18.0 - uTime * 2.2) * 0.5 + 0.5;
      float core = smoothstep(1.0, 0.05, radius);
      float edge = smoothstep(0.0, 0.06, 1.0 - radius);
      float glow = core * (0.3 + 0.7 * spiral);
      vec3 color = uColor * glow + vec3(0.9, 0.95, 1.0) * pow(core, 6.0) * 0.22;
      gl_FragColor = vec4(color, glow * edge * uOpacity);
    }
  `;

  portalProgress.forEach((progress, index) => {
    const color = new THREE.Color(portalColors[index]);
    const group = new THREE.Group();
    group.position.set(0, 7, 8 - 195 * progress);

    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(6, .45, 8, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85 })
    );
    group.add(torus);

    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(6.9, .14, 6, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: .35,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    group.add(glow);

    const swirls = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.ShaderMaterial({
        vertexShader: swirlVertex,
        fragmentShader: swirlFragment,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: color },
          uOpacity: { value: .72 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    );
    group.add(swirls);

    portalsRoot.add(group);
    portals.push({ group, torus, glow, swirls });
  });

  /* --- Anneaux et pièces --- */

  const ringGeometry = new THREE.TorusGeometry(1, .06, 4, 20);
  const ringColors = [0x22D3EE, 0xE52521, 0x00A800, 0xF5C518];
  for (let i = 0; i < 16; i += 1) {
    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        color: ringColors[i % ringColors.length],
        transparent: true,
        opacity: .3,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    ring.scale.setScalar(1.5 + Math.random() * 2.5);
    ring.position.set(
      (Math.random() < .5 ? -1 : 1) * (15 + Math.random() * 15),
      3 + Math.random() * 13,
      -15 - Math.random() * 405
    );
    ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    scene.add(ring);
  }

  const coinGeometry = new THREE.TorusGeometry(.45, .14, 4, 8);
  const coinMaterial = new THREE.MeshBasicMaterial({ color: 0xF5C518 });
  const coins = [];
  const coinCount = reduceMotion ? 14 : 26;
  for (let i = 0; i < coinCount; i += 1) {
    const coin = new THREE.Mesh(coinGeometry, coinMaterial);
    const side = i % 2 === 0 ? 1 : -1;
    const baseY = 1.5 + Math.random() * 10;
    coin.position.set(side * (6 + Math.random() * 14), baseY, -8 - Math.random() * 420);
    coin.rotation.z = Math.random() * Math.PI;
    coin.userData = { baseY, phase: Math.random() * Math.PI * 2 };
    scene.add(coin);
    coins.push(coin);
  }

  /* --- Redimensionnement --- */

  let lastFov = camera.fov;

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const scale = width <= 900 ? .42 : .5;
    renderer.setSize(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
      false
    );
    portalsRoot.position.x = width <= 900 ? 0 : 10;
  }

  window.addEventListener('resize', resize);
  resize();

  /* --- Rendu --- */

  const clock = new THREE.Clock();
  let elapsed = 0;
  let firstFrame = true;

  function skyAt(progress, target) {
    const scaled = Math.min(.9999, progress) * (skyStops.length - 1);
    const index = Math.floor(scaled);
    const next = Math.min(index + 1, skyStops.length - 1);
    return target.copy(skyStops[index]).lerp(skyStops[next], scaled - index);
  }

  function frame() {
    const delta = Math.min(clock.getDelta(), .05);
    elapsed += delta;

    const progress = view.progress;
    const targetZ = 8 - 195 * progress - view.warp * 9;
    if (firstFrame) {
      camera.position.z = targetZ;
      firstFrame = false;
    } else {
      camera.position.z += (targetZ - camera.position.z) * (reduceMotion ? 1 : .09);
    }
    camera.position.x = reduceMotion ? 0 : Math.sin(elapsed * .55) * .8 * (1 - progress * .5);
    camera.position.y = 6 + (reduceMotion ? 0 : Math.sin(elapsed * .8) * .18);
    camera.lookAt(0, 6.3, camera.position.z - 100);

    const targetFov = 64 + view.warp * 13;
    if (Math.abs(camera.fov - targetFov) > .01) {
      camera.fov += (targetFov - camera.fov) * .18;
      if (Math.abs(camera.fov - lastFov) > .01) {
        camera.updateProjectionMatrix();
        lastFov = camera.fov;
      }
    }

    skyAt(progress, skyTarget);
    skyCurrent.lerp(skyTarget, reduceMotion ? 1 : .06);
    scene.fog.color.copy(skyCurrent);

    starMaterial.opacity = Math.max(0, (progress - .15) / .55) * .9;
    cloudMaterial.opacity = .9 * (1 - progress * .55);

    portals.forEach((portal, i) => {
      portal.group.position.y = 7 + (reduceMotion ? 0 : Math.sin(elapsed * 1.2 + i * 1.7) * .25);
      portal.torus.rotation.z += delta * (i % 2 === 0 ? .3 : -.3);
      portal.glow.rotation.z -= delta * .2;
      portal.swirls.material.uniforms.uTime.value = elapsed;
      const distance = Math.abs(camera.position.z - portal.group.position.z);
      const near = Math.max(0, 1 - distance / 45);
      portal.torus.material.opacity = .55 + near * .45;
      portal.glow.material.opacity = .2 + near * .5;
    });

    coins.forEach((coin) => {
      if (!reduceMotion) coin.rotation.y = elapsed * 1.6 + coin.userData.phase;
      if (!reduceMotion) {
        coin.position.y = coin.userData.baseY + Math.sin(elapsed * 1.4 + coin.userData.phase) * .3;
      }
    });

    if (!hasGSAP && view.warp > .001) {
      view.warp *= .96;
    }

    try {
      renderer.render(scene, camera);
    } catch (error) {
      body.classList.add('no-webgl');
      markReady();
      return;
    }

    if (!sceneReady) markReady();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

onProgress(0);
initScroll();
initReplay();
initScene();
window.setTimeout(markReady, 1800);
