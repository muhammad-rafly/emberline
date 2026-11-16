// EMBERLINE boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. main.js wires the modules together and owns the glue the others do
// not: the player's shots, grenade throws, bomb planting, damage and the match flow.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState, START_MONEY, PLANT_TIME, BOMB_TIME, addNoise, aliveActors, pushFeed } from './state.js';
import { createWorld, SPAWNS } from './world.js';
import { createMover } from './mover.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSet, WEAPONS, GRENADES } from './weapons.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createBots } from './bots.js';
import { createMatch } from './match.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

const state = createState(seed);
const random = state.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 78);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const mover = createMover(world.colliders);
const combat = createCombat(scene, world);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(mover, SPAWNS.ember[0]);
const weapons = createWeaponSet(camera);

// The player is an actor like any bot, so bots can see and shoot them with the same
// code path. The body object carries the actor fields; hurt() owns health.
const playerActor = player.body;
playerActor.id = 'player';
playerActor.side = 'ember';
playerActor.name = 'You';
playerActor.isPlayer = true;
playerActor.alive = true;
state.actors.push(playerActor);

// Invisible hitboxes for the player (colour write off, so nothing shows) that the
// raycaster still tests, so bots can hit the player with real hitscan.
const ghostMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const torsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), ghostMat);
const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), ghostMat);
torsoHit.userData.target = playerActor;
torsoHit.userData.part = 'torso';
headHit.userData.target = playerActor;
headHit.userData.part = 'head';
scene.add(torsoHit, headHit);
combat.registerHitMeshes([torsoHit, headHit]);

const bots = createBots(scene, world, mover, combat, state);
const input = createInput(renderer.domElement, onLockChange);
const tmpDir = new THREE.Vector3();
const tmpFrom = new THREE.Vector3();
const tmpEnd = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();

let heat = 0;
let prevFiring = false;
let frozen = false;
let started = false;
let beepAt = 0;
let accumulator = 0;
let lastTime = performance.now();

function ownedForHud() {
  const owned = {};
  for (const id of Object.keys(weapons.owned)) owned[id] = true;
  return owned;
}

function syncCamera() {
  camera.position.set(playerActor.position.x, playerActor.position.y + playerActor.eye, playerActor.position.z);
  camera.rotation.set(playerActor.pitch, playerActor.yaw, 0, 'YXZ');
}

function updatePlayerHitboxes() {
  const y = playerActor.position.y;
  torsoHit.position.set(playerActor.position.x, y + playerActor.eye - 0.62, playerActor.position.z);
  headHit.position.set(playerActor.position.x, y + playerActor.eye - 0.05, playerActor.position.z);
}

function damageActor(target, amount, attacker, part) {
  if (!target.alive) return;
  let died = false;
  if (target.isPlayer) {
    died = player.hurt(amount);
    hud.damageFlash();
    audio.hurt();
    if (died) {
      playerActor.alive = false;
      pushFeed(state, `You were eliminated by ${attacker.name}`, attacker.side);
    }
  } else {
    target.health -= amount;
    if (target.health <= 0) {
      died = true;
      target.alive = false;
    }
  }
  if (died) {
    bots.onCarrierDied(target);
    const victimName = target.isPlayer ? 'You' : target.name;
    const attackerName = attacker.isPlayer ? 'You' : attacker.name;
    pushFeed(state, `${attackerName} ▸ ${victimName}${part === 'head' ? ' (headshot)' : ''}`, attacker.side);
    if (attacker.isPlayer) {
      match.playerKillBonus();
      audio.kill();
    }
    match.checkElimination();
  }
}

function shootOnce() {
  const def = weapons.currentDef();
  if (!weapons.takeRound()) return;
  const spread = weapons.spread(player.groundSpeed(), input.state.aiming) * (1 + heat);
  heat = Math.min(1.5, heat + 0.35);
  camera.getWorldDirection(tmpDir);
  tmpDir.x += (random() * 2 - 1) * spread;
  tmpDir.y += (random() * 2 - 1) * spread;
  tmpDir.z += (random() * 2 - 1) * spread;
  tmpDir.normalize();
  const hit = combat.shoot(camera.position, tmpDir, def.range, playerActor);
  tmpEnd.copy(camera.position).addScaledVector(tmpDir, hit ? hit.distance : def.range);
  effects.muzzleWorld(camera, tmpMuzzle);
  effects.tracer(tmpMuzzle, tmpEnd);
  audio.shot(def.kind, 0);
  addNoise(state, playerActor.position.x, playerActor.position.z, 34, 'shot');
  player.recoil(def.recoil * (0.8 + random() * 0.4), (random() * 2 - 1) * def.recoil * 0.4);
  weapons.pullTrigger();
  if (hit && hit.kind === 'actor') {
    const damage = combat.damageFor(def, hit.part, hit.distance);
    damageActor(hit.actor, damage, playerActor, hit.part);
    hud.hitMarker(!hit.actor.alive);
    audio.hit();
    effects.impact(hit.point, PALETTE.enemy);
  } else if (hit) {
    effects.impact(hit.point);
  }
  updateAmmoHud();
}

