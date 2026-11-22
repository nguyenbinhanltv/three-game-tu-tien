// Mỹ thuật Vấn Đỉnh Âm Dương Giới (TN-3): rải props theo vùng và theo mặt, hàm thuần xác định (không Math.random), chỉ tô cảnh.
// Tây (x < tâm) là mặt Âm Hư: rễ cổ, đá phiến lam xám, cột đổ lạnh. Đông là mặt Dương Thực: đá đỏ đồng, gốc khô, cột đồng đổ.
// Mỗi vùng một mật độ và một bộ đồ khác nhau để nền không đơn điệu; vòng cấm quanh trạm, cụm quái, điểm đáng chú ý, trận.
import { fbm, hash01, type TerrainDef } from '@dtl/shared';
import { tkGroundColor } from './thienKhuyetArt';

/** Mức "mặt Dương Thực" 0..1 theo vị trí: 0 ở nửa tây (mặt Âm Hư), 1 ở nửa đông; đổi dần trong ~80 m quanh Giới Tuyến. `xo` = x − nửa kích thước bản đồ. */
export function faceBlend(xo: number): number {
  const t = Math.min(1, Math.max(0, (xo + 40) / 80));
  return t * t * (3 - 2 * t);
}

/**
 * Màu đỉnh địa hình Vấn Đỉnh: nền như bộ đá phiến Thiên Khuyết (tính với độ dốc 0 để bỏ dải sọc/vỉa theo toạ độ trên vách, vốn thành răng cưa
 * khi vách gồ ghề), còn vách lấy xám nâu trung tính biến thiên bằng nhiễu tần thấp; kết cấu vách do shader triplanar lo.
 */
export function vdGroundColor(def: TerrainDef, x: number, z: number, ny: number, out: [number, number, number]): void {
  tkGroundColor(def, x, z, 1, out);
  const slope = 1 - ny;
  if (slope <= 0.12) return;
  const k = Math.min(1, (slope - 0.12) * 4.5);
  const n = fbm(x * 0.004, z * 0.004, 2, def.seed + 1301);
  const c: [number, number, number] = [0.44 + n * 0.08, 0.41 + n * 0.07, 0.4 + n * 0.06];
  for (let i = 0; i < 3; i++) out[i] = out[i]! + (c[i]! - out[i]!) * k;
}

/** Nhuộm màu đỉnh địa hình theo mặt: Âm ngả lam xám lạnh, Dương ngả vàng đồng khô (bỏ xanh rêu của bộ màu đá phiến). */
export function faceTint(xo: number, rgb: [number, number, number]): void {
  const t = faceBlend(xo);
  const k: [number, number, number] = [0.86 + (1.2 - 0.86) * t, 0.92 + (1.0 - 0.92) * t, 1.1 + (0.72 - 1.1) * t];
  const g = rgb[1];
  // Dương: rêu xanh (g vượt r) kéo về đồng: giảm g khi g > r
  const over = Math.max(0, g - rgb[0]) * t * 0.8;
  rgb[0] = rgb[0] * k[0];
  rgb[1] = (g - over) * k[1];
  rgb[2] = rgb[2] * k[2];
}

export interface VdRubble {
  id: string;
  x: number;
  z: number;
  yaw: number;
  s: number;
  /** Nghiêng quanh trục ngang (rad): cột đổ, rễ ngã. */
  lean: number;
  /** Chìm xuống đất (m). */
  sink: number;
  tint: [number, number, number];
}

export interface VdScatterCtx {
  def: TerrainDef;
  bounds: { x0: number; x1: number; z0: number; z1: number };
  heightAt(x: number, z: number): number;
  /** Vòng cấm (x, z, r): trạm, cụm quái, điểm đáng chú ý, trận, prop đặt tay. */
  clear: readonly { x: number; z: number; r: number }[];
  colliders: readonly { x: number; z: number; r: number }[];
}

