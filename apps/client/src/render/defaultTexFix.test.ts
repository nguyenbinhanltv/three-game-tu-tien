import { describe, expect, it } from 'vitest';
import type * as THREE from 'three/webgpu';
import { patchDefaultTextureDestroy } from './defaultTexFix';

/** Backend/textureUtils giả theo three r178: texture chưa nạp trỏ tới GPU texture mặc định chung. */
function fake() {
  const store = new Map<object, { texture?: { destroy(): void; destroyed: boolean } }>();
  const gpu = () => ({
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
  });
  const backend = {
    get: (t: object) => {
      let d = store.get(t);
      if (!d) store.set(t, (d = {}));
      return d;
    },
    delete: (t: object) => void store.delete(t),
  };
  const shared = gpu();
  const defTex = {};
  backend.get(defTex).texture = shared;
  const calls: object[] = [];
  const tu = {
    defaultTexture: { rgba8unorm: defTex } as Record<string, object>,
    destroyTexture(t: object) {
      calls.push(t);
      backend.get(t).texture?.destroy();
      backend.delete(t);
    },
  };
  const renderer = { backend: { ...backend, textureUtils: tu } };
  return { renderer: renderer as unknown as THREE.WebGPURenderer, backend, tu, shared, gpu, calls };
}

describe('patchDefaultTextureDestroy', () => {
  it('dispose texture đang dùng bản mặc định chung KHÔNG destroy GPU texture dùng chung', () => {
    const { renderer, backend, tu, shared } = fake();
    patchDefaultTextureDestroy(renderer);
    const loading = {};
    backend.get(loading).texture = shared; // chưa có ảnh → bản mặc định
    tu.destroyTexture(loading);
    expect(shared.destroyed).toBe(false);
    expect(backend.get(loading).texture).toBeUndefined(); // dữ liệu backend đã xóa
  });

  it('texture có GPU texture riêng vẫn bị destroy như thường', () => {
    const { renderer, backend, tu, gpu, calls } = fake();
    patchDefaultTextureDestroy(renderer);
    const own = {};
    const g = gpu();
    backend.get(own).texture = g;
    tu.destroyTexture(own);
    expect(g.destroyed).toBe(true);
    expect(calls).toEqual([own]);
  });

  it('gọi lại không bọc hai lần; renderer không có defaultTexture (WebGL2) thì bỏ qua', () => {
    const f = fake();
    patchDefaultTextureDestroy(f.renderer);
    const once = f.tu.destroyTexture;
    patchDefaultTextureDestroy(f.renderer);
    expect(f.tu.destroyTexture).toBe(once);
    const gl = { backend: { get: () => ({}), delete: () => undefined, textureUtils: { destroyTexture: () => undefined } } };
    expect(() => patchDefaultTextureDestroy(gl as unknown as THREE.WebGPURenderer)).not.toThrow();
  });
});
