// Nhạc nền theo trạng thái: vùng (Lạc Kiếm Tông, rừng, hồ, núi, Kiếm Trủng/bí cảnh), chiến đấu,
// boss, độ kiếp, đả tọa. Quyết định bài nằm ở musicDirector.ts (có hysteresis, test đơn vị được).
//
// Phát: bài có file trong `public/audio/manifest.json` (mục "music", id = MusicTrack) thì
// AudioManager stream và crossfade; chưa có file thì dùng bài giữ chỗ sinh thủ tục bằng Web Audio:
// dây gảy kiểu đàn tranh (Karplus-Strong) theo thang ngũ cung, nền drone, trống/chuông tùy bài.
// Nhạc sinh thủ tục không có điểm nối nên lặp liền vô hạn; về sau vẫn giữ làm dự phòng khi mạng chậm.
//
// Âm môi trường (M4-12): cùng vòng tick chọn id theo vùng + đêm (ambientFor, chống đổi ở ranh giới bằng
// AmbientPicker) rồi gọi playAmbient; AudioManager stream file, chưa có file thì phát gió tổng hợp.
// Game chưa có chu kỳ ngày/đêm nên "đêm" theo giờ máy (19h–5h); `?night=1|0` để ép khi thử.
//
// Nhạc chiến đấu phân lớp (M4-13, stemMusic.ts): ở vùng có bộ lớp (tông môn, đồng hoang, Kiếm Trủng) vào/ra giao tranh
// không đổi bài mà tăng/giảm âm lượng lớp nhịp và lớp giai điệu căng theo mức giao chiến (musicDirector.level).
// Thiếu file, nạp lỗi hoặc rừng/hồ/boss thì dùng đường crossfade cũ.
//
// Gỡ lỗi: chuyển trạng thái được log `[music] ...` khi chạy dev hoặc có `?debug`;
// `window.__music.log` giữ 50 lần chuyển gần nhất, `__music.state()` xem trạng thái hiện tại.
import { MS_ATTACK, MS_CHASE, PF_DEAD, PF_MEDITATING, PF_TRIBULATION } from '@dtl/shared';
import { biomeAt, levelId, levelTerrain } from './levelCtx';
import { riftBlend } from './bacHoangArt';
import { hasMusicFile, musicOutput, musicPosition, playAmbient, playMusic, stemSources } from './audio';
import type { MonVis } from './entities';
import {
  AmbientPicker,
  ambientFor,
  type CombatLevel,
  isNightHour,
  isStemZone,
  type MusicChange,
  MusicDirector,
  type MusicInput,
  type MusicTrack,
  STEM_MIX,
  type StemMix,
  type StemZone,
} from './musicDirector';
import { StemPlayer } from './stemMusic';

export { MUSIC_TRACKS, type MusicTrack } from './musicDirector';

const DEV = (import.meta as unknown as { env: { DEV: boolean } }).env.DEV;
const DEBUG = DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'));
const NIGHT_PARAM = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('night') : null;

function isNight(): boolean {
  if (NIGHT_PARAM === '1') return true;
  if (NIGHT_PARAM === '0') return false;
  return isNightHour(new Date().getHours());
}

/** Quái thường đang đuổi/đánh trong bán kính này thì tính là đang giao tranh. */
const THREAT_R = 16;
/** Boss to, tầm đánh xa: bán kính rộng hơn. */
const BOSS_R = 36;

// ---------- bài giữ chỗ sinh thủ tục ----------

/** Ngũ cung: cung (trưởng) và vũ (thứ). */
const GONG = [0, 2, 4, 7, 9];
const YU = [0, 3, 5, 7, 10];

