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

/** Trạng thái tức thời của một bàn chân (cho giao diện xưởng). */
export interface FootState {
  /** Cao hơn mặt đất (m). */
  h: number;
  planted: boolean;
  /** Tốc độ ngang (m/s). */
  v: number;
}

/** Đế của nhịp bước = độ cao thấp nhất của bàn chân trong cửa sổ này (giây): dài hơn một chu kỳ bước, đủ ngắn để theo kịp khi đổi clip. */
export const SLIDE_BASE_WINDOW = 1.2;

interface Foot {
  x: number;
  y: number;
  z: number;
  /** Lịch sử độ cao so với đất trong `SLIDE_BASE_WINDOW` giây gần nhất (tuổi tính bằng giây đã đo). */
  hist: { t: number; h: number }[];
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
  private clock = 0;
  /** Trạng thái từng bàn chân ở khung vừa đo. */
  now: FootState[] = [];

  /**
   * @param lift chân cao hơn đế nhịp bước chừng này (m) thì coi là đang nhấc.
   * @param maxVy chân lên/xuống nhanh hơn ngần này (m/s) thì coi là đang nhấc hoặc đang đặt xuống. Không đặt thấp hơn: ở 120 khung/giây
   *   chỉ 3 mm nhiễu độ cao mỗi khung đã là 0,36 m/s (đo 28/11: ngưỡng 0,35 làm chân trụ chỉ được nhận 3% thời gian).
   */
  constructor(
    private lift = 0.03,
    private maxVy = 1,
  ) {}

  reset(): void {
    this.feet = [];
    this.acc.clear();
    this.root = null;
    this.key = '';
    this.clock = 0;
    this.now = [];
  }

  /** Một khung: `dt` giây, clip nền trội `key`, vị trí gốc nhân vật và các bàn chân. Khung quá dài (tab ẩn) hoặc dt = 0 (đang dừng hình) bị bỏ. */
  push(dt: number, key: string, rootX: number, rootZ: number, feet: readonly FootSample[]): void {
    const fresh = key !== this.key || feet.length !== this.feet.length || dt <= 1e-4 || dt > 0.1 || !this.root;
    if (fresh) {
      // Đổi clip hoặc đứt nhịp: lấy lại mốc, không tính quãng nhảy.
      this.key = key;
      this.root = { x: rootX, z: rootZ };
      this.feet = feet.map((f, i) => ({ x: f.x, y: f.y, z: f.z, hist: this.feet[i]?.hist ?? [], planted: false, lastV: 0 }));
      return;
    }
    let a = this.acc.get(key);
    if (!a) this.acc.set(key, (a = { time: 0, planted: 0, slide: 0, travel: 0, peak: 0 }));
    a.time += dt;
    this.clock += dt;
    a.travel += Math.hypot(rootX - this.root!.x, rootZ - this.root!.z);
    this.root!.x = rootX;
    this.root!.z = rootZ;
    feet.forEach((f, i) => {
      const p = this.feet[i]!;
      const h = f.y - f.ground;
      p.hist.push({ t: this.clock, h });
      while (p.hist.length && this.clock - p.hist[0]!.t > SLIDE_BASE_WINDOW) p.hist.shift();
      let base = h;
      for (const s of p.hist) if (s.h < base) base = s.h;
      const vy = Math.abs(f.y - p.y) / dt;
      const planted = h <= base + this.lift && vy <= this.maxVy;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      const v = d / dt;
      if (planted && p.planted && v <= SLIDE_JUMP) {
        a.planted += dt;
        a.slide += d;
        // Đỉnh lấy giá trị nhỏ hơn của hai khung liền nhau: một khung giật (dịch chuyển tức thời, hụt khung) không thành đỉnh.
        a.peak = Math.max(a.peak, Math.min(v, p.lastV));
        p.lastV = v;
      } else p.lastV = 0;
      this.now[i] = { h, planted, v };
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

/**
 * Đo trượt chân theo VẬN TỐC, không cần biết chân nhấc cao bao nhiêu (clip chạy của quái bốn chân nhấc chân dưới 3 cm nên `FootSlide` coi chân
 * nào cũng đang trụ). Ý: trong một chu kỳ bước, lúc bàn chân trụ là lúc nó đi CHẬM NHẤT theo hướng thân đang đi; clip khớp tốc độ thì lúc đó bàn
 * chân đứng yên trong thế giới (tỉ số 0). Tỉ số dương = bàn chân vẫn trôi tới (clip phát chậm hơn tốc độ đi), âm = bị kéo lùi (clip phát nhanh hơn).
 * Mỗi mẫu là vận tốc bàn chân dọc hướng đi chia cho tốc độ thân; lấy phân vị 15% của từng clip. Lớp thuần.
 */
export interface StrideRow {
  key: string;
  n: number;
  /** Tốc độ thân trung bình lúc đo (m/s). */
  speed: number;
  /** Phân vị 15% của (vận tốc bàn chân dọc hướng đi ÷ tốc độ thân): 0 = chân trụ đứng yên. */
  slip: number;
  /** Nhân `refSpeed` (tốc độ đi mà clip được dựng cho) với hệ số này thì chân trụ hết trôi. */
  refFix: number;
}

/** Tỉ số trôi quá ngần này (theo trị tuyệt đối) thì mắt thấy chân lướt. */
export const STRIDE_SLIP_WARN = 0.25;
/** Thân đi chậm hơn ngần này (m/s) thì không lấy mẫu (tỉ số chia cho số gần 0). */
export const STRIDE_MIN_SPEED = 1;
const STRIDE_CAP = 1200;

export class StrideSlip {
  private acc = new Map<string, { r: number[]; speed: number; n: number }>();

  reset(): void {
    this.acc.clear();
  }

  /** Một mẫu: clip nền `key`, vận tốc bàn chân dọc hướng thân đi (m/s, dương = cùng chiều thân), tốc độ thân (m/s). */
  push(key: string, footAlong: number, body: number): void {
    if (!(body >= STRIDE_MIN_SPEED) || !Number.isFinite(footAlong)) return;
    let a = this.acc.get(key);
    if (!a) this.acc.set(key, (a = { r: [], speed: 0, n: 0 }));
    a.r.push(footAlong / body);
    if (a.r.length > STRIDE_CAP) a.r.shift();
    a.speed += body;
    a.n++;
  }

  rows(): StrideRow[] {
    return [...this.acc.entries()]
      .filter(([, a]) => a.r.length >= 20)
      .map(([key, a]) => {
        const s = [...a.r].sort((x, y) => x - y);
        const slip = s[Math.floor(s.length * 0.15)]!;
        return { key, n: a.r.length, speed: a.speed / a.n, slip, refFix: Math.max(0.3, Math.min(3, 1 - slip)) };
      })
      .sort((x, y) => y.n - x.n);
  }
}
