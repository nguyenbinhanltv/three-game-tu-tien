import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, SKILL } from '@dtl/content';
import { FX_SPRITES, fxDrawCount, fxEventsFor, fxParticleCount, validateFxTimeline } from '@dtl/shared';
import type { FxEvent } from '@dtl/shared';

// Kiếm tu theo Họa Pháp Lô 2: 10 chiêu, mỗi chiêu một hình sprite vẽ tay `kiem_*` (ngọc lam/cyan, lõi mực tối, viền bạc), ba nhịp.
const IDS = [
  'skl_kiem_anh_bo',
  'skl_phi_kiem_truy_hon',
  'skl_van_kiem_quy_tong',
  'skl_hoanh_kiem_pha_mach',
  'skl_kiem_vu_tam_diep',
  'skl_kiem_dan_ban_menh',
  'skl_nghich_kiem_chuyen_phong',
  'skl_phan_anh_kiem_anh',
  'skl_thuan_di_tram',
  'skl_thien_kiem_hoa_hinh',
];
const DASH = new Set(['skl_kiem_anh_bo', 'skl_nghich_kiem_chuyen_phong']);
const evs = (id: string): FxEvent[] => fxEventsFor(FX_TIMELINE.get(id)!, -1);
type M = FxEvent & { sprite?: string; t?: number; shape?: string };
const meshes = (id: string) => evs(id).filter((e) => e.type === 'mesh') as M[];

describe('VFX Kiếm tu', () => {
  it('10 chiêu có timeline riêng, hợp lệ, trong ngân sách, hình chính là sprite `kiem_*` có trong atlas', () => {
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
        expect(String(e.sprite), id).toMatch(/^kiem_/);
        expect((FX_SPRITES as readonly string[]).includes(String(e.sprite)), `${id}:${e.sprite}`).toBe(true);
      }
    }
  });

  it('ba nhịp: báo trước (trừ chiêu lướt), chớp `kiem_flash` ở ±50 ms quanh mốc trúng, dư ba từ +150 ms', () => {
    for (const id of IDS) {
      const m = meshes(id);
      if (!DASH.has(id))
        expect(
          m.some((e) => (e.t ?? 0) < -0.05),
          `${id} thiếu báo trước`,
        ).toBe(true);
      expect(
        m.some((e) => e.sprite === 'kiem_flash' && Math.abs(e.t ?? 0) <= 0.05 + (id === 'skl_kiem_vu_tam_diep' ? 0.3 : 0)),
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

  it('chỉ chiêu cuối Vạn Kiếm Quy Tông dùng làm chậm', () => {
    for (const id of IDS) {
      expect(
        evs(id).some((x) => x.type === 'slowmo'),
        id,
      ).toBe(id === 'skl_van_kiem_quy_tong' || id === 'skl_thien_kiem_hoa_hinh');
    }
  });
});
