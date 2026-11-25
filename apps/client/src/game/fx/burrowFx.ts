// Chui đất / trồi lên của quái (chiêu `burrow` E1-E, ví dụ Thôn Mạch Ngô Công Vương), CHỈ lớp hiển thị client:
//   1) chui xuống: đất nứt dưới đầu, bụi đất bốc, thân THỤT dần xuống mặt đất (hạ y) rồi biến mất;
//   2) dưới đất: ụ đất chạy (đất tung + bụi dọc đường) từ chỗ chui tới điểm trồi lên (vạch `burrow` đầu tiên của server);
//   3) báo trước trồi lên: mặt đất phồng/nứt, đất đá bắn nhẹ ở điểm trồi;
//   4) trồi lên: thân nhô lên từ mặt đất, đất đá bắn tung + bụi + vết nứt.
// Không đổi luật chơi: server quyết vị trí/thời điểm (cờ MF_BURROW bật/tắt, vị trí trồi = vạch `burrow` đầu); đây chỉ là đồ họa theo cờ đó.
// Màu đất/bụi nâu-xám (không đỏ/cam: đỏ dành cho vạch báo). Hàm tính (độ sâu, ụ đất) là hàm thuần, có test.

import { PARTICLES } from '../../render/vfx/particles';
import type { Vfx } from './vfx';

export const BURROW = {
  /** Thời gian thân thụt xuống (s). */
  sink: 0.5,
  /** Thời gian thân trồi lên (s). */
  rise: 0.45,
  /** Báo trước trồi lên: mặt đất phồng trong khoảng này trước lúc trồi (s). */
  bulge: 0.8,
  /** Độ sâu thụt (nhân chiều cao thân): đủ chìm hẳn. */
  depthMul: 1.2,
  /** Dưới ngưỡng này thân còn thấy; từ ngưỡng trở lên coi như đã chìm hẳn (ẩn). */
  hiddenAt: 0.98,
  /** Quá thời gian này mà server chưa tắt cờ thì thôi (an toàn, s). */
  max: 8,
} as const;

const ease = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

export interface Dive {
  id: string;
  /** Giây kể từ lúc chui. */
  t: number;
  /** Giây kể từ lúc cờ tắt (trồi lên); -1 = chưa. */
  rising: number;
  /** Thời gian chui dự kiến (s, = `hide` của chiêu) để canh ụ đất và báo trước. */
  hide: number;
  from: { x: number; z: number };
  to: { x: number; z: number };
  /** Phòng thử: không có server dịch chuyển thân, nên client tự đặt thân ở `to` lúc dưới đất/trồi lên. */
  move: boolean;
  /** Phòng thử: tự trồi lên khi hết `hide`. */
  auto: boolean;
  /** Đã phát vết nứt lúc chui/trồi chưa. */
  diveFx: boolean;
  riseFx: boolean;
  mound: number;
  scar: number;
}

/** Độ chìm 0 (nổi hẳn) … 1 (chìm hẳn) của một lần chui. */
export function depthOf(d: Pick<Dive, 't' | 'rising'>): number {
  if (d.rising >= 0) return 1 - ease(clamp01(d.rising / BURROW.rise));
  return ease(clamp01(d.t / BURROW.sink));
}

/** Vị trí ụ đất chạy dưới mặt đất: đi từ `from` tới `to` trong khoảng sau khi chìm hẳn tới lúc báo trước trồi lên. null nếu chưa/đã hết. */
export function moundPos(d: Pick<Dive, 't' | 'hide' | 'from' | 'to' | 'rising'>): { x: number; z: number; u: number } | null {
  if (d.rising >= 0) return null;
  const t0 = BURROW.sink * 0.8;
  const t1 = Math.max(t0 + 0.2, d.hide);
  if (d.t < t0 || d.t > t1) return null;
  const u = clamp01((d.t - t0) / (t1 - t0));
  return { x: d.from.x + (d.to.x - d.from.x) * u, z: d.from.z + (d.to.z - d.from.z) * u, u };
}

