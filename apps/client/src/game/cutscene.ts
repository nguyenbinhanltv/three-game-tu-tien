/**
 * Cảnh mở đầu (P2-B1): lần đầu một nhân vật vào Lạc Kiếm Tông, camera lướt từ biển mây qua sơn đạo, xuyên cổng
 * tam quan rồi hạ xuống đứng sau lưng nhân vật. Chỉ là lớp hình ở client: không gửi gì lên server, không khóa
 * input (bất kỳ phím/chuột nào là bỏ qua), bị quái đánh thì hủy.
 *
 * Phần thuần (đường spline, easing, trọng số hòa) tách ở đây để test được không cần renderer. Điểm cuối của đường
 * chính là camera thường của người chơi (truyền vào mỗi khung) nên bàn giao không có mối nối.
 */

import { OCCLUDERS, type CircleCollider } from '@dtl/shared';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Waypoint {
  p: Vec3;
  /** Điểm nhìn tới (tại thời điểm đi qua). */
  look: Vec3;
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/**
 * Điểm đi qua, tọa độ thế giới Vân Lam Sơn Mạch: mở ở trên biển mây (mây cao nhất y≈121) phía nam (thung lũng), bay lên sơn đạo
 * (x=2048, vượt gờ núi cao ~181 m ở z≈2240), hạ thấp dần để chui qua cổng tam quan (z=2128, xà dưới ~156,7) rồi nối vào camera người chơi.
 */
export const SECT_PATH: readonly Waypoint[] = [
  { p: v(1990, 134, 2560), look: v(2048, 122, 2300) },
  { p: v(2020, 150, 2430), look: v(2048, 150, 2180) },
  { p: v(2048, 162, 2300), look: v(2048, 160, 2130) },
  { p: v(2048, 196, 2236), look: v(2048, 160, 2120) },
  { p: v(2048, 176, 2190), look: v(2048, 154, 2110) },
  { p: v(2048, 157.5, 2150), look: v(2048, 153, 2095) },
  { p: v(2048, 154, 2128), look: v(2048, 152.5, 2085) },
];

/** Tổng thời gian (giây) và thời gian bỏ qua/hủy trả về camera thường. */
export const SECT_CUTSCENE = { dur: 9, out: 0.45 };

function smooth(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/**
 * Tham số dọc đường theo thời gian: nửa tuyến tính nửa smoothstep để đầu cảnh đã trôi (không đứng yên) còn cuối
 * cảnh chậm hẳn về 0 để khớp camera tĩnh.
 */
export function pathParam(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return 0.35 * x + 0.65 * smooth(x);
}

/** Catmull-Rom đều trên một thành phần. */
function cr(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

function crVec(out: Vec3, a: Vec3, b: Vec3, c: Vec3, d: Vec3, t: number): void {
  out.x = cr(a.x, b.x, c.x, d.x, t);
  out.y = cr(a.y, b.y, c.y, d.y, t);
  out.z = cr(a.z, b.z, c.z, d.z, t);
}

/**
 * Lấy mẫu đường tại u∈[0,1]: các điểm đi qua rồi điểm cuối `endP/endLook` (camera người chơi). Mỗi đoạn dài như
 * nhau theo tham số; đầu mút nhân đôi để spline không văng ra ngoài.
 */
export function samplePath(path: readonly Waypoint[], endP: Vec3, endLook: Vec3, u: number, outP: Vec3, outLook: Vec3): void {
  const n = path.length + 1;
  const P = (i: number): Vec3 => (i >= path.length ? endP : path[i < 0 ? 0 : i].p);
  const L = (i: number): Vec3 => (i >= path.length ? endLook : path[i < 0 ? 0 : i].look);
  const f = Math.max(0, Math.min(1, u)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const t = f - i;
  const last = n - 1;
  const at = (k: number): number => Math.max(0, Math.min(last, k));
  crVec(outP, P(at(i - 1)), P(i), P(i + 1), P(at(i + 2)), t);
  crVec(outLook, L(at(i - 1)), L(i), L(i + 1), L(at(i + 2)), t);
}

/**
 * Bộ chạy cảnh: giữ đồng hồ, trọng số hòa giữa đường spline và camera thường. `skip()` (phím, chuột, bị đánh)
 * làm trọng số tan trong `out` giây thay vì cắt cụt.
 */
export class Cutscene {
  private t = 0;
  private dur = 0;
  private out = 0.45;
  private path: readonly Waypoint[] = SECT_PATH;
  private from = 1;
  private fade = -1;
  /** Trọng số hiện tại của đường spline (1 = hoàn toàn camera cảnh). */
  weight = 0;
  /** Bật khi vừa kết thúc tự nhiên (không phải bỏ qua): để engine hiện thẻ chương. */
  finished = false;

  start(path: readonly Waypoint[] = SECT_PATH, dur = SECT_CUTSCENE.dur, out = SECT_CUTSCENE.out): void {
    this.path = path;
    this.dur = dur;
    this.out = out;
    this.t = 0;
    this.fade = -1;
    this.weight = 1;
    this.finished = false;
  }

  get active(): boolean {
    return this.dur > 0;
  }

  /** Đang chạy và chưa bị bỏ qua. */
  get playing(): boolean {
    return this.active && this.fade < 0;
  }

  /** Giây đã chạy (cho UI). */
  get time(): number {
    return this.t;
  }

  skip(): void {
    if (!this.playing) return;
    this.from = this.weight;
    this.fade = 0;
  }

  /**
   * Tiến đồng hồ; trả true nếu cảnh còn chi phối camera. Kết quả camera ghi vào outP/outLook (chỉ hợp lệ khi true),
   * đã hòa với `endP/endLook` theo `weight`.
   */
  update(dt: number, endP: Vec3, endLook: Vec3, outP: Vec3, outLook: Vec3): boolean {
    if (!this.active) {
      this.weight = 0;
      return false;
    }
    if (this.fade >= 0) {
      this.fade += dt;
      this.weight = this.from * (1 - smooth(this.fade / this.out));
      if (this.fade >= this.out) return this.end(false);
    } else {
      this.t += dt;
      if (this.t >= this.dur) return this.end(true);
      this.weight = 1;
    }
    const u = pathParam(this.t / this.dur);
    samplePath(this.path, endP, endLook, this.fade >= 0 ? this.skipU : u, outP, outLook);
    if (this.fade < 0) this.skipU = u;
    const w = this.weight;
    outP.x = endP.x + (outP.x - endP.x) * w;
    outP.y = endP.y + (outP.y - endP.y) * w;
    outP.z = endP.z + (outP.z - endP.z) * w;
    outLook.x = endLook.x + (outLook.x - endLook.x) * w;
    outLook.y = endLook.y + (outLook.y - endLook.y) * w;
    outLook.z = endLook.z + (outLook.z - endLook.z) * w;
    return true;
  }

  /** Điểm trên đường lúc bị bỏ qua: giữ nguyên để camera trôi về camera thường từ đúng chỗ đó. */
  private skipU = 0;

  private end(natural: boolean): boolean {
    this.dur = 0;
    this.weight = 0;
    this.finished = natural;
    return false;
  }
}

/** Cảnh boss xuất hiện (P2-B2): ngắn, và tắt camera cảnh trong `out` giây khi bị bỏ qua. */
export const BOSS_CUTSCENE = { dur: 2.6, out: 0.35 };
/** Chuyển pha (P2-B3). */
export const PHASE_CUTSCENE = { dur: 1.9, out: 0.3 };

/** Ngoài khoảng này người chơi không tham chiến nên không bị kéo camera. */
export const BOSS_CUTSCENE_RANGE = 42;

/** Lề thêm quanh hình tròn vật cản khi kiểm tầm nhìn camera→boss. */
const OCC_PAD = 0.9;
/** Thử lần lượt các độ lệch góc này (rad) quanh góc mặc định cho tới khi tầm nhìn thông. */
const TURN_TRIES = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05];

/** Đoạn (ax,az)→(bx,bz) có xuyên hình tròn vật cản nào không. Vật cản mà đích đã nằm trong thân (không xảy ra với va chạm thật) thì bỏ qua. */
export function sightBlocked(ax: number, az: number, bx: number, bz: number, occ: readonly CircleCollider[]): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  for (const o of occ) {
    const r = o.r + OCC_PAD;
    if (Math.hypot(o.x - bx, o.z - bz) < o.r + 0.2) continue;
    const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / len2));
    if (Math.hypot(ax + dx * t - o.x, az + dz * t - o.z) < r) return true;
  }
  return false;
}

