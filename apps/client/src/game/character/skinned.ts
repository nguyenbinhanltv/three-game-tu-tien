import * as THREE from 'three/webgpu';
import type { MonsterDef } from '@dtl/shared';
import { HitReact, type HitOpts } from '../hitreact';
import { type PoseClips, type PoseLibrary, libraryClips } from './poseLib';
import { baseState, type CharState, type ClipMap, clipFor, locomotionScale, MOVE_MIN } from './states';
import type { AnimState, CharacterView, MonsterView, PerformOpts } from './view';

export interface SkinnedOpts {
  /** Bản sao riêng của asset (có bộ xương riêng). `SkinnedCharacter` sở hữu skeleton của nó. */
  scene: THREE.Object3D;
  /** Clip dùng chung với bản gốc (không sửa). */
  clips: readonly THREE.AnimationClip[];
  clipMap: ClipMap;
  /** Chiều cao asset ở scale 1 (m). */
  height: number;
  scale?: number;
  /** Tốc độ (m/s, ở scale 1) mà clip chạy phát 1× thì chân không trượt. */
  refSpeed: number;
  /** Ngưỡng khoảng cách (m) đổi LOD1, LOD2. */
  lodDist?: [number, number];
  /**
   * Khung cầu (hệ của `scene`, scale 1) đủ rộng cho mọi tư thế, để cắt theo frustum mà không cắt mất
   * chân/đầu khi đang chạy. Bỏ trống thì không cắt theo frustum.
   */
  bounds?: THREE.Sphere;
  /** Pose đã nướng cho asset này (người Mixamo): động tác chiêu, và clip nền bay/niệm chú qua `clipMap`. */
  poses?: PoseLibrary;
}

/** Thời gian chuyển giữa các trạng thái nền (giây). */
const FADE_BASE = 0.22;
/** Vào đòn một lần (tấn công, trúng đòn) nhanh để thấy ngay. */
const FADE_IN_SHOT = 0.07;
/** Về lại nền trước khi clip một lần hết. */
const FADE_OUT_SHOT = 0.16;
const FADE_DEATH = 0.12;
/** Tốc độ phát idle khi đang giao chiến mà asset không có clip thủ riêng. */
const COMBAT_IDLE_RATE = 1.35;
const SINK_AFTER = 1.8;
const SINK_RATE = 0.45;
/** Động tác chiêu: vào nhanh, về nền mềm hơn; bị hủy (bay lên, chết) thì tắt trong khoảng này. */
const PERFORM_IN = 0.07;
const PERFORM_OUT = 0.16;
const PERFORM_CANCEL = 0.1;
/** Tốc độ (1/giây) thân dưới chuyển giữa theo pose (đứng yên) và theo clip chạy. */
const STILL_RATE = 7;

/**
 * Trọng số action cho hệ số trộn b ∈ [0, 1] khi chồng lên nền có tổng trọng số 1. Mixer lấy trung bình có trọng số
 * (không cộng dồn) nên muốn được b phần pose thì trọng số pose phải là b / (1 − b).
 */
export function overlayWeight(b: number): number {
  if (b <= 0) return 0;
  return b >= 0.999 ? 1000 : b / (1 - b);
}

interface Perform {
  id: string;
  clips: PoseClips;
  upper: THREE.AnimationAction;
  lower: THREE.AnimationAction;
  /** Thời điểm trong clip (giây). */
  t: number;
  from: number;
  /** Phần thân dưới theo pose (1 = đứng yên). */
  still: number;
  /** Đang tắt vì bị hủy: độ mạnh còn lại. */
  cancel: number;
}

/**
 * Khoảng cập nhật mixer theo khoảng cách (giây): gần thì mỗi khung, xa thì gộp dt lại cập nhật thưa.
 * Bộ xương chỉ đổi khi mixer chạy nên CPU giảm theo; ở xa không thấy khác.
 */
export function mixerInterval(d: number): number {
  if (d < 20) return 0;
  if (d < 50) return 1 / 30;
  return 1 / 12;
}

interface Shot {
  state: CharState;
  action: THREE.AnimationAction;
  /** Thời gian còn lại (giây theo dt animation). */
  left: number;
}

