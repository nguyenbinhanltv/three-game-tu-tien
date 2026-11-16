import { FLY_UNLOCK_LEVEL, TRUC_CO_LEVEL } from './formulas';
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
/** Trúc Cơ: ngự kiếm dưới độ cao này (so với mặt đất) không tốn linh lực và bay được cả khi cạn linh lực. */
export const TRUC_CO_FREE_FLY_ALT = 20;

/** Có được (tiếp tục) ngự kiếm không: đủ cảnh giới và còn linh lực, hoặc Trúc Cơ bay thấp (miễn linh lực). Dùng chung client dự đoán và server. */
export function canFlyAt(level: number, mp: number, x: number, y: number, z: number, terrain: Terrain = VAN_LAM): boolean {
  if (level < FLY_UNLOCK_LEVEL) return false;
  return mp >= 1 || freeFlight(level, x, y, z, terrain);
}

/** Bay miễn linh lực: từ Trúc Cơ, cách mặt đất không quá `TRUC_CO_FREE_FLY_ALT`. */
export function freeFlight(level: number, x: number, y: number, z: number, terrain: Terrain = VAN_LAM): boolean {
  return level >= TRUC_CO_LEVEL && y - terrain.groundAt(x, z) <= TRUC_CO_FREE_FLY_ALT;
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

  const wantFly = (i.f & IN_FLY) !== 0 && ctx.canFly && !ctx.frozen;
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
  const speed = (s.flying ? FLY_SPEED : RUN_SPEED) * ctx.speedMul;

  s.x += dirX * speed * dt;
  s.z += dirZ * speed * dt;

  // Va chạm với kiến trúc (chỉ khi ở gần mặt đất).
  const colliders = terrain.colliders;
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

  const ground = groundAt(s.x, s.z);

  if (s.flying) {
    let vy = 0;
    if (i.f & IN_UP) vy += FLY_VSPEED;
    if (i.f & IN_DOWN) vy -= FLY_VSPEED;
    s.y += vy * dt;
    if (s.y < ground + FLY_MIN_CLEAR) s.y = ground + FLY_MIN_CLEAR;
    if (s.y > FLY_MAX_ALT) s.y = FLY_MAX_ALT;
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
