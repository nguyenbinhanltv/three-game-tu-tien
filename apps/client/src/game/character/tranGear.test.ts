import { describe, expect, it } from 'vitest';
import { PATHS } from '@dtl/content';
import { TRAN_KY_WEAPON, tranKyGeometry, tranKyLength, tranKyMesh } from './tranGear';

describe('Cấm chế sư: cờ trận thủ tục', () => {
  it('chỉ hướng cam_che_su khai cờ trận', () => {
    expect(PATHS.find((p) => p.id === 'cam_che_su')!.weapons).toContain(TRAN_KY_WEAPON);
    for (const p of PATHS.filter((p) => p.id !== 'cam_che_su')) expect(p.weapons).not.toContain(TRAN_KY_WEAPON);
  });

  it('mesh gộp một khối có màu đỉnh, cao hơn cán một chút, tỉ lệ theo chiều cao nhân vật', () => {
    const g = tranKyGeometry(1.7);
    expect(g.getAttribute('color')).toBeDefined();
    g.computeBoundingBox();
    const L = tranKyLength(1.7);
    expect(g.boundingBox!.max.y).toBeGreaterThan(L / 2);
    expect(g.boundingBox!.min.y).toBeLessThan(-L / 2 + 0.01);
    expect(tranKyLength(1.87)).toBeCloseTo(tranKyLength(1.7) * 1.1, 5);
    const { mesh, len } = tranKyMesh(1.7);
    expect(mesh.name).toBe('dtl_tran_ky');
    expect(len).toBeGreaterThan(L / 2);
  });
});
