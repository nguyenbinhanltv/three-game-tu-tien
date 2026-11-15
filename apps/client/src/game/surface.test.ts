import { describe, expect, it } from 'vitest';
import { heightAt, LAKE, PORTAL_PAD, SECT, VALLEY, WATER_Y } from '@dtl/shared';
import { pathPolylines } from '../render/groundMask';
import { shorePoints } from './soundscape';
import { ROCK_SLOPE, SURFACES, surfaceAt, WOOD_ZONES } from './surface';

describe('surfaceAt', () => {
  it('sân tông môn, bệ cổng bí cảnh và bậc thang là đá', () => {
    expect(surfaceAt(SECT.x, 2088)).toBe('stone');
    expect(surfaceAt(PORTAL_PAD.x, PORTAL_PAD.z)).toBe('stone');
    expect(surfaceAt(SECT.x, 2150)).toBe('stone');
  });
  it('bí cảnh luôn là nền đá', () => {
    expect(surfaceAt(900, 1000, 'kiem_trung')).toBe('stone');
  });
  it('lòng hồ là nước nông, bờ hồ có cát rồi tới nước', () => {
    // Tâm hồ là đảo (ISLAND_R) nên lấy điểm lòng hồ cách tâm 150 m.
    expect(surfaceAt(LAKE.x + 150, LAKE.z)).toBe('water');
    const shore = shorePoints();
    expect(shore.length).toBeGreaterThanOrEqual(3);
    // Đi xuyên qua điểm bờ theo hướng từ tâm hồ: phải gặp cả cát (phía đất liền) lẫn nước.
    const p = shore[Math.floor(shore.length / 2)];
    const d = Math.hypot(p.x - LAKE.x, p.z - LAKE.z);
    const kinds = new Set<string>();
    for (let k = -6; k <= 14; k++) {
      const r = d + k;
      kinds.add(surfaceAt(LAKE.x + ((p.x - LAKE.x) / d) * r, LAKE.z + ((p.z - LAKE.z) / d) * r));
    }
    expect(kinds.has('sand')).toBe(true);
    expect(kinds.has('water')).toBe(true);
  });
  it('đường mòn là đất (ngoài sân đá và ngoài hồ)', () => {
    let dirt = 0;
    for (const line of pathPolylines()) for (const q of line) if (surfaceAt(q.x, q.z) === 'dirt') dirt++;
    expect(dirt).toBeGreaterThan(30);
  });
  it('thung lũng bằng phẳng là cỏ; có sườn dốc là đá', () => {
    expect(surfaceAt(VALLEY.x + 150, VALLEY.z + 120)).toBe('grass');
    let rock = 0;
    for (let x = 400; x < 1200; x += 20) for (let z = 2800; z < 3600; z += 20) if (surfaceAt(x, z) === 'stone' && heightAt(x, z) > WATER_Y) rock++;
    expect(rock).toBeGreaterThan(0);
    expect(ROCK_SLOPE).toBeGreaterThan(0.3);
  });
  it('mọi kết quả thuộc danh sách chất liệu; chưa có sàn gỗ nên không ra gỗ', () => {
    expect(WOOD_ZONES.length).toBe(0);
    for (let i = 0; i < 200; i++) expect(SURFACES).toContain(surfaceAt(300 + i * 17, 300 + ((i * 53) % 3500)));
  });
});
