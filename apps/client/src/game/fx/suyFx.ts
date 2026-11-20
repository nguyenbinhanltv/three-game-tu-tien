// Hiệu ứng của Thiên Nhân Ngũ Suy (TN-4): phát dòng thời gian `data/fx/suy_*.json` (sinh bằng `tools/vfx/gen-fx-suy.py`) bằng `FxRunner.startAt`
// tại đúng điểm server báo qua FX `suy` / `suymark` / `suyok`. Chỉ là lớp hình: thanh suy khí, ai trúng, ải qua hay trượt đều do server quyết định.
//
// Vật tồn tại lâu mà chỉ server biết khi nào hết (Linh Nhãn, Thọ Đăng) là VÒNG LẶP: phát lại timeline mỗi `LOOP` giây, nên khi trạng thái đổi
// (đèn tắt, Linh Nhãn dời, ải kết thúc, kiếp thất bại) chỉ cần ngừng phát là hình tự tan trong ≤ 1 giây, không sót lại trên sân.
//
// Sân độ kiếp rất tối nên ngoài timeline còn ba lớp "đọc được từ xa" (đều tự dọn khi ải khép):
//  - hai đèn thật: đèn chủ đạo treo trên tâm ải (màu ải, nhạt) và đèn viền bám nhân vật, để người và vật của ải nổi khỏi nền mà không đổi không khí đêm;
//  - cột linh quang cộng sáng có bloom (`Vfx.suyBeacon`) ở Linh Nhãn, vòng Tôi Thể Lôi, tâm lôi ẩn, nhịp phá vọng;
//  - ngọn lửa Thọ Đăng phát sáng có trạng thái liên tục (`Vfx.suyLamps`): cháy, bị suy phong nhắm thì nhạt màu dần, tắt, đang thắp lại.
import * as THREE from 'three/webgpu';
import { SUY_FX } from '@dtl/content';
import { suyRingPos, suySectorYaw, tribDef, type FxMsg, type FxTimeline } from '@dtl/shared';
import { FX_PALETTE } from '../../render/vfx/palette';
import type { FxCaster, FxRunner, FxTarget } from './fxTimeline';
import type { Vfx } from './vfx';

/** Chu kỳ phát lại vòng lặp (giây); timeline vòng lặp sống 1,08 s nên hai vòng gối nhau. */
const LOOP = 1;
/** Sau từng này giây không thấy cờ độ kiếp của chủ thì coi như kiếp đã hết (lỡ tin khép ải) và dọn vòng lặp. */
const ORPHAN_SEC = 2;
/** Đèn chủ đạo: cao trên tâm ải (m), cường độ, tầm; đèn viền bám nhân vật. Không đổ bóng. */
const KEY = { h: 12, intensity: 380, dist: 46 };
const RIM = { h: 3.2, back: 2.4, intensity: 140, dist: 12 };

interface Loop {
  key: string;
  src: string;
  tl: string;
  pal: string;
  x: number;
  z: number;
  r: number;
  next: number;
}

type Handle = { stop(): void };
type Lamps = { set(i: number, state: number, sec?: number): void; stop(): void };

export interface SuyFxEnv {
  /** Nhân vật `sid` (vị trí chân, hướng); undefined nếu ngoài tầm nhìn. */
  player(sid: string): FxCaster | undefined;
  ground(x: number, z: number): number;
  /** `sid` còn đang độ kiếp (cờ PF_TRIBULATION)? */
  tribOn(sid: string): boolean;
  /** Tâm Ma Ảnh đang sống trong tầm nhìn (để đặt vết chém phá vọng). */
  shadow(): { x: number; y: number; z: number } | null;
  /** sid của người xem: hiệu ứng ải của chính mình không hạ bậc chất lượng, có rung/chớp theo cài đặt. */
  mySid?(): string;
  /** Lớp phát sáng (cột linh quang, lửa Thọ Đăng) và cảnh để gắn đèn; thiếu (test) thì bỏ qua các lớp này. */
  vfx?: Pick<Vfx, 'suyBeacon' | 'suyLamps'>;
  scene?: THREE.Scene;
}