/**
 * Đường camera đóng khung boss, đặt ở phía MẶT boss (hướng `yaw` boss đang nhìn, lệch ~40° về phía người chơi để có
 * khối). Boss đang lao tới theo hướng nhìn nên camera lệch hẳn khỏi trục đó (không bị boss chạy xuyên qua): đầu cảnh
 * thấp và rộng, nhìn lên thân boss; rồi áp sát nhẹ và hòa vào camera thường. Nếu cự kiếm/cột chắn tầm nhìn thì thử
 * góc khác (`occ`). `scale` là cỡ boss (monsters.json), `groundAt` để không chui xuống đất.
 */
export function bossIntroPath(
  boss: Vec3,
  yaw: number,
  scale: number,
  player: Vec3,
  groundAt: (x: number, z: number) => number,
  occ: readonly CircleCollider[] = OCCLUDERS,
): Waypoint[] {
  // Người chơi nằm bên nào của trục nhìn (dấu của tích có hướng) thì camera đứng bên đó.
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const side = fz * (player.x - boss.x) - fx * (player.z - boss.z) >= 0 ? 1 : -1;
  const build = (d: number): Waypoint[] => {
    const at = (turn: number, r: number, rise: number, look: number): Waypoint => {
      const a = yaw + side * turn + d;
      const x = boss.x + Math.sin(a) * r;
      const z = boss.z + Math.cos(a) * r;
      return { p: v(x, Math.max(groundAt(x, z) + 0.9, boss.y + rise), z), look: v(boss.x, boss.y + look, boss.z) };
    };
    return [at(0.7, 6 + 3.4 * scale, 0.35 * scale, 1.0 * scale), at(0.65, 5 + 2.6 * scale, 0.9 * scale + 0.4, 1.3 * scale)];
  };
  let first: Waypoint[] | null = null;
  for (const d of TURN_TRIES) {
    const path = build(d);
    first ??= path;
    if (!path.some((w) => sightBlocked(w.p.x, w.p.z, boss.x, boss.z, occ))) return path;
  }
  return first!;
}

