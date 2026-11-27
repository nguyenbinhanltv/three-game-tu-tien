// Xưởng animation của phòng thử (Diễn Võ Trường, V2d): tua từng clip của nhân vật / quái, đo trượt chân, ghi nhật ký chuyển clip.
// Chỉ là lớp HÌNH ở máy mình: làm việc qua cổng `labAnim()` của model (mixer + móc trước `mixer.update`), không gửi gì lên server,
// không đổi mặc định game. Tắt (`stop`) thì gỡ hết: bỏ móc, bật lại các action đã tạm tắt, thôi lấy mẫu.

import * as THREE from 'three/webgpu';
import type { Game } from '../engine';
import type { CharacterView, LabAnimPort } from '../character/view';
import { walkableGround } from '../character/mannequinFeet';
import { BlendLog, type BlendRow } from './blendLog';
import { FootSlide, StrideSlip, type FootSample, type FootState, type SlideRow, type StrideRow } from './footSlide';

export type LabSubject = 'me' | 'target';

export interface LabClip {
  name: string;
  dur: number;
}

export interface LabActive {
  name: string;
  /** Thời gian trong clip (giây) và độ dài clip. */
  t: number;
  dur: number;
  /** Trọng số đã chuẩn hóa theo tổng (0..1). */
  w: number;
}

export interface FootNow extends FootState {
  bone: string;
}

export interface AnimSnapshot {
  /** Có model có xương để soi (model khối và model chưa nạp xong thì false). */
  ok: boolean;
  subject: LabSubject;
  clips: LabClip[];
  active: LabActive[];
  /** Clip đang bị ép (tua) hoặc null. */
  hold: { name: string; t: number; dur: number; playing: boolean } | null;
  /** Đồng hồ động tác chiêu đang diễn (giây từ lúc bấm) hoặc null. */
  clock: { t: number; skill: string } | null;
  /** Từng bàn chân lúc này: cao hơn đất bao nhiêu (m), có đang trụ không, tốc độ ngang (m/s). */
  feet: FootNow[];
  /** Gốc nhân vật cao hơn mặt đất (m). */
  lift: number;
  slide: SlideRow[];
  /** Trượt chân theo vận tốc (dùng được cho quái nhấc chân thấp), theo clip nền. */
  stride: StrideRow[];
  blends: BlendRow[];
}

/** Một bước của nút ◀ ▶ khi tua (giây): một khung của clip 30 khung/giây. */
export const SCRUB_STEP = 1 / 30;

type MixerInternals = { _actions?: THREE.AnimationAction[]; _isActiveAction?(a: THREE.AnimationAction): boolean };

const actionsOf = (m: THREE.AnimationMixer): THREE.AnimationAction[] => (m as unknown as MixerInternals)._actions ?? [];
/**
 * Action đang góp vào tư thế: đã `play()` và có trọng số. KHÔNG dùng `isRunning()`: clip đi/chạy của nhân vật v3 đặt `timeScale = 0`
 * (pha do model đồng bộ tay) nên `isRunning()` báo false dù clip đang quyết định tư thế.
 */
const contributing = (m: THREE.AnimationMixer, a: THREE.AnimationAction): boolean =>
  a.enabled && a.getEffectiveWeight() > 1e-3 && ((m as unknown as MixerInternals)._isActiveAction?.(a) ?? true);

/**
 * Xương chạm đất của từng chân: ưu tiên mũi bàn chân `ball_l`/`ball_r` của bộ xương UE (vẫn chạm đất lúc gót đã nhấc), rồi cổ chân `foot_l`/`foot_r`;
 * không có thì mọi xương tên có "foot" (bỏ xương IK), rồi "toe"/"paw". Tối đa 4.
 */
