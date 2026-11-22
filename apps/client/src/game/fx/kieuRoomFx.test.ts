import { describe, expect, it } from 'vitest';
import { DAP_THIEN_COLORS, KIEU_ROOM_COLORS, dapThienPulse, kieuIndex, kieuRingRadius } from './kieuRoomFx';

describe('kieuRoomFx', () => {
  it('chín cầu chín màu khác nhau, cầu 9 vàng', () => {
    expect(KIEU_ROOM_COLORS).toHaveLength(9);
    expect(new Set(KIEU_ROOM_COLORS).size).toBe(9);
    expect(KIEU_ROOM_COLORS[8]).toBe(DAP_THIEN_COLORS[0]);
  });
  it('bán kính vòng sàn nằm trong [6, 26]', () => {
    expect(kieuRingRadius(10)).toBe(6);
    expect(kieuRingRadius(70)).toBe(26);
    expect(kieuRingRadius(40)).toBeCloseTo(16.8, 5);
  });
  it('hào quang thở trong 0,45–0,85', () => {
    for (let t = 0; t < 10; t += 0.1) {
      expect(dapThienPulse(t)).toBeGreaterThanOrEqual(0.45 - 1e-9);
      expect(dapThienPulse(t)).toBeLessThanOrEqual(0.85 + 1e-9);
    }
  });
  it('kieuIndex chỉ nhận kieu_1..9', () => {
    expect(kieuIndex('kieu_5')).toBe(5);
    expect(kieuIndex('kieu_10')).toBe(0);
    expect(kieuIndex('cuu_kieu')).toBe(0);
  });
});