interface Style {
  /** Tần số chủ âm (Hz) của dây gảy. */
  root: number;
  scale: number[];
  /** Nhịp (phách/phút); mỗi bước là một móc đơn. */
  bpm: number;
  /** Xác suất có nốt ở mỗi bước. */
  density: number;
  /** Số bậc ngũ cung dây gảy được đi (từ chủ âm lên). */
  span: number;
  gain: number;
  /** Âm lượng drone (0 = không có). */
  drone: number;
  /** Mẫu trống 16 bước, 0..1; rỗng = không trống. */
  drum?: number[];
  /** Xác suất chuông ở đầu mỗi ô nhịp. */
  bell?: number;
  /** Dây gảy tắt nhanh (0.990) hay ngân dài (0.998). */
  sustain: number;
}

const STYLES: Record<MusicTrack, Style> = {
  sect: { root: 293.66, scale: GONG, bpm: 66, density: 0.32, span: 9, gain: 0.5, drone: 0.1, bell: 0.25, sustain: 0.997 },
  wild: { root: 329.63, scale: GONG, bpm: 84, density: 0.42, span: 10, gain: 0.48, drone: 0.08, sustain: 0.996 },
  wild_ochre: { root: 293.66, scale: GONG, bpm: 68, density: 0.3, span: 9, gain: 0.46, drone: 0.1, sustain: 0.997 },
  wild_ash: { root: 293.66, scale: YU, bpm: 52, density: 0.22, span: 8, gain: 0.46, drone: 0.12, bell: 0.15, sustain: 0.998 },
  wild_rift: { root: 164.81, scale: YU, bpm: 60, density: 0.2, span: 7, gain: 0.46, drone: 0.16, bell: 0.2, sustain: 0.998 },
  wild_night: { root: 220.0, scale: GONG, bpm: 60, density: 0.26, span: 9, gain: 0.46, drone: 0.12, bell: 0.2, sustain: 0.997 },
  wild_cloud: { root: 392.0, scale: GONG, bpm: 72, density: 0.34, span: 10, gain: 0.46, drone: 0.08, bell: 0.2, sustain: 0.997 },
  forest: { root: 392.0, scale: GONG, bpm: 92, density: 0.4, span: 10, gain: 0.45, drone: 0.06, sustain: 0.995 },
  lake: { root: 261.63, scale: YU, bpm: 60, density: 0.24, span: 8, gain: 0.5, drone: 0.14, sustain: 0.998 },
  dungeon: { root: 220.0, scale: YU, bpm: 58, density: 0.2, span: 7, gain: 0.5, drone: 0.16, bell: 0.15, sustain: 0.997 },
  dungeon_rift: { root: 164.81, scale: YU, bpm: 52, density: 0.18, span: 7, gain: 0.5, drone: 0.2, bell: 0.15, sustain: 0.998 },
  combat: {
    root: 246.94,
    scale: YU,
    bpm: 128,
    density: 0.55,
    span: 9,
    gain: 0.5,
    drone: 0.1,
    drum: [1, 0, 0, 0.4, 0.7, 0, 0.4, 0, 1, 0, 0.4, 0, 0.7, 0, 0.5, 0.3],
    sustain: 0.992,
  },
  boss: {
    root: 196.0,
    scale: YU,
    bpm: 136,
    density: 0.6,
    span: 10,
    gain: 0.55,
    drone: 0.16,
    drum: [1, 0, 0.5, 0, 1, 0, 0.5, 0.3, 1, 0, 0.5, 0, 1, 0.4, 0.7, 0.5],
    sustain: 0.992,
  },
  dungeon_boss: {
    root: 207.65,
    scale: YU,
    bpm: 132,
    density: 0.55,
    span: 9,
    gain: 0.55,
    drone: 0.18,
    drum: [1, 0, 0.4, 0, 0.8, 0, 0.4, 0.4, 1, 0, 0.4, 0, 0.8, 0.4, 0.6, 0.6],
    bell: 0.3,
    sustain: 0.992,
  },
  dungeon_rift_boss: {
    root: 164.81,
    scale: YU,
    bpm: 108,
    density: 0.5,
    span: 9,
    gain: 0.55,
    drone: 0.2,
    drum: [1, 0, 0.4, 0, 0.8, 0, 0.5, 0.3, 1, 0, 0.4, 0, 0.8, 0.4, 0.6, 0.5],
    bell: 0.25,
    sustain: 0.993,
  },
  tribulation: {
    root: 174.61,
    scale: YU,
    bpm: 112,
    density: 0.35,
    span: 8,
    gain: 0.55,
    drone: 0.22,
    drum: [1, 0, 0, 0, 0.6, 0, 0, 0, 1, 0, 0.5, 0, 0.7, 0.5, 0.8, 0.9],
    sustain: 0.995,
  },
  meditate: { root: 220.0, scale: GONG, bpm: 50, density: 0.14, span: 6, gain: 0.45, drone: 0.18, bell: 0.5, sustain: 0.998 },
};

