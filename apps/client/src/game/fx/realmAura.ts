// Hào quang cảnh giới trên nhân vật 3D ngoài thế giới (RFX-1). Chỉ là lớp hình theo `lv` + công pháp `mt` server đã đồng bộ
// (mình và người khác đều thấy); không đọc/ghi luật chơi. Mỗi tầng một màu chủ đạo, các bậc cộng dồn:
//   Kết Đan (vàng)      : kim đan cầu sáng ở bụng chớp theo nhịp + tia linh khí vàng xoáy ốc lên + hạt vàng.
//   Nguyên Anh (vàng-ngọc): Nguyên Anh nhỏ ngồi thiền trên đầu, vòng ngũ hành 5 màu xoay; Kiếm tu 9 thanh kiếm thật (lưỡi + chắn + chuôi, có vệt sáng)
//                         xếp vòng đều, Hộ pháp trận đồ + khiên, Đan sư sen lửa; nhân vật nhấc khỏi đất ~0,2 m trên đài mây + sen.
//   Hóa Thần (xanh đêm-bạc): rim light bạc trên chính nhân vật (emissive fresnel gắn vào vật liệu); pháp tướng là TRANH VẼ TAY của Thiên Giải
//                         (Kiếm long ngọc / Huyền vũ / Chu tước, atlas `render/vfx/art.ts`, kind `art`) làm billboard lớn sau lưng: mờ nhẹ khi đứng yên,
//                         BÙNG rõ + phình khi ra chiêu lớn, mờ dần ở viền, gợn sóng sáng; phù văn đạo luật xoay ngang lưng khi đứng yên.
//   Ảnh Biến (đen-vàng-tím): vũng + sương mực đen-vàng quanh chân, tia sét tím-vàng chạy quanh thân, 4 phân thân = bản sao mesh nhân vật với vật liệu bóng mờ.
// Mọi lưới đi qua `FxPool` kiểu gộp (`crystal`/`solid`/`glow`/`dome`/`decal`/`toon`/`card`: cả đám đông dùng chung vài draw call) và hạt GPU dùng chung
// (`PARTICLES`, không tốn draw call). Lớp thân dùng hòa trộn thường (đọc được trên nền sáng ban ngày) cộng lớp cộng sáng + bloom.
import * as THREE from 'three/webgpu';
import { SKILL } from '@dtl/content';
import { float, normalView, positionViewDirection, uniform, vec3 } from 'three/tsl';
import type { FxQuality } from '@dtl/shared';
import type { FxKind, FxMesh } from '../../render/materials/vfx';
import { shapeGeometry, swordFxGeometry, QUAD_XZ } from '../../render/vfx/fxShapes';
import { DECAL_RUNE } from '../../render/vfx/stylized';
import { G } from '../core/geo';
import { groundAt } from '../../base/levelCtx';
import type { CharacterView, SkillEvent } from '../character/view';
import { OTHERS_FX_DIST } from './fxBudget';
import type { Vfx } from './vfx';
import {
  auraCaps,
  auraStage,
  danBeat,
  danGlowVisibility,
  daoOf,
  haloVisibility,
  isCalm,
  PHANTOM_DUR,
  qualityTier,
  summonsPhantom,
  swordCount,
  type AuraCaps,
  type AuraDao,
  type AuraStage,
} from './realmAuraRules';

/** Người chơi như hào quang cần đọc (khớp `PlayerVis`). */
export interface AuraActor {
  sid: string;
  yaw: number;
  fl: number;
  lv: number;
  speed: number;
  /** Vị trí hiển thị đã tính giật lùi (root của model). Hào quang nhấc `y` của root (Nguyên Anh trở lên). */
  model: { root: THREE.Object3D };
  /** Công pháp đang tu. */
  mt: string;
}

export interface RealmAuraEnv {
  players(): Iterable<AuraActor>;
  mySid(): string;
  camera(): THREE.Camera;
  /** Nơi đặt phân thân (cảnh). */
  parent(): THREE.Object3D;
  /** Bản sao mesh nhân vật `sid` với vật liệu bóng mờ (null nếu asset chưa nạp). */
  makeShadow(sid: string): CharacterView | null;
  /** Preset đồ họa chung (`get().quality`). */
  gfxQuality(): string;
  fxQuality(): FxQuality;
  /** Công tắc trong Cài đặt. */
  enabled(): boolean;
}

/** Số người khác gần nhất được vẽ hào quang, theo bậc chất lượng (Thấp tắt hẳn). */
export const OTHERS_MAX = [0, 4, 8] as const;
/** Độ nhấc người khỏi đất khi Nguyên Anh trở lên (m). */
export const LIFT = 0.2;
/** Số phân thân Ảnh Biến (3–5). */
const CLONES = 3;

