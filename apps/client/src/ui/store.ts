import { isQuality } from '../base/quality';
import { create } from 'zustand';
import type {
  BossTimerMsg,
  CharView,
  DuelMsg,
  Equipment,
  InviteMsg,
  InvSlot,
  MarkInfo,
  MethodMsg,
  PartyMsg,
  QuestView,
  SpiritHit,
  WardrobeMsg,
} from '@dtl/shared';
import { duckHold, sfx } from '../game/audio/audio';
import { auraCombatOf, auraModeOf, auraOthersOf, fxQuality, hitStopOn } from '../game/fx/fxSettings';
import type { AuraCombat, AuraMode, AuraOthers } from '../game/fx/realmAuraRules';
import { uiScale } from './uiScale';
import {
  closeWindow,
  fitWindows,
  focusWindow,
  loadSavedPos,
  moveWindow,
  openWindow,
  savePos,
  topWindow,
  type Viewport,
  type WinId,
  type WinState,
} from './windows/layout';

export interface TargetInfo {
  id: string;
  kind: 'mon' | 'npc' | 'player';
  name: string;
  /** id quái hoặc NPC: chọn chân dung (Portrait). */
  def?: string;
  level: number;
  hp: number;
  mhp: number;
  boss: boolean;
  /** Boss đang niệm chú hoặc đang choáng: `end` theo đồng hồ client (ms), `open` = tỉ lệ đoạn hộ chú. */
  cast?: TargetCast;
  /** Ấn mục tiêu đang mang (VS-2c): gói bit `packMarks`; 0 hoặc thiếu = không có. */
  mk?: number;
}

/** Thanh boss giữa phía trên: boss đang là mục tiêu, hoặc boss gần nhất đang giao chiến. */
export interface BossInfo {
  id: string;
  /** id quái (để lấy tên, danh hiệu qua i18n). */
  def: string;
  level: number;
  hp: number;
  mhp: number;
  cast?: TargetCast;
  /** Ấn thủ lĩnh đang mang (VS-2c): gói bit `packMarks`. Khác `marks` (vạch chuyển pha theo máu). */
  mk?: number;
  /** Thanh phá thế 0–1 (không có nếu boss không có thanh này). */
  posture?: number;
  /** Ngưỡng máu (0–1) chuyển pha, vẽ thành vạch trên thanh máu. */
  marks?: number[];
  /** Boss hai mặt (TN-3): đang quay mặt Âm (miễn sát thương) hay mặt Dương, và số giây (làm tròn lên) tới lần lật. */
  face?: { am: boolean; left: number };
}

/** Câu thoại ngắn của boss (letterbox không khóa điều khiển). `until` theo đồng hồ client (ms). */
export interface BossLine {
  id: number;
  name: string;
  text: string;
  until: number;
}

/** Thẻ chương (C2) cho sự kiện cá nhân; chữ lấy qua i18n `ui.chapter.<kind>.*`. `until` theo đồng hồ client (ms). */
export interface ChapterCard {
  id: number;
  kind: string;
  until: number;
  /** Thời lượng (ms) để CSS mờ dần đúng nhịp. */
  dur: number;
}

/** Cảnh mở đầu (P2-B1) đang chạy: HUD ẩn, letterbox dày, một câu thoại. `out` = đang rút letterbox sau khi hết cảnh. */
interface CineState {
  id: number;
  /** 'sect' (mặc định): cảnh mở đầu. 'boss': boss xuất hiện (tên, danh hiệu, thoại). 'phase': chuyển pha (thoại). */
  kind?: 'sect' | 'boss' | 'phase' | 'dan';
  name?: string;
  title?: string;
  text?: string;
  /** Thời lượng cảnh (ms) để CSS dàn nhịp câu thoại. */
  dur: number;
  out: boolean;
}

export interface TargetCast {
  kind: 'chant' | 'stun' | 'broken';
  end: number;
  total: number;
  open: number;
}

/** Kênh của một dòng chat/log (U2-7b): tab Tất cả hiện mọi kênh. */
export type ChatChannel = 'world' | 'party' | 'system' | 'combat';
export type ChatTab = 'all' | ChatChannel;
export const CHAT_TABS: readonly ChatTab[] = ['all', 'world', 'party', 'system', 'combat'];

