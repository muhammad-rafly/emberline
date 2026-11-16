// Weapons: the shop's catalogue, the view model, firing, reload and spread. A weapon
// is a plain data row plus a small state; main.js owns the ray, combat.js owns the
// damage. Grenades are thrown projectiles with their own arc, bounce and fuse, and
// smoke is a cloud that blocks sight. All names are original to EMBERLINE.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 2, name: 'P9 Sidearm', kind: 'pistol', price: 300,
    damage: 30, headMult: 3, auto: false, gap: 0.16, mag: 12, reserve: 36,
    reload: 1.4, spreadStill: 0.003, spreadMove: 0.022, recoil: 0.006, range: 60,
  },
  rifle: {
    id: 'rifle', slot: 1, name: 'VK-7 Longshot', kind: 'rifle', price: 2700,
    damage: 34, headMult: 4, auto: true, gap: 0.115, mag: 25, reserve: 75,
    reload: 2.1, spreadStill: 0.0022, spreadMove: 0.03, recoil: 0.011, range: 90,
  },
  smg: {
    id: 'smg', slot: 1, name: 'Hornet-9', kind: 'smg', price: 1500,
    damage: 26, headMult: 3, auto: true, gap: 0.068, mag: 32, reserve: 96,
    reload: 1.8, spreadStill: 0.004, spreadMove: 0.02, recoil: 0.007, range: 55,
  },
  sniper: {
    id: 'sniper', slot: 1, name: 'Longbow-50', kind: 'sniper', price: 4750,
    damage: 110, headMult: 4, auto: false, gap: 1.15, mag: 5, reserve: 15,
    reload: 3.0, spreadStill: 0.0004, spreadMove: 0.05, recoil: 0.03, range: 120,
  },
};

export const GRENADES = {
  he: { id: 'he', name: 'Spark-HE', price: 300, fuse: 1.1, radius: 6, damage: 95 },
  smoke: { id: 'smoke', name: 'Veil Smoke', price: 400, fuse: 1.0, radius: 4.5, damage: 0 },
};

const MUZZLE_TIME = 0.06;

// A boxy view model per weapon kind, built from the same three shapes so the gun
// reads at a glance without any model file.
function buildModel(kind) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const model = new THREE.Group();
  const dims = {
    pistol: { receiver: [0.07, 0.09, 0.24], barrel: [0.04, 0.04, 0.16], stock: [0.06, 0.12, 0.08] },
    rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22] },
    smg: { receiver: [0.08, 0.09, 0.3], barrel: [0.04, 0.04, 0.22], stock: [0.07, 0.07, 0.14] },
    sniper: { receiver: [0.09, 0.11, 0.5], barrel: [0.035, 0.035, 0.62], stock: [0.08, 0.09, 0.26] },
  }[kind];
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(...dims.receiver), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(...dims.barrel), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(...dims.stock), grip);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), accent);
  sight.position.set(0, 0.08, -0.05);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.24, -0.2, -0.42);
  return model;
}

export function createWeaponSet(camera) {
  const models = {};
  for (const kind of ['pistol', 'rifle', 'smg', 'sniper']) {
    models[kind] = buildModel(kind);
    models[kind].visible = false;
    camera.add(models[kind]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = {
    pistol: { def: WEAPONS.pistol, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
  };
  const state = {
    current: 'pistol',
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    grenades: { he: 0, smoke: 0 },
    grenadeSlot: null,
  };

  function currentWeapon() {
    return owned[state.current];
  }

  function showModel() {
    for (const kind of Object.keys(models)) models[kind].visible = kind === state.current && state.grenadeSlot === null;
    if (state.grenadeSlot !== null) models.pistol.visible = false;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const def = currentWeapon().def;
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const w = currentWeapon();
        const need = w.def.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    step,
    currentWeapon,
    currentDef() {
      return currentWeapon().def;
    },
    ready() {
      const w = currentWeapon();
      return state.grenadeSlot === null && w.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = currentWeapon().def.gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      const w = currentWeapon();
      if (w.mag <= 0) return false;
      w.mag -= 1;
      return true;
    },
    reload() {
      const w = currentWeapon();
      if (state.reloadLeft > 0 || w.mag === w.def.mag || w.reserve === 0) return false;
      state.reloadLeft = w.def.reload;
      return true;
    },
    spread(speed, aiming) {
      const def = currentWeapon().def;
      const base = def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
      return aiming ? base * 0.55 : base;
    },
    buy(id) {
      const def = WEAPONS[id];
      if (!def || owned[id]) return false;
      owned[id] = { def, mag: def.mag, reserve: def.reserve };
      state.current = id;
      state.grenadeSlot = null;
      showModel();
      return true;
    },
    buyGrenade(id) {
      if (!GRENADES[id]) return false;
      state.grenades[id] += 1;
      return true;
    },
    selectSlot(slot) {
      if (slot === 1) {
        // Cycle through the owned primaries so every rifle-class weapon is reachable.
        const primaries = ['rifle', 'smg', 'sniper'].filter((id) => owned[id]);
        if (primaries.length === 0) return false;
        const current = primaries.indexOf(state.current);
        state.current = primaries[(current + 1) % primaries.length];
        state.grenadeSlot = null;
        showModel();
        return true;
      }
      if (slot === 2) {
        state.current = 'pistol';
        state.grenadeSlot = null;
        showModel();
        return true;
      }
      if (slot === 3 && state.grenades.he > 0) {
        state.grenadeSlot = 'he';
        showModel();
        return true;
      }
      if (slot === 4 && state.grenades.smoke > 0) {
        state.grenadeSlot = 'smoke';
        showModel();
        return true;
      }
      return false;
    },
    cycleGrenade() {
      if (state.grenadeSlot === 'he' && state.grenades.smoke > 0) state.grenadeSlot = 'smoke';
      else if (state.grenadeSlot === 'smoke' && state.grenades.he > 0) state.grenadeSlot = 'he';
      else if (state.grenadeSlot === null && state.grenades.he > 0) state.grenadeSlot = 'he';
      else if (state.grenadeSlot === null && state.grenades.smoke > 0) state.grenadeSlot = 'smoke';
      else return false;
      showModel();
      return true;
    },
    takeGrenade() {
      if (state.grenadeSlot === null) return null;
      const id = state.grenadeSlot;
      if (state.grenades[id] <= 0) return null;
      state.grenades[id] -= 1;
      if (state.grenades[id] === 0) state.grenadeSlot = null;
      else if (state.grenades.he > 0) state.grenadeSlot = 'he';
      else if (state.grenades.smoke > 0) state.grenadeSlot = 'smoke';
      else state.grenadeSlot = null;
      showModel();
      return id;
    },
    refill() {
      for (const id of Object.keys(owned)) {
        owned[id].mag = owned[id].def.mag;
        owned[id].reserve = owned[id].def.reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.grenadeSlot = null;
      showModel();
    },
    resetLoadout() {
      for (const id of Object.keys(owned)) delete owned[id];
      owned.pistol = { def: WEAPONS.pistol, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
      state.current = 'pistol';
      state.grenades = { he: 0, smoke: 0 };
      state.grenadeSlot = null;
      state.cooldown = 0;
      state.reloadLeft = 0;
      showModel();
    },
  };
}
