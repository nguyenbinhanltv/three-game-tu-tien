// Thần thức (E2-E). Server quyết định hết: mở ở Kết Đan sơ kỳ (cấp 20), giữ phím V 2,5 giây (client chỉ gửi ý định `on`),
// hủy khi di chuyển/bị đánh/chết/độ kiếp; quét xong mới tốn linh lực và vào hồi chiêu 20 s. Kết quả (tinh anh, thủ lĩnh, quái,
// điểm hái, người chơi, điểm đáng chú ý trong phạm vi) do server dựng từ trạng thái thật rồi gửi riêng người quét; client chỉ vẽ.
// Sim chỉ nối (xem `GameSim.spirit`). Không đụng túi/tiền nên không có ledger.

import {
  MS_DEAD,
  PF_DEAD,
  S,
  SPIRIT_CD_MS,
  SPIRIT_CHANNEL_MS,
  SPIRIT_CMD_GAP_MS,
  SPIRIT_MAX_HITS,
  SPIRIT_MOVE_CANCEL,
  SPIRIT_MP,
  SPIRIT_REVEAL_MS,
  spiritRadius,
  spiritUnlocked,
  type PoiDef,
  type SpiritCmd,
  type SpiritHit,
  type SpiritScanMsg,
  type SpiritStateMsg,
} from '@dtl/shared';
import type { MonEnt, PlayerEnt } from './sim';

export interface SpiritHost {
  now(): number;
  players(): Iterable<PlayerEnt>;
  monsters(): readonly MonEnt[];
  /** Điểm hái đang có (còn mọc). */
  nodes(): Iterable<{ id: string; s: { t: string; x: number; z: number; on: boolean } }>;
  pois(): readonly PoiDef[];
  /** Cùng tổ đội hoặc đối thủ tỉ thí: không lộ lên bản quét như người lạ (đã thấy sẵn). */
  isMate(a: PlayerEnt, b: PlayerEnt): boolean;
  inDuel(p: PlayerEnt): boolean;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
  stopMeditate(p: PlayerEnt): void;
  /** Quét xong (E2-H: nhiệm vụ `scan` đọc bản quét). */
  onScanned?(p: PlayerEnt, hits: readonly SpiritHit[]): void;
}

interface Channel {
  until: number;
  x: number;
  z: number;
  /** `lastCombatAt` lúc bắt đầu: đổi tức là vừa trúng đòn/ra đòn. */
  combatAt: number;
}

/** Nhịp kiểm tra tiến độ (ms). */
const STEP_MS = 100;

/** Hồi chiêu theo nhân vật, sống ở cấp tiến trình để đổi room không xóa được hồi chiêu. */
const cdUntil = new Map<number, number>();

export class SpiritSystem {
  private chans = new Map<string, Channel>();
  private cmdAt = new Map<string, number>();
  private stepAt = 0;

  constructor(private h: SpiritHost) {}

  /** Trạng thái gửi client (khi vào room, bắt đầu/hết quét, đổi cấp). */
  sendState(p: PlayerEnt): void {
    if (!p.connected) return;
    const now = this.h.now();
    const c = this.chans.get(p.sid);
    p.client.send(S.SPIRIT_STATE, {
      open: spiritUnlocked(p.char.level),
      ch: c ? Math.max(0, c.until - now) : 0,
      cd: Math.max(0, (cdUntil.get(p.char.id) ?? 0) - now),
      r: spiritRadius(p.char.level),
    } satisfies SpiritStateMsg);
  }

  drop(p: PlayerEnt): void {
    this.chans.delete(p.sid);
    this.cmdAt.delete(p.sid);
  }

  /** Lý do chưa vận được (khóa i18n `sys.spirit_*`), '' nếu được. */
  private blocker(p: PlayerEnt): string {
    if (!spiritUnlocked(p.char.level)) return 'sys.spirit_locked';
    if ((p.s.fl & PF_DEAD) !== 0) return 'sys.dead';
    if (p.trib || p.trial || this.h.inDuel(p) || p.casting) return 'sys.spirit_busy';
    return '';
  }

  command(p: PlayerEnt, msg: unknown): void {
    const m = (msg ?? {}) as Partial<SpiritCmd>;
    const now = this.h.now();
    // Thả phím không bao giờ bị giãn (chạm nhanh vẫn hủy được); chỉ giãn lệnh bắt đầu.
    if (m.on === true) {
      if (now - (this.cmdAt.get(p.sid) ?? 0) < SPIRIT_CMD_GAP_MS) return;
      this.cmdAt.set(p.sid, now);
    }
    if (m.on !== true) {
      // Thả phím: hủy nếu chưa quét xong (không tốn gì, không hồi chiêu).
      if (this.chans.delete(p.sid)) {
        this.h.sys(p, 'sys.spirit_cancel', undefined, 'info');
        this.sendState(p);
      }
      return;
    }
    if (this.chans.has(p.sid)) return;
    const why = this.blocker(p);
    if (why) return this.h.warn(p, why);
    const left = (cdUntil.get(p.char.id) ?? 0) - now;
    if (left > 0) return this.h.warn(p, 'sys.spirit_cd', { s: Math.ceil(left / 1000) });
    if (p.char.mp < SPIRIT_MP) return this.h.warn(p, 'sys.spirit_mp');
    this.h.stopMeditate(p);
    this.chans.set(p.sid, { until: now + SPIRIT_CHANNEL_MS, x: p.move.x, z: p.move.z, combatAt: p.lastCombatAt });
    this.h.sys(p, 'sys.spirit_start', undefined, 'info');
    this.sendState(p);
  }

