// Tiện ích test của Huyền Kiếp (TN-6): "người chơi mẫu" đi bộ thật (6 m/s) và thao tác đúng từng kiếp nhỏ, đọc thẳng trạng thái server.
// Chỉ để chứng minh kiếp QUA ĐƯỢC bằng thao tác và băm hành vi; đường qua mạng thật do bot arena kiểm (apps/bot-client/src/hk-bot.ts).
import { hkInRect, hkLuanAngle, hkRingPos, hkSealAfter, tribDef } from '@dtl/shared';
import type { MonEnt, PlayerEnt } from './entities';
import type { GameSim } from './sim';
import { put, suyState, type SuyPriv } from './tribsuy.testutil';

/* eslint-disable @typescript-eslint/no-explicit-any */
type St = Record<string, any>;
type Priv = SuyPriv & { damageMonster(m: MonEnt, dmg: number, p: PlayerEnt): void };
interface Pt {
  x: number;
  z: number;
}

/** Một nhịp thao tác đúng cho kiếp nhỏ đang chạy. `killEvery`: cứ từng này ms hạ một Huyết Ảnh (mô phỏng sức đánh của người chơi). */
export function playHk(sim: GameSim, p: PlayerEnt, killEvery = 5000): void {
  const st = suyState(p) as St | undefined;
  const tr = p.trib;
  if (!st || !tr) return;
  const k = tribDef(tr.id).phases[tr.pi ?? 0]?.hk;
  if (!k) return;
  const now = sim.now;
  const pos = p.move;
  const nearest = (list: Pt[]): Pt | null =>
    list.reduce<Pt | null>((b, o) => (!b || Math.hypot(o.x - pos.x, o.z - pos.z) < Math.hypot(b.x - pos.x, b.z - pos.z) ? o : b), null);
  switch (st.id) {
    case 'hk_tuyet': {
      // Chạy vòng tròn bán kính 6 m quanh tâm sân.
      const a = Math.atan2(pos.x - st.x, pos.z - st.z) + 0.4;
      put(p, st.x + Math.sin(a) * 6, st.z + Math.cos(a) * 6);
      break;
    }
    case 'hk_phong': {
      const g = st.pend;
      if (!g) break;
      const spots = Array.from({ length: k.pillars! }, (_, i) => {
        const pp = hkRingPos(st as Pt, k.ring!, i, k.pillars!);
        return { x: pp.x + g.dx * 2.2, z: pp.z + g.dz * 2.2 };
      });
      const t = nearest(spots)!;
      put(p, t.x, t.z);
      break;
    }
    case 'hk_loi': {
      const cool = (st.hotUntil as number[]).flatMap((h, i) => (h === 0 ? [hkRingPos(st as Pt, k.ring!, i, k.rods!)] : []));
      const t = st.pg > 25 ? nearest(cool) : null;
      // Không có trụ nguội (hoặc chưa cần xả): đứng giữa sân, xa mọi trụ.
      put(p, t?.x ?? st.x, t?.z ?? st.z);
      break;
    }
    case 'hk_tram_ly': {
      const cut = (st.cuts as { ox: number; oz: number; yaw: number }[]).find((c) =>
        hkInRect(c.ox, c.oz, c.yaw, k.len!, k.w! + 1.4, pos.x, pos.z),
      );
      if (cut) {
        // Bước ngang ra khỏi vạch về phía mình đang lệch sẵn (đứng đúng giữa vạch thì chọn một phía cố định).
        const sx = Math.cos(cut.yaw);
        const sz = -Math.sin(cut.yaw);
        const side = (pos.x - cut.ox) * sx + (pos.z - cut.oz) * sz >= 0 ? 1 : -1;
        put(p, pos.x + sx * side * 3, pos.z + sz * side * 3);
      } else if (Math.hypot(pos.x - st.x, pos.z - st.z) > 2.5) put(p, st.x, st.z);
      break;
    }
    case 'hk_huyet_anh': {
      const sh = sim.monsters.find((m) => m.owner === p.sid && m.s.hp > 0);
      const mark = p as unknown as { hkKillAt?: number };
      if (!sh) mark.hkKillAt = undefined;
      else if (mark.hkKillAt === undefined) mark.hkKillAt = now + killEvery;
      else if (now >= mark.hkKillAt) {
        mark.hkKillAt = undefined;
        (sim as unknown as Priv).damageMonster(sh, sh.s.hp, p);
      }
      break;
    }
    case 'hk_van_tam': {
      const r = st.pend;
      if (!r) break;
      const sp = hkRingPos(st as Pt, k.ring!, hkSealAfter(r.idx, r.shift, k.seals!), k.seals!);
      put(p, sp.x, sp.z);
      break;
    }
    case 'hk_kho_than':
      if (!st.done && Math.abs(now - st.beatAt) <= 60) sim.onTribSoul(p);
      break;
    case 'hk_hon_tho': {
      const t = nearest(st.orbs as Pt[]);
      if (t) put(p, t.x, t.z);
      break;
    }
    case 'hk_luan_hoi': {
      const th = hkLuanAngle(st.theta0, st.omega, (now - st.t0) / 1000);
      put(p, st.x + Math.sin(th) * 5, st.z + Math.cos(th) * 5);
      break;
    }
  }
}

/** Chạy kiếp tối đa `secs` giây (bước 50 ms), hồi đầy khí huyết mỗi nhịp; `play`: thao tác như người chơi mẫu hay đứng yên. */
export function runHk(sim: GameSim, p: PlayerEnt, secs: number, play: boolean, killEvery?: number): void {
  const priv = sim as unknown as Priv;
  for (let i = 0; i < secs * 20 && p.trib; i++) {
    p.char.hp = p.char.mhp;
    p.s.hp = p.s.mhp;
    if (play) playHk(sim, p, killEvery);
    priv.tickTribulation(p);
    priv.tickHazards();
    sim.now += 50;
  }
}
