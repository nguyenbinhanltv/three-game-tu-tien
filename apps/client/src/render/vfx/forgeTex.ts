import * as THREE from 'three/webgpu';
import { abs, atan, clamp, float, floor, fract, length, max, min, mix, smoothstep, step, texture, uv, vec2, vec3 } from 'three/tsl';
import {
  FORGE_ATLAS_IDS,
  FORGE_DECALS,
  FORGE_DECAL_COLS,
  FORGE_DECAL_ROWS,
  FORGE_FLIPS,
  FORGE_FLIP_SHEET_COLS,
  FORGE_FLIP_SHEET_ROWS,
} from '@dtl/shared';
import type { FxUniforms, N } from './common';

/**
 * Texture Họa Pháp Lô 2 dùng chung (Codex vẽ → `forge import` → KTX2 ở `public/assets/vfx/<id>.ktx2`, xem docs/handbook/vfx-forge.md).
 * Gộp thành HAI atlas để mỗi shader chỉ lấy mẫu một texture: `decal_atlas` (ô vuông theo thứ tự `FORGE_DECALS`) và `flip_atlas`
 * (mỗi tấm flipbook 4×4 theo thứ tự `FORGE_FLIPS`, xếp `FORGE_FLIP_SHEET_COLS`×`FORGE_FLIP_SHEET_ROWS` tấm).
 * `render/` không được import `game/`, nên việc nạp file nằm ở `game/fx/forgeLoad.ts`; ở đây chỉ giữ chỗ (texture trong suốt 1×1) và
 * đổi `.value` của TextureNode khi file về: shader biên dịch một lần, texture thật hiện từ khung sau. Chưa nạp được (mạng lỗi, KTX2 không
 * hỗ trợ) thì lớp này vô hình, phần còn lại của timeline vẫn chạy.
 */
export type ForgeTexId = (typeof FORGE_ATLAS_IDS)[number];

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

export const forgeTexIds = (): readonly ForgeTexId[] => FORGE_ATLAS_IDS;
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
/** Số thứ tự tấm flipbook trong `fxA.x` (kind mapFlip): theo thứ tự `FORGE_FLIPS`. */
export const forgeFlipIndex = (id: string): number => Math.max(0, (FORGE_FLIPS as readonly string[]).indexOf(id));

/** Màu nền đặc dưới vân của từng decal (theo `FORGE_DECALS`); vạch báo (0) dùng màu bảng màu nên không nằm ở đây. */
const FILL: Record<string, [number, number, number]> = {
  ice_crack: [0.04, 0.17, 0.42],
  steel_crack: [0.05, 0.06, 0.08],
  ember_crack: [0.07, 0.05, 0.05],
  bolt_scorch: [0.11, 0.07, 0.27],
  jade_crack: [0.14, 0.09, 0.04],
  root_mat: [0.07, 0.15, 0.05],
};

/** Độ sáng nhân vào texture theo decal (theo `FORGE_DECALS`): đất/ngọc và thép vốn sáng nên hạ để không lẫn với vạch báo đỏ-cam hay băng. */
const BRIGHT: Record<string, number> = { steel_crack: 0.7, ember_crack: 0.8, jade_crack: 0.3, root_mat: 0.65 };

/**
 * `mapDecal`: decal nhìn thẳng từ trên, ảnh Codex làm lớp chất liệu. `fxA` = (mọc 0..1, mờ 0..1, seed, chỉ số `FORGE_DECALS`); `fxK` 1→0 độ nóng.
 * Mọc từ tâm ra rìa theo `fxA.x` (mép mọc mềm), mờ dần theo `fxA.y`; màu = ảnh × độ nóng, pha một chút màu bảng màu để theo nhánh.
 * `fxB.w` > 0 = nửa góc (rad) của MẶT QUẠT: chỉ giữ hình quạt từ tâm theo hướng +Z cục bộ, viền quạt sáng màu `fxB.rgb`.
 * `fxB.w` < 0 = DẢI chữ nhật (vùng `rect`): quad phủ đúng dải, `-fxB.w` = số lần lặp ô texture dọc chiều dài (dài ÷ rộng); mọc từ gốc ra đầu, viền hai bên sáng.
 */
