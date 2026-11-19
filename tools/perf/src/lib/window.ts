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

/** `window.__game`: phần ổn định có kiểu; phần ruột engine mà bench cố ý bọc/đọc (renderer, vfx, monFx…) để `any`. */
export interface GameDebug {
  frames: number;
  sid: string;
  camYaw: number;
  camPitch: number;
  camDist: number;
  camDistCur: number;
  freeCam: { x: number; y: number; z: number; tx: number; ty: number; tz: number; fov?: number } | null;
  shownLevel: string;
  cur: Vec & { yaw: number };
  renderPos: Vec;
  view: { level?: string; monsters: Map<string, MonView> };
  skillLog: { at: number; e: { kind: string } }[];
  hazardLog?: HazardLog[];
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
    __viewer?: ViewerDebug;
    gc?: () => void;
  }
  interface Performance {
    memory?: { usedJSHeapSize: number };
  }
}
