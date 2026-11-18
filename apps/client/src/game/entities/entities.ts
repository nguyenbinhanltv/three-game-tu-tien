import { monFlagEdge, monHidden, type MonFlagEdge } from './monFlags';
import * as THREE from 'three/webgpu';
import { uiScale } from '../../ui/uiScale';
import { boxesOverlap, fitFactor, screenWidthPx, type Box } from '../core/screenFit';
import {
  locoDirOf,
  inSkyBand,
  PF_SOUL,
  MF_CHANT,
  MF_STUN,
  MF_WEAK,
  MS_ATTACK,
  MS_CHASE,
  MS_DEAD,
  PF_CASTING,
  PF_DEAD,
  PF_FLYING,
  PF_MEDITATING,
} from '@dtl/shared';
import { groundAt } from '../../base/levelCtx';
import { gatesOf, type Gate } from '../world/gates';
import { APPEARANCE, SET, MONSTER, NPCS, QUESTS, t } from '@dtl/content';
import { hoverBob, hoverTarget, stepHover } from './hover';
import { BONDED_ARTIFACT_ID, BONDED_UNLOCK_LEVEL, PLAYER_BODY_RADIUS } from '@dtl/shared';
import { type Body, solveSeparation } from './separation';
import { hashName as hashStr, type EscortMsg, type QuestView } from '@dtl/shared';
import { LABELS, type Label } from './labelBatch';
import { buildNode, disposeLabel, makeLabel } from '../core/models';
import { type AnimState, type CharacterView, type SkillEvent } from '../character/view';
import { MonsterSkins } from '../character/monsterSkins';
import { NPC_SKINS, NpcSkins } from '../character/npcSkins';
import { type PlayerLook, PlayerSkins } from '../character/playerSkins';
import { HeadBars } from './headBars';
import type { StopPair } from '../combat/hitjuice';
import { ArtifactVis } from '../fx/artifactVis';
import { PState, MState, PlayerVis, MonVis, lookOf } from './entityVis';
export { MonVis, PlayerVis } from './entityVis';
export type { MState, PState } from './entityVis';

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

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

