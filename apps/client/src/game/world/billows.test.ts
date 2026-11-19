import { describe, expect, it } from 'vitest';
import { terrainOf } from '@dtl/shared';
import './vanHaiWow';
import { BILLOW_MARGIN, billowPlan } from './billows';

const def = terrainOf('van_hai').def;
const plan = billowPlan(def.size, def.voidFloor ?? 0, def.islands ?? [], def.bridges ?? [], 900);

describe('biển mây Vân Hải: khối mây không nhô qua đảo và cầu', () => {
  it('đủ 900 khối và có khe hở: có ô lưới 100 m không bị khối nào phủ', () => {
    expect(plan.length).toBeGreaterThanOrEqual(900);
    let empty = 0;
    for (let gx = 0; gx < def.size; gx += 100)
      for (let gz = 0; gz < def.size; gz += 100) if (!plan.some((b) => Math.hypot(b.x - gx, b.z - gz) < b.sx)) empty++;
    expect(empty).toBeGreaterThan(8);
  });

  it('mỗi đảo thật có vòng mây cuộn ôm chân (≥ r/8 khối trong 1,2 r quanh tâm, thấp hơn đáy mặt đảo)', () => {
    for (const isl of def.islands ?? []) {
      const ring = plan.filter((b) => Math.hypot(b.x - isl.x, b.z - isl.z) < isl.r * 1.2 && b.y + b.sy < isl.y - 20);
      expect(ring.length).toBeGreaterThanOrEqual(Math.floor(isl.r / 8));
    }
  });

  it('đọc được đảo và cầu', () => {
    expect((def.islands ?? []).length).toBeGreaterThan(5);
    expect((def.bridges ?? []).length).toBeGreaterThan(3);
  });

  it('khối chồng hình chiếu lên đảo thật có đỉnh dưới mặt đảo thấp nhất ít nhất biên an toàn', () => {
    const lowest = Math.min(...(def.islands ?? []).map((i) => i.y));
    let checked = 0;
    for (const b of plan) {
      const over = (def.islands ?? []).some((i) => Math.hypot(b.x - i.x, b.z - i.z) < i.r + i.edge + b.sx);
      if (!over) continue;
      checked++;
      expect(b.y + b.sy).toBeLessThanOrEqual(lowest - BILLOW_MARGIN + 1e-6);
      expect(b.tower).toBe(false);
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('khối chồng lên cầu cũng bị kẹp, mây tháp chỉ ở vùng trống xa đảo và cầu', () => {
    const lowest = Math.min(...(def.islands ?? []).map((i) => i.y));
    for (const b of plan) {
      for (const br of def.bridges ?? []) {
        const dx = br.bx - br.ax;
        const dz = br.bz - br.az;
        const t = Math.max(0, Math.min(1, ((b.x - br.ax) * dx + (b.z - br.az) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(b.x - (br.ax + dx * t), b.z - (br.az + dz * t)) < br.halfW + b.sx) {
          expect(b.y + b.sy).toBeLessThanOrEqual(lowest - BILLOW_MARGIN + 1e-6);
          expect(b.tower).toBe(false);
        }
      }
    }
    expect(plan.filter((b) => b.tower).length).toBeGreaterThan(20);
  });

  it('không đặt khối nào cao quá đỉnh mây tháp ở vùng trống (tối đa nửa cao 0,85×170×1,15)', () => {
    for (const b of plan) expect(b.sy).toBeLessThanOrEqual(0.85 * 170 * 1.15 + 1e-6);
  });
});
