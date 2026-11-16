// The match: rounds, money and the bomb. One match is first to 5 rounds (at most 9).
// A round is won by eliminating the other team, by the bomb exploding, by a defuse,
// or by the clock running out (defenders win if nothing is planted). Money is paid
// at the end of each round and spent in the buy menu before the next. This module
// owns the phase timer and the transitions; main.js owns the frame loop.
import {
  ROUND_TIME, BUY_TIME, BOMB_TIME, WIN_ROUNDS, MAX_ROUNDS, WIN_BONUS, LOSS_BONUS,
  LOSS_STREAK_BONUS, KILL_BONUS, PLANT_BONUS, DEFUSE_BONUS, aliveActors, pushFeed,
} from './state.js';
import { SITES } from './world.js';

export function createMatch(state, hooks) {
  function startBuy() {
    state.phase = 'buy';
    state.phaseTime = 0;
    state.timer = BUY_TIME;
    state.bomb = { status: 'carried', carrierId: 'player', site: null, pos: null, fuse: 0, plantProgress: 0, defuseProgress: 0, defuserId: null };
    hooks.onBuyStart();
  }

  function startRound() {
    state.phase = 'live';
    state.phaseTime = 0;
    state.timer = ROUND_TIME;
    state.bomb.plantProgress = 0;
    state.bomb.defuseProgress = 0;
    hooks.onRoundStart();
  }

  function award(side, amount) {
    if (side === 'ember') state.money += amount;
    for (const actor of state.actors) {
      if (!actor.isPlayer && actor.side === side) actor.money += amount;
    }
  }

  function endRound(winnerSide, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'over';
    state.phaseTime = 0;
    state.winner = winnerSide;
    state.winReason = reason;
    state.roundsWon[winnerSide] += 1;
    const loser = winnerSide === 'ember' ? 'ash' : 'ember';
    state.lossStreak[winnerSide] = 0;
    state.lossStreak[loser] += 1;
    const lossBonus = LOSS_BONUS + Math.min(2, state.lossStreak[loser] - 1) * LOSS_STREAK_BONUS;
    award(winnerSide, WIN_BONUS);
    award(loser, lossBonus);
    pushFeed(state, `${winnerSide === 'ember' ? 'Ember' : 'Ash'} wins the round — ${reason}`, winnerSide);
    hooks.onRoundEnd(winnerSide, reason);
    if (state.roundsWon[winnerSide] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'match';
      hooks.onMatchEnd(winnerSide);
    }
  }

  function checkElimination() {
    if (state.phase !== 'live') return;
    if (aliveActors(state, 'ember') === 0) endRound('ash', 'Ember eliminated');
    else if (aliveActors(state, 'ash') === 0) endRound('ember', 'Ash eliminated');
  }

  function onPlanted(by, site) {
    if (state.phase !== 'live' || state.bomb.status !== 'carried') return;
    state.bomb.status = 'planted';
    state.bomb.site = site;
    state.bomb.fuse = BOMB_TIME;
    state.bomb.pos = { x: by.position.x, z: by.position.z };
    state.bomb.plantProgress = 0;
    award(by.side, PLANT_BONUS);
    pushFeed(state, `Bomb planted at Site ${site}`, by.side);
    hooks.onPlanted(by, site);
  }

  function onDefused(by) {
    if (state.phase !== 'live' || state.bomb.status !== 'planted') return;
    state.bomb.status = 'gone';
    award(by.side, DEFUSE_BONUS);
    endRound('ash', 'Bomb defused');
  }

  function step(dt) {
    state.phaseTime += dt;
    if (state.phase === 'buy') {
      state.timer = Math.max(0, BUY_TIME - state.phaseTime);
      if (state.timer <= 0) startRound();
    } else if (state.phase === 'live') {
      if (state.bomb.status === 'planted') {
        state.bomb.fuse -= dt;
        if (state.bomb.fuse <= 0) {
          state.bomb.status = 'gone';
          hooks.onExploded();
          endRound('ember', 'Bomb detonated');
          return;
        }
      } else {
        state.timer = Math.max(0, ROUND_TIME - state.phaseTime);
        if (state.timer <= 0) endRound('ash', 'Time expired');
      }
      checkElimination();
    } else if (state.phase === 'over') {
      if (state.phaseTime >= 5) {
        state.round += 1;
        hooks.onNextRound();
        startBuy();
      }
    }
  }

  function playerKillBonus() {
    state.money += KILL_BONUS;
  }

  return {
    startBuy,
    startRound,
    endRound,
    step,
    onPlanted,
    onDefused,
    checkElimination,
    playerKillBonus,
    siteName() {
      return state.bomb.site ? SITES[state.bomb.site].name : null;
    },
  };
}
