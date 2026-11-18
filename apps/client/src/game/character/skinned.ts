import * as THREE from 'three/webgpu';
import { bodyClassOf, canCancel, HIT_FEEL, hitDirOf, hitsPassed, lungeOffset, type MonsterDef, type SkillTiming } from '@dtl/shared';
import { groundAt } from '../../base/levelCtx';
import { HitReact, type HitOpts } from '../combat/hitreact';
import { IkRig } from './ikpose';
import { type PoseClips, type PoseLibrary, libraryClips } from './poseLib';
import { type SpringDef, type SpringParams, SpringBones } from './spring';
import { baseState, type CharState, type ClipMap, clipFor, LOCO_STATES, locomotionScale, MOVE_MIN } from './states';
import { type AnimState, type BossMoveKind, type CharacterView, type MonsterView, type PerformOpts, type SkillEvent } from './view';

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
  /** Tốc độ phát riêng theo trạng thái (vd. idle dài quá thì phát nhanh hơn, đòn dài hơn GCD thì rút). Mặc định 1. */
  rates?: Partial<Record<CharState, number>>;
  /**
   * Trần hệ số phát clip di chuyển. Clip chạy chậm hơn tốc độ thật nhiều thì phát đúng tỉ lệ sẽ giật cục;
   * chấp nhận chân trượt một chút thay vì vậy. Mặc định theo `locomotionScale` (2,6).
   */
  maxLocoScale?: number;
  /** Xác chìm xuống đất sau khi chết (quái: có; người chơi nằm chờ hồi sinh: không). Mặc định true. */
  sink?: boolean;
  /** Pose đã nướng cho asset này (người Mixamo): động tác chiêu, và clip nền bay/niệm chú qua `clipMap`. */
  poses?: PoseLibrary;
  /** Xương lò xo (vạt áo, M3-10): mô phỏng ở LOD0 khi trong khung nhìn. */
  springs?: readonly SpringDef[];
  /** Tự lấy mọi xương `dtl_o_*` của cây xương làm lò xo (quái có cánh/vạt dựng bằng chr_v3.py; không cần khai `springs`). */
  autoSprings?: boolean;
  /** Tham số lò xo (mặc định `SKIRT_SPRING` của spring.ts). */
  springParams?: SpringParams;
  /**
   * Bám địa hình (P2-E3): `biped` = IK chân hai đốt + hạ hông ở LOD0 (rig tên Mixamo); `quad` = nghiêng thân theo dốc.
   * Bỏ trống = không bám.
   */
  ground?: 'biped' | 'quad';
}

/** Tốc độ (1/giây) làm mượt chỉnh chân/hông và nghiêng thân theo dốc. */
const GROUND_RATE = 14;
const TILT_RATE = 8;
/** Nghiêng thân thú bốn chân tối đa (rad) và nửa chiều dài/rộng thân (m, scale 1) dùng đo dốc. */
const TILT_MAX = 0.45;
const QUAD_HALF_LEN = 0.6;
const QUAD_HALF_WID = 0.3;

const _footR = new THREE.Vector3();
const _footL = new THREE.Vector3();

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
  /** Null với động tác phụ chỉ dùng cánh tay (`gesture`). */
  lower: THREE.AnimationAction | null;
  /** Động tác phụ (rút/tra kiếm): không tính là ra đòn. */
  gesture: boolean;
  /** Thời điểm trong clip (giây). */
  t: number;
  from: number;
  /** Phần thân dưới theo pose (1 = đứng yên). */
  still: number;
  /** Đang tắt vì bị hủy: độ mạnh còn lại. */
  cancel: number;
  /** Thời gian chiêu từ dữ liệu (K-4); thiếu thì động tác chạy hết, không phát sự kiện. */
  timing?: SkillTiming;
  skill: string;
  combo: number;
  /** Tầm lao người hiển thị (m). */
  reach: number;
  /** Số mốc `hitAt` đã phát sự kiện, và đã báo `recovery` chưa. */
  fired: number;
  recovered: boolean;
  /** Độ mạnh của động tác trước lúc nối đòn: vào thế từ đó, không tụt về nền giữa hai đòn liên hoàn. */
  lead: number;
}

/** Tầm lao người hiển thị có giới hạn: dù dữ liệu ghi lớn thế nào hình cũng không rời người quá chừng này (m). */
const LUNGE_MAX = 1.5;
/** Nằm sau khi ngã trước khi đứng dậy (giây) và thời gian tối thiểu nằm trước khi di chuyển kéo dậy sớm. */
const KNOCK_LIE = 0.35;
/** Tốc độ phát clip ngã (3,7 s ở 1×: loạng choạng 1,2 s rồi mới ngã) và đứng dậy (1,6 s): nhanh hơn để không bắt người chơi nằm quá lâu. */
const KNOCK_RATE = 1.5;
/** Clip ngã dài hơn mức này (giây) mới phát nhanh `KNOCK_RATE`; clip ngắn (UAL Hit_Knockback 0,83 s) phát 1×. */
const KNOCK_LONG = 2;
/** Tốc độ phát clip tiếp đất (UAL) và nhịp nhảy: lấy đà phát 1,5×, tiếp đất 2,2× (≈0,6 s) và bị ngắt khi đi lại. */
const JUMP_START_RATE = 1.5;
const JUMP_LAND_RATE = 2.2;
/** Khoảng cách giữa hai lần idle xen kẽ của NPC (giây). */
const IDLE_GAP: [number, number] = [6, 14];
const GETUP_RATE = 1.3;
/** Clip lướt hiển thị: phát nhanh clip chạy. */
const DASH_RATE = 2.2;
/** Clip trúng đòn có hướng (K-3) theo phía bị đánh. */
const HIT_CLIPS = { front: ['hit_front_1', 'hit_front_2'], back: ['hit_back'], left: ['hit_l'], right: ['hit_r'] } as const;

/**
 * Khoảng cập nhật mixer (giây): nhân vật của mình mỗi khung; LOD0 tối đa 60 Hz (màn 120 Hz không cần hơn cho người
 * khác); LOD1 12 Hz; LOD2 8 Hz; ngoài khung nhìn thì không cập nhật (gộp dt, vào lại khung nhìn thì bắt kịp một lần).
 * Bộ xương chỉ đổi khi mixer chạy nên CPU giảm theo. Đo 50 người ở sân: mixer là phần lớn nhất còn lại sau khi tách xương.
 */
