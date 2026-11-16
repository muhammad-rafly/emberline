// Visual effects, pooled and reused: tracers, impact puffs, smoke billboards and the
// explosion flash. Nothing here allocates in the hot loop; the pools are built once
// and cycled. Smoke sprites are created only when a smoke cloud is born and freed
// when it dies.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function softTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createEffects(scene) {
  const soft = softTexture();

  const tracers = [];
  for (let i = 0; i < 12; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const puffs = [];
  for (let i = 0; i < 10; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: new THREE.Color(PALETTE.muted), transparent: true, opacity: 0, depthWrite: false }));
    sprite.scale.set(0.3, 0.3, 1);
    scene.add(sprite);
    puffs.push({ sprite, life: 0 });
  }
  let puffIndex = 0;

  const smokeSprites = new Map();
  const explosionLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 22, 1.5);
  scene.add(explosionLight);
  const explosionSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  explosionSprite.scale.set(1, 1, 1);
  scene.add(explosionSprite);
  let explosionLife = 0;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  // Reused across frames: syncSmoke runs every frame and must not allocate.
  const aliveSmoke = new Set();

  return {
    tracer(from, to) {
      const t = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % tracers.length;
      const positions = t.line.geometry.attributes.position.array;
      positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
      positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.opacity = 0.85;
      t.life = 0.07;
    },
    impact(point, color) {
      const p = puffs[puffIndex];
      puffIndex = (puffIndex + 1) % puffs.length;
      p.sprite.position.copy(point);
      p.sprite.material.color.set(color || PALETTE.muted);
      p.sprite.material.opacity = 0.9;
      p.sprite.scale.set(0.35, 0.35, 1);
      p.life = 0.16;
    },
    explosion(point) {
      explosionLight.position.copy(point);
      explosionLight.position.y += 0.5;
      explosionLight.intensity = 90;
      explosionSprite.position.copy(point);
      explosionSprite.position.y += 0.5;
      explosionSprite.material.opacity = 1;
      explosionSprite.scale.set(2, 2, 1);
      explosionLife = 0.45;
    },
    // Sync smoke billboards with the live smoke list from combat. Creates a sprite
    // per cloud once, fades it with its ttl, frees it when the cloud dies.
    syncSmoke(smokes, time) {
      const alive = aliveSmoke;
      alive.clear();
      for (const s of smokes) {
        alive.add(s);
        let sprite = smokeSprites.get(s);
        if (!sprite) {
          sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: new THREE.Color('#9aa4ad'), transparent: true, opacity: 0.55, depthWrite: false }));
          sprite.position.set(s.x, s.y, s.z);
          scene.add(sprite);
          smokeSprites.set(s, sprite);
        }
        const fade = Math.min(1, s.ttl / 3);
        sprite.material.opacity = 0.55 * fade;
        const grow = 1 + (1 - s.ttl / s.maxTtl) * 0.4 + Math.sin(time * 0.7 + s.seed) * 0.06;
        sprite.scale.set(s.r * 2 * grow, s.r * 1.6 * grow, 1);
      }
      for (const [s, sprite] of smokeSprites) {
        if (!alive.has(s)) {
          scene.remove(sprite);
          sprite.material.dispose();
          smokeSprites.delete(s);
        }
      }
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
        }
      }
      for (const p of puffs) {
        if (p.life > 0) {
          p.life -= dt;
          p.sprite.material.opacity = Math.max(0, p.life / 0.16) * 0.9;
          const s = 0.35 + (0.16 - Math.max(0, p.life)) * 2.2;
          p.sprite.scale.set(s, s, 1);
        }
      }
      if (explosionLife > 0) {
        explosionLife -= dt;
        const k = Math.max(0, explosionLife / 0.45);
        explosionLight.intensity = 90 * k;
        explosionSprite.material.opacity = k;
        const s = 2 + (1 - k) * 10;
        explosionSprite.scale.set(s, s, 1);
      }
    },
    muzzleWorld(camera, out) {
      tmpA.set(0.24, -0.18, -0.95);
      camera.localToWorld(tmpA);
      out.copy(tmpA);
      return out;
    },
    clear() {
      for (const t of tracers) { t.life = 0; t.line.material.opacity = 0; }
      for (const p of puffs) { p.life = 0; p.sprite.material.opacity = 0; }
      for (const [, sprite] of smokeSprites) {
        scene.remove(sprite);
        sprite.material.dispose();
      }
      smokeSprites.clear();
      explosionLife = 0;
      explosionLight.intensity = 0;
      explosionSprite.material.opacity = 0;
    },
  };
}
