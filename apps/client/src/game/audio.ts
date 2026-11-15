// AudioManager: Web Audio chia bus  master → music | ambient | sfx | ui.
//
// - SFX: nạp file theo `public/audio/manifest.json` (file lẻ hoặc sprite + offset), nhiều biến thể,
//   lệch cao độ ngẫu nhiên, StereoPanner theo hướng camera. Sprite thường được tải byte lúc rảnh sau khi
//   vào trang và giải mã khi mở khóa âm thanh; sprite `lazy` chỉ tải khi lần đầu cần. Âm có trong manifest
//   mà chưa giải mã xong thì chờ tối đa PENDING_MS rồi phát (quá thì bỏ), không phát âm tổng hợp.
//   Chỉ khi không có manifest, không có mục cho âm đó, hoặc mọi biến thể đều lỗi mới lùi về âm tổng hợp.
// - Nhạc nền/âm môi trường: phát dạng stream qua HTMLAudioElement + MediaElementAudioSourceNode,
//   mỗi loại có 2 kênh để crossfade. Ducking hạ nhạc khi có âm lớn (sấm, đột phá...).
//   Âm môi trường chưa có file (manifest chưa tải, file lỗi, mạng chậm) thì phát gió tổng hợp;
//   gió tổng hợp tắt dần ngay khi file bắt đầu phát.
// - AudioContext chỉ được tạo sau thao tác đầu tiên của người chơi (chính sách tự phát của trình duyệt).
// - `?mute=1` trên URL: tắt tiếng cho bot/Playwright, không nạp file, không ghi đè cài đặt đã lưu.
//
// Định dạng manifest (đường dẫn tương đối với thư mục chứa manifest; mảng = các định dạng dự phòng,
// chọn cái đầu tiên trình duyệt phát được, ví dụ Opus/WebM rồi AAC/M4A cho Safari):
// {
//   "sprites": { "sfx_combat": ["sfx/sfx_combat.webm", "sfx/sfx_combat.m4a"],
//                "sfx_world": { "src": ["sfx/sfx_world.webm", "sfx/sfx_world.m4a"], "lazy": true } },
//   "sfx": {
//     "hit": { "variants": [ { "sprite": "sfx_combat", "start": 0, "dur": 0.3 }, { "file": "sfx/hit_b.webm" } ],
//              "pitch": 0.05, "gain": 1, "bus": "sfx", "duck": 0 }
//   },
//   "music":   { "sect": { "src": ["music/sect.webm", "music/sect.m4a"], "gain": 1, "loop": true,
//                         "credit": { "title": "Lạc Kiếm Tông", "by": "Đạp Thiên Lộ (original, CC0/tự soạn)", "license": "CC0-1.0; …" } },
//              "sting_levelup": { "src": [...], "loop": false, "credit": {...} } },
//   "ambient": { "wind": { "src": ["amb/wind.webm", "amb/wind.m4a"] } }
// }
// SFX và âm môi trường do `node tools/audio/build.mjs` sinh từ nguồn CC0 (khai báo ở tools/audio/sounds.json),
// giấy phép từng âm ghi trong assets/LICENSES.md. Mục "music" do `node tools/audio/loop.mjs` sinh (khai báo ở
// tools/audio/music.json, hướng dẫn ở docs/audio/music.md): nhạc tự soạn bằng code (MIDI + soundfont GeneralUser GS,
// CC0). loop.mjs ghi `credit` cho từng bài, mục "Nguồn nhạc" trong Cài đặt đọc trường này. Id bài lặp theo máy trạng
// thái trong music.ts (MUSIC_TRACKS); thêm `title` (màn tiêu đề, App.tsx) và `sting_*` (playSting, engine.ts).

import { bellPartials } from './lootBell';
import { gongPartials } from './chapter';
import MIX from './audioMix.json';

/** Âm có bản tổng hợp dự phòng (dùng khi không có manifest). */
type SynthSfx = 'sword' | 'slash' | 'rain' | 'thunder' | 'hit' | 'hurt' | 'heal' | 'shield' | 'levelup' | 'loot' | 'quest' | 'death' | 'fly' | 'gather' | 'ascend';
/** Âm chỉ có bản file (thiếu file thì im lặng hoặc mượn âm tổng hợp gần nhất theo SYNTH_ALIAS). */
type FileSfx =
  | 'crit'
  | 'block'
  | 'impact'
  | 'trib'
  | 'potion'
  | 'cast'
  | 'mcast'
  | 'respawn'
  | 'portal'
  | 'craft'
  | 'enhance'
  | 'meditate'
  | 'target'
  | 'ui_click'
  | 'ui_open'
  | 'ui_close'
  | 'ui_error'
  | 'ui_confirm'
  | 'spellbreak'
  | 'rare'
  | 'step_stone'
  | 'step_grass'
  | 'step_dirt'
  | 'step_sand'
  | 'step_wood'
  | 'step_water';