type Kind = 'root' | 'slab' | 'rock' | 'pillar' | 'stump' | 'sword' | 'fern';
interface Mix {
  /** Xác suất có một vật ở mỗi ô 18 m (trước nhiễu đám). */
  density: number;
  kinds: readonly (readonly [Kind, number])[];
}

/** Mặt Âm Hư (tây): theo khoảng cách tới tâm bản đồ theo z để chia vùng thô: nam = hồ, giữa = rừng rễ, bắc = đỉnh. */
const AM_SOUTH: Mix = {
  density: 0.2,
  kinds: [
    ['slab', 0.5],
    ['rock', 0.25],
    ['root', 0.15],
    ['sword', 0.1],
  ],
}; // Hồ Hư Ảnh
const AM_MID: Mix = {
  density: 0.34,
  kinds: [
    ['root', 0.6],
    ['stump', 0.2],
    ['rock', 0.1],
    ['pillar', 0.1],
  ],
}; // Rừng Rễ Treo
const AM_NORTH: Mix = {
  density: 0.24,
  kinds: [
    ['pillar', 0.4],
    ['slab', 0.3],
    ['rock', 0.2],
    ['sword', 0.1],
  ],
}; // Bậc Đỉnh
/** Mặt Dương Thực (đông). */
const DU_SOUTH: Mix = {
  density: 0.24,
  kinds: [
    ['rock', 0.4],
    ['pillar', 0.25],
    ['stump', 0.2],
    ['sword', 0.15],
  ],
}; // Giới Trì
const DU_MID: Mix = {
  density: 0.3,
  kinds: [
    ['stump', 0.4],
    ['rock', 0.35],
    ['fern', 0.15],
    ['pillar', 0.1],
  ],
}; // Rừng Đồng Khô
const DU_NORTH: Mix = {
  density: 0.22,
  kinds: [
    ['rock', 0.45],
    ['pillar', 0.3],
    ['stump', 0.25],
  ],
};

const ID: Record<Kind, string> = {
  root: 'prop_cay_goc_kho',
  slab: 'prop_da_phien',
  rock: 'prop_da_dung',
  pillar: 'prop_tru_da_khac_van',
  stump: 'prop_cay_goc_kho',
  sword: 'prop_kiem_gay',
  fern: 'prop_duong_xi',
};

const pickKind = (mix: Mix, r: number): Kind => {
  let t = r;
  for (const [k, w] of mix.kinds) if ((t -= w) <= 0) return k;
  return mix.kinds[mix.kinds.length - 1]![0];
};

/** Bộ trộn theo vị trí (offset so với tâm bản đồ): mặt theo x, dải theo z. */
export function vdMix(xo: number, zo: number): Mix {
  const am = xo < 0;
  const band = zo > 120 ? 0 : zo > -330 ? 1 : 2;
  return am ? [AM_SOUTH, AM_MID, AM_NORTH][band]! : [DU_SOUTH, DU_MID, DU_NORTH][band]!;
}

/** Màu nhuộm theo mặt: Âm lam xám lạnh, Dương đồng đỏ ấm. `k` 0..1 là biến thiên. */
function tintOf(am: boolean, kind: Kind, k: number): [number, number, number] {
  if (am) {
    const v = 0.78 + k * 0.22;
    return kind === 'root' || kind === 'stump' ? [v * 0.74, v * 0.7, v * 0.82] : [v * 0.82, v * 0.9, v * 1.06];
  }
  const v = 0.86 + k * 0.24;
  return kind === 'stump' ? [v * 1.0, v * 0.88, v * 0.68] : kind === 'fern' ? [v * 0.95, v * 0.9, v * 0.5] : [v * 1.12, v * 0.86, v * 0.66];
}

/**
 * Ô 18 m, xác định. Dày hơn theo đám (nhiễu thấp tần) để thành cụm chứ không rải đều; bỏ chỗ dốc, vòng cấm, collider; chừa Giới Tuyến
 * (dải x ≈ tâm ± 18 m) cho trụ đá đặt tay. Vật lớn nhiều lần sẽ có `lean` ≥ 0,35 và tự được bake va chạm (`colliders:bake`).
 */
