// Hào quang riêng của ba hướng tu Đao tu / Cổ tu / Cấm chế sư: MỘT lớp nhẹ mỗi hướng, thay hào quang cảnh giới mặc định (luật ở `pathAuraRules.ts`).
//   Đao tu    : 2–3 vệt đao đỏ sậm (lưỡi liềm dựng đứng, nghiêng) xoay rất chậm quanh thân + tàn đỏ thưa bay lên.
//   Cổ tu     : 3–5 cổ trùng nhỏ (viên lục + quầng mờ) bay lượn quanh người, mỗi con một nhịp.
//   Cấm chế sư: một vòng văn trận mờ dưới chân, xoay chậm.
// Mọi lưới đi qua `FxPool` kiểu gộp (cả đám đông dùng chung vài draw call), hạt dùng hạt GPU chung. Khối ở độ cao thân đều mờ khi nằm giữa camera
// và người (`fxCamFade`, cùng luật với VFX chiêu), lớp mờ bớt khi chạy/giao chiến (`auraWeights`), ẩn khi hóa hình/bay/chết/độ kiếp/xuất khiếu.
import * as THREE from 'three/webgpu';
import { fxCamFade, PF_MEDITATING } from '@dtl/shared';
import type { FxKind, FxMesh } from '../../render/materials/vfx';
import { shapeGeometry, QUAD_XZ } from '../../render/vfx/fxShapes';
import { DECAL_RUNE, DECAL_SCORCH } from '../../render/vfx/stylized';
import { G } from '../core/geo';
import { FLAGS } from '../../base/flags';
import { OTHERS_FX_DIST } from './fxBudget';
import type { Vfx } from './vfx';
import type { RealmAuraEnv, AuraActor } from './realmAura';
import {
  AURA_COMBAT_SEC,
  auraCaps,
  auraWeights,
  isCalm,
  otherAuraLevel,
  qualityTier,
  settledTarget,
  type AuraCaps,
} from './realmAuraRules';
import {
  bugOrbit,
  PATH_AURA_BASE,
  pathAuraCount,
  pathAuraHidden,
  pathAuraOf,
  pathAuraPalette,
  pathAuraStage,
  runeRadius,
  slashAngle,
  slashPhase,
  slashTilt,
  type PathAuraKind,
  type PathAuraPalette,
} from './pathAuraRules';

/** Số người khác gần nhất được vẽ lớp hướng theo bậc chất lượng (Thấp tắt hẳn): như hào quang cảnh giới. */
const OTHERS_MAX = [0, 4, 8] as const;
const CRYSTAL_ORDER = 1;
const DECAL_ORDER = -1;
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _col = new THREE.Color();
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Y = new THREE.Vector3(0, 1, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);

interface PathAura {
  key: string;
  seed: number;
  handles: FxMesh[];
  ups: ((c: PathCtx) => void)[];
  still: number;
  settle: number;
  /** Độ hiện mượt 0–1 (đã tính ẩn/hiện theo trạng thái). */
  vis: number;
  /** Bộ đếm phát hạt. */
  acc: number;
}

interface PathCtx {
  p: THREE.Vector3;
  t: number;
  dt: number;
  /** Camera − người trên mặt XZ (cho `fxCamFade`). */
  cx: number;
  cz: number;
  /** Độ hiện tổng của lớp (trọng số chế độ/chạy/chiến × độ hiện mượt). */
  w: number;
  y0: number;
  yaw: number;
}

const hashStr = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};

export class PathAuraFx {
  private auras = new Map<string, PathAura>();
  private clock = 0;
  private recount = 0;
  private allowed = new Map<string, 'main' | 'full'>();
  private seen = new Set<string>();
  private lastCast = new Map<string, number>();
  private ctx = {} as PathCtx;

  constructor(
    private v: Vfx,
    private env: RealmAuraEnv,
  ) {}

  /** Nghe sự kiện chiêu: ghi mốc chiến đấu (lớp mờ bớt khi đang giao chiến, như hào quang cảnh giới). */
  handle(sid: string, e: { kind: string }): void {
    if (e.kind === 'windup') this.lastCast.set(sid, this.clock);
  }

