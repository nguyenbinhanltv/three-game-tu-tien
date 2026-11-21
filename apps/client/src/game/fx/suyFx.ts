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
import { HK_FX, SUY_FX } from '@dtl/content';
import {
  HK_VAN_SPIN_FRAC,
  hkLuanAngle,
  hkRingPos,
  hkVanSpinAngle,
  suyRingPos,
  suySectorYaw,
  tribDef,
  type FxMsg,
  type FxTimeline,
} from '@dtl/shared';
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
  vfx?: Pick<Vfx, 'suyBeacon' | 'suyLamps'> & { boltGlowMul?: number };
  scene?: THREE.Scene;
}

/** Cỡ quầng cầu chạm đất của tia sét khi đang ở trong ải (1 = như các kiếp khác). */
const BOLT_GLOW = 0.35;
const WHITE = new THREE.Color(0xffffff);
const palOf = (stage: string | undefined): string => (stage && (stage.startsWith('suy_') || stage.startsWith('hk_')) ? stage : 'suy_linh');
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
  /** Huyền Kiếp: vòng trụ chắn gió của từng người và vị trí Huyết Ảnh mới hiện gần nhất. */
  private ringOf = new Map<string, { n: number; r: number }>();
  private vanOf = new Map<string, { shift: number; t0: number; dur: number }>();
  private lastShadow: { x: number; y: number; z: number } | null = null;
  /** Nhật ký dev cho Playwright (`__game.suyFx.log`). */
  readonly log: { key: string; at: number }[] = [];

  constructor(
    private runner: FxRunner,
    private env: SuyFxEnv,
  ) {}

  private tl(key: string): FxTimeline | undefined {
    return SUY_FX.get(key) ?? HK_FX.get(key);
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
    o: {
      x?: number;
      z?: number;
      follow?: string;
      h: number;
      r: number;
      dur: number;
      opacity?: number;
      pulse?: number;
      thick?: number;
      crackle?: boolean;
    },
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

  /** Quầng sáng bám nhân vật `follow`, lệch (dx, dz) theo hướng nhìn của họ. */
  private glowAt(
    src: string,
    slot: string,
    color: number,
    follow: string,
    dx: number,
    dz: number,
    o: { h: number; r: number; dur: number; opacity?: number; thick?: number },
  ): void {
    const v = this.env.vfx;
    if (!v) return;
    const pos = () => {
      const p = this.env.player(follow);
      if (!p) return null;
      const c = Math.cos(p.yaw);
      const sn = Math.sin(p.yaw);
      return { x: p.x + c * dx + sn * dz, y: p.y, z: p.z - sn * dx + c * dz };
    };
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

  /**
   * Đèn chủ đạo + đèn viền cho ải của `src` (ưu tiên ải của chính mình). Hai đèn được tạo MỘT lần ở lần vào ải đầu tiên và ở lại trong cảnh
   * tới khi `dispose()`: đổi số đèn của cảnh buộc mọi vật liệu có chiếu sáng dựng lại pipeline (khựng), nên giữa các ải chỉ đổi màu, vị trí và
   * `intensity` (tắt = 0), cùng quy ước với `render/lanternLights.ts`.
   */
  private light(src: string, x: number, z: number, pal: string): void {
    const scene = this.env.scene;
    if (!scene) return;
    if (this.litFor && this.litFor !== src && !this.mine(src)) return;
    this.litFor = src;
    if (!this.key || !this.rim) {
      this.key = new THREE.PointLight(0xffffff, 0, KEY.dist, 2);
      this.rim = new THREE.PointLight(0xdfe9ff, 0, RIM.dist, 2);
      this.key.castShadow = this.rim.castShadow = false;
      scene.add(this.key, this.rim);
    }
    // Màu ải pha trắng 60%: đủ nhận ra sắc ải mà không nhuộm cả sân.
    this.key.color.setHex(hexOf(pal, 'body')).lerp(WHITE, 0.6);
    this.key.position.set(x, this.env.ground(x, z) + KEY.h, z);
    this.key.intensity = KEY.intensity;
    this.rim.intensity = RIM.intensity;
    // Trong ải: thu nhỏ quầng cầu của thiên lôi thường (xem `Vfx.boltGlowMul`).
    if (this.env.vfx) this.env.vfx.boltGlowMul = BOLT_GLOW;
  }

  /** Tắt đèn khu ải của `src` (giữ đèn trong cảnh, xem `light`). */
  private unlight(src: string): void {
    if (this.litFor !== src) return;
    this.litFor = '';
    if (this.key) this.key.intensity = 0;
    if (this.rim) this.rim.intensity = 0;
    if (this.env.vfx) this.env.vfx.boltGlowMul = 1;
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
      this.at(id.startsWith('hk_') ? 'hk_enter' : 'suy_enter_' + id.slice(4), palOf(id), x, z, 6, { src });
      this.light(src, x, z, palOf(id));
    }
    const st = this.stage.get(src)!;
    if (m.pg === 100) {
      const p = this.env.player(src);
      this.at('suy_fail', palOf(id), p?.x ?? st.x, p?.z ?? st.z, 4, { src });
    }
    // Trảm Ly Kiếp: vừa bước ra khỏi vòng Bản Mệnh Ấn thì vòng lóe đỏ.
    if (id === 'hk_tram_ly' && m.n !== undefined && m.n !== st.mode) {
      st.mode = m.n;
      if (m.n === 0) this.at('hk_ly_out', 'hk_tram_ly', st.x, st.z, 6, { src });
    }
    // Đạo Tâm Suy: nhịp phá vọng mở thì vòng vàng + cột sáng vàng bám người hiện đúng `d` giây.
    if (id === 'suy_tam' && m.n !== undefined && m.n !== st.mode) {
      st.mode = m.n;
      if (m.n === 1) {
        const d = m.d ?? 3;
        this.on('suy_tam_open', palOf(id), src, { delay: d });
        this.glow(src, 'tam', hexOf('suy_tam', 'accent'), { follow: src, h: 9, r: 3.0, dur: d, opacity: 0.4, pulse: 8 });
        // Bốn gai vàng quanh người: mỗi gai một quầng sáng thấp để khối nổi trên sân tối.
        for (let i = 0; i < 4; i++) {
          const ang = ((i + 0.5) * Math.PI) / 2;
          this.glowAt(src, `tam${i}`, hexOf('suy_tam', 'accent'), src, Math.sin(ang) * 2.6, Math.cos(ang) * 2.6, {
            h: 2.6,
            r: 0.9,
            dur: d,
            opacity: 0.55,
            thick: 2.2,
          });
        }
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
          // Trụ lôi quang giật sáng suốt thời gian báo: thấy ngay "sét đang giáng xuống vòng này" dù tia sét thật chỉ lóe từng nhịp.
          this.glow(src, 'toi', hexOf('suy_the', 'rim'), {
            x,
            z,
            h: 16,
            r,
            dur: m.d ?? 2,
            opacity: 0.4,
            pulse: 12,
            thick: 0.7,
            crackle: true,
          });
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

  /** Cột linh quang tại vị trí do `pos` tính mỗi khung (cung sinh đang xoay). */
  private glowFn(
    src: string,
    slot: string,
    color: number,
    pos: () => { x: number; y: number; z: number } | null,
    o: { h: number; r: number; dur: number; opacity?: number; pulse?: number; thick?: number },
  ): void {
    const v = this.env.vfx;
    if (!v) return;
    this.dropGlow(src, slot);
    this.glows.set(
      `${src}:${slot}`,
      v.suyBeacon(pos, color, o, () => this.env.tribOn(src)),
    );
  }

  /** Vạch kiếm vô hình của Trảm Ly Kiếp chém xuống (gọi khi vạch báo `rect` không nguồn hết giờ; chỉ là hình). */
  cut(src: string, x: number, z: number, yaw: number): void {
    if (this.stage.get(src)?.id === 'hk_tram_ly') this.at('hk_ly_cut', 'hk_tram_ly', x, z, 20, { yaw, src });
  }

  /**
   * FX `hkmark`: dấu trên sân của Huyền Kiếp (TN-6). Thứ phải chạm/bước vào (chỗ nấp, trụ nguội, ấn thật, Hồn Châu, cung sinh) có thêm cột linh quang
   * để đọc được từ xa trên sân tối; mối nguy (đụn tuyết, trụ nóng) dùng tông `accent` của kiếp.
   */
  hkMark(m: FxMsg): void {
    const src = m.src ?? '';
    const kind = m.s ?? '';
    const x = m.x ?? 0;
    const z = m.z ?? 0;
    const pg = m.pg ?? 0;
    const st = this.stage.get(src);
    const c = st ?? { x, z };
    switch (kind) {
      case 'tuyet':
        if (pg === 2) {
          this.at('hk_tuyet_drift', 'hk_tuyet', x, z, m.r ?? 3, { delay: m.d ?? 9, src });
          this.glow(src, `tuyet${m.n ?? 0}`, hexOf('hk_tuyet', 'accent'), { x, z, h: 4, r: m.r ?? 3, dur: m.d ?? 9, opacity: 0.4 });
        } else if (pg === 0) this.dropGlow(src, 'tuyet');
        break;
      case 'phong': {
        const yaw = Math.atan2(m.ox ?? 0, m.oz ?? 1);
        if (pg === 1) {
          const n = m.n ?? 3;
          for (let i = 0; i < n; i++) {
            const pp = hkRingPos({ x, z }, m.r ?? 7, i, n);
            this.setLoop(src, `pil${i}`, 'hk_phong_pillar', 'hk_phong', pp.x, pp.z, 1.4);
          }
          this.ringOf.set(src, { n, r: m.r ?? 7 });
        } else if (pg === 2) {
          this.at('hk_phong_warn', 'hk_phong', c.x, c.z, 14, { yaw, delay: m.d ?? 3, src });
          // Dòng cột sáng chạy xuyên sân theo chiều gió (lặp lại suốt thời gian báo): đọc hướng gió bằng chuyển động, không cần chữ.
          const t0 = performance.now();
          const dx = m.ox ?? 0;
          const dz = m.oz ?? 0;
          for (let k = 0; k < 6; k++)
            this.glowFn(
              src,
              `phw${k}`,
              hexOf('hk_phong', 'rim'),
              () => {
                const u = ((((performance.now() - t0) / 1000) * 9 + k * 4) % 24) - 12;
                const side = (k % 2 ? 1 : -1) * 1.6;
                const px = c.x + dx * u + dz * side;
                const pz = c.z + dz * u - dx * side;
                return { x: px, y: this.env.ground(px, pz), z: pz };
              },
              { h: 3.6, r: 1.7, dur: m.d ?? 3, opacity: 0.7, thick: 2.6 },
            );
          const rg = this.ringOf.get(src) ?? { n: 3, r: 7 };
          // Chỗ nấp: ngay sau từng trụ theo chiều gió.
          for (let i = 0; i < rg.n; i++) {
            const pp = hkRingPos(c, rg.r, i, rg.n);
            this.glow(src, `phs${i}`, hexOf('hk_phong', 'accent'), {
              x: pp.x + (m.ox ?? 0) * 2.2,
              z: pp.z + (m.oz ?? 0) * 2.2,
              h: 5,
              r: 1.9,
              dur: m.d ?? 3,
              opacity: 0.45,
              pulse: 10,
            });
          }
        } else if (pg === 3 || pg === 4) {
          this.dropGlow(src, 'phs');
          this.dropGlow(src, 'phw');
          this.at('hk_phong_blow', 'hk_phong', c.x, c.z, 14, { yaw, src });
          this.on(pg === 3 ? 'hk_phong_safe' : 'hk_phong_hit', 'hk_phong', src);
        } else {
          this.dropLoops(src, 'pil');
          this.dropGlow(src, 'phs');
        }
        break;
      }
      case 'loi': {
        const i = m.n ?? -1;
        if (i < 0) {
          this.dropLoops(src, 'rod');
          this.dropGlow(src, 'rod');
        } else if (pg === 1) {
          this.setLoop(src, `rod${i}`, 'hk_loi_rod', 'hk_loi', x, z, 2.2);
          this.glow(src, `rod${i}`, hexOf('hk_loi', 'body'), { x, z, h: 9, r: 1.8, dur: 60, opacity: 0.4 });
        } else if (pg === 2) {
          this.at('hk_loi_zap', 'hk_loi', x, z, 3, { src });
          this.setLoop(src, `rod${i}`, 'hk_loi_hot', 'hk_loi', x, z, m.r ?? 4.5);
          this.glow(src, `rod${i}`, hexOf('hk_loi', 'accent'), { x, z, h: 6, r: m.r ?? 4.5, dur: m.d ?? 9, opacity: 0.3, pulse: 12 });
        } else this.at('hk_loi_boom', 'hk_loi', x, z, m.r ?? 4.5, { src });
        break;
      }
      case 'ly':
        if (pg === 1) {
          this.setLoop(src, 'ly', 'hk_ly_seal', 'hk_tram_ly', x, z, m.r ?? 6);
          this.glow(src, 'ly', hexOf('hk_tram_ly', 'body'), { x, z, h: 7, r: 1.4, dur: 60, opacity: 0.35 });
        } else {
          this.dropLoops(src, 'ly');
          this.dropGlow(src, 'ly');
        }
        break;
      case 'huyet':
        if (pg === 1) {
          this.lastShadow = { x, y: this.env.ground(x, z), z };
          this.at('hk_huyet_spawn', 'hk_huyet_anh', x, z, 3, { src });
        } else if (pg === 2) {
          const s = this.lastShadow;
          this.on('hk_huyet_kill', 'hk_huyet_anh', src, { tgt: s ? { ...s, chest: 1 } : null });
        }
        break;
      case 'van':
        if (pg === 1) {
          // Các ấn trông giống nhau và cùng quay quanh tâm (`hkVanSpinAngle`): lúc đổi chỗ người chơi bám mắt theo ấn vừa sáng.
          const n = m.n ?? 3;
          const rr = m.r ?? 7;
          const v = { shift: 0, t0: 0, dur: 1 };
          this.vanOf.set(src, v);
          for (let i = 0; i < n; i++)
            this.glowFn(
              src,
              `an${i}`,
              hexOf('hk_van_tam', 'body'),
              () => {
                const a = (i * Math.PI * 2) / n + hkVanSpinAngle(v.shift, n, (performance.now() - v.t0) / 1000, v.dur);
                const px = x + Math.sin(a) * rr;
                const pz = z + Math.cos(a) * rr;
                return { x: px, y: this.env.ground(px, pz), z: pz };
              },
              { h: 5, r: m.lv ?? 2.6, dur: 60, opacity: 0.55, thick: 2.2 },
            );
        } else if (pg === 2) {
          // Lượt mới: vòng về góc gốc (các ấn giống nhau nên không thấy giật), rồi ấn thật sáng lên.
          const v = this.vanOf.get(src);
          if (v) v.shift = 0;
          this.at('hk_van_true', 'hk_van_tam', x, z, m.r ?? 2.6, { delay: m.d ?? 1.4, src });
          this.glow(src, 'antrue', hexOf('hk_van_tam', 'accent'), { x, z, h: 11, r: m.r ?? 2.6, dur: m.d ?? 1.4, opacity: 0.6, pulse: 14 });
        } else if (pg === 3) {
          this.dropGlow(src, 'antrue');
          const v = this.vanOf.get(src);
          if (v) {
            v.shift = m.n ?? 0;
            v.t0 = performance.now();
            v.dur = Math.max(0.4, (m.d ?? 3) * HK_VAN_SPIN_FRAC);
          }
          this.at('hk_van_spin', 'hk_van_tam', c.x, c.z, 7, { src });
        } else if (pg === 4) this.at('hk_van_ok', 'hk_van_tam', x, z, m.r ?? 2.6, { src });
        else if (pg === 5) {
          // Sai: lộ lại ấn thật một nhịp để biết mình nhầm ở đâu.
          this.at('hk_van_true', 'hk_van_tam', x, z, m.r ?? 2.6, { delay: 0.9, src });
          this.on('hk_van_bad', 'hk_van_tam', src);
        } else {
          this.dropGlow(src, 'an');
          this.vanOf.delete(src);
        }
        break;
      case 'tuc':
        if (pg === 1) this.on('hk_tuc_beat', 'hk_kho_than', src, { delay: Math.max(0.3, m.d ?? 2.9) });
        else if (pg === 2) this.on('hk_tuc_good', 'hk_kho_than', src);
        else if (pg === 3 || pg === 4) this.on('hk_tuc_bad', 'hk_kho_than', src);
        break;
      case 'chau': {
        const i = m.n ?? -1;
        if (i < 0) {
          this.dropLoops(src, 'chau');
          this.dropGlow(src, 'chau');
          break;
        }
        const old = this.loops.get(`${src}:chau${i}`);
        if (pg === 1) {
          this.setLoop(src, `chau${i}`, 'hk_chau', 'hk_hon_tho', x, z, m.r ?? 1.8);
          this.glow(src, `chau${i}`, hexOf('hk_hon_tho', 'body'), {
            x,
            z,
            h: 3.2,
            r: 1.8,
            dur: m.d ?? 6,
            opacity: 0.6,
            pulse: 6,
            thick: 1.5,
          });
        } else {
          this.loops.delete(`${src}:chau${i}`);
          this.dropGlow(src, `chau${i}`);
          this.at(pg === 2 ? 'hk_chau_get' : 'hk_chau_gone', 'hk_hon_tho', old?.x ?? x, old?.z ?? z, 1.8, { src });
        }
        break;
      }
      case 'luan':
        if (pg === 1) {
          this.setLoop(src, 'luan', 'hk_luan_wheel', 'hk_luan_hoi', x, z, m.r ?? 13);
          // Cung sinh: ba cột sáng dọc giữa cung, chạy mượt theo góc `ox + oz × t` server báo.
          const t0 = performance.now();
          const th0 = m.ox ?? 0;
          const w = m.oz ?? 0;
          for (const [k, rr] of [3, 5.5, 8].entries()) {
            this.glowFn(
              src,
              `luan${k}`,
              hexOf('hk_luan_hoi', 'rim'),
              () => {
                const th = hkLuanAngle(th0, w, (performance.now() - t0) / 1000);
                const px = x + Math.sin(th) * rr;
                const pz = z + Math.cos(th) * rr;
                return { x: px, y: this.env.ground(px, pz), z: pz };
              },
              { h: 7 - k, r: 2.2, dur: (m.d ?? 5) + 0.4, opacity: 0.5 },
            );
          }
        } else if (pg === 2) this.at('hk_luan_warn', 'hk_luan_hoi', c.x, c.z, 13, { delay: m.d ?? 1.2, src });
        else if (pg === 3 || pg === 4) {
          this.at('hk_luan_grind', 'hk_luan_hoi', c.x, c.z, 13, { src });
          if (pg === 4) this.on('hk_phong_hit', 'hk_luan_hoi', src);
        } else {
          this.dropLoops(src, 'luan');
          this.dropGlow(src, 'luan');
        }
        break;
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
    return !!this.key && this.key.intensity > 0;
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
    this.key?.removeFromParent();
    this.rim?.removeFromParent();
    this.key?.dispose();
    this.rim?.dispose();
    this.key = this.rim = null;
  }
}
