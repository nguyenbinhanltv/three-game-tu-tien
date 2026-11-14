// AudioManager: Web Audio chia bus  master → music | ambient | sfx | ui.
//
// - SFX: nạp file theo `public/audio/manifest.json` (file lẻ hoặc sprite + offset), nhiều biến thể,
//   lệch cao độ ngẫu nhiên, StereoPanner theo hướng camera. Âm nào không có file (hoặc file lỗi)
//   thì lùi về âm tổng hợp bằng oscillator/noise như trước, không báo lỗi.
// - Nhạc nền/âm môi trường: phát dạng stream qua HTMLAudioElement + MediaElementAudioSourceNode,
//   mỗi loại có 2 kênh để crossfade. Ducking hạ nhạc khi có âm lớn (sấm, đột phá...).
// - AudioContext chỉ được tạo sau thao tác đầu tiên của người chơi (chính sách tự phát của trình duyệt).
// - `?mute=1` trên URL: tắt tiếng cho bot/Playwright, không nạp file, không ghi đè cài đặt đã lưu.
//
// Định dạng manifest (đường dẫn tương đối với thư mục chứa manifest; mảng = các định dạng dự phòng,
// chọn cái đầu tiên trình duyệt phát được, ví dụ Opus/WebM rồi AAC/M4A cho Safari):
// {
//   "sprites": { "sfx_combat": ["sfx/sfx_combat.webm", "sfx/sfx_combat.m4a"] },
//   "sfx": {
//     "hit": { "variants": [ { "sprite": "sfx_combat", "start": 0, "dur": 0.3 }, { "file": "sfx/hit_b.webm" } ],
//              "pitch": 0.05, "gain": 1, "bus": "sfx", "duck": 0 }
//   },
//   "music":   { "sect_day": { "src": ["music/sect_day.webm", "music/sect_day.m4a"], "gain": 1, "loop": true } },
//   "ambient": { "wind": { "src": ["amb/wind.webm", "amb/wind.m4a"] } }
// }
// Nguồn: nhạc Suno, SFX CC0. Ghi giấy phép từng file vào LICENSES.md cạnh file.

export type Sfx = 'sword' | 'slash' | 'rain' | 'thunder' | 'hit' | 'hurt' | 'heal' | 'shield' | 'levelup' | 'loot' | 'quest' | 'death' | 'fly' | 'gather' | 'ascend';
export type Bus = 'music' | 'ambient' | 'sfx' | 'ui';
export type VolumeKey = 'master' | Bus;
export const VOLUME_KEYS: readonly VolumeKey[] = ['master', 'music', 'ambient', 'sfx', 'ui'];

interface Clip {
  file?: string | string[];
  sprite?: string;
  start?: number;
  dur?: number;
  gain?: number;
}
interface SfxEntry {
  variants: Clip[];
  pitch?: number;
  gain?: number;
  bus?: Bus;
  duck?: number;
}
interface StreamEntry {
  src: string | string[];
  gain?: number;
  loop?: boolean;
}
interface Manifest {
  sprites?: Record<string, string | string[]>;
  sfx?: Record<string, SfxEntry>;
  music?: Record<string, StreamEntry>;
  ambient?: Record<string, StreamEntry>;
}
interface Variant {
  buf: AudioBuffer;
  start: number;
  dur: number | undefined;
  gain: number;
}

const DEV = (import.meta as unknown as { env: { DEV: boolean } }).env.DEV;
const MANIFEST_DIR = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL + 'audio/';
/** Mức trộn nội bộ của từng bus khi thanh trượt ở 100%: nhạc khoảng 1/3 SFX để không lấn tiếng đòn đánh. */
const BUS_MIX: Record<Bus, number> = { music: 0.33, ambient: 0.5, sfx: 1, ui: 1 };
/** Âm tổng hợp được chỉnh theo master 0,22 cũ; giữ nguyên để không có file thì nghe như trước. */
const SYNTH_GAIN = 0.22;
const SYNTH_BUS: Partial<Record<Sfx, Bus>> = { loot: 'ui', quest: 'ui' };
/** Âm lớn tự hạ nhạc nền (mức hạ 0..1). */
const SYNTH_DUCK: Partial<Record<Sfx, number>> = { thunder: 0.4, ascend: 0.5, levelup: 0.4, death: 0.4 };
const MAX_VOICES = 32;
const DEFAULT_PITCH = 0.05;