export function mixerInterval(level: number, inView = true, self = false): number {
  if (self) return 0;
  if (!inView) return Infinity;
  if (level <= 0) return 1 / 60;
  if (level === 1) return 1 / 12;
  return 1 / 8;
}

const MIXER_SLACK = 0.0015;

/** Thông tin nhìn của một khung (EntityManager tính theo camera, M3-9). */
interface ViewInfo {
  /** Khoảng cách tới camera (m). */
  dist: number;
  /** Khung cầu nằm trong frustum camera. */
  inView: boolean;
  /** Còn suất LOD0 (chỉ N thể gần camera nhất trong khung nhìn được LOD0). */
  allowLod0: boolean;
  /** Nhân vật của mình: luôn cập nhật mỗi khung. */
  self?: boolean;
}

/** Mức LOD theo khoảng cách camera; hết suất LOD0 thì tối thiểu LOD1. */
export function lodLevel(d: number, lodDist: readonly [number, number], allowLod0: boolean, levels: number): number {
  const want = d < lodDist[0] ? 0 : d < lodDist[1] ? 1 : 2;
  return Math.max(0, Math.min(allowLod0 ? want : Math.max(1, want), levels - 1));
}

interface Shot {
  state: CharState;
  action: THREE.AnimationAction;
  /** Thời gian còn lại (giây theo dt animation). */
  left: number;
  /** Đòn lớn của boss (`playMove`), không phải đòn thường. */
  move?: boolean;
  /** Hết thì nối sang clip này (ngã → đứng dậy). */
  next?: string;
  /** Đang nằm sau khi ngã: tuổi (giây) để kéo dậy sớm khi di chuyển. */
  lie?: number;
}

/** Động tác đòn lớn của boss: clip trong GLB và thời điểm chạm (giây trong clip, ở tốc độ 1×). */
export interface BossMove {
  clip: string;
  impact: number;
}

/** Giới hạn tốc độ phát động tác đòn lớn để khớp lúc chạm: chậm/nhanh hơn nữa thì động tác trông sai. */
const MOVE_RATE_MIN = 0.6;
const MOVE_RATE_MAX = 1.5;

/**
 * Tốc độ phát và thời gian chờ để khung `impact` của clip rơi đúng sau `delay` giây: ưu tiên phát ngay (đổi tốc độ
 * trong khoảng cho phép), còn dư thời gian thì chờ rồi mới phát.
 */
