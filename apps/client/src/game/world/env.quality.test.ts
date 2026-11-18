import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { Environment } from './env';

describe('Environment: preset Cực cao', () => {
  it('Cực cao giữ biển mây 3 lớp như Cao, kể cả sau khi đổi level dựng lại biển mây', () => {
    const env = new Environment(new THREE.Scene(), false);
    env.setQuality('high');
    expect(env.cloudSea.layers).toBe(3);
    env.setQuality('medium');
    expect(env.cloudSea.layers).toBe(2);
    env.setQuality('ultra');
    expect(env.cloudSea.layers).toBe(3);
    env.setLevel('van_hai', { clouds: true, lake: false });
    expect(env.cloudSea.layers).toBe(3);
    env.setLevel('van_lam', { clouds: true, lake: true });
    expect(env.cloudSea.layers).toBe(3);
  });
  it('Thấp 1 lớp, Vừa 2 lớp; đổi level ở Vừa không đổi mức', () => {
    const env = new Environment(new THREE.Scene(), false);
    env.setQuality('low');
    expect(env.cloudSea.layers).toBe(1);
    env.setQuality('medium');
    env.setLevel('van_hai', { clouds: true, lake: false });
    expect(env.cloudSea.layers).toBe(2);
  });
});
