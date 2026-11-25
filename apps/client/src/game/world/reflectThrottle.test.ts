import { describe, expect, it } from 'vitest';
import { reflectionThrottle } from './reflectThrottle';

const still = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 20, 30, 1];
const moved = (dx: number) => still.map((v, k) => (k === 12 ? v + dx : v));

describe('reflectionThrottle', () => {
  it('every = 1 (hoặc nhỏ hơn): vẽ mọi khung, kể cả không có camera', () => {
    const t = reflectionThrottle(1);
    expect(Array.from({ length: 5 }, () => t(still))).toEqual([true, true, true, true, true]);
    const z = reflectionThrottle(0);
    expect(Array.from({ length: 3 }, () => z())).toEqual([true, true, true]);
  });

  it('camera ĐỨNG YÊN, every = 2: khung đầu vẽ rồi cách một khung', () => {
    const t = reflectionThrottle(2);
    expect(Array.from({ length: 6 }, () => t(still))).toEqual([true, false, true, false, true, false]);
  });

  it('camera ĐỨNG YÊN, every = 3, số lẻ làm tròn xuống', () => {
    const t = reflectionThrottle(3.9);
    expect(Array.from({ length: 7 }, () => t(still))).toEqual([true, false, false, true, false, false, true]);
  });

  it('camera đang DI CHUYỂN: vẽ mọi khung (không bỏ khung, tránh phản chiếu lệch một khung)', () => {
    const t = reflectionThrottle(2);
    const out = Array.from({ length: 6 }, (_, k) => t(moved(k * 0.5)));
    expect(out).toEqual([true, true, true, true, true, true]);
  });

  it('camera dừng lại thì quay về bỏ khung; dịch rất nhỏ (< epsilon) coi là đứng yên', () => {
    const t = reflectionThrottle(2);
    expect(t(moved(0))).toBe(true);
    expect(t(moved(0))).toBe(false);
    expect(t(moved(5e-5))).toBe(true); // khung thứ 3 (chỉ số chẵn) vẫn đến lượt vẽ
    expect(t(moved(5e-5))).toBe(false); // dịch dưới epsilon: coi đứng yên
    expect(t(moved(2))).toBe(true); // dịch thật: vẽ ngay
    expect(t(moved(2))).toBe(false); // đã dừng ở vị trí mới
  });

  it('không có thông tin camera: coi như đã di chuyển (vẽ, an toàn)', () => {
    const t = reflectionThrottle(2);
    expect(Array.from({ length: 4 }, () => t())).toEqual([true, true, true, true]);
  });
});
