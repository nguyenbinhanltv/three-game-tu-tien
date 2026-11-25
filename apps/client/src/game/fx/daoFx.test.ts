import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, SKILL } from '@dtl/content';
import { FX_SPRITES, fxDrawCount, fxEventsFor, fxParticleCount, validateFxTimeline } from '@dtl/shared';
import type { FxEvent } from '@dtl/shared';

// Đao tu theo Họa Pháp Lô 2: 10 chiêu, mỗi chiêu một hình sprite vẽ tay `dao_*` (than thép + bạc thép, lõi than tối, vệt mực dưới nét chém), ba nhịp.
const IDS = [
  'skl_pha_phong_tien',
  'skl_bao_nhan',
  'skl_tram_son_dao',
  'skl_hoanh_dao',
  'skl_tam_dao',
  'skl_doan_luu',
  'skl_liet_dia_tram',
  'skl_thuan_dao_tram',
  'skl_huyet_chien_the',
  'skl_doan_thien_dao',
];
const DASH = new Set(['skl_pha_phong_tien']);
const evs = (id: string): FxEvent[] => fxEventsFor(FX_TIMELINE.get(id)!, -1);
type M = FxEvent & { sprite?: string; t?: number; shape?: string };
const meshes = (id: string) => evs(id).filter((e) => e.type === 'mesh') as M[];

describe('VFX Đao tu', () => {
  it('10 chiêu có timeline riêng, hợp lệ, trong ngân sách, hình chính là sprite `dao_*` có trong atlas', () => {
    for (const id of IDS) {
      const tl = FX_TIMELINE.get(id)!;
      expect(tl, id).toBeDefined();
      expect(
        validateFxTimeline(tl, (x) => SKILL.has(x)),
        id,
      ).toEqual([]);
      expect(fxDrawCount(evs(id)), id).toBeLessThanOrEqual(12);
      expect(fxParticleCount(evs(id)), id).toBeLessThanOrEqual(1500);
      const sprites = meshes(id).filter((e) => e.shape === 'sprite');
      expect(sprites.length, id).toBeGreaterThanOrEqual(3);
      for (const e of sprites) {
        expect(String(e.sprite), id).toMatch(/^dao_/);
        expect((FX_SPRITES as readonly string[]).includes(String(e.sprite)), `${id}:${e.sprite}`).toBe(true);
      }
    }
  });

  it('ba nhịp: báo trước (trừ chiêu lướt), chớp `dao_flash` ở ±50 ms quanh mốc trúng, dư ba từ +150 ms', () => {
    for (const id of IDS) {
      const m = meshes(id);
      if (!DASH.has(id))
        expect(
          m.some((e) => (e.t ?? 0) < -0.05),
          `${id} thiếu báo trước`,
        ).toBe(true);
      expect(
        m.some((e) => e.sprite === 'dao_flash' && Math.abs(e.t ?? 0) <= 0.05 + (id === 'skl_dao_vu_tam_diep' ? 0.3 : 0)),
        `${id} thiếu chớp`,
      ).toBe(true);
      expect(
        m.some((e) => (e.t ?? 0) >= 0.15),
        `${id} thiếu dư ba`,
      ).toBe(true);
    }
  });

  it('không vòng rune dưới chân, không khuôn chung (rune_ring2/ripple/crescent) kể cả trong biến thể', () => {
    const bad = new Set(['rune_ring2', 'ripple', 'crescent']);
    for (const id of IDS) {
      const tl = FX_TIMELINE.get(id)!;
      const all: FxEvent[] = [...tl.events, ...Object.values(tl.variants ?? {}).flat()];
      expect(
        all.some((x) => x.type === 'decal' && x.tex === 'rune'),
        id,
      ).toBe(false);
      expect(
        all.some((x) => x.type === 'mesh' && bad.has(String((x as M).shape))),
        id,
      ).toBe(false);
    }
  });
});
