import { describe, expect, it } from 'vitest';
import { DAO_UNLOCK_LEVEL, MAX_LEVEL, peakGated, TRIB_DEFS } from '@dtl/shared';
import { CHAPTERS, ITEM, LEVELS, MONSTER, NPC, QUESTS, RECIPES } from './index';

// TN-3: chương 6 (Vấn Đỉnh) khép kín: kiếp bật có vật phẩm và công thức, nhiệm vụ nối liền, phó bản có cổng, NPC Đạo Sư có tab Đạo.
describe('chương 6 Vấn Đỉnh', () => {
  it('ba kiếp mới đã bật, có đan đột phá chế được; đại viên mãn 35/39/43 không còn bị chặn', () => {
    for (const id of ['van_dinh', 'am_hu', 'duong_thuc'] as const) {
      const d = TRIB_DEFS[id];
      expect(d.enabled, id).toBe(true);
      expect(d.item && ITEM.has(d.item), id).toBe(true);
      expect(
        RECIPES.some((r) => r.output.id === d.item),
        id,
      ).toBe(true);
    }
    for (const lv of [35, 39, 43]) expect(peakGated(lv), String(lv)).toBe(false);
  });

  it('chuỗi q6_* nối liền (requires), minLevel không giảm, bắt đầu từ q5_anh_bien và chốt ở q6_dung_thuc', () => {
    const q6 = QUESTS.filter((q) => q.id.startsWith('q6_'));
    expect(q6.length).toBeGreaterThanOrEqual(10);
    let prev = 'q5_anh_bien';
    let lv = 0;
    for (const q of q6) {
      expect(q.requires, q.id).toBe(prev);
      expect(q.minLevel ?? 1, q.id).toBeGreaterThanOrEqual(lv);
      lv = q.minLevel ?? 1;
      prev = q.id;
    }
    expect(q6.at(-1)!.id).toBe('q6_dung_thuc');
    expect(CHAPTERS.find((c) => c.id === 'ch6')?.closeQuest).toBe('q6_dung_thuc');
    expect(q6[0]!.unlockTele).toContain('vd_tp_tram');
    expect(lv).toBeLessThanOrEqual(MAX_LEVEL);
  });

  it('phó bản gioi_tri có cổng từ van_dinh, quái đều có thật và boss cuối là Phủ Chủ', () => {
    const dg = LEVELS.gioi_tri!.dungeon!;
    expect(dg.returnLevel).toBe('van_dinh');
    expect(LEVELS.van_dinh!.portals?.some((p) => p.to === 'gioi_tri')).toBe(true);
    for (const w of dg.waves) for (const g of w.mons) expect(MONSTER.has(g.id), g.id).toBe(true);
    expect(dg.waves.at(-1)!.mons[0]!.id).toBe('boss_phu_chu');
    expect(dg.minLevel).toBeGreaterThanOrEqual(42);
  });

  it('Thạch Nghiên là Đạo Sư (mở tab Đạo), đứng ở Bậc Đỉnh; đủ cấp mở Đạo là 36', () => {
    expect(NPC.get('npc_thach_nghien')?.daoChoose).toBe(true);
    expect(NPC.get('npc_thach_nghien')?.level).toBe('van_dinh');
    expect(DAO_UNLOCK_LEVEL).toBe(36);
    const dao = QUESTS.find((q) => q.id === 'q6_dao')!;
    expect(dao.minLevel).toBe(DAO_UNLOCK_LEVEL);
    expect(dao.objectives[0]!.target).toBe('npc_thach_nghien');
  });
});