const palOf = (stage: string | undefined): string => (stage && stage.startsWith('suy_') ? stage : 'suy_linh');
const hexOf = (pal: string, tone: 'body' | 'rim' | 'accent'): number => FX_PALETTE[pal]?.[tone] ?? 0xffffff;

export class SuyFx {
  private loops = new Map<string, Loop>();
  /** Ải (cơ chế) đang chạy của từng người và tâm ải. */
  private stage = new Map<string, { id: string; x: number; z: number; mode: number }>();
  private offSince = new Map<string, number>();
  /** Lớp phát sáng đang sống theo khóa `<sid>:<ô>`. */
  private glows = new Map<string, Handle>();
  private lamps = new Map<string, Lamps>();
  private key: THREE.PointLight | null = null;
  private rim: THREE.PointLight | null = null;
  private litFor = '';
  /** Nhật ký dev cho Playwright (`__game.suyFx.log`). */
  readonly log: { key: string; at: number }[] = [];

  constructor(
    private runner: FxRunner,
    private env: SuyFxEnv,
  ) {}

  private tl(key: string): FxTimeline | undefined {
    return SUY_FX.get(key);
  }

  private note(key: string): void {
    if (!import.meta.env.DEV) return;
    this.log.push({ key, at: performance.now() });
    if (this.log.length > 300) this.log.shift();
  }

  private mine(src: string): boolean {
    return !!src && this.env.mySid?.() === src;
  }

  /** Phát `key` tại điểm (x, z) trên mặt đất; `yaw` cho hình có hướng (cung lôi ẩn), `delay` cho sự kiện `untilDelay`. */
  private at(key: string, pal: string, x: number, z: number, r: number, o: { yaw?: number; delay?: number; src?: string } = {}): void {
    const tl = this.tl(key);
    if (!tl) return;
    const y = this.env.ground(x, z);
    this.runner.startAt(tl, {
      actor: { x, y, z, yaw: o.yaw ?? 0, model: {} },
      palette: pal,
      area: { x, z, r },
      delay: o.delay,
      mine: this.mine(o.src ?? ''),
    });
    this.note(key);
  }

  /** Phát `key` bám theo nhân vật `sid` (vòng phá vọng, vòng ngưng thần); `tgt` = điểm trúng. */
  private on(key: string, pal: string, sid: string, o: { delay?: number; tgt?: FxTarget | null } = {}): void {
    const tl = this.tl(key);
    const actor = this.env.player(sid);
    if (!tl || !actor) return;
    this.runner.startAt(tl, {
      actor,
      palette: pal,
      area: { x: actor.x, z: actor.z, r: 3 },
      delay: o.delay,
      tgt: o.tgt,
      mine: this.mine(sid),
    });
    this.note(key);
  }

  private setLoop(src: string, slot: string, tl: string, pal: string, x: number, z: number, r: number): void {
    const key = `${src}:${slot}`;
    const cur = this.loops.get(key);
    if (cur && cur.tl === tl && cur.x === x && cur.z === z) return;
    this.loops.set(key, { key, src, tl, pal, x, z, r, next: 0 });
  }

  private dropLoops(src: string, prefix = ''): void {
    for (const k of [...this.loops.keys()]) if (k.startsWith(`${src}:${prefix}`)) this.loops.delete(k);
  }

  // ---- lớp phát sáng ----

