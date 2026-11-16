// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, alive
// counts, kill feed, bomb status and the plant bar, plus the start / pause /
// round-end overlays and the buy menu. It never touches the simulation; main.js
// pushes numbers in and reads the play / buy callbacks out.
import { WEAPONS, GRENADES } from './weapons.js';

const BUY_ITEMS = [
  { id: 'rifle', key: '1' },
  { id: 'smg', key: '2' },
  { id: 'sniper', key: '3' },
  { id: 'pistol', key: '4' },
  { id: 'he', key: '5' },
  { id: 'smoke', key: '6' },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthNum = $('health-num');
  const healthBar = $('health-bar');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreEmber = $('score-ember');
  const scoreAsh = $('score-ash');
  const roundNum = $('round-num');
  const aliveEmber = $('alive-ember');
  const aliveAsh = $('alive-ash');
  const feed = $('feed');
  const bombStatus = $('bomb-status');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  const crosshair = $('crosshair');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  let hitTimer = 0;
  let damageTimer = 0;
  let last = {};
  let buyHandler = null;
  let deployHandler = null;

  function setText(el, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function buildBuy() {
    buyItems.innerHTML = '';
    for (const item of BUY_ITEMS) {
      const def = WEAPONS[item.id] || GRENADES[item.id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.dataset.id = item.id;
      const isGrenade = !!GRENADES[item.id];
      button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${def.name}</span><span class="buy-desc">${isGrenade ? (item.id === 'he' ? 'Blast damage in a radius' : 'Blocks sight for 14s') : `${def.damage} dmg · ${def.mag} round mag`}</span><span class="buy-price">$${def.price}</span>`;
      button.addEventListener('click', () => {
        if (buyHandler) buyHandler(item.id);
      });
      buyItems.appendChild(button);
    }
    const deploy = document.createElement('button');
    deploy.type = 'button';
    deploy.id = 'buy-deploy';
    deploy.textContent = 'Deploy — start the round';
    deploy.addEventListener('click', () => {
      if (deployHandler) deployHandler();
    });
    buyMenu.querySelector('.panel').appendChild(deploy);
  }
  buildBuy();

  return {
    setHealth(hp) {
      setText(healthNum, String(Math.ceil(hp)), 'hp');
      healthBar.style.width = `${Math.max(0, hp)}%`;
      healthBar.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      setText(weaponName, name, 'weapon');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(moneyValue, `$${value}`, 'money');
      setText(buyMoney, `$${value}`, 'buymoney');
    },
    setTimer(seconds, planted) {
      const value = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      setText(timerValue, value, 'timer');
      timerValue.classList.toggle('planted', !!planted);
    },
    setScore(ember, ash, round) {
      setText(scoreEmber, String(ember), 'se');
      setText(scoreAsh, String(ash), 'sa');
      setText(roundNum, `ROUND ${round}`, 'round');
    },
    setAlive(ember, ash) {
      setText(aliveEmber, '●'.repeat(ember) + '○'.repeat(Math.max(0, 4 - ember)), 'ae');
      setText(aliveAsh, '●'.repeat(ash) + '○'.repeat(Math.max(0, 4 - ash)), 'aa');
    },
    setBomb(text, kind) {
      setText(bombStatus, text, 'bomb');
      bombStatus.className = kind || '';
      bombStatus.hidden = !text;
    },
    setFeed(items) {
      const html = items.map((f) => `<div class="feed-${f.kind}">${f.text}</div>`).join('');
      if (last.feed !== html) {
        last.feed = html;
        feed.innerHTML = html;
      }
    },
    setCrosshair(spreadPx) {
      crosshair.style.setProperty('--gap', `${spreadPx.toFixed(1)}px`);
    },
    setPlant(progress, label) {
      if (progress === null) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      plantLabel.textContent = label;
    },
    hitMarker(killed) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), 110);
    },
    damageFlash() {
      damage.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damage.classList.remove('on'), 220);
    },
    showStart() {
      title.textContent = 'EMBERLINE';
      copy.textContent = 'A dusk solar yard. Plant the bomb at Site A or Site B — or eliminate the Ash defenders. First to 5 rounds takes the match.';
      play.textContent = 'Click to play';
      overlay.hidden = false;
    },
    showPaused() {
      title.textContent = 'EMBERLINE';
      copy.textContent = 'Paused. Click to resume.';
      play.textContent = 'Click to resume';
      overlay.hidden = false;
    },
    showRoundEnd(winner, reason, ember, ash) {
      title.textContent = winner === 'ember' ? 'Round won' : 'Round lost';
      copy.textContent = `${reason}. Ember ${ember} — ${ash} Ash. Next round starts soon.`;
      play.textContent = 'Continue';
      overlay.hidden = false;
    },
    showMatchEnd(winner, ember, ash) {
      title.textContent = winner === 'ember' ? 'Match won' : 'Match lost';
      copy.textContent = `Final score: Ember ${ember} — ${ash} Ash. Click to play again.`;
      play.textContent = 'Play again';
      overlay.hidden = false;
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    showBuy(money, owned) {
      buyMenu.hidden = false;
      this.updateBuy(money, owned);
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    updateBuy(money, owned) {
      setText(buyMoney, `$${money}`, 'buymoney');
      for (const button of buyItems.children) {
        const id = button.dataset.id;
        const def = WEAPONS[id] || GRENADES[id];
        const hasIt = owned && owned[id];
        button.disabled = !!hasIt || money < def.price;
        button.classList.toggle('owned', !!hasIt);
      }
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    onDeploy(handler) {
      deployHandler = handler;
    },
  };
}
