import * as THREE from 'three/webgpu';
import { float } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { cloneWorldMaterial, createWorldMaterial } from './world';

describe('cloneWorldMaterial', () => {
  it('giữ texture, màu, thông số PBR và node của bản gốc (clone() của three bỏ sót phần PBR thường)', () => {
    const map = new THREE.Texture();
    const normalMap = new THREE.Texture();
    const roughnessMap = new THREE.Texture();
    const src = createWorldMaterial({ map, normalMap, roughnessMap, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide });
    src.color.setRGB(0.96, 0.82, 0.76);
    src.envMapIntensity = 0.55;
    src.normalScale.set(0.5, 0.5);
    src.roughnessNode = float(0.7);
    const m = cloneWorldMaterial(src);
    expect(m).not.toBe(src);
    expect(m.map).toBe(map);
    expect(m.normalMap).toBe(normalMap);
    expect(m.roughnessMap).toBe(roughnessMap);
    expect(m.roughness).toBe(0.4);
    expect(m.metalness).toBe(0.5);
    expect(m.envMapIntensity).toBe(0.55);
    expect(m.color.getHex()).toBe(src.color.getHex());
    expect(m.normalScale.x).toBe(0.5);
    expect(m.side).toBe(THREE.DoubleSide);
    expect(m.roughnessNode).toBe(src.roughnessNode);
  });

  it('đổi bản sao không đụng bản gốc', () => {
    const src = createWorldMaterial({ map: new THREE.Texture() });
    src.color.setRGB(0.2, 0.4, 0.6);
    const m = cloneWorldMaterial(src);
    m.color.setRGB(1, 0, 0);
    m.colorNode = float(1);
    expect(src.color.r).toBeCloseTo(0.2);
    expect(src.colorNode).toBeNull();
  });
});
