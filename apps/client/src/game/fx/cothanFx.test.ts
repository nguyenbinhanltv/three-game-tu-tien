import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, METHOD_SKILLS, PATH, SKILL } from '@dtl/content';
import { fxAwayFromCam, fxDrawCount, fxEventsFor, fxParticleCount, HOA_HINH_SKILL, validateFxTimeline } from '@dtl/shared';
import type { FxEvent } from '@dtl/shared';
import { paletteOf } from '../../render/vfx/palette';

// Cổ Thần (PR VFX): 4 timeline riêng cho chiêu có pose riêng + Hóa Hình (fx riêng, giữ nguyên) + Cự Bộ Xung (chiêu lướt, Họa Pháp Lô 2); chiêu của tư thế mượn hình chiêu nền.
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

  it('chiêu của tư thế (mượn hình chiêu nền) không có timeline; chiêu lướt Cự Bộ Xung có timeline riêng kích theo S.FX (Họa Pháp Lô 2)', () => {
    for (const s of METHOD_SKILLS.filter((x) => x.method === METHOD && (x.stanceOf || x.kind === 'dash') && x.id !== 'skl_cu_bo_xung'))
      expect(FX_TIMELINE.has(s.id), s.id).toBe(false);
    const dash = FX_TIMELINE.get('skl_cu_bo_xung')!;
    expect([dash.trigger, dash.fxKind, dash.method]).toEqual(['fx', 'dash', METHOD]);
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
    // MỘT bóng Cổ Thần (lớp thân) + MỘT lớp nền tối lệch ra sau làm độ dày giả; cả hai ở phía xa camera.
    expect(colossus.map((x) => (x.type === 'mesh' ? x.tone : '')).sort(), 'lớp thân + lớp nền tối').toEqual(['body', 'core']);
    for (const g of colossus)
      if (g.type === 'mesh') {
        expect(g.awayFromCam, 'phía xa camera = sau lưng người chơi').toBe(true);
        expect(g.camFade).toBe(true);
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

  it('fxAwayFromCam: điểm cùng phía camera thì lấy đối xứng qua người, ở phía xa thì giữ nguyên', () => {
    // người ở gốc, camera ở (0, -10): điểm (0, -7) cùng phía camera -> (0, 7); điểm (0, 7) phía xa -> giữ
    expect(fxAwayFromCam(0, 0, 0, -10, 0, -7)).toEqual([0, 7]);
    expect(fxAwayFromCam(0, 0, 0, -10, 0, 7)).toEqual([0, 7]);
    expect(fxAwayFromCam(0, 0, 0, -10, 3, 0)).toEqual([3, 0]);
    expect(fxAwayFromCam(5, 5, 5, 15, 5, 12)).toEqual([5, -2]);
    // luôn cách người đúng bằng khoảng cũ và không bao giờ nằm cùng phía camera
    for (const [px, pz] of [
      [2, -6],
      [-4, 3],
      [7, 7],
      [-3, -3],
    ] as const) {
      const [x, z] = fxAwayFromCam(0, 0, 4, -9, px, pz);
      expect(Math.hypot(x, z)).toBeCloseTo(Math.hypot(px, pz), 9);
      expect(x * 4 + z * -9).toBeLessThanOrEqual(1e-9);
    }
  });

  it('Họa Pháp Lô 2: Thái Cổ Quyền = sprite nắm đấm vỉa `cth_fist` ngay trên mục tiêu; Nhất Kích = sprite cánh tay đá `cth_arm` bổ xuống mục tiêu + hố `cth_crater`', () => {
    const sprites = (id: string) =>
      evs(id).filter((x) => x.type === 'mesh' && x.shape === 'sprite') as (FxEvent & { sprite?: string; at?: string })[];
    expect(sprites('skl_thai_co_quyen').some((x) => x.sprite === 'cth_fist' && (x.at ?? 'target') === 'target')).toBe(true);
    const k = sprites('skl_co_than_nhat_kich');
    expect(k.some((x) => x.sprite === 'cth_arm')).toBe(true);
    expect(k.some((x) => x.sprite === 'cth_crater')).toBe(true);
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

  it('màu theo bảng màu hướng co_than: lõi nâu đất, thân nâu đồng, viền ngà', () => {
    const p = PATH.get('co_than')!.palette;
    const pal = paletteOf(METHOD);
    expect(pal.core).toBe(parseInt(p.core, 16));
    expect(pal.body).toBe(parseInt(p.body, 16));
    expect(pal.rim).toBe(parseInt(p.rim, 16));
  });
});
