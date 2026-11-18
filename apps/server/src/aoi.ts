// Vùng quan tâm (AOI, M-2): mỗi client chỉ nhận state quái và người chơi trong tầm (StateView của Colyseus).
// Server vẫn giữ toàn bộ thế giới và phán định mọi thứ trên bản đầy đủ; AOI chỉ là bộ lọc đồng bộ.
// Luôn thấy: chính mình, đồng đội cùng tổ đội, đối thủ tỉ thí. Mọi tin FX/sát thương cũng chỉ gửi cho người trong tầm (xem Sim.sendNear).

import type { StateView } from '@colyseus/schema';
import { aoiVisible } from '@dtl/shared';
import type { GameSim } from './game/sim';
import type { PlayerEnt } from './game/entities';
import { parties } from './game/party';
import type { MonS, PlayerS } from './state';

interface Seen {
  mons: Set<string>;
  plr: Set<string>;
}

export class Aoi {
  private seen = new Map<string, Seen>();
  /** Số lần cập nhật và tổng số quái/người đang được gửi (để báo số liệu). */
  private samples = 0;
  private monSum = 0;
  private plrSum = 0;

  constructor(private sim: GameSim) {}

  /** Dựng view cho người vừa vào: chỉ thấy mình, cho tới lần cập nhật kế. */
  attach(view: StateView, own: PlayerS): void {
    view.add(own);
  }

  detach(sid: string): void {
    this.seen.delete(sid);
  }

  /** Cập nhật tầm nhìn của mọi người chơi. `viewOf(sid)`: StateView của client đó (không có thì bỏ qua). */
  update(viewOf: (sid: string) => StateView | undefined): void {
    const sim = this.sim;
    for (const p of sim.players.values()) {
      const view = viewOf(p.sid);
      if (!view) continue;
      let seen = this.seen.get(p.sid);
      if (!seen) {
        seen = { mons: new Set(), plr: new Set() };
        this.seen.set(p.sid, seen);
      }
      this.updateOne(p, view, seen);
      this.samples++;
      this.monSum += seen.mons.size;
      this.plrSum += seen.plr.size;
    }
    for (const sid of this.seen.keys()) if (!sim.players.has(sid)) this.seen.delete(sid);
  }

  private updateOne(p: PlayerEnt, view: StateView, seen: Seen): void {
    const sim = this.sim;
    const x = p.move.x;
    const z = p.move.z;
    // Quái.
    for (const m of sim.monsters) {
      const dx = m.s.x - x;
      const dz = m.s.z - z;
      const d2 = dx * dx + dz * dz;
      const was = seen.mons.has(m.id);
      // Quái của riêng người này (bóng tâm ma) luôn thấy.
      const vis = m.owner === p.sid || aoiVisible(d2, was, !!m.def.boss);
      if (vis && !was) {
        view.add(m.s as MonS);
        seen.mons.add(m.id);
      } else if (!vis && was) {
        view.remove(m.s as MonS);
        seen.mons.delete(m.id);
      }
    }
    // Quái đã bị gỡ khỏi thế giới: chỉ quên (StateView tự dọn thực thể đã tách khỏi state).
    if (seen.mons.size > 0) for (const id of seen.mons) if (!sim.monById.has(id)) seen.mons.delete(id);
    // Người chơi: trong tầm, hoặc đồng đội, hoặc đối thủ tỉ thí.
    const always = new Set<string>();
    for (const o of parties.matesInRoom(p.char.id, sim.host)) always.add(o.sid);
    const foe = sim.duel.anyFoe(p);
    if (foe) always.add(foe.sid);
    for (const o of sim.players.values()) {
      if (o === p) continue;
      const dx = o.move.x - x;
      const dz = o.move.z - z;
      const was = seen.plr.has(o.sid);
      const vis = always.has(o.sid) || aoiVisible(dx * dx + dz * dz, was, false);
      if (vis && !was) {
        view.add(o.s as PlayerS);
        seen.plr.add(o.sid);
      } else if (!vis && was) {
        view.remove(o.s as PlayerS);
        seen.plr.delete(o.sid);
      }
    }
    if (seen.plr.size > 0) for (const sid of seen.plr) if (!sim.players.has(sid)) seen.plr.delete(sid);
  }

  /** Trung bình số quái / người mỗi client đang nhận (từ lần reset trước). */
  stats(reset = true): { monsters: number; players: number } {
    const n = Math.max(1, this.samples);
    const out = { monsters: Math.round(this.monSum / n), players: Math.round(this.plrSum / n) };
    if (reset) this.samples = this.monSum = this.plrSum = 0;
    return out;
  }
}
