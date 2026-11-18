import { describe, expect, it } from 'vitest';
import { allTPos, clusterReach, MIN_TOUCH, tposTouch, touchCluster, TG } from './touchLayout';

describe('touchLayout', () => {
  const c = touchCluster();
  const all = allTPos(c);
  it('mọi nút ≥ 44 px', () => {
    for (const p of all) expect(p.d).toBeGreaterThanOrEqual(MIN_TOUCH);
  });
  it('các nút không chạm nhau (chừa ≥ 4 px)', () => {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) expect(tposTouch(all[i]!, all[j]!, 3), `${i}×${j}`).toBe(false);
    }
  });
  it('không nút nào lấn qua mép phải màn hình (nút lớn cách mép `inset`)', () => {
    const right = TG.inset + TG.main / 2; // khoảng từ tâm nút lớn tới mép phải
    for (const p of all) expect(p.dx + p.d / 2).toBeLessThanOrEqual(right - 4);
  });
  it('bản gọn (màn dọc 390 px): đủ 6 nút phụ trong bề rộng, không chạm nhau, ≥ 44 px', () => {
    const k = touchCluster(true);
    const a = allTPos(k);
    for (const p of a) expect(p.d).toBeGreaterThanOrEqual(MIN_TOUCH);
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) expect(tposTouch(a[i]!, a[j]!, 3), `${i}×${j}`).toBe(false);
    }
    expect(clusterReach(k).left + TG.inset + TG.main / 2).toBeLessThanOrEqual(390);
  });
  it('cụm vừa màn hình ngang 667×375 (iPhone SE ngang) về chiều cao', () => {
    const { up } = clusterReach(c);
    expect(up + TG.inset + TG.main / 2).toBeLessThan(375 * 0.8);
  });
});