const MAX_NOTES = 14;
const LOOKAHEAD = 0.35;

/** Bộ đệm âm dùng chung: dây gảy theo (tần số, độ ngân), trống, chuông. Tạo lười, giữ suốt phiên. */
class Bank {
  private plucks = new Map<string, AudioBuffer>();
  private drumBuf: AudioBuffer | null = null;
  private bellBuf: AudioBuffer | null = null;
  constructor(private c: AudioContext) {}

  /** Karplus-Strong: nhiễu ngắn qua vòng trễ có lọc thông thấp → tiếng dây gảy. */
  pluck(freq: number, sustain: number): AudioBuffer {
    const key = freq.toFixed(2) + ':' + sustain;
    let b = this.plucks.get(key);
    if (b) return b;
    const sr = this.c.sampleRate;
    const len = Math.floor(sr * 2.4);
    b = this.c.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const n = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(n);
    for (let i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const next = ring[(idx + 1) % n];
      const v = 0.5 * (cur + next) * sustain;
      ring[idx] = v;
      // Lọc nhẹ thêm một bậc cho đỡ chói.
      prev = prev + 0.6 * (cur - prev);
      d[i] = prev;
      idx = (idx + 1) % n;
    }
    // Tắt dần ở 0,2 giây cuối để không nghe tiếng "tách" khi hết bộ đệm.
    const tail = Math.floor(sr * 0.2);
    for (let i = 0; i < tail; i++) d[len - 1 - i] *= i / tail;
    this.plucks.set(key, b);
    return b;
  }

  drum(): AudioBuffer {
    if (this.drumBuf) return this.drumBuf;
    const sr = this.c.sampleRate;
    const len = Math.floor(sr * 0.45);
    const b = this.c.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const f = 45 + 85 * Math.exp(-t * 18);
      ph += (2 * Math.PI * f) / sr;
      const body = Math.sin(ph) * Math.exp(-t * 7);
      const skin = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.25;
      d[i] = (body + skin) * 0.9;
    }
    this.drumBuf = b;
    return b;
  }

  /** Chuông đồng: các bồi âm không hòa âm, tắt chậm. */
  bell(): AudioBuffer {
    if (this.bellBuf) return this.bellBuf;
    const sr = this.c.sampleRate;
    const len = Math.floor(sr * 4);
    const b = this.c.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const base = 440;
    const parts: [number, number, number][] = [
      [1, 0.5, 0.8],
      [2.76, 0.25, 1.4],
      [5.4, 0.12, 2.6],
      [8.93, 0.06, 4],
    ];
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let v = 0;
      for (const [r, a, k] of parts) v += Math.sin(2 * Math.PI * base * r * t) * a * Math.exp(-t * k);
      d[i] = v * Math.min(1, t * 400);
    }
    this.bellBuf = b;
    return b;
  }
}

/** Một bài sinh thủ tục đang phát: tự lên lịch nốt trước LOOKAHEAD giây theo đồng hồ AudioContext. */
class Voice {
  readonly g: GainNode;
  private nextT: number;
  private step = 0;
  private degree: number;
  private stopped = false;
  private droneNodes: AudioScheduledSourceNode[] = [];