interface LogLine {
  id: number;
  text: string;
  type: string;
  from?: string;
  ch: ChatChannel;
  /** Vật phẩm nhắc trong dòng (nhặt, nhận thưởng): tên (đã qua i18n) trong `text` được tô màu phẩm và bấm xem chú giải. */
  item?: { id: string; q?: number };
}

interface Toast {
  id: number;
  text: string;
  type: string;
}

/** Số liệu cho bảng gỡ lỗi F3; engine chỉ điền khi bảng đang mở. */
export interface DebugInfo {
  /** Mã phím đang giữ theo engine (KeyboardEvent.code). */
  keys: string[];
  /** Khóa i18n của các trạng thái đang bật (ui.debug.st.*). */
  states: string[];
  /** Tốc độ ngang, m/giây. */
  speed: number;
  /** Cửa sổ có focus (document.hasFocus()). */
  focus: boolean;
  visible: boolean;
  /** Thẻ phần tử đang focus, ví dụ 'CANVAS', 'INPUT', 'BODY'. */
  active: string;
  pointerLock: boolean;
  controls: string;
  /** 8 sự kiện phím gần nhất, cũ trước mới sau; `ago` tính bằng ms. */
  events: { id: number; kind: 'down' | 'up' | 'clear'; code: string; ago: number }[];
  /** Ping ước tính (ms), 0 nếu chưa đo được. */
  ping: number;
  room: string;
  roomId: string;
  sid: string;
  perf: DebugPerf;
}

/** Số đo hiệu năng trong bảng F3: trung bình trên khoảng lấy mẫu gần nhất (~100 ms), draw call/tam giác của khung vừa vẽ (mọi pass). */
export interface DebugPerf {
  backend: string;
  /** Adapter WebGPU, lỗi GPU gần nhất, số đo khung trơn (chẩn đoán cảnh đen). */
  gpu: string;
  fps: number;
  /** CPU của `Game.frame()` (ms): trung bình và lớn nhất trong khoảng lấy mẫu. */
  cpuMs: number;
  cpuMaxMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  players: number;
  monsters: number;
  npcs: number;
  /** Số thực thể đang vẽ ở từng mức LOD và số ngoài khung nhìn. */
  lod: number[];
  offscreen: number;
  /** Lưới hiệu ứng đang sống trong pool VFX. */
  fxMeshes: number;
  particles: number;
  particleLimit: number;
  tiles: number;
}

/** Truyền Tống Trận của mình (S.TELE). `until`/`cdUntil` đã đổi sang đồng hồ `performance.now()` của client. */
interface TeleState {
  open: string[];
  cast: { id: string; until: number } | null;
  cdUntil: number;
}

/** Thần thức của mình (S.SPIRIT_STATE). Thời gian đổi sang đồng hồ `performance.now()` của client. */
/** Nguyên anh xuất khiếu (E3-K): thời gian theo đồng hồ client (performance.now). */
interface SoulState {
  open: boolean;
  /** 0 không, 1 thám thính, 2 vừa thoát ra khi tử vong. */
  k: 0 | 1 | 2;
  /** Hết dạng nguyên anh lúc này (0 = không). */
  until: number;
  /** Thân xác. */
  bx: number;
  by: number;
  bz: number;
  /** Nơi nguyên anh bay về khi tử vong. */
  to: { x: number; z: number } | null;
  cdUntil: number;
  deathCdUntil: number;
}

export interface SpiritState {
  open: boolean;
  /** Quét xong lúc này (0 = không đang quét). */
  chUntil: number;
  cdUntil: number;
  r: number;
}

/** Kết quả quét gần nhất (S.SPIRIT_SCAN): hiện tới `until` (performance.now). */
export interface SpiritScan {
  x: number;
  z: number;
  r: number;
  at: number;
  until: number;
  hits: SpiritHit[];
}

export type Panel = WinId;
export type Phase = 'login' | 'connecting' | 'loading' | 'game' | 'error';

