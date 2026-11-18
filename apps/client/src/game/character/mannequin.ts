// Nhân vật v3 (N-0, `?chr=v3`): model nguyên khối có bộ xương UE5 Mannequin (`chr_v3_*`, tools/blender/chr_v3.py) phát
// clip UAL TRỰC TIẾP (`anim_ual_native`, cùng tên xương và tư thế nghỉ), không retarget lúc chạy. Bóng dùng chính bộ xương này
// (sửa lỗi bóng T-pose). Chưa có: pose IK chiêu K-5, kiếm gắn tay, phụ kiện bộ đồ, K-3 (đi lùi/ngang), IK chân.
// Đây là bản thử pipeline: không đổi mặc định, không đụng v1/v2.
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SWORD_MODEL_DEFAULT } from '@dtl/content';
import type { MonsterDef } from '@dtl/shared';
import type { AssetCache, AssetHandle } from '../assets';
import { HitReact, type HitOpts } from '../hitreact';
import { adoptGltfMaterials } from '../../render/materials/world';
import { lodLevel, mixerInterval } from './skinned';
import { SpringBones, type SpringDef, type SpringParams } from './spring';
import { partExtras } from './sword';
import { SWORD_METALNESS, SWORD_ROUGHNESS, SWORD_TINT, swordTemplateOf, type SwordTemplate } from './swordModel';
import { applyV3Palette } from './v3Palette';
import type { AnimState, CharacterView, MonsterView, PerformOpts } from './view';

const search = typeof location === 'undefined' ? '' : location.search;
/** `?chr=v3` bật nhân vật Mannequin. Mặc định tắt. */
export const CHR_V3 = new URLSearchParams(search).get('chr') === 'v3';
export const V3_LIB = 'anim_ual_native';
/** Asset theo giới tính: Lạc Kiếm Môn Phục v3 (N-3), model Tripo toàn thân đặt lên xương Mannequin (chr_v3.py). */
export const V3_MODELS = { m: 'chr_v3_lac_kiem_nam', f: 'chr_v3_lac_kiem_nu' } as const;
/** Skin toàn thân đã có bản v3 (`ItemDef.skin` = `set_skin_<tên>`): asset `chr_v3_<tên>_<nu|nam>`. */
export const V3_SKINS: Readonly<Record<string, string>> = {
  set_skin_varkessa: 'chr_v3_varkessa_nu',
  set_skin_duskrella: 'chr_v3_duskrella_nu',
  set_skin_crimson: 'chr_v3_crimson_nam',
  set_skin_kings_demon: 'chr_v3_kings_demon_nu',
  set_skin_noxavyra: 'chr_v3_noxavyra_nu',
};
/** Skin chỉ có bản v3 (v1/v2 không có asset `set_skin_<tên>_<giới>`: bỏ qua, hiện trang phục thường). Varkessa có cả v1. */
export const V3_ONLY_SKINS: ReadonlySet<string> = new Set(['set_skin_duskrella', 'set_skin_crimson', 'set_skin_noxavyra', 'set_skin_kings_demon']);
/** Asset v3 của một nhân vật (giới `g`, skin đang mặc nếu có). Skin sai giới (server không cho mặc) bị bỏ qua. */
export function v3AssetOf(g: string, skin?: string): string {
  const base = g === 'f' ? V3_MODELS.f : V3_MODELS.m;
  const id = skin ? V3_SKINS[skin] : undefined;
  return id && id.endsWith(g === 'f' ? '_nu' : '_nam') ? id : base;
}
/** Tốc độ chân của Jog_Fwd_Loop (m/s): phát với timeScale = tốc độ thật / số này để chân không trượt. */
export const JOG_SPEED = 5.36;
const FADE = 0.16;
const COMBAT_HOLD = 4;
const SWING = ['Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C'];

/** Clip nền theo trạng thái (hàm thuần, có test). */
export function baseClipOf(a: AnimState): string {
  if (a.dead) return 'Death01';
  if (a.meditating) return 'Sitting_Idle_Loop';
  if (a.flying || a.sky || a.airborne) return a.flying || a.sky ? 'NinjaJump_Idle_Loop' : 'Jump_Loop';
  if (a.casting) return 'Spell_Simple_Idle_Loop';
  if (a.speed > 0.3) return 'Jog_Fwd_Loop';
  return a.combat ? 'Sword_Idle' : 'Idle_Loop';
}

export interface MannequinTemplate {
  handle: AssetHandle;
  lib: AssetHandle;
  height: number;
  /** Clip UAL đã chỉnh độ cao hông theo nhân vật này. */
  clips: Map<string, THREE.AnimationClip>;
}

