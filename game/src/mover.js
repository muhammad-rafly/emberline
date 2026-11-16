// One box mover, shared by the player and the bots, so collision is solved once and the
// same way everywhere. A body is a circle of radius RADIUS in the horizontal plane with a
// height; it is tested axis by axis against the world's Box3 colliders, so a wall never
// swallows a body and sliding along a wall works. No allocation per call: one probe Box3.
import * as THREE from 'three';

const RADIUS = 0.34;

export function createMover(colliders) {
  const probe = new THREE.Box3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  // Move a body (position Vector3, velocity Vector3) one fixed step. Gravity and ground
  // detection are the caller's job for the y axis; this resolves x, z and landing.
  function move(body, dt, gravity) {
    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) {
      body.position.x = nextX;
    } else {
      body.velocity.x = 0;
    }
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) {
      body.position.z = nextZ;
    } else {
      body.velocity.z = 0;
    }
    if (gravity !== 0) body.velocity.y -= gravity * dt;
    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    // Landing (or a ceiling bump) must be a surface the body is actually moving
    // onto, not just any box the probe touches: a wall face beside the body has a
    // top far above its feet and must never become a landing surface.
    probe.min.set(body.position.x - RADIUS, body.position.y, body.position.z - RADIUS);
    probe.max.set(body.position.x + RADIUS, body.position.y + body.height, body.position.z + RADIUS);
    let land = null;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      if (!probe.intersectsBox(c)) continue;
      if (body.velocity.y <= 0) {
        if (c.max.y <= body.position.y + 0.06 && (!land || c.max.y > land.max.y)) land = c;
      } else if (c.min.y >= body.position.y + body.height - 0.06 && (!land || c.min.y < land.min.y)) {
        land = c;
      }
    }
    if (land && body.velocity.y <= 0) {
      body.position.y = land.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (land) {
      body.position.y = land.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    if (body.velocity.y < -30) body.velocity.y = -30;
  }

  return { move, overlaps, radius: RADIUS };
}
