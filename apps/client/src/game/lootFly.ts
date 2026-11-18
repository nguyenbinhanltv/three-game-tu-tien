import { contentIconStyle } from '../ui/ContentIcon';

/**
 * Icon đồ rơi bay vào nút túi đồ (M4-6), lớp DOM như số sát thương: không thêm draw call. Engine gọi
 * `spawn` khi viên đồ 3D biến mất (vị trí đã chiếu ra màn hình), `update` mỗi khung. Tới nơi thì nút
 * túi (phần tử có `data-bag`) nháy một nhịp. Chỉ là lớp hình: đồ đã nằm trong túi ở server từ trước.
 */

const MAX_FLYING = 10;
/** Thời gian bay (giây). */
const FLY_DUR = 0.6;

/**
 * Vị trí trên đường cong bậc hai từ (x0, y0) tới (x1, y1), vồng lên `lift` px, tại tiến độ `k` (0..1)
 * đã qua hàm nhanh dần (hút vào túi). Ghi vào `out`.
 */
export function flyPoint(k: number, x0: number, y0: number, x1: number, y1: number, lift: number, out: { x: number; y: number }): void {
  const e = k * k * (3 - 2 * k) * 0.35 + k * k * 0.65;
  const cx = (x0 + x1) / 2;
  const cy = Math.min(y0, y1) - lift;
  const a = (1 - e) * (1 - e);
  const b = 2 * (1 - e) * e;
  const c = e * e;
  out.x = a * x0 + b * cx + c * x1;
  out.y = a * y0 + b * cy + c * y1;
}

interface Flying {
  el: HTMLDivElement;
  x0: number;
  y0: number;
  t: number;
}

const _p = { x: 0, y: 0 };

export class LootFly {
  private items: Flying[] = [];
  private pool: HTMLDivElement[] = [];
  constructor(private layer: HTMLElement) {}

  /** `icon`: id icon trong atlas; `fallback`: emoji khi atlas chưa có ô này. `tier`: 0..2 (màu quầng). */
  spawn(icon: string, fallback: string, x: number, y: number, tier: number): void {
    if (this.items.length >= MAX_FLYING) return;
    const el = this.pool.pop() ?? document.createElement('div');
    el.className = 'loot-fly t' + tier;
    el.removeAttribute('style');
    const st = contentIconStyle(icon);
    if (st) {
      Object.assign(el.style, st);
      el.textContent = '';
    } else el.textContent = fallback.startsWith('sys:') ? '◆' : fallback; // 'sys:<tên>' = icon hệ thống SVG (UI-1), ở đây chỉ cần dấu thoi
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    this.layer.appendChild(el);
    this.items.push({ el, x0: x, y0: y, t: 0 });
  }

  update(dt: number): void {
    if (this.items.length === 0) return;
    const bag = document.querySelector<HTMLElement>('[data-bag]');
    const r = bag?.getBoundingClientRect();
    const lr = this.layer.getBoundingClientRect();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / FLY_DUR);
      if (r && r.width > 0) {
        flyPoint(k, it.x0, it.y0, r.left + r.width / 2 - lr.left, r.top + r.height / 2 - lr.top, 110, _p);
        it.el.style.opacity = '1';
      } else {
        // Không thấy nút túi (HUD ẩn): mờ dần tại chỗ, bay lên một chút.
        _p.x = it.x0;
        _p.y = it.y0 - k * 40;
        it.el.style.opacity = String(1 - k);
      }
      const s = 1.25 - k * 0.65;
      it.el.style.transform = `translate(${_p.x.toFixed(1)}px, ${_p.y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(2)})`;
      if (k >= 1) {
        it.el.remove();
        this.pool.push(it.el);
        this.items.splice(i, 1);
        if (bag) {
          // Chạy lại hiệu ứng nháy dù đang nháy dở.
          bag.classList.remove('bag-pulse');
          void bag.offsetWidth;
          bag.classList.add('bag-pulse');
        }
      }
    }
  }

  get count(): number {
    return this.items.length;
  }

  clear(): void {
    for (const it of this.items) it.el.remove();
    this.items.length = 0;
  }
}