export function scatterVanDinh(ctx: VdScatterCtx): VdRubble[] {
  const { def, bounds: b } = ctx;
  const cx = def.size / 2;
  const out: VdRubble[] = [];
  const CELL = 18;
  for (let gz = Math.floor(b.z0 / CELL); gz < Math.ceil(b.z1 / CELL); gz++) {
    for (let gx = Math.floor(b.x0 / CELL); gx < Math.ceil(b.x1 / CELL); gx++) {
      const x = (gx + 0.1 + hash01(gx, gz, 7113) * 0.8) * CELL;
      const z = (gz + 0.1 + hash01(gx, gz, 7121) * 0.8) * CELL;
      if (x < b.x0 + 70 || x > b.x1 - 70 || z < b.z0 + 70 || z > b.z1 - 70) continue; // chân vách để trống
      if (Math.abs(x - cx) < 18) continue;
      const xo = x - cx;
      const zo = z - cx;
      const mix = vdMix(xo, zo);
      const clump = 0.45 + fbm(x * 0.007, z * 0.007, 2, def.seed + 909) * 1.1;
      if (hash01(gx, gz, 7101) > mix.density * Math.max(0.15, clump)) continue;
      const h = ctx.heightAt(x, z);
      const slope = Math.abs(ctx.heightAt(x + 3, z) - h) + Math.abs(ctx.heightAt(x, z + 3) - h);
      if (slope > 6) continue;
      let bad = false;
      for (const c of ctx.clear) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) bad = true;
      for (const c of ctx.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 3) ** 2) bad = true;
      if (bad) continue;
      const kind = pickKind(mix, hash01(gx, gz, 7133));
      const k = hash01(gx, gz, 7143);
      const k2 = hash01(gx, gz, 7153);
      const big = kind === 'root' || kind === 'pillar';
      out.push({
        id: ID[kind],
        x,
        z,
        yaw: k * Math.PI * 2,
        s: kind === 'fern' ? 0.9 + k2 * 0.6 : big ? 1.0 + k2 * 0.8 : 0.7 + k2 * 0.9,
        lean: kind === 'pillar' ? 1.0 + k * 0.45 : kind === 'root' ? 0.2 + k2 * 0.5 : (k - 0.5) * 0.3,
        sink: kind === 'pillar' ? 0.5 + k2 * 0.8 : kind === 'sword' ? 0.4 : 0.1,
        tint: tintOf(xo < 0, kind, k2),
      });
    }
  }
  out.push(...scatterWallBase(ctx), ...scatterWallShoulder(ctx), ...scatterDetail(ctx));
  return out;
}

const okSpot = (ctx: VdScatterCtx, x: number, z: number, maxSlope: number, extra = 0): number | null => {
  const h = ctx.heightAt(x, z);
  const slope = Math.abs(ctx.heightAt(x + 3, z) - h) + Math.abs(ctx.heightAt(x, z + 3) - h);
  if (slope > maxSlope) return null;
  for (const c of ctx.clear) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return null;
  for (const c of ctx.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 3 + extra) ** 2) return null;
  return h;
};

/**
 * Chân vách: đá tảng và phiến đá lớn xếp thành đám dọc ranh vùng chơi (10–60 m tính từ mép) để che đường nối vách-nền và cho vách có chân.
 * Chỉ tô cảnh: nghiêng nhẹ (`lean` < 0,3) nên không sinh va chạm.
 */