/**
 * Chuyển pha: từ camera hiện tại vòng quanh boss sang phía MẶT boss (hướng `yaw` boss đang nhìn, lệch ~25° về phía
 * camera cho có khối), nâng nhẹ, mắt dõi ngực boss, rồi trả về camera thường. Điểm giữa nằm trên cung ngắn nhất
 * quanh boss nên camera không xuyên qua thân khi đang ở sau lưng. Vật cản chắn tầm nhìn thì thử góc khác.
 */
export function phaseShiftPath(
  cam: Vec3,
  camLook: Vec3,
  boss: Vec3,
  yaw: number,
  scale: number,
  groundAt: (x: number, z: number) => number,
  occ: readonly CircleCollider[] = OCCLUDERS,
): Waypoint[] {
  const TAU = Math.PI * 2;
  const wrap = (a: number): number => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  const dx = cam.x - boss.x;
  const dz = cam.z - boss.z;
  const camAng = Math.atan2(dx, dz);
  const camR = Math.hypot(dx, dz) || 1;
  const side = wrap(camAng - yaw) >= 0 ? 1 : -1;
  const frontR = 6 + 3 * scale;
  const look = v(boss.x, boss.y + 1.2 * scale, boss.z);
  const at = (ang: number, r: number, rise: number): Waypoint => {
    const x = boss.x + Math.sin(ang) * r;
    const z = boss.z + Math.cos(ang) * r;
    return { p: v(x, Math.max(groundAt(x, z) + 1.2, boss.y + rise), z), look };
  };
  const build = (d: number): Waypoint[] => {
    const frontAng = yaw + side * 0.44 + d;
    const midAng = frontAng + wrap(camAng - frontAng) * 0.5;
    const midR = Math.max(5 + 2 * scale, (camR + frontR) * 0.5);
    // Điểm đầu đúng camera hiện tại: không có mối nối.
    return [{ p: v(cam.x, cam.y, cam.z), look: camLook }, at(midAng, midR, 1.1 * scale + 0.8), at(frontAng, frontR, 1.0 * scale + 1.2)];
  };
  let first: Waypoint[] | null = null;
  for (const d of TURN_TRIES) {
    const path = build(d);
    first ??= path;
    if (!path.slice(1).some((w) => sightBlocked(w.p.x, w.p.z, boss.x, boss.z, occ))) return path;
  }
  return first!;
}

/** Khoảng cách ngang tối thiểu camera cảnh giữ với boss để thấy trọn thân trên. */
export function minBossDist(scale: number): number {
  return 4.5 + 2.2 * scale;
}
