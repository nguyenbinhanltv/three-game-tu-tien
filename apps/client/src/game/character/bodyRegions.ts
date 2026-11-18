import * as THREE from 'three/webgpu';
import { boneKey } from './ikpose';

/**
 * Vùng thân của nhân vật nền v2 (CHR-PROTO, `?chr=v2`): mỗi bộ trang phục khai báo vùng nó che (`outfit_covers.json`), thân nền
 * ẩn tam giác thuộc các vùng đó → hết xuyên mesh, bớt tam giác. Vùng suy từ xương trội của từng đỉnh (không cần thuộc tính riêng nên
 * sống sót qua meshopt/quantize). Hàm thuần, không đụng engine.
 */
type BodyRegion = 'head' | 'neck' | 'chest' | 'belly' | 'upperArm' | 'forearm' | 'hand' | 'thigh' | 'calf' | 'foot';

export const BODY_REGIONS: readonly BodyRegion[] = [
  'head',
  'neck',
  'chest',
  'belly',
  'upperArm',
  'forearm',
  'hand',
  'thigh',
  'calf',
  'foot',
];

/** Xương (theo `boneKey`) → vùng; null nếu xương không thuộc vùng nào (xương phụ, kiếm). */
export function regionOfBone(key: string): BodyRegion | null {
  if (key === 'dtl_sword') return null;
  if (key.startsWith('head')) return 'head';
  if (key.startsWith('neck')) return 'neck';
  if (key.includes('hand')) return 'hand';
  if (key === 'spine1' || key === 'spine2' || key.endsWith('shoulder')) return 'chest';
  if (key === 'spine' || key === 'hips') return 'belly';
  if (key.endsWith('forearm')) return 'forearm';
  if (key.endsWith('arm')) return 'upperArm';
  if (key.endsWith('upleg')) return 'thigh';
  if (key.endsWith('leg')) return 'calf';
  if (key.endsWith('foot') || key.endsWith('toebase') || key.includes('toe')) return 'foot';
  return null;
}

/** Vùng của từng đỉnh theo xương trội: chỉ số vào `BODY_REGIONS`, -1 nếu không rõ. */
export function vertexRegions(si: ArrayLike<number>, sw: ArrayLike<number>, boneRegion: readonly (BodyRegion | null)[]): Int8Array {
  const n = Math.floor(si.length / 4);
  const out = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = -1;
    let bw = 0;
    for (let c = 0; c < 4; c++) {
      const w = sw[i * 4 + c];
      if (w > bw) {
        bw = w;
        best = si[i * 4 + c];
      }
    }
    const r = best >= 0 ? boneRegion[best] : null;
    out[i] = r ? BODY_REGIONS.indexOf(r) : -1;
  }
  return out;
}

/**
 * Chỉ số tam giác sau khi bỏ vùng bị che: bỏ tam giác mà cả ba đỉnh đều thuộc vùng bị che (tam giác nằm ở ranh giới giữ lại,
 * nằm dưới áo). Trả null nếu không bỏ được gì.
 */
export function maskIndex(index: ArrayLike<number>, region: Int8Array, covered: ReadonlySet<BodyRegion>): Uint16Array | Uint32Array | null {
  const hide = new Uint8Array(BODY_REGIONS.length);
  for (const r of covered) hide[BODY_REGIONS.indexOf(r)] = 1;
  const out: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = region[index[t]];
    const b = region[index[t + 1]];
    const c = region[index[t + 2]];
    if (a >= 0 && b >= 0 && c >= 0 && hide[a] && hide[b] && hide[c]) continue;
    out.push(index[t], index[t + 1], index[t + 2]);
  }
  if (out.length === index.length) return null;
  const big = (index as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT === 4;
  return big ? Uint32Array.from(out) : Uint16Array.from(out);
}

/** Chỉ số tam giác của lưới nhân vật v2 sau khi bỏ `covered`; null nếu thiếu skin hoặc không bỏ gì. */
export function coveredIndex(mesh: THREE.SkinnedMesh, covered: ReadonlySet<BodyRegion>): Uint16Array | Uint32Array | null {
  const g = mesh.geometry;
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const idx = g.index?.array;
  if (!si || !sw || !idx || !covered.size) return null;
  const boneRegion = mesh.skeleton.bones.map((b) => regionOfBone(boneKey(b.name)));
  return maskIndex(idx, vertexRegions(si.array as ArrayLike<number>, sw.array as ArrayLike<number>, boneRegion), covered);
}

/** Hợp các vùng che của nhiều mảnh áo (`covers[mảnh]`, mảnh không khai báo thì không che gì). */
export function coverUnion(parts: readonly string[], covers: Readonly<Record<string, readonly string[]>>): Set<BodyRegion> {
  const out = new Set<BodyRegion>();
  for (const p of parts)
    for (const r of covers[p.replace(/_v2(?=_(nam|nu)$)/, '').replace(/_(nam|nu)$/, '')] ?? [])
      if ((BODY_REGIONS as readonly string[]).includes(r)) out.add(r as BodyRegion);
  return out;
}
