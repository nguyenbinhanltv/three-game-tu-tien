import * as THREE from 'three/webgpu';
import { Client, type Room } from 'colyseus.js';
import { applyInvMsg, C, caveBoundOf, type BossTimerMsg, type CdMsg, type CharView, type ChatMsg, type DuelMsg, type EscortMsg, type InviteMsg, type MarkMsg, type PartyMsg, TELE_CAST_MS, TELE_PAD, terrainOf, propsOf, type TeleMsg, cloneMoveState, type DmgMsg, FLY_UNLOCK_LEVEL, canFlyAt, type FxMsg, AIRBORNE_HEIGHT, type HazardMsg, type BoltEndMsg, type BoltMsg, IN_DOWN, IN_FLY, IN_JUMP, IN_UP, type InitMsg, type InvMsg, type MoveCtx, type MoveInput, type MoveState, MF_BROKEN, MF_SENSED, MF_REAL, MF_BURROW, MF_CHANT, MF_REFLECT, MF_STUN, MF_WEAK, MS_ATTACK, MS_CHASE, MS_DEAD, PF_CASTING, PF_DEAD, PF_FLYING, PF_MEDITATING, PF_SHIELD, PF_TRIBULATION, tribDef, tribForLevel, phaseRules, type QuestView, SECT, SPAWN_POINT, ROOM_DUNGEON, ROOM_TRIBULATION, ROOM_WORLD, TRIB_LEVEL, S, STEP, stepMove, type SysMsg, type TransferMsg, type MethodMsg, type SkillDef, BAR_SIZE, CHARGE_MAX, needsTarget, BONDED_ARTIFACT_ID, bondedLevel, spiritUnlocked, type SpiritScanMsg, type SpiritStateMsg, PF_SOUL, inSkyBand, type SoulStateMsg, SOUL_RANGE, SOUL_SCOUT, skyFlightUnlocked, type CloneStateMsg, domainRadius, CLONE_UNLOCK_LEVEL } from '@dtl/shared';
import { areaKey, biomeAt, groundAt, heightAt, knownLevel, levelAssets, levelId, levelTerrain, sameLayout, setActiveLevel } from './levelCtx';
import type { Appearance } from '@dtl/shared';
import { FX_TIMELINE, ARTIFACT, hasString, ITEM, itemName, LEVELS, METHOD, METHOD_SKILLS, MONSTER, monsterName, NPCS, QUEST, realmName, resolveBarSkill, skillBar, thanThong10Skill, thanThongSkill, tierBar, SKILL, SKILLS, VARIANTS, skillName, t } from '@dtl/content';
import { minimapHooks } from '../ui/minimap/model';
import { visibleView } from './aoiView';
import { MON_AURA_REAL, MON_AURA_REFLECT, MON_AURA_SENSED, MON_AURA_WEAK, MON_BURROW_DIRT, type MonFlagEdge } from './monFlags';
import { fxColor, METHOD_FX, playMethodFx, playVariantExtras } from './methodFx';
import { type BossInfo, closeTopPanel, type DebugInfo, get, pushLog, pushToast, set, type TargetCast, type TargetInfo, togglePanel, useUI } from '../ui/store';
import { BlankWatch, canFallback, frameStats, RENDER_FAIL_LIMIT, RENDERER_KEY, rendererChoice } from './gpuGuard';
import type { DebugPerf } from '../ui/store';
import { ColliderViz } from './debugColliders';
import { chapterSting, duck, duckHold, lootChime, playSting, type Sfx, setListener, sfx, unlockAudio } from './audio';
import { rememberLevel, rememberZone } from './bootArt';
import { FootstepDriver } from './footsteps';
import { buildSources, Soundscape } from './soundscape';
import { audioSpatialApi } from './soundscapeAudio';
import { CamFrame, CHAPTER, type ChapterKind, firstTime } from './chapter';
import { DeathFx } from './deathFx';
import { BOSS_CUTSCENE, BOSS_CUTSCENE_RANGE, bossIntroPath, DAN_CUTSCENE, danTranPath, Cutscene, minBossDist, PHASE_CUTSCENE, phaseShiftPath, SECT_CUTSCENE, type Vec3, type Waypoint } from './cutscene';
import { LootFly } from './lootFly';
import { gearLootTier, LOOT_ARC, LOOT_BOUNCE, LOOT_TIERS, lootColor, lootTier } from '../render/vfx/loot';
import { BOLT_VIEW_DIST, boltAge } from '../render/vfx/projectile';
import { EntityManager, type MonVis, type MState, type PlayerVis, type PState, type WorldView } from './entities';
import { Environment } from './env';
import { AmbientParticles } from './ambient';
import { Butterflies, BUTTERFLY_LEVELS } from './butterflies';
import { Grass, GRASS_PUSH_SLOTS, monsterPushRadius, pickPushers, type Pusher } from './grass';
import { MODEL_MAT } from './models';
import { applyAtmosphere, createLanternHalos, setHeightFog, tuneAtmosphere } from '../render/atmosphere';
import { buildRiftVeil, type RiftVeil } from '../render/riftVeil';
import { skyTopOf } from '../render/sky';
import { DeadTrees } from './deadTrees';
import { deadTreeSpots, riftBlend, riftPath } from './bacHoangArt';
import { XICH_LEVEL, xichCracks, type XichAccent } from './xichArt';
import { bhCtx } from './propScatter';
import { Beacons } from '../render/beacons';
import { applyGrading, budgetPixelRatio, markBloom, PostPipeline, postParams } from '../render/post';
import { patchNodeCacheKey } from '../render/nodeCacheFix';
import { adoptGltfMaterials, createWorldMaterial } from '../render/materials/world';
import { GRADING, GRADING_DEFAULT, mixHex, mixPreset, moodVariant, URL_MOOD, type GradingName } from '../render/grading';
import { MusicController } from './music';
import { updateOcclusion, withOccluderFade } from './occlusion';
import { LanternLights } from '../render/lanternLights';
import { buildMoonGate, buildPortalDisc, buildSect, moonMirrorTexture, SECT_LANTERNS } from './sect';
import { gatesToDraw } from './gates';
import { buildCaveShell, buildCrystalGlow, buildMirrorFloor, buildPalaceHall } from './caveShell';
import { PropLayer } from './props';
import { allProps } from './propScatter';
import { type AssetHandle, assets } from './assets';
import { prefetchWorldAssets } from './preload';
import { renderMinimap, Terrain } from './terrain';
import { MapVis } from './mapVis';
import { SoulVis, type SoulScout } from './soulVis';
import { CloneVis } from './cloneVis';
import { loadGroundTextures, type GroundTextures } from './groundTextures';
import type { GroundLevel } from '../render/materials/ground';
import { telegraph } from './telegraph';
import { BASE_ZONE, E4_OFF, easeZoneCam, zoneCamera, type ZoneCam } from './camZones';
import { DamageNumbers, HAZARD_COLORS, Vfx } from './vfx';
import { skipOthersFx } from './fxBudget';
import { nearestGoalSpot, type OffCandidate, OffscreenIndicators, questGoal, trackedQuestId } from './offscreen';
import { CameraShake, SHAKE } from './shake';
import { isHeld, isKeyFor, KEY_ACTIONS, preventsDefault, skillSlot } from '../input/bindings';
import { KeyState } from '../input/keyboard';
import { SkillQueue } from '../input/skillQueue';
import { SkillPoses } from './skillPose';
import { SkillFx, fxTriggered, replacedFx } from './skillFx';
import { MonFx, MONFX_ON } from './monFx';
import { variantFor } from './fxTimeline';
import { fxQuality, hitStopOn, setFxQuality, setHitStopOn } from './fxSettings';
import type { FxQuality } from '@dtl/shared';
import { BOSS_BAR_RANGE, keepMonsterTarget } from './targetRange';
import type { SkillEvent } from './character/view';
import { HitQueue, SwingGuard, hitPitch, hitStopOf, layersOf, materialOf, shakeOf, ULT_FOV, ultFovAt, WHOOSH_GAIN, whooshDelay, type HitCtx, type HitSoundLog } from './hitjuice';
import { debugAllowed, readTestParams } from './testParams';
import { CharPreview } from './charPreview';

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
/**
 * Level của room theo `InitMsg.room` (E1-B đặt tên room theo level: `world` = Vân Lam, `world-<id>`, `dungeon` = Kiếm Trủng,
 * `dungeon-<id>`); tên lạ thì về Vân Lam.
 */
/** Room bản đồ thế giới: `world` (Vân Lam) hoặc `world-<id>` (không phải bí cảnh). */
export const isWorldRoom = (room: string): boolean => room === ROOM_WORLD || room.startsWith('world-');
export function levelOfRoom(room: string): string {
  if (room === ROOM_WORLD) return 'van_lam';
  if (room === ROOM_DUNGEON) return 'kiem_trung';
  if (room === ROOM_TRIBULATION) return TRIB_LEVEL; // sân độ kiếp (E1-F)
  const id = room.replace(/^(world|dungeon)-/, '');
  return id !== room && knownLevel(id) ? id : 'van_lam';
}
export function levelOfInit(init: InitMsg): string {
  return levelOfRoom(init.room);
}

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
/** Bán kính (m) lấy chấm quái cho bản đồ nhỏ (khung 520 m ⇒ ±260 m, chừa lề). */

/** Trần điểm ảnh nội bộ trên WebGL2 (mọi preset). */
const WEBGL2_MAX_PIXELS = 4e6;
const QUALITY: Record<string, { pixelRatio: number; maxPixels: number; shadows: boolean; bloom: boolean; msaa: number; fxaa: boolean; heightFog: boolean; ground: GroundLevel; ao: boolean; lights: boolean; radial: boolean }> = {
  low: { pixelRatio: 1, maxPixels: 2e6, shadows: false, bloom: false, msaa: 0, fxaa: false, heightFog: false, ground: 'low', ao: false, lights: false, radial: false },
  medium: { pixelRatio: 1.5, maxPixels: 4e6, shadows: false, bloom: true, msaa: 0, fxaa: true, heightFog: true, ground: 'medium', ao: true, lights: false, radial: true },
  high: { pixelRatio: 2, maxPixels: 8e6, shadows: true, bloom: true, msaa: 0, fxaa: true, heightFog: true, ground: 'high', ao: true, lights: true, radial: true },
};

/** Hệ số đèn thật theo thời điểm: buổi sớm vừa phải, đêm đậm. */
const LANTERN_LIGHT: Record<string, number> = { dawn: 1, day: 0.6, night: 1.8, ochre_dawn: 1, ochre: 0.6, ochre_night: 1.8, cloud_dawn: 1, cloud: 0.6, cloud_night: 1.8, tk_dawn: 1, tk: 0.6, tk_night: 1.8, ash_dawn: 1, rift: 1.2, rift_pit: 1.4 };

/** Hiệu ứng của chính mình → nhạc ngắn trong manifest.music (tools/audio/compose/sting_*.mjs). */
const STINGS: Record<string, string> = { levelup: 'sting_levelup', ascend: 'sting_breakthrough', death: 'sting_death' };
/** Lướt hiển thị xuất phát từ vị trí vẽ cách đây chừng này giây (K-4): trước lúc bấm lướt, trước khi gói vị trí mới của server tới. */
const DASH_LOOKBACK = 0.3;
/** Đòn nặng của boss từ tỉ lệ này của máu tối đa trở lên thì hất người bị đánh ngã (chỉ hình). */
const KNOCKDOWN_FRAC = 0.18;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
/** Chiêu theo id (sức mạnh, tối thượng, fx) cho cảm giác đòn K-7. */
const SKILL_INFO = new Map([...SKILLS, ...METHOD_SKILLS].map((s) => [s.id, s]));
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

/** Chỉ bản dev, để chụp ảnh đúng khung: `?slowmo=0.25` chậm thời gian hiển thị (đứng yên, không di chuyển). */
const SLOWMO = import.meta.env.DEV ? Math.min(1, Math.max(0.05, Number(new URLSearchParams(location.search).get('slowmo')) || 1)) : 1;

/** Chỉ bản dev, để chụp ảnh VFX chiêu: `?quiet=1` bỏ nháy trúng đòn và cầu nổ cú cắn trên chính mình (quái vẫn đánh, không đổi luật). */
const QUIET = import.meta.env.DEV && new URLSearchParams(location.search).get('quiet') === '1';

export class Game {
  static current: Game | null = null;
  private static client: Client | null = null;
  private static lastLogin: LoginOptions = {};
  /** Mã phiên server cấp sau lần đăng nhập đầu; dùng cho chuyển room và vào lại. */
  private static session = '';

  /** Vào một room bằng mã phiên; nếu phiên hết hạn thì dùng lại thông tin đăng nhập gốc. */
  private static async join(roomName: string, extra: Record<string, string> = {}): Promise<Room> {
    if (!Game.client) throw new Error('no client');
    if (Game.session) {
      try {
        // ?god đi theo mỗi lần vào room (bí cảnh, quay về); ?at chỉ áp lần vào đầu tiên.
        return await Game.client.joinOrCreate(roomName, { ...extra, session: Game.session, god: readTestParams(location.search).god });
      } catch (e) {
        if ((e as { code?: number }).code !== 4014) throw e;
        Game.session = '';
      }
    }
    return Game.client.joinOrCreate(roomName, { ...extra, ...Game.lastLogin, god: readTestParams(location.search).god });
  }

