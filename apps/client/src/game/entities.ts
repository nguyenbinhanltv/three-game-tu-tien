import * as THREE from 'three/webgpu';
import { E4_OFF } from './camZones';
import { boxesOverlap, fitFactor, screenWidthPx, type Box } from './screenFit';
import { DUNGEON_EXIT, groundAt, MF_CHANT, MF_STUN, MS_ATTACK, MS_CHASE, MS_DEAD, PF_CASTING, PF_DEAD, PF_FLYING, PF_MEDITATING, PORTAL_POS } from '@dtl/shared';
import { APPEARANCE, SET, MONSTER, monsterName, NPCS, QUESTS, realmName, t } from '@dtl/content';
import { bodyRadiusOf, PLAYER_BODY_RADIUS } from '@dtl/shared';
import { type Body, solveSeparation } from './separation';
import { hashName as hashStr, legacyAppearance, type QuestView } from '@dtl/shared';
import { buildNode, disposeLabel, Humanoid, makeLabel } from './models';
import { type AnimState, type CharacterView, type MonsterView, P2E_OFF } from './character/view';
import { MonsterSkins } from './character/monsterSkins';
import { NpcSkins } from './character/npcSkins';
import { type PlayerLook, PlayerSkins } from './character/playerSkins';
import { hitStopFor } from './hitreact';
import { BAR_ALLY, BAR_BOSS, BAR_ENEMY, HeadBars } from './headBars';
import { HpTrail } from './hpTrail';
import { ArtifactVis } from './artifactVis';

export interface PState {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vy: number;
  gr: boolean;
  fl: number;
  lv: number;
  hp: number;
  mhp: number;
  mp: number;
  mmp: number;
  seq: number;
  wp: string;
  /** Bậc phát sáng của vũ khí (0/1/2); server cũ chưa gửi thì undefined. */
  wg?: number;
  /** Ngoại hình: giới tính, id màu áo (appearance.json). Server cũ chưa gửi thì undefined. */
  g?: string;
  dye?: string;
  /** Bộ trang bị đang nhuộm áo/ánh kiếm (id bộ); '' hoặc thiếu = không. */
  sk?: string;
  /** id pháp bảo phụ đang đeo (P3-8); '' hoặc thiếu = không. */
  art?: string;
}
export interface MState {
  t: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  mhp: number;
  lv: number;
  st: number;
  /** Cờ MF_* và thời điểm server (ms) hết trạng thái đó. */
  mf?: number;
  ce?: number;
  /** Boss: pha hiện tại (0 = pha đầu) và thanh phá thế 0–100. */
  ph?: number;
  pz?: number;
}
export interface NState {
  t: string;
  x: number;
  y: number;
  z: number;
  on: boolean;
}
export interface WorldView {
  level: string;
  players: Map<string, PState>;
  monsters: Map<string, MState>;
  nodes: Map<string, NState>;
}

/** Ngoại hình hiển thị: theo server; server cũ chưa gửi thì màu theo tên như trước. */
function lookOf(s: PState): PlayerLook {
  const base = s.dye ? { g: s.g || APPEARANCE.defaultGender, dye: s.dye } : legacyAppearance(APPEARANCE, s.name);
  return s.sk && SET.has(s.sk) ? { ...base, set: s.sk } : base;
}

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** Thanh trên đầu còn hiện bao lâu (giây) sau lần cuối máu đổi. */
const COMBAT_LINGER = 6;
/** Tốc độ hiện/ẩn thanh (độ mờ mỗi giây). */
const BAR_FADE = 6;

/**
 * Trạng thái hiển thị thanh trên đầu của một thực thể: đoạn trễ, lúc hết giao chiến, độ mờ.
 * Chỉ hiện khi đang giao chiến (máu vừa đổi, quái đang đuổi/đánh) hoặc đang là mục tiêu.
 */
class BarState {
  trail = new HpTrail(1);
  alpha = 0;
  private lastHp = -1;
  private combatUntil = 0;
  constructor(
    public width: number,
    public kind: number,
  ) {}
  /** Trả về độ mờ (0 thì không vẽ). */
  tick(hp: number, mhp: number, engaged: boolean, dead: boolean, dt: number, time: number): number {
    const frac = mhp > 0 ? hp / mhp : 0;
    if (this.lastHp >= 0 && hp !== this.lastHp) this.combatUntil = time + COMBAT_LINGER;
    this.lastHp = hp;
    const show = !dead && (engaged || time < this.combatUntil);
    if (show && this.alpha <= 0) this.trail.reset(frac);
    this.alpha = Math.max(0, Math.min(1, this.alpha + (show ? BAR_FADE : -BAR_FADE) * dt));
    if (dead) this.alpha = 0;
    this.trail.update(frac, dt);
    return this.alpha;
  }
}

