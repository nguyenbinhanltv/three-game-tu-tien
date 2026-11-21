import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PATHS } from '@dtl/content';
import { GREATBLADE_WEAPON, greatbladeGeometry, greatbladeLength, greatbladeMesh } from './greatblade';

describe('Đao tu: đao lớn thủ tục', () => {
  it('hướng dao_tu khai đao lớn; các hướng khác không', () => {
    expect(PATHS.find((p) => p.id === 'dao_tu')!.weapons).toContain(GREATBLADE_WEAPON);
    for (const p of PATHS.filter((p) => p.id !== 'dao_tu')) expect(p.weapons).not.toContain(GREATBLADE_WEAPON);
  });

  it('mũi +Y, cán ở gốc, dài theo chiều cao, đủ màu đỉnh, tam giác trong ngân sách', () => {
    const h = 1.7;
    const g = greatbladeGeometry(h);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.max.y).toBeGreaterThan(greatbladeLength(h) * 0.9);
    expect(bb.min.y).toBeLessThan(-0.15); // cán + khâu vòng + tua phía dưới tâm nắm
    expect(bb.min.y).toBeGreaterThan(-0.6);
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    expect(g.getAttribute('position').count / 3).toBeLessThan(1200);
    const tall = greatbladeGeometry(2.0);
    tall.computeBoundingBox();
    expect(tall.boundingBox!.max.y).toBeGreaterThan(bb.max.y);
    for (const v of g.getAttribute('position').array) expect(Number.isFinite(v)).toBe(true);
  });

  it('một mesh, vật liệu dùng chung, bladeLen phủ cả đoạn lưỡi', () => {
    const a = greatbladeMesh(1.7);
    const b = greatbladeMesh(1.7);
    expect(a.mesh).toBeInstanceOf(THREE.Mesh);
    expect(a.mesh.material).toBe(b.mesh.material);
    expect(a.len).toBeGreaterThan(greatbladeLength(1.7));
    expect(a.mesh.frustumCulled).toBe(false);
  });
});