interface UIState {
  phase: Phase;
  error: string;
  needName: boolean;
  nameError: string;
  room: string;
  /** Level đang hiển thị (E1-D): minimap và bản đồ lớn theo level này. */
  level: string;
  dev: boolean;
  char: CharView | null;
  inv: InvSlot[];
  equip: Equipment;
  /** Tủ ngoại trang của mình (`S.WARDROBE`): món đã mở khóa và lựa chọn đang áp dụng. */
  wardrobe: WardrobeMsg;
  quests: QuestView;
  hp: number;
  mhp: number;
  mp: number;
  mmp: number;
  flags: number;
  target: TargetInfo | null;
  boss: BossInfo | null;
  log: LogLine[];
  toasts: Toast[];
  /** id skill → thời điểm (đồng hồ client, ms) dùng lại được. */
  cds: Record<string, number>;
  /** Giờ hồi sinh tinh anh/boss toàn bản đồ (M-2): `at` là giờ server, `off` = Date.now() − now để quy đổi sang đồng hồ máy. Minimap đọc. */
  bossTimers: (BossTimerMsg & { off: number }) | null;
  /** Chiêu đang được cường hóa → lúc hết hạn (đồng hồ client, ms): ô chiêu sáng viền (K-2). */
  empowered: Record<string, number>;
  gcdAt: number;
  castEnd: number;
  castTotal: number;
  tribEnd: number;
  /** Tiến độ ngưng đan 0..100 của Đan Trận (E2-D); -1 = không có vòng. */
  danPg: number;
  /** Tâm cảnh 0..100 trong pha tâm ma của Tam Trọng Kiếp (E3-L); -1 = không có. */
  tamCanh: number;
  /** Mốc (ms) nguyên anh quay về thân khi đang xuất khiếu; 0 = không. */
  soulUntil: number;
  /** Thiên Nhân Kiếp (E4-D): tia ngũ hành đang báo (chỉ số hành, mốc nổ) và mốc thế thân thần niệm tan; chỉ là lớp hình. */
  nguHanh: { e: number; at: number } | null;
  /** Trấn Giới Bia sáng của Nhật Thực Kiếp (mặt nạ bit 0..4); -1 = không trong kiếp này. */
  steles: number;
  /**
   * Thiên Nhân Ngũ Suy (TN-4): thanh suy khí của ải đang chạy (`id` = cơ chế `suy_*`, `mode`/`until` = nhịp tĩnh/phá vọng hoặc điều tức),
   * mốc ngưng thần hồi xong, mốc đợt lôi ẩn đang tụ sẽ nổ, mặt nạ Thọ Đăng đang cháy. Chỉ là lớp hình, luật ở server.
   */
  suy: { id: string; pg: number; mode: number; until: number } | null;
  suyCdUntil: number;
  suyWaveUntil: number;
  suyLamps: number;
  /** Huyền Kiếp (TN-6): dấu `hkmark` gần nhất của chính mình cần cho dòng nhắc (loại, trạng thái `pg`, số `n`/`lv`, mốc hết hạn, cửa sổ `r`). Chỉ là lớp hình. */
  hkMark: { s: string; pg: number; n: number; lv: number; until: number; r: number } | null;
  cloneUntil: number;
  /** Kiếp đang độ (id trong `tribulations.json`) để HUD đọc pha. */
  tribId: string;
  bossLine: BossLine | null;
  chapter: ChapterCard | null;
  cine: CineState | null;
  /** Cửa sổ đang mở (TD-B): nhiều cái cùng lúc, `z` lớn nhất nằm trên cùng. */
  windows: WinState[];
  npc: string | null;
  hint: string;
  x: number;
  y: number;
  z: number;
  /** Mình đang ngự kiếm hoặc lơ lửng (khớp luật `airborne()` của server): thanh chiêu xám. */
  airborne: boolean;
  zone: string;
  fps: number;
  perf: string;
  autoAttack: boolean;
  wantFly: boolean;
  chatOpen: boolean;
  quality: string;
  /** Khóa preset: không tự hạ khi nghẽn. */
  qualityLock: boolean;
  /** Preset gợi ý theo GPU (null tới khi đọc xong adapter, hoặc khi bằng mức hiện tại). */
  qualityHint: string | null;
  qualityHintSeen: boolean;
  camShake: boolean;
  /** Chất lượng hiệu ứng chiêu và khựng hình (VFX-V0). */
  fxQuality: 'low' | 'medium' | 'high';
  hitStop: boolean;
  /** Hào quang cảnh giới trên nhân vật (RFX-1). */
  auraMode: AuraMode;
  auraOthers: AuraOthers;
  auraCombat: AuraCombat;
  /** Thẻ chương (C2) bật/tắt trong Cài đặt. */
  chapterCards: boolean;
  /** HUD U2-2: kiểu cụm kỹ năng ('arc' cung góc phải dưới | 'bar' thanh ngang giữa dưới), lưu `dtl.skillLayout`. */
  skillLayout: 'arc' | 'bar';
  /** Theo dõi nhiệm vụ / chat thu gọn (lưu `dtl.questCollapsed`, `dtl.chatCollapsed`). */
  questCollapsed: boolean;
  chatCollapsed: boolean;
  /** Tab chat đang xem (lưu `dtl.chatTab`) và kích thước người chơi kéo (đơn vị thiết kế, lưu `dtl.chatSize`; null = mặc định theo cỡ màn hình). */
  chatTab: ChatTab;
  chatSize: { w: number; h: number } | null;
  /** Chỉ báo ngoài màn hình (M4-15) bật/tắt trong Cài đặt. */
  offscreen: boolean;
  /** Nhiệm vụ đang theo dõi (chỉ báo ngoài màn hình trỏ tới đích của nó); '' = nhiệm vụ đầu tiên trong danh sách. */
  trackQuest: string;
  /** Kiểu điều khiển: 'mouse' (nhìn bằng chuột kiểu FPS), 'turn' (A/D xoay) hoặc 'strafe' (kéo chuột). */
  controls: string;
  /** Con trỏ đang bị khóa để nhìn bằng chuột. */
  mouseLook: boolean;
  /** Ô chiêu đang chờ hết GCD để gửi (M1-11), -1 nếu không có. */
  queuedSkill: number;
  /** Công pháp: cấp chiêu, biến thức, kiếm ý/thế, vòng sạc (server gửi). null = chưa nhận. */
  method: MethodMsg | null;
  /** Lệch đồng hồ client − server (ms) lúc nhận `method`, để đổi `guardUntil` sang giờ client. */
  methodOff: number;
  /** Thẻ ngắn 0,6 giây khi mình tung chiêu tối thượng (tên chiêu, màu); `until` theo đồng hồ client. */
  ultCard: { id: number; skill: string; color: string; until: number } | null;
  /** Tổ đội của mình (P3-9); null = không có. */
  party: PartyMsg | null;
  tele: TeleState;
  spirit: SpiritState;
  soul: SoulState;
  /** Phân thân thần niệm (E4-K): mở từ Hóa Thần; mốc tan và mốc tạo lại được (ms đồng hồ client). */
  clone: { open: boolean; until: number; cdUntil: number };
  /** Kết quả quét thần thức đang hiện (E2-E); null = không. */
  spiritScan: SpiritScan | null;
  /** Điểm đánh dấu mình và đồng đội đang thấy (S.MARK). */
  marks: MarkInfo[];
  /** Lời mời tổ đội/tỉ thí đang chờ; `until` theo đồng hồ client (ms). */
  invites: InviteMsg[];
  /** Trận tỉ thí của mình; `at` theo đồng hồ client (ms). */
  duel: DuelMsg | null;
  /** Đạo hữu đang thấy trong room (không gồm mình), để mời tổ đội/tỉ thí. */
  nearby: { name: string; lv: number }[];
  /** Bảng gỡ lỗi F3 đang mở. */
  debugOpen: boolean;
  debug: DebugInfo | null;
  /** Được mở bảng F3 và dùng nút test (bản dev hoặc URL có `?debug`). */
  debugAllowed: boolean;
  /** Đang vẽ khung va chạm (chỉ hiển thị ở client). */
  debugColliders: boolean;
}