  /** Gọi mỗi tick của sim; tự giãn còn mỗi `STEP_MS`. */
  tick(): void {
    const now = this.h.now();
    if (now - this.stepAt < STEP_MS) return;
    this.stepAt = now;
    for (const [sid, c] of this.chans) {
      const p = [...this.h.players()].find((o) => o.sid === sid);
      if (!p || !p.connected) {
        this.chans.delete(sid);
        continue;
      }
      const moved = Math.hypot(p.move.x - c.x, p.move.z - c.z) > SPIRIT_MOVE_CANCEL;
      const hit = p.lastCombatAt !== c.combatAt || this.blocker(p) !== '';
      if (moved || hit) {
        this.chans.delete(sid);
        this.h.sys(p, moved ? 'sys.spirit_moved' : 'sys.spirit_cancel', undefined, 'bad');
        this.sendState(p);
        continue;
      }
      if (now >= c.until) this.finish(p);
    }
  }

  private finish(p: PlayerEnt): void {
    this.chans.delete(p.sid);
    const now = this.h.now();
    // Linh lực có thể đã tụt trong lúc vận (đòn hút linh lực...): kiểm lại lần cuối.
    if (p.char.mp < SPIRIT_MP) {
      this.h.warn(p, 'sys.spirit_mp');
      return this.sendState(p);
    }
    p.char.mp -= SPIRIT_MP;
    cdUntil.set(p.char.id, now + SPIRIT_CD_MS);
    const r = spiritRadius(p.char.level);
    const hits = this.scan(p, r);
    p.client.send(S.SPIRIT_SCAN, { x: round1(p.move.x), z: round1(p.move.z), r, ttl: SPIRIT_REVEAL_MS, hits } satisfies SpiritScanMsg);
    this.h.onScanned?.(p, hits);
    if (hits.length) this.h.sys(p, 'sys.spirit_done', { r, n: hits.length }, 'good');
    else this.h.sys(p, 'sys.spirit_none', { r }, 'info');
    this.sendState(p);
  }

  /** Dựng danh sách điểm lộ ra trong bán kính `r` quanh người quét: gần nhất trước, tối đa `SPIRIT_MAX_HITS`, boss/tinh anh luôn được giữ. */
  scan(p: PlayerEnt, r: number): SpiritHit[] {
    const px = p.move.x;
    const pz = p.move.z;
    const r2 = r * r;
    const out: (SpiritHit & { d: number; w: number })[] = [];
    const add = (h: SpiritHit, w: number) => {
      const d = (h.x - px) ** 2 + (h.z - pz) ** 2;
      if (d <= r2) out.push({ ...h, x: round1(h.x), z: round1(h.z), d, w });
    };
    for (const m of this.h.monsters()) {
      if (m.state === MS_DEAD || m.owner) continue;
      // Quái chui đất (E1-E) vẫn lộ: thần thức thấy được thứ mắt không thấy.
      const k = m.def.boss ? 'boss' : m.def.elite ? 'elite' : 'mon';
      add({ k, x: m.s.x, z: m.s.z, n: m.def.id, lv: m.level }, k === 'boss' ? 0 : k === 'elite' ? 1 : 4);
    }
    for (const n of this.h.nodes()) if (n.s.on) add({ k: 'node', x: n.s.x, z: n.s.z, n: n.s.t }, 3);
    for (const o of this.h.players()) {
      if (o === p || !o.connected || (o.s.fl & PF_DEAD) !== 0 || this.h.isMate(p, o)) continue;
      add({ k: 'player', x: o.move.x, z: o.move.z, n: o.char.name }, 2);
    }
    for (const poi of this.h.pois()) add({ k: 'poi', x: poi.x, z: poi.z, n: poi.id }, 5);
    out.sort((a, b) => a.w - b.w || a.d - b.d);
    // Giữ chỗ cho loại hiếm trước: cắt theo (độ hiếm, khoảng cách) rồi trả theo khoảng cách cho dễ đọc.
    return out
      .slice(0, SPIRIT_MAX_HITS)
      .sort((a, b) => a.d - b.d)
      .map(({ d: _d, w: _w, ...h }) => h);
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10;
