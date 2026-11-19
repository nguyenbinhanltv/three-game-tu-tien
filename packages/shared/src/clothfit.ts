// Thiên Y: đo hình dạng vải từ lưới Tripo cũ (tách riêng bằng chr_v3.py --split-cloth) và dựng các lưới vải mới khớp hình bóng đó.
// Dùng chung cho client (mô phỏng) và công cụ bake texture (chiếu 4 ảnh multiview), nên cùng một hình học nghỉ.
import { type ClothGrid, type SkirtRing, type V3, skirtGrid, sleeveGrid } from './cloth';

/** Ô atlas (u0, v0, u1, v1) của từng lưới trong texture gộp (v = 0 ở trên, như UV của lưới). */
export const THIEN_Y_ATLAS: Record<string, readonly [number, number, number, number]> = {
  skirt: [0, 0, 0.5, 1],
  sleeve_l: [0.5, 0, 1, 0.5],
  sleeve_r: [0.5, 0.5, 1, 1],
};

export interface ThienYInput {
  /** Vị trí nghỉ của xương (toạ độ mesh) theo tên. */
  joint: (name: string) => V3;
  /** Đỉnh váy cũ (phẳng x,y,z). */
  skirtPts: ArrayLike<number>;
  /** Đỉnh tay áo cũ, tách trái/phải theo dấu x. */
  sleevePts: { l: ArrayLike<number>; r: ArrayLike<number> };
  height: number;
}

export interface ThienYOptions {
  skirtCols?: number;
  skirtRows?: number;
  sleeveCols?: number;
  sleeveRows?: number;
}

function pct(arr: number[], q: number): number {
  if (!arr.length) return 0;
  const s = arr.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!;
}

/** Dựng váy + hai tay áo. Ném lỗi nếu thiếu dữ liệu váy. */
export function fitThienY(inp: ThienYInput, opt: ThienYOptions = {}): ClothGrid[] {
  const { joint, skirtPts, sleevePts, height } = inp;
  const k = height / 1.8;
  const out: ClothGrid[] = [];
  if (skirtPts.length < 90) throw new Error('thienY: không có đỉnh váy cũ');

  // ---- váy: vòng elip theo từng độ cao ----
  const pel = joint('pelvis');
  const ys: number[] = [];
  for (let i = 1; i < skirtPts.length; i += 3) ys.push(skirtPts[i]!);
  const yTop = Math.min(pct(ys, 0.985), pel[1] + 0.07 * height);
  const yBot = Math.max(pct(ys, 0.005), 0.05 * height);
  const rows = opt.skirtRows ?? 12;
  const rings: SkirtRing[] = [];
  for (let r = 0; r < rows; r++) {
    const y = yTop - ((yTop - yBot) * r) / (rows - 1);
    const band = ((yTop - yBot) / (rows - 1)) * 0.75;
    const xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < skirtPts.length; i += 3) {
      if (Math.abs(skirtPts[i + 1]! - y) < band) {
        xs.push(skirtPts[i]!);
        zs.push(skirtPts[i + 2]!);
      }
    }
    if (xs.length < 8) {
      const prev = rings[rings.length - 1];
      rings.push(prev ? { ...prev, y } : { y, cx: pel[0], cz: pel[2], a: 0.14 * k, b: 0.1 * k });
      continue;
    }
    const x0 = pct(xs, 0.04), x1 = pct(xs, 0.96), z0 = pct(zs, 0.04), z1 = pct(zs, 0.96);
    rings.push({ y, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, a: Math.max((x1 - x0) / 2, 0.1 * k), b: Math.max((z1 - z0) / 2, 0.08 * k) });
  }
  for (let r = 1; r < rings.length; r++) {
    const p0 = rings[r - 1]!;
    const c = rings[r]!;
    c.a = Math.max(c.a, p0.a * 0.98);
    c.b = Math.max(c.b, p0.b * 0.98);
  }
  out.push(skirtGrid('skirt', rings, opt.skirtCols ?? 28, { bone: 'pelvis', w: [1, 0.7, 0.35, 0.12] }));

  // ---- tay áo: ống từ khuỷu qua cổ tay, kéo dài rủ xuống ----
  for (const sd of ['l', 'r'] as const) {
    const flat = sleevePts[sd];
    const pts: number[][] = [];
    for (let i = 0; i < flat.length; i += 3) pts.push([flat[i]!, flat[i + 1]!, flat[i + 2]!]);
    if (pts.length < 20) continue;
    const el = joint(`lowerarm_${sd}`);
    const wr = joint(`hand_${sd}`);
    const ax = [wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]];
    const len = Math.hypot(ax[0]!, ax[1]!, ax[2]!) || 1;
    const d = [ax[0]! / len, ax[1]! / len, ax[2]! / len];
    const bins = 8;
    const radii: number[] = [];
    const tMax = 2.2;
    for (let b = 0; b < bins; b++) {
      const lo = -0.1 + ((tMax + 0.1) * b) / bins, hi = -0.1 + ((tMax + 0.1) * (b + 1)) / bins;
      const rr: number[] = [];
      for (const p of pts) {
        const rel = [p[0]! - el[0], p[1]! - el[1], p[2]! - el[2]];
        const t = (rel[0]! * d[0]! + rel[1]! * d[1]! + rel[2]! * d[2]!) / len;
        if (t < lo || t >= hi) continue;
        const perp = [rel[0]! - d[0]! * t * len, rel[1]! - d[1]! * t * len, rel[2]! - d[2]! * t * len];
        rr.push(Math.hypot(perp[0]!, perp[1]!, perp[2]!));
      }
      radii.push(rr.length >= 5 ? pct(rr, 0.85) : NaN);
    }
    for (let b = 0; b < bins; b++) if (Number.isNaN(radii[b]!)) radii[b] = radii[b - 1] ?? 0.07 * k;
    const radius = (t: number) => {
      const f = Math.min(Math.max(((t + 0.1) / (tMax + 0.1)) * bins - 0.5, 0), bins - 1);
      const i0 = Math.floor(f), i1 = Math.min(i0 + 1, bins - 1);
      const v = radii[i0]! + (radii[i1]! - radii[i0]!) * (f - i0);
      return Math.min(Math.max(v, 0.04 * k), 0.14 * k);
    };
    out.push(
      sleeveGrid(`sleeve_${sd}`, el, wr, radius, opt.sleeveCols ?? 14, opt.sleeveRows ?? 10, tMax - 1, { bone: `lowerarm_${sd}`, w: [1, 0.85, 0.55, 0.25, 0.08] }, [0, 0, 1]),
    );
  }
  return out;
}

/** Ghi UV của lưới vào ô atlas của nó (trả mảng mới, không sửa lưới). */
export function atlasUv(g: ClothGrid): Float32Array {
  const r = THIEN_Y_ATLAS[g.id];
  if (!r) return g.uv;
  const out = new Float32Array(g.uv.length);
  for (let i = 0; i < g.uv.length; i += 2) {
    out[i] = r[0] + g.uv[i]! * (r[2] - r[0]);
    out[i + 1] = r[1] + g.uv[i + 1]! * (r[3] - r[1]);
  }
  return out;
}
