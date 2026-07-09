// Tiny synthesized sound effects — no audio assets needed.
let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function safe(fn) {
  try { fn(ac()); } catch (e) { /* audio is optional */ }
}

export const audio = {
  unlock() { safe(() => {}); },

  // ball hits floor/wall
  thud(strength = 1) {
    safe((c) => {
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.11);
      g.gain.setValueAtTime(Math.min(0.5, 0.18 * strength), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 0.15);
    });
  },

  // throw
  whoosh() {
    safe((c) => {
      const t = c.currentTime;
      const len = 0.22;
      const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(300, t + len);
      f.Q.value = 1.2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t);
    });
  },

  // basket made
  chime() {
    safe((c) => {
      const t = c.currentTime;
      [[880, 0], [1174.66, 0.09], [1567.98, 0.18]].forEach(([freq, dt]) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'triangle';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(0.14, t + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.5);
        o.connect(g).connect(c.destination);
        o.start(t + dt); o.stop(t + dt + 0.55);
      });
    });
  },
};