/**
 * Nhân vật có xương chạy bằng `AnimationMixer`. Máy trạng thái: nền (idle thường/thủ, đi/chạy theo tốc độ,
 * nhảy, bay, thiền, niệm chú, chết) crossfade với nhau; tấn công và trúng đòn là đòn một lần chồng lên rồi trả về.
 * Clip thiếu thì lùi theo `FALLBACK` (vd. sói không có clip đi → dùng clip chạy phát chậm).
 */
export class SkinnedCharacter implements CharacterView {
  root = new THREE.Group();
  /** Lớp trong: rung trúng đòn ghi vào đây để không đè vị trí root. */
  protected inner = new THREE.Group();
  readonly height: number;
  readonly hit: HitReact;
  readonly mixer: THREE.AnimationMixer;
  /** Mesh theo mức LOD (chỉ số = mức). */
  private lods: THREE.Mesh[][] = [];
  private lodLevel = -1;
  private lodDist: [number, number];
  private clips = new Map<string, THREE.AnimationClip>();
  private actions = new Map<string, THREE.AnimationAction>();
  private map: ClipMap;
  private refSpeed: number;
  private scene: THREE.Object3D;
  private current: THREE.AnimationAction | null = null;
  private base: CharState | null = null;
  private shot: Shot | null = null;
  /** Đòn trúng chờ (khớp lúc đạn bay tới, cùng trễ với chớp sáng). */
  private pendingHit = -1;
  private dead = false;
  /** Đã chết bao lâu (giây): sau `SINK_AFTER` xác chìm dần xuống đất (giống model khối). */
  private deadT = 0;
  private acc = 0;
  private interval = 0;
  private disposed = false;
  private poses: PoseLibrary | null;
  private perf: Perform | null = null;
  private pendingPerform: { id: string; from: number; left: number } | null = null;
  /** Trạng thái nhận ở khung gần nhất (để quyết định có ra chiêu được không). */
  private last: AnimState | null = null;
  /** Số lần ra đòn (cho vệt/hạt theo nhân vật). */
  attacks = 0;

