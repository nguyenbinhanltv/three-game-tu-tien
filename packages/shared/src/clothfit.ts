// Thiên Y: đo hình dạng vải từ lưới Tripo cũ (tách riêng bằng chr_v3.py --split-cloth) và dựng các lưới vải mới khớp hình bóng đó.
// Dùng chung cho client (mô phỏng) và công cụ bake texture (chiếu 4 ảnh multiview), nên cùng một hình học nghỉ.
import { type ClothGrid, panelGrid, type SkirtRing, type V3, skirtGrid } from './cloth';

/** Ô atlas (u0, v0, u1, v1) của từng lưới trong texture gộp (v = 0 ở trên, như UV của lưới). */
export const THIEN_Y_ATLAS: Record<string, readonly [number, number, number, number]> = {
  skirt_out: [0, 0, 0.5, 0.5],
  skirt_mid: [0, 0.5, 0.5, 1],
  skirt_in: [0.5, 0, 1, 0.5],
  sleeve_l: [0.5, 0.5, 0.75, 1],
  sleeve_r: [0.75, 0.5, 1, 1],
};

/** Lưới trong suốt (voan, tay áo): alpha theo `alpha`, mép dưới mờ dần. Lớp còn lại đặc. */
export const THIEN_Y_SHEER: Record<string, number> = { skirt_out: 0.8, sleeve_l: 0.85, sleeve_r: 0.85 };

/** Ba lớp váy xếp tầng: trong (ngà, ngắn), giữa (sao xanh lam), ngoài (voan tím, rộng + dài nhất). */
const SKIRT_LAYERS = [
  { id: 'skirt_in', scale: 0.62, len: 0.8 },
  { id: 'skirt_mid', scale: 0.82, len: 0.92 },
  { id: 'skirt_out', scale: 1.0, len: 1.0 },
] as const;

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
  /** Dựng lại váy 3 lớp (mặc định tắt: hướng lai giữ váy Tripo, chỉ thay voan tay áo). */
  skirt?: boolean;
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
  const doSkirt = opt.skirt === true;
  if (doSkirt && skirtPts.length < 90) throw new Error('thienY: không có đỉnh váy cũ');

  // ---- váy: vòng elip theo từng độ cao ----
  const pel = joint('pelvis');
  const ys: number[] = [];
  for (let i = 1; i < skirtPts.length; i += 3) ys.push(skirtPts[i]!);
  const yTop = Math.min(pct(ys, 0.985), pel[1] + 0.07 * height);
  const yBot = Math.max(pct(ys, 0.005), 0.05 * height);
  const rows = opt.skirtRows ?? 12;
  const ringsOf = (pts: ArrayLike<number>): SkirtRing[] => {
    const rr: SkirtRing[] = [];
    for (let r = 0; r < rows; r++) {
      const y = yTop - ((yTop - yBot) * r) / (rows - 1);
      const band = ((yTop - yBot) / (rows - 1)) * 0.75;
      const xs: number[] = [], zs: number[] = [];
      for (let i = 0; i < pts.length; i += 3) {
        if (Math.abs(pts[i + 1]! - y) < band) {
          xs.push(pts[i]!);
          zs.push(pts[i + 2]!);
        }
      }
      if (xs.length < 8) {
        const prev = rr[rr.length - 1];
        rr.push(prev ? { ...prev, y } : { y, cx: pel[0], cz: pel[2], a: 0.14 * k, b: 0.1 * k });
        continue;
      }
      const x0 = pct(xs, 0.04), x1 = pct(xs, 0.96), z0 = pct(zs, 0.04), z1 = pct(zs, 0.96);
      rr.push({ y, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, a: Math.max((x1 - x0) / 2, 0.1 * k), b: Math.max((z1 - z0) / 2, 0.08 * k) });
    }
    for (let r = 1; r < rr.length; r++) {
      const p0 = rr[r - 1]!;
      const c = rr[r]!;
      c.a = Math.max(c.a, p0.a * 0.98);
      c.b = Math.max(c.b, p0.b * 0.98);
    }
    return rr;
  };
  const rings = ringsOf(skirtPts);
  // Lớp ngoài cùng theo TOÀN BỘ hình bóng (váy + voan treo từ tay): phần rộng nhất của tranh nằm ở voan.
  const all = new Float32Array(skirtPts.length + sleevePts.l.length + sleevePts.r.length);
  for (let i = 0; i < skirtPts.length; i++) all[i] = skirtPts[i]!;
  for (let i = 0; i < sleevePts.l.length; i++) all[skirtPts.length + i] = sleevePts.l[i]!;
  for (let i = 0; i < sleevePts.r.length; i++) all[skirtPts.length + sleevePts.l.length + i] = sleevePts.r[i]!;
  const ringsAll = ringsOf(all);
  for (const L of SKIRT_LAYERS) {
    if (!doSkirt) break;
    const yHem = yTop - (yTop - yBot) * L.len;
    const base = L.id === 'skirt_out' ? ringsAll : rings;
    const lr: SkirtRing[] = base.map((R, r) => ({ y: yTop - ((yTop - yHem) * r) / (rows - 1), cx: R.cx, cz: R.cz, a: R.a * L.scale, b: R.b * L.scale }));
    out.push(skirtGrid(L.id, lr, opt.skirtCols ?? 28, { bone: 'pelvis', w: [1, 0.7, 0.35, 0.12] }));
  }

  // ---- tay áo: tấm vải hở treo từ bắp tay, mép trên theo cánh tay, mép dưới tự do, rộng dần về gấu ----
  for (const sd of ['l', 'r'] as const) {
    const flat = sleevePts[sd];
    if (flat.length < 60) continue;
    const ysl: number[] = [];
    for (let i = 1; i < flat.length; i += 3) ysl.push(flat[i]!);
    const sh = joint(`upperarm_${sd}`), el = joint(`lowerarm_${sd}`), wr = joint(`hand_${sd}`);
    const p0: V3 = [sh[0] + (el[0] - sh[0]) * 0.35, sh[1] + (el[1] - sh[1]) * 0.35, sh[2] + (el[2] - sh[2]) * 0.35];
    const p1: V3 = [wr[0] + (wr[0] - el[0]) * 0.25, wr[1] + (wr[1] - el[1]) * 0.25, wr[2] + (wr[2] - el[2]) * 0.25];
    const top = (p0[1] + p1[1]) / 2;
    const drop = Math.max((top - pct(ysl, 0.03)) * 0.92, 0.2 * k);
    const nuS = opt.sleeveCols ?? 12;
    out.push(
      panelGrid(`sleeve_${sd}`, p0, p1, drop, nuS, opt.sleeveRows ?? 8, { bone: `upperarm_${sd}`, w: [1, 0.55, 0.2] }, 1.8, [0, -1, 0], (_r, c) => (c < nuS / 2 ? `upperarm_${sd}` : `lowerarm_${sd}`)),
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
