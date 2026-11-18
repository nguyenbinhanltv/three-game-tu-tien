/**
 * Cảm giác đòn đánh (K-7), chỉ là lớp trình diễn: bảng hit-stop, rung camera, pitch và lớp âm, cùng hàng đợi theo thời gian
 * game để tiếng và phản ứng trúng đòn rơi đúng khung `hit` của máy trạng thái chiêu (K-4) thay cho `setTimeout`.
 * Hàm ở đây thuần (không đụng DOM/âm thanh) để test; server không đọc gì ở đây.
 */
import type { MonsterDef } from '@dtl/shared';

/** Ngữ cảnh một đòn trúng, suy từ `DmgMsg` và sự kiện `hit` của chiêu. */
export interface HitCtx {
  crit: boolean;
  /** Cờ `hv` của server (đòn nặng). */
  heavy: boolean;
  /** Đòn thứ ba của chuỗi đánh thường (đòn đẩy lùi, `combo` = 2 / `kb`). */
  combo3: boolean;
  /** `power` của chiêu (0 nếu không biết chiêu). */
  power: number;
  /** Chiêu tối thượng. */
  ult: boolean;
  /** Người bị đánh là mình. */
  victimIsMe: boolean;
  /** Người ra đòn là mình. */
  byMe: boolean;
}

export const HIT_STOP = {
  /** Đòn thường (đòn 1, 2 của chuỗi): mục tiêu 40 ms, người đánh không khựng để đánh liên tục không bị dính. */
  light: { target: 0.04, attacker: 0 },
  /** Đòn thứ ba của chuỗi, hoặc chiêu `power` ≥ 2. */
  combo: { target: 0.055, attacker: 0.03 },
  crit: { target: 0.07, attacker: 0.04 },
  /** Bạo kích + đòn nặng, hoặc chiêu tối thượng: mức duy nhất được vượt 70 ms. */
  top: { target: 0.09, attacker: 0.05 },
  /** Mình trúng đòn nặng. */
  victimHeavy: 0.06,
} as const;
/** Trần khựng của mọi thực thể (giây). */
export const HIT_STOP_CAP = HIT_STOP.top.target;

export interface StopPair {
  /** Khựng của người bị đánh (giây, trước hệ số hạng thân). */
  target: number;
  /** Khựng của người ra đòn; chỉ áp khi người ra đòn là mình. */
  attacker: number;
}

/** Bảng hit-stop (mục 7.3 của AUDIT_AND_ROADMAP). Hệ số hạng thân do `HitReact` nhân sau (≤ 1, nên không vượt trần). */
export function hitStopOf(c: HitCtx): StopPair {
  let r: StopPair;
  if (c.ult || (c.crit && c.heavy)) r = { ...HIT_STOP.top };
  else if (c.crit) r = { ...HIT_STOP.crit };
  else if (c.combo3 || c.power >= 2) r = { ...HIT_STOP.combo };
  else r = { ...HIT_STOP.light };
  if (c.victimIsMe && c.heavy) r.target = Math.max(r.target, HIT_STOP.victimHeavy);
  // Người ra đòn khựng chỉ khi đó là mình; người khác đánh nhau không khựng ai (xem `noStop` ở HitReact).
  if (!c.byMe) r.attacker = 0;
  return { target: Math.min(HIT_STOP_CAP, r.target), attacker: Math.min(HIT_STOP_CAP, r.attacker) };
}

/** Mức rung camera (thang của `CameraShake`, quy tắc lấy max) cho đòn của mình trúng / mình trúng đòn; 0 = không rung. */
export const SHAKE_LEVEL = { combo3: 0.12, crit: 0.3, ult: 0.6, victimHeavy: 0.5 } as const;

export function shakeOf(c: HitCtx): number {
  let lv = 0;
  if (c.byMe) {
    if (c.ult) lv = SHAKE_LEVEL.ult;
    else if (c.crit) lv = SHAKE_LEVEL.crit;
    else if (c.combo3) lv = SHAKE_LEVEL.combo3;
  }
  if (c.victimIsMe && c.heavy) lv = Math.max(lv, SHAKE_LEVEL.victimHeavy);
  return lv;
}

/** Phần biên độ rung đi theo hướng đòn ở khung đầu (còn lại là rung ngẫu nhiên). */
export const SHAKE_DIR_SHARE = 0.6;