  /** Đăng nhập và vào thế giới. Lỗi được đưa lên UI qua store. */
  static async connect(opts: LoginOptions): Promise<void> {
    set({ phase: 'connecting', error: '', nameError: '' });
    // M6-1: GLB tải song song với lúc chờ server và lúc dựng thế giới thủ tục.
    prefetchWorldAssets(undefined, undefined, opts.ap?.g, opts.ap?.hair);
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
  /** Cột linh quang ở các điểm đáng chú ý (M-5); chỉ hiện ở thế giới chính. `?beacons=0` tắt để so ảnh. */
  beacons: Beacons | null = null;
  /** Bướm trang trí (DV-C): một InstancedMesh, chỉ ở level ngoài trời có khai báo. `?bf=0` tắt để so ảnh/số đo. */
  butterflies: Butterflies | null = null;
  /** Hạt môi trường quanh camera (V4), phát vào hệ hạt chung. */
  ambient!: AmbientParticles;
  private pushers: Pusher[] = Array.from({ length: GRASS_PUSH_SLOTS }, () => ({ x: 0, y: 0, z: 0, r: 0 }));
  private pushSelf: Pusher = { x: 0, y: 0, z: 0, r: 1.6 };
  private pushPool: Pusher[] = [];
  ents!: EntityManager;
  private charPreview: CharPreview | null = null;

  /** Xem trước nhân vật 3D của bảng nhân vật (TD-C): tạo lười, vẽ trong khung game khi có canvas gắn vào. */
  get preview(): CharPreview {
    return (this.charPreview ??= new CharPreview({
      renderer: this.renderer,
      build: () => this.ents.previewBuild(),
      lookKey: () => this.ents.previewKey(),
      flipRead: !isWebGPU(this.renderer),
      weaponGlow: () => {
        const plus = get().equip.weapon?.plus ?? 0;
        return plus >= 10 ? 2 : plus >= 7 ? 1 : 0;
      },
    }));
  }
  vfx!: Vfx;
  /** VFX ba pha theo sự kiện chiêu + vệt kiếm + linh quang hộ thể (K-6). */
  skillFx: SkillFx | null = null;
  /** Hiệu ứng quái/tinh anh/boss (V5). */
  monFx: MonFx | null = null;
  private boltKinds = new Map<number, string>();
  /** Nhật ký vùng báo của quái (chỉ bản dev, cho Playwright: `__game.hazardLog`). */
  hazardLog?: { k: string; mv?: string; sh: string; src: string; boss: boolean; t: string; x?: number; z?: number; r?: number; yaw?: number; w?: number; big?: boolean; px?: number; pz?: number }[];
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
  /** Lúc (performance.now) thực thể bị đánh/đang đánh người chơi: minimap nhấp nháy biểu tượng (M-3). */
  hurtAt = new Map<string, number>();
  /** Trận truyền tống, vòng niệm và cột sáng điểm đánh dấu (M-4). */
  private mapVis: MapVis | null = null;
  private soulVis: SoulVis | null = null;
  private cloneVis: CloneVis | null = null;
  private stage: HTMLElement;
  private canvas!: HTMLCanvasElement;
  /** Đĩa sáng của cổng vào/ra phó bản (E2-C: theo dữ liệu level, xem `gates.ts`). */
  private gateDiscs: THREE.Mesh[] = [];
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
  /** Giây từ lúc kích cận cảnh chiêu tối thượng (K-7); −1 = không đang chạy. */
  private ultCamT = -1;
  /** Kéo camera ra xa nhẹ của hiệu ứng pháp tướng (theo công tắc "Rung màn hình"). */
  private fxPull: { amt: number; dur: number; t: number } | null = null;
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
  /** Camera theo khu (P2-E4): giá trị đang áp (đã làm mượt) và đích theo vị trí. */
  private zoneCur: ZoneCam = { ...BASE_ZONE };
  private zoneWant: ZoneCam = { ...BASE_ZONE };
  /** Cảnh mở đầu (P2-B1): camera điện ảnh lần đầu vào Lạc Kiếm Tông; xong thì hiện thẻ chương 'sect'. */
  private cine = new Cutscene();
  /** Loại cảnh đang chạy (xem CineState.kind) và cờ rung lần hai của cảnh chuyển pha. */
  private cineKind: 'sect' | 'boss' | 'phase' | 'dan' = 'sect';
  /** Đan Trận đang hiện (E2-D): theo sid chủ kiếp. */
  private ch2Checked = false;
  private ch3Checked = false;
  private ch4Checked = false;
  private ch5Checked = false;
  private danVfx = new Map<string, { set(pg: number): void; stop(): void }>();
  /** Phiên bản hiệu ứng cung gương (E3-M): tin mới/tin tắt tăng số, hiệu ứng cũ thấy số lệch thì tự tắt. */
  private mirrorDiscVer = 0;
  private mirrorVeilVer = 0;
  private mirrorPillarVer: number[] = [];
  /** Nguyên anh xuất khiếu đang hiện (E3-L): theo sid chủ kiếp. */
  private soulVfx = new Map<string, { stop(): void }>();
  /** Thế thân thần niệm của Thiên Nhân Kiếp (E4-D), theo sid chủ kiếp. */
  private cloneVfx = new Map<string, { stop(boom?: boolean): void }>();
  private cineShakeAt = 0;
  /** Cảnh độ kiếp của mình (P2-B4): 0..1 độ đậm của màu tối/tím toàn cảnh, và cờ đang trong cảnh (ẩn nhãn 3D). */
  private tribMix = 0;
  private tribScene = false;
  /** Chết và hồi sinh (P2-B5): mực loang, khử màu, camera trôi; linh quang khi sống lại. Chỉ trình diễn theo cờ PF_DEAD. */
  private deathFx = new DeathFx();
  /** Giờ kết thúc kiếp theo tin `tribstart`, giữ riêng để đồng bộ HUD không xoá nếu tin đến trước cờ trạng thái. */
  private tribUntil = 0;
  /** Kiếp đang độ (id trong `tribulations.json`): từ tin `tribstart`, hoặc suy từ cấp khi lỡ tin. */
  private tribId = 'truc_co';
  /** Lúc thấy cờ độ kiếp của mình bật (ms, đồng hồ client); 0 = cờ đang tắt. Dùng để dựng lại HUD khi lỡ tin `tribstart`. */
  private tribFlagAt = 0;
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
  /** Người nghe sự kiện chiêu (K-4): VFX, âm thanh, rung camera đăng ký ở đây để khớp đúng khung `hitAt` (K-6, K-7). */
  private skillListeners = new Set<(sid: string, e: SkillEvent) => void>();
  /** Đăng ký nghe; trả hàm hủy đăng ký. */
  onSkillEvent(fn: (sid: string, e: SkillEvent) => void): () => void {
    this.skillListeners.add(fn);
    return () => this.skillListeners.delete(fn);
  }
  /** Nhật ký sự kiện chiêu gần nhất (chỉ bản dev, cho Playwright/console: `__game.skillLog`). */
  skillLog: { sid: string; e: SkillEvent; at: number }[] = [];
  private emitSkillEvent(sid: string, e: SkillEvent): void {
    this.onSwingEvent(sid, e);
    for (const fn of this.skillListeners) fn(sid, e);
    this.skillFx?.handle(sid, e);
    if (import.meta.env.DEV) {
      this.skillLog.push({ sid, e, at: performance.now() });
      if (this.skillLog.length > 200) this.skillLog.shift();
    }
  }

  /** Số đo khung vừa vẽ, cộng dồn qua mọi pass (cho `__game.info()`). */
  private lastRender = { drawCalls: 0, triangles: 0 };
  private hudAt = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lastT = performance.now();
  private disposed = false;
  private leaving = false;
  /** `?debug`: dòng số đo gọn ở góc (công cụ đo vẫn dùng); bảng F3 cần `debugOk` (bản dev hoặc `?debug`). */
  private debugPerf = new URLSearchParams(location.search).has('debug');
  private debugOk = debugAllowed(location.search, (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true);
  /** CPU của `frame()` cộng dồn giữa hai lần đồng bộ HUD (cho bảng F3). */
  private cpuAcc = 0;
  private cpuMax = 0;
  private cpuAvg = 0;
  private cpuPeak = 0;
  private colliderViz: ColliderViz | null = null;
  /** performance.now() lúc gửi input, theo seq & 127 (để ước tính ping). */
  private inputSentAt: number[] = [];
  private ping = 0;
  private listeners: (() => void)[] = [];
  private music = new MusicController();

  constructor(room: Room, init: InitMsg) {
    this.initLevel = levelOfInit(init);
    this.room = room;
    this.sid = init.sid;
    this.view = visibleView(room.state as unknown as WorldView);
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
      debugAllowed: this.debugOk,
      char: init.char,
      inv: init.inv,
      equip: init.equip,
      quests: init.quests,
      marks: [],
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
    this.view = visibleView(room.state as unknown as WorldView);
    this.applyInit(init);
    this.bindRoom(room);
    void this.enterLevel(levelOfInit(init));
    this.ents?.dispose();
    this.ents = new EntityManager(this.scene, this.sid, levelOfInit(init));
    this.ents.setWarm(this.warmObject);
    this.mapVis?.dispose();
    this.mapVis = new MapVis(this.scene, isWorldRoom(init.room) ? levelOfInit(init) : null);
    this.resetSound(isWorldRoom(init.room));
    if (this.beacons) this.beacons.mesh.visible = isWorldRoom(init.room);
    this.ents.camera = this.camera;
    this.ents.onSkillEvent = (sid, e) => this.emitSkillEvent(sid, e);
    // Vào bí cảnh: thẻ chương hiện khi nhân vật đã có trong room mới (khung đầu tiên sau khi bắt kịp server).
    this.pendingChapter = init.room === ROOM_DUNGEON ? 'dungeon' : null;
    this.camFrame.cancel();
    this.ents.onMonsterDeath = (m) => this.monsterInk(m);
    this.ents.onMonFlags = (m, e) => this.monFlagFx(m, e);
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
    room.onMessage(S.INV, (m: InvMsg) => set({ inv: applyInvMsg(useUI.getState().inv, m), equip: m.equip }));
    room.onMessage(S.QUESTS, (q: QuestView) => {
      set({ quests: q });
      this.questMarkersDirty = true;
    });
    room.onMessage(S.BOSS_TIMERS, (m: BossTimerMsg) => {
      const off = Date.now() - m.now;
      set({ bossTimers: { ...m, off } });
      // Móc của minimap (M-3): giờ hồi sinh boss theo id quái (đồng hồ máy), xóa khi boss sống.
      for (const tm of m.list) {
        if (!MONSTER.get(tm.t)?.boss) continue;
        if (tm.at > 0) minimapHooks.bossRespawnAt.set(tm.t, tm.at + off);
        else minimapHooks.bossRespawnAt.delete(tm.t);
      }
    });
    room.onMessage(S.CD, (m: CdMsg) => {
      const off = Date.now() - m.now;
      const cds: Record<string, number> = {};
      for (const k in m.cds) cds[k] = m.cds[k] + off;
      const empowered: Record<string, number> = {};
      for (const k in m.em) empowered[k] = m.em[k] + off;
      set({ cds, gcdAt: m.gcd + off, empowered });
    });
    room.onMessage(S.METHOD, (m: MethodMsg) => set({ method: m, methodOff: Date.now() - m.now }));
    room.onMessage(S.SYS, (m: SysMsg) => this.onSys(m));
    room.onMessage(S.FX, (m: FxMsg) => this.onFx(m));
    room.onMessage(S.DMG, (m: DmgMsg) => this.onDmg(m));
    room.onMessage(S.HAZARD, (m: HazardMsg) => {
      if (this.monFx?.lab) return;
      if (import.meta.env.DEV) (this.hazardLog ??= []).push({ k: m.kind, mv: m.mv, sh: m.sh ?? 'circle', src: m.src ?? '', boss: this.isBossSrc(m.src), t: this.view.monsters.get(m.src ?? '')?.t ?? '', x: m.x, z: m.z, r: m.r, yaw: m.yaw, w: m.w, big: m.big, px: this.cur.x, pz: this.cur.z });
      if (import.meta.env.DEV && this.hazardLog && this.hazardLog.length > 200) this.hazardLog.shift();
      // Vùng chữ nhật/quạt ở xa không ai thấy: bỏ qua (chưa có AOI nên cả kênh nhận).
      if (m.sh && this.vfx) {
        if (Math.hypot(m.x - this.renderPos.x, m.z - this.renderPos.z) < 90) telegraph(this.vfx, m, this.isBossSrc(m.src));
        // Vạch pháp trận cũ giữ nguyên; boss thêm nhấp nháy dọc vạch (`mon_warn_line|cone`, V5).
        this.monFx?.warn(m, m.src ? this.ents?.monsters.get(m.src) : undefined);
      }
      else if (m.mv === 'pool') this.vfx?.venomPool(m.x, m.z, m.r, m.delay, m.dur ?? 6, m.kind);
      else {
        const hsrc = m.src ? this.ents?.monsters.get(m.src) : undefined;
        this.monFx?.warn(m, hsrc);
        this.vfx?.hazard(m.x, m.z, m.r, m.delay, m.kind, m.sd, this.lightningFlash(m), this.isBossSrc(m.src), m.hot, hsrc ? () => !this.disposed && !!this.monFx?.boom(m, this.ents?.monsters.get(m.src ?? '') ?? hsrc) : undefined);
      }
      // Boss thả vùng: động tác đòn lớn chạm đúng lúc vùng nổ (vùng chữ nhật/quạt từ boss = chém/quét, vùng tròn = nện).
      if (m.src) this.ents?.monsters.get(m.src)?.model.bossMove?.(m.sh ? 'sweep' : 'slam', m.delay);
      // Vòng kéo (Nuốt) và vũng độc không nổ: không âm nện/rung màn hình.
      if (m.mv === 'pull' || m.mv === 'pool') return;
      const vol = this.volumeAt(m.x, m.z);
      const bsrc = m.src ? this.ents?.monsters.get(m.src) : undefined;
      // Vùng tròn: `Vfx.hazard` tự gọi `boom` lúc nổ và chỉ bỏ hình cũ khi nó thật sự phát; vùng chữ nhật/nón (telegraph) gọi ở đây.
      if (bsrc && m.sh) setTimeout(() => (this.disposed ? 0 : this.monFx?.boom(m, this.ents?.monsters.get(m.src ?? '') ?? bsrc)), m.delay * 1000);
      setTimeout(() => {
        sfx(m.kind === 'lightning' ? 'thunder' : 'impact', vol, m);
        this.shakeForHazard(m);
      }, m.delay * 1000);
    });
    room.onMessage(S.BOLT, (m: BoltMsg) => {
      if (this.monFx?.lab) return;
      // Đạn của quái (D1): chỉ vẽ, server phán định trúng. Bù độ trễ bằng giờ server lúc bắn.
      if (!this.vfx || Math.hypot(m.x - this.renderPos.x, m.z - this.renderPos.z) > BOLT_VIEW_DIST) return;
      this.vfx.bolts.spawn(m, boltAge(m, Date.now() + this.timeOffset), HAZARD_COLORS[m.kind] ?? HAZARD_COLORS.fire);
      this.monFx?.bolt(m.kind, m.x, groundAt(m.x, m.z), m.z, m.yaw, false);
      this.boltKinds.set(m.id, m.kind);
      if (this.boltKinds.size > 64) this.boltKinds.delete(this.boltKinds.keys().next().value as number);
      sfx('sword', this.volumeAt(m.x, m.z) * 0.45, m);
    });
    room.onMessage(S.BOLT_END, (m: BoltEndMsg) => {
      this.vfx?.bolts.end(m.id, m.x, m.z, !!m.hit);
      this.monFx?.bolt(this.boltKinds.get(m.id) ?? 'fire', m.x, groundAt(m.x, m.z) + 0.8, m.z, 0, true);
      this.boltKinds.delete(m.id);
      if (m.hit) sfx('impact', m.hit === this.sid ? 0.8 : this.volumeAt(m.x, m.z) * 0.5, m);
    });
    room.onMessage(S.CHAT, (m: ChatMsg) => pushLog(m.m, m.c === 'party' ? 'party' : 'chat', m.from));
    // Tổ đội và tỉ thí (P3-9): chỉ hiển thị; mọi phán định ở server. Giờ server đổi sang đồng hồ client.
    room.onMessage(S.PARTY, (m: PartyMsg | null) => set({ party: m }));
    // Truyền Tống Trận và điểm đánh dấu (M-4): chỉ hiển thị; server quyết định. Thời gian còn lại đổi sang đồng hồ client.
    room.onMessage(S.TELE, (m: TeleMsg) => {
      const now = performance.now();
      set({ tele: { open: m.open, cast: m.cast ? { id: m.cast.id, until: now + m.cast.ms } : null, cdUntil: m.cd > 0 ? now + m.cd : 0 } });
      minimapHooks.teleports = m.open.flatMap((id) => {
        const pad = TELE_PAD.get(id);
        return pad ? [{ id, x: pad.x, z: pad.z, label: t(`tele.${id}`) }] : [];
      });
    });
    room.onMessage(S.MARK, (m: MarkMsg) => set({ marks: m.marks }));
    room.onMessage(S.ESCORT, (m: EscortMsg) => this.ents?.setEscort(m));
    // Thần thức (E2-E): chỉ hiển thị; server quyết định kết quả quét. Thời gian đổi sang đồng hồ client.
    room.onMessage(S.SPIRIT_STATE, (m: SpiritStateMsg) => {
      const now = performance.now();
      set({ spirit: { open: m.open, chUntil: m.ch > 0 ? now + m.ch : 0, cdUntil: m.cd > 0 ? now + m.cd : 0, r: m.r } });
    });
    // Nguyên anh (E3-K): chỉ hiển thị; server quyết định.
    room.onMessage(S.SOUL_STATE, (m: SoulStateMsg) => {
      const now = performance.now();
      set({ soul: { open: m.open, k: m.k, until: m.left > 0 ? now + m.left : 0, bx: m.bx, by: m.by, bz: m.bz, to: m.to ?? null, cdUntil: m.cd > 0 ? now + m.cd : 0, deathCdUntil: m.dcd > 0 ? now + m.dcd : 0 } });
    });
    // Phân thân thần niệm (E4-K): chỉ hiển thị; server quyết định.
    room.onMessage(S.CLONE_STATE, (m: CloneStateMsg) => {
      const now = performance.now();
      set({ clone: { open: m.open, until: m.left > 0 ? now + m.left : 0, cdUntil: m.cd > 0 ? now + m.cd : 0 } });
    });
    room.onMessage(S.SPIRIT_SCAN, (m: SpiritScanMsg) => {
      const now = performance.now();
      set({ spiritScan: { x: m.x, z: m.z, r: m.r, at: now, until: now + m.ttl, hits: m.hits } });
      const kinds: Record<string, number> = {};
      for (const h of m.hits) kinds[h.k] = (kinds[h.k] ?? 0) + 1;
      this.spiritLog.push({ r: m.r, n: m.hits.length, kinds, hits: m.hits });
    });
    room.onMessage(S.INVITE, (m: InviteMsg) => {
      const until = m.until - this.timeOffset;
      set((s) => {
        const rest = s.invites.filter((i) => !(i.kind === m.kind && i.id === m.id));
        return { invites: m.gone ? rest : [...rest, { ...m, until }].slice(-4) };
      });
      if (!m.gone) sfx('ui_open', 0.8);
    });
    room.onMessage(S.DUEL, (m: DuelMsg) => {
      // Vào trận: nhắm đối thủ (thay mục tiêu quái cũ); hết trận: bỏ nhắm nếu vẫn đang nhắm người đó.
      if (m.phase === 'count') {
        this.setTarget(m.foe, 'player');
      } else if (m.phase === 'end' && this.targetKind === 'player' && this.targetId === m.foe) {
        this.clearTarget();
      }
      set({ duel: { ...m, at: m.at - this.timeOffset } });
      if (m.phase === 'end') setTimeout(() => set((s) => (s.duel?.phase === 'end' ? { duel: null } : {})), 4500);
    });
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
        this.cloneVis?.clear();
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
      const room = await Game.join(m.room, m.options);
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

  /**
   * Hàng đợi biên dịch trước skin quái/boss (T5): từng nhóm một, lúc rảnh. Không chặn `frame()` và không bỏ vẽ: nhóm tạm
   * chỉ nằm trong cảnh lúc phần đồng bộ của `compileAsync` chạy, còn quái thật giữ model khối tới khi biên dịch xong
   * (`MonsterSkins`), nên không có lệnh vẽ nào dùng pipeline WebGPU còn dở (M6-1). `warmMs`: tổng thời gian biên dịch.
   */
  warmMs = 0;
  private warmChain: Promise<void> = Promise.resolve();
  private warmObject = (obj: THREE.Object3D): Promise<void> => {
    const run = async () => {
      if (!this.post || this.disposed) return;
      await new Promise<void>((r) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 2000 }) : setTimeout(r, 50)));
      if (!this.post || this.disposed) return;
      const t0 = performance.now();
      try {
        await this.post.compileObject(obj);
      } finally {
        this.warmMs += performance.now() - t0;
      }
    };
    this.warmChain = this.warmChain.then(run, run);
    return this.warmChain;
  };

