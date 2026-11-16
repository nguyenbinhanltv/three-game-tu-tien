/**
 * Thẻ chương (C2): letterbox mỏng + tiêu đề + phụ đề một dòng cho sự kiện cá nhân (vào bí cảnh, độ kiếp
 * của mình, lần đầu tới Lạc Kiếm Tông). Chỉ là lớp hình: không khóa input, không gửi gì lên server.
 * Phần thuần (preset, khung camera, cờ đã xem) tách ở đây để test được không cần renderer.
 */

export type ChapterKind = 'sect' | 'dungeon' | 'trib' | 'ascend' | 'ascend_kd' | 'ch2' | 'fly';

export interface ChapterPreset {
  /** Thẻ hiện bao lâu (ms). */
  card: number;
  /** Khung camera: nhân khoảng cách, cộng góc ngẩng (rad), tổng thời gian (giây). */
  dist: number;
  pitch: number;
  cam: number;
}

/**
 * Tông môn kéo lùi và nâng cao để thấy sơn môn; bí cảnh lùi nhẹ; độ kiếp hạ thấp camera để thấy mây kiếp
 * trên đầu. Độ lệch nhỏ: đủ cảm giác "đóng khung", không đổi hướng nhìn (yaw) nên W vẫn đi đúng hướng.
 */
export const CHAPTER: Record<ChapterKind, ChapterPreset> = {
  sect: { card: 3000, dist: 1.3, pitch: 0.1, cam: 2.4 },
  dungeon: { card: 2800, dist: 1.2, pitch: 0.06, cam: 2.2 },
  trib: { card: 2800, dist: 1.25, pitch: -0.14, cam: 2.2 },
  /** Ngự kiếm lần đầu: giữ camera như cũ (hạ thấp góc nhìn thì vệt phi kiếm thành cột sáng chắn màn hình). */
  fly: { card: 3000, dist: 1.0, pitch: 0.06, cam: 2.6 },
  /** Đột phá thành công: ngẩng lên trời quang sau mây kiếp. */
  ascend: { card: 3000, dist: 1.15, pitch: -0.04, cam: 3 },
  /** Kết Đan: như đột phá thường nhưng kéo lùi hơn để thấy vòng đan quang quanh người. */
  ascend_kd: { card: 3200, dist: 1.3, pitch: -0.02, cam: 3.2 },
  /** Chương 2 · Đoạn Mạch: lần đầu tới Đoạn Mạch Cổ Cốc. */
  ch2: { card: 3200, dist: 1.25, pitch: 0.08, cam: 2.6 },
};

const EASE_IN = 0.7;
const EASE_OUT = 0.9;
/** Người chơi chạm camera: trả về góc của họ trong chừng này giây. */
const CANCEL_OUT = 0.25;

function smooth(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/**
 * Khung camera nhẹ ~2 giây: độ lệch cộng thêm vào khoảng cách và góc ngẩng của người chơi (không ghi đè
 * camDist/camPitch). Bất kỳ thao tác camera nào (kéo chuột, rê chuột khi khóa con trỏ, lăn chuột, phím
 * camera) gọi `cancel()` và độ lệch tan trong 0,25 giây.
 */
export class CamFrame {
  private t = 0;
  private dur = 0;
  private dist = 1;
  private pitch = 0;
  /** Trọng số lúc bị hủy và thời gian đã tan (giây); `fade < 0` = chưa hủy. */
  private from = 0;
  private fade = -1;
  /** Đầu ra sau `update`: nhân khoảng cách, cộng góc ngẩng. */
  distMul = 1;
  pitchAdd = 0;

  start(p: ChapterPreset): void {
    this.t = 0;
    this.dur = p.cam;
    this.dist = p.dist;
    this.pitch = p.pitch;
    this.fade = -1;
  }

  cancel(): void {
    if (!this.active || this.fade >= 0) return;
    this.from = this.weight();
    this.fade = 0;
  }

  get active(): boolean {
    return this.dur > 0;
  }

  private weight(): number {
    if (this.fade >= 0) return this.from * (1 - smooth(this.fade / CANCEL_OUT));
    return Math.min(smooth(this.t / EASE_IN), smooth((this.dur - this.t) / EASE_OUT));
  }

  update(dt: number): void {
    if (!this.active) {
      this.distMul = 1;
      this.pitchAdd = 0;
      return;
    }
    if (this.fade >= 0) this.fade += dt;
    else this.t += dt;
    if (this.t >= this.dur || this.fade >= CANCEL_OUT) {
      this.dur = 0;
      this.distMul = 1;
      this.pitchAdd = 0;
      return;
    }
    const w = this.weight();
    this.distMul = 1 + (this.dist - 1) * w;
    this.pitchAdd = this.pitch * w;
  }
}

/** Khóa localStorage cho cờ "đã xem" theo nhân vật (nhiều nhân vật chung một trình duyệt). */
export function seenKey(kind: ChapterKind, char: string): string {
  return `dtl.seen.${kind}.${char}`;
}

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Lần đầu thấy: trả true và ghi cờ ngay (lần sau, kể cả sau tải lại trang, trả false). */
export function firstTime(store: Store, kind: ChapterKind, char: string): boolean {
  const k = seenKey(kind, char);
  try {
    if (store.getItem(k)) return false;
    store.setItem(k, '1');
  } catch {
    // localStorage bị chặn (chế độ riêng tư): không hiện, tránh hiện lại mỗi lần vào sân.
    return false;
  }
  return true;
}

/** Bồi âm chiêng trầm cho tiếng nhấn của thẻ chương (tổng hợp, không cần file). */
export function gongPartials(): { freq: number; gain: number; dur: number; delay: number }[] {
  // Chiêng: nốt gốc thấp, vài bồi âm không hài hòa tắt nhanh hơn; thêm một tiếng khánh nhỏ nối theo.
  const base = 98;
  const ratios = [1, 1.47, 2.09, 2.56, 3.42];
  const out = ratios.map((r, i) => ({ freq: base * r, gain: 0.32 / (1 + i * 0.8), dur: 3.2 / (0.7 + r * 0.3), delay: 0 }));
  out.push({ freq: 784, gain: 0.07, dur: 1.4, delay: 0.42 }, { freq: 1175, gain: 0.04, dur: 1.0, delay: 0.42 });
  return out;
}
