/**
 * Web Audio API synthesizer for acoustic routing & game juice dopamine audio.
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone({ frequency, type = 'sine', duration = 0.5, gain = 0.3, detune = 0 }) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    if (detune) osc.detune.setValueAtTime(detune, ctx.currentTime);

    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}

export const playSound = {
  /** Soft bell — gentle sine chime */
  meal() {
    playTone({ frequency: 880, type: 'sine', duration: 0.8, gain: 0.25 });
    setTimeout(() => playTone({ frequency: 1108, type: 'sine', duration: 0.5, gain: 0.15 }), 120);
    triggerHaptic([30]);
  },

  mealBell() {
    this.chomp();
  },

  /** Crunchy 8-bit chomp / nom sound effect! */
  chomp() {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);

      // Second mini crunch
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(450, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.09);
        gain2.gain.setValueAtTime(0.25, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.09);
      }, 70);

      triggerHaptic([20, 40, 20]);
    } catch (e) {}
  },

  /** Warm purr / cuddle chime when petting the sloth */
  pet() {
    playTone({ frequency: 659, type: 'sine', duration: 0.25, gain: 0.2 });
    setTimeout(() => playTone({ frequency: 880, type: 'sine', duration: 0.35, gain: 0.25 }), 80);
    setTimeout(() => playTone({ frequency: 1046, type: 'sine', duration: 0.45, gain: 0.2 }), 160);
    triggerHaptic([15, 30, 45]);
  },

  /** High sparkle chime */
  sparkle() {
    playTone({ frequency: 1567, type: 'sine', duration: 0.2, gain: 0.18 });
    setTimeout(() => playTone({ frequency: 2093, type: 'sine', duration: 0.3, gain: 0.22 }), 60);
    triggerHaptic([25]);
  },

  /** Level Up / Triumph fanfare! */
  levelUp() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone({ frequency: freq, type: 'triangle', duration: 0.4, gain: 0.28 }), i * 90);
    });
    triggerHaptic([40, 60, 80, 100]);
  },

  /** Bedtime wind-down */
  bedtime() {
    playTone({ frequency: 220, type: 'triangle', duration: 2.0, gain: 0.3 });
    setTimeout(() => playTone({ frequency: 196, type: 'triangle', duration: 1.5, gain: 0.2 }), 300);
    triggerHaptic([80, 100, 80]);
  },

  /** Workout energetic tick */
  workout() {
    playTone({ frequency: 440, type: 'sawtooth', duration: 0.15, gain: 0.35 });
    setTimeout(() => playTone({ frequency: 660, type: 'sawtooth', duration: 0.15, gain: 0.3 }), 180);
    setTimeout(() => playTone({ frequency: 880, type: 'sawtooth', duration: 0.2, gain: 0.25 }), 360);
    triggerHaptic([50, 50, 50]);
  },

  /** Harp checkin chime */
  checkin() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone({ frequency: freq, type: 'sine', duration: 0.6, gain: 0.2 }), i * 100);
    });
    triggerHaptic([20, 60, 20]);
  },

  /** Water splash */
  water() {
    playTone({ frequency: 1200, type: 'sine', duration: 0.2, gain: 0.15 });
    setTimeout(() => playTone({ frequency: 900, type: 'sine', duration: 0.3, gain: 0.1 }), 80);
    triggerHaptic([15]);
  },
};

export function triggerHaptic(pattern = [30]) {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch (e) {}
}

export function unlockAudio() {
  getAudioContext();
}
