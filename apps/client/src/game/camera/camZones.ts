import { FOREST, KIEM_TRUNG, LAKE, LAKE_WATER_R, PORTAL_PAD, SECT, VALLEY } from '@dtl/shared';

/**
 * Camera theo khu (P2-E4): mỗi vùng cho một bộ (nhân khoảng cách, cộng góc ngẩng, FOV). Sân tông môn rộng thì lùi
 * xa, Kiếm Trủng (lòng chảo hẹp) thì kéo gần, hồ và đỉnh núi mở thì thoáng hơn. Trọng số mỗi vùng giảm mượt từ
 * trong ra ngoài ranh nên đi qua ranh không giật; engine còn làm mượt thêm theo thời gian. Chỉ nhân lên khoảng cách
 * người chơi tự đặt (lăn chuột/phím), không ghi đè nó, và độc lập với thẻ chương/cảnh điện ảnh (`CamFrame`, `cutscene`).
 */
export interface ZoneCam {
  /** Nhân vào khoảng cách người chơi đặt. */
  distMul: number;
  /** Cộng vào góc ngẩng (rad). */
  pitchAdd: number;
  /** Góc nhìn dọc (độ). */
  fov: number;
}

export const BASE_FOV = 55;
export const BASE_ZONE: ZoneCam = { distMul: 1, pitchAdd: 0, fov: BASE_FOV };

interface Zone extends ZoneCam {
  id: string;
  x: number;
  z: number;
  /** Trong bán kính này trọng số 1; ra tới `outer` giảm về 0. */
  inner: number;
  outer: number;
}

const ZONES: readonly Zone[] = [
  // Sân tông môn: quảng trường rộng, nhiều kiến trúc cao.
  { id: 'sect', x: SECT.x, z: SECT.z, inner: SECT.flatR + 10, outer: SECT.flatR + 90, distMul: 1.25, pitchAdd: 0.04, fov: 58 },
  // Kiếm Trủng: lòng chảo hẹp, vách đá bao quanh.
  {
    id: 'kiem_trung',
    x: KIEM_TRUNG.x,
    z: KIEM_TRUNG.z,
    inner: KIEM_TRUNG.flatR + 30,
    outer: KIEM_TRUNG.outerR - 10,
    distMul: 0.74,
    pitchAdd: 0.05,
    fov: 50,
  },
  // Biển hồ: mở, thấy xa.
  { id: 'ho', x: LAKE.x, z: LAKE.z, inner: LAKE_WATER_R - 80, outer: LAKE_WATER_R + 60, distMul: 1.18, pitchAdd: 0.02, fov: 60 },
  // Rừng: tán cây dày, kéo gần để ít bị che.
  { id: 'rung', x: FOREST.x, z: FOREST.z, inner: FOREST.flatR - 40, outer: FOREST.flatR + 120, distMul: 0.88, pitchAdd: 0.05, fov: 54 },
  // Thung lũng chân núi: thoáng.
  { id: 'thung_lung', x: VALLEY.x, z: VALLEY.z, inner: VALLEY.flatR - 80, outer: VALLEY.flatR + 80, distMul: 1.08, pitchAdd: 0, fov: 56 },
  // Bệ cổng bí cảnh trên sườn núi cao: nhìn ra biển mây.
  {
    id: 'cong',
    x: PORTAL_PAD.x,
    z: PORTAL_PAD.z,
    inner: PORTAL_PAD.flatR,
    outer: PORTAL_PAD.outerR - 60,
    distMul: 1.15,
    pitchAdd: 0.03,
    fov: 59,
  },
];

function smooth(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/** Trọng số 0..1 của một vùng tại (x,z). */
function zoneWeight(z: Pick<Zone, 'x' | 'z' | 'inner' | 'outer'>, x: number, zz: number): number {
  const d = Math.hypot(x - z.x, zz - z.z);
  return 1 - smooth((d - z.inner) / Math.max(1e-6, z.outer - z.inner));
}

/** Bộ camera tại (x,z): trộn các vùng theo trọng số, phần còn lại là camera mặc định. */
export function zoneCamera(x: number, z: number, out: ZoneCam = { ...BASE_ZONE }): ZoneCam {
  let wSum = 0;
  let dm = 0;
  let pa = 0;
  let fv = 0;
  for (const zn of ZONES) {
    const w = zoneWeight(zn, x, z);
    if (w <= 0) continue;
    wSum += w;
    dm += (zn.distMul - 1) * w;
    pa += zn.pitchAdd * w;
    fv += (zn.fov - BASE_FOV) * w;
  }
  // Vùng chồng nhau: chia theo tổng để không cộng dồn quá mức (tổng trọng số > 1 thì lấy trung bình).
  const k = wSum > 1 ? 1 / wSum : 1;
  out.distMul = 1 + dm * k;
  out.pitchAdd = pa * k;
  out.fov = BASE_FOV + fv * k;
  return out;
}

/** Làm mượt theo thời gian (hằng số `rate` ~ 1/giây): đi qua ranh vùng vẫn trôi chứ không nhảy. */
export function easeZoneCam(cur: ZoneCam, want: ZoneCam, dt: number, rate = 2.2): void {
  const a = 1 - Math.exp(-rate * dt);
  cur.distMul += (want.distMul - cur.distMul) * a;
  cur.pitchAdd += (want.pitchAdd - cur.pitchAdd) * a;
  cur.fov += (want.fov - cur.fov) * a;
}
