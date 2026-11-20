// Bot chơi Thiên Nhân Ngũ Suy (TN-4) qua mạng thật: chỉ biết những gì client thấy (trạng thái room, FX `suy`/`suymark`, vạch báo),
// tự đi, tự bấm ngưng thần, tự ra chiêu. Dùng bởi arena-e2e.ts (`ngu_suy`) để chứng minh năm ải qua được bằng thao tác qua giao thức thật.
import type { Room } from 'colyseus.js';
import { C, MS_DEAD, S, suySectorYaw, type FxMsg } from '@dtl/shared';

interface PlayerView {
  x: number;
  z: number;
  fl: number;
}
interface MonView {
  t: string;
  x: number;
  z: number;
  st: number;
}

interface Pt {
  x: number;
  z: number;
}

export interface SuyBot {
  stop(): void;
  /** Ải (cơ chế `suy_*`) bot đã thấy, theo thứ tự. */
  seen: string[];
  /** Thanh suy khí cao nhất bot thấy ở từng ải. */
  peak: Record<string, number>;
  /** Ghi chú gỡ lỗi (nhịp phá vọng trúng/trượt, số đòn đã gửi). */
  notes: string[];
}

export function runSuyBot(room: Room, sid: string): SuyBot {
  const out: SuyBot = { stop: () => clearInterval(timer), seen: [], peak: {}, notes: [] };
  let stage = '';
  let mode = 0;
  let anchor: Pt | null = null;
  let spring: Pt | null = null;
  let toi: Pt | null = null;
  let safe: Pt | null = null;
  const lamps = new Map<number, Pt & { lit: boolean; aim: boolean }>();
  let struck = false;
  let revealAt = 0;
  let castAt = 0;
  let seq = 0;
  let yaw = 0;

  room.onMessage(S.FX, (m: FxMsg) => {
    if (m.src !== sid) return;
    if (m.t === 'suy') {
      if ((m.pg ?? 0) < 0) {
        stage = '';
        spring = toi = safe = null;
        lamps.clear();
        return;
      }
      if (m.s && m.s !== stage) {
        stage = m.s;
        out.seen.push(stage);
        spring = toi = safe = null;
        lamps.clear();
        mode = 0;
        if (m.x !== undefined && m.z !== undefined) anchor = { x: m.x, z: m.z };
      }
      if (m.n !== undefined && m.n !== mode) {
        mode = m.n;
        struck = false;
      }
      out.peak[stage] = Math.max(out.peak[stage] ?? 0, m.pg ?? 0);
      return;
    }
    if (m.t !== 'suymark') return;
    const at: Pt = { x: m.x ?? 0, z: m.z ?? 0 };
    if (m.s === 'nhan') spring = m.pg ? at : null;
    else if (m.s === 'toi') toi = m.pg === 1 ? at : null;
    else if (m.s === 'den') {
      const i = m.n ?? 0;
      if (i < 0) return lamps.clear();
      const cur = lamps.get(i) ?? { ...at, lit: true, aim: false };
      // 1 cháy, 0 tắt, 2 suy phong đang nhắm (tới trước chờ sẵn), 3 đang thắp.
      if (m.pg === 1) lamps.set(i, { ...cur, ...at, lit: true, aim: false });
      else if (m.pg === 0) lamps.set(i, { ...cur, lit: false, aim: false });
      else if (m.pg === 2) lamps.set(i, { ...cur, ...at, aim: true });
    } else if (m.s === 'thuc') {
      if (m.pg === 3) revealAt = Date.now() + 150;
      else if (m.pg === 1 && m.lv) {
        revealAt = 0;
        // Đợt đã soi: tìm một cung yên (bit 0) gần mình nhất, đứng giữa cung cách tâm 5 m.
        const me = self();
        let best: Pt | null = null;
        let bestD = Number.POSITIVE_INFINITY;
        for (let i = 0; i < m.lv; i++) {
          if (((m.n ?? 0) & (1 << i)) !== 0) continue;
          const a = suySectorYaw(i, m.lv);
          const p = { x: at.x + Math.sin(a) * 5, z: at.z + Math.cos(a) * 5 };
          const d = me ? Math.hypot(p.x - me.x, p.z - me.z) : 0;
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        safe = best;
      } else if (m.pg === 0) {
        safe = null;
        revealAt = 0;
      }
    } else if (m.s === 'tam') {
      if (m.pg === 1) struck = true;
      out.notes.push(m.pg === 1 ? 'phá vọng trúng' : m.pg === 2 ? 'lỡ nhịp' : 'động niệm');
    }
  });

  const self = (): PlayerView | undefined => (room.state as { players?: Map<string, PlayerView> }).players?.get(sid);
  const shadow = (): { id: string; m: MonView } | null => {
    let found: { id: string; m: MonView } | null = null;
    (room.state as { monsters?: Map<string, MonView> }).monsters?.forEach((m, id) => {
      if (!found && m.t === 'mon_tam_ma' && m.st !== MS_DEAD) found = { id, m };
    });
    return found;
  };

  /** Gửi một nhịp input: đi về `to` (đứng yên nếu đã tới nơi hoặc không có đích). Hướng tiến của server = (-sin yaw, -cos yaw). */
  const go = (me: PlayerView, to: Pt | null, stopAt = 0.5): void => {
    let mz = 0;
    if (to) {
      const dx = to.x - me.x;
      const dz = to.z - me.z;
      if (Math.hypot(dx, dz) > stopAt) {
        yaw = Math.atan2(-dx, -dz);
        mz = 1;
      }
    }
    room.send(C.INPUT, { s: ++seq, mx: 0, mz, yaw, f: 0 });
  };

  const timer = setInterval(() => {
    const me = self();
    if (!me) return;
    const now = Date.now();
    switch (stage) {
      case 'suy_linh':
        return go(me, spring);
      case 'suy_the':
        return go(me, toi);
      case 'suy_thuc':
        // Bấm ngưng thần khi có đợt đang tụ; còn hồi chiêu thì bấm lại mỗi 300 ms cho tới khi đợt hiện vạch (hoặc đã nổ).
        if (revealAt && now >= revealAt) {
          revealAt = now + 300;
          room.send(C.TRIB_SOUL, {});
        }
        return go(me, safe ?? anchor);
      case 'suy_tho': {
        // Ưu tiên ngọn đã tắt gần nhất; không có thì tới ngọn suy phong đang nhắm để thắp ngay khi nó tắt; đủ đèn thì về tâm.
        let best: Pt | null = null;
        let bestD = Number.POSITIVE_INFINITY;
        for (const l of lamps.values()) {
          if (l.lit) continue;
          const d = Math.hypot(l.x - me.x, l.z - me.z);
          if (d < bestD) {
            bestD = d;
            best = l;
          }
        }
        if (!best) for (const l of lamps.values()) if (l.aim) best = l;
        return go(me, best ?? anchor, 1);
      }
      case 'suy_tam': {
        const sh = shadow();
        if (mode === 1 && !struck && sh) {
          // Nhịp phá vọng: đứng lại ra một đòn đánh thường (có hồi chung 1 giây nên thưa nhịp gửi).
          if (now >= castAt) {
            castAt = now + 350;
            room.send(C.SKILL, { id: 'skl_phi_kiem', t: sh.id });
            out.notes.push('gửi đòn');
          }
          return go(me, null);
        }
        // Lúc tĩnh: không ra tay, chỉ lánh bóng (chạy thẳng ra xa nó khi nó áp sát; bóng chậm hơn người).
        if (sh) {
          const dx = me.x - sh.m.x;
          const dz = me.z - sh.m.z;
          const d = Math.hypot(dx, dz) || 1;
          if (d < 12) {
            // Chạy vòng quanh tâm ải thay vì chạy thẳng mãi ra khỏi sân.
            const c = anchor ?? me;
            const ax = me.x - c.x;
            const az = me.z - c.z;
            const ar = Math.hypot(ax, az) || 1;
            const out2 = ar > 14 ? -0.6 : 0.3;
            const tx = -az / ar + (ax / ar) * out2 + (dx / d) * 0.8;
            const tz = ax / ar + (az / ar) * out2 + (dz / d) * 0.8;
            return go(me, { x: me.x + tx * 4, z: me.z + tz * 4 });
          }
        }
        return go(me, null);
      }
      default:
        return go(me, null);
    }
  }, 50);
  return out;
}
