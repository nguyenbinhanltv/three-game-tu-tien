/**
 * Dữ liệu và toán thuần của nhuộm 3 kênh cho nhân vật v3 (không import three: công cụ `tools/asset-pipeline/src/dye-preview.ts` và test dùng chung).
 *
 * Model v3 là lưới nguyên khối với texture Tripo, không có texture mặt nạ vải. Ba kênh nhận ra bằng màu texel (đo trên texture gốc, tất định):
 * - Kênh 1 (vải chính): `chroma` = texel cùng hướng sắc độ với vải chính; `neutral` = texel ít bão hòa (giáp/vải xám, ngà).
 * - Kênh 2 (viền, lót, đai) và kênh 3 (tua, kim loại, điểm nhấn): texel gần một màu tham chiếu (`trim`, `accent`) trong không gian gamma 2,2,
 *   trong bán kính `r`. Hai kênh này thắng kênh 1 ở chỗ trùng.
 * Mặt nạ hình học (`dyeMask`: đầu, cổ, tay, tóc = 0) nhân vào cả ba kênh nên da và tóc không bao giờ bị nhuộm.
 */
export interface V3DyeRegion {
  /** Màu tham chiếu trong texture (hex sRGB). */
  ref: string;
  /** Bán kính trong không gian gamma 2,2 (khoảng cách Euclid giữa các màu 0..1). Mép mềm từ 0,6r đến r. */
  r: number;
}

export interface V3DyeRef {
  mode: 'chroma' | 'neutral';
  /** Màu vải chính trong texture (hex sRGB, đo bằng cụm màu lớn nhất của texture gốc). */
  ref: string;
  /** Kênh 2: viền, lót, đai. Thiếu = model không có vùng này, kênh 2 không đổi gì. */
  trim?: V3DyeRegion;
  /** Kênh 3: tua, kim loại, điểm nhấn. Thiếu = như trên. */
  accent?: V3DyeRegion;
}

/** Bộ ba màu nhuộm áp lên model v3 (hex sRGB); `trim`/`accent` thiếu = giữ màu gốc của vùng đó. */
export interface V3DyeColors {
  main: string;
  trim?: string;
  accent?: string;
}

const chroma = (ref: string, trim?: V3DyeRegion, accent?: V3DyeRegion): V3DyeRef => ({
  mode: 'chroma',
  ref,
  ...(trim ? { trim } : {}),
  ...(accent ? { accent } : {}),
});
const neutral = (ref: string, trim?: V3DyeRegion, accent?: V3DyeRegion): V3DyeRef => ({
  mode: 'neutral',
  ref,
  ...(trim ? { trim } : {}),
  ...(accent ? { accent } : {}),
});
const zone = (ref: string, r: number): V3DyeRegion => ({ ref, r });

/**
 * Khóa = id asset bỏ hậu tố giới (`_nam|_nu`). Model không có ở đây (skin toàn thân) không nhuộm.
 * Màu `trim`/`accent` chọn từ cụm màu còn lại sau khi bỏ vải chính (`pnpm dye:preview` in cụm và ảnh mặt nạ).
 */
export const V3_DYE_REF: Readonly<Record<string, V3DyeRef>> = {
  // Đệ tử: lót/đai/ủng gần đen; không có chi tiết kim loại riêng trong texture.
  chr_v3_de_tu: chroma('#435466', zone('#2c2f38', 0.11)),
  chr_v3_dan_tam: chroma('#41574b', zone('#272d27', 0.09), zone('#dec399', 0.14)),
  // Lạc Kiếm: sau bảng màu `v3Palette` lớp lam nằm quanh #3B6584, lớp ngà quanh #E4DEC8 (lót), viền bạc xám.
  chr_v3_lac_kiem: chroma('#3B6584', zone('#E4DEC8', 0.12), zone('#8e8b88', 0.08)),
  chr_v3b_lac_kiem: chroma('#3B6584', zone('#E4DEC8', 0.12), zone('#8e8b88', 0.08)),
  chr_v3b2_lac_kiem: chroma('#3B6584', zone('#E4DEC8', 0.12), zone('#8e8b88', 0.08)),
  chr_v3_huyen_giap: neutral('#363435', zone('#5f4f42', 0.11), zone('#b8975f', 0.14)),
  chr_v3_kinh_quang: neutral('#b9b5b9', zone('#7f8c9f', 0.1), zone('#c2b296', 0.1)),
  chr_v3_liet_mach: chroma('#ae937b', zone('#4d4034', 0.12), zone('#cdb07f', 0.09)),
  chr_v3_tinh_khuyet: chroma('#a484b5', zone('#363340', 0.1), zone('#bda381', 0.1)),
  chr_v3_co_thanh: neutral('#899084', zone('#393839', 0.1), zone('#b0986f', 0.1)),
  chr_v3_dia_long: chroma('#836747', zone('#4a3828', 0.13), zone('#dbb172', 0.1)),
  chr_v3_van_kinh: neutral('#a7a6a3', zone('#5c636f', 0.13), zone('#c9b79c', 0.1)),
  chr_v3_luu_ly: chroma('#6d8b91', zone('#363736', 0.09), zone('#baab90', 0.1)),
  chr_v3_phuc_mach: chroma('#9c987b', zone('#3a342a', 0.1), zone('#bbaa83', 0.1)),
  chr_v3_than_tang: chroma('#55546a', zone('#353442', 0.1), zone('#c0a682', 0.1)),
};