export const useUI = create<UIState>(() => ({
  phase: 'login',
  error: '',
  needName: false,
  nameError: '',
  room: '',
  level: 'van_lam',
  dev: false,
  char: null,
  inv: [],
  equip: {},
  wardrobe: { owned: [], look: { over: {} } },
  quests: { active: {}, done: [] },
  hp: 1,
  mhp: 1,
  mp: 0,
  mmp: 0,
  flags: 0,
  target: null,
  boss: null,
  log: [],
  toasts: [],
  cds: {},
  bossTimers: null,
  empowered: {},
  gcdAt: 0,
  castEnd: 0,
  castTotal: 0,
  tribEnd: 0,
  danPg: -1,
  tamCanh: -1,
  soulUntil: 0,
  nguHanh: null,
  steles: -1,
  cloneUntil: 0,
  tribId: 'truc_co',
  suy: null,
  suyCdUntil: 0,
  suyWaveUntil: 0,
  suyLamps: -1,
  hkMark: null,
  bossLine: null,
  chapter: null,
  cine: null,
  windows: [],
  npc: null,
  hint: '',
  x: 0,
  y: 0,
  z: 0,
  airborne: false,
  zone: '',
  fps: 0,
  perf: '',
  autoAttack: false,
  wantFly: false,
  chatOpen: false,
  quality: isQuality(localStorage.getItem('dtl.quality')) ? (localStorage.getItem('dtl.quality') as string) : 'medium',
  qualityLock: localStorage.getItem('dtl.qualityLock') === '1',
  qualityHint: null,
  qualityHintSeen: localStorage.getItem('dtl.qualityHintSeen') === '1',
  camShake: localStorage.getItem('dtl.camShake') !== '0',
  fxQuality: fxQuality(),
  hitStop: hitStopOn(),
  auraMode: auraModeOf(),
  auraOthers: auraOthersOf(),
  auraCombat: auraCombatOf(),
  offscreen: localStorage.getItem('dtl.offscreen') !== '0',
  chapterCards: localStorage.getItem('dtl.chapterCards') !== '0',
  skillLayout: localStorage.getItem('dtl.skillLayout') === 'bar' ? 'bar' : 'arc',
  questCollapsed: localStorage.getItem('dtl.questCollapsed') === '1',
  chatCollapsed: localStorage.getItem('dtl.chatCollapsed') === '1',
  chatTab: readChatTab(),
  chatSize: readChatSize(),
  trackQuest: localStorage.getItem('dtl.trackQuest') ?? '',
  controls: ['turn', 'strafe'].includes(localStorage.getItem('dtl.controls') ?? '')
    ? (localStorage.getItem('dtl.controls') as string)
    : 'mouse',
  mouseLook: false,
  queuedSkill: -1,
  method: null,
  methodOff: 0,
  ultCard: null,
  party: null,
  tele: { open: [], cast: null, cdUntil: 0 },
  spirit: { open: false, chUntil: 0, cdUntil: 0, r: 60 },
  soul: { open: false, k: 0, until: 0, bx: 0, by: 0, bz: 0, to: null, cdUntil: 0, deathCdUntil: 0 },
  clone: { open: false, until: 0, cdUntil: 0 },
  spiritScan: null,
  marks: [],
  invites: [],
  duel: null,
  nearby: [],
  debugOpen: false,
  debug: null,
  debugAllowed: false,
  debugColliders: false,
}));