/** Khoảng pitch ngẫu nhiên cho mọi tiếng đòn: 0,92–1,08 (± 8%). */
export const HIT_PITCH_SPREAD = 0.08;
/** Đòn thứ ba của chuỗi cao hơn một bậc. */
export const COMBO3_PITCH = 1.06;

/** Tốc độ phát (playbackRate) của tiếng đòn. `rnd` ∈ [0, 1) (mặc định `Math.random`). */
export function hitPitch(combo3: boolean, rnd: number = Math.random()): number {
  const base = 1 - HIT_PITCH_SPREAD + rnd * 2 * HIT_PITCH_SPREAD;
  return combo3 ? base * COMBO3_PITCH : base;
}

/** Tiếng vung nhỏ hơn tiếng trúng 6 dB, phát trước `hitAt` 80 ms. */
export const WHOOSH_GAIN = 0.5;
const WHOOSH_LEAD = 0.08;

/** Giây từ lúc nhận tin tới lúc phát tiếng vung (`hitIn` = giây còn lại tới `hitAt`), không âm. */
export function whooshDelay(hitIn: number): number {
  return Math.max(0, hitIn - WHOOSH_LEAD);
}

type Material = 'flesh' | 'stone' | 'metal';

/** Chất liệu thân quái để chọn lớp âm: vượn đá/thổ là đá, hệ kim là kim khí, còn lại là thịt. */
export function materialOf(def: Pick<MonsterDef, 'model' | 'elem'> | undefined): Material {
  if (!def) return 'flesh';
  if (def.elem === 'kim') return 'metal';
  if (def.model === 'ape' || def.elem === 'tho') return 'stone';
  return 'flesh';
}

interface Layer {
  /** Tên SFX có sẵn trong manifest (không thêm asset mới). */
  sfx: 'hit' | 'crit' | 'impact' | 'block' | 'cast';
  /** Âm lượng tương đối so với tiếng trúng chính (1). */
  gain: number;
  rate: number;
}

/** Tổng gain các lớp chồng thêm tối đa: 1 + 0,41 ≈ +3 dB công suất, giữ quy tắc `audio:check` (nhạc ≈ 1/3 đòn đánh). */
export const LAYER_GAIN_CAP = 0.41;

/**
 * Lớp chồng thêm lên tiếng trúng chính theo công pháp, chất liệu mục tiêu và độ mạnh đòn.
 * Bạo kích luôn có lớp kim khí. Kiếm tu: kim khí; hộ pháp: trầm; đan sư: chuông nhẹ; mục tiêu đá: va trầm; kim: kim khí.
 */
export function layersOf(o: { method?: string; material: Material; crit: boolean; strong: boolean }): Layer[] {
  const out: Layer[] = [];
  if (o.crit) out.push({ sfx: 'crit', gain: 0.3, rate: 1.1 });
  if (o.material === 'stone') out.push({ sfx: 'impact', gain: 0.22, rate: 1.15 });
  else if (o.material === 'metal') out.push({ sfx: 'block', gain: 0.2, rate: 1 });
  if (o.method === 'lac_kiem_quyet' && o.strong) out.push({ sfx: 'crit', gain: 0.18, rate: 1.2 });
  else if (o.method === 'bat_dong_kim_than') out.push({ sfx: 'impact', gain: 0.2, rate: 1 });
  else if (o.method === 'thanh_moc_dan_kinh') out.push({ sfx: 'cast', gain: 0.12, rate: 1.3 });
  // Cắt cho tổng không vượt trần.
  let sum = 0;
  const capped: Layer[] = [];
  for (const l of out) {
    const g = Math.min(l.gain, LAYER_GAIN_CAP - sum);
    if (g <= 0.01) break;
    sum += g;
    capped.push({ ...l, gain: g });
  }
  return capped;
}

/** Cận cảnh chiêu tối thượng: đẩy FOV +1,5° trong 80 ms rồi về trong 200 ms. Không chặn điều khiển. */
export const ULT_FOV = { kick: 1.5, rise: 0.08, fall: 0.2 } as const;

