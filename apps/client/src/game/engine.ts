import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
  IN_DOWN,
  IN_FLY,
  IN_JUMP,
  IN_UP,
  type InitMsg,
  type InvMsg,
  type MoveCtx,
  type MoveInput,
  type MoveState,
  MS_DEAD,
  PF_CASTING,
  PF_DEAD,
  PF_FLYING,
  PF_MEDITATING,
  PF_SHIELD,
  PF_TRIBULATION,
  PORTAL_POS,
  type QuestView,
  SECT,
  ROOM_WORLD,
  S,
  STEP,
  stepMove,
  type SysMsg,
  type TransferMsg,
} from '@dtl/shared';
import { MONSTER, monsterName, realmName, SKILLS, t } from '@dtl/content';
import { get, pushLog, pushToast, set, type TargetInfo, togglePanel, useUI } from '../ui/store';
import { type Sfx, setListener, sfx, unlockAudio } from './audio';
import { EntityManager, type PState, type WorldView } from './entities';
import { Environment } from './env';
import { MODEL_MAT } from './models';
import { buildPortalDisc, buildSect } from './sect';
import { renderMinimap, Terrain } from './terrain';
import { DamageNumbers, Vfx } from './vfx';

export interface LoginOptions {
  token?: string;
  dev?: string;
  name?: string;
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

const QUALITY: Record<string, { pixelRatio: number; shadows: boolean }> = {
  low: { pixelRatio: 1, shadows: false },
  medium: { pixelRatio: 1.5, shadows: false },
  high: { pixelRatio: 2, shadows: true },
};

/**
 * Phím bổ trợ hay nuốt sự kiện thả phím khác (Cmd/Ctrl). Cố ý không có Shift (hạ độ cao khi bay)
 * và Alt (phím chơi: thả/khóa con trỏ); Alt xử lý hẹp hơn trong `bindInput`.
 */
const STICKY_MODS = new Set(['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'OSLeft', 'OSRight']);
/** Cặp phím hướng ngược chiều. */
const OPPOSITE_KEY: Record<string, string> = {
  KeyW: 'KeyS', KeyS: 'KeyW', KeyA: 'KeyD', KeyD: 'KeyA',
  ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp', ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft',
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

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
        return await Game.client.joinOrCreate(roomName, { session: Game.session });
      } catch (e) {
        if ((e as { code?: number }).code !== 4014) throw e;
        Game.session = '';
      }
    }
    return Game.client.joinOrCreate(roomName, Game.lastLogin);
  }

