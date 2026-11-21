// Bot chơi Huyền Kiếp (TN-6) qua mạng thật: chỉ biết những gì client thấy (trạng thái room, FX `suy`/`hkmark`, vạch báo S.HAZARD),
// tự đi, tự bấm điều tức, tự ra chiêu. Dùng bởi arena-e2e.ts (`huyen_ngoai|huyen_noi|huyen_hon`) để chứng minh chín kiếp qua được bằng thao tác.
import type { Room } from 'colyseus.js';
import { C, MS_DEAD, S, hkInRect, hkLuanAngle, hkRingPos, hkSealAfter, type FxMsg, type HazardMsg } from '@dtl/shared';
import type { SuyBot } from './suy-bot';

interface PlayerView {
  x: number;
  z: number;
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

export function runHkBot(room: Room, sid: string): SuyBot {
  const out: SuyBot = { stop: () => clearInterval(timer), seen: [], peak: {}, notes: [] };
  let stage = '';
  let pg = 0;
  let anchor: Pt | null = null;
  let target: Pt | null = null;
  // Phong: trụ + hướng gió đang báo. Lôi: trụ nguội/nóng. Vấn Tâm: vòng ấn + ấn thật. Hồn Thọ: châu. Luân Hồi: bánh xe. Trảm Ly: vạch đang chờ.
  let ring = { n: 3, r: 7 };
  const rods = new Map<number, Pt & { hot: boolean }>();
  let seal = -1;
  const orbs = new Map<number, Pt & { until: number }>();
  let wheel: { th: number; w: number; t0: number } | null = null;
  const cuts: { ox: number; oz: number; yaw: number; len: number; w: number; until: number }[] = [];
  let beatTimer: ReturnType<typeof setTimeout> | null = null;
  let castAt = 0;
  let seq = 0;
  let yaw = 0;

  const self = (): PlayerView | undefined => (room.state as { players?: Map<string, PlayerView> }).players?.get(sid);
  const shadow = (): string => {
    let id = '';
    (room.state as { monsters?: Map<string, MonView> }).monsters?.forEach((m, k) => {
      if (!id && m.t === 'mon_tam_ma' && m.st !== MS_DEAD) id = k;
    });
    return id;
  };
  const nearest = <T extends Pt>(me: Pt, list: T[]): T | null =>
    list.reduce<T | null>((b, o) => (!b || Math.hypot(o.x - me.x, o.z - me.z) < Math.hypot(b.x - me.x, b.z - me.z) ? o : b), null);

  room.onMessage(S.HAZARD, (h: HazardMsg) => {
    // Vạch kiếm vô hình của Trảm Ly (không có `src`, hình chữ nhật).
    if (stage === 'hk_tram_ly' && h.sh === 'rect' && !h.src)
      cuts.push({ ox: h.x, oz: h.z, yaw: h.yaw ?? 0, len: h.r, w: h.w ?? 2.6, until: Date.now() + h.delay * 1000 + 150 });
  });

  room.onMessage(S.FX, (m: FxMsg) => {
    if (m.src !== sid) return;
    if (m.t === 'suy') {
      if ((m.pg ?? 0) < 0) {
        stage = '';
        target = null;
        return;
      }
      if (m.s && m.s !== stage) {
        stage = m.s;
        out.seen.push(stage);
        target = null;
        rods.clear();
        orbs.clear();
        cuts.length = 0;
        wheel = null;
        seal = -1;
        if (m.x !== undefined && m.z !== undefined) anchor = { x: m.x, z: m.z };
      }
      pg = m.pg ?? 0;
      out.peak[stage] = Math.max(out.peak[stage] ?? 0, pg);
      return;
    }
    if (m.t !== 'hkmark' || !anchor) return;
    const at: Pt = { x: m.x ?? 0, z: m.z ?? 0 };
    const p = m.pg ?? 0;
    switch (m.s) {
      case 'phong':
        if (p === 1) ring = { n: m.n ?? 3, r: m.r ?? 7 };
        else if (p === 2) {
          const me = self() ?? anchor;
          const spots = Array.from({ length: ring.n }, (_, i) => {
            const pp = hkRingPos(anchor!, ring.r, i, ring.n);
            return { x: pp.x + (m.ox ?? 0) * 2.2, z: pp.z + (m.oz ?? 0) * 2.2 };
          });
          target = nearest(me, spots);
        } else if (p >= 3) out.notes.push(p === 3 ? 'chắn gió' : 'trúng gió');
        break;
      case 'loi':
        if ((m.n ?? -1) < 0) break;
        if (p === 1) rods.set(m.n!, { ...at, hot: false });
        else if (p === 2) rods.set(m.n!, { ...(rods.get(m.n!) ?? at), hot: true });
        break;
      case 'van':
        if (p === 1) ring = { n: m.n ?? 3, r: m.r ?? 7 };
        else if (p === 2) seal = m.n ?? 0;
        else if (p === 3 && seal >= 0) target = hkRingPos(anchor, ring.r, hkSealAfter(seal, m.n ?? 0, ring.n), ring.n);
        else if (p >= 4) {
          out.notes.push(p === 4 ? 'đúng ấn' : 'sai ấn');
          target = null;
        }
        break;
      case 'tuc':
        if (p === 1) {
          if (beatTimer) clearTimeout(beatTimer);
          beatTimer = setTimeout(() => room.send(C.TRIB_SOUL, {}), Math.max(0, (m.d ?? 0) * 1000));
        } else if (p >= 2) out.notes.push(p === 2 ? 'đúng nhịp' : p === 3 ? 'lệch nhịp' : 'bỏ nhịp');
        break;
      case 'chau':
        if ((m.n ?? -1) < 0) orbs.clear();
        else if (p === 1) orbs.set(m.n!, { ...at, until: Date.now() + (m.d ?? 6) * 1000 });
        else orbs.delete(m.n!);
        break;
      case 'luan':
        if (p === 1) wheel = { th: m.ox ?? 0, w: m.oz ?? 0, t0: Date.now() };
        else if (p >= 3) out.notes.push(p === 3 ? 'trong cung sinh' : 'bị nghiền');
        break;
    }
  });

  /** Gửi một nhịp input: đi về `to` (đứng yên nếu đã tới nơi hoặc không có đích). Hướng tiến của server = (-sin yaw, -cos yaw). */
  const go = (me: PlayerView, to: Pt | null, stopAt = 0.4): void => {
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
    if (!me || !anchor) return;
    const now = Date.now();
    switch (stage) {
      case 'hk_tuyet': {
        const a = Math.atan2(me.x - anchor.x, me.z - anchor.z) + 0.45;
        return go(me, { x: anchor.x + Math.sin(a) * 6, z: anchor.z + Math.cos(a) * 6 }, 0);
      }
      case 'hk_phong':
      case 'hk_van_tam':
        return go(me, target ?? anchor, 0.5);
      case 'hk_loi': {
        const cool = [...rods.values()].filter((r) => !r.hot);
        return go(me, pg > 25 ? (nearest(me, cool) ?? anchor) : anchor, 0.5);
      }
      case 'hk_tram_ly': {
        while (cuts.length && now > cuts[0]!.until) cuts.shift();
        const cut = cuts.find((c) => hkInRect(c.ox, c.oz, c.yaw, c.len, c.w + 1.6, me.x, me.z));
        if (cut) {
          const sx = Math.cos(cut.yaw);
          const sz = -Math.sin(cut.yaw);
          const side = (me.x - cut.ox) * sx + (me.z - cut.oz) * sz >= 0 ? 1 : -1;
          return go(me, { x: me.x + sx * side * 3, z: me.z + sz * side * 3 }, 0);
        }
        return go(me, Math.hypot(me.x - anchor.x, me.z - anchor.z) > 2.5 ? anchor : null);
      }
      case 'hk_huyet_anh': {
        const id = shadow();
        if (id && now >= castAt) {
          castAt = now + 350;
          room.send(C.SKILL, { id: seq % 12 === 0 ? 'skl_kiem_khi_tram' : 'skl_phi_kiem', t: id });
        }
        return go(me, null);
      }
      case 'hk_hon_tho': {
        const live = [...orbs.values()].filter((o) => now < o.until);
        return go(me, nearest(me, live) ?? anchor, 0.3);
      }
      case 'hk_luan_hoi': {
        if (!wheel) return go(me, null);
        // Đi trước cung sinh một chút theo chiều xoay để bù độ trễ mạng.
        const th = hkLuanAngle(wheel.th, wheel.w, (now - wheel.t0) / 1000 + 0.25);
        return go(me, { x: anchor.x + Math.sin(th) * 5, z: anchor.z + Math.cos(th) * 5 }, 0.3);
      }
      default:
        return go(me, null);
    }
  }, 50);
  return out;
}
