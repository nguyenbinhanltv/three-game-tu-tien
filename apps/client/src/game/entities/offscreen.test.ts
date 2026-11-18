import { describe, expect, it } from 'vitest';
import { LEVELS, NPCS, QUEST } from '@dtl/content';
import { levelSpawns, MS_DEAD } from '@dtl/shared';
import { avoidRects, DEFAULT_INSET, edgePlace, INDICATOR_EXTENT, nearestGoalSpot, questGoal, trackedQuestId } from './offscreen';

// Chiếu phối cảnh fov 60°, khung 1600×900.
const W = 1600;
const H = 900;
const P11 = 1 / Math.tan(Math.PI / 6);
const P00 = P11 / (W / H);

describe('edgePlace', () => {
  it('ẩn khi điểm nằm giữa khung nhìn', () => {
    expect(edgePlace(0, 0, -20, P00, P11, W, H)).toBeNull();
    expect(edgePlace(5, 2, -20, P00, P11, W, H)).toBeNull();
  });

  it('bám mép phải khi điểm lệch xa sang phải', () => {
    const at = edgePlace(100, 0, -20, P00, P11, W, H)!;
    expect(at).not.toBeNull();
    expect(at.x).toBeCloseTo(W - DEFAULT_INSET.right);
    expect(Math.abs(at.angle)).toBeLessThan(0.01);
  });

  it('điểm sau lưng camera hơi thấp → mép dưới, không bị lật lên trên', () => {
    const at = edgePlace(0.5, -3, 15, P00, P11, W, H)!;
    expect(at.y).toBeCloseTo(H - DEFAULT_INSET.bottom);
    expect(at.angle).toBeGreaterThan(0);
  });

  it('điểm sau lưng lệch trái → nửa trái màn hình', () => {
    const at = edgePlace(-10, -1, 10, P00, P11, W, H)!;
    expect(at.x).toBeLessThan(W / 2);
  });

  it('ngay sau lưng (vx = vy = 0) → chỉ xuống', () => {
    const at = edgePlace(0, 0, 10, P00, P11, W, H)!;
    expect(at.y).toBeCloseTo(H - DEFAULT_INSET.bottom);
    expect(at.angle).toBeCloseTo(Math.PI / 2);
  });

  it('luôn nằm trong khung lề', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      for (const vz of [-5, 5]) {
        const at = edgePlace(Math.cos(a) * 50, Math.sin(a) * 50, vz, P00, P11, W, H);
        if (!at) continue;
        expect(at.x).toBeGreaterThanOrEqual(DEFAULT_INSET.left - 1e-6);
        expect(at.x).toBeLessThanOrEqual(W - DEFAULT_INSET.right + 1e-6);
        expect(at.y).toBeGreaterThanOrEqual(DEFAULT_INSET.top - 1e-6);
        expect(at.y).toBeLessThanOrEqual(H - DEFAULT_INSET.bottom + 1e-6);
      }
    }
  });
});

describe('avoidRects', () => {
  const chat = { left: 14, top: 708, right: 374, bottom: 886 };
  const rightCol = { left: 1396, top: 14, right: 1586, bottom: 260 };
  it('mép trái bị khung chat che → trượt lên trên chat', () => {
    const at = { x: DEFAULT_INSET.left, y: 720, angle: Math.PI };
    avoidRects(at, [chat, rightCol], W, H);
    expect(at.y).toBeCloseTo(chat.top - INDICATOR_EXTENT.down);
    expect(at.x).toBe(DEFAULT_INSET.left);
  });
  it('mép phải dưới cột bản đồ nhỏ → trượt xuống dưới cột', () => {
    const at = { x: W - DEFAULT_INSET.right, y: 120, angle: 0 };
    avoidRects(at, [chat, rightCol], W, H);
    expect(at.y).toBeCloseTo(rightCol.bottom + INDICATOR_EXTENT.up);
  });
  it('mép dưới trên khung chat → trượt ngang sang phải chat', () => {
    const at = { x: 200, y: H - DEFAULT_INSET.bottom, angle: Math.PI / 2 };
    avoidRects(at, [chat], W, H);
    expect(at.x).toBeCloseTo(chat.right + INDICATOR_EXTENT.side);
  });
  it('không chạm khối nào thì giữ nguyên', () => {
    const at = { x: 800, y: H - DEFAULT_INSET.bottom, angle: Math.PI / 2 };
    avoidRects(at, [chat, rightCol], W, H);
    expect(at).toEqual({ x: 800, y: H - DEFAULT_INSET.bottom, angle: Math.PI / 2 });
  });
});