  constructor(
    private c: AudioContext,
    private bank: Bank,
    readonly track: MusicTrack,
    private s: Style,
    out: AudioNode,
    fade: number,
  ) {
    this.g = c.createGain();
    this.g.gain.value = 0;
    this.g.connect(out);
    const t = c.currentTime;
    this.g.gain.setValueAtTime(0, t);
    this.g.gain.linearRampToValueAtTime(s.gain, t + fade);
    this.nextT = t + 0.05;
    this.degree = Math.floor(s.span / 2);
    if (s.drone > 0) this.startDrone();
  }

  private freqOf(deg: number): number {
    const sc = this.s.scale;
    const oct = Math.floor(deg / sc.length);
    const semi = sc[((deg % sc.length) + sc.length) % sc.length] + 12 * oct;
    return this.s.root * Math.pow(2, semi / 12);
  }

  private startDrone(): void {
    const c = this.c;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const dg = c.createGain();
    dg.gain.value = this.s.drone;
    // Thở chậm cho nền khỏi đều đều.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = c.createGain();
    lfoG.gain.value = this.s.drone * 0.4;
    lfo.connect(lfoG).connect(dg.gain);
    lp.connect(dg).connect(this.g);
    for (const [mul, type] of [
      [0.5, 'sine'],
      [0.75, 'sine'],
      [0.25, 'triangle'],
    ] as [number, OscillatorType][]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = this.s.root * mul;
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(lp);
      o.start();
      this.droneNodes.push(o);
    }
    lfo.start();
    this.droneNodes.push(lfo);
  }

  /** Lên lịch các nốt trong cửa sổ nhìn trước; gọi vài lần mỗi giây. */
  pump(active: { n: number }): void {
    if (this.stopped) return;
    const c = this.c;
    const dt = 60 / this.s.bpm / 2;
    // Tab ẩn lâu làm hụt lịch: nhảy tới hiện tại thay vì dồn một loạt nốt.
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + LOOKAHEAD) {
      const t = this.nextT;
      const i = this.step % 16;
      const drum = this.s.drum?.[i] ?? 0;
      if (drum > 0) this.play(this.bank.drum(), t, 0.55 * drum * (0.85 + Math.random() * 0.3), 1, active);
      if (i === 0 && this.s.bell && Math.random() < this.s.bell) {
        const r = this.freqOf(Math.floor(Math.random() * 3)) / 440;
        this.play(this.bank.bell(), t, 0.12, r, active);
      }
      // Câu nhạc 16 bước: nghỉ ở 2 bước cuối cho có hơi thở.
      if (i < 14 && Math.random() < this.s.density) {
        // Đi bậc liền là chính, thỉnh thoảng nhảy quãng; kéo về giữa tầm.
        const r = Math.random();
        let mv = r < 0.35 ? -1 : r < 0.7 ? 1 : r < 0.85 ? (Math.random() < 0.5 ? -2 : 2) : 0;
        if (this.degree + mv < 0 || this.degree + mv >= this.s.span) mv = -mv;
        this.degree = Math.max(0, Math.min(this.s.span - 1, this.degree + mv));
        const accent = i % 4 === 0 ? 1 : 0.7;
        this.play(this.bank.pluck(this.freqOf(this.degree), this.s.sustain), t, 0.32 * accent, 1, active);
        // Thỉnh thoảng gảy thêm quãng tám dưới cho dày tiếng.
        if (i % 8 === 0 && Math.random() < 0.4) this.play(this.bank.pluck(this.freqOf(this.degree - this.s.scale.length), this.s.sustain), t, 0.2, 1, active);
      }
      this.step++;
      this.nextT += dt * (i % 2 === 0 ? 1.04 : 0.96); // hơi lệch phách cho đỡ máy móc
    }
  }

  private play(buf: AudioBuffer, t: number, vol: number, rate: number, active: { n: number }): void {
    if (active.n >= MAX_NOTES) return;
    const src = this.c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.c.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.g);
    active.n++;
    src.onended = () => {
      active.n--;
      g.disconnect();
    };
    src.start(t);
  }

  stop(fade: number): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.c.currentTime;
    const p = this.g.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(0, t + fade);
    for (const n of this.droneNodes) n.stop(t + fade + 0.05);
    // Để nốt đang ngân tắt hẳn rồi mới gỡ khỏi đồ thị.
    setTimeout(() => this.g.disconnect(), (fade + 2.6) * 1000);
  }
}