  constructor(o: SkinnedOpts) {
    this.scene = o.scene;
    this.map = o.clipMap;
    const s = o.scale ?? 1;
    this.refSpeed = o.refSpeed * s;
    this.height = o.height * s;
    this.lodDist = o.lodDist ?? [22, 55];
    for (const c of o.clips) this.clips.set(c.name, c);
    this.poses = o.poses ?? null;
    if (this.poses) for (const c of libraryClips(this.poses)) if (!this.clips.has(c.name)) this.clips.set(c.name, c);
    const meshes: THREE.Mesh[] = [];
    o.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      const lv = typeof obj.userData.lod === 'number' ? obj.userData.lod : 0;
      (this.lods[lv] ??= []).push(m);
      meshes.push(m);
      m.castShadow = true;
      if (o.bounds && (m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).boundingSphere = o.bounds;
      else if (!o.bounds) m.frustumCulled = false;
    });
    for (let i = 0; i < this.lods.length; i++) this.lods[i] ??= [];
    this.applyLod(0);
    this.inner.add(o.scene);
    this.root.add(this.inner);
    this.root.scale.setScalar(s);
    this.mixer = new THREE.AnimationMixer(o.scene);
    this.hit = new HitReact(meshes);
    this.enterBase('idle', 0);
    this.mixer.update(0);
  }

  attack(): void {
    if (this.dead) return;
    this.playShot('attack');
  }

  perform(id: string, o: PerformOpts = {}): boolean {
    const clips = this.poses?.get(id);
    if (!clips) return false;
    if (!this.canPerform()) return true;
    const from = Math.min(Math.max(0, o.from ?? 0), clips.def.duration);
    if (o.delay && o.delay > 0) {
      this.pendingPerform = { id, from, left: o.delay };
      return true;
    }
    this.startPerform(id, clips, from);
    return true;
  }

  cancelPerform(): void {
    this.pendingPerform = null;
    const p = this.perf;
    // Đã ra đòn rồi thì để động tác chạy hết (hiệu ứng đã phóng).
    if (p && p.cancel >= 1 && p.t < (p.clips.def.hit?.[0] ?? 0)) p.cancel = 0.999;
  }

  performing(id: string): boolean {
    return this.perf?.id === id || this.pendingPerform?.id === id;
  }

  hitReact(o: HitOpts): void {
    this.hit.react(o);
    if (o.delay && o.delay > 0) this.pendingHit = this.pendingHit < 0 ? o.delay : Math.min(this.pendingHit, o.delay);
    else this.onHit();
  }

  /** Trạng thái đang hiện (để test và gỡ lỗi). */
  get state(): CharState | null {
    return this.shot?.state ?? this.base;
  }

  /** Action của một clip theo tên (null nếu chưa từng phát). */
  actionOf(clip: string): THREE.AnimationAction | null {
    return this.actions.get(clip) ?? null;
  }

  get lod(): number {
    return this.lodLevel;
  }

  setViewDistance(d: number): void {
    this.interval = mixerInterval(d);
    const [d1, d2] = this.lodDist;
    const want = d < d1 ? 0 : d < d2 ? 1 : 2;
    this.applyLod(Math.max(0, Math.min(want, this.lods.length - 1)));
  }

  update(realDt: number, a: AnimState): void {
    const dt = this.hit.update(realDt);
    this.inner.position.x = this.hit.shake;
    if (this.pendingHit >= 0) {
      this.pendingHit -= realDt;
      if (this.pendingHit < 0) this.onHit();
    }

    const want = baseState(a, this.refSpeed);
    if (want === 'death') {
      if (!this.dead) {
        this.dead = true;
        this.shot = null;
        this.pendingHit = -1;
        this.enterBase('death', FADE_DEATH);
      }
      this.deadT += dt;
      this.inner.position.y = -Math.max(0, this.deadT - SINK_AFTER) * SINK_RATE;
    } else {
      if (this.dead) {
        // Hồi sinh: bỏ tư thế chết.
        this.dead = false;
        this.base = null;
        this.deadT = 0;
        this.inner.position.y = 0;
      }
      if (this.shot) {
        this.shot.left -= dt;
        if (this.shot.left <= FADE_OUT_SHOT) {
          this.shot = null;
          this.base = null;
        }
      }
      if (!this.shot && want !== this.base) this.enterBase(want, FADE_BASE);
      if (!this.shot && this.current) {
        if (want === 'walk' || want === 'run') this.current.timeScale = locomotionScale(a.speed, this.refSpeed);
        else if (want === 'combatIdle' && clipFor('combatIdle', this.map, this.hasClip) === this.map.idle) this.current.timeScale = COMBAT_IDLE_RATE;
        else this.current.timeScale = 1;
      }
    }

    this.last = a;
    this.updatePerform(dt, a);

    // Hạ tần số mixer ở xa: gộp dt, cập nhật bộ xương thưa hơn.
    this.acc += dt;
    if (this.acc > 0 && this.acc >= this.interval) {
      this.mixer.update(this.acc);
      this.acc = 0;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hit.reset();
    this.perf = null;
    this.pendingPerform = null;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.scene);
    // Geometry, material, texture dùng chung (bản gốc trong AssetCache / bảng tint); skeleton là của bản sao.
    const skeletons = new Set<THREE.Skeleton>();
    this.scene.traverse((o) => {
      const sk = (o as THREE.SkinnedMesh).skeleton;
      if (sk) skeletons.add(sk);
    });
    for (const sk of skeletons) sk.dispose();
    this.root.removeFromParent();
  }

  private hasClip = (name: string): boolean => this.clips.has(name);

  /**
   * Theo luật server (`sim.onSkill`): không ra chiêu khi chết, ngự kiếm hay đang ở trên không. Đang thiền thì VẪN ra
   * chiêu được (server tự dừng thiền rồi ra chiêu), nên động tác phải phát, chồng lên tư thế thiền tới khi cờ tắt.
   */
  private canPerform(a: AnimState | null = this.last): boolean {
    return !this.dead && !(a && (a.dead || a.flying || a.airborne));
  }

  private startPerform(id: string, clips: PoseClips, from: number): void {
    this.stopPerform();
    const act = (clip: THREE.AnimationClip) => {
      const x = this.mixer.clipAction(clip);
      x.setLoop(THREE.LoopOnce, 1);
      x.clampWhenFinished = true;
      x.reset();
      x.time = from;
      x.setEffectiveWeight(0);
      x.play();
      return x;
    };
    const moving = (this.last?.speed ?? 0) > MOVE_MIN;
    this.perf = { id, clips, upper: act(clips.upper), lower: act(clips.lower), t: from, from, still: moving ? 0 : 1, cancel: 1 };
    // Đòn một lần của clip nền (vd. attack 1,2s của Tripo) nhường chỗ cho động tác chiêu.
    if (this.shot) this.shot.left = Math.min(this.shot.left, FADE_OUT_SHOT);
    this.attacks++;
  }

  private stopPerform(): void {
    const p = this.perf;
    if (!p) return;
    p.upper.stop();
    p.lower.stop();
    this.perf = null;
  }

  private updatePerform(dt: number, a: AnimState): void {
    const q = this.pendingPerform;
    if (q) {
      q.left -= dt;
      if (q.left <= 0) {
        this.pendingPerform = null;
        const clips = this.poses?.get(q.id);
        if (clips && this.canPerform(a)) this.startPerform(q.id, clips, q.from);
      }
    }
    const p = this.perf;
    if (!p) return;
    p.t += dt;
    const dur = p.clips.def.duration;
    if (!this.canPerform(a) && p.cancel >= 1) p.cancel = 0.999;
    if (p.cancel < 1) p.cancel -= dt / PERFORM_CANCEL;
    if (p.t >= dur || p.cancel <= 0) {
      this.stopPerform();
      return;
    }
    const still = a.speed <= MOVE_MIN ? 1 : 0;
    p.still += Math.sign(still - p.still) * Math.min(Math.abs(still - p.still), STILL_RATE * dt);
    const env = Math.min(1, (p.t - p.from) / PERFORM_IN, (dur - p.t) / PERFORM_OUT) * Math.min(1, p.cancel);
    p.upper.setEffectiveWeight(overlayWeight(env));
    p.lower.setEffectiveWeight(overlayWeight(env * p.still));
  }

  private onHit(): void {
    this.pendingHit = -1;
    // Đang cắn thì không cắt ngang (đọc được đòn quan trọng hơn); chết rồi thì thôi.
    if (this.dead || this.shot?.state === 'attack' || this.perf) return;
    this.playShot('hit');
  }

  private action(state: CharState): THREE.AnimationAction | null {
    const name = clipFor(state, this.map, this.hasClip);
    if (!name) return null;
    let act = this.actions.get(name);
    if (!act) {
      act = this.mixer.clipAction(this.clips.get(name)!);
      this.actions.set(name, act);
    }
    return act;
  }

  private enterBase(state: CharState, fade: number): void {
    this.base = state;
    const act = this.action(state);
    if (!act) return;
    if (state === 'death') {
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
      act.reset();
      act.timeScale = 1;
    } else {
      act.setLoop(THREE.LoopRepeat, Infinity);
      act.clampWhenFinished = false;
      // Clip đang tắt dần (vd. vừa ra khỏi một đòn) thì chạy tiếp từ chỗ cũ, không giật về khung đầu.
      if (!act.isRunning() && act !== this.current) act.time = 0;
    }
    this.fadeTo(act, fade);
  }

  private playShot(state: CharState): void {
    const act = this.action(state);
    if (!act) return;
    const clip = act.getClip();
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.timeScale = 1;
    act.reset();
    this.fadeTo(act, FADE_IN_SHOT);
    this.shot = { state, action: act, left: clip.duration };
  }

  private fadeTo(next: THREE.AnimationAction, fade: number): void {
    const prev = this.current;
    next.enabled = true;
    next.paused = false;
    next.play();
    if (prev && prev !== next && fade > 0) {
      next.crossFadeFrom(prev, fade, false);
    } else {
      if (prev && prev !== next) prev.stop();
      next.stopFading();
      next.setEffectiveWeight(1);
    }
    this.current = next;
  }

  private applyLod(level: number): void {
    if (level === this.lodLevel) return;
    this.lodLevel = level;
    for (let i = 0; i < this.lods.length; i++) for (const m of this.lods[i]) m.visible = i === level;
  }
}

/** Quái dùng model có xương; cùng interface với `MonsterModel` (model khối). */
export class SkinnedMonster extends SkinnedCharacter implements MonsterView {
  constructor(
    readonly def: MonsterDef,
    o: Omit<SkinnedOpts, 'scale'>,
  ) {
    super({ ...o, scale: def.scale });
  }

  hitReact(o: HitOpts): void {
    // Quái to bị đẩy ít hơn (giống MonsterModel).
    super.hitReact({ ...o, mass: (o.mass ?? 1) * (this.def.boss ? 0.3 : 1 / Math.max(1, this.def.scale)) });
  }
}