let nextId = 1;

let lastLog = '';
let lastLogAt = 0;

/** Kênh mặc định của một dòng: chat người chơi theo `type`, còn lại là tin hệ thống. */
function channelOf(type: string): ChatChannel {
  return type === 'chat' ? 'world' : type === 'party' ? 'party' : 'system';
}

export function pushLog(text: string, type = 'info', from?: string, extra?: { ch?: ChatChannel; item?: { id: string; q?: number } }): void {
  // Gộp thông báo hệ thống lặp liên tiếp (ví dụ bấm chiêu khi chưa hồi): cùng nội dung trong 2 giây chỉ ghi một dòng.
  const now = Date.now();
  if (!from && text === lastLog && now - lastLogAt < 2000) return;
  lastLog = from ? '' : text;
  lastLogAt = now;
  useUI.setState((s) => {
    const log = s.log.length > 120 ? s.log.slice(-90) : s.log.slice();
    log.push({ id: nextId++, text, type, from, ch: extra?.ch ?? channelOf(type), item: extra?.item });
    return { log };
  });
}

let lastToast = '';
let lastToastAt = 0;

export function pushToast(text: string, type = 'info'): void {
  // Không lặp lại cùng một thông báo liên tiếp.
  const now = Date.now();
  if (text === lastToast && now - lastToastAt < 2000) return;
  lastToast = text;
  lastToastAt = now;
  const id = nextId++;
  useUI.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, type }] }));
  setTimeout(() => useUI.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3200);
}

/** Mở một cửa sổ (đã mở thì đưa lên trên). Mở cửa sổ tắt hội thoại NPC như trước. */
export function openPanel(p: Panel): void {
  useUI.setState((s) => ({ windows: openWindow(s.windows, p, viewportFor(p), loadSavedPos(p)).list, npc: null }));
}

export function closePanel(p: Panel): void {
  useUI.setState((s) => (s.windows.some((w) => w.id === p) ? { windows: closeWindow(s.windows, p) } : s));
}

