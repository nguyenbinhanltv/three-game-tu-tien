import { MS_DEAD, PF_DEAD, PF_FLYING, PF_MEDITATING } from '@dtl/shared';
import type { Sfx } from './audio';
import { type Surface, surfaceAt, SURFACES } from '../world/surface';

/**
 * Bước chân theo chất liệu mặt đất (P2-D3) cho mình, người chơi khác và quái ở gần.
 *
 * Nhịp bước theo quãng đường đi được (không theo thời gian) nên khớp bước chân của hoạt ảnh ở mọi tốc độ và
 * đứng yên thì im. Bước chân của người khác bị giới hạn: chỉ trong `HEAR` mét, tối đa `PER_FRAME` bước mỗi khung và `WINDOW_MAX`
 * bước trong mỗi `WINDOW_MS`, ưu tiên nguồn gần hơn; bước của mình luôn được phát.
 */
export const HEAR = 26;
export const PER_FRAME = 3;
const WINDOW_MS = 120;
export const WINDOW_MAX = 5;
/** Tốc độ (m/s) dưới mức này coi là đứng yên (nội suy vị trí của người/quái khác luôn có nhiễu nhỏ). */
const MOVE_MIN = 0.7;
/** Bước nhảy vị trí (m) trong một khung lớn hơn mức này là dịch chuyển, không tính vào quãng đường. */
const TELEPORT = 8;

const SURFACE_SFX: Record<Surface, Sfx> = {
  stone: 'step_stone',
  grass: 'step_grass',
  dirt: 'step_dirt',
  sand: 'step_sand',
  wood: 'step_wood',
  water: 'step_water',
};

/** Bước dài hơn khi chạy nhanh (ngự kiếm sát đất không tính: đang bay thì không có bước). */
export function strideFor(speed: number): number {
  return 1.5 + Math.min(speed, 9) * 0.1;
}

/** Bộ đếm bước theo quãng đường của một thực thể. */
export class StepClock {
  private lx = NaN;
  private lz = NaN;
  private dist = 0;
  /** Khoảng còn thiếu tới bước kế tiếp được đặt nửa sải đầu để chân đầu tiên không bị trễ cả sải. */
  private started = false;

  /** Cập nhật vị trí; trả số bước đã tới hạn (0 hoặc 1 với khung bình thường). `walking` false thì chỉ ghi vị trí. */
  advance(x: number, z: number, speed: number, walking: boolean): number {
    const dx = x - this.lx;
    const dz = z - this.lz;
    this.lx = x;
    this.lz = z;
    if (!walking) {
      this.started = false;
      this.dist = 0;
      return 0;
    }
    if (Number.isNaN(dx)) return 0;
    const d = Math.hypot(dx, dz);
    if (d > TELEPORT) return 0;
    if (!this.started) {
      this.started = true;
      this.dist = strideFor(speed) * 0.5;
    }
    this.dist += d;
    const stride = strideFor(speed);
    if (this.dist < stride) return 0;
    this.dist -= stride;
    // Khung rất dài (tab nền) có thể thiếu nhiều sải: chỉ phát một bước, không dồn.
    if (this.dist > stride) this.dist = 0;
    return 1;
  }
}

/** Âm lượng bước theo khoảng cách (m): mình cố định, người khác giảm dần tới 0 ở `HEAR`. */
export function stepVolume(dist: number, local: boolean, monster: boolean): number {
  if (local) return 0.6;
  const f = Math.max(0, 1 - dist / HEAR);
  return (monster ? 0.38 : 0.34) * f * f;
}

interface PlayerV {
  x: number;
  z: number;
  speed: number;
  s: { fl: number; gr?: boolean };
}
interface MonV {
  x: number;
  z: number;
  speed: number;
  s: { st: number };
}
interface WalkerSource {
  players: Map<string, PlayerV & { local?: boolean }>;
  monsters: Map<string, MonV>;
}

interface Pending {
  local: boolean;
  x: number;
  z: number;
  d: number;
  monster: boolean;
  surface: Surface;
}

export class FootstepDriver {
  private clocks = new Map<string, StepClock>();
  private seen = new Set<string>();
  private recent: number[] = [];
  private cand: Pending[] = [];
  /** Số bước đã quyết định phát theo chất liệu (kể cả khi tắt tiếng), và số bước bị giới hạn bỏ. */
  readonly stats = { played: 0, dropped: 0, local: 0, other: 0, by: Object.fromEntries(SURFACES.map((s) => [s, 0])) as Record<Surface, number>, last: null as null | { surface: Surface; local: boolean; x: number; z: number } };
  private logged = new Set<string>();

