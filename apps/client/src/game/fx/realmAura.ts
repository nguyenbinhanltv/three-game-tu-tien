// Hào quang cảnh giới trên nhân vật 3D ngoài thế giới (RFX-1). Chỉ là lớp hình theo `lv` + công pháp `mt` server đã đồng bộ
// (mình và người khác đều thấy); không đọc/ghi luật chơi.
//   Kết Đan (20+)   : kim đan sáng nhẹ ở đan điền chớp theo nhịp + hạt linh khí lắng khi đứng yên/đả tọa.
//   Nguyên Anh (24+): hào quang theo đạo: Kiếm tu 3–9 phi kiếm xoay quanh lưng, Hộ pháp trận đồ dưới chân + khiên mờ,
//                     Đan sư sen lửa + đốm lửa lò đan; tắt khi ngự kiếm, mờ khi đang chiến đấu.
//   Hóa Thần (28+)  : vầng sáng nhẹ sau lưng lúc đứng yên; bóng pháp tướng khổng lồ trong suốt hiện sau lưng 1,3 s khi ra chiêu tối thượng.
//   Ảnh Biến (32)   : thêm sương mực đen–vàng quanh chân.
// Mọi lưới đi qua `FxPool` kiểu gộp (`crystal`/`glow`/`dome`/`decal`/`card`: cả đám đông dùng chung vài draw call) và hạt GPU dùng
// chung (`PARTICLES`, không tốn draw call). Người khác chỉ vẽ khi gần (`OTHERS_FX_DIST`) và tối đa vài người gần nhất.
import * as THREE from 'three/webgpu';
import { SKILL } from '@dtl/content';
import type { FxQuality } from '@dtl/shared';
import type { FxMesh } from '../../render/materials/vfx';
import { paletteOf } from '../../render/vfx/palette';
import { shapeGeometry, QUAD_XZ } from '../../render/vfx/fxShapes';
import { DECAL_RUNE } from '../../render/vfx/stylized';
import { G } from '../core/geo';
import type { SkillEvent } from '../character/view';
import { OTHERS_FX_DIST } from './fxBudget';
import { RING_GEO } from './vfxParts/common';
import type { Vfx } from './vfx';
import {
  auraCaps,
  auraStage,
  danBeat,
  danGlowVisibility,
  daoOf,
  haloVisibility,
  isCalm,
  phantomPhase,
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
  /** Vị trí hiển thị đã tính giật lùi (root của model). */
  model: { root: { position: THREE.Vector3 } };
  /** Công pháp đang tu. */
  mt: string;
}

export interface RealmAuraEnv {
  players(): Iterable<AuraActor>;
  mySid(): string;
  camera(): THREE.Camera;
  /** Preset đồ họa chung (`get().quality`). */
  gfxQuality(): string;
  fxQuality(): FxQuality;
  /** Công tắc trong Cài đặt. */
  enabled(): boolean;
}

/** Số người khác gần nhất được vẽ hào quang, theo bậc chất lượng (Thấp tắt hẳn). */
export const OTHERS_MAX = [0, 4, 8] as const;
/** Số bóng pháp tướng sống đồng thời tối đa trên toàn cảnh. */
export const PHANTOM_MAX = 3;

const TILT_RING = 0.5;
/** Cùng `renderOrder` với các nhóm gộp đã vẽ ấm ở `Vfx.warmBatches` (nhóm khác thì biên dịch shader ở lần vẽ đầu). */
const CRYSTAL_ORDER = 1;
const DECAL_ORDER = -1;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _col = new THREE.Color();
const AX_Z = new THREE.Vector3(0, 0, 1);

/** Màu theo đạo (sRGB hex). `mote` hạt linh khí, `core` kim đan/lõi sáng, `halo` vầng sáng sau lưng. */
const DAO_LOOK: Record<
  AuraDao,
  { body: number; rim: number; mote: number; core: number; halo: number; card: number; cardRim: number; method: string }
