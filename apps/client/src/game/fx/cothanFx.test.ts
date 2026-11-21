import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, METHOD_SKILLS, PATH, SKILL } from '@dtl/content';
import { fxDrawCount, fxEventsFor, fxParticleCount, HOA_HINH_SKILL, validateFxTimeline } from '@dtl/shared';
import type { FxEvent } from '@dtl/shared';
import { fxTriggered } from './skillFx';
import { paletteOf } from '../../render/vfx/palette';

// Cổ Thần (PR VFX): 4 timeline riêng cho chiêu có pose riêng + cảnh Hóa Hình (trigger fx); chiêu tư thế mượn hình chiêu nền.
const METHOD = 'co_than_quyet';
const OWN = ['skl_thai_co_quyen', 'skl_tinh_bao', 'skl_huyet_cu_ho', 'skl_co_than_nhat_kich'];
const SCENE = 'fx_co_hoa_hinh';
const evs = (id: string): FxEvent[] => fxEventsFor(FX_TIMELINE.get(id)!, -1);

describe('VFX Cổ Thần', () => {
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
    for (const s of METHOD_SKILLS.filter((x) => x.method === METHOD && (x.stanceOf || x.kind === 'dash' || x.kind === 'stance')))
      expect(FX_TIMELINE.has(s.id), s.id).toBe(false);
  });

  it('cảnh Hóa Hình là timeline trigger fx loại hoahinh của Cổ Thần Quyết, hợp lệ, trong ngân sách; server phát đúng loại đó', () => {
    const tl = FX_TIMELINE.get(SCENE)!;
    expect(tl).toBeDefined();
    expect(tl.trigger).toBe('fx');
    expect(tl.fxKind).toBe('hoahinh');
    expect(tl.method).toBe(METHOD);
    expect(
      validateFxTimeline(tl, (x) => SKILL.has(x) || x.startsWith('fx_')),
      SCENE,
    ).toEqual([]);
    expect(fxDrawCount(evs(SCENE))).toBeLessThanOrEqual(12);
    expect(fxParticleCount(evs(SCENE))).toBeLessThanOrEqual(1500);
    expect(fxTriggered('hoahinh', METHOD)).toBe(tl);
    expect(fxTriggered('hoahinh', 'lac_kiem_quyet')).toBeUndefined();
    expect(SKILL.get(HOA_HINH_SKILL)?.kind).toBe('stance');
  });

  it('khoảnh khắc wow của Hóa Hình: sóng chấn mặt đất, bóng Cổ Thần khổng lồ (camFade), làm chậm + kéo máy; không phủ khối lên thân', () => {
    const e = evs(SCENE);
    expect(e.filter((x) => x.type === 'mesh' && x.shape === 'shock_cone').length).toBeGreaterThanOrEqual(2);
    const ghosts = e.filter((x) => x.type === 'mesh' && x.shape === 'card');
    expect(ghosts.length).toBeGreaterThanOrEqual(1);
    for (const g of ghosts) if (g.type === 'mesh') expect(g.camFade, 'bóng Cổ Thần').toBe(true);
    expect(e.some((x) => x.type === 'slowmo')).toBe(true);
    expect(e.some((x) => x.type === 'camera' && (x.pull ?? 0) > 0)).toBe(true);
    // mọi khối đặt quanh/phía sau người (`self`) mà không nằm sát đất phải camFade; không khối nào follow thân (không phủ màu)
    for (const x of e) {
      if (x.type !== 'mesh') continue;
      expect(x.follow, x.shape).not.toBe(true);
      if (x.at === 'self' && (x.offset?.[1] ?? 0) > 0.5) expect(x.camFade, x.shape).toBe(true);
    }
  });

  it('không che camera/nhân vật/mục tiêu: khối đứng hoặc rơi cao và mọi tảng đá đều camFade; đá có trần 2,2 m', () => {
    for (const id of [...OWN, SCENE]) {
      for (const e of evs(id)) {
        if (e.type !== 'mesh') continue;
        if (/^(blade_stuck|sword_halo|rubble_)/.test(e.shape)) expect(e.camFade, `${id}:${e.shape}`).toBe(true);
        if (e.shape.startsWith('rubble_') && e.move?.offset) expect(e.move.offset[1]!, `${id}:${e.shape}`).toBeLessThanOrEqual(9);
        if (e.shape.startsWith('rubble_') && e.at !== 'area' && e.move?.offset)
          expect(e.move.offset[1]!, `${id}:${e.shape}`).toBeLessThanOrEqual(2.2);
      }
    }
  });

  it('chỉ chiêu tối thượng và cảnh Hóa Hình dùng làm chậm và kéo máy', () => {
    for (const id of OWN) {
      const e = evs(id);
      expect(
        e.some((x) => x.type === 'slowmo'),
        id,
      ).toBe(id === 'skl_co_than_nhat_kich');
      expect(
        e.some((x) => x.type === 'camera' && (x.pull ?? 0) > 0),
        id,
      ).toBe(id === 'skl_co_than_nhat_kich');
    }
  });

  it('màu theo bảng màu hướng co_than: lõi đỏ sẫm, thân huyết đồng, viền vàng ngà', () => {
    const p = PATH.get('co_than')!.palette;
    const pal = paletteOf(METHOD);
    expect(pal.core).toBe(parseInt(p.core, 16));
    expect(pal.body).toBe(parseInt(p.body, 16));
    expect(pal.rim).toBe(parseInt(p.rim, 16));
  });
});
