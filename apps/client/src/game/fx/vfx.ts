import * as THREE from 'three/webgpu';
import { groundAt } from '../../base/levelCtx';
import { FxBatcher } from '../../render/materials/fxBatch';
import { BATCHING, BATCH_KINDS, type FxKind, type FxMesh } from '../../render/materials/vfx';
import { SIGIL_CIRCLE, SIGIL_GEO, sigilLayout, type SigilShape } from '../../render/vfx/sigil';
import { SLASH_GEO, SLASH_INK, slashPhase } from '../../render/vfx/slash';
import { seedOr } from '../../render/vfx/common';
import { boltPhase, boltShape } from '../../render/vfx/lightning';
import { INK_ALPHA, INK_DEATH, INK_HIT, INK_POOL, inkEvict, inkPhase, type InkTiming } from '../../render/vfx/ink';
import { type LootTier } from '../../render/vfx/loot';
import { PARTICLES } from '../../render/vfx/particles';
import { QUAD_XZ, shapeGeometry, shapeKind, type ShapeKey } from '../../render/vfx/fxShapes';
import { DECAL_STRIKE } from '../../render/vfx/stylized';
import { maxRadiusFor } from '../../render/vfx/phases';
import { BoltFx, HALO_GEO, SHADOW_GEO } from '../../render/vfx/projectile';
import { Trails } from '../../render/vfx/trail';
import { assets } from '../core/assets';
import { PREFETCH_PRIORITY } from '../core/preload';
import { G } from '../core/geo';
import { type Box } from '../core/screenFit';
import { FLAGS } from '../../base/flags';
import { BOLTS, Fx, InkMark, POOL, PosFn, RAIN, RING_GEO, SLASH_CENTER, STRIKE_POOL_MAX, TUBE_GEO, UP, _a, _b, _c, _q, orientSlash, takeBolt } from './vfxParts/common';
import { hazard, trailPool, venomPool } from './vfxParts/hazard';
import { goldDrop, lootDrop } from './vfxParts/loot';
import { ascendGlow, danTran, kdStele, mirrorDisc, mirrorPillar, reviveGlow, soulOut, tamMaAura, thanNiem, tribulationCloud } from './vfxParts/scenes';
export { HAZARD_COLORS } from './vfxParts/common';

let rainModel: Promise<void> | null = null;

