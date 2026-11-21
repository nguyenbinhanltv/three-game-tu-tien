import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, METHOD_SKILLS, PATH, SKILL } from '@dtl/content';
import { fxDrawCount, fxEventsFor, fxParticleCount, HOA_HINH_SKILL, validateFxTimeline } from '@dtl/shared';
import type { FxEvent } from '@dtl/shared';
import { paletteOf } from '../../render/vfx/palette';

// Cổ Thần (PR VFX): 4 timeline riêng cho chiêu có pose riêng + Hóa Hình (fx riêng); chiêu của tư thế mượn hình chiêu nền.
const METHOD = 'co_than_quyet';
const OWN = ['skl_thai_co_quyen', 'skl_tinh_bao', 'skl_huyet_cu_ho', 'skl_co_than_nhat_kich', 'skl_hoa_hinh'];
const SCENE = 'skl_hoa_hinh';
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

  it('không có timeline cho chiêu của tư thế (mượn hình chiêu nền) hay chiêu lướt', () => {
    for (const s of METHOD_SKILLS.filter((x) => x.method === METHOD && (x.stanceOf || x.kind === 'dash')))
      expect(FX_TIMELINE.has(s.id), s.id).toBe(false);
  });

  it('Hóa Hình có fx + pose riêng (không mượn Sơn Nhạc): timeline của chính chiêu, thay đúng loại FX của nó', () => {
    const sk = SKILL.get(HOA_HINH_SKILL)!;
    expect(sk.kind).toBe('stance');
    expect(sk.fx).toBe('cohoahinh');
    expect(sk.pose).toBe('hoa_hinh');
    expect(METHOD_SKILLS.filter((s) => s.fx === sk.fx)).toHaveLength(1);
    expect(FX_TIMELINE.get(SCENE)!.replaces).toEqual([sk.fx]);
  });

  it('khoảnh khắc wow của Hóa Hình: Cổ Thần khổng lồ (thẻ colossus, camFade, đứng phía trước người), sóng chấn sát đất, làm chậm + kéo máy; không phủ khối lên thân, không rải đá', () => {
    const e = evs(SCENE);
    const colossus = e.filter((x) => x.type === 'mesh' && x.shape === 'card' && x.card === 'colossus');
    expect(colossus).toHaveLength(2); // cặp đối xứng trước/sau người: thẻ giữa camera và người tự mờ
    const zs = colossus.map((g) => (g.type === 'mesh' ? (g.offset?.[2] ?? 0) : 0));
    expect(Math.min(...zs)).toBeLessThan(-3);
    expect(Math.max(...zs)).toBeGreaterThan(3);
    for (const g of colossus)
      if (g.type === 'mesh') {
        expect(g.camFade, 'Cổ Thần khổng lồ').toBe(true);
        expect(Math.abs(g.offset?.[2] ?? 0), 'cách người đủ xa').toBeGreaterThan(3);
      }
    expect(e.filter((x) => x.type === 'mesh' && x.shape === 'shock_cone').length).toBeGreaterThanOrEqual(2);
    expect(e.some((x) => x.type === 'slowmo')).toBe(true);
    expect(e.some((x) => x.type === 'camera' && (x.pull ?? 0) > 0)).toBe(true);
    expect(e.some((x) => x.type === 'mesh' && x.shape.startsWith('rubble_'))).toBe(false);
    for (const x of e) {
      if (x.type !== 'mesh') continue;
      expect(x.follow, x.shape).not.toBe(true);
      // sóng chấn hạ xuống đất, bán kính cuối nhỏ (không che nửa thân như bản đầu)
      if (x.shape === 'shock_cone') {
        const sc = x.scaleTo ?? x.scale ?? 0;
        expect(Array.isArray(sc) ? Math.max(...sc) : sc, 'sóng chấn').toBeLessThanOrEqual(5.5);
      }
    }
  });

  it('Thái Cổ Quyền: cự quyền (thẻ fist) giáng xuống mục tiêu + sóng chấn + bụi; Nhất Kích: cự quyền phía trước vùng, camFade', () => {
    const q = evs('skl_thai_co_quyen');
    expect(q.some((x) => x.type === 'mesh' && x.shape === 'card' && x.card === 'fist' && x.at === 'target')).toBe(true);
    expect(q.some((x) => x.type === 'mesh' && x.shape === 'shock_cone')).toBe(true);
    expect(q.filter((x) => x.type === 'mesh' && x.shape === 'flip' && x.flip === 'dust_kick').length).toBeGreaterThanOrEqual(1);
    const k = evs('skl_co_than_nhat_kich').filter((x) => x.type === 'mesh' && x.shape === 'card' && x.card === 'fist');
    expect(k.length).toBe(2);
    for (const f of k) if (f.type === 'mesh') expect(f.camFade).toBe(true);
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

  it('chỉ chiêu tối thượng và Hóa Hình dùng làm chậm và kéo máy', () => {
    for (const id of OWN) {
      const e = evs(id);
      const big = id === 'skl_co_than_nhat_kich' || id === 'skl_hoa_hinh';
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

  it('màu theo bảng màu hướng co_than: lõi đỏ sẫm, thân huyết đồng, viền vàng ngà', () => {
    const p = PATH.get('co_than')!.palette;
    const pal = paletteOf(METHOD);
    expect(pal.core).toBe(parseInt(p.core, 16));
    expect(pal.body).toBe(parseInt(p.body, 16));
    expect(pal.rim).toBe(parseInt(p.rim, 16));
  });
});
