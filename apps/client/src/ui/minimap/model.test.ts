import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestView } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import {
  backingScale,
  clampZoom,
  difficultyTone,
  edgeClamp,
  formatCountdown,
  nearestIndex,
  npcFunction,
  npcQuestMark,
  project,
  zoneStatus,
  ZOOM_SPANS,
} from './model';

const qd = (o: Partial<QuestDef> & { id: string }): QuestDef =>
  ({ giver: 'a', turnin: 'a', objectives: [{ type: 'kill', target: 'm', count: 2 }], rewards: { xp: 1, gold: 1 }, ...o }) as QuestDef;
const none: QuestView = { active: {}, done: [] };

describe('minimap model', () => {
  it('ba mức phóng 120/250/500 và kẹp chỉ số', () => {
    expect([...ZOOM_SPANS]).toEqual([120, 250, 500]);
    expect(clampZoom(-3)).toBe(0);
    expect(clampZoom(9)).toBe(2);
  });

  it('màu độ khó theo chênh cấp', () => {
    expect(difficultyTone(1, 10)).toBe('gray');
    expect(difficultyTone(7, 10)).toBe('white');
    expect(difficultyTone(10, 10)).toBe('white');
    expect(difficultyTone(12, 10)).toBe('yellow');
    expect(difficultyTone(13, 10)).toBe('red');
  });

  it('chức năng NPC suy từ dữ liệu', () => {
    expect(npcFunction({ id: 'x', x: 0, z: 0, yaw: 0, color: '', enhance: true, recipes: true })).toBe('smith');
    expect(npcFunction({ id: 'x', x: 0, z: 0, yaw: 0, color: '', recipes: true, sells: ['i'] })).toBe('alchemy');
    expect(npcFunction({ id: 'x', x: 0, z: 0, yaw: 0, color: '', sells: ['i'] })).toBe('trade');
    expect(npcFunction({ id: 'x', x: 0, z: 0, yaw: 0, color: '', rootChange: true })).toBe('root');
    expect(npcFunction({ id: 'x', x: 0, z: 0, yaw: 0, color: '' })).toBe('quest');
  });

  it('dấu nhiệm vụ: mới (!), đang làm, trả (?)', () => {
    const q1 = qd({ id: 'q1' });
    const q2 = qd({ id: 'q2', requires: 'q1' });
    expect(npcQuestMark('a', [q1, q2], none, 1)).toBe('give');
    expect(npcQuestMark('a', [q2], none, 1)).toBe('');
    expect(npcQuestMark('a', [q1], { active: { q1: [0] }, done: [] }, 1)).toBe('wait');
    expect(npcQuestMark('a', [q1], { active: { q1: [2] }, done: [] }, 1)).toBe('turn');
    expect(npcQuestMark('a', [q1, q2], { active: { q1: [2] }, done: [] }, 1)).toBe('turn');
    expect(npcQuestMark('a', [qd({ id: 'q3', minLevel: 5 })], none, 4)).toBe('');
    expect(npcQuestMark('b', [q1], none, 1)).toBe('');
  });

  it('phép chiếu: Bắc lên trên, xoay theo yaw đưa hướng nhìn lên trên', () => {
    const v = { cx: 100, cz: 100, span: 100, size: 200, rot: 0 };
    const n = project(v, 100, 50); // Bắc = −z
    expect(n.x).toBeCloseTo(100);
    expect(n.y).toBeCloseTo(0);
    const e = project(v, 150, 100);
    expect(e.x).toBeCloseTo(200);
    // camera yaw: hướng nhìn = (−sin yaw, −cos yaw); sau khi xoay bản đồ một góc yaw thì nằm thẳng phía trên
    const yaw = 0.9;
    const f = project({ ...v, rot: yaw }, 100 - Math.sin(yaw) * 30, 100 - Math.cos(yaw) * 30);
    expect(f.x).toBeCloseTo(100);
    expect(f.y).toBeLessThan(100);
  });

  it('mũi tên mép: kẹp vào khung và đánh dấu trong/ngoài', () => {
    expect(edgeClamp(100, 100, 200, 10).inside).toBe(true);
    const e = edgeClamp(500, 100, 200, 10);
    expect(e.inside).toBe(false);
    expect(e.x).toBeCloseTo(190);
    expect(e.y).toBeCloseTo(100);
    expect(e.angle).toBeCloseTo(0);
    const d = edgeClamp(-300, -300, 200, 10);
    expect(d.x).toBeCloseTo(10);
    expect(d.y).toBeCloseTo(10);
  });

  it('chọn biểu tượng gần con trỏ nhất, ngoài bán kính thì không', () => {
    const pts = [
      { x: 10, y: 10, r: 4 },
      { x: 30, y: 10, r: 4 },
    ];
    expect(nearestIndex(pts, 12, 10)).toBe(0);
    expect(nearestIndex(pts, 28, 12)).toBe(1);
    expect(nearestIndex(pts, 100, 100)).toBe(-1);
  });

  it('đồng hồ hồi sinh', () => {
    expect(formatCountdown(65.2)).toBe('1:06');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('vùng đứng và trạng thái hợp cấp', () => {
    const zones = LEVELS.van_lam.zones!;
    const z = zones[0];
    const cx = z.poly.reduce((a, p) => a + p[0], 0) / z.poly.length;
    const cz = z.poly.reduce((a, p) => a + p[1], 0) / z.poly.length;
    expect(zoneStatus(zones, cx, cz, z.lvMin).status).toBe('ok');
    expect(zoneStatus(zones, cx, cz, z.lvMax + 5).status).toBe('high');
    expect(zoneStatus(zones, 10, 10, 3).status).toBe('none');
  });
});

describe('screenToWorld', () => {
  it('ngược của project ở cả hai chế độ', async () => {
    const { screenToWorld } = await import('./model');
    for (const rot of [0, 0.7, -2.1]) {
      const v = { cx: 2000, cz: 2100, span: 250, size: 176, rot };
      const p = project(v, 2055, 2040);
      const w = screenToWorld(v, p.x, p.y);
      expect(w.x).toBeCloseTo(2055, 4);
      expect(w.z).toBeCloseTo(2040, 4);
    }
  });
});

describe('backingScale', () => {
  it('nhân DPR với hệ số HUD, làm tròn lên 0,25, kẹp 1..4', () => {
    expect(backingScale(1, 1)).toBe(1);
    expect(backingScale(1, 1.35)).toBe(1.5);
    expect(backingScale(1.5, 2)).toBe(3);
    expect(backingScale(3, 2)).toBe(4);
    expect(backingScale(0, 0)).toBe(1);
  });
});