  /** Cột linh quang tại điểm cố định (hoặc bám `follow`); thay cột cũ cùng khóa. */
  private glow(
    src: string,
    slot: string,
    color: number,
    o: { x?: number; z?: number; follow?: string; h: number; r: number; dur: number; opacity?: number; pulse?: number },
  ): void {
    const v = this.env.vfx;
    if (!v) return;
    this.dropGlow(src, slot);
    const fixed = o.follow ? null : { x: o.x ?? 0, y: this.env.ground(o.x ?? 0, o.z ?? 0), z: o.z ?? 0 };
    const pos = () => fixed ?? this.env.player(o.follow!) ?? null;
    this.glows.set(
      `${src}:${slot}`,
      v.suyBeacon(pos, color, o, () => this.env.tribOn(src)),
    );
  }

  private dropGlow(src: string, prefix = ''): void {
    for (const [k, h] of [...this.glows]) {
      if (!k.startsWith(`${src}:${prefix}`)) continue;
      h.stop();
      this.glows.delete(k);
    }
  }

  private dropLamps(src: string): void {
    this.lamps.get(src)?.stop();
    this.lamps.delete(src);
  }

  /** Đèn chủ đạo + đèn viền cho ải của `src` (ưu tiên ải của chính mình); thêm vào cảnh một lần, đổi màu/vị trí theo ải. */
  private light(src: string, x: number, z: number, pal: string): void {
    const scene = this.env.scene;
    if (!scene) return;
    if (this.litFor && this.litFor !== src && !this.mine(src)) return;
    this.litFor = src;
    if (!this.key) {
      this.key = new THREE.PointLight(0xffffff, KEY.intensity, KEY.dist, 2);
      this.rim = new THREE.PointLight(0xdfe9ff, RIM.intensity, RIM.dist, 2);
      this.key.castShadow = this.rim.castShadow = false;
      scene.add(this.key, this.rim);
    }
    // Màu ải pha trắng 60%: đủ nhận ra sắc ải mà không nhuộm cả sân.
    this.key.color.setHex(hexOf(pal, 'body')).lerp(new THREE.Color(0xffffff), 0.6);
    this.key.position.set(x, this.env.ground(x, z) + KEY.h, z);
  }

  private unlight(src: string): void {
    if (this.litFor !== src) return;
    this.litFor = '';
    if (this.key) this.key.removeFromParent();
    if (this.rim) this.rim.removeFromParent();
    this.key?.dispose();
    this.rim?.dispose();
    this.key = this.rim = null;
  }

  /** Dọn mọi thứ của `src` (kiếp mới bắt đầu, ải khép, rời room). */
  clear(src: string): void {
    this.dropLoops(src);
    this.dropGlow(src);
    this.dropLamps(src);
    this.unlight(src);
    this.stage.delete(src);
    this.offSince.delete(src);
  }

  /** FX `suy`: thanh suy khí. Tin đầu ải mang tâm ải (x, z): dựng thẻ ấn vào ải; `pg` < 0 khép ải; 100 = suy khí công tâm (thất bại). */
  bar(m: FxMsg): void {
    const src = m.src ?? '';
    if ((m.pg ?? 0) < 0) {
      this.dropLoops(src);
      this.dropGlow(src);
      this.dropLamps(src);
      this.unlight(src);
      this.stage.delete(src);
      return;
    }
    const id = m.s ?? '';
    const cur = this.stage.get(src);
    if (!cur || cur.id !== id) {
      this.dropLoops(src);
      this.dropGlow(src);
      this.dropLamps(src);
      const p = this.env.player(src);
      const x = m.x ?? p?.x ?? 0;
      const z = m.z ?? p?.z ?? 0;
      this.stage.set(src, { id, x, z, mode: 0 });
      this.at('suy_enter_' + id.slice(4), palOf(id), x, z, 6, { src });
      this.light(src, x, z, palOf(id));
    }
    const st = this.stage.get(src)!;
    if (m.pg === 100) {
      const p = this.env.player(src);
      this.at('suy_fail', palOf(id), p?.x ?? st.x, p?.z ?? st.z, 4, { src });
    }
    // Đạo Tâm Suy: nhịp phá vọng mở thì vòng vàng + cột sáng vàng bám người hiện đúng `d` giây.
    if (id === 'suy_tam' && m.n !== undefined && m.n !== st.mode) {
      st.mode = m.n;
      if (m.n === 1) {
        const d = m.d ?? 3;
        this.on('suy_tam_open', palOf(id), src, { delay: d });
        this.glow(src, 'tam', hexOf('suy_tam', 'accent'), { follow: src, h: 9, r: 3.0, dur: d, opacity: 0.4, pulse: 8 });
      } else this.dropGlow(src, 'tam');
    }
  }