  /** Nạp texture mặt đất ngoài đường găng: terrain dùng màu đỉnh tới khi xong rồi mới đổi sang shader PBR. */
  private async loadGround(): Promise<void> {
    if (new URLSearchParams(location.search).get('ground') === '0') return;
    const t0 = performance.now();
    try {
      const self = this;
      const g0 = levelAssets(levelId()).ground;
      const tex = await loadGroundTextures(import.meta.env.BASE_URL, { get aborted() { return self.disposed; } }, g0 ? g0.mask : 'manifest', g0 ? g0.set : 'terrain');
      if (this.disposed) {
        tex.dispose();
        return;
      }
      this.ground = tex;
      this.loadStats.groundLoad = Math.round(performance.now() - t0);
      this.loadStats.groundAt = Math.round(performance.now());
      this.applyGround();
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
    this.renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: this.pickRenderer(params), trackTimestamp: params.get('gputime') === '1' });
    await this.renderer.init();
    this.watchGpuDevice();
    void this.describeGpu();
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
    setActiveLevel(this.initLevel);
    set({ level: this.initLevel });
    this.buildLevelA(this.initLevel, q);
    mark('terrainCoarse');
    void this.loadGround();
    mark('sect');
    this.post = new PostPipeline(this.renderer, this.scene, this.camera, q);
    this.vfx = new Vfx(this.scene);
    this.vfx.camera = this.camera;
    this.skillFx = new SkillFx(this.vfx, {
      player: (sid) => this.ents?.players.get(sid),
      mySid: () => this.sid,
      myMethod: () => get().method?.method,
      camera: () => this.camera as THREE.PerspectiveCamera,
      fx: {
        targetOf: (sid) => this.fxTargetOf(sid),
        quality: fxQuality,
        hitStopOn,
        shake: (level, dir) => this.shake.kick(level, dir),
        flash: (a) => this.post?.flash(a),
        camPull: (pull, dur) => {
          if (this.shake.enabled) this.fxPull = { amt: pull, dur, t: 0 };
        },
        areaOf: (sid) => this.fxArea.get(sid) ?? null,
        originOf: (sid) => this.fxOrigin.get(sid) ?? null,
        variantOf: (sid, skillId) => {
          const def = SKILL.get(skillId);
          const kind = def?.fx ?? FX_TIMELINE.get(skillId)?.fxKind;
          return variantFor({
            mine: sid === this.sid,
            skillId,
            chosen: get().method?.vr[skillId],
            variants: VARIANTS[skillId],
            lastFx: kind ? this.fxVar.get(sid + ':' + kind) : undefined,
          });
        },
        sound: (id, gain, sid) => {
          const pv = this.ents?.players.get(sid);
          const vol = sid === this.sid ? gain : pv ? this.volumeAt(pv.x, pv.z) * gain * 0.6 : 0;
          if (vol > 0) sfx(id as Sfx, vol, pv, false);
        },
      },
    });
    this.monFx = new MonFx(this.skillFx.runner, { camera: () => this.camera, live: () => this.vfx.pool.live });
    this.vfx.particles.setQuality(get().quality);
    this.buildLevelB(this.initLevel, q);
    this.ambient = new AmbientParticles(this.vfx.particles);
    this.ambient.setQuality(get().quality);
    // Chớp toàn cảnh của thiên lôi (M4-4) đi qua uniform `uFlash` của pass chỉnh màu.
    this.vfx.onFlash = (a) => this.post?.flash(a);
    this.ents = new EntityManager(this.scene, this.sid, levelOfRoom(get().room));
    this.ents.setWarm(this.warmObject);
    this.mapVis = new MapVis(this.scene, isWorldRoom(get().room) ? levelOfRoom(get().room) : null);
    this.resetSound(isWorldRoom(get().room));
    this.ents.camera = this.camera;
    this.ents.onSkillEvent = (sid, e) => this.emitSkillEvent(sid, e);
    this.ents.onMonsterDeath = (m) => this.monsterInk(m);
    this.ents.onMonFlags = (m, e) => this.monFlagFx(m, e);
    this.minimap = renderMinimap(320);
    mark('minimap');
    this.startedAt = t0;

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


  // ---------- level (E1-D) ----------

  /** Level đang hiển thị (có thể khác level của room: level thử `thu_nghiem`). */
  /** Số đảo giả đang mờ vì thần thức (E3-N, kiểm tra). */
  skyRevealed(): number {
    return this.mapVis?.skyRevealed ?? 0;
  }

  get shownLevel(): string {
    return levelId();
  }
  /** Level của room lúc dựng lần đầu. */
  private initLevel = 'van_lam';
  private levelSeq = 0;
  /** Các lớp đặc thù level (halo đèn…) đã dựng, để `unloadLevel` gỡ đúng. */
  private levelObjs: THREE.Object3D[] = [];
  private levelMood: GradingName = GRADING_DEFAULT;
  /** Bắc Hoang (DV-3I): vệt nứt phát sáng, cây chết, và mood trộn theo vị trí giữa `ash_dawn` và `rift`. */
  private rift: RiftVeil | null = null;
  private deadTrees: DeadTrees | null = null;
  private riftMood = false;
  private riftMoodT = -1;
  private riftMoodAcc = 0;

  /** Dựng lớp riêng của Bắc Hoang: vệt nứt Giới Khích (3 draw call), cây chết (≤ 3 draw call). `?bhart=0` tắt để so ảnh. */
  private buildBacHoang(): void {
    if (new URLSearchParams(location.search).get('bhart') === '0') return;
    const T = levelTerrain();
    this.riftMood = true;
    this.riftMoodT = -1;
    this.rift = buildRiftVeil(riftPath(T.def), (x, z) => heightAt(x, z));
    this.scene.add(this.rift.group);
    this.deadTrees = new DeadTrees(deadTreeSpots(bhCtx(propsOf('bac_hoang')), 700), (x, z) => heightAt(x, z));
    this.scene.add(this.deadTrees.group);
  }

  /** Xích Tẫn Khích (DV-3K): vết nứt phát sáng trên sàn hẻm (3 vết × 2 draw call), đèn nhấn quanh bia giữ và ba khe mạch. `?xichart=0` tắt để so ảnh. */
  private xichRifts: RiftVeil[] = [];

  private buildXich(id: string, q: (typeof QUALITY)[string]): void {
    if (new URLSearchParams(location.search).get('xichart') === '0') return;
    const T = levelTerrain();
    const paths = xichCracks(T.def, (x, z) => heightAt(x, z));
    for (const p of paths) {
      const v = buildRiftVeil(p, (x, z) => heightAt(x, z), { height: 7, ribs: false, floorHalf: 3, strength: 0.22, floorStrength: 0.6, endFade: true });
      this.scene.add(v.group);
      this.xichRifts.push(v);
    }
    const lv = LEVELS[id]?.dungeon;
    const c = lv?.center ?? { x: T.def.canyon?.cx ?? 0, z: T.def.canyon?.cz ?? 0 };
    // Bia giữ ở tâm: than hồng; ba khe mạch (đúng chỗ khe của boss cuối): ngọc lam, đối màu với than hồng.
    const acc: XichAccent[] = [
      { x: c.x, z: c.z, color: 0xff6a35, k: 1.4 },
      { x: c.x + 19, z: c.z + 11, color: 0x4fc9d0, k: 0.8 },
      { x: c.x - 19, z: c.z + 11, color: 0x4fc9d0, k: 0.8 },
      { x: c.x, z: c.z - 22, color: 0x4fc9d0, k: 0.8 },
    ];
    const pts = acc.map((a) => ({ x: a.x, y: heightAt(a.x, a.z) + 4.5, z: a.z, color: a.color, k: a.k }));
    const halos = createLanternHalos(pts, 5, 0xff7a45);
    this.scene.add(halos);
    this.levelObjs.push(halos);
    this.lanterns = new LanternLights(this.scene, pts, 4, 34);
    this.lanterns.setEnabled(q.lights && isWebGPU(this.renderer));
    this.lanterns.setIntensityScale(LANTERN_LIGHT[this.levelMood] ?? 1);
  }

  private disposeXich(): void {
    for (const v of this.xichRifts) {
      this.scene.remove(v.group);
      v.dispose();
    }
    this.xichRifts = [];
  }

  /** Mood Bắc Hoang theo vị trí: 0 ở nửa nam (`ash_dawn`) → 1 ở ba vùng bắc (`rift`), đổi dần quanh Khích Giai. Chỉnh uniform, không biên dịch lại. */
  private updateRiftMood(dt: number, z: number): void {
    this.riftMoodAcc += dt;
    if (this.riftMoodAcc < 0.2 && this.riftMoodT >= 0) return;
    this.riftMoodAcc = 0;
    const t = riftBlend(z - levelTerrain().def.size / 2);
    if (Math.abs(t - this.riftMoodT) < 0.01) return;
    this.riftMoodT = t;
    const p = mixPreset(GRADING.ash_dawn, GRADING.rift, t);
    tuneAtmosphere(this.scene, this.env, p, t > 0.5 ? 'rift' : 'ash_dawn', mixHex(skyTopOf('ash_dawn'), skyTopOf('rift'), t));
    applyGrading(p);
  }

  private disposeBacHoang(): void {
    if (this.rift) {
      this.scene.remove(this.rift.group);
      this.rift.dispose();
      this.rift = null;
    }
    if (this.deadTrees) {
      this.scene.remove(this.deadTrees.group);
      this.deadTrees.dispose();
      this.deadTrees = null;
    }
    this.riftMood = false;
  }

  /** Mood của level; `?mood=` trên URL thắng (chụp ảnh so sánh). */
  private moodOf(id: string): GradingName {
    const m = levelAssets(id).mood;
    if (m === 'default' || !(m in GRADING)) return GRADING_DEFAULT;
    // `?mood=dawn|day|night` thắng; level có bộ mood riêng (ochre) lấy biến thể cùng thời điểm.
    if (URL_MOOD) return moodVariant(m as GradingName, URL_MOOD);
    return m as GradingName;
  }

  /** Dựng phần level cần có trước hậu kỳ: địa hình, kiến trúc tông môn, cổng, đèn lồng, môi trường, bầu không khí. */
  private buildLevelA(id: string, q: (typeof QUALITY)[string]): void {
    const F = levelAssets(id).features;
    this.terrain = new Terrain();
    this.terrain.shadows = q.shadows;
    this.scene.add(this.terrain.group);
    this.applyGround();
    if (F.sect) {
      this.sectMesh = new THREE.Mesh(buildSect(), this.sectMat);
      this.sectMesh.castShadow = q.shadows;
      this.sectMesh.receiveShadow = q.shadows;
      this.sectMesh.frustumCulled = false;
      this.scene.add(this.sectMesh);
    }
    if (F.portals || (LEVELS[id]?.portals?.length ?? 0) > 0) {
      this.gateDiscs = gatesToDraw(id).map((g) => {
        const d = buildPortalDisc(g.x, g.z, g.color, g.flat);
        d.userData.op = g.opacity ?? 0.55;
        return d;
      });
      // Cổng vào Kính Nguyệt Cung: thêm vành gương nguyệt quanh đĩa để thấy rõ cổng.
      for (const g of gatesToDraw(id)) {
        if (g.id !== 'portal' || g.to !== 'kinh_nguyet') continue;
        this.gateDiscs.push(buildMoonGate(g.x, g.z));
        // Đĩa sáng nằm ngay trước mặt gương (tâm vòm cao 5 m trên nền, lùi 0,3 m ra phía trước).
        const disc = this.gateDiscs.find((d) => d.position.x === g.x && d.position.z === g.z && d.name !== 'moon-gate');
        if (disc) { disc.position.y -= 3.6; disc.position.y += 5.0; disc.position.z += 0.32; disc.scale.set(0.9, 1.12, 1); disc.userData.still = true; disc.userData.op = 0.82; const tex = moonMirrorTexture(); if (tex) { const dm = disc.material as THREE.MeshBasicMaterial; dm.map = tex; dm.color.set(0xffffff); dm.needsUpdate = true; disc.userData.mirrorTex = tex; }
          // Mặt sau cổng cũng có gương (người chơi vào từ phía nào cũng thấy): đĩa thứ hai dùng chung lưới và vật liệu.
          const back = new THREE.Mesh(disc.geometry, disc.material);
          back.position.set(disc.position.x, disc.position.y, disc.position.z - 0.64);
          back.scale.copy(disc.scale);
          back.userData.still = true;
          back.userData.op = disc.userData.op;
          this.gateDiscs.push(back);
        }
      }
      this.scene.add(...this.gateDiscs);
      for (const disc of this.gateDiscs) if (disc.name !== 'moon-gate') markBloom(disc.material as THREE.Material, 0.8);
      // Cung gương: vòng ra nằm trên sàn gương (cao hơn 0,08 m của sàn), không bị sàn cắt thành bán nguyệt.
      if (levelAssets(id).palace) for (const disc of this.gateDiscs) disc.position.y += 0.2;
    }
    const mood = this.moodOf(id);
    this.levelMood = mood;
    this.env.setLevel(terrainOf(id).id, { clouds: F.clouds, lake: F.lake });
    this.env.setQuality(get().quality);
    applyAtmosphere(this.scene, this.env, GRADING[mood], mood);
    applyGrading(GRADING[mood]);
    setHeightFog(q.heightFog);
    if (F.lanterns) {
      // Vân Lam: đèn lồng tông môn; level khác: đèn đá bày trong `propsOf` (E2-C).
      const pts = id === 'van_lam' || id === 'kiem_trung' ? SECT_LANTERNS : propsOf(id).filter((p) => p.id === 'prop_den_da').map((p) => ({ x: p.x, y: heightAt(p.x, p.z) + 2.1 * p.s, z: p.z }));
      // Cung gương: quầng đèn nhỏ, màu lạnh, không vào bloom (đèn đá không cháy trắng).
      const halos = levelAssets(id).palace ? createLanternHalos(pts, 1.3, 0xb8cdee) : createLanternHalos(pts);
      this.scene.add(halos);
      this.levelObjs.push(halos);
      this.lanterns = new LanternLights(this.scene, pts);
      this.lanterns.setEnabled(q.lights && isWebGPU(this.renderer)); // T6: đèn lồng point light thật chỉ ở WebGPU
      this.lanterns.setIntensityScale((LANTERN_LIGHT[mood] ?? 1) * (levelAssets(id).palace ? 0.35 : 1));
    }
    const cave = levelAssets(id).cave;
    if (cave) {
      // Phó bản hang (E2-C): vách + trần tối che chân trời, tinh thể mạch phát sáng lam lục (hai draw call).
      const palace = !!levelAssets(id).palace;
      const shell = buildCaveShell(cave, heightAt(cave.x, cave.z), palace);
      const glow = buildCrystalGlow(propsOf(id).filter((p) => p.id === 'prop_mach_tinh_tru').map((p) => ({ x: p.x, y: heightAt(p.x, p.z) + 1.8, z: p.z })));
      this.scene.add(shell, glow);
      this.levelObjs.push(shell, glow);
      if (palace) {
        // Cung gương (E3-M): sàn gương giả phủ lòng chảo (một draw call, không phản chiếu thật).
        const floor = buildMirrorFloor({ ...cave, r: cave.r - 2 }, heightAt);
        const hall = buildPalaceHall(cave, heightAt);
        this.scene.add(floor, hall);
        this.levelObjs.push(floor, hall);
      }
    }
    if (id === 'bac_hoang') this.buildBacHoang();
    if (id === XICH_LEVEL) this.buildXich(id, q);
    if (F.sect) void this.loadSectModel(q.shadows);
  }

  /** Phần dựng sau VFX: cây/prop, cột linh quang, cỏ. */
  private buildLevelB(id: string, q: (typeof QUALITY)[string]): void {
    const F = levelAssets(id).features;
    const params = new URLSearchParams(location.search);
    // P2-A4: prop Tripo (đèn đá, cổ thụ, đá, trúc…), nạp lười theo khoảng cách. `?props=0` tắt để chụp ảnh trước/sau.
    if (F.trees === 'scatter' && params.get('props') !== '0') {
      this.props = new PropLayer(undefined, allProps(levelId()));
      this.props.setQuality(get().quality, q.shadows);
      this.scene.add(this.props.group);
    }
    const pois = LEVELS[id]?.pois ?? [];
    if (F.beacons && pois.length && params.get('beacons') !== '0') {
      // Giới Khích (Bắc Hoang) tự có vệt sáng riêng (render/riftVeil.ts), không thêm cột linh quang nón.
      this.beacons = new Beacons(pois.filter((p) => p.beamH && !(id === 'bac_hoang' && p.id === 'gioi_khich')).map((p) => ({ x: p.x, z: p.z, h: p.beamH ?? 0 })));
      this.beacons.mesh.visible = isWorldRoom(get().room);
      this.scene.add(this.beacons.mesh);
    }
    this.grass = new Grass(levelAssets(id).grassCards);
    this.grass.setQuality(get().quality, q.shadows);
    this.grass.setEnabled(F.grass);
    this.grass.mesh.visible = F.grass;
    this.scene.add(this.grass.mesh);
    const bf = BUTTERFLY_LEVELS[id];
    if (bf && params.get('bf') !== '0') {
      this.butterflies = new Butterflies(bf);
      this.butterflies.setQuality(get().quality);
      this.scene.add(this.butterflies.mesh);
    }
  }

  /** Gắn bộ texture mặt đất (nếu đã nạp) vào địa hình hiện tại theo khai báo của level. */
  private applyGround(): void {
    if (!this.ground || !this.terrain) return;
    const g = levelAssets(levelId()).ground;
    this.terrain.setGround(g ? this.ground : null, (QUALITY[get().quality] ?? QUALITY.medium).ground);
  }