export function footBones(rig: THREE.Object3D): THREE.Object3D[] {
  const all: THREE.Object3D[] = [];
  rig.traverse((o) => {
    if ((o as THREE.Bone).isBone) all.push(o);
  });
  for (const pair of [
    ['ball_l', 'ball_r'],
    ['foot_l', 'foot_r'],
  ]) {
    const named = pair.map((n) => all.find((b) => b.name === n)).filter((b): b is THREE.Object3D => !!b);
    if (named.length === 2) return named;
  }
  for (const re of [/foot/i, /toe|paw/i]) {
    const hit = all.filter((b) => re.test(b.name) && !/ik|twist|end/i.test(b.name));
    if (hit.length) return hit.slice(0, 4);
  }
  // Quái của bộ dựng thủ tục: chuỗi `leg_<chân>_<số>` (vd. `leg_fl_0..2`), khúc số lớn nhất của mỗi chân là bàn chân.
  const tips = new Map<string, { n: number; bone: THREE.Object3D }>();
  for (const b of all) {
    const m = /^(leg_[a-z]+)_(\d+)$/i.exec(b.name);
    if (!m) continue;
    const n = Number(m[2]);
    const cur = tips.get(m[1]!);
    if (!cur || n > cur.n) tips.set(m[1]!, { n, bone: b });
  }
  if (tips.size) return [...tips.values()].map((x) => x.bone).slice(0, 4);
  return [];
}

/** Vài xương chính để đo tốc độ xoay khớp lúc chuyển clip (hông, sống lưng, đầu, bắp tay, đùi). */
export function spinBones(rig: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  rig.traverse((o) => {
    if ((o as THREE.Bone).isBone && /pelvis|hips|spine|head|upperarm|upleg|thigh/i.test(o.name) && !/ik|twist|end|top/i.test(o.name) && out.length < 12) out.push(o);
  });
  return out;
}

const _p = new THREE.Vector3();

export class AnimWorkshop {
  subject: LabSubject = 'me';
  private raf = 0;
  private lastT = 0;
  private model: CharacterView | null = null;
  private port: LabAnimPort | null = null;
  private feet: THREE.Object3D[] = [];
  private spins: { bone: THREE.Object3D; q: THREE.Quaternion; at: number }[] = [];
  private slide = new FootSlide();
  private stride = new StrideSlip();
  /** `performance.now()` của các lần bàn chân vừa chạm đất gần đây. */
  readonly plants: number[] = [];
  /** Mốc trước của từng bàn chân cho phép đo theo vận tốc: vị trí trong hệ cây xương (để biết xương có đổi không), vị trí thế giới, gốc nhân vật, thời điểm. */
  private strideRef: { lx: number; ly: number; lz: number; wx: number; wz: number; rx: number; rz: number; at: number }[] = [];
  /** Gốc nhân vật cao hơn mặt đất bao nhiêu (m) ở khung vừa đo: khác 0 nhiều là nhân vật đang lơ lửng hoặc hàm mặt đất không khớp level. */
  private lift = 0;
  private blends = new BlendLog();
  private held: { action: THREE.AnimationAction; clip: THREE.AnimationClip; name: string; playing: boolean } | null = null;
  /** Action game đang dùng mà xưởng đã tạm tắt trong lúc ép clip; bật lại khi thả. */
  private muted = new Set<THREE.AnimationAction>();

  constructor(private game: Game) {}

  get running(): boolean {
    return this.raf !== 0;
  }

  /** Bắt đầu lấy mẫu mỗi khung (trượt chân, chuyển clip). */
  start(): void {
    if (this.raf) return;
    this.lastT = performance.now();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.sample();
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Dừng lấy mẫu, thả clip đang ép, xóa số đo. */
  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.release();
    this.bind(null);
  }

  setSubject(s: LabSubject): void {
    if (s === this.subject) return;
    this.release();
    this.subject = s;
    this.bind(null);
  }

  /** Xóa số đo trượt chân và nhật ký chuyển clip (giữ clip đang ép). */
  resetStats(): void {
    this.plants.length = 0;
    this.slide.reset();
    this.stride.reset();
    this.strideRef = [];
    this.blends.reset();
  }

  private pick(): { model: CharacterView; x: number; z: number } | null {
    const g = this.game;
    const e = this.subject === 'me' ? g.ents?.players.get(g.sid) : g.targetId ? (g.ents?.monsters.get(g.targetId) ?? g.ents?.players.get(g.targetId)) : undefined;
    return e ? { model: e.model, x: e.model.root.position.x, z: e.model.root.position.z } : null;
  }

  private bind(model: CharacterView | null): void {
    if (model === this.model) return;
    this.release();
    this.model = model;
    this.port = model?.labAnim?.() ?? null;
    this.feet = this.port ? footBones(this.port.rig) : [];
    this.spins = this.port ? spinBones(this.port.rig).map((bone) => ({ bone, q: bone.quaternion.clone(), at: performance.now() })) : [];
    this.slide.reset();
    this.blends.reset();
  }

