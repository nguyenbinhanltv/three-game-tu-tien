// Hình TRẠNG THÁI kéo dài trên quái/người (Họa Pháp Lô 2, PR2): làm chậm, độc, bỏng, choáng (quái) và hồi dần (người).
// Server chỉ gửi bit hiển thị (`MF_SLOW/MF_POISON/MF_BURN/MF_DAZED` ở `MonS.mf`, `PF_HOT` ở `PlayerS.fl`), suy ra từ trạng thái server, KHÔNG ảnh hưởng luật.
// Cách vẽ: timeline ngắn (≈1 s, sinh bởi `tools/vfx-forge/trung-don.mjs`, khóa `fx_st_*`) bám theo thực thể (`follow`), phát lại khi còn cờ.
// Ngân sách: mỗi thực thể ≤ 1 trạng thái (ưu tiên cao nhất), tối đa `STATUS_MAX_ENTS` thực thể gần camera nhất, bỏ phần của người khác khi đông.

import { FX_TIMELINE } from '@dtl/content';
import {
  MF_BURN,
  MF_DAZED,
  MF_FACE,
  MF_FACE_T,
  MF_POISON,
  MF_REAL,
  MF_REFLECT,
  MF_SENSED,
  MF_SLOW,
  MF_WEAK,
  PF_DEAD,
  PF_HOT,
  PF_SHIELD,
} from '@dtl/shared';
import type { FxCaster, FxRunner } from './fxTimeline';
import { OTHERS_FX_LIVE_MAX } from './fxBudget';

/** Tối đa thực thể có hình trạng thái cùng lúc (gần camera nhất). */
export const STATUS_MAX_ENTS = 8;
/** Xa hơn mức này (m, tới camera) thì không vẽ. */
export const STATUS_DIST = 45;
/** Nhịp quét (giây). */
const SCAN_EVERY = 0.2;

/**
 * Loại trạng thái hiển thị. Nhóm 2a (cờ quái mở rộng): `yin` (mặt Âm, không đánh được), `reflect` (phản đòn), `weak` (lộ yếu điểm), `yang` (mặt Dương, dễ tổn thương),
 * `sensed` (bị thần thức soi), `real` (thể thật Kính Nguyệt); người: `ward` (hộ thể/khiên, `PF_SHIELD`).
 */
export type StatusKind = 'yin' | 'reflect' | 'stun' | 'weak' | 'yang' | 'sensed' | 'burn' | 'poison' | 'slow' | 'real' | 'ward' | 'hot';

/** Timeline, bảng màu và chu kỳ phát lại (giây) của từng trạng thái; mảng thứ tự = ưu tiên (đứng trước thắng). */
export const STATUS_DEF: Record<StatusKind, { key: string; pal: string; period: number }> = {
  stun: { key: 'fx_st_stun', pal: 'hit_chung', period: 0.9 },
  burn: { key: 'fx_st_burn', pal: 'st_burn', period: 1.0 },
  poison: { key: 'fx_st_poison', pal: 'st_poison', period: 1.1 },
  slow: { key: 'fx_st_slow', pal: 'hit_guard', period: 1.0 },
  hot: { key: 'fx_st_hot', pal: 'hit_heal', period: 1.2 },
  yin: { key: 'fx_st_yin', pal: 'st_yin', period: 1.1 },
  reflect: { key: 'fx_st_reflect', pal: 'hit_guard', period: 1.0 },
  weak: { key: 'fx_st_weak', pal: 'st_gold', period: 1.0 },
  yang: { key: 'fx_st_yang', pal: 'st_gold', period: 1.0 },
  sensed: { key: 'fx_st_sensed', pal: 'st_gold', period: 1.1 },
  real: { key: 'fx_st_real', pal: 'env_gate', period: 1.2 },
  ward: { key: 'fx_st_ward', pal: 'hit_guard', period: 1.0 },
};

/** Hết khiên (cờ `PF_SHIELD` rơi, vỡ hoặc hết giờ): mảnh mai rùa vỡ tản ra, một lần. */
export const WARD_END_KEY = 'fx_st_ward_end';

/** Trạng thái hiển thị ưu tiên cao nhất của một quái từ `mf`; undefined nếu không có. */
export function monStatusOf(mf: number): StatusKind | undefined {
  // Bit riêng cho choáng THẬT: `MF_STUN` còn bật cho khựng/ngã 350 ms của đòn nặng, không được vẽ đốm choáng.
  // Ưu tiên theo điều người chơi cần biết ngay: mặt Âm (không đánh được) > phản đòn (đừng đánh) > choáng > yếu điểm / mặt Dương (đánh mạnh) > bị soi > DoT > chậm > thể thật.
  if (mf & MF_FACE) return 'yin';
  if (mf & MF_REFLECT) return 'reflect';
  if (mf & MF_DAZED) return 'stun';
  if (mf & MF_WEAK) return 'weak';
  if (mf & MF_FACE_T) return 'yang';
  if (mf & MF_SENSED) return 'sensed';
  if (mf & MF_BURN) return 'burn';
  if (mf & MF_POISON) return 'poison';
  if (mf & MF_SLOW) return 'slow';
  if (mf & MF_REAL) return 'real';
  return undefined;
}

