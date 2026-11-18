// Sương phủ vùng chưa khám phá (U2-7): một mặt nạ alpha 256×256 phủ cả level, đi tới đâu tan tới đó, lưu theo nhân vật + level trong
// localStorage (PNG nhỏ) để lần sau vào vẫn còn vùng đã đi qua. Chỉ là lớp vẽ phía client, không ảnh hưởng gameplay.
import { logger } from '../../base/log';

const log = logger('minimap');
const M = 256;
/** Bán kính tan sương quanh người chơi (m) và khoảng cách tối thiểu giữa hai lần đóng dấu. */
export const REVEAL_R = 90;
const STAMP_GAP = 10;
const SAVE_MS = 8000;

export class Fog {
  readonly mask: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private lx = -1e9;
  private lz = -1e9;
  private dirty = false;
  /** Đã nạp xong ảnh cũ (hoặc không có): chỉ khi đó mới được lưu, tránh ghi đè sương cũ bằng mặt nạ mới tinh lúc ảnh chưa kịp nạp. */
  private loaded = false;
  private lastSave = 0;

  constructor(
    private key: string,
    readonly size: number,
  ) {
    this.mask = document.createElement('canvas');
    this.mask.width = this.mask.height = M;
    this.g = this.mask.getContext('2d')!;
    try {
      const url = localStorage.getItem(key);
      if (!url) this.loaded = true;
      else {
        const im = new Image();
        im.onload = () => {
          // Giữ phần đã tan trong lúc ảnh nạp: vẽ ảnh cũ bằng 'lighter' để cộng dồn, không đè.
          this.g.globalCompositeOperation = 'lighter';
          this.g.drawImage(im, 0, 0);
          this.g.globalCompositeOperation = 'source-over';
          this.loaded = true;
          this.dirty = true;
        };
        im.onerror = () => {
          this.loaded = true;
        };
        im.src = url;
      }
    } catch (e) {
      this.loaded = true;
      log.warn('không đọc được sương đã lưu', e);
    }
  }

  /** Tan sương quanh (x, z) mét; bỏ qua nếu chưa đi đủ xa kể từ lần trước. */
  reveal(x: number, z: number): void {
    if (Math.hypot(x - this.lx, z - this.lz) < STAMP_GAP) return;
    this.lx = x;
    this.lz = z;
    const k = M / this.size;
    const cx = x * k;
    const cy = z * k;
    const r = REVEAL_R * k;
    const gr = this.g.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
    // Mặt nạ chỉ dùng kênh alpha: đặc ở tâm, tan dần ra mép.
    gr.addColorStop(0, 'white');
    gr.addColorStop(1, 'transparent');
    this.g.fillStyle = gr;
    this.g.fillRect(cx - r, cy - r, r * 2, r * 2);
    this.dirty = true;
  }

  /** Lưu nếu có thay đổi và đã quá SAVE_MS (hoặc `force` khi rời level). */
  save(now: number, force = false): void {
    if (!this.loaded || !this.dirty || (!force && now - this.lastSave < SAVE_MS)) return;
    this.dirty = false;
    this.lastSave = now;
    try {
      localStorage.setItem(this.key, this.mask.toDataURL('image/png'));
    } catch (e) {
      log.warn('không lưu được sương', e);
    }
  }
}

let cur: Fog | null = null;

/** Sương của (nhân vật, level) hiện tại; đổi nhân vật/level thì lưu cái cũ và mở cái mới. */
export function fogFor(char: string, level: string, size: number): Fog {
  const key = `dtl.mm.fog.${char}.${level}`;
  if (!cur || cur['key'] !== key) {
    cur?.save(0, true);
    cur = new Fog(key, size);
  }
  return cur;
}
