import { collisionOf, type MoveState, stepMove, terrainOf } from '@dtl/shared';

/**
 * Thông đường (COL-1): BFS lưới `cell` mét trong hộp `box`, mỗi bước sang ô kề được xác nhận bằng chính `stepMove` (đi bộ, va chạm 3D, địa hình
 * của level): từ tâm ô A hướng về tâm ô B tối đa `steps` bước, tới trong 0,45 m mới tính là thông. Trả hàm hỏi điểm (x, z) có tới được từ `start` không.
 * Dùng để chắc collider mới không bịt lối tới NPC, trận truyền tống, cổng.
 */
export function reachability(
  level: string,
  start: { x: number; z: number },
  box: { x0: number; z0: number; x1: number; z1: number },
  cell = 2,
): (x: number, z: number) => boolean {
  const terrain = terrainOf(level);
  const col = collisionOf(level);
  const W = Math.ceil((box.x1 - box.x0) / cell);
  const H = Math.ceil((box.z1 - box.z0) / cell);
  const cx = (i: number): number => box.x0 + (i + 0.5) * cell;
  const cz = (j: number): number => box.z0 + (j + 0.5) * cell;
  const idx = (i: number, j: number): number => j * W + i;
  const seen = new Uint8Array(W * H);
  const ctx = { canFly: false, frozen: false, speedMul: 1, terrain, collision: col };
  const steps = Math.round(cell / 0.35);
  const s0: MoveState = { x: 0, y: 0, z: 0, vy: 0, grounded: true, flying: false };
  const si = Math.min(W - 1, Math.max(0, Math.floor((start.x - box.x0) / cell)));
  const sj = Math.min(H - 1, Math.max(0, Math.floor((start.z - box.z0) / cell)));
  // Trạng thái đứng tại mỗi ô đã tới (để chân đúng cao độ trên bậc/bệ).
  const at = new Map<number, MoveState>();
  // Đặt điểm xuất phát đúng tâm ô của nó để các bước sang ô kề đều dài đúng `cell`.
  const sx = cx(si);
  const sz = cz(sj);
  const root: MoveState = { x: sx, y: terrain.groundAt(sx, sz), z: sz, vy: 0, grounded: true, flying: false };
  at.set(idx(si, sj), root);
  seen[idx(si, sj)] = 1;
  const queue = [idx(si, sj)];
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q]!;
    const from = at.get(k)!;
    const i = k % W;
    const j = Math.floor(k / W);
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const i2 = i + di;
      const j2 = j + dj;
      if (i2 < 0 || j2 < 0 || i2 >= W || j2 >= H || seen[idx(i2, j2)]) continue;
      Object.assign(s0, from);
      const tx = cx(i2);
      const tz = cz(j2);
      // Hướng tiến = (-sin, -cos) theo yaw: đặt yaw để hướng tới đích.
      const yaw = Math.atan2(-(tx - s0.x), -(tz - s0.z));
      for (let n = 0; n < steps; n++) stepMove(s0, { s: n, mx: 0, mz: 1, yaw, f: 0 }, ctx);
      if (Math.hypot(s0.x - tx, s0.z - tz) <= 0.45 && s0.grounded) {
        seen[idx(i2, j2)] = 1;
        at.set(idx(i2, j2), { ...s0 });
        queue.push(idx(i2, j2));
      }
    }
  }
  return (x, z) => {
    const i = Math.floor((x - box.x0) / cell);
    const j = Math.floor((z - box.z0) / cell);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const ii = i + a;
        const jj = j + b;
        if (ii >= 0 && jj >= 0 && ii < W && jj < H && seen[idx(ii, jj)]) return true;
      }
    return false;
  };
}
