// Chế độ chỉnh phòng của Diễn Võ Trường (V3): kéo thả đạo cụ, đèn đá (nguồn sáng của phòng) và điểm gọi quái ngay trong phòng,
// lưu thành `packages/shared/src/props.dienvo.layout.json` qua cổng ghi file của Vite dev (`/__lab/layout`, `apps/client/dtlHotData.ts`).
//
// Ranh giới: chỉ có ở bản dev (module nạp động từ `boot.ts`), chỉ bật được khi đang đứng trong level `dien_vo` (server chỉ cho tài khoản
// GM vào), và KHÔNG gửi gì lên server game: mọi thay đổi trước khi lưu chỉ là hình ở máy mình. Server nhận bố cục mới bằng cách tự đọc
// lại file trên đĩa (`apps/server/src/devReload.ts`, chỉ máy phát triển), nên điểm gọi quái có hiệu lực sau khi bấm Lưu.
import * as THREE from 'three/webgpu';
import { DIEN_VO_LAYOUT, DIEN_VO_PROPS, PRACTICE_LEVEL, setDienVoLayout, type DienVoLayout, type DienVoSpawnZone } from '@dtl/shared';
import { FLAGS } from '../../base/flags';
import { heightAt, levelAssets, levelId } from '../../base/levelCtx';
import { createLanternHalos } from '../../render/atmosphere';
import { LanternLights } from '../../render/lanternLights';
import { get } from '../../ui/store';
import type { Game } from '../engine';
import { LANTERN_LIGHT, QUALITY, isWebGPU } from '../engine/common';
import { DA_FLAME, DA_LAMP_K } from '../engine/daMood';
import { forgetProps } from '../world/propScatter';
import { PropLayer } from '../world/props';
import {
  SNAP,
  YAW_STEP,
  addProp,
  addSpawn,
  cloneLayout,
  isLamp,
  moveItem,
  pickItem,
  propPickR,
  removeItem,
  rotateItem,
  sameLayout,
  scaleItem,
  selPos,
  toggleCollide,
  type RoomSel,
} from './roomLayout';

export interface RoomEditState {
  on: boolean;
  /** Có thay đổi chưa lưu vào file. */
  dirty: boolean;
  saving: boolean;
  sel: RoomSel | null;
  /** Mô tả mục đang chọn (id đạo cụ hoặc khu của điểm gọi quái) kèm số đo, để bảng hiện. */
  selInfo: { id: string; x: number; z: number; yawDeg: number; s: number; r: number } | null;
  props: number;
  lamps: number;
  spawns: Record<DienVoSpawnZone, number>;
  undo: number;
  /** Thông báo gần nhất: khóa i18n + tham số (bảng tự dịch). */
  msg: { key: string; p?: Record<string, string | number> } | null;
}

const COLOR = { prop: 0x6fd8ff, lamp: 0xffd36a, arena: 0x7dff9a, boss: 0xd59bff, sel: 0xffffff };
const LIFT = 0.14;
const UNDO_MAX = 50;
const API = '/__lab/layout';

const ringGeo = new THREE.RingGeometry(0.84, 1, 40).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(0.34, 20).rotateX(-Math.PI / 2);
// Vạch chỉ hướng mặt trước của đạo cụ (+Z khi yaw = 0).
const noseGeo = new THREE.PlaneGeometry(0.14, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);

/** Hệ số sáng của tay nắm: lớp ánh đêm của Dạ Họa nhuộm lam mọi điểm ảnh chưa đủ sáng, nên màu tay nắm phải vượt ngưỡng đó. */
const GLOW = 2.6;

function mat(color: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  m.color.setHex(color).multiplyScalar(GLOW);
  return m;
}

/**
 * Dựng lại lớp đạo cụ, quầng đèn và đèn điểm của phòng từ `DIEN_VO_PROPS` hiện tại (sau khi bố cục đổi). Chỉ gọi khi đang ở phòng tập.
 * `skip`: chỉ số đạo cụ KHÔNG dựng (đang được kéo, hiện bằng lớp xem trước riêng của trình chỉnh).
 */
