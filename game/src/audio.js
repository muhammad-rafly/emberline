// Synthesized sound, no audio files: every effect is an oscillator or a short noise
// buffer through the Web Audio API. The context is created on the first user gesture
// (the play button), and every call before that is a no-op. Distance attenuates shots
// from other actors so gunfire carries across the map.

export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return context;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.45;
    master.connect(context.destination);
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return context;
  }

  function noise(duration, filterFreq, gainValue, when = 0) {
    if (!ensure()) return;
    const t = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, Math.random() * 0.2);
    source.stop(t + duration);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = null, when = 0) {
    if (!ensure()) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  function distanceGain(distance) {
    if (distance === undefined) return 1;
    return Math.max(0.08, 1 - distance / 70);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind, distance) {
      const g = distanceGain(distance);
      if (kind === 'sniper') {
        noise(0.22, 900, 0.9 * g);
        tone(140, 0.18, 0.5 * g, 'sine', 55);
      } else if (kind === 'smg') {
        noise(0.09, 1800, 0.5 * g);
        tone(190, 0.07, 0.3 * g, 'square', 90);
      } else if (kind === 'pistol') {
        noise(0.11, 1400, 0.6 * g);
        tone(160, 0.09, 0.35 * g, 'sine', 70);
      } else {
        noise(0.13, 1200, 0.7 * g);
        tone(150, 0.1, 0.4 * g, 'sine', 60);
      }
    },
    dryFire() {
      tone(1400, 0.03, 0.15, 'square');
    },
    reload() {
      tone(900, 0.04, 0.2, 'square');
      tone(600, 0.04, 0.2, 'square', null, 0.18);
      tone(1100, 0.05, 0.25, 'square', null, 0.55);
    },
    step(distance) {
      noise(0.06, 500, 0.12 * distanceGain(distance));
    },
    hit() {
      tone(2200, 0.05, 0.25, 'sine');
    },
    kill() {
      tone(2200, 0.05, 0.25, 'sine');
      tone(2900, 0.07, 0.25, 'sine', null, 0.06);
    },
    hurt() {
      tone(110, 0.15, 0.4, 'sawtooth', 70);
    },
    beep(urgent) {
      tone(urgent ? 1250 : 950, 0.09, 0.3, 'sine');
    },
    plantTick() {
      tone(700, 0.05, 0.2, 'square');
    },
    explosion(distance) {
      const g = distanceGain(distance);
      noise(0.9, 300, 1.0 * g);
      tone(60, 0.8, 0.8 * g, 'sine', 30);
    },
    smokePop(distance) {
      noise(0.4, 700, 0.4 * distanceGain(distance));
    },
    bounce() {
      tone(500, 0.05, 0.12, 'sine', 300);
    },
    buy() {
      tone(880, 0.07, 0.2, 'sine');
      tone(1320, 0.09, 0.2, 'sine', null, 0.08);
    },
    deny() {
      tone(220, 0.12, 0.25, 'square', 160);
    },
    roundWin() {
      tone(523, 0.14, 0.3, 'sine');
      tone(659, 0.14, 0.3, 'sine', null, 0.14);
      tone(784, 0.25, 0.3, 'sine', null, 0.28);
    },
    roundLose() {
      tone(392, 0.16, 0.3, 'sine');
      tone(330, 0.16, 0.3, 'sine', null, 0.16);
      tone(262, 0.3, 0.3, 'sine', null, 0.32);
    },
    defuseTick() {
      tone(1500, 0.04, 0.18, 'sine');
    },
  };
}