/** Cùng `renderOrder` với các nhóm gộp đã vẽ ấm ở `Vfx.warmBatches` (nhóm khác thì biên dịch shader ở lần vẽ đầu). */
const CRYSTAL_ORDER = 1;
const DECAL_ORDER = -1;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _col = new THREE.Color();
const AX_Z = new THREE.Vector3(0, 0, 1);
const AX_Y = new THREE.Vector3(0, 1, 0);
const UPRIGHT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** Bảng màu theo tầng (sRGB hex): thân, viền sáng. */
const GOLD = { body: 0xe8a424, rim: 0xfff0b0, core: 0xffc83a };
const JADE = { body: 0x1fae7c, rim: 0xc8ffe8 };
const SILVER = { body: 0x2a4fa8, rim: 0xe6efff, glow: 0xcfe0ff };
const VIOLET = { body: 0x8a52f0, rim: 0xffe27a };
const INK = { body: 0x15110a, rim: 0x6a4a1a };
/** Rim light theo tầng (Nguyên Anh vàng-ngọc, Hóa Thần bạc xanh, Ảnh Biến tím) và độ mạnh gốc. */
const RIM = { 2: { hex: 0xffd98a, k: 0.8 }, 3: { hex: 0xbfd6ff, k: 1.8 }, 4: { hex: 0xc9a4ff, k: 1.8 } } as const;
const WUXING = [0xf4ecd0, 0x4fd16a, 0x3a8cf0, 0xf0502a, 0xe3b43a];

/** Màu theo đạo (phi kiếm, hạt linh khí, viền tranh pháp tướng). */
const DAO_LOOK: Record<AuraDao, { body: number; rim: number; mote: number; art: number; artRim: number }> = {
  kiem: { body: 0x2cc7dc, rim: 0xf2fdff, mote: 0x9fe2f0, art: 0, artRim: 0xa6e8ff },
  ho: { body: 0xe39a2c, rim: 0xfff0c2, mote: 0xffc95a, art: 1, artRim: 0xffdc8a },
  dan: { body: 0xe4452f, rim: 0xffd9a0, mote: 0x8ff0b0, art: 2, artRim: 0xffb98a },
};

// ---- Rim light lên chính nhân vật: emissive fresnel cộng vào vật liệu node của model, cường độ/màu theo `mesh.userData.rimCol` (đọc mỗi lần vẽ
// từng mesh nên vật liệu dùng chung giữa nhiều người vẫn sáng đúng người). Không có rimCol thì đen: không đổi gì. Vá một lần mỗi vật liệu.
const NO_RIM = new THREE.Color(0, 0, 0);
const uRim = uniform(new THREE.Color()).onObjectUpdate(({ object }) => (object?.userData.rimCol as THREE.Color | undefined) ?? NO_RIM);
const rimPatched = new WeakSet<THREE.Material>();

function patchRim(mat: THREE.Material): void {
  const m = mat as THREE.MeshStandardNodeMaterial;
  if (!m.isNodeMaterial || rimPatched.has(mat)) return;
  rimPatched.add(mat);
  const fres = float(1).sub(normalView.dot(positionViewDirection).clamp(0, 1)).pow(2.4);
  const rim = vec3(uRim).mul(fres);
  m.emissiveNode = m.emissiveNode ? (m.emissiveNode as unknown as { add(x: unknown): THREE.Node }).add(rim) : rim;
  m.needsUpdate = true;
}

const _idle = { speed: 0, flying: false, sky: false, meditating: false, dead: false, casting: false, airborne: false };

const hashStr = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};

/** Trạng thái mỗi khung truyền cho các hàm cập nhật từng phần. */
interface Ctx {
  p: THREE.Vector3;
  /** Độ cao nền (chưa nhấc) và độ nhấc hiện tại. */
  y0: number;
  lift: number;
  t: number;
  dt: number;
  fx: number;
  fz: number;
  yaw: number;
  /** Hướng "ra sau lưng" nhìn từ camera (chuẩn hóa trên mặt đất). */
  dx: number;
  dz: number;
  camQ: THREE.Quaternion;
  vh: number;
  vDan: number;
  vCalm: number;
  /** 1 → 0 trong `PHANTOM_DUR` giây sau khi ra chiêu lớn. */
  pulse: number;
  beat: number;
}