export function rebuildRoomProps(eng: Game, skip = -1): void {
  // Lần vào phòng kế tiếp (dựng level từ đầu) phải đọc lại bố cục, không dùng danh sách đã nhớ.
  forgetProps(PRACTICE_LEVEL);
  if (levelId() !== PRACTICE_LEVEL || eng.disposed) return;
  const old = eng.props;
  const layer = new PropLayer(
    undefined,
    DIEN_VO_PROPS.filter((_, i) => i !== skip).map((h) => ({ id: h.id, x: h.x, y: heightAt(h.x, h.z), z: h.z, yaw: h.yaw, s: h.s })),
  );
  const q = QUALITY[get().quality];
  layer.setQuality(get().quality, !!q?.shadows);
  eng.scene.add(layer.group);
  eng.props = layer;
  // Lớp cũ ở lại tới khi lớp mới nạp xong mẫu (GLB lấy từ cache nhưng vẫn bất đồng bộ), để phòng không chớp trống.
  if (old) {
    const t0 = performance.now();
    const drop = () => {
      const st = Object.values(layer.stats().templates);
      const ready = st.length > 0 && !st.includes('loading');
      if (!ready && performance.now() - t0 < 2500 && eng.props === layer && !eng.disposed) return void setTimeout(drop, 80);
      old.dispose();
    };
    setTimeout(drop, 120);
  }
  if (!levelAssets(PRACTICE_LEVEL).features.lanterns) return;
  const pts = DIEN_VO_PROPS.filter(isLamp).map((p) => ({ x: p.x, y: heightAt(p.x, p.z) + 2.1 * p.s, z: p.z }));
  const halos = FLAGS.da ? createLanternHalos(pts, 1.9, DA_FLAME) : createLanternHalos(pts);
  const hi = eng.levelObjs.findIndex((o) => o.name === 'lantern-halos');
  if (hi >= 0) {
    const o = eng.levelObjs[hi] as THREE.Mesh;
    o.removeFromParent();
    o.geometry.dispose();
    (o.material as THREE.Material).dispose();
    eng.levelObjs[hi] = halos;
  } else eng.levelObjs.push(halos);
  eng.scene.add(halos);
  eng.lanterns?.dispose();
  eng.lanterns = new LanternLights(eng.scene, FLAGS.da ? pts.map((p) => ({ ...p, color: DA_FLAME })) : pts);
  eng.lanterns.setEnabled(!!q?.lights && isWebGPU(eng.renderer));
  eng.lanterns.setIntensityScale((LANTERN_LIGHT[eng.levelMood] ?? 1) * (FLAGS.da ? DA_LAMP_K : 1));
}

export class RoomEditor {
  private on = false;
  private work: DienVoLayout = cloneLayout(DIEN_VO_LAYOUT);
  /** Bản đang nằm trong file (mốc để biết có thay đổi chưa lưu). */
  private saved: DienVoLayout = cloneLayout(DIEN_VO_LAYOUT);
  private sel: RoomSel | null = null;
  private undoStack: string[] = [];
  private saving = false;
  private msg: RoomEditState['msg'] = null;
  private subs = new Set<() => void>();
  private snap: RoomEditState | null = null;
  private group = new THREE.Group();
  private mats = new Map<number, THREE.MeshBasicMaterial>();
  private labels = new Map<string, THREE.SpriteMaterial>();
  private drag: { dx: number; dz: number; moved: boolean; before: string } | null = null;
  /** Bản xem trước THẬT của đạo cụ đang kéo: một lớp đạo cụ riêng chỉ chứa món đó, dời bằng vị trí của nhóm. */
  private ghost: { layer: PropLayer; x0: number; z0: number; y0: number; raf: number; last: number } | null = null;
  private off: (() => void)[] = [];
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private watch: ReturnType<typeof setInterval> | null = null;
  private readonly ray = new THREE.Raycaster();

  constructor(private eng: Game) {
    this.group.name = 'lab-room-edit';
    this.group.renderOrder = 40;
  }

  // ---- trạng thái cho giao diện ----

  subscribe = (cb: () => void): (() => void) => {
    this.subs.add(cb);
    return () => void this.subs.delete(cb);
  };

  state = (): RoomEditState => {
    if (this.snap) return this.snap;
    const p = this.sel?.kind === 'prop' ? this.work.props[this.sel.i] : undefined;
    const sp = this.sel?.kind === 'spawn' ? this.work.spawns[this.sel.zone][this.sel.i] : undefined;
    this.snap = {
      on: this.on,
      dirty: !sameLayout(this.work, this.saved),
      saving: this.saving,
      sel: this.sel,
      selInfo: p
        ? { id: p.id, x: p.x, z: p.z, yawDeg: Math.round((p.yaw * 180) / Math.PI), s: p.s, r: p.r ?? 0 }
        : sp && this.sel?.kind === 'spawn'
          ? { id: this.sel.zone, x: sp.x, z: sp.z, yawDeg: 0, s: 1, r: 0 }
          : null,
      props: this.work.props.length,
      lamps: this.work.props.filter(isLamp).length,
      spawns: { arena: this.work.spawns.arena.length, boss: this.work.spawns.boss.length },
      undo: this.undoStack.length,
      msg: this.msg,
    };
    return this.snap;
  };