const urlMute = typeof location !== 'undefined' && new URLSearchParams(location.search).get('mute') === '1';
let muted = urlMute || localStorage.getItem('dtl.mute') === '1';
const volumes: Record<VolumeKey, number> = { master: 1, music: 1, ambient: 1, sfx: 1, ui: 1 };
try {
  const saved = JSON.parse(localStorage.getItem('dtl.vol') ?? '{}') as Partial<Record<VolumeKey, number>>;
  for (const k of VOLUME_KEYS) if (typeof saved[k] === 'number') volumes[k] = clamp01(saved[k]);
} catch {
  // Cài đặt hỏng thì dùng mặc định.
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let duckGain: GainNode | null = null;
const buses = new Map<Bus, GainNode>();
let noiseBuf: AudioBuffer | null = null;
let music: StreamDeck | null = null;
let ambient: StreamDeck | null = null;
const lastPlayed = new Map<string, number>();
const lastVariant = new Map<string, number>();
let voices = 0;
let duckEnd = 0;
let duckLevel = 1;
const listener = { x: 0, z: 0, yaw: 0 };
const stats = { file: 0, synth: 0, dropped: 0 };
const logged = new Set<string>();

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ---------- nạp manifest và file ----------

let manifest: Manifest | null = null;
let manifestPromise: Promise<void> | null = null;
const rawCache = new Map<string, Promise<ArrayBuffer | null>>();
const bufCache = new Map<string, Promise<AudioBuffer | null>>();
/** SFX đã giải mã xong; tên không có ở đây thì phát âm tổng hợp. */
const ready = new Map<string, Variant[]>();
let prepared = false;

const MIME: Record<string, string[]> = {
  webm: ['audio/webm; codecs="opus"'],
  ogg: ['audio/ogg; codecs="opus"', 'audio/ogg; codecs="vorbis"'],
  opus: ['audio/ogg; codecs="opus"'],
  m4a: ['audio/mp4; codecs="mp4a.40.2"'],
  mp4: ['audio/mp4; codecs="mp4a.40.2"'],
  aac: ['audio/aac'],
  mp3: ['audio/mpeg'],
  wav: ['audio/wav'],
};
let probe: HTMLAudioElement | null = null;

/** Các file trình duyệt phát được, theo thứ tự ưu tiên trong danh sách định dạng dự phòng. */
function playable(src: string | string[] | undefined): string[] {
  if (!src) return [];
  const list = Array.isArray(src) ? src : [src];
  probe ??= document.createElement('audio');
  return list
    .filter((s) => {
      const types = MIME[s.split('?')[0].split('.').pop()?.toLowerCase() ?? ''];
      return !types || types.some((m) => probe!.canPlayType(m) !== '');
    })
    .map((s) => MANIFEST_DIR + s);
}

function pickSrc(src: string | string[] | undefined): string | null {
  return playable(src)[0] ?? null;
}

function fetchRaw(url: string): Promise<ArrayBuffer | null> {
  let p = rawCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    rawCache.set(url, p);
  }
  return p;
}

function decode(url: string): Promise<AudioBuffer | null> {
  let p = bufCache.get(url);
  if (!p) {
    const c = ctx!;
    p = fetchRaw(url).then(async (raw) => {
      if (!raw) return null;
      try {
        // decodeAudioData làm hỏng ArrayBuffer gốc nên giải mã trên bản sao.
        return await c.decodeAudioData(raw.slice(0));
      } catch {
        console.warn('[audio] không giải mã được', url);
        return null;
      }
    });
    bufCache.set(url, p);
  }
  return p;
}

function clipUrls(c: Clip): string[] {
  return playable(c.sprite ? manifest?.sprites?.[c.sprite] : c.file);
}

