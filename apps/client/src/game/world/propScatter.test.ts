import { describe, expect, it } from 'vitest';
import { COLLIDERS, FOREST, HAND_PROPS, heightAt, PROP_COLLIDERS, SECT, VALLEY, WATER_Y } from '@dtl/shared';
import { allProps, KIEM_GAY, nearPropTree, TREE_IDS } from './propScatter';
import atlas from '../core/impostors.json';
import { PROP_CFG } from './props';

describe('bố cục prop (P2-A4)', () => {
  const all = allProps();
  const count = (id: string) => all.filter((p) => p.id === id).length;

  it('xác định: hai lần dựng cho cùng kết quả, mọi số hữu hạn', () => {
    expect(allProps()).toBe(all);
    for (const p of all) expect([p.x, p.y, p.z, p.yaw, p.s].every(Number.isFinite)).toBe(true);
  });

  it('mọi prop có cấu hình hiển thị', () => {
    for (const id of new Set(all.map((p) => p.id))) expect(PROP_CFG[id], id).toBeDefined();
  });

  it('số lượng theo brief: đèn 22 + 7 của M-5, kiếm gãy theo vòng cũ, trúc/dương xỉ/lau đủ cụm', () => {
    expect(count('prop_den_da')).toBe(29);
    expect(count('prop_kiem_gay')).toBe(KIEM_GAY.length + HAND_PROPS.filter((h) => h.id === 'prop_kiem_gay').length);
    expect(KIEM_GAY.length).toBeGreaterThan(30);
    expect(count('prop_co_thu')).toBeGreaterThanOrEqual(7);
    expect(count('prop_truc')).toBeGreaterThanOrEqual(80);
    expect(count('prop_duong_xi')).toBeGreaterThanOrEqual(150);
    expect(count('prop_lau')).toBeGreaterThanOrEqual(60);
    expect(count('prop_tuong_canh')).toBe(6);
  });

  it('prop rải (không phải đặt tay) không đứng trong nước, trên đường tông môn hay trong collider', () => {
    const hand = HAND_PROPS.length;
    const scattered = all.slice(hand).filter((p) => p.id !== 'prop_kiem_gay' && p.id !== 'prop_bia_da');
    for (const p of scattered) {
      if (p.id !== 'prop_lau') expect(p.y, `${p.id} ${p.x},${p.z}`).toBeGreaterThan(WATER_Y + 1.2);
      expect(Math.abs(p.x - SECT.x) < 9 && p.z >= 2136 && p.z < 2400, `${p.id} nằm trên sơn đạo`).toBe(false);
      for (const c of COLLIDERS) expect(Math.hypot(p.x - c.x, p.z - c.z), `${p.id} chạm collider`).toBeGreaterThan(c.r);
    }
  });

  it('đèn đá và vật đặt tay không đè lên collider khác; collider prop chỉ cho cổ thụ, tượng, lư hương', () => {
    expect(PROP_COLLIDERS.length).toBe(HAND_PROPS.filter((p) => p.r).length);
    // 8 collider cũ + 11 trụ/bia của năm điểm đáng chú ý (M-5, r ≤ 1,2 m).
    expect(PROP_COLLIDERS.length).toBeLessThanOrEqual(20);
    for (const c of PROP_COLLIDERS) expect(c.r).toBeLessThanOrEqual(2.4);
    for (const h of HAND_PROPS.filter((p) => !p.r)) {
      for (const c of COLLIDERS) expect(Math.hypot(h.x - c.x, h.z - c.z), `${h.id} ${h.x},${h.z}`).toBeGreaterThan(c.r * 0.5);
    }
  });

  it('prop đặt tay đứng trên cạn (trừ lau), không treo giữa sườn dốc', () => {
    for (const h of HAND_PROPS) {
      const y = heightAt(h.x, h.z);
      expect(y, `${h.id} ${h.x},${h.z}`).toBeGreaterThan(31.3);
      const slope = Math.abs(heightAt(h.x + 2, h.z) - y) + Math.abs(heightAt(h.x, h.z + 2) - y);
      expect(slope, `${h.id} ${h.x},${h.z} dốc`).toBeLessThan(4);
    }
  });

  it('nearPropTree: quanh cổ thụ thật là true, giữa sân tông môn là false', () => {
    const t = all.find((p) => p.id === 'prop_co_thu')!;
    expect(nearPropTree(t.x, t.z)).toBe(true);
    expect(nearPropTree(SECT.x, 2090)).toBe(false);
  });

  describe('cây Tripo thay cây thủ tục (P2-A4b)', () => {
    const trees = all.filter((p) => (TREE_IDS as readonly string[]).includes(p.id));
    const near = (x: number, z: number, r: number, id?: string) =>
      trees.filter((p) => (!id || p.id === id) && Math.hypot(p.x - x, p.z - z) < r);

    it('đủ năm loài, mỗi loài có cấu hình cây, atlas impostor và mọi cây có tỉ lệ + sắc độ hữu hạn', () => {
      for (const id of TREE_IDS) {
        expect(PROP_CFG[id].tree, id).toBe(true);
        expect(Object.keys(atlas.species), id).toContain(id);
        expect(count(id), id).toBeGreaterThan(0);
      }
      for (const p of trees.filter((t) => t.tint)) {
        expect([p.sy, ...(p.tint as number[])].every((v) => Number.isFinite(v) && (v as number) > 0.5 && (v as number) < 3.2)).toBe(true);
      }
    });

    it('sân tông môn: anh đào/thông ở rìa sân, không giữa sân; rừng Linh Thảo có sồi và phong; thung lũng có sồi', () => {
      const sect = near(SECT.x, SECT.z, 108).filter((p) => !HAND_PROPS.some((h) => h.x === p.x && h.z === p.z));
      expect(sect.filter((p) => p.id === 'prop_anh_dao').length).toBeGreaterThan(5);
      for (const p of sect) expect(Math.hypot(p.x - SECT.x, p.z - SECT.z), `${p.id} giữa sân`).toBeGreaterThan(55);
      expect(near(FOREST.x, FOREST.z, FOREST.outerR, 'prop_soi_nui').length).toBeGreaterThan(8);
      expect(near(FOREST.x, FOREST.z, FOREST.outerR, 'prop_phong_do').length).toBeGreaterThan(3);
      expect(near(VALLEY.x, VALLEY.z, VALLEY.outerR, 'prop_soi_nui').length).toBeGreaterThan(2);
    });

    it('không có cây đè lên lối đi tông môn–sơn đạo hoặc quá gần collider', () => {
      for (const p of trees.filter((t) => !HAND_PROPS.some((h) => h.x === t.x && h.z === t.z))) {
        expect(Math.abs(p.x - SECT.x) < 9 && p.z >= 2136 && p.z < 2400, `${p.id} ${p.x},${p.z} trên sơn đạo`).toBe(false);
        for (const c of COLLIDERS) expect(Math.hypot(p.x - c.x, p.z - c.z), `${p.id} chạm collider`).toBeGreaterThan(c.r + 2);
      }
    });
  });
});
