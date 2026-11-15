import { visibleMon, visiblePlayer } from '@dtl/shared';
import type { WorldView } from './entities';

/**
 * AOI (M-2): server chỉ gửi giá trị trường của thực thể trong tầm; thực thể ngoài tầm vẫn có mặt trong collection nhưng là bản ghi rỗng.
 * Lớp này che bản ghi rỗng: mọi nơi đọc `Game.view` thấy "ngoài tầm" như "không có".
 */
export function visibleMap<V>(src: Map<string, V>, ok: (v: V) => boolean): Map<string, V> {
  const out = {
    get: (k: string) => {
      const v = src.get(k);
      return v !== undefined && ok(v) ? v : undefined;
    },
    has: (k: string) => {
      const v = src.get(k);
      return v !== undefined && ok(v);
    },
    forEach: (fn: (v: V, k: string, m: Map<string, V>) => void) => {
      src.forEach((v, k) => {
        if (ok(v)) fn(v, k, out as unknown as Map<string, V>);
      });
    },
    get size() {
      let n = 0;
      src.forEach((v) => {
        if (ok(v)) n++;
      });
      return n;
    },
    *entries(): IterableIterator<[string, V]> {
      for (const e of src.entries()) if (ok(e[1])) yield e;
    },
    *keys(): IterableIterator<string> {
      for (const [k, v] of src.entries()) if (ok(v)) yield k;
    },
    *values(): IterableIterator<V> {
      for (const v of src.values()) if (ok(v)) yield v;
    },
    [Symbol.iterator](): IterableIterator<[string, V]> {
      return this.entries();
    },
  };
  return out as unknown as Map<string, V>;
}

/** Bọc trạng thái room: quái và người chơi chỉ còn những thực thể trong tầm AOI. */
export function visibleView(state: WorldView): WorldView {
  return {
    get level() {
      return state.level;
    },
    players: visibleMap(state.players, visiblePlayer),
    monsters: visibleMap(state.monsters, visibleMon),
    nodes: state.nodes,
  };
}