export function v3DyeRefOf(assetId: string): V3DyeRef | null {
  return V3_DYE_REF[assetId.replace(/_(nam|nu)$/, '')] ?? null;
}

/** Hệ số độ sáng (tuyến tính, Rec. 709). */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

type Rgb = readonly [number, number, number];

/** hex sRGB → tuyến tính. */
export function hexToLinear(hex: string): Rgb {
  const v = parseInt(hex.replace('#', ''), 16);
  const f = (x: number): number => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [f((v >> 16) & 255), f((v >> 8) & 255), f(v & 255)];
}

export const GAMMA = 1 / 2.2;
export const toGamma = (c: Rgb): Rgb => [c[0] ** GAMMA, c[1] ** GAMMA, c[2] ** GAMMA];
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Mép mềm của vùng màu: 1 trong 0,6r, 0 ngoài r. Khớp từng chữ với shader trong `v3Dye.ts`. */
export function regionWeight(linear: Rgb, region: V3DyeRegion): number {
  const g = toGamma(linear);
  const q = toGamma(hexToLinear(region.ref));
  const d = Math.hypot(g[0] - q[0], g[1] - q[1], g[2] - q[2]);
  return 1 - smooth(region.r * 0.6, region.r, d);
}

/** Mặt nạ kênh 1 theo màu (chưa nhân hình học): `chroma` theo hướng sắc độ của vải chính, `neutral` theo độ bão hòa thấp. */
export function mainWeight(linear: Rgb, ref: V3DyeRef): number {
  const mean = (linear[0] + linear[1] + linear[2]) / 3;
  const ch: Rgb = [linear[0] - mean, linear[1] - mean, linear[2] - mean];
  const mag = Math.hypot(...ch);
  const sat = mag / (mean + 1e-3);
  if (ref.mode === 'neutral') return 1 - smooth(0.2, 0.34, sat);
  const r = hexToLinear(ref.ref);
  const rm = (r[0] + r[1] + r[2]) / 3;
  const dv: Rgb = [r[0] - rm, r[1] - rm, r[2] - rm];
  const dl = Math.hypot(...dv);
  const dir: Rgb = dl > 1e-5 ? [dv[0] / dl, dv[1] / dl, dv[2] / dl] : [0, 0, 1];
  const cosA = (ch[0] * dir[0] + ch[1] * dir[1] + ch[2] * dir[2]) / Math.max(mag, 1e-4);
  return smooth(0.7, 0.85, cosA) * smooth(0.1, 0.2, sat);
}

/** Trọng số ba kênh của một texel (tuyến tính) trước khi nhân mặt nạ hình học. Kênh 2/3 thắng kênh 1; kênh 3 nhường kênh 2 ở chỗ trùng. */
export function dyeWeights(linear: Rgb, ref: V3DyeRef): { main: number; trim: number; accent: number } {
  const trim = ref.trim ? regionWeight(linear, ref.trim) : 0;
  const accent = (ref.accent ? regionWeight(linear, ref.accent) : 0) * (1 - trim);
  const main = mainWeight(linear, ref) * (1 - trim) * (1 - accent);
  return { main, trim, accent };
}
