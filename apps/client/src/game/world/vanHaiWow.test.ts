import { describe, expect, it } from 'vitest';
import { terrainOf } from '@dtl/shared';
import { rainbowArcs, shipPose, SHIPS, STACKS, towersOf, whalePose, WHALES } from './vanHaiWow';

const def = terrainOf('van_hai').def;

describe('Vân Hải: điểm nhấn trên trời (MAP-3)', () => {
  it('đọc được đảo thật và đảo giả của Vân Hải', () => {
    expect((def.islands ?? []).length).toBeGreaterThan(5);
    expect((def.fakeIslands ?? []).length).toBeGreaterThan(2);
  });

  it('thuyền bay cao hơn đỉnh mọi đảo ≥ 20 m và hướng mũi liên tục', () => {
    const top = Math.max(...(def.islands ?? []).map((i) => i.y));
    for (const s of SHIPS) {
      let prev = shipPose(s, 0).yaw;
      for (let t = 0; t <= 600; t += 1) {
        const p = shipPose(s, t);
        expect(p.y).toBeGreaterThan(top + 20);
        let d = Math.abs(p.yaw - prev);
        if (d > Math.PI) d = Math.PI * 2 - d;
        expect(d).toBeLessThan(0.1);
        prev = p.yaw;
      }
    }
  });

  it('cá kình bơi cao hơn đỉnh mọi đảo ≥ 60 m (kể cả khi đuôi uốn) và cao hơn đỉnh cột buồm thuyền', () => {
    const top = Math.max(...(def.islands ?? []).map((i) => i.y));
    for (const w of WHALES) {
      for (let t = 0; t < 1800; t += 10) expect(whalePose(w, t).y - w.length * 0.1).toBeGreaterThan(top + 60);
    }
  });

  it('cầu vòng nối mỗi đảo giả với đảo thật gần nhất, hai đầu trong mép', () => {
    const arcs = rainbowArcs(def);
    expect(arcs.length).toBe((def.fakeIslands ?? []).length);
    for (const a of arcs) {
      expect(a.rise).toBeGreaterThan(20);
      expect(Math.hypot(a.bx - a.ax, a.bz - a.az)).toBeGreaterThan(30);
    }
  });

  it('mõm đá cách mọi đảo thật > 300 m và nằm trong bản đồ; mỗi đảo giả có một hải đăng', () => {
    for (const s of STACKS) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(def.size);
      for (const i of def.islands ?? []) expect(Math.hypot(s.x - i.x, s.z - i.z) - i.r).toBeGreaterThan(300);
    }
    expect(towersOf(def).length).toBe((def.fakeIslands ?? []).length + STACKS.length);
  });
});