interface NpcVis {
  id: string;
  color: string;
  yaw: number;
  model: CharacterView;
  /** Asset NPC đang nạp: đang dùng model khối, nạp xong thì đổi. */
  skinPending: boolean;
  label: Label;
  marker: THREE.Sprite;
  /** Độ cao dấu ! / ? (theo chiều cao model). */
  markerY: number;
  x: number;
  y: number;
  z: number;
  /** Người đồng hành hộ tống (E2-H): đích từ server, vẽ trượt tới đó. */
  tx?: number;
  tz?: number;
  /** Id NPC mượn model (người đồng hành; `id` là id tuyến hộ tống). */
  npc?: string;
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

type PickResult = { kind: 'mon' | 'npc' | 'node' | 'player'; id: string } | null;

const _v = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

/**
 * Số thể có xương tối đa được LOD0 (gần camera nhất, trong khung nhìn). Còn lại tối thiểu LOD1 (7,6k tam giác với
 * Thanh Phong thay vì 19k) và không đổ bóng. 12 × 19k × 2 (cả pass bóng) ≈ 0,46M tam giác.
 */
const LOD0_MAX = 12;
/**
 * Quái chỉ dựng model trong 100 m quanh mình (xóa khi quá 125 m, chừa vùng đệm để không dựng/xóa liên tục ở rìa).
 * Bãi quái dày (M-1: ~1 800 quái/km² vùng săn) nên bán kính 240 m cũ dựng cả trăm model xương không ai thấy qua sương.
 */
const MON_NEAR = 100;
const MON_FAR = 125;
/**
 * Số nhãn tên tối đa (gần camera nhất, trong khung nhìn); mình và mục tiêu luôn có. Mỗi nhãn là một sprite = một draw
 * call trong suốt; giữa đám đông 50 người, nhãn của người xa hơn bị che lấp, hiện không giúp gì.
 */
const LABEL_MAX = 16;
/**
 * Rộng tấm nhãn trên màn hình (px, ở hệ số UI 1) được kẹp trong khoảng này (P2-E4); chữ chiếm chừng 62%.
 * Trần 240 để tên không to hơn chữ HUD khi camera sát; sàn 160 để dòng cảnh giới còn đọc được khi camera xa.
 * Nhân với `uiScale()` để màn lớn chữ không bé đi.
 */
const LABEL_PX = { min: 160, max: 240 };
/** Nhãn mờ dần theo khoảng cách tới camera: rõ tới `full` mét, tắt hẳn ở `none` mét (mình và mục tiêu luôn rõ). */
const LABEL_FADE = { full: 45, none: 70 };

/** Độ mờ nhãn ở khoảng cách `dist` (m). */
function labelOpacity(dist: number, keep: boolean): number {
  if (keep) return 1;
  return Math.max(0, Math.min(1, (LABEL_FADE.none - dist) / (LABEL_FADE.none - LABEL_FADE.full)));
}

interface LodEntry {
  model: CharacterView;
  d: number;
  inView: boolean;
  local: boolean;
  /** Nhãn tên (nếu có) và có phải mục tiêu đang chọn. */
  label: Label | null;
  target: boolean;
  /** Nhãn đã có luật ẩn riêng trong khung này (quái: chết, xa 70 m): chỉ ẩn thêm, không bật lại. */
  labelKeep: boolean;
}
/** Lưu vị trí vẽ bao lâu (giây) cho `posAgo`. */
const HIST_SEC = 0.5;

/** AnimState dùng lại cho quái (không cấp phát mỗi khung). */
const _monAnim: AnimState = { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, combat: false };

export class EntityManager {
  group = new THREE.Group();
  players = new Map<string, PlayerVis>();
  monsters = new Map<string, MonVis>();
  nodes = new Map<string, THREE.Group>();
  npcs: NpcVis[] = [];
  /** Người đồng hành của nhiệm vụ hộ tống (E2-H), theo id `escorts` của level. Không phải NPC tương tác. */
  escorts = new Map<string, NpcVis>();
  ring: THREE.Mesh;
  private bars = new HeadBars();
  /** Bật khi có cắt cảnh: thanh máu và nhãn tên trên đầu ẩn đi. */
  tagsHidden = false;
  /** Boss đang có thanh máu lớn trên HUD (engine đặt mỗi lần đồng bộ HUD): bảng tên 3D của nó ẩn đi. */
  hudBossId = '';
  private markerNew = makeMarker('!', '#ffd84a');
  private markerDone = makeMarker('?', '#ffd84a');
  private markerWait = makeMarker('?', '#9aa3ad');
  private time = 0;
  /** Nghe sự kiện chiêu của mọi người chơi trong tầm (K-4): `sid`, sự kiện (windup/hit/recovery/cancel/end). */
  onSkillEvent: ((sid: string, e: SkillEvent) => void) | null = null;
  /** Quái đang thấy vừa gục (một lần mỗi lần chết; engine vẽ vết mực M4-14). */
  onMonsterDeath: ((m: MonVis) => void) | null = null;
  /** Cờ quái mở rộng vừa bật/tắt (E1-E): vẽ vòng phản đòn/yếu điểm, bụi chui đất. */
  onMonFlags: ((m: MonVis, e: MonFlagEdge) => void) | null = null;
  /** Dựng model quái (model có xương hoặc khối); giữ asset mẫu suốt đời EntityManager. */
  private skins = new MonsterSkins();
  /** Dựng model người chơi (Thanh Phong có xương hoặc khối dự phòng), màu áo theo lựa chọn. */
  private playerSkins = new PlayerSkins();
  /** Nguyên anh (E3-K): bản thu nhỏ của người chơi `sid` (null nếu chưa có hoặc asset chưa nạp). */
  makeSoul(sid: string, kind: 'soul' | 'husk'): CharacterView | null {
    const v = this.players.get(sid);
    return v ? this.playerSkins.createSoul(v.look, kind) : null;
  }

  /** Ngoại hình của mình: bóng tâm ma dựng theo đây (chỉ người độ mới thấy gần, và là bóng của chính mình). */
  private localLook: PlayerLook = { g: APPEARANCE.defaultGender, dye: APPEARANCE.defaultDye };
  /** Dựng model NPC (có xương theo id dữ liệu hoặc khối dự phòng). */
  private npcSkins = new NpcSkins();