export type Sfx = SynthSfx | FileSfx;
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
export interface MusicCredit {
  title?: string;
  by?: string;
  license?: string;
  url?: string;
}
interface StreamEntry {
  src: string | string[];
  gain?: number;
  loop?: boolean;
  credit?: MusicCredit;
  /** Lớp giao chiến của bài vùng `of` (M4-13): cùng tempo/độ dài vòng, phát đồng bộ mẫu bằng stemMusic.ts. */
  stem?: { of: string; role: 'pulse' | 'edge' };
}
type SpriteSrc = string | string[] | { src: string | string[]; lazy?: boolean };
interface Manifest {
  sprites?: Record<string, SpriteSrc>;
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
/**
 * Mức trộn nội bộ của từng bus khi thanh trượt ở 100% (audioMix.json, cũng là nguồn của tools/audio/levels.mjs):
 * nhạc khoảng 1/3 SFX để không lấn tiếng đòn đánh, âm môi trường thấp hơn nhạc. Bảng đo ở docs/audio/levels.md.
 */
const BUS_MIX = MIX.bus as Record<Bus, number>;
/** Âm tổng hợp được chỉnh theo master 0,22 cũ; giữ nguyên để không có file thì nghe như trước. */
const SYNTH_GAIN = 0.22;
const SYNTH_BUS: Partial<Record<Sfx, Bus>> = { loot: 'ui', quest: 'ui' };
/** Âm lớn tự hạ nhạc nền (mức hạ 0..1). */
const SYNTH_DUCK: Partial<Record<Sfx, number>> = { thunder: 0.4, ascend: 0.5, levelup: 0.4, death: 0.4 };
/** Âm chỉ có bản file: khi không có manifest thì mượn âm tổng hợp này (thiếu = im lặng). */
const SYNTH_ALIAS: Partial<Record<FileSfx, SynthSfx>> = {
  crit: 'hit',
  block: 'shield',
  impact: 'slash',
  trib: 'thunder',
  potion: 'heal',
  respawn: 'heal',
  craft: 'loot',
  enhance: 'loot',
  spellbreak: 'shield',
  rare: 'loot',
};
const MAX_VOICES = 32;
const DEFAULT_PITCH = 0.05;
/** Âm có trong manifest nhưng chưa giải mã xong: chờ tối đa chừng này rồi phát, quá thì bỏ. */
const PENDING_MS = 600;

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
/** Tầng hạ nhạc giữ lâu (hội thoại, thẻ chương...), đứng sau `duckGain`; nhân với hạ nhạc ngắn. */
let holdGain: GainNode | null = null;
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
/** Số lần phát âm tổng hợp theo tên (kiểm "không còn âm tổng hợp cho combat"). */
const synthBy: Record<string, number> = {};
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

function spriteOf(name: string): { src: string | string[]; lazy: boolean } | null {
  const s = manifest?.sprites?.[name];
  if (!s) return null;
  if (typeof s === 'string' || Array.isArray(s)) return { src: s, lazy: false };
  return { src: s.src, lazy: !!s.lazy };
}

function clipUrls(c: Clip): string[] {
  return playable(c.sprite ? spriteOf(c.sprite)?.src : c.file);
}

/** Âm có biến thể nằm trong sprite `lazy`: chỉ tải/giải mã khi lần đầu cần. */
function isLazy(e: SfxEntry): boolean {
  return (e.variants ?? []).some((c) => !!c.sprite && !!spriteOf(c.sprite)?.lazy);
}

/** Giải mã file đầu tiên tải được; thiếu định dạng ưu tiên thì thử định dạng kế tiếp. */
async function decodeFirst(urls: string[]): Promise<AudioBuffer | null> {
  for (const u of urls) {
    const b = await decode(u);
    if (b) return b;
  }
  return null;
}

/** Tải manifest và tải trước byte của SFX không lazy (chưa giải mã, chưa cần AudioContext). */
function loadManifest(): Promise<void> {
  manifestPromise ??= fetch(MANIFEST_DIR + 'manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((m: Manifest | null) => {
      // Dev server trả index.html cho file thiếu: không phải object có trường đúng thì bỏ qua.
      if (!m || typeof m !== 'object') return;
      manifest = m;
      for (const e of Object.values(m.sfx ?? {})) {
        if (isLazy(e)) continue;
        for (const c of e.variants ?? []) {
          const u = clipUrls(c)[0];
          if (u) void fetchRaw(u);
        }
      }
      prepare();
      syncStreams();
    })
    .catch(() => {
      // Không có manifest: chạy hoàn toàn bằng âm tổng hợp.
    });
  return manifestPromise;
}