function throwGrenade() {
  const id = weapons.takeGrenade();
  if (!id) return;
  camera.getWorldDirection(tmpDir);
  combat.throwGrenade(id, camera.position, tmpDir);
  updateAmmoHud();
}

function onGrenadeBounce() {
  audio.bounce();
}

function onGrenadeExplode(g) {
  const dist = camera.position.distanceTo(g.position);
  if (g.id === 'he') {
    effects.explosion(g.position);
    audio.explosion(dist);
    addNoise(state, g.position.x, g.position.z, 45, 'explosion');
    for (const actor of state.actors) {
      if (!actor.alive) continue;
      const d = Math.hypot(actor.position.x - g.position.x, actor.position.z - g.position.z);
      if (d >= g.def.radius) continue;
      const chestY = actor.isPlayer ? actor.position.y + actor.eye - 0.25 : 1.25;
      if (world.segmentBlocked(g.position.x, g.position.y + 0.4, g.position.z, actor.position.x, chestY, actor.position.z, combat.smokes)) continue;
      const damage = g.def.damage * (1 - (d / g.def.radius) * 0.7);
      damageActor(actor, damage, playerActor, 'torso');
    }
  } else {
    combat.addSmoke(g.position.x, g.position.y, g.position.z, random);
    audio.smokePop(dist);
  }
}

function attemptBuy(id) {
  if (state.phase !== 'buy') return;
  const def = WEAPONS[id] || GRENADES[id];
  if (!def) return;
  const isGrenade = !!GRENADES[id];
  if (!isGrenade && weapons.owned[id]) {
    audio.deny();
    return;
  }
  if (state.money < def.price) {
    audio.deny();
    return;
  }
  state.money -= def.price;
  if (isGrenade) weapons.buyGrenade(id);
  else weapons.buy(id);
  audio.buy();
  hud.setMoney(state.money);
  hud.updateBuy(state.money, ownedForHud());
  updateAmmoHud();
}

function updateAmmoHud() {
  const slot = weapons.state.grenadeSlot;
  if (slot) {
    hud.setAmmo(weapons.state.grenades[slot], 0, GRENADES[slot].name.toUpperCase());
  } else {
    const w = weapons.currentWeapon();
    hud.setAmmo(w.mag, w.reserve, w.def.name.toUpperCase());
  }
}

function resetRoundActors() {
  player.reset(SPAWNS.ember[0]);
  playerActor.alive = true;
  weapons.refill();
  bots.resetRound();
  combat.clear();
  effects.clear();
  world.bombGroup.visible = false;
  heat = 0;
}

function startMatch() {
  state.round = 1;
  state.roundsWon = { ember: 0, ash: 0 };
  state.lossStreak = { ember: 0, ash: 0 };
  state.money = START_MONEY;
  state.kills = { ember: 0, ash: 0 };
  state.feed = [];
  state.winner = null;
  state.winReason = '';
  weapons.resetLoadout();
  for (const bot of bots.bots) bot.money = 800;
  hud.hideOverlay();
  match.startBuy();
}

const match = createMatch(state, {
  onBuyStart() {
    resetRoundActors();
    if (document.pointerLockElement) document.exitPointerLock();
    hud.hideOverlay();
    hud.showBuy(state.money, ownedForHud());
  },
  onRoundStart() {
    hud.hideBuy();
    hud.hideOverlay();
    if (!shot && !input.state.locked) hud.showPaused();
  },
  onRoundEnd(winner) {
    if (winner === 'ember') audio.roundWin();
    else audio.roundLose();
    if (document.pointerLockElement) document.exitPointerLock();
    hud.hideBuy();
    hud.showRoundEnd(winner, state.winReason, state.roundsWon.ember, state.roundsWon.ash);
  },
  onNextRound() {},
  onMatchEnd(winner) {
    if (winner === 'ember') audio.roundWin();
    else audio.roundLose();
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showMatchEnd(winner, state.roundsWon.ember, state.roundsWon.ash);
  },
  onPlanted(by, site) {
    world.bombGroup.visible = true;
    world.bombGroup.position.set(state.bomb.pos.x, 0.15, state.bomb.pos.z);
    audio.beep(false);
    pushFeed(state, `Bomb planted at Site ${site} — ${BOMB_TIME}s`, by.side);
  },
  onExploded() {},
});

