import { describe, expect, it } from 'vitest';
import {
  SUY_MECHANICS,
  TRIB_DEFS,
  bumpSuy,
  isSuyMechanic,
  lawPassive,
  stepSuy,
  suyCleared,
  suyDone,
  suyProgress,
  suyRemaining,
  suyRevealCd,
  suyRingPos,
  suyRise,
  suySectorOf,
  suySectorYaw,
  suyStages,
  suyThucHit,
  suyThucWave,
  tribForLevel,
} from './index';

const DEF = TRIB_DEFS.ngu_suy;

describe('Thiên Nhân Ngũ Suy: hàm thuần', () => {
  it('chuỗi năm ải theo đúng thứ tự cơ chế; kiếp thường không phải chuỗi', () => {
    expect(suyStages()).toBe(5);
    expect(suyStages(TRIB_DEFS.truc_co)).toBe(0);
    expect(DEF.phases.map((p) => p.mechanic)).toEqual([...SUY_MECHANICS]);
    expect(isSuyMechanic('suy_tho')).toBe(true);
    expect(isSuyMechanic('tam_canh')).toBe(false);
    expect(isSuyMechanic(undefined)).toBe(false);
    // Mốc tạm (to = from): không nằm trên đường đột phá theo cấp.
    expect(tribForLevel(DEF.from)).toBeNull();
  });

  it('tiến độ lấy từ meta được làm sạch (dữ liệu hỏng không mở được pháp tắc)', () => {
    expect(suyCleared(undefined)).toBe(0);
    expect(suyCleared('5')).toBe(0);
    expect(suyCleared(Number.NaN)).toBe(0);
    expect(suyCleared(Number.POSITIVE_INFINITY)).toBe(0);
    expect(suyCleared(-3)).toBe(0);
    expect(suyCleared(2.9)).toBe(2);
    expect(suyCleared(99)).toBe(5);
    expect(suyDone(4)).toBe(false);
    expect(suyDone(5)).toBe(true);
    expect(suyDone(5, TRIB_DEFS.truc_co)).toBe(false);
    expect(lawPassive(4)).toBeNull();
    expect(lawPassive('5')).toBeNull();
    expect(lawPassive(5)).toEqual(DEF.law);
  });

  it('vào tiếp từ ải dở: thời lượng còn lại tính từ đầu ải đó', () => {
    expect(suyRemaining(DEF, 0)).toBe(DEF.duration);
    expect(suyRemaining(DEF, 3)).toBe(DEF.duration - DEF.phases[2]!.end);
    expect(suyRemaining(DEF, 99)).toBe(DEF.duration - DEF.phases[3]!.end);
  });

  it('thanh suy khí: điều tức thì chưa tăng, sau đó nặng dần, luôn kẹp 0..100', () => {
    const s = DEF.phases[1]!.suy!;
    const a = DEF.phases[0]!.end;
    expect(suyProgress(DEF, 1, a)).toBe(0);
    expect(suyProgress(DEF, 1, a + s.rest)).toBe(0);
    expect(suyProgress(DEF, 1, DEF.phases[1]!.end)).toBe(1);
    expect(suyRise(s, 0)).toBe(s.rise);
    expect(suyRise(s, 1)).toBe(s.riseEnd);
    expect(suyRise(s, 0.5)).toBeCloseTo((s.rise + s.riseEnd) / 2);
    expect(stepSuy(99, 1, 5)).toBe(100);
    expect(stepSuy(1, 1, -5)).toBe(0);
    expect(stepSuy(50, 0.5, 4)).toBe(52);
    expect(bumpSuy(95, 30)).toBe(100);
    expect(bumpSuy(10, -30)).toBe(0);
  });

  it('cung và vòng: điểm giữa cung thuộc đúng cung, đèn chia đều trên vòng', () => {
    const c = { x: 100, z: 200 };
    const n = 8;
    for (let i = 0; i < n; i++) {
      const yaw = suySectorYaw(i, n);
      expect(suySectorOf(c, c.x + Math.sin(yaw) * 5, c.z + Math.cos(yaw) * 5, n)).toBe(i);
    }
    expect(suySectorOf(c, c.x, c.z, n)).toBe(0);
    const pts = Array.from({ length: 5 }, (_, i) => suyRingPos(c, 9, i, 5));
    for (const p of pts) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeCloseTo(9);
    expect(pts[0]).toEqual({ x: 100, z: 209 });
  });

  it('đợt lôi ẩn: đúng số cung yên, ra ngoài sân luôn trúng', () => {
    const t = DEF.phases[2]!.suy!.thuc!;
    let k = 0;
    const seq = [0.99, 0, 0.5, 0.3, 0.7];
    const mask = suyThucWave(t.sectors, t.safe, () => seq[k++ % seq.length]!);
    const safe = Array.from({ length: t.sectors }, (_, i) => i).filter((i) => (mask & (1 << i)) === 0);
    expect(safe).toHaveLength(t.safe);
    const c = { x: 0, z: 0 };
    for (let i = 0; i < t.sectors; i++) {
      const yaw = suySectorYaw(i, t.sectors);
      const hit = suyThucHit(c, t, mask, Math.sin(yaw) * 4, Math.cos(yaw) * 4);
      expect(hit).toBe(!safe.includes(i));
      // Ngoài bán kính sân: cung yên cũng không cứu.
      expect(suyThucHit(c, t, mask, Math.sin(yaw) * (t.r + 1), Math.cos(yaw) * (t.r + 1))).toBe(true);
    }
    // rnd lệch biên (1) không làm văng chỉ số.
    expect(() => suyThucWave(t.sectors, t.safe, () => 1)).not.toThrow();
  });

  it('hồi chiêu ngưng thần dài dần theo thanh', () => {
    const t = DEF.phases[2]!.suy!.thuc!;
    expect(suyRevealCd(t, 0)).toBe(t.cd);
    expect(suyRevealCd(t, 100)).toBe(t.cdEnd);
    expect(suyRevealCd(t, 150)).toBe(t.cdEnd);
    expect(suyRevealCd(t, 50)).toBeGreaterThan(t.cd);
  });
});