/** Giải mã file đầu tiên tải được; thiếu định dạng ưu tiên thì thử định dạng kế tiếp. */
async function decodeFirst(urls: string[]): Promise<AudioBuffer | null> {
  for (const u of urls) {
    const b = await decode(u);
    if (b) return b;
  }
  return null;
}

/** Tải manifest và tải trước byte của SFX (chưa giải mã, chưa cần AudioContext). */
function loadManifest(): Promise<void> {
  manifestPromise ??= fetch(MANIFEST_DIR + 'manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((m: Manifest | null) => {
      // Dev server trả index.html cho file thiếu: không phải object có trường đúng thì bỏ qua.
      if (!m || typeof m !== 'object') return;
      manifest = m;
      for (const e of Object.values(m.sfx ?? {}))
        for (const c of e.variants ?? []) {
          const u = clipUrls(c)[0];
          if (u) void fetchRaw(u);
        }
      prepare();
      syncStreams();
    })
    .catch(() => {
      // Không có manifest: chạy hoàn toàn bằng âm tổng hợp.
    });
  return manifestPromise;
}

/** Giải mã SFX theo manifest; cần cả manifest lẫn AudioContext. */
function prepare(): void {
  if (prepared || !manifest || !ctx) return;
  prepared = true;
  for (const [name, e] of Object.entries(manifest.sfx ?? {})) {
    void Promise.all(
      (e.variants ?? []).map(async (c): Promise<Variant | null> => {
        const buf = await decodeFirst(clipUrls(c));
        if (!buf) return null;
        const start = c.sprite ? (c.start ?? 0) : 0;
        return { buf, start, dur: c.sprite ? c.dur : undefined, gain: c.gain ?? 1 };
      }),
    ).then((vs) => {
      const ok = vs.filter((v): v is Variant => v !== null);
      if (ok.length) ready.set(name, ok);
    });
  }
}

// ---------- đồ thị âm thanh ----------

function applyVolumes(): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : volumes.master, t, 0.02);
  for (const [b, g] of buses) g.gain.setTargetAtTime(volumes[b] * BUS_MIX[b], t, 0.02);
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volumes.master;
    master.connect(ctx.destination);
    for (const b of ['music', 'ambient', 'sfx', 'ui'] as Bus[]) {
      const g = ctx.createGain();
      g.gain.value = volumes[b] * BUS_MIX[b];
      g.connect(master);
      buses.set(b, g);
    }
    duckGain = ctx.createGain();
    duckGain.connect(buses.get('music')!);
    music = new StreamDeck(ctx, duckGain, 'music');
    ambient = new StreamDeck(ctx, buses.get('ambient')!, 'ambient');
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
    return null;
  }
  if (!muted) void loadManifest();
  prepare();
  return ctx;
}

/** Gọi khi người chơi bấm phím/chuột lần đầu để mở khóa âm thanh. */
export function unlockAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume().then(syncStreams);
  else syncStreams();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  if (!urlMute) localStorage.setItem('dtl.mute', m ? '1' : '0');
  applyVolumes();
  if (!m && ctx) void loadManifest();
  syncStreams();
}

export function getVolume(k: VolumeKey): number {
  return volumes[k];
}

/** Đặt âm lượng 0..1 của master hoặc một bus; lưu vào localStorage. */
export function setVolume(k: VolumeKey, v: number): void {
  volumes[k] = clamp01(v);
  localStorage.setItem('dtl.vol', JSON.stringify(volumes));
  applyVolumes();
}

/** Vị trí người nghe (nhân vật) và góc camera, gọi mỗi khung để panner trái/phải đúng hướng. */
export function setListener(x: number, z: number, yaw: number): void {
  listener.x = x;
  listener.z = z;
  listener.yaw = yaw;
}

/** -1 (trái) .. 1 (phải) theo vị trí nguồn so với hướng camera; gần người nghe thì về giữa. */
function panAt(x: number, z: number): number {
  const dx = x - listener.x;
  const dz = z - listener.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.5) return 0;
  // Camera ở phía sau nhân vật theo (sin yaw, cos yaw), nên vector "bên phải" màn hình là (cos yaw, -sin yaw).
  const side = (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / d;
  return Math.max(-1, Math.min(1, side * 0.75 * Math.min(1, (d - 1.5) / 4)));
}