> = {
  kiem: {
    body: 0x2cc7dc,
    rim: 0xf2fdff,
    mote: 0x9fe2f0,
    core: 0xffd36a,
    halo: 0xfff0c0,
    card: 0x1486a8,
    cardRim: 0xa6e8ff,
    method: 'lac_kiem_quyet',
  },
  ho: {
    body: 0xe39a2c,
    rim: 0xfff0c2,
    mote: 0xffc95a,
    core: 0xffcf55,
    halo: 0xffe2a0,
    card: 0xb86a12,
    cardRim: 0xffdc8a,
    method: 'bat_dong_kim_than',
  },
  dan: {
    body: 0xe4452f,
    rim: 0xffd9a0,
    mote: 0x8ff0b0,
    core: 0xffc84a,
    halo: 0xd8f0b0,
    card: 0xd02c18,
    cardRim: 0xffb98a,
    method: 'thanh_moc_dan_kinh',
  },
};

const hashStr = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};

interface Aura {
  sid: string;
  key: string;
  seed: number;
  dan: FxMesh[];
  swords: FxMesh[];
  petals: FxMesh[];
  orbs: FxMesh[];
  rune: FxMesh | null;
  dome: FxMesh | null;
  halos: FxMesh[];
  /** Độ hiện đã làm mượt của từng nhóm (0–1). */
  vHalo: number;
  vDan: number;
  vCalm: number;
  /** Giây (đồng hồ aura) của lần ra chiêu gần nhất. */
  lastCast: number;
  beatPrev: number;
  /** Số hạt dồn lại chờ sinh (tốc độ × dt). */
  acc: number;
}

interface Phantom {
  sid: string;
  t: number;
  card: FxMesh;
  ring: FxMesh;
  dao: AuraDao;
  /** Hướng "ra sau lưng" theo mắt nhìn: từ camera qua người, đã chuẩn hóa trên mặt đất. */
  dx: number;
  dz: number;
  seed: number;
  /** Cỡ thẻ (nửa rộng, nửa cao). */
  hw: number;
  hh: number;
}

export class RealmAuraFx {
  private auras = new Map<string, Aura>();
  private phantoms: Phantom[] = [];
  private clock = 0;
  private recount = 0;
  /** Các sid được phép vẽ ở lần tính lại gần nhất (người khác gần nhất). */
  private allowed = new Set<string>();
  private lastCast = new Map<string, number>();
  private seen = new Set<string>();

  constructor(
    private v: Vfx,
    private env: RealmAuraEnv,
  ) {}

  /** Nghe sự kiện chiêu: ghi mốc chiến đấu và mở bóng pháp tướng khi ra chiêu tối thượng ở Hóa Thần+. */
  handle(sid: string, e: SkillEvent): void {
    if (e.kind === 'windup') this.lastCast.set(sid, this.clock);
    if (e.kind !== 'windup' || !this.env.enabled()) return;
    const a = this.actor(sid);
    if (!a) return;
    const tier = qualityTier(this.env.gfxQuality(), this.env.fxQuality());
    const mine = sid === this.env.mySid();
    if (!auraCaps(tier, mine).phantom) return;
    if (!summonsPhantom(SKILL.get(e.skill), a.lv)) return;
    if (this.phantoms.some((p) => p.sid === sid) || this.phantoms.length >= PHANTOM_MAX) return;
    const cam = this.env.camera().position;
    const p = a.model.root.position;
    const dist = Math.hypot(p.x - cam.x, p.z - cam.z);
    if (!mine && dist > OTHERS_FX_DIST) return;
    this.openPhantom(a, dist);
  }

  private actor(sid: string): AuraActor | undefined {
    for (const a of this.env.players()) if (a.sid === sid) return a;
    return undefined;
  }

