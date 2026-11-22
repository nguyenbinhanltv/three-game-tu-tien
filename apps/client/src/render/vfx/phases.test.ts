import { describe, expect, it } from 'vitest';
import { FX_MAX_HDR } from '../materials/vfx';
import { BLADE_LIFE, BLADE_PTS, BLADE_SEG, BLADE_SUB, bladeVisible, bladeWindow, BladeRibbon, catmull } from './bladeTrail';
import { RAIN_NEAR_CLEAR, RAIN_NEAR_FULL, rainNearFade } from './swordRain';
import {
  BURST_DUR,
  capsFor,
  DEFAULT_TINT,
  erodeAt,
  fadeFor,
  FADE_MAX,
  FADE_MIN,
  hazardFlash,
  hazardStyle,
  hazardDanger,
  hazardStyleDanger,
  hdrGain,
  HDR_BURST,
  HDR_GATHER,
  INK_EXTRA,
  maxRadiusFor,
  METHOD_TINT,
  phaseAt,
  screenCover,
  tintOfMethod,
} from './phases';
import * as THREE from 'three/webgpu';

describe('K-6 nhịp ba pha', () => {
  it('đỉnh HDR: tụ lực ≤ 1,2, bùng nổ trong 2,0–2,4', () => {
    expect(HDR_GATHER).toBeLessThanOrEqual(1.2);
    expect(HDR_BURST).toBeGreaterThanOrEqual(2.0);
    expect(HDR_BURST).toBeLessThanOrEqual(FX_MAX_HDR);
  });
  it('phaseAt: tụ lực tới hitAt−0,05, bùng nổ 0,10–0,16 s, rồi tan', () => {
    expect(BURST_DUR).toBeGreaterThanOrEqual(0.1);
    expect(BURST_DUR).toBeLessThanOrEqual(0.16);
    expect(phaseAt(0.2, 0.4)).toBe('gather');
    expect(phaseAt(0.36, 0.4)).toBe('burst');
    expect(phaseAt(0.4, 0.4)).toBe('burst');
    expect(phaseAt(0.4 - 0.05 + BURST_DUR + 0.01, 0.4)).toBe('fade');
    expect(phaseAt(5, 0.4)).toBe('done');
  });
  it('thời lượng tan 0,35–0,7 s, mực sống lâu hơn sáng 0,3 s', () => {
    for (const p of [0, 1, 3, 6, 20]) {
      expect(fadeFor(p)).toBeGreaterThanOrEqual(FADE_MIN);
      expect(fadeFor(p)).toBeLessThanOrEqual(FADE_MAX);
    }
    expect(INK_EXTRA).toBeCloseTo(0.3);
    // Khi lớp sáng đã tan hết, lớp mực mới ăn mòn được một phần.
    expect(erodeAt(0.5, 0.5, false)).toBe(1);
    expect(erodeAt(0.5, 0.5, true)).toBeLessThan(1);
    expect(erodeAt(-1, 0.5)).toBe(0);
  });
  it('ngân sách mỗi chiêu', () => {
    expect(capsFor(true, false)).toEqual({ particles: 60, meshes: 4 });
    expect(capsFor(false, false)).toEqual({ particles: 30, meshes: 2 });
    expect(capsFor(true, true).particles).toBe(400);
    expect(capsFor(false, true).particles).toBe(150);
  });
  it('hdrGain đưa kênh sáng nhất (tuyến tính) về đúng đỉnh', () => {
    for (const hex of Object.values(METHOD_TINT)) {
      const c = new THREE.Color().setHex(hex);
      const g = hdrGain(hex, 2.3);
      expect(Math.max(c.r, c.g, c.b) * g).toBeCloseTo(2.3, 3);
    }
    expect(hdrGain(0x000000, 2)).toBe(1);
  });
  it('màu theo công pháp, không có tím', () => {
    expect(tintOfMethod('lac_kiem_quyet')).toBe(0xcff3ff);
    expect(tintOfMethod('bat_dong_kim_than')).toBe(0xffde96);
    expect(tintOfMethod('thanh_moc_dan_kinh')).toBe(0x7fe3d0);
    expect(tintOfMethod(undefined)).toBe(DEFAULT_TINT);
    for (const hex of Object.values(METHOD_TINT)) {
      // tím = xanh dương và đỏ cùng cao hơn xanh lá
      const r = (hex >> 16) & 255;
      const g = (hex >> 8) & 255;
      const b = hex & 255;
      expect(g >= Math.min(r, b)).toBe(true);
    }
  });
  it('che không quá 25% màn hình ở bán kính tối đa', () => {
    for (const d of [3.5, 5, 10]) {
      const r = maxRadiusFor(d, 55, 16 / 9);
      expect(screenCover(r, d, 55, 16 / 9)).toBeCloseTo(0.25, 3);
    }
  });
});