export class PlayerVis {
  model: CharacterView;
  /** Ngoại hình model đang dựng (đổi thì dựng lại). */
  look: PlayerLook;
  /** Đang dùng model khối tạm trong lúc asset model mới còn nạp. */
  skinPending: boolean;
  label: THREE.Sprite;
  bar = new BarState(1.3, BAR_ALLY);
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  speed = 0;
  fl = 0;
  lv = 0;
  /** Pháp bảo phụ đang đeo (nạp lười khi có `s.art`). */
  art: ArtifactVis | null = null;
  constructor(
    public sid: string,
    public s: PState,
    public local: boolean,
    skins: PlayerSkins,
  ) {
    this.look = lookOf(s);
    this.model = skins.create(this.look);
    this.skinPending = skins.pending(this.look);
    this.label = makeLabel(s.name, local ? '#bfe8ff' : '#ffffff', realmName(s.lv));
    this.lv = s.lv;
    this.label.position.y = labelY(this.model);
    this.model.root.add(this.label);
    this.x = s.x;
    this.y = s.y;
    this.z = s.z;
    this.yaw = s.yaw;
  }
  refreshLabel() {
    this.model.root.remove(this.label);
    disposeLabel(this.label);
    this.label = makeLabel(this.s.name, this.local ? '#bfe8ff' : '#ffffff', realmName(this.s.lv));
    this.label.position.y = labelY(this.model);
    this.model.root.add(this.label);
    this.lv = this.s.lv;
  }
  /** Thay model (asset nạp xong, đổi màu áo): giữ nhãn, chỗ trong cảnh; hit-stop/giật lùi dở dang bỏ đi. */
  swapModel(next: CharacterView, look: PlayerLook): void {
    const parent = this.model.root.parent;
    this.model.root.remove(this.label);
    this.model.root.removeFromParent();
    this.model.dispose();
    this.model = next;
    this.look = look;
    this.label.position.y = labelY(next);
    next.root.add(this.label);
    parent?.add(next.root);
  }
  dispose() {
    disposeLabel(this.label);
    this.art?.dispose();
    this.model.dispose();
  }
}

/** Nhãn tên trên đầu: model khối cao 1,95 m giữ chỗ cũ (2,55); model có xương theo chiều cao thật. */
function labelY(m: CharacterView): number {
  return m instanceof Humanoid ? 2.55 : m.height + 0.75;
}

export class MonVis {
  model: MonsterView;
  /** Đang dùng model khối tạm trong lúc asset model mới còn nạp. */
  skinPending: boolean;
  label: THREE.Sprite | null = null;
  bar: BarState;
  /** Độ cao tâm thanh trên đầu so với chân (m, đã tính scale). */
  barY: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed = 0;
  lv = -1;
  wasAttack = false;
  /** Độ lệch tách thân đang hiển thị (P2-E2, chỉ trình bày) và bán kính thân. */
  sepX = 0;
  sepZ = 0;
  readonly radius: number;
  constructor(
    public id: string,
    public s: MState,
    skins: MonsterSkins,
  ) {
    const def = MONSTER.get(s.t)!;
    this.model = skins.create(def);
    this.skinPending = skins.pending(def);
    this.bar = new BarState(def.boss ? 3 : 1.5, def.boss ? BAR_BOSS : BAR_ENEMY);
    this.barY = this.model.height + 0.35 * def.scale;
    this.radius = bodyRadiusOf(def);
    this.x = s.x;
    this.y = s.y;
    this.z = s.z;
    this.yaw = s.yaw;
  }
  /** Asset model mới nạp xong: thay model khối tạm bằng model mới (giữ nhãn, vị trí). */
  swapModel(next: MonsterView, myLevel: number): void {
    const parent = this.model.root.parent;
    if (this.label) this.model.root.remove(this.label);
    this.model.root.removeFromParent();
    this.model.dispose();
    this.model = next;
    this.barY = next.height + 0.35 * next.def.scale;
    parent?.add(next.root);
    this.refreshLabel(myLevel);
  }
  refreshLabel(myLevel: number) {
    if (this.label) {
      this.model.root.remove(this.label);
      disposeLabel(this.label);
    }
    const def = this.model.def;
    const d = this.s.lv - myLevel;
    const color = def.boss ? '#ffb347' : def.elite ? '#7fd4ff' : d >= 3 ? '#ff6b5e' : d >= 1 ? '#ffd166' : d <= -5 ? '#9aa3ad' : '#f2f2f2';
    this.label = makeLabel(def.elite ? `${monsterName(def.id)} · ${t('ui.monster.elite')}` : monsterName(def.id), color, t('ui.level_short', { n: this.s.lv }), '#c9d4de');
    this.label.position.y = this.model.height / def.scale + 0.95;
    this.label.scale.multiplyScalar(1 / def.scale);
    if (def.boss) this.label.scale.multiplyScalar(1.8);
    else if (def.elite) this.label.scale.multiplyScalar(1.25);
    this.model.root.add(this.label);
    this.lv = this.s.lv;
  }
  dispose() {
    if (this.label) disposeLabel(this.label);
    this.model.dispose();
  }
}

interface NpcVis {
  id: string;
  color: string;
  yaw: number;
  model: CharacterView;
  /** Asset NPC đang nạp: đang dùng model khối, nạp xong thì đổi. */
  skinPending: boolean;
  label: THREE.Sprite;
  marker: THREE.Sprite;
  /** Độ cao dấu ! / ? (theo chiều cao model). */
  markerY: number;
  x: number;
  y: number;
  z: number;
}

