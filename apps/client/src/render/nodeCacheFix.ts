import type * as THREE from 'three/webgpu';

/**
 * Vá lỗi cache shader của three r178 khi cùng một cảnh được vẽ vào các đích có MRT khác nhau.
 *
 * `Nodes.getForRender` dùng chung `nodeBuilderState` (shader đã dựng) giữa các render object có cùng
 * `getForRenderCacheKey()` = `renderObject.initialCacheKey`. Khóa này gồm material + môi trường/sương/đèn
 * nhưng KHÔNG gồm MRT của renderer hay số đích màu. Đổi preset Thấp (pass cảnh 1 đích, không MRT) ↔ Vừa/Cao
 * (MRT `output` + `bloom`) tạo render object mới trong RenderContext khác, nhưng nó lấy lại shader dựng cho
 * cấu hình kia:
 *   - WebGPU: `Attachment state of [RenderPipeline …] is not compatible with [RenderPassEncoder]`, draw bị bỏ;
 *   - WebGL2: không báo lỗi nhưng ghi sai draw buffer (đích bloom trống hoặc thừa đầu ra).
 *
 * Cách vá: thêm "chữ ký đích" (số đích màu, mẫu MSAA, tên đầu ra MRT) vào khóa. Khóa tính một lần khi render
 * object dựng shader và được nhớ lại, để `Nodes.delete()` (gọi lúc MRT có thể đã khác) xóa đúng mục.
 * Các render object cùng cấu hình vẫn dùng chung shader như cũ.
 */

type RenderObjectLike = {
  initialCacheKey: unknown;
  context: { textures: unknown[] | null; sampleCount?: number };
};
type MrtLike = { outputNodes: Record<string, unknown> } | null;
type NodesLike = { getForRenderCacheKey(ro: RenderObjectLike): unknown; __dtlTargetKey?: boolean };
type RendererInternals = { _nodes?: NodesLike | null; getMRT(): MrtLike };

/** Chữ ký đích hiện tại của renderer cho render object (dùng được để test). */
export function targetSignature(ro: RenderObjectLike, mrt: MrtLike): string {
  const ctx = ro.context;
  const count = ctx.textures ? ctx.textures.length : 0;
  const names = mrt ? Object.keys(mrt.outputNodes).join('+') : '-';
  return `${count}:${ctx.sampleCount ?? 1}:${names}`;
}

/** Gọi một lần sau `renderer.init()`. An toàn khi gọi lại (không bọc hai lần). */
export function patchNodeCacheKey(renderer: THREE.WebGPURenderer): void {
  const r = renderer as unknown as RendererInternals;
  const nodes = r._nodes;
  if (!nodes || typeof nodes.getForRenderCacheKey !== 'function' || nodes.__dtlTargetKey) return;
  const base = nodes.getForRenderCacheKey.bind(nodes);
  const keys = new WeakMap<RenderObjectLike, string>();
  nodes.getForRenderCacheKey = (ro: RenderObjectLike) => {
    let k = keys.get(ro);
    if (k === undefined) {
      k = `${String(base(ro))}|${targetSignature(ro, r.getMRT())}`;
      keys.set(ro, k);
    }
    return k;
  };
  nodes.__dtlTargetKey = true;
}