/** Nút đầu ra cho một lần phát: (panner) → bus. */
function voiceOut(c: AudioContext, bus: Bus, at?: { x: number; z: number }): AudioNode {
  const dest = buses.get(bus)!;
  if (!at || typeof c.createStereoPanner !== 'function') return dest;
  const p = panAt(at.x, at.z);
  if (Math.abs(p) < 0.02) return dest;
  const pn = c.createStereoPanner();
  pn.pan.value = p;
  pn.connect(dest);
  return pn;
}

// ---------- âm tổng hợp (dự phòng) ----------

function tone(out: AudioNode, freq: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(out: AudioNode, dur: number, filter: BiquadFilterType, f0: number, f1: number, vol: number, delay = 0): void {
  if (!ctx || !noiseBuf) return;
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
  src.connect(flt).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.03);
}

function synth(name: Sfx, v: number, out: AudioNode): void {
  const c = ctx!;
  const o = c.createGain();
  o.gain.value = SYNTH_GAIN;
  o.connect(out);
  switch (name) {
    case 'sword':
      tone(o, 900, 2100, 0.09, 'triangle', 0.25 * v);
      noise(o, 0.07, 'highpass', 3000, 6000, 0.12 * v);
      break;
    case 'slash':
      noise(o, 0.22, 'bandpass', 5200, 700, 0.45 * v);
      tone(o, 520, 180, 0.2, 'sawtooth', 0.12 * v);
      break;
    case 'rain':
      for (let i = 0; i < 6; i++) noise(o, 0.1, 'highpass', 4200, 2000, 0.2 * v, i * 0.07);
      break;
    case 'thunder':
      noise(o, 0.12, 'highpass', 2500, 800, 0.9 * v);
      noise(o, 0.9, 'lowpass', 900, 70, 0.8 * v, 0.03);
      tone(o, 90, 38, 0.7, 'sine', 0.6 * v, 0.02);
      break;
    case 'hit':
      noise(o, 0.07, 'bandpass', 1400, 500, 0.4 * v);
      tone(o, 210, 90, 0.08, 'square', 0.14 * v);
      break;
    case 'hurt':
      tone(o, 150, 55, 0.18, 'sine', 0.7 * v);
      noise(o, 0.1, 'lowpass', 600, 150, 0.35 * v);
      break;
    case 'heal':
      tone(o, 520, 780, 0.35, 'sine', 0.22 * v);
      tone(o, 780, 1170, 0.4, 'sine', 0.14 * v, 0.1);
      break;
    case 'shield':
      tone(o, 300, 620, 0.3, 'triangle', 0.25 * v);
      break;
    case 'levelup':
      // Ngũ cung đi lên.
      [523, 587, 698, 784, 1047].forEach((f, i) => tone(o, f, f, 0.34, 'triangle', 0.28 * v, i * 0.09));
      break;
    case 'ascend':
      [262, 392, 523, 784, 1047, 1568].forEach((f, i) => tone(o, f, f * 1.01, 0.9, 'sine', 0.3 * v, i * 0.14));
      break;
    case 'loot':
      tone(o, 1320, 1320, 0.09, 'sine', 0.2 * v);
      tone(o, 1760, 1760, 0.14, 'sine', 0.16 * v, 0.06);
      break;
    case 'quest':
      [659, 784, 988].forEach((f, i) => tone(o, f, f, 0.25, 'triangle', 0.24 * v, i * 0.1));
      break;
    case 'death':
      tone(o, 330, 60, 0.9, 'sawtooth', 0.22 * v);
      break;
    case 'fly':
      noise(o, 0.5, 'bandpass', 600, 2600, 0.3 * v);
      tone(o, 400, 1200, 0.35, 'sine', 0.14 * v);
      break;
    case 'gather':
      noise(o, 0.12, 'highpass', 2500, 5000, 0.2 * v);
      tone(o, 880, 1320, 0.12, 'sine', 0.14 * v, 0.03);
      break;
  }
}

// ---------- phát SFX ----------