function restPos(root: THREE.Object3D, name: string): THREE.Vector3 | null {
  const o = root.getObjectByName(name);
  return o ? o.position.clone() : null;
}

export function mannequinTemplate(handle: AssetHandle, lib: AssetHandle): MannequinTemplate {
  const mats = adoptGltfMaterials(handle.scene);
  if (handle.id.startsWith('chr_v3_lac_kiem')) for (const m of mats) applyV3Palette(m);
  const box = new THREE.Box3().setFromObject(handle.scene);
  // Độ cao hông của nhân vật so với bộ xương mẫu của thư viện: chỉ kênh vị trí của pelvis bị nhân theo tỉ lệ.
  const a = restPos(handle.scene, 'pelvis');
  const b = restPos(lib.scene, 'pelvis');
  const k = a && b && b.length() > 1e-6 ? a.length() / b.length() : 1;
  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of lib.animations) {
    const cl = c.clone();
    for (const t of cl.tracks) {
      if (t.name === 'pelvis.position') for (let i = 0; i < t.values.length; i++) t.values[i] *= k;
    }
    clips.set(c.name, cl);
  }
  return { handle, lib, height: box.max.y - Math.max(box.min.y, 0), clips };
}

const IDENT = new THREE.Matrix4();
const _tq = new THREE.Quaternion();
const _tq2 = new THREE.Quaternion();
/** Lò xo v3 (vạt dài + tóc): cứng vừa, cản nhiều, góc lệch hẹp để vạt không xé/xuyên khi ngồi, lăn, chém (N-4). */
export const V3_SPRING: SpringParams = { stiffness: 130, drag: 8, maxAngle: 30, maxInward: 8 };

/** Xương twist (chr_v3.py): `<limb>_twist_<l|r>` là con của `<limb>_<l|r>`; trục xoắn = hướng tới xương con chính của limb. */
const TWIST_NEXT: Record<string, string> = { upperarm: 'lowerarm', lowerarm: 'hand', thigh: 'calf' };
/** Hệ số xoay ngược của xương twist so với góc xoắn của xương cha (đỉnh gần đầu xương chỉ xoắn ~1/3, gần cuối xoắn đủ). */
export const TWIST_COUNTER = -0.8;

interface Twist {
  limb: THREE.Object3D;
  tw: THREE.Object3D;
  axis: THREE.Vector3;
  restLimb: THREE.Quaternion;
  restTw: THREE.Quaternion;
}

/** Góc xoắn (rad, [-π, π]) của `q` quanh trục đơn vị `axis` (tách swing-twist). */
export function twistAngle(q: THREE.Quaternion, axis: THREE.Vector3): number {
  const a = 2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w);
  return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a;
}
let shadowMat: THREE.MeshStandardNodeMaterial | null = null;
function shadowMaterial(): THREE.MeshStandardNodeMaterial {
  if (!shadowMat) {
    shadowMat = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color('#2a1d3a'), roughness: 1, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false });
  }
  return shadowMat;
}

export class MannequinCharacter implements CharacterView {
  readonly root = new THREE.Group();
  readonly hit: HitReact;
  readonly height: number;
  /** Cờ nhận diện cho kịch bản quay video (tools/perf/src/scenarios/chrv3.ts). */
  readonly v3 = true;
  get hasSword(): boolean {
    return !!this.blade;
  }
  grounded = true;
  steps = 0;
  attacks = 0;
  private inner = new THREE.Group();
  private rig: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private lods: THREE.Mesh[][] = [];
  private lodDist: [number, number] = [22, 55];
  private interval = 0;
  private acc = 0;
  private base: THREE.AnimationAction | null = null;
  private baseName = '';
  private shot: THREE.AnimationAction | null = null;
  private combatT = 0;
  private swing = 0;
  private lastPhase = 0;
  private dead = false;
  private springs: SpringBones | null = null;
  private twists: Twist[] = [];
  private lodLevel = 0;
  /** Kiếm: vỏ trên lưng (`dtl_scabbard`) khi nghỉ, nắm tay (`dtl_sword`) khi giao chiến. */
  private blade: THREE.Mesh | null = null;
  private bladeLen = 0;
  private scabbard: THREE.Object3D | null = null;
  private hand: THREE.Object3D | null = null;
  private qScab = new THREE.Quaternion();
  private qHand = new THREE.Quaternion();
  private drawn = false;
  /** Đòn nối tiếp sau đòn hiện tại (ngã → đứng dậy). */
  private chain: string | null = null;
  private weights = new Map<THREE.AnimationAction, number>();
  private disposed = false;