/** Đóng cửa sổ trên cùng (Esc). Trả true nếu có cái để đóng. */
export function closeTopPanel(): boolean {
  const top = topWindow(useUI.getState().windows);
  if (!top) return false;
  closePanel(top.id);
  return true;
}

export function togglePanel(p: Panel): void {
  if (useUI.getState().windows.some((w) => w.id === p)) closePanel(p);
  else openPanel(p);
}

export function focusPanel(p: Panel): void {
  useUI.setState((s) =>
    s.windows.some((w) => w.id === p) && topWindow(s.windows)?.id !== p ? { windows: focusWindow(s.windows, p).list } : s,
  );
}

/** Kéo cửa sổ tới (x, y) theo đơn vị thiết kế; `save` ghi nhớ vị trí (thả chuột). */
export function movePanel(p: Panel, x: number, y: number, save = false): void {
  const vp = viewportFor(p);
  useUI.setState((s) => ({ windows: moveWindow(s.windows, p, x, y, vp) }));
  if (save) {
    const w = useUI.getState().windows.find((o) => o.id === p);
    if (w) savePos(p, w.x, w.y);
  }
}

/** Bản đồ lớn tự tính tọa độ chuột theo px màn hình nên không phóng (xem panels.css). */
export function panelScale(p: Panel): number {
  return p === 'map' ? 1 : uiScale() || 1;
}

function viewportFor(p: Panel): Viewport {
  const k = panelScale(p);
  return { vw: window.innerWidth / k, vh: window.innerHeight / k };
}

// Đổi cỡ cửa sổ trình duyệt: co các bảng đang mở vào khung nhìn mới (UI-5, 1366×768 không bị tràn mép).
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    // Chờ `--ui-scale` cập nhật xong (uiScale.ts cũng nghe resize) rồi mới tính lại.
    requestAnimationFrame(() =>
      useUI.setState((s) => {
        if (!s.windows.length) return s;
        const next = fitWindows(s.windows, viewportFor);
        return next === s.windows ? s : { windows: next };
      }),
    );
  });
}

// Mở/đóng bảng hay hội thoại NPC (bằng phím, nút hay nút đóng): tiếng giở/gấp sách.
useUI.subscribe((s, prev) => {
  // Hội thoại NPC: hạ nhạc nền suốt lúc nói chuyện (D2).
  if (!!s.npc !== !!prev.npc) duckHold('npc', s.npc ? 0.35 : 0);
  const now = s.windows.length ? 'w' : s.npc;
  const was = prev.windows.length ? 'w' : prev.npc;
  if (now === was) return;
  if (now) sfx('ui_open', 0.8);
  else sfx('ui_close', 0.8);
});

export function setTrackQuest(id: string): void {
  if (id) localStorage.setItem('dtl.trackQuest', id);
  else localStorage.removeItem('dtl.trackQuest');
  useUI.setState({ trackQuest: id });
}

export const set = useUI.setState;
export const get = useUI.getState;

function readChatTab(): ChatTab {
  const v = localStorage.getItem('dtl.chatTab');
  return CHAT_TABS.includes(v as ChatTab) ? (v as ChatTab) : 'all';
}
function readChatSize(): { w: number; h: number } | null {
  try {
    const o = JSON.parse(localStorage.getItem('dtl.chatSize') ?? 'null') as { w?: unknown; h?: unknown } | null;
    return o && typeof o.w === 'number' && typeof o.h === 'number' ? { w: o.w, h: o.h } : null;
  } catch {
    return null;
  }
}

/** Đổi tab chat và nhớ. */
export function setChatTab(tab: ChatTab): void {
  localStorage.setItem('dtl.chatTab', tab);
  set({ chatTab: tab });
}

/** Lưu kích thước chat người chơi kéo (null = về mặc định). */
export function setChatSize(size: { w: number; h: number } | null): void {
  if (size) localStorage.setItem('dtl.chatSize', JSON.stringify(size));
  else localStorage.removeItem('dtl.chatSize');
  set({ chatSize: size });
}

/** Lưu và áp một tùy chọn bố cục HUD (U2-2). */
export function setHudPref<K extends 'skillLayout' | 'questCollapsed' | 'chatCollapsed'>(key: K, value: UIState[K]): void {
  localStorage.setItem('dtl.' + key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  set({ [key]: value } as Pick<UIState, K>);
}