function playFile(name: string, vs: Variant[], e: SfxEntry, v: number, out: AudioNode): void {
  const c = ctx!;
  if (voices >= MAX_VOICES) {
    stats.dropped++;
    return;
  }
  // Chọn biến thể ngẫu nhiên, tránh lặp lại đúng biến thể vừa phát.
  let i = Math.floor(Math.random() * vs.length);
  if (vs.length > 1 && i === lastVariant.get(name)) i = (i + 1) % vs.length;
  lastVariant.set(name, i);
  const va = vs[i];
  const src = c.createBufferSource();
  src.buffer = va.buf;
  const pitch = e.pitch ?? DEFAULT_PITCH;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitch;
  const g = c.createGain();
  g.gain.value = v * va.gain * (e.gain ?? 1);
  src.connect(g).connect(out);
  voices++;
  src.onended = () => {
    voices--;
    g.disconnect();
  };
  if (va.dur !== undefined) src.start(0, va.start, va.dur);
  else src.start(0, va.start);
  stats.file++;
}

/**
 * Phát một hiệu ứng. `volume` 0..1 để giảm âm lượng theo khoảng cách;
 * `at` là vị trí nguồn trên mặt đất để lệch trái/phải theo camera.
 */
export function sfx(name: Sfx, volume = 1, at?: { x: number; z: number }): void {
  if (muted || volume <= 0.02) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  // Không phát cùng một âm dày quá (nhiều sát thương cùng lúc).
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < 45) return;
  lastPlayed.set(name, now);
  const e = manifest?.sfx?.[name];
  const vs = ready.get(name);
  const bus = e?.bus ?? SYNTH_BUS[name] ?? 'sfx';
  const out = voiceOut(c, bus, at);
  const duckBy = e?.duck ?? SYNTH_DUCK[name] ?? 0;
  if (duckBy > 0) duck(duckBy * Math.min(1, volume));
  const fromFile = !!(e && vs);
  if (fromFile) playFile(name, vs!, e!, volume, out);
  else {
    synth(name, volume, out);
    stats.synth++;
  }
  if (DEV && !logged.has(name + fromFile)) {
    logged.add(name + fromFile);
    console.info(`[audio] ${name}: ${fromFile ? 'file' : 'tổng hợp'}`);
  }
}

// ---------- ducking ----------

/** Hạ nhạc nền đi `amount` (0..1) trong `hold` giây rồi trả lại trong `release` giây. */
export function duck(amount = 0.4, hold = 1.2, release = 0.8): void {
  if (!ctx || !duckGain || amount <= 0.01) return;
  const t = ctx.currentTime;
  let level = 1 - clamp01(amount);
  let end = t + 0.08 + hold;
  // Hai lần hạ chồng nhau: giữ mức sâu hơn và thời điểm kết thúc muộn hơn.
  if (t < duckEnd) {
    level = Math.min(level, duckLevel);
    end = Math.max(end, duckEnd);
  }
  duckLevel = level;
  duckEnd = end;
  const p = duckGain.gain;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(level, t + 0.08);
  p.setValueAtTime(level, end);
  p.linearRampToValueAtTime(1, end + release);
}

// ---------- nhạc nền / âm môi trường (stream, crossfade 2 kênh) ----------

interface Channel {
  g: GainNode;
  el: HTMLAudioElement | null;
  node: MediaElementAudioSourceNode | null;
}

class StreamDeck {
  private ch: [Channel, Channel];
  private active = 0;
  /** Bài đang được yêu cầu (kể cả khi chưa phát được vì chưa có file/chưa mở khóa). */
  want: string | null = null;
  playing: string | null = null;
  private fade = 2;

  constructor(
    private c: AudioContext,
    out: AudioNode,
    private kind: 'music' | 'ambient',
  ) {
    const mk = (): Channel => {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(out);
      return { g, el: null, node: null };
    };
    this.ch = [mk(), mk()];
  }

  request(id: string | null, fade: number): void {
    this.want = id;
    this.fade = Math.max(0.05, fade);
    this.sync();
  }

