// Bots: 4v4, the player plus three Ember allies against four Ash defenders. A bot is
// a small state machine — route, hold, engage, plant, defuse, investigate — over the
// world's waypoint graph. It sees with a segment test against the world's colliders
// (and smoke), hears gunfire and plants as noise, and shoots in bursts with a
// reaction delay and an aim error that grows with distance and movement, so a still
// target at range is dangerous and a moving one is not. Names are original.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { SITES, SPAWNS } from './world.js';
import { addNoise, actorById, aliveActors } from './state.js';

const BOT_SPEED = 4.3;
const EYE_HEIGHT = 1.5;
const BOT_HEIGHT = 1.72;
const PERCEIVE_EVERY = 0.15;
const VIEW_RANGE = 55;

const ALLY_NAMES = ['Vex', 'Mira', 'Doss'];
const ENEMY_NAMES = ['Rook', 'Hale', 'Sable', 'Fang'];

function buildBody(scene, side, name) {
  const teamColor = side === 'ember' ? PALETTE.ally : PALETTE.enemy;
  const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.65, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.85 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.1 });
  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 0.28), darkMat);
  legs.position.y = 0.31;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), torsoMat);
  torso.position.y = 1.0;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), headMat);
  head.position.y = 1.55;
  head.userData.part = 'head';
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
  gun.position.set(0.2, 1.15, -0.3);
  group.add(legs, torso, head, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head };
}

function makeWeapon(random, side, money) {
  const def = money >= WEAPONS.rifle.price ? WEAPONS.rifle : money >= WEAPONS.smg.price ? WEAPONS.smg : WEAPONS.pistol;
  return { def, mag: def.mag, reserve: def.reserve, cooldown: 0, reloading: 0 };
}

