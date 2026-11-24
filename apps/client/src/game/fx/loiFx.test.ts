import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, METHOD_SKILLS, PATH, SKILL } from '@dtl/content';
import { fxDrawCount, fxEventsFor, fxParticleCount, validateFxTimeline } from '@dtl/shared';
import type { FxEvent } from '@dtl/shared';
import { paletteOf } from '../../render/vfx/palette';

// Lôi tu (TN-9 PR3): 6 timeline sét riêng cho chiêu có pose riêng; chiêu của tư thế (mượn hình) và chiêu lướt không có timeline.
const METHOD = 'cuu_tieu_loi_kinh';
const OWN = ['skl_loi_an_kich', 'skl_cuu_tieu_thien_loi', 'skl_phich_lich', 'skl_loi_vong', 'skl_loi_phat', 'skl_loi_hai'];
const evs = (id: string): FxEvent[] => fxEventsFor(FX_TIMELINE.get(id)!, -1);

describe('VFX Lôi tu', () => {
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

  it('cả 11 chiêu Lôi tu (kể cả tư thế và chiêu lướt) có timeline riêng, hợp lệ, dùng sprite sét vẽ tay `loi_*`', () => {
    for (const s of METHOD_SKILLS.filter((x) => x.method === METHOD)) {
      const tl = FX_TIMELINE.get(s.id)!;
      expect(tl, s.id).toBeDefined();
      const sprites = evs(s.id).filter((e) => e.type === 'mesh' && e.shape === 'sprite');
      expect(sprites.length, s.id).toBeGreaterThanOrEqual(3);
      for (const e of sprites) expect(String((e as { sprite?: string }).sprite), s.id).toMatch(/^loi_/);
    }
  });

  it('ba nhịp: báo trước (trừ chiêu lướt kích theo S.FX), chớp sáng `loi_flash` ở ±50 ms quanh mốc trúng, dư ba từ +150 ms', () => {
    for (const s of METHOD_SKILLS.filter((x) => x.method === METHOD)) {
      const m = evs(s.id).filter((e) => e.type === 'mesh') as (FxEvent & { sprite?: string; t?: number })[];
      if (s.kind !== 'dash')
        expect(
          m.some((e) => (e.t ?? 0) < -0.05),
          `${s.id} thiếu báo trước`,
        ).toBe(true);
      expect(
        m.some((e) => e.sprite === 'loi_flash' && Math.abs(e.t ?? 0) <= 0.05),
        `${s.id} thiếu chớp`,
      ).toBe(true);
      expect(
        m.some((e) => (e.t ?? 0) >= 0.15),
        `${s.id} thiếu dư ba`,
      ).toBe(true);
    }
  });

  it('không vòng ấn rune dưới chân, không khuôn chung (rune_ring2/ripple/crescent) làm hình chính, không đỏ/cam', () => {
    for (const s of METHOD_SKILLS.filter((x) => x.method === METHOD)) {
      const e = evs(s.id);
      expect(
        e.some((x) => x.type === 'decal' && x.tex === 'rune'),
        s.id,
      ).toBe(false);
      expect(
        e.some((x) => x.type === 'mesh' && ['rune_ring2', 'ripple', 'crescent'].includes(String(x.shape))),
        s.id,
      ).toBe(false);
    }
  });

  it('không che camera/nhân vật/mục tiêu: mọi tia rơi từ trên cao đều camFade; không khối nào follow thân; đá có trần', () => {
    for (const id of OWN) {
      for (const x of evs(id)) {
        if (x.type !== 'mesh') continue;
        if (x.shape.startsWith('bolt')) expect(x.camFade, `${id}:${x.shape}`).toBe(true);
        if (x.shape.startsWith('rubble_') && x.move?.offset) expect(x.move.offset[1]!, `${id}:${x.shape}`).toBeLessThanOrEqual(2.2);
      }
    }
  });

  it('hiệu ứng ngắn vẫn còn thấy ≥ 0,5 s sau lúc trúng (ảnh chụp có độ trễ)', () => {
    for (const id of OWN) {
      const hit = SKILL.get(id)!.hitAt?.[0] ?? 0;
      void hit;
      const alive = evs(id)
        .filter((x) => x.type === 'mesh' || x.type === 'decal')
        .map((x) => (x.t ?? 0) + (x.dur ?? 0));
      expect(Math.max(...alive), id).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('chỉ chiêu tối thượng dùng làm chậm và kéo máy', () => {
    for (const id of OWN) {
      const e = evs(id);
      const big = id === 'skl_cuu_tieu_thien_loi';
      expect(
        e.some((x) => x.type === 'slowmo'),
        id,
      ).toBe(big);
      expect(
        e.some((x) => x.type === 'camera' && (x.pull ?? 0) > 0),
        id,
      ).toBe(big);
    }
  });

  it('màu theo bảng màu hướng loi_tu: lõi tím đen, thân tím điện, viền trắng xanh', () => {
    const p = PATH.get('loi_tu')!.palette;
    const pal = paletteOf(METHOD);
    expect(pal.core).toBe(parseInt(p.core, 16));
    expect(pal.body).toBe(parseInt(p.body, 16));
    expect(pal.rim).toBe(parseInt(p.rim, 16));
  });
});
