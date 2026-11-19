import { describe, expect, it } from 'vitest';
import { type Capsule, ClothSim, panelGrid, skirtGrid, sleeveGrid } from './cloth';

const targetsOf = (g: { rest: Float32Array }) => g.rest.slice();
const f = (a: Float32Array, i: number): number => a[i] as number;

describe('Thiên Y: lưới vải', () => {
  it('tấm treo: hàng trên ghim giữ nguyên, rủ xuống ổn định, không dãn quá giới hạn', () => {
    const g = panelGrid('t', [-0.2, 1, 0], [0.2, 1, 0], 0.6, 8, 10, { bone: 'x', w: [1] });
    const sim = new ClothSim(g);
    const tgt = targetsOf(g);
    for (let i = 0; i < 400; i++) sim.step(1 / 60, tgt, []);
    for (let c = 0; c < 8; c++) expect(f(sim.pos, 3 * c + 1)).toBeCloseTo(1, 5);
    // dài cả tấm ≤ 1.12 chiều dài nghỉ ở mỗi cạnh dọc (cộng sai số lặp)
    let worst = 0;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 8; c++) {
        const a = 3 * (r * 8 + c), b = 3 * ((r + 1) * 8 + c);
        const d = Math.hypot(f(sim.pos, a) - f(sim.pos, b), f(sim.pos, a + 1) - f(sim.pos, b + 1), f(sim.pos, a + 2) - f(sim.pos, b + 2));
        const L = Math.hypot(f(g.rest, a) - f(g.rest, b), f(g.rest, a + 1) - f(g.rest, b + 1), f(g.rest, a + 2) - f(g.rest, b + 2));
        worst = Math.max(worst, d / L);
      }
    expect(worst).toBeLessThan(1.3);
    expect(sim.pos.every(Number.isFinite)).toBe(true);
  });

  it('váy ống: viên nang đẩy đỉnh ra ngoài, không đỉnh nào nằm trong viên nang sau khi ổn định', () => {
    const rings = Array.from({ length: 9 }, (_, i) => ({ y: 1 - i * 0.1, cx: 0, cz: 0, a: 0.16 + i * 0.02, b: 0.14 + i * 0.02 }));
    const g = skirtGrid('s', rings, 16, { bone: 'pelvis', w: [1, 0.5] });
    const sim = new ClothSim(g);
    const cap: Capsule = { ax: 0, ay: 0.4, az: 0.05, bx: 0, by: 0.95, bz: 0.05, r: 0.15 };
    const tgt = targetsOf(g);
    for (let i = 0; i < 300; i++) sim.step(1 / 60, tgt, [cap]);
    for (let i = 0; i < sim.n; i++) {
      if (f(g.pinW, i) >= 1) continue;
      const y = f(sim.pos, 3 * i + 1);
      if (y < cap.ay || y > cap.by) continue;
      const d = Math.hypot(f(sim.pos, 3 * i) - cap.ax, f(sim.pos, 3 * i + 2) - cap.az);
      expect(d).toBeGreaterThan(cap.r - 0.02);
    }
  });

  it('tay áo: ống quanh trục có đủ đỉnh, chỉ số tam giác hợp lệ và pháp tuyến đơn vị', () => {
    const g = sleeveGrid('l', [0.2, 1.3, 0], [0.3, 1.0, 0.05], (t) => 0.05 + 0.1 * t, 12, 8, 0.4, { bone: 'lowerarm_l', w: [1, 0.6, 0.25] });
    const sim = new ClothSim(g);
    expect(g.index.every((v) => v < sim.n)).toBe(true);
    const nrm = new Float32Array(sim.n * 3);
    sim.normals(nrm);
    for (let i = 0; i < sim.n; i++) expect(Math.hypot(f(nrm, 3 * i), f(nrm, 3 * i + 1), f(nrm, 3 * i + 2))).toBeCloseTo(1, 4);
  });
});