class Procedural {
  private bank: Bank | null = null;
  private voice: Voice | null = null;
  private active = { n: 0 };

  get playing(): MusicTrack | null {
    return this.voice?.track ?? null;
  }

  /** Chuyển sang bài `track` (null = tắt). Không có AudioContext/đang tắt tiếng thì chỉ dừng. */
  set(track: MusicTrack | null, fade: number): void {
    if (track === this.playing) return;
    this.voice?.stop(fade);
    this.voice = null;
    if (!track) return;
    const o = musicOutput();
    if (!o) return;
    this.bank ??= new Bank(o.ctx);
    this.voice = new Voice(o.ctx, this.bank, track, STYLES[track], o.out, fade);
  }

  pump(): void {
    if (!this.voice) return;
    // Tắt tiếng giữa chừng: dừng hẳn để không tốn CPU lên lịch nốt câm.
    if (!musicOutput()) {
      this.voice.stop(0.3);
      this.voice = null;
      return;
    }
    this.voice.pump(this.active);
  }
}

// ---------- bộ điều khiển ----------

export interface MusicTick {
  /** Đã vào game (đang ở màn tải thì chưa phát nhạc vùng). */
  active: boolean;
  /** Tên room hiện tại (`world`/`dungeon`). */
  room: string | undefined;
  x: number;
  z: number;
  /** Cờ PF_* của nhân vật mình (0 nếu chưa có). */
  flags: number;
  monsters: Iterable<MonVis>;
}

interface LayerLog {
  t: number;
  zone: StemZone | null;
  level: CombatLevel;
  mix: StemMix;
  /** Lớp có thật sự đang ra tiếng (false khi tắt tiếng hoặc chưa nạp xong stem). */
  audible: boolean;
}

interface LogEntry {
  t: number;
  from: MusicTrack | null;
  to: MusicTrack | null;
  src: 'file' | 'synth' | 'stems' | 'none';
  fade: number;
  reason: string;
}