  private openPhantom(a: AuraActor, dist: number): void {
    const dao = daoOf(a.mt);
    const look = DAO_LOOK[dao];
    // Hướng ra sau lưng nhìn từ camera: bóng nằm sau nhân vật, nhân vật che bớt phần chân (độ sâu), không phủ lên người.
    const cam = this.env.camera().position;
    const p = a.model.root.position;
    let dx = p.x - cam.x;
    let dz = p.z - cam.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const which = dao === 'kiem' ? 3 : dao === 'ho' ? 4 : 1;
    const card = this.v.fx(shapeGeometry('card'), look.card, 0, 'card');
    const pal = paletteOf(look.method);
    _col.setHex(look.cardRim);
    card.fxB.set(_col.r, _col.g, _col.b, 0.5);
    const seed = hashStr(a.sid) * 40;
    card.fxA.set(0, 0, seed, which);
    const ring = this.v.fx(QUAD_XZ, pal.body, 0, 'decal');
    _col.setHex(pal.rim);
    ring.fxB.set(_col.r, _col.g, _col.b, 0.5);
    ring.fxA.set(0, 0, seed, DECAL_RUNE);
    ring.renderOrder = DECAL_ORDER;
    // Tỉ lệ thẻ: Kiếm long dựng đứng 512×768, Huyền vũ/Chu tước 768×640 (rộng hơn).
    const tall = which === 3;
    const big = Math.min(1, 12 / Math.max(dist, 12));
    const hh = (tall ? 4.6 : 3.9) * big;
    const hw = hh * (tall ? 0.667 : 1.2);
    this.phantoms.push({ sid: a.sid, t: 0, card, ring, dao, dx, dz, seed, hw, hh });
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
        const mine = a.sid === this.env.mySid();
        const caps = auraCaps(tier, mine);
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
      }
    }
    this.updatePhantoms(dt, on);
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
    const key = `${stage}|${dao}|${nSwords}|${nPetals}`;
    let au = this.auras.get(a.sid);
    if (au && au.key !== key) {
      this.release(au);
      au = undefined;
    }
    if (!au) {
      au = this.build(a.sid, key, stage, dao, nSwords, nPetals);
      this.auras.set(a.sid, au);
    }
    const cast = this.lastCast.get(a.sid);
    au.lastCast = cast ?? -99;
    const st = { fl: a.fl, sinceCast: this.clock - au.lastCast, speed: a.speed };
    const k = Math.min(1, dt * 4);
    au.vHalo += (haloVisibility(st) - au.vHalo) * k;
    au.vDan += (danGlowVisibility(st) - au.vDan) * k;
    au.vCalm += ((isCalm(st) ? 1 : 0) - au.vCalm) * Math.min(1, dt * 2);
    const p = a.model.root.position;
    const look = DAO_LOOK[dao];
    const t = this.clock + au.seed * 20;
    const fx = Math.sin(a.yaw);
    const fz = Math.cos(a.yaw);

    // --- Kim đan (Kết Đan trở lên): chớp theo nhịp ở đan điền, hơi nhô ra phía trước bụng.
    const beat = danBeat(t);
    if (au.dan.length) {
      const [core, soft] = au.dan;
      const vis = au.vDan;
      const cx = p.x + fx * 0.16;
      const cz = p.z + fz * 0.16;
      core.position.set(cx, p.y + 1.02, cz);
      core.scale.setScalar(0.07 + beat * 0.06);
      core.fxOpacity = vis * (0.55 + beat * 0.45);
      soft.position.copy(core.position);
      soft.scale.setScalar(0.22 + beat * 0.12);
      soft.fxOpacity = vis * (0.1 + beat * 0.2);
      core.visible = soft.visible = vis > 0.02;
    }
    // --- Hạt: linh khí lắng khi đứng yên; điểm sáng vàng thổ bắn ra mỗi nhịp kim đan.
    if (caps.particles) {
      const pp = this.v.particles;
      const beatUp = beat > 0.55 && au.beatPrev <= 0.55;
      au.beatPrev = beat;
      if (beatUp && au.vDan > 0.3) {
        for (let i = 0; i < 2 * caps.particleScale + 0.5; i++) {
          const ang = Math.random() * Math.PI * 2;
          pp.emit(
            'glow',
            p.x + fx * 0.16,
            p.y + 1.02,
            p.z + fz * 0.16,
            Math.cos(ang) * 0.35,
            0.12 + Math.random() * 0.2,
            Math.sin(ang) * 0.35,
            1.0,
            0.05,
            0.0,
            look.core,
            0.85,
            0,
            2.2,
          );
        }
      }
      au.acc = Math.min(au.acc + dt * 7 * caps.particleScale * au.vCalm, 4);
      while (au.acc >= 1) {
        au.acc -= 1;
        const ang = Math.random() * Math.PI * 2;
        const r = 0.35 + Math.random() * 0.55;
        const y0 = 0.15 + Math.random() * 1.3;
        // Lắng quanh người: bay lên chậm, uốn theo tiếp tuyến.
        const sp = 0.18;
        pp.emit(
          'glow',
          p.x + Math.cos(ang) * r,
          p.y + y0,
          p.z + Math.sin(ang) * r,
          -Math.sin(ang) * sp,
          0.18 + Math.random() * 0.25,
          Math.cos(ang) * sp,
          2.4,
          0.07,
          0.0,
          look.mote,
          0.85,
          0,
          0.6,
        );
      }
      if (stage >= 4) this.mist(p, au, dt, caps);
      if (dao === 'dan' && stage >= 2) {
        // Đốm lửa lò đan bay lên từ sen.
        if (Math.random() < dt * 5 * caps.particleScale * au.vHalo) {
          const ang = Math.random() * Math.PI * 2;
          pp.emit(
            'glow',
            p.x + Math.cos(ang) * 0.6,
            p.y + 0.95,
            p.z + Math.sin(ang) * 0.6,
            0,
            0.5 + Math.random() * 0.4,
            0,
            1.3,
            0.05,
            0.0,
            0xff9a4a,
            0.8,
            0,
            0.8,
          );
        }
      }
    } else au.beatPrev = beat;

    // --- Nguyên Anh: hào quang theo đạo.
    const vh = au.vHalo;
    const show = vh > 0.02;
    if (nSwords) {
      const n = au.swords.length;
      for (let i = 0; i < n; i++) {
        const s = au.swords[i];
        const ang = t * 0.95 + (i / n) * Math.PI * 2;
        const r = 0.95 + Math.sin(t * 1.3 + i) * 0.07;
        // Vòng nghiêng nhẹ quanh lưng, bồng bềnh.
        const y = 1.12 + Math.sin(ang) * TILT_RING * 0.2 + Math.sin(t * 1.7 + i * 1.3) * 0.08;
        s.position.set(p.x + Math.cos(ang) * r, p.y + y, p.z + Math.sin(ang) * r);
        // Mũi kiếm theo hướng chuyển động (tiếp tuyến), hơi chúc xuống.
        _v.set(-Math.sin(ang), Math.cos(ang) * TILT_RING * 0.2 - 0.1, Math.cos(ang)).normalize();
        s.quaternion.copy(_q.setFromUnitVectors(AX_Z, _v));
        s.scale.setScalar(0.55);
        s.fxOpacity = vh;
        s.visible = show;
      }
    }
    if (dao === 'ho' && stage >= 2 && au.rune && au.dome) {
      au.rune.position.set(p.x, p.y + 0.1, p.z);
      au.rune.rotation.y = t * 0.35;
      au.rune.scale.set(1.5, 1, 1.5);
      au.rune.fxOpacity = vh * (0.5 + Math.sin(t * 2) * 0.08);
      au.rune.visible = show;
      au.dome.position.set(p.x, p.y + 0.95, p.z);
      au.dome.scale.set(0.95, 1.2, 0.95);
      au.dome.rotation.y = t * 0.6;
      au.dome.fxOpacity = vh * (0.55 + Math.sin(t * 3.1) * 0.15);
      au.dome.visible = show;
    }
    if (dao === 'dan' && stage >= 2) {
      const n = au.petals.length;
      for (let i = 0; i < n; i++) {
        const s = au.petals[i];
        const ang = t * 0.25 + (i / n) * Math.PI * 2;
        // Sen lửa nở ngang eo: cánh chúc ra ngoài, chếch lên ~50°, nhịp nở thở.
        const open = 0.8 + Math.sin(t * 1.4) * 0.12;
        s.position.set(p.x + Math.cos(ang) * 0.34, p.y + 0.92, p.z + Math.sin(ang) * 0.34);
        _v.set(Math.cos(ang) * 0.75 * open, 0.66, Math.sin(ang) * 0.75 * open).normalize();
        s.quaternion.copy(_q.setFromUnitVectors(AX_Z, _v));
        s.scale.setScalar(0.62);
        s.fxOpacity = vh;
        s.visible = show;
      }
      for (let i = 0; i < au.orbs.length; i++) {
        const o = au.orbs[i];
        const ang = -t * 1.3 + (i / au.orbs.length) * Math.PI * 2;
        o.position.set(p.x + Math.cos(ang) * 0.82, p.y + 1.25 + Math.sin(t * 2 + i * 2.1) * 0.12, p.z + Math.sin(ang) * 0.82);
        o.scale.setScalar(0.08 + Math.sin(t * 6 + i) * 0.015);
        o.fxOpacity = vh * 0.9;
        o.visible = show;
      }
    }

    // --- Hóa Thần: vầng sáng nhẹ sau lưng (từ mắt nhìn), chỉ khi đứng yên.
    if (au.halos.length) {
      const cam = this.env.camera();
      const cp = cam.position;
      let dx = p.x - cp.x;
      let dz = p.z - cp.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      const vis = au.vCalm;
      for (let i = 0; i < au.halos.length; i++) {
        const h = au.halos[i];
        h.position.set(p.x + dx * (0.42 + i * 0.04), p.y + 1.38, p.z + dz * (0.42 + i * 0.04));
        h.quaternion.copy(cam.quaternion);
        const s = 0.86 + i * 0.22 + Math.sin(t * 1.2 + i) * 0.02;
        h.scale.setScalar(s);
        h.fxOpacity = vis * (0.55 - i * 0.2 + Math.sin(t * 1.6 + i) * 0.06);
        h.visible = vis > 0.02;
      }
    }
  }

  /** Sương mực đen–vàng quanh chân (Ảnh Biến, đỉnh): bụi đen mờ trôi chậm + vài đốm vàng. */
  private mist(p: THREE.Vector3, au: Aura, dt: number, caps: AuraCaps): void {
    const pp = this.v.particles;
    const sc = caps.particleScale;
    if (Math.random() < dt * 9 * sc) {
      const ang = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.8;
      pp.emit(
        'dust',
        p.x + Math.cos(ang) * r,
        p.y + 0.12,
        p.z + Math.sin(ang) * r,
        Math.cos(ang) * 0.08,
        0.1,
        Math.sin(ang) * 0.08,
        3.0,
        0.9,
        1.9,
        0x1b160c,
        0.5,
        0,
        0.5,
      );
    }
    if (Math.random() < dt * 2.5 * sc) {
      const ang = Math.random() * Math.PI * 2;
      const r = 0.3 + Math.random() * 0.7;
      pp.emit('glow', p.x + Math.cos(ang) * r, p.y + 0.1, p.z + Math.sin(ang) * r, 0, 0.25, 0, 1.8, 0.05, 0.0, 0xe2b84a, 0.7, 0, 0.5);
    }
    void au;
  }

  private build(sid: string, key: string, stage: AuraStage, dao: AuraDao, nSwords: number, nPetals: number): Aura {
    const look = DAO_LOOK[dao];
    const pal = paletteOf(look.method);
    const seed = hashStr(sid);
    const au: Aura = {
      sid,
      key,
      seed,
      dan: [],
      swords: [],
      petals: [],
      orbs: [],
      rune: null,
      dome: null,
      halos: [],
      vHalo: 0,
      vDan: 0,
      vCalm: 0,
      lastCast: -99,
      beatPrev: 0,
      acc: 0,
    };
    const glow = (geo: THREE.BufferGeometry, color: number, kind: 'glow' | 'dome' = 'glow'): FxMesh => {
      const m = this.v.fx(geo, color, 0, kind);
      m.visible = false;
      return m;
    };
    const kite = (): FxMesh => {
      const m = this.v.fx(shapeGeometry('kite'), pal.body, 0, 'crystal');
      _col.setHex(pal.rim);
      m.fxB.set(_col.r, _col.g, _col.b, 0.5);
      m.fxA.set(1.2, 0, seed * 30, 0);
      m.renderOrder = CRYSTAL_ORDER;
      m.visible = false;
      return m;
    };
    au.dan = [glow(G.ico1, look.core), glow(G.ico1, look.core)];
    for (let i = 0; i < nSwords; i++) au.swords.push(kite());
    if (dao === 'ho' && stage >= 2) {
      const r = this.v.fx(QUAD_XZ, pal.body, 0, 'decal');
      _col.setHex(pal.rim);
      r.fxB.set(_col.r, _col.g, _col.b, 0.5);
      r.fxA.set(1, 0, seed * 30, DECAL_RUNE);
      r.fxK = 1;
      r.renderOrder = DECAL_ORDER;
      r.visible = false;
      au.rune = r;
      au.dome = glow(G.dome, look.body, 'dome');
    }
    if (dao === 'dan' && stage >= 2) {
      for (let i = 0; i < nPetals; i++) {
        const m = kite();
        m.fxColor.setHex(0xe4452f);
        au.petals.push(m);
      }
      for (let i = 0; i < 3; i++) au.orbs.push(glow(G.ico1, 0xff9a4a));
    }
    if (stage >= 3) {
      au.halos = [glow(RING_GEO, look.halo), glow(RING_GEO, look.halo)];
    }
    return au;
  }

  private release(au: Aura): void {
    for (const m of [...au.dan, ...au.swords, ...au.petals, ...au.orbs, ...au.halos, au.rune, au.dome]) if (m) this.v.drop(m);
    au.dan = [];
    au.swords = [];
    au.petals = [];
    au.orbs = [];
    au.halos = [];
    au.rune = au.dome = null;
  }

  private updatePhantoms(dt: number, on: boolean): void {
    for (let i = this.phantoms.length - 1; i >= 0; i--) {
      const ph = this.phantoms[i];
      ph.t += dt;
      const a = this.actor(ph.sid);
      if (!on || !a || ph.t >= PHANTOM_DUR) {
        this.v.drop(ph.card);
        this.v.drop(ph.ring);
        this.phantoms.splice(i, 1);
        continue;
      }
      const f = phantomPhase(ph.t);
      const p = a.model.root.position;
      const cam = this.env.camera();
      ph.card.position.set(p.x + ph.dx * 1.6, p.y + ph.hh * 0.85, p.z + ph.dz * 1.6);
      ph.card.quaternion.copy(cam.quaternion);
      ph.card.scale.set(ph.hw, ph.hh, 1);
      ph.card.fxA.x = f.reveal;
      ph.card.fxA.y = f.erode;
      ph.card.fxK = ph.t;
      ph.card.fxOpacity = f.alpha;
      // Gợn sóng: vành trận đồ trên đất tỏa ra dưới chân bóng rồi tan.
      const k = ph.t / PHANTOM_DUR;
      ph.ring.position.set(p.x + ph.dx * 1.6, p.y + 0.12, p.z + ph.dz * 1.6);
      ph.ring.scale.set(1.2 + k * 2.4, 1, 1.2 + k * 2.4);
      ph.ring.rotation.y = ph.t * 0.8;
      ph.ring.fxA.x = Math.min(1, k * 3);
      ph.ring.fxA.y = Math.max(0, (k - 0.55) / 0.45);
      ph.ring.fxK = 1 - k;
      ph.ring.fxOpacity = 0.55 * (1 - k * 0.5);
    }
  }

  /** Số lưới/hạt đang dùng (đo đạc, bảng F3 và test). */
  stats(): { auras: number; handles: number; phantoms: number } {
    let handles = 0;
    for (const au of this.auras.values())
      handles +=
        au.dan.length + au.swords.length + au.petals.length + au.orbs.length + au.halos.length + (au.rune ? 1 : 0) + (au.dome ? 1 : 0);
    return { auras: this.auras.size, handles, phantoms: this.phantoms.length };
  }

  dispose(): void {
    for (const au of this.auras.values()) this.release(au);
    this.auras.clear();
    for (const ph of this.phantoms) {
      this.v.drop(ph.card);
      this.v.drop(ph.ring);
    }
    this.phantoms = [];
  }
}
