import { create } from 'zustand';
import type { BossTimerMsg, CharView, DuelMsg, Equipment, InviteMsg, InvSlot, MethodMsg, PartyMsg, QuestView } from '@dtl/shared';
import { duckHold, sfx } from '../game/audio';

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
  /** Thanh phá thế 0–1 (không có nếu boss không có thanh này). */
  posture?: number;
  /** Ngưỡng máu (0–1) chuyển pha, vẽ thành vạch trên thanh máu. */
  marks?: number[];
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
export interface CineState {
  id: number;
  /** 'sect' (mặc định): cảnh mở đầu. 'boss': boss xuất hiện (tên, danh hiệu, thoại). 'phase': chuyển pha (thoại). */
  kind?: 'sect' | 'boss' | 'phase';
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

export interface LogLine {
  id: number;
  text: string;
  type: string;
  from?: string;
}

export interface Toast {
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
}

export type Panel = null | 'bag' | 'char' | 'quests' | 'help' | 'settings' | 'map' | 'method' | 'party';
export type Phase = 'login' | 'connecting' | 'loading' | 'game' | 'error';

export interface UIState {
  phase: Phase;
  error: string;
  needName: boolean;
  nameError: string;
  room: string;
  dev: boolean;
  char: CharView | null;
  inv: InvSlot[];
  equip: Equipment;
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
  bossLine: BossLine | null;
  chapter: ChapterCard | null;
  cine: CineState | null;
  panel: Panel;
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
  camShake: boolean;
  /** Thẻ chương (C2) bật/tắt trong Cài đặt. */
  chapterCards: boolean;
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
  /** Lời mời tổ đội/tỉ thí đang chờ; `until` theo đồng hồ client (ms). */
  invites: InviteMsg[];
  /** Trận tỉ thí của mình; `at` theo đồng hồ client (ms). */
  duel: DuelMsg | null;
  /** Đạo hữu đang thấy trong room (không gồm mình), để mời tổ đội/tỉ thí. */
  nearby: { name: string; lv: number }[];
  /** Bảng gỡ lỗi F3 đang mở. */
  debugOpen: boolean;
  debug: DebugInfo | null;
}

export const useUI = create<UIState>(() => ({
  phase: 'login',
  error: '',
  needName: false,
  nameError: '',
  room: '',
  dev: false,
  char: null,
  inv: [],
  equip: {},
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
  bossLine: null,
  chapter: null,
  cine: null,
  panel: null,
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
  quality: localStorage.getItem('dtl.quality') ?? 'medium',
  camShake: localStorage.getItem('dtl.camShake') !== '0',
  offscreen: localStorage.getItem('dtl.offscreen') !== '0',
  chapterCards: localStorage.getItem('dtl.chapterCards') !== '0',
  trackQuest: localStorage.getItem('dtl.trackQuest') ?? '',
  controls: ['turn', 'strafe'].includes(localStorage.getItem('dtl.controls') ?? '') ? (localStorage.getItem('dtl.controls') as string) : 'mouse',
  mouseLook: false,
  queuedSkill: -1,
  method: null,
  methodOff: 0,
  ultCard: null,
  party: null,
  invites: [],
  duel: null,
  nearby: [],
  debugOpen: false,
  debug: null,
}));

let nextId = 1;

let lastLog = '';
let lastLogAt = 0;

export function pushLog(text: string, type = 'info', from?: string): void {
  // Gộp thông báo hệ thống lặp liên tiếp (ví dụ bấm chiêu khi chưa hồi): cùng nội dung trong 2 giây chỉ ghi một dòng.
  const now = Date.now();
  if (!from && text === lastLog && now - lastLogAt < 2000) return;
  lastLog = from ? '' : text;
  lastLogAt = now;
  useUI.setState((s) => {
    const log = s.log.length > 120 ? s.log.slice(-90) : s.log.slice();
    log.push({ id: nextId++, text, type, from });
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

export function togglePanel(p: Panel): void {
  useUI.setState((s) => ({ panel: s.panel === p ? null : p, npc: null }));
}

// Mở/đóng bảng hay hội thoại NPC (bằng phím, nút hay nút đóng): tiếng giở/gấp sách.
useUI.subscribe((s, prev) => {
  // Hội thoại NPC: hạ nhạc nền suốt lúc nói chuyện (D2).
  if (!!s.npc !== !!prev.npc) duckHold('npc', s.npc ? 0.35 : 0);
  const now = s.panel ?? s.npc;
  const was = prev.panel ?? prev.npc;
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
