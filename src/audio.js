// ============================================
// 効果音（WebAudioでその場で合成・音源ファイル不要）
// すべて失敗しても無音でゲーム続行できるよう try/catch で包む
// ============================================
let ctx = null;
let muted = false;

export function setMuted(m) {
  muted = m;
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, { start = 0, dur = 0.12, type = "triangle", vol = 0.18, slide = 0 } = {}) {
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ start = 0, dur = 0.3, from = 900, to = 350, vol = 0.1 } = {}) {
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + start;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
}

function safe(fn) {
  return (...args) => {
    if (muted) return;
    try {
      fn(...args);
    } catch {
      // 音は装飾なので失敗しても無視
    }
  };
}

export const sfx = {
  select: safe(() => tone(660, { dur: 0.08, slide: 220, vol: 0.12 })),
  deselect: safe(() => tone(440, { dur: 0.07, slide: -120, vol: 0.08 })),
  deny: safe(() => tone(180, { dur: 0.12, type: "square", vol: 0.06 })),
  pour: safe((units = 1) => noise({ dur: 0.14 + units * 0.07, from: 1000, to: 320, vol: 0.11 })),
  complete: safe(() => {
    tone(659, { start: 0, dur: 0.12, type: "sine", vol: 0.16 });
    tone(988, { start: 0.09, dur: 0.2, type: "sine", vol: 0.16 });
  }),
  clear: safe(() => {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => tone(f, { start: i * 0.09, dur: 0.3, type: "sine", vol: 0.15 }));
  }),
  stuck: safe(() => {
    tone(220, { start: 0, dur: 0.25, type: "sawtooth", vol: 0.06, slide: -80 });
  }),
  undo: safe(() => tone(520, { dur: 0.07, slide: -180, vol: 0.08 })),
};