  constructor(private tpl: MannequinTemplate, shadow = false, sword: SwordTemplate | null = null) {
    this.height = tpl.height;
    this.rig = cloneSkinned(tpl.handle.scene);
    const meshes: THREE.Mesh[] = [];
    this.rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const lv = typeof o.userData.lod === 'number' ? o.userData.lod : 0;
      (this.lods[lv] ??= []).push(m);
      m.frustumCulled = false;
      if (shadow) m.material = shadowMaterial();
      meshes.push(m);
    });
    for (let i = 0; i < this.lods.length; i++) this.lods[i] ??= [];
    this.applyLod(0);
    const defs: SpringDef[] = [];
    this.rig.traverse((o) => {
      if (!(o as THREE.Bone).isBone || !o.name.startsWith('dtl_o_')) return;
      const child = o.children.find((c) => (c as THREE.Bone).isBone);
      defs.push({ bone: o.name, tailLocal: (child ?? o).position.clone() });
    });
    if (defs.length && !shadow) this.springs = new SpringBones(this.rig, defs, V3_SPRING);
    for (const sd of ['l', 'r']) {
      for (const [limb, next] of Object.entries(TWIST_NEXT)) {
        const L = this.rig.getObjectByName(`${limb}_${sd}`);
        const tw = this.rig.getObjectByName(`${limb}_twist_${sd}`);
        const child = this.rig.getObjectByName(`${next}_${sd}`);
        if (!L || !tw || !child) continue;
        this.twists.push({ limb: L, tw, axis: child.position.clone().normalize(), restLimb: L.quaternion.clone(), restTw: tw.quaternion.clone() });
      }
    }
    this.scabbard = this.rig.getObjectByName('dtl_scabbard') ?? null;
    this.hand = this.rig.getObjectByName('dtl_sword') ?? null;
    if (sword && !shadow && this.scabbard && this.hand) {
      this.rig.updateMatrixWorld(true);
      // Hướng mũi kiếm lúc nghỉ (không gian xương): vỏ chéo xuống lưng, cầm tay thì lưỡi hướng lên; mesh kiếm có mũi +Y, chuôi ở gốc.
      const align = (bone: THREE.Object3D, dir: THREE.Vector3, out: THREE.Quaternion): void => {
        const qb = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
        out.copy(qb).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      };
      align(this.scabbard, new THREE.Vector3(-0.12, -0.55, -0.1), this.qScab);
      align(this.hand, new THREE.Vector3(0, 1, 0), this.qHand);
      this.blade = sword.mesh.clone();
      this.blade.frustumCulled = false;
      this.bladeLen = sword.info.len;
      this.mountBlade(false);
    }
    this.inner.add(this.rig);
    this.root.add(this.inner);
    this.mixer = new THREE.AnimationMixer(this.rig);
    this.hit = new HitReact(meshes);
    this.mixer.addEventListener('finished', (e) => {
      if ((e as unknown as { action: THREE.AnimationAction }).action !== this.shot) return;
      this.shot = null;
      const next = this.chain;
      this.chain = null;
      if (next && !this.dead) this.oneShot(next);
    });
    this.play('Idle_Loop');
    this.mixer.update(0);
  }

  private mountBlade(drawn: boolean): void {
    if (!this.blade) return;
    this.drawn = drawn;
    const bone = drawn ? this.hand : this.scabbard;
    bone?.add(this.blade);
    this.blade.position.set(0, 0, 0);
    this.blade.quaternion.copy(drawn ? this.qHand : this.qScab);
  }

  private applyLod(level: number): void {
    for (let i = 0; i < this.lods.length; i++) for (const m of this.lods[i]) m.visible = i === Math.min(level, this.lods.length - 1);
  }

  private action(name: string): THREE.AnimationAction | null {
    const c = this.tpl.clips.get(name);
    return c ? this.mixer.clipAction(c) : null;
  }

  private play(name: string): void {
    if (this.baseName === name) return;
    const next = this.action(name);
    if (!next) return;
    const loop = /Loop$|Idle$/.test(name);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.reset().play();
    // Trọng số nền tự quản (không dùng crossFadeTo): three chuẩn hóa theo tổng trọng số, nên khi có đòn một lần
    // clip nền phải về 0 để đòn đủ biên độ (xem `blendBases`).
    next.setEffectiveWeight(this.base ? 0 : 1);
    this.weights.set(next, this.base ? 0 : 1);
    this.base = next;
    this.baseName = name;
  }

  /** Hòa clip nền: clip hiện tại về 1 (về 0 khi đang có đòn, trừ ~0,12 s cuối để khỏi rơi về tư thế nghỉ), clip cũ tắt dần. */
  private blendBases(dt: number): void {
    let gate = 1;
    const sh = this.shot;
    if (sh) {
      const ts = Math.max(0.1, Math.abs(sh.timeScale));
      gate = (sh.getClip().duration - sh.time) / ts < FADE * 0.75 ? 1 : 0;
    }
    const step = dt / FADE;
    for (const [a, w] of [...this.weights]) {
      const target = a === this.base ? gate : 0;
      const nw = w < target ? Math.min(target, w + step) : Math.max(target, w - step * 2);
      this.weights.set(a, nw);
      a.setEffectiveWeight(nw);
      if (nw <= 0 && a !== this.base) {
        a.stop();
        this.weights.delete(a);
      }
    }
  }

  private oneShot(name: string, rate = 1): boolean {
    const a = this.action(name);
    if (!a) return false;
    if (this.shot) this.shot.fadeOut(0.08);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    a.timeScale = rate;
    a.reset().fadeIn(0.06).play();
    this.shot = a;
    return true;
  }

  attack(): void {
    if (this.dead) return;
    this.attacks++;
    this.combatT = COMBAT_HOLD;
    this.oneShot(SWING[this.swing++ % SWING.length], 1.6);
  }

  perform(_pose: string, _o?: PerformOpts): boolean {
    return false; // chiêu K-5 là pose IK trên xương Mixamo; v3 dùng đòn UAL qua attack()
  }

  knockdown(): void {
    if (this.dead) return;
    this.chain = this.tpl.clips.has('LayToIdle') ? 'LayToIdle' : null;
    this.oneShot('Hit_Knockback');
  }

  hitReact(o: HitOpts): void {
    this.hit.react(o);
    if (this.dead) return;
    if (!this.shot && !o.noFlash) this.oneShot(o.heavy ? 'Hit_Knockback' : 'Hit_Chest', o.heavy ? 1.2 : 1.4);
  }

  setViewDistance(d: number): void {
    this.setView({ dist: d, inView: true, allowLod0: true, self: d <= 0 });
  }

  setView(v: { dist: number; inView: boolean; allowLod0: boolean; self?: boolean }): void {
    const level = lodLevel(v.dist, this.lodDist, v.allowLod0, this.lods.length);
    this.applyLod(level);
    this.lodLevel = level;
    this.interval = mixerInterval(level, v.inView, !!v.self);
    this.inner.visible = v.inView;
  }

  update(realDt: number, a: AnimState): void {
    const dt = this.hit.update(realDt);
    this.inner.position.x = this.hit.shake;
    this.combatT = a.combat ? COMBAT_HOLD : Math.max(0, this.combatT - realDt);
    if (a.dead && !this.dead) {
      // Chết: bỏ đòn đang phát và đòn nối tiếp, để Death01 phát trọn.
      this.shot?.stop();
      this.shot = null;
      this.chain = null;
    }
    this.dead = a.dead;
    this.grounded = !(a.flying || a.airborne || a.sky);
    const name = baseClipOf({ ...a, combat: a.combat || this.combatT > 0 });
    this.play(name);
    if (this.base && name === 'Jog_Fwd_Loop') this.base.timeScale = Math.min(1.6, Math.max(0.4, a.speed / JOG_SPEED));
    else if (this.base) this.base.timeScale = 1;
    // Bước chân: đếm theo pha chu kỳ chạy (hai bước mỗi chu kỳ).
    if (name === 'Jog_Fwd_Loop' && this.base) {
      const len = this.base.getClip().duration;
      const ph = (this.base.time / len) % 1;
      if ((ph >= 0.5) !== (this.lastPhase >= 0.5)) this.steps++;
      this.lastPhase = ph;
    }
    // Giảm tần số cập nhật xương cho người ở xa.
    this.acc += dt;
    if (this.interval > 0 && this.acc < this.interval) return;
    this.blendBases(this.acc);
    this.mixer.update(this.acc);
    for (const t of this.twists) {
      _tq.copy(t.restLimb).invert().multiply(t.limb.quaternion);
      t.tw.quaternion.copy(t.restTw).multiply(_tq2.setFromAxisAngle(t.axis, TWIST_COUNTER * twistAngle(_tq, t.axis)));
    }
    const drawNow = this.combatT > 0 || !!a.combat;
    if (drawNow !== this.drawn) this.mountBlade(drawNow);
    // Lò xo vạt: chỉ LOD0 và trong khung nhìn; ma trận thế giới của xương phải mới (root vừa được đặt vị trí).
    if (this.springs) {
      if (this.lodLevel === 0 && this.inner.visible) {
        this.root.updateMatrixWorld(true);
        this.springs.update(this.acc, IDENT);
      } else this.springs.reset();
    }
    this.acc = 0;
  }

  bladePoints(base: THREE.Vector3, tip: THREE.Vector3): boolean {
    if (!this.blade || !this.drawn) return false;
    this.blade.updateWorldMatrix(true, false);
    base.setFromMatrixPosition(this.blade.matrixWorld);
    tip.set(0, this.bladeLen, 0).applyMatrix4(this.blade.matrixWorld);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hit.reset();
    this.blade?.removeFromParent();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rig);
    const sk = new Set<THREE.Skeleton>();
    this.rig.traverse((o) => {
      const s = (o as THREE.SkinnedMesh).skeleton;
      if (s) sk.add(s);
    });
    for (const s of sk) s.dispose();
    this.root.removeFromParent();
  }
}