  private active(): LabActive[] {
    const p = this.port;
    if (!p) return [];
    const list = actionsOf(p.mixer)
      .filter((a) => a !== this.held?.action && contributing(p.mixer, a))
      .map((a) => ({ name: a.getClip().name, t: a.time, dur: a.getClip().duration, w: a.getEffectiveWeight() }));
    const sum = list.reduce((s, a) => s + a.w, 0) || 1;
    return list.map((a) => ({ ...a, w: a.w / sum })).sort((a, b) => b.w - a.w);
  }

  private sample(): void {
    const now = performance.now();
    const realDt = (now - this.lastT) / 1000;
    this.lastT = now;
    const s = this.pick();
    this.bind(s?.model ?? null);
    if (!s || !this.port) return;
    // Đang dừng hình (nhóm Thời gian) thì không đo: chân đứng yên vì hình đứng yên, không phải vì bám đất tốt.
    const dt = this.game.timeScale > 0 || this.game.stepLeft > 0 ? realDt : 0;
    const act = this.active();
    let spin = 0;
    let spinBone = '';
    for (const b of this.spins) {
      const ang = b.q.angleTo(b.bone.quaternion);
      // Xương không đổi khung này (model ở xa chỉ chạy mixer 30 Hz hoặc thưa hơn): chờ lần đổi kế, chia theo khoảng thời gian THẬT giữa hai lần đổi.
      // Chia theo một khung vẽ thì model cập nhật thưa bị thổi phồng gấp 2 đến 4 lần (đo 28/11 trên boss ở xa).
      if (ang < 1e-5) continue;
      const span = (now - b.at) / 1000;
      b.at = now;
      b.q.copy(b.bone.quaternion);
      if (dt <= 1e-4 || span <= 1e-4 || span > 0.25) continue;
      const v = (ang * 180) / Math.PI / span;
      if (v > spin) {
        spin = v;
        spinBone = b.bone.name;
      }
    }
    // Đang ép clip thì số đo không phản ánh game: bỏ qua.
    if (this.held) return;
    this.blends.push(now, act, spin, spinBone);
    if (!this.feet.length) return;
    const ground = walkableGround(s.model.root.position.y);
    this.lift = s.model.root.position.y - ground(s.x, s.z);
    // Sàn nhân vật đang đứng cao hơn hàm mặt đất (sàn phòng tập, bậc không có trong va chạm): tính độ cao bàn chân theo mặt sàn đó.
    const floor = this.lift > 0 && this.lift < 0.6 ? this.lift : 0;
    const space = this.port.space;
    const key = this.blends.current || act[0]?.name || '';
    const feet: FootSample[] = this.feet.map((b, i) => {
      b.getWorldPosition(_p);
      const lx = _p.x;
      const ly = _p.y;
      const lz = _p.z;
      // Cây xương tách khỏi cảnh: vị trí trên là ở hệ của asset, đưa ra thế giới qua gốc asset.
      if (space) _p.applyMatrix4(space.matrixWorld);
      // Trượt theo vận tốc: chỉ lấy mẫu ở khung XƯƠNG vừa đổi (model ở xa chạy mixer 30 Hz; giữa hai lần đó bàn chân chỉ trôi theo gốc), vận tốc
      // tính trên cả khoảng giữa hai lần đổi cho cả bàn chân lẫn gốc nhân vật.
      const ref = this.strideRef[i];
      const moved = !space || !ref || Math.abs(lx - ref.lx) + Math.abs(ly - ref.ly) + Math.abs(lz - ref.lz) > 1e-6;
      if (moved && dt > 0) {
        if (ref) {
          const span = (now - ref.at) / 1000;
          const bx = s.x - ref.rx;
          const bz = s.z - ref.rz;
          const bd = Math.hypot(bx, bz);
          if (span > 1e-3 && span < 0.25 && bd > 1e-4) this.stride.push(key, ((_p.x - ref.wx) * bx + (_p.z - ref.wz) * bz) / bd / span, bd / span);
        }
        this.strideRef[i] = { lx, ly, lz, wx: _p.x, wz: _p.z, rx: s.x, rz: s.z, at: now };
      }
      return { x: _p.x, y: _p.y, z: _p.z, ground: ground(_p.x, _p.z) + floor };
    });
    const was = this.slide.now.map((f) => f.planted);
    this.slide.push(dt, key, s.x, s.z, feet);
    // Mốc bàn chân vừa chạm đất (nhấc → trụ): để so với tiếng bước chân.
    this.slide.now.forEach((f, i) => {
      if (f.planted && was[i] === false) {
        this.plants.push(now);
        if (this.plants.length > 300) this.plants.shift();
      }
    });
  }

