import * as THREE from 'three/webgpu';
import { abs, atan, clamp, float, floor, fract, length, max, min, mix, smoothstep, step, texture, uv, vec2, vec3 } from 'three/tsl';
import { FORGE_DECALS, FORGE_FLIPS } from '@dtl/shared';
import type { FxUniforms, N } from './common';

/**
 * Texture Họa Pháp Lô 2 dùng chung (Codex vẽ → `forge import` → KTX2 ở `public/assets/vfx/<id>.ktx2`, xem docs/handbook/vfx-forge.md).
 * `render/` không được import `game/`, nên việc nạp file nằm ở `game/fx/forgeLoad.ts`; ở đây chỉ giữ chỗ (texture trong suốt 1×1) và
 * đổi `.value` của TextureNode khi file về: shader biên dịch một lần, texture thật hiện từ khung sau. Chưa nạp được (mạng lỗi, KTX2 không
 * hỗ trợ) thì lớp này vô hình, phần còn lại của timeline vẫn chạy.
 */
const IDS = [...FORGE_DECALS, ...FORGE_FLIPS] as const;
export type ForgeTexId = (typeof IDS)[number];

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
blank.needsUpdate = true;
const nodes = new Map<ForgeTexId, ReturnType<typeof texture>>();
const loaded = new Set<ForgeTexId>();

function node(id: ForgeTexId): ReturnType<typeof texture> {
  let n = nodes.get(id);
  if (!n) {
    n = texture(blank);
    nodes.set(id, n);
  }
  return n;
}

export const forgeTexIds = (): readonly ForgeTexId[] => IDS;
export const forgeTexLoaded = (id: ForgeTexId): boolean => loaded.has(id);

/** Gắn texture đã nạp (KTX2 màu sRGB, lọc tuyến tính, kẹp mép). */
export function setForgeTexture(id: ForgeTexId, tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.mipmaps?.length ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  node(id).value = tex;
  loaded.add(id);
}

/** Số thứ tự decal trong `fxA.w` (kind mapDecal): theo thứ tự `FORGE_DECALS`. */
export const forgeDecalIndex = (id: string): number => Math.max(0, (FORGE_DECALS as readonly string[]).indexOf(id));

/**
 * `mapDecal`: decal nhìn thẳng từ trên, ảnh Codex làm lớp chất liệu. `fxA` = (mọc 0..1, mờ 0..1, seed, chỉ số `FORGE_DECALS`); `fxK` 1→0 độ nóng.
 * Mọc từ tâm ra rìa theo `fxA.x` (mép mọc mềm), mờ dần theo `fxA.y`; màu = ảnh × độ nóng, pha một chút màu bảng màu để theo nhánh.
 * `fxB.w` > 0 = nửa góc (rad) của MẶT QUẠT: chỉ giữ hình quạt từ tâm theo hướng +Z cục bộ, viền quạt sáng màu `fxB.rgb` (vẽ mặt quạt băng của đòn quét).
 */
export function mapDecalNodes(U: FxUniforms): { color: N; opacity: N } {
  const q = uv();
  const r = length(q.sub(0.5).mul(2));
  const sel = U.a.w;
  const a = node('warn_crack').sample(q);
  const b = node('ice_crack').sample(q);
  const s = mix(a, b, step(0.5, sel));
  const reveal = float(1).sub(smoothstep(U.a.x.mul(1.08).sub(0.14), U.a.x.mul(1.08), r));
  const heat = U.k.mul(0.5).add(0.5);
  const tint = mix(vec3(1, 1, 1), U.color.mul(1.4), 0.25);
  // Mặt quạt: góc lệch khỏi +Z cục bộ (p.y = -z), cắt mềm; viền quạt = hai cạnh + cung ngoài.
  const p = q.sub(0.5).mul(2);
  const half = U.b.w;
  const ang = atan(abs(p.x), p.y.negate());
  const fan = step(0.0001, half);
  const inFan = float(1).sub(smoothstep(half.sub(0.02), half, ang));
  const mask = mix(float(1), inFan.mul(step(r, 1.0)), fan);
  const edge = max(smoothstep(half.sub(0.1), half.sub(0.02), ang), smoothstep(0.9, 0.975, r))
    .mul(mask)
    .mul(fan);
  const base = s.rgb.mul(tint).mul(heat.mul(0.55).add(0.7));
  const lit = mix(base, U.b.xyz.mul(1.3), edge.mul(1.0));
  const alpha = max(s.a, edge.mul(1.0));
  return { color: min(lit, U.maxHdr), opacity: U.opacity.mul(alpha).mul(mask).mul(reveal).mul(float(1).sub(U.a.y)) };
}

/** `mapFlip`: flipbook 4×4 của ảnh Codex (`ice_flip`): khung = ⌊k × 16⌋, trộn mềm với khung kế; quay mặt về camera. */
export function mapFlipNodes(U: FxUniforms): { color: N; opacity: N } {
  const q = uv();
  // Bắt đầu từ khung 3 (gai đã trồi): vụ nổ ra mạnh ngay ở khung đầu, không phải chờ khói bốc.
  const kk = clamp(U.k, 0, 0.9999).mul(12).add(3);
  const f0 = floor(kk);
  const f1 = min(f0.add(1), 15);
  const blend = fract(kk);
  const cell = (f: N) => {
    const row = floor(f.div(4));
    const col = f.sub(row.mul(4));
    // Ảnh nguồn hàng 0 ở TRÊN; UV có v hướng lên nên đảo hàng.
    return vec2(col, float(3).sub(row))
      .add(clamp(q, 0.012, 0.988))
      .mul(0.25);
  };
  const t = node('ice_flip');
  const s = mix(t.sample(cell(f0)), t.sample(cell(f1)), blend);
  return { color: min(s.rgb.mul(0.95).add(U.color.mul(s.a).mul(0.12)), U.maxHdr), opacity: U.opacity.mul(s.a) };
}