/** Đang trong khoảng báo trước trồi lên (mặt đất phồng ở điểm trồi). */
export function bulging(d: Pick<Dive, 't' | 'hide' | 'rising'>): boolean {
  return d.rising < 0 && d.t >= d.hide - BURROW.bulge;
}

/** Thân còn thấy không (chưa chìm hẳn). */
export const visibleAt = (depth: number): boolean => depth < BURROW.hiddenAt;

const DIRT = 0x8a6a3a;
const DIRT_DARK = 0x4f3d2a;
const DUST = 0xb4a68c;

export class BurrowFx {
  private readonly dives = new Map<string, Dive>();
  /** Vạch `burrow` đầu tiên server vừa gửi cho từng quái = điểm trồi lên. */
  private readonly spots = new Map<string, { x: number; z: number; hide: number; at: number }>();

  /** Gọi khi nhận vạch `burrow`: chỉ giữ vạch đầu của mỗi đợt (3 vạch cùng lúc), vạch đầu là chỗ quái trồi lên. */
  noteHazard(src: string, x: number, z: number, hide: number, nowMs: number): void {
    const o = this.spots.get(src);
    if (o && nowMs - o.at < 400) return;
    this.spots.set(src, { x, z, hide, at: nowMs });
  }

  /** Cờ MF_BURROW bật: quái chui xuống tại (x, z). */
  start(
    id: string,
    x: number,
    z: number,
    nowMs: number,
    opt: { move?: boolean; auto?: boolean; to?: { x: number; z: number }; hide?: number } = {},
  ): void {
    const sp = this.spots.get(id);
    const fresh = sp && nowMs - sp.at < 5000 ? sp : undefined;
    this.dives.set(id, {
      id,
      t: 0,
      rising: -1,
      hide: opt.hide ?? fresh?.hide ?? 2,
      from: { x, z },
      to: opt.to ?? (fresh ? { x: fresh.x, z: fresh.z } : { x, z }),
      move: !!opt.move,
      auto: !!opt.auto,
      diveFx: false,
      riseFx: false,
      mound: 0,
      scar: 0,
    });
    this.spots.delete(id);
  }

  /** Cờ MF_BURROW tắt: quái trồi lên. Không có lần chui đang chạy thì bỏ qua (vd. vào tầm nhìn khi đã chui xong). */
  finish(id: string): void {
    const d = this.dives.get(id);
    if (d && d.rising < 0) d.rising = 0;
  }

  /** Độ chìm hiện tại, undefined nếu quái không đang chui/trồi (dùng đường hiển thị thường). */
  depth(id: string): number | undefined {
    const d = this.dives.get(id);
    return d ? depthOf(d) : undefined;
  }

  /** Phòng thử: chỗ đặt thân (client tự dịch chuyển), null nếu server lo. */
  override(id: string): { x: number; z: number } | null {
    const d = this.dives.get(id);
    return d && d.move && (d.t >= BURROW.sink || d.rising >= 0) ? d.to : null;
  }

  /** Ai đang chui (để vòng khung kiểm nhanh). */
  active(): boolean {
    return this.dives.size > 0;
  }