interface Aura {
  sid: string;
  key: string;
  seed: number;
  handles: FxMesh[];
  ups: ((c: Ctx) => void)[];
  vHalo: number;
  vDan: number;
  vCalm: number;
  lift: number;
  beatPrev: number;
  acc: number;
  /** Mốc nhấp nháy tia sét (giây). */
  flick: number;
  /** Rim light: màu hiện tại, các mesh đã gắn và nơi lấy mesh. */
  rimCol: THREE.Color;
  rimMeshes: THREE.Mesh[];
  rimRoot: THREE.Object3D | null;
  rimAt: number;
  /** Phân thân (Ảnh Biến). */
  clones: CharacterView[];
  cloneAt: number;
}

export class RealmAuraFx {
  private auras = new Map<string, Aura>();
  private clock = 0;
  private recount = 0;
  private allowed = new Set<string>();
  private seen = new Set<string>();
  private lastCast = new Map<string, number>();
  /** Mốc (đồng hồ aura) ra chiêu lớn gần nhất của từng người. */
  private bigAt = new Map<string, number>();
  private ctx = {} as Ctx;

  constructor(
    private v: Vfx,
    private env: RealmAuraEnv,
  ) {}

  /** Nghe sự kiện chiêu: ghi mốc chiến đấu và bùng pháp tướng khi ra chiêu lớn ở Hóa Thần+ (người chơi ở preset cho phép). */
  handle(sid: string, e: SkillEvent): void {
    if (e.kind === 'windup') this.lastCast.set(sid, this.clock);
    if (e.kind !== 'windup' || !this.env.enabled()) return;
    const a = this.actor(sid);
    if (!a) return;
    const tier = qualityTier(this.env.gfxQuality(), this.env.fxQuality());
    if (!auraCaps(tier, sid === this.env.mySid()).phantom) return;
    if (summonsPhantom(SKILL.get(e.skill), a.lv)) this.bigAt.set(sid, this.clock);
  }

  private actor(sid: string): AuraActor | undefined {
    for (const a of this.env.players()) if (a.sid === sid) return a;
    return undefined;
  }

  update(dt: number): void {
    this.clock += dt;
    const on = this.env.enabled();
    const tier = qualityTier(this.env.gfxQuality(), this.env.fxQuality());
    if (on) this.refreshAllowed(tier);
    const seen = this.seen;
    seen.clear();
    if (on) {
      for (const a of this.env.players()) {
        const stage = auraStage(a.lv);
        if (stage === 0 || !this.allowed.has(a.sid)) continue;
        const caps = auraCaps(tier, a.sid === this.env.mySid());
        if (!caps.main) continue;
        seen.add(a.sid);
        this.tick(a, stage, caps, dt);
      }
    }
    for (const [sid, au] of this.auras) {
      if (!seen.has(sid)) {
        this.release(au);
        this.auras.delete(sid);
        this.lastCast.delete(sid);
        this.bigAt.delete(sid);
      }
    }
  }

  /** Mỗi ~0,4 s chọn lại ai được vẽ: mình luôn có, người khác trong `OTHERS_FX_DIST` lấy vài người gần nhất. */
  private refreshAllowed(tier: 0 | 1 | 2): void {
    this.recount -= 1;
    if (this.recount > 0) return;
    this.recount = 24;
    this.allowed.clear();
    const cam = this.env.camera().position;
    const me = this.env.mySid();
    const others: { sid: string; d: number }[] = [];
    for (const a of this.env.players()) {
      if (auraStage(a.lv) === 0) continue;
      if (a.sid === me) {
        this.allowed.add(a.sid);
        continue;
      }
      const p = a.model.root.position;
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (d <= OTHERS_FX_DIST) others.push({ sid: a.sid, d });
    }
    others.sort((x, y) => x.d - y.d);
    for (let i = 0; i < Math.min(others.length, OTHERS_MAX[tier]); i++) this.allowed.add(others[i].sid);
  }