  update(dt: number): void {
    this.clock += dt;
    const on = FLAGS.pathAura && this.env.enabled();
    const tier = qualityTier(this.env.gfxQuality(), this.env.fxQuality());
    if (on) this.refreshAllowed(tier);
    const seen = this.seen;
    seen.clear();
    if (on) {
      for (const a of this.env.players()) {
        const kind = pathAuraOf(a.mt);
        if (!kind || !this.allowed.get(a.sid)) continue;
        const caps = auraCaps(tier, a.sid === this.env.mySid());
        if (!caps.main) continue;
        seen.add(a.sid);
        this.tick(a, kind, caps, dt);
      }
    }
    for (const [sid, au] of this.auras) {
      if (!seen.has(sid)) {
        this.release(au);
        this.auras.delete(sid);
        this.lastCast.delete(sid);
      }
    }
  }

  /** Mỗi ~0,4 s chọn lại ai được vẽ: mình luôn có; người khác theo cài đặt "Hào quang người khác" và khoảng cách (>30 m tắt), tối đa theo bậc chất lượng. */
  private refreshAllowed(tier: 0 | 1 | 2): void {
    this.recount -= 1;
    if (this.recount > 0) return;
    this.recount = 24;
    this.allowed.clear();
    const cam = this.env.camera().position;
    const me = this.env.mySid();
    const mode = this.env.others();
    const party = this.env.partySids();
    const others: { sid: string; d: number; party: boolean }[] = [];
    for (const a of this.env.players()) {
      if (!pathAuraOf(a.mt)) continue;
      if (a.sid === me) {
        this.allowed.set(a.sid, 'full');
        continue;
      }
      const p = a.model.root.position;
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (d <= OTHERS_FX_DIST) others.push({ sid: a.sid, d, party: party.has(a.sid) });
    }
    others.sort((x, y) => x.d - y.d);
    for (let i = 0; i < Math.min(others.length, OTHERS_MAX[tier]); i++) {
      const o = others[i]!;
      const lv = otherAuraLevel(mode, o.d, o.party, false, OTHERS_FX_DIST);
      if (lv !== 'none') this.allowed.set(o.sid, 'main');
    }
  }

  private tick(a: AuraActor, kind: PathAuraKind, caps: AuraCaps, dt: number): void {
    const stage = pathAuraStage(a.lv);
    const n = kind === 'cam' ? 1 : pathAuraCount(kind, stage);
    // Cổ trùng cần quầng hạt (soft) để có độ sáng: tắt hạt thì vẫn còn viên lục.
    const key = `${kind}|${stage}|${n}|${caps.particles ? 1 : 0}`;
    let au = this.auras.get(a.sid);
    if (au && au.key !== key) {
      this.release(au);
      au = undefined;
    }
    if (!au) {
      au = this.build(a, key, kind, stage, n, caps.particles);
      this.auras.set(a.sid, au);
    }
    const st = { fl: a.fl, sinceCast: this.clock - (this.lastCast.get(a.sid) ?? -99), speed: a.speed };
    const calm = isCalm(st);
    const fighting = st.sinceCast < AURA_COMBAT_SEC;
    au.still = calm && !fighting ? au.still + dt : 0;
    au.settle += (settledTarget(au.still, (a.fl & PF_MEDITATING) !== 0 && calm) - au.settle) * Math.min(1, dt * 2);
    const w = auraWeights({ mode: this.env.mode(), combat: this.env.combat(), moving: !calm, fighting, settle: au.settle });
    // Ẩn mượt (hóa hình/bay/chết...): về 0 trong ~0,25 s thay vì tắt giật.
    const target = pathAuraHidden(a.fl, a.giant) ? 0 : 1;
    au.vis += (target - au.vis) * Math.min(1, dt * 4);
    const cam = this.env.camera().position;
    const p = a.model.root.position;
    const c = this.ctx;
    c.p = p;
    c.t = this.clock + au.seed * 20;
    c.dt = dt;
    c.cx = cam.x - p.x;
    c.cz = cam.z - p.z;
    c.w = w.main * au.vis;
    c.y0 = p.y;
    c.yaw = a.yaw;
    for (const f of au.ups) f(c);
    this.emit(au, c, kind, dt, caps);
  }