  update(dt: number, v: Vfx, groundAt: (x: number, z: number) => number): void {
    for (const [id, d] of this.dives) {
      if (d.rising < 0) {
        d.t += dt;
        if (d.auto && d.t >= d.hide) d.rising = 0;
        else if (d.t > BURROW.max) d.rising = 0;
      } else d.rising += dt;
      if (d.rising >= BURROW.rise) {
        this.dives.delete(id);
        continue;
      }
      const gy = (x: number, z: number) => groundAt(x, z);
      // 1) chui xuống: vết nứt + bụi đất bốc + đất tung quanh đầu
      if (d.rising < 0 && d.t < BURROW.sink * 1.2) {
        if (!d.diveFx) {
          d.diveFx = true;
          v.inkSplat(d.from.x, d.from.z, 2.4, undefined, undefined, 1, 0.7, 0.8);
          this.debris(d.from.x, gy(d.from.x, d.from.z), d.from.z, 44, 5.5, 1.3);
        }
        if (d.t < BURROW.sink) this.dust(d.from.x, gy(d.from.x, d.from.z), d.from.z, 5, 2.0, 1.8);
      }
      // 2) ụ đất chạy dưới mặt đất
      const m = moundPos(d);
      if (m) {
        d.mound += dt;
        d.scar += dt;
        while (d.mound > 0.04) {
          d.mound -= 0.04;
          const y = gy(m.x, m.z);
          this.dust(m.x, y, m.z, 3, 1.2, 1.1);
          this.debris(m.x, y, m.z, 6, 2.6, 0.9);
        }
        if (d.scar > 0.22) {
          d.scar = 0;
          v.inkSplat(m.x, m.z, 1.1, undefined, undefined, 1.4, 0.55, 0.8); // vệt đất nứt tối dọc đường ụ đất chạy
        }
      }
      // 3) báo trước trồi lên: mặt đất phồng, đất đá nhích lên ở điểm trồi
      if (bulging(d)) {
        const k = clamp01((d.t - (d.hide - BURROW.bulge)) / BURROW.bulge);
        const y = gy(d.to.x, d.to.z);
        this.dust(d.to.x, y, d.to.z, 1 + Math.round(k * 3), 1.4 + k, 0.9 + k * 0.8);
        if (Math.random() < dt * (6 + 14 * k)) this.debris(d.to.x, y, d.to.z, 2, 2.5 + 2 * k, 0.6);
      }
      // 4) trồi lên: nứt toạc + đất đá bắn lên + bụi
      if (d.rising >= 0 && !d.riseFx) {
        d.riseFx = true;
        const x = d.to.x;
        const z = d.to.z;
        v.inkSplat(x, z, 3.2, undefined, undefined, 1, 0.75, 0.8);
        this.debris(x, gy(x, z), z, 70, 8, 1.6);
        this.dust(x, gy(x, z), z, 22, 3.6, 2.6);
      }
      if (d.rising >= 0 && d.rising < BURROW.rise * 0.8) this.dust(d.to.x, gy(d.to.x, d.to.z), d.to.z, 2, 1.8, 1.6);
    }
  }

  /** Mảnh đất đá bắn lên và rơi xuống (nâu), `n` hạt, tốc độ ngang ~`sp`, cao ~`up`. */
  private debris(x: number, y: number, z: number, n: number, sp: number, up: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = sp * (0.35 + Math.random() * 0.65);
      PARTICLES.emit(
        'dust',
        x,
        y + 0.2,
        z,
        Math.cos(a) * s * 0.6,
        (2 + Math.random() * 4) * up,
        Math.sin(a) * s * 0.6,
        0.6 + Math.random() * 0.5,
        0.3 + Math.random() * 0.26,
        0.14,
        Math.random() < 0.5 ? DIRT : DIRT_DARK,
        0.95,
        14,
        0.4,
      );
    }
  }

  /** Bụi nâu xám bốc lên và tản ra. */
  private dust(x: number, y: number, z: number, n: number, sp: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = sp * (0.3 + Math.random() * 0.7);
      PARTICLES.emit(
        'dust',
        x + (Math.random() - 0.5) * 0.6,
        y + 0.15,
        z + (Math.random() - 0.5) * 0.6,
        Math.cos(a) * s * 0.5,
        0.8 + Math.random() * 1.6,
        Math.sin(a) * s * 0.5,
        0.7 + Math.random() * 0.5,
        0.5 * size,
        1.5 * size,
        DUST,
        0.85,
        -0.4,
        1.2,
      );
    }
  }
}
