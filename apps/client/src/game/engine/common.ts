// R-8: tách từ game/engine.ts (hàm nhận `g: Game`, trước là phương thức private của lớp Game).
import * as THREE from 'three/webgpu';
import { type InitMsg, ROOM_DUNGEON, ROOM_TRIBULATION, ROOM_WORLD, TRIB_LEVEL } from '@dtl/shared';
import { knownLevel } from '../../base/levelCtx';
import { type Appearance } from '@dtl/shared';
import { METHOD_SKILLS, SKILLS } from '@dtl/content';
import { type Vec3 } from '../camera/cutscene';
import { type GroundLevel } from '../../render/materials/ground';
import { FLAGS } from '../../base/flags';

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
  if (room.startsWith(ROOM_TRIBULATION + '-')) {
    const tl = room.slice(ROOM_TRIBULATION.length + 1);
    return knownLevel(tl) ? tl : TRIB_LEVEL; // sân kiếp riêng (Nhật Thực Kiếp)
  }
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

export function isWebGPU(r: THREE.WebGPURenderer): boolean {
  return !!(r.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
}

/**
 * bloom/msaa/fxaa: post-processing (render/post.ts). maxPixels: ngân sách điểm ảnh nội bộ (hạ
 * pixelRatio trên màn hình lớn để giữ VRAM render target dưới ngân sách). heightFog: sương theo độ cao.
 */
/** Bán kính (m) lấy chấm quái cho bản đồ nhỏ (khung 520 m ⇒ ±260 m, chừa lề). */

/** Trần điểm ảnh nội bộ trên WebGL2 (mọi preset). */
export const WEBGL2_MAX_PIXELS = 4e6;
export const QUALITY: Record<
  string,
  {
    pixelRatio: number;
    maxPixels: number;
    shadows: boolean;
    bloom: boolean;
    msaa: number;
    fxaa: boolean;
    heightFog: boolean;
    ground: GroundLevel;
    ao: boolean;
    lights: boolean;
    radial: boolean;
  }
> = {
  low: {
    pixelRatio: 1,
    maxPixels: 2e6,
    shadows: false,
    bloom: false,
    msaa: 0,
    fxaa: false,
    heightFog: false,
    ground: 'low',
    ao: false,
    lights: false,
    radial: false,
  },
  medium: {
    pixelRatio: 1.5,
    maxPixels: 4e6,
    shadows: false,
    bloom: true,
    msaa: 0,
    fxaa: true,
    heightFog: true,
    ground: 'medium',
    ao: true,
    lights: false,
    radial: true,
  },
  high: {
    pixelRatio: 2,
    maxPixels: 8e6,
    shadows: true,
    bloom: true,
    msaa: 0,
    fxaa: true,
    heightFog: true,
    ground: 'high',
    ao: true,
    lights: true,
    radial: true,
  },
  // Cực cao: như Cao nhưng trần điểm ảnh 14M, bóng 4096² ±110 m (env.ts), nhiều hạt hơn; WebGL2 vẫn bị `WEBGL2_MAX_PIXELS`.
  ultra: {
    pixelRatio: 2,
    maxPixels: 14e6,
    shadows: true,
    bloom: true,
    msaa: 0,
    fxaa: true,
    heightFog: true,
    ground: 'high',
    ao: true,
    lights: true,
    radial: true,
  },
};

/** Hệ số đèn thật theo thời điểm: buổi sớm vừa phải, đêm đậm. */
export const LANTERN_LIGHT: Record<string, number> = {
  dawn: 1,
  day: 0.6,
  night: 1.8,
  ochre_dawn: 1,
  ochre: 0.6,
  ochre_night: 1.8,
  cloud_dawn: 1,
  cloud: 0.6,
  cloud_night: 1.8,
  tk_dawn: 1,
  tk: 0.6,
  tk_dusk: 1.3,
  tk_night: 1.8,
  kt: 1.2,
  lk_dawn: 1,
  lk_day: 0.6,
  lk_dusk: 1.3,
  lk_night: 1.8,
  dm_dawn: 1,
  dm_day: 0.6,
  dm_dusk: 1.3,
  dm_night: 1.8,
  vh_dawn: 1,
  vh_day: 0.6,
  vh_dusk: 1.3,
  vh_night: 1.8,
  ash_dawn: 1,
  rift: 1.2,
  rift_pit: 1.4,
  bh_dawn: 1,
  bh_day: 0.6,
  bh_dusk: 1.3,
  bh_night: 1.8,
  bhr_dawn: 1.2,
  bhr_day: 0.9,
  bhr_dusk: 1.4,
  bhr_night: 1.9,
};

/** Hiệu ứng của chính mình → nhạc ngắn trong manifest.music (tools/audio/compose/sting_*.mjs). */
export const STINGS: Record<string, string> = { levelup: 'sting_levelup', ascend: 'sting_breakthrough', death: 'sting_death' };
/** Lướt hiển thị xuất phát từ vị trí vẽ cách đây chừng này giây (K-4): trước lúc bấm lướt, trước khi gói vị trí mới của server tới. */
export const DASH_LOOKBACK = 0.3;
/** Đòn nặng của boss từ tỉ lệ này của máu tối đa trở lên thì hất người bị đánh ngã (chỉ hình). */
export const KNOCKDOWN_FRAC = 0.18;
export const _v = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
/** Chiêu theo id (sức mạnh, tối thượng, fx) cho cảm giác đòn K-7. */
export const SKILL_INFO = new Map([...SKILLS, ...METHOD_SKILLS].map((s) => [s.id, s]));
export const _shakePos = new THREE.Vector3();
export const _shakeLook = new THREE.Vector3();
export const _camFocus = new THREE.Vector3();
export const _cineEndP = new THREE.Vector3();
export const _cineEndL = new THREE.Vector3();
export const _cineFwd = new THREE.Vector3();
export const _cineP: Vec3 = { x: 0, y: 0, z: 0 };
export const _cineL: Vec3 = { x: 0, y: 0, z: 0 };

let reqCounter = 0;
/** Khóa chống gửi trùng cho các thao tác vật phẩm/tiền. */
export function reqId(): string {
  return Date.now().toString(36) + '-' + (reqCounter++).toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
}

/** Chỉ bản dev, để chụp ảnh đúng khung: `?slowmo=0.25` chậm thời gian hiển thị (đứng yên, không di chuyển). */
export const SLOWMO = import.meta.env.DEV ? FLAGS.slowmo : 1;

/** Chỉ bản dev, để chụp ảnh VFX chiêu: `?quiet=1` bỏ nháy trúng đòn và cầu nổ cú cắn trên chính mình (quái vẫn đánh, không đổi luật). */
export const QUIET = import.meta.env.DEV && FLAGS.quiet;

/** Chờ tối đa bao lâu (giây game) cho khung `hit` trước khi cứ thế phát (hoạt ảnh bị hủy, model khối cũ...). */
export const HIT_WAIT = 0.45;
/** Sát thương tới sau khung `hit` trong khoảng này vẫn dùng ngữ cảnh của đòn đó (giây). */
export const HIT_CTX_TTL = 0.6;