  /** Hạt GPU thưa: tàn đỏ của Đao tu (chỉ khi đã yên, nền). Cổ tu/Cấm chế sư không phát hạt riêng ngoài quầng của cổ trùng. */
  /** Hạt GPU: khí đỏ sậm của Đao tu bốc nhẹ từ vai/lưng (phía sau người, cao ngang vai), thưa; tắt ở bậc chất lượng Thấp. */
  private emit(au: PathAura, c: PathCtx, kind: PathAuraKind, dt: number, caps: AuraCaps): void {
    if (kind !== 'dao' || !caps.particles || au.vis < 0.3) return;
    au.acc = Math.min(au.acc + dt * 7 * caps.particleScale * Math.min(1, c.w + 0.2), 4);
    const bx = -Math.sin(c.yaw);
    const bz = -Math.cos(c.yaw);
    while (au.acc >= 1) {
      au.acc -= 1;
      const side = (Math.random() - 0.5) * 0.7;
      const x = c.p.x + bx * 0.22 + bz * side;
      const z = c.p.z + bz * 0.22 - bx * side;
      this.v.particles.emit(
        'dust',
        x,
        c.p.y + 1.25 + Math.random() * 0.25,
        z,
        bx * 0.05,
        0.28 + Math.random() * 0.15,
        bz * 0.05,
        1.8,
        0.35,
        0.9,
        0x8a1c14,
        0.9 * Math.min(1, c.w + 0.2),
        0,
        0.5,
      );
    }
  }

