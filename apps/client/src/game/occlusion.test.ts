import { describe, expect, it } from 'vitest';
import { createWorldMaterial } from '../render/materials/world';
import { withOccluderFade, withSightFade } from './occlusion';

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
});