/** Nạp và dựng nhân vật v3; PlayerSkins gọi khi `?chr=v3`. Trả null khi asset chưa nạp xong (bên gọi dùng đường cũ). */
export class MannequinPlayers {
  private tpl = new Map<string, MannequinTemplate | 'loading' | 'failed'>();
  private swords = new Map<string, SwordTemplate | 'loading' | 'failed'>();
  private disposed = false;
  constructor(private cache: AssetCache) {}

  private load(id: string): void {
    if (this.tpl.has(id)) return;
    this.tpl.set(id, 'loading');
    Promise.all([this.cache.acquire(id, { priority: 1 }), this.cache.acquire(V3_LIB, { priority: 1 })]).then(
      ([h, lib]) => {
        if (this.disposed) {
          h.release();
          lib.release();
          return;
        }
        try {
          this.tpl.set(id, mannequinTemplate(h, lib));
        } catch (err) {
          console.warn(`[models] không dựng được ${id}`, err);
          this.tpl.set(id, 'failed');
        }
      },
      (err) => {
        console.warn(`[models] không nạp được ${id} (v3)`, err);
        this.tpl.set(id, 'failed');
      },
    );
  }

  /** Mẫu kiếm `id` (prop_kiem_*), nạp lười; null khi chưa xong hoặc lỗi. */
  private sword(id: string): SwordTemplate | null {
    const cur = this.swords.get(id);
    if (cur) return typeof cur === 'string' ? null : cur;
    this.swords.set(id, 'loading');
    this.cache.acquire(id, { priority: 20 }).then(
      (h) => {
        const tpl = this.disposed ? null : swordTemplateOf(h.scene, partExtras(h.scene), () => h.release());
        if (!tpl) {
          h.release();
          this.swords.set(id, 'failed');
          return;
        }
        for (const m of adoptGltfMaterials(h.scene)) {
          m.metalness = SWORD_METALNESS;
          m.roughness = SWORD_ROUGHNESS;
          const tint = SWORD_TINT[id];
          if (tint) m.color.setRGB(tint[0], tint[1], tint[2]);
        }
        this.swords.set(id, tpl);
      },
      () => this.swords.set(id, 'failed'),
    );
    return null;
  }

