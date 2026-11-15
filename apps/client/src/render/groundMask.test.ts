import { describe, expect, it } from 'vitest';
import { LAKE, SECT, WATER_Y, WORLD_SIZE } from '@dtl/shared';
import { distToPaths, MASK_RES, maskPixel, PATH_HALF_WIDTH, pathPolylines } from './groundMask';

const px = (x: number, z: number) => {
  const out = new Uint8ClampedArray(4);
  maskPixel(Math.floor((x / WORLD_SIZE) * MASK_RES), Math.floor((z / WORLD_SIZE) * MASK_RES), pathPolylines(), out, 0);
  return out;
};

describe('groundMask', () => {
  const lines = pathPolylines();
  it('đường mòn nối các khu và liền mạch', () => {
    expect(lines.length).toBeGreaterThanOrEqual(4);
    for (const l of lines) for (let i = 1; i < l.length; i++) expect(Math.hypot(l[i].x - l[i - 1].x, l[i].z - l[i - 1].z)).toBeLessThan(60);
  });
  it('khoảng cách tới đường mòn: 0 trên đường, Infinity ở xa', () => {
    expect(distToPaths(lines[0][5].x, lines[0][5].z, lines)).toBeLessThan(0.01);
    expect(distToPaths(10, 10, lines)).toBe(Infinity);
  });
  it('R ≈ 0,5 trên tim đường (ô 4 m nên lệch nhẹ), thấp hẳn ngoài đường', () => {
    const p = lines[1][10];
    expect(px(p.x, p.z)[0]).toBeGreaterThan(100);
    expect(px(p.x + 60, p.z + 60)[0]).toBeLessThan(60);
  });
  it('sân tông môn là sân lát đá, ngoài sân thì không', () => {
    expect(px(SECT.x, SECT.z)[1]).toBeGreaterThan(200);
    expect(px(SECT.x + 250, SECT.z)[1]).toBe(0);
  });
  it('cát ven hồ ở độ cao gần mặt nước, không có ngoài khu hồ', () => {
    expect(px(10, 4000)[2]).toBe(0);
    expect(WATER_Y).toBeGreaterThan(LAKE.y);
  });
  it('nửa bề rộng đường mòn hợp lý', () => {
    expect(PATH_HALF_WIDTH).toBeGreaterThan(1);
  });
});
