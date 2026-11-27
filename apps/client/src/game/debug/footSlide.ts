// Xưởng animation của phòng thử (Diễn Võ Trường, V2d): đo TRƯỢT CHÂN. Mỗi khung nhận vị trí thế giới của từng bàn chân (sau mọi lớp:
// clip, trộn hướng, chân bám đất) và độ cao mặt đất dưới nó; chân đang TRỤ (sát đất, gần như không lên xuống) mà vẫn dịch ngang thì đó là trượt.
// Gom theo clip nền đang trội để đọc riêng đi bộ / chạy / lùi / ngang. Lớp thuần, không đụng three.

export interface FootSample {
  x: number;
  y: number;
  z: number;
  /** Độ cao mặt đất dưới bàn chân (m). */
  ground: number;
}

export interface SlideRow {
  /** Clip nền đang trội lúc đo. */
  key: string;
  /** Thời gian đã đo (giây) và tổng thời gian chân trụ (cộng cả hai chân). */
  time: number;
  planted: number;
  /** Tổng quãng trượt ngang của chân trụ (m) và quãng thân đi được (m). */
  slide: number;
  travel: number;
  /** Tốc độ trượt lớn nhất của một chân trụ (m/s), đã bỏ gai một khung. */
  peak: number;
  /** cm trượt trên mỗi mét đi (null khi gần như đứng yên) và cm/s trượt trung bình lúc chân trụ. */
  cmPerM: number | null;
  cmPerS: number;
}

/** Trượt quá ngần này cm trên mỗi mét đi thì mắt thấy chân "lướt băng" ở camera chéo. */
export const SLIDE_WARN_CM_PER_M = 12;
/** Chân "trụ" mà dịch nhanh hơn ngần này (m/s) là dịch chuyển tức thời (lướt, giật lùi, hụt khung), không phải trượt: bỏ khỏi số đo. */
export const SLIDE_JUMP = 8;

interface Foot {
  x: number;
  y: number;
  z: number;
  /** Độ cao thấp nhất so với đất đã thấy (đế của nhịp bước), trồi chậm lên để theo được clip khác. */
  base: number;
  planted: boolean;
  /** Tốc độ trượt khung trước (để bỏ gai một khung khi tính đỉnh). */
  lastV: number;
}

interface Acc {
  time: number;
  planted: number;
  slide: number;
  travel: number;
  peak: number;
}

export class FootSlide {
  private feet: Foot[] = [];
  private acc = new Map<string, Acc>();
  private key = '';
  private root: { x: number; z: number } | null = null;

  /**
   * @param lift chân cao hơn đế nhịp bước chừng này (m) thì coi là đang nhấc.
   * @param maxVy chân lên/xuống nhanh hơn ngần này (m/s) thì coi là đang nhấc hoặc đang đặt xuống.
   */
  constructor(
    private lift = 0.035,
    private maxVy = 0.35,
  ) {}

  reset(): void {
    this.feet = [];
    this.acc.clear();
    this.root = null;
    this.key = '';
  }

  /** Một khung: `dt` giây, clip nền trội `key`, vị trí gốc nhân vật và các bàn chân. Khung quá dài (tab ẩn) hoặc dt = 0 (đang dừng hình) bị bỏ. */
  push(dt: number, key: string, rootX: number, rootZ: number, feet: readonly FootSample[]): void {
    const fresh = key !== this.key || feet.length !== this.feet.length || dt <= 1e-4 || dt > 0.1 || !this.root;
    if (fresh) {
      // Đổi clip hoặc đứt nhịp: lấy lại mốc, không tính quãng nhảy.
      this.key = key;
      this.root = { x: rootX, z: rootZ };
      this.feet = feet.map((f, i) => ({ x: f.x, y: f.y, z: f.z, base: Math.min(this.feet[i]?.base ?? Infinity, f.y - f.ground), planted: false, lastV: 0 }));
      return;
    }
    let a = this.acc.get(key);
    if (!a) this.acc.set(key, (a = { time: 0, planted: 0, slide: 0, travel: 0, peak: 0 }));
    a.time += dt;
    a.travel += Math.hypot(rootX - this.root!.x, rootZ - this.root!.z);
    this.root!.x = rootX;
    this.root!.z = rootZ;
    feet.forEach((f, i) => {
      const p = this.feet[i]!;
      const h = f.y - f.ground;
      // Đế nhịp bước: bám ngay khi thấp hơn, trồi 2 cm/s khi cao hơn (đổi sang clip có cổ chân cao hơn vẫn nhận ra chân trụ).
      p.base = h < p.base ? h : p.base + 0.02 * dt;
      const vy = Math.abs(f.y - p.y) / dt;
      const planted = h <= p.base + this.lift && vy <= this.maxVy;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      const v = d / dt;
      if (planted && p.planted && v <= SLIDE_JUMP) {
        a.planted += dt;
        a.slide += d;
        // Đỉnh lấy giá trị nhỏ hơn của hai khung liền nhau: một khung giật (dịch chuyển tức thời, hụt khung) không thành đỉnh.
        a.peak = Math.max(a.peak, Math.min(v, p.lastV));
        p.lastV = v;
      } else p.lastV = 0;
      p.planted = planted;
      p.x = f.x;
      p.y = f.y;
      p.z = f.z;
    });
  }

  rows(): SlideRow[] {
    return [...this.acc.entries()]
      .map(([key, a]) => ({
        key,
        time: a.time,
        planted: a.planted,
        slide: a.slide,
        travel: a.travel,
        peak: a.peak,
        cmPerM: a.travel > 0.5 ? (a.slide / a.travel) * 100 : null,
        cmPerS: a.planted > 0 ? (a.slide / a.planted) * 100 : 0,
      }))
      .sort((x, y) => y.time - x.time);
  }
}