  /** Danh sách clip của model đang soi (theo tên). */
  clips(): LabClip[] {
    if (!this.port) this.bind(this.pick()?.model ?? null);
    return [...(this.port?.clips.values() ?? [])].map((c) => ({ name: c.name, dur: c.duration })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Ép model đứng ở giây `t` của clip `name` (tua); `playing` = phát lặp clip đó thay vì đứng yên. Mọi clip khác của game tạm tắt.
   * `name` rỗng/null = thả, game điều khiển lại. Trả false nếu model không có clip đó.
   */
  hold(name: string | null, t = 0, playing = false): boolean {
    if (!name) {
      this.release();
      return true;
    }
    if (!this.port) this.bind(this.pick()?.model ?? null);
    const p = this.port;
    const src = p?.clips.get(name);
    if (!p || !src) return false;
    if (this.held?.name !== name) {
      this.release();
      // Bản sao clip → action riêng của xưởng, không đụng action game đang dùng cho clip này.
      const clip = src.clone();
      const action = p.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.setEffectiveWeight(1);
      action.play();
      this.held = { action, clip, name, playing };
      p.hook.pre = () => this.enforce();
    }
    const h = this.held!;
    h.playing = playing;
    h.action.paused = !playing;
    h.action.time = Math.max(0, Math.min(src.duration, t));
    return true;
  }

  /** Dịch mốc tua `frames` bước (`SCRUB_STEP`), dừng phát. */
  nudge(frames: number): boolean {
    const h = this.held;
    return !!h && this.hold(h.name, h.action.time + frames * SCRUB_STEP, false);
  }

  /** Chạy ngay trước `mixer.update`: chỉ để action của xưởng có trọng số. */
  private enforce(): void {
    const h = this.held;
    const p = this.port;
    if (!h || !p) return;
    for (const a of actionsOf(p.mixer)) {
      if (a === h.action) continue;
      if (a.enabled) {
        a.enabled = false;
        this.muted.add(a);
      }
    }
    h.action.enabled = true;
    h.action.paused = !h.playing;
  }

  private release(): void {
    const h = this.held;
    const p = this.port;
    this.held = null;
    if (p) p.hook.pre = null;
    for (const a of this.muted) a.enabled = true;
    this.muted.clear();
    if (!h) return;
    if (p) {
      h.action.stop();
      p.mixer.uncacheClip(h.clip);
    }
    // Lúc ép clip chân đứng theo clip chứ không theo game: bỏ mốc cũ để không tính thành trượt.
    this.slide.reset();
    this.blends.reset();
  }

  snapshot(): AnimSnapshot {
    if (!this.running) this.bind(this.pick()?.model ?? null);
    const h = this.held;
    return {
      ok: !!this.port,
      subject: this.subject,
      clips: this.clips(),
      active: this.active(),
      hold: h ? { name: h.name, t: h.action.time, dur: h.clip.duration, playing: h.playing } : null,
      clock: this.model?.performClock?.() ?? null,
      feet: this.feet.map((b, i) => ({ bone: b.name, ...(this.slide.now[i] ?? { h: 0, planted: false, v: 0 }) })),
      lift: this.lift,
      slide: this.slide.rows(),
      stride: this.stride.rows(),
      blends: [...this.blends.rows],
    };
  }
}

let inst: { game: Game; ws: AnimWorkshop } | null = null;

/** Xưởng của game đang chạy (một bản cho mỗi lớp Game; đổi game thì bản cũ tự dừng). */
export function animWorkshop(game: Game): AnimWorkshop {
  if (inst && inst.game !== game) {
    inst.ws.stop();
    inst = null;
  }
  inst ??= { game, ws: new AnimWorkshop(game) };
  return inst.ws;
}
