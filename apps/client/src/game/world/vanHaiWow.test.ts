import { describe, expect, it } from 'vitest';
import { terrainOf } from '@dtl/shared';
import { rainbowArcs, shipPose, SHIPS, STACKS, towersOf, whalePose, WHALES } from './vanHaiWow';

const def = terrainOf('van_hai').def;

describe('Vân Hải: điểm nhấn trên trời (MAP-3)', () => {
  it('đọc được đảo thật và đảo giả của Vân Hải', () => {
    expect((def.islands ?? []).length).toBeGreaterThan(5);
    expect((def.fakeIslands ?? []).length).toBeGreaterThan(2);
  });

  it('thuyền bay cao hơn đỉnh mọi đảo ≥ 25 m và hướng mũi liên tục', () => {
    const top = Math.max(...(def.islands ?? []).map((i) => i.y));
    for (const s of SHIPS) {
      let prev = shipPose(s, 0).yaw;
      for (let t = 0; t <= 600; t += 1) {
        const p = shipPose(s, t);
        expect(p.y).toBeGreaterThan(top + 25);
        let d = Math.abs(p.yaw - prev);
        if (d > Math.PI) d = Math.PI * 2 - d;
        expect(d).toBeLessThan(0.1);
        prev = p.yaw;
      }
    }
  });

  it('bụng cá kình luôn cao hơn đỉnh cột buồm của mọi thuyền (kể cả sóng đuôi) và cao hơn đảo ≥ 60 m', () => {
    const top = Math.max(...(def.islands ?? []).map((i) => i.y));
    let mastTop = 0;
    for (const s of SHIPS) {
      for (let t = 0; t < 3600; t += 2) mastTop = Math.max(mastTop, shipPose(s, t).y + 13.5 * s.scale);
    }
    for (const w of WHALES) {
      // bán kính thân ≈ 0,12 chiều dài; sóng đuôi biên độ 0,05 chiều dài; nhịp lên xuống ±14 m
      const belly = (t: number) => whalePose(w, t).y - 0.12 * w.length - 0.05 * w.length;
      for (let t = 0; t < 3600; t += 2) {
        expect(belly(t)).toBeGreaterThan(mastTop + 15);
        expect(belly(t)).toBeGreaterThan(top + 60);
      }
    }
  });

  it('cầu vòng chỉ nối đảo thật với mõm đá, không chạm đảo giả; tháp chỉ ở mõm đá', () => {
    const arcs = rainbowArcs(def);
    expect(arcs.length).toBe(STACKS.length);
    for (const a of arcs) {
      expect(a.rise).toBeGreaterThan(50);
      expect(Math.hypot(a.bx - a.ax, a.bz - a.az)).toBeGreaterThan(100);
      for (const f of def.fakeIslands ?? []) {
        expect(Math.hypot(a.ax - f.x, a.az - f.z)).toBeGreaterThan(f.r + 30);
        expect(Math.hypot(a.bx - f.x, a.bz - f.z)).toBeGreaterThan(f.r + 30);
      }
    }
    for (const tw of towersOf(def)) {
      expect(tw.stack).toBe(true);
      for (const f of def.fakeIslands ?? []) expect(Math.hypot(tw.x - f.x, tw.z - f.z)).toBeGreaterThan(f.r + 30);
    }
  });
});
