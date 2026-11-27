// Kiểu cho các đối tượng gỡ lỗi client gắn lên `window` ở bản dev (`__game`: apps/client/src/game/engine.ts,
// `__viewer`: apps/client/src/viewer/scene.ts). Khai báo một lần ở đây để mã chạy trong `page.evaluate` gọi
// thẳng `window.__game` có kiểu, không ép `as unknown as` ở từng công cụ. Chỉ mô tả phần công cụ dùng; không
// import từ apps/client (công cụ không phụ thuộc mã nguồn client).

/** Bản ghi quái trong `view.monsters` (`st` 4 = đã chết; `mf` cờ MF_*; `t` id loại quái). */
export interface MonView {
  t: string;
  st: number;
  mf: number;
  hp: number;
  mhp: number;
  x: number;
  z: number;
}

export interface GameInfo {
  backend: 'WebGPU' | 'WebGL2';
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  frames: number;
  room: string;
  /** Vị trí nhân vật mình (toạ độ thế giới). */
  x: number;
  y: number;
  z: number;
  hp: number;
}

export interface HazardLog {
  mv?: string;
  sh: string;
  r?: number;
  w?: number;
  delay?: number;
}

/** Vector3 của three: công cụ đọc x/y/z, bench còn gọi clone()/add()/copy(). */
type Vec = { x: number; y: number; z: number; [method: string]: any };

/** `window.__vfxlab`: điều khiển thời gian và đồng hồ ngân sách của phòng thử VFX. */
export interface VfxLabDebug {
  cast(skill: string): boolean;
  castMon(mon: string, mv: string): boolean;
  monLab(on: boolean): void;
  tags(show: boolean): void;
  pause(on: boolean): void;
  scale(x: number): void;
  step(ms: number): void;
  budget(): {
    drawCalls: number;
    triangles: number;
    fxLive: number;
    particles: number;
    particleBudget: number;
    screenCover: number;
    overdraw: number;
  };
  evictSprites(): string[];
  residentSprites(): string[];
  skills(): string[];
}

/** `window.__animlab`: phòng thử animation Thân Pháp (apps/client/src/game/debug/animLab.ts). */
export interface AnimLabDebug {
  pause(on: boolean): void;
  scale(x: number): void;
  step(ms: number): void;
  cam(kind: 'iso' | 'close' | 'front' | 'side'): void;
  perform(pose: string): boolean;
  clock(): { t: number; skill: string } | null;
  poseInfo(pose: string): { duration: number; hit: number[] } | null;
  moments(pose: string): { name: string; at: number }[];
  poseOfSkill(skillId: string): string | null;
  cpu(): { section: string; avg: number; max: number }[];
  fx(flags: {
    exaggerate?: boolean;
    bounce?: boolean;
    poses?: boolean;
    smear?: boolean;
    spring?: boolean;
    loco?: boolean;
    idle?: boolean;
    cutin?: boolean;
    impulse?: boolean;
    ragdoll?: boolean;
    patch?: boolean;
    patchLoop?: boolean;
    pivot?: boolean;
  }): {
    exaggerate: boolean;
    bounce: boolean;
    poses: boolean;
    smear: boolean;
    spring: boolean;
    loco: boolean;
    idle: boolean;
    cutin: boolean;
    impulse: boolean;
    ragdoll: boolean;
    patch: boolean;
  };
  poses(): string[];
  hitSelf(from: 'front' | 'back' | 'left' | 'right', tier: number, knock?: boolean): boolean;
  hitMon(from: 'front' | 'back' | 'left' | 'right', tier: number, knock?: boolean): { x: number; y: number } | null;
  hitReal(tier: number): { x: number; y: number } | null;
  probeMon(): { x: number; y: number } | null;
  scr(): { self: { x: number; y: number } | null; other: { x: number; y: number } | null; mon: { x: number; y: number } | null };
  hitOther(tier: number): boolean;
  knockState(): {
    other: { knock: boolean; speed: number; state: string } | null;
    mon: { knock: boolean; speed: number; state: string } | null;
  };
  hideVfx(on: boolean): void;
  ultOnMon(): boolean;
  monFacingErr(): number | null;
  monTurn(): { deg: number; behind: { x: number; y: number } } | null;
  orderMon(kind: 'attack'): void;
  census(): { players: string[]; monsters: number; pending: boolean; otherSpeed: number | null };
  respawn(): void;
  cutin(skill: string, setKey?: string, g?: string): boolean;
  probe(): {
    root: [number, number, number];
    yaw: number;
    innerY: number;
    pelvis: [number, number, number];
    head: [number, number, number];
    feet: { x: number; y: number; z: number; g: number }[];
    ground: number;
  } | null;
}