export function mapDecalNodes(U: FxUniforms): { color: N; opacity: N } {
  const q = uv();
  const p = q.sub(0.5).mul(2);
  const r = length(p);
  const idx = U.a.w;
  const half = U.b.w;
  const fan = step(0.0001, half);
  const strip = step(half, -0.0001);
  const along = float(1).sub(q.y);

  // Tọa độ lấy mẫu: dải lặp ô vuông (cửa sổ giữa của ô, để vân tỏa từ tâm mỗi ô), còn lại dùng thẳng UV.
  const cellUv = vec2(q.x, fract(along.mul(half.negate().max(1))));
  const win = cellUv.sub(0.5).mul(0.78).add(0.5);
  const tq = mix(q, win, strip);
  const row = floor(idx.add(0.5).div(FORGE_DECAL_COLS));
  const col = idx.sub(row.mul(FORGE_DECAL_COLS));
  // KTX2 không bị lật: hàng ảnh r (từ trên) nằm ở v ∈ [r/R, (r+1)/R]; mặt phẳng có v hướng lên nên đảo v trong ô để ảnh đứng.
  const auv = vec2(
    col.add(clamp(tq.x, 0.004, 0.996)).div(FORGE_DECAL_COLS),
    row.add(float(1).sub(clamp(tq.y, 0.004, 0.996))).div(FORGE_DECAL_ROWS),
  );
  const s = node('decal_atlas').sample(auv);

  const radial = float(1).sub(smoothstep(U.a.x.mul(1.08).sub(0.14), U.a.x.mul(1.08), r));
  const lengthwise = float(1).sub(smoothstep(U.a.x.mul(1.08).sub(0.14), U.a.x.mul(1.08), along));
  const reveal = mix(radial, lengthwise, strip);
  const heat = U.k.mul(0.5).add(0.5);
  // Pha màu bảng màu chỉ cho vạch báo và băng; các hệ khác giữ màu texture (tránh ngả cam).
  const tint = mix(vec3(1, 1, 1), U.color.mul(1.4), mix(float(0.25), float(0.05), step(1.5, idx)));
  let bright: N = float(1);
  FORGE_DECALS.forEach((id, i) => {
    const b = BRIGHT[id];
    if (b !== undefined) bright = mix(bright, float(b), step(i - 0.5, idx).mul(step(idx, i + 0.5)));
  });
  // Mặt quạt: góc lệch khỏi +Z cục bộ (p.y = -z), cắt mềm; viền quạt = hai cạnh + cung ngoài.
  const ang = atan(abs(p.x), p.y.negate());
  const inFan = float(1).sub(smoothstep(half.sub(0.02), half, ang));
  const mask = mix(float(1), inFan.mul(step(r, 1.0)), fan);
  const edge = max(
    max(smoothstep(half.sub(0.12), half.sub(0.03), ang), smoothstep(0.88, 0.97, r)).mul(fan),
    max(smoothstep(0.84, 0.97, abs(p.x)), smoothstep(0.94, 0.99, along)).mul(strip),
  ).mul(mask);
  // Vạch báo THEO MÀU HỆ (A4: tím-hồng, hổ phách): vân Codex của `warn_crack` nung sẵn đỏ nên khi màu bảng màu không đỏ/cam (g/r hoặc b/r ≥ 0,6) thì tô lại vân bằng độ sáng × màu bảng màu.
  const nonRed = max(step(0.6, U.color.g.div(U.color.r.max(1e-3))), step(0.6, U.color.b.div(U.color.r.max(1e-3)))).mul(
    float(1).sub(step(0.5, idx)),
  );
  const warnLum = s.r.mul(0.3).add(s.g.mul(0.59)).add(s.b.mul(0.11));
  const srcRgb = mix(s.rgb, U.color.mul(warnLum.mul(2.6).add(0.15)), nonRed);
  const base = srcRgb.mul(tint).mul(heat.mul(0.55).add(0.7)).mul(bright);
  const lit = mix(base, U.b.xyz.mul(1.6), edge.mul(1.0));
  // Nền đặc dưới vân (các khe của ảnh Codex trong suốt): vạch báo = đĩa đỏ, mỗi hệ một màu thẫm; đọc được trên nền sáng ban ngày.
  let fillCol: N = U.color.mul(0.8);
  FORGE_DECALS.forEach((id, i) => {
    const f = FILL[id];
    if (f) fillCol = mix(fillCol, vec3(f[0], f[1], f[2]), step(i - 0.5, idx).mul(step(idx, i + 0.5)));
  });
  // Vạch báo (0) nền mờ 0,5 để thấy mặt đất; vùng nổ các hệ nền đặc 0,8 (alpha ảnh suy từ độ sáng nên vùng đất/đá sẫm vốn trong suốt).
  const fillA = mix(float(0.92), float(0.5), step(idx, 0.5))
    .mul(mask)
    .mul(mix(float(1).sub(smoothstep(0.93, 0.985, r)), float(1), strip));
  const top = max(min(s.a.mul(1.6), 1), edge);
  const alpha = max(top, fillA);
  const lit2 = mix(fillCol, lit, min(top.mul(1.6), 1));
  return { color: min(lit2, U.maxHdr), opacity: U.opacity.mul(alpha).mul(mask).mul(reveal).mul(float(1).sub(U.a.y)) };
}

/** `mapFlip`: flipbook 4×4 trong `flip_atlas` (tấm `fxA.x`): khung = ⌊k × 16⌋, trộn mềm với khung kế; quay mặt về camera. */
export function mapFlipNodes(U: FxUniforms): { color: N; opacity: N } {
  const q = uv();
  // Bắt đầu từ khung 3 (gai đã trồi): vụ nổ ra mạnh ngay ở khung đầu, không phải chờ khói bốc.
  const kk = clamp(U.k, 0, 0.9999).mul(12).add(3);
  const f0 = floor(kk);
  const f1 = min(f0.add(1), 15);
  const blend = fract(kk);
  // +0,5: chỉ số nguyên chia cho 3 có thể ra 0,9999 (floor sai hàng).
  const sheetRow = floor(U.a.x.add(0.5).div(FORGE_FLIP_SHEET_COLS));
  const sheetCol = U.a.x.sub(sheetRow.mul(FORGE_FLIP_SHEET_COLS));
  const cell = (f: N) => {
    const row = floor(f.add(0.5).div(4));
    const col = f.sub(row.mul(4));
    const cx = sheetCol
      .mul(4)
      .add(col)
      .add(clamp(q.x, 0.012, 0.988));
    const cy = sheetRow
      .mul(4)
      .add(row)
      .add(float(1).sub(clamp(q.y, 0.012, 0.988)));
    return vec2(cx.div(FORGE_FLIP_SHEET_COLS * 4), cy.div(FORGE_FLIP_SHEET_ROWS * 4));
  };
  const t = node('flip_atlas');
  const s = mix(t.sample(cell(f0)), t.sample(cell(f1)), blend);
  return { color: min(s.rgb.mul(0.95).add(U.color.mul(s.a).mul(0.12)), U.maxHdr), opacity: U.opacity.mul(s.a) };
}