export function moveTiming(impact: number, delay: number): { rate: number; wait: number } {
  const rate = Math.min(MOVE_RATE_MAX, Math.max(MOVE_RATE_MIN, impact / Math.max(delay, 1e-3)));
  const wait = delay - impact / rate;
  return { rate, wait: wait > 1e-6 ? wait : 0 };
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
  /**
   * Cây xương, tách KHỎI cảnh (M3-9): xương ở hệ nhân vật, mesh có xương dùng `DetachedBindMode` nên vẫn theo `root`.
   * Ma trận xương chỉ tính lại khi mixer chạy (LOD0 mỗi khung, xa 15/10 Hz, ngoài khung nhìn thì không); đi lại chỉ
   * đổi ma trận của mesh. Mỗi lượt vẽ (cảnh chính, bóng) không còn duyệt ~60 xương của mỗi nhân vật.
   */
  readonly rig = new THREE.Group();
  readonly height: number;
  readonly hit: HitReact;
  readonly mixer: THREE.AnimationMixer;
  /** Mesh theo mức LOD (chỉ số = mức). */
  private lods: THREE.Mesh[][] = [];
  protected lodLevel = -1;
  private lodDist: [number, number];
  private clips = new Map<string, THREE.AnimationClip>();
  private actions = new Map<string, THREE.AnimationAction>();
  private map: ClipMap;
  private refSpeed: number;
  protected scene: THREE.Object3D;
  private current: THREE.AnimationAction | null = null;
  private base: CharState | null = null;
  private shot: Shot | null = null;
  /** Đòn trúng chờ (khớp lúc đạn bay tới, cùng trễ với chớp sáng). */
  private pendingHit = -1;
  private dead = false;
  private jumpIntro = false;
  private idleVariants: string[] = [];
  private idleWait = 0;
  /** Đã chết bao lâu (giây): sau `SINK_AFTER` xác chìm dần xuống đất (giống model khối). */
  private deadT = 0;
  private acc = 0;
  private interval = 0;
  private disposed = false;
  private rates: Partial<Record<CharState, number>>;
  private maxLoco: number;
  private sink: boolean;
  private poses: PoseLibrary | null;
  private perf: Perform | null = null;
  private pendingPerform: { id: string; from: number; left: number; o: PerformOpts } | null = null;
  /** Sự kiện chiêu (K-4). */
  onSkillEvent: ((e: SkillEvent) => void) | null = null;
  /** Tốc độ nền (m/s, đã nhân scale) của clip đi lại K-3 theo trạng thái. */
  private locoRef: Partial<Record<CharState, number>> = {};
  /** Có clip trúng đòn có hướng (K-3 đã nạp). */
  private dirHits = false;
  private hitOpts: HitOpts | null = null;
  private hitAlt = 0;
  /** Độ mạnh hiện tại của động tác chiêu (để nối đòn liên hoàn). */
  private lastEnv = 0;
  /** Lướt hiển thị: độ lệch ban đầu (thế giới), tuổi, thời lượng. */
  private dashOff: { fx: number; fz: number; t: number; dur: number } | null = null;
  /** Lớp con bật khi vừa giao chiến: đứng yên thì thủ thế dù `AnimState.combat` không có (người chơi). */
  protected combatBias = false;
  /** Lao người hiện tại (m, về trước), cho test. */
  lunge = 0;
  private pendingMove: { clip: string; rate: number; left: number } | null = null;
  /** Trạng thái nhận ở khung gần nhất (để quyết định có ra chiêu được không). */
  private last: AnimState | null = null;
  /** Số lần ra đòn (cho vệt/hạt theo nhân vật). */
  attacks = 0;
  private springs: SpringBones | null = null;
  /**
   * Báo ma trận xương đã đổi ngoài mixer (lò xo, kiếm đổi socket): `skeleton.update()` chỉ chạy lại khi phiên bản
   * cây xương đổi (M6-3, xem `skipUnchangedSkeletons`). Mixer chạy thì `rig.updateMatrixWorld` tự tăng.
   */
  protected rigChanged: () => void = () => {};
  /** Chân bám đất (người, quái hai chân): rig IK, trọng số bật/tắt, độ chỉnh đã làm mượt (hông, chân phải, chân trái). */
  private feet: IkRig | null = null;
  private feetW = 0;
  private feetOn = false;
  private feetD = { h: 0, r: 0, l: 0 };
  private rawHeight: number;
  private scaleS: number;
  private quad: boolean;
  private tiltX = 0;
  private tiltZ = 0;
  private springWorld = new THREE.Matrix4();
  /**
   * Trạng thái nền phải hiện ngay: cắt đòn thường đang phát (không cắt đòn lớn `playMove`) và không giật trúng đòn
   * khi đang ở đó. Boss: niệm chú, choáng (để người chơi đọc được lúc ngắt chú). Mặc định rỗng.
   */
  protected holdStates: ReadonlySet<CharState> = new Set();

  constructor(o: SkinnedOpts) {
    this.scene = o.scene;
    this.map = o.clipMap;
    const s = o.scale ?? 1;
    this.refSpeed = o.refSpeed * s;
    this.height = o.height * s;
    this.rawHeight = o.height;
    this.scaleS = s;
    this.quad = o.ground === 'quad';
    this.lodDist = o.lodDist ?? [22, 55];
    this.rates = o.rates ?? {};
    this.maxLoco = o.maxLocoScale ?? Infinity;
    this.sink = o.sink ?? true;
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
      if (o.bounds && (m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).boundingSphere = o.bounds;
      else if (!o.bounds) m.frustumCulled = false;
    });
    for (let i = 0; i < this.lods.length; i++) this.lods[i] ??= [];
    this.applyLod(0);
    this.inner.add(o.scene);
    this.root.add(this.inner);
    this.root.scale.setScalar(s);
    detachRig(o.scene, this.rig);
    this.rigChanged = skipUnchangedSkeletons(o.scene, this.rig);
    // Cây con GLB (sau khi tách xương chỉ còn node trung gian và mesh LOD) có biến đổi cục bộ không đổi: rung, chìm,
    // giật lùi ghi vào `inner`/`root`. Tính `matrix` một lần, khỏi compose lại mỗi khung cho ~10 node/nhân vật (M6-3).
    o.scene.traverse((n) => {
      n.updateMatrix();
      n.matrixAutoUpdate = false;
    });
    let springDefs: readonly SpringDef[] | undefined = o.springs;
    if (!springDefs?.length && o.autoSprings) {
      const found: SpringDef[] = [];
      this.rig.traverse((b) => {
        if (!(b as THREE.Bone).isBone || !b.name.startsWith('dtl_o_')) return;
        const child = b.children.find((c) => (c as THREE.Bone).isBone);
        found.push({ bone: b.name, tailLocal: (child ?? b).position.clone() });
      });
      springDefs = found;
    }
    if (springDefs?.length) this.springs = new SpringBones(this.rig, springDefs, o.springParams);
    // Phải dựng rig IK khi xương còn ở tư thế gốc (trước mixer).
    if (o.ground === 'biped') this.feet = IkRig.from(this.rig);
    this.mixer = new THREE.AnimationMixer(this.rig);
    this.hit = new HitReact(meshes);
    this.enterBase('idle', 0);
    this.mixer.update(0);
    this.rig.updateMatrixWorld(true);
  }

  attack(): void {
    // Đòn lớn (playMove) đang phát hoặc đang chờ phát: bỏ cú đánh thường để khung chạm vẫn trùng lúc vùng nổ
    // (server không khóa boss khi slam nên vẫn có thể cắn trong lúc đó; chớp sát thương vẫn hiện ở engine).
    if (this.dead || this.shot?.move || this.pendingMove) return;
    this.playShot('attack');
  }

  perform(id: string, o: PerformOpts = {}): boolean {
    const clips = this.poses?.get(id);
    if (!clips) return false;
    if (!this.canPerform()) return true;
    const from = Math.min(Math.max(0, o.from ?? 0), clips.def.duration);
    if (o.delay && o.delay > 0) {
      this.pendingPerform = { id, from, left: o.delay, o };
      return true;
    }
    this.startPerform(id, clips, from, false, o);
    return true;
  }

  /**
   * Phát clip đòn lớn một lần sao cho khung `impact` (giây, ở 1×) rơi đúng sau `delay` giây. Đang có đòn lớn khác
   * (vd. slam thả nhiều vùng cùng lúc) thì bỏ qua. Trả false nếu asset không có clip.
   */
  playMove(clip: string, impact: number, delay: number): boolean {
    if (!this.clips.has(clip)) return false;
    if (this.dead || this.pendingMove || this.shot?.move) return true;
    const { rate, wait } = moveTiming(impact, delay);
    if (wait > 0) this.pendingMove = { clip, rate, left: wait };
    else this.startMove(clip, rate);
    return true;
  }

  cancelPerform(): void {
    this.pendingPerform = null;
    const p = this.perf;
    // Đã ra đòn rồi thì để động tác chạy hết (hiệu ứng đã phóng).
    if (p && p.cancel >= 1 && p.t < (p.clips.def.hit?.[0] ?? 0)) {
      p.cancel = 0.999;
      this.emit(p, 'cancel', p.fired);
    }
  }

  /**
   * Hủy phần thu về (K-4): chỉ khi đã qua mốc hủy trong dữ liệu chiêu (`cancel.move`/`cancel.dash`). Trước mốc đó đòn
   * vẫn phải ra nên không hủy. Trả true nếu đã hủy.
   */
  cancelRecovery(kind: 'move' | 'dash'): boolean {
    const p = this.perf;
    if (!p || p.gesture || !p.timing || p.cancel < 1 || !canCancel(p.timing, p.t, kind)) return false;
    p.cancel = 0.999;
    this.emit(p, 'cancel', p.fired);
    return true;
  }

  /** Lướt hiển thị: hình xuất phát từ (fromX, fromZ) (thế giới) rồi trượt về chỗ thật trong `dur` giây; hủy thu về của chiêu đang phát. */
  dashFrom(fromX: number, fromZ: number, dur: number): void {
    if (this.dead) return;
    this.dashOff = { fx: fromX, fz: fromZ, t: 0, dur: Math.max(0.1, dur) };
    this.cancelRecovery('dash');
    if (!this.perf || this.perf.cancel < 1) {
      // Clip lướt UAL (dài ~1,6 s) co lại cho vừa thời gian lướt; clip chạy cũ phát nhanh cố định.
      const clip = clipFor('dash', this.map, this.hasClip);
      const len = clip ? this.clips.get(clip)?.duration ?? 0 : 0;
      this.playShot('dash', undefined, clip?.startsWith('ual_') && len > 0 ? Math.min(3, Math.max(1, len / Math.max(0.1, dur))) : DASH_RATE, dur);
    }
  }

  /** Bị hất ngã rồi đứng dậy (K-3 `knockdown` → `getup`). Thiếu clip thì bỏ qua. */
  knockdown(): void {
    if (this.dead || !this.clips.has('knockdown')) return;
    this.stopPerform();
    this.pendingPerform = null;
    const long = (this.clips.get('knockdown')?.duration ?? 0) > KNOCK_LONG;
    this.playShot('hit', 'knockdown', long ? KNOCK_RATE : 1, undefined, this.clips.has('getup') ? 'getup' : undefined, true);
  }

  /** NPC: xen các clip idle phụ (khoanh tay, nói chuyện, gật/lắc đầu...) vào lúc đứng nghỉ, cách nhau vài giây, lệch pha mỗi NPC. */
  setIdleVariants(names: readonly string[]): void {
    this.idleVariants = names.filter((n) => this.clips.has(n));
    this.idleWait = IDLE_GAP[0] + Math.random() * (IDLE_GAP[1] - IDLE_GAP[0]);
  }

  private updateIdleVariants(dt: number, want: CharState): void {
    if (!this.idleVariants.length) return;
    if (want !== 'idle' || this.shot || this.perf || this.dead) return;
    this.idleWait -= dt;
    if (this.idleWait > 0) return;
    this.idleWait = IDLE_GAP[0] + Math.random() * (IDLE_GAP[1] - IDLE_GAP[0]);
    this.playShot('idle', this.idleVariants[Math.floor(Math.random() * this.idleVariants.length)], 1);
  }

  /** Thêm clip nạp lười (thư viện K-3) và nối vào bảng clip: trạng thái nền được chọn lại ở khung kế. */
  addClips(clips: readonly THREE.AnimationClip[], map: ClipMap, locoRef: Partial<Record<CharState, number>> = {}, replace: readonly string[] = [], reselect = true): void {
    for (const c of clips) {
      if (this.clips.has(c.name) && !replace.includes(c.name)) continue;
      // Thay clip cũ cùng tên (UAL thay death, hit_light, knockdown...): bỏ action đã lưu để lần phát sau dùng clip mới.
      const old = this.actions.get(c.name);
      if (old) {
        // Action đang chạy thì để mixer tự tắt dần; chỉ gỡ khỏi bảng để lần phát sau dựng action từ clip mới.
        if (this.current !== old && this.shot?.action !== old) this.mixer.uncacheAction(old.getClip(), this.rig);
        this.actions.delete(c.name);
      }
      this.clips.set(c.name, c);
    }
    this.map = { ...this.map, ...map };
    for (const [k, v] of Object.entries(locoRef) as [CharState, number][]) this.locoRef[k] = v * this.scaleS;
    this.dirHits = this.clips.has('hit_back') && this.clips.has('hit_l') && this.clips.has('hit_r') && this.clips.has('hit_front_1');
    // Chọn lại nền (đứng/chạy dùng clip mới) mà không đụng đòn đang phát. `reselect = false`: chỉ thêm clip phụ (idle xen kẽ của NPC),
    // giữ nền đang chạy để không tua idle về 0 và mất lệch pha.
    if (reselect && !this.dead) this.base = null;
  }

  private emit(p: Perform, kind: SkillEvent['kind'], index: number): void {
    const hitIn = kind === 'windup' && p.timing ? Math.max(0, p.timing.hitAt[0] - p.t) : undefined;
    this.onSkillEvent?.({ kind, skill: p.skill, index, combo: p.combo, t: p.t, kb: !!p.timing?.kb, ...(hitIn !== undefined && { hitIn }) });
  }

  /** Lao người hiển thị và lướt: ghi vào `inner` (hệ cục bộ của root, đã chia scale), không đụng vị trí thật. */
  private updateOffsets(realDt: number): void {
    let fwd = 0;
    const p = this.perf;
    if (p?.timing && p.reach > 0 && !p.gesture) fwd = Math.min(LUNGE_MAX, lungeOffset(p.timing, p.t, p.reach)) * Math.min(1, p.cancel);
    this.lunge = fwd;
    let lx = 0;
    let lz = fwd;
    const d = this.dashOff;
    if (d) {
      d.t += realDt;
      if (d.t >= d.dur) this.dashOff = null;
      else {
        // Hình nội suy từ điểm xuất phát tới vị trí thật của root (do server/đối soát đặt): đúng dù gói vị trí mới đến trước hay sau.
        const x = d.t / d.dur;
        const k = 1 - x * x * (3 - 2 * x);
        let dx = d.fx - this.root.position.x;
        let dz = d.fz - this.root.position.z;
        const len = Math.hypot(dx, dz);
        // Chống dữ liệu lạ làm hình bay xa (tầm lướt tối đa của game là 12 m).
        if (len > 14) {
          dx = (dx / len) * 14;
          dz = (dz / len) * 14;
        }
        const yaw = this.root.rotation.y;
        lx += (dx * Math.cos(yaw) - dz * Math.sin(yaw)) * k;
        lz += (dx * Math.sin(yaw) + dz * Math.cos(yaw)) * k;
      }
    }
    const inv = 1 / this.scaleS;
    this.inner.position.x += lx * inv;
    this.inner.position.z = lz * inv;
  }

  performing(id: string): boolean {
    return this.perf?.id === id || this.pendingPerform?.id === id;
  }

  hitReact(o: HitOpts): void {
    this.hit.react(o);
    this.hitOpts = o;
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

  /** Độ dài (giây) clip theo tên trong bảng clip của model, 0 nếu không có. */
  clipLength(clip: string): number {
    return this.clips.get(clip)?.duration ?? 0;
  }

  get lod(): number {
    return this.lodLevel;
  }

  /** Chỉ theo khoảng cách (luôn trong khung nhìn, được LOD0). */
  setViewDistance(d: number): void {
    this.setView({ dist: d, inView: true, allowLod0: true, self: d <= 0 });
  }

  /** LOD, bóng và nhịp mixer theo camera (M3-9). */
  setView(v: ViewInfo): void {
    const level = lodLevel(v.dist, this.lodDist, v.allowLod0, this.lods.length);
    this.applyLod(level);
    this.interval = mixerInterval(level, v.inView, v.self);
    // Ngoài khung nhìn: bỏ cả cây xương khỏi lượt tính ma trận và lượt dựng danh sách vẽ (mỗi pass).
    this.inner.visible = v.inView;
    this.inner.matrixWorldAutoUpdate = v.inView;
  }

  update(realDt: number, a: AnimState): void {
    const dt = this.hit.update(realDt);
    this.inner.position.x = this.hit.shake;
    if (this.pendingHit >= 0) {
      this.pendingHit -= realDt;
      if (this.pendingHit < 0) this.onHit();
    }

    const want = baseState(a, this.refSpeed, this.combatBias);
    if (want === 'death') {
      if (!this.dead) {
        this.dead = true;
        this.shot = null;
        this.pendingHit = -1;
        this.pendingMove = null;
        this.enterBase('death', FADE_DEATH);
      }
      this.deadT += dt;
      if (this.sink) this.inner.position.y = -Math.max(0, this.deadT - SINK_AFTER) * SINK_RATE;
    } else {
      if (this.dead) {
        // Hồi sinh: bỏ tư thế chết.
        this.dead = false;
        this.base = null;
        this.deadT = 0;
        this.inner.position.y = 0;
      }
      if (this.pendingMove) {
        this.pendingMove.left -= dt;
        if (this.pendingMove.left <= 0) {
          const { clip, rate } = this.pendingMove;
          this.pendingMove = null;
          this.startMove(clip, rate);
        }
      }
      if (this.shot && this.holdStates.has(want) && (!this.shot.move || want === 'stun')) {
        this.shot = null;
        this.pendingMove = want === 'stun' ? null : this.pendingMove;
        this.base = null;
      }
      if (this.shot) {
        this.shot.left -= dt;
        const sh = this.shot;
        if (sh.lie !== undefined) {
          sh.lie += dt;
          // Đã ngã xong (đang nằm hết `KNOCK_LIE`) mà người chơi đi lại thì đứng dậy ngay; chưa ngã xong thì chưa dậy.
          if (sh.next && sh.left <= KNOCK_LIE && a.speed > MOVE_MIN) sh.left = Math.min(sh.left, FADE_OUT_SHOT);
        }
        if (sh.left <= FADE_OUT_SHOT) {
          if (sh.next && this.clips.has(sh.next)) this.playShot('hit', sh.next, GETUP_RATE);
          else {
            this.shot = null;
            this.base = null;
          }
        }
      }
      if (want !== 'jump') this.jumpIntro = false;
      if (this.shot?.state === 'jump' && a.speed > MOVE_MIN) this.shot.left = Math.min(this.shot.left, FADE_OUT_SHOT);
      if (!this.shot && want !== this.base) {
        if (want === 'jump' && !this.jumpIntro && this.clips.has('ual_jump_start')) {
          // Lấy đà rồi mới lơ lửng (clip UAL NinjaJump_Start); sau đó `base` được chọn lại thành `jump`.
          this.jumpIntro = true;
          this.base = want;
          this.playShot('jump', 'ual_jump_start', JUMP_START_RATE);
        } else if (this.base === 'jump' && (want === 'idle' || want === 'combatIdle') && a.speed <= MOVE_MIN && this.clips.has('ual_jump_land')) {
          // Chỉ tiếp đất khi trở về đứng trên đất; sang bay/niệm chú... thì vào thẳng trạng thái mới.
          this.base = want;
          this.playShot('jump', 'ual_jump_land', JUMP_LAND_RATE);
        } else this.enterBase(want, FADE_BASE);
      }
      this.updateIdleVariants(dt, want);
      if (!this.shot && this.current) {
        if (LOCO_STATES.has(want)) this.current.timeScale = Math.min(want === 'walk' || want === 'run' ? this.maxLoco : 2.2, locomotionScale(a.speed, this.locoRef[want] ?? this.refSpeed));
        else if (want === 'combatIdle' && clipFor('combatIdle', this.map, this.hasClip) === this.map.idle) this.current.timeScale = COMBAT_IDLE_RATE * (this.rates.idle ?? 1);
        else this.current.timeScale = this.rates[want] ?? 1;
      }
    }

    this.last = a;
    this.updatePerform(dt, a);
    this.updateOffsets(realDt);

    // Hạ tần số mixer ở xa: gộp dt, cập nhật bộ xương thưa hơn.
    this.acc += dt;
    // Dung sai 1,5 ms: ở 60 khung/giây dt dao động quanh 1/60, không để LOD0 tụt xuống 30 Hz vì làm tròn.
    if (this.acc > 0 && this.acc >= this.interval - MIXER_SLACK) {
      this.mixer.update(this.acc);
      if (this.feet) this.groundFeet(this.acc, a);
      this.rig.updateMatrixWorld(true);
      this.acc = 0;
    }
    if (this.quad) this.tiltToSlope(dt);
    this.postPose(dt, a);
    this.updateSprings(dt);
  }

  /** Móc cho lớp con: chỉnh xương sau khi mixer chạy, trước lò xo (cánh vỗ). `rig.matrixWorld` đã mới nếu khung này mixer chạy. */
  protected postPose(_dt: number, _a: AnimState): void {}

  /** Đang chỉnh chân theo địa hình (cho test và đo). */
  get footIkActive(): boolean {
    return this.feetOn;
  }

  /**
   * Chân bám đất (P2-E3), ngay sau khi mixer đặt tư thế: đo cổ chân của clip, lấy độ cao mặt đất dưới từng chân so với
   * dưới thân, hạ hông theo chân thấp hơn rồi IK hai đốt đưa mỗi chân tới mặt đất. Chỉ LOD0 trong khung nhìn, đang đứng
   * trên đất (không bay, nhảy, thiền, chết); chuyển bật/tắt bằng trọng số để không giật.
   */
  private groundFeet(dt: number, a: AnimState): void {
    const feet = this.feet!;
    const want = this.lodLevel === 0 && this.inner.visible && !a.dead && !a.flying && !a.airborne && !a.meditating ? 1 : 0;
    this.feetW += Math.sign(want - this.feetW) * Math.min(Math.abs(want - this.feetW), dt * 6);
    if (this.feetW <= 0.001) {
      if (this.feetOn) {
        feet.releaseFeet();
        this.feetOn = false;
        this.feetD.h = this.feetD.r = this.feetD.l = 0;
      }
      return;
    }
    if (!feet.measureFeet(_footR, _footL)) return;
    const r = this.root;
    const s = this.scaleS;
    const sin = Math.sin(r.rotation.y);
    const cos = Math.cos(r.rotation.y);
    const base = groundAt(r.position.x, r.position.z);
    const lim = 0.25 * this.rawHeight;
    const drop = (p: THREE.Vector3) => {
      const wx = r.position.x + (p.x * cos + p.z * sin) * s;
      const wz = r.position.z + (-p.x * sin + p.z * cos) * s;
      return Math.max(-lim, Math.min(lim, (groundAt(wx, wz) - base) / s));
    };
    const dR = drop(_footR);
    const dL = drop(_footL);
    // Hông theo chân thấp hơn (chân cao gập gối thêm); nâng tối đa ít hơn hạ để chân thấp không duỗi quá tầm.
    const h = Math.max(-lim, Math.min(lim * 0.4, Math.min(dR, dL)));
    const k = this.feetOn ? 1 - Math.exp(-dt * GROUND_RATE) : 1;
    const d = this.feetD;
    d.h += (h - d.h) * k;
    d.r += (dR - d.r) * k;
    d.l += (dL - d.l) * k;
    this.feetOn = true;
    const w = this.feetW;
    feet.groundFeet(d.h * w, d.r * w, d.l * w);
  }

  /** Thú bốn chân: nghiêng thân theo dốc dưới trước/sau/trái/phải (chỉ khi trong khung nhìn, LOD0–1). */
  private tiltToSlope(dt: number): void {
    const r = this.root;
    let tx = 0;
    let tz = 0;
    if (this.lodLevel <= 1 && this.inner.visible && !this.dead) {
      const s = this.scaleS;
      const sin = Math.sin(r.rotation.y);
      const cos = Math.cos(r.rotation.y);
      const L = QUAD_HALF_LEN * s;
      const W = QUAD_HALF_WID * s;
      const x = r.position.x;
      const z = r.position.z;
      const slopeZ = (groundAt(x + sin * L, z + cos * L) - groundAt(x - sin * L, z - cos * L)) / (2 * L);
      const slopeX = (groundAt(x + cos * W, z - sin * W) - groundAt(x - cos * W, z + sin * W)) / (2 * W);
      tx = -Math.max(-TILT_MAX, Math.min(TILT_MAX, Math.atan(slopeZ)));
      tz = Math.max(-TILT_MAX, Math.min(TILT_MAX, Math.atan(slopeX)));
    }
    const k = 1 - Math.exp(-dt * TILT_RATE);
    this.tiltX += (tx - this.tiltX) * k;
    this.tiltZ += (tz - this.tiltZ) * k;
    if (Math.abs(this.tiltX) < 1e-4 && Math.abs(this.tiltZ) < 1e-4 && tx === 0 && tz === 0) this.tiltX = this.tiltZ = 0;
    this.inner.rotation.set(this.tiltX, 0, this.tiltZ);
  }

  /** Số xương lò xo đang mô phỏng (0 nếu không có hoặc đang nghỉ ở LOD xa). Cho đo hiệu năng. */
  get springCount(): number {
    return this.springs && this.lodLevel === 0 && this.inner.visible ? this.springs.count : 0;
  }

  private updateSprings(dt: number): void {
    const sp = this.springs;
    if (!sp) return;
    if (this.lodLevel !== 0 || !this.inner.visible) {
      if (sp.reset()) this.rigChanged();
      return;
    }
    const r = this.root;
    this.springWorld.compose(r.position, r.quaternion, r.scale);
    if (r.parent) this.springWorld.premultiply(r.parent.matrixWorld);
    sp.update(dt, this.springWorld);
    this.rigChanged();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hit.reset();
    this.perf = null;
    this.pendingPerform = null;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rig);
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

  /**
   * Động tác phụ chỉ dùng cánh tay phải (pose có clip `arm`, vd. rút/tra kiếm), chồng lên mọi trạng thái nền kể cả
   * chạy. Không tính là ra đòn. Bỏ qua (trả false) nếu không có pose, không ra chiêu được, hoặc đang có động tác khác.
   */
  protected gesture(id: string): boolean {
    const clips = this.poses?.get(id);
    if (!clips?.arm || !this.canPerform() || this.perf || this.pendingPerform) return false;
    this.startPerform(id, clips, 0, true);
    return true;
  }

  /** Thời điểm (giây trong clip) của động tác `id` đang phát; null nếu không phát (đã hết hoặc bị thay). */
  protected performTime(id: string): number | null {
    const p = this.perf;
    return p && p.id === id && p.cancel >= 1 ? p.t : null;
  }

  private startPerform(id: string, clips: PoseClips, from: number, gesture = false, o: PerformOpts = {}): void {
    const lead = this.perf && !this.perf.gesture && this.perf.cancel >= 1 && !gesture ? this.lastEnv : 0;
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
    if (gesture) {
      this.perf = { id, clips, upper: act(clips.arm!), lower: null, gesture, t: from, from, still: 0, cancel: 1, skill: '', combo: -1, reach: 0, fired: 0, recovered: false, lead: 0 };
      return;
    }
    const tm = o.timing;
    this.perf = {
      id, clips, upper: act(clips.upper), lower: act(clips.lower), gesture, t: from, from, still: moving ? 0 : 1, cancel: 1,
      timing: tm, skill: o.skill ?? '', combo: o.combo ?? -1, reach: Math.min(LUNGE_MAX, o.reach ?? 0), fired: tm ? hitsPassed(tm, from) : 0, recovered: false, lead,
    };
    if (tm) this.emit(this.perf, 'windup', 0);
    // Đòn một lần của clip nền (vd. attack 1,2s của Tripo) nhường chỗ cho động tác chiêu.
    if (this.shot) this.shot.left = Math.min(this.shot.left, FADE_OUT_SHOT);
    this.attacks++;
  }

  private stopPerform(): void {
    const p = this.perf;
    if (!p) return;
    p.upper.stop();
    p.lower?.stop();
    this.perf = null;
  }

  /** Đồng hồ animation của động tác chiêu đang phát (giây từ lúc bấm, dừng khi hit-stop) và id chiêu; null nếu không có (K-6). */
  performClock(): { t: number; skill: string } | null {
    const p = this.perf;
    return p && p.timing && p.cancel >= 1 ? { t: p.t, skill: p.skill } : null;
  }

  private updatePerform(dt: number, a: AnimState): void {
    const q = this.pendingPerform;
    if (q) {
      q.left -= dt;
      if (q.left <= 0) {
        this.pendingPerform = null;
        const clips = this.poses?.get(q.id);
        if (clips && this.canPerform(a)) this.startPerform(q.id, clips, q.from, false, q.o);
      }
    }
    const p = this.perf;
    if (!p) return;
    p.t += dt;
    const dur = p.clips.def.duration;
    if (!this.canPerform(a) && p.cancel >= 1) p.cancel = 0.999;
    if (p.cancel < 1) p.cancel -= dt / PERFORM_CANCEL;
    const tm = p.timing;
    if (tm && p.cancel >= 1) {
      // Sự kiện đúng khung: mốc `hitAt` phát một lần mỗi mốc theo đồng hồ animation (dừng khi hit-stop).
      const n = hitsPassed(tm, p.t);
      while (p.fired < n) this.emit(p, 'hit', p.fired++);
      if (!p.recovered && p.t >= tm.hitAt[tm.hitAt.length - 1]) {
        p.recovered = true;
        this.emit(p, 'recovery', p.fired);
      }
      // Đã ra đòn mà đang đi lại → cắt thu về (cửa sổ hủy lấy từ dữ liệu chiêu).
      if (a.speed > MOVE_MIN && canCancel(tm, p.t, 'move')) this.cancelRecovery('move');
    }
    if (p.t >= dur || p.cancel <= 0) {
      if (p.cancel >= 1 && tm) this.emit(p, 'end', p.fired);
      this.stopPerform();
      return;
    }
    const still = a.speed <= MOVE_MIN ? 1 : 0;
    p.still += Math.sign(still - p.still) * Math.min(Math.abs(still - p.still), STILL_RATE * dt);
    const ramp = p.lead + (1 - p.lead) * Math.min(1, (p.t - p.from) / PERFORM_IN);
    const env = Math.min(ramp, (dur - p.t) / PERFORM_OUT) * Math.min(1, p.cancel);
    this.lastEnv = Math.max(0, env);
    p.upper.setEffectiveWeight(overlayWeight(env));
    p.lower?.setEffectiveWeight(overlayWeight(env * p.still));
  }

  private onHit(): void {
    this.pendingHit = -1;
    // Đang cắn thì không cắt ngang (đọc được đòn quan trọng hơn); chết rồi thì thôi.
    if (this.dead || this.shot?.state === 'attack' || (this.perf && !this.perf.gesture) || (this.base && this.holdStates.has(this.base))) return;
    // Đang ngã/đứng dậy thì không giật thêm.
    if (this.shot?.lie !== undefined || this.shot?.next) return;
    const o = this.hitOpts;
    this.hitOpts = null;
    this.playShot('hit', this.dirHits && o ? this.hitClipFor(o) : undefined, 1);
  }

  /** Clip trúng đòn theo hướng và mức đòn (người có thư viện K-3): nặng → `hit_heavy`, còn lại theo phía bị đánh. */
  private hitClipFor(o: HitOpts): string | undefined {
    if (o.heavy && this.clips.has('hit_heavy')) return 'hit_heavy';
    if (!o.dirX && !o.dirZ) return undefined;
    const list = HIT_CLIPS[hitDirOf(this.root.rotation.y, o.dirX ?? 0, o.dirZ ?? 0)];
    return list[this.hitAlt++ % list.length];
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
      act.timeScale = this.rates.death ?? 1;
    } else {
      act.setLoop(THREE.LoopRepeat, Infinity);
      act.clampWhenFinished = false;
      // Clip đang tắt dần (vd. vừa ra khỏi một đòn) thì chạy tiếp từ chỗ cũ, không giật về khung đầu.
      if (!act.isRunning() && act !== this.current) act.time = 0;
    }
    this.fadeTo(act, fade);
  }

  private playShot(state: CharState, name?: string, rateOverride?: number, dur?: number, next?: string, lie = false): void {
    let act: THREE.AnimationAction | null;
    if (name && this.clips.has(name)) {
      act = this.actions.get(name) ?? null;
      if (!act) {
        act = this.mixer.clipAction(this.clips.get(name)!);
        this.actions.set(name, act);
      }
    } else act = this.action(state);
    if (!act) return;
    const clip = act.getClip();
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    const rate = rateOverride ?? this.rates[state] ?? 1;
    act.timeScale = rate;
    act.reset();
    this.fadeTo(act, FADE_IN_SHOT);
    this.shot = { state, action: act, left: dur ?? clip.duration / rate + (lie ? KNOCK_LIE : 0), next, lie: lie ? 0 : undefined };
  }

  private startMove(clip: string, rate: number): void {
    let act = this.actions.get(clip);
    if (!act) {
      act = this.mixer.clipAction(this.clips.get(clip)!);
      this.actions.set(clip, act);
    }
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.timeScale = rate;
    act.reset();
    this.fadeTo(act, FADE_IN_SHOT);
    // Trạng thái 'attack': trúng đòn không cắt ngang động tác (xem onHit).
    this.shot = { state: 'attack', action: act, left: act.getClip().duration / rate, move: true };
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
    // Chỉ LOD0 đổ bóng: pass bóng vẽ lại cả lưới, ở xa bóng nhỏ không thấy khác.
    for (let i = 0; i < this.lods.length; i++)
      for (const m of this.lods[i]) {
        m.visible = i === level;
        // Phụ kiện đồ bộ (`userData.noShadow`) không đổ bóng: nhỏ, và mỗi mesh đổ bóng là thêm một draw call ở pass bóng.
        m.castShadow = i === level && level === 0 && !m.userData.noShadow;
      }
    this.onLod(level);
  }

  /** Lớp con ẩn/gộp phần phụ (vd. hào quang phi kiếm) theo mức LOD. */
  protected onLod(_level: number): void {}
}

