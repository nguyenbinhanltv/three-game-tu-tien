// Tiện ích test của Thiên Nhân Ngũ Suy (TN-4): dựng sim trên sân độ kiếp và một "người chơi mẫu" biết thao tác đúng từng ải.
// Người chơi mẫu đọc thẳng trạng thái server (`tr.mech.suy`) nên chỉ dùng để chứng minh ải QUA ĐƯỢC bằng thao tác và để băm hành vi;
// đường thật qua mạng (chỉ thấy FX và vạch báo) do bot arena kiểm (`apps/bot-client/src/arena-e2e.ts ngu_suy`).
import { groundAt, suyRingPos, suySectorYaw, tribDef, type TribDef } from '@dtl/shared';
import type { PlayerEnt } from './entities';
import type { GameSim } from './sim';

export interface SuyPriv {
  tickTribulation(p: PlayerEnt): void;
  tickHazards(): void;
  tribSys: { noteHit(p: PlayerEnt, kind: 'hurt' | 'hit', dot?: boolean): void };
  tribHub: { suyCleared(p: PlayerEnt, idx: number, id?: string): void };
}

interface AnySuy {
  id: string;
  pg: number;
  x: number;
  z: number;
  restUntil: number;
  sx?: number;
  sz?: number;
  pend?: { x?: number; z?: number; mask?: number; shown?: boolean; i?: number } | null;
  lit?: boolean[];
  mode?: 0 | 1;
  struck?: boolean;
}

export function suyState(p: PlayerEnt): AnySuy | undefined {
  return p.trib?.mech?.suy as AnySuy | undefined;
}

function put(p: PlayerEnt, x: number, z: number): void {
  p.move.x = x;
  p.move.z = z;
  p.move.y = groundAt(x, z);
  p.move.flying = false;
}

/** Một nhịp thao tác đúng của người chơi mẫu cho ải đang chạy. */
export function playSuy(sim: GameSim, p: PlayerEnt): void {
  const st = suyState(p);
  const tr = p.trib;
  if (!st || !tr) return;
  const def: TribDef = tribDef(tr.id);
  const cfg = def.phases[tr.pi ?? 0]?.suy;
  if (!cfg) return;
  const priv = sim as unknown as SuyPriv;
  switch (st.id) {
    case 'suy_linh':
      put(p, st.sx!, st.sz!);
      break;
    case 'suy_the':
      if (st.pend) put(p, st.pend.x!, st.pend.z!);
      break;
    case 'suy_thuc': {
      const t = cfg.thuc!;
      if (st.pend && !st.pend.shown) sim.onTribSoul(p);
      if (st.pend?.shown) {
        for (let i = 0; i < t.sectors; i++) {
          if ((st.pend.mask! & (1 << i)) !== 0) continue;
          const yaw = suySectorYaw(i, t.sectors);
          put(p, st.x + Math.sin(yaw) * 5, st.z + Math.cos(yaw) * 5);
          break;
        }
      }
      break;
    }
    case 'suy_tho': {
      const t = cfg.tho!;
      const i = st.lit!.findIndex((v) => !v);
      if (i >= 0) {
        const pos = suyRingPos(st, t.ring, i, t.lamps);
        put(p, pos.x, pos.z);
      } else put(p, st.x, st.z);
      break;
    }
    case 'suy_tam':
      // Chỉ ra tay trong nhịp phá vọng, mỗi nhịp một đòn trúng.
      if (st.mode === 1 && !st.struck && sim.now >= st.restUntil) priv.tribSys.noteHit(p, 'hit');
      break;
  }
}

/**
 * Chạy kiếp tối đa `secs` giây (bước 50 ms), hồi đầy khí huyết mỗi nhịp (tách riêng luật suy khí khỏi sát thương thiên lôi).
 * `play`: có thao tác như người chơi mẫu hay đứng yên.
 */
export function runSuy(sim: GameSim, p: PlayerEnt, secs: number, play: boolean, untilStage?: number): void {
  const priv = sim as unknown as SuyPriv;
  for (let i = 0; i < secs * 20 && p.trib; i++) {
    if (untilStage !== undefined && (p.trib.pi ?? -1) >= untilStage) break;
    p.char.hp = p.char.mhp;
    p.s.hp = p.s.mhp;
    if (play) playSuy(sim, p);
    priv.tickTribulation(p);
    priv.tickHazards();
    sim.now += 50;
  }
}
