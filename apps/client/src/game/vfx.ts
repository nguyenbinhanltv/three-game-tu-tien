import * as THREE from 'three/webgpu';
import { groundAt } from '@dtl/shared';
import { FxPool, type FxKind, type FxMesh } from '../render/materials/vfx';
import { SIGIL_CIRCLE, SIGIL_GEO, sigilLayout, type SigilShape } from '../render/vfx/sigil';
import { SLASH_GEO, SLASH_INK, slashPhase } from '../render/vfx/slash';
import { seedOr } from '../render/vfx/common';
import { BoltGeometry, boltPhase, boltShape, type BoltShape, VORTEX_GEO } from '../render/vfx/lightning';
import { INK_ALPHA, INK_DEATH, INK_HIT, INK_POOL, inkEvict, inkPhase, type InkTiming } from '../render/vfx/ink';
import { BEAM_GEO, LOOT_ARC, LOOT_BOUNCE, LOOT_GOLD, LOOT_TIERS, lootDuration, lootHop, lootPulse, type LootTier } from '../render/vfx/loot';
import { PARTICLES } from '../render/vfx/particles';
import { BoltFx } from '../render/vfx/projectile';
import { SwordRainFx } from '../render/vfx/swordRain';
import { Trails } from '../render/vfx/trail';
import { assets } from './assets';
import { PREFETCH_PRIORITY } from './preload';
import { G } from './geo';

interface Fx {
  t: number;
  dur: number;
  /** k = tiến độ 0..1. */
  update(k: number, dt: number): void;
  end(): void;
}

type PosFn = (out: THREE.Vector3) => boolean;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);
/** Tâm hình của lưới cung (SLASH_GEO) theo tọa độ lưới, để đặt dấu chém đúng giữa mục tiêu. */
const SLASH_CENTER = new THREE.Vector3(0, 0, -0.33);

/**
 * Hướng lưới cung. `stand`: dựng cung vào mặt phẳng vuông góc với hướng `yaw` (thấy trọn hình trăng
 * khi nhìn dọc theo `yaw`), `roll` xoay cung trong mặt phẳng đó, `lean` ngả mặt phẳng về phía trước.
 * Không `stand`: cung nằm ngang, `roll` nghiêng quanh trục tới.
 */
function orientSlash(q: THREE.Quaternion, yaw: number, roll: number, stand: boolean, lean = 0): void {
  q.setFromAxisAngle(UP, yaw);
  if (lean) q.multiply(_q.setFromAxisAngle(AX_X, lean));
  q.multiply(_q.setFromAxisAngle(AX_Z, roll));
  if (stand) q.multiply(_q.setFromAxisAngle(AX_X, -Math.PI / 2));
}

/** Màu vùng báo trước theo loại đòn (dùng chung cho vùng tròn và telegraph.ts). */
export const HAZARD_COLORS: Record<string, number> = {
  lightning: 0xb48cff,
  frost: 0x9fe4ff,
  fire: 0xffa060,
  spirit: 0xd8f0ff,
};

const RING_GEO = new THREE.RingGeometry(0.82, 1, 48);
const TUBE_GEO = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);

/** Một vết mực đang nằm trên đất (M4-14). */
interface InkMark {
  m: FxMesh;
  t: number;
  T: InkTiming;
  /** Đã bị ép tan sớm vì vượt MAX_INK: tiến độ tan nhanh 0..1 (0 = không bị ép). */
  forced: number;
}

/** Bộ đệm tia sét (lưới + hình) giữ lại giữa các lần đánh: phát không cấp phát. */
interface Bolt {
  geo: BoltGeometry;
  shape: BoltShape;
}
const BOLTS: Bolt[] = [];
const takeBolt = (): Bolt => BOLTS.pop() ?? { geo: new BoltGeometry(), shape: boltShape(0) };
for (let i = 0; i < 6; i++) BOLTS.push(takeBolt());

/** Mưa kiếm (M4-2): lưới instanced dùng chung cho mọi `Vfx`. */
const RAIN = new SwordRainFx(PARTICLES);
let rainModel: Promise<void> | null = null;
/** Màu mây kiếp: lam tím rất tối (không đen tuyền). */
const CLOUD_COLOR = 0x2b2840;

/**
 * Pool lưới hiệu ứng dùng chung cho mọi `Vfx` (sống qua các lần đổi room). Mỗi lưới dùng material
 * TSL dùng chung theo kiểu (render/materials/vfx.ts); màu/độ trong là dữ liệu của lưới. 96 lưới
 * ấm sẵn đủ cho một trận đông bình thường; pool chỉ lớn thêm khi vượt mức đó rồi giữ lại.
 */
const POOL = new FxPool(96);

