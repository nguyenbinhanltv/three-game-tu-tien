// Hiệu ứng của Thiên Nhân Ngũ Suy (TN-4): phát dòng thời gian `data/fx/suy_*.json` (sinh bằng `tools/vfx/gen-fx-suy.py`) bằng `FxRunner.startAt`
// tại đúng điểm server báo qua FX `suy` / `suymark` / `suyok`. Chỉ là lớp hình: thanh suy khí, ai trúng, ải qua hay trượt đều do server quyết định.
//
// Vật tồn tại lâu mà chỉ server biết khi nào hết (Linh Nhãn, Thọ Đăng) là VÒNG LẶP: phát lại timeline mỗi `LOOP` giây, nên khi trạng thái đổi
// (đèn tắt, Linh Nhãn dời, ải kết thúc, kiếp thất bại) chỉ cần ngừng phát là hình tự tan trong ≤ 1 giây, không sót lại trên sân.
import { SUY_FX } from '@dtl/content';
import { suySectorYaw, type FxMsg, type FxTimeline } from '@dtl/shared';
import type { FxCaster, FxRunner, FxTarget } from './fxTimeline';

/** Chu kỳ phát lại vòng lặp (giây); timeline vòng lặp sống 1,08 s nên hai vòng gối nhau. */
const LOOP = 1;
/** Sau từng này giây không thấy cờ độ kiếp của chủ thì coi như kiếp đã hết (lỡ tin khép ải) và dọn vòng lặp. */
const ORPHAN_SEC = 2;

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

export interface SuyFxEnv {
  /** Nhân vật `sid` (vị trí chân, hướng); undefined nếu ngoài tầm nhìn. */
  player(sid: string): FxCaster | undefined;
  ground(x: number, z: number): number;
  /** `sid` còn đang độ kiếp (cờ PF_TRIBULATION)? */
  tribOn(sid: string): boolean;
  /** Tâm Ma Ảnh đang sống trong tầm nhìn (để đặt vết chém phá vọng). */
  shadow(): { x: number; y: number; z: number } | null;
}

const palOf = (stage: string | undefined): string => (stage && stage.startsWith('suy_') ? stage : 'suy_linh');

export class SuyFx {
  private loops = new Map<string, Loop>();
  /** Ải (cơ chế) đang chạy của từng người và tâm ải. */
  private stage = new Map<string, { id: string; x: number; z: number; mode: number }>();
  private offSince = new Map<string, number>();
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

  /** Phát `key` tại điểm (x, z) trên mặt đất; `yaw` cho hình có hướng (cung lôi ẩn), `delay` cho sự kiện `untilDelay`. */
  private at(key: string, pal: string, x: number, z: number, r: number, o: { yaw?: number; delay?: number } = {}): void {
    const tl = this.tl(key);
    if (!tl) return;
    const y = this.env.ground(x, z);
    this.runner.startAt(tl, { actor: { x, y, z, yaw: o.yaw ?? 0, model: {} }, palette: pal, area: { x, z, r }, delay: o.delay });
    this.note(key);
  }

