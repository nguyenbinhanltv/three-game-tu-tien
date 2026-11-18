import { describe, expect, it } from 'vitest';
import { baseClipOf, JOG_SPEED, V3_MODELS, v3AssetOf } from './mannequin';
import type { AnimState } from './view';

const st = (o: Partial<AnimState> = {}): AnimState => ({ speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, ...o });

describe('baseClipOf (v3, clip UAL)', () => {
  it('chọn clip nền theo trạng thái, chết thắng mọi thứ', () => {
    expect(baseClipOf(st())).toBe('Idle_Loop');
    expect(baseClipOf(st({ combat: true }))).toBe('Sword_Idle');
    expect(baseClipOf(st({ speed: 3 }))).toBe('Jog_Fwd_Loop');
    expect(baseClipOf(st({ meditating: true }))).toBe('Sitting_Idle_Loop');
    expect(baseClipOf(st({ casting: true }))).toBe('Spell_Simple_Idle_Loop');
    expect(baseClipOf(st({ airborne: true }))).toBe('Jump_Loop');
    expect(baseClipOf(st({ flying: true }))).toBe('NinjaJump_Idle_Loop');
    expect(baseClipOf(st({ dead: true, speed: 3, flying: true }))).toBe('Death01');
  });
  it('tốc độ chân trụ tham chiếu khớp số đo trong game (5,4 m/s)', () => {
    expect(JOG_SPEED).toBeCloseTo(5.4, 2);
  });
});

describe('v3AssetOf (chọn asset v3 theo giới + skin)', () => {
  it('không skin: model nữ/nam mặc định', () => {
    expect(v3AssetOf('f')).toBe(V3_MODELS.f);
    expect(v3AssetOf('m')).toBe(V3_MODELS.m);
  });
  it('skin đúng giới đổi asset', () => {
    expect(v3AssetOf('f', 'set_skin_duskrella')).toBe('chr_v3_duskrella_nu');
    expect(v3AssetOf('m', 'set_skin_crimson')).toBe('chr_v3_crimson_nam');
    expect(v3AssetOf('f', 'set_skin_noxavyra')).toBe('chr_v3_noxavyra_nu');
    expect(v3AssetOf('f', 'set_skin_kings_demon')).toBe('chr_v3_kings_demon_nu');
  });
  it('skin sai giới hoặc không có bản v3 thì về model mặc định', () => {
    expect(v3AssetOf('m', 'set_skin_duskrella')).toBe(V3_MODELS.m);
    expect(v3AssetOf('f', 'set_skin_crimson')).toBe(V3_MODELS.f);
    expect(v3AssetOf('m', 'set_skin_noxavyra')).toBe(V3_MODELS.m);
    expect(v3AssetOf('m', 'set_skin_kings_demon')).toBe(V3_MODELS.m);
    expect(v3AssetOf('f', 'set_skin_khong_co')).toBe(V3_MODELS.f);
  });
});

describe('twist (N-4)', () => {
  it('tách góc xoắn quanh trục xương, bỏ phần swing', async () => {
    const { twistAngle } = await import('./mannequin');
    const THREE = await import('three');
    const axis = new THREE.Vector3(0, 1, 0);
    expect(twistAngle(new THREE.Quaternion().setFromAxisAngle(axis, 0.8), axis)).toBeCloseTo(0.8, 5);
    expect(twistAngle(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8), axis)).toBeCloseTo(0, 5);
    const both = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.6).multiply(new THREE.Quaternion().setFromAxisAngle(axis, -0.5));
    expect(twistAngle(both, axis)).toBeCloseTo(-0.5, 1);
  });
});

describe('jogRate (chống trượt chân)', () => {
  it('phát theo tốc độ chạy / 5,4 và kẹp trong [0,4; 2]', async () => {
    const { jogRate, JOG_SPEED } = await import('./mannequin');
    expect(jogRate(JOG_SPEED)).toBeCloseTo(1, 5);
    expect(jogRate(JOG_SPEED * 1.3)).toBeCloseTo(1.3, 5);
    expect(jogRate(0.1)).toBe(0.4);
    expect(jogRate(100)).toBe(2);
  });
});