export class MusicController {
  private dir = new MusicDirector();
  private synth = new Procedural();
  private amb = new AmbientPicker();
  /** Bài đang yêu cầu và nguồn phát đã chọn cho nó. */
  private track: MusicTrack | null = null;
  private src: 'file' | 'synth' | 'stems' | 'none' = 'none';
  private lastInput: MusicInput | null = null;
  private stems = new StemPlayer();
  private level: CombatLevel = 0;
  private layerZone: StemZone | null = null;
  private layerKey = '';
  readonly log: LogEntry[] = [];
  readonly layerLog: LayerLog[] = [];
  private pumpTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Lên lịch nốt bằng setInterval riêng (không theo khung hình) để nhạc đều cả khi FPS tụt.
    this.pumpTimer = setInterval(() => this.synth.pump(), 120);
    if (DEBUG && typeof window !== 'undefined') {
      (window as unknown as { __music?: unknown }).__music = {
        log: this.log,
        layerLog: this.layerLog,
        state: () => ({
          track: this.track,
          src: this.src,
          ambient: this.amb.current,
          combat: this.dir.inCombat,
          boss: this.dir.inBoss,
          input: this.lastInput,
          layers: { zone: this.layerZone, level: this.level, mix: this.layerZone ? mixFor(this.level) : null, stemPlaying: this.stems.playing, stemPos: this.stems.position() },
        }),
      };
    }
  }

  /**
   * Nạp trước nhạc của level sắp vào (E1-D): bài cũ vẫn phát tới khi đổi level xong, tới lúc đó đạo diễn nhạc đổi bài như thường.
   * Chỉ stem (lớp giao chiến, ~50 MB giải mã) cần chờ; bài file stream tự tải khi crossfade. Hết `timeoutMs` thì thôi chờ.
   */
  preloadLevel(tracks: readonly string[], timeoutMs = 4000): Promise<void> {
    const zone = tracks.find((t): t is StemZone => isStemZone(t as MusicTrack) && !!stemSources(t));
    if (!zone || !musicOutput() || this.stems.ready(zone)) return Promise.resolve();
    return new Promise((res) => {
      const timer = setTimeout(res, timeoutMs);
      this.stems.preload(zone, () => {
        clearTimeout(timer);
        res();
      });
    });
  }

  /** Đòn đánh thật giữa mình và quái (`boss` nếu quái đó là boss): vào nhạc chiến đấu ngay. */
  engage(boss: boolean): void {
    this.dir.engage(performance.now() / 1000, boss);
  }

  /** Gọi khoảng 10 lần/giây từ vòng lặp game. */
  tick(now: number, s: MusicTick): void {
    if (!s.active) return;
    let combat = false;
    let boss = false;
    for (const m of s.monsters) {
      const st = m.s?.st;
      if (st !== MS_CHASE && st !== MS_ATTACK) continue;
      const d2 = (m.x - s.x) ** 2 + (m.z - s.z) ** 2;
      if (m.model.def.boss) {
        if (d2 < BOSS_R * BOSS_R) boss = combat = true;
      } else if (d2 < THREAT_R * THREAT_R) combat = true;
      if (boss) break;
    }
    const inp: MusicInput = {
      dungeon: s.room === 'dungeon',
      biome: biomeAt(s.x, s.z),
      level: levelId(),
      rift: levelId() === 'bac_hoang' && riftBlend(s.z - levelTerrain().def.size / 2) > 0.5,
      combat,
      boss,
      tribulation: (s.flags & PF_TRIBULATION) !== 0,
      meditating: (s.flags & PF_MEDITATING) !== 0,
      dead: (s.flags & PF_DEAD) !== 0,
    };
    this.lastInput = inp;
    const amb = this.amb.update(now / 1000, ambientFor(inp.dungeon, inp.biome, isNight()));
    if (amb) {
      playAmbient(amb, 3);
      if (DEBUG) console.info(`[music] âm môi trường → ${amb}`);
    }
    const ch = this.dir.update(now / 1000, inp);
    if (ch) this.apply(ch);
    else if (this.track) this.refresh();
    this.updateLayers(now / 1000);
  }

  /** Vùng có stem cho bài đang yêu cầu: bài vùng, hoặc `combat` thay bài vùng đang áp dụng. null = đường crossfade cũ. */
  private stemZoneFor(track: MusicTrack | null): StemZone | null {
    if (isStemZone(track)) return track;
    if (track === 'combat') {
      const r = this.dir.regionNow;
      return isStemZone(r) ? r : null;
    }
    return null;
  }

  /** Mức giao chiến → âm lượng lớp. Ghi log khi đổi (kể cả khi tắt tiếng, để playtest kiểm máy trạng thái). */
  private updateLayers(now: number): void {
    const zone = this.stemZoneFor(this.track);
    this.layerZone = zone;
    this.level = this.dir.level(now);
    if (!zone) {
      if (this.layerKey !== 'off') this.layerKey = 'off';
      return;
    }
    const mix = mixFor(this.level);
    if (this.stems.playing === zone) this.stems.setMix(mix);
    const key = `${zone}:${this.level}`;
    if (key === this.layerKey) return;
    this.layerKey = key;
    const audible = this.stems.playing === zone;
    this.layerLog.push({ t: Math.round(performance.now()), zone, level: this.level, mix, audible });
    if (this.layerLog.length > 50) this.layerLog.shift();
    if (DEBUG) console.info(`[music] lớp ${zone}: mức ${this.level} → nền ${mix.base} nhịp ${mix.pulse} căng ${mix.edge}${audible ? '' : ' (chưa ra tiếng)'}`);
  }

  private apply(ch: MusicChange): void {
    this.track = ch.to;
    this.route(ch.fade, ch.from, ch.reason);
  }

  /** Manifest tải xong muộn, vừa bật lại tiếng hay mở khóa âm thanh: chọn lại nguồn cho bài hiện tại. */
  private refresh(): void {
    const zone = this.stemZoneFor(this.track);
    if (zone) this.stems.preload(zone, () => this.refresh());
    const want = this.pickSrc();
    if (want === this.src && (want !== 'synth' || this.synth.playing === this.track) && (want !== 'stems' || this.stems.playing === zone)) return;
    this.route(2, this.track, want === this.src ? 'mở lại nhạc sinh thủ tục' : 'đổi nguồn phát');
  }

  private pickSrc(): 'file' | 'synth' | 'stems' | 'none' {
    if (!this.track) return 'none';
    const zone = this.stemZoneFor(this.track);
    if (zone && musicOutput() && this.stems.ready(zone)) return 'stems';
    if (hasMusicFile(this.track)) return 'file';
    return musicOutput() ? 'synth' : 'none';
  }

  private route(fade: number, from: MusicTrack | null, reason: string): void {
    const src = this.pickSrc();
    const zone = this.stemZoneFor(this.track);
    if (zone) this.stems.preload(zone, () => this.refresh());
    if (src === 'stems' && zone) {
      // Bài vùng đang stream cùng vùng thì nối đúng pha của nó; khác bài (ví dụ đang nghe combat) thì từ đầu vòng.
      if (this.stems.playing !== zone) {
        const pos = musicPosition();
        this.stems.start(zone, pos?.id === zone ? pos.time : 0, mixFor(this.dir.level(performance.now() / 1000)), fade);
      }
      this.synth.set(null, fade);
      playMusic(null, fade);
    } else if (src === 'file') {
      this.stems.stop(fade);
      this.synth.set(null, fade);
      playMusic(this.track, fade);
    } else {
      this.stems.stop(fade);
      // Không có file: tắt dần bài stream (nếu có) và phát bài giữ chỗ.
      playMusic(null, fade);
      this.synth.set(src === 'synth' ? this.track : null, fade);
    }
    const prevSrc = this.src;
    this.src = src;
    if (from === this.track) {
      // Cùng bài, chỉ đổi nguồn phát (manifest tải xong, bật lại tiếng): không phải chuyển trạng thái.
      if (DEBUG && prevSrc !== src) console.info(`[music] ${this.track}: nguồn ${prevSrc} → ${src} (${reason})`);
      return;
    }
    const e: LogEntry = { t: Math.round(performance.now()), from, to: this.track, src, fade, reason };
    this.log.push(e);
    if (this.log.length > 50) this.log.shift();
    if (DEBUG) console.info(`[music] ${from ?? '∅'} → ${this.track} (${reason}; ${src}, fade ${fade}s)`);
  }

  dispose(): void {
    clearInterval(this.pumpTimer);
    this.synth.set(null, 1.5);
    this.stems.dispose(1.5);
    playMusic(null, 1.5);
    playAmbient(null, 1.5);
    this.amb.reset();
    this.dir.reset();
    this.track = null;
    this.src = 'none';
  }
}

/** Âm lượng lớp cho mức giao chiến (boss tính như đang đánh khi vẫn ở bộ lớp). */
function mixFor(level: CombatLevel): StemMix {
  return STEM_MIX[level];
}