/** Hệ hiệu ứng: mỗi hiệu ứng là vài lưới phát sáng sống trong thời gian ngắn. */
export class Vfx {
  group = new THREE.Group();
  readonly pool = POOL;
  /** Camera để dấu chém đứng quay mặt về người xem (engine gán). */
  camera: THREE.Camera | null = null;
  private items: Fx[] = [];
  /** Vệt phi kiếm, linh quang khi cầm kiếm, bụi chân (M4-5). Engine gọi `trails.update` mỗi khung. */
  readonly trails: Trails;
  readonly particles = PARTICLES;
  readonly rain = RAIN;
  /** Đạn đánh xa của quái (D1): engine gọi `bolts.spawn/end` theo S.BOLT/S.BOLT_END. */
  readonly bolts: BoltFx;
  /** Chớp toàn cảnh (engine nối vào `PostPipeline.flash`, uniform `uFlash`). */
  onFlash: ((amount: number) => void) | null = null;
  /** Mây kiếp đang hiện: tia sét đánh gần thì bừng sáng trong mây. */
  private clouds = new Set<FxMesh>();
  /** Vết mực trên đất (giới hạn MAX_INK); hai mảng phụ dùng lại khi chọn vết phải tan sớm. */
  private inks: InkMark[] = [];
  private inkAges: number[] = [];
  private inkForced: boolean[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    PARTICLES.attach(this.group);
    this.group.add(RAIN.group);
    this.trails = new Trails(this, PARTICLES);
    this.bolts = new BoltFx(this);
    // Vẽ ấm các material mới (mưa kiếm, tia sét, mây kiếp, vệt kiếm) vài khung lúc đang tải: biên dịch
    // shader trước, lần dùng đầu không bị khựng. Độ trong 0, cỡ 0: không thấy gì.
    RAIN.prewarm();
    for (const kind of ['bolt', 'vortex', 'trail', 'beam', 'inkpool', 'dome'] as const) {
      const m = this.fx(G.ico1, 0xffffff, 0, kind);
      m.scale.setScalar(1e-3);
      this.add(0.15, () => {}, () => this.drop(m));
    }
    // Lưới phi kiếm thật cho mưa kiếm: nạp một lần (giữ handle suốt phiên); chưa có thì dùng lưới dự phòng.
    rainModel ??= assets
      .acquire('prop_phi_kiem', { priority: PREFETCH_PRIORITY.vfx })
      .then((h) => {
        RAIN.useModel(h.scene);
      })
      .catch((e) => {
        console.warn('[vfx] không nạp được prop_phi_kiem, mưa kiếm dùng lưới dự phòng', e);
      });
  }

  private add(dur: number, update: (k: number, dt: number) => void, end: () => void): void {
    this.items.push({ t: 0, dur, update, end });
  }

  /** Cho module hiệu ứng bên ngoài (telegraph.ts) chạy theo cùng vòng cập nhật. */
  track(dur: number, update: (k: number, dt: number) => void, end: () => void): void {
    this.add(dur, update, end);
  }

  /** Lấy một lưới từ pool và gắn vào cảnh. `kind`: xem `FxKind` (mặc định cộng sáng có bloom). */
  fx(geo: THREE.BufferGeometry, color: number, opacity = 0.9, kind: FxKind = 'glow'): FxMesh {
    const m = POOL.acquire(geo, kind, color, opacity);
    this.group.add(m);
    return m;
  }

