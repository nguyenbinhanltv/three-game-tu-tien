import * as THREE from 'three/webgpu';
import { BATCH_ATTR, type FxKind, type FxMesh, type FxPool, fxBatchMaterial } from './vfx';

/**
 * Gộp draw call của hiệu ứng (K-6, T4). Mọi `FxMesh` sống thuộc các kiểu `glow`/`flat`/`solid`/`slash`/`ink`/`sigil`/`dome`/`inkpool` được gom theo
 * (kiểu, hình, renderOrder) và vẽ bằng `InstancedMesh`: 50 người cùng đánh thì vài chục lưới cùng hình chỉ còn một
 * draw call mỗi nhóm. `renderOrder` nằm trong khóa để lớp mực nền (renderOrder âm) vẫn vẽ trước lớp sáng.
 *
 * Mỗi khung: duyệt `pool.batched`, ghi ma trận + (màu, độ trong), `fxA`, `fxK` của từng lưới vào bộ đệm chung
 * của nhóm. Nhóm có thể nhiều "mảnh" (`CHUNK` instance mỗi mảnh); mảnh không dùng thì ẩn (không tốn draw call).
 */

/** Số instance mỗi mảnh. */
export const BATCH_CHUNK = 64;

interface Chunk {
  mesh: THREE.InstancedMesh;
  c: Float32Array;
  a: Float32Array;
  b: Float32Array;
  k: Float32Array;
}

interface Bucket {
  kind: FxKind;
  geo: THREE.BufferGeometry;
  order: number;
  chunks: Chunk[];
  used: number;
}

export class FxBatcher {
  readonly root = new THREE.Group();
  private buckets = new Map<string, Bucket>();

  constructor(private pool: FxPool) {
    this.root.name = 'fx-batch';
  }

  private makeChunk(b: Bucket): Chunk {
    // Mỗi mảnh có bản sao hình riêng để giữ thuộc tính instance riêng (hình gốc dùng chung nhiều nhóm).
    const geo = b.geo.clone();
    const attr = (n: string) => {
      const arr = new Float32Array(BATCH_CHUNK * 4);
      const a = new THREE.InstancedBufferAttribute(arr, 4);
      geo.setAttribute(n, a);
      return arr;
    };
    const c = attr(BATCH_ATTR.c);
    const a = attr(BATCH_ATTR.a);
    const bb = attr(BATCH_ATTR.b);
    const k = attr(BATCH_ATTR.k);
    const mesh = new THREE.InstancedMesh(geo, fxBatchMaterial(b.kind), BATCH_CHUNK);
    mesh.frustumCulled = false;
    mesh.renderOrder = b.order;
    mesh.count = 0;
    mesh.visible = false;
    this.root.add(mesh);
    return { mesh, c, a, b: bb, k };
  }

  /** Ghi mọi tay cầm đang sống vào các `InstancedMesh`. Gọi một lần mỗi khung, sau khi hiệu ứng đã cập nhật. */
  flush(): void {
    for (const b of this.buckets.values()) b.used = 0;
    for (const h of this.pool.batched) {
      // Độ trong 0 vẫn được ghi: lưới "vẽ ấm" (prewarm) cần được vẽ một lần để biên dịch shader.
      if (!h.visible) continue;
      const key = `${h.fxKind}|${h.geometry.uuid}|${h.renderOrder}`;
      let b = this.buckets.get(key);
      if (!b) {
        b = { kind: h.fxKind, geo: h.geometry, order: h.renderOrder, chunks: [], used: 0 };
        this.buckets.set(key, b);
      }
      const ci = Math.floor(b.used / BATCH_CHUNK);
      const i = b.used % BATCH_CHUNK;
      const ch = b.chunks[ci] ?? (b.chunks[ci] = this.makeChunk(b));
      b.used++;
      h.updateMatrix();
      ch.mesh.setMatrixAt(i, h.matrix);
      const o = i * 4;
      ch.c[o] = h.fxColor.r;
      ch.c[o + 1] = h.fxColor.g;
      ch.c[o + 2] = h.fxColor.b;
      ch.c[o + 3] = h.fxOpacity;
      ch.a[o] = h.fxA.x;
      ch.a[o + 1] = h.fxA.y;
      ch.a[o + 2] = h.fxA.z;
      ch.a[o + 3] = h.fxA.w;
      ch.b[o] = h.fxB.x;
      ch.b[o + 1] = h.fxB.y;
      ch.b[o + 2] = h.fxB.z;
      ch.b[o + 3] = h.fxB.w;
      ch.k[o] = h.fxK;
    }
    for (const b of this.buckets.values()) {
      for (let ci = 0; ci < b.chunks.length; ci++) {
        const ch = b.chunks[ci];
        const n = Math.max(0, Math.min(BATCH_CHUNK, b.used - ci * BATCH_CHUNK));
        ch.mesh.count = n;
        ch.mesh.visible = n > 0;
        if (n === 0) continue;
        ch.mesh.instanceMatrix.needsUpdate = true;
        const g = ch.mesh.geometry;
        (g.getAttribute(BATCH_ATTR.c) as THREE.BufferAttribute).needsUpdate = true;
        (g.getAttribute(BATCH_ATTR.a) as THREE.BufferAttribute).needsUpdate = true;
        (g.getAttribute(BATCH_ATTR.b) as THREE.BufferAttribute).needsUpdate = true;
        (g.getAttribute(BATCH_ATTR.k) as THREE.BufferAttribute).needsUpdate = true;
      }
    }
  }

  /** Số draw call đang dùng (mảnh hiện) và số tay cầm được gộp: để đo. */
  stats(): { draws: number; handles: number } {
    let draws = 0;
    for (const b of this.buckets.values()) for (const ch of b.chunks) if (ch.mesh.visible) draws++;
    return { draws, handles: this.pool.batched.size };
  }

  dispose(): void {
    for (const b of this.buckets.values()) for (const ch of b.chunks) ch.mesh.geometry.dispose();
    this.buckets.clear();
    this.root.clear();
    this.root.removeFromParent();
  }
}

export type { FxMesh };
