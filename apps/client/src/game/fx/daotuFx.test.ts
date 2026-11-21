import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, METHOD_SKILLS, PATH, SKILL } from '@dtl/content';
import { fxDrawCount, fxEventsFor, fxParticleCount, validateFxTimeline } from '@dtl/shared';
import type { FxEvent } from '@dtl/shared';
import { paletteOf } from '../../render/vfx/palette';

// Đao tu (PR VFX): 6 timeline riêng cho các chiêu có pose riêng; chiêu tư thế mượn hình của chiêu nền.
const METHOD = 'liet_nhan_dao_kinh';
const OWN = ['skl_bao_nhan', 'skl_tram_son_dao', 'skl_hoanh_dao', 'skl_tam_dao', 'skl_doan_luu', 'skl_liet_dia_tram'];
const evs = (id: string): FxEvent[] => fxEventsFor(FX_TIMELINE.get(id)!, -1);

describe('VFX Đao tu', () => {
  it('mỗi chiêu có timeline riêng, thay đúng loại FX của chiêu, hợp lệ và trong ngân sách', () => {
    for (const id of OWN) {
      const tl = FX_TIMELINE.get(id)!;
      const sk = METHOD_SKILLS.find((s) => s.id === id)!;
      expect(tl, id).toBeDefined();
      expect(tl.replaces, id).toEqual([sk.fx]);
      expect(
        validateFxTimeline(tl, (x) => SKILL.has(x)),
        id,
      ).toEqual([]);
      expect(fxDrawCount(evs(id)), id).toBeLessThanOrEqual(12);
      expect(fxParticleCount(evs(id)), id).toBeLessThanOrEqual(1500);
    }
  });

  it('không có timeline cho chiêu tư thế (mượn hình chiêu nền) hay chiêu lướt', () => {
    for (const s of METHOD_SKILLS.filter((x) => x.method === METHOD && (x.stanceOf || x.kind === 'dash')))
      expect(FX_TIMELINE.has(s.id), s.id).toBe(false);
  });

  it('không che camera/nhân vật/mục tiêu: khối đứng hoặc rơi cao và mọi tảng đá đều camFade; đá có trần 2,2 m', () => {
    for (const id of OWN) {
      for (const e of evs(id)) {
        if (e.type !== 'mesh') continue;
        if (/^(blade_stuck|sword_halo|rubble_)/.test(e.shape)) {
          // đao rơi chỉ lướt 0,3 s trên cao và lệch bên mục tiêu; khối đứng lại (đao cắm), vành, đá thì phải camFade
          expect(e.camFade, `${id}:${e.shape}`).toBe(true);
        }
        if (e.shape.startsWith('rubble_') && e.move?.offset) expect(e.move.offset[1]!, `${id}:${e.shape}`).toBeLessThanOrEqual(2.2);
      }
    }
  });

  it('chỉ Trảm Sơn Đao (tối thượng) dùng làm chậm và kéo máy', () => {
    for (const id of OWN) {
      const e = evs(id);
      expect(
        e.some((x) => x.type === 'slowmo'),
        id,
      ).toBe(id === 'skl_tram_son_dao');
      expect(
        e.some((x) => x.type === 'camera' && (x.pull ?? 0) > 0),
        id,
      ).toBe(id === 'skl_tram_son_dao');
    }
  });

  it('màu theo bảng màu hướng dao_tu: lõi huyết dụ, thân son thẫm, viền vàng tàn lửa', () => {
    const p = PATH.get('dao_tu')!.palette;
    const pal = paletteOf(METHOD);
    expect(pal.core).toBe(parseInt(p.core, 16));
    expect(pal.body).toBe(parseInt(p.body, 16));
    expect(pal.rim).toBe(parseInt(p.rim, 16));
  });

  it('không mượn hình Hộ pháp/Đan sư (trụ đá, thuẫn, ấn, chuông, sen)', () => {
    for (const id of OWN)
      for (const e of evs(id))
        if (e.type === 'mesh')
          expect(
            /^(rock_spire|shield_plate|seal_block|bell_cage|diamond_cage|lotus_bloom|pill_orb|dan_lo)$/.test(e.shape),
            `${id}:${e.shape}`,
          ).toBe(false);
  });
});
