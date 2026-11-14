import { describe, expect, it } from 'vitest';
import type * as THREE from 'three/webgpu';
import { patchNodeCacheKey, targetSignature } from './nodeCacheFix';

type Ro = { initialCacheKey: number; context: { textures: unknown[] | null; sampleCount?: number } };

/** Renderer giả: chỉ có `_nodes.getForRenderCacheKey` (như three r178) và MRT đổi được. */
function fakeRenderer() {
  const state = { mrt: null as { outputNodes: Record<string, unknown> } | null, baseCalls: 0 };
  const nodes = {
    getForRenderCacheKey(ro: Ro) {
      state.baseCalls++;
      return ro.initialCacheKey;
    },
  };
  const renderer = { _nodes: nodes, getMRT: () => state.mrt };
  return { renderer: renderer as unknown as THREE.WebGPURenderer, nodes, state };
}

const bloomMrt = { outputNodes: { output: {}, bloom: {} } };

describe('patchNodeCacheKey', () => {
  it('cùng material nhưng pass có/không MRT bloom thì khóa shader khác nhau', () => {
    const { renderer, nodes, state } = fakeRenderer();
    patchNodeCacheKey(renderer);
    const low: Ro = { initialCacheKey: 42, context: { textures: [{}], sampleCount: 1 } };
    const med: Ro = { initialCacheKey: 42, context: { textures: [{}, {}], sampleCount: 1 } };
    const kLow = nodes.getForRenderCacheKey(low);
    state.mrt = bloomMrt;
    const kMed = nodes.getForRenderCacheKey(med);
    expect(kLow).not.toBe(kMed);
  });

  it('cùng cấu hình đích thì vẫn dùng chung shader', () => {
    const { renderer, nodes, state } = fakeRenderer();
    patchNodeCacheKey(renderer);
    state.mrt = bloomMrt;
    const a: Ro = { initialCacheKey: 7, context: { textures: [{}, {}], sampleCount: 1 } };
    const b: Ro = { initialCacheKey: 7, context: { textures: [{}, {}], sampleCount: 1 } };
    expect(nodes.getForRenderCacheKey(a)).toBe(nodes.getForRenderCacheKey(b));
  });

  it('khóa được nhớ theo render object để delete() xóa đúng mục dù MRT đã đổi', () => {
    const { renderer, nodes, state } = fakeRenderer();
    patchNodeCacheKey(renderer);
    const ro: Ro = { initialCacheKey: 3, context: { textures: [{}], sampleCount: 1 } };
    const built = nodes.getForRenderCacheKey(ro);
    state.mrt = bloomMrt;
    expect(nodes.getForRenderCacheKey(ro)).toBe(built);
  });

  it('gọi lại không bọc hai lần', () => {
    const { renderer, nodes, state } = fakeRenderer();
    patchNodeCacheKey(renderer);
    patchNodeCacheKey(renderer);
    nodes.getForRenderCacheKey({ initialCacheKey: 1, context: { textures: null } });
    expect(state.baseCalls).toBe(1);
  });

  it('chữ ký đích gồm số đích, số mẫu và tên đầu ra MRT', () => {
    expect(targetSignature({ initialCacheKey: 0, context: { textures: [{}, {}], sampleCount: 4 } }, bloomMrt)).toBe('2:4:output+bloom');
    expect(targetSignature({ initialCacheKey: 0, context: { textures: null } }, null)).toBe('0:1:-');
  });
});