/** Giải mã các SFX không lazy theo manifest; cần cả manifest lẫn AudioContext. */
function prepare(): void {
  if (prepared || !manifest || !ctx) return;
  prepared = true;
  for (const [name, e] of Object.entries(manifest.sfx ?? {})) if (!isLazy(e)) decodeEntry(name);
}

/** Tên đang giải mã hoặc đã xong; `failed` = mọi biến thể đều lỗi (khi đó lùi về âm tổng hợp). */
const decoding = new Set<string>();
const failed = new Set<string>();
const pendingPlay = new Map<string, { t: number; volume: number; at?: { x: number; z: number } }>();

function decodeEntry(name: string): void {
  const e = manifest?.sfx?.[name];
  if (!e || !ctx || decoding.has(name)) return;
  decoding.add(name);
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
    else failed.add(name);
    // Lần phát đang chờ file: phát nếu chưa quá lâu.
    const p = pendingPlay.get(name);
    pendingPlay.delete(name);
    if (p && performance.now() - p.t <= PENDING_MS && !muted && ctx?.state === 'running') emit(name as Sfx, p.volume, p.at, false);
  });
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
    holdGain = ctx.createGain();
    duckGain.connect(holdGain);
    holdGain.connect(buses.get('music')!);
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
  applyHolds();
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
  if (ctx) placeListener(ctx.listener, x, z, yaw);
}

/**
 * Đặt người nghe cho PannerNode (nguồn âm theo vị trí): mặt phẳng XZ, y = 0 cho cả nguồn lẫn người nghe.
 * Camera ở sau nhân vật theo (sin yaw, cos yaw) nên hướng nhìn là (−sin yaw, 0, −cos yaw); "bên phải" = hướng × lên = (cos yaw, 0, −sin yaw),
 * khớp `panAt`.
 */