/** `window.__game`: phần ổn định có kiểu; phần ruột engine mà bench cố ý bọc/đọc (renderer, vfx, monFx…) để `any`. */
export interface GameDebug {
  frames: number;
  sid: string;
  targetId: string;
  camYaw: number;
  camPitch: number;
  camDist: number;
  camDistCur: number;
  freeCam: { x: number; y: number; z: number; tx: number; ty: number; tz: number; fov?: number } | null;
  /** Vân Hải (MAP-3, `game/world/vanHaiWow.ts`): `freeze(giây)` giữ đồng hồ thuyền/cá để chụp ảnh; `group.children` để `--probe` liệt kê mesh. */
  vanHaiWow: {
    freeze(t: number | null): void;
    group: {
      children: {
        name: string;
        visible: boolean;
        position: Vec;
        geometry?: { attributes: { position: { count: number } } };
        count?: number;
      }[];
    };
  } | null;
  shownLevel: string;
  cur: Vec & { yaw: number };
  renderPos: Vec;
  view: { level?: string; monsters: Map<string, MonView> };
  skillLog: { at: number; e: { kind: string } }[];
  hazardLog?: HazardLog[];
  /** Nhật ký timeline đã phát của Thiên Nhân Ngũ Suy (bản dev, TN-4). */
  suyFx?: { log: { key: string; at: number }[]; live: number } | null;
  /** Dấu trên sân mới nhất của Thiên Nhân Ngũ Suy theo khóa `<loại>:<ô>` (bản dev, TN-4). */
  suyLog?: Record<
    string,
    { s: string; n: number; x: number; z: number; r: number; pg: number; lv: number; at: number; d?: number; ox?: number; oz?: number }
  >;
  gpuErrors?: string[];
  /** Bản ghi người chơi của schema; công cụ chỉ đọc vài trường. */
  me(): any;
  send(type: string, msg?: unknown): void;
  info(): GameInfo;
  bar(): { id: string }[];
  useSkill(i: number): void;
  useDash(): void;
  toggleFly(): void;
  clearTarget(): void;
  interact(): void;
  [internal: string]: any;
}

type Vec3 = { x: number; y: number; z: number; sub(v: Vec3): Vec3; multiplyScalar(k: number): Vec3; add(v: Vec3): Vec3 };

/** `window.__viewer`: trang xem asset (`?show=<id>`, `?show=boss`). */
export interface ViewerDebug {
  model?: unknown;
  clips: { name: string; duration: number }[];
  paused: boolean;
  playClip(i: number): void;
  seek(t: number): void;
  setView(v: string): void;
  setHuman(on: boolean): void;
  camera: { position: Vec3 };
  controls: { target: Vec3; autoRotate: boolean; update(): void };
}

declare global {
  interface Window {
    __game?: GameDebug;
    /** Phòng thử VFX (`?vfxlab=1`, apps/client/src/game/debug/vfxLab.ts). */
    __vfxlab?: VfxLabDebug;
    __animlab?: AnimLabDebug;
    __viewer?: ViewerDebug;
    gc?: () => void;
  }
  interface Performance {
    memory?: { usedJSHeapSize: number };
  }
}
