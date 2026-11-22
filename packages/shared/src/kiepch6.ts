// Ba cơ chế kiếp chương 6 (TN-3): hàm thuần dùng chung server (phán định) và client (hình). Luật ở server; không hàm nào đọc dữ liệu từ client.
//   hoi_dao    Vấn Đỉnh Kiếp: hỏi đạo, chọn Đạo Môn cùng số vành với dấu giữa sân.
//   am_lan     Âm Hư Kiếp: âm vực lan dần, né ra ngoài (không cộng dồn).
//   duong_dap  Dương Thực Kiếp: đòn nhịp nung sân, dùng chiêu đúng cửa sổ để phản đòn.

import type { TribAmLan, TribDuongDap, TribHoiDao } from './tribulation';

/** Còn từng này giây trước hạn thì server báo đường sáng từ dấu giữa sân tới Đạo Môn đúng (gợi ý đọc, không đổi luật). */
export const HOI_DAO_HINT_SEC = 2;

/** Số Đạo Môn và số vành lớn nhất (1..GATE_COUNT). */
export const GATE_COUNT = 3;

/** Góc (rad, 0 hướng +z) của Đạo Môn thứ `i`: ba cổng cách đều 120°, cổng 0 ở phía bắc (−z) để người độ kiếp vào sân nhìn thấy cả ba. */
export function gateAngle(i: number): number {
  return Math.PI + (i * 2 * Math.PI) / GATE_COUNT;
}

export function gatePos(center: { x: number; z: number }, ring: number, i: number): { x: number; z: number } {
  const a = gateAngle(i);
  return { x: center.x + Math.sin(a) * ring, z: center.z + Math.cos(a) * ring };
}

export interface HoiDaoRound {
  /** Số vành của dấu giữa sân (1..3). */
  mark: number;
  /** Số vành của từng cổng (hoán vị của 1..3). */
  gates: [number, number, number];
}

/** Dựng một vòng hỏi từ ba số ngẫu nhiên đều [0,1) (nguồn ngẫu nhiên do server chọn, test cho seed). */
export function hoiDaoRound(r1: number, r2: number, r3: number): HoiDaoRound {
  const mark = 1 + Math.min(GATE_COUNT - 1, Math.floor(r1 * GATE_COUNT));
  const pool = [1, 2, 3];
  const a = pool.splice(Math.min(pool.length - 1, Math.floor(r2 * pool.length)), 1)[0]!;
  const b = pool.splice(Math.min(pool.length - 1, Math.floor(r3 * pool.length)), 1)[0]!;
  return { mark, gates: [a, b, pool[0]!] };
}

/** Chỉ số cổng đúng của vòng. */
export function hoiDaoAnswer(round: HoiDaoRound): number {
  return round.gates.indexOf(round.mark);
}

/** Cổng mà điểm (x, z) đang đứng trong (bán kính `gateR`), hoặc −1. */
export function hoiDaoGateAt(center: { x: number; z: number }, cfg: Pick<TribHoiDao, 'ring' | 'gateR'>, x: number, z: number): number {
  for (let i = 0; i < GATE_COUNT; i++) {
    const g = gatePos(center, cfg.ring, i);
    if (Math.hypot(x - g.x, z - g.z) <= cfg.gateR) return i;
  }
  return -1;
}

/** Mã hóa số vành ba cổng thành một số nguyên (`FxMsg.lv`): cổng 0 là hàng trăm. */
export function packGates(g: readonly number[]): number {
  return (g[0] ?? 0) * 100 + (g[1] ?? 0) * 10 + (g[2] ?? 0);
}

export function unpackGates(n: number): [number, number, number] {
  return [Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
}

// ---------- am_lan ----------

export interface AmPool {
  x: number;
  z: number;
  /** Mốc nảy mầm (ms). */
  at: number;
}

/** Bán kính âm vực sau `ms` kể từ lúc nảy mầm: mầm `r0` trong `seed` giây, lan tuyến tính tới `r1` trong `grow` giây, giữ, rồi 0 sau `hold`. */
export function amPoolR(cfg: Pick<TribAmLan, 'seed' | 'grow' | 'hold' | 'r0' | 'r1'>, ms: number): number {
  const t = ms / 1000;
  if (t < 0) return 0;
  if (t < cfg.seed) return cfg.r0;
  const k = Math.min(1, (t - cfg.seed) / cfg.grow);
  if (t - cfg.seed > cfg.grow + cfg.hold) return 0;
  return cfg.r0 + (cfg.r1 - cfg.r0) * k;
}

/** Âm vực đã nảy ít nhất `seed` giây (đang gây hại) và chưa tan. */
export function amPoolHurts(cfg: Pick<TribAmLan, 'seed' | 'grow' | 'hold' | 'r0' | 'r1'>, ms: number): boolean {
  const t = ms / 1000;
  return t >= cfg.seed && t - cfg.seed <= cfg.grow + cfg.hold;
}

/** Điểm (x, z) đang nằm trong ít nhất một âm vực gây hại tại `now`? Chỉ cần một vực: chồng nhau không cộng dồn. */
export function amInside(cfg: TribAmLan, pools: readonly AmPool[], now: number, x: number, z: number): boolean {
  return pools.some((p) => amPoolHurts(cfg, now - p.at) && Math.hypot(x - p.x, z - p.z) <= amPoolR(cfg, now - p.at));
}

// ---------- duong_dap ----------

/** Lúc `at` (ms) dùng chiêu có phải phản đòn cho đòn giáng ở `impactAt`? (trong `win` giây cuối, kể cả đúng lúc giáng). */
export function dapParryOk(cfg: Pick<TribDuongDap, 'win'>, impactAt: number, at: number): boolean {
  return at >= impactAt - cfg.win * 1000 && at <= impactAt;
}

/** Sát thương đòn nhịp (khí huyết tối đa `mhp`), đã tính phản đòn. */
export function dapDamage(cfg: Pick<TribDuongDap, 'pct' | 'cut'>, mhp: number, parried: boolean): number {
  return Math.round(mhp * cfg.pct * (parried ? 1 - cfg.cut : 1));
}