describe('vạch báo quái theo mức nguy hiểm (iso)', () => {
  it('boss/lớn/lao nhảy là mức 2, vũng và triệu hồi mức 0', () => {
    expect(hazardDanger({ boss: true, r: 2 })).toBe(2);
    expect(hazardDanger({ boss: false, r: 7 })).toBe(2);
    expect(hazardDanger({ boss: false, r: 2, mv: 'charge' })).toBe(2);
    expect(hazardDanger({ boss: false, r: 3.5 })).toBe(1);
    expect(hazardDanger({ boss: false, r: 2 })).toBe(0);
    expect(hazardDanger({ boss: true, r: 8, mv: 'pool' })).toBe(0);
  });
  it('màu tăng dần, thiên lôi giữ tím, HDR không vượt trần', () => {
    const c = [0, 1, 2].map((d) => hazardStyleDanger('fire', d as 0 | 1 | 2).color);
    expect(new Set(c).size).toBe(3);
    expect(hazardStyleDanger('lightning', 2).color).toBe(0xb48cff);
  });
});

describe('vạch báo quái', () => {
  it('son đỏ cho quái thường, ma khí cho boss, thiên lôi giữ tím sét', () => {
    expect(hazardStyle('fire', false).color).toBe(0x9d392e);
    expect(hazardStyle('frost', true).color).toBe(0x4a2b5e);
    expect(hazardStyle('lightning', false).color).toBe(0xb48cff);
  });
  it('nháy đúng một lần trong 80 ms cuối', () => {
    const delay = 1.2;
    expect(hazardFlash(0.5, delay)).toBe(0);
    expect(hazardFlash(1 - 0.079 / delay, delay)).toBe(1);
    expect(hazardFlash(1 - 0.09 / delay, delay)).toBe(0);
    expect(hazardFlash(1, delay)).toBe(1);
  });
});

describe('vệt kiếm', () => {
  it('cửa sổ lấy mẫu [hitAt−0,10, hitAt+0,08]; số đoạn 12–16, tuổi 0,18–0,25 s', () => {
    const [a, b] = bladeWindow(0.4);
    expect(a).toBeCloseTo(0.3);
    expect(b).toBeCloseTo(0.48);
    expect(BLADE_SEG).toBeGreaterThanOrEqual(12);
    expect(BLADE_SEG).toBeLessThanOrEqual(16);
    expect(BLADE_LIFE).toBeGreaterThanOrEqual(0.18);
    expect(BLADE_LIFE).toBeLessThanOrEqual(0.25);
  });
  it('người khác chỉ vẽ trong 25 m', () => {
    expect(bladeVisible(false, 24)).toBe(true);
    expect(bladeVisible(false, 26)).toBe(false);
    expect(bladeVisible(true, 100)).toBe(true);
  });
  it('dải giữ tối đa BLADE_SEG mẫu và hết hạn theo tuổi', () => {
    const r = new BladeRibbon();
    r.reset('a');
    const v = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      r.push(v.set(i, 0, 0), v.set(i, 1, 0));
      r.step(0.001);
    }
    expect(r.n).toBe(BLADE_SEG);
    expect(r.step(BLADE_LIFE + 0.01)).toBe(0);
    expect(r.build()).toBe(0);
  });
});