describe('questGoal', () => {
  it('nhiệm vụ diệt quái chưa xong → quái; xong → NPC trả', () => {
    const q = QUEST.get('q_diet_soi')!;
    expect(questGoal(q, [2], NPCS)).toEqual({ kind: 'mon', mon: 'mon_soi_xam' });
    expect(questGoal(q, [6], NPCS)).toEqual({ kind: 'npc', npc: q.turnin, turnin: true });
  });

  it('hái thuốc → điểm hái; luyện đan → NPC có lò', () => {
    expect(questGoal(QUEST.get('q_hai_thuoc')!, [0], NPCS)).toEqual({ kind: 'node', item: 'itm_linh_thao' });
    const g = questGoal(QUEST.get('q_luyen_dan')!, [], NPCS);
    expect(g).toEqual({ kind: 'npc', npc: NPCS.find((n) => n.recipes)!.id, turnin: false });
  });

  it('chỉ còn mục tiêu không có chỗ (cảnh giới, ngự kiếm) → không chỉ', () => {
    expect(questGoal(QUEST.get('q_ngu_kiem')!, [0, 0], NPCS)).toBeNull();
  });
});

describe('nearestGoalSpot', () => {
  const lv = LEVELS.van_lam!;
  it('chọn con quái sống gần nhất, bỏ con đã chết', () => {
    const mons = new Map([
      ['a', { t: 'mon_soi_xam', st: MS_DEAD, x: 1, y: 0, z: 0 }],
      ['b', { t: 'mon_soi_xam', st: 0, x: 30, y: 0, z: 0 }],
      ['c', { t: 'mon_soi_xam', st: 0, x: 90, y: 0, z: 0 }],
      ['d', { t: 'mon_yeu_lang', st: 0, x: 2, y: 0, z: 0 }],
    ]);
    expect(nearestGoalSpot({ kind: 'mon', mon: 'mon_soi_xam' }, 0, 0, mons, new Map(), lv)).toEqual({ id: 'b' });
  });

  it('không có con nào đang sống → tâm vùng xuất hiện', () => {
    const spawn = levelSpawns(lv)
      .filter((s) => s.mon === 'mon_soi_xam')
      .sort((a, b) => a.x ** 2 + a.z ** 2 - (b.x ** 2 + b.z ** 2))[0]!;
    expect(nearestGoalSpot({ kind: 'mon', mon: 'mon_soi_xam' }, 0, 0, new Map(), new Map(), lv)).toEqual({ x: spawn.x, z: spawn.z });
  });

  it('điểm hái đã bị hái (on=false) bị bỏ qua', () => {
    const nodes = new Map([
      ['n1', { t: 'itm_linh_thao', on: false, x: 1, y: 0, z: 0 }],
      ['n2', { t: 'itm_linh_thao', on: true, x: 40, y: 0, z: 0 }],
    ]);
    expect(nearestGoalSpot({ kind: 'node', item: 'itm_linh_thao' }, 0, 0, new Map(), nodes, lv)).toEqual({ id: 'n2' });
  });
});

describe('trackedQuestId', () => {
  it('nhiệm vụ đầu không có đích (chỉ cảnh giới/ngự kiếm) → chọn nhiệm vụ kế có đích', () => {
    const quests = { active: { q_ngu_kiem: [0, 0], q_diet_soi: [1] }, done: [] };
    expect(Object.keys(quests.active)[0]).toBe('q_ngu_kiem');
    expect(trackedQuestId(quests, '')).toBe('q_diet_soi');
  });
  it('nhiệm vụ đã ghim thắng, kể cả khi không có đích', () => {
    const quests = { active: { q_diet_soi: [1], q_ngu_kiem: [0, 0] }, done: [] };
    expect(trackedQuestId(quests, 'q_ngu_kiem')).toBe('q_ngu_kiem');
  });
  it('ghim nhiệm vụ đã trả/không còn nhận → bỏ qua ghim', () => {
    const quests = { active: { q_diet_soi: [1] }, done: ['q_hai_thuoc'] };
    expect(trackedQuestId(quests, 'q_hai_thuoc')).toBe('q_diet_soi');
  });
  it('không nhiệm vụ nào có đích → rỗng', () => {
    expect(trackedQuestId({ active: { q_ngu_kiem: [0, 0] }, done: [] }, '')).toBe('');
  });
});

describe('spreadFrom (M-4): chỉ báo trùng chỗ', () => {
  it('đẩy ngang khỏi chỉ báo đã đặt, không đụng chỉ báo xa', async () => {
    const { spreadFrom } = await import('./offscreen');
    const placed = [{ x: 640, y: 40 }];
    const a = { x: 640, y: 40, angle: 0 };
    spreadFrom(a, placed, 1, 1280);
    expect(a.x).toBeGreaterThan(640 + 40);
    const far = { x: 200, y: 40, angle: 0 };
    spreadFrom(far, placed, 1, 1280);
    expect(far.x).toBe(200);
    const other = { x: 640, y: 400, angle: 0 };
    spreadFrom(other, placed, 1, 1280);
    expect(other.x).toBe(640);
  });
  it('sát mép phải thì trượt sang trái, không ra khỏi khung', async () => {
    const { spreadFrom, DEFAULT_INSET } = await import('./offscreen');
    const edge = 1280 - DEFAULT_INSET.right;
    const a = { x: edge, y: 40, angle: 0 };
    spreadFrom(a, [{ x: edge, y: 40 }], 1, 1280);
    expect(a.x).toBeLessThan(edge);
    expect(a.x).toBeGreaterThanOrEqual(DEFAULT_INSET.left);
  });
});