const botCtx = {
  state,
  smokes: combat.smokes,
  combat,
  damageActor,
  shotVisual(from, to, kind) {
    audio.shot(kind, camera.position.distanceTo(from));
    effects.tracer(from, to);
  },
  onPlantTick() {
    audio.plantTick();
  },
  onDefuseTick() {
    audio.defuseTick();
  },
  onPlanted(bot, site) {
    match.onPlanted(bot, site);
  },
  onDefused(bot) {
    match.onDefused(bot);
  },
};

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (state.phase === 'live' || state.phase === 'buy') {
    if (state.phase === 'buy') return;
    if (!started) return;
    hud.showPaused();
  }
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (state.phase === 'menu' || state.phase === 'match') {
    startMatch();
  } else if (state.phase === 'over') {
    hud.hideOverlay();
  } else {
    hud.hideOverlay();
    input.requestLock();
  }
});

hud.onBuy((id) => attemptBuy(id));

hud.onDeploy(() => {
  if (state.phase !== 'buy') return;
  hud.hideBuy();
  match.startRound();
  input.requestLock();
});

function handlePressed(pressed) {
  if (pressed.has('KeyR') && playerActor.alive) {
    if (weapons.reload()) audio.reload();
  }
  if (state.phase === 'buy') {
    const buyKeys = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'sniper', Digit4: 'pistol', Digit5: 'he', Digit6: 'smoke' };
    for (const [code, id] of Object.entries(buyKeys)) {
      if (pressed.has(code)) attemptBuy(id);
    }
    if (pressed.has('KeyB')) {
      const menu = document.getElementById('buy-menu');
      if (menu.hidden) hud.showBuy(state.money, ownedForHud());
      else hud.hideBuy();
    }
    return;
  }
  if (!playerActor.alive) return;
  if (pressed.has('Digit1')) weapons.selectSlot(1);
  if (pressed.has('Digit2')) weapons.selectSlot(2);
  if (pressed.has('Digit3')) weapons.selectSlot(3);
  if (pressed.has('Digit4')) weapons.selectSlot(4);
  if (pressed.has('KeyQ')) weapons.cycleGrenade();
  updateAmmoHud();
}

function handleFiring() {
  const firing = input.state.firing;
  const def = weapons.currentDef();
  if (weapons.state.grenadeSlot) {
    if (firing && !prevFiring) throwGrenade();
  } else if (firing) {
    if (!def.auto && prevFiring) {
      // Semi-automatic: one shot per click.
    } else if (weapons.ready()) {
      shootOnce();
    } else if (weapons.currentWeapon().mag === 0 && weapons.state.reloadLeft === 0 && !prevFiring) {
      if (weapons.reload()) audio.reload();
      else audio.dryFire();
    }
  }
  prevFiring = firing;
}

function updatePlant(dt) {
  const bomb = state.bomb;
  const inSite = world.siteAt(playerActor.position.x, playerActor.position.z);
  const planting = state.phase === 'live' && playerActor.alive && bomb.status === 'carried'
    && bomb.carrierId === 'player' && inSite && input.state.keys.has('KeyE');
  if (planting) {
    bomb.plantProgress += dt / PLANT_TIME;
    if (Math.floor(bomb.plantProgress * 8) !== Math.floor((bomb.plantProgress - dt / PLANT_TIME) * 8)) audio.plantTick();
    hud.setPlant(bomb.plantProgress, 'PLANTING BOMB');
    if (bomb.plantProgress >= 1) {
      hud.setPlant(null);
      match.onPlanted(playerActor, inSite);
    }
  } else {
    if (bomb.plantProgress > 0 && bomb.carrierId === 'player') bomb.plantProgress = Math.max(0, bomb.plantProgress - dt * 2);
    hud.setPlant(null);
  }
}

function updateBombPickup() {
  const bomb = state.bomb;
  if (bomb.status !== 'dropped' || !bomb.pos || !playerActor.alive) return;
  const d = Math.hypot(playerActor.position.x - bomb.pos.x, playerActor.position.z - bomb.pos.z);
  if (d < 1.4) {
    bomb.status = 'carried';
    bomb.carrierId = 'player';
    bomb.pos = null;
    world.bombGroup.visible = false;
    pushFeed(state, 'You recovered the bomb', 'ember');
  }
}

function updateBombBeep(dt) {
  if (state.bomb.status !== 'planted') return;
  beepAt -= dt;
  if (beepAt <= 0) {
    beepAt = state.bomb.fuse > 10 ? 1.0 : 0.45;
    audio.beep(state.bomb.fuse <= 10);
  }
}