describe('vệt kiếm Catmull-Rom (EdgeFlux)', () => {
  it('nội suy đi qua hai mẫu giữa và tuyến tính khi các mẫu thẳng hàng', () => {
    expect(catmull(0, 1, 2, 3, 0)).toBeCloseTo(1);
    expect(catmull(0, 1, 2, 3, 1)).toBeCloseTo(2);
    expect(catmull(0, 1, 2, 3, 0.5)).toBeCloseTo(1.5);
  });
  it('số điểm vẽ cố định, ghi đủ mẫu thật ở hai đầu, không NaN, u tăng dần theo tuổi', () => {
    expect(BLADE_PTS).toBe((BLADE_SEG - 1) * BLADE_SUB + 1);
    const r = new BladeRibbon();
    r.reset('a');
    const b = new THREE.Vector3();
    const t = new THREE.Vector3();
    // Vung theo cung: 6 mẫu cách nhau 10 ms.
    for (let i = 0; i < 6; i++) {
      const a = i * 0.3;
      r.push(b.set(Math.cos(a), 0, Math.sin(a)), t.set(Math.cos(a) * 2, 0, Math.sin(a) * 2));
      r.step(0.01);
    }
    expect(r.build()).toBe(1);
    const P = r.geo.getAttribute('position').array as Float32Array;
    const UV = r.geo.getAttribute('uv').array as Float32Array;
    expect(P.length).toBe(BLADE_PTS * 6);
    for (const v of P) expect(Number.isFinite(v)).toBe(true);
    // Điểm đầu = mẫu mới nhất (a = 1,5), điểm cuối phần có dữ liệu = mẫu cũ nhất (a = 0).
    expect(P[0]).toBeCloseTo(Math.cos(1.5), 5);
    const last = 5 * BLADE_SUB * 6;
    expect(P[last]).toBeCloseTo(1, 5);
    let prev = -1;
    for (let q = 0; q <= 5 * BLADE_SUB; q++) {
      expect(UV[q * 4]).toBeGreaterThanOrEqual(prev);
      prev = UV[q * 4]!;
    }
  });
  it('dưới hai mẫu thì không vẽ', () => {
    const r = new BladeRibbon();
    r.reset('a');
    r.push(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    expect(r.build()).toBe(0);
  });
});

describe('mưa kiếm gần camera (G5)', () => {
  it('tan hẳn trong 2 m, đặc từ 6 m', () => {
    expect(rainNearFade(RAIN_NEAR_FULL)).toBe(0);
    expect(rainNearFade(1)).toBe(0);
    expect(rainNearFade(RAIN_NEAR_CLEAR)).toBe(1);
    expect(rainNearFade(30)).toBe(1);
    expect(rainNearFade(4)).toBeGreaterThan(0);
    expect(rainNearFade(4)).toBeLessThan(1);
  });
});

import { hazardStack } from './phases';
describe('vùng báo trước chồng nhau (E3-B)', () => {
  const h = (x: number, z: number, r = 4) => ({ x, z, r });
  it('vùng đơn lẻ giữ nguyên; càng nhiều vùng cùng chỗ càng mờ, từ vùng thứ 3 bỏ hiệu ứng nổ', () => {
    expect(hazardStack([], h(0, 0))).toEqual({ dim: 1, fx: true });
    expect(hazardStack([h(50, 50)], h(0, 0))).toEqual({ dim: 1, fx: true });
    const two = hazardStack([h(0, 0)], h(1, 0));
    expect(two.dim).toBeCloseTo(1 / Math.sqrt(2));
    expect(two.fx).toBe(true);
    const four = hazardStack([h(0, 0), h(0, 0), h(1, 0), h(0, 1)], h(0, 0));
    expect(four.dim).toBeLessThan(0.5);
    expect(four.dim).toBeGreaterThanOrEqual(0.35);
    expect(four.fx).toBe(false);
  });
});