/**
 * Dời cây xương của `scene` sang `rig` (ngoài cảnh). Mỗi xương gốc giữ biến đổi của cha cũ (vd. Armature scale 0,01 của
 * Mixamo) qua một nhóm đệm, nên ma trận xương trong `rig` bằng ma trận trong hệ `scene`. Mesh có xương chuyển sang
 * `DetachedBindMode`: đỉnh = matrixWorld(mesh) · bindMatrix⁻¹ · xương(hệ scene) · boneInverse · bindMatrix, đúng vì
 * bindMatrix là ma trận của mesh trong hệ scene lúc bind.
 */
function detachRig(scene: THREE.Object3D, rig: THREE.Group): void {
  scene.updateMatrixWorld(true);
  const toScene = scene.matrixWorld.clone().invert();
  const tops: THREE.Bone[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone && !(o.parent as THREE.Bone | null)?.isBone) tops.push(o as THREE.Bone);
  });
  for (const b of tops) {
    const holder = new THREE.Group();
    holder.name = b.parent?.name ?? '';
    toScene.clone().multiply(b.parent!.matrixWorld).decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(b);
    rig.add(holder);
  }
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).bindMode = THREE.DetachedBindMode;
  });
  rig.updateMatrixWorld(true);
}

/**
 * three gọi `skeleton.update()` (nhân ~60 ma trận xương với boneInverse) mỗi khung cho mọi mesh có xương được vẽ, kể cả
 * khi bộ xương không đổi (M6-3, profile 100 người ở rừng: ~1,5 ms/khung). Với cây xương tách khỏi cảnh, ma trận xương
 * chỉ đổi khi `rig.updateMatrixWorld` chạy (mixer cập nhật: LOD1 12 Hz, LOD2 8 Hz, ngoài khung nhìn thì không), nên
 * đếm phiên bản ở đó và bỏ qua `skeleton.update()` khi phiên bản chưa đổi. Trả về hàm tăng phiên bản cho chỗ đổi xương
 * ngoài mixer (lò xo, kiếm đổi socket).
 */
