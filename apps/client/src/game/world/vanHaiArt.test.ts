import { describe, expect, it } from 'vitest';
import { terrainOf } from '@dtl/shared';
import { VH_PALETTES, vanHaiArt, vhPaintedGrass } from './vanHaiArt';
import { scatterVanHai, vhPick } from './vanHaiScatter';

const def = terrainOf('van_hai').def;
const art = vanHaiArt(def);

describe('vanHaiArt (E3-I: bản sắc từng đảo)', () => {
  it('có 9 đảo thật, mỗi đảo một loại; năm đảo vùng khác bảng màu nhau', () => {
    expect(art.islands.length).toBe(9);
    const kinds = art.islands.map((i) => i.kind);
    for (const k of ['hub', 'tung_dai_dao', 'thach_quy_dao', 'kinh_ho_dao', 'loi_van_dao', 'kinh_ngu_dai'] as const)
      expect(kinds).toContain(k);
    const zones = art.islands.filter((i) => i.r > 100);
    expect(new Set(zones.map((i) => i.pal.stone)).size).toBe(zones.length);
    expect(new Set(zones.map((i) => i.pal.moss)).size).toBe(zones.length);
    expect(Object.keys(VH_PALETTES).length).toBe(7);
  });

  it('mỗi đảo có lối mòn; lối mòn phủ lõi, ngoài dải thì không', () => {
    for (const i of art.islands.filter((x) => x.r > 80)) expect(i.trail.length).toBeGreaterThan(10);
    const hub = art.islands.find((i) => i.kind === 'hub')!;
    const [x, z] = [hub.trail[10]!, hub.trail[11]!];
    expect(art.trailW(hub, x, z)).toBeGreaterThan(0.3);
    expect(art.trailW(hub, hub.x + 70, hub.z - 60)).toBe(0);
  });

  it('hồ gương: lòng hồ lõm so với bờ, trọng số bờ hồ 1 ở tâm và 0 xa hồ', () => {
    const tr = terrainOf('van_hai');
    expect(art.ponds.length).toBeGreaterThan(0);
    const p = art.ponds[0]!;
    expect(art.pondW(p.x, p.z)).toBeCloseTo(1, 3);
    expect(art.pondW(p.x + p.r + 40, p.z)).toBe(0);
    expect(tr.heightAt(p.x + p.r + 2, p.z) - tr.heightAt(p.x, p.z)).toBeGreaterThan(0.5);
  });

  it('mặt đảo nhấp nhô nhưng đi được: độ dốc cục bộ dưới ngưỡng leo, rìa đảo giữ nguyên độ cao', () => {
    const tr = terrainOf('van_hai');
    for (const i of art.islands.filter((x) => x.r > 100)) {
      let lo = 1e9;
      let hi = -1e9;
      let maxSlope = 0;
      for (let a = 0; a < 6.28; a += 0.4)
        for (let d = 10; d < i.r - 8; d += 12) {
          const x = i.x + Math.cos(a) * d;
          const z = i.z + Math.sin(a) * d;
          const h = tr.heightAt(x, z);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          maxSlope = Math.max(maxSlope, Math.hypot(tr.heightAt(x + 1, z) - h, tr.heightAt(x, z + 1) - h));
        }
      expect(maxSlope).toBeLessThan(1.2); // MAX_SLOPE_UP là 1,5
      expect(hi - lo).toBeGreaterThan(0.6); // không còn phẳng như bàn
      // rìa (cách tâm r − 3): về đúng y của đảo để đầu cầu/thang khớp
      expect(Math.abs(tr.heightAt(i.x + i.r - 3, i.z) - i.y)).toBeLessThan(0.6);
    }
  });
});

describe('scatterVanHai theo bản sắc đảo', () => {
  const list = scatterVanHai([]);
  const byKind = (kind: string) => {
    const isl = art.islands.filter((i) => i.kind === kind);
    return list.filter((p) => isl.some((i) => (p.x - i.x) ** 2 + (p.z - i.z) ** 2 < i.r * i.r));
  };
  it('xác định và chỉ trên mặt đảo', () => {
    expect(scatterVanHai([]).length).toBe(list.length);
    expect(list.length).toBeGreaterThan(300);
    for (const p of list) expect(art.islandAt(p.x, p.z)).not.toBeNull();
  });
  it('mỗi đảo vùng có bộ prop chủ đạo riêng', () => {
    const ids = (k: string) => new Set(byKind(k).map((p) => p.id));
    expect(ids('tung_dai_dao').has('prop_duong_xi')).toBe(true);
    expect(ids('kinh_ho_dao').has('prop_truc')).toBe(true);
    expect(ids('loi_van_dao').has('prop_kiem_gay')).toBe(true);
    expect(ids('thach_quy_dao').has('prop_tru_da_khac_van') || ids('thach_quy_dao').has('prop_bia_da')).toBe(true);
    expect(ids('tung_dai_dao').has('prop_kiem_gay')).toBe(false);
  });
  it('vhPick không trả prop cho ô trống (r cao)', () => {
    expect(vhPick('tung_dai_dao', 0, 0, 0, 999, 0.99, 0.5)).toBeNull();
  });
});

describe('vhPaintedGrass (Họa Cảnh P9: cỏ lá mảnh theo đảo)', () => {
  const out = { k: 0, dry: 0 };
  const mean = (kind: string, pick: 'k' | 'dry'): number => {
    const isl = art.islands.find((i) => i.kind === kind)!;
    let sum = 0;
    let n = 0;
    for (let a = 0; a < 64; a++) {
      const r = isl.r * (0.2 + (0.6 * ((a * 37) % 64)) / 64);
      vhPaintedGrass(def, isl.x + Math.cos(a) * r, isl.z + Math.sin(a) * r, 0, out);
      sum += out[pick];
      n++;
    }
    return sum / n;
  };

  it('không cỏ ngoài đảo, trên lối mòn và trong lòng hồ', () => {
    vhPaintedGrass(def, 20, 20, 0, out);
    expect(out.k).toBe(0);
    const hub = art.islands.find((i) => i.kind === 'hub')!;
    vhPaintedGrass(def, hub.trail[10]!, hub.trail[11]!, 0, out);
    expect(out.k).toBeLessThan(0.15);
    const p = art.ponds[0]!;
    vhPaintedGrass(def, p.x, p.z, 0, out);
    expect(out.k).toBe(0);
  });

  it('Tùng Đài rậm hơn Lôi Vân; Lôi Vân khô (úa) hơn Kính Hồ; giá trị trong 0..1', () => {
    expect(mean('tung_dai_dao', 'k')).toBeGreaterThan(mean('loi_van_dao', 'k'));
    expect(mean('loi_van_dao', 'dry')).toBeGreaterThan(0.7);
    expect(mean('kinh_ho_dao', 'dry')).toBeLessThan(0.3);
    for (const i of art.islands) {
      vhPaintedGrass(def, i.x + 11, i.z - 7, 0.4, out);
      expect(out.k).toBeGreaterThanOrEqual(0);
      expect(out.k).toBeLessThanOrEqual(1);
      expect(out.dry).toBeGreaterThanOrEqual(0);
      expect(out.dry).toBeLessThanOrEqual(1);
    }
  });
});