  private tick(a: AuraActor, stage: AuraStage, caps: AuraCaps, dt: number): void {
    const dao = daoOf(a.mt);
    const nSwords = dao === 'kiem' && stage >= 2 ? Math.max(1, Math.round(swordCount(a.lv) * caps.orbitScale)) : 0;
    const nPetals = dao === 'dan' && stage >= 2 ? Math.max(3, Math.round(6 * caps.orbitScale)) : 0;
    const key = `${stage}|${dao}|${nSwords}|${nPetals}|${caps.detail ? 1 : 0}|${caps.particles ? 1 : 0}`;
    let au = this.auras.get(a.sid);
    if (au && au.key !== key) {
      this.release(au);
      au = undefined;
    }
    if (!au) {
      au = this.build(a.sid, key, stage, dao, nSwords, nPetals, caps.detail, caps.particles);
      this.auras.set(a.sid, au);
    }
    const st = { fl: a.fl, sinceCast: this.clock - (this.lastCast.get(a.sid) ?? -99), speed: a.speed };
    const k = Math.min(1, dt * 4);
    au.vHalo += (haloVisibility(st) - au.vHalo) * k;
    au.vDan += (danGlowVisibility(st) - au.vDan) * k;
    au.vCalm += ((isCalm(st) ? 1 : 0) - au.vCalm) * Math.min(1, dt * 2);
    const p = a.model.root.position;
    const t = this.clock + au.seed * 20;
    // Nhấc người khỏi đất (Nguyên Anh+), mượt theo độ hiện của hào quang; ngự kiếm thì về 0.
    const liftTo = stage >= 2 ? LIFT * Math.min(1, au.vHalo) : 0;
    au.lift += (liftTo - au.lift) * Math.min(1, dt * 5);
    const y0 = p.y;
    const lift = au.lift > 0.004 ? au.lift + Math.sin(t * 1.6) * 0.012 * Math.min(1, au.lift / LIFT) : 0;
    p.y = y0 + lift;
    const cam = this.env.camera();
    let dx = p.x - cam.position.x;
    let dz = p.z - cam.position.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const big = this.bigAt.get(a.sid);
    const pulse = big === undefined ? 0 : Math.max(0, 1 - (this.clock - big) / PHANTOM_DUR);
    const c = this.ctx;
    c.p = p;
    c.y0 = y0;
    c.lift = lift;
    c.t = t;
    c.dt = dt;
    c.fx = Math.sin(a.yaw);
    c.fz = Math.cos(a.yaw);
    c.yaw = a.yaw;
    c.dx = dx;
    c.dz = dz;
    c.camQ = cam.quaternion;
    c.vh = au.vHalo;
    c.vDan = au.vDan;
    c.vCalm = au.vCalm;
    c.pulse = pulse;
    c.beat = danBeat(t);
    for (const f of au.ups) f(c);
    if (stage >= 2) this.updateRim(au, a, stage, c);
    this.emitParticles(au, c, stage, dao, caps, dt);
  }