export function createBots(scene, world, mover, combat, state) {
  const bots = [];

  function spawnBot(id, side, name, spawn, skill) {
    const body = buildBody(scene, side, name);
    const actor = {
      id, side, name, isPlayer: false, alive: true, health: 100,
      position: new THREE.Vector3(spawn.x, 0, spawn.z),
      velocity: new THREE.Vector3(),
      yaw: spawn.yaw, pitch: 0, height: BOT_HEIGHT, onGround: true,
      weapon: makeWeapon(state.random, side, 800),
      money: 800,
      mode: 'route',
      path: [],
      pathIndex: 0,
      holdYaw: spawn.yaw,
      holdUntil: 0,
      targetSite: null,
      target: null,
      lastSeen: null,
      lastSeenTime: -99,
      reactionAt: 0,
      burstLeft: 0,
      burstPause: 0,
      perceiveAt: skill * 0.05,
      stuckAt: 0,
      stuckX: spawn.x,
      stuckZ: spawn.z,
      investigateAt: null,
      skill,
      group: body.group,
      torso: body.torso,
      head: body.head,
      fall: 0,
    };
    body.torso.userData.target = actor;
    body.head.userData.target = actor;
    combat.registerHitMeshes([body.torso, body.head]);
    bots.push(actor);
    state.actors.push(actor);
    return actor;
  }

  function spawnAll() {
    for (let i = 0; i < 3; i += 1) {
      spawnBot(`ally-${i}`, 'ember', ALLY_NAMES[i], SPAWNS.ember[i + 1], 0.9 + state.random() * 0.3);
    }
    for (let i = 0; i < 4; i += 1) {
      spawnBot(`enemy-${i}`, 'ash', ENEMY_NAMES[i], SPAWNS.ash[i], 0.85 + state.random() * 0.35);
    }
  }

  function assignRound() {
    const allies = bots.filter((b) => b.side === 'ember');
    const enemies = bots.filter((b) => b.side === 'ash');
    const plans = [
      { site: 'A', via: 'A' },
      { site: 'B', via: 'B' },
      { site: 'A', via: 'mid' },
    ];
    allies.forEach((bot, i) => {
      bot.targetSite = plans[i % plans.length].site;
      routeTo(bot, sitePoint(plans[i % plans.length].via, plans[i % plans.length].site));
    });
    const holds = [
      { x: SITES.A.x, z: SITES.A.z + 3 },
      { x: SITES.B.x, z: SITES.B.z + 3 },
      { x: 0, z: -11 },
      { x: 0, z: -16 },
    ];
    enemies.forEach((bot, i) => {
      bot.targetSite = null;
      routeTo(bot, holds[i % holds.length]);
      bot.mode = 'route';
    });
  }

  function sitePoint(via, site) {
    if (via === 'A') return { x: SITES.A.x, z: SITES.A.z };
    if (via === 'B') return { x: SITES.B.x, z: SITES.B.z };
    return { x: SITES[site].x, z: SITES[site].z };
  }

  function routeTo(bot, point) {
    bot.path = world.findPath(bot.position.x, bot.position.z, point.x, point.z);
    bot.pathIndex = 0;
    bot.mode = 'route';
  }

  function eyeOf(actor) {
    return { x: actor.position.x, y: EYE_HEIGHT, z: actor.position.z };
  }

  function canSee(bot, other, smokes) {
    const dx = other.position.x - bot.position.x;
    const dz = other.position.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VIEW_RANGE) return false;
    const eye = eyeOf(bot);
    const chestY = other.isPlayer ? other.position.y + other.eye - 0.25 : 1.25;
    return !world.segmentBlocked(eye.x, eye.y, eye.z, other.position.x, chestY, other.position.z, smokes);
  }

  function perceive(bot, ctx, dt) {
    bot.perceiveAt -= dt;
    if (bot.perceiveAt > 0) return;
    bot.perceiveAt = PERCEIVE_EVERY;
    let best = null;
    let bestDist = Infinity;
    for (const other of state.actors) {
      if (!other.alive || other.side === bot.side) continue;
      const dx = other.position.x - bot.position.x;
      const dz = other.position.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist && canSee(bot, other, ctx.smokes)) {
        best = other;
        bestDist = dist;
      }
    }
    if (best) {
      if (bot.target !== best) {
        bot.target = best;
        bot.reactionAt = state.time + (0.35 + state.random() * 0.35) * bot.skill;
        bot.burstLeft = 0;
        bot.burstPause = 0;
      }
      bot.lastSeen = { x: best.position.x, z: best.position.z };
      bot.lastSeenTime = state.time;
    } else if (bot.target && state.time - bot.lastSeenTime > 1.2) {
      bot.target = null;
    }
  }

  function hear(bot, ctx) {
    if (bot.mode === 'engage' || bot.mode === 'plant' || bot.mode === 'defuse') return;
    if (bot.side === 'ember' && state.bomb.carrierId === bot.id) return;
    for (const noise of state.noise) {
      if (state.time - noise.time > 2) continue;
      const dx = noise.x - bot.position.x;
      const dz = noise.z - bot.position.z;
      if (dx * dx + dz * dz > noise.radius * noise.radius) continue;
      if (bot.investigateAt && Math.hypot(bot.investigateAt.x - noise.x, bot.investigateAt.z - noise.z) < 3) return;
      bot.investigateAt = { x: noise.x, z: noise.z, until: state.time + 6 };
      routeTo(bot, bot.investigateAt);
      return;
    }
  }

  function faceToward(bot, x, z, dt, rate = 8) {
    const want = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += diff * Math.min(1, dt * rate);
  }

  function moveToward(bot, x, z, dt) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return true;
    const speed = BOT_SPEED;
    bot.velocity.x += ((dx / dist) * speed - bot.velocity.x) * Math.min(1, dt * 8);
    bot.velocity.z += ((dz / dist) * speed - bot.velocity.z) * Math.min(1, dt * 8);
    faceToward(bot, x, z, dt);
    mover.move(bot, dt, 0);
    return dist < 0.9;
  }

  function fireAt(bot, ctx, dt) {
    const weapon = bot.weapon;
    weapon.cooldown = Math.max(0, weapon.cooldown - dt);
    if (weapon.reloading > 0) {
      weapon.reloading -= dt;
      if (weapon.reloading <= 0) {
        const need = weapon.def.mag - weapon.mag;
        const take = Math.min(need, weapon.reserve);
        weapon.mag += take;
        weapon.reserve -= take;
      }
      return;
    }
    if (weapon.mag === 0) {
      if (weapon.reserve > 0) weapon.reloading = weapon.def.reload;
      return;
    }
    if (bot.burstPause > 0) {
      bot.burstPause -= dt;
      if (bot.burstPause <= 0) bot.burstLeft = 3 + Math.floor(state.random() * 3);
    } else if (bot.burstLeft <= 0) {
      // Idle with an empty burst and no pause means the first burst: start one
      // instead of waiting for a pause that will never come.
      bot.burstLeft = 3 + Math.floor(state.random() * 3);
    }
    if (bot.burstLeft <= 0 || weapon.cooldown > 0) return;
    const target = bot.target;
    if (!target || !target.alive) return;
    const dist = Math.hypot(target.position.x - bot.position.x, target.position.z - bot.position.z);
    const moving = Math.hypot(target.velocity.x, target.velocity.z) > 1.5;
    const error = (0.55 + dist * 0.028) * (moving ? 1.6 : 1) * bot.skill;
    const aimHead = state.random() < 0.12;
    const chestY = target.isPlayer ? target.position.y + target.eye - 0.25 : 1.25;
    const aimY = aimHead ? chestY + 0.35 : chestY;
    const tx = target.position.x + (state.random() * 2 - 1) * error;
    const ty = aimY + (state.random() * 2 - 1) * error * 0.6;
    const tz = target.position.z + (state.random() * 2 - 1) * error;
    const eye = eyeOf(bot);
    const dx = tx - eye.x;
    const dy = ty - eye.y;
    const dz = tz - eye.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const from = new THREE.Vector3(eye.x, eye.y, eye.z);
    const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
    const hit = ctx.combat.shoot(from, dir, weapon.def.range, bot);
    weapon.mag -= 1;
    weapon.cooldown = weapon.def.gap;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.burstPause = (0.5 + state.random() * 0.5) * bot.skill;
    const end = hit ? hit.point : new THREE.Vector3(eye.x + dir.x * 40, eye.y + dir.y * 40, eye.z + dir.z * 40);
    ctx.shotVisual(from, end, weapon.def.kind, dist);
    addNoise(state, bot.position.x, bot.position.z, 34, 'shot');
    if (hit && hit.kind === 'actor' && hit.actor.side !== bot.side) {
      const damage = ctx.combat.damageFor(weapon.def, hit.part, hit.distance);
      ctx.damageActor(hit.actor, damage, bot, hit.part);
    }
  }

  function stepBot(bot, ctx, dt) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    perceive(bot, ctx, dt);
    hear(bot, ctx);

    const bomb = state.bomb;
    const isCarrier = bomb.carrierId === bot.id;

    // Defenders rush a planted bomb; attackers defend it.
    if (bomb.status === 'planted') {
      if (bot.side === 'ash') {
        const site = SITES[bomb.site];
        const d = Math.hypot(bot.position.x - bomb.pos.x, bot.position.z - bomb.pos.z);
        if (d < 2.2 && !bot.target) {
          bot.mode = 'defuse';
        } else if (bot.mode !== 'defuse') {
          if (bot.mode !== 'route' || !bot.path.length) routeTo(bot, { x: site.x, z: site.z });
        }
      } else if (bot.mode === 'route' && !bot.path.length) {
        bot.mode = 'hold';
      }
    }

    if (bot.target && bot.target.alive) {
      bot.mode = 'engage';
      const t = bot.target;
      faceToward(bot, t.position.x, t.position.z, dt, 10);
      const dist = Math.hypot(t.position.x - bot.position.x, t.position.z - bot.position.z);
      if (dist > 14) {
        moveToward(bot, t.position.x, t.position.z, dt);
      } else {
        // Strafe a little while firing so the bot is not a statue.
        const strafe = Math.sin(state.time * 1.3 + bot.skill * 7) * 0.6;
        const px = t.position.x - bot.position.x;
        const pz = t.position.z - bot.position.z;
        const len = Math.hypot(px, pz) || 1;
        const sx = (-pz / len) * strafe;
        const sz = (px / len) * strafe;
        bot.velocity.x += (sx - bot.velocity.x) * Math.min(1, dt * 6);
        bot.velocity.z += (sz - bot.velocity.z) * Math.min(1, dt * 6);
        mover.move(bot, dt, 0);
      }
      if (state.time >= bot.reactionAt) fireAt(bot, ctx, dt);
    } else if (bot.mode === 'defuse') {
      const d = Math.hypot(bot.position.x - bomb.pos.x, bot.position.z - bomb.pos.z);
      if (bomb.status !== 'planted' || d > 2.4) {
        bot.mode = 'route';
        bomb.defuseProgress = 0;
        bomb.defuserId = null;
      } else {
        bomb.defuserId = bot.id;
        bomb.defuseProgress += dt / 5;
        if (Math.floor(bomb.defuseProgress * 20) !== Math.floor((bomb.defuseProgress - dt / 5) * 20)) ctx.onDefuseTick();
        if (bomb.defuseProgress >= 1) ctx.onDefused(bot);
      }
    } else if (bot.mode === 'plant') {
      const site = world.siteAt(bot.position.x, bot.position.z);
      if (!site) {
        bot.mode = 'route';
        bomb.plantProgress = 0;
      } else {
        bomb.plantProgress += dt / 4;
        if (Math.floor(bomb.plantProgress * 8) !== Math.floor((bomb.plantProgress - dt / 4) * 8)) ctx.onPlantTick();
        if (bomb.plantProgress >= 1) ctx.onPlanted(bot, site);
      }
    } else if (bot.mode === 'route') {
      if (bot.pathIndex < bot.path.length) {
        const [wx, wz] = bot.path[bot.pathIndex];
        const arrived = moveToward(bot, wx, wz, dt);
        if (arrived) bot.pathIndex += 1;
        // Stuck: not closing on the waypoint for a while, skip it.
        const moved = Math.hypot(bot.position.x - bot.stuckX, bot.position.z - bot.stuckZ);
        if (moved > 0.5) {
          bot.stuckX = bot.position.x;
          bot.stuckZ = bot.position.z;
          bot.stuckAt = state.time;
        } else if (state.time - bot.stuckAt > 1.5) {
          bot.pathIndex += 1;
          bot.stuckAt = state.time;
          bot.stuckX = bot.position.x;
          bot.stuckZ = bot.position.z;
        }
      } else {
        bot.mode = 'hold';
        bot.holdYaw = bot.yaw;
        bot.holdUntil = state.time + 2 + state.random() * 3;
        if (isCarrier && bomb.status === 'carried') {
          const site = world.siteAt(bot.position.x, bot.position.z);
          if (site) {
            bot.mode = 'plant';
            bomb.plantProgress = 0;
          }
        }
      }
    } else if (bot.mode === 'hold') {
      bot.velocity.x *= Math.max(0, 1 - 8 * dt);
      bot.velocity.z *= Math.max(0, 1 - 8 * dt);
      mover.move(bot, dt, 0);
      bot.yaw = bot.holdYaw + Math.sin(state.time * 0.5 + bot.skill * 5) * 0.9;
      if (isCarrier && bomb.status === 'carried') {
        const site = world.siteAt(bot.position.x, bot.position.z);
        if (site) {
          bot.mode = 'plant';
          bomb.plantProgress = 0;
        } else if (state.time > bot.holdUntil) {
          routeTo(bot, { x: SITES[bot.targetSite || 'A'].x, z: SITES[bot.targetSite || 'A'].z });
        }
      } else if (bot.investigateAt && state.time < bot.investigateAt.until && state.time > bot.holdUntil) {
        bot.investigateAt = null;
      }
    }

    bot.group.position.set(bot.position.x, 0, bot.position.z);
    bot.group.rotation.y = bot.yaw;
  }

  function buyRound() {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const def = bot.money >= WEAPONS.rifle.price ? WEAPONS.rifle : bot.money >= WEAPONS.smg.price ? WEAPONS.smg : WEAPONS.pistol;
      bot.weapon = { def, mag: def.mag, reserve: def.reserve, cooldown: 0, reloading: 0 };
    }
  }

  function resetRound() {
    const spawns = { ember: [...SPAWNS.ember], ash: [...SPAWNS.ash] };
    for (const bot of bots) {
      const list = spawns[bot.side];
      const spawn = list.shift() || list[0];
      bot.position.set(spawn.x, 0, spawn.z);
      bot.velocity.set(0, 0, 0);
      bot.yaw = spawn.yaw;
      bot.alive = true;
      bot.health = 100;
      bot.fall = 0;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.set(spawn.x, 0, spawn.z);
      bot.target = null;
      bot.lastSeen = null;
      bot.mode = 'route';
      bot.path = [];
      bot.pathIndex = 0;
      bot.investigateAt = null;
      bot.stuckAt = state.time;
      bot.stuckX = spawn.x;
      bot.stuckZ = spawn.z;
    }
    buyRound();
    assignRound();
  }

  function onCarrierDied(carrier) {
    const bomb = state.bomb;
    if (bomb.status !== 'carried' || bomb.carrierId !== carrier.id) return;
    bomb.status = 'dropped';
    bomb.pos = { x: carrier.position.x, z: carrier.position.z };
    bomb.carrierId = null;
    world.bombGroup.visible = true;
    world.bombGroup.position.set(carrier.position.x, 0.15, carrier.position.z);
  }

  function pickupCheck() {
    const bomb = state.bomb;
    if (bomb.status !== 'dropped' || !bomb.pos) return;
    for (const bot of bots) {
      if (!bot.alive || bot.side !== 'ember') continue;
      const d = Math.hypot(bot.position.x - bomb.pos.x, bot.position.z - bomb.pos.z);
      if (d < 1.4) {
        bomb.status = 'carried';
        bomb.carrierId = bot.id;
        bomb.pos = null;
        world.bombGroup.visible = false;
        routeTo(bot, { x: SITES[bot.targetSite || 'A'].x, z: SITES[bot.targetSite || 'A'].z });
        return;
      }
    }
  }

  spawnAll();

  return {
    bots,
    step(dt, ctx) {
      pickupCheck();
      for (const bot of bots) stepBot(bot, ctx, dt);
    },
    resetRound,
    onCarrierDied,
    aliveCount(side) {
      return aliveActors(state, side);
    },
    clear() {
      for (const bot of bots) combat.unregisterHitMeshes([bot.torso, bot.head]);
    },
  };
}