function placeListener(l: AudioListener, x: number, z: number, yaw: number): void {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  if (l.positionX) {
    l.positionX.value = x;
    l.positionY.value = 0;
    l.positionZ.value = z;
    l.forwardX.value = fx;
    l.forwardY.value = 0;
    l.forwardZ.value = fz;
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  } else {
    // Safari cũ: API đặt từng bước.
    l.setPosition(x, 0, z);
    l.setOrientation(fx, 0, fz, 0, 1, 0);
  }
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

function synth(name: SynthSfx, v: number, out: AudioNode): void {
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

/** Tuỳ chọn phát một tiếng (K-7): lên lịch theo đồng hồ AudioContext, pitch riêng cho tiếng đòn. */
export interface SfxOpts {
  /** Trễ (giây) kể từ bây giờ, đặt bằng `src.start(ctx.currentTime + delay)`, không dùng setTimeout. */
  delay?: number;
  /** Hệ số tốc độ phát nhân thêm (đã gồm biến thiên ngẫu nhiên nếu người gọi muốn): thay cho pitch ngẫu nhiên riêng của tiếng. */
  rate?: number;
}

/** Nhật ký phát tiếng đòn (bản dev): `__audio.hitLog`. */
export const sfxLog: { name: string; at: number; delay: number; rate: number; ctxTime: number }[] = [];

function playFile(name: string, vs: Variant[], e: SfxEntry, v: number, out: AudioNode, o?: SfxOpts): void {
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
  const rate = o?.rate ?? 1 + (Math.random() * 2 - 1) * pitch;
  src.playbackRate.value = rate;
  const when = c.currentTime + Math.max(0, o?.delay ?? 0);
  if (DEV && o?.rate !== undefined) {
    sfxLog.push({ name, at: performance.now(), delay: o.delay ?? 0, rate, ctxTime: when });
    if (sfxLog.length > 200) sfxLog.shift();
  }
  const g = c.createGain();
  g.gain.value = v * va.gain * (e.gain ?? 1);
  src.connect(g).connect(out);
  voices++;
  src.onended = () => {
    voices--;
    g.disconnect();
  };
  if (va.dur !== undefined) src.start(when, va.start, va.dur);
  else src.start(when, va.start);
  stats.file++;
}

/**
 * Phát một hiệu ứng. `volume` 0..1 để giảm âm lượng theo khoảng cách;
 * `at` là vị trí nguồn trên mặt đất để lệch trái/phải theo camera.
 */
export function sfx(name: Sfx, volume = 1, at?: { x: number; z: number }, throttle = true, opts?: SfxOpts): void {
  if (muted || volume <= 0.02) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  // Không phát cùng một âm dày quá (nhiều sát thương cùng lúc). Bước chân của nhiều người tự giới hạn ở footsteps.ts.
  if (throttle) {
    const now = performance.now();
    if (now - (lastPlayed.get(name) ?? 0) < 45) return;
    lastPlayed.set(name, now);
  }
  emit(name, volume, at, true, opts);
}

/** Phát chuông đồ rơi (âm tổng hợp, bus giao diện). Tắt tiếng (`?mute=1`) thì im. */
export function lootChime(tier: 0 | 1 | 2 | 3 | 4, volume = 1): void {
  if (muted || volume <= 0.02) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  // Nhiều món rơi cùng lúc: không chồng chuông dày hơn 70 ms một tiếng.
  const now = performance.now();
  if (now - (lastPlayed.get('loot_bell') ?? 0) < 70) return;
  lastPlayed.set('loot_bell', now);
  const o = c.createGain();
  o.gain.value = SYNTH_GAIN * volume;
  o.connect(voiceOut(c, 'ui'));
  for (const p of bellPartials(tier)) tone(o, p.freq, p.freq * 0.998, p.dur, 'sine', p.gain, p.delay);
  if (tier >= 2) {
    duck(0.25, tier >= 4 ? 2.2 : 0.8, tier >= 4 ? 1.6 : 0.8);
    // Đồ quý: thêm tiếng xác nhận giòn (2 lớp mẫu + kim loại tổng hợp) dưới tiếng chuông, nổi nhất trong các SFX (D2).
    emit('rare', volume, undefined, true);
  }
  stats.synth++;
}

/**
 * Tiếng nhấn của thẻ chương (C2): một tiếng chiêng trầm trên bus nhạc (thanh trượt Nhạc nền chỉnh được),
 * hạ nhạc nền một nhịp cho chiêng nổi lên. Tắt tiếng (`?mute=1`) thì im.
 */
export function chapterSting(volume = 1): void {
  if (muted || volume <= 0.02) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  const o = c.createGain();
  o.gain.value = SYNTH_GAIN * volume;
  o.connect(voiceOut(c, 'music'));
  for (const p of gongPartials()) tone(o, p.freq, p.freq * 0.997, p.dur, 'sine', p.gain, p.delay);
  duck(0.45, 1.6, 1.2);
  stats.synth++;
}

/**
 * Nhạc ngắn (sting) trong manifest.music (`loop: false`, ví dụ `sting_levelup`): phát một lần trên bus nhạc
 * (thanh trượt Nhạc nền chỉnh được, không bị ducking) và hạ nhạc nền trong lúc phát. File chỉ tải khi phát lần đầu
 * (vài chục KB), các lần sau lấy từ cache HTTP. Trả `false` khi không phát được (tắt tiếng, chưa mở khóa âm thanh,
 * chưa có file) để nơi gọi dùng tiếng thay thế.
 */
export function playSting(id: string, volume = 1): boolean {
  if (muted || volume <= 0.02) return false;
  const c = ensure();
  const bus = buses.get('music');
  const e = manifest?.music?.[id];
  if (!c || c.state !== 'running' || !bus || !e) return false;
  const url = pickSrc(e.src);
  if (!url) return false;
  const el = new Audio();
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  el.src = url;
  const node = c.createMediaElementSource(el);
  const g = c.createGain();
  g.gain.value = (e.gain ?? 1) * volume;
  node.connect(g);
  g.connect(bus);
  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    node.disconnect();
    g.disconnect();
    el.removeAttribute('src');
    el.load();
  };
  el.addEventListener('ended', release, { once: true });
  el.addEventListener('error', () => {
    console.warn('[audio] không phát được sting', id, url);
    release();
  });
  el.play()
    .then(() => duck(0.6, Math.max(0.5, (Number.isFinite(el.duration) ? el.duration : 4) - 1), 1.2))
    .catch((err) => {
      console.warn('[audio] play() sting bị từ chối', id, err);
      release();
    });
  if (DEV) console.info(`[audio] sting: ${id}`);
  return true;
}

/** Bài nhạc nền (id manifest) đang được yêu cầu phát, kể cả khi còn chờ mở khóa/manifest. */
export function musicRequested(): string | null {
  if (pending.music) return pending.music[0];
  return music?.want ?? null;
}

const SYNTH_NAMES = new Set<string>(['sword', 'slash', 'rain', 'thunder', 'hit', 'hurt', 'heal', 'shield', 'levelup', 'loot', 'quest', 'death', 'fly', 'gather', 'ascend']);

function emit(name: Sfx, volume: number, at: { x: number; z: number } | undefined, allowPending: boolean, o?: SfxOpts): void {
  const c = ctx!;
  const e = manifest?.sfx?.[name];
  const useFile = !!e && !failed.has(name);
  const vs = ready.get(name);
  if (useFile && !vs) {
    // Có file nhưng chưa giải mã (sprite lazy, hoặc bấm ngay sau khi mở khóa): chờ file, không phát âm tổng hợp.
    if (allowPending) {
      // Chép tọa độ: người gọi hay truyền vector tạm dùng chung (engine `_v`), sẽ bị ghi đè trước khi file giải mã xong.
      pendingPlay.set(name, { t: performance.now(), volume, at: at ? { x: at.x, z: at.z } : undefined });
      decodeEntry(name);
    }
    return;
  }
  const synthName = (SYNTH_NAMES.has(name) ? name : SYNTH_ALIAS[name as FileSfx]) as SynthSfx | undefined;
  if (!useFile && !synthName) return;
  const bus = e?.bus ?? SYNTH_BUS[name] ?? (name.startsWith('ui_') || name === 'target' ? 'ui' : 'sfx');
  const out = voiceOut(c, bus, at);
  const duckBy = e?.duck ?? SYNTH_DUCK[name] ?? 0;
  if (duckBy > 0) duck(duckBy * Math.min(1, volume));
  if (useFile) playFile(name, vs!, e!, volume, out, o);
  else {
    synth(synthName!, volume, out);
    stats.synth++;
    synthBy[name] = (synthBy[name] ?? 0) + 1;
  }
  if (DEV && !logged.has(name + useFile)) {
    logged.add(name + useFile);
    console.info(`[audio] ${name}: ${useFile ? 'file' : 'tổng hợp'}`);
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

/** Hạ nhạc giữ lâu: mỗi lý do (hội thoại, lời boss, thẻ chương) một khóa; mức hạ là mức sâu nhất đang giữ. */
const holds = new Map<string, { amount: number; until: number }>();
let holdTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Giữ nhạc nền thấp trong lúc có thoại/thẻ chương/cảnh mở đầu. `amount` 0..1 (0 = thả khóa `key`), `seconds` = tự thả sau chừng này giây
 * (bỏ trống thì giữ tới khi gọi lại với 0). Nhạc hạ nhanh (0,25 s) và trả lại chậm (0,7 s) để không giật.
 */
export function duckHold(key: string, amount: number, seconds = Infinity): void {
  if (amount <= 0.01) holds.delete(key);
  else holds.set(key, { amount: clamp01(amount), until: Number.isFinite(seconds) ? performance.now() + seconds * 1000 : Infinity });
  applyHolds();
}

function applyHolds(): void {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  const now = performance.now();
  let amount = 0;
  let next = Infinity;
  for (const [k, h] of holds) {
    if (h.until <= now) holds.delete(k);
    else {
      amount = Math.max(amount, h.amount);
      next = Math.min(next, h.until);
    }
  }
  if (Number.isFinite(next)) holdTimer = setTimeout(applyHolds, Math.max(10, next - now + 5));
  if (!ctx || !holdGain) return;
  holdGain.gain.setTargetAtTime(1 - amount, ctx.currentTime, amount > 0 ? 0.25 : 0.7);
}

/** Mức hạ giữ lâu hiện tại 0..1 (gỡ lỗi/kiểm thử). */
export function holdAmount(): number {
  const now = performance.now();
  let a = 0;
  for (const h of holds.values()) if (h.until > now) a = Math.max(a, h.amount);
  return a;
}

// ---------- nguồn âm theo vị trí (PannerNode) ----------

export interface SpatialOpts {
  /** Khoảng cách (m) mà từ đó âm bắt đầu nhỏ đi. */
  ref: number;
  /** Độ dốc suy giảm theo mô hình nghịch đảo của Web Audio. */
  rolloff: number;
}

export interface SpatialLoop {
  /** Đặt độ to 0..1 (đã nhân sẵn hệ số của nguồn), mờ dần trong `fade` giây. */
  fade(gain: number, fade: number): void;
  stop(fade: number): void;
}

const spatialBufs = new Map<string, AudioBuffer>();

/** Đồ thị âm thanh đã mở khóa và đang bật tiếng để dựng nguồn theo vị trí; không thì nơi gọi chỉ ghi nhận trạng thái, không phát. */
export function spatialReady(): boolean {
  return !muted && !!ctx && ctx.state === 'running';
}

/** Bộ đệm dựng bằng code (ví dụ lách tách đèn lồng), tạo một lần theo `key`. */
export function spatialBuffer(key: string, make: (sampleRate: number) => Float32Array): AudioBuffer | null {
  if (!ctx) return null;
  let b = spatialBufs.get(key);
  if (!b) {
    const d = make(ctx.sampleRate);
    b = ctx.createBuffer(1, d.length, ctx.sampleRate);
    b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
    spatialBufs.set(key, b);
  }
  return b;
}

/** Giải mã một âm môi trường trong manifest (ví dụ `water`) thành bộ đệm để lặp theo vị trí; tải lần đầu khi cần. */
export async function spatialAmbientBuffer(id: string): Promise<AudioBuffer | null> {
  const key = `amb:${id}`;
  const hit = spatialBufs.get(key);
  if (hit) return hit;
  if (!ctx || !manifest) return null;
  const e = manifest.ambient?.[id];
  const buf = e ? await decodeFirst(playable(e.src)) : null;
  if (buf) spatialBufs.set(key, buf);
  return buf;
}

function spatialNode(c: AudioContext, bus: Bus, x: number, z: number, o: SpatialOpts): PannerNode {
  const pan = c.createPanner();
  pan.panningModel = 'equalpower';
  pan.distanceModel = 'inverse';
  pan.refDistance = o.ref;
  pan.rolloffFactor = o.rolloff;
  if (pan.positionX) {
    pan.positionX.value = x;
    pan.positionY.value = 0;
    pan.positionZ.value = z;
  } else pan.setPosition(x, 0, z);
  pan.connect(buses.get(bus)!);
  return pan;
}

/** Lặp một bộ đệm tại vị trí (x, z) qua PannerNode vào bus `bus`. Bắt đầu im, gọi `fade()` để bật. */
export function spatialLoop(buf: AudioBuffer, bus: Bus, x: number, z: number, o: SpatialOpts, rate = 1): SpatialLoop | null {
  const c = ctx;
  if (!spatialReady() || !c) return null;
  const pan = spatialNode(c, bus, x, z, o);
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(pan);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = rate;
  src.connect(g);
  src.start(0, Math.random() * buf.duration);
  let stopped = false;
  return {
    fade(gain, fade) {
      if (!stopped) ramp(g, gain, c.currentTime, Math.max(0.02, fade));
    },
    stop(fade) {
      if (stopped) return;
      stopped = true;
      ramp(g, 0, c.currentTime, Math.max(0.02, fade));
      setTimeout(() => {
        src.stop();
        src.disconnect();
        g.disconnect();
        pan.disconnect();
      }, fade * 1000 + 80);
    },
  };
}

/**
 * Một tiếng chuông/chiêng tại (x, z): các bồi âm (như bellPartials) qua thông thấp (xa thì tối hơn) và PannerNode vào bus `bus`.
 * Trả `true` nếu đã phát. Không đi qua hạ nhạc.
 */
export function spatialPartials(
  parts: { freq: number; gain: number; dur: number; delay: number }[],
  bus: Bus,
  x: number,
  z: number,
  o: SpatialOpts,
  volume: number,
  lowpass = 2800,
): boolean {
  const c = ctx;
  if (!spatialReady() || !c) return false;
  const pan = spatialNode(c, bus, x, z, o);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = SYNTH_GAIN * volume;
  g.connect(lp).connect(pan);
  let end = 0;
  for (const p of parts) {
    tone(g, p.freq, p.freq * 0.997, p.dur, 'sine', p.gain, p.delay);
    end = Math.max(end, p.delay + p.dur);
  }
  setTimeout(
    () => {
      g.disconnect();
      lp.disconnect();
      pan.disconnect();
    },
    (end + 0.3) * 1000,
  );
  stats.synth++;
  return true;
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
  /** Gió tổng hợp dự phòng (chỉ deck âm môi trường). */
  readonly wind: SynthWind | null;

  /** Bài đang ra tiếng và vị trí phát (giây) trong vòng, để lớp stem nối đúng pha khi tiếp quản. */
  position(): { id: string; time: number } | null {
    const el = this.ch[this.active].el;
    return this.playing && el ? { id: this.playing, time: el.currentTime } : null;
  }

  constructor(
    private c: AudioContext,
    out: AudioNode,
    private kind: 'music' | 'ambient',
  ) {
    this.wind = kind === 'ambient' ? new SynthWind(c, out) : null;
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
    if (!id) this.wind?.stop(this.fade);
    if (id === this.playing) return;
    if (id && !manifest) {
      // Chờ manifest: âm môi trường tạm bằng gió tổng hợp (nhạc thì im lặng, music.ts tự lo bài giữ chỗ).
      this.wind?.start(this.fade);
      return;
    }
    const entry = id ? manifest?.[this.kind]?.[id] : undefined;
    // Mọi định dạng trình duyệt nhận là phát được, theo thứ tự ưu tiên: định dạng đầu lỗi khi nạp
    // (canPlayType nói có nhưng không giải mã được, ví dụ WebM/Opus trên Safari cũ) thì thử định dạng kế tiếp.
    const urls = entry ? playable(entry.src) : [];
    const url = urls[0] ?? null;
    if (id && !url && this.playing === null) {
      // Không có file: nhạc im lặng, âm môi trường dùng gió tổng hợp.
      this.wind?.start(this.fade);
      return;
    }
    const t = this.c.currentTime;
    const fade = this.fade;
    // Tắt dần kênh đang phát.
    const old = this.ch[this.active];
    ramp(old.g, 0, t, fade);
    const oldEl = old.el;
    if (oldEl) setTimeout(() => this.release(old, oldEl), fade * 1000 + 100);
    this.playing = id;
    if (!id || !url || !entry) {
      if (id) this.wind?.start(fade);
      return;
    }
    // Bật kênh còn lại.
    this.active = 1 - this.active;
    const ch = this.ch[this.active];
    if (ch.el) this.release(ch, ch.el);
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.loop = entry.loop ?? true;
    el.src = url;
    let tried = 0;
    el.addEventListener('error', () => {
      // Kênh đã bị thả hoặc đã đổi bài (release() xóa src cũng bắn 'error'): bỏ qua.
      if (ch.el !== el || this.playing !== id) return;
      console.warn('[audio] không phát được', urls[tried]);
      tried++;
      if (tried < urls.length) {
        el.src = urls[tried];
        el.play().catch((err) => console.warn('[audio] play() bị từ chối', urls[tried], err));
        return;
      }
      this.wind?.start(fade);
    });
    // File đã ra tiếng: tắt dần gió tổng hợp (nếu đang chạy) cùng nhịp crossfade.
    el.addEventListener('playing', () => ch.el === el && this.wind?.stop(fade), { once: true });
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

/** Mức gió tổng hợp (trước bus ambient); chỉnh theo âm môi trường file ở level -22 dB. */
const WIND_GAIN = 0.35;

/**
 * Gió tổng hợp: nhiễu 4 giây lặp → thông dải → thông thấp có tần số cắt và âm lượng thở theo 2 LFO chậm.
 * Chỉ dựng đồ thị khi cần và gỡ hẳn khi tắt để không tốn CPU lúc đã có file.
 */
class SynthWind {
  private g: GainNode;
  private nodes: AudioScheduledSourceNode[] = [];
  on = false;

  constructor(
    private c: AudioContext,
    out: AudioNode,
  ) {
    this.g = c.createGain();
    this.g.gain.value = 0;
    this.g.connect(out);
  }

  start(fade: number): void {
    if (this.on) return;
    this.on = true;
    const c = this.c;
    if (!this.nodes.length) {
      const len = c.sampleRate * 4;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      // Nhiễu nâu nhẹ (tích phân có rò) cho tiếng gió trầm, không rít.
      let y = 0;
      for (let i = 0; i < len; i++) {
        y = 0.985 * y + 0.15 * (Math.random() * 2 - 1);
        d[i] = y;
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420;
      bp.Q.value = 0.5;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      const amp = c.createGain();
      amp.gain.value = 0.7;
      const lfo1 = c.createOscillator();
      lfo1.frequency.value = 0.063;
      const l1 = c.createGain();
      l1.gain.value = 380;
      lfo1.connect(l1).connect(lp.frequency);
      const lfo2 = c.createOscillator();
      lfo2.frequency.value = 0.17;
      const l2 = c.createGain();
      l2.gain.value = 0.3;
      lfo2.connect(l2).connect(amp.gain);
      src.connect(bp).connect(lp).connect(amp).connect(this.g);
      src.start(0, Math.random() * 4);
      lfo1.start();
      lfo2.start();
      this.nodes = [src, lfo1, lfo2];
    }
    ramp(this.g, WIND_GAIN, c.currentTime, fade);
    if (DEV) console.info('[audio] ambient: gió tổng hợp');
  }

  stop(fade: number): void {
    if (!this.on) return;
    this.on = false;
    ramp(this.g, 0, this.c.currentTime, fade);
    setTimeout(() => {
      if (this.on) return;
      for (const n of this.nodes) {
        n.stop();
        n.disconnect();
      }
      this.nodes = [];
    }, fade * 1000 + 150);
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

/** Manifest có file nhạc phát được cho bài `id` không (chưa tải manifest thì coi như không). */
export function hasMusicFile(id: string): boolean {
  const e = manifest?.music?.[id];
  return !!e && pickSrc(e.src) !== null;
}

/** Nguồn phát được (đã lọc theo định dạng trình duyệt nhận) của bài vùng và hai lớp giao chiến; null nếu thiếu lớp nào. */
export function stemSources(zone: string): { base: string[]; pulse: string[]; edge: string[] } | null {
  const m = manifest?.music;
  if (!m?.[zone]) return null;
  const find = (role: 'pulse' | 'edge') => Object.values(m).find((e) => e.stem?.of === zone && e.stem.role === role);
  const out = { base: playable(m[zone].src), pulse: playable(find('pulse')?.src), edge: playable(find('edge')?.src) };
  return out.base.length && out.pulse.length && out.edge.length ? out : null;
}

/** Tải và giải mã một file nhạc (thử lần lượt các định dạng), không giữ trong bộ nhớ đệm giải mã chung (stem ~50 MB/lớp). */
export async function decodeMusic(urls: string[]): Promise<AudioBuffer | null> {
  const c = ctx;
  if (!c) return null;
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      return await c.decodeAudioData(await r.arrayBuffer());
    } catch {
      console.warn('[audio] không giải mã được stem', u);
    }
  }
  return null;
}

/** Bài nhạc deck stream đang phát và vị trí trong vòng (giây). */
export function musicPosition(): { id: string; time: number } | null {
  return music?.position() ?? null;
}

/**
 * Nút đầu vào bus nhạc (sau ducking) cho nhạc sinh thủ tục; `null` khi chưa mở khóa âm thanh,
 * đang tắt tiếng hoặc AudioContext chưa chạy (khi đó không lên lịch nốt để đỡ tốn CPU).
 */
export function musicOutput(): { ctx: AudioContext; out: AudioNode } | null {
  if (muted || !ctx || !duckGain || ctx.state !== 'running') return null;
  return { ctx, out: duckGain };
}

/** Danh sách ghi nguồn nhạc trong manifest (cho mục credits ở Cài đặt). */
export async function musicCredits(): Promise<(MusicCredit & { id: string })[]> {
  await loadManifest();
  return Object.entries(manifest?.music ?? {})
    .filter(([, e]) => e.credit)
    .map(([id, e]) => ({ id, ...e.credit }));
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
    /** Bài được yêu cầu (vẫn ghi khi tắt tiếng, để kiểm máy trạng thái bằng ?mute=1). */
    musicWant: musicRequested(),
    ambient: ambient?.playing ?? null,
    ambientWant: ambient?.want ?? null,
    synthWind: ambient?.wind?.on ?? false,
    failedSfx: [...failed],
    volumes: { ...volumes },
    duckHold: holdAmount(),
    ...stats,
    synthBy: { ...synthBy },
  };
}

// Tải manifest khi rảnh, sau khi trang đã lên (không chiếm băng thông lúc tải đầu).
if (!urlMute && typeof window !== 'undefined') {
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(() => void loadManifest(), { timeout: 4000 });
  else setTimeout(() => void loadManifest(), 1500);
}

if (DEV && typeof window !== 'undefined') {
  (window as unknown as { __audio?: unknown }).__audio = { hitLog: sfxLog, stats: audioStats, sfx, playMusic, playAmbient, duck, duckHold, holdAmount, setVolume };
  // Nghe thử bài khi làm nội dung: ?music=<id>&ambient=<id> (phát sau thao tác đầu tiên).
  const q = new URLSearchParams(location.search);
  if (q.get('music')) playMusic(q.get('music'));
  if (q.get('ambient')) playAmbient(q.get('ambient'));
}