function updateBombVisual() {
  const bomb = state.bomb;
  if (bomb.status === 'planted' || bomb.status === 'dropped') {
    const blink = Math.floor(state.time * (bomb.status === 'planted' && bomb.fuse < 10 ? 6 : 2)) % 2 === 0;
    world.bombLight.visible = blink;
    world.bombPoint.intensity = blink ? 6 : 0;
  }
}

function bombText() {
  const bomb = state.bomb;
  if (state.phase !== 'live') return { text: '', kind: '' };
  if (bomb.status === 'planted') return { text: `BOMB PLANTED — SITE ${bomb.site} — ${Math.ceil(bomb.fuse)}s`, kind: 'planted' };
  if (bomb.status === 'dropped') return { text: 'BOMB DROPPED — RECOVER IT', kind: 'planted' };
  if (bomb.status === 'carried') {
    if (bomb.carrierId === 'player') return { text: 'BOMB — YOU CARRY IT — HOLD E IN A SITE', kind: '' };
    const carrier = state.actors.find((a) => a.id === bomb.carrierId);
    return { text: `BOMB — ${carrier ? carrier.name : 'ALLY'} CARRIES IT`, kind: '' };
  }
  return { text: '', kind: '' };
}

function updateHud() {
  hud.setHealth(playerActor.health);
  hud.setMoney(state.money);
  updateAmmoHud();
  hud.setScore(state.roundsWon.ember, state.roundsWon.ash, state.round);
  hud.setAlive(aliveActors(state, 'ember'), aliveActors(state, 'ash'));
  if (state.phase === 'live') {
    hud.setTimer(state.bomb.status === 'planted' ? state.bomb.fuse : state.timer, state.bomb.status === 'planted');
  } else {
    hud.setTimer(state.timer, false);
  }
  hud.setFeed(state.feed);
  const spread = weapons.spread(player.groundSpeed(), input.state.aiming) * (1 + heat);
  hud.setCrosshair(4 + spread * 900);
  const bomb = bombText();
  hud.setBomb(bomb.text, bomb.kind);
  // Aim-down-sights: narrow the field of view while the right mouse is held.
  const wantFov = input.state.aiming && playerActor.alive && !weapons.state.grenadeSlot ? 55 : 74;
  camera.fov += (wantFov - camera.fov) * 0.25;
  if (Math.abs(camera.fov - wantFov) > 0.05) camera.updateProjectionMatrix();
}

function step(dt) {
  state.time += dt;
  heat = Math.max(0, heat - dt * 1.4);
  match.step(dt);
  if ((state.phase === 'live' || state.phase === 'buy') && playerActor.alive) {
    player.step(dt, input.state.keys, input.state.aiming);
    if (player.stepped()) audio.step();
  }
  weapons.step(dt);
  combat.stepGrenades(dt, onGrenadeBounce, onGrenadeExplode);
  effects.step(dt);
  effects.syncSmoke(combat.smokes, state.time);
  if (state.phase === 'live') {
    bots.step(dt, botCtx);
    updatePlant(dt);
    updateBombPickup();
    updateBombBeep(dt);
  }
  updateBombVisual();
  updatePlayerHitboxes();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerActor.alive && (state.phase === 'live' || state.phase === 'buy')) player.look(look.x, look.y);
    handlePressed(input.takePressed());
    if (state.phase === 'live' && playerActor.alive && input.state.locked) handleFiring();
    else prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    updateHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    updateHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function aimAt(x, y, z) {
  const dx = x - playerActor.position.x;
  const dy = y - (playerActor.position.y + playerActor.eye);
  const dz = z - playerActor.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  playerActor.yaw = Math.atan2(-dx, -dz);
  playerActor.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  if (name === 'start') {
    playerActor.position.set(0.6, 0, 8.6);
    playerActor.yaw = 0.1;
    playerActor.pitch = 0;
    settle(20);
    aimAt(0, 1.5, -6);
    hud.showStart();
  } else if (name === 'play') {
    startMatch();
    match.startRound();
    playerActor.position.set(0, 0, 6);
    playerActor.yaw = Math.PI / 4;
    playerActor.pitch = 0;
    settle(30);
    const enemy = bots.bots.find((b) => b.side === 'ash' && b.alive);
    if (enemy) {
      aimAt(enemy.position.x, 1.3, enemy.position.z);
      shootOnce();
      settle(6);
    }
  } else {
    startMatch();
    state.roundsWon.ember = 1;
    state.roundsWon.ash = 0;
    hud.showRoundEnd('ember', 'Ash eliminated', 1, 0);
    playerActor.position.set(0, 0, 8);
    aimAt(-22, 1.5, -14);
  }
  syncCamera();
  updateHud();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
updatePlayerHitboxes();
hud.showStart();
hud.setMoney(state.money);
hud.setAmmo(12, 36, 'P9 SIDEARM');
if (shot) runShot(shot);
else requestAnimationFrame(frame);