  private get(g: string, skin?: string): MannequinTemplate | null {
    const id = v3AssetOf(g, skin);
    this.load(id);
    const t = this.tpl.get(id);
    return t && typeof t !== 'string' ? t : null;
  }

  create(g: string, skin?: string, w?: string): CharacterView | null {
    const t = this.get(g, skin);
    return t ? new MannequinCharacter(t, false, this.sword(w ?? SWORD_MODEL_DEFAULT)) : null;
  }

  createShadow(g: string, def: MonsterDef, skin?: string): MonsterView | null {
    const t = this.get(g, skin);
    return t ? (Object.assign(new MannequinCharacter(t, true), { def }) as unknown as MonsterView) : null;
  }

  pending(g: string, skin?: string, w?: string): boolean {
    if (this.get(g, skin) === null && this.tpl.get(v3AssetOf(g, skin)) !== 'failed') return true;
    this.sword(w ?? SWORD_MODEL_DEFAULT);
    return this.swords.get(w ?? SWORD_MODEL_DEFAULT) === 'loading';
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.tpl.values()) {
      if (typeof t === 'string') continue;
      t.handle.release();
      t.lib.release();
    }
    this.tpl.clear();
    for (const t of this.swords.values()) if (typeof t === 'object') t.release();
    this.swords.clear();
  }
}