  /** Phát `key` bám theo nhân vật `sid` (vầng kiếm phá vọng, vòng ngưng thần); `tgt` = điểm trúng. */
  private on(key: string, pal: string, sid: string, o: { delay?: number; tgt?: FxTarget | null } = {}): void {
    const tl = this.tl(key);
    const actor = this.env.player(sid);
    if (!tl || !actor) return;
    this.runner.startAt(tl, { actor, palette: pal, area: { x: actor.x, z: actor.z, r: 3 }, delay: o.delay, tgt: o.tgt });
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

  /** Dọn mọi thứ của `src` (kiếp mới bắt đầu, ải khép, rời room). */
  clear(src: string): void {
    this.dropLoops(src);
    this.stage.delete(src);
    this.offSince.delete(src);
  }

  /** FX `suy`: thanh suy khí. Tin đầu ải mang tâm ải (x, z): dựng thẻ ấn vào ải; `pg` < 0 khép ải; 100 = suy khí công tâm (thất bại). */
  bar(m: FxMsg): void {
    const src = m.src ?? '';
    if ((m.pg ?? 0) < 0) {
      this.dropLoops(src);
      this.stage.delete(src);
      return;
    }
    const id = m.s ?? '';
    const cur = this.stage.get(src);
    if (!cur || cur.id !== id) {
      this.dropLoops(src);
      const p = this.env.player(src);
      const x = m.x ?? p?.x ?? 0;
      const z = m.z ?? p?.z ?? 0;
      this.stage.set(src, { id, x, z, mode: 0 });
      this.at('suy_enter_' + id.slice(4), palOf(id), x, z, 6);
    }
    const st = this.stage.get(src)!;
    if (m.pg === 100) {
      const p = this.env.player(src);
      this.at('suy_fail', palOf(id), p?.x ?? st.x, p?.z ?? st.z, 4);
    }
    // Đạo Tâm Suy: nhịp phá vọng mở thì vầng kiếm hiện đúng `d` giây.
    if (id === 'suy_tam' && m.n !== undefined && m.n !== st.mode) {
      st.mode = m.n;
      if (m.n === 1) this.on('suy_tam_open', palOf(id), src, { delay: m.d ?? 3 });
    }
  }

  /** FX `suyok`: qua một ải. */
  ok(m: FxMsg): void {
    const src = m.src ?? '';
    const p = this.env.player(src);
    if (!p) return;
    this.at('suy_ok', palOf(this.stage.get(src)?.id), p.x, p.z, 4);
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
        if (old) this.at('suy_nhan_end', 'suy_linh', old.x, old.z, old.r);
        this.dropLoops(src, 'nhan');
        if (pg === 1) {
          this.at('suy_nhan_open', 'suy_linh', x, z, r);
          this.setLoop(src, 'nhan', 'suy_nhan', 'suy_linh', x, z, r);
        }
        break;
      }
      case 'toi':
        if (pg === 1) this.at('suy_toi_warn', 'suy_the', x, z, r, { delay: m.d ?? 2 });
        else this.at(pg === 2 ? 'suy_toi_hit' : 'suy_toi_miss', 'suy_the', x, z, r);
        break;
      case 'thuc':
        if (pg === 3) this.at('suy_thuc_brew', 'suy_thuc', x, z, r, { delay: m.d ?? 3 });
        else if (pg === 1) this.on('suy_thuc_pulse', 'suy_thuc', src);
        else if (pg === 2) this.on('suy_thuc_void', 'suy_thuc', src);
        else if (m.lv) {
          for (let i = 0; i < m.lv; i++)
            if (((m.n ?? 0) & (1 << i)) !== 0) this.at('suy_thuc_boom', 'suy_thuc', x, z, r, { yaw: suySectorYaw(i, m.lv) });
        }
        break;
      case 'den': {
        const i = m.n ?? 0;
        if (i < 0) return this.dropLoops(src, 'den');
        const slot = `den${i}`;
        const was = this.loops.get(`${src}:${slot}`)?.tl;
        if (pg === 1) {
          if (was === 'suy_den_dark') this.at('suy_den_relit', 'suy_tho', x, z, r);
          this.setLoop(src, slot, 'suy_den_lit', 'suy_tho', x, z, r);
        } else if (pg === 0) {
          if (was === 'suy_den_lit') this.at('suy_den_out', 'suy_tho', x, z, r);
          this.setLoop(src, slot, 'suy_den_dark', 'suy_tho', x, z, r);
        } else if (pg === 2) this.at('suy_den_gust', 'suy_tho', x, z, r, { delay: m.d ?? 1.5 });
        else if (pg === 3) this.at('suy_den_light', 'suy_tho', x, z, r, { delay: m.d ?? 1.2 });
        break;
      }
      case 'tam': {
        if (pg === 1) {
          const s = this.env.shadow();
          this.on('suy_tam_good', 'suy_tam', src, { tgt: s ? { x: s.x, y: s.y, z: s.z, chest: 1.0 } : null });
        } else this.on(pg === 2 ? 'suy_tam_miss' : 'suy_tam_bad', 'suy_tam', src);
        break;
      }
    }
  }

  /** Mỗi khung: phát lại vòng lặp tới hạn; chủ hết độ kiếp (lỡ tin khép ải) thì dọn. */
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
    for (const l of this.loops.values()) {
      if (now < l.next) continue;
      l.next = now + LOOP;
      this.at(l.tl, l.pal, l.x, l.z, l.r);
    }
  }

  /** Số vòng lặp đang chạy (test, bảng dev). */
  get live(): number {
    return this.loops.size;
  }

  dispose(): void {
    this.loops.clear();
    this.stage.clear();
    this.offSince.clear();
  }
}
