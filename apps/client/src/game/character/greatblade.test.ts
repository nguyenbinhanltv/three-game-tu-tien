import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PATHS } from '@dtl/content';
import {
  bladeGeometry,
  bladeSteelColor,
  GREATBLADE_WEAPON,
  greatbladeGeometry,
  greatbladeLength,
  greatbladeMesh,
  roughnessData,
} from './greatblade';

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
    expect(g.getAttribute('position').count / 3).toBeLessThan(4000);
    expect(g.getAttribute('uv').count).toBe(g.getAttribute('position').count);
    expect(g.getAttribute('normal').count).toBe(g.getAttribute('position').count);
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

  it('lưỡi thép vân: màu đổi theo sống/cạnh/rãnh máu/hamon, rìa mài sáng, sống tối', () => {
    const lum = (s: number, v: number): number => {
      const c = bladeSteelColor(s, v);
      return c.r + c.g + c.b;
    };
    expect(lum(0.99, 0.3)).toBeGreaterThan(lum(0.5, 0.3)); // rìa mài sáng hơn thân
    expect(lum(0.02, 0.3)).toBeLessThan(lum(0.5, 0.3)); // sống tối
    expect(lum(0.28, 0.4)).toBeLessThan(lum(0.45, 0.4)); // rãnh máu tối
    const hamon = 0.7 + 0.035 * Math.sin(0.4 * 38) + 0.02 * Math.sin(0.4 * 91 + 1.3);
    expect(lum(hamon, 0.4)).toBeGreaterThan(lum(0.55, 0.4)); // đường nhiệt luyện sáng
    const g = greatbladeGeometry(1.7);
    const col = g.getAttribute('color');
    const set = new Set<string>();
    for (let i = 0; i < col.count; i += 3) set.add(`${col.getX(i).toFixed(2)},${col.getY(i).toFixed(2)}`);
    expect(set.size).toBeGreaterThan(30); // nhiều sắc độ, không phải khối phẳng
  });

  it('lưỡi hơi cong về phía cạnh, sống dày hơn cạnh, mũi vát', () => {
    const L = 1.0;
    const g = bladeGeometry(L, 0.06, 0.02, 0.1, 0.05);
    g.computeBoundingBox();
    const pos = g.getAttribute('position');
    let tipX = -Infinity;
    let midX = -Infinity;
    let zSpine = 0;
    let zEdge = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0.1 + L * 0.99) tipX = Math.max(tipX, pos.getX(i));
      if (Math.abs(y - (0.1 + L * 0.5)) < 0.02) {
        midX = Math.max(midX, pos.getX(i));
        if (pos.getX(i) < -0.04) zSpine = Math.max(zSpine, Math.abs(pos.getZ(i)));
        if (pos.getX(i) > 0.04) zEdge = Math.max(zEdge, Math.abs(pos.getZ(i)));
      }
    }
    expect(zSpine).toBeGreaterThan(zEdge); // sống dày
    expect(tipX).toBeLessThan(-0.005); // mũi vát về phía sống (đã trừ độ cong 0,05)
    expect(g.boundingBox!.max.x).toBeGreaterThan(0.06); // cong làm lưỡi lệch ra ngoài bản rộng
    expect(midX).toBeGreaterThan(0.06);
  });

  it('bản đồ độ nhám thủ tục: có biến thiên trên lưỡi, rìa mài bóng hơn, vùng ngoài lưỡi nhám vừa', () => {
    const w = 32;
    const h = 64;
    const d = roughnessData(w, h);
    expect(d.length).toBe(w * h * 4);
    const r = (x: number, y: number): number => d[(y * w + x) * 4 + 1]! / 255;
    expect(r(0, 10)).toBeCloseTo(0.45, 1);
    expect(r(w - 1, 10)).toBeLessThan(0.2); // rìa
    const vals = new Set<number>();
    for (let x = 6; x < 26; x++) vals.add(Math.round(r(x, 20) * 50));
    expect(vals.size).toBeGreaterThan(3);
    const m = greatbladeMesh(1.7).mesh.material as THREE.MeshStandardMaterial;
    expect(m.roughnessMap).toBeTruthy();
    expect(m.metalness).toBeGreaterThan(0.5);
  });

  it('bản lưỡi rộng dần về mũi (đao), không đều bản như kiếm thẳng', () => {
    const widthAt = (g: THREE.BufferGeometry, y: number): number => {
      const pos = g.getAttribute('position');
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < pos.count; i++)
        if (Math.abs(pos.getY(i) - y) < 0.02) {
          lo = Math.min(lo, pos.getX(i));
          hi = Math.max(hi, pos.getX(i));
        }
      return hi - lo;
    };
    const L = 1.0;
    const g = bladeGeometry(L, 0.06, 0.02, 0.1, 0);
    expect(widthAt(g, 0.1 + L * 0.8)).toBeGreaterThan(widthAt(g, 0.1 + L * 0.1) * 1.15);
  });
});
