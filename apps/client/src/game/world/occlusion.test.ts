import { describe, expect, it } from 'vitest';
import { createWorldMaterial } from '../../render/materials/world';
import * as THREE from 'three/webgpu';
import { occluderHit, withOccluderFade, withSightFade } from './occlusion';

describe('occlusion', () => {
  it('material kiến trúc PBR có maskNode và bản clone cho GLB giữ nguyên', () => {
    const m = withOccluderFade(createWorldMaterial({ vertexColors: true }));
    expect(m.isMeshStandardNodeMaterial).toBe(true);
    expect(m.maskNode).not.toBeNull();
    expect(m.clone().maskNode).toBe(m.maskNode);
  });

  it('material cây PBR có maskNode theo đường nhìn', () => {
    const m = withSightFade(createWorldMaterial({ vertexColors: true }));
    expect(m.isMeshStandardNodeMaterial).toBe(true);
    expect(m.maskNode).not.toBeNull();
  });

  it('vật che trên đường camera→mục tiêu mờ dù xa nhân vật; không có mục tiêu thì không', () => {
    const cam = new THREE.Vector3(0, 20, 14);
    const chest = new THREE.Vector3(0, 1, 0);
    const target = new THREE.Vector3(18, 1, -4);
    // Cây đứng giữa camera và mục tiêu, cách nhân vật > 10 m.
    const o = { x: 12, z: -2.5, r: 1.5 };
    expect(occluderHit(o, cam, chest, null, true)).toBe(false);
    expect(occluderHit(o, cam, chest, target, true)).toBe(true);
  });

  it('vùng quanh mục tiêu phía camera cũng mờ; phía sau mục tiêu thì không', () => {
    const cam = new THREE.Vector3(0, 20, 14);
    const chest = new THREE.Vector3(0, 1, 0);
    const target = new THREE.Vector3(30, 1, 0);
    expect(occluderHit({ x: 31, z: 3, r: 1 }, cam, chest, target, true)).toBe(true);
    expect(occluderHit({ x: 31, z: -9, r: 1 }, cam, chest, target, true)).toBe(false);
  });
});
