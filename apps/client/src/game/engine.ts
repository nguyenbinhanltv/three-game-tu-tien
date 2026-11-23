import { AutoQuality, isQuality } from '../base/quality';
import * as THREE from 'three/webgpu';
import { Client, type Room } from 'colyseus.js';
import {
  C,
  type DmgMsg,
  FLY_UNLOCK_LEVEL,
  type FxMsg,
  type InitMsg,
  type MoveInput,
  type MoveState,
  PF_DEAD,
  PF_MEDITATING,
  SECT,
  ROOM_WORLD,
  S,
  type TransferMsg,
  type SkillDef,
  CHARGE_MAX,
  BONDED_ARTIFACT_ID,
  bondedLevel,
  spiritUnlocked,
  type SpiritScanMsg,
} from '@dtl/shared';
import { knownLevel, levelAssets, levelId, sameLayout, setActiveLevel } from '../base/levelCtx';
import {
  FX_TIMELINE,
  ARTIFACT,
  METHOD,
  realmName,
  skillBar,
  stanceSkill,
  thanThong10Skill,
  thanThongSkill,
  tierBar,
  SKILL,
  VARIANTS,
  t,
} from '@dtl/content';
import { barWithStance } from '../ui/stanceView';
import { visibleView } from './net/aoiView';
import { get, pushLog, pushToast, set, type TargetInfo } from '../ui/store';
import { BlankWatch, canFallback, RENDERER_KEY } from './core/gpuGuard';
import { collectScene, type ScanItem, type ScanOpts, sceneTree } from './debug/collScan';
import { ColliderViz } from './debug/debugColliders';
import { duckHold, type Sfx, sfx } from './audio/audio';
import { rememberLevel } from './world/bootArt';
import { FootstepDriver } from './audio/footsteps';
import { Soundscape } from './audio/soundscape';
import { CamFrame, type ChapterKind } from './camera/chapter';
import { DeathFx } from './fx/deathFx';
import { Cutscene } from './camera/cutscene';
import { LootFly } from './fx/lootFly';
import { EntityManager, type PState, type WorldView } from './entities/entities';
import { Environment } from './world/env';
import { AmbientParticles } from './world/ambient';
import { Butterflies } from './world/butterflies';
import { Grass, GRASS_PUSH_SLOTS, type Pusher } from './world/grass';
import { setHeightFog } from '../render/atmosphere';
import { type RiftVeil } from '../render/riftVeil';
import { DeadTrees } from './world/deadTrees';
import type { BhWonders } from './world/bhWonders';
import type { Aurora } from '../render/aurora';
import { type EclipseSun } from '../render/eclipse';
import { Beacons } from '../render/beacons';
import type { GodRays } from '../render/godRays';
import type { CardForest } from './world/cardForest';
import type { LacKiemGarden } from './world/lacKiemGarden';
import type { DoanMachArt } from './world/doanMachArt';
import type { KiemTrungArt } from './world/kiemTrungArt';
import type { PhucMachArt } from './world/phucMachArt';
import type { KinhNguyetArt } from './world/kinhNguyetArt';
import type { ThanTangArt } from './world/thanTangArt';
import type { XichTanArt } from './world/xichTanArt';
import type { BhFar } from './world/bhFar';
import type { LacKiemFar } from './world/lacKiemFar';
import type { DoKiepArt } from './world/doKiepArt';
import type { KimDaArt } from './world/kimDaArt';
import type { LacKiemSkyScene } from './world/lacKiemSky';
import type { ThienKhuyetSkyScene } from './world/thienKhuyetSky';
import type { VanHaiWow } from './world/vanHaiWow';
import type { VanHaiGarden } from './world/vanHaiGarden';
import { PostPipeline, postParams } from '../render/post';
import { patchNodeCacheKey } from '../render/nodeCacheFix';
import { createWorldMaterial } from '../render/materials/world';
import { GRADING_DEFAULT, type GradingName } from '../render/grading';
import { MusicController } from './audio/music';
import { archWrap } from './world/occlusion';
import { LanternLights } from '../render/lanternLights';
import { PropLayer } from './world/props';
import { type AssetHandle, assets } from './core/assets';
import { prefetchWorldAssets } from './core/preload';
import { renderMinimap, Terrain } from './world/terrain';
import { MapVis } from './world/mapVis';
import { SoulVis } from './fx/soulVis';
import { CloneVis } from './fx/cloneVis';
import { loadGroundTextures, resolveGroundSet, type GroundTextures } from '../base/groundTextures';
import { BASE_ZONE, type ZoneCam } from './camera/camZones';
import { DamageNumbers, Vfx } from './fx/vfx';
import { OffscreenIndicators } from './entities/offscreen';
import { CameraShake } from './camera/shake';
import { KeyState } from '../input/keyboard';
import { SkillQueue } from '../input/skillQueue';
import { SkillPoses } from './combat/skillPose';
import { SkillFx } from './fx/skillFx';
import { SuyFx } from './fx/suyFx';
import { groundAt } from '../base/levelCtx';
import { PF_TRIBULATION } from '@dtl/shared';
import { MonFx } from './fx/monFx';
import { variantFor } from './fx/fxTimeline';
import {
  auraCombatOf,
  auraModeOf,
  auraOthersOf,
  fxQuality,
  hitStopOn,
  hitStopPctOf,
  realmAuraOn,
  setAuraCombat,
  setAuraMode,
  setAuraOthers,
  setFxQuality,
  setHitStopPct,
} from './fx/fxSettings';
import type { AuraCombat, AuraMode, AuraOthers } from './fx/realmAuraRules';
import { RealmAuraFx, type RealmAuraEnv } from './fx/realmAura';
import { PathAuraFx } from './fx/pathAura';
import { type FxQuality } from '@dtl/shared';
import { type SkillEvent } from './character/view';
import { HitQueue, SwingGuard, type HitSoundLog } from './combat/hitjuice';
import { debugAllowed, readTestParams } from './core/testParams';
import { CharPreview } from './camera/charPreview';
import { IsoRig } from './camera/isoRig';
import { currentSearch, FLAGS } from '../base/flags';
import { LoginOptions, QUALITY, isWebGPU, isWorldRoom, levelOfInit, levelOfRoom, serverUrl } from './engine/common';
import { describeGpu, fireSkill, pickRenderer, runFrame, watchGpuDevice } from './engine/frameLoop';
import { handleFx, monFlagFx, monsterInk, onSwingEvent, resetSound, volumeAt } from './engine/fxMsgs';
import { fxTargetOf } from './engine/hudSync';
import { bindInput, onResize } from './engine/input';
import {
  applyGround,
  buildLevelA,
  buildLevelB,
  disposeBacHoang,
  disposeXich,
  loadGround,
  precompile,
  unloadLevel,
} from './engine/levelLoad';
import { applyInit, bindRoom, rebind } from './engine/room';
import { logger } from '../base/log';