  /** NPC có `look` (E3-H) dùng model nhân vật nền nhuộm kênh vải; còn lại dùng model NPC riêng. */
  private npcModel(id: string, robe: string): CharacterView {
    const look = NPC_SKINS[id]?.look;
    return look ? this.playerSkins.createNpc(look) : this.npcSkins.create(id, robe);
  }

  private npcPending(id: string): boolean {
    const look = NPC_SKINS[id]?.look;
    return look ? this.playerSkins.npcPending(look.g) : this.npcSkins.pending(id);
  }
  hasNpcs: boolean;
  private gates: Gate[];
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
    // `hasNpcs` chỉ còn nghĩa "đây là thế giới Vân Lam" (cổng bí cảnh Kiếm Trủng); NPC dựng ở mọi level theo `NpcDef.level` (E2-H).
    this.hasNpcs = levelId === 'van_lam';
    this.gates = gatesOf(levelId);
    const here = NPCS.filter((n) => (n.level ?? 'van_lam') === levelId);
    if (here.length) {
      this.npcSkins.preload();
      for (const n of here) {
        const label = makeLabel(t(`npc.${n.id}.name`), '#ffe9a8', t(`npc.${n.id}.title`), '#e8d6a0');
        const marker = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: this.markerNew, transparent: true, depthWrite: false, fog: false }),
        );
        marker.scale.set(0.9, 0.9, 1);
        marker.visible = false;
        const npc: NpcVis = {
          id: n.id,
          color: n.color,
          yaw: n.yaw,
          model: this.npcModel(n.id, n.color),
          skinPending: this.npcPending(n.id),
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
      new THREE.MeshBasicMaterial({
        color: 0xff5a4a,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    this.group.add(this.ring);
    this.group.add(this.bars.mesh);
    this.group.add(LABELS.mesh);
  }

  /** Tin `S.ESCORT`: dựng/dời người đồng hành, hoặc gỡ khi `st` = 0. Server là nguồn vị trí; client chỉ nội suy. */
  setEscort(m: EscortMsg): void {
    let e = this.escorts.get(m.id);
    if (m.st === 0) {
      if (e) this.removeEscort(m.id);
      return;
    }
    if (!e) {
      const label = makeLabel(t(`npc.${m.npc}.name`), '#ffe9a8', t(`npc.${m.npc}.title`), '#e8d6a0');
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerNew, transparent: true, depthWrite: false, fog: false }));
      marker.visible = false;
      e = {
        id: m.id,
        color: '#b89a6a',
        yaw: m.yaw,
        model: this.npcModel(m.npc, '#b89a6a'),
        skinPending: this.npcPending(m.npc),
        npc: m.npc,
        label,
        marker,
        markerY: 0,
        x: m.x,
        y: groundAt(m.x, m.z),
        z: m.z,
      };
      if (!NPC_SKINS[m.npc]?.look) this.npcSkins.addWalk(e.model, m.npc);
      this.placeNpc(e);
      this.escorts.set(m.id, e);
    }
    e.tx = m.x;
    e.tz = m.z;
    e.yaw = m.yaw;
  }

  private removeEscort(id: string): void {
    const e = this.escorts.get(id);
    if (!e) return;
    e.model.root.remove(e.label, e.marker);
    e.model.root.removeFromParent();
    disposeLabel(e.label);
    e.marker.material.dispose();
    e.model.dispose();
    this.escorts.delete(id);
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

  update(
    dt: number,
    view: WorldView,
    local: { x: number; y: number; z: number; yaw: number; speed: number; airborne: boolean },
    targetId: string,
    myLevel: number,
  ): void {
    this.time += dt;
    const k = Math.min(1, dt * 12);
    const bars = this.bars;
    bars.begin();
    const cam = this.camera as THREE.PerspectiveCamera | null;
    if (cam)
      bars.setView(cam.position.x, cam.position.y, cam.position.z, cam.fov ?? 55, typeof window === 'undefined' ? 0 : window.innerHeight);

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
        v.onSkillEvent = (id, e) => this.onSkillEvent?.(id, e);
        this.players.set(sid, v);
        this.group.add(v.model.root);
      }
      v.s = s;
      const look = lookOf(s);
      if (isLocal) this.localLook = look;
      const lookChanged =
        look.g !== v.look.g ||
        look.dye !== v.look.dye ||
        look.hair !== v.look.hair ||
        look.set !== v.look.set ||
        look.acc !== v.look.acc ||
        look.w !== v.look.w ||
        look.skin !== v.look.skin;
      if (lookChanged || (v.skinPending && !this.playerSkins.pending(look))) {
        // `create` trước: nó khởi động việc nạp lười (asset nhân vật, kiếm riêng), rồi mới hỏi còn nạp không để biết có phải dựng lại.
        const next = this.playerSkins.create(look);
        v.skinPending = this.playerSkins.pending(look);
        v.swapModel(next, look);
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
      v.mt = s.mt ?? '';
      // Pháp bảo phụ: chỉ dựng cho người trong tầm nhìn gần (nhỏ, không đáng nạp xa).
      const wantArt = s.art ?? '';
      if (wantArt && !v.art && (isLocal || (s.x - local.x) ** 2 + (s.z - local.z) ** 2 < 90 * 90)) {
        v.art = new ArtifactVis();
        this.group.add(v.art.root);
      }
      v.art?.setItem(wantArt);
      if (s.lv >= BONDED_UNLOCK_LEVEL && !v.lo && (isLocal || (s.x - local.x) ** 2 + (s.z - local.z) ** 2 < 90 * 90)) {
        v.lo = new ArtifactVis();
        this.group.add(v.lo.root);
      }
      v.lo?.setItem(s.lv >= BONDED_UNLOCK_LEVEL ? BONDED_ARTIFACT_ID : '');
      v.model.setWeaponGlow?.(s.wg ?? 0);
      v.model.setWeaponTint?.(look.set ? (SET.get(look.set)?.look.blade ?? '') : '');
      // Giật lùi là độ lệch hiển thị cộng vào root, không ghi vào v.x/z hay trạng thái server.
      v.model.root.position.set(v.x + v.model.hit.kx, v.y, v.z + v.model.hit.kz);
      v.model.root.rotation.y = v.yaw;
      const dead = (s.fl & PF_DEAD) !== 0;
      // Hướng đi so với hướng nhìn (đi lùi/ngang khi nhìn mục tiêu): vận tốc hiển thị làm mượt theo vị trí vẽ.
      const h = v.hist;
      const prev = h.length ? h[h.length - 1] : null;
      if (prev && dt > 1e-4) {
        const kv = Math.min(1, dt * 10);
        v.mvx += ((v.x - prev.x) / dt - v.mvx) * kv;
        v.mvz += ((v.z - prev.z) / dt - v.mvz) * kv;
      }
      h.push({ t: this.time, x: v.x, z: v.z });
      while (h.length > 1 && this.time - h[0]!.t > HIST_SEC) h.shift();
      const lookMon = isLocal && targetId ? this.monsters.get(targetId) : undefined;
      v.model.update(dt, {
        lookAt: lookMon ? { x: lookMon.x, y: lookMon.y + 1.2, z: lookMon.z } : undefined,
        moveDir: v.speed > 0.3 ? locoDirOf(v.yaw, v.mvx, v.mvz) : undefined,
        speed: v.speed,
        flying: (s.fl & PF_FLYING) !== 0,
        // Ngự không (E3-K): Nguyên Anh bay trong 30 m so với mặt đất thì không cần kiếm.
        sky: (s.fl & PF_FLYING) !== 0 && inSkyBand(s.lv, v.y, groundAt(v.x, v.z)),
        meditating: (s.fl & PF_MEDITATING) !== 0,
        dead,
        casting: (s.fl & PF_CASTING) !== 0,
        airborne: isLocal ? local.airborne : !s.gr,
      });
      // Nguyên anh đang xuất khiếu thám thính: thân xác không còn ở đây, chỉ còn bóng anh (`soulVis`).
      v.model.root.visible = !((s.fl & PF_SOUL) !== 0 && !dead);
      v.art?.update(dt, v.model.root.position.x, v.model.root.position.y, v.model.root.position.z, v.yaw, v.speed, dead);
      v.lo?.update(dt, v.model.root.position.x, v.model.root.position.y, v.model.root.position.z, v.yaw, v.speed, dead);
      if (!isLocal) {
        const a = v.bar.tick(s.hp, s.mhp, sid === targetId, dead, dt, this.time);
        if (a > 0) {
          const r = v.model.root;
          bars.push(
            r.position.x,
            r.position.y + v.label.position.y - 0.43,
            r.position.z,
            v.bar.width,
            s.hp / Math.max(1, s.mhp),
            v.bar.trail.value,
            v.bar.kind,
            a,
          );
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
        const mdef = MONSTER.get(s.t);
        if (!mdef || d2 > (mdef.boss ? 240 : MON_NEAR) ** 2) return;
        v = new MonVis(id, s, this.skins);
        this.monsters.set(id, v);
        this.group.add(v.model.root);
      } else if (d2 > (v.model.def && MONSTER.get(s.t)?.boss ? 280 : MON_FAR) ** 2) {
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
      const hv = v.model.def.hover ?? 0;
      let lift = 0;
      if (hv > 0) {
        const low = ((s.mf ?? 0) & (MF_WEAK | MF_STUN)) !== 0;
        v.hover = stepHover(v.hover, hoverTarget(hv, dead, low), dt, dead);
        lift = v.hover + hoverBob(hv, v.hover, this.time, hashStr(v.id) % 7);
      }
      v.model.root.position.set(v.x + v.model.hit.kx + sx, v.y + sy + lift, v.z + v.model.hit.kz + sz);
      v.model.root.rotation.y = v.yaw;
      _monAnim.speed = v.speed;
      _monAnim.dead = dead;
      _monAnim.combat = s.st === MS_CHASE || s.st === MS_ATTACK;
      // Boss niệm chú / bị ngắt chú hoặc mất thế (M5-3, M5-5): model có xương phát clip chant / stun.
      _monAnim.casting = ((s.mf ?? 0) & MF_CHANT) !== 0;
      _monAnim.stunned = ((s.mf ?? 0) & MF_STUN) !== 0;
      v.model.update(dt, _monAnim);
      const mf = s.mf ?? 0;
      const edge = monFlagEdge(v.mf0, mf);
      v.mf0 = mf;
      if (edge) this.onMonFlags?.(v, edge);
      v.model.root.visible = !(dead && (v as MonVis & { deadFor?: number }).deadFor! > 3) && !monHidden(mf);
      const vv = v as MonVis & { deadFor?: number };
      // deadFor === 0: khung trước còn sống (mô hình mới dựng của quái đã chết sẵn thì là undefined).
      if (dead && vv.deadFor === 0) this.onMonsterDeath?.(v);
      vv.deadFor = dead ? (vv.deadFor ?? 0) + dt : 0;
      const engaged = id === targetId || s.st === MS_CHASE || s.st === MS_ATTACK;
      const a = v.bar.tick(s.hp, s.mhp, engaged, dead, dt, this.time);
      if (a > 0) {
        const r = v.model.root;
        bars.push(
          r.position.x,
          r.position.y + v.barY,
          r.position.z,
          v.bar.width,
          s.hp / Math.max(1, s.mhp),
          v.bar.trail.value,
          v.bar.kind,
          a,
        );
      }
      if (v.label) v.label.visible = !dead && !monHidden(mf) && d2 < 70 * 70 && id !== this.hudBossId;
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
        const glow = g.children[1]!;
        const pulse = 1 + Math.sin(this.time * 3 + s.x) * 0.18;
        glow.scale.set(0.55 * pulse, 0.75 * pulse, 0.55 * pulse);
      }
    });

    // ----- NPC -----
    for (const n of this.npcs) {
      if (n.skinPending && !this.npcPending(n.id)) {
        n.skinPending = false;
        const next = this.npcModel(n.id, n.color);
        if (next.constructor !== n.model.constructor) {
          n.model.root.remove(n.label, n.marker);
          n.model.root.removeFromParent();
          n.model.dispose();
          n.model = next;
          this.placeNpc(n);
        } else next.dispose();
      }
      // Độ cao theo địa hình của level đang hiển thị: NPC dựng khi vào room, lúc đó địa hình level mới có thể chưa nạp xong (Đoạn Mạch).
      const gy = groundAt(n.x, n.z);
      if (gy !== n.y) {
        n.y = gy;
        n.model.root.position.y = gy;
      }
      // LOD/bóng/nhịp mixer của NPC có xương do applyLodBudget quyết định (theo camera, chung suất LOD0).
      n.model.update(dt, { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false });
      if (n.marker.visible) n.marker.position.y = n.markerY + Math.sin(this.time * 3) * 0.12;
    }

    // ----- người đồng hành hộ tống: trượt tới điểm server báo, bước đi theo quãng đã trượt -----
    for (const e of this.escorts.values()) {
      // Model nạp chưa xong lúc dựng (vào Vân Hải khi đang hộ tống, kết nối lại): đổi sang model thật khi xong, như NPC đứng.
      if (e.skinPending && e.npc && !this.npcPending(e.npc)) {
        e.skinPending = false;
        const next = this.npcModel(e.npc, e.color);
        if (next.constructor !== e.model.constructor) {
          e.model.root.remove(e.label, e.marker);
          e.model.root.removeFromParent();
          e.model.dispose();
          e.model = next;
          if (!NPC_SKINS[e.npc]?.look) this.npcSkins.addWalk(e.model, e.npc);
          this.placeNpc(e);
        } else next.dispose();
      }
      const dx = (e.tx ?? e.x) - e.x;
      const dz = (e.tz ?? e.z) - e.z;
      const d = Math.hypot(dx, dz);
      const step = d > 20 ? d : Math.min(d, Math.max(d * Math.min(1, dt * 6), 0));
      if (d > 1e-4) {
        e.x += (dx / d) * step;
        e.z += (dz / d) * step;
      }
      e.y = groundAt(e.x, e.z);
      e.model.root.position.set(e.x, e.y, e.z);
      let dy = e.yaw - e.model.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.model.root.rotation.y += dy * Math.min(1, dt * 8);
      e.model.update(dt, { speed: step > 1e-3 ? 1.4 : 0, flying: false, meditating: false, dead: false, casting: false, airborne: false });
      e.label.visible = !this.tagsHidden;
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
    LABELS.update();

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
      v.sepX += (bodies[i]!.ox - v.sepX) * k;
      v.sepZ += (bodies[i]!.oz - v.sepZ) * k;
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
    const add = (model: CharacterView, isLocal: boolean, label: Label | null = null, target = false, labelKeep = false) => {
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
        if (e.label.visible && pc && vh > 0) this.fitLabel(e, pc, vw, vh, boxes);
      }
      if (!e.model.setView) continue;
      // Người mặc áo bộ mô-đun nhiều draw call hơn ở LOD0 (thân, áo, kiếm, vỏ, bóng): tính hai suất để cả đám đông ≤ 300 draw.
      const cost = (e.model as { dressed?: boolean }).dressed ? 2 : 1;
      const allow = e.local || (e.inView && lod0 + cost <= LOD0_MAX);
      if (allow) lod0 += cost;
      e.model.setView({ dist: e.local ? 0 : e.d, inView: e.local || e.inView, allowLod0: allow, self: e.local });
    }
  }

  /** Nhờ renderer biên dịch trước skin quái vừa nạp (T5). */
  setWarm(fn: ((obj: THREE.Object3D) => Promise<void>) | null): void {
    this.skins.warm = fn;
  }

  /** Hộp màn hình (px) của các nhãn đang hiện khung này, để số sát thương tránh đè lên tên. */
  labelBoxes: Box[] = [];

  /**
   * Kẹp cỡ nhãn trên màn hình (không phóng khổng lồ khi camera sát) và ẩn nhãn chồng lên nhãn gần hơn
   * (mình và mục tiêu luôn giữ). Duyệt theo thứ tự ưu tiên của `lodList`: mình, rồi gần → xa.
   */
  private fitLabel(
    e: { model: CharacterView; label: Label | null; local: boolean; target: boolean; d: number },
    cam: THREE.PerspectiveCamera,
    vw: number,
    vh: number,
    boxes: Box[],
  ): void {
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
    const ui = uiScale();
    const f = fitFactor(ud.w0 * ps, dist, cam.fov, vh, LABEL_PX.min * ui, LABEL_PX.max * ui);
    sp.scale.set(ud.w0 * f, ud.h0! * f, 1);
    const alpha = labelOpacity(dist, e.local || e.target);
    sp.material.opacity = alpha;
    if (alpha <= 0.02) {
      sp.visible = false;
      return;
    }
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
  hitReact(dst: string, src: string | undefined, crit: boolean, delay: number, heavy = false, stop?: StopPair): void {
    const vd = this.players.get(dst) ?? this.monsters.get(dst);
    if (!vd) return;
    const vs = src && src !== dst ? (this.players.get(src) ?? this.monsters.get(src)) : undefined;
    // Chỉ khựng khi đòn liên quan tới mình, để boss bị nhiều người đánh không đứng hình liên tục.
    const noStop = src !== this.mySid && dst !== this.mySid;
    vd.model.hitReact({
      crit,
      heavy,
      delay,
      noStop,
      stop: stop?.target,
      noFlash: this.tagsHidden && this.monsters.has(dst),
      dirX: vs ? vd.x - vs.x : 0,
      dirZ: vs ? vd.z - vs.z : 0,
    });
    if (src && src === this.mySid && vs) vs.model.hit.hitStop(stop?.attacker ?? 0, delay);
  }

  /** Vị trí vẽ của người chơi cách đây `sec` giây (hoặc cũ nhất còn lưu): điểm xuất phát cho lướt hiển thị. */
  posAgo(sid: string, sec: number): { x: number; z: number } | null {
    const v = this.players.get(sid);
    if (!v || !v.hist.length) return null;
    const want = this.time - sec;
    let best = v.hist[0]!;
    for (const e of v.hist) if (e.t <= want) best = e;
    return best;
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
  nearestInteractable(x: number, y: number, z: number): { kind: 'npc' | 'node' | 'portal'; id: string; dist: number; to?: string } | null {
    let best: { kind: 'npc' | 'node' | 'portal'; id: string; dist: number; to?: string } | null = null;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < 7 && (!best || d < best.dist)) best = { kind: 'npc', id: n.id, dist: d };
    }
    for (const [id, g] of this.nodes) {
      if (!g.visible) continue;
      const d = Math.hypot(g.position.x - x, g.position.z - z);
      if (d < 4.2 && Math.abs(g.position.y - y) < 5 && (!best || d < best.dist)) best = { kind: 'node', id, dist: d };
    }
    for (const gate of this.gates) {
      const dg = Math.hypot(gate.x - x, gate.z - z);
      if (dg < 11 && (!best || dg < best.dist)) best = { kind: 'portal', id: gate.id, dist: dg, to: gate.to };
    }
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
    return list[(i + 1) % list.length]!.id;
  }

  /** Giới tính nhân vật của mình ('m' | 'f') theo trạng thái server; UI dùng để báo món giới hạn giới tính. */
  localGender(): string {
    return this.localLook.g;
  }

  /** Khóa ngoại hình của mình (xem trước nhân vật 3D, TD-C): đổi khi đổi đồ, giới tính, màu áo, kiếm. */
  previewKey(): string {
    return JSON.stringify(this.localLook);
  }

  /** Dựng một model riêng cho xem trước nhân vật (không đưa vào cảnh chính); bên gọi tự dispose. */
  previewBuild(): { model: CharacterView; key: string; pending: boolean } {
    const look = this.localLook;
    const model = this.playerSkins.create(look);
    return { model, key: JSON.stringify(look), pending: this.playerSkins.pending(look) };
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
    for (const id of [...this.escorts.keys()]) this.removeEscort(id);
    this.npcSkins.dispose();
    this.markerNew.dispose();
    this.markerDone.dispose();
    this.markerWait.dispose();
    this.bars.dispose();
    LABELS.mesh.removeFromParent();
    this.group.removeFromParent();
  }
}