export class Vfx {
  group = new THREE.Group();
  readonly pool = POOL;
  /** Gộp draw call các kiểu trong `BATCH_KINDS` thành InstancedMesh (K-6). */
  readonly batch = new FxBatcher(POOL);
  /** Camera để dấu chém đứng quay mặt về người xem (engine gán). */
  camera: THREE.Camera | null = null;
  /** Số đồ rơi đang có cột sáng (hạ nhiều quái một lượt): cột, vòng, lõi cộng sáng chồng nhau thành mảng trắng lóa nên mỗi cái mờ theo số lượng (`lootCrowd`). */
  lootActive = 0;
  /** Vùng báo trước hình tròn đang sống (tâm, bán kính): vùng chồng lên nhau thì mờ bớt (`hazardStack`). */
  hazards: { x: number; z: number; r: number }[] = [];
  items: Fx[] = [];
  /** Vệt phi kiếm, linh quang khi cầm kiếm, bụi chân (M4-5). Engine gọi `trails.update` mỗi khung. */
  readonly trails: Trails;
  readonly particles = PARTICLES;
  readonly rain = RAIN;
  /** Đạn đánh xa của quái (D1): engine gọi `bolts.spawn/end` theo S.BOLT/S.BOLT_END. */
  readonly bolts: BoltFx;
  /** Chớp toàn cảnh (engine nối vào `PostPipeline.flash`, uniform `uFlash`). */
  onFlash: ((amount: number) => void) | null = null;
  /** Mây kiếp đang hiện: tia sét đánh gần thì bừng sáng trong mây. */
  clouds = new Set<FxMesh>();
  /** Số vũng sét (decal `strike`) đang sống: lôi võng độ kiếp đánh nhiều tia cùng lúc nên chặn trần. */
  strikePools = 0;
  /** Vết mực trên đất (giới hạn MAX_INK); hai mảng phụ dùng lại khi chọn vết phải tan sớm. */
  inks: InkMark[] = [];
  inkAges: number[] = [];
  inkForced: boolean[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.group.add(this.batch.root);
    PARTICLES.attach(this.group);
    this.group.add(RAIN.group);
    this.trails = new Trails(this, PARTICLES);
    this.bolts = new BoltFx(this);
    // Vẽ ấm các material mới (mưa kiếm, tia sét, mây kiếp, vệt kiếm) vài khung lúc đang tải: biên dịch
    // shader trước, lần dùng đầu không bị khựng. Độ trong 0, cỡ 0: không thấy gì.
    RAIN.prewarm();
    this.warmKinds();
    this.warmBatches();
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

  /** Vẽ ấm một lưới cho mỗi kiểu material (cỡ 0, độ trong 0). */
  warmKinds(): void {
    for (const kind of ['bolt', 'vortex', 'trail', 'beam', 'inkpool', 'dome', 'glow', 'flat', 'solid', 'slash', 'ink', 'sigil', 'toon', 'crystal', 'burst', 'decal', 'card', 'wind'] as const) {
      const m = this.fx(G.ico1, 0xffffff, 0, kind);
      m.scale.setScalar(1e-3);
      this.add(0.15, () => {}, () => this.drop(m));
    }
  }

  /** Vẽ ấm lại sau khi đổi level: môi trường (đèn, sương) mới làm khóa cache shader của mọi lưới đổi, nên nhóm đã ấm ở level cũ phải biên dịch lại. */
  rewarm(): void {
    this.warmKinds();
    this.warmBatches();
  }

  /**
   * Vẽ ấm các nhóm gộp THẬT (kiểu × hình × renderOrder), V6: three đặt `uuid` vào khóa cache của mọi InstancedMesh nên mỗi nhóm
   * dựng lại node và biên dịch shader ở lần vẽ đầu; không làm ấm thì khung đầu của mỗi chiêu mới giữa trận khựng 40–90 ms
   * (đo ở `bench:crowd`: 9–15 nhóm mới mỗi lượt, `fxBuckets`). Rải ba nhóm mỗi 0,12 s lúc đang tải để không dồn vào một khung.
   */
  warmBatches(): void {
    // `?vfxwarm=0` tắt (so ảnh/số đo trước-sau).
    if (!FLAGS.vfxWarm) return;
    const list: [FxKind, THREE.BufferGeometry, number][] = [
      ['glow', G.octa, 0],
      ['glow', G.sphere, 0],
      ['glow', RING_GEO, 0],
      ['flat', RING_GEO, 0],
      ['dome', G.dome, 0],
      ['inkpool', SIGIL_GEO, -2],
      ['decal', QUAD_XZ, -3],
      ['glow', HALO_GEO, 0],
      ['flat', SHADOW_GEO, 0],
      ['solid', G.cone6, 0],
    ];
    const shapes: ShapeKey[] = ['crescent', 'spike', 'shard', 'kite', 'ripple', 'burst', 'smoke', 'helix', 'dragon', 'statue', 'card', 'ribbon'];
    for (const s of shapes) {
      const kind = shapeKind(s);
      const order = kind === 'decal' ? -1 : kind === 'crystal' ? 1 : 0;
      list.push([kind, shapeGeometry(s), order]);
      if (kind === 'toon') list.push([kind, shapeGeometry(s), -2]);
    }
    const seen = new Set<string>();
    let n = 0;
    for (const [kind, geo, order] of list) {
      const key = `${kind}|${geo.uuid}|${order}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const at = 0.2 + Math.floor(n++ / 3) * 0.12;
      this.add(at, () => {}, () => {
        const m = this.fx(geo, 0xffffff, 0, kind);
        m.renderOrder = order;
        m.scale.setScalar(1e-3);
        this.add(0.15, () => {}, () => this.drop(m));
      });
    }
  }

  add(dur: number, update: (k: number, dt: number) => void, end: () => void): void {
    this.items.push({ t: 0, dur, update, end });
  }

  /** Cho module hiệu ứng bên ngoài (telegraph.ts) chạy theo cùng vòng cập nhật. */
  track(dur: number, update: (k: number, dt: number) => void, end: () => void): void {
    this.add(dur, update, end);
  }

  /** Lấy một lưới từ pool và gắn vào cảnh. `kind`: xem `FxKind` (mặc định cộng sáng có bloom). */
  fx(geo: THREE.BufferGeometry, color: number, opacity = 0.9, kind: FxKind = 'glow'): FxMesh {
    const m = POOL.acquire(geo, kind, color, opacity);
    // Kiểu gộp chỉ là tay cầm: FxBatcher vẽ chúng bằng InstancedMesh.
    if (!BATCHING || !BATCH_KINDS.has(kind)) this.group.add(m);
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
    this.batch.flush();
  }

  /** Vụ nổ sáng nhỏ tại một điểm. */
  burst(pos: THREE.Vector3, color: number, size = 1.2, dur = 0.28, alpha = 0.9): void {
    // Không che quá 25% màn hình (K-6): vòng chấn động tối đa 2,7 × size, nên size bị chặn theo khoảng cách camera.
    const cam = this.camera as THREE.PerspectiveCamera | null;
    if (cam?.isPerspectiveCamera) size = Math.max(0.15, Math.min(size, maxRadiusFor(cam.position.distanceTo(pos), cam.fov, cam.aspect) / 2.7));
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
        m.fxOpacity = alpha * (1 - k);
        ring.scale.setScalar(size * (0.5 + k * 2.2));
        ring.fxOpacity = Math.min(0.8, alpha * 0.9) * (1 - k);
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
  slashPair(color: number, ink: boolean): [FxMesh, FxMesh | null] {
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
  lightning(x: number, y: number, z: number, color = 0xd6c4ff, scale = 1, seed?: number, flash = 0, thick = 1): void {
    const sd = seedOr(seed);
    const bolt = takeBolt();
    boltShape(sd, 62, 7, scale * thick, bolt.shape);
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

  /**
   * Vũng sáng + tia chớp tỏa + vòng xung kích trên đất chỗ sét đánh (decal `strike`, kỹ thuật Storm & Wind CC BY, xem `decalNodes`).
   * Sống 0,6 s, tối đa `STRIKE_POOL_MAX` (2) cái cùng lúc (quá thì bỏ, tia vẫn vẽ).
   */
  strikePool(x: number, y: number, z: number, color: number, scale: number): void {
    if (this.strikePools >= STRIKE_POOL_MAX) return;
    this.strikePools++;
    const m = this.fx(QUAD_XZ, color, 0.7, 'decal');
    m.fxA.z = (x * 7.13 + z * 3.71) % 40;
    m.fxA.w = DECAL_STRIKE;
    m.fxB.set(1, 0.97, 1, 0);
    m.renderOrder = -3;
    m.position.set(x, y + 0.14, z);
    m.scale.setScalar(3.2 * scale);
    this.add(
      0.6,
      (k) => {
        m.fxA.x = Math.min(1, k / 0.35);
        m.fxA.y = 0;
        m.fxK = Math.max(0, 1 - k * 1.15);
      },
      () => {
        this.drop(m);
        this.strikePools--;
      },
    );
  }

  strike(x: number, y: number, z: number, color: number, scale: number, flash: number): void {
    if (flash > 0) this.onFlash?.(flash);
    this.strikePool(x, y, z, color, scale);
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
    return lootDrop(this, from, tier, slot, onLand, onCollect, color);
  }

  /** Đồng tiền nảy ra từ xác rồi lóe lên và tan (vàng đã vào túi; không cột sáng, không bay vào túi). */
  goldDrop(from: THREE.Vector3): void {
    return goldDrop(this, from);
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

  updateInk(dt: number): void {
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
  ascendGlow(pos: PosFn, dur = 2.6, danQuang = false, nguyenAnh = false, hoaThan = false): void {
    return ascendGlow(this, pos, dur, danQuang, nguyenAnh, hoaThan);
  }

  /**
   * Hồi sinh (P2-B5): linh quang xanh ngọc nhạt dâng quanh người: ống sáng mảnh, hai vành sóng nối nhau và một vòng
   * hạt linh khí xoáy bay lên. Cộng sáng, mảnh, để lộ màu cảnh khi mực đang rút. 3 + 10 lưới trong ~2,4 giây.
   */
  reviveGlow(pos: PosFn, dur = 2.4): void {
    return reviveGlow(this, pos, dur);
  }

  /** Lớp linh khí hộ thể bao quanh người. */
  shield(pos: PosFn, dur: number, stillOn: () => boolean, color = 0x7fd8ff, scale = 1, alpha = 0.28): void {
    const m = this.fx(G.dome, color, alpha, 'dome');
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

  /**
   * Đan Trận (E2-D, Đan Hỏa Kiếp): vòng pháp trận lam đậm nằm dưới chân người độ kiếp, vành tiến độ chạy theo thanh ngưng đan,
   * một viên đan nhỏ lơ lửng giữa vòng lớn dần và ngả sang vàng ấm khi đầy. Tông trầm, mảnh, cộng sáng thấp để không che người.
   * Trả tay cầm: `set(pg)` cập nhật tiến độ 0..100, `stop()` khép vòng. Tự khép khi `stillOn()` sai (hết kiếp, chết).
   */
  danTran(x: number, z: number, r: number, dur: number, stillOn: () => boolean): { set(pg: number): void; stop(): void } {
    return danTran(this, x, z, r, dur, stillOn);
  }

  /**
   * Năm Trấn Giới Bia của Nhật Thực Kiếp (Anh Biến): cột sáng mảnh ở ngũ giác bán kính `ring` quanh (cx, cz), cùng thứ tự `tribSealPos` ở server.
   * Bia chưa sáng là cột tím sẫm mờ; bia sáng ngả vàng nhật thực, cao hơn, có vành dưới chân. Tông trầm, cộng sáng thấp (đỉnh dưới `FX_MAX_HDR`).
   * `set(mask)` cập nhật bia sáng (bit i = bia i); `stop()` hoặc `stillOn()` sai thì tắt dần.
   */
  steleRing(cx: number, cz: number, ring: number, stillOn: () => boolean): { set(mask: number): void; stop(): void } {
    const cols: FxMesh[] = [];
    const rings: FxMesh[] = [];
    const pos: { x: number; z: number; y: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const x = cx + Math.sin(a) * ring;
      const z = cz + Math.cos(a) * ring;
      pos.push({ x, z, y: groundAt(x, z) });
      cols.push(this.fx(G.ico1, 0x6a4a9a, 0.3));
      const r = this.fx(RING_GEO, 0xffd27a, 0.3);
      r.rotation.x = -Math.PI / 2;
      rings.push(r);
    }
    let mask = 0;
    let t = 0;
    let fade = 0;
    let stopping = false;
    const lit = [0, 0, 0, 0, 0];
    const it = {
      t: 0,
      dur: 400,
      update: (_k: number, dt: number) => {
        t += dt;
        const on = !stopping && stillOn();
        fade = on ? Math.min(1, fade + dt * 2) : Math.max(0, fade - dt * 2);
        if (!on && fade <= 0) it.t = it.dur;
        for (let i = 0; i < 5; i++) {
          const target = mask & (1 << i) ? 1 : 0;
          lit[i] += (target - lit[i]) * Math.min(1, dt * 5);
          const k = lit[i];
          const h = 3.5 + 7 * k;
          const pulse = 1 + Math.sin(t * 2.2 + i) * 0.05 * k;
          cols[i].position.set(pos[i].x, pos[i].y + h * 0.5, pos[i].z);
          cols[i].scale.set(0.3 + 0.4 * k, h * pulse, 0.3 + 0.4 * k);
          cols[i].fxColor.setHex(k > 0.5 ? 0xffd27a : 0x6a4a9a);
          cols[i].fxOpacity = (0.18 + 0.55 * k) * fade;
          rings[i].position.set(pos[i].x, pos[i].y + 0.12, pos[i].z);
          rings[i].scale.setScalar(1.6 + 0.4 * Math.sin(t * 2 + i));
          rings[i].fxOpacity = 0.55 * k * fade;
        }
      },
      end: () => {
        for (const m of [...cols, ...rings]) this.drop(m);
      },
    };
    this.items.push(it);
    return {
      set: (m) => {
        mask = m;
      },
      stop: () => {
        stopping = true;
      },
    };
  }

  /**
   * Vết nứt Giới Khích bị hàn (Nhật Thực Kiếp): một vệt tím cao ở (x, z) khép dần trong `dur` giây, cuối cùng một chớp vàng nhạt khi tia cuối đánh vào.
   * `close` = true (đủ bia): khép lại; false: chỉ phập phồng rồi tan.
   */
  riftVein(x: number, z: number, r: number, dur: number, close: boolean): void {
    const y = groundAt(x, z);
    const vein = this.fx(G.ico1, 0xb48cff, 0.5);
    const base = this.fx(RING_GEO, 0xcfa8ff, 0.4);
    base.rotation.x = -Math.PI / 2;
    let t = 0;
    const it = {
      t: 0,
      dur: dur + 1.2,
      update: (_k: number, dt: number) => {
        t += dt;
        const k = Math.min(1, t / dur);
        const open = close ? 1 - k : 1;
        vein.position.set(x, y + 4.5, z);
        vein.scale.set(0.35 * (0.3 + open), 9 * (0.4 + 0.6 * open), 0.35 * (0.3 + open));
        vein.fxOpacity = (0.55 + 0.1 * Math.sin(t * 9)) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) * 2));
        base.position.set(x, y + 0.14, z);
        base.scale.setScalar(r * (0.5 + 0.5 * k));
        base.fxOpacity = 0.45 * (t < dur ? k : Math.max(0, 1 - (t - dur) * 2));
      },
      end: () => {
        this.burst(new THREE.Vector3(x, y + 1.2, z), 0xffe3a8, 2.2, 0.5);
        this.drop(vein);
        this.drop(base);
      },
    };
    this.items.push(it);
  }

  /**
   * Đĩa gương (E3-M, Kính Nguyệt Chân Quân): `n` tia dài `len` rộng `w` xoay quanh (x, z) từ góc `theta0` (rad) với tốc độ `spin`
   * độ/giây, theo CÙNG công thức server (`discAngle`: góc 0 hướng +z). `warn` giây đầu tia mờ và chưa gây sát thương (vạch tụ dần), sau
   * đó sáng lên; một vành đĩa mờ nằm dưới chân. Cộng sáng thấp, sắc lam bạc để không che nhân vật. Tự tắt khi hết giờ hoặc `stillOn()` sai.
   */
  mirrorDisc(x: number, z: number, len: number, w: number, n: number, theta0: number, spin: number, warn: number, dur: number, stillOn: () => boolean): void {
    return mirrorDisc(this, x, z, len, w, n, theta0, spin, warn, dur, stillOn);
  }

  /**
   * Cột gương của đợt đố (E3-M): ống sáng mảnh ở (x, z) tới khi hết `dur` giây hoặc `stillOn()` sai; `lit` thì sáng hơn
   * (đã chạm đúng). Màu theo thứ tự cột (lam, đỏ, vàng).
   */
  mirrorPillar(x: number, z: number, color: number, dur: number, lit: boolean, stillOn: () => boolean): void {
    return mirrorPillar(this, x, z, color, dur, lit, stillOn);
  }

  /**
   * Bia Kim dạ (DV-3E): vòng kim dát quanh bia (bán kính `r` = ranh vòng sáng trên server) và cột sáng mảnh; `lit` thì vàng sáng, tắt thì tím thẫm
   * mờ. Tự khép khi hết `dur` giây hoặc `stillOn()` sai (server gửi lại mỗi 2 s nên đổi sáng/tắt thay hình ngay). Cường độ thấp để không che người.
   */
  kdStele(x: number, z: number, r: number, dur: number, lit: boolean, stillOn: () => boolean): void {
    return kdStele(this, x, z, r, dur, lit, stillOn);
  }

  /**
   * Nguyên anh xuất khiếu (E3-L): một bóng người nhỏ xanh nhạt trong suốt lơ lửng phía trên thân, nối với thân bằng một sợi sáng mảnh.
   * Tông trầm, mờ, cộng sáng thấp để không che nhân vật. Tự khép khi `on()` sai hoặc hết `dur`; `stop()` khép sớm.
   */
  soulOut(pos: PosFn, dur: number, on: () => boolean): { stop(): void } {
    return soulOut(this, pos, dur, on);
  }

  /**
   * Thế thân thần niệm (E4-D): bóng người vàng sao nhạt trong suốt đứng yên ở (x, z) trong `dur` giây, vòng sao nhạt dưới chân, vài hạt sao bay lên.
   * `end(boom)` thu lại (boom = nổ ra một chớp khi gánh đòn). Cộng sáng, mờ, dưới trần HDR.
   */
  thanNiem(x: number, z: number, groundY: number, dur: number, on: () => boolean): { stop(boom?: boolean): void } {
    return thanNiem(this, x, z, groundY, dur, on);
  }

  /**
   * Quầng nhận diện Tâm Ma Ảnh (E3-L): vành tím dưới chân bóng + vành đỏ sẫm nở nhịp + một sợi khói tím mảnh bốc lên theo dáng bóng,
   * để thấy rõ bản sao tối màu của người chơi ngay cả khi nhìn từ xa/trên cao. Tông trầm, mảnh, mờ dần ở mép; không lóa.
   * `at(out)` trả vị trí chân bóng (false = chưa có); tự khép khi `on()` sai.
   */
  tamMaAura(at: (out: THREE.Vector3) => boolean, on: () => boolean): void {
    return tamMaAura(this, at, on);
  }

  /**
   * Vũng độc khi quái chết (E3-G): vạch báo tròn `delay` giây (như vùng nguy hiểm), rồi vũng ngọc lục nhấp nháy `dur` giây.
   * Chỉ vẽ: ai đứng trong vũng chịu sát thương nhỏ mỗi nhịp là việc của server.
   */
  venomPool(x: number, z: number, r: number, delay: number, dur: number, kind: string): void {
    return venomPool(this, x, z, r, delay, dur, kind);
  }

  /**
   * Vệt lửa (một vũng của chuỗi dọc đường chém, DV-2 đợt 4): hiện lúc vạch nổ, tồn tại `dur` giây rồi tắt dần, nhấp nháy ngọn lửa.
   * Không có vòng báo riêng (vạch chữ nhật của đường chém đã báo). Chỉ vẽ: ai đứng trong vệt chịu sát thương dần là việc của server.
   */
  trailPool(x: number, z: number, r: number, delay: number, dur: number): void {
    return trailPool(this, x, z, r, delay, dur);
  }

  /** Vùng nguy hiểm tròn báo trước trên mặt đất (pháp trận), rồi đánh xuống. */
  hazard(x: number, z: number, r: number, delay: number, kind: string, seed?: number, flash = 0, boss = false, hot = false, quiet?: () => boolean): void {
    return hazard(this, x, z, r, delay, kind, seed, flash, boss, hot, quiet);
  }

  /**
   * Mây kiếp xoáy (M4-4) trên đầu người độ kiếp: một đĩa xoắn ốc vẽ trong fragment, mắt bão tím ở
   * giữa, bừng sáng trong mây khi có tia sét đánh gần. `seed` (từ server) cho cùng vân mây.
   */
  tribulationCloud(pos: PosFn, dur: number, stillOn: () => boolean, seed?: number): void {
    return tribulationCloud(this, pos, dur, stillOn, seed);
  }

  dispose(): void {
    // end() có thể đẻ hiệu ứng nối tiếp (phi kiếm → nổ); rút tới khi rỗng để mọi lưới về pool.
    for (let f = this.items.pop(); f; f = this.items.pop()) f.end();
    for (const ink of this.inks) this.drop(ink.m);
    this.inks.length = 0;
    this.bolts.clear();
    this.trails.dispose();
    this.batch.dispose();
    RAIN.clear();
    PARTICLES.detach();
    RAIN.group.removeFromParent();
    this.clouds.clear();
    this.group.removeFromParent();
  }
}

/** Số sát thương bay lên, vẽ bằng DOM. */
export class DamageNumbers {
  items: { el: HTMLDivElement; pos: THREE.Vector3; t: number; dx: number; lift: number | null }[] = [];
  pool: HTMLDivElement[] = [];
  constructor(private layer: HTMLElement) {}

  spawn(text: string, pos: THREE.Vector3, cls: string): void {
    if (this.items.length > 40) return;
    const el = this.pool.pop() ?? document.createElement('div');
    el.className = 'dmg ' + cls;
    el.textContent = text;
    this.layer.appendChild(el);
    this.items.push({ el, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 40, lift: null });
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number, avoid: readonly Box[] = []): void {
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
      const y0 = (-_a.y * 0.5 + 0.5) * h;
      // Số mới sinh nằm trong hộp tên thì nhấc lên trên hộp đó một lần (không nhảy lúc đang bay).
      if (it.lift === null) {
        it.lift = 0;
        for (const b of avoid) {
          if (Math.abs(x - b.x) < b.hw + 26 && Math.abs(y0 - b.y) < b.hh + 14) it.lift = Math.max(it.lift, y0 - (b.y - b.hh - 16));
        }
      }
      const y = y0 - it.lift - k * 60;
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(1.25 - k * 0.3).toFixed(2)})`;
      it.el.style.opacity = String(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }
  }

  clear(): void {
    for (const it of this.items) it.el.remove();
    this.items.length = 0;
  }
}