  /** Trả lưới về pool (không dispose material: material dùng chung). */
  drop(m: FxMesh): void {
    POOL.release(m);
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.update(k, dt);
      if (k >= 1) {
        f.end();
        this.items.splice(i, 1);
      }
    }
    this.updateInk(dt);
    this.bolts.update(dt);
    RAIN.update(dt);
    PARTICLES.update(dt);
  }

  /** Vụ nổ sáng nhỏ tại một điểm. */
  burst(pos: THREE.Vector3, color: number, size = 1.2, dur = 0.28): void {
    // Vỏ cầu fresnel (rìa sáng, giữa trong suốt): quả cầu đặc cộng sáng che kín người/quái trúng đòn.
    const m = this.fx(G.ico1, color, 0.9, 'dome');
    m.position.copy(pos);
    const ring = this.fx(RING_GEO, color, 0.8);
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    this.add(
      dur,
      (k) => {
        const s = size * (0.3 + k * 1.1);
        m.scale.setScalar(s);
        m.fxOpacity = 0.9 * (1 - k);
        ring.scale.setScalar(size * (0.5 + k * 2.2));
        ring.fxOpacity = 0.8 * (1 - k);
        m.fxK = ring.fxK = k;
      },
      () => {
        this.drop(m);
        this.drop(ring);
      },
    );
  }

  /** Phi kiếm bay từ nguồn tới đích rồi nổ. */
  swordShot(from: THREE.Vector3, to: PosFn, color: number, size = 1, dur = 0.2, onHit?: (at: THREE.Vector3) => void): void {
    const m = this.fx(G.octa, color, 0.95);
    const start = from.clone();
    const target = from.clone();
    const dir = new THREE.Vector3();
    this.add(
      dur,
      (k) => {
        to(target);
        m.position.lerpVectors(start, target, k);
        dir.subVectors(target, start);
        if (dir.lengthSq() > 1e-4) m.quaternion.setFromUnitVectors(UP, dir.normalize());
        m.scale.set(0.09 * size, 1.1 * size, 0.09 * size);
      },
      () => {
        this.drop(m);
        this.burst(target, color, 0.9 * size);
        onHit?.(target);
      },
    );
  }

  /** Lấy một cặp lưới cung (lớp sáng + lớp mực nền nằm dưới) cho một nhát chém. */
  private slashPair(color: number, ink: boolean): [FxMesh, FxMesh | null] {
    const seed = Math.random() * 40;
    const g = this.fx(SLASH_GEO, color, 0.95, 'slash');
    g.fxA.z = seed;
    if (!ink) return [g, null];
    const i = this.fx(SLASH_GEO, SLASH_INK, 0.9, 'ink');
    // Mực vẽ trước lớp sáng (vật trong suốt sắp theo renderOrder trước khoảng cách).
    i.renderOrder = -1;
    i.fxA.z = seed + 3.7;
    return [g, i];
  }

  /**
   * Kiếm khí (Kiếm Khí Trảm, M4-1): cung trăng lưỡi liềm bay từ người chém tới mục tiêu. Trong 30%
   * đầu cung quét dần theo độ dài; nửa sau mép tan theo nhiễu; lớp mực trễ hơn một nhịp. Tới nơi thì
   * để lại một dấu chém đứng nhỏ + chớp sáng. Thời lượng bay như bản cũ (0,26 giây).
   */
  slash(from: THREE.Vector3, to: PosFn, color: number): void {
    const [g, ink] = this.slashPair(color, true);
    const start = from.clone();
    const target = from.clone();
    const dir = new THREE.Vector3(0, 0, 1);
    this.add(
      0.26,
      (k) => {
        to(target);
        _b.subVectors(target, start).setY(0);
        if (_b.lengthSq() > 1e-4) dir.copy(_b).normalize();
        const yaw = Math.atan2(dir.x, dir.z);
        const e = 1 - (1 - k) * (1 - k);
        const R = 1.8 + k * 1.2;
        // Cung đứng quay lưng về người chém (người xem sau lưng thấy trọn hình trăng), ngả về trước.
        orientSlash(g.quaternion, yaw, 0.3, true, 0.45);
        g.scale.setScalar(R);
        // Tâm hình cung (không phải đỉnh) đi theo quỹ đạo.
        _c.copy(SLASH_CENTER).multiplyScalar(R).applyQuaternion(g.quaternion);
        g.position.lerpVectors(start, target, e).sub(_c);
        const ph = slashPhase(k, 0.3, 0.55);
        g.fxA.x = ph.head;
        g.fxA.y = ph.erode;
        g.fxK = k;
        if (ink) {
          ink.position.copy(g.position).addScaledVector(dir, -0.22 * R);
          ink.position.y -= 0.16 * R;
          ink.quaternion.copy(g.quaternion);
          ink.scale.setScalar(R * 1.08);
          const pi = slashPhase(k - 0.06, 0.3, 0.45);
          ink.fxA.x = pi.head;
          ink.fxA.y = pi.erode;
        }
      },
      () => {
        this.drop(g);
        if (ink) this.drop(ink);
        this.slashMark(() => true, color, 0.9, -1.15, 0.24, false, target.clone());
        this.burst(target, color, 1.3, 0.3);
      },
    );
  }

  /**
   * Dấu chém đứng tại một điểm, quay mặt về camera: cung quét từ trên xuống. `roll`: góc nghiêng
   * trong mặt phẳng nhìn (−1,25 gần thẳng đứng; −0,5 chéo). `fixed`: vị trí cố định thay cho `pos`.
   */
  slashMark(pos: PosFn, color: number, size = 1, roll = -1.25, dur = 0.3, withInk = true, fixed?: THREE.Vector3): void {
    const [g, ink] = this.slashPair(color, withInk);
    const R = 1.6 * size;
    const at = new THREE.Vector3();
    this.add(
      dur,
      (k) => {
        if (fixed) at.copy(fixed);
        else if (!pos(at)) {
          g.visible = false;
          if (ink) ink.visible = false;
          return;
        }
        g.visible = true;
        const cam = this.camera?.position;
        const yaw = cam ? Math.atan2(cam.x - at.x, cam.z - at.z) : 0;
        orientSlash(g.quaternion, yaw, roll, true);
        const s = R * (1 + k * 0.15);
        g.scale.setScalar(s);
        // Đặt tâm hình cung (không phải đỉnh) vào điểm chém.
        _c.copy(SLASH_CENTER).multiplyScalar(s).applyQuaternion(g.quaternion);
        g.position.copy(at).sub(_c);
        const ph = slashPhase(k, 0.35, 0.5);
        g.fxA.x = ph.head;
        g.fxA.y = ph.erode;
        g.fxK = k;
        if (ink) {
          ink.visible = true;
          ink.quaternion.copy(g.quaternion);
          ink.scale.setScalar(s * 1.12);
          _c.copy(SLASH_CENTER).multiplyScalar(s * 1.12).applyQuaternion(g.quaternion);
          ink.position.copy(at).sub(_c);
          // Lùi lớp mực ra sau một chút theo hướng nhìn.
          if (cam) ink.position.addScaledVector(_c.subVectors(at, cam).normalize(), 0.08);
          const pi = slashPhase(k - 0.07, 0.35, 0.42);
          ink.fxA.x = pi.head;
          ink.fxA.y = pi.erode;
        }
      },
      () => {
        this.drop(g);
        if (ink) this.drop(ink);
      },
    );
  }

  /** Nhát chém dọc lớn (Lôi Đình Nhất Kiếm): biến thể đứng của kiếm khí, có lớp mực. */
  slashVertical(pos: PosFn, color: number, size = 1.3): void {
    this.slashMark(pos, color, size, -1.3, 0.34, true);
  }

  /**
   * Mưa kiếm (M4-2): kiếm thật cắm xuống theo seed của server (mọi client cùng hình), vệt sao chổi,
   * vết nứt, vòng chấn động, tan theo nhiễu. `mine`: của mình thì đủ hạt, người khác một nửa.
   */
  swordRain(cx: number, cy: number, cz: number, r: number, color: number, seed?: number, mine = true): void {
    RAIN.play(cx, cy, cz, r, color, seedOr(seed), mine);
  }

  /**
   * Tia sét (M4-4) đánh xuống (x, y, z). Hình theo `seed` (từ server: mọi client thấy cùng một tia);
   * không có seed thì ngẫu nhiên tại chỗ. `flash` > 0: chớp toàn cảnh qua `onFlash` lúc tia ngược
   * bừng (và nhỏ hơn ở lần bừng thứ hai). Thời lượng 0,42 giây như bản cũ.
   */
  lightning(x: number, y: number, z: number, color = 0xd6c4ff, scale = 1, seed?: number, flash = 0): void {
    const sd = seedOr(seed);
    const bolt = takeBolt();
    boltShape(sd, 62, 7, scale, bolt.shape);
    const m = this.fx(bolt.geo.geo, color, 1, 'bolt');
    m.fxA.z = (sd % 4000) / 100;
    const glow = this.fx(G.ico1, color, 0.35);
    glow.position.set(x, y + 0.6, z);
    const ring = this.fx(RING_GEO, color, 0.9);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.3, z);
    const cam = this.camera?.position;
    let struck = 0;
    this.add(
      0.42,
      (k) => {
        const ph = boltPhase(k);
        m.fxA.x = ph.head;
        m.fxA.y = ph.lum;
        m.fxK = k;
        if (cam) bolt.geo.build(bolt.shape, x, y, z, cam);
        // Tia ngược chạm đất: chớp cảnh, tia lửa, mây sáng; bừng lại lần hai nhỏ hơn.
        if (struck === 0 && k >= 0.12) {
          struck = 1;
          this.strike(x, y, z, color, scale, flash);
        } else if (struck === 1 && k >= 0.34) {
          struck = 2;
          if (flash > 0) this.onFlash?.(flash * 0.6);
        }
        glow.scale.set(scale * (1 + k * 2.2), scale * (0.6 + k * 1.2), scale * (1 + k * 2.2));
        glow.fxOpacity = 0.35 * (1 - k) * (k < 0.12 ? 0.3 : 1);
        ring.scale.setScalar(scale * (1 + Math.max(0, k - 0.12) * 4.5));
        ring.fxOpacity = k < 0.12 ? 0 : 0.9 * (1 - k);
      },
      () => {
        this.drop(m);
        this.drop(glow);
        this.drop(ring);
        BOLTS.push(bolt);
      },
    );
  }

  private strike(x: number, y: number, z: number, color: number, scale: number, flash: number): void {
    if (flash > 0) this.onFlash?.(flash);
    const n = Math.round(14 * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      PARTICLES.emit('glow', x, y + 0.3, z, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, 0.3 + Math.random() * 0.3, 0.12, 0.03, i & 1 ? 0xffffff : color, 1, 14, 2.5);
    }
    for (const c of this.clouds) {
      if (Math.hypot(c.position.x - x, c.position.z - z) < 50) c.fxA.y = 1;
    }
  }

  /**
   * Đồ rơi (M4-6), chỉ là lớp hình: viên đồ nảy ra từ `from` (ngực quái) tới một điểm quanh xác, chạm
   * đất (gọi `onLand`: chuông), cột sáng theo bậc dâng lên, nằm một lúc rồi biến mất (gọi `onCollect`
   * với vị trí cuối: engine cho icon bay vào túi). `slot`: thứ tự món trong cùng một lần rơi, để các món
   * tỏa ra các hướng khác nhau và nảy lệch nhịp. Trả về điểm chạm đất (cho chỉ báo ngoài màn hình).
   */
  lootDrop(from: THREE.Vector3, tier: LootTier, slot = 0, onLand?: () => void, onCollect?: (at: THREE.Vector3) => void, color?: number): THREE.Vector3 {
    const T = LOOT_TIERS[tier];
    const col = color ?? T.color;
    const delay = Math.min(slot, 5) * 0.12;
    const ang = Math.random() * Math.PI * 2 + slot * 2.4;
    const dist = 0.9 + Math.random() * 0.7;
    const tx = from.x + Math.cos(ang) * dist;
    const tz = from.z + Math.sin(ang) * dist;
    const ground = groundAt(tx, tz);
    const gy = ground + 0.32;
    const sx = from.x;
    const sy = from.y;
    const sz = from.z;
    const size = 1 + tier * 0.18;
    const gem = this.fx(G.octa, col, 0.95);
    gem.visible = false;
    const beam = this.fx(BEAM_GEO, col, 0, 'beam');
    beam.fxA.w = Math.random() * 40;
    beam.position.set(tx, ground - 0.05, tz);
    beam.scale.set(T.radius, T.height, T.radius);
    const core = T.core ? this.fx(BEAM_GEO, 0xfff6dc, 0, 'beam') : null;
    if (core) {
      core.fxA.w = beam.fxA.w + 11;
      core.position.copy(beam.position);
      core.scale.set(T.radius * 0.4, T.height * 0.75, T.radius * 0.4);
    }
    const ring = tier > 0 ? this.fx(RING_GEO, col, 0) : null;
    if (ring) {
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(tx, ground + 0.08, tz);
    }
    const lift = LOOT_ARC + LOOT_BOUNCE + T.hold;
    let t = 0;
    let landed = false;
    let collected = false;
    this.add(
      delay + lootDuration(tier),
      (_k, dt) => {
        t += dt;
        const tt = t - delay;
        if (tt < 0) return;
        // Viên đồ: vồng từ xác xuống đất, nảy lại một lần, rồi lơ lửng xoay chậm.
        if (!collected) {
          gem.visible = true;
          const f = Math.min(1, tt / LOOT_ARC);
          const bob = tt > LOOT_ARC + LOOT_BOUNCE ? 0.1 + Math.sin(tt * 3.2) * 0.05 : 0;
          gem.position.set(sx + (tx - sx) * f, sy + (gy - sy) * f + lootHop(tt) + bob, sz + (tz - sz) * f);
          gem.rotation.y += dt * (tt < LOOT_ARC ? 9 : 2.6);
          gem.scale.set(0.15 * size, 0.26 * size, 0.15 * size);
          gem.fxK = Math.min(1, tt / 0.4);
        }
        if (!landed && tt >= LOOT_ARC) {
          landed = true;
          onLand?.();
          _a.set(tx, gy, tz);
          this.burst(_a, col, 0.5 + tier * 0.25, 0.3);
          for (let i = 0; i < T.sparks; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * T.radius * 0.8;
            PARTICLES.emit('glow', tx + Math.cos(a) * r, ground + 0.2, tz + Math.sin(a) * r, 0, 1.4 + Math.random() * 2.2, 0, 1 + Math.random() * 0.9, 0.09, 0.02, i & 1 ? 0xfff6dc : col, 0.9, -0.6, 0.6);
          }
        }
        // Cột sáng: dâng từ chân lên trong 0,25 giây sau khi chạm đất, tan dần sau khi đồ bay đi.
        const bt = tt - LOOT_ARC;
        if (bt >= 0) {
          const out = tt > lift ? Math.max(0, 1 - (tt - lift) / 0.7) : 1;
          beam.fxA.x = Math.min(1.1, bt / 0.25);
          beam.fxK = Math.min(1, bt / 0.8);
          beam.fxOpacity = T.alpha * out * lootPulse(tier, bt);
          if (core) {
            core.fxA.x = Math.min(1.1, bt / 0.35);
            core.fxK = beam.fxK;
            core.fxOpacity = 0.5 * out;
          }
          if (ring) {
            // Loang ra rồi đọng lại thành quầng dưới chân cột, thở nhẹ, tắt cùng cột.
            const rk = Math.min(1, bt / 0.5);
            const e = 1 - (1 - rk) * (1 - rk);
            ring.scale.setScalar((0.3 + e * 0.7) * (0.8 + tier * 0.45) * (1 + Math.sin(bt * 5) * 0.04));
            ring.fxOpacity = (0.85 - e * 0.4) * out;
          }
        }
        if (!collected && tt >= lift) {
          collected = true;
          gem.visible = false;
          this.burst(gem.position, col, 0.35, 0.2);
          onCollect?.(gem.position);
        }
      },
      () => {
        this.drop(gem);
        this.drop(beam);
        if (core) this.drop(core);
        if (ring) this.drop(ring);
      },
    );
    return new THREE.Vector3(tx, gy, tz);
  }

  /** Đồng tiền nảy ra từ xác rồi lóe lên và tan (vàng đã vào túi; không cột sáng, không bay vào túi). */
  goldDrop(from: THREE.Vector3): void {
    const ang = Math.random() * Math.PI * 2;
    const tx = from.x + Math.cos(ang) * 0.7;
    const tz = from.z + Math.sin(ang) * 0.7;
    const gy = groundAt(tx, tz) + 0.18;
    const sx = from.x;
    const sy = from.y;
    const sz = from.z;
    const coin = this.fx(G.octa, LOOT_GOLD, 0.95);
    const end = LOOT_ARC + LOOT_BOUNCE + 0.3;
    let t = 0;
    this.add(
      end,
      (_k, dt) => {
        t += dt;
        const f = Math.min(1, t / LOOT_ARC);
        coin.position.set(sx + (tx - sx) * f, sy + (gy - sy) * f + lootHop(t, 1.1), sz + (tz - sz) * f);
        coin.rotation.y += dt * 12;
        const fade = t > end - 0.3 ? Math.max(0, (end - t) / 0.3) : 1;
        coin.scale.set(0.13 * fade, 0.04 + 0.13 * fade, 0.13 * fade);
        coin.fxOpacity = 0.95 * fade;
      },
      () => {
        this.burst(coin.position, LOOT_GOLD, 0.3, 0.18);
        this.drop(coin);
      },
    );
  }

  /**
   * Vết mực loang trên đất (M4-14) tâm (x, z), bán kính `r` (m). `stretch` > 1 kéo dài vết theo hướng
   * `yaw` (vệt dưới đòn nặng). Tấm áp nghiêng theo mặt đất. Quá `MAX_INK` vết thì vết cũ nhất tan nhanh.
   */
  inkSplat(x: number, z: number, r: number, T: InkTiming = INK_DEATH, yaw = Math.random() * Math.PI * 2, stretch = 1, alpha = INK_ALPHA, edge = 1): void {
    const n = this.inks.length;
    this.inkAges.length = this.inkForced.length = n;
    for (let i = 0; i < n; i++) {
      this.inkAges[i] = this.inks[i].t;
      this.inkForced[i] = this.inks[i].forced > 0;
    }
    const ev = inkEvict(this.inkAges, this.inkForced);
    if (ev >= 0) this.inks[ev].forced = 0.001;
    const m = this.fx(SIGIL_GEO, INK_POOL, alpha, 'inkpool');
    // Vẽ trước mọi hiệu ứng sáng (vật trong suốt sắp theo renderOrder trước khoảng cách).
    m.renderOrder = -2;
    m.fxA.set(0, 0, edge, Math.random() * 50);
    // Pháp tuyến mặt đất bằng sai phân quanh tâm, để vết không chìm/lơ lửng trên dốc.
    const e = Math.max(0.5, r * 0.6);
    _b.set(groundAt(x - e, z) - groundAt(x + e, z), 2 * e, groundAt(x, z - e) - groundAt(x, z + e)).normalize();
    m.quaternion.setFromUnitVectors(UP, _b).multiply(_q.setFromAxisAngle(UP, yaw));
    m.position.set(x, groundAt(x, z) + 0.07 + r * 0.02, z);
    m.scale.set(2 * r, 1, 2 * r * stretch);
    this.inks.push({ m, t: 0, T, forced: 0 });
  }

  /** Vệt mực mờ dưới chân nạn nhân khi trúng đòn nặng, kéo dài theo hướng đòn (từ (fromX, fromZ) tới (x, z)). */
  inkStreak(x: number, z: number, fromX: number, fromZ: number, r = 0.7): void {
    const yaw = Math.atan2(x - fromX, z - fromZ);
    // Lệch về phía sau nạn nhân: mực văng theo hướng đòn.
    this.inkSplat(x + Math.sin(yaw) * r * 0.5, z + Math.cos(yaw) * r * 0.5, r, INK_HIT, yaw, 1.7, 0.5, 0.6);
  }

  /** Mực văng ra khi quái gục: giọt mực rơi theo trọng lực và vài đốm sương linh khí tan lên. */
  inkBurst(pos: THREE.Vector3, size = 1): void {
    const n = Math.round(10 * size);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      PARTICLES.emit('dust', pos.x, pos.y, pos.z, Math.cos(a) * sp, 1.5 + Math.random() * 3, Math.sin(a) * sp, 0.45 + Math.random() * 0.3, 0.2 * size, 0.06, INK_POOL, 0.9, 11, 0.5);
    }
    for (let i = 0; i < 5; i++) {
      PARTICLES.emit('glow', pos.x + (Math.random() - 0.5) * size, pos.y, pos.z + (Math.random() - 0.5) * size, 0, 0.8 + Math.random(), 0, 0.9 + Math.random() * 0.5, 0.08, 0.02, 0xdce6df, 0.6, -0.3, 0.8);
    }
  }

  private updateInk(dt: number): void {
    for (let i = this.inks.length - 1; i >= 0; i--) {
      const ink = this.inks[i];
      ink.t += dt;
      const ph = inkPhase(ink.t, ink.T);
      if (ink.forced > 0) ink.forced = Math.min(1, ink.forced + dt / 0.6);
      const dissolve = Math.max(ph.dissolve, ink.forced);
      ink.m.fxA.x = ph.spread;
      ink.m.fxA.y = dissolve;
      if (dissolve >= 1) {
        this.drop(ink.m);
        this.inks.splice(i, 1);
      }
    }
  }

  /** Số vết mực đang nằm trên đất (để kiểm giới hạn). */
  get inkCount(): number {
    return this.inks.length;
  }

  /** Cột sáng dâng lên quanh một thực thể (lên cấp, hồi phục, hồi sinh). */
  pillar(pos: PosFn, color: number, dur = 1.1, radius = 1.1, height = 7, alpha = 0.55): void {
    // Ống sáng phủ lên chính nhân vật: không bloom để không nhòe hình bóng (vòng dưới chân vẫn có).
    // `alpha` thấp + bán kính nhỏ cho chiêu lớn: người chơi và quái phải luôn đọc rõ.
    const m = this.fx(TUBE_GEO, color, alpha, 'flat');
    const ring = this.fx(RING_GEO, color, 0.8 * Math.min(1, alpha / 0.4));
    ring.rotation.x = -Math.PI / 2;
    this.add(
      dur,
      (k) => {
        if (!pos(_a)) return;
        const h = height * Math.min(1, k * 2.5);
        m.position.set(_a.x, _a.y - 1.1 + h / 2, _a.z);
        m.scale.set(radius * (1 - k * 0.4), h, radius * (1 - k * 0.4));
        m.fxOpacity = alpha * (1 - k * k);
        ring.position.set(_a.x, _a.y - 1.0, _a.z);
        ring.scale.setScalar(radius * (1 + k * 2.5));
        ring.fxOpacity = 0.8 * Math.min(1, alpha / 0.4) * (1 - k);
      },
      () => {
        this.drop(m);
        this.drop(ring);
      },
    );
  }

  /**
   * Đột phá thành công (P2-B4): quầng vàng ấm tỏa từ người, một ống sáng mảnh và chùm tia nắng xòe lên như mây kiếp
   * vừa tách. Mảnh và cộng sáng để giữ màu cảnh (khác `pillar` bọc kín trước camera). 1 + 1 + 5 lưới trong ~2,6 giây.
   */
  ascendGlow(pos: PosFn, dur = 2.6): void {
    const core = this.fx(TUBE_GEO, 0xffe6a0, 0.3, 'flat');
    const ring = this.fx(RING_GEO, 0xffd98a, 0.7);
    ring.rotation.x = -Math.PI / 2;
    const rays: { m: FxMesh; dir: THREE.Vector3 }[] = [];
    for (let i = 0; i < 5; i++) {
      const phi = (i / 5) * Math.PI * 2 + 0.4;
      const th = 0.16 + (i % 2) * 0.12;
      const dir = new THREE.Vector3(Math.sin(th) * Math.cos(phi), Math.cos(th), Math.sin(th) * Math.sin(phi));
      rays.push({ m: this.fx(TUBE_GEO, 0xffe2a0, 0.2, 'glow'), dir });
    }
    this.add(
      dur,
      (k) => {
        if (!pos(_a)) return;
        const rise = Math.min(1, k * 4);
        const fade = Math.pow(1 - k, 1.5);
        const h = 46 * rise;
        core.position.set(_a.x, _a.y - 1.1 + h / 2, _a.z);
        core.scale.set(0.8, h, 0.8);
        core.fxOpacity = 0.3 * fade;
        ring.position.set(_a.x, _a.y - 1.0, _a.z);
        ring.scale.setScalar(1.2 + k * 7);
        ring.fxOpacity = 0.7 * (1 - k);
        for (const r of rays) {
          const len = 55 * rise;
          r.m.position.set(_a.x + (r.dir.x * len) / 2, _a.y - 1.1 + (r.dir.y * len) / 2, _a.z + (r.dir.z * len) / 2);
          r.m.quaternion.setFromUnitVectors(_up, r.dir);
          r.m.scale.set(1.1 + k * 1.5, len, 1.1 + k * 1.5);
          r.m.fxOpacity = 0.2 * fade;
        }
      },
      () => {
        this.drop(core);
        this.drop(ring);
        for (const r of rays) this.drop(r.m);
      },
    );
  }

  /**
   * Hồi sinh (P2-B5): linh quang xanh ngọc nhạt dâng quanh người: ống sáng mảnh, hai vành sóng nối nhau và một vòng
   * hạt linh khí xoáy bay lên. Cộng sáng, mảnh, để lộ màu cảnh khi mực đang rút. 3 + 10 lưới trong ~2,4 giây.
   */
  reviveGlow(pos: PosFn, dur = 2.4): void {
    const core = this.fx(TUBE_GEO, 0xcdf6ff, 0.34, 'flat');
    const rings = [this.fx(RING_GEO, 0xbff0ff, 0.8), this.fx(RING_GEO, 0xfff1c4, 0.6)];
    for (const r of rings) r.rotation.x = -Math.PI / 2;
    const N = 10;
    const motes: FxMesh[] = [];
    for (let i = 0; i < N; i++) motes.push(this.fx(G.ico1, i % 3 === 0 ? 0xfff1c4 : 0xbff0ff, 0.9));
    this.add(
      dur,
      (k) => {
        if (!pos(_a)) return;
        const rise = Math.min(1, k * 3);
        const fade = Math.pow(1 - k, 1.4);
        const h = 9 * rise;
        core.position.set(_a.x, _a.y - 1.1 + h / 2, _a.z);
        core.scale.set(0.55 * (1 - k * 0.5), h, 0.55 * (1 - k * 0.5));
        core.fxOpacity = 0.34 * fade;
        rings.forEach((r, j) => {
          const kk = Math.max(0, Math.min(1, (k - j * 0.18) / 0.82));
          r.position.set(_a.x, _a.y - 1.0, _a.z);
          r.scale.setScalar(0.8 + kk * 4.5);
          r.fxOpacity = 0.8 * (1 - kk) * (kk > 0 || j === 0 ? 1 : 0);
        });
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2 + k * 5;
          const r = (1.5 - k * 0.9) * (0.75 + (i % 3) * 0.2);
          const y = (0.2 + ((k * 3 + i * 0.37) % 1) * 4.2) * (0.6 + 0.4 * rise);
          motes[i].position.set(_a.x + Math.cos(a) * r, _a.y - 1.1 + y, _a.z + Math.sin(a) * r);
          motes[i].scale.setScalar(0.16 * (1 - k * 0.6));
          motes[i].fxOpacity = 0.9 * fade;
        }
      },
      () => {
        this.drop(core);
        for (const r of rings) this.drop(r);
        for (const m of motes) this.drop(m);
      },
    );
  }

  /** Lớp linh khí hộ thể bao quanh người. */
  shield(pos: PosFn, dur: number, stillOn: () => boolean, color = 0x7fd8ff, scale = 1, alpha = 0.28): void {
    const m = this.fx(G.ico1, color, alpha, 'dome');
    let t = 0;
    this.add(
      dur,
      (_k, dt) => {
        t += dt;
        if (!pos(_a) || !stillOn()) {
          m.visible = false;
          return;
        }
        m.visible = true;
        m.position.copy(_a).setY(_a.y - 0.2);
        m.scale.set(1.25 * scale, 1.5 * scale, 1.25 * scale);
        m.rotation.y = t * 1.5;
        // Kiểu `dome` chỉ sáng ở rìa nên cần độ đậm cao hơn lớp cộng sáng cũ; giữa khiên vẫn trong suốt.
        m.fxOpacity = (alpha / 0.28) * (0.85 + Math.sin(t * 6) * 0.15);
      },
      () => this.drop(m),
    );
  }

  /** Quả cầu tụ lực trước ngực khi niệm chú. */
  charge(pos: PosFn, dur: number, color: number, stillOn: () => boolean): void {
    const m = this.fx(G.ico1, color, 0.8);
    this.add(
      dur,
      (k) => {
        if (!pos(_a) || !stillOn()) {
          m.visible = false;
          return;
        }
        m.position.set(_a.x, _a.y + 0.9, _a.z);
        m.scale.setScalar(0.15 + k * 0.5 + Math.random() * 0.05);
      },
      () => this.drop(m),
    );
  }

  /**
   * Đặt một pháp trận (M4-3) nằm ngang ở độ cao `y`. Gốc vùng ở (x, z): tâm với hình tròn, mép
   * sau/đỉnh với chữ nhật/quạt, hướng theo `yaw`. `w`: bề rộng (chữ nhật) hoặc nửa góc (quạt).
   * Tiến độ đặt qua `m.fxA.x` (0..1); vạch tiến độ chạm mép là lúc nổ.
   */
  sigil(shape: SigilShape, x: number, z: number, yaw: number, r: number, w: number, color: number, y: number): FxMesh {
    const L = sigilLayout(shape, r, w);
    const m = this.fx(SIGIL_GEO, color, 0, 'sigil');
    m.position.set(x + Math.sin(yaw) * L.offset, y, z + Math.cos(yaw) * L.offset);
    m.rotation.y = yaw;
    m.scale.set(L.sx, 1, L.sz);
    m.fxA.set(0, shape, 0, Math.random() * 50);
    m.fxB.set(r, w, L.sx, L.sz);
    return m;
  }

  /** Pháp trận dưới chân người/quái đang niệm chú; tắt dần khi bị ngắt (`stillOn` sai). */
  castSigil(pos: PosFn, dur: number, color: number, radius: number, stillOn: () => boolean): void {
    const m = this.sigil(SIGIL_CIRCLE, 0, 0, 0, radius, 0, color, 0);
    m.visible = false;
    let t = 0;
    let fade = 0;
    this.add(
      dur + 0.3,
      (_k, dt) => {
        t += dt;
        if (!pos(_a)) {
          m.visible = false;
          return;
        }
        const on = t <= dur && stillOn();
        fade = on ? Math.min(1, fade + dt * 6) : Math.max(0, fade - dt * 5);
        m.visible = fade > 0;
        m.position.set(_a.x, groundAt(_a.x, _a.z) + 0.12, _a.z);
        m.fxA.x = Math.min(1, t / dur);
        m.fxOpacity = fade;
      },
      () => this.drop(m),
    );
  }

  /** Vùng nguy hiểm tròn báo trước trên mặt đất (pháp trận), rồi đánh xuống. */
  hazard(x: number, z: number, r: number, delay: number, kind: string, seed?: number, flash = 0): void {
    const y = groundAt(x, z);
    const color = HAZARD_COLORS[kind] ?? HAZARD_COLORS.frost;
    // Mặt đất không phẳng: nâng theo điểm cao nhất quanh vòng (giới hạn để không lơ lửng quá).
    let top = y;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      top = Math.max(top, groundAt(x + Math.cos(a) * r * 0.7, z + Math.sin(a) * r * 0.7));
    }
    const m = this.sigil(SIGIL_CIRCLE, x, z, 0, r, 0, color, Math.min(top, y + 1.2) + 0.22);
    this.add(
      delay,
      (k) => {
        m.fxA.x = k;
        m.fxOpacity = Math.min(1, k * 10);
      },
      () => {
        this.drop(m);
        if (kind === 'lightning') {
          this.lightning(x, y, z, 0xe2d4ff, 1.2, seed, flash);
        } else if (kind !== 'frost') {
          _a.set(x, y + 0.5, z);
          this.burst(_a, color, r * 1.1, 0.45);
        } else {
          _a.set(x, y + 0.5, z);
          this.burst(_a, 0xaee8ff, r * 0.9, 0.5);
          // Gai băng trồi lên.
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const rr = i === 0 ? 0 : r * 0.55;
            const spike = this.fx(G.cone6, 0xcdf3ff, 0.85, 'solid');
            const sx = x + Math.cos(a) * rr;
            const sz = z + Math.sin(a) * rr;
            const sy = groundAt(sx, sz);
            const hgt = 2.2 + Math.random() * 2;
            this.add(
              0.7,
              (k) => {
                const up = Math.min(1, k * 5);
                spike.position.set(sx, sy + (hgt * up) / 2 - 0.2, sz);
                spike.scale.set(0.5, hgt * up, 0.5);
                spike.fxOpacity = 0.85 * (1 - Math.max(0, k - 0.5) * 2);
              },
              () => this.drop(spike),
            );
          }
        }
      },
    );
  }

  /**
   * Mây kiếp xoáy (M4-4) trên đầu người độ kiếp: một đĩa xoắn ốc vẽ trong fragment, mắt bão tím ở
   * giữa, bừng sáng trong mây khi có tia sét đánh gần. `seed` (từ server) cho cùng vân mây.
   */
  tribulationCloud(pos: PosFn, dur: number, stillOn: () => boolean, seed?: number): void {
    // Hai tầng xoáy ngược chiều, tầng dưới nhỏ và thấp hơn: mây dày và có chiều sâu mà chỉ thêm 1 draw call.
    const layers = [
      { y: 48, scale: 125, spin: 0.06, op: 0.95, seedAdd: 0 },
      { y: 34, scale: 90, spin: -0.1, op: 0.8, seedAdd: 41 },
    ];
    for (const L of layers) {
      const cloud = this.fx(VORTEX_GEO, CLOUD_COLOR, 0, 'vortex');
      cloud.fxA.z = ((seedOr(seed) + L.seedAdd) % 997) / 10;
      this.clouds.add(cloud);
      let t = 0;
      let op = 0;
      this.add(
        dur + 1.5,
        (_k, dt) => {
          t += dt;
          cloud.fxA.y = Math.max(0, cloud.fxA.y - dt * 3);
          if (!pos(_a)) return;
          op = stillOn() ? Math.min(1, t / 2.5) : Math.max(0, op - dt);
          cloud.position.set(_a.x, _a.y + L.y, _a.z);
          cloud.scale.setScalar(L.scale);
          cloud.rotation.y = t * L.spin;
          cloud.fxOpacity = op * L.op;
        },
        () => {
          this.clouds.delete(cloud);
          this.drop(cloud);
        },
      );
    }
  }

  dispose(): void {
    // end() có thể đẻ hiệu ứng nối tiếp (phi kiếm → nổ); rút tới khi rỗng để mọi lưới về pool.
    for (let f = this.items.pop(); f; f = this.items.pop()) f.end();
    for (const ink of this.inks) this.drop(ink.m);
    this.inks.length = 0;
    this.bolts.clear();
    this.trails.dispose();
    RAIN.clear();
    PARTICLES.detach();
    RAIN.group.removeFromParent();
    this.clouds.clear();
    this.group.removeFromParent();
  }
}

/** Số sát thương bay lên, vẽ bằng DOM. */
export class DamageNumbers {
  private items: { el: HTMLDivElement; pos: THREE.Vector3; t: number; dx: number }[] = [];
  private pool: HTMLDivElement[] = [];
  constructor(private layer: HTMLElement) {}

  spawn(text: string, pos: THREE.Vector3, cls: string): void {
    if (this.items.length > 40) return;
    const el = this.pool.pop() ?? document.createElement('div');
    el.className = 'dmg ' + cls;
    el.textContent = text;
    this.layer.appendChild(el);
    this.items.push({ el, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 40 });
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / 0.95;
      if (k >= 1) {
        it.el.remove();
        this.pool.push(it.el);
        this.items.splice(i, 1);
        continue;
      }
      _a.copy(it.pos).project(camera);
      if (_a.z > 1) {
        it.el.style.opacity = '0';
        continue;
      }
      const x = (_a.x * 0.5 + 0.5) * w + it.dx * k;
      const y = (-_a.y * 0.5 + 0.5) * h - k * 60;
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(1.25 - k * 0.3).toFixed(2)})`;
      it.el.style.opacity = String(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }
  }

  clear(): void {
    for (const it of this.items) it.el.remove();
    this.items.length = 0;
  }
}
