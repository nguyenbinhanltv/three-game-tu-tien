import { describe, expect, it } from 'vitest';
import { ARTIFACTS } from '@dtl/content';
import { activePose, blendPose, idlePose } from './artifactVis';

describe('animation thủ tục của pháp bảo', () => {
  const kinds = ARTIFACTS.map((a) => a.kind);

  it('mỗi pháp bảo có tư thế nghỉ ở sát người và tư thế kích hoạt khác hẳn', () => {
    for (const k of kinds) {
      const i = idlePose(k, 0, 0);
      const a = activePose(k, 0);
      expect(Math.hypot(i.x, i.z)).toBeLessThan(0.6);
      expect(i.y).toBeGreaterThan(0.6);
      expect(i.y).toBeLessThan(1.5);
      expect(Math.hypot(a.x - i.x, a.y - i.y, a.z - i.z)).toBeGreaterThan(0.3);
    }
  });

  it('Ngưng Đan Lô (heal): nghỉ nhỏ, lơ lửng sau lưng lệch vai; vận chiêu bay ra trước mặt', () => {
    const i = idlePose('heal', 0, 0);
    const a = activePose('heal', 0);
    expect(i.z).toBeLessThan(0);
    expect(a.z).toBeGreaterThan(0.8);
    expect(i.s).toBeLessThan(0.75);
    expect(i.y).toBeGreaterThan(1.4);
    expect(Math.abs(i.x)).toBeLessThan(0.4);
    expect(Math.abs(idlePose('heal', 1, 0).y - idlePose('heal', 2.4, 0).y)).toBeGreaterThan(0);
  });

  it('hồ lô xoay quanh người ở bán kính ổn định; linh ở trước mặt; ấn trên đầu', () => {
    for (const t of [0, 0.3, 0.9, 2.2]) {
      const h = activePose('drain', t);
      expect(Math.hypot(h.x, h.z)).toBeCloseTo(0.95, 2);
    }
    const linh = activePose('seal', 0.4);
    expect(linh.z).toBeGreaterThan(0.8);
    expect(Math.abs(linh.x)).toBeLessThan(0.01);
    const an = activePose('shield', 0.4);
    expect(an.y).toBeGreaterThan(2.4);
  });

  it('pháp bảo kích hoạt không che mặt nhân vật: không vào vùng đầu phía trước ở cỡ lớn', () => {
    // Linh lơ lửng trước người ở độ cao ngực (≈1,4 m), thấp hơn mắt nhân vật (≈1,65 m) khi cộng nửa chiều cao đã scale.
    const linh = activePose('seal', 1);
    expect(linh.y + 0.22 * 0.5 * linh.s).toBeLessThan(1.8);
    // Ấn nâng cao hơn đầu (≈1,8 m) cả khi trừ nửa bề cao.
    const an = activePose('shield', 1);
    expect(an.y - 0.15 * 0.5 * an.s).toBeGreaterThan(2.0);
  });

  it('trộn tư thế: a = 0 là nghỉ, a = 1 là kích hoạt, ở giữa liên tục', () => {
    const i = idlePose('shield', 0, 0);
    const a = activePose('shield', 0);
    const out = { ...i };
    expect(blendPose(i, a, 0, out).y).toBeCloseTo(i.y);
    expect(blendPose(i, a, 1, out).y).toBeCloseTo(a.y);
    const mid = blendPose(i, a, 0.5, out).y;
    expect(mid).toBeGreaterThan(i.y);
    expect(mid).toBeLessThan(a.y);
    expect(blendPose(i, a, 5, out).y).toBeCloseTo(a.y);
  });

  it('chạy nhanh thì đung đưa mạnh hơn đứng yên', () => {
    let still = 0;
    let run = 0;
    for (let t = 0; t < 3; t += 0.05) {
      still = Math.max(still, Math.abs(idlePose('drain', t, 0).rz - 0.12));
      run = Math.max(run, Math.abs(idlePose('drain', t, 6).rz - 0.12));
    }
    expect(run).toBeGreaterThan(still);
  });
});