  /** FX `suyok`: qua một ải. */
  ok(m: FxMsg): void {
    const src = m.src ?? '';
    const p = this.env.player(src);
    if (!p) return;
    this.at('suy_ok', palOf(this.stage.get(src)?.id), p.x, p.z, 4, { src });
  }

  /** FX `suymark`: dấu trên sân. */
  mark(m: FxMsg): void {
    const src = m.src ?? '';
    const kind = m.s ?? '';
    const x = m.x ?? 0;
    const z = m.z ?? 0;
    const r = m.r ?? 3;
    const pg = m.pg ?? 0;
    switch (kind) {
      case 'nhan': {
        const old = this.loops.get(`${src}:nhan`);
        if (old) this.at('suy_nhan_end', 'suy_linh', old.x, old.z, old.r, { src });
        this.dropLoops(src, 'nhan');
        this.dropGlow(src, 'nhan');
        if (pg === 1) {
          this.at('suy_nhan_open', 'suy_linh', x, z, r, { src });
          this.setLoop(src, 'nhan', 'suy_nhan', 'suy_linh', x, z, r);
          this.glow(src, 'nhan', hexOf('suy_linh', 'body'), { x, z, h: 9, r, dur: (m.d ?? 8) + 0.2, opacity: 0.22 });
        }
        break;
      }
      case 'toi':
        this.dropGlow(src, 'toi');
        if (pg === 1) {
          this.at('suy_toi_warn', 'suy_the', x, z, r, { delay: m.d ?? 2, src });
          this.glow(src, 'toi', hexOf('suy_the', 'body'), { x, z, h: 12, r, dur: m.d ?? 2, opacity: 0.26, pulse: 12 });
        } else this.at(pg === 2 ? 'suy_toi_hit' : 'suy_toi_miss', 'suy_the', x, z, r, { src });
        break;
      case 'thuc':
        if (pg === 3) {
          this.at('suy_thuc_brew', 'suy_thuc', x, z, r, { delay: m.d ?? 3, src });
          // Cột tím ở TÂM sân báo "có đợt đang tụ" (không lộ cung nào nổ).
          this.glow(src, 'thuc', hexOf('suy_thuc', 'body'), { x, z, h: 10, r: 2.4, dur: m.d ?? 3, opacity: 0.24, pulse: 10 });
        } else if (pg === 1) this.on('suy_thuc_pulse', 'suy_thuc', src);
        else if (pg === 2) this.on('suy_thuc_void', 'suy_thuc', src);
        else if (m.lv) {
          this.dropGlow(src, 'thuc');
          for (let i = 0; i < m.lv; i++)
            if (((m.n ?? 0) & (1 << i)) !== 0) this.at('suy_thuc_boom', 'suy_thuc', x, z, r, { yaw: suySectorYaw(i, m.lv), src });
        }
        break;
      case 'den': {
        const i = m.n ?? 0;
        if (i < 0) {
          this.dropLamps(src);
          return this.dropLoops(src, 'den');
        }
        const slot = `den${i}`;
        const was = this.loops.get(`${src}:${slot}`)?.tl;
        const lamps = this.lampsOf(src);
        if (pg === 1) {
          if (was === 'suy_den_dark') this.at('suy_den_relit', 'suy_tho', x, z, r, { src });
          this.setLoop(src, slot, 'suy_den_lit', 'suy_tho', x, z, r);
          lamps?.set(i, 1);
        } else if (pg === 0) {
          if (was === 'suy_den_lit') this.at('suy_den_out', 'suy_tho', x, z, r, { src });
          this.setLoop(src, slot, 'suy_den_dark', 'suy_tho', x, z, r);
          lamps?.set(i, 0);
        } else if (pg === 2) {
          this.at('suy_den_gust', 'suy_tho', x, z, r, { delay: m.d ?? 1.5, src });
          lamps?.set(i, 2, m.d ?? 1.5);
        } else if (pg === 3) {
          this.at('suy_den_light', 'suy_tho', x, z, r, { delay: m.d ?? 1.2, src });
          lamps?.set(i, 3, m.d ?? 1.2);
        }
        break;
      }
      case 'tam': {
        if (pg === 1) {
          const s = this.env.shadow();
          this.on('suy_tam_good', 'suy_tam', src, { tgt: s ? { x: s.x, y: s.y, z: s.z, chest: 1.0 } : null });
          this.dropGlow(src, 'tam');
        } else this.on(pg === 2 ? 'suy_tam_miss' : 'suy_tam_bad', 'suy_tam', src);
        break;
      }
    }
  }

