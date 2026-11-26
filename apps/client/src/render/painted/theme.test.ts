import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { PAINTED } from './palette';
import { bladeTone } from './bladeTone';
import { PAINTED_THEMES, setPaintedTheme, themeU } from './theme';

const hex = (c: THREE.Color) => c.getHex(THREE.SRGBColorSpace);
const sat = (h: number) => new THREE.Color().setHex(h, THREE.SRGBColorSpace).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).s;
const lum = (h: number) => {
  const c = new THREE.Color().setHex(h, THREE.SRGBColorSpace);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

describe('bảng Họa Cảnh theo level', () => {
  it('level không có bảng (Vân Lam) dùng cặp đá lát chung', () => {
    setPaintedTheme('cuu_kieu');
    setPaintedTheme('van_lam');
    expect(themeU.on.value).toBe(0);
    expect(hex(themeU.pLit.value)).toBe(PAINTED.paving[0]);
    expect(hex(themeU.pShade.value)).toBe(PAINTED.paving[1]);
    expect(themeU.groundSat.value).toBe(1);
  });

  it('Cửu Kiều: đá lát riêng sáng hơn cặp chung, tối pha lam (không phải sáng nhân cho tối)', () => {
    const t = PAINTED_THEMES.cuu_kieu!;
    setPaintedTheme('cuu_kieu');
    expect(hex(themeU.pLit.value)).toBe(t.paving![0]);
    expect(hex(themeU.pShade.value)).toBe(t.paving![1]);
    expect(lum(t.paving![0])).toBeGreaterThan(lum(PAINTED.paving[0]));
    const shade = new THREE.Color().setHex(t.paving![1], THREE.SRGBColorSpace);
    expect(shade.b).toBeGreaterThan(shade.r);
  });

  it('Vân Hải: màu đỉnh làm nền + lá theo bảng + sân lát Phù Đảo Các; rời level thì tắt hết', () => {
    const t = PAINTED_THEMES.van_hai!;
    setPaintedTheme('van_hai');
    expect(themeU.vcMix.value).toBe(t.vcMix);
    expect(bladeTone.mix.value).toBe(t.bladeMix);
    expect(hex(bladeTone.lit.value)).toBe(t.ground[0]);
    expect(themeU.slab.value.z).toBeGreaterThan(0);
    // tông tối pha lam lục, lạnh hơn tông sáng (không phải sáng nhân cho tối)
    const lit = new THREE.Color().setHex(t.ground[0], THREE.SRGBColorSpace);
    const shade = new THREE.Color().setHex(t.ground[1], THREE.SRGBColorSpace);
    expect(shade.b / shade.r).toBeGreaterThan(lit.b / lit.r);
    expect(sat(t.ground[0])).toBeGreaterThan(0.3);
    // không vùng xa nướng (đảo nổi: biển mây là cảnh xa)
    expect(t.far).toBeUndefined();
    for (const other of ['van_lam', 'cuu_kieu', 'bac_hoang']) {
      setPaintedTheme(other);
      expect(themeU.vcMix.value).toBe(0);
      expect(bladeTone.mix.value).toBe(0);
      expect(themeU.slab.value.z).toBe(0);
    }
  });

  it('Cửu Kiều: cỏ không pastel (bão hòa cặp đất và groundSat đủ đậm), vẫn trong dải vừa phải', () => {
    const t = PAINTED_THEMES.cuu_kieu!;
    expect(sat(t.ground[0])).toBeGreaterThan(0.3);
    expect(sat(t.ground[0])).toBeLessThan(0.5);
    expect(t.groundSat).toBeGreaterThanOrEqual(0.9);
    expect(t.groundSat).toBeLessThanOrEqual(1.2);
  });
});
