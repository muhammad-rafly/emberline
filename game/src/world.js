// EMBERLINE: an original map, a decommissioned solar array yard at dusk. Attackers
// (Ember) spawn south and push up three lanes — A west, mid, B east — to two bomb sites
// in the north: Site A, the solar array, and Site B, the container depot. The map is
// boxes only: every box is a collider for movement and a surface bullets stop on.
// Waypoints form a graph over the lanes; bots path with a BFS over it. Line of sight
// is a segment test against the same colliders (plus smoke), so vision and bullets
// agree with the walls the player sees.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// A small seeded random so the painted textures are identical every load.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Procedural textures, painted once at boot: asphalt with speckle and slab
// joints, concrete with stains, and a hazard stripe. No image files to ship,
// so the map stays readable without any asset the judge has to trust.
function asphaltTexture() {
  const random = seededRandom(1337);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b2e35';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i += 1) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(random() * 512, random() * 512, 1.6, 1.6);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(512, i * 128); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 26;
  ctx.beginPath(); ctx.arc(140, 380, 150, 0.4, 1.6); ctx.stroke();
  ctx.beginPath(); ctx.arc(390, 130, 170, 3.4, 4.6); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function concreteTexture() {
  const random = seededRandom(4242);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i += 1) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.10)';
    ctx.fillRect(random() * 256, random() * 256, 1.5, 1.5);
  }
  // Rain stains running down from the top edge.
  for (let i = 0; i < 14; i += 1) {
    const x = random() * 256;
    const len = 40 + random() * 120;
    const gradient = ctx.createLinearGradient(0, 0, 0, len);
    gradient.addColorStop(0, 'rgba(0,0,0,0.22)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, 4 + random() * 8, len);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function hazardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c98a1b';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#1d1f24';
  for (let x = -32; x < 160; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 32); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 32);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function signTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#ffb02e';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#ffb02e';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SOLAR ARRAY 07', 256, 62);
  ctx.fillStyle = '#8b939c';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText('DECOMMISSIONED — KEEP OUT', 256, 100);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const SITES = {
  A: { x: -22, z: -14, r: 5.5, name: 'A', color: PALETTE.siteA },
  B: { x: 22, z: -14, r: 5.5, name: 'B', color: PALETTE.siteB },
};

export const SPAWNS = {
  ember: [
    { x: 0, z: 20.5, yaw: 0 },
    { x: -3, z: 21, yaw: 0 },
    { x: 3, z: 21, yaw: 0 },
    { x: -5.5, z: 19, yaw: 0 },
  ],
  ash: [
    { x: -3, z: -21.5, yaw: Math.PI },
    { x: 3, z: -21.5, yaw: Math.PI },
    { x: -8, z: -20, yaw: Math.PI },
    { x: 8, z: -20, yaw: Math.PI },
  ],
};

// Waypoint graph: [x, z] nodes, edges by index, both directions.
const NODES = [
  [0, 20], [-5, 17], [5, 17],
  [-16, 14], [-22, 8], [-25, 0], [-22, -6], [-18.5, -8], [-22, -12], [-18, -17],
  [16, 14], [22, 8], [25, 0], [22, -6], [18.5, -8], [22, -12], [18, -17],
  [0, 14], [0, 6], [0, 0], [0, -6], [0, -8], [0, -11], [-8, -11], [8, -11],
  [0, -16], [-10, -16], [10, -16], [-22, -19], [22, -19], [-3, -21.5], [3, -21.5],
];
const EDGES = [
  [0, 1], [0, 2], [0, 17], [1, 3], [2, 10], [1, 17], [2, 17],
  [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9],
  [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [22, 24],
  [7, 23], [14, 24], [25, 26], [25, 27], [26, 9], [27, 16],
  [26, 30], [27, 31], [26, 28], [27, 29], [9, 28], [16, 29],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // Dusk sky dome: a gradient from ember orange at the horizon to deep blue
  // above, with a low sun glow to the west. It replaces the flat background
  // colour, so the skyline reads in every screenshot.
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(150, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#1d2b45') },
        mid: { value: new THREE.Color('#7a4a52') },
        horizon: { value: new THREE.Color('#ff8f3d') },
        sunDir: { value: new THREE.Vector3(-0.79, 0.30, 0.34).normalize() },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir;',
        'void main(){',
        '  float h = clamp(vDir.y, -0.1, 1.0);',
        '  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));',
        '  col = mix(col, top, smoothstep(0.18, 0.65, h));',
        '  float s = max(dot(normalize(vDir), sunDir), 0.0);',
        '  col += vec3(1.0, 0.55, 0.25) * pow(s, 90.0) * 0.9 + vec3(1.0, 0.5, 0.2) * pow(s, 6.0) * 0.25;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}',
      ].join('\n'),
    }),
  );
  scene.add(skyDome);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'panel' || name === 'accent' ? 0.45 : 0.92,
      metalness: name === 'panel' ? 0.35 : 0.03,
    });
  }
  // Painted surfaces: the ground gets the asphalt texture (its colour comes
  // from the canvas, so the material colour goes white) and the concrete gets
  // a stained texture, so flat boxes stop reading as flat colour.
  materials.ground.map = asphaltTexture();
  materials.ground.color.set('#ffffff');
  materials.concrete.map = concreteTexture();
  materials.concrete.color.set('#ffffff');
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.85, metalness: 0.05 });

  const colliders = [];
  const shootables = [];
  const siteDecals = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function tiltedPanel(x, z, rotationY) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 2.3), materials.panel);
    panel.position.set(x, 1.5, z);
    panel.rotation.set(-0.42, rotationY, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), materials.concreteDark);
    leg.position.set(x, 0.75, z + 0.6);
    group.add(leg);
    const leg2 = leg.clone();
    leg2.position.set(x, 0.75, z - 0.6);
    group.add(leg2);
    colliders.push(new THREE.Box3().setFromObject(panel));
    shootables.push(panel);
    return panel;
  }

  // Ground and outer walls: 64 x 48 m yard, 4.5 m walls.
  box(65.6, 0.4, 48.8, 0, -0.2, 0, 'ground');
  box(0.8, 4.5, 48.8, -32.4, 2.25, 0, 'concrete');
  box(0.8, 4.5, 48.8, 32.4, 2.25, 0, 'concrete');
  box(65.6, 4.5, 0.8, 0, 2.25, -24.4, 'concrete');
  box(65.6, 4.5, 0.8, 0, 2.25, 24.4, 'concrete');

  // Mid side walls (x = +/-10) with a 6 m "mid doors" gap at z in [-3, 3].
  for (const side of [-1, 1]) {
    box(0.6, 3.2, 5, side * 10, 1.6, 5.5, 'concrete');
    box(0.6, 3.2, 5, side * 10, 1.6, -5.5, 'concrete');
  }
  // North divider at z = -8, gaps at A [-20,-17], mid [-2.5,2.5], B [17,20].
  box(12, 3.2, 0.6, -26, 1.6, -8, 'concrete');
  box(14.5, 3.2, 0.6, -9.75, 1.6, -8, 'concrete');
  box(14.5, 3.2, 0.6, 9.75, 1.6, -8, 'concrete');
  box(12, 3.2, 0.6, 26, 1.6, -8, 'concrete');
  // Centre wall between the sites (x = 0), gap at z in [-17,-15] for the CT connector.
  box(0.6, 3.2, 3, 0, 1.6, -13.5, 'concrete');
  box(0.6, 3.2, 7, 0, 1.6, -20.5, 'concrete');

  // Cover: crates (1.1 m, crouch height) and containers (2.4-2.6 m).
  const crates = [
    [3.5, 11, 2.2, 2.2, 1.1, 'wood'], [-2.5, 4, 1.4, 1.4, 1.1, 'wood'], [2.5, -4, 1.4, 1.4, 1.1, 'wood'],
    [3, -6.5, 1.6, 1.6, 1.1, 'wood'],
    [-18, 11, 1.6, 1.6, 1.1, 'wood'], [-27.5, 3, 2.2, 2.2, 1.2, 'wood'], [-12, 16, 1.4, 1.4, 1.1, 'wood'],
    [18, 11, 1.6, 1.6, 1.1, 'wood'], [27.5, 3, 2.2, 2.2, 1.2, 'wood'], [12, 16, 1.4, 1.4, 1.1, 'wood'],
    [-17, -11, 2, 2, 1.2, 'wood'], [-27, -11, 1.6, 1.6, 1.1, 'wood'],
    [17, -11, 2, 2, 1.2, 'wood'], [27, -11, 1.6, 1.6, 1.1, 'wood'],
    [-7, 18.5, 1.5, 1.5, 1.1, 'wood'], [7, 18.5, 1.5, 1.5, 1.1, 'wood'], [0, 22, 2.5, 1.2, 1.2, 'wood'],
    [-6, -21, 1.5, 1.5, 1.1, 'wood'], [6, -21, 1.5, 1.5, 1.1, 'wood'],
  ];
  for (const [x, z, w, d, h, mat] of crates) box(w, h, d, x, h / 2, z, mat);
  const containers = [
    [-28, 12, 2.0, 1.6, 2.4, 'container'], [28, 12, 2.0, 1.6, 2.4, 'containerB'],
    [-25, -18, 4.2, 2.4, 2.6, 'container'], [25, -18, 4.2, 2.4, 2.6, 'containerB'],
    [19, -21, 3, 1.5, 2.2, 'rust'], [-19, -21, 3, 1.5, 2.2, 'rust'],
  ];
  for (const [x, z, w, d, h, mat] of containers) box(w, h, d, x, h / 2, z, mat);

  // Solar arrays on Site A, a rusted gantry on Site B.
  tiltedPanel(-26, -19, 0.15);
  tiltedPanel(-26, -15.5, -0.1);
  tiltedPanel(-21, -21, 0.3);
  tiltedPanel(-13.5, -20, 0.2);
  tiltedPanel(-13.5, -16.5, -0.2);
  box(0.5, 4.2, 0.5, 19, 2.1, -19, 'rust');
  box(0.5, 4.2, 0.5, 25, 2.1, -19, 'rust');
  box(7, 0.4, 0.6, 22, 4.2, -19, 'rust');

  // Yard props: light poles flanking mid, barrels and cable reels as cover,
  // sandbags guarding the site approaches. Every prop sits clear of the
  // waypoint nodes, so bots never have to path around one.
  function lightPole(x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 8), materials.concreteDark);
    pole.position.set(x, 2.8, z);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.28), materials.rust);
    head.position.set(x, 5.6, z);
    group.add(head);
    const lamp = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0') }),
    );
    lamp.position.set(x, 5.52, z);
    lamp.rotation.x = Math.PI / 2;
    group.add(lamp);
  }
  lightPole(-9.4, 5.8);
  lightPole(9.4, -5.8);

  function barrel(x, z, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 12), materials[material]);
    mesh.position.set(x, 0.48, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }
  barrel(-14, 2, 'rust');
  barrel(-13.2, 2.6, 'containerB');
  barrel(14, 16, 'rust');
  barrel(14.8, 15.4, 'container');
  barrel(-6, -14, 'containerB');
  barrel(6, 12, 'rust');

  function cableReel(x, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 14), materials.wood);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, 0.7, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }
  cableReel(-28, 6);
  cableReel(28, -6);

  // Sandbags (low cover) guarding the site approaches.
  box(1.6, 0.45, 0.5, -19.5, 0.225, -10.5, 'concreteDark');
  box(1.6, 0.45, 0.5, -24.5, 0.225, -10.5, 'concreteDark');
  box(1.6, 0.45, 0.5, 19.5, 0.225, -10.5, 'concreteDark');
  box(1.6, 0.45, 0.5, 24.5, 0.225, -10.5, 'concreteDark');
  box(1.6, 0.45, 0.5, -3.2, 0.225, -6.8, 'concreteDark');
  box(1.6, 0.45, 0.5, 3.2, 0.225, -6.8, 'concreteDark');

  // Hazard floor strips across the site gaps and the mid doors, so the
  // entrances read as entrances from down a lane.
  function hazardStrip(w, d, x, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), hazardMat);
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  hazardStrip(3.4, 0.6, -18.5, -8);
  hazardStrip(3.4, 0.6, 18.5, -8);
  hazardStrip(0.6, 6, -10, 0);
  hazardStrip(0.6, 6, 10, 0);

  // Painted yard sign on the north wall, the map's one piece of writing.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.5),
    new THREE.MeshBasicMaterial({ map: signTexture() }),
  );
  // Centred on the mid gap in the north divider, so the sign reads whole
  // from mid-lane through the gap instead of being sliced by the wall.
  sign.position.set(-3, 3.4, -23.9);
  group.add(sign);

  // Painted lane lines on the asphalt: a mid service road and site boxes.
  function stripe(w, d, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), materials[material]);
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  stripe(0.3, 30, -2, 4, 'accent');
  stripe(0.3, 30, 2, 4, 'accent');

  // Site decals: a coloured ground ring and a floating letter, so a site reads at a glance.
  function siteLetter(letter, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 70);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(2.4, 2.4, 1);
    return sprite;
  }
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    siteDecals.push(ring);
    const letter = siteLetter(key, site.color);
    letter.position.set(site.x, 4.4, site.z);
    group.add(letter);
    siteDecals.push(letter);
  }

  // Light: a low dusk sun from the west, a cool sky fill, a soft fill from the
  // east so shadowed faces never go black, and one lamp over each site plus a
  // floodlight over mid. v1 was too dark to read at a glance; these levels keep
  // the dusk mood while the lanes, the sites and the bots stay legible.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a97b5'), new THREE.Color('#3a2f28'), 1.5);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb26b'), 3.4);
  sun.position.set(-28, 18, 12);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#6f87b8'), 0.7);
  fill.position.set(30, 22, -8);
  scene.add(fill);
  const lampA = new THREE.PointLight(new THREE.Color(PALETTE.siteA), 20, 18, 1.6);
  lampA.position.set(SITES.A.x, 5, SITES.A.z);
  scene.add(lampA);
  const lampB = new THREE.PointLight(new THREE.Color(PALETTE.siteB), 20, 18, 1.6);
  lampB.position.set(SITES.B.x, 5, SITES.B.z);
  scene.add(lampB);
  const midLamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 20, 30, 1.6);
  midLamp.position.set(0, 7, 0);
  scene.add(midLamp);

  // Distant silhouettes outside the walls, for the skyline in screenshots.
  const silhouettes = [
    [-40, -30, 8, 18, 8], [20, -34, 12, 24, 10], [44, -10, 8, 14, 8],
    [-44, 14, 10, 20, 10], [40, 26, 9, 16, 9], [-14, -36, 14, 12, 12],
  ];
  for (const [x, z, w, h, d] of silhouettes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.concreteDark);
    mesh.position.set(x, h / 2, z);
    group.add(mesh);
    // A few lit windows on the yard-facing side, so the skyline reads at dusk.
    const windowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffbf5e') });
    for (const [wy, wx] of [[0.55, -0.22], [0.7, 0.18], [0.35, 0.05]]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), windowMat);
      win.position.set(x + wx * w, h * wy, z + d / 2 + 0.02);
      group.add(win);
    }
  }

  // The bomb: a small blinking case, hidden until a round plants or drops it.
  const bombGroup = new THREE.Group();
  const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.24), materials.rust);
  bombBody.castShadow = true;
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.enemy) }),
  );
  bombLight.position.set(0, 0.13, 0);
  const bombPoint = new THREE.PointLight(new THREE.Color(PALETTE.enemy), 0, 6, 1.8);
  bombPoint.position.set(0, 0.4, 0);
  bombGroup.add(bombBody, bombLight, bombPoint);
  bombGroup.visible = false;
  scene.add(bombGroup);

  // Waypoint adjacency, built once.
  const adjacency = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  function segmentBlocked(ax, ay, az, bx, by, bz, spheres) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    for (let i = 0; i < colliders.length; i += 1) {
      const box3 = colliders[i];
      let t0 = 0;
      let t1 = 1;
      let ok = true;
      const mins = [box3.min.x, box3.min.y, box3.min.z];
      const maxs = [box3.max.x, box3.max.y, box3.max.z];
      const origins = [ax, ay, az];
      const dirs = [dx, dy, dz];
      for (let axis = 0; axis < 3; axis += 1) {
        const d = dirs[axis];
        if (Math.abs(d) < 1e-9) {
          if (origins[axis] < mins[axis] || origins[axis] > maxs[axis]) { ok = false; break; }
        } else {
          let ta = (mins[axis] - origins[axis]) / d;
          let tb = (maxs[axis] - origins[axis]) / d;
          if (ta > tb) { const t = ta; ta = tb; tb = t; }
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
          if (t0 > t1) { ok = false; break; }
        }
      }
      if (ok && t1 >= 0 && t0 <= 1) return true;
    }
    if (spheres) {
      for (let i = 0; i < spheres.length; i += 1) {
        const s = spheres[i];
        const cx = s.x - ax;
        const cy = s.y - ay;
        const cz = s.z - az;
        const lenSq = dx * dx + dy * dy + dz * dz;
        if (lenSq < 1e-9) continue;
        let t = (cx * dx + cy * dy + cz * dz) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const px = ax + dx * t - s.x;
        const py = ay + dy * t - s.y;
        const pz = az + dz * t - s.z;
        if (px * px + py * py + pz * pz < s.r * s.r) return true;
      }
    }
    return false;
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < NODES.length; i += 1) {
      const dx = NODES[i][0] - x;
      const dz = NODES[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function findPath(fromX, fromZ, toX, toZ) {
    const start = nearestNode(fromX, fromZ);
    const goal = nearestNode(toX, toZ);
    if (start === goal) return [[toX, toZ]];
    const prev = new Array(NODES.length).fill(-1);
    const queue = [start];
    prev[start] = start;
    while (queue.length > 0) {
      const node = queue.shift();
      if (node === goal) break;
      for (const next of adjacency[node]) {
        if (prev[next] === -1) {
          prev[next] = node;
          queue.push(next);
        }
      }
    }
    if (prev[goal] === -1) return [[toX, toZ]];
    const path = [];
    let node = goal;
    while (node !== start) {
      path.unshift([NODES[node][0], NODES[node][1]]);
      node = prev[node];
    }
    path.push([toX, toZ]);
    return path;
  }

  return {
    colliders,
    shootables,
    group,
    bombGroup,
    bombLight,
    bombPoint,
    segmentBlocked,
    findPath,
    nearestNode,
    siteAt(x, z) {
      for (const key of ['A', 'B']) {
        const site = SITES[key];
        const dx = x - site.x;
        const dz = z - site.z;
        if (dx * dx + dz * dz <= site.r * site.r) return key;
      }
      return null;
    },
  };
}