function skipUnchangedSkeletons(scene: THREE.Object3D, rig: THREE.Object3D): () => void {
  let version = 0;
  const updateRig = rig.updateMatrixWorld.bind(rig);
  rig.updateMatrixWorld = (force?: boolean) => {
    version++;
    updateRig(force);
  };
  const seen = new Set<THREE.Skeleton>();
  scene.traverse((o) => {
    const sk = (o as THREE.SkinnedMesh).skeleton;
    if (!sk || seen.has(sk)) return;
    seen.add(sk);
    let at = -1;
    sk.update = function (this: THREE.Skeleton) {
      if (at === version) return;
      at = version;
      THREE.Skeleton.prototype.update.call(this);
    };
  });
  return () => {
    version++;
  };
}

/** Quái dùng model có xương; cùng interface với `MonsterModel` (model khối). */
const _wq0 = new THREE.Quaternion();
const _wq1 = new THREE.Quaternion();
const _wq2 = new THREE.Quaternion();
const _wq3 = new THREE.Quaternion();
const _wf = new THREE.Quaternion();
const _wz = new THREE.Vector3(0, 0, 1);

export class SkinnedMonster extends SkinnedCharacter implements MonsterView {
  private moves: Partial<Record<BossMoveKind, BossMove>>;
  /** Vật rời (kiếm) bám theo một xương: cây xương đã tách khỏi cảnh (`detachRig`) nên không thể gắn mesh làm con xương, mỗi khung chép ma trận xương sang mesh. */
  private props: { bone: THREE.Object3D; mesh: THREE.Object3D; local: THREE.Matrix4 }[] = [];

