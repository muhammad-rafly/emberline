// Combat: one raycast for a shot, one damage rule for every hit. The shooter's ray is
// tested against the world's surfaces and every registered actor's torso and head, and
// the nearest hit wins. Head shots pay more; damage falls off with range. Grenades fly
// as points with gravity and bounce off the world's boxes, then burst: HE hurts in a
// radius, smoke leaves clouds that block sight. No allocation in the hot path: one
// raycaster and a handful of reused vectors.
import * as THREE from 'three';
import { GRENADES } from './weapons.js';

const GRAVITY = 14;
const BOUNCE = 0.45;

export function createCombat(scene, world) {
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const grenadeOrigin = new THREE.Vector3();
  const grenadeDir = new THREE.Vector3();
  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.4 }),
  );
  const hitMeshes = [];
  const grenades = [];
  const smokes = [];

  function registerHitMeshes(meshes) {
    for (const mesh of meshes) hitMeshes.push(mesh);
  }

  function unregisterHitMeshes(meshes) {
    for (const mesh of meshes) {
      const index = hitMeshes.indexOf(mesh);
      if (index !== -1) hitMeshes.splice(index, 1);
    }
  }

  // Does the segment from->to pass through any live smoke cloud? A shooter
  // standing inside a cloud is not blocked by it, only by clouds in between.
  function smokeBlocks(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    if (lenSq < 1e-9) return false;
    for (let i = 0; i < smokes.length; i += 1) {
      const s = smokes[i];
      const fx = from.x - s.x;
      const fy = from.y - s.y;
      const fz = from.z - s.z;
      if (fx * fx + fy * fy + fz * fz < s.r * s.r) continue;
      let t = ((s.x - from.x) * dx + (s.y - from.y) * dy + (s.z - from.z) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const px = from.x + dx * t - s.x;
      const py = from.y + dy * t - s.y;
      const pz = from.z + dz * t - s.z;
      if (px * px + py * py + pz * pz < s.r * s.r) return true;
    }
    return false;
  }

  // Fire one hitscan shot. Returns null, or { kind: 'actor'|'world', actor, part,
  // point, distance }. actor is the target object the meshes were registered with.
  // The shooter's own meshes are skipped, so a ray that starts inside its own
  // head can never hit itself. A smoke cloud between shooter and hit swallows
  // the bullet, so smoke blocks sight and shots alike.
  function shoot(from, dir, range, ignoreActor) {
    origin.copy(from);
    direction.copy(dir);
    raycaster.set(origin, direction);
    raycaster.far = range;
    const hits = raycaster.intersectObjects(world.shootables.concat(hitMeshes), false);
    let hit = null;
    for (let i = 0; i < hits.length; i += 1) {
      const candidate = hits[i];
      const target = candidate.object.userData.target;
      if (target && target === ignoreActor) continue;
      hit = candidate;
      break;
    }
    if (!hit) return null;
    if (smokeBlocks(origin, hit.point)) return null;
    const target = hit.object.userData.target;
    if (target && target.alive) {
      return { kind: 'actor', actor: target, part: hit.object.userData.part || 'torso', point: hit.point, distance: hit.distance };
    }
    return { kind: 'world', actor: null, part: null, point: hit.point, distance: hit.distance };
  }

  function damageFor(def, part, distance) {
    let damage = def.damage * (part === 'head' ? def.headMult : 1);
    if (distance > 35) damage *= 0.75;
    else if (distance > 20) damage *= 0.9;
    return damage;
  }

  function throwGrenade(id, from, dir, owner) {
    const def = GRENADES[id];
    if (!def) return;
    const mesh = grenadeMesh.clone();
    mesh.position.copy(from);
    scene.add(mesh);
    grenadeOrigin.copy(from);
    grenadeDir.copy(dir);
    grenades.push({
      id, def, mesh, owner: owner ?? null,
      velocity: new THREE.Vector3(dir.x * 16, dir.y * 16 + 3.2, dir.z * 16),
      fuse: def.fuse,
      position: mesh.position,
    });
  }

  function pointInsideAny(x, y, z) {
    for (const box of world.colliders) {
      if (x > box.min.x - 0.08 && x < box.max.x + 0.08 && y > box.min.y - 0.08 && y < box.max.y + 0.08 && z > box.min.z - 0.08 && z < box.max.z + 0.08) {
        return box;
      }
    }
    return null;
  }

  // Step grenades. onBounce and onExplode are callbacks main.js owns (sound, effects,
  // damage); combat only decides when they happen.
  function stepGrenades(dt, onBounce, onExplode) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      const sub = 4;
      const subDt = dt / sub;
      for (let s = 0; s < sub; s += 1) {
        const px = g.position.x;
        const py = g.position.y;
        const pz = g.position.z;
        g.velocity.y -= GRAVITY * subDt;
        g.position.x += g.velocity.x * subDt;
        g.position.y += g.velocity.y * subDt;
        g.position.z += g.velocity.z * subDt;
        if (g.position.y < 0.09) {
          g.position.y = 0.09;
          if (Math.abs(g.velocity.y) > 1) onBounce(g.position);
          g.velocity.y = Math.abs(g.velocity.y) * BOUNCE;
          g.velocity.x *= 0.7;
          g.velocity.z *= 0.7;
        }
        const box = pointInsideAny(g.position.x, g.position.y, g.position.z);
        if (box) {
          const wasOutsideX = px <= box.min.x - 0.08 || px >= box.max.x + 0.08;
          const wasOutsideY = py <= box.min.y - 0.08 || py >= box.max.y + 0.08;
          const wasOutsideZ = pz <= box.min.z - 0.08 || pz >= box.max.z + 0.08;
          if (wasOutsideX) { g.velocity.x = -g.velocity.x * BOUNCE; g.position.x = px; }
          else if (wasOutsideY) { g.velocity.y = -g.velocity.y * BOUNCE; g.position.y = py; }
          else if (wasOutsideZ) { g.velocity.z = -g.velocity.z * BOUNCE; g.position.z = pz; }
          else { g.velocity.multiplyScalar(-BOUNCE); g.position.set(px, py, pz); }
          onBounce(g.position);
        }
      }
      if (g.fuse <= 0) {
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        onExplode(g);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      smokes[i].ttl -= dt;
      if (smokes[i].ttl <= 0) smokes.splice(i, 1);
    }
  }

  function addSmoke(x, y, z, random) {
    for (let i = 0; i < 5; i += 1) {
      smokes.push({
        x: x + (random() * 2 - 1) * 1.6,
        y: 1.1 + random() * 0.7,
        z: z + (random() * 2 - 1) * 1.6,
        r: 2.1 + random() * 0.5,
        ttl: 14,
        maxTtl: 14,
        seed: random() * 10,
      });
    }
  }

  return {
    hitMeshes,
    grenades,
    smokes,
    registerHitMeshes,
    unregisterHitMeshes,
    shoot,
    damageFor,
    throwGrenade,
    stepGrenades,
    addSmoke,
    clear() {
      for (const g of grenades) scene.remove(g.mesh);
      grenades.length = 0;
      smokes.length = 0;
    },
  };
}
