// The one place game state lives. Every module reads or writes this object through the
// functions below; no module keeps its own copy of the match, the round or the bomb.
// A "side" is 'ember' (the player's attacking team) or 'ash' (the defenders).
// Phases: 'menu' -> 'buy' -> 'live' -> 'over' -> 'buy' ... -> 'match' (match end).

export const ROUND_TIME = 100;
export const BUY_TIME = 15;
export const BOMB_TIME = 40;
export const PLANT_TIME = 4;
export const DEFUSE_TIME = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;
export const WIN_BONUS = 3000;
export const LOSS_BONUS = 1900;
export const LOSS_STREAK_BONUS = 500;
export const KILL_BONUS = 300;
export const PLANT_BONUS = 300;
export const DEFUSE_BONUS = 300;

export function mulberry32(initial) {
  let a = initial >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createState(seed) {
  return {
    seed,
    random: mulberry32(seed),
    phase: 'menu',
    phaseTime: 0,
    round: 1,
    roundsWon: { ember: 0, ash: 0 },
    lossStreak: { ember: 0, ash: 0 },
    money: START_MONEY,
    timer: ROUND_TIME,
    // Bomb: 'carried' (by carrierId), 'dropped' (at bombPos), 'planted' (at site), 'gone'.
    bomb: { status: 'carried', carrierId: 'player', site: null, pos: null, fuse: 0, plantProgress: 0, defuseProgress: 0, defuserId: null },
    actors: [],
    playerId: 'player',
    kills: { ember: 0, ash: 0 },
    feed: [],
    winner: null,
    winReason: '',
    noise: [],
    // Last site alert raised by a defender that spotted an attacker: { site, time }.
    alert: null,
    time: 0,
    shotCount: 0,
  };
}

// A noise event: something bots can hear. Bots inside radius investigate or turn to it.
export function addNoise(state, x, z, radius, kind) {
  state.noise.push({ x, z, radius, kind, time: state.time });
  if (state.noise.length > 24) state.noise.splice(0, state.noise.length - 24);
}

export function pushFeed(state, text, kind) {
  state.feed.push({ text, kind, time: state.time });
  if (state.feed.length > 5) state.feed.splice(0, state.feed.length - 5);
}

export function aliveActors(state, side) {
  let count = 0;
  for (const actor of state.actors) if (actor.alive && actor.side === side) count += 1;
  return count;
}

export function actorById(state, id) {
  for (const actor of state.actors) if (actor.id === id) return actor;
  return null;
}
