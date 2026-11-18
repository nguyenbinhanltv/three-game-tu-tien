// DV-1: Bắc Hoang Tẫn Nguyên đạt bộ kiểm level, đúng số liệu thiết kế (6 vùng, 13 tinh anh, Tam Thủ Ngục Khuyển ở Khích Giai, 5 vị trí bia, 7 trận), khe Giới Khích là lòng máng.
import { describe, expect, it } from 'vitest';
import { polyArea, terrainOf, TELE_PADS, TELE_FREE, MAX_LEVEL } from '@dtl/shared';
import { campCoverage, COVER_BY_LEVEL } from './coverage';
import { LEVELS } from './index';
import { checkLevel } from './levelcheck';

const lv = LEVELS.bac_hoang;
const C = 1024;

describe('bac_hoang', () => {
  it('đạt checkLevel', () => expect(checkLevel(lv)).toEqual([]));

  it('đúng số liệu thiết kế (6 vùng, 13 tinh anh, bốn boss: Tam Thủ Ngục Khuyển gác miệng nam khe, Kiếm Cơ, Ma Hậu, 5 bia)', () => {
    const zones = lv.zones ?? [];
    const camps = lv.camps ?? [];
    expect(zones.map((z) => z.id).sort()).toEqual([
      'han_hoi_nguyen',
      'khich_giai',
      'kho_loc_lam',
      'kim_da_ngoai_uyen',
      'tran_gioi_dai',
      'xich_tan_binh',
    ]);
    expect(Math.max(...zones.map((z) => z.lvMax))).toBeLessThanOrEqual(MAX_LEVEL);
    expect(lv.spawns.filter((s) => s.mon.startsWith('elite_')).reduce((a, s) => a + s.count, 0)).toBe(13);
    const boss = lv.spawns.filter((s) => s.mon.startsWith('boss_'));
    // Tam Thủ Ngục Khuyển gác miệng nam khe; DV-2 đợt 3: Tẫn Hỏa Kiếm Cơ và Kim Dạ Ma Hậu đứng tạm ở Kim Dạ Ngoại Uyển (chờ phó bản Kim Dạ Cung).
    expect(boss.map((s) => s.mon).sort()).toEqual([
      'boss_kim_da_ma_hau',
      'boss_tam_thu_nguc_khuyen',
      'boss_tan_hoa_kiem_co',
      'boss_thu_khich_duc_chu',
    ]);
    expect(boss.find((s) => s.mon === 'boss_tam_thu_nguc_khuyen')).toMatchObject({ x: C, z: C - 90, respawn: 1800 });
    expect(zones.find((z) => z.id === 'khich_giai')!.poly.length).toBeGreaterThan(3);
    expect((lv.spots ?? []).filter((s) => s.id.startsWith('tran_gioi_bia_'))).toHaveLength(5);
    const normal = camps.reduce((a, c) => a + c.count + (c.ranged ? 1 : 0), 0);
    const km2 = zones.reduce((a, z) => a + polyArea(z.poly), 0) / 1e6;
    expect(km2).toBeGreaterThan(1.8);
    expect(km2).toBeLessThan(2.3);
    expect(normal / km2).toBeGreaterThanOrEqual(100);
    expect(normal / km2).toBeLessThanOrEqual(140);
  });

  it('độ phủ cụm đạt chuẩn level', () => {
    const cv = campCoverage(lv);
    expect(cv.p95).toBeLessThanOrEqual(COVER_BY_LEVEL.bac_hoang.p95);
    expect(cv.max).toBeLessThanOrEqual(COVER_BY_LEVEL.bac_hoang.max);
  });

  it('Giới Khích là lòng máng lõm dọc trục giữa, thấp hơn hoang nguyên hai bên', () => {
    const tr = terrainOf(lv);
    for (const z of [-250, -350, -450, -550]) {
      const mid = tr.heightAt(C + 18 * Math.sin((z + 190) / 70) * Math.min(1, (-190 - z) / 40), C + z);
      expect(tr.heightAt(C + 180, C + z)).toBeGreaterThan(mid + 6);
    }
  });

  it('trận bh_: mỗi vùng một trận + trận trạm, không mở sẵn; ba vùng bắc có trận cách bia 12–18 m', () => {
    const pads = TELE_PADS.filter((p) => p.level === 'bac_hoang');
    expect(pads).toHaveLength(7);
    expect(pads.some((p) => p.id === 'bh_tp_tram' && p.zone === '')).toBe(true);
    expect(TELE_FREE.some((id) => id.startsWith('bh_'))).toBe(false);
    const steles = (lv.spots ?? []).filter((s) => s.id.startsWith('tran_gioi_bia_'));
    for (const zone of ['xich_tan_binh', 'kim_da_ngoai_uyen', 'tran_gioi_dai']) {
      const pad = pads.find((p) => p.zone === zone)!;
      const d = Math.min(...steles.filter((s) => s.zone === zone).map((s) => Math.hypot(s.x - pad.x, s.z - pad.z)));
      expect(d).toBeGreaterThanOrEqual(12);
      expect(d).toBeLessThanOrEqual(18);
    }
  });

  it('điểm vào là Vọng Bắc Trạm, trong vùng chơi', () => {
    const tr = terrainOf(lv);
    const s = lv.spawn as { x: number; z: number };
    expect(Math.hypot(s.x - C, s.z - (C + 520))).toBeLessThan(40);
    expect(tr.playDist(s.x, s.z)).toBeLessThan(700);
  });
});