  /** Đăng nhập và vào thế giới. Lỗi được đưa lên UI qua store. */
  static async connect(opts: LoginOptions): Promise<void> {
    set({ phase: 'connecting', error: '', nameError: '' });
    Game.lastLogin = opts;
    Game.session = '';
    try {
      Game.client = new Client(serverUrl());
      const room = await Game.client.joinOrCreate(ROOM_WORLD, opts);
      await Game.enter(room);
    } catch (e) {
      const err = e as { code?: number; message?: string };
      if (err.code === 4010) set({ phase: 'login', needName: true });
      else if (err.code === 4011) set({ phase: 'login', needName: true, nameError: t('ui.err.name_taken') });
      else if (err.code === 4012) set({ phase: 'error', error: t('ui.err.not_invited') });
      else if (err.code === 4013) set({ phase: 'error', error: t('ui.err.auth') });
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
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.3, 9000);
  terrain!: Terrain;
  env!: Environment;
  ents!: EntityManager;
  vfx!: Vfx;
  dmg!: DamageNumbers;
  minimap!: HTMLCanvasElement;
  private stage: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private portalDisc: THREE.Mesh | null = null;
  private exitDisc: THREE.Mesh | null = null;
  private sectMesh: THREE.Mesh | null = null;

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
  private keys = new Set<string>();
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
  private timeOffset = 0;

  private started = false;
  private startedAt = 0;
  private frames = 0;
  private hudAt = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lastT = performance.now();
  private disposed = false;
  private leaving = false;
  private debugPerf = new URLSearchParams(location.search).has('debug');
  private listeners: (() => void)[] = [];

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
      npc: null,
      tribEnd: 0,
      castEnd: 0,
    });
    this.targetId = '';
    this.autoAttack = false;
    this.pending.length = 0;
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
    this.snapToServer = true;
    this.dmg?.clear();
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
    room.onMessage(S.SYS, (m: SysMsg) => this.onSys(m));
    room.onMessage(S.FX, (m: FxMsg) => this.onFx(m));
    room.onMessage(S.DMG, (m: DmgMsg) => this.onDmg(m));
    room.onMessage(S.HAZARD, (m: HazardMsg) => {
      this.vfx?.hazard(m.x, m.z, m.r, m.delay, m.kind);
      const vol = this.volumeAt(m.x, m.z);
      setTimeout(() => sfx(m.kind === 'lightning' ? 'thunder' : 'slash', vol, m), m.delay * 1000);
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

  /** Thời gian từng bước khởi động (ms), để theo dõi thời gian tải. */
  loadStats: Record<string, number> = {};

  async start(): Promise<void> {
    const t0 = performance.now();
    const mark = (k: string) => {
      this.loadStats[k] = Math.round(performance.now() - t0);
    };
    const q = QUALITY[get().quality] ?? QUALITY.medium;
    const params = new URLSearchParams(location.search);
    this.renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.get('renderer') === 'webgl2' });
    await this.renderer.init();
    mark('rendererInit');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = q.shadows;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    this.canvas.tabIndex = 0;
    this.stage.appendChild(this.canvas);
    const layer = document.createElement('div');
    layer.className = 'dmg-layer';
    this.stage.appendChild(layer);
    this.dmg = new DamageNumbers(layer);

    this.env = new Environment(this.scene, q.shadows);
    mark('env');
    this.terrain = new Terrain();
    mark('terrainCoarse');
    this.terrain.shadows = q.shadows;
    this.scene.add(this.terrain.group);
    this.sectMesh = new THREE.Mesh(buildSect(), MODEL_MAT);
    this.sectMesh.castShadow = q.shadows;
    this.sectMesh.receiveShadow = q.shadows;
    this.sectMesh.frustumCulled = false;
    this.scene.add(this.sectMesh);
    mark('sect');
    this.portalDisc = buildPortalDisc(PORTAL_POS.x, PORTAL_POS.z, 0x8fdcff);
    this.exitDisc = buildPortalDisc(DUNGEON_EXIT.x, DUNGEON_EXIT.z, 0xffd27a);
    this.scene.add(this.portalDisc, this.exitDisc);
    this.vfx = new Vfx(this.scene);
    this.ents = new EntityManager(this.scene, this.sid, get().room === ROOM_WORLD ? 'van_lam' : 'kiem_trung');
    this.minimap = renderMinimap(320);
    mark('minimap');
    this.startedAt = t0;

    this.loadSectModel(q.shadows);
    this.bindInput();
    this.onResize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Nạp kiến trúc tông môn dựng bằng Blender; lỗi thì giữ bản dựng bằng code. */
  private async loadSectModel(shadows: boolean): Promise<void> {
    try {
      const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL;
      const gltf = await new GLTFLoader().loadAsync(base + 'assets/sect.glb');
      if (this.disposed) return;
      const mat = MODEL_MAT.clone();
      mat.side = THREE.DoubleSide;
      gltf.scene.position.set(SECT.x, SECT.y, SECT.z);
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = mat;
        m.castShadow = shadows;
        m.receiveShadow = shadows;
        m.frustumCulled = false;
      });
      this.scene.add(gltf.scene);
      if (this.sectMesh) {
        const old = this.sectMesh.geometry;
        this.sectMesh.geometry = buildSect(false);
        old.dispose();
      }
    } catch (e) {
      console.warn('[asset] không tải được sect.glb, dùng kiến trúc dựng bằng code:', e);
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
    // Chống kẹt phím: sự kiện thả phím hay mất khi giữ Cmd/Ctrl hoặc chuyển cửa sổ,
    // nên xóa sạch tập phím ở những lúc đó. Không tính Shift (hạ độ cao khi bay).
    // Alt là phím chơi (thả/khóa con trỏ): chạm Alt không xóa phím; chỉ xóa khi thả Alt
    // sau một tổ hợp Alt+phím khác, lúc phím kia có thể đã mất sự kiện thả.
    // Alt+Tab ra cửa sổ khác đã có blur/visibilitychange lo.
    const clearKeys = (): void => this.keys.clear();
    const isAlt = (code: string): boolean => code === 'AltLeft' || code === 'AltRight';
    let altChord = false;
    this.on(window, 'blur', clearKeys);
    this.on(window, 'focus', clearKeys);
    this.on(document as unknown as HTMLElement, 'visibilitychange', clearKeys);
    this.on(window, 'keydown', (e: KeyboardEvent) => {
      if (STICKY_MODS.has(e.code)) clearKeys();
      else if (isAlt(e.code)) {
        if (!e.repeat) altChord = false;
      } else if (e.altKey && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') altChord = true;
      this.onKeyDown(e);
    });
    this.on(window, 'keyup', (e: KeyboardEvent) => {
      if (STICKY_MODS.has(e.code)) clearKeys();
      else {
        if (isAlt(e.code)) {
          if (altChord) clearKeys();
          altChord = false;
        }
        this.keys.delete(e.code);
      }
    });
    const c = this.canvas;
    this.on(c, 'contextmenu', (e: Event) => e.preventDefault());
    this.on(c, 'pointerdown', (e: PointerEvent) => {
      unlockAudio();
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
      this.camDist = Math.max(3, Math.min(70, this.camDist * (e.deltaY > 0 ? 1.12 : 0.89)));
    }, { passive: false });
  }

  /** Xoay camera theo độ dịch chuột (điểm ảnh). */
  mouseLook(dx: number, dy: number): void {
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
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private onKeyDown(e: KeyboardEvent): void {
    unlockAudio();
    if (get().phase !== 'game') return;
    if (this.typing()) return;
    const code = e.code;
    if (code === 'Tab') {
      e.preventDefault();
      const id = this.ents.nextTarget(this.targetId, this.cur.x, this.cur.z);
      if (id) this.setTarget(id, 'mon');
      return;
    }
    if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    // Nhấn một hướng thì bỏ hướng ngược lại (phòng phím kia đã mất sự kiện thả).
    // Đánh đổi có chủ ý: giữ W, chạm S rồi thả thì nhân vật dừng, phải nhấn lại W. Không khôi phục W
    // khi thả S, vì nếu W chính là phím đã mất keyup thì khôi phục sẽ làm kẹt lại.
    const opp = OPPOSITE_KEY[code];
    if (opp) this.keys.delete(opp);
    this.keys.add(code);
    if (code.startsWith('Digit')) {
      const i = Number(code.slice(5)) - 1;
      if (i >= 0 && i < SKILLS.length) this.useSkill(i);
      return;
    }
    switch (code) {
      case 'KeyF':
        this.toggleFly();
        break;
      case 'KeyZ':
        this.toggleMeditate();
        break;
      case 'KeyE':
        this.interact();
        break;
      case 'KeyR':
        this.autorun = !this.autorun;
        break;
      case 'KeyB':
      case 'KeyI':
        togglePanel('bag');
        break;
      case 'KeyC':
        togglePanel('char');
        break;
      case 'KeyL':
      case 'KeyJ':
        togglePanel('quests');
        break;
      case 'KeyM':
        togglePanel('map');
        break;
      case 'KeyH':
        togglePanel('help');
        break;
      case 'Enter':
        set({ chatOpen: true });
        break;
      case 'Escape':
        if (get().panel || get().npc) set({ panel: null, npc: null });
        else this.clearTarget();
        break;
      case 'KeyW':
      case 'KeyS':
        this.autorun = false;
        break;
      case 'AltLeft':
      case 'AltRight':
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

  // ---------- thao tác của người chơi (UI cũng gọi) ----------

  send(type: string, msg?: unknown): void {
    if (this.leaving) return;
    this.room.send(type, msg);
  }

  private me(): PState | undefined {
    return this.view.players?.get(this.sid);
  }

  setTarget(id: string, kind: TargetInfo['kind']): void {
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

  useSkill(i: number): void {
    const skill = SKILLS[i];
    const me = this.me();
    const ch = get().char;
    if (!skill || !me || !ch) return;
    if (me.fl & PF_DEAD) return;
    if (ch.level < skill.unlock) {
      pushToast(t('ui.skill_locked', { realm: realmName(skill.unlock) }), 'bad');
      return;
    }
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
    this.send(C.MEDITATE, { on: (me.fl & PF_MEDITATING) === 0 });
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
    if (type === 'loot') sfx('loot', 0.7);
    if (m.k === 'sys.fly_no_mp') {
      this.wantFly = false;
      set({ wantFly: false });
    }
  }

  private onFx(m: FxMsg): void {
    const v = this.vfx;
    const e = this.ents;
    if (!v || !e) return;
    const src = m.src ?? '';
    const dst = m.dst ?? '';
    const pSrc = e.players.get(src);
    this.playFxSound(m.t, src, m.dst ?? '', m.x, m.z);
    const posSrc = (out: THREE.Vector3) => e.chestOf(src, out);
    const posDst = (out: THREE.Vector3) => e.chestOf(dst, out);
    switch (m.t) {
      case 'sword':
      case 'slash':
      case 'thunder': {
        pSrc?.model.attack();
        if (!e.chestOf(src, _v)) break;
        if (m.t === 'sword') v.swordShot(_v, posDst, 0xbfeaff);
        else if (m.t === 'slash') v.slash(_v, posDst, 0x8fdcff);
        else if (e.chestOf(dst, _v2)) {
          v.swordShot(_v, posDst, 0xfff3b0, 1.8, 0.16);
          v.lightning(_v2.x, _v2.y - 1, _v2.z, 0xfff0a8, 1.3);
        }
        break;
      }
      case 'rain':
        pSrc?.model.attack();
        v.swordRain(m.x ?? 0, m.y ?? 0, m.z ?? 0, m.r ?? 8, 0x9fe0ff);
        break;
      case 'bite': {
        e.monsters.get(src)?.model.attack();
        if (e.chestOf(dst, _v)) v.burst(_v, 0xff6a5a, 0.7, 0.2);
        break;
      }
      case 'heal':
      case 'potion':
        v.pillar(posSrc, 0x7dffa0, 1.0, 0.9, 4);
        break;
      case 'shield':
        v.shield(posSrc, m.d ?? 8, () => ((this.view.players.get(src)?.fl ?? 0) & PF_SHIELD) !== 0);
        break;
      case 'levelup':
        v.pillar(posSrc, 0xffe08a, 1.8, 1.4, 12);
        break;
      case 'ascend':
        v.pillar(posSrc, 0xfff2b8, 3.2, 2.4, 40);
        if (e.chestOf(src, _v)) v.burst(_v, 0xfff2b8, 6, 1.2);
        break;
      case 'respawn':
        v.pillar(posSrc, 0xbfe8ff, 1.2, 1.0, 8);
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
        if (src === this.sid) set({ castEnd: Date.now() + (m.d ?? 1) * 1000, castTotal: (m.d ?? 1) * 1000 });
        break;
      case 'castend':
        if (src === this.sid) set({ castEnd: 0 });
        break;
      case 'tribstart':
        v.tribulationCloud((out) => e.chestOf(src, out), m.d ?? 40, () => ((this.view.players.get(src)?.fl ?? 0) & PF_TRIBULATION) !== 0);
        if (src === this.sid) set({ tribEnd: Date.now() + (m.d ?? 40) * 1000 });
        break;
    }
  }

  /** Âm lượng giảm theo khoảng cách tới người chơi. */
  private volumeAt(x: number, z: number): number {
    const d = Math.hypot(x - this.renderPos.x, z - this.renderPos.z);
    return d < 8 ? 1 : Math.max(0, 1 - (d - 8) / 70);
  }

  private playFxSound(t: string, src: string, dst: string, x?: number, z?: number): void {
    const map: Record<string, Sfx> = {
      sword: 'sword',
      slash: 'slash',
      rain: 'rain',
      thunder: 'thunder',
      heal: 'heal',
      potion: 'heal',
      shield: 'shield',
      levelup: 'levelup',
      ascend: 'ascend',
      quest: 'quest',
      craft: 'loot',
      enhance: 'loot',
      gather: 'gather',
      death: 'death',
      respawn: 'heal',
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

  private onDmg(m: DmgMsg): void {
    if (!this.ents || !this.ents.topOf(m.dst, _v)) return;
    const mine = m.dst === this.sid;
    const byMe = m.src === this.sid;
    // Bị quái đánh khi chưa chọn mục tiêu: tự chọn kẻ tấn công để phản đòn nhanh.
    if (mine && !m.heal && !this.targetId && m.src && this.view.monsters.has(m.src)) this.setTarget(m.src, 'mon');
    if (!mine && !byMe) {
      // Sát thương của người khác: chỉ hiện khi ở gần.
      if (_v.distanceTo(this.renderPos) > 45) return;
    }
    // Hit feel chỉ là lớp hình. Chiêu của người chơi là đạn bay ~0,2 s nên trễ cho khớp lúc chạm.
    if (!m.heal && m.n > 0) this.ents.hitReact(m.dst, m.src, !!m.crit, m.src && this.view.players.has(m.src) ? 0.2 : 0);
    let cls = 'other';
    if (m.heal) cls = 'heal';
    else if (mine) cls = 'hurt';
    else if (byMe) cls = m.crit ? 'crit' : 'hit';
    if (!m.heal) sfx(mine ? 'hurt' : 'hit', mine || byMe ? 1 : this.volumeAt(_v.x, _v.z) * 0.5, _v);
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
    const k = this.keys;
    const typing = this.typing();
    let mx = 0;
    let mz = 0;
    let f = 0;
    if (!typing) {
      // Kiểu "xoay": A/D quay hướng nhìn (xử lý ở frame), không bước ngang.
      if (this.controls !== 'turn') {
        if (k.has('KeyD')) mx += 1;
        if (k.has('KeyA')) mx -= 1;
      }
      if (k.has('KeyW')) mz += 1;
      if (k.has('KeyS')) mz -= 1;
      if (this.autorun && mz === 0) mz = 1;
      if (k.has('Space')) f |= this.wantFly ? IN_UP : IN_JUMP;
      if (k.has('KeyX') || k.has('ShiftLeft')) f |= IN_DOWN;
    }
    if (this.wantFly) f |= IN_FLY;
    this.seq++;
    return { s: this.seq, mx, mz, yaw: this.camYaw, f };
  }

  private reconcile(me: PState): void {
    if (me.seq === this.lastAck && me.x === this.lastSx && me.y === this.lastSy && me.z === this.lastSz && me.fl === this.lastFl) return;
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

  private frame(): void {
    if (this.disposed) return;
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
      const k = this.keys;
      const turn = this.controls === 'turn';
      if (k.has('ArrowLeft') || (turn && k.has('KeyA'))) this.camYaw += dt * 2.1;
      if (k.has('ArrowRight') || (turn && k.has('KeyD'))) this.camYaw -= dt * 2.1;
      if (k.has('ArrowUp')) this.camPitch = Math.min(1.45, this.camPitch + dt * 1.1);
      if (k.has('ArrowDown')) this.camPitch = Math.max(-0.45, this.camPitch - dt * 1.1);
      if (k.has('Equal') || k.has('NumpadAdd')) this.camDist = Math.max(3, this.camDist * (1 - dt * 1.4));
      if (k.has('Minus') || k.has('NumpadSubtract')) this.camDist = Math.min(70, this.camDist * (1 + dt * 1.4));
    }

    const rp = this.renderPos;
    this.terrain.update(rp.x, rp.z, this.started ? 1 : 8);
    const myLevel = get().char?.level ?? 1;
    if (me) {
      this.ents.update(dt, this.view, { x: rp.x, y: rp.y, z: rp.z, yaw: this.facing, speed: this.speed, airborne: !this.cur.grounded && !this.cur.flying }, this.targetId, myLevel);
    }
    if (this.questMarkersDirty) {
      this.questMarkersDirty = false;
      this.ents.updateQuestMarkers(get().quests, myLevel);
    }
    this.vfx.update(dt);
    this.updateCamera(dt);
    setListener(rp.x, rp.z, this.camYaw);
    this.env.update(dt, this.camera, rp);
    for (const disc of [this.portalDisc, this.exitDisc]) {
      if (!disc) continue;
      disc.rotation.y = Math.sin(now * 0.0006) * 0.15;
      (disc.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(now * 0.003) * 0.2;
    }
    this.tickCombat(now, me);
    this.renderer.render(this.scene, this.camera);
    this.dmg.update(dt, this.camera, window.innerWidth, window.innerHeight);

    this.fpsAcc += dt;
    this.fpsFrames++;
    if (now - this.hudAt > 100) {
      this.hudAt = now;
      this.syncHud(me);
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
    const want = this.camDist * (flying ? 1.35 : 1);
    this.camDistCur += (want - this.camDistCur) * Math.min(1, dt * 6);
    const cp = Math.cos(this.camPitch);
    const tx = rp.x;
    // Kiểu FPS: nhìn qua đầu nhân vật để tâm ngắm không bị nhân vật che.
    const ty = rp.y + (this.controls === 'mouse' ? 2.5 : 1.6);
    const tz = rp.z;
    let cx = tx + Math.sin(this.camYaw) * cp * this.camDistCur;
    let cy = ty + Math.sin(this.camPitch) * this.camDistCur;
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
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(tx, ty, tz);
  }

  /** Tự đánh thường liên tục khi đã chọn mục tiêu và bật auto. */
  private tickCombat(now: number, me: PState | undefined): void {
    if (!me || !this.targetId) return;
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

  private syncHud(me: PState | undefined): void {
    if (!me) return;
    const rp = this.renderPos;
    let target: TargetInfo | null = null;
    if (this.targetId) {
      if (this.targetKind === 'mon') {
        const m = this.view.monsters.get(this.targetId);
        const def = m ? MONSTER.get(m.t) : undefined;
        if (m && def) target = { id: this.targetId, kind: 'mon', name: monsterName(def.id), level: m.lv, hp: m.hp, mhp: m.mhp, boss: !!def.boss };
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
      perf = `${info.render.drawCalls ?? info.render.calls} draw · ${Math.round(info.render.triangles / 1000)}k tri · ${info.memory.geometries} geo · ${info.memory.textures} tex · ${this.ents.monsters.size} quái · ${this.terrain.tileCount()} ô`;
    }
    set({
      hp: me.hp,
      mhp: me.mhp,
      mp: me.mp,
      mmp: me.mmp,
      flags: me.fl,
      target,
      hint,
      npc,
      x: rp.x,
      y: rp.y,
      z: rp.z,
      zone: t('ui.zone.' + biomeAt(rp.x, rp.z)),
      fps: Math.round(st.fps ? st.fps * 0.6 + fps * 0.4 : fps),
      perf,
      autoAttack: this.autoAttack,
      tribEnd: me.fl & PF_TRIBULATION ? st.tribEnd : 0,
      castEnd: me.fl & PF_CASTING ? st.castEnd : 0,
    });
  }

  /** Chấm trên bản đồ nhỏ. */
  dots(): { x: number; z: number; c: string; r: number }[] {
    const out: { x: number; z: number; c: string; r: number }[] = [];
    if (!this.ents) return out;
    for (const m of this.ents.monsters.values()) {
      if (m.s.st !== MS_DEAD) out.push({ x: m.x, z: m.z, c: m.model.def.boss ? '#ff9a3c' : '#e5534b', r: m.model.def.boss ? 4 : 2 });
    }
    for (const [sid, p] of this.ents.players) if (sid !== this.sid) out.push({ x: p.x, z: p.z, c: '#6fd0ff', r: 3 });
    for (const n of this.ents.npcs) out.push({ x: n.x, z: n.z, c: '#ffd84a', r: 3 });
    for (const g of this.ents.nodes.values()) if (g.visible) out.push({ x: g.position.x, z: g.position.z, c: '#7fffb0', r: 1.5 });
    return out;
  }

  get yaw(): number {
    return this.camYaw;
  }

  setControls(mode: string): void {
    this.controls = mode === 'strafe' || mode === 'turn' ? mode : 'mouse';
    if (this.controls !== 'mouse') this.releaseLock();
    localStorage.setItem('dtl.controls', this.controls);
    set({ controls: this.controls });
  }

  setQuality(q: string): void {
    localStorage.setItem('dtl.quality', q);
    set({ quality: q });
    const cfg = QUALITY[q] ?? QUALITY.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatio));
    this.onResize();
  }

  dispose(): void {
    this.disposed = true;
    this.leaving = true;
    if (document.pointerLockElement) document.exitPointerLock();
    set({ mouseLook: false });
    this.renderer?.setAnimationLoop(null);
    for (const off of this.listeners) off();
    this.ents?.dispose();
    this.vfx?.dispose();
    this.terrain?.dispose();
    this.dmg?.clear();
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