function scatterWallBase(ctx: VdScatterCtx): VdRubble[] {
  const { def, bounds: b } = ctx;
  const cx = def.size / 2;
  const out: VdRubble[] = [];
  const CELL = 15;
  for (let gz = Math.floor(b.z0 / CELL); gz < Math.ceil(b.z1 / CELL); gz++) {
    for (let gx = Math.floor(b.x0 / CELL); gx < Math.ceil(b.x1 / CELL); gx++) {
      const x = (gx + 0.1 + hash01(gx, gz, 8113) * 0.8) * CELL;
      const z = (gz + 0.1 + hash01(gx, gz, 8121) * 0.8) * CELL;
      const edge = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
      if (edge < 10 || edge > 62) continue;
      const clump = 0.4 + fbm(x * 0.012, z * 0.012, 2, def.seed + 1101) * 1.2;
      if (hash01(gx, gz, 8101) > 0.62 * Math.max(0.1, clump)) continue;
      if (okSpot(ctx, x, z, 14) === null) continue;
      const k = hash01(gx, gz, 8143);
      const k2 = hash01(gx, gz, 8153);
      const slab = hash01(gx, gz, 8163) < 0.35;
      const am = x < cx;
      const v = 0.6 + k2 * 0.3;
      out.push({
        id: slab ? 'prop_da_phien' : 'prop_da_dung',
        x,
        z,
        yaw: k * Math.PI * 2,
        s: slab ? 3.0 + k2 * 3.2 : 2.4 + k2 * 3.4,
        lean: (k - 0.5) * 0.4,
        sink: 0.9 + k * 0.9,
        tint: am ? [v * 0.82, v * 0.88, v * 1.08] : [v * 1.15, v * 0.88, v * 0.66],
      });
    }
  }
  return out;
}

/**
 * Vai vách: khối đá lớn bằng lưới thật (`prop_da_dung`, `prop_da_phien`, scale 6–14) cắm một nửa vào chân và sườn thoải của vách (0–30 m tính từ mép vùng chơi),
 * phá đường chân vách thẳng và cho vách có khối nhô ra. Chỉ đặt ở sườn thoải đến vừa (dốc hơn thì khối lơ lửng).
 * CÓ VA CHẠM: `colliderBake` bake collider theo lưới cho mọi prop rải (`lean` chỉ ghi thêm độ nghiêng, không quyết định có va chạm), nên mỗi khối là một vật cản
 * thật ở vành ngoài vùng chơi (tường chặn ở cách mép 10 m). Vì thế mỗi khối chừa quanh vòng cấm (trạm, cụm quái, điểm đáng chú ý, trận, nút, NPC) một khoảng
 * bằng bán kính vòng + cỡ khối + 4 m, và tránh collider có sẵn; kiểm ở `vanDinhArt.test.ts`.
 */
export function scatterWallShoulder(ctx: VdScatterCtx): VdRubble[] {
  const { def, bounds: b } = ctx;
  const cx = def.size / 2;
  const out: VdRubble[] = [];
  const CELL = 24;
  for (let gz = Math.floor(b.z0 / CELL); gz < Math.ceil(b.z1 / CELL); gz++) {
    for (let gx = Math.floor(b.x0 / CELL); gx < Math.ceil(b.x1 / CELL); gx++) {
      const x = (gx + 0.1 + hash01(gx, gz, 6113) * 0.8) * CELL;
      const z = (gz + 0.1 + hash01(gx, gz, 6121) * 0.8) * CELL;
      const edge = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
      if (edge < 0 || edge > 30) continue;
      const clump = 0.35 + fbm(x * 0.009, z * 0.009, 2, def.seed + 1701) * 1.3;
      if (hash01(gx, gz, 6101) > 0.5 * Math.max(0.1, clump)) continue;
      let bad = false;
      const k = hash01(gx, gz, 6143);
      const k2 = hash01(gx, gz, 6153);
      const s = 6 + k2 * 8;
      const reach = s * 1.6 + 4; // cỡ khối + đệm: không chặn lối đến vòng cấm
      for (const c of ctx.clear) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + reach) ** 2) bad = true;
      for (const c of ctx.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + reach) ** 2) bad = true;
      if (bad) continue;
      // cắm vào sườn thoải đến vừa; sườn quá dốc thì khối đá lơ lửng trước vách
      const h0 = ctx.heightAt(x, z);
      if (Math.abs(ctx.heightAt(x + 3, z) - h0) + Math.abs(ctx.heightAt(x, z + 3) - h0) > 9) continue;
      const slab = hash01(gx, gz, 6163) < 0.4;
      const v = 0.55 + k * 0.3;
      out.push({
        id: slab ? 'prop_da_phien' : 'prop_da_dung',
        x,
        z,
        yaw: k * Math.PI * 2,
        s,
        lean: (k - 0.5) * 0.5,
        sink: s * (0.3 + k2 * 0.15),
        tint: x < cx ? [v * 0.8, v * 0.86, v * 1.08] : [v * 1.12, v * 0.86, v * 0.64],
      });
    }
  }
  return out;
}