  private emit(): void {
    this.snap = null;
    for (const cb of this.subs) cb();
  }

  private say(key: string, p?: Record<string, string | number>): void {
    this.msg = { key, p };
    this.emit();
  }

  // ---- bật / tắt ----

  /** Có bật được không: chỉ trong phòng tập. */
  canEnable(): boolean {
    return levelId() === PRACTICE_LEVEL && !this.eng.disposed;
  }

  enable(): boolean {
    if (this.on) return true;
    if (!this.canEnable()) {
      this.say('ui.gm.lab.edit.msg.notRoom');
      return false;
    }
    this.on = true;
    this.work = cloneLayout(DIEN_VO_LAYOUT);
    this.sel = null;
    this.eng.scene.add(this.group);
    this.buildHandles();
    const w = window;
    const add = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts: AddEventListenerOptions) => {
      w.addEventListener(type, fn, opts);
      this.off.push(() => w.removeEventListener(type, fn, opts));
    };
    // Pha bắt (capture) trên window: chạy trước bộ nghe của game trên canvas, nên bấm trúng tay nắm thì game không coi là bấm chọn mục tiêu.
    add('pointerdown', this.onDown, { capture: true });
    add('pointermove', this.onMove, { capture: true });
    add('pointerup', this.onUp, { capture: true });
    add('wheel', this.onWheel, { capture: true, passive: false });
    add('keydown', this.onKey, { capture: true });
    // Rời phòng (đổi level, mất kết nối) thì tự tắt.
    this.watch = setInterval(() => {
      if (!this.canEnable()) this.disable();
    }, 500);
    this.say('ui.gm.lab.edit.msg.on');
    return true;
  }

  disable(): void {
    if (!this.on) return;
    this.on = false;
    this.drag = null;
    this.sel = null;
    this.endGhost(0);
    for (const f of this.off.splice(0)) f();
    if (this.watch) clearInterval(this.watch);
    this.watch = null;
    this.clearHandles();
    this.group.removeFromParent();
    this.emit();
  }

  toggle(): boolean {
    if (this.on) this.disable();
    else this.enable();
    return this.on;
  }

  // ---- thao tác ----

  private pushUndo(before = JSON.stringify(this.work)): void {
    this.undoStack.push(before);
    if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
  }

  /** Đưa bản làm việc vào dữ liệu đang chạy của client rồi dựng lại hình. `soon`: gom các thay đổi dồn dập (lăn chuột) thành một lần dựng. */
  private commit(soon = false): void {
    const err = setDienVoLayout(this.work);
    if (err) {
      // Không xảy ra với các phép của roomLayout (đều kẹp trong luật); nếu có thì quay về bản trước.
      const prev = this.undoStack.pop();
      if (prev) this.work = JSON.parse(prev) as DienVoLayout;
      this.buildHandles();
      return this.say('ui.gm.lab.edit.msg.bad', { err });
    }
    this.buildHandles();
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(
      () => {
        this.rebuildTimer = null;
        rebuildRoomProps(this.eng);
      },
      soon ? 260 : 0,
    );
    this.emit();
  }

  private edit(fn: (l: DienVoLayout) => boolean, soon = false): boolean {
    if (!this.on) return false;
    const before = JSON.stringify(this.work);
    if (!fn(this.work)) return false;
    this.pushUndo(before);
    this.commit(soon);
    return true;
  }

  /** Điểm đặt mặc định cho mục mới: 2,5 m phía trên màn hình tính từ nhân vật (camera phòng khóa 0°, bắc ở trên). */
  private spot(): { x: number; z: number } {
    const me = this.eng.me();
    return me ? { x: me.x, z: me.z - 2.5 } : { x: DIEN_VO_LAYOUT.props[0]?.x ?? 1300, z: 985 };
  }

  addProp(id: string): boolean {
    if (!/^prop_[a-z0-9_]{1,60}$/.test(id)) return false;
    const at = this.spot();
    // Lấy tỉ lệ và va chạm của món cùng loại đã có trong phòng (đá dựng 5 m ở tỉ lệ 1 sẽ che cả khung).
    const like = this.work.props.find((p) => p.id === id);
    return this.edit((l) => {
      this.sel = addProp(l, id, at.x, at.z, like ? { ...like, yaw: 0 } : undefined);
      return true;
    });
  }

  addSpawn(zone: DienVoSpawnZone): boolean {
    const me = this.eng.me();
    return this.edit((l) => {
      this.sel = addSpawn(l, zone, me?.x ?? 0, me?.z ?? 0);
      return true;
    });
  }

  rotateSel(steps: number): boolean {
    const s = this.sel;
    return !!s && this.edit((l) => rotateItem(l, s, steps * YAW_STEP), true);
  }

  scaleSel(k: number): boolean {
    const s = this.sel;
    return !!s && this.edit((l) => scaleItem(l, s, k), true);
  }

  toggleCollideSel(): boolean {
    const s = this.sel;
    return !!s && this.edit((l) => toggleCollide(l, s));
  }

  removeSel(): boolean {
    const s = this.sel;
    if (!s) return false;
    return this.edit((l) => {
      const ok = removeItem(l, s);
      if (ok) this.sel = null;
      return ok;
    });
  }

  /** Chọn theo chỉ số (cho bảng và kịch bản kiểm). */
  select(sel: RoomSel | null): void {
    this.sel = sel && selPos(this.work, sel) ? sel : null;
    this.buildHandles();
    this.emit();
  }

  /** Dời mục đang chọn tới tọa độ thế giới (cho kịch bản kiểm; kéo chuột đi cùng đường này). */
  moveSel(x: number, z: number, snap = SNAP): boolean {
    const s = this.sel;
    return !!s && this.edit((l) => moveItem(l, s, x, z, snap));
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev || !this.on) return false;
    this.work = JSON.parse(prev) as DienVoLayout;
    this.sel = null;
    setDienVoLayout(this.work);
    this.buildHandles();
    rebuildRoomProps(this.eng);
    this.emit();
    return true;
  }

  /** Lớp xem trước lúc kéo (cho kịch bản kiểm): độ lệch so với chỗ cũ và số mẫu đã nạp; không kéo thì null. */
  ghostInfo(): { dx: number; dz: number; ready: number } | null {
    const g = this.ghost;
    if (!g) return null;
    const st = Object.values(g.layer.stats().templates);
    return { dx: g.layer.group.position.x, dz: g.layer.group.position.z, ready: st.filter((v) => v === 'ready').length };
  }

  /** Bản làm việc hiện tại (bản sao), cho kịch bản kiểm. */
  layout(): DienVoLayout {
    return cloneLayout(this.work);
  }

  // ---- file ----

  /** Ghi bố cục vào file qua cổng của Vite dev. Trả null nếu xong, không thì lý do. */
  async save(): Promise<string | null> {
    if (this.saving) return 'busy';
    this.saving = true;
    this.emit();
    let err: string | null = null;
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dtl-lab': '1' },
        body: JSON.stringify(this.work),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; err?: string };
      if (!res.ok || !body.ok) err = body.err ?? `HTTP ${res.status}`;
    } catch (e) {
      err = String(e);
    }
    this.saving = false;
    if (err) this.say('ui.gm.lab.edit.msg.saveFail', { err });
    else {
      this.saved = cloneLayout(this.work);
      this.say('ui.gm.lab.edit.msg.saved', { n: this.work.props.length });
    }
    return err;
  }

  /** Bỏ mọi thay đổi chưa lưu: đọc lại file. */
  async revert(): Promise<string | null> {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const err = res.ok ? setDienVoLayout(await res.json()) : `HTTP ${res.status}`;
      if (err) {
        this.say('ui.gm.lab.edit.msg.saveFail', { err });
        return err;
      }
    } catch (e) {
      this.say('ui.gm.lab.edit.msg.saveFail', { err: String(e) });
      return String(e);
    }
    this.adopt();
    this.say('ui.gm.lab.edit.msg.reverted');
    return null;
  }

  /** Lấy `DIEN_VO_LAYOUT` hiện tại làm bản làm việc và bản đã lưu, dựng lại hình. */
  private adopt(): void {
    this.work = cloneLayout(DIEN_VO_LAYOUT);
    this.saved = cloneLayout(DIEN_VO_LAYOUT);
    this.sel = null;
    this.undoStack.length = 0;
    if (this.on) this.buildHandles();
    rebuildRoomProps(this.eng);
    this.emit();
  }

  /**
   * File bố cục vừa đổi trên đĩa và đã được vá vào `DIEN_VO_LAYOUT` (`hotData.ts`): do mình vừa lưu, hoặc do sửa tay / người khác lưu.
   * Không có thay đổi dở thì nhận bản mới; đang sửa dở thì GIỮ bản của mình (đặt lại vào dữ liệu đang chạy) và báo.
   */
  onFileChanged(): void {
    const disk = cloneLayout(DIEN_VO_LAYOUT);
    if (sameLayout(disk, this.work)) {
      this.saved = disk;
      return this.emit();
    }
    if (this.on && !sameLayout(this.work, this.saved)) {
      this.saved = disk;
      setDienVoLayout(this.work);
      return this.say('ui.gm.lab.edit.msg.diskChanged');
    }
    this.adopt();
    this.say('ui.gm.lab.edit.msg.reloaded');
  }

  // ---- tay nắm ----

  private matOf(color: number): THREE.MeshBasicMaterial {
    let m = this.mats.get(color);
    if (!m) this.mats.set(color, (m = mat(color)));
    return m;
  }

  private labelOf(text: string, color: number): THREE.SpriteMaterial {
    const k = `${text}|${color}`;
    let m = this.labels.get(k);
    if (!m) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const ctx = cv.getContext('2d')!;
      ctx.font = '700 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#0b1018';
      ctx.strokeText(text, 32, 34);
      ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
      ctx.fillText(text, 32, 34);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
      this.labels.set(k, m);
    }
    return m;
  }

  private clearHandles(): void {
    this.group.clear();
  }

  private isSel(s: RoomSel): boolean {
    const c = this.sel;
    return !!c && c.kind === s.kind && c.i === s.i && (c.kind !== 'spawn' || (s.kind === 'spawn' && c.zone === s.zone));
  }

  private buildHandles(): void {
    this.clearHandles();
    if (!this.on) return;
    const put = (o: THREE.Object3D, x: number, z: number) => {
      o.position.set(x, heightAt(x, z) + LIFT, z);
      o.renderOrder = 40;
      this.group.add(o);
    };
    this.work.props.forEach((p, i) => {
      const sel = this.isSel({ kind: 'prop', i });
      const m = this.matOf(sel ? COLOR.sel : isLamp(p) ? COLOR.lamp : COLOR.prop);
      const g = new THREE.Group();
      const ring = new THREE.Mesh(ringGeo, m);
      ring.scale.setScalar(propPickR(p) * (sel ? 1.15 : 1));
      const nose = new THREE.Mesh(noseGeo, m);
      nose.scale.set(1, 1, propPickR(p) + 0.5);
      nose.rotation.y = p.yaw;
      ring.renderOrder = nose.renderOrder = 40;
      g.add(ring, nose);
      put(g, p.x, p.z);
    });
    for (const zone of ['arena', 'boss'] as const)
      this.work.spawns[zone].forEach((p, i) => {
        const sel = this.isSel({ kind: 'spawn', zone, i });
        const color = sel ? COLOR.sel : COLOR[zone];
        const g = new THREE.Group();
        const ring = new THREE.Mesh(ringGeo, this.matOf(color));
        ring.scale.setScalar(sel ? 0.9 : 0.75);
        const dot = new THREE.Mesh(discGeo, this.matOf(color));
        const label = new THREE.Sprite(this.labelOf(String(i + 1), COLOR[zone]));
        label.position.y = 1.1;
        label.scale.setScalar(0.9);
        ring.renderOrder = dot.renderOrder = label.renderOrder = 41;
        g.add(ring, dot, label);
        put(g, p.x, p.z);
      });
  }


  // ---- bản xem trước lúc kéo ----

  /** Bắt đầu kéo đạo cụ `i`: dựng lại lớp chính KHÔNG có nó (theo bố cục trước khi kéo) và dựng nó ở một lớp riêng chạy theo chuột. */
  private startGhost(i: number, before: string): void {
    this.endGhost(0);
    const p0 = (JSON.parse(before) as DienVoLayout).props[i];
    if (!p0) return;
    rebuildRoomProps(this.eng, i);
    const y0 = heightAt(p0.x, p0.z);
    const layer = new PropLayer(undefined, [{ id: p0.id, x: p0.x, y: y0, z: p0.z, yaw: p0.yaw, s: p0.s }]);
    layer.setQuality(get().quality, !!QUALITY[get().quality]?.shadows);
    this.eng.scene.add(layer.group);
    const g = { layer, x0: p0.x, z0: p0.z, y0, raf: 0, last: performance.now() };
    // Lớp chính được vòng khung hình của game cập nhật (nạp mẫu, chọn LOD); lớp xem trước thì tự cập nhật ở đây.
    const tick = () => {
      if (this.ghost !== g) return;
      const now = performance.now();
      const cam = this.eng.camera;
      layer.update((now - g.last) / 1000, cam.position.x, cam.position.z, cam);
      g.last = now;
      g.raf = requestAnimationFrame(tick);
    };
    this.ghost = g;
    g.raf = requestAnimationFrame(tick);
  }

  private moveGhost(): void {
    const g = this.ghost;
    const p = this.sel?.kind === 'prop' ? this.work.props[this.sel.i] : undefined;
    if (!g || !p) return;
    g.layer.group.position.set(p.x - g.x0, heightAt(p.x, p.z) - g.y0, p.z - g.z0);
  }

  /** Thả: bỏ lớp xem trước sau khi lớp chính (đã dựng lại với vị trí mới) kịp nạp, để món đồ không chớp mất. */
  private endGhost(delay = 450): void {
    const g = this.ghost;
    if (!g) return;
    this.ghost = null;
    cancelAnimationFrame(g.raf);
    const drop = () => g.layer.dispose();
    if (delay > 0) setTimeout(drop, delay);
    else drop();
  }

  // ---- chuột và phím ----

  /** Điểm trên sàn dưới con trỏ (giao tia nhìn với mặt đất, lặp hai lần vì sàn gần phẳng). */
  private groundAt(e: { clientX: number; clientY: number }): { x: number; z: number } | null {
    const r = this.eng.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.eng.camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    if (d.y >= -1e-4) return null;
    let y = heightAt(o.x, o.z);
    let x = o.x;
    let z = o.z;
    for (let k = 0; k < 3; k++) {
      const t = (y - o.y) / d.y;
      x = o.x + d.x * t;
      z = o.z + d.z * t;
      y = heightAt(x, z);
    }
    return { x, z };
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || e.target !== this.eng.canvas) return;
    const g = this.groundAt(e);
    const hit = g && pickItem(this.work, g.x, g.z);
    if (!g || !hit) {
      // Bấm ra ngoài: bỏ chọn, để game xử lý cú bấm như thường (chọn mục tiêu).
      if (this.sel) this.select(null);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const p = selPos(this.work, hit)!;
    this.sel = hit;
    this.drag = { dx: p.x - g.x, dz: p.z - g.z, moved: false, before: JSON.stringify(this.work) };
    this.buildHandles();
    this.emit();
  };

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || !this.sel) return;
    e.stopPropagation();
    const g = this.groundAt(e);
    if (!g) return;
    // Giữ Alt: không bám lưới.
    if (moveItem(this.work, this.sel, g.x + d.dx, g.z + d.dz, e.altKey ? 0 : SNAP)) {
      if (!d.moved && this.sel.kind === 'prop') this.startGhost(this.sel.i, d.before);
      d.moved = true;
      this.moveGhost();
      this.buildHandles();
      this.emit();
    }
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    e.stopPropagation();
    if (!d.moved) return;
    this.pushUndo(d.before);
    this.commit();
    this.endGhost();
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.sel || e.target !== this.eng.canvas) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.deltaY > 0 ? 1 : -1;
    // Lăn: xoay 15° mỗi nấc; giữ Shift: phóng 5% mỗi nấc.
    if (e.shiftKey) this.scaleSel(dir > 0 ? 1 / 1.05 : 1.05);
    else this.rotateSel(dir);
  };

  private onKey = (e: KeyboardEvent): void => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    let used = false;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') used = this.undo() || true;
    else if (this.sel && (e.code === 'Delete' || e.code === 'Backspace')) used = this.removeSel();
    else if (this.sel && e.code === 'Escape') {
      this.select(null);
      used = true;
    }
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  dispose(): void {
    this.disable();
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    for (const m of this.mats.values()) m.dispose();
    for (const m of this.labels.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.mats.clear();
    this.labels.clear();
    this.subs.clear();
  }
}