/** Trạng thái hiển thị của một người từ `fl`. */
export function playerStatusOf(fl: number): StatusKind | undefined {
  if (fl & PF_DEAD) return undefined;
  if (fl & PF_SHIELD) return 'ward';
  return fl & PF_HOT ? 'hot' : undefined;
}

export interface StatusEnt {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Hệ số cỡ theo thân (người = 1). */
  scale: number;
  kind: StatusKind;
  mine: boolean;
  /** Đối tượng sống (vị trí cập nhật mỗi khung) để timeline `follow`. */
  actor: FxCaster;
}

interface StatusEnv {
  camera(): { position: { x: number; z: number } };
  live(): number;
  /** Mọi thực thể đang có trạng thái hiển thị (đã lọc bỏ quái chết). */
  entities(): Iterable<StatusEnt>;
}

export class StatusFx {
  private next = new Map<string, number>();
  /** Người đang có khiên ở lượt quét trước (để biết khi nào khiên vỡ/hết). */
  private wards = new Map<string, StatusEnt>();
  private acc = 0;
  private clock = 0;
  /** Phòng thử (`?vfxlab=1`): bỏ quét theo cờ, chỉ `labPlay`. */
  lab = false;
  /** Nhật ký dev: `__game.statusFx.log`. */
  readonly log: { kind: StatusKind; id: string; at: number }[] = [];

  constructor(
    private runner: FxRunner,
    private env: StatusEnv,
  ) {}

  update(dt: number): void {
    this.clock += dt;
    this.acc += dt;
    if (this.acc < SCAN_EVERY) return;
    this.acc = 0;
    if (this.lab) return;
    const c = this.env.camera().position;
    const cand: { e: StatusEnt; d: number }[] = [];
    const wardNow = new Map<string, StatusEnt>();
    for (const e of this.env.entities()) {
      const d = Math.hypot(e.x - c.x, e.z - c.z);
      if (d > STATUS_DIST) continue;
      cand.push({ e, d });
      if (e.kind === 'ward') wardNow.set(e.id, e);
    }
    // Khiên vừa hết/vỡ: mảnh mai rùa tản ra một lần ở chỗ cuối cùng.
    for (const [id, e] of this.wards) if (!wardNow.has(id)) this.playEnd(e);
    this.wards = wardNow;
    if (!cand.length) {
      if (this.next.size) this.next.clear();
      return;
    }
    cand.sort((a, b) => a.d - b.d);
    const crowded = this.env.live() >= OTHERS_FX_LIVE_MAX;
    for (const { e } of cand.slice(0, STATUS_MAX_ENTS)) {
      if (crowded && !e.mine) continue;
      this.play(e, false);
    }
    // Dọn mốc của thực thể không còn trạng thái.
    if (this.next.size > 64) for (const [k, at] of this.next) if (this.clock - at > 5) this.next.delete(k);
  }

  private playEnd(e: StatusEnt): void {
    const tl = FX_TIMELINE.get(WARD_END_KEY);
    if (!tl) return;
    if (!e.mine && this.env.live() >= OTHERS_FX_LIVE_MAX) return;
    this.runner.startAt(tl, {
      actor: e.actor,
      palette: STATUS_DEF.ward.pal,
      tgt: { x: e.x, y: e.y, z: e.z, chest: 1.15 * e.scale },
      mul: Math.min(1.6, Math.max(0.8, e.scale)),
      mine: e.mine,
    });
  }

  /** Phát một lượt nếu đã tới chu kỳ (hoặc `force`: phòng thử). */
  play(e: StatusEnt, force: boolean): boolean {
    const def = STATUS_DEF[e.kind];
    const tl = FX_TIMELINE.get(def.key);
    if (!tl) return false;
    const k = e.id + ':' + e.kind;
    if (!force && this.clock < (this.next.get(k) ?? 0)) return false;
    this.next.set(k, this.clock + def.period);
    this.runner.startAt(tl, {
      actor: e.actor,
      palette: def.pal,
      tgt: { x: e.x, y: e.y, z: e.z, chest: 1.15 * e.scale },
      mul: Math.min(1.6, Math.max(0.8, e.scale)),
      mine: e.mine,
    });
    if (import.meta.env.DEV) {
      this.log.push({ kind: e.kind, id: e.id, at: performance.now() });
      if (this.log.length > 200) this.log.shift();
    }
    return true;
  }
}