/**
 * Lớp chi tiết mặt đất (ô 11 m): đá vụn, phiến nhỏ, rễ khô, cỏ khô. Mặt Âm: đá tím mờ và rễ tím sẫm; mặt Dương: đá vụn cát, rễ khô nhạt, cụm cỏ khô vàng.
 * Mật độ vừa phải, theo đám; vật nhỏ (scale 0,3–1,1), `lean` < 0,3 nên không có va chạm.
 */
function scatterDetail(ctx: VdScatterCtx): VdRubble[] {
  const { def, bounds: b } = ctx;
  const cx = def.size / 2;
  const out: VdRubble[] = [];
  const CELL = 11;
  for (let gz = Math.floor(b.z0 / CELL); gz < Math.ceil(b.z1 / CELL); gz++) {
    for (let gx = Math.floor(b.x0 / CELL); gx < Math.ceil(b.x1 / CELL); gx++) {
      const x = (gx + 0.1 + hash01(gx, gz, 9113) * 0.8) * CELL;
      const z = (gz + 0.1 + hash01(gx, gz, 9121) * 0.8) * CELL;
      if (x < b.x0 + 70 || x > b.x1 - 70 || z < b.z0 + 70 || z > b.z1 - 70) continue;
      if (Math.abs(x - cx) < 14) continue;
      const clump = 0.25 + fbm(x * 0.017, z * 0.017, 2, def.seed + 2203) * 1.3;
      if (hash01(gx, gz, 9101) > 0.3 * Math.max(0.1, clump)) continue;
      if (okSpot(ctx, x, z, 8, -2) === null) continue;
      const am = x < cx;
      const r = hash01(gx, gz, 9133);
      const k = hash01(gx, gz, 9143);
      const k2 = hash01(gx, gz, 9153);
      let id: string;
      let s: number;
      let tint: [number, number, number];
      let lean = (k - 0.5) * 0.3;
      if (am) {
        const v = 0.55 + k2 * 0.3;
        if (r < 0.55) ((id = 'prop_da_nam'), (s = 0.3 + k2 * 0.5), (tint = [v * 0.78, v * 0.7, v * 1.15]));
        else if (r < 0.8) ((id = 'prop_da_phien'), (s = 0.4 + k2 * 0.5), (tint = [v * 0.85, v * 0.8, v * 1.2]));
        else ((id = 'prop_cay_goc_kho'), (s = 0.35 + k2 * 0.3), (tint = [v * 0.62, v * 0.55, v * 0.78]), (lean = 0.1 + k * 0.15));
      } else {
        const v = 0.9 + k2 * 0.25;
        if (r < 0.35) ((id = 'prop_da_nam'), (s = 0.3 + k2 * 0.6), (tint = [v * 1.1, v * 0.9, v * 0.68]));
        else if (r < 0.75) ((id = 'prop_duong_xi'), (s = 0.5 + k2 * 0.7), (tint = [v * 1.0, v * 0.85, v * 0.42]));
        else ((id = 'prop_cay_goc_kho'), (s = 0.4 + k2 * 0.35), (tint = [v * 1.0, v * 0.88, v * 0.68]), (lean = 0.1 + k * 0.15));
      }
      out.push({ id, x, z, yaw: k * Math.PI * 2, s, lean, sink: 0.05, tint });
    }
  }
  return out;
}
