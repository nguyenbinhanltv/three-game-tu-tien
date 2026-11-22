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

  it('không có timeline cho chiêu của tư thế hay chiêu lướt (mượn hình / không có động tác)', () => {
    for (const s of METHOD_SKILLS.filter((x) => x.method === METHOD && (x.stanceOf || x.kind === 'dash')))
      expect(FX_TIMELINE.has(s.id), s.id).toBe(false);
  });

  it('sét ba tầng màu: mỗi chiêu có tầng tối (decal scorch/crack hoặc nứt tone core), tầng thân (body) và tầng sáng (rim/accent)', () => {
    for (const id of OWN) {
      const e = evs(id);
      const tones = new Set(e.map((x) => ('tone' in x ? x.tone : undefined)).filter(Boolean));
      expect(tones.has('body'), `${id}: thân`).toBe(true);
      expect(tones.has('rim') || tones.has('accent'), `${id}: sáng`).toBe(true);
      expect(tones.has('shadow') || tones.has('core'), `${id}: tối`).toBe(true);
    }
  });

  it('sét là hình zigzag có nhánh (bolt): chớp chập chờn qua ≥ 2 biến thể, mỗi tia ba lớp lồng nhau (core/body/rim); điểm đánh có decal strike', () => {
    for (const id of ['skl_loi_an_kich', 'skl_cuu_tieu_thien_loi', 'skl_phich_lich', 'skl_loi_phat', 'skl_loi_hai', 'skl_loi_vong']) {
      const e = evs(id);
      const bolts = e.filter((x) => x.type === 'mesh' && x.shape.startsWith('bolt'));
      expect(new Set(bolts.map((x) => (x.type === 'mesh' ? x.shape : ''))).size, `${id}: biến thể`).toBeGreaterThanOrEqual(2);
      expect(new Set(bolts.map((x) => (x.type === 'mesh' ? x.t : 0))).size, `${id}: số khung chớp`).toBeGreaterThanOrEqual(4);
      const tones = new Set(bolts.map((x) => (x.type === 'mesh' ? x.tone : '')));
      expect(tones.has('body') && tones.has('rim'), `${id}: thân + lõi`).toBe(true);
      if (id !== 'skl_loi_vong')
        expect(
          e.some((x) => x.type === 'decal' && x.tex === 'strike'),
          id,
        ).toBe(true);
    }
    // chiêu chính có đủ viền tối (core) quanh tia
    for (const id of ['skl_loi_an_kich', 'skl_cuu_tieu_thien_loi', 'skl_loi_phat']) {
      expect(
        evs(id).some((x) => x.type === 'mesh' && x.shape.startsWith('bolt') && x.tone === 'core'),
        id,
      ).toBe(true);
    }
  });

  it('Lôi Phạt là CỘT sét lớn giáng từ trời: cột đứng (rot -90° quanh X) cao ≥ 10 m ở mục tiêu, lõi trắng (rim) và viền tối', () => {
    const cols = evs('skl_loi_phat').filter(
      (x) => x.type === 'mesh' && x.shape.startsWith('bolt') && x.at === 'target' && x.rot?.[0] === -90,
    );
    expect(cols.length).toBeGreaterThan(0);
    const tallest = Math.max(...cols.map((x) => (x.type === 'mesh' && Array.isArray(x.scale) ? x.scale[2]! : 0)));
    expect(tallest).toBeGreaterThanOrEqual(10);
    expect(new Set(cols.map((x) => (x.type === 'mesh' ? x.tone : ''))).size).toBeGreaterThanOrEqual(3);
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