  constructor(
    readonly def: MonsterDef,
    o: Omit<SkinnedOpts, 'scale'> & { moves?: Partial<Record<BossMoveKind, BossMove>> },
  ) {
    super({ ...o, scale: def.scale });
    this.moves = o.moves ?? {};
    this.holdStates = new Set<CharState>(['cast', 'stun']);
    this.hit.feel = HIT_FEEL[bodyClassOf(def)];
  }

  /**
   * Gắn vật rời vào xương `boneName` (DV-2 đợt 3: kiếm Tẫn Hỏa của Kiếm Cơ). Trục +Y của mesh hướng lên trời ở tư thế nghỉ
   * (cùng quy ước kiếm người chơi), gốc mesh ở tâm xương, `scale` nhân kích thước. False nếu không có xương.
   */
  mountProp(boneName: string, mesh: THREE.Object3D, scale: number): boolean {
    const bone = this.rig.getObjectByName(boneName);
    if (!bone) return false;
    this.rig.updateMatrixWorld(true);
    const q = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    const local = new THREE.Matrix4().compose(new THREE.Vector3(), q, new THREE.Vector3(scale, scale, scale));
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    this.inner.add(mesh);
    this.props.push({ bone, mesh, local });
    this.syncProps();
    return true;
  }

  override update(realDt: number, a: AnimState): void {
    super.update(realDt, a);
    this.syncProps();
  }

