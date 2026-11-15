import * as THREE from 'three/webgpu';
import { Client, type Room } from 'colyseus.js';
import {
  biomeAt,
  C,
  type CdMsg,
  type CharView,
  type ChatMsg,
  cloneMoveState,
  type DmgMsg,
  DUNGEON_EXIT,
  FLY_UNLOCK_LEVEL,
  type FxMsg,
  groundAt,
  type HazardMsg,
  type BoltEndMsg,
  type BoltMsg,
  IN_DOWN,
  IN_FLY,
  IN_JUMP,
  IN_UP,
  type InitMsg,
  type InvMsg,
  type MoveCtx,
  type MoveInput,
  type MoveState,
  MF_BROKEN,
  MF_CHANT,
  MF_STUN,
  MS_ATTACK,
  MS_CHASE,
  MS_DEAD,
  PF_CASTING,
  PF_DEAD,
  PF_FLYING,
  PF_MEDITATING,
  PF_SHIELD,
  PF_TRIBULATION,
  phaseRules,
  PORTAL_POS,
  type QuestView,
  SECT,
  SPAWN_POINT,
  ROOM_DUNGEON,
  ROOM_WORLD,
  S,
  STEP,
  stepMove,
  type SysMsg,
  type TransferMsg,
  type MethodMsg,
  type SkillDef,
  BAR_SIZE,
  CHARGE_MAX,
} from '@dtl/shared';
import type { Appearance } from '@dtl/shared';
import { hasString, ITEM, itemName, LEVELS, METHOD, METHOD_SKILLS, MONSTER, monsterName, NPCS, QUEST, realmName, resolveBarSkill, skillBar, SKILL, SKILLS, skillName, t } from '@dtl/content';
import { fxColor, METHOD_FX, playMethodFx, playVariantExtras } from './methodFx';
import { type BossInfo, type DebugInfo, get, pushLog, pushToast, set, type TargetCast, type TargetInfo, togglePanel, useUI } from '../ui/store';
import { chapterSting, duckHold, lootChime, playSting, type Sfx, setListener, sfx, unlockAudio } from './audio';
import { FootstepDriver } from './footsteps';
import { buildSources, Soundscape } from './soundscape';
import { audioSpatialApi } from './soundscapeAudio';
import { CamFrame, CHAPTER, type ChapterKind, firstTime } from './chapter';
import { DeathFx } from './deathFx';
import { BOSS_CUTSCENE, BOSS_CUTSCENE_RANGE, bossIntroPath, Cutscene, minBossDist, PHASE_CUTSCENE, phaseShiftPath, SECT_CUTSCENE, type Vec3, type Waypoint } from './cutscene';
import { LootFly } from './lootFly';
import { gearLootTier, LOOT_ARC, LOOT_BOUNCE, LOOT_TIERS, lootColor, lootTier } from '../render/vfx/loot';
import { BOLT_VIEW_DIST, boltAge } from '../render/vfx/projectile';
import { EntityManager, type MonVis, type MState, type PState, type WorldView } from './entities';
import { Environment } from './env';
import { AmbientParticles } from './ambient';
import { Grass, GRASS_PUSH_SLOTS, monsterPushRadius, pickPushers, type Pusher } from './grass';
import { MODEL_MAT } from './models';
import { applyAtmosphere, createLanternHalos, setHeightFog } from '../render/atmosphere';
import { applyGrading, budgetPixelRatio, markBloom, PostPipeline, postParams } from '../render/post';
import { patchNodeCacheKey } from '../render/nodeCacheFix';
import { adoptGltfMaterials, createWorldMaterial } from '../render/materials/world';
import { GRADING, GRADING_DEFAULT } from '../render/grading';
import { MusicController } from './music';
import { updateOcclusion, withOccluderFade } from './occlusion';
import { LanternLights } from '../render/lanternLights';
import { buildPortalDisc, buildSect, SECT_LANTERNS } from './sect';
import { PropLayer } from './props';
import { type AssetHandle, assets } from './assets';
import { prefetchWorldAssets } from './preload';
import { renderMinimap, Terrain } from './terrain';
import { loadGroundTextures, type GroundTextures } from './groundTextures';
import type { GroundLevel } from '../render/materials/ground';
import { telegraph } from './telegraph';
import { DamageNumbers, HAZARD_COLORS, Vfx } from './vfx';
import { skipOthersFx } from './fxBudget';
import { nearestGoalSpot, type OffCandidate, OffscreenIndicators, questGoal, trackedQuestId } from './offscreen';
import { CameraShake, SHAKE } from './shake';
import { isHeld, isKeyFor, KEY_ACTIONS, preventsDefault, skillSlot } from '../input/bindings';
import { KeyState } from '../input/keyboard';
import { SkillQueue } from '../input/skillQueue';
import { SkillPoses } from './skillPose';
import { readTestParams } from './testParams';

export interface LoginOptions {
  token?: string;
  dev?: string;
  name?: string;
  /** Ngoại hình chọn lúc tạo nhân vật; server kiểm và chỉ dùng khi tạo mới. */
  ap?: Appearance;
  /** Linh căn chọn lúc tạo nhân vật (RootId); thiếu thì server gán ngẫu nhiên. Chỉ dùng khi tạo mới. */
  rt?: string;
}

/**
 * URL server, theo thứ tự:
 * 1. VITE_SERVER_URL (nhận lúc chạy Vite dev hoặc lúc `vite build`).
 * 2. Vite dev (`DEV`, mọi CLIENT_PORT): cùng hostname, cổng PORT lúc khởi động Vite (mặc định 2567).
 * 3. Trang ở cổng mặc định 5173/4173 (kể cả `vite preview` bản build): cùng hostname, cổng 2567.
 * 4. Còn lại (bản build do server phục vụ): cùng origin.
 * `vite preview` chạy bản build nên không biết PORT/CLIENT_PORT. Preview ở cổng khác 4173 hoặc
 * server khác 2567 thì phải đặt VITE_SERVER_URL khi build, không thì client nối nhầm vào chính
 * server preview.
 */
