// The player: acceleration, friction, gravity, crouch and jump, resolved by the shared
// mover one axis at a time. Health lives here too; damage comes through hurt().
import * as THREE from 'three';

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const ADS_SPEED = 3.1;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(mover, start) {
  const body = {
    position: new THREE.Vector3(start.x, 0, start.z),
    velocity: new THREE.Vector3(),
    yaw: start.yaw,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
  };
  const wish = new THREE.Vector3();
  let stepDistance = 0;

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys, aiming) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && body.crouching && !mover.overlaps(body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = body.crouching ? CROUCH_SPEED : aiming ? ADS_SPEED : WALK_SPEED;
    const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    const beforeX = body.position.x;
    const beforeZ = body.position.z;
    mover.move(body, dt, GRAVITY);
    stepDistance += Math.hypot(body.position.x - beforeX, body.position.z - beforeZ);
  }

  return {
    body,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    // True once the player has walked 2.2 m since the last call (footstep timing).
    stepped() {
      if (stepDistance >= 2.2) {
        stepDistance = 0;
        return true;
      }
      return false;
    },
    hurt(amount) {
      body.health = Math.max(0, body.health - amount);
      return body.health <= 0;
    },
    heal() {
      body.health = 100;
    },
    reset(start) {
      body.position.set(start.x, 0, start.z);
      body.velocity.set(0, 0, 0);
      body.yaw = start.yaw;
      body.pitch = 0;
      body.eye = STAND_EYE;
      body.crouching = false;
      body.height = STAND_HEIGHT;
      body.health = 100;
      body.onGround = true;
      stepDistance = 0;
    },
  };
}
