import { describe, expect, it } from 'vitest';
import { LEVELS } from '@dtl/content';
import { PLAY_BOUNDS } from '@dtl/shared';
import { clampView, placeLabels, fitScale, fitView, MAX_SCALE, panBy, parseLayers, pick, screenToWorld, soloSpawns, worldToScreen, zoneInfos, zoomAt } from './model';

const SIZE = { w: 660, h: 560 };

describe('bản đồ lớn: bộ lọc', () => {
  it('đọc bộ lọc đã lưu, hỏng thì mặc định bật hết', () => {
    expect(parseLayers(null)).toEqual({ npc: true, quest: true, mon: true, gather: true, tele: true });
    expect(parseLayers('{"mon":false,"x":1,"npc":"no"}')).toEqual({ npc: true, quest: true, mon: false, gather: true, tele: true });
    expect(parseLayers('not json').mon).toBe(true);
  });
});

describe('bản đồ lớn: dữ liệu vùng', () => {
  const infos = zoneInfos(LEVELS.van_lam);
  it('mỗi vùng có quái, danh sách sắp theo cấp, tinh anh nằm trong vùng', () => {
    expect(infos.length).toBe(LEVELS.van_lam.zones!.length);
    for (const zi of infos) {
      expect(zi.monsters.length).toBeGreaterThan(0);
      for (let i = 1; i < zi.monsters.length; i++) expect(zi.monsters[i].lvMin).toBeGreaterThanOrEqual(zi.monsters[i - 1].lvMin);
    }
    expect(infos.some((z) => z.elites.length > 0)).toBe(true);
    expect(infos.some((z) => z.resources.length > 0)).toBe(true);
    for (let i = 1; i < infos.length; i++) expect(infos[i].zone.lvMin).toBeGreaterThanOrEqual(infos[i - 1].zone.lvMin);
  });
  it('boss thế giới nằm trong các điểm sinh lẻ', () => {
    expect(soloSpawns(LEVELS.van_lam).some((s) => s.boss)).toBe(true);
  });
});

describe('bản đồ lớn: kéo và zoom', () => {
  it('vừa khung lúc đầu, chiếu hai chiều khớp nhau', () => {
    const v = fitView(SIZE);
    expect(v.scale).toBeCloseTo(fitScale(SIZE));
    const p = worldToScreen(v, SIZE, 2100, 2000);
    const w = screenToWorld(v, SIZE, p.x, p.y);
    expect(w.x).toBeCloseTo(2100);
    expect(w.z).toBeCloseTo(2000);
  });
  it('zoom quanh con trỏ giữ nguyên điểm dưới con trỏ, có chặn trên dưới', () => {
    const v = clampView({ cx: 2048, cz: 2048, scale: 0.6 }, SIZE);
    const before = screenToWorld(v, SIZE, 400, 200);
    const z = zoomAt(v, SIZE, 1.5, 400, 200);
    const after = screenToWorld(z, SIZE, 400, 200);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.z).toBeCloseTo(before.z, 3);
    expect(zoomAt(v, SIZE, 1000, 10, 10).scale).toBe(MAX_SCALE);
    expect(zoomAt(v, SIZE, 0.0001, 10, 10).scale).toBeCloseTo(fitScale(SIZE));
  });
  it('kéo không ra khỏi vùng chơi', () => {
    let v = clampView({ cx: 2048, cz: 2048, scale: 1.5 }, SIZE);
    v = panBy(v, SIZE, 1e6, 1e6);
    expect(v.cx).toBeLessThanOrEqual(PLAY_BOUNDS.x1);
    expect(v.cx - SIZE.w / v.scale / 2).toBeCloseTo(PLAY_BOUNDS.x0);
    v = panBy(v, SIZE, -1e7, -1e7);
    expect(v.cx + SIZE.w / v.scale / 2).toBeCloseTo(PLAY_BOUNDS.x1);
  });
  it('chọn biểu tượng gần nhất trong tầm', () => {
    const pts = [
      { x: 10, y: 10, r: 4, n: 'a' },
      { x: 40, y: 10, r: 4, n: 'b' },
    ];
    expect(pick(pts, 12, 10)?.n).toBe('a');
    expect(pick(pts, 100, 100)).toBeNull();
  });
});

describe('bản đồ lớn: xếp nhãn', () => {
  it('nhãn đè nhau thì đẩy lên, nhãn xa nhau giữ nguyên', () => {
    const a = { x: 100, y: 100, w: 80, h: 30 };
    const b = { x: 110, y: 95, w: 80, h: 30 };
    const far = { x: 400, y: 100, w: 80, h: 30 };
    placeLabels([a, b, far]);
    expect(a.y).toBe(100);
    expect(far.y).toBe(100);
    expect(b.y).toBeLessThanOrEqual(a.y - a.h);
  });
  it('ba nhãn chồng cùng chỗ thì xếp thành cột, không còn đè', () => {
    const items = [0, 1, 2].map(() => ({ x: 50, y: 200, w: 60, h: 20 }));
    placeLabels(items);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(items[j].y - items[j].h).toBeLessThan(items[i].y);
    expect(new Set(items.map((q) => q.y)).size).toBe(3);
    expect(items[1].y).toBeLessThanOrEqual(items[0].y - 20);
    expect(items[2].y).toBeLessThanOrEqual(items[1].y - 20);
  });
});
