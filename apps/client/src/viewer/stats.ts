import * as THREE from 'three/webgpu';

export interface TexInfo {
  name: string;
  width: number;
  height: number;
  /** true nếu là texture nén GPU (KTX2/Basis). */
  compressed: boolean;
  /** Ước tính bộ nhớ GPU (byte), có tính mip. */
  bytes: number;
  /** Các slot material dùng texture này (map, normalMap…). */
  slots: string[];
}

export interface ModelStats {
  meshes: number;
  skinned: number;
  materials: number;
  triangles: number;
  /** Ước tính draw call của riêng model (mỗi mesh × nhóm material × instance batch), chưa tính bóng. */
  drawCalls: number;
  bones: number;
  size: THREE.Vector3;
  textures: TexInfo[];
  textureBytes: number;
}

function triCount(g: THREE.BufferGeometry): number {
  const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
  const range = Math.min(n, g.drawRange.count === Infinity ? n : g.drawRange.count);
  return Math.floor(range / 3);
}

function texSize(tex: THREE.Texture): { w: number; h: number } {
  const img = tex.image as { width?: number; height?: number } | undefined;
  const mip = (tex as THREE.CompressedTexture).mipmaps?.[0] as { width?: number; height?: number } | undefined;
  return { w: img?.width ?? mip?.width ?? 0, h: img?.height ?? mip?.height ?? 0 };
}

function texBytes(tex: THREE.Texture, w: number, h: number): number {
  if ((tex as THREE.CompressedTexture).isCompressedTexture) {
    const mips = (tex as THREE.CompressedTexture).mipmaps as unknown as { data?: ArrayBufferView }[] | undefined;
    const sum = (mips ?? []).reduce((s, m) => s + (m.data?.byteLength ?? 0), 0);
    if (sum > 0) return sum;
  }
  // RGBA8 + chuỗi mip ≈ 4/3.
  return Math.round(w * h * 4 * (tex.generateMipmaps || tex.mipmaps?.length ? 4 / 3 : 1));
}

export function collectStats(root: THREE.Object3D): ModelStats {
  const mats = new Set<THREE.Material>();
  const texs = new Map<THREE.Texture, TexInfo>();
  const bones = new Set<THREE.Bone>();
  let meshes = 0;
  let skinned = 0;
  let triangles = 0;
  let drawCalls = 0;

  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const sk = o as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) {
      skinned++;
      for (const b of sk.skeleton.bones) bones.add(b);
    }
    const instances = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
    triangles += triCount(m.geometry) * instances;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    drawCalls += Array.isArray(m.material) ? Math.max(1, m.geometry.groups.length) : 1;
    for (const mat of list) {
      mats.add(mat);
      for (const [slot, v] of Object.entries(mat)) {
        const tex = v as THREE.Texture | null;
        if (!tex || !(tex as THREE.Texture).isTexture) continue;
        let info = texs.get(tex);
        if (!info) {
          const { w, h } = texSize(tex);
          info = {
            name: tex.name || (tex.image as { src?: string } | undefined)?.src?.split('/').pop() || slot,
            width: w,
            height: h,
            compressed: !!(tex as THREE.CompressedTexture).isCompressedTexture,
            bytes: texBytes(tex, w, h),
            slots: [],
          };
          texs.set(tex, info);
        }
        if (!info.slots.includes(slot)) info.slots.push(slot);
      }
    }
  });

  const box = new THREE.Box3().setFromObject(root, true);
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  const textures = [...texs.values()].sort((a, b) => b.bytes - a.bytes);
  return {
    meshes,
    skinned,
    materials: mats.size,
    triangles,
    drawCalls,
    bones: bones.size,
    size,
    textures,
    textureBytes: textures.reduce((s, x) => s + x.bytes, 0),
  };
}

export function fmtBytes(n: number): string {
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(2) + ' MB';
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(1) + ' KB';
  return n + ' B';
}