  /**
   * `play` phát một SFX (engine truyền `sfx` của audio.ts, test truyền bản giả; không import audio.ts ở đây để test không cần Web Audio).
   * `onLog` ghi dòng nhật ký lần đầu mỗi cặp (chất liệu, loại nguồn).
   */
  constructor(
    private level: 'van_lam' | 'kiem_trung',
    private play: (name: Sfx, volume: number, at: { x: number; z: number } | undefined) => void,
    private onLog: (msg: string) => void = () => {},
  ) {}

  /**
   * Gọi mỗi khung sau khi thực thể đã cập nhật vị trí. `me` = vị trí người chơi (để xếp khoảng cách), `mySid` = id của mình,
   * `localAirborne` = mình đang nhảy/ngự kiếm (không có bước chân).
   */
  update(src: WalkerSource, mySid: string, me: { x: number; z: number }, localAirborne: boolean, now = performance.now()): void {
    this.seen.clear();
    this.cand.length = 0;
    for (const [sid, v] of src.players) {
      const local = sid === mySid;
      const key = 'p' + sid;
      this.seen.add(key);
      const fl = v.s.fl;
      const grounded = local ? !localAirborne : v.s.gr !== false;
      const walking = v.speed > MOVE_MIN && grounded && (fl & (PF_FLYING | PF_DEAD | PF_MEDITATING)) === 0;
      this.tick(key, v, walking, local, false, me);
    }
    for (const [id, v] of src.monsters) {
      const key = 'm' + id;
      this.seen.add(key);
      this.tick(key, v, v.speed > MOVE_MIN && v.s.st !== MS_DEAD, false, true, me);
    }
    for (const k of this.clocks.keys()) if (!this.seen.has(k)) this.clocks.delete(k);
    this.flush(now);
  }

  private tick(key: string, v: { x: number; z: number; speed: number }, walking: boolean, local: boolean, monster: boolean, me: { x: number; z: number }): void {
    let c = this.clocks.get(key);
    if (!c) this.clocks.set(key, (c = new StepClock()));
    const d = Math.hypot(v.x - me.x, v.z - me.z);
    // Xa quá thì không tính nhịp cho đỡ tốn (vẫn cập nhật vị trí để khi lại gần không bị nhảy cóc).
    if (!local && d > HEAR) {
      c.advance(v.x, v.z, v.speed, false);
      return;
    }
    if (c.advance(v.x, v.z, v.speed, walking) > 0) this.cand.push({ local, x: v.x, z: v.z, d: local ? 0 : d, monster, surface: surfaceAt(v.x, v.z, this.level) });
  }

  private flush(now: number): void {
    if (!this.cand.length) return;
    // Gần trước; mình (d = 0) luôn đứng đầu.
    this.cand.sort((a, b) => a.d - b.d);
    while (this.recent.length && now - this.recent[0] > WINDOW_MS) this.recent.shift();
    let others = 0;
    for (const p of this.cand) {
      const local = p.local;
      if (!local && (others >= PER_FRAME || this.recent.length >= WINDOW_MAX)) {
        this.stats.dropped++;
        continue;
      }
      if (!local) {
        others++;
        this.recent.push(now);
      }
      this.emit(p, local);
    }
  }

  private emit(p: Pending, local: boolean): void {
    const name = SURFACE_SFX[p.surface];
    this.stats.played++;
    this.stats.by[p.surface]++;
    this.stats[local ? 'local' : 'other']++;
    this.stats.last = { surface: p.surface, local, x: p.x, z: p.z };
    const tag = `${p.surface}${local ? ':mình' : p.monster ? ':quái' : ':người'}`;
    if (!this.logged.has(tag)) {
      this.logged.add(tag);
      this.onLog(`bước chân ${tag} → ${name} tại (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
    }
    // Nơi gọi phát không qua bộ chặn 45 ms theo tên: nhiều chân cùng chất liệu vẫn nghe được, số nguồn đã giới hạn ở đây.
    this.play(name, stepVolume(p.d, local, p.monster), local ? undefined : { x: p.x, z: p.z });
  }
}
