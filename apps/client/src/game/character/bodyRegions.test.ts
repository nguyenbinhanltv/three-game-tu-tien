import { describe, expect, it } from 'vitest';
import { coverUnion, maskIndex, regionOfBone, vertexRegions, BODY_REGIONS } from './bodyRegions';

describe('bodyRegions', () => {
  it('xương Mixamo → vùng', () => {
    expect(regionOfBone('head')).toBe('head');
    expect(regionOfBone('leftshoulder')).toBe('chest');
    expect(regionOfBone('spine2')).toBe('chest');
    expect(regionOfBone('hips')).toBe('belly');
    expect(regionOfBone('leftarm')).toBe('upperArm');
    expect(regionOfBone('rightforearm')).toBe('forearm');
    expect(regionOfBone('lefthandindex2')).toBe('hand');
    expect(regionOfBone('rightupleg')).toBe('thigh');
    expect(regionOfBone('leftleg')).toBe('calf');
    expect(regionOfBone('lefttoebase')).toBe('foot');
    expect(regionOfBone('dtl_sword')).toBeNull();
  });

  it('vùng đỉnh theo xương trội', () => {
    const si = [0, 1, 0, 0, 0, 1, 0, 0];
    const sw = [0.7, 0.3, 0, 0, 0.2, 0.8, 0, 0];
    const r = vertexRegions(si, sw, ['chest', 'calf']);
    expect(Array.from(r)).toEqual([BODY_REGIONS.indexOf('chest'), BODY_REGIONS.indexOf('calf')]);
  });

  it('bỏ tam giác ở vùng bị che, giữ tam giác ranh giới', () => {
    const c = BODY_REGIONS.indexOf('chest');
    const b = BODY_REGIONS.indexOf('belly');
    const region = Int8Array.from([c, c, c, b]);
    const idx = Uint16Array.from([0, 1, 2, 1, 2, 3]);
    const out = maskIndex(idx, region, new Set(['chest']));
    expect(Array.from(out!)).toEqual([1, 2, 3]);
    expect(maskIndex(idx, region, new Set(['foot']))).toBeNull();
  });

  it('hợp vùng che của mảnh áo theo id có hậu tố giới/v2', () => {
    const covers = { set_x_kiem_y: ['chest', 'thigh'], set_y: ['foot'] };
    const u = coverUnion(['set_x_kiem_y_v2_nam', 'set_y_nu', 'khong_co_nam'], covers);
    expect([...u].sort()).toEqual(['chest', 'foot', 'thigh']);
  });
});