export function serverUrl(): string {
  const env = (import.meta as unknown as { env: Record<string, string | boolean | undefined> }).env;
  if (typeof env.VITE_SERVER_URL === 'string' && env.VITE_SERVER_URL) return env.VITE_SERVER_URL;
  const { protocol, hostname, host, port } = window.location;
  if (env.DEV === true || port === '5173' || port === '4173') {
    return `ws://${hostname}:${env.VITE_DEV_SERVER_PORT || '2567'}`;
  }
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}`;
}

function isWebGPU(r: THREE.WebGPURenderer): boolean {
  return !!(r.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
}

/**
 * bloom/msaa/fxaa: post-processing (render/post.ts). maxPixels: ngân sách điểm ảnh nội bộ (hạ
 * pixelRatio trên màn hình lớn để giữ VRAM render target dưới ngân sách). heightFog: sương theo độ cao.
 */
const QUALITY: Record<string, { pixelRatio: number; maxPixels: number; shadows: boolean; bloom: boolean; msaa: number; fxaa: boolean; heightFog: boolean; ground: GroundLevel; ao: boolean; lights: boolean; radial: boolean }> = {
  low: { pixelRatio: 1, maxPixels: 2e6, shadows: false, bloom: false, msaa: 0, fxaa: false, heightFog: false, ground: 'low', ao: false, lights: false, radial: false },
  medium: { pixelRatio: 1.5, maxPixels: 4e6, shadows: false, bloom: true, msaa: 0, fxaa: true, heightFog: true, ground: 'medium', ao: true, lights: false, radial: true },
  high: { pixelRatio: 2, maxPixels: 8e6, shadows: true, bloom: true, msaa: 0, fxaa: true, heightFog: true, ground: 'high', ao: true, lights: true, radial: true },
};

/** Hệ số đèn thật theo thời điểm: buổi sớm vừa phải, đêm đậm. */
const LANTERN_LIGHT: Record<string, number> = { dawn: 1, day: 0.6, night: 1.8 };

/** Hiệu ứng của chính mình → nhạc ngắn trong manifest.music (tools/audio/compose/sting_*.mjs). */
const STINGS: Record<string, string> = { levelup: 'sting_levelup', ascend: 'sting_breakthrough', death: 'sting_death' };
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _shakePos = new THREE.Vector3();
const _shakeLook = new THREE.Vector3();
const _camFocus = new THREE.Vector3();
const _cineEndP = new THREE.Vector3();
const _cineEndL = new THREE.Vector3();
const _cineFwd = new THREE.Vector3();
const _cineP: Vec3 = { x: 0, y: 0, z: 0 };
const _cineL: Vec3 = { x: 0, y: 0, z: 0 };

let reqCounter = 0;
/** Khóa chống gửi trùng cho các thao tác vật phẩm/tiền. */
export function reqId(): string {
  return Date.now().toString(36) + '-' + (reqCounter++).toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
}

export class Game {
  static current: Game | null = null;
  private static client: Client | null = null;
  private static lastLogin: LoginOptions = {};
  /** Mã phiên server cấp sau lần đăng nhập đầu; dùng cho chuyển room và vào lại. */
  private static session = '';

  /** Vào một room bằng mã phiên; nếu phiên hết hạn thì dùng lại thông tin đăng nhập gốc. */
  private static async join(roomName: string): Promise<Room> {
    if (!Game.client) throw new Error('no client');
    if (Game.session) {
      try {
        // ?god đi theo mỗi lần vào room (bí cảnh, quay về); ?at chỉ áp lần vào đầu tiên.
        return await Game.client.joinOrCreate(roomName, { session: Game.session, god: readTestParams(location.search).god });
      } catch (e) {
        if ((e as { code?: number }).code !== 4014) throw e;
        Game.session = '';
      }
    }
    return Game.client.joinOrCreate(roomName, { ...Game.lastLogin, god: readTestParams(location.search).god });
  }

  /** Đăng nhập và vào thế giới. Lỗi được đưa lên UI qua store. */
  static async connect(opts: LoginOptions): Promise<void> {
    set({ phase: 'connecting', error: '', nameError: '' });
    // M6-1: GLB tải song song với lúc chờ server và lúc dựng thế giới thủ tục.
    prefetchWorldAssets(undefined, undefined, opts.ap?.g);
    Game.lastLogin = opts;
    Game.session = '';
    try {
      Game.client = new Client(serverUrl());
      // M1-10: ?god / ?at=<địa điểm>; server chỉ nhận với tài khoản thử, tài khoản thật bị từ chối.
      const room = await Game.client.joinOrCreate(ROOM_WORLD, { ...opts, ...readTestParams(location.search) });
      await Game.enter(room);
    } catch (e) {
      const err = e as { code?: number; message?: string };
      if (err.code === 4010) set({ phase: 'login', needName: true });
      else if (err.code === 4011) set({ phase: 'login', needName: true, nameError: t('ui.err.name_taken') });
      else if (err.code === 4012) set({ phase: 'error', error: t('ui.err.not_invited') });
      else if (err.code === 4013) set({ phase: 'error', error: t('ui.err.auth') });
      else if (err.code === 429) set({ phase: 'error', error: t('ui.err.rate_limited') });
      else set({ phase: 'error', error: t('ui.err.connect') + (err.message ? ` (${err.message})` : '') });
    }
  }

  private static enter(room: Room): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 10000);
      room.onMessage(S.INIT, (init: InitMsg) => {
        clearTimeout(timer);
        Game.session = init.session;
        const prev = Game.current;
        if (prev) {
          prev.rebind(room, init);
        } else {
          const g = new Game(room, init);
          Game.current = g;
          // Để tiện gỡ lỗi từ console của trình duyệt.
          (window as unknown as { __game?: Game }).__game = g;
          g.start().catch((err) => {
            console.error(err);
            set({ phase: 'error', error: t('ui.err.webgl') + ' ' + String(err?.message ?? err) });
          });
        }
        resolve();
      });
    });
  }

  room: Room;
  sid: string;
  view: WorldView;
  levelId = '';

  renderer!: THREE.WebGPURenderer;
  private post: PostPipeline | null = null;
  /** Bộ texture mặt đất PBR, nạp sau khung đầu (P2-A2). */
  private ground: GroundTextures | null = null;
  /** Đèn lồng có ánh sáng điểm thật (chỉ preset Cao). */
  private lanterns: LanternLights | null = null;
  /** Bước chân theo chất liệu mặt đất và nguồn âm theo vị trí (P2-D3); dựng lại mỗi khi đổi room (`resetSound`). */
  private steps: FootstepDriver | null = null;
  private scape: Soundscape | null = null;
  /** `matrixWorldAutoUpdate = false`: `frame()` tự cập nhật ma trận một lần trước khi vẽ (M3-9). */
  scene = Object.assign(new THREE.Scene(), { matrixWorldAutoUpdate: false });
  camera = new THREE.PerspectiveCamera(55, 1, 0.3, 9000);
  terrain!: Terrain;
  env!: Environment;
  /** Cỏ tương tác quanh người chơi (V4); preset Thấp tắt. */
  grass!: Grass;
  props: PropLayer | null = null;
  /** Hạt môi trường quanh camera (V4), phát vào hệ hạt chung. */
  ambient!: AmbientParticles;
  private pushers: Pusher[] = Array.from({ length: GRASS_PUSH_SLOTS }, () => ({ x: 0, y: 0, z: 0, r: 0 }));
  private pushSelf: Pusher = { x: 0, y: 0, z: 0, r: 1.6 };
  private pushPool: Pusher[] = [];
  ents!: EntityManager;
  vfx!: Vfx;
  dmg!: DamageNumbers;
  lootFly!: LootFly;
  private lootLayer: HTMLDivElement | null = null;
  /** Lần rơi gần nhất theo nguồn (để các món cùng một con quái tỏa ra lệch nhau). */
  private lootSlots = new Map<string, { at: number; n: number }>();
  /** Đồ rơi bậc cao nhất đang nằm trên đất (cho chỉ báo ngoài màn hình). */
  private rareLoot: { key: string; item: string; pos: THREE.Vector3; until: number }[] = [];
  /** Lần cuối vẽ vệt mực đòn nặng theo nạn nhân (giới hạn tần suất). */
  private inkHitAt = new Map<string, number>();
  offscreen!: OffscreenIndicators;
  minimap!: HTMLCanvasElement;
  private stage: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private portalDisc: THREE.Mesh | null = null;
  private exitDisc: THREE.Mesh | null = null;
  private sectMesh: THREE.Mesh | null = null;
  private sectAsset: { handle: AssetHandle; mats: THREE.Material[] } | null = null;
  /** Material kiến trúc tông môn: riêng với MODEL_MAT để làm mờ vật che mà không ảnh hưởng nhân vật. */
  private sectMat = withOccluderFade(createWorldMaterial({ vertexColors: true }));
  shake = new CameraShake();

  // Dự đoán di chuyển.
  private cur: MoveState = { x: 0, y: 0, z: 0, vy: 0, grounded: true, flying: false };
  private prev: MoveState = { x: 0, y: 0, z: 0, vy: 0, grounded: true, flying: false };
  private pending: MoveInput[] = [];
  private seq = 0;
  private acc = 0;
  private offset = new THREE.Vector3();
  private lastAck = -1;
  private lastSx = NaN;
  private lastSy = NaN;
  private lastSz = NaN;
  private lastFl = -1;
  renderPos = new THREE.Vector3();
  private facing = 0;
  private faceTargetUntil = 0;
  private speed = 0;

  // Camera & input.
  private camYaw = 0;
  /**
   * 'mouse': nhìn bằng chuột kiểu FPS (khóa con trỏ, rê chuột là xoay), A/D bước ngang.
   * 'turn': A/D xoay hướng nhìn (chơi không cần chuột).
   * 'strafe': A/D bước ngang, giữ chuột kéo để xoay.
   */
  private controls: string = get().controls;
  /** Con trỏ đang bị khóa vào canvas (đang nhìn bằng chuột). */
  private locked = false;
  /** Người chơi muốn nhìn bằng chuột: tự khóa lại con trỏ sau khi đóng bảng. */
  private wantLock = false;
  private selfUnlock = false;
  private uiNeedsCursor = false;
  private camPitch = 0.38;
  private camDist = 13;
  private camDistCur = 13;
  private keys = new KeyState();
  private skillQueue = new SkillQueue();
  private ultCardId = 0;
  /** Động tác chiêu (M3-4): dự đoán khi bấm phím, khớp lúc ra đòn với hiệu ứng. */
  private skillPoses = new SkillPoses();
  private dragging = false;
  private dragMoved = 0;
  private lastPX = 0;
  private lastPY = 0;
  private autorun = false;
  wantFly = false;
  private flyLostAt = 0;

  targetId = '';
  private targetKind: TargetInfo['kind'] = 'mon';
  private autoAttack = false;
  private lastAttackSend = 0;
  private bossLineId = 0;
  /** Thẻ chương (C2): khung camera nhẹ, thẻ chờ tới khi thế giới đã dựng, đã xét lần đầu vào tông môn chưa. */
  private camFrame = new CamFrame();
  /** Cảnh mở đầu (P2-B1): camera điện ảnh lần đầu vào Lạc Kiếm Tông; xong thì hiện thẻ chương 'sect'. */
  private cine = new Cutscene();
  /** Loại cảnh đang chạy (xem CineState.kind) và cờ rung lần hai của cảnh chuyển pha. */
  private cineKind: 'sect' | 'boss' | 'phase' = 'sect';
  private cineShakeAt = 0;
  /** Cảnh độ kiếp của mình (P2-B4): 0..1 độ đậm của màu tối/tím toàn cảnh, và cờ đang trong cảnh (ẩn nhãn 3D). */
  private tribMix = 0;
  private tribScene = false;
  /** Chết và hồi sinh (P2-B5): mực loang, khử màu, camera trôi; linh quang khi sống lại. Chỉ trình diễn theo cờ PF_DEAD. */
  private deathFx = new DeathFx();
  /** Giờ kết thúc kiếp theo tin `tribstart`, giữ riêng để đồng bộ HUD không xoá nếu tin đến trước cờ trạng thái. */
  private tribUntil = 0;
  /** Boss mà cảnh xuất hiện đang nhìn theo (vị trí hiện tại, vì boss đang chạy), và độ cao ngực so với chân. */
  private cineFocus: { id: string; rise: number; scale: number } | null = null;
  /** Boss đã được xét cảnh xuất hiện trong lần giao chiến này (xóa khi boss hồi/gục). */
  private bossIntroSeen = new Set<string>();
  private pendingChapter: ChapterKind | null = null;
  private sectChecked = false;
  private timeOffset = 0;

  private started = false;

  /**
   * Game đã vào thế giới và chưa bị hủy: MusicController của nó là chủ duy nhất của kênh nhạc nền, kể cả lúc chuyển
   * room (pha `loading`, Game được rebind) hay màn lỗi khi chưa bấm thử lại. Màn tiêu đề chỉ phát `title` khi false.
   */
  get ownsMusic(): boolean {
    return this.started && !this.disposed;
  }
  private startedAt = 0;
  private frames = 0;
  /** Số đo khung vừa vẽ, cộng dồn qua mọi pass (cho `__game.info()`). */
  private lastRender = { drawCalls: 0, triangles: 0 };
  private hudAt = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lastT = performance.now();
  private disposed = false;
  private leaving = false;
  private debugPerf = new URLSearchParams(location.search).has('debug');
  /** performance.now() lúc gửi input, theo seq & 127 (để ước tính ping). */
  private inputSentAt: number[] = [];
  private ping = 0;
  private listeners: (() => void)[] = [];
  private music = new MusicController();

  constructor(room: Room, init: InitMsg) {
    this.room = room;
    this.sid = init.sid;
    this.view = room.state as unknown as WorldView;
    this.stage = document.getElementById('stage')!;
    this.applyInit(init);
    this.bindRoom(room);
  }

  private applyInit(init: InitMsg): void {
    this.sid = init.sid;
    this.timeOffset = init.serverTime - Date.now();
    set({
      phase: this.started ? 'game' : 'loading',
      room: init.room,
      dev: init.dev,
      char: init.char,
      inv: init.inv,
      equip: init.equip,
      quests: init.quests,
      target: null,
      boss: null,
      npc: null,
      tribEnd: 0,
      castEnd: 0,
    });
    this.targetId = '';
    this.autoAttack = false;
    this.skillQueue.cancel();
    set({ queuedSkill: -1 });
    this.pending.length = 0;
    this.inputSentAt.length = 0;
    this.seq = 0;
    this.lastAck = -1;
    this.wantFly = false;
  }

  /** Chuyển sang room khác (bí cảnh ↔ thế giới) mà không dựng lại renderer. */
  private rebind(room: Room, init: InitMsg): void {
    this.room = room;
    this.view = room.state as unknown as WorldView;
    this.applyInit(init);
    this.bindRoom(room);
    this.ents?.dispose();
    this.ents = new EntityManager(this.scene, this.sid, init.room === ROOM_WORLD ? 'van_lam' : 'kiem_trung');
    this.resetSound(init.room === ROOM_WORLD);
    this.ents.camera = this.camera;
    // Vào bí cảnh: thẻ chương hiện khi nhân vật đã có trong room mới (khung đầu tiên sau khi bắt kịp server).
    this.pendingChapter = init.room === ROOM_DUNGEON ? 'dungeon' : null;
    this.camFrame.cancel();
    this.ents.onMonsterDeath = (m) => this.monsterInk(m);
    this.snapToServer = true;
    this.dmg?.clear();
    this.offscreen?.clear();
    this.lootFly?.clear();
    this.rareLoot.length = 0;
    this.lootSlots.clear();
    this.inkHitAt.clear();
  }
  private snapToServer = true;

  private bindRoom(room: Room): void {
    this.leaving = false;
    room.onMessage(S.CHAR, (c: CharView) => {
      set({ char: c });
      this.questMarkersDirty = true;
    });
    room.onMessage(S.INV, (m: InvMsg) => set({ inv: m.inv, equip: m.equip }));
    room.onMessage(S.QUESTS, (q: QuestView) => {
      set({ quests: q });
      this.questMarkersDirty = true;
    });
    room.onMessage(S.CD, (m: CdMsg) => {
      const off = Date.now() - m.now;
      const cds: Record<string, number> = {};
      for (const k in m.cds) cds[k] = m.cds[k] + off;
      set({ cds, gcdAt: m.gcd + off });
    });
    room.onMessage(S.METHOD, (m: MethodMsg) => set({ method: m, methodOff: Date.now() - m.now }));
    room.onMessage(S.SYS, (m: SysMsg) => this.onSys(m));
    room.onMessage(S.FX, (m: FxMsg) => this.onFx(m));
    room.onMessage(S.DMG, (m: DmgMsg) => this.onDmg(m));
    room.onMessage(S.HAZARD, (m: HazardMsg) => {
      // Vùng chữ nhật/quạt ở xa không ai thấy: bỏ qua (chưa có AOI nên cả kênh nhận).
      if (m.sh && this.vfx) {
        if (Math.hypot(m.x - this.renderPos.x, m.z - this.renderPos.z) < 90) telegraph(this.vfx, m);
      }
      else this.vfx?.hazard(m.x, m.z, m.r, m.delay, m.kind, m.sd, this.lightningFlash(m));
      // Boss thả vùng: động tác đòn lớn chạm đúng lúc vùng nổ (vùng chữ nhật/quạt từ boss = chém/quét, vùng tròn = nện).
      if (m.src) this.ents?.monsters.get(m.src)?.model.bossMove?.(m.sh ? 'sweep' : 'slam', m.delay);
      const vol = this.volumeAt(m.x, m.z);
      setTimeout(() => {
        sfx(m.kind === 'lightning' ? 'thunder' : 'impact', vol, m);
        this.shakeForHazard(m);
      }, m.delay * 1000);
    });
    room.onMessage(S.BOLT, (m: BoltMsg) => {
      // Đạn của quái (D1): chỉ vẽ, server phán định trúng. Bù độ trễ bằng giờ server lúc bắn.
      if (!this.vfx || Math.hypot(m.x - this.renderPos.x, m.z - this.renderPos.z) > BOLT_VIEW_DIST) return;
      this.vfx.bolts.spawn(m, boltAge(m, Date.now() + this.timeOffset), HAZARD_COLORS[m.kind] ?? HAZARD_COLORS.fire);
      sfx('sword', this.volumeAt(m.x, m.z) * 0.45, m);
    });
    room.onMessage(S.BOLT_END, (m: BoltEndMsg) => {
      this.vfx?.bolts.end(m.id, m.x, m.z, !!m.hit);
      if (m.hit) sfx('impact', m.hit === this.sid ? 0.8 : this.volumeAt(m.x, m.z) * 0.5, m);
    });
    room.onMessage(S.CHAT, (m: ChatMsg) => pushLog(m.m, 'chat', m.from));
    room.onMessage(S.KICK, (m: { k: string }) => {
      this.leaving = true;
      set({ phase: 'error', error: t(m.k) });
    });
    room.onMessage(S.TRANSFER, (m: TransferMsg) => this.transfer(m));
    room.onMessage('*', () => {});
    room.onLeave((code) => {
      if (this.leaving || this.disposed || this.room !== room) return;
      this.tryReconnect(room, code);
    });
  }

  private async tryReconnect(room: Room, code: number): Promise<void> {
    pushLog(t('ui.reconnecting'), 'bad');
    const token = room.reconnectionToken;
    for (let i = 0; i < 4 && Game.client && token; i++) {
      await new Promise((r) => setTimeout(r, 1200 + i * 1500));
      try {
        const again = await Game.client.reconnect(token);
        this.room = again;
        this.view = again.state as unknown as WorldView;
        this.bindRoom(again);
        this.pending.length = 0;
        this.snapToServer = true;
        pushLog(t('ui.reconnected'), 'good');
        return;
      } catch {
        /* thử lại */
      }
    }
    // Không nối lại được phiên cũ: vào lại từ đầu bằng thông tin đăng nhập trước đó.
    try {
      this.leaving = true;
      const fresh = await Game.join(ROOM_WORLD);
      await Game.enter(fresh);
      pushLog(t('ui.reconnected'), 'good');
    } catch {
      set({ phase: 'error', error: t('ui.err.disconnected') + ` (${code})` });
    }
  }

  private async transfer(m: TransferMsg): Promise<void> {
    if (!Game.client) return;
    this.leaving = true;
    sfx('portal');
    set({ phase: 'loading' });
    try {
      await this.room.leave(true);
    } catch {
      /* đã rời */
    }
    try {
      const room = await Game.join(m.room);
      await Game.enter(room);
    } catch (e) {
      console.error(e);
      try {
        const room = await Game.join(ROOM_WORLD);
        await Game.enter(room);
      } catch {
        set({ phase: 'error', error: t('ui.err.disconnected') });
      }
    }
  }

  // ---------- khởi động ----------

  /**
   * Số lần biên dịch trước đang chờ (M6-1). Khác 0 thì `frame()` bỏ qua: three r178 vẽ với pipeline WebGPU
   * còn đang biên dịch dở là lỗi.
   */
  private compiling = 0;

  /** Biên dịch trước mọi material trong cảnh theo đích của pass cảnh; lỗi thì để renderer biên dịch khi vẽ. */
  private async precompile(): Promise<void> {
    if (!this.post || this.disposed) return;
    this.compiling++;
    try {
      await this.post.compileScene();
    } catch (e) {
      console.warn('[load] biên dịch trước lỗi, biên dịch khi vẽ:', e);
    } finally {
      this.compiling--;
    }
  }

  /** Nạp texture mặt đất ngoài đường găng: terrain dùng màu đỉnh tới khi xong rồi mới đổi sang shader PBR. */
  private async loadGround(): Promise<void> {
    if (new URLSearchParams(location.search).get('ground') === '0') return;
    const t0 = performance.now();
    try {
      const self = this;
      const tex = await loadGroundTextures(import.meta.env.BASE_URL, { get aborted() { return self.disposed; } });
      if (this.disposed) {
        tex.dispose();
        return;
      }
      this.ground = tex;
      this.loadStats.groundLoad = Math.round(performance.now() - t0);
      this.loadStats.groundAt = Math.round(performance.now());
      this.terrain.setGround(tex, (QUALITY[get().quality] ?? QUALITY.medium).ground);
    } catch (e) {
      console.warn('[ground] không nạp được texture mặt đất, dùng màu đỉnh:', e);
    }
  }

  /** Thời gian từng bước khởi động (ms), để theo dõi thời gian tải. */
  loadStats: Record<string, number> = {};

  async start(): Promise<void> {
    const t0 = performance.now();
    const mark = (k: string) => {
      this.loadStats[k] = Math.round(performance.now() - t0);
    };
    const q = QUALITY[get().quality] ?? QUALITY.medium;
    const params = new URLSearchParams(location.search);
    // Khử răng cưa do PostPipeline lo theo preset; MSAA ở canvas chỉ tốn bộ nhớ.
    // `?gputime=1` (chỉ cho công cụ đo, pnpm bench:crowd): bật timestamp query để đọc thời gian GPU bằng
    // `renderer.resolveTimestampsAsync()`; không ai resolve thì three cảnh báo hết chỗ query, nên đừng bật khi chơi.
    this.renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: params.get('renderer') === 'webgl2', trackTimestamp: params.get('gputime') === '1' });
    await this.renderer.init();
    // Đổi preset lúc chạy làm pass cảnh đổi giữa có/không MRT bloom: phải tách cache shader theo đích (nodeCacheFix.ts).
    patchNodeCacheKey(this.renderer);
    mark('rendererInit');
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = q.shadows;
    // Số liệu render đếm cho cả khung (mọi pass hậu kỳ), reset ở đầu frame(), kể cả khi bơm khung tay.
    this.renderer.info.autoReset = false;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    this.canvas.tabIndex = 0;
    this.stage.appendChild(this.canvas);
    const layer = document.createElement('div');
    layer.className = 'dmg-layer';
    this.stage.appendChild(layer);
    this.dmg = new DamageNumbers(layer);
    const offLayer = document.createElement('div');
    offLayer.className = 'offs-layer';
    this.stage.appendChild(offLayer);
    this.offscreen = new OffscreenIndicators(offLayer);
    this.offscreen.enabled = get().offscreen;
    // Icon đồ rơi bay vào nút túi: lớp cố định trên cả HUD (stage nằm dưới HUD).
    this.lootLayer = document.createElement('div');
    this.lootLayer.className = 'loot-layer';
    document.body.appendChild(this.lootLayer);
    this.lootFly = new LootFly(this.lootLayer);

    this.env = new Environment(this.scene, q.shadows);
    mark('env');
    this.terrain = new Terrain();
    mark('terrainCoarse');
    this.terrain.shadows = q.shadows;
    void this.loadGround();
    this.scene.add(this.terrain.group);
    this.sectMesh = new THREE.Mesh(buildSect(), this.sectMat);
    this.sectMesh.castShadow = q.shadows;
    this.sectMesh.receiveShadow = q.shadows;
    this.sectMesh.frustumCulled = false;
    this.scene.add(this.sectMesh);
    mark('sect');
    this.portalDisc = buildPortalDisc(PORTAL_POS.x, PORTAL_POS.z, 0x8fdcff);
    this.exitDisc = buildPortalDisc(DUNGEON_EXIT.x, DUNGEON_EXIT.z, 0xffd27a);
    this.scene.add(this.portalDisc, this.exitDisc);
    for (const disc of [this.portalDisc, this.exitDisc]) markBloom(disc.material as THREE.Material, 0.8);
    applyAtmosphere(this.scene, this.env, GRADING[GRADING_DEFAULT], GRADING_DEFAULT);
    applyGrading(GRADING[GRADING_DEFAULT]);
    setHeightFog(q.heightFog);
    this.env.setQuality(get().quality);
    this.scene.add(createLanternHalos(SECT_LANTERNS));
    this.lanterns = new LanternLights(this.scene, SECT_LANTERNS);
    this.lanterns.setEnabled(q.lights);
    this.lanterns.setIntensityScale(LANTERN_LIGHT[GRADING_DEFAULT] ?? 1);
    this.post = new PostPipeline(this.renderer, this.scene, this.camera, q);
    this.vfx = new Vfx(this.scene);
    this.vfx.camera = this.camera;
    this.vfx.particles.setQuality(get().quality);
    // P2-A4: prop Tripo (đèn đá, cổ thụ, đá, trúc…), nạp lười theo khoảng cách. `?props=0` tắt để chụp ảnh trước/sau.
    if (new URLSearchParams(location.search).get('props') !== '0') {
      this.props = new PropLayer();
      this.props.setQuality(get().quality, q.shadows);
      this.scene.add(this.props.group);
    }
    this.grass = new Grass();
    this.grass.setQuality(get().quality, q.shadows);
    this.scene.add(this.grass.mesh);
    this.ambient = new AmbientParticles(this.vfx.particles);
    this.ambient.setQuality(get().quality);
    // Chớp toàn cảnh của thiên lôi (M4-4) đi qua uniform `uFlash` của pass chỉnh màu.
    this.vfx.onFlash = (a) => this.post?.flash(a);
    this.ents = new EntityManager(this.scene, this.sid, get().room === ROOM_WORLD ? 'van_lam' : 'kiem_trung');
    this.resetSound(get().room === ROOM_WORLD);
    this.ents.camera = this.camera;
    this.ents.onMonsterDeath = (m) => this.monsterInk(m);
    this.minimap = renderMinimap(320);
    mark('minimap');
    this.startedAt = t0;

    this.loadSectModel(q.shadows);
    this.bindInput();
    this.onResize();
    // M6-1, WebGL2: biên dịch trước material của cảnh (trời, địa hình, kiến trúc, VFX ấm sẵn, cổng) song song
    // (KHR_parallel_shader_compile) thay vì biên dịch + link đồng bộ ở khung đầu. pnpm bench:load (20 Mbps,
    // trung vị 6 lượt): khung đầu − JS 1,80 → 1,59 s, vào game 3,96 → 3,47 s. WebGPU thì không lợi (dựng node
    // TSL vẫn đồng bộ, Chrome vốn biên dịch pipeline ở tiến trình GPU) mà khung đầu trễ thêm ~0,5 s: chỉ "vẽ ấm".
    if (!isWebGPU(this.renderer)) {
      this.vfx.update(0); // đưa các lưới "vẽ ấm" của VFX vào cảnh để được biên dịch cùng
      await this.precompile();
      mark('compile');
    }
    if (this.disposed) return;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Nạp kiến trúc tông môn dựng bằng Blender (asset `arch_sect` qua AssetCache); lỗi thì giữ bản dựng bằng code. */
  private async loadSectModel(shadows: boolean): Promise<void> {
    try {
      await assets.attach(this.renderer);
      const handle = await assets.acquire('arch_sect', { pos: { x: SECT.x, z: SECT.z } });
      if (this.disposed) {
        handle.release();
        return;
      }
      const root = handle.scene;
      // Giữ vật liệu PBR của GLB (mỗi chất liệu một material), chỉ gắn thêm làm mờ vật che.
      this.sectAsset = { handle, mats: adoptGltfMaterials(root, withOccluderFade) };
      root.position.set(SECT.x, SECT.y, SECT.z);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = shadows;
        m.receiveShadow = shadows;
        m.frustumCulled = false;
      });
      this.scene.add(root);
      if (this.sectMesh) {
        const old = this.sectMesh.geometry;
        this.sectMesh.geometry = buildSect(false);
        old.dispose();
      }
      // Còn ở màn tải, WebGL2 (M6-1): biên dịch song song thay vì biên dịch + link đồng bộ trong một khung vẽ
      // (xem `start`). Đã vào game thì dừng vẽ để chờ cũng là khựng, để renderer tự làm.
      if (!this.started && !isWebGPU(this.renderer)) await this.precompile();
    } catch (e) {
      console.warn('[asset] không tải được arch_sect, dùng kiến trúc dựng bằng code:', e);
    }
  }

  private on<K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type as string, fn as EventListener, opts);
    this.listeners.push(() => target.removeEventListener(type as string, fn as EventListener, opts));
  }

  private typing(): boolean {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  private bindInput(): void {
    this.on(window, 'resize', () => this.onResize());
    // Chống kẹt phím (luật chi tiết ở `KeyState`): mất focus, đổi tab, rời trang thì xóa sạch tập phím.
    this.on(window, 'blur', () => this.keys.clear('blur'));
    this.on(window, 'focus', () => this.keys.clear('focus'));
    this.on(window, 'pagehide', () => this.keys.clear('pagehide'));
    this.on(document as unknown as HTMLElement, 'visibilitychange', () => {
      this.keys.clear('visibility');
      this.setHidden(document.hidden);
    });
    // Bấm chuột ở bất cứ đâu (kể cả trên HUD) cũng bỏ qua cảnh mở đầu, đúng như gợi ý "bấm phím bất kỳ".
    this.on(window, 'pointerdown', () => this.skipCine(), { capture: true });
    this.on(window, 'keydown', (e: KeyboardEvent) => {
      if (!e.repeat) this.skipCine();
      this.keys.onDown(e.code, e.altKey, e.repeat);
      this.onKeyDown(e);
    });
    this.on(window, 'keyup', (e: KeyboardEvent) => this.keys.onUp(e.code));
    const c = this.canvas;
    this.on(c, 'contextmenu', (e: Event) => e.preventDefault());
    this.on(c, 'pointerdown', (e: PointerEvent) => {
      unlockAudio();
      this.skipCine();
      c.focus();
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (this.controls === 'mouse') {
        if (!this.locked) {
          // Bấm vào màn hình để bắt đầu nhìn bằng chuột.
          this.wantLock = true;
          this.requestLock();
        } else if (e.button === 0) {
          // Đang khóa con trỏ: bấm chuột trái = chọn / đánh thứ gần tâm ngắm nhất (ngắm mềm, không cần chính xác).
          this.onClick(window.innerWidth / 2, window.innerHeight / 2, window.innerHeight * 0.2);
        }
        return;
      }
      this.dragging = true;
      this.dragMoved = 0;
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
      c.setPointerCapture(e.pointerId);
    });
    this.on(c, 'pointermove', (e: PointerEvent) => {
      if (!this.dragging) return;
      // Mất pointerup (thả chuột ngoài cửa sổ, Alt+Tab): đồng bộ lại theo nút đang giữ thật.
      if (e.buttons === 0) {
        this.dragging = false;
        return;
      }
      const dx = e.clientX - this.lastPX;
      const dy = e.clientY - this.lastPY;
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (this.dragMoved > 4) {
        this.camFrame.cancel();
        this.camYaw -= dx * 0.0055;
        this.camPitch = Math.max(-0.45, Math.min(1.45, this.camPitch + dy * 0.0045));
      }
    });
    this.on(c, 'pointerup', (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* bỏ qua */
      }
      if (this.dragMoved <= 4 && e.button === 0) this.onClick(e.clientX, e.clientY);
    });
    // Mất capture mà không có pointerup (trình duyệt hủy, đổi cửa sổ): dừng kéo ngay, không chờ pointermove.
    // Sự kiện này đến sau pointerup thường, lúc đó dragging đã là false nên không ảnh hưởng cú bấm.
    this.on(c, 'lostpointercapture', () => {
      this.dragging = false;
    });
    this.on(document as unknown as HTMLElement, 'mousemove', (e: MouseEvent) => {
      if (!this.locked) return;
      this.mouseLook(e.movementX, e.movementY);
    });
    this.on(document as unknown as HTMLElement, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      set({ mouseLook: this.locked });
      // Người chơi tự thả chuột (Esc): không tự khóa lại cho tới khi họ bấm vào màn hình.
      if (!this.locked && !this.selfUnlock) this.wantLock = false;
      this.selfUnlock = false;
      this.dragging = false;
    });
    // Mở bảng, hộp thoại, chat hay khi trọng thương: thả con trỏ để bấm được giao diện; đóng lại thì khóa tiếp.
    this.listeners.push(
      useUI.subscribe((st) => {
        const need = st.phase !== 'game' || !!st.panel || !!st.npc || st.chatOpen || (st.flags & PF_DEAD) !== 0;
        if (need === this.uiNeedsCursor) return;
        this.uiNeedsCursor = need;
        if (need && this.locked) {
          this.selfUnlock = true;
          document.exitPointerLock();
        } else if (!need && this.wantLock && this.controls === 'mouse' && !this.locked) {
          this.requestLock();
        }
      }),
    );
    this.on(c, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.camFrame.cancel();
      this.camDist = Math.max(3, Math.min(70, this.camDist * (e.deltaY > 0 ? 1.12 : 0.89)));
    }, { passive: false });
  }

  /** Xoay camera theo độ dịch chuột (điểm ảnh). */
  mouseLook(dx: number, dy: number): void {
    if (dx || dy) this.camFrame.cancel();
    this.camYaw -= dx * 0.0026;
    this.camPitch = Math.max(-0.45, Math.min(1.45, this.camPitch + dy * 0.0022));
  }

  private requestLock(): void {
    if (this.uiNeedsCursor) return;
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      /* trình duyệt từ chối (chưa có thao tác người dùng): chờ lần bấm sau */
    }
  }

  private releaseLock(): void {
    this.wantLock = false;
    if (this.locked) {
      this.selfUnlock = true;
      document.exitPointerLock();
    }
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const q = QUALITY[get().quality] ?? QUALITY.medium;
    this.renderer.setPixelRatio(budgetPixelRatio(w, h, q.pixelRatio, q.maxPixels));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private onKeyDown(e: KeyboardEvent): void {
    unlockAudio();
    if (get().phase !== 'game') return;
    if (this.typing()) return;
    const code = e.code;
    const action = KEY_ACTIONS[code];
    if (action === 'target') {
      e.preventDefault();
      const id = this.ents.nextTarget(this.targetId, this.cur.x, this.cur.z);
      if (id) this.setTarget(id, 'mon');
      return;
    }
    if (preventsDefault(code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.press(code);
    // Bắt đầu di chuyển thì hủy chiêu đang chờ (M1-11).
    if (this.isMoveKey(code, action)) this.cancelQueuedSkill();
    const slot = skillSlot(code);
    if (slot >= 0) {
      if (slot < this.bar().length) this.useSkill(slot);
      else if (slot < BAR_SIZE) pushToast(t('ui.method.empty_slot'), 'info');
      return;
    }
    if (isKeyFor(code, 'forward') || isKeyFor(code, 'back')) this.autorun = false;
    switch (action) {
      case 'fly':
        this.toggleFly();
        break;
      case 'meditate':
        this.toggleMeditate();
        break;
      case 'interact':
        this.interact();
        break;
      case 'autorun':
        this.autorun = !this.autorun;
        break;
      case 'bag':
        togglePanel('bag');
        break;
      case 'char':
        togglePanel('char');
        break;
      case 'quests':
        togglePanel('quests');
        break;
      case 'method':
        togglePanel('method');
        break;
      case 'map':
        togglePanel('map');
        break;
      case 'help':
        togglePanel('help');
        break;
      case 'settings':
        togglePanel('settings');
        break;
      case 'chat':
        set({ chatOpen: true });
        break;
      case 'cancel':
        // Esc lần lượt: hủy chiêu đang chờ → đóng bảng/hội thoại → bỏ chọn mục tiêu.
        if (this.cancelQueuedSkill()) break;
        if (get().panel || get().npc) set({ panel: null, npc: null });
        else this.clearTarget();
        break;
      case 'debug':
        set({ debugOpen: !get().debugOpen });
        this.hudAt = 0;
        break;
      case 'mouseLock':
        // Alt: thả hoặc khóa lại con trỏ khi đang ở chế độ nhìn bằng chuột.
        e.preventDefault();
        if (this.controls !== 'mouse') break;
        if (this.locked) this.releaseLock();
        else {
          this.wantLock = true;
          this.requestLock();
        }
        break;
    }
  }

  /** Phím làm nhân vật bắt đầu di chuyển. Kiểu 'turn': A/D xoay hướng nhìn nên không tính. */
  private isMoveKey(code: string, action: string | undefined): boolean {
    if (action === 'autorun') return true;
    if (isKeyFor(code, 'forward') || isKeyFor(code, 'back') || isKeyFor(code, 'up')) return true;
    return this.controls !== 'turn' && (isKeyFor(code, 'left') || isKeyFor(code, 'right'));
  }

  // ---------- thao tác của người chơi (UI cũng gọi) ----------

  send(type: string, msg?: unknown): void {
    if (this.leaving) return;
    this.room.send(type, msg);
  }

  /**
   * Số đo nhanh từ console / Playwright (`__game.info()`, M1-10). Draw call và tam giác là của khung
   * vừa vẽ, cộng dồn qua MỌI pass (bóng, cảnh, hậu kỳ), không phải chỉ pass cuối như `renderer.info` tự reset.
   */
  info(): {
    backend: 'WebGPU' | 'WebGL2';
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    frames: number;
    room: string;
    x: number;
    y: number;
    z: number;
    hp: number;
    players: number;
    monsters: number;
    lod: number[];
    particles: number;
  } {
    const me = this.me();
    // Gọi được cả lúc đang tải (trước khi start() dựng renderer/thực thể): trả số 0.
    const r = this.renderer as THREE.WebGPURenderer | undefined;
    const mem = r?.info.memory ?? { geometries: 0, textures: 0 };
    const ents = this.ents as EntityManager | undefined;
    return {
      backend: r && isWebGPU(r) ? 'WebGPU' : 'WebGL2',
      drawCalls: this.lastRender.drawCalls,
      triangles: this.lastRender.triangles,
      geometries: mem.geometries,
      textures: mem.textures,
      frames: this.frames,
      room: get().room,
      x: Math.round(this.renderPos.x * 10) / 10,
      y: Math.round(this.renderPos.y * 10) / 10,
      z: Math.round(this.renderPos.z * 10) / 10,
      hp: me?.hp ?? 0,
      players: ents?.players.size ?? 0,
      monsters: ents?.monsters.size ?? 0,
      lod: ents?.lodStats().lod ?? [],
      particles: (this.vfx as Vfx | undefined)?.particles.aliveCount().total ?? 0,
    };
  }

  private me(): PState | undefined {
    return this.view.players?.get(this.sid);
  }

  setTarget(id: string, kind: TargetInfo['kind']): void {
    if (id !== this.targetId) sfx('target', 0.8);
    this.targetId = id;
    this.targetKind = kind;
    if (kind !== 'mon') this.autoAttack = false;
    this.hudAt = 0;
  }

  clearTarget(): void {
    this.targetId = '';
    this.autoAttack = false;
    set({ target: null, autoAttack: false });
  }

  /** Người chơi bấm chiêu (phím số, nút trên thanh chiêu, bấm lại mục tiêu). */
  /** Thanh chiêu hiện tại: 6 chiêu chung + 2 chiêu của công pháp đang tu. */
  bar(): SkillDef[] {
    return skillBar(get().method?.method);
  }

  useSkill(i: number): void {
    const skill = this.bar()[i];
    const me = this.me();
    const ch = get().char;
    if (!skill || !me || !ch) return;
    if (me.fl & PF_DEAD) return;
    if (ch.level < skill.unlock) {
      pushToast(t('ui.skill_locked', { realm: realmName(skill.unlock) }), 'bad');
      return;
    }
    if (skill.ult && (get().method?.charge ?? 0) < CHARGE_MAX) {
      pushToast(t('sys.ult_not_ready'), 'bad');
      return;
    }
    // M1-11: bấm trong 0,4 giây cuối thời gian chờ thì giữ lại, gửi khi hết chờ (xem `SkillQueue`).
    // Còn chờ lâu hơn cửa sổ thì vẫn gửi ngay như cũ và chiêu đang chờ (nếu có) giữ nguyên,
    // nên UI luôn lấy theo ô thật trong hàng đợi.
    const res = this.skillQueue.press(i, Date.now(), this.skillReadyAt(i));
    set({ queuedSkill: this.skillQueue.slot });
    if (res === 'send') this.fireSkill(i);
  }

  /** Thời điểm (đồng hồ client, ms) ô chiêu `i` dùng lại được: sau cả GCD lẫn hồi chiêu riêng. */
  private skillReadyAt(i: number): number {
    const st = get();
    return Math.max(st.gcdAt, st.cds[this.bar()[i]?.id ?? ''] ?? 0);
  }

  /** Hủy chiêu đang chờ; trả true nếu có chiêu bị hủy. */
  cancelQueuedSkill(): boolean {
    if (!this.skillQueue.cancel()) return false;
    set({ queuedSkill: -1 });
    return true;
  }

  /** Gửi ý định dùng chiêu lên server (tự chọn mục tiêu nếu cần). Server vẫn kiểm mọi điều kiện. */
  private fireSkill(i: number): void {
    const skill = this.bar()[i];
    const me = this.me();
    if (!skill || !me || me.fl & PF_DEAD) return;
    const needTarget = skill.kind === 'damage' || skill.kind === 'aoe';
    if (needTarget) {
      const cur = this.ents.monsters.get(this.targetId);
      if (!cur || cur.s.st === MS_DEAD) {
        const id = this.ents.nextTarget('', this.cur.x, this.cur.z);
        if (!id) {
          pushToast(t('sys.no_target'), 'bad');
          return;
        }
        this.setTarget(id, 'mon');
      }
      if (i === 0) {
        this.autoAttack = true;
        set({ autoAttack: true });
      }
      this.faceTargetUntil = performance.now() + 900;
    }
    this.send(C.SKILL, { id: skill.id, t: needTarget ? this.targetId : undefined });
    // Vào thế ngay khi bấm (chỉ hình): chỉ khi client thấy server sẽ nhận (đứng đất, hết chờ, đủ linh lực, trong tầm).
    const mon = needTarget ? this.view.monsters.get(this.targetId) : undefined;
    const inRange = !needTarget || (!!mon && Math.hypot(mon.x - this.cur.x, mon.z - this.cur.z) <= skill.range + 1.5 + (MONSTER.get(mon.t)?.scale ?? 1));
    const ready = Date.now() >= this.skillReadyAt(i) - 60 && me.mp >= skill.mp && (me.fl & PF_CASTING) === 0 && (!skill.ult || (get().method?.charge ?? 0) >= CHARGE_MAX);
    // Biến thức có thể bỏ niệm chú (Lôi Tốc): dự đoán theo thời gian niệm đã gộp biến thức.
    if (inRange && ready && this.cur.grounded && !this.cur.flying) this.skillPoses.predict(this.ents.players.get(this.sid)?.model, { ...skill, cast: resolveBarSkill(get().method, skill).cast }, performance.now());
  }

  toggleFly(): void {
    const ch = get().char;
    if (!ch) return;
    if (!this.wantFly && ch.level < FLY_UNLOCK_LEVEL) {
      pushToast(t('sys.fly_locked', { realm: realmName(FLY_UNLOCK_LEVEL) }), 'bad');
      return;
    }
    this.wantFly = !this.wantFly;
    if (this.wantFly) sfx('fly');
    this.flyLostAt = 0;
    set({ wantFly: this.wantFly });
  }

  toggleMeditate(): void {
    const me = this.me();
    if (!me) return;
    this.wantFly = false;
    set({ wantFly: false });
    const on = (me.fl & PF_MEDITATING) === 0;
    if (on) sfx('meditate');
    this.send(C.MEDITATE, { on });
  }

  interact(): void {
    const near = this.ents.nearestInteractable(this.cur.x, this.cur.y, this.cur.z);
    if (!near) return;
    if (near.kind === 'npc') this.openNpc(near.id);
    else if (near.kind === 'node') this.send(C.GATHER, { id: near.id });
    else this.send(C.PORTAL);
  }

  openNpc(id: string): void {
    this.setTarget(id, 'npc');
    this.send(C.TALK, { npc: id });
    set({ npc: id, panel: null });
  }

  private onClick(x: number, y: number, aim?: number): void {
    const hit = this.ents.pick(x, y, window.innerWidth, window.innerHeight, this.camera, aim);
    if (!hit) return;
    if (hit.kind === 'npc') {
      const n = this.ents.npcs.find((e) => e.id === hit.id)!;
      this.setTarget(hit.id, 'npc');
      if (Math.hypot(n.x - this.cur.x, n.z - this.cur.z) < 8) this.openNpc(hit.id);
      else pushToast(t('sys.too_far'), 'bad');
    } else if (hit.kind === 'node') {
      this.send(C.GATHER, { id: hit.id });
    } else {
      if (hit.kind === 'mon' && hit.id === this.targetId) this.useSkill(0);
      else this.setTarget(hit.id, hit.kind);
    }
  }

  // ---------- message từ server ----------

  private questMarkersDirty = true;

  private onSys(m: SysMsg): void {
    const text = t(m.k, m.p);
    const type = m.t ?? 'info';
    pushLog(text, type);
    if (type === 'good' || type === 'bad' || type === 'info') pushToast(text, type);
    // Đồ rơi từ quái/điểm hái (M4-6): vật có hình thì chuông ngân lúc chạm đất thay cho tiếng xu.
    const shown = type === 'loot' && !!m.src && this.showLoot(m.src, m.i, m.q);
    if (type === 'loot' && (!shown || !m.i)) sfx('loot', 0.7);
    else if (type === 'bad') sfx('ui_error', 0.8);
    if (m.k === 'sys.fly_no_mp') {
      this.wantFly = false;
      set({ wantFly: false });
    }
  }

  private pruneRareLoot(): void {
    const now = performance.now();
    for (let i = this.rareLoot.length - 1; i >= 0; i--) if (this.rareLoot[i].until < now) this.rareLoot.splice(i, 1);
  }

  /** Vệt mực mờ dưới chân nạn nhân đòn nặng (M4-14), tối đa một vệt mỗi 0,4 giây mỗi nạn nhân. */
  private heavyInk(dst: string, src: string | undefined): void {
    const v = this.vfx;
    const e = this.ents;
    if (!v || !e) return;
    const now = performance.now();
    if (now - (this.inkHitAt.get(dst) ?? -1e9) < 400) return;
    const d = e.monsters.get(dst) ?? e.players.get(dst);
    if (!d) return;
    this.inkHitAt.set(dst, now);
    if (this.inkHitAt.size > 64) for (const [k, at] of this.inkHitAt) if (now - at > 400) this.inkHitAt.delete(k);
    const s = src ? (e.players.get(src) ?? e.monsters.get(src)) : undefined;
    // Không rõ người đánh: hướng vệt theo camera nhìn tới.
    const fx = s ? s.x : this.camera.position.x;
    const fz = s ? s.z : this.camera.position.z;
    v.inkStreak(d.x, d.z, fx, fz, e.monsters.has(dst) ? 0.75 : 0.6);
  }

  /** Quái đang thấy vừa gục (M4-14): mực văng ra rồi loang thành vết trên đất, tan dần sau vài giây. */
  private monsterInk(m: MonVis): void {
    const v = this.vfx;
    if (!v || Math.hypot(m.x - this.renderPos.x, m.z - this.renderPos.z) > 70) return;
    const h = m.model.height;
    const size = Math.min(2.4, Math.max(0.8, h / 1.6));
    _v2.set(m.x, m.y + h * 0.5, m.z);
    v.burst(_v2, 0xdce6df, 0.9 * size, 0.3);
    v.inkBurst(_v2, size);
    v.inkSplat(m.x, m.z, Math.min(4.5, Math.max(1.1, h * 0.8)));
  }

  /**
   * Vẽ một món đồ rơi (M4-6) nảy ra từ quái/điểm hái `src`. `item` không có = vàng. Chỉ là lớp hình:
   * món đồ đã vào túi ở server. Trả false nếu không có vị trí để vẽ (nguồn đã mất khỏi trạng thái room).
   */
  private showLoot(src: string, item: string | undefined, q?: number): boolean {
    const v = this.vfx;
    const e = this.ents;
    if (!v || !e) return false;
    const from = new THREE.Vector3();
    if (!e.chestOf(src, from)) {
      const n = this.view.nodes.get(src) ?? this.view.monsters.get(src);
      if (!n) return false;
      from.set(n.x, n.y + 0.8, n.z);
    }
    if (from.distanceTo(this.renderPos) > 80) return false;
    if (!item) {
      v.goldDrop(from);
      return true;
    }
    const def = ITEM.get(item);
    if (!def) return false;
    const now = performance.now();
    const prev = this.lootSlots.get(src);
    const slot = prev && now - prev.at < 600 ? prev.n + 1 : 0;
    this.lootSlots.set(src, { at: now, n: slot });
    if (this.lootSlots.size > 32) for (const [k, s] of this.lootSlots) if (now - s.at > 600) this.lootSlots.delete(k);
    // Trang bị đã roll: bậc theo phẩm server gửi (Phàm..Thiên); còn lại theo `rarity` của mẫu.
    const tier = q !== undefined ? gearLootTier(q) : lootTier(def.rarity);
    const color = q !== undefined ? lootColor(tier, q) : undefined;
    const fallback = def.iconFallback ?? '❔';
    const land = v.lootDrop(
      from,
      tier,
      slot,
      () => lootChime(tier, 0.9),
      (at) => {
        _v.copy(at).project(this.camera);
        const w = window.innerWidth;
        const h = window.innerHeight;
        // Sau lưng camera hoặc ngoài màn hình: bắt đầu từ mép gần nhất.
        const sx = _v.z > 1 ? w / 2 : Math.min(w - 20, Math.max(20, (_v.x * 0.5 + 0.5) * w));
        const sy = _v.z > 1 ? h - 40 : Math.min(h - 20, Math.max(20, (-_v.y * 0.5 + 0.5) * h));
        this.lootFly.spawn(def.icon, fallback, sx, sy, tier);
      },
      color,
    );
    if (tier >= 2) {
      this.pruneRareLoot();
      const hold = LOOT_ARC + LOOT_BOUNCE + LOOT_TIERS[tier].hold + Math.min(slot, 5) * 0.12;
      this.rareLoot.push({ key: src + ':' + item + ':' + now, item, pos: land, until: now + hold * 1000 });
    }
    return true;
  }

  private onFx(m: FxMsg, held = false): void {
    const v = this.vfx;
    const e = this.ents;
    if (!v || !e || this.disposed) return;
    const src = m.src ?? '';
    const dst = m.dst ?? '';
    const pSrc = e.players.get(src);
    if (!held) {
      // Động tác chiêu; đòn của mình đang vào thế thì giữ hiệu ứng + tiếng tới đúng lúc ra đòn.
      const hold = this.skillPoses.onFx(m.t, pSrc?.model, src === this.sid, performance.now());
      if (hold > 0) {
        setTimeout(() => this.onFx(m, true), hold * 1000);
        return;
      }
    }
    this.playFxSound(m.t, src, m.dst ?? '', m.x, m.z);
    // Ngân sách hiệu ứng không dính tới mình (M6-3): đông thì bỏ phần trang trí; động tác, âm thanh vẫn giữ.
    const involvesMe = src === this.sid || dst === this.sid;
    if (!involvesMe) {
      const at = m.t === 'rain' ? { x: m.x ?? 0, z: m.z ?? 0 } : (e.players.get(m.t === 'bite' ? dst : src) ?? e.monsters.get(src));
      const dist = at ? Math.hypot(at.x - this.renderPos.x, at.z - this.renderPos.z) : 0;
      if (skipOthersFx(m.t, { involvesMe, live: v.pool.live, dist })) {
        // Cú cắn vẫn phát động tác của quái, chỉ bỏ chớp sáng ở người bị cắn.
        if (m.t === 'bite') e.monsters.get(src)?.model.attack();
        return;
      }
    }
    const posSrc = (out: THREE.Vector3) => e.chestOf(src, out);
    const posDst = (out: THREE.Vector3) => e.chestOf(dst, out);
    // Màu theo công pháp (chiêu chung đổi màu khi đã chọn công pháp) và hình dạng theo biến thức / cấp chiêu.
    const tint = (d: number) => fxColor(m, d);
    const mctx = { v, m, src: posSrc, dst: posDst, mine: src === this.sid, flash: (a: number) => this.post?.flash(a) };
    if (METHOD_FX.has(m.t)) {
      playMethodFx(mctx);
      // Chiêu tối thượng của mình: thẻ ngắn 0,6 giây (viền sáng, tên chiêu), không khóa input.
      const ult = src === this.sid ? METHOD_SKILLS.find((s) => s.fx === m.t && s.ult) : undefined;
      if (ult) set({ ultCard: { id: ++this.ultCardId, skill: ult.id, color: m.c ?? 'ffffff', until: Date.now() + 600 } });
      return;
    }
    if (m.v) playVariantExtras(mctx, tint(0xbfeaff));
    switch (m.t) {
      case 'sword':
      case 'slash':
      case 'thunder': {
        if (!e.chestOf(src, _v)) break;
        if (m.t === 'sword') {
          // Phi kiếm: tới nơi để lại một dấu chém chéo nhỏ (không lớp mực, đòn thường đánh liên tục).
          v.swordShot(_v, posDst, tint(0xbfeaff), 1, 0.2, (at) => v.slashMark(posDst, 0xcff3ff, 0.55, -0.55, 0.2, false, at.clone()));
        }
        else if (m.t === 'slash') v.slash(_v, posDst, tint(0x8fdcff));
        else if (e.chestOf(dst, _v2)) {
          v.swordShot(_v, posDst, tint(0xfff3b0), 1.8, 0.16);
          // Lôi Đình Nhất Kiếm: nhát chém dọc lớn (biến thể đứng của kiếm khí) cùng lúc sét đánh.
          v.slashVertical(posDst, 0xfff3b0, 1.3);
          v.lightning(_v2.x, _v2.y - 1, _v2.z, 0xfff0a8, 1.3, m.sd);
          if (src === this.sid || dst === this.sid) this.post?.flash(0.25);
        }
        break;
      }
      case 'rain':
        v.swordRain(m.x ?? 0, m.y ?? 0, m.z ?? 0, m.r ?? 8, tint(0x9fe0ff), m.sd, src === this.sid);
        break;
      case 'bite': {
        e.monsters.get(src)?.model.attack();
        if (e.chestOf(dst, _v)) v.burst(_v, 0xff6a5a, 0.7, 0.2);
        break;
      }
      case 'heal':
      case 'potion':
        v.pillar(posSrc, tint(0x7dffa0), 1.0, 0.9, 4);
        break;
      case 'shield':
        v.shield(posSrc, m.d ?? 8, () => ((this.view.players.get(src)?.fl ?? 0) & PF_SHIELD) !== 0, tint(0x7fd8ff), m.v === 'big' ? 1.4 : 1);
        break;
      case 'levelup':
        v.pillar(posSrc, 0xffe08a, 1.8, 1.4, 12);
        break;
      case 'ascend':
        // Người khác thấy trụ sáng như cũ; của mình thì quầng + tia nắng mảnh để không phủ trắng khung hình.
        if (src === this.sid) v.ascendGlow(posSrc);
        else v.pillar(posSrc, 0xfff2b8, 3.2, 2.4, 40);
        if (src === this.sid) {
          this.post?.flash(0.3);
          // Thẻ chương đột phá sau khi mây kiếp tan và trụ sáng bốc lên; sting đột phá đã phát nên không thêm chiêng.
          window.setTimeout(() => !this.disposed && this.chapter('ascend', false), 1100);
        }
        if (e.chestOf(src, _v)) v.burst(_v, 0xfff2b8, 6, 1.2);
        break;
      case 'respawn':
        // Của mình: linh quang đầy đủ do deathVisual nổ khi cờ PF_DEAD tắt (khớp lúc mực rút). Người khác: cột sáng.
        if (src === this.sid) break;
        // Được Hồi Thiên Đan Lộ hồi sinh: cột sáng hẹp và mờ để nhìn rõ người vừa đứng dậy.
        if (m.v === 'revive') v.pillar(posSrc, 0xbfe8ff, 1.2, 0.35, 6, 0.12);
        else v.pillar(posSrc, 0xbfe8ff, 1.2, 1.0, 8);
        break;
      case 'quest':
      case 'craft':
      case 'enhance':
        v.pillar(posSrc, m.t === 'quest' ? 0xffd84a : 0xffa860, 0.9, 0.8, 3.5);
        break;
      case 'gather':
        _v.set(m.x ?? 0, (m.y ?? 0) + 0.6, m.z ?? 0);
        v.burst(_v, 0x8fffc0, 0.8, 0.35);
        break;
      case 'death':
        if (e.chestOf(src, _v)) v.burst(_v, 0x8a8f98, 1.6, 0.5);
        break;
      case 'cast':
        v.charge(posSrc, m.d ?? 1, 0xfff0a8, () => ((this.view.players.get(src)?.fl ?? 0) & PF_CASTING) !== 0);
        // Pháp trận dưới chân: vạch tiến độ chạy theo thời gian niệm chú, tắt dần nếu bị ngắt.
        v.castSigil(posSrc, m.d ?? 1, 0xfff0a8, 1.4, () => ((this.view.players.get(src)?.fl ?? 0) & PF_CASTING) !== 0);
        if (src === this.sid) set({ castEnd: Date.now() + (m.d ?? 1) * 1000, castTotal: (m.d ?? 1) * 1000 });
        this.skillPoses.onCast(pSrc?.model, m.s, m.d ?? 1);
        break;
      case 'mcast':
        // Quái đánh xa đọc chú: chỉ hiện quả cầu tụ lực; vùng báo trước tới sau qua S.HAZARD.
        v.charge(posSrc, m.d ?? 1, 0xff9a6a, () => {
          const st = this.view.monsters.get(src)?.st;
          return st === MS_ATTACK;
        });
        break;
      case 'chant':
        // Boss niệm chú: quả cầu tụ lực lớn; thanh niệm chú hiện ở khung mục tiêu (đọc từ state `mf`/`ce`).
        v.charge(posSrc, m.d ?? 2, 0x9fe6ff, () => ((this.view.monsters.get(src)?.mf ?? 0) & MF_CHANT) !== 0);
        // Pháp trận lớn dưới chân boss: đọc được thời gian còn lại để kịp ngắt chú (M5-3).
        v.castSigil(posSrc, m.d ?? 2, 0x9fe6ff, 3.2, () => ((this.view.monsters.get(src)?.mf ?? 0) & MF_CHANT) !== 0);
        break;
      case 'interrupt':
        if (e.chestOf(dst, _v)) v.burst(_v, 0xfff2b0, 2.6, 0.45);
        break;
      case 'break':
        // Boss mất thế: chớp vàng lớn ở ngực boss.
        if (e.chestOf(src, _v)) v.burst(_v, 0xffd36b, 3.2, 0.55);
        break;
      case 'phase': {
        const mt = this.view.monsters.get(src)?.t;
        const cined = !!mt && this.phaseCine(src, `mon.${mt}.say.${m.d ?? 1}`);
        if (mt && !cined) this.bossSay(src, `mon.${mt}.say.${m.d ?? 1}`);
        // Trong cảnh camera sát boss: chớp nhỏ và mờ để vẫn thấy hình.
        if (e.chestOf(src, _v)) v.burst(_v, 0xe8f4ff, cined ? 0.9 : 2.2, cined ? 0.3 : 0.5);
        break;
      }
      case 'bfall': {
        const mt = this.view.monsters.get(src)?.t;
        if (mt) this.bossSay(src, `mon.${mt}.say.dead`);
        break;
      }
      case 'castend':
        if (src === this.sid) set({ castEnd: 0 });
        this.skillPoses.onCastEnd(pSrc?.model);
        break;
      case 'tribstart':
        v.tribulationCloud((out) => e.chestOf(src, out), m.d ?? 40, () => ((this.view.players.get(src)?.fl ?? 0) & PF_TRIBULATION) !== 0, m.sd);
        if (src === this.sid) {
          this.tribUntil = Date.now() + (m.d ?? 40) * 1000;
          set({ tribEnd: this.tribUntil });
          this.chapter('trib');
        }
        break;
    }
  }

  /**
   * Độ chớp toàn cảnh khi một tia sét đánh xuống: sấm độ kiếp của mình chớp rõ, tia gần mình chớp nhẹ
   * theo khoảng cách, xa hơn 45 m thì không. Chỉ là lớp hình.
   */
  private lightningFlash(m: HazardMsg): number {
    if (m.kind !== 'lightning') return 0;
    if (m.src === this.sid) return 0.32;
    const d = Math.hypot(m.x - this.renderPos.x, m.z - this.renderPos.z);
    return d < 45 ? 0.18 * (1 - d / 45) : 0;
  }

  /** Rung khi vùng nổ: chỉ sấm độ kiếp của mình hoặc boss đập đất gần mình. */
  private shakeForHazard(m: HazardMsg): void {
    if (this.disposed || !m.src) return;
    const d = Math.hypot(m.x - this.renderPos.x, m.z - this.renderPos.z);
    if (m.src === this.sid) {
      if (d < m.r + 12) this.shake.kick(SHAKE.thunder * (d < m.r + 1 ? 1 : 0.6));
    } else if (this.ents?.monsters.get(m.src)?.model.def.boss && d < Math.max(m.r, m.w ?? 0) + 8) {
      this.shake.kick(SHAKE.slam);
    }
  }

  /** Âm lượng giảm theo khoảng cách tới người chơi. */
  private volumeAt(x: number, z: number): number {
    const d = Math.hypot(x - this.renderPos.x, z - this.renderPos.z);
    return d < 8 ? 1 : Math.max(0, 1 - (d - 8) / 70);
  }

  /** Dựng lại bước chân và nguồn âm theo vị trí cho room hiện tại (bí cảnh chỉ có bước chân trên nền đá). */
  private resetSound(world: boolean): void {
    this.scape?.dispose();
    const log = (msg: string) => {
      if (import.meta.env.DEV) console.info(`[audio] ${msg}`);
    };
    this.steps = new FootstepDriver(world ? 'van_lam' : 'kiem_trung', (name, vol, at) => sfx(name, vol, at, false), log);
    this.scape = world ? new Soundscape(buildSources(SECT_LANTERNS), audioSpatialApi(), log) : null;
    if (import.meta.env.DEV) (window as unknown as { __sound?: unknown }).__sound = { steps: () => this.steps?.stats, scape: () => ({ active: this.scape?.state(), ...this.scape?.stats }) };
  }

  private playFxSound(t: string, src: string, dst: string, x?: number, z?: number): void {
    // Sự kiện của chính mình có nhạc ngắn (sting) riêng: lên tầng và đột phá thay hẳn jingle SFX;
    // tử vong giữ tiếng ngã (SFX) và thêm sting. Chưa có file/tắt tiếng thì dùng SFX như cũ.
    const sting = src === this.sid ? STINGS[t] : undefined;
    if (sting && playSting(sting) && t !== 'death' && t !== 'ascend') return;
    const map: Record<string, Sfx> = {
      sword: 'sword',
      slash: 'slash',
      rain: 'rain',
      thunder: 'thunder',
      heal: 'heal',
      potion: 'potion',
      shield: 'shield',
      levelup: 'levelup',
      ascend: 'ascend',
      quest: 'quest',
      craft: 'craft',
      enhance: 'enhance',
      gather: 'gather',
      death: 'death',
      respawn: 'respawn',
      cast: 'cast',
      kanh: 'slash',
      vankiem: 'rain',
      transon: 'thunder',
      kimcuong: 'shield',
      xuanphong: 'heal',
      hoithien: 'heal',
      mcast: 'mcast',
      tribstart: 'trib',
      // Phá chú (ngắt niệm chú) và boss mất thế: tiếng xác nhận giòn, nổi nhất (D2).
      interrupt: 'spellbreak',
      break: 'spellbreak',
    };
    const name = map[t];
    if (!name) return;
    let vol = 1;
    let at: { x: number; z: number } | undefined;
    if (x !== undefined && z !== undefined) at = { x, z };
    else if (this.ents.chestOf(src || dst, _v)) at = _v;
    if (at) vol = this.volumeAt(at.x, at.z);
    // Tiếng của người khác nhỏ hơn tiếng của mình.
    if (src && src !== this.sid && dst !== this.sid) vol *= 0.6;
    sfx(name, vol, at);
  }

  private onDmg(m: DmgMsg, held = false): void {
    if (this.disposed) return;
    // Hiệu ứng đòn của mình đang được giữ tới lúc ra đòn: số sát thương và phản ứng trúng đòn theo cùng nhịp.
    const hold = !held && m.src === this.sid ? this.skillPoses.holdLeft(performance.now()) : 0;
    if (hold > 0.02) {
      setTimeout(() => this.onDmg(m, true), hold * 1000);
      return;
    }
    if (!this.ents || !this.ents.topOf(m.dst, _v)) return;
    const mine = m.dst === this.sid;
    const byMe = m.src === this.sid;
    // Bị quái đánh khi chưa chọn mục tiêu: tự chọn kẻ tấn công để phản đòn nhanh.
    if (mine && !m.heal && !this.targetId && m.src && this.view.monsters.has(m.src)) this.setTarget(m.src, 'mon');
    const foe = !m.heal && (mine || byMe) ? this.ents.monsters.get((mine ? m.src : m.dst) ?? '') : undefined;
    if (foe) this.music.engage(!!foe.model.def.boss);
    if (!mine && !byMe) {
      // Sát thương của người khác: chỉ hiện khi ở gần.
      if (_v.distanceTo(this.renderPos) > 45) return;
    }
    // Hit feel chỉ là lớp hình. Chiêu của người chơi là đạn bay ~0,2 s nên trễ cho khớp lúc chạm.
    if (!m.heal && m.n > 0) {
      if (byMe && m.crit) this.shake.kick(SHAKE.crit);
      if (mine && m.hv) this.shake.kick(SHAKE.heavy);
    }
    // Cảnh boss/chuyển pha ngắn (≤ 2,6 s) và boss vốn đang đánh mình: chỉ đòn nặng mới hủy; cảnh mở đầu thì mọi đòn đều hủy.
    if (mine && !m.heal && m.n > 0) this.skipCine(this.cineKind === 'sect' || !!m.hv);
    if (mine && !m.heal && m.n > 0) this.post?.hit(m.n / Math.max(1, this.me()?.mhp ?? 1), !!m.crit || !!m.hv);
    if (m.hv && !m.heal && m.n > 0) this.heavyInk(m.dst, m.src);
    if (!m.heal && m.n > 0) this.ents.hitReact(m.dst, m.src, !!m.crit, m.src && this.view.players.has(m.src) ? 0.2 : 0, !!m.hv);
    let cls = 'other';
    if (m.heal) cls = 'heal';
    else if (mine) cls = 'hurt';
    else if (byMe) cls = m.crit ? 'crit' : 'hit';
    if (!m.heal) {
      // Bị hộ thể hấp thụ hết: tiếng kim khí; chí mạng/đòn nặng: tiếng va mạnh hơn đòn thường.
      const name: Sfx = m.n === 0 ? 'block' : mine ? 'hurt' : m.crit || m.hv ? 'crit' : 'hit';
      sfx(name, mine || byMe ? 1 : this.volumeAt(_v.x, _v.z) * 0.5, _v);
    }
    const text = m.heal ? `+${m.n}` : m.n === 0 ? t('ui.absorbed') : mine ? `-${m.n}` : `${m.n}${m.crit ? '!' : ''}`;
    this.dmg.spawn(text, _v, cls);
  }

  // ---------- vòng lặp ----------

  private moveCtx(me: PState): MoveCtx {
    const dead = (me.fl & PF_DEAD) !== 0;
    return {
      canFly: !dead && (me.fl & PF_TRIBULATION) === 0 && me.lv >= FLY_UNLOCK_LEVEL && me.mp >= 1,
      frozen: dead,
      speedMul: 1,
    };
  }

  private buildInput(): MoveInput {
    const k = this.keys.held;
    const typing = this.typing();
    let mx = 0;
    let mz = 0;
    let f = 0;
    if (!typing) {
      // Kiểu "xoay": A/D quay hướng nhìn (xử lý ở frame), không bước ngang.
      if (this.controls !== 'turn') {
        if (isHeld(k, 'right')) mx += 1;
        if (isHeld(k, 'left')) mx -= 1;
      }
      if (isHeld(k, 'forward')) mz += 1;
      if (isHeld(k, 'back')) mz -= 1;
      if (this.autorun && mz === 0) mz = 1;
      if (isHeld(k, 'up')) f |= this.wantFly ? IN_UP : IN_JUMP;
      if (isHeld(k, 'down')) f |= IN_DOWN;
    }
    if (this.wantFly) f |= IN_FLY;
    this.seq++;
    return { s: this.seq, mx, mz, yaw: this.camYaw, f };
  }

  private reconcile(me: PState): void {
    if (me.seq === this.lastAck && me.x === this.lastSx && me.y === this.lastSy && me.z === this.lastSz && me.fl === this.lastFl) return;
    if (me.seq > this.lastAck && me.seq <= this.seq) this.notePing(this.inputSentAt[me.seq & 127]);
    this.lastAck = me.seq;
    this.lastSx = me.x;
    this.lastSy = me.y;
    this.lastSz = me.z;
    this.lastFl = me.fl;
    const base: MoveState = { x: me.x, y: me.y, z: me.z, vy: me.vy, grounded: me.gr, flying: (me.fl & PF_FLYING) !== 0 };
    while (this.pending.length && this.pending[0].s <= me.seq) this.pending.shift();
    const ctx = this.moveCtx(me);
    for (const inp of this.pending) stepMove(base, inp, ctx);
    const dx = base.x - this.cur.x;
    const dy = base.y - this.cur.y;
    const dz = base.z - this.cur.z;
    const err = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    if (this.snapToServer || err > 12) {
      this.snapToServer = false;
      this.cur = base;
      this.prev = cloneMoveState(base);
      this.offset.set(0, 0, 0);
      this.renderPos.set(base.x, base.y, base.z);
      return;
    }
    if (err > 1e-3) {
      this.prev.x += dx;
      this.prev.y += dy;
      this.prev.z += dz;
      this.offset.x -= dx;
      this.offset.y -= dy;
      this.offset.z -= dz;
    }
    this.cur = base;
  }

  /**
   * Ping ước tính (ms): từ lúc gửi input tới lúc thấy server xác nhận seq đó trong state.
   * Gồm cả chờ tick và nhịp gửi patch của server nên cao hơn RTT thuần; chỉ để gỡ lỗi.
   */
  private notePing(sentAt: number | undefined): void {
    if (!sentAt) return;
    const rtt = performance.now() - sentAt;
    if (rtt < 0 || rtt > 5000) return;
    this.ping = this.ping ? this.ping * 0.8 + rtt * 0.2 : rtt;
  }

  /**
   * Tab ẩn: dừng vòng lặp render nhưng giữ kết nối (Colyseus vẫn nhận state qua WebSocket, server
   * tự cho nhân vật đứng yên khi thiếu input). Hiện lại: bắt về vị trí server rồi chạy tiếp.
   */
  private setHidden(hidden: boolean): void {
    if (this.disposed || !this.renderer) return;
    if (hidden) {
      this.renderer.setAnimationLoop(null);
      this.cancelQueuedSkill();
      this.dragging = false;
      return;
    }
    this.lastT = performance.now();
    this.acc = 0;
    this.pending.length = 0;
    this.snapToServer = true;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    if (this.disposed || this.compiling > 0) return;
    this.renderer.info.reset();
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.frames++;
    const me = this.me();

    if (me) {
      this.reconcile(me);
      const ctx = this.moveCtx(me);
      this.acc += dt;
      if (this.acc > 0.25) this.acc = 0.25;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        const inp = this.buildInput();
        this.pending.push(inp);
        this.prev = cloneMoveState(this.cur);
        stepMove(this.cur, inp, ctx);
        this.send(C.INPUT, inp);
        this.inputSentAt[inp.s & 127] = now;
      }
      if (this.pending.length > 60) this.pending.splice(0, this.pending.length - 60);

      // Server ép hạ xuống (hết linh lực, độ kiếp…): bỏ ý định bay.
      if (this.wantFly && !this.cur.flying) {
        if (!this.flyLostAt) this.flyLostAt = now;
        else if (now - this.flyLostAt > 700) {
          this.wantFly = false;
          set({ wantFly: false });
        }
      } else this.flyLostAt = 0;

      const a = this.acc / STEP;
      const decay = Math.exp(-dt * 12);
      this.offset.multiplyScalar(decay);
      const px = this.prev.x + (this.cur.x - this.prev.x) * a + this.offset.x;
      const py = this.prev.y + (this.cur.y - this.prev.y) * a + this.offset.y;
      const pz = this.prev.z + (this.cur.z - this.prev.z) * a + this.offset.z;
      const vx = (this.cur.x - this.prev.x) / STEP;
      const vz = (this.cur.z - this.prev.z) / STEP;
      const sp = Math.hypot(vx, vz);
      this.speed += (sp - this.speed) * Math.min(1, dt * 10);
      this.renderPos.set(px, py, pz);

      let faceTo = this.facing;
      if (now < this.faceTargetUntil && this.ents.chestOf(this.targetId, _v)) faceTo = Math.atan2(_v.x - px, _v.z - pz);
      else if (sp > 0.5) faceTo = Math.atan2(vx, vz);
      let d = faceTo - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 14);
    }

    // Camera quay bằng phím mũi tên trái/phải.
    if (!this.typing()) {
      // Camera điều khiển được hoàn toàn bằng bàn phím: ← → xoay, ↑ ↓ ngẩng/cúi, - = thu phóng.
      const k = this.keys.held;
      const turn = this.controls === 'turn';
      if ((['camLeft', 'camRight', 'camUp', 'camDown', 'zoomIn', 'zoomOut'] as const).some((a) => isHeld(k, a))) this.camFrame.cancel();
      if (isHeld(k, 'camLeft') || (turn && isHeld(k, 'left'))) this.camYaw += dt * 2.1;
      if (isHeld(k, 'camRight') || (turn && isHeld(k, 'right'))) this.camYaw -= dt * 2.1;
      if (isHeld(k, 'camUp')) this.camPitch = Math.min(1.45, this.camPitch + dt * 1.1);
      if (isHeld(k, 'camDown')) this.camPitch = Math.max(-0.45, this.camPitch - dt * 1.1);
      if (isHeld(k, 'zoomIn')) this.camDist = Math.max(3, this.camDist * (1 - dt * 1.4));
      if (isHeld(k, 'zoomOut')) this.camDist = Math.min(70, this.camDist * (1 + dt * 1.4));
    }

    const rp = this.renderPos;
    this.terrain.update(rp.x, rp.z, this.started ? 1 : 8);
    const myLevel = get().char?.level ?? 1;
    if (me) {
      this.ents.update(dt, this.view, { x: rp.x, y: rp.y, z: rp.z, yaw: this.facing, speed: this.speed, airborne: !this.cur.grounded && !this.cur.flying }, this.targetId, myLevel);
    }
    if (me) this.steps?.update(this.ents, this.sid, rp, !this.cur.grounded && !this.cur.flying);
    this.scape?.update(rp.x, rp.z, now / 1000);
    if (this.questMarkersDirty) {
      this.questMarkersDirty = false;
      this.ents.updateQuestMarkers(get().quests, myLevel);
    }
    if (me) this.vfx.trails.update(dt, this.ents.players, this.sid, this.camera);
    if (me) this.updateGrass(dt, rp);
    this.vfx.update(dt);
    this.post?.update(dt);
    this.updateCamera(dt);
    setListener(rp.x, rp.z, this.camYaw);
    this.env.update(dt, this.camera, rp);
    this.lanterns?.update(_v.set(rp.x, rp.y, rp.z));
    if (me) this.ambient.update(dt, this.camera.position, rp);
    for (const disc of [this.portalDisc, this.exitDisc]) {
      if (!disc) continue;
      disc.rotation.y = Math.sin(now * 0.0006) * 0.15;
      (disc.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(now * 0.003) * 0.2;
    }
    this.tickSkillQueue(now);
    this.tickCombat(now, me);
    // Cập nhật ma trận cả cảnh MỘT lần mỗi khung (M3-9): để tự động thì mỗi pass (cảnh chính, bóng) duyệt lại
    // toàn bộ cây, kể cả ~60 xương của mỗi nhân vật có xương.
    this.scene.updateMatrixWorld();
    this.post!.render();
    // renderer.info không tự reset (M1-6): lúc này là tổng của MỌI pass trong khung (bóng, cảnh, hậu kỳ).
    const ri = this.renderer.info.render;
    this.lastRender.drawCalls = ri.drawCalls ?? ri.calls;
    this.lastRender.triangles = ri.triangles;
    this.dmg.update(dt, this.camera, window.innerWidth, window.innerHeight);
    this.lootFly.update(dt);
    if (me && this.started) this.offscreen.update(this.camera, window.innerWidth, window.innerHeight, rp);

    this.fpsAcc += dt;
    this.fpsFrames++;
    if (now - this.hudAt > 100) {
      this.hudAt = now;
      // Lúc tải giữ điểm hồi sinh do prefetch đặt (renderPos có thể chưa khớp vị trí thật).
      if (this.started) assets.setViewer(rp.x, rp.z);
      this.syncHud(me);
      this.music.tick(now, { active: this.started, room: get().room, x: rp.x, z: rp.z, flags: me?.fl ?? 0, monsters: this.ents.monsters.values() });
    }
    if (!this.started && me && this.terrain.ready && this.frames > 4) {
      this.started = true;
      this.loadStats.worldReady = Math.round(performance.now() - this.startedAt);
      this.loadStats.frames = this.frames;
      console.info('[load]', JSON.stringify(this.loadStats));
      // Chỉ vào game nếu vẫn đang ở màn hình tải (không ghi đè trạng thái lỗi, ví dụ bị đá do đăng nhập trùng).
      if (get().phase === 'loading') set({ phase: 'game' });
      pushLog(t('sys.welcome', { name: me.name }), 'good');
      pushLog(t('ui.help_hint'), 'info');
    }
  }

  private updateCamera(dt: number): void {
    const rp = this.renderPos;
    const flying = this.cur.flying;
    this.camFrame.update(dt);
    // Khung thẻ chương cộng thêm vào góc của người chơi, không ghi đè camDist/camPitch.
    const want = Math.min(70, this.camDist * (flying ? 1.35 : 1) * this.camFrame.distMul);
    this.camDistCur += (want - this.camDistCur) * Math.min(1, dt * 6);
    const pitch = Math.max(-0.45, Math.min(1.45, this.camPitch + this.camFrame.pitchAdd));
    const cp = Math.cos(pitch);
    const tx = rp.x;
    // Kiểu FPS: nhìn qua đầu nhân vật để tâm ngắm không bị nhân vật che.
    const ty = rp.y + (this.controls === 'mouse' ? 2.5 : 1.6);
    const tz = rp.z;
    let cx = tx + Math.sin(this.camYaw) * cp * this.camDistCur;
    let cy = ty + Math.sin(pitch) * this.camDistCur;
    let cz = tz + Math.cos(this.camYaw) * cp * this.camDistCur;
    // Không để camera chui xuống đất: kéo lại gần nhân vật.
    for (let i = 0; i < 5; i++) {
      const g = groundAt(cx, cz) + 0.7;
      if (cy >= g) break;
      const k = 0.78;
      cx = tx + (cx - tx) * k;
      cz = tz + (cz - tz) * k;
      cy = Math.max(ty + (cy - ty) * k, groundAt(cx, cz) + 0.7 - (4 - i) * 0.5);
    }
    this.shake.update(dt, _shakePos, _shakeLook);
    this.camera.position.set(cx + _shakePos.x, cy + _shakePos.y, cz + _shakePos.z);
    this.camera.lookAt(tx + _shakeLook.x, ty + _shakeLook.y, tz + _shakeLook.z);
    const dfx = this.deathFx.update(dt, ((this.me()?.fl ?? 0) & PF_DEAD) !== 0);
    this.deathVisual(dfx, tx, ty, tz);
    if (this.cine.active) this.runCine(dt);
    this.tribFx(dt);
    this.ents.tagsHidden = this.cine.active || this.tribScene;
    updateOcclusion(dt, this.camera.position, _camFocus.set(tx, rp.y + 1.2, tz), rp.y);
  }

  /**
   * Chết và hồi sinh (P2-B5): đẩy số của `DeathFx` vào hậu kỳ (mực, khử màu), trôi camera ra sau và lên cao, nổ linh quang
   * khi sống lại. Không đụng cảnh độ kiếp: tribFx chạy sau và chỉ dùng `pulse`; chết lúc kiếp thất bại thì hai lớp chồng nhau.
   */
  private deathVisual(d: { ink: number; desat: number; drift: number }, tx: number, ty: number, tz: number): void {
    const fx = this.deathFx;
    if (fx.died) {
      // Cảnh đang chiếu (mở đầu, boss) nhường chỗ cho cảnh chết.
      this.cine.skip();
      this.vfx.burst(_v.set(tx, ty - 1.2, tz), 0x9aa6b8, 1.6, 0.5);
    }
    if (fx.revived) {
      const sid = this.sid;
      this.post?.flash(0.22);
      this.vfx.reviveGlow((out) => this.ents.chestOf(sid, out));
    }
    postParams.ink.value = d.ink;
    postParams.inkDesat.value = d.desat;
    if (d.drift > 0) {
      const k = d.drift;
      this.camera.position.x += (this.camera.position.x - tx) * 0.22 * k;
      this.camera.position.z += (this.camera.position.z - tz) * 0.22 * k;
      this.camera.position.y += 1.6 * k;
      this.camera.lookAt(tx, ty - 0.6 * k, tz);
    }
  }

  /**
   * Cảnh độ kiếp (P2-B4): trong lúc cờ PF_TRIBULATION của mình bật, màu toàn cảnh chìm dần sang tối/tím (qua `pulse` của
   * hậu kỳ) rồi trả về khi hết kiếp. Chỉ là lớp hình theo cờ server; cảnh boss đang chiếu thì nhường `pulse` cho cảnh đó.
   */
  private tribFx(dt: number): void {
    const on = ((this.me()?.fl ?? 0) & PF_TRIBULATION) !== 0;
    this.tribScene = on;
    const was = this.tribMix;
    this.tribMix = on ? Math.min(1, was + dt / 2.5) : Math.max(0, was - dt / 1.6);
    if (this.tribMix === 0 && was === 0) return;
    if (this.cine.active && this.cineKind !== 'sect') return;
    const k = this.tribMix * this.tribMix * (3 - 2 * this.tribMix);
    postParams.pulseColor.value.setRGB(0.3, 0.16, 0.55);
    postParams.pulse.value = 0.7 * k;
  }

  /** Gửi (và gửi lại nếu server chưa nhận) chiêu đang chờ khi hết GCD/hồi chiêu. */
  private tickSkillQueue(now: number): void {
    const q = this.skillQueue;
    if (q.slot < 0) return;
    const st = get();
    const cdAt = st.cds[this.bar()[q.slot]?.id ?? ''] ?? 0;
    const slot = q.poll(Date.now(), Math.max(st.gcdAt, cdAt), cdAt > st.gcdAt, this.ping);
    if (q.slot < 0) set({ queuedSkill: -1 });
    if (slot < 0) return;
    // Không để đánh thường gửi chồng ngay sau chiêu vừa xả.
    this.lastAttackSend = now;
    this.fireSkill(slot);
  }

  /** Tự đánh thường liên tục khi đã chọn mục tiêu và bật auto. */
  private tickCombat(now: number, me: PState | undefined): void {
    if (!me || !this.targetId || this.skillQueue.slot >= 0) return;
    if (this.targetKind === 'mon') {
      const m = this.view.monsters.get(this.targetId);
      if (!m || m.st === MS_DEAD) {
        this.clearTarget();
        return;
      }
      if (this.autoAttack && now - this.lastAttackSend > 220) {
        const st = get();
        const dead = (me.fl & (PF_DEAD | PF_FLYING | PF_CASTING)) !== 0;
        const dist = Math.hypot(m.x - this.cur.x, m.z - this.cur.z);
        if (!dead && Date.now() >= st.gcdAt - 30 && dist < SKILLS[0].range + 1) {
          this.lastAttackSend = now;
          this.faceTargetUntil = now + 600;
          this.send(C.SKILL, { id: SKILLS[0].id, t: this.targetId });
        }
      }
    }
  }

  /** Niệm chú/choáng của quái (theo đồng hồ client), nếu quái có chiêu niệm chú. */
  private castOf(m: MState): TargetCast | undefined {
    const def = MONSTER.get(m.t);
    if (!def || !m.mf || !m.ce) return undefined;
    const end = m.ce - this.timeOffset;
    if (m.mf & MF_BROKEN && def.posture) return { kind: 'broken', end, total: def.posture.brk * 1000, open: 0 };
    const ch = phaseRules(def, m.ph ?? 0).ai.chant;
    if (!ch) return undefined;
    if (m.mf & MF_CHANT) return { kind: 'chant', end, total: ch.cast * 1000, open: ch.open };
    if (m.mf & MF_STUN) return { kind: 'stun', end, total: ch.stun * 1000, open: 0 };
    return undefined;
  }

  /** Boss vào pha mới hoặc gục: hiện một câu thoại ngắn nếu mình đứng gần (không khóa điều khiển, không gửi gì lên server). */
  private bossSay(src: string, key: string): void {
    const m = this.view.monsters.get(src);
    // Đang cắt cảnh boss/chuyển pha: phụ đề của cảnh là câu thoại duy nhất, không chồng thêm dòng thoại thường.
    if (!m || !hasString(key) || (this.cine.active && this.cineKind !== 'sect')) return;
    if (Math.hypot(m.x - this.renderPos.x, m.z - this.renderPos.z) > 60) return;
    set({ bossLine: { id: ++this.bossLineId, name: monsterName(m.t), text: t(key), until: Date.now() + 3200 } });
    // Lời boss (thoại): hạ nhạc để đọc được và nghe được tiếng chân/đòn.
    duckHold('boss', 0.4, 3.3);
  }

  /** Boss cho thanh giữa phía trên: boss đang chọn, không thì boss còn sống gần nhất đang giao chiến trong 80 m. */
  private bossFor(target: TargetInfo | null, x: number, z: number): BossInfo | null {
    let id = target?.kind === 'mon' && target.boss ? target.id : '';
    if (!id) {
      let best = 80 * 80;
      this.view.monsters.forEach((m, mid) => {
        if (m.st === MS_DEAD || !MONSTER.get(m.t)?.boss) return;
        if (m.st !== MS_CHASE && m.st !== MS_ATTACK && m.hp >= m.mhp) return;
        const d2 = (m.x - x) ** 2 + (m.z - z) ** 2;
        if (d2 < best) {
          best = d2;
          id = mid;
        }
      });
    }
    const m = id ? this.view.monsters.get(id) : undefined;
    if (!m || m.st === MS_DEAD) return null;
    const def = MONSTER.get(m.t);
    const info: BossInfo = { id, def: m.t, level: m.lv, hp: m.hp, mhp: m.mhp, cast: this.castOf(m) };
    if (def?.posture) info.posture = (m.pz ?? 0) / 100;
    if (def?.phases) info.marks = def.phases.map((p) => p.hp);
    return info;
  }

  private syncHud(me: PState | undefined): void {
    if (!me) return;
    const rp = this.renderPos;
    let target: TargetInfo | null = null;
    if (this.targetId) {
      if (this.targetKind === 'mon') {
        const m = this.view.monsters.get(this.targetId);
        const def = m ? MONSTER.get(m.t) : undefined;
        if (m && def) {
          target = { id: this.targetId, kind: 'mon', name: monsterName(def.id), level: m.lv, hp: m.hp, mhp: m.mhp, boss: !!def.boss };
          const cast = this.castOf(m);
          if (cast) target.cast = cast;
        }
      } else if (this.targetKind === 'player') {
        const p = this.view.players.get(this.targetId);
        if (p) target = { id: this.targetId, kind: 'player', name: p.name, level: p.lv, hp: p.hp, mhp: p.mhp, boss: false };
        else this.targetId = '';
      } else {
        target = { id: this.targetId, kind: 'npc', name: t(`npc.${this.targetId}.name`), level: 0, hp: 1, mhp: 1, boss: false };
        const n = this.ents.npcs.find((e) => e.id === this.targetId);
        if (n && Math.hypot(n.x - rp.x, n.z - rp.z) > 30) this.targetId = '';
      }
    }
    const boss = this.bossFor(target, rp.x, rp.z);
    this.checkBossIntro(me);
    this.offscreen.setCandidates(this.offscreenCandidates(target, boss));
    let hint = '';
    if (!(me.fl & PF_DEAD)) {
      const near = this.ents.nearestInteractable(this.cur.x, this.cur.y, this.cur.z);
      if (near) {
        if (near.kind === 'npc') hint = t('ui.hint.talk', { name: t(`npc.${near.id}.name`) });
        else if (near.kind === 'node') hint = t('ui.hint.gather', { name: t(`item.${this.view.nodes.get(near.id)?.t}.name`) });
        else hint = t(near.id === 'exit' ? 'ui.hint.exit' : 'ui.hint.portal');
      }
    }
    const st = get();
    // Đóng hộp thoại NPC khi đi xa.
    let npc = st.npc;
    if (npc) {
      const n = this.ents.npcs.find((e) => e.id === npc);
      if (!n || Math.hypot(n.x - rp.x, n.z - rp.z) > 10) npc = null;
    }
    const fps = this.fpsAcc > 0 ? Math.round(this.fpsFrames / this.fpsAcc) : 0;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    let perf = st.perf;
    if (this.debugPerf) {
      const info = this.renderer.info;
      perf = `${info.render.drawCalls ?? info.render.calls} draw · ${Math.round(info.render.triangles / 1000)}k tri · ${info.memory.geometries} geo · ${info.memory.textures} tex · ${this.ents.monsters.size} quái · ${this.ents.players.size} người · LOD ${this.ents.lodStats().lod.join('/')} (ngoài khung ${this.ents.lodStats().offscreen}) · ${this.terrain.tileCount()} ô · ${this.vfx.particles.aliveCount().total}/${this.vfx.particles.limit} hạt`;
    }
    set({
      debug: st.debugOpen ? this.debugInfo(me) : null,
      hp: me.hp,
      mhp: me.mhp,
      mp: me.mp,
      mmp: me.mmp,
      flags: me.fl,
      target,
      boss,
      hint,
      npc,
      x: rp.x,
      y: rp.y,
      z: rp.z,
      zone: t('ui.zone.' + biomeAt(rp.x, rp.z)),
      fps: Math.round(st.fps ? st.fps * 0.6 + fps * 0.4 : fps),
      perf,
      autoAttack: this.autoAttack,
      tribEnd: me.fl & PF_TRIBULATION ? Math.max(st.tribEnd, this.tribUntil) : 0,
      castEnd: me.fl & PF_CASTING ? st.castEnd : 0,
    });
    this.checkChapters(rp.x, rp.z);
  }

  /**
   * Ứng viên cho chỉ báo ngoài màn hình (M4-15), theo thứ tự ưu tiên: mục tiêu đang chọn, boss đang
   * giao chiến, đích của nhiệm vụ đang theo dõi. Chỉ đọc vị trí đã có (trạng thái room, NPC, dữ liệu bản đồ).
   */
  private offscreenCandidates(target: TargetInfo | null, boss: BossInfo | null): OffCandidate[] {
    const out: OffCandidate[] = [];
    if (!get().offscreen) return out;
    const ents = this.ents;
    // Mô hình chưa dựng (ngoài tầm hiển thị) thì lấy vị trí trong trạng thái room.
    const entityPos = (id: string) => (o: THREE.Vector3) => {
      if (ents.chestOf(id, o)) return true;
      const e = this.view.monsters.get(id) ?? this.view.players.get(id);
      return !!e && (o.set(e.x, e.y + 1, e.z), true);
    };
    const npcPos = (id: string) => {
      const n = ents.npcs.find((e) => e.id === id);
      return n ? (o: THREE.Vector3) => (o.set(n.x, n.y + 1.6, n.z), true) : null;
    };
    // Từ ngực (chestOf) xuống chân.
    const spanOf = (id: string) => {
      const m = ents.monsters.get(id);
      return m ? m.model.height * 0.55 : 1.2;
    };
    if (target) {
      const pos = target.kind === 'npc' ? npcPos(target.id) : entityPos(target.id);
      if (pos) out.push({ key: target.id, kind: target.boss ? 'boss' : target.kind === 'mon' ? 'foe' : 'target', label: target.name, pos, span: target.kind === 'npc' ? 1.6 : spanOf(target.id) });
    }
    if (boss && boss.id !== target?.id) out.push({ key: boss.id, kind: 'boss', label: monsterName(boss.def), pos: entityPos(boss.id), span: spanOf(boss.id) });

    const st = get();
    // Cùng luật với chấm ở bảng theo dõi (trackedQuestId): chỉ chỉ tới đúng nhiệm vụ đó, không nhảy sang nhiệm vụ khác.
    const qid = trackedQuestId(st.quests, st.trackQuest);
    const rp = this.renderPos;
    do {
      const def = qid ? QUEST.get(qid) : undefined;
      const goal = def && questGoal(def, st.quests.active[qid], NPCS);
      if (!goal) break;
      const label = t(`quest.${qid}.name`);
      if (goal.kind === 'npc') {
        // NPC không có trên bản đồ này (ví dụ đang ở bí cảnh) thì không chỉ.
        const pos = npcPos(goal.npc);
        if (pos) out.push({ key: qid + ':' + goal.npc, kind: goal.turnin ? 'turnin' : 'quest', label, pos, span: 1.6 });
        break;
      }
      const spot = nearestGoalSpot(goal, rp.x, rp.z, this.view.monsters, this.view.nodes, LEVELS[this.view.level]);
      if (!spot) break;
      let pos: OffCandidate['pos'];
      let key: string;
      if ('id' in spot) {
        // Cùng con quái với mục tiêu/boss thì đã có chỉ báo rồi.
        if (spot.id === target?.id || spot.id === boss?.id) break;
        key = spot.id;
        const id = spot.id;
        if (goal.kind === 'mon') pos = entityPos(id);
        else
          pos = (o) => {
            const n = this.view.nodes.get(id);
            return !!n && (o.set(n.x, n.y + 0.8, n.z), true);
          };
      } else {
        key = `${spot.x},${spot.z}`;
        const y = groundAt(spot.x, spot.z) + 1;
        pos = (o) => (o.set(spot.x, y, spot.z), true);
      }
      out.push({ key: qid + ':' + key, kind: goal.kind === 'node' ? 'gather' : 'quest', label, icon: goal.kind === 'node' ? goal.item : undefined, pos, span: goal.kind === 'mon' && 'id' in spot ? spanOf(spot.id) : 0.8 });
    } while (false);
    // Đồ rơi quý (M4-6) đang nằm trên đất ngoài khung nhìn: chỉ trong lúc cột sáng còn đứng.
    this.pruneRareLoot();
    for (const l of this.rareLoot) {
      const p = l.pos;
      out.push({ key: l.key, kind: 'loot', label: itemName(l.item), icon: ITEM.get(l.item)?.icon, pos: (o) => (o.copy(p), true), span: 0.4 });
    }
    return out;
  }

  /**
   * Hiện thẻ chương cho sự kiện cá nhân (C2): thẻ chữ + khung camera nhẹ + tiếng chiêng. Chỉ ở client,
   * không gửi gì lên server, không khóa input. Tắt trong Cài đặt thì bỏ qua cả ba.
   */
  private chapter(kind: ChapterKind, sting = true): void {
    if (!get().chapterCards) return;
    const p = CHAPTER[kind];
    set({ chapter: { id: ++this.bossLineId, kind, until: Date.now() + p.card, dur: p.card } });
    this.camFrame.start(p);
    if (sting) chapterSting(0.9);
    // Thẻ chương/cảnh mở đầu: nhạc nền hạ thấp trong suốt thời gian thẻ để chiêng và chữ nổi lên (D2).
    duckHold('chapter', 0.5, p.card / 1000 + 0.3);
  }

  /** Thẻ đang chờ (vào bí cảnh) và lần đầu vào Lạc Kiếm Tông của nhân vật này; gọi mỗi lần đồng bộ HUD. */
  private checkChapters(x: number, z: number): void {
    if (!this.started || this.snapToServer) return;
    if (this.pendingChapter) {
      this.chapter(this.pendingChapter);
      this.pendingChapter = null;
    }
    const name = get().char?.name;
    if (this.sectChecked || !name || get().room !== ROOM_WORLD || biomeAt(x, z) !== 'sect') return;
    this.sectChecked = true;
    if (!firstTime(localStorage, 'sect', name)) return;
    if (this.canCine(x, z)) this.startCine();
    else this.chapter('sect');
  }

  /** Cảnh mở đầu chỉ chạy khi đứng gần điểm hồi sinh (đường camera dựng cho sân tông môn) , người chơi chưa tắt thẻ chương trong Cài đặt và không tắt bằng `?cine=0`. */
  private canCine(x: number, z: number): boolean {
    return get().chapterCards && new URLSearchParams(location.search).get('cine') !== '0' && Math.hypot(x - SPAWN_POINT.x, z - SPAWN_POINT.z) < 40;
  }

  private startCine(): void {
    this.cineKind = 'sect';
    this.cine.start();
    // Cảnh mở đầu: nhạc nền hạ thấp suốt đoạn camera điện ảnh (D2); thả khi cảnh hết hoặc bị bỏ qua.
    duckHold('cine', 0.45, SECT_CUTSCENE.dur + 0.5);
    this.stage.classList.add('cining');
    set({ cine: { id: ++this.bossLineId, kind: 'sect', dur: SECT_CUTSCENE.dur * 1000, out: false } });
  }

  /** Cảnh boss/chuyển pha chỉ chạy khi người chơi bật thẻ chương, không `?cine=0`, không đang chết, không đang có cảnh khác. */
  private canBossCine(me: PState | undefined): boolean {
    if (!me || !this.started || this.cine.active || this.snapToServer) return false;
    if ((me.fl & PF_DEAD) !== 0 || get().phase !== 'game') return false;
    return get().chapterCards && new URLSearchParams(location.search).get('cine') !== '0';
  }

  private beginBossCine(kind: 'boss' | 'phase', path: readonly Waypoint[], prof: { dur: number; out: number }, info: { name: string; title?: string; text: string }): void {
    this.cineKind = kind;
    this.cineShakeAt = 0;
    this.cineFocus = null;
    this.cine.start(path, prof.dur, prof.out);
    this.stage.classList.add('cining');
    set({ cine: { id: ++this.bossLineId, kind, dur: prof.dur * 1000, out: false, ...info } });
  }

  /**
   * Boss xuất hiện (P2-B2): lần đầu boss bị kéo trong lần giao chiến, chỉ người đứng trong tầm kéo của boss
   * (`aggro`) mới thấy. Chỉ là lớp hình ở client: không gửi gì, không khóa input (phím/chuột bỏ qua), thế giới
   * vẫn chạy. Vào giữa trận (boss đã mất máu hoặc đã sang pha sau) thì không chiếu.
   */
  private checkBossIntro(me: PState | undefined): void {
    if (!me) return;
    const rp = this.renderPos;
    this.view.monsters.forEach((m, id) => {
      const def = MONSTER.get(m.t);
      if (!def?.boss) return;
      const fighting = m.st === MS_CHASE || m.st === MS_ATTACK;
      if (!fighting) {
        if (m.st === MS_DEAD || m.hp >= m.mhp) this.bossIntroSeen.delete(id);
        return;
      }
      if (this.bossIntroSeen.has(id)) return;
      const fresh = m.hp >= m.mhp * 0.98 && (m.ph ?? 0) === 0;
      const dist = Math.hypot(m.x - rp.x, m.z - rp.z);
      const key = `mon.${m.t}.say.intro`;
      const mine = fresh && dist <= Math.min(BOSS_CUTSCENE_RANGE, def.aggro) && hasString(key);
      // Chưa chiếu được (đang dịch chuyển, đang có cảnh khác...): thử lại ở nhịp sau, chừng nào boss còn chưa mất máu.
      if (mine && !this.canBossCine(me)) return;
      this.bossIntroSeen.add(id);
      if (!mine) return;
      const model = this.ents.monsters.get(id)?.model;
      const path = bossIntroPath({ x: m.x, y: m.y, z: m.z }, m.yaw, def.scale, { x: rp.x, y: rp.y, z: rp.z }, groundAt);
      this.beginBossCine('boss', path, BOSS_CUTSCENE, { name: monsterName(m.t), title: t(`mon.${m.t}.title`), text: t(key) });
      this.cineFocus = { id, rise: 1.15 * def.scale, scale: def.scale };
      // Gầm: boss làm động tác lớn (nếu có), đất rung nhẹ, chớp mờ ở ngực.
      model?.bossMove?.('slam', 0.55);
      this.shake.kick(0.45);
      if (this.ents.chestOf(id, _v)) this.vfx.burst(_v, 0xffd9a0, 1.0, 0.3);
    });
  }

  /** Chuyển pha (P2-B3): cắt cảnh ngắn, camera lùi nhẹ, rung đất, màu thoáng đổi. Trả false nếu không chiếu (lúc đó dùng câu thoại thường). */
  private phaseCine(src: string, key: string): boolean {
    const m = this.view.monsters.get(src);
    const def = m ? MONSTER.get(m.t) : undefined;
    if (!m || !def || !hasString(key) || !this.canBossCine(this.me())) return false;
    const rp = this.renderPos;
    if (Math.hypot(m.x - rp.x, m.z - rp.z) > Math.min(BOSS_CUTSCENE_RANGE, def.aggro)) return false;
    const cam = this.camera;
    const look = _cineEndL.copy(cam.position).add(_cineFwd.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(10));
    const path = phaseShiftPath(
      { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      { x: look.x, y: look.y, z: look.z },
      { x: m.x, y: m.y, z: m.z },
      m.yaw,
      def.scale,
      groundAt,
    );
    postParams.pulseColor.value.set(def.accent ?? '#9fe6ff');
    this.beginBossCine('phase', path, PHASE_CUTSCENE, { name: monsterName(m.t), text: t(key) });
    this.cineFocus = { id: src, rise: 1.2 * def.scale, scale: def.scale };
    this.shake.kick(0.9);
    return true;
  }

  /** Phím/chuột/bị đánh: camera trôi về chỗ người chơi trong 0,45 giây; thẻ chương vẫn hiện sau đó. */
  private skipCine(force = true): void {
    if (force) this.cine.skip();
  }

  /** Ghi đè camera đã đặt xong bằng đường cảnh (điểm cuối của đường chính là camera thường nên không có mối nối). */
  private runCine(dt: number): void {
    const cam = this.camera;
    _cineEndP.set(cam.position.x, cam.position.y, cam.position.z);
    _cineEndL.copy(_cineEndP).add(_cineFwd.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(10));
    const on = this.cine.update(dt, _cineEndP, _cineEndL, _cineP, _cineL);
    this.cineFx(on);
    if (on && this.cineFocus) this.focusCine();
    if (on) {
      cam.position.set(_cineP.x, _cineP.y, _cineP.z);
      cam.lookAt(_cineL.x, _cineL.y, _cineL.z);
      return;
    }
    this.stage.classList.remove('cining');
    duckHold('cine', 0);
    set({ cine: { ...get().cine!, out: true } });
    window.setTimeout(() => get().cine?.out && set({ cine: null }), 700);
    if (this.cineKind === 'sect') this.chapter('sect');
  }

  /**
   * Theo boss trong cảnh: (1) cảnh xuất hiện: nửa đầu mắt luôn dõi boss đang chạy, sau đó trả dần về điểm nhìn của
   * đường; (2) cả hai cảnh: camera không được sát boss hơn `minBossDist` (thấy trọn thân trên), nới ra dần ở 15%
   * cuối để hòa liền vào camera thường.
   */
  private focusCine(): void {
    const f = this.cineFocus!;
    const m = this.view.monsters.get(f.id);
    if (!m || m.st === MS_DEAD) return;
    const smooth = (k: number): number => {
      const c = Math.max(0, Math.min(1, k));
      return c * c * (3 - 2 * c);
    };
    const x = this.cine.time / (this.cineKind === 'boss' ? BOSS_CUTSCENE.dur : PHASE_CUTSCENE.dur);
    if (this.cineKind === 'boss') {
      const hold = (1 - smooth((x - 0.5) / 0.4)) * this.cine.weight;
      _cineL.x += (m.x - _cineL.x) * hold;
      _cineL.y += (m.y + f.rise - _cineL.y) * hold;
      _cineL.z += (m.z - _cineL.z) * hold;
    }
    const min = minBossDist(f.scale) * (1 - smooth((x - 0.85) / 0.15)) * this.cine.weight;
    const dx = _cineP.x - m.x;
    const dz = _cineP.z - m.z;
    const d = Math.hypot(dx, dz);
    if (d < min) {
      const k = d > 1e-3 ? min / d : 0;
      _cineP.x = m.x + (d > 1e-3 ? dx * k : min);
      _cineP.z = m.z + (d > 1e-3 ? dz * k : 0);
    }
  }

  /** Hiệu ứng hậu kỳ theo nhịp cảnh boss: nhòe hướng tâm (xuất hiện) hoặc nhuộm màu (chuyển pha), kèm rung lần hai. */
  private cineFx(on: boolean): void {
    const k = this.cineKind;
    if (k === 'sect') return;
    const w = on ? this.cine.weight : 0;
    const prof = k === 'boss' ? BOSS_CUTSCENE : PHASE_CUTSCENE;
    const bell = Math.sin(Math.PI * Math.min(1, this.cine.time / prof.dur));
    if (k === 'boss') postParams.radial.value = 0.75 * bell * w;
    else {
      postParams.pulse.value = 0.9 * bell * w;
      if (on && this.cineShakeAt === 0 && this.cine.time > 0.55) {
        this.cineShakeAt = 1;
        this.shake.kick(0.7);
      }
    }
    if (!on) {
      postParams.radial.value = 0;
      postParams.pulse.value = 0;
    }
  }

  setChapterCards(on: boolean): void {
    localStorage.setItem('dtl.chapterCards', on ? '1' : '0');
    set({ chapterCards: on, ...(on ? {} : { chapter: null }) });
    if (!on) this.camFrame.cancel();
  }

  setOffscreen(on: boolean): void {
    localStorage.setItem('dtl.offscreen', on ? '1' : '0');
    set({ offscreen: on });
    this.offscreen.enabled = on;
  }

  /** Số liệu cho bảng gỡ lỗi F3 (M1-2). */
  private debugInfo(me: PState): DebugInfo {
    const states: string[] = [];
    const on = (cond: unknown, key: string): void => {
      if (cond) states.push('ui.debug.st.' + key);
    };
    on(this.cur.grounded, 'grounded');
    on(!this.cur.grounded && !this.cur.flying, 'airborne');
    on(this.cur.flying, 'flying');
    on(this.wantFly, 'want_fly');
    on(me.fl & PF_DEAD, 'dead');
    on(me.fl & PF_MEDITATING, 'meditating');
    on(me.fl & PF_CASTING, 'casting');
    on(me.fl & PF_TRIBULATION, 'tribulation');
    on(this.autorun, 'autorun');
    on(this.autoAttack, 'auto_attack');
    on(this.dragging, 'dragging');
    on(this.typing(), 'typing');
    const now = performance.now();
    return {
      keys: [...this.keys.held],
      states,
      speed: this.speed,
      focus: document.hasFocus(),
      visible: !document.hidden,
      active: document.activeElement?.tagName ?? '',
      pointerLock: this.locked,
      controls: this.controls,
      events: this.keys.log.map((e) => ({ id: e.id, kind: e.kind, code: e.code, ago: Math.round(now - e.at) })),
      ping: Math.round(this.ping),
      room: get().room,
      roomId: this.room.roomId,
      sid: this.sid,
    };
  }

  /** Chấm trên bản đồ nhỏ. */
  dots(): { x: number; z: number; c: string; r: number }[] {
    const out: { x: number; z: number; c: string; r: number }[] = [];
    if (!this.ents) return out;
    for (const m of this.ents.monsters.values()) {
      if (m.s.st !== MS_DEAD) out.push({ x: m.x, z: m.z, c: m.model.def.boss ? '#ff9a3c' : m.model.def.elite ? '#7fd4ff' : '#e5534b', r: m.model.def.boss ? 4 : m.model.def.elite ? 3 : 2 });
    }
    for (const [sid, p] of this.ents.players) if (sid !== this.sid) out.push({ x: p.x, z: p.z, c: '#6fd0ff', r: 3 });
    for (const n of this.ents.npcs) out.push({ x: n.x, z: n.z, c: '#ffd84a', r: 3 });
    for (const g of this.ents.nodes.values()) if (g.visible) out.push({ x: g.position.x, z: g.position.z, c: '#7fffb0', r: 1.5 });
    return out;
  }

  get yaw(): number {
    return this.camYaw;
  }

  /** Cỏ rạp theo mình + 5 người/quái gần nhất (chỉ đọc vị trí đã nội suy của EntityManager). */
  private updateGrass(dt: number, rp: THREE.Vector3): void {
    const pool = this.pushPool;
    let n = 0;
    const put = (x: number, y: number, z: number, r: number) => {
      const p = pool[n] ?? (pool[n] = { x: 0, y: 0, z: 0, r: 0 });
      p.x = x;
      p.y = y;
      p.z = z;
      p.r = r;
      n++;
    };
    for (const [sid, v] of this.ents.players) if (sid !== this.sid) put(v.x, v.y, v.z, 1.4);
    for (const v of this.ents.monsters.values()) {
      const r = monsterPushRadius(v.s.st === MS_DEAD, v.model.root.visible, v.barY);
      if (r > 0) put(v.x, v.y, v.z, r);
    }
    this.pushSelf.x = rp.x;
    this.pushSelf.y = rp.y;
    this.pushSelf.z = rp.z;
    pickPushers(this.pushSelf, pool, this.pushers, 40, n);
    this.grass.update(dt, rp, this.pushers, this.started ? 1 : 6);
    this.props?.update(dt, rp.x, rp.z);
  }

  setControls(mode: string): void {
    this.controls = mode === 'strafe' || mode === 'turn' ? mode : 'mouse';
    if (this.controls !== 'mouse') this.releaseLock();
    localStorage.setItem('dtl.controls', this.controls);
    set({ controls: this.controls });
  }

  setCamShake(on: boolean): void {
    this.shake.setEnabled(on);
    set({ camShake: on });
  }

  setQuality(q: string): void {
    localStorage.setItem('dtl.quality', q);
    set({ quality: q });
    const cfg = QUALITY[q] ?? QUALITY.medium;
    setHeightFog(cfg.heightFog);
    this.env?.setQuality(q);
    if (this.ground) this.terrain.setGround(this.ground, cfg.ground);
    this.lanterns?.setEnabled(cfg.lights);
    this.vfx?.particles.setQuality(q);
    this.grass?.setQuality(q, cfg.shadows && this.renderer.shadowMap.enabled);
    this.props?.setQuality(q, cfg.shadows && this.renderer.shadowMap.enabled);
    this.ambient?.setQuality(q);
    if (this.post && !this.post.matches(cfg)) {
      this.post.dispose();
      this.post = new PostPipeline(this.renderer, this.scene, this.camera, cfg);
    }
    this.onResize();
  }

  dispose(): void {
    this.disposed = true;
    this.leaving = true;
    if (document.pointerLockElement) document.exitPointerLock();
    set({ mouseLook: false });
    this.renderer?.setAnimationLoop(null);
    for (const off of this.listeners) off();
    this.music.dispose();
    this.scape?.dispose();
    duckHold('chapter', 0);
    duckHold('boss', 0);
    duckHold('npc', 0);
    duckHold('cine', 0);
    this.ents?.dispose();
    this.vfx?.dispose();
    this.terrain?.dispose();
    this.ground?.dispose();
    this.lanterns?.dispose();
    this.grass?.dispose();
    this.props?.dispose();
    this.post?.dispose();
    postParams.ink.value = 0;
    postParams.inkDesat.value = 0;
    this.sectMesh?.geometry.dispose();
    this.sectAsset?.handle.release();
    for (const m of this.sectAsset?.mats ?? []) m.dispose();
    this.sectAsset = null;
    this.sectMat.dispose();
    this.dmg?.clear();
    this.lootFly?.clear();
    this.lootLayer?.remove();
    this.offscreen?.dispose();
    this.stage.replaceChildren();
    this.renderer?.dispose();
    try {
      this.room.leave(true);
    } catch {
      /* bỏ qua */
    }
    if (Game.current === this) Game.current = null;
  }
}

// Khi sửa code engine lúc đang chạy dev, tải lại cả trang thay vì hot-reload từng module:
// game giữ trạng thái trong các đối tượng sống, thay module giữa chừng sẽ làm UI và game lệch nhau.
const hot = (import.meta as unknown as { hot?: { accept(cb: () => void): void } }).hot;
if (hot) hot.accept(() => window.location.reload());
