import { FLY_UNLOCK_LEVEL, TRUC_CO_LEVEL } from './formulas';
import { SKY_ALT, SKY_SPEED_MUL, SOUL_ALT, SOUL_UNLOCK_LEVEL } from './soul';
import { type Terrain, VAN_LAM } from './terrain';

/** Bước mô phỏng cố định, dùng chung cho dự đoán ở client và xử lý ở server. */
export const STEP = 0.05;
export const TICK_MS = 50;

export const RUN_SPEED = 7;
export const FLY_SPEED = 22;
export const FLY_VSPEED = 12;
export const JUMP_V = 8.5;
export const GRAVITY = 24;
export const FLY_MIN_CLEAR = 1.6;
export const FLY_MAX_ALT = 520;
export const PLAYER_RADIUS = 0.5;
/** Level đảo nổi: dốc (m cao / m ngang) lớn hơn mức này thì đi bộ không lên được (dốc thang mây 0,74; vách đảo và thành cầu dựng đứng). Tính theo độ lớn gradient của mặt đất (không theo cao độ mỗi bước hay hướng đi) nên đi chéo hay chậm (speedMul) cũng không lách được. */
export const MAX_SLOPE_UP = 1.5;
/** Trúc Cơ: ngự kiếm dưới độ cao này (so với mặt đất) không tốn linh lực và bay được cả khi cạn linh lực. */
export const TRUC_CO_FREE_FLY_ALT = 20;

/** Có được (tiếp tục) ngự kiếm không: đủ cảnh giới và còn linh lực, hoặc Trúc Cơ bay thấp (miễn linh lực). Dùng chung client dự đoán và server. */
export function canFlyAt(level: number, mp: number, x: number, y: number, z: number, terrain: Terrain = VAN_LAM): boolean {
  if (level < FLY_UNLOCK_LEVEL) return false;
  return mp >= 1 || freeFlight(level, x, y, z, terrain);
}

/** Bay miễn linh lực: từ Trúc Cơ dưới `TRUC_CO_FREE_FLY_ALT`; từ Nguyên Anh (ngự không, E3-K) dưới `SKY_ALT` so với mặt đất. */
export function freeFlight(level: number, x: number, y: number, z: number, terrain: Terrain = VAN_LAM): boolean {
  if (level < TRUC_CO_LEVEL) return false;
  const alt = level >= SOUL_UNLOCK_LEVEL ? SKY_ALT : TRUC_CO_FREE_FLY_ALT;
  return y - terrain.groundAt(x, z) <= alt;
}

export interface MoveState {
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
  flying: boolean;
}

export const IN_JUMP = 1;
export const IN_FLY = 2;
export const IN_UP = 4;
export const IN_DOWN = 8;

export interface MoveInput {
  /** Số thứ tự tăng dần của input. */
  s: number;
  /** Trái/phải: -1..1. */
  mx: number;
  /** Lùi/tiến: -1..1. */
  mz: number;
  /** Góc quay camera quanh trục Y (radian). */
  yaw: number;
  /** Cờ bit IN_*. */
  f: number;
}

export interface MoveCtx {
  /** Được phép ngự kiếm (đủ cảnh giới, còn linh lực, không bị cấm). */
  canFly: boolean;
  /** Không điều khiển được (đã chết, đang độ kiếp bị khống chế…). */
  frozen: boolean;
  speedMul: number;
  /** Địa hình của level đang đứng (E1-A); thiếu thì Vân Lam. */
  terrain?: Terrain;
  /** Vách hang của phó bản (E2-C, `DungeonDef.bound`): đẩy ngược về trong vòng tròn này mỗi bước, cả khi bay; client và server cùng truyền. */
  bound?: { x: number; z: number; r: number };
  /** Từ Nguyên Anh (ngự không): bay trong `SKY_ALT` so với mặt đất thì chậm hơn ngự kiếm `1 - SKY_SPEED_MUL`. */
  sky?: boolean;
  /**
   * Nguyên anh xuất khiếu (E3-K): bay tự do, xuyên kiến trúc (không xuyên vách địa hình/ranh vùng chơi),
   * không ra xa thân xác `(x,z)` quá `r` và không cao quá `SOUL_ALT` so với mặt đất. Bỏ qua `canFly`.
   */
  ghost?: { x: number; z: number; r: number };
}