  /** Rim light: gắn emissive fresnel cho mesh của model (tìm lại mỗi giây để bắt model mới sau khi đổi trang phục), đặt màu/cường độ. */
  private updateRim(au: Aura, a: AuraActor, stage: AuraStage, c: Ctx): void {
    const root = a.model.root;
    if (au.rimRoot !== root || this.clock - au.rimAt > 1) {
      au.rimAt = this.clock;
      if (au.rimRoot && au.rimRoot !== root) for (const m of au.rimMeshes) delete m.userData.rimCol;
      au.rimRoot = root;
      au.rimMeshes = [];
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) patchRim(m);
        au.rimMeshes.push(mesh);
      });
    }
    const r = RIM[stage as 2 | 3 | 4];
    au.rimCol.setHex(r.hex).multiplyScalar(r.k * c.vDan * (1 + c.pulse * 0.8));
    for (const m of au.rimMeshes) m.userData.rimCol = au.rimCol;
  }

  /** Hạt GPU: linh khí lắng khi đứng yên, điểm vàng theo nhịp kim đan, đốm lửa lò đan, sương mực Ảnh Biến, tia lửa tím. */
  private emitParticles(au: Aura, c: Ctx, stage: AuraStage, dao: AuraDao, caps: AuraCaps, dt: number): void {
    const beat = c.beat;
    if (!caps.particles) {
      au.beatPrev = beat;
      return;
    }
    const pp = this.v.particles;
    const p = c.p;
    const sc = caps.particleScale;
    const beatUp = beat > 0.55 && au.beatPrev <= 0.55;
    au.beatPrev = beat;
    if (beatUp && au.vDan > 0.3) {
      for (let i = 0; i < 3 * sc + 0.5; i++) {
        const ang = Math.random() * Math.PI * 2;
        pp.emit(
          'glow',
          p.x + c.fx * 0.17,
          p.y + 1.02,
          p.z + c.fz * 0.17,
          Math.cos(ang) * 0.5,
          0.15 + Math.random() * 0.25,
          Math.sin(ang) * 0.5,
          1.1,
          0.09,
          0.0,
          GOLD.core,
          0.95,
          0,
          2.0,
        );
      }
    }
    au.acc = Math.min(au.acc + dt * 9 * sc * (0.35 + 0.65 * c.vCalm), 5);
    while (au.acc >= 1) {
      au.acc -= 1;
      const ang = Math.random() * Math.PI * 2;
      const r = 0.35 + Math.random() * 0.6;
      const sp = 0.2;
      const col = stage >= 2 && Math.random() < 0.35 ? WUXING[(Math.random() * 5) | 0] : stage <= 1 ? GOLD.core : DAO_LOOK[dao].mote;
      pp.emit(
        'glow',
        p.x + Math.cos(ang) * r,
        p.y + 0.1 + Math.random() * 1.4,
        p.z + Math.sin(ang) * r,
        -Math.sin(ang) * sp,
        0.2 + Math.random() * 0.3,
        Math.cos(ang) * sp,
        2.4,
        0.085,
        0.0,
        col,
        0.9,
        0,
        0.6,
      );
    }
    if (dao === 'dan' && stage >= 2 && Math.random() < dt * 6 * sc * c.vh) {
      const ang = Math.random() * Math.PI * 2;
      pp.emit(
        'glow',
        p.x + Math.cos(ang) * 0.6,
        p.y + 0.95,
        p.z + Math.sin(ang) * 0.6,
        0,
        0.55 + Math.random() * 0.4,
        0,
        1.3,
        0.07,
        0.0,
        0xff9a4a,
        0.9,
        0,
        0.8,
      );
    }
    if (stage >= 4) {
      if (Math.random() < dt * 11 * sc) {
        const ang = Math.random() * Math.PI * 2;
        const r = 0.2 + Math.random() * 0.9;
        pp.emit(
          'dust',
          p.x + Math.cos(ang) * r,
          p.y + 0.12,
          p.z + Math.sin(ang) * r,
          Math.cos(ang) * 0.08,
          0.12,
          Math.sin(ang) * 0.08,
          3.0,
          0.9,
          2.0,
          INK.body,
          0.55,
          0,
          0.5,
        );
      }
      if (Math.random() < dt * 5 * sc) {
        const ang = Math.random() * Math.PI * 2;
        pp.emit(
          'glow',
          p.x + Math.cos(ang) * 0.5,
          p.y + 0.1,
          p.z + Math.sin(ang) * 0.5,
          0,
          0.4,
          0,
          1.8,
          0.07,
          0.0,
          Math.random() < 0.5 ? 0xe2b84a : 0xa66cff,
          0.9,
          0,
          0.5,
        );
      }
    }
  }

  private build(
    sid: string,
    key: string,
    stage: AuraStage,
    dao: AuraDao,
    nSwords: number,
    nPetals: number,
    detail: boolean,
    soft: boolean,
  ): Aura {
    const seed = hashStr(sid);
    const handles: FxMesh[] = [];
    const ups: ((c: Ctx) => void)[] = [];
    const look = DAO_LOOK[dao];
    const au: Aura = {
      sid,
      key,
      seed,
      handles,
      ups,
      vHalo: 0,
      vDan: 0,
      vCalm: 0,
      lift: 0,
      beatPrev: 0,
      acc: 0,
      flick: 0,
      rimCol: new THREE.Color(),
      rimMeshes: [],
      rimRoot: null,
      rimAt: -9,
      clones: [],
      cloneAt: 0,
    };
    const mk = (geo: THREE.BufferGeometry, color: number, kind: FxKind, rim?: number): FxMesh => {
      const m = this.v.fx(geo, color, 0, kind);
      m.visible = false;
      m.renderOrder = kind === 'crystal' ? CRYSTAL_ORDER : kind === 'decal' ? DECAL_ORDER : 0;
      if (rim !== undefined) {
        _col.setHex(rim);
        m.fxB.set(_col.r, _col.g, _col.b, 0.5);
      }
      // Hình dựng/hình vẽ tay: mọc đầy đủ, không tan.
      m.fxA.set(kind === 'crystal' ? 1.2 : 1.06, 0, seed * 30, 0);
      handles.push(m);
      return m;
    };
    const show = (m: FxMesh, op: number): void => {
      m.fxOpacity = op;
      m.visible = op > 0.02;
    };
    // Quầng sáng mềm: một hạt tròn mờ dần phát mỗi khung (cầu cộng sáng có mặt phẳng nên lộ cạnh đa giác).
    const halo = (x: number, y: number, z: number, size: number, color: number, alpha: number): void => {
      if (soft && alpha > 0.01) this.v.particles.emit('glow', x, y, z, 0, 0, 0, 0.08, size, size, color, alpha);
    };
    const face = (m: FxMesh, dir: THREE.Vector3): void => {
      m.quaternion.copy(_q.setFromUnitVectors(AX_Z, dir));
    };

    // ---------- Kết Đan: kim đan cầu sáng + tia linh khí xoáy ốc ----------
    {
      const core = mk(G.ico1, GOLD.core, 'solid');
      const spiral = mk(shapeGeometry('helix'), GOLD.body, 'toon', GOLD.rim);
      ups.push((c) => {
        core.position.set(c.p.x + c.fx * 0.17, c.p.y + 1.02, c.p.z + c.fz * 0.17);
        core.scale.setScalar(0.1 + c.beat * 0.07);
        show(core, c.vDan * (0.85 + c.beat * 0.15));
        halo(core.position.x, core.position.y, core.position.z, 0.5 + c.beat * 0.3, GOLD.core, c.vDan * (0.12 + c.beat * 0.22));
        // Tia xoáy ốc: trục +Z của hình xoắn dựng đứng, quay quanh trục dọc, bay lên.
        spiral.position.set(c.p.x, c.p.y + 0.08, c.p.z);
        spiral.quaternion.copy(_q.setFromAxisAngle(AX_Y, c.t * 1.8)).multiply(UPRIGHT);
        spiral.scale.set(3.3, 3.3, 2.1 + c.beat * 0.2);
        show(spiral, c.vDan * (stage >= 2 ? 0.65 : 0.95));
      });
    }

    if (stage >= 2) {
      // Trận đồ mực mỏng rõ nét dưới chân (triện văn, không phải vệt loang): vàng → bạc → tím-vàng theo tầng.
      const fr =
        stage >= 4 ? { b: VIOLET.body, r: VIOLET.rim } : stage >= 3 ? { b: SILVER.body, r: SILVER.rim } : { b: GOLD.body, r: GOLD.rim };
      const feet = mk(QUAD_XZ, fr.b, 'decal', fr.r);
      feet.fxA.set(1, 0, seed * 30, DECAL_RUNE);
      feet.fxK = 1;
      ups.push((c) => {
        feet.position.set(c.p.x, c.y0 + 0.09, c.p.z);
        feet.rotation.y = c.t * 0.3;
        feet.scale.set(1.5, 1, 1.5);
        show(feet, c.vh * 0.9);
      });
      // ---------- Nguyên Anh: Nguyên Anh nhỏ trên đầu ----------
      const infant = mk(shapeGeometry('card'), 0xe0a21c, 'card', 0xfff0b0);
      infant.fxA.set(1.2, 0, seed * 30, 5);
      ups.push((c) => {
        const bob = Math.sin(c.t * 1.5) * 0.05;
        infant.position.set(c.p.x, c.p.y + 2.7 + bob, c.p.z);
        infant.quaternion.copy(c.camQ);
        infant.scale.set(0.7, 0.7, 1);
        infant.fxK = c.t;
        show(infant, Math.min(1, c.vh * 1.15));
        halo(infant.position.x, infant.position.y, infant.position.z, 1.0 + Math.sin(c.t * 2.2) * 0.06, GOLD.core, c.vh * 0.14);
      });
      if (detail) {
        // Vòng ngũ hành: 5 viên 5 màu xoay quanh eo + vòng sáng nối.
        const ring = mk(shapeGeometry('ripple'), JADE.body, 'toon', GOLD.rim);
        const orbs = WUXING.map((col) => mk(G.ico1, col, 'solid'));
        ups.push((c) => {
          ring.position.set(c.p.x, c.p.y + 1.0, c.p.z);
          ring.rotation.y = c.t * 0.5;
          ring.scale.set(1.12, 1, 1.12);
          show(ring, c.vh * 0.85);
          for (let i = 0; i < 5; i++) {
            const ang = c.t * 0.9 + (i / 5) * Math.PI * 2;
            const x = c.p.x + Math.cos(ang) * 1.12;
            const y = c.p.y + 1.0 + Math.sin(c.t * 1.7 + i * 1.3) * 0.06;
            const z = c.p.z + Math.sin(ang) * 1.12;
            orbs[i].position.set(x, y, z);
            orbs[i].scale.setScalar(0.1);
            show(orbs[i], c.vh);
            halo(x, y, z, 0.42, WUXING[i], c.vh * 0.2);
          }
        });
      }
      // Hào quang theo đạo.
      if (dao === 'kiem') {
        const swords: FxMesh[] = [];
        const trails: FxMesh[] = [];
        for (let i = 0; i < nSwords; i++) {
          swords.push(mk(swordFxGeometry(), look.body, 'crystal', look.rim));
          if (detail) trails.push(mk(shapeGeometry('kite'), look.mote, 'glow'));
        }
        ups.push((c) => {
          const n = swords.length;
          for (let i = 0; i < n; i++) {
            const s = swords[i];
            const ang = c.t * 0.4 + (i / n) * Math.PI * 2;
            const x = c.p.x + Math.cos(ang) * 1.05;
            const y = c.p.y + 1.18 + Math.sin(c.t * 1.9 + i * 1.7) * 0.07;
            const z = c.p.z + Math.sin(ang) * 1.05;
            s.position.set(x, y, z);
            // Mũi kiếm theo hướng xoay (tiếp tuyến), chúc nhẹ lên: cả vòng như thế trận kiếm.
            const dir = _v.set(-Math.sin(ang), 0.12, Math.cos(ang)).normalize();
            face(s, dir);
            s.scale.setScalar(0.9);
            show(s, c.vh);
            if (detail) {
              const tr = trails[i];
              tr.position.set(x, y, z);
              face(tr, dir.negate());
              tr.scale.set(0.22, 0.22, 0.75);
              show(tr, c.vh * 0.5);
            }
          }
        });
      } else if (dao === 'ho') {
        // Hộ pháp: trận đồ dưới chân dùng chung bên dưới.
      } else {
        const petals: FxMesh[] = [];
        for (let i = 0; i < nPetals; i++) petals.push(mk(shapeGeometry('kite'), 0xe4452f, 'crystal', look.rim));
        const orbs = [0, 1, 2].map(() => mk(G.ico1, 0xff9a4a, 'solid'));
        ups.push((c) => {
          const n = petals.length;
          for (let i = 0; i < n; i++) {
            const ang = c.t * 0.25 + (i / n) * Math.PI * 2;
            const open = 0.8 + Math.sin(c.t * 1.4) * 0.12;
            const m = petals[i];
            m.position.set(c.p.x + Math.cos(ang) * 0.34, c.p.y + 0.92, c.p.z + Math.sin(ang) * 0.34);
            face(m, _v.set(Math.cos(ang) * 0.75 * open, 0.66, Math.sin(ang) * 0.75 * open).normalize());
            m.scale.setScalar(0.5);
            show(m, c.vh);
          }
          for (let i = 0; i < orbs.length; i++) {
            const ang = -c.t * 1.3 + (i / orbs.length) * Math.PI * 2;
            orbs[i].position.set(
              c.p.x + Math.cos(ang) * 0.9,
              c.p.y + 1.25 + Math.sin(c.t * 2 + i * 2.1) * 0.12,
              c.p.z + Math.sin(ang) * 0.9,
            );
            orbs[i].scale.setScalar(0.09 + Math.sin(c.t * 6 + i) * 0.015);
            show(orbs[i], c.vh);
          }
        });
      }
    }

    if (stage >= 3 && detail) {
      // ---------- Hóa Thần: pháp tướng là tranh vẽ tay billboard lớn sau lưng + phù văn đạo luật ----------
      // Lớp bóng sẫm cùng hình đặt ngay sau tranh: tranh sáng đọc được trên nền ban ngày.
      const under = mk(shapeGeometry('card'), 0x16243d, 'art', 0x000000);
      under.fxA.set(1.3, 0, seed * 30, look.art);
      const art = mk(shapeGeometry('card'), 0xffffff, 'art', look.artRim);
      art.fxA.set(1.3, 0, seed * 30, look.art);
      const ring = mk(QUAD_XZ, SILVER.body, 'decal', SILVER.rim);
      ring.fxA.set(0, 0, seed * 30, DECAL_RUNE);
      const rune = mk(QUAD_XZ, SILVER.body, 'decal', SILVER.rim);
      rune.fxA.set(1, 0, seed * 30, DECAL_RUNE);
      rune.fxK = 1;
      ups.push((c) => {
        // Mờ nhẹ khi đứng yên, bùng rõ + phình khi ra chiêu lớn.
        const hh = 3.8 * (1 + 0.1 * c.pulse);
        art.position.set(c.p.x + c.dx * 2.8, c.y0 + c.lift + hh * 0.9, c.p.z + c.dz * 2.8);
        art.quaternion.copy(c.camQ);
        art.scale.set(hh * 0.75, hh, 1);
        art.fxK = c.t;
        const op = Math.min(1, c.vCalm * 0.3 * c.vh + c.pulse * 0.92);
        show(art, op);
        under.position.set(art.position.x + c.dx * 0.06, art.position.y - 0.04, art.position.z + c.dz * 0.06);
        under.quaternion.copy(c.camQ);
        under.scale.set(art.scale.x * 1.015, art.scale.y * 1.015, 1);
        under.fxK = c.t;
        show(under, op * 0.55);
        // Gợn sóng trận đồ tỏa dưới chân pháp tướng khi bùng.
        const k = 1 - c.pulse;
        ring.position.set(art.position.x, c.y0 + 0.1, art.position.z);
        ring.rotation.y = c.t * 0.8;
        ring.scale.set(1.2 + k * 3, 1, 1.2 + k * 3);
        ring.fxA.x = Math.min(1, k * 3);
        ring.fxA.y = Math.max(0, (k - 0.55) / 0.45);
        ring.fxK = c.pulse;
        show(ring, c.pulse > 0.01 ? 0.15 + 0.6 * c.pulse : 0);
        // Phù văn đạo luật xoay ngang lưng khi đứng yên.
        rune.position.set(c.p.x, c.p.y + 1.0, c.p.z);
        rune.rotation.y = -c.t * 0.7;
        rune.scale.set(1.4, 1, 1.4);
        show(rune, c.vCalm * 0.85);
      });
    }

    if (stage >= 4) {
      // ---------- Ảnh Biến: vũng mực, tia sét tím-vàng, phân thân ----------
      const bolts = [mk(shapeGeometry('ribbon'), VIOLET.body, 'toon', VIOLET.rim), mk(shapeGeometry('ribbon'), 0xe2b84a, 'toon', 0xfff4c0)];
      ups.push((c) => {
        // Nháy tia sét: thỉnh thoảng cụt ngắn (erode) rồi bật lại.
        au.flick -= c.dt;
        if (au.flick <= 0) {
          au.flick = 0.05 + Math.random() * 0.09;
          for (const b of bolts) b.fxA.y = Math.random() < 0.3 ? 0.35 + Math.random() * 0.45 : 0;
        }
        for (let i = 0; i < bolts.length; i++) {
          const b = bolts[i];
          b.position.set(c.p.x, c.p.y + 0.0, c.p.z);
          b.quaternion.copy(_q2.setFromAxisAngle(AX_Y, c.t * (i ? -5.5 : 4.5) + i * 2)).multiply(UPRIGHT);
          b.scale.set(2.1 + i * 0.4, 2.1 + i * 0.4, 2.3);
          show(b, c.vDan * 0.95);
        }
      });
      if (detail) {
        // Phân thân: CHÍNH mesh nhân vật (vật liệu bóng mờ tím-vàng), xếp cung sau lưng nhìn từ camera, theo dáng đứng yên.
        ups.push((c) => {
          if (au.clones.length < CLONES && this.clock - au.cloneAt > 1) {
            au.cloneAt = this.clock;
            while (au.clones.length < CLONES) {
              const v = this.env.makeShadow(sid);
              if (!v) break;
              // Bóng mờ không đổ/nhận bóng: bớt lượt vẽ pass bóng (mỗi mesh một draw call).
              v.root.traverse((o) => {
                o.castShadow = false;
                o.receiveShadow = false;
              });
              this.env.parent().add(v.root);
              au.clones.push(v);
            }
          }
          const n = au.clones.length;
          const base = Math.atan2(c.dz, c.dx);
          for (let i = 0; i < n; i++) {
            const v = au.clones[i];
            const ang = base + (i - (n - 1) / 2) * 0.72;
            const x = c.p.x + Math.cos(ang) * 1.9;
            const z = c.p.z + Math.sin(ang) * 1.9;
            v.root.position.set(x, groundAt(x, z) + Math.sin(c.t * 1.4 + i * 1.9) * 0.05, z);
            v.root.rotation.y = c.yaw;
            v.root.visible = c.vDan > 0.4;
            v.update(c.dt, _idle);
          }
        });
      }
    }
    return au;
  }

  private release(au: Aura): void {
    for (const m of au.handles) this.v.drop(m);
    au.handles = [];
    au.ups = [];
    for (const v of au.clones) {
      v.root.removeFromParent();
      v.dispose();
    }
    au.clones = [];
    for (const m of au.rimMeshes) delete m.userData.rimCol;
    au.rimMeshes = [];
    au.rimRoot = null;
  }

  /** Số lưới đang dùng (đo đạc, bảng F3 và test). */
  stats(): { auras: number; handles: number; clones: number } {
    let handles = 0;
    let clones = 0;
    for (const au of this.auras.values()) {
      handles += au.handles.length;
      clones += au.clones.length;
    }
    return { auras: this.auras.size, handles, clones };
  }

  dispose(): void {
    for (const au of this.auras.values()) this.release(au);
    this.auras.clear();
  }
}