const levelLog = logger('level');
const engineLog = logger('engine');
const gpuLog = logger('gpu');
export { reqId } from './engine/common';

export class Game {
  static current: Game | null = null;
  static client: Client | null = null;
  static lastLogin: LoginOptions = {};
  /** Mã phiên server cấp sau lần đăng nhập đầu; dùng cho chuyển room và vào lại. */
  static session = '';

  /** Vào một room bằng mã phiên; nếu phiên hết hạn thì dùng lại thông tin đăng nhập gốc. */
  static async join(roomName: string, extra: Record<string, string> = {}): Promise<Room> {
    if (!Game.client) throw new Error('no client');
    if (Game.session) {
      try {
        // ?god đi theo mỗi lần vào room (bí cảnh, quay về); ?at chỉ áp lần vào đầu tiên.
        return await Game.client.joinOrCreate(roomName, { ...extra, session: Game.session, god: readTestParams(currentSearch()).god });
      } catch (e) {
        if ((e as { code?: number }).code !== 4014) throw e;
        Game.session = '';
      }
    }
    return Game.client.joinOrCreate(roomName, { ...extra, ...Game.lastLogin, god: readTestParams(currentSearch()).god });
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
      const room = await Game.client.joinOrCreate(ROOM_WORLD, { ...opts, ...readTestParams(currentSearch()) });
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

  static enter(room: Room): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 10000);
      room.onMessage(S.INIT, (init: InitMsg) => {
        clearTimeout(timer);
        Game.session = init.session;
        const prev = Game.current;
        if (prev) {
          rebind(prev, room, init);
        } else {
          const g = new Game(room, init);
          Game.current = g;
          // Để tiện gỡ lỗi từ console của trình duyệt.
          (window as unknown as { __game?: Game }).__game = g;
          g.start().catch((err) => {
            engineLog.error(err);
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
  post: PostPipeline | null = null;
  /** Bộ texture mặt đất PBR, nạp sau khung đầu (P2-A2). */
  ground: GroundTextures | null = null;
  /** Đèn lồng có ánh sáng điểm thật (chỉ preset Cao). */
  lanterns: LanternLights | null = null;
  /** Bước chân theo chất liệu mặt đất và nguồn âm theo vị trí (P2-D3); dựng lại mỗi khi đổi room (`resetSound`). */
  steps: FootstepDriver | null = null;
  scape: Soundscape | null = null;
  /** `matrixWorldAutoUpdate = false`: `frame()` tự cập nhật ma trận một lần trước khi vẽ (M3-9). */
  scene = Object.assign(new THREE.Scene(), { matrixWorldAutoUpdate: false });
  camera = new THREE.PerspectiveCamera(55, 1, 0.3, 9000);
  terrain!: Terrain;
  env!: Environment;
  /** Cỏ tương tác quanh người chơi (V4); preset Thấp tắt. */
  grass!: Grass;
  props: PropLayer | null = null;
  /** Cột linh quang ở các điểm đáng chú ý (M-5); chỉ hiện ở thế giới chính. */
  beacons: Beacons | null = null;
  /** Tia sáng xuyên mây (MAP-1). */
  godRays: GodRays | null = null;
  /** Đảo nổi, cầu mây, thác, Kiếm Đài (MAP-1). */
  lacKiemSky: LacKiemSkyScene | null = null;
  /** Tiên cung đổ nát, bậc thang lên trời, tượng thần, trận pháp của Thiên Khuyết (MAP-4). */
  thienKhuyetSky: ThienKhuyetSkyScene | null = null;
  /** GLB kiến trúc Thiên Khuyết (MAP-4). */
  tkAsset: { handle: AssetHandle; mats: THREE.Material[] } | null = null;
  /** GLB cảnh Kiếm Trủng (cự kiếm, vành núi đá, mộ, bia, xương…), DUN-1. */
  ktAsset: { handle: AssetHandle; mats: THREE.Material[] } | null = null;
  /** Vân Hải (MAP-3): thuyền tiên, cá kình mây, cầu vòng linh khí, hải đăng. */
  vanHaiWow: VanHaiWow | null = null;
  vanHaiGarden: VanHaiGarden | null = null;
  /** Vườn hoa, lùm trúc, đá rêu quanh tông môn (MAP-1). */
  lacKiemGarden: LacKiemGarden | null = null;
  /** Cây thẻ alpha thay cây Tripo ở Lạc Kiếm (MAP-1 bản B). */
  cardForest: CardForest | null = null;
  doanMachArt: DoanMachArt | null = null;
  kiemTrungArt: KiemTrungArt | null = null;
  phucMachArt: PhucMachArt | null = null;
  kinhNguyetArt: KinhNguyetArt | null = null;
  thanTangArt: ThanTangArt | null = null;
  xichTanArt: XichTanArt | null = null;
  bhFar: BhFar | null = null;
  lacKiemFar: LacKiemFar | null = null;
  doKiepArt: DoKiepArt | null = null;
  kimDaArt: KimDaArt | null = null;
  /** Bướm trang trí (DV-C): một InstancedMesh, chỉ ở level ngoài trời có khai báo. `?bf=0` tắt để so ảnh/số đo. */
  butterflies: Butterflies | null = null;
  /** Hạt môi trường quanh camera (V4), phát vào hệ hạt chung. */
  ambient!: AmbientParticles;
  pushers: Pusher[] = Array.from({ length: GRASS_PUSH_SLOTS }, () => ({ x: 0, y: 0, z: 0, r: 0 }));
  pushSelf: Pusher = { x: 0, y: 0, z: 0, r: 1.6 };
  pushPool: Pusher[] = [];
  ents!: EntityManager;
  charPreview: CharPreview | null = null;

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
  /** Hào quang cảnh giới trên nhân vật (RFX-1). */
  realmAura: RealmAuraFx | null = null;
  /** Hào quang riêng của Đao tu/Cổ tu/Cấm chế sư (thay hào quang cảnh giới của ba hướng này). */
  pathAura: PathAuraFx | null = null;
  /** Hiệu ứng quái/tinh anh/boss (V5). */
  monFx: MonFx | null = null;
  boltKinds = new Map<number, string>();
  /** Dấu trên sân mới nhất của Thiên Nhân Ngũ Suy của chính mình, theo khóa `<loại>:<ô>` (chỉ bản dev, cho Playwright: `__game.suyLog`). */
  suyLog?: Record<
    string,
    { s: string; n: number; x: number; z: number; r: number; pg: number; lv: number; at: number; d?: number; ox?: number; oz?: number }
  >;
  /** Nhật ký vùng báo của quái (chỉ bản dev, cho Playwright: `__game.hazardLog`). */
  hazardLog?: {
    k: string;
    mv?: string;
    sh: string;
    src: string;
    boss: boolean;
    t: string;
    x?: number;
    z?: number;
    r?: number;
    yaw?: number;
    w?: number;
    big?: boolean;
    px?: number;
    pz?: number;
    delay?: number;
    at?: number;
  }[];
  dmg!: DamageNumbers;
  lootFly!: LootFly;
  lootLayer: HTMLDivElement | null = null;
  /** Lần rơi gần nhất theo nguồn (để các món cùng một con quái tỏa ra lệch nhau). */
  lootSlots = new Map<string, { at: number; n: number }>();
  /** Đồ rơi bậc cao nhất đang nằm trên đất (cho chỉ báo ngoài màn hình). */
  rareLoot: { key: string; item: string; pos: THREE.Vector3; until: number }[] = [];
  /** Lần cuối vẽ vệt mực đòn nặng theo nạn nhân (giới hạn tần suất). */
  inkHitAt = new Map<string, number>();
  offscreen!: OffscreenIndicators;
  minimap!: HTMLCanvasElement;
  /** Lúc (performance.now) thực thể bị đánh/đang đánh người chơi: minimap nhấp nháy biểu tượng (M-3). */
  hurtAt = new Map<string, number>();
  /** Trận truyền tống, vòng niệm và cột sáng điểm đánh dấu (M-4). */
  mapVis: MapVis | null = null;
  soulVis: SoulVis | null = null;
  cloneVis: CloneVis | null = null;
  stage: HTMLElement;
  canvas!: HTMLCanvasElement;
  /** Đĩa sáng của cổng vào/ra phó bản (E2-C: theo dữ liệu level, xem `gates.ts`). */
  gateDiscs: THREE.Mesh[] = [];
  sectMesh: THREE.Mesh | null = null;
  sectAsset: { handle: AssetHandle; mats: THREE.Material[] } | null = null;
  /** Material kiến trúc tông môn: riêng với MODEL_MAT để làm mờ vật che mà không ảnh hưởng nhân vật. */
  sectMat = archWrap(createWorldMaterial({ vertexColors: true }));
  shake = new CameraShake();

  // Dự đoán di chuyển.
  cur: MoveState = { x: 0, y: 0, z: 0, vy: 0, grounded: true, flying: false };
  prev: MoveState = { x: 0, y: 0, z: 0, vy: 0, grounded: true, flying: false };
  pending: MoveInput[] = [];
  seq = 0;
  acc = 0;
  offset = new THREE.Vector3();
  lastAck = -1;
  lastSx = NaN;
  lastSy = NaN;
  lastSz = NaN;
  lastFl = -1;
  renderPos = new THREE.Vector3();
  facing = 0;
  faceTargetUntil = 0;
  speed = 0;

  // Camera & input.
  camYaw = 0;
  /** Camera chéo khóa góc (Thiên Nhãn). */
  iso: IsoRig | null = new IsoRig();
  camPitch = 0.38;
  camDist = 13;
  camDistCur = 13;
  /** Camera tự do cho ảnh duyệt (chỉ có tác dụng khi URL có `?debug`): đặt từ Playwright/console, null = camera theo nhân vật. */
  freeCam: { x: number; y: number; z: number; tx: number; ty: number; tz: number; fov?: number } | null = null;
  keys = new KeyState();
  skillQueue = new SkillQueue();
  ultCardId = 0;
  /** Giây từ lúc kích cận cảnh chiêu tối thượng (K-7); −1 = không đang chạy. */
  ultCamT = -1;
  /** Kéo camera ra xa nhẹ của hiệu ứng pháp tướng (theo công tắc "Rung màn hình"). */
  fxPull: { amt: number; dur: number; t: number } | null = null;
  /** Đẩy góc nhìn của sự kiện `camera.fov` (VS-1). */
  fxFov: { amt: number; dur: number; t: number } | null = null;
  /** Chậm thời gian trình diễn (VS-1, sự kiện `slowmo`): chỉ hình/hạt/animation, không đụng di chuyển hay luật. */
  fxSlow: { scale: number; until: number } | null = null;

  /** Hệ số thời gian trình diễn hiện tại (1 = bình thường). */
  presentationScale(now: number): number {
    const s = this.fxSlow;
    if (!s) return 1;
    if (now >= s.until) {
      this.fxSlow = null;
      return 1;
    }
    return s.scale;
  }
  /** Động tác chiêu (M3-4): dự đoán khi bấm phím, khớp lúc ra đòn với hiệu ứng. */
  skillPoses = new SkillPoses();
  /** Cần ảo cảm ứng (U2-6): ý định di chuyển thay WASD, null khi thả. */
  touchMove: { mx: number; mz: number } | null = null;
  autorun = false;
  wantFly = false;
  flyLostAt = 0;

  targetId = '';
  targetKind: TargetInfo['kind'] = 'mon';
  autoAttack = false;
  lastAttackSend = 0;
  bossLineId = 0;
  /** Thẻ chương (C2): khung camera nhẹ, thẻ chờ tới khi thế giới đã dựng, đã xét lần đầu vào tông môn chưa. */
  camFrame = new CamFrame();
  /** Camera theo khu (P2-E4): giá trị đang áp (đã làm mượt) và đích theo vị trí. */
  zoneCur: ZoneCam = { ...BASE_ZONE };
  zoneWant: ZoneCam = { ...BASE_ZONE };
  /** Cảnh mở đầu (P2-B1): camera điện ảnh lần đầu vào Lạc Kiếm Tông; xong thì hiện thẻ chương 'sect'. */
  cine = new Cutscene();
  /** Loại cảnh đang chạy (xem CineState.kind) và cờ rung lần hai của cảnh chuyển pha. */
  cineKind: 'sect' | 'boss' | 'phase' | 'dan' = 'sect';
  /** Đan Trận đang hiện (E2-D): theo sid chủ kiếp. */
  ch2Checked = false;
  ch3Checked = false;
  ch4Checked = false;
  ch5Checked = false;
  danVfx = new Map<string, { set(pg: number): void; stop(): void }>();
  /** Hiệu ứng năm ải Thiên Nhân Ngũ Suy (TN-4) theo timeline `suy_*.json`. */
  suyFx: SuyFx | null = null;
  /** Dấu tạm trên sân của Huyền Kiếp (TN-6, cột sáng), khóa `<sid>:<loại>:<ô>`; VFX riêng làm ở PR sau. */
  hkMarks = new Map<string, { stop(): void }>();
  /** Năm Trấn Giới Bia của Nhật Thực Kiếp (của mình). */
  stelesVfx: { set(mask: number): void; stop(): void } | null = null;
  stelesMask = 0;
  /** Nhật thực của Nhật Thực Kiếp (xem `updateEclipse`). */
  eclipse = 0;
  eclipseSun: EclipseSun | null = null;
  /** Phiên bản hiệu ứng cung gương (E3-M): tin mới/tin tắt tăng số, hiệu ứng cũ thấy số lệch thì tự tắt. */
  mirrorDiscVer = 0;
  mirrorVeilVer = 0;
  mirrorPillarVer: number[] = [];
  kdSteleVer: number[] = [];
  /** Nguyên anh xuất khiếu đang hiện (E3-L): theo sid chủ kiếp. */
  soulVfx = new Map<string, { stop(): void }>();
  /** Thế thân thần niệm của Thiên Nhân Kiếp (E4-D), theo sid chủ kiếp. */
  cloneVfx = new Map<string, { stop(boom?: boolean): void }>();
  cineShakeAt = 0;
  /** Cảnh độ kiếp của mình (P2-B4): 0..1 độ đậm của màu tối/tím toàn cảnh, và cờ đang trong cảnh (ẩn nhãn 3D). */
  tribMix = 0;
  tribScene = false;
  /** Chết và hồi sinh (P2-B5): mực loang, khử màu, camera trôi; linh quang khi sống lại. Chỉ trình diễn theo cờ PF_DEAD. */
  deathFx = new DeathFx();
  /** Giờ kết thúc kiếp theo tin `tribstart`, giữ riêng để đồng bộ HUD không xoá nếu tin đến trước cờ trạng thái. */
  tribUntil = 0;
  /** Kiếp đang độ (id trong `tribulations.json`): từ tin `tribstart`, hoặc suy từ cấp khi lỡ tin. */
  tribId = 'truc_co';
  /** Lúc thấy cờ độ kiếp của mình bật (ms, đồng hồ client); 0 = cờ đang tắt. Dùng để dựng lại HUD khi lỡ tin `tribstart`. */
  tribFlagAt = 0;
  /** Boss mà cảnh xuất hiện đang nhìn theo (vị trí hiện tại, vì boss đang chạy), và độ cao ngực so với chân. */
  cineFocus: { id: string; rise: number; scale: number } | null = null;
  /** Boss đã được xét cảnh xuất hiện trong lần giao chiến này (xóa khi boss hồi/gục). */
  bossIntroSeen = new Set<string>();
  pendingChapter: ChapterKind | null = null;
  sectChecked = false;
  timeOffset = 0;

  started = false;

  /**
   * Game đã vào thế giới và chưa bị hủy: MusicController của nó là chủ duy nhất của kênh nhạc nền, kể cả lúc chuyển
   * room (pha `loading`, Game được rebind) hay màn lỗi khi chưa bấm thử lại. Màn tiêu đề chỉ phát `title` khi false.
   */
  get ownsMusic(): boolean {
    return this.started && !this.disposed;
  }
  startedAt = 0;
  frames = 0;
  /** Người nghe sự kiện chiêu (K-4): VFX, âm thanh, rung camera đăng ký ở đây để khớp đúng khung `hitAt` (K-6, K-7). */
  skillListeners = new Set<(sid: string, e: SkillEvent) => void>();
  /** Đăng ký nghe; trả hàm hủy đăng ký. */
  onSkillEvent(fn: (sid: string, e: SkillEvent) => void): () => void {
    this.skillListeners.add(fn);
    return () => this.skillListeners.delete(fn);
  }
  /** Nhật ký sự kiện chiêu gần nhất (chỉ bản dev, cho Playwright/console: `__game.skillLog`). */
  skillLog: { sid: string; e: SkillEvent; at: number }[] = [];
  emitSkillEvent(sid: string, e: SkillEvent): void {
    onSwingEvent(this, sid, e);
    for (const fn of this.skillListeners) fn(sid, e);
    this.skillFx?.handle(sid, e);
    this.realmAura?.handle(sid, e);
    this.pathAura?.handle(sid, e);
    if (import.meta.env.DEV) {
      this.skillLog.push({ sid, e, at: performance.now() });
      if (this.skillLog.length > 200) this.skillLog.shift();
    }
  }

  /** Số đo khung vừa vẽ, cộng dồn qua mọi pass (cho `__game.info()`). */
  lastRender = { drawCalls: 0, triangles: 0 };
  hudAt = 0;
  /** Tự hạ preset khi nghẽn (base/quality.ts, nối ở engine/frameLoop.ts). */
  autoQuality = new AutoQuality();
  autoAt = 0;
  fpsAcc = 0;
  fpsFrames = 0;
  lastT = performance.now();
  disposed = false;
  leaving = false;
  /** `?debug`: dòng số đo gọn ở góc (công cụ đo vẫn dùng); bảng F3 cần `debugOk` (bản dev hoặc `?debug`). */
  debugPerf = FLAGS.debug;
  debugOk = debugAllowed(currentSearch(), (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true);
  /** CPU của `frame()` cộng dồn giữa hai lần đồng bộ HUD (cho bảng F3). */
  cpuAcc = 0;
  cpuMax = 0;
  cpuAvg = 0;
  cpuPeak = 0;
  colliderViz: ColliderViz | null = null;
  /** performance.now() lúc gửi input, theo seq & 127 (để ước tính ping). */
  inputSentAt: number[] = [];
  ping = 0;
  listeners: (() => void)[] = [];
  music = new MusicController();

  constructor(room: Room, init: InitMsg) {
    this.initLevel = levelOfInit(init);
    this.room = room;
    this.sid = init.sid;
    this.view = visibleView(room.state as unknown as WorldView);
    this.stage = document.getElementById('stage')!;
    applyInit(this, init);
    bindRoom(this, room);
  }

  snapToServer = true;

  async tryReconnect(room: Room, code: number): Promise<void> {
    pushLog(t('ui.reconnecting'), 'bad');
    const token = room.reconnectionToken;
    for (let i = 0; i < 4 && Game.client && token; i++) {
      await new Promise((r) => setTimeout(r, 1200 + i * 1500));
      try {
        const again = await Game.client.reconnect(token);
        this.room = again;
        this.view = again.state as unknown as WorldView;
        bindRoom(this, again);
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

  async transfer(m: TransferMsg): Promise<void> {
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
      engineLog.error(e);
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
  compiling = 0;

  /**
   * Hàng đợi biên dịch trước skin quái/boss (T5): từng nhóm một, lúc rảnh. Không chặn `frame()` và không bỏ vẽ: nhóm tạm
   * chỉ nằm trong cảnh lúc phần đồng bộ của `compileAsync` chạy, còn quái thật giữ model khối tới khi biên dịch xong
   * (`MonsterSkins`), nên không có lệnh vẽ nào dùng pipeline WebGPU còn dở (M6-1). `warmMs`: tổng thời gian biên dịch.
   */
  warmMs = 0;
  warmChain: Promise<void> = Promise.resolve();
  warmObject = (obj: THREE.Object3D): Promise<void> => {
    const run = async () => {
      if (!this.post || this.disposed) return;
      await new Promise<void>((r) =>
        typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 2000 }) : setTimeout(r, 50),
      );
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

  /** Thời gian từng bước khởi động (ms), để theo dõi thời gian tải. */
  loadStats: Record<string, number> = {};

  async start(): Promise<void> {
    const t0 = performance.now();
    const mark = (k: string) => {
      this.loadStats[k] = Math.round(performance.now() - t0);
    };
    const q = QUALITY[get().quality] ?? QUALITY.medium!;
    // Khử răng cưa do PostPipeline lo theo preset; MSAA ở canvas chỉ tốn bộ nhớ.
    // `?gputime=1` (chỉ cho công cụ đo, pnpm bench:crowd): bật timestamp query để đọc thời gian GPU bằng
    // `renderer.resolveTimestampsAsync()`; không ai resolve thì three cảnh báo hết chỗ query, nên đừng bật khi chơi.
    this.renderer = new THREE.WebGPURenderer({
      antialias: false,
      forceWebGL: pickRenderer(this, FLAGS.renderer),
      trackTimestamp: FLAGS.gpuTime,
    });
    await this.renderer.init();
    watchGpuDevice(this);
    void describeGpu(this);
    // Đổi preset lúc chạy làm pass cảnh đổi giữa có/không MRT bloom: phải tách cache shader theo đích (nodeCacheFix.ts).
    patchNodeCacheKey(this.renderer);
    mark('rendererInit');
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = q.shadows;
    // Bóng mềm (MAP-1 bản B): lọc PCF mềm thay vì cạnh cứng.
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    buildLevelA(this, this.initLevel, q);
    mark('terrainCoarse');
    void loadGround(this);
    mark('sect');
    this.post = new PostPipeline(this.renderer, this.scene, this.camera, q);
    this.vfx = new Vfx(this.scene);
    if (this.iso) this.scene.add(this.iso.ring, this.iso.destMark);
    this.vfx.camera = this.camera;
    this.vfx.viewerAt = () => this.renderPos;
    this.skillFx = new SkillFx(this.vfx, {
      player: (sid) => this.ents?.players.get(sid),
      mySid: () => this.sid,
      myMethod: () => get().method?.method,
      camera: () => this.camera as THREE.PerspectiveCamera,
      fx: {
        targetOf: (sid) => fxTargetOf(this, sid),
        quality: fxQuality,
        hitStopOn,
        shake: (level, dir) => this.shake.kick(level, dir),
        flash: (a) => this.post?.flash(a),
        camPull: (pull, dur) => {
          if (this.shake.enabled) this.fxPull = { amt: pull, dur, t: 0 };
        },
        camFov: (deg, dur) => {
          if (this.shake.enabled) this.fxFov = { amt: deg, dur, t: 0 };
        },
        slowmo: (scale, ms) => {
          if (this.shake.enabled) this.fxSlow = { scale, until: performance.now() + ms };
        },
        vignette: (amount, tone, ms) => this.post?.punch(amount, tone, ms),
        soundRate: (id, gain, sid, rate) => {
          const pv = this.ents?.players.get(sid);
          const vol = sid === this.sid ? gain : pv ? volumeAt(this, pv.x, pv.z) * gain * 0.6 : 0;
          if (vol > 0) sfx(id as Sfx, vol, pv, false, { rate });
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
          const vol = sid === this.sid ? gain : pv ? volumeAt(this, pv.x, pv.z) * gain * 0.6 : 0;
          if (vol > 0) sfx(id as Sfx, vol, pv, false);
        },
      },
    });
    const auraEnv: RealmAuraEnv = {
      players: () => this.ents?.players.values() ?? [],
      mySid: () => this.sid,
      camera: () => this.camera,
      parent: () => this.scene,
      makeShadow: (sid) => this.ents?.makeSoul(sid, 'shadow') ?? null,
      gfxQuality: () => get().quality,
      fxQuality,
      enabled: realmAuraOn,
      mode: auraModeOf,
      others: auraOthersOf,
      combat: auraCombatOf,
      partySids: () => new Set((get().party?.members ?? []).map((m) => m.sid).filter(Boolean)),
    };
    this.realmAura = new RealmAuraFx(this.vfx, auraEnv);
    this.pathAura = new PathAuraFx(this.vfx, auraEnv);
    this.monFx = new MonFx(this.skillFx.runner, { camera: () => this.camera, live: () => this.vfx.pool.live });
    this.suyFx = new SuyFx(this.skillFx.runner, {
      vfx: this.vfx,
      scene: this.scene,
      mySid: () => this.sid,
      player: (sid) => this.ents?.players.get(sid),
      ground: (x, z) => groundAt(x, z),
      tribOn: (sid) => ((this.view.players.get(sid)?.fl ?? 0) & PF_TRIBULATION) !== 0,
      shadow: () => {
        for (const m of this.view.monsters.values()) if (m.t === 'mon_tam_ma' && m.hp > 0) return { x: m.x, y: groundAt(m.x, m.z), z: m.z };
        return null;
      },
    });
    this.vfx.particles.setQuality(get().quality);
    buildLevelB(this, this.initLevel, q);
    this.ambient = new AmbientParticles(this.vfx.particles);
    this.ambient.setQuality(get().quality);
    // Chớp toàn cảnh của thiên lôi (M4-4) đi qua uniform `uFlash` của pass chỉnh màu.
    this.vfx.onFlash = (a) => this.post?.flash(a);
    this.ents = new EntityManager(this.scene, this.sid, levelOfRoom(get().room));
    this.ents.setWarm(this.warmObject);
    this.mapVis = new MapVis(this.scene, isWorldRoom(get().room) ? levelOfRoom(get().room) : null);
    resetSound(this, isWorldRoom(get().room));
    this.ents.camera = this.camera;
    this.ents.onSkillEvent = (sid, e) => this.emitSkillEvent(sid, e);
    this.ents.onMonsterDeath = (m) => monsterInk(this, m);
    this.ents.onMonFlags = (m, e) => monFlagFx(this, m, e);
    this.minimap = renderMinimap(320);
    mark('minimap');
    this.startedAt = t0;

    bindInput(this);
    onResize(this);
    // M6-1, WebGL2: biên dịch trước material của cảnh (trời, địa hình, kiến trúc, VFX ấm sẵn, cổng) song song
    // (KHR_parallel_shader_compile) thay vì biên dịch + link đồng bộ ở khung đầu. pnpm bench:load (20 Mbps,
    // trung vị 6 lượt): khung đầu − JS 1,80 → 1,59 s, vào game 3,96 → 3,47 s. WebGPU thì không lợi (dựng node
    // TSL vẫn đồng bộ, Chrome vốn biên dịch pipeline ở tiến trình GPU) mà khung đầu trễ thêm ~0,5 s: chỉ "vẽ ấm".
    if (!isWebGPU(this.renderer)) {
      this.vfx.update(0); // đưa các lưới "vẽ ấm" của VFX vào cảnh để được biên dịch cùng
      await precompile(this);
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
  initLevel = 'van_lam';
  levelSeq = 0;
  /** Các lớp đặc thù level (halo đèn…) đã dựng, để `unloadLevel` gỡ đúng. */
  levelObjs: THREE.Object3D[] = [];
  levelMood: GradingName = GRADING_DEFAULT;
  /** Bắc Hoang (DV-3I): vệt nứt phát sáng, cây chết, và mood trộn theo vị trí giữa `bh_<giờ>` và `bhr_<giờ>`. */
  rift: RiftVeil | null = null;
  deadTrees: DeadTrees | null = null;
  /** Bắc Hoang (MAP-5 PR2): xác cự thú, cột tà trận, băng, vết nứt dị vực; cực quang. */
  bhWonders: BhWonders | null = null;
  vdWonders: { group: THREE.Group; dispose(): void } | null = null;
  aurora: Aurora | null = null;
  riftMood = false;
  riftMoodT = -1;
  riftMoodAcc = 0;
  /** Phòng Giới Trì: trọng số mood mặt Âm / mặt Dương của boss hai mặt (0..1, đổi dần ~0,5 s) và trọng số đã áp lần cuối. */
  faceMoodAm = 0;
  faceMoodDuong = 0;
  faceMoodApplied = -9;

  /** Xích Tẫn Khích (DV-3K): vết nứt phát sáng trên sàn hẻm (3 vết × 2 draw call), đèn nhấn quanh bia giữ và ba khe mạch. `?xichart=0` tắt để so ảnh. */
  xichRifts: RiftVeil[] = [];

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
      const wantSet = A.ground ? resolveGroundSet(A.ground.set, get().quality) : null;
      const newSet = A.ground && wantSet && this.ground && this.ground.set !== wantSet ? { mask: A.ground.mask, set: wantSet } : null;
      const swap: { t: GroundTextures | null } = { t: null };
      const self = this;
      await Promise.all([
        newSet
          ? loadGroundTextures(
              import.meta.env.BASE_URL,
              {
                get aborted() {
                  return self.disposed;
                },
              },
              newSet.mask,
              newSet.set,
            ).then(
              (t) => (swap.t = t),
              (e) => levelLog.warn('bộ texture mặt đất:', e),
            )
          : Promise.resolve(),
        this.music.preloadLevel(A.music),
        this.ground && maskKind && !newSet
          ? this.ground.prepareMask(maskKind).then(
              (c) => (commitMask = c),
              (e) => levelLog.warn('mặt nạ mặt đất:', e),
            )
          : Promise.resolve(),
      ]);
      if (this.disposed || seq !== this.levelSeq) {
        swap.t?.dispose(); // bộ texture mới đã nạp nhưng không còn dùng tới: giải phóng, không để rò ~54 MB
        return false;
      }
      // 2. gỡ cũ + dựng mới trong cùng một nhịp (không có khung nào thấy cảnh dở).
      const q = QUALITY[get().quality] ?? QUALITY.medium!;
      unloadLevel(this);
      commitMask(); // địa hình cũ đã gỡ: giải phóng mặt nạ cũ an toàn
      if (swap.t) {
        this.ground?.dispose();
        this.ground = swap.t;
      }
      setActiveLevel(id);
      buildLevelA(this, id, q);
      buildLevelB(this, id, q);
      set({ level: id });
      this.minimap = renderMinimap(320);
      this.terrain.update(this.cur.x, this.cur.z, 8);
      this.vfx.rewarm();
      if (!isWebGPU(this.renderer)) await precompile(this);
      return true;
    } finally {
      if (seq === this.levelSeq && get().phase === 'loading') set({ phase: prevPhase === 'loading' ? 'game' : prevPhase });
    }
  }

  on<K extends keyof WindowEventMap>(
    target: Window | HTMLElement,
    type: K | string,
    fn: (e: never) => void,
    opts?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type as string, fn as EventListener, opts);
    this.listeners.push(() => target.removeEventListener(type as string, fn as EventListener, opts));
  }

  typing(): boolean {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
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

  /** Quét vật thể có hình trong cảnh cho công cụ `pnpm shots collscan` (COL-1): hộp bao thế giới từng mesh/instance. Chỉ đọc. */
  collScan(opts?: ScanOpts): ScanItem[] {
    return this.debugOk ? collectScene(this.scene, opts) : [];
  }

  /** Cây cảnh rút gọn để chỉnh bộ lọc công cụ quét. */
  collTree(depth: number): string[] {
    return this.debugOk ? sceneTree(this.scene, depth) : [];
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

  me(): PState | undefined {
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
    // VS-2d: ô 9 và hàng bậc cao theo nhánh công pháp đã chọn.
    const br = get().method?.br;
    const tt = thanThongSkill(m, br);
    const tt10 = thanThong10Skill(m);
    const bar = [...skillBar(m), ...(tt ? [tt] : []), ...(tt10 ? [tt10] : []), ...tierBar(m, br)];
    // VS-2e: đang giữ tư thế thì vài ô đổi thành chiêu tư thế (theo tin server; server vẫn kiểm khi nhận lệnh).
    return barWithStance(bar, get().method, Date.now() - get().methodOff);
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
    if (res === 'send') fireSkill(this, i);
  }

  /** Nguyên anh xuất khiếu / nhập lại (phím X): chỉ gửi ý định, server kiểm cấp, hồi chiêu, giao chiến. */
  soulToggle(): void {
    const me = this.me();
    if (!me || (me.fl & PF_DEAD) !== 0) return;
    this.send(C.SOUL, {});
  }

  /** Chiêu lướt của công pháp (phím Q, không nằm trên thanh chiêu): chỉ gửi ý định, server lập đường và kiểm (K-2). */
  /** Vào tư thế của công pháp (VS-2e, phím Y): chỉ gửi ý định, server kiểm cảnh giới, hồi chiêu, linh lực. */
  useStance(): void {
    const me = this.me();
    const skill = stanceSkill(get().method?.method);
    if (!skill || !me || me.fl & PF_DEAD) return;
    if ((get().char?.level ?? 0) < skill.unlock) return;
    if ((get().cds[skill.id] ?? 0) > Date.now() + 80) return;
    this.send(C.SKILL, { id: skill.id });
  }

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
  spiritHeld = false;

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
  skillReadyAt(i: number): number {
    const st = get();
    return Math.max(st.gcdAt, st.cds[this.bar()[i]?.id ?? ''] ?? 0);
  }

  /** Hủy chiêu đang chờ; trả true nếu có chiêu bị hủy. */
  cancelQueuedSkill(): boolean {
    if (!this.skillQueue.cancel()) return false;
    set({ queuedSkill: -1 });
    return true;
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

  // ---------- message từ server ----------

  questMarkersDirty = true;

  /** Công pháp của người chơi `id` (mình: theo trạng thái công pháp; người khác: `mt` server gửi) để chọn giọng động tác. */
  methodOfPlayer(id: string): string | undefined {
    return (id === this.sid ? get().method?.method : this.ents?.players.get(id)?.mt) || undefined;
  }

  // ---------- cảm giác đòn (K-7) ----------

  /** Sát thương đang chờ khung `hit` của người ra đòn (đồng hồ game, xả ở `frame`), thay cho `setTimeout`. */
  hitQ = new HitQueue<DmgMsg>();
  /** Người ra đòn đã vào thế (windup) mà chưa tới `hitAt`: sát thương của họ tới lúc này thì chờ khung `hit`. */
  swinging = new SwingGuard();
  /** Khung `hit` gần nhất của từng người ra đòn: ngữ cảnh (chiêu, đòn thứ mấy) cho phản ứng trúng đòn tới sau đó. */
  lastHit = new Map<string, { skill: string; index: number; combo: number; kb: boolean; at: number }>();
  /** Lúc tiếng vung gần nhất của từng người (performance.now): FX `sword` tới sau không phát thêm tiếng vút nữa. */
  whooshAt = new Map<string, number>();
  /** Đang xả hàng chờ trong chính khung `hit` (cho nhật ký). */
  flushing = false;
  /** Nhật ký hit → âm (chỉ bản dev, `__sound.hits()`). */
  hitSoundLog: HitSoundLog[] = [];

  /** Nhật ký FX nguyên anh/thuấn di nhận được (dev, để ảnh chụp/kiểm tay). */
  soulLog: { t: string; src: string; x?: number; z?: number; d?: number }[] = [];

  soulBodyYaw = 0;
  soulBody = false;
  skyRippleAt = 0;

  // ---------- vòng lặp ----------

  /** Thông tin adapter WebGPU (hãng, kiến trúc, giới hạn chính) để người dùng chụp gửi; một dòng console khi khởi động. */
  gpuInfo = '';
  renderFails = 0;
  fellBack = false;
  /** Lỗi WebGPU gần nhất (tối đa 20): bảng F3 và `__game.gpuErrors`. */
  gpuErrors: string[] = [];
  blankWatch = new BlankWatch();
  blankNextAt = 0;
  blankProbe: CanvasRenderingContext2D | null = null;

  lastBlank: { mean: number; sd: number } | null = null;
  loadedAt = performance.now();

  /** Nhớ chọn WebGL2 cho các lần vào sau, báo trên HUD rồi nạp lại trang (WebGPU không dựng lại được trong cùng trang). */
  fallbackToWebGL2(why: string): void {
    if (this.disposed) return;
    if (!canFallback(isWebGPU(this.renderer), this.fellBack)) {
      // Đã ở WebGL2 mà vẫn lỗi: nạp lại không giúp gì, chỉ báo một lần.
      if (!this.fellBack) {
        this.fellBack = true;
        gpuLog.error('lỗi vẽ trên WebGL2:', why);
        pushToast(t('sys.gpu_failed'), 'bad');
      }
      return;
    }
    this.fellBack = true;
    gpuLog.warn('lùi WebGL2:', why);
    try {
      localStorage.setItem(RENDERER_KEY, 'webgl2');
    } catch {
      /* localStorage bị chặn: chỉ lùi WebGL2 cho phiên này */
    }
    pushToast(t('sys.gpu_fallback'), 'bad');
    setTimeout(() => location.reload(), 2500);
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

  /** Đích của chiêu gần nhất của mỗi người ra chiêu (từ S.FX), cho hiệu ứng timeline của người khác. */
  fxDst = new Map<string, string>();
  /** Vùng (S.FX x, z, r) và biến thức của chiêu gần nhất của mỗi người ra chiêu, cho timeline hiệu ứng. */
  fxArea = new Map<string, { x: number; z: number; r: number }>();
  fxVar = new Map<string, string | undefined>();
  fxOrigin = new Map<string, { x: number; z: number }>();

  setFxQuality(q: FxQuality): void {
    setFxQuality(q);
    set({ fxQuality: q });
  }

  setHitStop(n: number): void {
    setHitStopPct(n);
    set({ hitStop: hitStopPctOf() });
  }

  setAuraMode(m: AuraMode): void {
    setAuraMode(m);
    set({ auraMode: m });
  }

  setAuraOthers(m: AuraOthers): void {
    setAuraOthers(m);
    set({ auraOthers: m });
  }

  setAuraCombat(m: AuraCombat): void {
    setAuraCombat(m);
    set({ auraCombat: m });
  }

  /** Khóa preset: bật thì không tự hạ khi nghẽn. */
  setQualityLock(on: boolean): void {
    localStorage.setItem('dtl.qualityLock', on ? '1' : '0');
    set({ qualityLock: on });
  }

  /** Ẩn gợi ý preset theo GPU (hiện một lần). */
  dismissQualityHint(): void {
    localStorage.setItem('dtl.qualityHintSeen', '1');
    set({ qualityHintSeen: true });
  }

  setCamShake(n: number): void {
    this.shake.setPct(n);
    set({ camShake: this.shake.pct });
  }

  /** Đổi preset lúc chạy có thể đổi bộ texture mặt đất (2K ↔ 1024² ở Vân Lam): nạp bộ đúng rồi thay, giải phóng bộ cũ. */
  private async syncGroundSet(): Promise<void> {
    const g = levelAssets(levelId()).ground;
    if (!g || !this.ground || this.groundSwapping) return;
    const want = resolveGroundSet(g.set, get().quality);
    if (want === this.ground.set) return;
    this.groundSwapping = true;
    // Chốt trạng thái lúc bắt đầu: nạp 2K mất vài giây, trong lúc đó level/bộ texture có thể đã đổi (truyền tống).
    const start = this.ground;
    const lv = levelId();
    try {
      const self = this;
      const next = await loadGroundTextures(
        import.meta.env.BASE_URL,
        {
          get aborted() {
            return self.disposed;
          },
        },
        g.mask,
        want,
      );
      if (this.disposed) {
        next.dispose();
        return;
      }
      if (levelId() !== lv || this.ground !== start) {
        next.dispose(); // bộ vừa nạp không còn khớp level/bộ hiện tại; vòng gọi lại bên dưới tính lại theo level mới
      } else {
        const old = this.ground;
        this.ground = next;
        applyGround(this);
        old.dispose();
      }
    } catch (e) {
      levelLog.warn('đổi bộ texture mặt đất theo preset:', e);
    } finally {
      this.groundSwapping = false;
    }
    // Preset có thể đổi tiếp trong lúc nạp.
    void this.syncGroundSet();
  }

  private groundSwapping = false;

  setQuality(q: string): void {
    if (!isQuality(q)) return;
    localStorage.setItem('dtl.quality', q);
    set({ quality: q });
    this.autoQuality.reset(performance.now());
    const cfg = QUALITY[q] ?? QUALITY.medium!;
    setHeightFog(cfg.heightFog);
    this.env?.setQuality(q);
    applyGround(this);
    void this.syncGroundSet();
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
    onResize(this);
  }

  /** Mỏng: công cụ đo bọc `__game.frame`/`__game.onFx`, nên hai hàm này vẫn là phương thức của Game. */
  frame(): void {
    runFrame(this);
  }

  onFx(m: FxMsg, held = false): void {
    handleFx(this, m, held);
  }

  dispose(): void {
    this.disposed = true;
    this.leaving = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer?.setAnimationLoop(null);
    for (const off of this.listeners) off();
    this.music.dispose();
    this.scape?.dispose();
    duckHold('chapter', 0);
    duckHold('boss', 0);
    duckHold('npc', 0);
    duckHold('cine', 0);
    this.charPreview?.dispose();
    this.iso?.dispose();
    this.ents?.dispose();
    this.skillFx?.dispose();
    this.skillFx = null;
    this.realmAura?.dispose();
    this.realmAura = null;
    this.pathAura?.dispose();
    this.pathAura = null;
    this.monFx = null;
    this.suyFx?.dispose();
    this.suyFx = null;
    this.vfx?.dispose();
    this.terrain?.dispose();
    this.ground?.dispose();
    this.lanterns?.dispose();
    disposeBacHoang(this);
    disposeXich(this);
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
    this.tkAsset?.handle.release();
    for (const m of this.tkAsset?.mats ?? []) m.dispose();
    this.tkAsset = null;
    this.ktAsset?.handle.release();
    for (const m of this.ktAsset?.mats ?? []) m.dispose();
    this.ktAsset = null;
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
      /* room đã đóng sẵn */
    }
    if (Game.current === this) Game.current = null;
    setActiveLevel('van_lam');
  }
}

// Khi sửa code engine lúc đang chạy dev, tải lại cả trang thay vì hot-reload từng module:
// game giữ trạng thái trong các đối tượng sống, thay module giữa chừng sẽ làm UI và game lệch nhau.
const hot = (import.meta as unknown as { hot?: { accept(cb: () => void): void } }).hot;
if (hot) hot.accept(() => window.location.reload());