/** Độ lệch FOV (độ) sau `t` giây kể từ lúc kích. */
export function ultFovAt(t: number): number {
  if (t <= 0) return 0;
  if (t < ULT_FOV.rise) return (t / ULT_FOV.rise) * ULT_FOV.kick;
  const u = (t - ULT_FOV.rise) / ULT_FOV.fall;
  return u >= 1 ? 0 : (1 - u) * ULT_FOV.kick;
}

/**
 * Hàng đợi việc trình diễn chờ khung `hit` của người ra đòn. Việc vào hàng khi tin (sát thương) tới trước lúc hoạt ảnh tới
 * `hitAt`; `hit` của đúng người đó xả hàng (cùng khung), còn không có `hit` thì xả khi quá hạn theo đồng hồ game
 * (đẩy bằng `tick(dt)` mỗi khung, nên bước khung tay hay tab ẩn không lệch nhịp như `setTimeout`).
 */
export class HitQueue<T> {
  private items: { sid: string; due: number; job: T }[] = [];
  private now = 0;

  get size(): number {
    return this.items.length;
  }

  /** Xếp `job` của người ra đòn `sid`; quá `maxWait` giây (đồng hồ game) mà chưa có `hit` thì xả. */
  push(sid: string, job: T, maxWait: number): void {
    this.items.push({ sid, due: this.now + maxWait, job });
  }

  /** Có việc đang chờ của `sid`. */
  has(sid: string): boolean {
    return this.items.some((i) => i.sid === sid);
  }

  /** Xả mọi việc đang chờ của `sid` (khi `hit` phát ra). */
  release(sid: string): T[] {
    const out: T[] = [];
    this.items = this.items.filter((i) => {
      if (i.sid !== sid) return true;
      out.push(i.job);
      return false;
    });
    return out;
  }

  /** Đẩy đồng hồ game `dt` giây; trả các việc quá hạn. */
  tick(dt: number): T[] {
    this.now += dt;
    if (!this.items.length) return [];
    const out: T[] = [];
    this.items = this.items.filter((i) => {
      if (i.due > this.now) return true;
      out.push(i.job);
      return false;
    });
    return out;
  }

  clear(): void {
    this.items = [];
  }
}

/** Dư thêm (giây) sau `hitAt` dự kiến, đủ cho hit-stop (≤ 90 ms) làm đồng hồ animation chậm lại. */
export const SWING_MARGIN = 0.15;

/**
 * Người ra đòn đang vung (đã `windup`, chưa tới `hitAt`). Tự hết hạn thay vì chờ sự kiện kết thúc: nhiều đường dừng hoạt ảnh
 * (ngã `knockdown`, bị chặn khi chết/bay, thực thể bị gỡ) không phát `hit`/`cancel`/`end`, và cờ treo sẽ làm trễ mọi sát thương sau đó.
 */
export class SwingGuard {
  private until = new Map<string, number>();

  /** `hitIn` giây (đồng hồ animation) tới `hitAt`; `nowMs` theo `performance.now()`. */
  begin(sid: string, hitIn: number, nowMs: number): void {
    this.until.set(sid, nowMs + (Math.max(0, hitIn) + SWING_MARGIN) * 1000);
    if (this.until.size > 64) for (const [k, v] of this.until) if (v <= nowMs) this.until.delete(k);
  }

  active(sid: string, nowMs: number): boolean {
    const d = this.until.get(sid);
    if (d === undefined) return false;
    if (d <= nowMs) {
      this.until.delete(sid);
      return false;
    }
    return true;
  }

  delete(sid: string): void {
    this.until.delete(sid);
  }
}

/** Nhật ký hit → âm (bản dev): độ lệch giữa khung `hit` của hoạt ảnh và lúc đặt lịch tiếng. */
export interface HitSoundLog {
  skill: string;
  index: number;
  /** `performance.now()` lúc sự kiện `hit` phát. */
  eventAt: number;
  /** `performance.now()` lúc gọi phát tiếng trúng. */
  soundAt: number;
  /** Độ lệch (ms) = soundAt − eventAt. */
  lagMs: number;
  /** true: sát thương tới trước khung `hit` nên tiếng xả đúng khung đó (lệch < 1 khung); false: tin tới sau khung `hit` (độ trễ mạng, phát ngay khi tới). */
  synced: boolean;
  /** Tiếng chính, pitch và các lớp chồng. */
  sfx: string;
  rate: number;
  layers: string[];
}
