// Bộ đếm số liệu trận của từng người chơi (Chân Cảnh U5): chỉ cộng dồn tại các điểm sát thương/hồi máu thật của server.
// Giữ ngoài `PlayerEnt` (WeakMap) để không đổi hình dạng thực thể; mất cùng người chơi khi rời room.
import { buildRecap, newMatchStat, type MatchStat, type RecapMsg } from '@dtl/shared';
import type { PlayerEnt } from './entities';

const stats = new WeakMap<PlayerEnt, MatchStat>();

export function statOf(p: PlayerEnt): MatchStat {
  let s = stats.get(p);
  if (!s) stats.set(p, (s = newMatchStat()));
  return s;
}

const add = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

export const noteDealt = (p: PlayerEnt | null | undefined, n: number): void => {
  if (p) statOf(p).dealt += add(n);
};
export const noteHeal = (p: PlayerEnt | null | undefined, n: number): void => {
  if (p) statOf(p).heal += add(n);
};
export const noteTaken = (p: PlayerEnt, n: number): void => {
  statOf(p).taken += add(n);
};
export const noteReflect = (p: PlayerEnt, n: number): void => {
  statOf(p).reflect += add(n);
};

/** Bảng tổng kết của những người đang ở trong phòng (server tổng hợp). */
export function recapOf(players: Iterable<PlayerEnt>, level: string, secs: number, isDead: (p: PlayerEnt) => boolean): RecapMsg {
  return buildRecap(
    level,
    secs,
    [...players].map((p) => ({ sid: p.sid, name: p.char.name, level: p.char.level, dead: isDead(p), ...statOf(p) })),
  );
}
