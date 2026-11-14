// Hiệu ứng âm thanh tổng hợp bằng Web Audio — không cần file âm thanh.
// AudioContext chỉ được tạo sau thao tác đầu tiên của người chơi (chính sách tự phát của trình duyệt).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = localStorage.getItem('dtl.mute') === '1';
const lastPlayed = new Map<string, number>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  localStorage.setItem('dtl.mute', m ? '1' : '0');
  if (master) master.gain.value = m ? 0 : 0.22;
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.22;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Gọi khi người chơi bấm phím/chuột lần đầu để mở khóa âm thanh. */
export function unlockAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}

function tone(freq: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur: number, filter: BiquadFilterType, f0: number, f1: number, vol: number, delay = 0): void {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = filter;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.03);
}

export type Sfx = 'sword' | 'slash' | 'rain' | 'thunder' | 'hit' | 'hurt' | 'heal' | 'shield' | 'levelup' | 'loot' | 'quest' | 'death' | 'fly' | 'gather' | 'ascend';

/** Phát một hiệu ứng. `volume` 0..1 để giảm âm lượng theo khoảng cách. */
export function sfx(name: Sfx, volume = 1): void {
  if (muted || volume <= 0.02) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  // Không phát cùng một âm dày quá (nhiều sát thương cùng lúc).
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < 45) return;
  lastPlayed.set(name, now);
  const v = volume;
  switch (name) {
    case 'sword':
      tone(900, 2100, 0.09, 'triangle', 0.25 * v);
      noise(0.07, 'highpass', 3000, 6000, 0.12 * v);
      break;
    case 'slash':
      noise(0.22, 'bandpass', 5200, 700, 0.45 * v);
      tone(520, 180, 0.2, 'sawtooth', 0.12 * v);
      break;
    case 'rain':
      for (let i = 0; i < 6; i++) noise(0.1, 'highpass', 4200, 2000, 0.2 * v, i * 0.07);
      break;
    case 'thunder':
      noise(0.12, 'highpass', 2500, 800, 0.9 * v);
      noise(0.9, 'lowpass', 900, 70, 0.8 * v, 0.03);
      tone(90, 38, 0.7, 'sine', 0.6 * v, 0.02);
      break;
    case 'hit':
      noise(0.07, 'bandpass', 1400, 500, 0.4 * v);
      tone(210, 90, 0.08, 'square', 0.14 * v);
      break;
    case 'hurt':
      tone(150, 55, 0.18, 'sine', 0.7 * v);
      noise(0.1, 'lowpass', 600, 150, 0.35 * v);
      break;
    case 'heal':
      tone(520, 780, 0.35, 'sine', 0.22 * v);
      tone(780, 1170, 0.4, 'sine', 0.14 * v, 0.1);
      break;
    case 'shield':
      tone(300, 620, 0.3, 'triangle', 0.25 * v);
      break;
    case 'levelup':
      // Ngũ cung đi lên.
      [523, 587, 698, 784, 1047].forEach((f, i) => tone(f, f, 0.34, 'triangle', 0.28 * v, i * 0.09));
      break;
    case 'ascend':
      [262, 392, 523, 784, 1047, 1568].forEach((f, i) => tone(f, f * 1.01, 0.9, 'sine', 0.3 * v, i * 0.14));
      break;
    case 'loot':
      tone(1320, 1320, 0.09, 'sine', 0.2 * v);
      tone(1760, 1760, 0.14, 'sine', 0.16 * v, 0.06);
      break;
    case 'quest':
      [659, 784, 988].forEach((f, i) => tone(f, f, 0.25, 'triangle', 0.24 * v, i * 0.1));
      break;
    case 'death':
      tone(330, 60, 0.9, 'sawtooth', 0.22 * v);
      break;
    case 'fly':
      noise(0.5, 'bandpass', 600, 2600, 0.3 * v);
      tone(400, 1200, 0.35, 'sine', 0.14 * v);
      break;
    case 'gather':
      noise(0.12, 'highpass', 2500, 5000, 0.2 * v);
      tone(880, 1320, 0.12, 'sine', 0.14 * v, 0.03);
      break;
  }
}