  private build(
    a: AuraActor,
    key: string,
    kind: PathAuraKind,
    stage: ReturnType<typeof pathAuraStage>,
    n: number,
    soft: boolean,
  ): PathAura {
    const seed = hashStr(a.sid);
    const handles: FxMesh[] = [];
    const ups: ((c: PathCtx) => void)[] = [];
    const au: PathAura = { key, seed, handles, ups, still: 0, settle: 0, vis: 0, acc: 0 };
    const pal: PathAuraPalette = pathAuraPalette(a.mt)!;
    const mk = (geo: THREE.BufferGeometry, color: number, fxKind: FxKind, rim?: number): FxMesh => {
      const m = this.v.fx(geo, color, 0, fxKind);
      m.visible = false;
      m.renderOrder = fxKind === 'crystal' ? CRYSTAL_ORDER : fxKind === 'decal' ? DECAL_ORDER : 0;
      if (rim !== undefined) {
        _col.setHex(rim);
        m.fxB.set(_col.r, _col.g, _col.b, 0.5);
      }
      m.fxA.set(fxKind === 'crystal' ? 1.2 : 1.06, 0, seed * 30, 0);
      handles.push(m);
      return m;
    };
    const base = PATH_AURA_BASE[kind];
    const show = (m: FxMesh, op: number): void => {
      m.fxOpacity = Math.max(0, Math.min(1, op));
      m.visible = m.fxOpacity > 0.02;
    };
    const fade = (c: PathCtx, p: THREE.Vector3): number => fxCamFade(c.cx, c.cz, p.x - c.p.x, p.z - c.p.z);
    const halo = (x: number, y: number, z: number, size: number, color: number, alpha: number): void => {
      if (soft && alpha > 0.01) this.v.particles.emit('glow', x, y, z, 0, 0, 0, 0.08, size, size, color, alpha);
    };

    if (kind === 'dao') {
      // Vệt đao mảnh lướt qua theo nhịp, KHÔNG có khối cố định hai bên: mỗi vệt chỉ hiện ~0,45 s trong chu kỳ rồi tắt, quét một cung hẹp;
      // khí đỏ sậm bốc nhẹ từ vai/lưng do hạt GPU lo (emit).
      const slashes: FxMesh[] = [];
      for (let i = 0; i < n; i++) slashes.push(mk(shapeGeometry('crescent'), pal.core, 'toon', pal.body));
      ups.push((c) => {
        for (let i = 0; i < slashes.length; i++) {
          const m = slashes[i]!;
          const ph = slashPhase(c.t, i, slashes.length);
          if (ph < 0) {
            m.visible = false;
            continue;
          }
          const ang = slashAngle(i, c.t, ph);
          m.position.set(c.p.x + Math.cos(ang) * 0.85, c.p.y + 0.8 + (0.3 * ((i * 5) % 3)) / 2, c.p.z + Math.sin(ang) * 0.85);
          _q.setFromAxisAngle(AX_Y, Math.PI / 2 - ang);
          _q2.setFromAxisAngle(AX_X, -Math.PI / 2);
          m.quaternion.copy(_q).multiply(_q2);
          _q2.setFromAxisAngle(AX_Z, (slashTilt(i) * Math.PI) / 180);
          m.quaternion.multiply(_q2);
          m.scale.set(0.55, 0.55, 0.55);
          show(m, base * c.w * Math.sin(Math.PI * ph) * fade(c, m.position));
        }
      });
    } else if (kind === 'co') {
      // Cổ trùng: 3–4 viên lục bay quỹ đạo thấp quanh hông, mỗi viên có viền tối (viên lớn hơn, đậm) để nổi trên nền đá trắng + quầng mờ.
      const bugs: FxMesh[] = [];
      const outlines: FxMesh[] = [];
      for (let i = 0; i < n; i++) {
        outlines.push(mk(G.ico1, pal.shadow, 'solid'));
        bugs.push(mk(G.ico1, pal.body, 'solid'));
      }
      ups.push((c) => {
        for (let i = 0; i < bugs.length; i++) {
          const m = bugs[i]!;
          const ol = outlines[i]!;
          const o = bugOrbit(i, bugs.length, c.t);
          m.position.set(c.p.x + Math.cos(o.ang) * o.r, c.p.y + o.y, c.p.z + Math.sin(o.ang) * o.r);
          ol.position.copy(m.position);
          m.scale.setScalar(0.085);
          ol.scale.setScalar(0.12);
          const f = base * c.w * fade(c, m.position);
          show(m, f);
          show(ol, f);
          halo(m.position.x, m.position.y, m.position.z, 0.3, pal.rim, f * 0.4);
        }
      });
    } else {
      // Văn trận mờ dưới chân: một vòng triện, xoay chậm; không nhấc theo cảnh giới (không phải trận thật, không gây nhầm với trận đứng).
      // Nền tối (cùng bảng màu) dưới vành triện: triện màu một mình chìm trên đá sáng (bài học trận Cấm chế sư #473).
      const under = mk(QUAD_XZ, pal.core, 'decal', pal.rim);
      under.fxA.set(1, 0, seed * 30, DECAL_SCORCH);
      under.fxK = 1;
      under.fxB.w = 0;
      under.renderOrder = -4;
      const rune = mk(QUAD_XZ, pal.body, 'decal', pal.rim);
      rune.fxA.set(1, 0, seed * 30, DECAL_RUNE);
      rune.fxK = 1;
      rune.fxB.w = 0;
      rune.renderOrder = -3;
      const rad = runeRadius(stage);
      ups.push((c) => {
        rune.position.set(c.p.x, c.y0 + 0.09, c.p.z);
        rune.rotation.y = c.t * 0.25;
        rune.scale.set(rad, 1, rad);
        show(rune, base * c.w);
        under.position.set(c.p.x, c.y0 + 0.085, c.p.z);
        under.scale.set(rad, 1, rad);
        show(under, base * c.w);
      });
    }
    return au;
  }

  private release(au: PathAura): void {
    for (const m of au.handles) this.v.drop(m);
    au.handles = [];
    au.ups = [];
  }

  /** Số lưới đang dùng (đo đạc và test). */
  stats(): { auras: number; handles: number } {
    let handles = 0;
    for (const au of this.auras.values()) handles += au.handles.length;
    return { auras: this.auras.size, handles };
  }

  dispose(): void {
    for (const au of this.auras.values()) this.release(au);
    this.auras.clear();
  }
}