  /** Gỡ và giải phóng mọi thứ gắn với level hiện tại (địa hình, kiến trúc + GLB, cổng, đèn, cây, cột sáng, cỏ). Không để rò sau nhiều lần đổi. */
  private unloadLevel(): void {
    this.cloneVis?.clear();
    this.disposeBacHoang();
    this.disposeXich();
    const drop = (o: THREE.Object3D | null | undefined) => o && this.scene.remove(o);
    if (this.terrain) {
      drop(this.terrain.group);
      this.terrain.dispose();
    }
    if (this.sectMesh) {
      drop(this.sectMesh);
      this.sectMesh.geometry.dispose();
      this.sectMesh = null;
    }
    if (this.sectAsset) {
      drop(this.sectAsset.handle.scene);
      this.sectAsset.handle.release();
      for (const m of this.sectAsset.mats) m.dispose();
      this.sectAsset = null;
    }
    for (const d of this.gateDiscs) {
      drop(d);
      d.geometry.dispose();
      (d.userData.mirrorTex as THREE.Texture | undefined)?.dispose();
      (d.material as THREE.Material).dispose();
    }
    this.gateDiscs = [];
    for (const o of this.levelObjs) {
      drop(o);
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.MeshBasicMaterial | undefined)?.map?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    }
    this.levelObjs.length = 0;
    this.lanterns?.dispose();
    this.lanterns = null;
    if (this.props) {
      drop(this.props.group);
      this.props.dispose();
      this.props = null;
    }
    if (this.beacons) {
      drop(this.beacons.mesh);
      this.beacons.dispose();
      this.beacons = null;
    }
    if (this.butterflies) {
      drop(this.butterflies.mesh);
      this.butterflies.dispose();
      this.butterflies = null;
    }
    if (this.grass) {
      drop(this.grass.mesh);
      this.grass.dispose();
    }
  }

  /**
   * Đổi level đang hiển thị (E1-D): nạp trước asset + nhạc của level mới (màn tải), gỡ level cũ, dựng địa hình/cảnh/mood mới,
   * nối lại texture mặt đất. Gọi lại với level đang hiển thị thì không làm gì; level chưa khai báo thì bỏ qua. Trả true nếu đã đổi.
   * Vfx đang chạy tự hết trong vài giây (không gắn vào level); thực thể do `EntityManager` của room quản.
   */
  async enterLevel(id: string): Promise<boolean> {
    if (!this.started || this.disposed || !knownLevel(id) || id === levelId()) return false;
    const next = levelAssets(id);
    if (sameLayout(levelId(), id)) {
      // Cùng địa hình và cùng bố cục (thế giới ↔ bí cảnh Kiếm Trủng): chỉ đổi nhãn level và nạp trước nhạc, không dựng lại.
      setActiveLevel(id);
      set({ level: id });
      void this.music.preloadLevel(next.music);
      return true;
    }
    const seq = ++this.levelSeq;
    const prevPhase = get().phase;
    rememberLevel(id);
    set({ phase: 'loading' });
    try {
      const A = levelAssets(id);
      // 1. nạp trước (bài cũ vẫn phát, level cũ vẫn hiện sau màn tải): GLB cả level, stem nhạc, mặt nạ mặt đất.
      for (const glb of A.glb) assets.prefetch(glb, { pos: { x: SECT.x, z: SECT.z } });
      const maskKind = A.ground ? A.ground.mask : null;
      let commitMask: () => void = () => undefined;
      // E2-I: level dùng bộ texture khác (Đoạn Mạch: ochre) thì nạp bộ mới trước, đổi sau khi gỡ địa hình cũ rồi giải phóng bộ cũ.
      const newSet = A.ground && this.ground && this.ground.set !== A.ground.set ? A.ground : null;
      const swap: { t: GroundTextures | null } = { t: null };
      const self = this;
      await Promise.all([
        newSet
          ? loadGroundTextures(import.meta.env.BASE_URL, { get aborted() { return self.disposed; } }, newSet.mask, newSet.set).then(
              (t) => (swap.t = t),
              (e) => console.warn('[level] bộ texture mặt đất:', e),
            )
          : Promise.resolve(),
        this.music.preloadLevel(A.music),
        this.ground && maskKind && !newSet
          ? this.ground.prepareMask(maskKind).then((c) => (commitMask = c), (e) => console.warn('[level] mặt nạ mặt đất:', e))
          : Promise.resolve(),
      ]);
      if (this.disposed || seq !== this.levelSeq) {
        swap.t?.dispose(); // bộ texture mới đã nạp nhưng không còn dùng tới: giải phóng, không để rò ~54 MB
        return false;
      }
      // 2. gỡ cũ + dựng mới trong cùng một nhịp (không có khung nào thấy cảnh dở).
      const q = QUALITY[get().quality] ?? QUALITY.medium;
      this.unloadLevel();
      commitMask(); // địa hình cũ đã gỡ: giải phóng mặt nạ cũ an toàn
      if (swap.t) {
        this.ground?.dispose();
        this.ground = swap.t;
      }
      setActiveLevel(id);
      this.buildLevelA(id, q);
      this.buildLevelB(id, q);
      set({ level: id });
      this.minimap = renderMinimap(320);
      this.terrain.update(this.cur.x, this.cur.z, 8);
      this.vfx.rewarm();
      if (!isWebGPU(this.renderer)) await this.precompile();
      return true;
    } finally {
      if (seq === this.levelSeq && get().phase === 'loading') set({ phase: prevPhase === 'loading' ? 'game' : prevPhase });
    }
  }

  /** Nạp kiến trúc tông môn dựng bằng Blender (asset `arch_sect` qua AssetCache); lỗi thì giữ bản dựng bằng code. */
  private async loadSectModel(shadows: boolean): Promise<void> {
    try {
      await assets.attach(this.renderer);
      const handle = await assets.acquire('arch_sect', { pos: { x: SECT.x, z: SECT.z } });
      if (this.disposed || !levelAssets(levelId()).features.sect || this.sectAsset) {
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
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
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
    this.on(window, 'keyup', (e: KeyboardEvent) => {
      this.keys.onUp(e.code);
      if (e.code === 'KeyV') this.spiritHold(false);
    });
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
        const need = st.phase !== 'game' || st.windows.length > 0 || !!st.npc || st.chatOpen || (st.flags & PF_DEAD) !== 0;
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
    // WebGL2 nghẽn GPU ở preset Cao (T6: 25–67 fps ở pixelRatio ~2): hạ ngân sách điểm ảnh xuống bằng preset Vừa.
    const maxPixels = isWebGPU(this.renderer) ? q.maxPixels : Math.min(q.maxPixels, WEBGL2_MAX_PIXELS);
    this.renderer.setPixelRatio(budgetPixelRatio(w, h, q.pixelRatio, maxPixels));
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
    // Ô chiêu 9, thần thông Kết Đan (E2-E): phím 0 (phím 9 vẫn là pháp bảo phụ).
    if (code === 'Digit0' && !e.shiftKey) {
      if (this.bar().length > BAR_SIZE) this.useSkill(BAR_SIZE);
      else pushToast(t('ui.method.empty_slot'), 'info');
      return;
    }
    // Ô chiêu 10, thần thông Hóa Thần (E4-K): phím ` (Backquote; `-` là zoom camera; phím 0 vẫn là ô 9).
    if (code === 'Backquote' && !e.shiftKey) {
      if (this.bar().length > BAR_SIZE + 1) this.useSkill(BAR_SIZE + 1);
      else pushToast(t('ui.method.empty_slot'), 'info');
      return;
    }
    // Xuất khiếu trong Tam Trọng Kiếp (E3-L, móc tạm: E3-K sẽ nối phím X thật). Chỉ gửi ý định, server kiểm pha, hồi chiêu.
    if (code === 'KeyX' && !e.shiftKey && this.tribId === 'nguyen_anh' && get().tribEnd > Date.now()) {
      this.send(C.TRIB_SOUL, {});
      return;
    }
    // Phím G: trong Thiên Nhân Kiếp là thế thân của kiếp (E4-D), ngoài kiếp là phân thân thần niệm (E4-K, Hóa Thần).
    // Chỉ gửi ý định; server kiểm cấp, linh lực, hồi chiêu, tần suất, nơi đặt.
    if (code === 'KeyG' && !e.shiftKey) {
      if (this.tribId === 'hoa_than' && get().tribEnd > Date.now()) this.send(C.TRIB_CLONE, {});
      else if ((get().char?.level ?? 0) >= CLONE_UNLOCK_LEVEL) this.send(C.CLONE, {});
      return;
    }
    const slot = skillSlot(code);
    if (slot >= 0) {
      if (e.shiftKey) {
        // Hàng chiêu bậc cao (E2-G): Shift + số, sau ô 9.
        const tier = BAR_SIZE + 2 + slot;
        if (tier < this.bar().length) this.useSkill(tier);
        return;
      }
      if (slot < Math.min(this.bar().length, BAR_SIZE)) this.useSkill(slot);
      else if (slot < BAR_SIZE) pushToast(t('ui.method.empty_slot'), 'info');
      else if (slot === BAR_SIZE) this.useArtifact();
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
      case 'dash':
        this.useDash();
        break;
      case 'spirit':
        this.spiritHold(true);
        break;
      case 'soul':
        this.soulToggle();
        break;
      case 'bonded':
        this.useBonded();
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
      case 'party':
        togglePanel('party');
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
        if (closeTopPanel()) break;
        if (get().npc) set({ npc: null });
        else this.clearTarget();
        break;
      case 'debug':
        // Bảng F3 chỉ mở ở bản dev hoặc khi URL có ?debug.
        if (this.debugOk) set({ debugOpen: !get().debugOpen });
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

  /** Xin truyền tống tới trận `id` (server kiểm mở khóa, giao chiến, hồi chiêu). Không `id` = hủy lượt niệm. */
  teleport(id?: string): void {
    this.send(C.TELE, id ? { id } : {});
  }

  /** Đặt điểm đánh dấu ở (x, z), hoặc xóa nếu không có toạ độ. Server giãn lệnh và chia sẻ cho tổ đội. */
  setMark(pos?: { x: number; z: number }): void {
    this.send(C.MARK, pos ? { x: pos.x, z: pos.z } : { clear: true });
  }

  /** Giới tính nhân vật của mình ('m' | 'f'; '' khi chưa vào game). Chỉ để UI hiển thị, server mới là bên quyết định. */
  myGender(): string {
    return this.ents?.localGender() ?? '';
  }

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
  /** Thanh chiêu hiện tại: 6 chiêu chung + 2 chiêu công pháp (ô 1–8), thần thông ô 9 (chỉ số `BAR_SIZE`), ô 10 (`BAR_SIZE + 1`, Hóa Thần), rồi hàng bậc cao (Shift+số). */
  bar(): SkillDef[] {
    const m = get().method?.method;
    const tt = thanThongSkill(m);
    const tt10 = thanThong10Skill(m);
    return [...skillBar(m), ...(tt ? [tt] : []), ...(tt10 ? [tt10] : []), ...tierBar(m)];
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

  /** Nguyên anh xuất khiếu / nhập lại (phím X): chỉ gửi ý định, server kiểm cấp, hồi chiêu, giao chiến. */
  soulToggle(): void {
    const me = this.me();
    if (!me || (me.fl & PF_DEAD) !== 0) return;
    this.send(C.SOUL, {});
  }

  /** Chiêu lướt của công pháp (phím Q, không nằm trên thanh chiêu): chỉ gửi ý định, server lập đường và kiểm (K-2). */
  useDash(): void {
    const me = this.me();
    const m = METHOD.get(get().method?.method ?? '');
    const skill = m ? SKILL.get(m.dash) : undefined;
    if (!skill || !me || me.fl & PF_DEAD) return;
    if ((get().char?.level ?? 0) < skill.unlock) return;
    if ((get().cds[skill.id] ?? 0) > Date.now() + 80) return;
    this.send(C.SKILL, { id: skill.id, t: this.targetId || undefined });
  }

  /** Nhật ký các lần quét thần thức đã nhận (dev, để ảnh chụp/kiểm tay). */
  spiritLog: { r: number; n: number; kinds: Record<string, number>; hits: SpiritScanMsg['hits'] }[] = [];

  /** Thần thức (phím V, giữ): chỉ gửi ý định bắt đầu/thả; server giữ 2,5 giây, kiểm điều kiện, quyết định kết quả. */
  private spiritHeld = false;

  spiritHold(on: boolean): void {
    const st = get();
    if (on) {
      const me = this.me();
      if (!me || me.fl & PF_DEAD) return;
      if (!spiritUnlocked(st.char?.level ?? 0)) {
        pushToast(t('sys.spirit_locked'), 'info');
        return;
      }
      if (st.spirit.chUntil > performance.now()) return;
      this.spiritHeld = true;
    } else {
      // Thả phím: luôn gửi nếu đã gửi lệnh giữ, bất kể server đã báo `chUntil` hay chưa (chạm nhanh trong một RTT).
      if (!this.spiritHeld) return;
      this.spiritHeld = false;
    }
    this.send(C.SPIRIT, { on });
  }

  /** Bản mệnh pháp bảo Ngưng Đan Lô (phím T): có từ Kết Đan; chỉ gửi ý định, server quyết định hồi chiêu, linh lực, mục tiêu. */
  useBonded(): void {
    const me = this.me();
    const st = get();
    if (!me || me.fl & PF_DEAD) return;
    const def = ARTIFACT.get(BONDED_ARTIFACT_ID);
    if (!def || bondedLevel(st.char?.level ?? 0) < 1) {
      pushToast(t('sys.bonded_locked'), 'info');
      return;
    }
    if ((st.cds[def.skill] ?? 0) > Date.now() + 80) return;
    this.send(C.BONDED, {});
  }

  /** Pháp bảo phụ (phím 9, ô riêng): chỉ gửi ý định, server quyết định hồi chiêu, linh lực, mục tiêu (P3-8). */
  useArtifact(): void {
    const me = this.me();
    const st = get();
    if (!me || me.fl & PF_DEAD) return;
    const def = st.method?.art?.id ? ARTIFACT.get(st.method.art.id) : undefined;
    if (!def) {
      pushToast(t('sys.art_none'), 'info');
      return;
    }
    if ((st.cds[def.skill] ?? 0) > Date.now() + 80) return;
    this.send(C.ARTIFACT, {});
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
    const needTarget = needsTarget(skill) || (skill.kind === 'dash' && skill.dash?.dir === 'target');
    // Đang tỉ thí: chiêu đánh nhắm đối thủ (server vẫn kiểm đúng đối thủ, đã hết đếm ngược, trong tầm).
    const duel = get().duel;
    if (needTarget && duel && duel.phase !== 'end') {
      this.send(C.SKILL, { id: skill.id, t: duel.foe });
      return;
    }
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
    this.predictSkill(i, skill, needTarget);
  }

  /**
   * Vào thế ngay khi gửi chiêu (chỉ hình): chỉ khi client thấy server sẽ nhận (đứng đất, hết chờ, đủ linh lực, trong tầm).
   * Dùng cho cả bấm phím lẫn tự đánh, để chuỗi liên hoàn luôn có nhịp vào thế đủ (K-4).
   */
  private predictSkill(i: number, skill: SkillDef, needTarget: boolean): void {
    const me = this.me();
    if (!me) return;
    const mon = needTarget ? this.view.monsters.get(this.targetId) : undefined;
    const inRange = !needTarget || (!!mon && Math.hypot(mon.x - this.cur.x, mon.z - this.cur.z) <= skill.range + 1.5 + (MONSTER.get(mon.t)?.scale ?? 1));
    const ready = Date.now() >= this.skillReadyAt(i) - 60 && me.mp >= skill.mp && (me.fl & PF_CASTING) === 0 && (!skill.ult || (get().method?.charge ?? 0) >= CHARGE_MAX);
    // Biến thức có thể bỏ niệm chú (Lôi Tốc): dự đoán theo thời gian niệm đã gộp biến thức.
    if (inRange && ready && this.cur.grounded && !this.cur.flying) {
      const gap = mon ? Math.hypot(mon.x - this.cur.x, mon.z - this.cur.z) - (MONSTER.get(mon.t)?.scale ?? 1) : undefined;
      this.skillPoses.predict(this.ents.players.get(this.sid)?.model, { ...skill, cast: resolveBarSkill(get().method, skill).cast }, performance.now(), gap, get().method?.method);
    }
  }

  toggleFly(): void {
    const ch = get().char;
    if (!ch) return;
    if (!this.wantFly && ch.level < FLY_UNLOCK_LEVEL) {
      pushToast(t('sys.fly_locked', { realm: realmName(FLY_UNLOCK_LEVEL) }), 'bad');
      return;
    }
    this.wantFly = !this.wantFly;
    if (this.wantFly) {
      sfx('fly');
      const tl = FX_TIMELINE.get('fx_fly_on');
      if (tl && this.sid) this.skillFx?.startFromFx(this.sid, tl);
    }
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
    set({ npc: id, windows: [] });
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
  /** Cờ quái mở rộng (E1-E) bật/tắt: vòng phản đòn/yếu điểm bám chân quái trong suốt thời gian cờ; bụi khi chui đất/trồi. */
  private monFlagFx(m: MonVis, e: MonFlagEdge): void {
    const v = this.vfx;
    if (!v || Math.hypot(m.x - this.renderPos.x, m.z - this.renderPos.z) > 70) return;
    const id = m.id;
    const pos = (out: THREE.Vector3) => {
      const o = this.ents?.monsters.get(id);
      if (!o) return false;
      out.set(o.x, o.y, o.z);
      return true;
    };
    const left = Math.max(0.3, ((this.view.monsters.get(id)?.ce ?? 0) - (Date.now() + this.timeOffset)) / 1000);
    if (e.on & MF_REFLECT) v.castSigil(pos, left, MON_AURA_REFLECT.color, MON_AURA_REFLECT.radius, () => ((this.view.monsters.get(id)?.mf ?? 0) & MF_REFLECT) !== 0);
    if (e.on & MF_WEAK) v.castSigil(pos, left, MON_AURA_WEAK.color, MON_AURA_WEAK.radius, () => ((this.view.monsters.get(id)?.mf ?? 0) & MF_WEAK) !== 0);
    // Thể thật của Kính Nguyệt Chân Quân (E3-M): vết ngọc lam suốt trận; thần thức soi ra thì vòng vàng tới `ce`.
    if (e.on & MF_REAL) v.castSigil(pos, 3600, MON_AURA_REAL.color, MON_AURA_REAL.radius, () => ((this.view.monsters.get(id)?.mf ?? 0) & MF_REAL) !== 0 && (this.view.monsters.get(id)?.hp ?? 0) > 0);
    if (e.on & MF_SENSED) v.castSigil(pos, left, MON_AURA_SENSED.color, MON_AURA_SENSED.radius, () => ((this.view.monsters.get(id)?.mf ?? 0) & MF_SENSED) !== 0);
    if (e.on & MF_CHANT) this.monFx?.cast(m);
    if ((e.on | e.off) & MF_BURROW) {
      _v2.set(m.x, m.y + 0.4, m.z);
      v.burst(_v2, MON_BURROW_DIRT, Math.min(3, 1 + m.model.height * 0.5), 0.4);
    }
  }

  private monsterInk(m: MonVis): void {
    const v = this.vfx;
    if (!v || Math.hypot(m.x - this.renderPos.x, m.z - this.renderPos.z) > 70) return;
    const h = m.model.height;
    this.monFx?.death(m);
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

  /** Công pháp của người chơi `id` (mình: theo trạng thái công pháp; người khác: `mt` server gửi) để chọn giọng động tác. */
  private methodOfPlayer(id: string): string | undefined {
    return (id === this.sid ? get().method?.method : this.ents?.players.get(id)?.mt) || undefined;
  }

  // ---------- cảm giác đòn (K-7) ----------

  /** Sát thương đang chờ khung `hit` của người ra đòn (đồng hồ game, xả ở `frame`), thay cho `setTimeout`. */
  private hitQ = new HitQueue<DmgMsg>();
  /** Người ra đòn đã vào thế (windup) mà chưa tới `hitAt`: sát thương của họ tới lúc này thì chờ khung `hit`. */
  private swinging = new SwingGuard();
  /** Khung `hit` gần nhất của từng người ra đòn: ngữ cảnh (chiêu, đòn thứ mấy) cho phản ứng trúng đòn tới sau đó. */
  private lastHit = new Map<string, { skill: string; index: number; combo: number; kb: boolean; at: number }>();
  /** Lúc tiếng vung gần nhất của từng người (performance.now): FX `sword` tới sau không phát thêm tiếng vút nữa. */
  private whooshAt = new Map<string, number>();
  /** Đang xả hàng chờ trong chính khung `hit` (cho nhật ký). */
  private flushing = false;
  /** Nhật ký hit → âm (chỉ bản dev, `__sound.hits()`). */
  hitSoundLog: HitSoundLog[] = [];

  /** Chờ tối đa bao lâu (giây game) cho khung `hit` trước khi cứ thế phát (hoạt ảnh bị hủy, model khối cũ...). */
  private static readonly HIT_WAIT = 0.45;
  /** Sát thương tới sau khung `hit` trong khoảng này vẫn dùng ngữ cảnh của đòn đó (giây). */
  private static readonly HIT_CTX_TTL = 0.6;

  /**
   * Sự kiện chiêu của máy trạng thái (K-4) → tiếng vung đặt lịch theo đồng hồ AudioContext, và xả hàng chờ đúng khung `hit`:
   * tiếng trúng, hit-stop, rung camera của đòn rơi cùng khung hoạt ảnh ra đòn.
   */
  private onSwingEvent(sid: string, e: SkillEvent): void {
    if (e.kind === 'windup') {
      this.swinging.begin(sid, e.hitIn ?? 0, performance.now());
      const whoosh = SKILL_INFO.get(e.skill);
      if (whoosh && (whoosh.fx === 'sword' || whoosh.fx === 'slash') && !this.disposed) {
        const mine = sid === this.sid;
        const pv = this.ents?.players.get(sid);
        const vol = mine ? WHOOSH_GAIN : pv ? this.volumeAt(pv.x, pv.z) * WHOOSH_GAIN * 0.6 : 0;
        if (vol > 0) {
          this.whooshAt.set(sid, performance.now());
          sfx('sword', vol, pv, false, { delay: whooshDelay(e.hitIn ?? 0), rate: hitPitch(e.combo === 2) });
        }
      }
    } else if (e.kind === 'hit') {
      this.swinging.delete(sid);
      this.lastHit.set(sid, { skill: e.skill, index: e.index, combo: e.combo, kb: e.kb, at: performance.now() });
      if (this.lastHit.size > 64) for (const [k, v] of this.lastHit) if (performance.now() - v.at > 2000) this.lastHit.delete(k);
      // Cận cảnh chiêu tối thượng của mình: lúc ra đòn.
      if (sid === this.sid && SKILL_INFO.get(e.skill)?.ult) this.ultCamT = 0;
      this.flushing = true;
      for (const m of this.hitQ.release(sid)) this.applyDmg(m, this.lastHit.get(sid));
      this.flushing = false;
    } else if (e.kind === 'cancel' || e.kind === 'end') {
      this.swinging.delete(sid);
      for (const m of this.hitQ.release(sid)) this.applyDmg(m, undefined);
    }
  }

  /** Nhật ký FX nguyên anh/thuấn di nhận được (dev, để ảnh chụp/kiểm tay). */
  soulLog: { t: string; src: string; x?: number; z?: number; d?: number }[] = [];

  /** FX của nguyên anh và thuấn di (E3-K): chỉ hình. Trả true nếu đã xử lý. */
  private onSoulFx(m: FxMsg, src: string): boolean {
    if (m.t !== 'soul_out' && m.t !== 'soul_in' && m.t !== 'soul_flee' && m.t !== 'blink') return false;
    this.soulLog.push({ t: m.t, src, x: m.x, z: m.z, d: m.d });
    if (this.soulLog.length > 40) this.soulLog.shift();
    const vis = this.ensureSoulVis();
    const now = performance.now();
    const x = m.x ?? 0;
    const z = m.z ?? 0;
    if (m.t === 'blink') {
      vis.blink(m.ox ?? x, m.oz ?? z, x, z, now);
    } else if (m.t === 'soul_flee') {
      const p = this.ents?.players.get(src);
      const from = p ? new THREE.Vector3(p.x, p.y, p.z) : new THREE.Vector3(x, m.y ?? 0, z);
      vis.flee(from, new THREE.Vector3(x, m.y ?? groundAt(x, z), z), m.d ?? 10, now, src);
    } else {
      vis.pulse(x, (m.y ?? groundAt(x, z)) + 0.9, z, now, { r0: 0.5, r1: m.t === 'soul_out' ? 3 : 2, dur: m.d ?? 0.5 });
    }
    return true;
  }

  private ensureSoulVis(): SoulVis {
    this.soulVis ??= new SoulVis(this.scene, (sid, kind) => this.ents?.makeSoul(sid, kind) ?? null);
    return this.soulVis;
  }

  private ensureCloneVis(): CloneVis {
    this.cloneVis ??= new CloneVis(this.scene, this.vfx!, this.sid, (sid) => this.ents?.makeSoul(sid, 'soul') ?? null);
    return this.cloneVis;
  }

  private soulBodyYaw = 0;
  private soulBody = false;
  private skyRippleAt = 0;

  /** Nguyên anh (bản thu nhỏ) của mọi người đang thám thính, thân xác bỏ lại của mình, gợn linh khí dưới chân khi ngự không. */
  private updateSoulVis(dt: number, me: PState | undefined): void {
    const e = this.ents;
    if (!e) return;
    const scouts: SoulScout[] = [];
    for (const [sid, v] of e.players) {
      const fl = v.s.fl;
      if ((fl & PF_SOUL) !== 0 && (fl & PF_DEAD) === 0) scouts.push({ sid, x: v.x, y: v.y, z: v.z, yaw: v.yaw, speed: v.speed });
    }
    const soul = get().soul;
    const body = me && (me.fl & PF_SOUL) !== 0 && soul.k === SOUL_SCOUT ? { x: soul.bx, y: soul.by, z: soul.bz } : null;
    // Ngự không: gợn linh khí dưới chân người đang bay không kiếm (tối đa 3 người gần, mỗi 0,8 s).
    const now = performance.now();
    const skyers: PlayerVis[] = [];
    if (now - this.skyRippleAt > 800) {
      for (const v of e.players.values()) {
        if (skyers.length >= 3) break;
        if ((v.s.fl & PF_FLYING) === 0 || (v.s.fl & PF_SOUL) !== 0 || !inSkyBand(v.s.lv, v.y, groundAt(v.x, v.z))) continue;
        if (Math.hypot(v.x - this.renderPos.x, v.z - this.renderPos.z) > 40) continue;
        skyers.push(v);
      }
    }
    if (!this.soulVis && scouts.length === 0 && skyers.length === 0) return;
    const vis = this.ensureSoulVis();
    if (skyers.length) {
      this.skyRippleAt = now;
      for (const v of skyers) vis.skyRipple(v.x, v.y - 0.1, v.z, now);
    }
    if (body && !this.soulBody) this.soulBodyYaw = e.players.get(this.sid)?.yaw ?? 0;
    this.soulBody = !!body;
    vis.update(dt, scouts, body, now, this.sid, this.soulBodyYaw);
  }

  private onFx(m: FxMsg, held = false): void {
    const v = this.vfx;
    const e = this.ents;
    if (!v || !e || this.disposed) return;
    const src = m.src ?? '';
    const dst = m.dst ?? '';
    const pSrc = e.players.get(src);
    if (src && dst && !held) this.fxDst.set(src, dst);
    if (src && !held) {
      this.fxVar.set(src + ':' + m.t, m.v ?? m.tb);
      if (m.ox !== undefined && m.oz !== undefined) this.fxOrigin.set(src, { x: m.ox, z: m.oz });
      else this.fxOrigin.delete(src);
      if (m.x !== undefined && m.z !== undefined) this.fxArea.set(src, { x: m.x, z: m.z, r: m.r ?? 8 });
      else this.fxArea.delete(src);
    }
    // Timeline theo S.FX cho cảnh lớn (đột phá, độ kiếp, thuấn di, nguyên anh): chạy trước cả đường nguyên anh/thuấn di cũ (không thay, chỉ thêm lớp hình).
    const tlPre = pSrc && !held ? fxTriggered(m.t, this.methodOfPlayer(src), m.v ?? m.tb) : undefined;
    if (tlPre && typeof pSrc?.model.performClock === 'function') this.skillFx?.startFromFx(src, tlPre);
    if (this.onSoulFx(m, src)) return;
    if (!held) {
      // Động tác chiêu; đòn của mình đang vào thế thì giữ hiệu ứng + tiếng tới đúng lúc ra đòn.
      // Lướt (K-2): hình trượt từ chỗ cũ tới chỗ server đặt, và cắt phần thu về của chiêu đang phát (K-4).
      if (pSrc && this.skillPoses.dashOf(m.t)) {
        const from = e.posAgo(src, DASH_LOOKBACK);
        if (from) pSrc.model.dashFrom?.(from.x, from.z, m.d ?? 0.3);
      }
      const dstV = dst ? (e.monsters.get(dst) ?? e.players.get(dst)) : undefined;
      const gap = pSrc && dstV ? Math.hypot(dstV.x - pSrc.x, dstV.z - pSrc.z) - ('model' in dstV && 'def' in dstV.model ? ((dstV.model as { def?: { scale?: number } }).def?.scale ?? 1) : 0.5) : undefined;
      const hold = this.skillPoses.onFx(m.t, pSrc?.model, src === this.sid, performance.now(), { n: m.n, gap, method: this.methodOfPlayer(src) });
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
    // Timeline kích hoạt theo S.FX (lướt: không có động tác riêng) hoặc đã thay hình cũ của công pháp (chỉ khi model phát sự kiện chiêu).
    if (METHOD_FX.has(m.t)) {
      if (!(replacedFx(m.t) && typeof pSrc?.model.performClock === 'function')) playMethodFx(mctx);
      // Chiêu tối thượng của mình: thẻ ngắn 0,6 giây (viền sáng, tên chiêu), không khóa input.
      const ult = src === this.sid ? METHOD_SKILLS.find((s) => s.fx === m.t && s.ult) : undefined;
      if (ult) set({ ultCard: { id: ++this.ultCardId, skill: ult.id, color: m.c ?? 'ffffff', until: Date.now() + 600 } });
      return;
    }
    // Chiêu đã có dòng thời gian hiệu ứng (data/fx/<id>.json): hình do `SkillFx.runner` phát theo sự kiện chiêu, bỏ hình cũ.
    // Chỉ khi người ra chiêu có model phát sự kiện chiêu (SkinnedCharacter): model khối (`?models=legacy`, nạp lỗi) không có, giữ hình cũ.
    if (replacedFx(m.t) && typeof pSrc?.model.performClock === 'function') {
      // Đột phá của mình: hình do timeline lo, nhưng trạng thái HUD, chớp sáng và thẻ chương vẫn phải chạy (trước đây bị bỏ qua cùng nhánh hình cũ).
      if (m.t === 'ascend' && src === this.sid) {
        set({ tamCanh: -1, soulUntil: 0, nguHanh: null, cloneUntil: 0 });
        this.post?.flash(0.3);
        window.setTimeout(() => !this.disposed && this.chapter(m.tb === 'hoa_than' ? 'ascend_hn' : m.tb === 'nguyen_anh' ? 'ascend_na' : m.tb === 'ket_dan' ? 'ascend_kd' : 'ascend', false), 1100);
      }
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
        if (!(QUIET && dst === this.sid) && e.chestOf(dst, _v)) v.burst(_v, 0xe8c4a8, 0.6, 0.2, 0.25); // cắn: chỉ viền mờ màu kem, không cầu hồng đặc
        break;
      }
      case 'heal':
      case 'potion':
        v.pillar(posSrc, tint(0x7dffa0), 1.0, 0.9, 4);
        break;
      case 'art': {
        // Pháp bảo phụ (P3-8): pháp bảo bay lên theo animation thủ tục; thêm một vòng sáng nhỏ dưới chân, không trụ sáng, không chớp toàn cảnh.
        if (m.s === BONDED_ARTIFACT_ID) e.players.get(src)?.lo?.trigger(m.d ?? 1.4);
        else e.players.get(src)?.art?.trigger(m.d ?? 1.2);
        const col = tint(m.s === BONDED_ARTIFACT_ID ? 0xffb35a : 0xc9a2ff);
        if (e.chestOf(src, _v)) v.burst(_v.set(_v.x, _v.y - 1.05, _v.z).clone(), col, Math.min(1.5, (m.r ?? 8) * 0.12), 0.4);
        if (m.s === 'itm_thanh_lien_an') {
          // Khiên trùm cả tổ đội: vẽ cho người trong tầm đang mang khiên (cờ về sau vài chục ms).
          const rr = (m.r ?? 22) ** 2;
          const from = e.players.get(src);
          window.setTimeout(() => {
            for (const [sid, pv] of e.players) {
              if (from && (pv.x - from.x) ** 2 + (pv.z - from.z) ** 2 > rr) continue;
              if (sid !== src && !((pv.s.fl ?? 0) & PF_SHIELD)) continue;
              v.shield((out) => e.chestOf(sid, out), m.d ?? 4, () => (((this.view.players.get(sid)?.fl ?? 0) & PF_SHIELD) !== 0), col, 1, 0.09);
            }
          }, 120);
        }
        break;
      }
      case 'artheal':
        // Ngưng Đan Lô: cột đan hỏa mảnh và mờ (không che người), số hồi do DmgMsg heal hiện.
        v.pillar(posSrc, tint(0xffb35a), 0.8, 0.3, 2.2, 0.1);
        break;
      case 'artdrain':
        // Hồ Lô hút linh lực: một tia nhỏ từ quái bay về người dùng.
        if (e.chestOf(src, _v)) v.swordShot(_v, posDst, tint(0xc9a2ff), 0.45, 0.5);
        break;
      case 'artseal':
        if (e.chestOf(dst, _v)) v.burst(_v.clone(), tint(0xe8c46a), 0.9, 0.35);
        break;
      case 'shield':
        v.shield(posSrc, m.d ?? 8, () => ((this.view.players.get(src)?.fl ?? 0) & PF_SHIELD) !== 0, tint(0x7fd8ff), m.v === 'big' ? 1.4 : 1);
        break;
      case 'levelup':
        v.pillar(posSrc, 0xffe08a, 1.8, 1.4, 12);
        break;
      case 'ascend':
        // Người khác thấy trụ sáng như cũ; của mình thì quầng + tia nắng mảnh để không phủ trắng khung hình.
        if (src === this.sid) v.ascendGlow(posSrc, 2.6, m.tb === 'ket_dan', m.tb === 'nguyen_anh', m.tb === 'hoa_than');
        else v.pillar(posSrc, m.tb === 'hoa_than' ? 0xffeeb8 : m.tb === 'nguyen_anh' ? 0xd2c4ff : m.tb === 'ket_dan' ? 0xffd79a : 0xfff2b8, 3.2, 2.4, 40);
        if (src === this.sid) {
          set({ tamCanh: -1, soulUntil: 0, nguHanh: null, cloneUntil: 0 });
          this.post?.flash(0.3);
          // Thẻ chương đột phá sau khi mây kiếp tan và trụ sáng bốc lên; sting đột phá đã phát nên không thêm chiêng.
          window.setTimeout(() => !this.disposed && this.chapter(m.tb === 'hoa_than' ? 'ascend_hn' : m.tb === 'nguyen_anh' ? 'ascend_na' : m.tb === 'ket_dan' ? 'ascend_kd' : 'ascend', false), 1100);
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
        if (src === this.sid) set({ tamCanh: -1, soulUntil: 0, nguHanh: null, cloneUntil: 0 });
        this.cloneVfx.get(src)?.stop();
        this.cloneVfx.delete(src);
        if (e.chestOf(src, _v)) v.burst(_v, 0x8a8f98, 1.6, 0.5);
        break;
      case 'cast':
        v.charge(posSrc, m.d ?? 1, 0xfff0a8, () => ((this.view.players.get(src)?.fl ?? 0) & PF_CASTING) !== 0);
        // Pháp trận dưới chân: vạch tiến độ chạy theo thời gian niệm chú, tắt dần nếu bị ngắt.
        v.castSigil(posSrc, m.d ?? 1, 0xfff0a8, 1.4, () => ((this.view.players.get(src)?.fl ?? 0) & PF_CASTING) !== 0);
        if (src === this.sid) set({ castEnd: Date.now() + (m.d ?? 1) * 1000, castTotal: (m.d ?? 1) * 1000 });
        this.skillPoses.onCast(pSrc?.model, m.s, m.d ?? 1, this.methodOfPlayer(src));
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
      case 'dantran': {
        // Đan Trận (E2-D): `pg` < 0 khép vòng, ngược lại cập nhật tiến độ; lần đầu của một vòng thì dựng vòng.
        const h = this.danVfx.get(src);
        if (m.pg !== undefined && m.pg < 0) {
          h?.stop();
          this.danVfx.delete(src);
          if (src === this.sid) set({ danPg: -1 });
          break;
        }
        if (!h && m.r) {
          this.danVfx.set(src, v.danTran(m.x ?? 0, m.z ?? 0, m.r, (m.d ?? 28) + 1, () => ((this.view.players.get(src)?.fl ?? 0) & PF_TRIBULATION) !== 0));
          if (src === this.sid) this.danCine(m.x ?? 0, m.z ?? 0);
        }
        this.danVfx.get(src)?.set(m.pg ?? 0);
        if (src === this.sid) set({ danPg: m.pg ?? 0 });
        break;
      }
      case 'tamcanh': {
        // Tâm cảnh (E3-L): của chủ kiếp; lần đầu (pg 100) cắt cảnh ngắn nhìn xuống chỗ Tâm Ma Ảnh sắp hiện.
        if (src !== this.sid) break;
        const first = (m.pg ?? -1) === 100 && get().tamCanh < 0;
        set({ tamCanh: m.pg ?? -1 });
        if (first) {
          const me = this.me();
          if (me) this.danCine(this.renderPos.x, this.renderPos.z, '#8a78c8');
          // Quầng nhận diện bản sao tối màu của Tâm Ma Ảnh (theo dõi quái `mon_tam_ma` đang sống trong tầm nhìn).
          v.tamMaAura(
            (out) => {
              let found = false;
              this.view.monsters.forEach((mm) => {
                if (!found && mm.t === 'mon_tam_ma' && mm.hp > 0) {
                  out.set(mm.x, groundAt(mm.x, mm.z), mm.z);
                  found = true;
                }
              });
              return found;
            },
            () => get().tamCanh >= 0,
          );
        }
        break;
      }
      case 'xuatkhieu': {
        // Nguyên anh rời thân: bóng xanh nhạt lơ lửng trên thân trong `d` giây.
        this.soulVfx.get(src)?.stop();
        const until = Date.now() + (m.d ?? 6) * 1000;
        this.soulVfx.set(src, v.soulOut(posSrc, m.d ?? 6, () => ((this.view.players.get(src)?.fl ?? 0) & PF_TRIBULATION) !== 0));
        if (src === this.sid) set({ soulUntil: until });
        break;
      }
      case 'xuatkhieu_end':
        this.soulVfx.get(src)?.stop();
        this.soulVfx.delete(src);
        if (src === this.sid) set({ soulUntil: 0 });
        break;
      case 'clone_out': {
        // Phân thân thần niệm (E4-K): bản sao của chủ ở (x, z), bước theo `clone_mv`, vung tay theo `clone_act`.
        this.ensureCloneVis().spawn(src, m.x ?? 0, m.z ?? 0, m.d ?? 20, m.s ?? 'dps', pSrc?.yaw ?? 0);
        break;
      }
      case 'clone_mv':
        this.cloneVis?.move(src, m.x ?? 0, m.z ?? 0);
        break;
      case 'clone_act': {
        const tm = dst ? this.ents?.monsters.get(dst) : undefined;
        this.cloneVis?.act(src, tm ? tm.x : null, tm ? tm.z : null, m.r ?? 0);
        break;
      }
      case 'clone_hit':
        this.cloneVis?.hit(src);
        break;
      case 'clone_end':
        this.cloneVis?.end(src, m.pg === 1);
        break;
      case 'nguhanh': {
        // Tia kiếp ngũ hành (E4-D): HUD hiện hành đang giáng và trận môn cần đứng; vạch báo do vùng nguy hiểm vẽ.
        if (src === this.sid) set({ nguHanh: { e: m.n ?? 0, at: Date.now() + (m.d ?? 2) * 1000 } });
        break;
      }
      case 'phanthan': {
        // Thế thân thần niệm: bóng vàng sao nhạt đứng yên ở chỗ đã tách ra.
        this.cloneVfx.get(src)?.stop();
        const cx = m.x ?? 0;
        const cz = m.z ?? 0;
        this.cloneVfx.set(src, v.thanNiem(cx, cz, groundAt(cx, cz), m.d ?? 20, () => ((this.view.players.get(src)?.fl ?? 0) & PF_TRIBULATION) !== 0));
        if (src === this.sid) set({ cloneUntil: Date.now() + (m.d ?? 20) * 1000 });
        break;
      }
      case 'phanthan_end':
        // `pg` = 1: thế thân gánh đòn rồi tan (nổ một chớp); ngược lại hết giờ thì mờ dần.
        this.cloneVfx.get(src)?.stop(m.pg === 1);
        this.cloneVfx.delete(src);
        if (src === this.sid) set({ cloneUntil: 0 });
        break;
      case 'thienphat':
        // Mạch nối thiên phạt đánh trúng thân chính (không ai đứng trận môn thứ hai).
        _v.set(m.x ?? 0, groundAt(m.x ?? 0, m.z ?? 0) + 1, m.z ?? 0);
        v.burst(_v, 0xfff0b8, 3, 0.4);
        if (src === this.sid) this.shake.kick(0.6);
        break;
      case 'mirror_disc': {
        // Đĩa gương (E3-M): tia xoay theo đúng công thức server (góc đầu = sd/1000, báo pg/100 giây); d = 0 là tắt.
        const ver = ++this.mirrorDiscVer;
        if ((m.d ?? 0) <= 0) break;
        v.mirrorDisc(m.x ?? 0, m.z ?? 0, m.r ?? 24, 3, m.n ?? 3, (m.sd ?? 0) / 1000, 25, (m.pg ?? 150) / 100, m.d ?? 8, () => this.mirrorDiscVer === ver);
        break;
      }
      case 'mirror_pillar': {
        // Cột gương của đợt đố: màu theo thứ tự cột (lam, đỏ, vàng); d = 0 tắt; pg = 1 là cột đã chạm đúng.
        const n = m.n ?? 0;
        const ver = (this.mirrorPillarVer[n] = (this.mirrorPillarVer[n] ?? 0) + 1);
        if ((m.d ?? 0) <= 0) break;
        v.mirrorPillar(m.x ?? 0, m.z ?? 0, [0x5aa8ff, 0xe0584a, 0xe8c15a][n] ?? 0xffffff, m.d ?? 20, m.pg === 1, () => this.mirrorPillarVer[n] === ver);
        break;
      }
      case 'mirror_veil': {
        // Nguyệt phản: vòng gương bạc phủ vùng r quanh boss suốt d giây; d = 0 là tắt.
        const ver = ++this.mirrorVeilVer;
        if ((m.d ?? 0) <= 0) break;
        const cx = m.x ?? 0;
        const cz = m.z ?? 0;
        v.castSigil((out) => (out.set(cx, groundAt(cx, cz), cz), true), m.d ?? 18, 0xc8d8ff, m.r ?? 14, () => this.mirrorVeilVer === ver);
        _v.set(cx, groundAt(cx, cz) + 1.5, cz);
        v.burst(_v, 0xdde8ff, 4, 0.6);
        if (this.sid && src) this.shake.kick(0.35);
        break;
      }
      case 'mirror_echo': {
        // Lặp lại: bóng thật phản đúng chiêu; một chớp bạc ở chỗ người bị phản (vạch báo do vùng nguy hiểm vẽ).
        _v.set(m.x ?? 0, groundAt(m.x ?? 0, m.z ?? 0) + 1, m.z ?? 0);
        v.burst(_v, 0xbfd8ff, 1.6, 0.35);
        break;
      }
      case 'mirror_shatter': {
        // Bóng giả vỡ: mảnh gương bạc bắn ra, vòng nổ báo trước do vùng nguy hiểm vẽ.
        _v.set(m.x ?? 0, (m.y ?? 0) + 1.4, m.z ?? 0);
        v.burst(_v, 0xe6f2ff, 3.4, 0.5);
        break;
      }
      case 'mirror_split': {
        // Bốn thân hiện ra: chớp bạc lớn tại boss.
        _v.set(m.x ?? 0, groundAt(m.x ?? 0, m.z ?? 0) + 1.6, m.z ?? 0);
        v.burst(_v, 0xdde8ff, 5, 0.7);
        break;
      }
      case 'tamma_cast': {
        // Tâm Ma Ảnh tụ lực dùng chiêu của người độ kiếp: một nhịp tụ khí tím sẫm ở bóng (vạch báo do vùng nguy hiểm vẽ).
        const sm = this.view.monsters.get(src);
        if (sm) {
          _v.set(sm.x, groundAt(sm.x, sm.z) + 1.2, sm.z);
          v.burst(_v, 0x8a6fd0, 2.2, 0.4);
        }
        break;
      }
      case 'dantran_ok': {
        // Đan thành: một cột đan hỏa lam ngả vàng bốc lên từ giữa vòng, mảnh và trầm (không che nhân vật).
        _v.set(m.x ?? 0, groundAt(m.x ?? 0, m.z ?? 0) + 0.6, m.z ?? 0);
        v.burst(_v, 0xffcf8a, 3.2, 0.5);
        v.pillar(posSrc, 0xffd79a, 1.4, 0.9, 10, 0.1);
        if (src === this.sid) this.shake.kick(0.5);
        break;
      }
      case 'tribstart':
        // Vòng Đan Trận còn sót của kiếp trước (chết giữa kiếp không có tin khép vòng).
        this.danVfx.get(src)?.stop();
        this.danVfx.delete(src);
        this.soulVfx.get(src)?.stop();
        this.soulVfx.delete(src);
        this.cloneVfx.get(src)?.stop();
        this.cloneVfx.delete(src);
        if (src === this.sid) set({ danPg: -1, tamCanh: -1, soulUntil: 0, nguHanh: null, cloneUntil: 0 });
        v.tribulationCloud((out) => e.chestOf(src, out), m.d ?? 40, () => ((this.view.players.get(src)?.fl ?? 0) & PF_TRIBULATION) !== 0, m.sd);
        if (src === this.sid) {
          this.tribUntil = Date.now() + (m.d ?? 40) * 1000;
          this.tribId = m.tb ?? 'truc_co';
          set({ tribEnd: this.tribUntil, tribId: this.tribId });
          this.chapter('trib');
        }
        break;
    }
  }

  /** Vùng báo do boss thả (màu ma khí) hay quái thường (son đỏ). */
  private isBossSrc(src: string | undefined): boolean {
    const t = src ? this.view.monsters.get(src)?.t : undefined;
    return !!t && !!MONSTER.get(t)?.boss;
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
    if (import.meta.env.DEV) (window as unknown as { __sound?: unknown }).__sound = { hits: () => this.hitSoundLog, steps: () => this.steps?.stats, scape: () => ({ active: this.scape?.state(), ...this.scape?.stats }) };
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
      art: 'shield',
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
    // Phi kiếm của người chơi đã có tiếng vung đặt lịch từ sự kiện `windup` (K-7): không phát thêm tiếng vút lúc FX tới.
    if (t === 'sword' && src && performance.now() - (this.whooshAt.get(src) ?? -1e9) < 700) return;
    let vol = 1;
    let at: { x: number; z: number } | undefined;
    if (x !== undefined && z !== undefined) at = { x, z };
    else if (this.ents.chestOf(src || dst, _v)) at = _v;
    if (at) vol = this.volumeAt(at.x, at.z);
    // Tiếng của người khác nhỏ hơn tiếng của mình.
    if (src && src !== this.sid && dst !== this.sid) vol *= 0.6;
    sfx(name, vol, at);
  }

  /** Ghi nhận người chơi (mình/đồng đội) bị đánh và kẻ đánh, cho nhấp nháy trên minimap. */
  private markHurt(m: DmgMsg): void {
    if (m.heal || m.n <= 0 || !this.view.players.has(m.dst)) return;
    const now = performance.now();
    if (this.hurtAt.size > 64) for (const [k, at] of this.hurtAt) if (now - at > 3000) this.hurtAt.delete(k);
    this.hurtAt.set(m.dst, now);
    if (m.src && this.view.monsters.has(m.src)) this.hurtAt.set(m.src, now);
  }

  private onDmg(m: DmgMsg): void {
    if (this.disposed) return;
    this.markHurt(m);
    // Đòn của một người chơi đang vung (đã vào thế, chưa tới `hitAt`): chờ khung `hit` của hoạt ảnh để tiếng, khựng, rung
    // rơi đúng lúc ra đòn (K-7). Quá hạn mà không có `hit` thì `frame` xả.
    if (m.src && this.swinging.active(m.src, performance.now()) && !m.heal) {
      this.hitQ.push(m.src, m, Game.HIT_WAIT);
      return;
    }
    const lh = m.src ? this.lastHit.get(m.src) : undefined;
    this.applyDmg(m, lh && performance.now() - lh.at < Game.HIT_CTX_TTL * 1000 ? lh : undefined);
  }

  /** Hướng nguồn → đích trên mặt đất (null nếu thiếu một đầu). */
  private dirOf(src: string | undefined, dst: string): { x: number; z: number } | null {
    const a = src ? (this.ents.players.get(src) ?? this.ents.monsters.get(src)) : undefined;
    const b = this.ents.players.get(dst) ?? this.ents.monsters.get(dst);
    return a && b ? { x: b.x - a.x, z: b.z - a.z } : null;
  }

  private applyDmg(m: DmgMsg, ev: { skill: string; index: number; combo: number; kb: boolean; at: number } | undefined): void {
    if (this.disposed) return;
    if (!this.ents || !this.ents.topOf(m.dst, _v)) return;
    const mine = m.dst === this.sid;
    const byMe = m.src === this.sid;
    // Bị quái đánh khi chưa chọn mục tiêu: tự chọn kẻ tấn công để phản đòn nhanh.
    if (mine && !m.heal && !this.targetId && m.src && this.view.monsters.has(m.src)) this.setTarget(m.src, 'mon');
    const foe = !m.heal && (mine || byMe) ? this.ents.monsters.get((mine ? m.src : m.dst) ?? '') : undefined;
    if (foe) this.music.engage(!!foe.model.def.boss);
    // FX quái (V5): quái bị đánh → tia/mảnh theo hệ; quái đánh trúng người → vệt chém đỏ.
    if (!m.heal && m.n > 0) {
      const dm = this.ents.monsters.get(m.dst);
      if (dm) this.monFx?.hit(dm);
      else {
        const sm = m.src ? this.ents.monsters.get(m.src) : undefined;
        const dp = sm ? this.ents.players.get(m.dst) : undefined;
        if (sm && dp) this.monFx?.strike(sm, dp);
      }
    }
    if (!mine && !byMe) {
      // Sát thương của người khác: chỉ hiện khi ở gần.
      if (_v.distanceTo(this.renderPos) > 45) return;
    }
    // Ngữ cảnh đòn (K-7): đòn thứ ba của chuỗi, sức mạnh/tối thượng của chiêu lấy từ khung `hit` của hoạt ảnh.
    const skill = ev ? SKILL_INFO.get(ev.skill) : undefined;
    const hc: HitCtx = { crit: !!m.crit, heavy: !!m.hv, combo3: !!ev && (ev.kb || ev.combo === 2), power: skill?.power ?? 0, ult: !!skill?.ult, victimIsMe: mine, byMe };
    // Hit feel chỉ là lớp hình. Rung camera theo bảng (lấy max, có hướng nguồn → đích); công tắc "Rung màn hình" do `CameraShake` tôn trọng.
    const stops = hitStopOf(hc);
    if (!m.heal && m.n > 0) {
      const lv = shakeOf(hc);
      if (lv > 0) this.shake.kick(lv, this.dirOf(m.src, m.dst) ?? undefined);
    }
    // Cảnh boss/chuyển pha ngắn (≤ 2,6 s) và boss vốn đang đánh mình: chỉ đòn nặng mới hủy; cảnh mở đầu thì mọi đòn đều hủy.
    if (mine && !m.heal && m.n > 0) this.skipCine(this.cineKind === 'sect' || !!m.hv);
    if (mine && !m.heal && m.n > 0) this.post?.hit(m.n / Math.max(1, this.me()?.mhp ?? 1), !!m.crit || !!m.hv);
    if (m.hv && !m.heal && m.n > 0) this.heavyInk(m.dst, m.src);
    if (!m.heal && m.n > 0 && !(QUIET && m.dst === this.sid)) this.ents.hitReact(m.dst, m.src, !!m.crit, m.src && this.view.players.has(m.src) ? 0.2 : 0, !!m.hv, stops);
    // Boss đánh nặng (≥ KNOCKDOWN_FRAC máu tối đa) thì người bị đánh ngã rồi đứng dậy; chỉ hình, người chơi vẫn đi lại được và kéo dậy sớm khi di chuyển.
    if (!m.heal && m.hv && m.n > 0 && m.src) {
      const victim = this.ents.players.get(m.dst);
      if (victim && this.ents.monsters.get(m.src)?.model.def.boss && m.n >= victim.s.mhp * KNOCKDOWN_FRAC) victim.model.knockdown?.();
    }
    let cls = 'other';
    if (m.heal) cls = 'heal';
    else if (mine) cls = 'hurt';
    else if (byMe) cls = m.crit ? 'crit' : 'hit';
    if (!m.heal) {
      // Bị hộ thể hấp thụ hết: tiếng kim khí; chí mạng/đòn nặng: tiếng va mạnh hơn đòn thường.
      const name: Sfx = m.n === 0 ? 'block' : mine ? 'hurt' : m.crit || m.hv ? 'crit' : 'hit';
      const vol = mine || byMe ? 1 : this.volumeAt(_v.x, _v.z) * 0.5;
      // Phát ngay trong khung này: khi có `ev` thì đây chính là khung `hit` của hoạt ảnh. Pitch 0,92–1,08 (đòn 3 cao hơn một bậc).
      const rate = hitPitch(hc.combo3);
      sfx(name, vol, _v, true, { rate });
      const layers: string[] = [];
      if (m.n > 0 && !mine) {
        // Lớp chồng theo công pháp người ra đòn và chất liệu mục tiêu (tổng ≤ +3 dB).
        const mon = this.ents.monsters.get(m.dst);
        for (const l of layersOf({ method: m.src ? this.methodOfPlayer(m.src) : undefined, material: materialOf(mon?.model.def), crit: hc.crit || hc.heavy, strong: hc.combo3 || hc.power >= 2 || hc.ult })) {
          sfx(l.sfx, vol * l.gain, _v, false, { rate: rate * l.rate });
          layers.push(l.sfx);
        }
        // Chiêu tối thượng của mình trúng: hạ nhạc 20% trong 120 ms.
        if (hc.ult && byMe) duck(0.2, 0.12, 0.4);
      }
      if (import.meta.env.DEV && ev) {
        const soundAt = performance.now();
        this.hitSoundLog.push({ skill: ev.skill, index: ev.index, eventAt: ev.at, soundAt, lagMs: soundAt - ev.at, synced: this.flushing, sfx: name, rate, layers });
        if (this.hitSoundLog.length > 200) this.hitSoundLog.shift();
      }
    }
    const text = m.heal ? `+${m.n}` : m.n === 0 ? t('ui.absorbed') : mine ? `-${m.n}` : `${m.n}${m.crit ? '!' : ''}`;
    // Đứng đúng trận môn khắc chế (Thiên Nhân Kiếp, cờ `ke` do server tính): chỉ thêm chữ báo.
    this.dmg.spawn(m.ke === 1 && !m.heal ? `${text} ${t('ui.dmg.ke')}` : text, _v, cls);
  }

  // ---------- vòng lặp ----------

  private moveCtx(me: PState): MoveCtx {
    const dead = (me.fl & PF_DEAD) !== 0;
    const soul = get().soul;
    const scouting = (me.fl & PF_SOUL) !== 0 && soul.k === SOUL_SCOUT && !dead;
    return {
      canFly: !dead && (me.fl & PF_TRIBULATION) === 0 && (scouting || canFlyAt(me.lv, me.mp, me.x, me.y, me.z)),
      frozen: dead,
      speedMul: 1,
      terrain: levelTerrain(),
      bound: caveBoundOf(LEVELS[levelId()]),
      sky: skyFlightUnlocked(me.lv),
      ghost: scouting ? { x: soul.bx, z: soul.bz, r: SOUL_RANGE } : undefined,
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

  /** Chọn backend: xem `rendererChoice` (`?renderer=webgl2` chỉ cho lần nạp này). */
  private pickRenderer(params: URLSearchParams): boolean {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(RENDERER_KEY);
    } catch {
      /* bỏ qua */
    }
    const c = rendererChoice(params.get('renderer'), stored);
    if (c.storage === 'clear') {
      try {
        localStorage.removeItem(RENDERER_KEY);
      } catch {
        /* bỏ qua */
      }
    }
    return c.forceWebGL;
  }

  /** Thông tin adapter WebGPU (hãng, kiến trúc, giới hạn chính) để người dùng chụp gửi; một dòng console khi khởi động. */
  gpuInfo = '';
  private async describeGpu(): Promise<void> {
    if (!isWebGPU(this.renderer)) {
      this.gpuInfo = 'WebGL2';
      console.info('[gpu]', this.gpuInfo);
      return;
    }
    try {
      const be = this.renderer.backend as { device?: GPUDevice; adapter?: GPUAdapter };
      const ad = be.adapter ?? (await navigator.gpu?.requestAdapter());
      const i = ad?.info as { vendor?: string; architecture?: string; description?: string; device?: string } | undefined;
      const lim = be.device?.limits ?? ad?.limits;
      const parts = [
        `WebGPU ${i?.vendor ?? '?'} ${i?.architecture ?? ''} ${i?.description || i?.device || ''}`.trim(),
        lim ? `tex2D ${lim.maxTextureDimension2D} · layers ${lim.maxTextureArrayLayers} · attach ${lim.maxColorAttachmentBytesPerSample}B · uniform ${lim.maxUniformBufferBindingSize}` : '',
        `features ${be.device?.features?.size ?? ad?.features?.size ?? '?'}`,
      ];
      this.gpuInfo = parts.filter(Boolean).join(' · ');
    } catch (e) {
      this.gpuInfo = 'WebGPU (không đọc được adapter: ' + String(e) + ')';
    }
    console.info('[gpu]', this.gpuInfo);
  }

  private renderFails = 0;
  private fellBack = false;
  /** Lỗi WebGPU gần nhất (tối đa 20): bảng F3 và `__game.gpuErrors`. */
  gpuErrors: string[] = [];
  private blankWatch = new BlankWatch();
  private blankNextAt = 0;
  private blankProbe: CanvasRenderingContext2D | null = null;

  /**
   * Khung đen/trơn liên tục (cảnh không vẽ ra gì dù vòng lặp chạy): chỉ WebGPU, 30 s đầu sau khi vào game.
   * Thu canvas về 24×14 điểm, độ lệch chuẩn độ sáng gần 0 ba lần liên tiếp thì lùi WebGL2.
   * Chạy ngay sau `post.render()` trong cùng tác vụ, lúc đó canvas WebGPU còn đọc được.
   */
  private checkBlankFrame(now: number): void {
    if (this.fellBack || document.hidden || !isWebGPU(this.renderer)) return;
    if (this.cine.active || this.deathFx.active || ((this.me()?.fl ?? 0) & PF_DEAD) !== 0) {
      this.blankWatch.reset();
      return;
    }
    if (!this.blankNextAt) {
      this.blankNextAt = now + 4000;
      this.loadedAt = now;
    }
    if (now < this.blankNextAt || now > this.loadedAt + 34000) return;
    this.blankNextAt = now + 1500;
    if (!this.blankProbe) {
      const c = document.createElement('canvas');
      c.width = 24;
      c.height = 14;
      this.blankProbe = c.getContext('2d', { willReadFrequently: true });
    }
    const x = this.blankProbe;
    if (!x) return;
    try {
      x.drawImage(this.canvas, 0, 0, 24, 14);
      const d = x.getImageData(0, 0, 24, 14).data;
      const st = frameStats(d);
      this.lastBlank = { mean: +st.mean.toFixed(1), sd: +st.sd.toFixed(2) };
      if (this.blankWatch.push(st, this.lastRender.drawCalls)) {
        console.error('[gpu] khung trơn liên tục', this.lastBlank, 'lỗi:', this.gpuErrors);
        this.fallbackToWebGL2('blank-frame');
      }
    } catch {
      /* không đọc được canvas: không kết luận */
    }
  }
  lastBlank: { mean: number; sd: number } | null = null;
  private loadedAt = performance.now();

  /** WebGPU mất thiết bị (driver reset, tràn VRAM, GPU bị rút): cảnh đen mà vòng lặp vẫn chạy. */
  private watchGpuDevice(): void {
    if (!isWebGPU(this.renderer)) return;
    const dev = (this.renderer.backend as {
      device?: { lost?: Promise<{ reason?: string; message?: string }>; addEventListener?: (t: string, f: (e: { error?: { message?: string } }) => void) => void };
    }).device;
    // Lỗi WebGPU không bắt được (validation, shader/pipeline hỏng): ghi lại để bảng F3 và console cho thấy nguyên nhân.
    dev?.addEventListener?.('uncapturederror', (e) => {
      const msg = String(e.error?.message ?? e.error ?? 'unknown').slice(0, 400);
      this.gpuErrors.push(msg);
      if (this.gpuErrors.length > 20) this.gpuErrors.shift();
      console.error('[gpu] uncapturederror:', msg);
    });
    void dev?.lost?.then((info) => {
      if (this.disposed || info?.reason === 'destroyed') return;
      console.error('[gpu] device lost:', info?.reason, info?.message);
      this.fallbackToWebGL2('device-lost');
    });
  }

  /** Nhớ chọn WebGL2 cho các lần vào sau, báo trên HUD rồi nạp lại trang (WebGPU không dựng lại được trong cùng trang). */
  private fallbackToWebGL2(why: string): void {
    if (this.disposed) return;
    if (!canFallback(isWebGPU(this.renderer), this.fellBack)) {
      // Đã ở WebGL2 mà vẫn lỗi: nạp lại không giúp gì, chỉ báo một lần.
      if (!this.fellBack) {
        this.fellBack = true;
        console.error('[gpu] lỗi vẽ trên WebGL2:', why);
        pushToast(t('sys.gpu_failed'), 'bad');
      }
      return;
    }
    this.fellBack = true;
    console.warn('[gpu] lùi WebGL2:', why);
    try {
      localStorage.setItem(RENDERER_KEY, 'webgl2');
    } catch {
      /* bỏ qua */
    }
    pushToast(t('sys.gpu_fallback'), 'bad');
    setTimeout(() => location.reload(), 2500);
  }

  private frame(): void {
    if (this.disposed || this.compiling > 0) return;
    this.renderer.info.reset();
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000) * SLOWMO;
    this.lastT = now;
    this.frames++;
    // Sát thương chờ khung `hit` mà quá hạn (hoạt ảnh bị hủy, model khối cũ): phát luôn, theo đồng hồ game.
    for (const m of this.hitQ.tick(dt)) this.applyDmg(m, undefined);
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
    this.skillFx?.update(dt);
    if (me) this.updateGrass(dt, rp);
    this.vfx.update(dt);
    this.post?.update(dt);
    this.updateCamera(dt);
    setListener(rp.x, rp.z, this.camYaw);
    this.env.update(dt, this.camera, rp);
    if (this.riftMood) this.updateRiftMood(dt, rp.z);
    this.lanterns?.update(_v.set(rp.x, rp.y, rp.z));
    if (me) this.ambient.update(dt, this.camera.position, rp);
    if (me) this.butterflies?.update(dt, rp);
    if (this.mapVis && me) {
      const st = get();
      this.mapVis.setOpen(st.tele.open);
      this.mapVis.setMarks(st.marks);
      this.mapVis.setQuests(st.quests);
      this.mapVis.update(rp, st.tele.cast, performance.now(), TELE_CAST_MS);
      this.mapVis.updateSpirit(rp, st.spirit, st.spiritScan, performance.now());
    }
    this.updateSoulVis(dt, me);
    // Lĩnh vực (E4-K): vòng nhạt dưới chân mình từ Nguyên Anh trung kỳ.
    const dr = me ? domainRadius(get().char?.level ?? 0) : 0;
    if (dr > 0 || this.cloneVis) this.ensureCloneVis().setDomain(dr > 0 && me && (me.fl & PF_DEAD) === 0 ? { x: this.renderPos.x, z: this.renderPos.z, r: dr } : null);
    this.cloneVis?.update(dt, this.renderPos.x, this.renderPos.z);
    for (const disc of this.gateDiscs) {
      // Cổng gương nguyệt (vành + trụ đá) đứng yên, không lắc và không nhấp nháy như đĩa cổng.
      if (disc.name === 'moon-gate') continue;
      // Đĩa của cổng gương nguyệt không lắc: lắc thì mép chui qua gờ gương và bị cắt chiều sâu.
      if (!disc.userData.still) disc.rotation.y = Math.sin(now * 0.0006) * 0.15;
      const dmat = disc.material as THREE.MeshBasicMaterial;
      // Mặt gương nguyệt: độ đục giữ ≥ 0,7, gợn nhẹ và mây phản chiếu trôi chậm (xoay texture).
      dmat.opacity = (disc.userData.op ?? 0.55) + Math.sin(now * 0.003) * (disc.userData.still ? 0.08 : disc.userData.op ? disc.userData.op * 0.35 : 0.2);
      if (disc.userData.mirrorTex) (disc.userData.mirrorTex as THREE.Texture).rotation = now * 0.00006;
    }
    this.tickSkillQueue(now);
    this.tickCombat(now, me);
    // Cập nhật ma trận cả cảnh MỘT lần mỗi khung (M3-9): để tự động thì mỗi pass (cảnh chính, bóng) duyệt lại
    // toàn bộ cây, kể cả ~60 xương của mỗi nhân vật có xương.
    this.scene.updateMatrixWorld();
    try {
      this.post!.render();
      this.renderFails = 0;
      this.checkBlankFrame(now);
    } catch (e) {
      // Vẽ ném lỗi liên tục (thiết bị WebGPU hỏng, shader không biên dịch được): cảnh chỉ còn nền đen dù HUD vẫn chạy.
      console.error('[render]', e);
      if (++this.renderFails >= RENDER_FAIL_LIMIT) this.fallbackToWebGL2('render-error');
    }
    // renderer.info không tự reset (M1-6): lúc này là tổng của MỌI pass trong khung (bóng, cảnh, hậu kỳ).
    const ri = this.renderer.info.render;
    this.lastRender.drawCalls = ri.drawCalls ?? ri.calls;
    this.lastRender.triangles = ri.triangles;
    // Xem trước nhân vật (bảng mở): vẽ sau khi đã chốt số đo của cảnh chính để draw call của nó không lẫn vào.
    this.charPreview?.tick(dt);
    this.dmg.update(dt, this.camera, window.innerWidth, window.innerHeight, this.ents.labelBoxes);
    this.lootFly.update(dt);
    if (me && this.started) this.offscreen.update(this.camera, window.innerWidth, window.innerHeight, rp);

    this.fpsAcc += dt;
    this.fpsFrames++;
    const cpu = performance.now() - now;
    this.cpuAcc += cpu;
    if (cpu > this.cpuMax) this.cpuMax = cpu;
    this.colliderViz?.update(rp.x, rp.z);
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
    // Camera theo khu: trong cảnh điện ảnh/độ kiếp thì về mặc định (cảnh tự đặt camera), ra khỏi cảnh trôi mượt lại.
    const zw = E4_OFF || this.cine.active || this.tribScene ? BASE_ZONE : zoneCamera(rp.x, rp.z, this.zoneWant);
    easeZoneCam(this.zoneCur, zw, dt);
    const zc = this.zoneCur;
    // Cận cảnh chiêu tối thượng (K-7): FOV +1,5° trong 80 ms rồi về trong 200 ms, kéo camera gần thêm chút; không chặn điều khiển.
    // Theo công tắc "Rung màn hình" (tắt thì không cận cảnh); cảnh điện ảnh tự đặt camera nên bỏ qua.
    let ultPunch = 0;
    if (this.ultCamT >= 0) {
      this.ultCamT += dt;
      ultPunch = this.shake.enabled && !this.cine.active ? ultFovAt(this.ultCamT) : 0;
      if (this.ultCamT > ULT_FOV.rise + ULT_FOV.fall) this.ultCamT = -1;
    }
    let pull = 0;
    if (this.fxPull) {
      const f = this.fxPull;
      f.t += dt;
      pull = f.amt * Math.min(1, f.t / 0.4) * Math.max(0, Math.min(1, (f.dur - f.t) / 0.6));
      if (f.t >= f.dur) this.fxPull = null;
    }
    const wantFov = zc.fov + ultPunch;
    if (Math.abs(this.camera.fov - wantFov) > 0.01) {
      this.camera.fov = wantFov;
      this.camera.updateProjectionMatrix();
    }
    // Khung thẻ chương cộng thêm vào góc của người chơi, không ghi đè camDist/camPitch.
    const want = Math.min(70, this.camDist * zc.distMul * (flying ? 1.35 : 1) * this.camFrame.distMul * (1 - 0.05 * (ultPunch / ULT_FOV.kick)) * (1 + pull));
    this.camDistCur += (want - this.camDistCur) * Math.min(1, dt * 6);
    const pitch = Math.max(-0.45, Math.min(1.45, this.camPitch + zc.pitchAdd + this.camFrame.pitchAdd));
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
    // Thẻ chương đang hiện cũng ẩn bảng tên (tiêu đề không đè lên tên nhân vật).
    this.ents.tagsHidden = this.cine.active || this.tribScene || (get().chapter?.until ?? 0) > Date.now();
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
    // Trời kiếp: lam đêm ngả chàm, không nhuộm tím cả khung (art bible mục 1: tím dưới 5% khung hình, chỉ là điểm nhấn).
    // Sắc tím để dành cho tia sét và vùng báo trước.
    postParams.pulseColor.value.setRGB(0.2, 0.25, 0.4);
    postParams.pulse.value = 0.62 * k;
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
          this.predictSkill(0, this.bar()[0] ?? SKILLS[0], true);
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
    if (Math.hypot(m.x - x, m.z - z) > BOSS_BAR_RANGE) return null;
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
        // Quái đã ra khỏi tầm nhìn (AOI) hoặc bị bỏ lại quá xa: bỏ chọn, không để khung mục tiêu/thanh boss bám theo.
        if (!m || !def || !keepMonsterTarget(Math.hypot(m.x - rp.x, m.z - rp.z), !!def.boss)) {
          this.targetId = '';
          if (this.autoAttack) {
            this.autoAttack = false;
            set({ autoAttack: false });
          }
        } else {
          target = { id: this.targetId, kind: 'mon', name: monsterName(def.id), def: def.id, level: m.lv, hp: m.hp, mhp: m.mhp, boss: !!def.boss };
          const cast = this.castOf(m);
          if (cast) target.cast = cast;
        }
      } else if (this.targetKind === 'player') {
        const p = this.view.players.get(this.targetId);
        if (p) target = { id: this.targetId, kind: 'player', name: p.name, level: p.lv, hp: p.hp, mhp: p.mhp, boss: false };
        else this.targetId = '';
      } else {
        target = { id: this.targetId, kind: 'npc', name: t(`npc.${this.targetId}.name`), def: this.targetId, level: 0, hp: 1, mhp: 1, boss: false };
        const n = this.ents.npcs.find((e) => e.id === this.targetId);
        if (n && Math.hypot(n.x - rp.x, n.z - rp.z) > 30) this.targetId = '';
      }
    }
    const boss = this.bossFor(target, rp.x, rp.z);
    // Boss đã có thanh máu lớn trên HUD thì ẩn bảng tên 3D của nó (không để tên lộ ra sau thanh máu).
    this.ents.hudBossId = boss?.id ?? '';
    this.checkBossIntro(me);
    this.offscreen.setCandidates(this.offscreenCandidates(target, boss));
    let hint = '';
    if (!(me.fl & PF_DEAD)) {
      const near = this.ents.nearestInteractable(this.cur.x, this.cur.y, this.cur.z);
      if (near) {
        if (near.kind === 'npc') hint = t('ui.hint.talk', { name: t(`npc.${near.id}.name`) });
        else if (near.kind === 'node') hint = t('ui.hint.gather', { name: t(`item.${this.view.nodes.get(near.id)?.t}.name`) });
        else hint = t(near.id === 'exit' ? 'ui.hint.exit' : 'ui.hint.portal', { name: t(`dungeon.${near.id === 'exit' ? levelId() : (near.to ?? 'kiem_trung')}.name`) });
      }
    }
    const st = get();
    // Đóng hộp thoại NPC khi đi xa.
    let npc = st.npc;
    if (npc) {
      const n = this.ents.npcs.find((e) => e.id === npc);
      if (!n || Math.hypot(n.x - rp.x, n.z - rp.z) > 10) npc = null;
    }
    rememberZone(rp.x, rp.z);
    this.recoverTribulation(me);
    const fps = this.fpsAcc > 0 ? Math.round(this.fpsFrames / this.fpsAcc) : 0;
    this.cpuAvg = this.fpsFrames > 0 ? this.cpuAcc / this.fpsFrames : 0;
    this.cpuPeak = this.cpuMax;
    this.cpuAcc = 0;
    this.cpuMax = 0;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    let perf = st.perf;
    // Dòng gọn ở góc khi có ?debug (chỉ số và đơn vị quốc tế, không có chữ cần dịch); số đủ nằm trong bảng F3.
    if (this.debugPerf) perf = `${this.cpuAvg.toFixed(1)} ms · ${this.lastRender.drawCalls} draw · ${Math.round(this.lastRender.triangles / 1000)}k tri`;
    const nearby: { name: string; lv: number }[] = [];
    this.view.players.forEach((p, sid) => {
      if (sid !== this.sid) nearby.push({ name: p.name, lv: p.lv });
    });
    nearby.sort((a, b) => a.name.localeCompare(b.name));
    const nearbyKey = nearby.map((n) => n.name + n.lv).join('|');
    const sameNearby = nearbyKey === st.nearby.map((n) => n.name + n.lv).join('|');
    set({
      ...(sameNearby ? {} : { nearby }),
      debug: st.debugOpen ? this.debugInfo(me, Math.round(st.fps ? st.fps * 0.6 + fps * 0.4 : fps)) : null,
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
      airborne: (me.fl & PF_FLYING) !== 0 || rp.y - groundAt(rp.x, rp.z) > AIRBORNE_HEIGHT,
      zone: t(areaKey(levelId(), biomeAt(rp.x, rp.z))),
      fps: Math.round(st.fps ? st.fps * 0.6 + fps * 0.4 : fps),
      perf,
      autoAttack: this.autoAttack,
      tribEnd: me.fl & PF_TRIBULATION ? Math.max(st.tribEnd, this.tribUntil) : 0,
      castEnd: me.fl & PF_CASTING ? st.castEnd : 0,
    });
    this.checkChapters(rp.x, rp.z, (me.fl & PF_FLYING) !== 0);
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
    // Điểm đánh dấu của mình và đồng đội (M-4): mũi tên ở rìa màn hình khi nằm ngoài khung nhìn.
    for (const m of st.marks) {
      const y = groundAt(m.x, m.z) + 2;
      out.push({ key: `mark:${m.id}`, kind: m.own ? 'mark' : 'mate', label: m.own ? t('ui.wm.mark_own') : t('ui.wm.mark_of', { name: m.name }), pos: (o) => (o.set(m.x, y, m.z), true), span: 0.4 });
    }
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
  private checkChapters(x: number, z: number, flying = false): void {
    if (!this.started || this.snapToServer) return;
    // Ngự kiếm lần đầu (G10): thẻ chương + gợi ý lên/xuống; đã xem thì lần sau không hiện.
    if (flying && get().room === ROOM_WORLD && !this.pendingChapter && get().soul.k !== SOUL_SCOUT) {
      const who = get().char?.name;
      if (who && firstTime(localStorage, 'fly', who)) {
        this.chapter('fly');
        pushToast(t('ui.fly_hint'), 'info');
      }
    }
    // Chương 2 · Đoạn Mạch: thẻ lần đầu nhân vật này tới (E2-D). Vào bằng room mới nên kiểm ở đây, không ở `enterLevel`.
    if (!this.ch2Checked && levelId() === 'doan_mach' && get().phase === 'game') {
      const who = get().char?.name;
      if (who) {
        this.ch2Checked = true;
        if (firstTime(localStorage, 'ch2', who)) window.setTimeout(() => !this.disposed && this.chapter('ch2'), 1200);
      }
    }
    // Chương 3 · Vân Hải (E3-H): cùng cách với chương 2.
    if (!this.ch3Checked && levelId() === 'van_hai' && get().phase === 'game') {
      const who = get().char?.name;
      if (who) {
        this.ch3Checked = true;
        if (firstTime(localStorage, 'ch3', who)) window.setTimeout(() => !this.disposed && this.chapter('ch3'), 1200);
      }
    }
    // Chương 4 · Thiên Khuyết (E4-H): cùng cách.
    if (!this.ch4Checked && levelId() === 'thien_khuyet' && get().phase === 'game') {
      const who = get().char?.name;
      if (who) {
        this.ch4Checked = true;
        if (firstTime(localStorage, 'ch4', who)) window.setTimeout(() => !this.disposed && this.chapter('ch4'), 1200);
      }
    }
    // Chương 5 · Bắc Hoang (DV3-H): cùng cách.
    if (!this.ch5Checked && levelId() === 'bac_hoang' && get().phase === 'game') {
      const who = get().char?.name;
      if (who) {
        this.ch5Checked = true;
        if (firstTime(localStorage, 'ch5', who)) window.setTimeout(() => !this.disposed && this.chapter('ch5'), 1200);
      }
    }
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

  private beginBossCine(kind: 'boss' | 'phase' | 'dan', path: readonly Waypoint[], prof: { dur: number; out: number }, info: { name: string; title?: string; text: string }): void {
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

  /** Đan Trận mở ra: cắt cảnh ngắn nhìn xuống vòng (giữ HUD, bỏ qua được bằng phím/chuột hoặc khi bị đánh). */
  private danCine(x: number, z: number, color = '#ffb070'): void {
    if (!this.canBossCine(this.me())) return;
    const cam = this.camera;
    const look = _cineEndL.copy(cam.position).add(_cineFwd.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(10));
    const path = danTranPath({ x: cam.position.x, y: cam.position.y, z: cam.position.z }, { x: look.x, y: look.y, z: look.z }, { x, y: groundAt(x, z), z }, groundAt);
    postParams.pulseColor.value.set(color);
    this.beginBossCine('dan', path, DAN_CUTSCENE, { name: '', text: '' });
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
    const prof = k === 'boss' ? BOSS_CUTSCENE : k === 'dan' ? DAN_CUTSCENE : PHASE_CUTSCENE;
    const bell = Math.sin(Math.PI * Math.min(1, this.cine.time / prof.dur));
    if (k === 'boss') postParams.radial.value = 0.75 * bell * w;
    else if (k === 'dan') postParams.pulse.value = 0.3 * bell * w;
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

  /**
   * Lỡ tin `tribstart` (vào room hoặc kết nối lại khi mình đang độ kiếp, ví dụ `?tribulation=1`): cờ PF_TRIBULATION đã bật
   * hơn 0,6 giây mà chưa có giờ kết thúc thì dựng lại HUD và mây kiếp. Không biết lúc bắt đầu thật nên đếm từ đủ thời lượng
   * (cận trên); HUD vẫn tắt đúng lúc vì nó theo cờ của server.
   */
  private recoverTribulation(me: PState): void {
    const now = Date.now();
    if (!(me.fl & PF_TRIBULATION)) {
      this.tribFlagAt = 0;
      return;
    }
    if (!this.tribFlagAt) this.tribFlagAt = now;
    if (this.tribUntil > now || now - this.tribFlagAt < 600 || !this.started) return;
    // Lỡ tin: kiếp đang độ là kiếp mở ra từ cấp hiện tại (cấp chỉ đổi khi thành công).
    const def = tribForLevel(me.lv) ?? tribDef('truc_co');
    this.tribId = def.id;
    this.tribUntil = now + def.duration * 1000;
    const sid = this.sid;
    this.vfx.tribulationCloud((out) => this.ents.chestOf(sid, out), def.duration, () => ((this.view.players.get(sid)?.fl ?? 0) & PF_TRIBULATION) !== 0);
    set({ tribEnd: this.tribUntil, tribId: this.tribId });
  }

  /** Số liệu cho bảng gỡ lỗi F3 (M1-2). */
  private debugInfo(me: PState, fps: number): DebugInfo {
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
      perf: this.debugPerfInfo(fps),
    };
  }

  private debugPerfInfo(fps: number): DebugPerf {
    const mem = this.renderer.info.memory;
    const lod = this.ents.lodStats();
    return {
      backend: isWebGPU(this.renderer) ? 'WebGPU' : 'WebGL2',
      gpu: this.gpuInfo + (this.gpuErrors.length ? ` · LỖI: ${this.gpuErrors[this.gpuErrors.length - 1]}` : '') + (this.lastBlank ? ` · khung sd ${this.lastBlank.sd}` : ''),
      fps,
      cpuMs: this.cpuAvg,
      cpuMaxMs: this.cpuPeak,
      drawCalls: this.lastRender.drawCalls,
      triangles: this.lastRender.triangles,
      geometries: mem.geometries,
      textures: mem.textures,
      players: this.ents.players.size,
      monsters: this.ents.monsters.size,
      npcs: this.ents.npcs.length,
      lod: lod.lod,
      offscreen: lod.offscreen,
      fxMeshes: this.vfx.pool.live,
      particles: this.vfx.particles.aliveCount().total,
      particleLimit: this.vfx.particles.limit,
      tiles: this.terrain.tileCount(),
    };
  }

  /** Bật/tắt khung va chạm (bảng F3). Chỉ là lớp hiển thị ở client: vẽ lại vòng tròn collider dùng chung với server. */
  setDebugColliders(on: boolean): void {
    if (!this.debugOk) return;
    if (on && !this.colliderViz) {
      this.colliderViz = new ColliderViz();
      this.scene.add(this.colliderViz.group);
    } else if (!on && this.colliderViz) {
      this.colliderViz.dispose();
      this.colliderViz = null;
    }
    set({ debugColliders: on });
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

  /** Đích của chiêu gần nhất của mỗi người ra chiêu (từ S.FX), cho hiệu ứng timeline của người khác. */
  private fxDst = new Map<string, string>();
  /** Vùng (S.FX x, z, r) và biến thức của chiêu gần nhất của mỗi người ra chiêu, cho timeline hiệu ứng. */
  private fxArea = new Map<string, { x: number; z: number; r: number }>();
  private fxVar = new Map<string, string | undefined>();
  private fxOrigin = new Map<string, { x: number; z: number }>();

  private fxTargetOf(sid: string): { x: number; y: number; z: number; chest: number } | null {
    const id = sid === this.sid ? this.targetId || this.fxDst.get(sid) : this.fxDst.get(sid);
    if (!id || !this.ents) return null;
    const mon = this.ents.monsters.get(id);
    const ent = mon ?? this.ents.players.get(id);
    if (!ent) return null;
    return { x: ent.x, y: ent.y, z: ent.z, chest: mon ? mon.model.height * 0.55 : 1.2 };
  }

  setFxQuality(q: FxQuality): void {
    setFxQuality(q);
    set({ fxQuality: q });
  }

  setHitStop(on: boolean): void {
    setHitStopOn(on);
    set({ hitStop: on });
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
    this.applyGround();
    this.lanterns?.setEnabled(cfg.lights && isWebGPU(this.renderer));
    this.vfx?.particles.setQuality(q);
    this.grass?.setQuality(q, cfg.shadows && this.renderer.shadowMap.enabled);
    this.props?.setQuality(q, cfg.shadows && this.renderer.shadowMap.enabled);
    this.ambient?.setQuality(q);
    this.butterflies?.setQuality(q);
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
    this.charPreview?.dispose();
    this.ents?.dispose();
    this.skillFx?.dispose();
    this.skillFx = null;
    this.monFx = null;
    this.vfx?.dispose();
    this.terrain?.dispose();
    this.ground?.dispose();
    this.lanterns?.dispose();
    this.disposeBacHoang();
    this.disposeXich();
    for (const o of this.levelObjs) {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.MeshBasicMaterial | undefined)?.map?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    }
    this.levelObjs.length = 0;
    this.grass?.dispose();
    this.mapVis?.dispose();
    this.soulVis?.dispose();
    this.soulVis = null;
    this.cloneVis?.dispose();
    this.cloneVis = null;
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
    this.colliderViz?.dispose();
    this.colliderViz = null;
    set({ debugColliders: false, debugOpen: false });
    this.stage.replaceChildren();
    this.renderer?.dispose();
    try {
      this.room.leave(true);
    } catch {
      /* bỏ qua */
    }
    if (Game.current === this) Game.current = null;
    setActiveLevel('van_lam');
  }
}

// Khi sửa code engine lúc đang chạy dev, tải lại cả trang thay vì hot-reload từng module:
// game giữ trạng thái trong các đối tượng sống, thay module giữa chừng sẽ làm UI và game lệch nhau.
const hot = (import.meta as unknown as { hot?: { accept(cb: () => void): void } }).hot;
if (hot) hot.accept(() => window.location.reload());
