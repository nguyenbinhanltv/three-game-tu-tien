import type * as THREE from 'three/webgpu';

/**
 * Vá lỗi three r178 (WebGPU): `WebGPUTextureUtils.createDefaultTexture` gán cho mọi texture CHƯA có ảnh một GPU texture 1×1 mặc định DÙNG CHUNG theo format
 * (`textureUtils.defaultTexture[format]`), nhưng `destroyTexture(texture)` (gọi khi `dispose()`) luôn `destroy()` GPU texture mà texture đó đang trỏ tới — kể cả cái dùng chung.
 * Dispose một texture chưa nạp xong (đổi level giữa lúc nạp) làm mọi texture khác còn dùng bản mặc định lỗi
 * `Destroyed texture [Texture (unlabeled 1x1 px, RGBA8UnormSrgb)] used in a submit` (khung đó hỏng, ghi nhận bởi `perf:iso` kieu_1..9, issue #692).
 *
 * Vá: `destroyTexture` bỏ qua `destroy()` khi GPU texture là bản mặc định dùng chung (vẫn xóa dữ liệu backend của texture).
 * BỎ khi nâng three mà upstream đã sửa (không có issue riêng; mã gốc: src/renderers/webgpu/utils/WebGPUTextureUtils.js `createDefaultTexture`/`destroyTexture`).
 */

type GpuTex = { destroy(): void };
type TexLike = object;
type BackendLike = { get(t: TexLike): { texture?: GpuTex; msaaTexture?: GpuTex }; delete(t: TexLike): void };
type TextureUtilsLike = {
  defaultTexture?: Record<string, TexLike>;
  defaultCubeTexture?: Record<string, TexLike>;
  destroyTexture(t: TexLike): void;
  __dtlDefaultKept?: boolean;
};

/** GPU texture có phải bản mặc định dùng chung (2D hoặc cube) của textureUtils không. */
export function isSharedDefault(backend: BackendLike, tu: TextureUtilsLike, gpu: GpuTex | undefined): boolean {
  if (!gpu) return false;
  for (const set of [tu.defaultTexture, tu.defaultCubeTexture]) {
    for (const t of Object.values(set ?? {})) if (backend.get(t).texture === gpu) return true;
  }
  return false;
}

/** Gọi một lần sau `renderer.init()`. WebGL2 (không có `textureUtils.defaultTexture`) và gọi lại: không làm gì. */
export function patchDefaultTextureDestroy(renderer: THREE.WebGPURenderer): void {
  const backend = (renderer as unknown as { backend?: BackendLike & { textureUtils?: TextureUtilsLike } }).backend;
  const tu = backend?.textureUtils;
  if (!backend || !tu || typeof tu.destroyTexture !== 'function' || !tu.defaultTexture || tu.__dtlDefaultKept) return;
  const base = tu.destroyTexture.bind(tu);
  tu.destroyTexture = (texture: TexLike) => {
    if (isSharedDefault(backend, tu, backend.get(texture).texture)) {
      backend.delete(texture); // chỉ bỏ liên kết, KHÔNG destroy bản dùng chung
      return;
    }
    base(texture);
  };
  tu.__dtlDefaultKept = true;
}
