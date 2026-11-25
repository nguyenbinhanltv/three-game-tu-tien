import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, SKILL } from '@dtl/content';
import { fxDrawCount, fxEventsFor, fxParticleCount, validateFxTimeline } from '@dtl/shared';
import type { FxEvent } from '@dtl/shared';

// Đan sư (Họa Pháp Lô 2): 14 chiêu của công pháp Thanh Mộc Đan Kinh, mỗi chiêu một timeline riêng dùng sprite vẽ tay `dan_*` (tô kiểu "đan": lục lá, lõi vàng chanh).
const IDS = [
  'skl_dan_lo',
  'skl_dan_hoa_chi',
  'skl_dan_hoa_vu',
  'skl_lo_hoa_hoi_nguyen',
  'skl_dan_hoa_phong_tran',
  'skl_duoc_vu',
  'skl_hoi_xuan_quyet',
  'skl_moc_linh_tran',
  'skl_ngung_dan_ho_the',
  'skl_thuan_di_cuu_vien',
  'skl_anh_duoc_hoa_than',
  'skl_luu_huong_bo',
  'skl_hoi_thien_dan_lo',
  'skl_thien_dan_phap_gioi',
];
const evs = (id: string): FxEvent[] => fxEventsFor(FX_TIMELINE.get(id)!, -1);
type Mesh = FxEvent & { sprite?: string; t?: number };

describe('VFX Đan sư', () => {
  it('mỗi chiêu có timeline riêng, hợp lệ và trong ngân sách', () => {
    for (const id of IDS) {
      const tl = FX_TIMELINE.get(id)!;
      expect(tl, id).toBeDefined();
      expect(
        validateFxTimeline(tl, (x) => SKILL.has(x)),
        id,
      ).toEqual([]);
      expect(fxDrawCount(evs(id)), id).toBeLessThanOrEqual(12);
      expect(fxParticleCount(evs(id)), id).toBeLessThanOrEqual(1500);
    }
  });

  it('hình chính là sprite vẽ tay `dan_*` (ít nhất 3 sprite, tất cả thuộc nhóm đan)', () => {
    for (const id of IDS) {
      const sprites = evs(id).filter((e) => e.type === 'mesh' && e.shape === 'sprite') as Mesh[];
      expect(sprites.length, id).toBeGreaterThanOrEqual(3);
      for (const e of sprites) expect(String(e.sprite), id).toMatch(/^dan_/);
    }
  });

  it('ba nhịp: báo trước (trừ chiêu lướt kích theo S.FX), chớp đốm vàng `dan_sparks` ở ±50 ms quanh mốc trúng, dư ba từ +150 ms', () => {
    for (const id of IDS) {
      const m = evs(id).filter((e) => e.type === 'mesh') as Mesh[];
      if (SKILL.get(id)!.kind !== 'dash')
        expect(
          m.some((e) => (e.t ?? 0) < -0.05),
          `${id} thiếu báo trước`,
        ).toBe(true);
      expect(
        m.some((e) => e.sprite === 'dan_sparks' && Math.abs(e.t ?? 0) <= 0.05),
        `${id} thiếu chớp`,
      ).toBe(true);
      expect(
        m.some((e) => (e.t ?? 0) >= 0.15),
        `${id} thiếu dư ba`,
      ).toBe(true);
    }
  });

  it('không vòng ấn rune dưới chân, không khuôn chung (rune_ring2/ripple/crescent) làm hình chính; lõi mực tối (decal scorch) cho nền sáng', () => {
    for (const id of IDS) {
      const e = evs(id);
      expect(
        e.some((x) => x.type === 'decal' && x.tex === 'rune'),
        id,
      ).toBe(false);
      expect(
        e.some((x) => x.type === 'mesh' && ['rune_ring2', 'ripple', 'crescent'].includes(String(x.shape))),
        id,
      ).toBe(false);
      expect(
        e.some((x) => x.type === 'decal' && x.tex === 'scorch'),
        `${id} thiếu lõi mực tối`,
      ).toBe(true);
    }
  });

  it('chiêu bao quanh người đủ trong để thấy mục tiêu: Ngưng Đan Hộ Thế alpha thân ≤ 0,4', () => {
    for (const x of evs('skl_ngung_dan_ho_the')) {
      if (x.type === 'mesh' && x.sprite === 'dan_orb_giant') expect(x.alpha ?? 1).toBeLessThanOrEqual(0.4);
    }
  });
});