  /** Đưa trạng thái phát về đúng `want` khi đủ điều kiện (đã mở khóa, có manifest, không tắt tiếng). */
  sync(): void {
    const id = muted || this.c.state !== 'running' ? null : this.want;
    if (id === this.playing) return;
    if (id && !manifest) return; // chờ manifest
    const entry = id ? manifest?.[this.kind]?.[id] : undefined;
    const url = entry ? pickSrc(entry.src) : null;
    if (id && !url && this.playing === null) return; // không có file: im lặng, không có gì để tắt
    const t = this.c.currentTime;
    const fade = this.fade;
    // Tắt dần kênh đang phát.
    const old = this.ch[this.active];
    ramp(old.g, 0, t, fade);
    const oldEl = old.el;
    if (oldEl) setTimeout(() => this.release(old, oldEl), fade * 1000 + 100);
    this.playing = id;
    if (!id || !url || !entry) return;
    // Bật kênh còn lại.
    this.active = 1 - this.active;
    const ch = this.ch[this.active];
    if (ch.el) this.release(ch, ch.el);
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.loop = entry.loop ?? true;
    el.src = url;
    el.addEventListener('error', () => console.warn('[audio] không phát được', url), { once: true });
    ch.el = el;
    ch.node = this.c.createMediaElementSource(el);
    ch.node.connect(ch.g);
    ch.g.gain.cancelScheduledValues(t);
    ch.g.gain.setValueAtTime(0, t);
    ramp(ch.g, entry.gain ?? 1, t, fade);
    if (DEV) console.info(`[audio] ${this.kind}: ${id} (${url})`);
    el.play().catch((err) => console.warn('[audio] play() bị từ chối', url, err));
  }

  private release(ch: Channel, el: HTMLAudioElement): void {
    if (ch.el !== el) return;
    el.pause();
    el.removeAttribute('src');
    el.load();
    ch.node?.disconnect();
    ch.el = null;
    ch.node = null;
  }
}

function ramp(g: GainNode, to: number, t: number, dur: number): void {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(to, t + dur);
}

const pending: { music: [string | null, number] | null; ambient: [string | null, number] | null } = { music: null, ambient: null };

function syncStreams(): void {
  if (pending.music && music) {
    music.request(...pending.music);
    pending.music = null;
  }
  if (pending.ambient && ambient) {
    ambient.request(...pending.ambient);
    pending.ambient = null;
  }
  music?.sync();
  ambient?.sync();
}

/** Chuyển nhạc nền (id trong manifest.music, `null` để tắt) với crossfade `fade` giây. Không có file thì im lặng. */
export function playMusic(id: string | null, fade = 2): void {
  if (music) music.request(id, fade);
  else pending.music = [id, fade];
}

/** Chuyển âm môi trường (id trong manifest.ambient, `null` để tắt). */
export function playAmbient(id: string | null, fade = 3): void {
  if (ambient) ambient.request(id, fade);
  else pending.ambient = [id, fade];
}

/** Trạng thái để gỡ lỗi/kiểm thử. */
export function audioStats() {
  return {
    state: ctx?.state ?? 'none',
    muted,
    manifest: manifest !== null,
    readySfx: [...ready.keys()],
    voices,
    music: music?.playing ?? null,
    ambient: ambient?.playing ?? null,
    volumes: { ...volumes },
    ...stats,
  };
}

// Tải manifest khi rảnh, sau khi trang đã lên (không chiếm băng thông lúc tải đầu).
if (!urlMute && typeof window !== 'undefined') {
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(() => void loadManifest(), { timeout: 4000 });
  else setTimeout(() => void loadManifest(), 1500);
}

if (DEV && typeof window !== 'undefined') {
  (window as unknown as { __audio?: unknown }).__audio = { stats: audioStats, sfx, playMusic, playAmbient, duck, setVolume };
  // Nghe thử bài khi làm nội dung: ?music=<id>&ambient=<id> (phát sau thao tác đầu tiên).
  const q = new URLSearchParams(location.search);
  if (q.get('music')) playMusic(q.get('music'));
  if (q.get('ambient')) playAmbient(q.get('ambient'));
}
