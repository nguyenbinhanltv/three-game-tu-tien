import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { ARTIFACTS } from '@dtl/content';
import { buildProcProp, hasProcProp, hon_phien_geometry, HON_PHIEN_COLORS, HON_PHIEN_HEIGHT } from './procProps';

describe('vật dụng dựng bằng mã (TN-2: hồn phiên)', () => {
  it('mọi pháp bảo có cờ proc đều có hàm dựng; pháp bảo không có cờ thì không', () => {
    const proc = ARTIFACTS.filter((a) => a.proc);
    expect(proc.map((a) => a.id)).toContain('itm_hon_phien');
    for (const a of proc) expect(hasProcProp(a.asset), a.asset).toBe(true);
    for (const a of ARTIFACTS.filter((x) => !x.proc)) expect(hasProcProp(a.asset), a.asset).toBe(false);
    expect(buildProcProp('prop_khong_co')).toBeNull();
  });
  it('hồn phiên: một lưới một vật liệu (một draw call), dưới 400 tam giác, đúng cỡ và gốc ở chân cán', () => {
    const p = buildProcProp('prop_hon_phien')!;
    const meshes: THREE.Mesh[] = [];
    p.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    expect(meshes).toHaveLength(1);
    const geo = meshes[0]!.geometry;
    expect(Array.isArray(meshes[0]!.material)).toBe(false);
    expect(geo.getAttribute('position').count / 3).toBeLessThan(400);
    expect(geo.getAttribute('color').count).toBe(geo.getAttribute('position').count);
    geo.computeBoundingBox();
    const b = geo.boundingBox!;
    expect(b.min.y).toBeCloseTo(0, 3);
    expect(b.max.y).toBeGreaterThan(HON_PHIEN_HEIGHT);
    expect(b.max.y).toBeLessThan(HON_PHIEN_HEIGHT + 0.1);
    // Lá phiên nằm một phía của cán (đuôi én rủ xuống), không rộng quá 0,25 m.
    expect(b.max.x).toBeGreaterThan(0.15);
    expect(b.max.x).toBeLessThan(0.25);
    p.dispose();
  });
  it('màu đỉnh chỉ lấy từ bảng màu concept (không phát sáng, không màu lạ)', () => {
    const geo = hon_phien_geometry();
    const col = geo.getAttribute('color');
    const allowed = Object.values(HON_PHIEN_COLORS).map((h) => new THREE.Color(h));
    const seen = new Set<number>();
    for (let i = 0; i < col.count; i++) {
      const k = allowed.findIndex((c) => Math.abs(c.r - col.getX(i)) + Math.abs(c.g - col.getY(i)) + Math.abs(c.b - col.getZ(i)) < 1e-4);
      expect(k, `đỉnh ${i}`).toBeGreaterThanOrEqual(0);
      seen.add(k);
    }
    expect(seen.size).toBe(allowed.length);
    geo.dispose();
  });
});