  /** Cánh vỗ (DV-2 đợt 4): xương gốc `dtl_wing_<chuỗi>_<l|r>` do chr_v3.py dựng, các đốt sau là lò xo `dtl_o_wing_*`. Null khi chưa dò. */
  private wings: { bone: THREE.Bone; rest: THREE.Quaternion; sign: number; amp: number; phase: number }[] | null = null;
  private flapT = 0;

  protected override postPose(dt: number, a: AnimState): void {
    if (!this.wings) {
      this.wings = [];
      this.rig.traverse((o) => {
        const m = /^dtl_wing_(up|mid|low)_(l|r)$/.exec(o.name);
        if (!m || !(o as THREE.Bone).isBone) return;
        const amp = m[1] === 'up' ? 1 : m[1] === 'mid' ? 0.8 : 0.55;
        this.wings!.push({ bone: o as THREE.Bone, rest: o.quaternion.clone(), sign: m[2] === 'l' ? 1 : -1, amp, phase: m[1] === 'low' ? 0.8 : m[1] === 'mid' ? 0.3 : 0 });
      });
    }
    if (!this.wings.length || this.lodLevel > 1 || a.dead) return;
    const moving = a.speed > 0.5;
    const fast = a.casting || a.combat ? 1.4 : moving ? 1.1 : 0.45;
    this.flapT += dt * fast;
    this.rig.updateMatrixWorld(true);
    const rigInv = _wq0.copy(this.rig.getWorldQuaternion(_wq1)).invert();
    for (const w of this.wings) {
      const ang = (moving ? 0.26 : 0.13) * w.amp * Math.sin(this.flapT * Math.PI * 2 * 0.9 + w.phase * Math.PI);
      const par = w.bone.parent;
      if (!par) continue;
      // Phép xoay quanh trục trước-sau của mô hình (Z của cây xương), cùng chiều với cánh trái (+X) đưa đầu cánh lên.
      _wf.setFromAxisAngle(_wz, ang * w.sign);
      const pr = _wq2.copy(par.getWorldQuaternion(_wq3)).premultiply(rigInv);
      w.bone.quaternion.copy(pr).invert().multiply(_wf).multiply(pr).multiply(w.rest);
    }
  }

  private syncProps(): void {
    for (const p of this.props) {
      p.mesh.matrix.multiplyMatrices(this.scene.matrix, p.bone.matrixWorld).multiply(p.local);
      p.mesh.matrixWorldNeedsUpdate = true;
    }
  }

  bossMove(kind: BossMoveKind, delay: number): boolean {
    const m = this.moves[kind];
    return !!m && this.playMove(m.clip, m.impact, delay);
  }

}
