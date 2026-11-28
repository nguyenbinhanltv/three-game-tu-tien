// Bộ dò bàn chân chạm đất từ độ cao mũi bàn chân (xương `ball_l`/`ball_r`) trong hệ gốc nhân vật. Hàm thuần (không đụng three) để test trong Node.
// Dùng cho tiếng bước chân: phát đúng lúc chân THẬT hạ xuống (sau mọi lớp clip, trộn hướng, chân bám đất) thay vì theo quãng đường hay pha clip,
// vốn lệch −79 đến +66 ms (trung vị) và tới ±300 ms ở nhịp khởi động/dừng (đo 28/11 bằng `pnpm shots xuong --only player`).
// Cùng ngưỡng với phép đo `FootSlide` của xưởng (`apps/client/src/game/debug/footSlide.ts`): đế = độ cao thấp nhất gần đây, chân "nhấc" khi cao hơn
// đế `PLANT_UP`, "chạm" khi hạ về trong `PLANT_DOWN` của đế (hai ngưỡng khác nhau để nhiễu độ cao không bắn tiếng liên tục).

/** Chân coi là đã nhấc khi cao hơn đế chừng này (m). */
export const PLANT_UP = 0.05;
/** Chân chạm đất khi hạ về trong chừng này (m) so với đế. */
export const PLANT_DOWN = 0.03;
/** Tốc độ đế được phép dâng lên (m/s): đế bám theo khi tư thế đổi (ngồi, dốc) thay vì kẹt ở mức thấp nhất từ trước. */
export const PLANT_BASE_RISE = 0.06;

export class PlantDetector {
  private base = NaN;
  private lifted = false;

  /** Một khung: `dt` giây, `h` độ cao mũi bàn chân so với mặt đất dưới gốc (m). Trả true đúng khung chân vừa chạm đất. */
  update(dt: number, h: number): boolean {
    if (!Number.isFinite(h)) return false;
    this.base = Number.isNaN(this.base) ? h : Math.min(h, this.base + Math.max(0, dt) * PLANT_BASE_RISE);
    if (!this.lifted) {
      if (h > this.base + PLANT_UP) this.lifted = true;
      return false;
    }
    if (h <= this.base + PLANT_DOWN) {
      this.lifted = false;
      return true;
    }
    return false;
  }

  /** Quên đế (dịch chuyển, đổi tư thế lớn, vừa hiện lại): khung sau lấy lại đế từ đầu, không bắn tiếng. */
  reset(): void {
    this.base = NaN;
    this.lifted = false;
  }
}