  /** Lửa phát sáng của năm Thọ Đăng quanh tâm ải của `src` (vị trí tính từ dữ liệu ải như server). Dựng lười ở tin đèn đầu tiên. */
  private lampsOf(src: string): Lamps | undefined {
    const have = this.lamps.get(src);
    if (have) return have;
    const v = this.env.vfx;
    const st = this.stage.get(src);
    const cfg = tribDef('ngu_suy').phases.find((p) => p.mechanic === 'suy_tho')?.suy?.tho;
    if (!v || !st || !cfg) return undefined;
    const pts = Array.from({ length: cfg.lamps }, (_, i) => suyRingPos(st, cfg.ring, i, cfg.lamps));
    const h = v.suyLamps(pts, () => this.env.tribOn(src));
    this.lamps.set(src, h);
    return h;
  }

  /** Mỗi khung: phát lại vòng lặp tới hạn; đèn viền bám nhân vật; chủ hết độ kiếp (lỡ tin khép ải) thì dọn. */
  update(): void {
    if (this.loops.size === 0 && this.stage.size === 0) return;
    const now = performance.now() / 1000;
    for (const src of new Set([...this.stage.keys(), ...[...this.loops.values()].map((l) => l.src)])) {
      if (this.env.tribOn(src)) {
        this.offSince.delete(src);
        continue;
      }
      const since = this.offSince.get(src) ?? now;
      this.offSince.set(src, since);
      if (now - since > ORPHAN_SEC) this.clear(src);
    }
    if (this.rim && this.litFor) {
      const p = this.env.player(this.litFor);
      // Đèn viền đứng sau lưng, cao hơn đầu: viền sáng quanh nhân vật khi nhìn từ camera sau lưng.
      if (p) this.rim.position.set(p.x - Math.sin(p.yaw) * RIM.back, p.y + RIM.h, p.z - Math.cos(p.yaw) * RIM.back);
    }
    for (const l of this.loops.values()) {
      if (now < l.next) continue;
      l.next = now + LOOP;
      this.at(l.tl, l.pal, l.x, l.z, l.r, { src: l.src });
    }
  }

  /** Số vòng lặp đang chạy (test, bảng dev). */
  get live(): number {
    return this.loops.size;
  }

  /** Đèn thật của khu ải đang bật? (test, bảng dev) */
  get lit(): boolean {
    return !!this.key;
  }

  dispose(): void {
    for (const src of [...this.stage.keys(), this.litFor]) if (src) this.clear(src);
    for (const h of this.glows.values()) h.stop();
    for (const h of this.lamps.values()) h.stop();
    this.glows.clear();
    this.lamps.clear();
    this.loops.clear();
    this.stage.clear();
    this.offSince.clear();
  }
}