function makeMarker(ch: string, color: string): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.font = '900 110px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(20,14,4,0.9)';
  g.strokeText(ch, 64, 68);
  g.fillStyle = color;
  g.fillText(ch, 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type PickResult = { kind: 'mon' | 'npc' | 'node' | 'player'; id: string } | null;

const _v = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

/**
 * Số thể có xương tối đa được LOD0 (gần camera nhất, trong khung nhìn). Còn lại tối thiểu LOD1 (7,6k tam giác với
 * Thanh Phong thay vì 19k) và không đổ bóng. 12 × 19k × 2 (cả pass bóng) ≈ 0,46M tam giác.
 */
export const LOD0_MAX = 12;
/**
 * Số nhãn tên tối đa (gần camera nhất, trong khung nhìn); mình và mục tiêu luôn có. Mỗi nhãn là một sprite = một draw
 * call trong suốt; giữa đám đông 50 người, nhãn của người xa hơn bị che lấp, hiện không giúp gì.
 */
export const LABEL_MAX = 16;
/** Rộng tấm nhãn trên màn hình (px) được kẹp trong khoảng này (P2-E4); chữ chiếm chừng 62%. */
const LABEL_PX = { min: 140, max: 300 };

interface LodEntry {
  model: CharacterView;
  d: number;
  inView: boolean;
  local: boolean;
  /** Nhãn tên (nếu có) và có phải mục tiêu đang chọn. */
  label: THREE.Sprite | null;
  target: boolean;
  /** Nhãn đã có luật ẩn riêng trong khung này (quái: chết, xa 70 m): chỉ ẩn thêm, không bật lại. */
  labelKeep: boolean;
}
/** AnimState dùng lại cho quái (không cấp phát mỗi khung). */
const _monAnim: AnimState = { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, combat: false };

export class EntityManager {
  group = new THREE.Group();
  players = new Map<string, PlayerVis>();
  monsters = new Map<string, MonVis>();
  nodes = new Map<string, THREE.Group>();
  npcs: NpcVis[] = [];
  ring: THREE.Mesh;
  private bars = new HeadBars();
  /** Bật khi có cắt cảnh: thanh máu và nhãn tên trên đầu ẩn đi. */
  tagsHidden = false;
  private markerNew = makeMarker('!', '#ffd84a');
  private markerDone = makeMarker('?', '#ffd84a');
  private markerWait = makeMarker('?', '#9aa3ad');
  private time = 0;
  /** Quái đang thấy vừa gục (một lần mỗi lần chết; engine vẽ vết mực M4-14). */
  onMonsterDeath: ((m: MonVis) => void) | null = null;
  /** Dựng model quái (model có xương hoặc khối); giữ asset mẫu suốt đời EntityManager. */
  private skins = new MonsterSkins();
  /** Dựng model người chơi (Thanh Phong có xương hoặc khối dự phòng), màu áo theo lựa chọn. */
  private playerSkins = new PlayerSkins();
  /** Ngoại hình của mình: bóng tâm ma dựng theo đây (chỉ người độ mới thấy gần, và là bóng của chính mình). */
  private localLook: PlayerLook = { g: APPEARANCE.defaultGender, dye: APPEARANCE.defaultDye };
  /** Dựng model NPC (có xương theo id dữ liệu hoặc khối dự phòng). */
  private npcSkins = new NpcSkins();
  hasNpcs: boolean;
  /** Camera để chọn LOD theo khoảng cách nhìn và cắt mixer ngoài khung nhìn (engine gán). */
  camera: THREE.Camera | null = null;
  private lodList: LodEntry[] = [];

  constructor(
    scene: THREE.Scene,
    public mySid: string,
    levelId: string,
  ) {
    scene.add(this.group);
    this.skins.preload();
    this.playerSkins.preload();
    this.skins.shadow = {
      create: (def) => this.playerSkins.createShadow(this.localLook, def),
      pending: () => this.playerSkins.shadowPending(this.localLook),
    };
    // Boss model xương của màn này (bí cảnh, Hàn Giao ở thế giới): nạp ngay khi vào room; boss màn khác không nạp.
    this.skins.preloadLazy(levelId);
    this.hasNpcs = levelId === 'van_lam';
    if (this.hasNpcs) {
      this.npcSkins.preload();
      for (const n of NPCS) {
        const label = makeLabel(t(`npc.${n.id}.name`), '#ffe9a8', t(`npc.${n.id}.title`), '#e8d6a0');
        const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerNew, transparent: true, depthWrite: false, fog: false }));
        marker.scale.set(0.9, 0.9, 1);
        marker.visible = false;
        const npc: NpcVis = {
          id: n.id,
          color: n.color,
          yaw: n.yaw,
          model: this.npcSkins.create(n.id, n.color),
          skinPending: this.npcSkins.pending(n.id),
          label,
          marker,
          markerY: 0,
          x: n.x,
          y: groundAt(n.x, n.z),
          z: n.z,
        };
        this.placeNpc(npc);
        this.npcs.push(npc);
      }
    }
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.05, 40),
      new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    this.group.add(this.ring);
    this.group.add(this.bars.mesh);
  }

  /** Gắn model NPC vào cảnh: vị trí, hướng theo dữ liệu, nhãn và dấu nhiệm vụ theo chiều cao model. */
  private placeNpc(n: NpcVis): void {
    const root = n.model.root;
    root.position.set(n.x, n.y, n.z);
    root.rotation.y = n.yaw;
    // Model khối: nhãn 2,6, dấu 3,5 như cũ; model có xương (1,65–1,75 m) hạ theo chiều cao.
    n.label.position.y = Math.min(2.6, n.model.height + 0.7);
    n.markerY = n.label.position.y + 0.9;
    n.marker.position.y = n.markerY;
    root.add(n.label, n.marker);
    this.group.add(root);
  }

  /** Dấu ! / ? trên đầu NPC theo trạng thái nhiệm vụ. */
  updateQuestMarkers(q: QuestView, level: number): void {
    for (const n of this.npcs) {
      let state = 0;
      for (const def of QUESTS) {
        if (q.done.includes(def.id)) continue;
        const prog = q.active[def.id];
        if (prog) {
          if (def.turnin === n.id) {
            const complete = def.objectives.every((o, i) => (prog[i] ?? 0) >= o.count || (o.type === 'talk' && o.target === n.id));
            state = Math.max(state, complete ? 3 : 1);
          }
        } else if (def.giver === n.id && (!def.requires || q.done.includes(def.requires)) && (def.minLevel ?? 1) <= level) {
          state = Math.max(state, 2);
        }
      }
      n.marker.visible = state > 0;
      if (state > 0) {
        n.marker.material.map = state === 3 ? this.markerDone : state === 2 ? this.markerNew : this.markerWait;
        n.marker.material.needsUpdate = true;
      }
    }
  }

  update(dt: number, view: WorldView, local: { x: number; y: number; z: number; yaw: number; speed: number; airborne: boolean }, targetId: string, myLevel: number): void {
    this.time += dt;
    const k = Math.min(1, dt * 12);
    const bars = this.bars;
    bars.begin();
    const cam = this.camera as THREE.PerspectiveCamera | null;
    if (cam && !E4_OFF) bars.setView(cam.position.x, cam.position.y, cam.position.z, cam.fov ?? 55, typeof window === 'undefined' ? 0 : window.innerHeight);

    // ----- người chơi -----
    view.players.forEach((s, sid) => {
      const isLocal = sid === this.mySid;
      let v = this.players.get(sid);
      if (!v) {
        if (!isLocal) {
          const d2 = (s.x - local.x) ** 2 + (s.z - local.z) ** 2;
          if (d2 > 260 * 260) return;
        }
        v = new PlayerVis(sid, s, isLocal, this.playerSkins);
        this.players.set(sid, v);
        this.group.add(v.model.root);
      }
      v.s = s;
      const look = lookOf(s);
      if (isLocal) this.localLook = look;
      const lookChanged = look.g !== v.look.g || look.dye !== v.look.dye || look.set !== v.look.set;
      if (lookChanged || (v.skinPending && !this.playerSkins.pending(look))) {
        v.skinPending = this.playerSkins.pending(look);
        v.swapModel(this.playerSkins.create(look), look);
      }
      if (v.lv !== s.lv) v.refreshLabel();
      if (isLocal) {
        v.x = local.x;
        v.y = local.y;
        v.z = local.z;
        v.yaw = local.yaw;
        v.speed = local.speed;
      } else if (!v.model.hit.stopped) {
        // Đang hit-stop thì giữ nguyên hình (chỉ lớp hiển thị); hết khựng sẽ bắt kịp vị trí server.
        const ox = v.x;
        const oz = v.z;
        if (Math.abs(s.x - v.x) + Math.abs(s.z - v.z) + Math.abs(s.y - v.y) > 40) {
          v.x = s.x;
          v.y = s.y;
          v.z = s.z;
        } else {
          v.x += (s.x - v.x) * k;
          v.y += (s.y - v.y) * k;
          v.z += (s.z - v.z) * k;
        }
        v.yaw = angleLerp(v.yaw, s.yaw, k);
        const sp = Math.hypot(v.x - ox, v.z - oz) / Math.max(dt, 1e-3);
        v.speed += (sp - v.speed) * Math.min(1, dt * 8);
      }
      v.fl = s.fl;
      // Pháp bảo phụ: chỉ dựng cho người trong tầm nhìn gần (nhỏ, không đáng nạp xa).
      const wantArt = s.art ?? '';
      if (wantArt && !v.art && (isLocal || (s.x - local.x) ** 2 + (s.z - local.z) ** 2 < 90 * 90)) {
        v.art = new ArtifactVis();
        this.group.add(v.art.root);
      }
      v.art?.setItem(wantArt);
      v.model.setWeaponGlow?.(s.wg ?? 0);
      v.model.setWeaponTint?.(look.set ? (SET.get(look.set)?.look.blade ?? '') : '');
      // Giật lùi là độ lệch hiển thị cộng vào root, không ghi vào v.x/z hay trạng thái server.
      v.model.root.position.set(v.x + v.model.hit.kx, v.y, v.z + v.model.hit.kz);
      v.model.root.rotation.y = v.yaw;
      const dead = (s.fl & PF_DEAD) !== 0;
      v.model.update(dt, {
        speed: v.speed,
        flying: (s.fl & PF_FLYING) !== 0,
        meditating: (s.fl & PF_MEDITATING) !== 0,
        dead,
        casting: (s.fl & PF_CASTING) !== 0,
        airborne: isLocal ? local.airborne : !s.gr,
      });
      v.art?.update(dt, v.model.root.position.x, v.model.root.position.y, v.model.root.position.z, v.yaw, v.speed, dead);
      if (!isLocal) {
        const a = v.bar.tick(s.hp, s.mhp, sid === targetId, dead, dt, this.time);
        if (a > 0) {
          const r = v.model.root;
          bars.push(r.position.x, r.position.y + v.label.position.y - 0.43, r.position.z, v.bar.width, s.hp / Math.max(1, s.mhp), v.bar.trail.value, v.bar.kind, a);
        }
      }
    });
    for (const [sid, v] of this.players) {
      const s = view.players.get(sid);
      const far = s && sid !== this.mySid && (s.x - local.x) ** 2 + (s.z - local.z) ** 2 > 300 * 300;
      if (!s || far) {
        this.group.remove(v.model.root);
        v.dispose();
        this.players.delete(sid);
      }
    }

    // ----- quái -----
    view.monsters.forEach((s, id) => {
      let v = this.monsters.get(id);
      const d2 = (s.x - local.x) ** 2 + (s.z - local.z) ** 2;
      if (!v) {
        if (d2 > 240 * 240 || !MONSTER.has(s.t)) return;
        v = new MonVis(id, s, this.skins);
        this.monsters.set(id, v);
        this.group.add(v.model.root);
      } else if (d2 > 280 * 280) {
        this.group.remove(v.model.root);
        v.dispose();
        this.monsters.delete(id);
        return;
      }
      v.s = s;
      if (v.skinPending && !this.skins.pending(v.model.def)) {
        v.skinPending = false;
        const next = this.skins.create(v.model.def);
        if (next.constructor !== v.model.constructor) v.swapModel(next, myLevel);
        else next.dispose();
      }
      if (v.lv !== s.lv) v.refreshLabel(myLevel);
      const ox = v.x;
      const oz = v.z;
      if (Math.abs(s.x - v.x) + Math.abs(s.z - v.z) > 30) {
        v.x = s.x;
        v.y = s.y;
        v.z = s.z;
      } else if (!v.model.hit.stopped) {
        // Đang hit-stop thì giữ nguyên hình (chỉ lớp hiển thị); hết khựng sẽ bắt kịp vị trí server.
        v.x += (s.x - v.x) * k;
        v.y += (s.y - v.y) * k;
        v.z += (s.z - v.z) * k;
      }
      if (!v.model.hit.stopped) {
        v.yaw = angleLerp(v.yaw, s.yaw, k);
        const sp = Math.hypot(v.x - ox, v.z - oz) / Math.max(dt, 1e-3);
        v.speed += (sp - v.speed) * Math.min(1, dt * 8);
      }
      const dead = s.st === MS_DEAD;
      // Tách thân (kết quả khung trước) và giật lùi là độ lệch hiển thị; y theo mặt đất tại chỗ lệch.
      const sx = v.sepX;
      const sz = v.sepZ;
      const sy = sx * sx + sz * sz > 1e-4 ? groundAt(v.x + sx, v.z + sz) - groundAt(v.x, v.z) : 0;
      v.model.root.position.set(v.x + v.model.hit.kx + sx, v.y + sy, v.z + v.model.hit.kz + sz);
      v.model.root.rotation.y = v.yaw;
      _monAnim.speed = v.speed;
      _monAnim.dead = dead;
      _monAnim.combat = s.st === MS_CHASE || s.st === MS_ATTACK;
      // Boss niệm chú / bị ngắt chú hoặc mất thế (M5-3, M5-5): model có xương phát clip chant / stun.
      _monAnim.casting = ((s.mf ?? 0) & MF_CHANT) !== 0;
      _monAnim.stunned = ((s.mf ?? 0) & MF_STUN) !== 0;
      v.model.update(dt, _monAnim);
      v.model.root.visible = !(dead && (v as MonVis & { deadFor?: number }).deadFor! > 3);
      const vv = v as MonVis & { deadFor?: number };
      // deadFor === 0: khung trước còn sống (mô hình mới dựng của quái đã chết sẵn thì là undefined).
      if (dead && vv.deadFor === 0) this.onMonsterDeath?.(v);
      vv.deadFor = dead ? (vv.deadFor ?? 0) + dt : 0;
      const engaged = id === targetId || s.st === MS_CHASE || s.st === MS_ATTACK;
      const a = v.bar.tick(s.hp, s.mhp, engaged, dead, dt, this.time);
      if (a > 0) {
        const r = v.model.root;
        bars.push(r.position.x, r.position.y + v.barY, r.position.z, v.bar.width, s.hp / Math.max(1, s.mhp), v.bar.trail.value, v.bar.kind, a);
      }
      if (v.label) v.label.visible = !dead && d2 < 70 * 70;
      v.wasAttack = s.st === MS_ATTACK;
    });
    for (const [id, v] of this.monsters) {
      if (!view.monsters.has(id)) {
        this.group.remove(v.model.root);
        v.dispose();
        this.monsters.delete(id);
      }
    }

    this.separate(dt, local);

    // ----- điểm hái thuốc -----
    view.nodes.forEach((s, id) => {
      let g = this.nodes.get(id);
      const d2 = (s.x - local.x) ** 2 + (s.z - local.z) ** 2;
      if (!g) {
        if (d2 > 200 * 200) return;
        g = buildNode(s.t);
        g.position.set(s.x, s.y, s.z);
        g.rotation.y = hashStr(id) % 6;
        this.nodes.set(id, g);
        this.group.add(g);
      } else if (d2 > 240 * 240) {
        this.group.remove(g);
        this.nodes.delete(id);
        return;
      }
      g.visible = s.on;
      if (s.on) {
        const glow = g.children[1];
        const pulse = 1 + Math.sin(this.time * 3 + s.x) * 0.18;
        glow.scale.set(0.55 * pulse, 0.75 * pulse, 0.55 * pulse);
      }
    });

    // ----- NPC -----
    for (const n of this.npcs) {
      if (n.skinPending && !this.npcSkins.pending(n.id)) {
        n.skinPending = false;
        const next = this.npcSkins.create(n.id, n.color);
        if (next.constructor !== n.model.constructor) {
          n.model.root.remove(n.label, n.marker);
          n.model.root.removeFromParent();
          n.model.dispose();
          n.model = next;
          this.placeNpc(n);
        } else next.dispose();
      }
      // LOD/bóng/nhịp mixer của NPC có xương do applyLodBudget quyết định (theo camera, chung suất LOD0).
      n.model.update(dt, { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false });
      if (n.marker.visible) n.marker.position.y = n.markerY + Math.sin(this.time * 3) * 0.12;
    }

    bars.end();
    this.applyLodBudget(local, targetId);
    // Cắt cảnh (B6): ẩn cả thanh máu lẫn nhãn tên trên đầu, vì chúng nằm trong cảnh 3D chứ không thuộc lớp HUD.
    if (this.tagsHidden) {
      this.bars.mesh.visible = false;
      for (const v of this.players.values()) v.label.visible = false;
      for (const v of this.monsters.values()) if (v.label) v.label.visible = false;
    }
    // Nhãn NPC không có chỗ nào khác đặt lại (luôn hiện), nên gán theo cờ mỗi khung để hiện lại khi hết cảnh.
    for (const n of this.npcs) n.label.visible = !this.tagsHidden;

    // ----- vòng chọn mục tiêu -----
    const tm = this.monsters.get(targetId);
    const tp = this.players.get(targetId);
    const tn = this.npcs.find((n) => n.id === targetId);
    if (tm && tm.s.st !== MS_DEAD) {
      this.ring.visible = true;
      const sc = tm.model.def.scale * (tm.model.def.boss ? 1.6 : 1.1);
      this.ring.scale.setScalar(sc * (1 + Math.sin(this.time * 5) * 0.05));
      this.ring.position.set(tm.x, tm.y + 0.15, tm.z);
      (this.ring.material as THREE.MeshBasicMaterial).color.set(0xff5a4a);
    } else if (tp || tn) {
      const p = tp ?? tn!;
      this.ring.visible = true;
      this.ring.scale.setScalar(0.8);
      this.ring.position.set(p.x, p.y + 0.12, p.z);
      (this.ring.material as THREE.MeshBasicMaterial).color.set(tn ? 0xffd84a : 0x6fd0ff);
    } else {
      this.ring.visible = false;
    }
  }

  private sepBodies: Body[] = [];
  private sepMons: (MonVis | null)[] = [];

  /**
   * Tách thân hiển thị (P2-E2): quái gần mình không chồng lên nhau hay xuyên người chơi/NPC. Người chơi, NPC đứng yên;
   * quái tự né. Giải từ vị trí logic mỗi khung rồi làm mượt độ lệch, áp ở khung sau. Vị trí logic không đổi.
   */
  private separate(dt: number, local: { x: number; z: number }): void {
    if (P2E_OFF) return;
    const bodies = this.sepBodies;
    const mons = this.sepMons;
    let n = 0;
    const R2 = 60 * 60;
    const put = (x: number, z: number, r: number, fixed: boolean, m: MonVis | null) => {
      if ((x - local.x) ** 2 + (z - local.z) ** 2 > R2) return;
      const b = (bodies[n] ??= { x: 0, z: 0, r: 0, fixed: true, ox: 0, oz: 0 });
      b.x = x;
      b.z = z;
      b.r = r;
      b.fixed = fixed;
      mons[n] = m;
      n++;
    };
    for (const v of this.players.values()) put(v.x, v.z, PLAYER_BODY_RADIUS, true, null);
    for (const npc of this.npcs) put(npc.x, npc.z, PLAYER_BODY_RADIUS, true, null);
    for (const v of this.monsters.values()) {
      if (v.s.st === MS_DEAD) {
        v.sepX *= 0.9;
        v.sepZ *= 0.9;
        continue;
      }
      put(v.x, v.z, v.radius, false, v);
    }
    solveSeparation(bodies, n);
    const k = Math.min(1, dt * 10);
    for (let i = 0; i < n; i++) {
      const v = mons[i];
      if (!v) continue;
      v.sepX += (bodies[i].ox - v.sepX) * k;
      v.sepZ += (bodies[i].oz - v.sepZ) * k;
    }
  }

  /**
   * LOD theo camera (M3-9): mọi model có xương (người chơi, quái) xếp theo khoảng cách tới camera; chỉ `LOD0_MAX` thể
   * gần nhất trong khung nhìn được LOD0 (và đổ bóng); ngoài khung nhìn thì không cập nhật mixer. Nhân vật của mình
   * luôn được LOD0. Áp cho khung sau (model đã update khung này), trễ một khung không thấy được.
   */
  private applyLodBudget(local: { x: number; y: number; z: number }, targetId = ''): void {
    const list = this.lodList;
    let n = 0;
    const cam = this.camera;
    if (cam) {
      cam.updateMatrixWorld();
      _frustum.setFromProjectionMatrix(_pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    }
    const ce = cam?.matrixWorld.elements;
    const cx = ce ? ce[12] : local.x;
    const cy = ce ? ce[13] : local.y;
    const cz = ce ? ce[14] : local.z;
    const add = (model: CharacterView, isLocal: boolean, label: THREE.Sprite | null = null, target = false, labelKeep = false) => {
      if (!model.setView && !label) return;
      const r = model.root;
      const h = model.height;
      const p = r.position;
      const d = Math.hypot(p.x - cx, p.y + h * 0.5 - cy, p.z - cz);
      _sphere.center.set(p.x, p.y + h * 0.5, p.z);
      _sphere.radius = h * 0.9;
      const inView = r.visible && (!cam || _frustum.intersectsSphere(_sphere));
      let e = list[n];
      if (!e) e = list[n] = { model, d, inView, local: isLocal, label, target, labelKeep };
      e.model = model;
      e.d = d;
      e.inView = inView;
      e.local = isLocal;
      e.label = label;
      e.target = target;
      e.labelKeep = labelKeep;
      n++;
    };
    for (const [sid, v] of this.players) add(v.model, sid === this.mySid, v.label, sid === targetId);
    for (const [id, v] of this.monsters) add(v.model, false, v.label, id === targetId, true);
    // NPC có model xương (khi có) cũng vào chung suất LOD0; model khối thì bỏ qua. Nhãn NPC luôn hiện.
    for (const npc of this.npcs) add(npc.model as CharacterView, false);
    list.length = n;
    // Mình trước, rồi trong khung nhìn theo gần → xa.
    list.sort((a, b) => (a.local !== b.local ? (a.local ? -1 : 1) : a.inView !== b.inView ? (a.inView ? -1 : 1) : a.d - b.d));
    let lod0 = 0;
    let labels = 0;
    const boxes = this.labelBoxes;
    boxes.length = 0;
    const pc = cam as THREE.PerspectiveCamera | null;
    const vw = typeof window === 'undefined' ? 0 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 0 : window.innerHeight;
    for (const e of list) {
      if (e.label) {
        // Quái đã tự ẩn nhãn (chết, xa 70 m) thì giữ ẩn; người chơi luôn bật lại theo suất.
        const want = e.local || e.target || (e.inView && labels < LABEL_MAX);
        if (want && !e.local && !e.target) labels++;
        e.label.visible = e.labelKeep ? e.label.visible && want : want;
        if (e.label.visible && pc && vh > 0 && !E4_OFF) this.fitLabel(e, pc, vw, vh, boxes);
      }
      if (!e.model.setView) continue;
      const allow = e.local || (e.inView && lod0 < LOD0_MAX);
      if (allow) lod0++;
      e.model.setView({ dist: e.local ? 0 : e.d, inView: e.local || e.inView, allowLod0: allow, self: e.local });
    }
  }

  /** Hộp màn hình (px) của các nhãn đang hiện khung này, để số sát thương tránh đè lên tên. */
  labelBoxes: Box[] = [];

  /**
   * Kẹp cỡ nhãn trên màn hình (không phóng khổng lồ khi camera sát) và ẩn nhãn chồng lên nhãn gần hơn
   * (mình và mục tiêu luôn giữ). Duyệt theo thứ tự ưu tiên của `lodList`: mình, rồi gần → xa.
   */
  private fitLabel(e: { model: CharacterView; label: THREE.Sprite | null; local: boolean; target: boolean; d: number }, cam: THREE.PerspectiveCamera, vw: number, vh: number, boxes: Box[]): void {
    const sp = e.label!;
    const ud = sp.userData as { w0?: number; h0?: number };
    if (ud.w0 === undefined) {
      ud.w0 = sp.scale.x;
      ud.h0 = sp.scale.y;
    }
    const ps = sp.parent ? sp.parent.scale.x : 1;
    const p = e.model.root.position;
    const ly = sp.position.y * (sp.parent ? sp.parent.scale.y : 1);
    const dist = Math.hypot(p.x - cam.position.x, p.y + ly - cam.position.y, p.z - cam.position.z);
    const f = fitFactor(ud.w0 * ps, dist, cam.fov, vh, LABEL_PX.min, LABEL_PX.max);
    sp.scale.set(ud.w0 * f, ud.h0! * f, 1);
    // Hộp chữ trên màn hình: chữ chiếm khoảng 62% bề rộng, 55% bề cao của tấm.
    _v.set(p.x, p.y + ly, p.z).project(cam);
    if (_v.z > 1) return;
    const wpx = screenWidthPx(ud.w0 * ps * f, dist, cam.fov, vh);
    const box: Box = { x: (_v.x * 0.5 + 0.5) * vw, y: (-_v.y * 0.5 + 0.5) * vh, hw: wpx * 0.31, hh: (wpx / 4) * 0.28 };
    if (!e.local && !e.target) {
      for (const b of boxes) {
        if (boxesOverlap(box, b, 2)) {
          sp.visible = false;
          return;
        }
      }
    }
    boxes.push(box);
  }

  /** Số model có xương theo mức LOD và số ngoài khung nhìn (gỡ lỗi, đo hiệu năng). */
  lodStats(): { lod: number[]; offscreen: number } {
    const lod = [0, 0, 0];
    let offscreen = 0;
    for (const e of this.lodList) {
      const l = (e.model as { lod?: number }).lod ?? 0;
      lod[l] = (lod[l] ?? 0) + 1;
      if (!e.inView && !e.local) offscreen++;
    }
    return { lod, offscreen };
  }

  /**
   * Phản ứng trúng đòn khi nhận S.DMG (chỉ hiển thị). `delay` để khớp lúc đạn bay tới.
   * Người ra đòn là mình thì mình cũng khựng.
   */
  hitReact(dst: string, src: string | undefined, crit: boolean, delay: number, heavy = false): void {
    const vd = this.players.get(dst) ?? this.monsters.get(dst);
    if (!vd) return;
    const vs = src && src !== dst ? (this.players.get(src) ?? this.monsters.get(src)) : undefined;
    // Chỉ khựng khi đòn liên quan tới mình, để boss bị nhiều người đánh không đứng hình liên tục.
    const noStop = src !== this.mySid && dst !== this.mySid;
    vd.model.hitReact({ crit, heavy, delay, noStop, noFlash: this.tagsHidden && this.monsters.has(dst), dirX: vs ? vd.x - vs.x : 0, dirZ: vs ? vd.z - vs.z : 0 });
    if (src && src === this.mySid && vs) vs.model.hit.hitStop(hitStopFor(crit, heavy), delay);
  }

  /** Vị trí ngực của một thực thể (để bắn hiệu ứng tới). */
  chestOf(id: string, out: THREE.Vector3): boolean {
    const p = this.players.get(id);
    if (p) {
      out.set(p.x, p.y + 1.2, p.z);
      return true;
    }
    const m = this.monsters.get(id);
    if (m) {
      out.set(m.x, m.y + m.model.height * 0.55, m.z);
      return true;
    }
    return false;
  }

  topOf(id: string, out: THREE.Vector3): boolean {
    const p = this.players.get(id);
    if (p) {
      out.set(p.x, p.y + 2.2, p.z);
      return true;
    }
    const m = this.monsters.get(id);
    if (m) {
      out.set(m.x, m.y + m.model.height + 0.4, m.z);
      return true;
    }
    return false;
  }

  /** Chọn thực thể gần con trỏ nhất trên màn hình. */
  /** `aim`: bán kính bắt tối thiểu (px). Tâm ngắm kiểu FPS dùng bán kính rộng để chọn thứ gần tâm nhất. */
  pick(mx: number, my: number, w: number, h: number, camera: THREE.Camera, aim = 26): PickResult {
    let best: PickResult = null;
    let bestScore = 1e9;
    const test = (kind: 'mon' | 'npc' | 'node' | 'player', id: string, x: number, y: number, z: number, radius: number) => {
      _v.set(x, y, z).project(camera);
      if (_v.z > 1 || _v.z < -1) return;
      const sx = (_v.x * 0.5 + 0.5) * w;
      const sy = (-_v.y * 0.5 + 0.5) * h;
      const dist = _v.set(x, y, z).distanceTo(camera.position);
      // Bán kính bắt chuột tính theo pixel, lớn hơn khi ở gần.
      const pr = Math.max(aim, (radius / Math.max(1, dist)) * h * 0.9);
      const d = Math.hypot(sx - mx, sy - my);
      if (d > pr) return;
      const score = d + dist * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = { kind, id };
      }
    };
    for (const [id, m] of this.monsters) {
      if (m.s.st === MS_DEAD) continue;
      test('mon', id, m.x, m.y + m.model.height * 0.5, m.z, m.model.height * 0.6);
    }
    for (const n of this.npcs) test('npc', n.id, n.x, n.y + 1.1, n.z, 1.1);
    for (const [id, g] of this.nodes) if (g.visible) test('node', id, g.position.x, g.position.y + 0.5, g.position.z, 0.7);
    for (const [sid, p] of this.players) {
      if (sid === this.mySid) continue;
      test('player', sid, p.x, p.y + 1.1, p.z, 1.0);
    }
    return best;
  }

  /** Thứ có thể tương tác gần nhất (NPC, cây thuốc, cổng bí cảnh). */
  nearestInteractable(x: number, y: number, z: number): { kind: 'npc' | 'node' | 'portal'; id: string; dist: number } | null {
    let best: { kind: 'npc' | 'node' | 'portal'; id: string; dist: number } | null = null;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < 7 && (!best || d < best.dist)) best = { kind: 'npc', id: n.id, dist: d };
    }
    for (const [id, g] of this.nodes) {
      if (!g.visible) continue;
      const d = Math.hypot(g.position.x - x, g.position.z - z);
      if (d < 4.2 && Math.abs(g.position.y - y) < 5 && (!best || d < best.dist)) best = { kind: 'node', id, dist: d };
    }
    const gate = this.hasNpcs ? PORTAL_POS : DUNGEON_EXIT;
    const dg = Math.hypot(gate.x - x, gate.z - z);
    if (dg < 11 && (!best || dg < best.dist)) best = { kind: 'portal', id: this.hasNpcs ? 'portal' : 'exit', dist: dg };
    return best;
  }

  /** Tab: chuyển sang quái còn sống kế tiếp theo khoảng cách. */
  nextTarget(current: string, x: number, z: number): string {
    const list: { id: string; d: number }[] = [];
    for (const [id, m] of this.monsters) {
      if (m.s.st === MS_DEAD) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < 45) list.push({ id, d });
    }
    if (!list.length) return '';
    list.sort((a, b) => a.d - b.d);
    const i = list.findIndex((e) => e.id === current);
    return list[(i + 1) % list.length].id;
  }

  dispose(): void {
    for (const v of this.players.values()) v.dispose();
    for (const v of this.monsters.values()) v.dispose();
    this.skins.dispose();
    this.playerSkins.dispose();
    for (const n of this.npcs) {
      disposeLabel(n.label);
      n.marker.material.dispose();
      n.model.dispose();
    }
    this.npcSkins.dispose();
    this.markerNew.dispose();
    this.markerDone.dispose();
    this.markerWait.dispose();
    this.bars.dispose();
    this.group.removeFromParent();
  }
}