/** Vách hang của level (phó bản có `DungeonDef.bound`) để truyền vào `MoveCtx.bound`. */
export function caveBoundOf(level: { dungeon?: { center: { x: number; z: number }; bound?: number } } | undefined): MoveCtx['bound'] {
  const d = level?.dungeon;
  return d?.bound ? { x: d.center.x, z: d.center.z, r: d.bound } : undefined;
}

/** Độ dốc đi LÊN lớn nhất quanh (x, z) (m cao / m ngang, tám hướng, mẫu cách 0,15 m): ở vai mép đảo/cầu (một phía là vực) không tính là dốc, chỉ vách phía trước mới tính. */
function groundSlope(groundAt: (x: number, z: number) => number, x: number, z: number): number {
  const d = 0.15;
  const g0 = groundAt(x, z);
  let up = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const r = (groundAt(x + Math.cos(a) * d, z + Math.sin(a) * d) - g0) / d;
    if (r > up) up = r;
  }
  return up;
}

/** Áp một bước input lên trạng thái di chuyển. Sửa trực tiếp `s`. */
export function stepMove(s: MoveState, i: MoveInput, ctx: MoveCtx, dt: number = STEP): void {
  const terrain = ctx.terrain ?? VAN_LAM;
  const groundAt = terrain.groundAt;
  let mx = ctx.frozen ? 0 : i.mx;
  let mz = ctx.frozen ? 0 : i.mz;
  const len = Math.sqrt(mx * mx + mz * mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }

  const wantFly = (ctx.ghost !== undefined || ((i.f & IN_FLY) !== 0 && ctx.canFly)) && !ctx.frozen;
  if (wantFly && !s.flying) {
    s.flying = true;
    s.grounded = false;
    s.vy = 0;
    const g = groundAt(s.x, s.z);
    if (s.y < g + FLY_MIN_CLEAR) s.y = g + FLY_MIN_CLEAR;
  } else if (!wantFly && s.flying) {
    s.flying = false;
    s.vy = 0;
  }

  const sin = Math.sin(i.yaw);
  const cos = Math.cos(i.yaw);
  // Hướng tiến = (-sin, -cos); hướng phải = (cos, -sin).
  const dirX = -sin * mz + cos * mx;
  const dirZ = -cos * mz - sin * mx;
  const sky = s.flying && ctx.sky === true && ctx.ghost === undefined && s.y - groundAt(s.x, s.z) <= SKY_ALT + 0.5;
  const speed = (s.flying ? FLY_SPEED * (sky ? SKY_SPEED_MUL : 1) : RUN_SPEED) * ctx.speedMul;

  const px = s.x;
  const pz = s.z;
  s.x += dirX * speed * dt;
  s.z += dirZ * speed * dt;

  // Va chạm với kiến trúc (chỉ khi ở gần mặt đất).
  const colliders = ctx.ghost ? [] : terrain.colliders;
  for (let c = 0; c < colliders.length; c++) {
    const col = colliders[c];
    const dx = s.x - col.x;
    const dz = s.z - col.z;
    const rr = col.r + PLAYER_RADIUS;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-8) {
      const g = groundAt(col.x, col.z);
      if (s.y < g + 14) {
        const d = Math.sqrt(d2);
        s.x = col.x + (dx / d) * rr;
        s.z = col.z + (dz / d) * rr;
      }
    }
  }

  const lo = terrain.margin;
  const hi = terrain.size - terrain.margin;
  if (s.x < lo) s.x = lo;
  else if (s.x > hi) s.x = hi;
  if (s.z < lo) s.z = lo;
  else if (s.z > hi) s.z = hi;

  // Ranh vùng chơi: chân vách, đẩy ngược về trong (cả khi bay).
  if (terrain.playWall !== Infinity) {
    const dPlay = terrain.playDist(s.x, s.z);
    if (dPlay > terrain.playWall) {
      const play = terrain.def.play!;
      const k = terrain.playWall / dPlay;
      s.x = play.cx + (s.x - play.cx) * k;
      s.z = play.cz + (s.z - play.cz) * k;
    }
  }

  const b = ctx.bound;
  if (b) {
    const dx = s.x - b.x;
    const dz = s.z - b.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > b.r) {
      s.x = b.x + (dx * b.r) / d;
      s.z = b.z + (dz * b.r) / d;
    }
  }

  // Hẻm núi (DV-3K): ép vào sàn hẻm cả khi ngự kiếm/ngự không, để không bay lên cao nguyên rồi đáp xuống ngoài vách (mép vách uốn lượn ≤ ±wobble/2).
  const cy = terrain.def.canyon;
  if (cy) {
    // Cùng dạng siêu elip bậc 3 với `canyonRise` (góc hẻm bo tròn), thu nhỏ `wobble * 0.7` để chừa mép vách uốn lượn.
    const mx = cy.halfW - cy.wobble * 0.7;
    const mz = cy.halfL - cy.wobble * 0.7;
    const ex = s.x - cy.cx;
    const ez = s.z - cy.cz;
    const r = Math.cbrt(Math.abs(ex / mx) ** 3 + Math.abs(ez / mz) ** 3);
    if (r > 1) {
      s.x = cy.cx + ex / r;
      s.z = cy.cz + ez / r;
    }
  }

  const gh = ctx.ghost;
  if (gh) {
    const dx = s.x - gh.x;
    const dz = s.z - gh.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > gh.r) {
      s.x = gh.x + (dx * gh.r) / d;
      s.z = gh.z + (dz * gh.r) / d;
    }
  }

  let ground = groundAt(s.x, s.z);

  // Level đảo nổi (E3-N): chặn leo vách đảo và thành cầu. Không cho bước vào chỗ mặt đất dốc hơn `MAX_SLOPE_UP` (độ dốc đi lên lớn nhất quanh chỗ mới, không phụ
  // thuộc hướng đi hay tốc độ nên đi chéo/chạy chậm không lách được) trừ khi đang đi xuống (mặt đất mới thấp hơn chỗ cũ: rơi khỏi mép, bước xuống).
  // So mặt đất cũ với mới chứ không so với độ cao người nên nhảy cũng không leo được. Không áp khi ngự kiếm.
  if (
    terrain.blockRise &&
    !s.flying &&
    (s.x !== px || s.z !== pz) &&
    ground >= groundAt(px, pz) - 1e-3 &&
    groundSlope(groundAt, s.x, s.z) > MAX_SLOPE_UP
  ) {
    s.x = px;
    s.z = pz;
    ground = groundAt(s.x, s.z);
  }

  if (s.flying) {
    let vy = 0;
    if (i.f & IN_UP) vy += FLY_VSPEED;
    if (i.f & IN_DOWN) vy -= FLY_VSPEED;
    s.y += vy * dt;
    if (s.y < ground + FLY_MIN_CLEAR) s.y = ground + FLY_MIN_CLEAR;
    if (s.y > FLY_MAX_ALT) s.y = FLY_MAX_ALT;
    if (gh && s.y > ground + SOUL_ALT) s.y = ground + SOUL_ALT;
    s.grounded = false;
    return;
  }

  if (s.grounded) {
    if ((i.f & IN_JUMP) !== 0 && !ctx.frozen) {
      s.vy = JUMP_V;
      s.grounded = false;
      s.y += s.vy * dt;
    } else if (s.y - ground > 1.2) {
      // Bước hụt khỏi vách: bắt đầu rơi.
      s.grounded = false;
      s.vy = 0;
    } else {
      s.y = ground;
      s.vy = 0;
    }
  } else {
    s.vy -= GRAVITY * dt;
    if (s.vy < -60) s.vy = -60;
    s.y += s.vy * dt;
  }
  if (s.y <= ground) {
    s.y = ground;
    s.vy = 0;
    s.grounded = true;
  }
}

export function cloneMoveState(s: MoveState): MoveState {
  return { x: s.x, y: s.y, z: s.z, vy: s.vy, grounded: s.grounded, flying: s.flying };
}
