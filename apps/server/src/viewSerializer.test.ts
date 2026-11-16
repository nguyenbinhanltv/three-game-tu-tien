import { describe, expect, it, vi } from 'vitest';
import { ClientState, SchemaSerializer } from '@colyseus/core';
import { Decoder, Encoder, StateView } from '@colyseus/schema';
import { PlayerS, WorldState } from './state';
import { installViewPatchFix } from './viewSerializer';

// Thứ tự trong file này là chủ đích: các ca "gốc" chạy trước khi cài bản vá (cài là vĩnh viễn trong tiến trình test).
const ORIGINAL = (SchemaSerializer.prototype as unknown as { applyPatches: unknown }).applyPatches;

interface Fake {
  state: ClientState;
  view: StateView;
  sessionId: string;
  packets: Buffer[];
  raw(b: Buffer): void;
  own: PlayerS;
  dec: Decoder<WorldState>;
}

function mkPlayer(name: string): PlayerS {
  const p = new PlayerS();
  p.name = name;
  p.x = 100.5;
  p.z = 200.25;
  p.wp = 'weapon_' + name;
  p.dye = 'attire_' + name;
  p.mt = 'method_' + name;
  return p;
}

function setup(nClients: number) {
  const state = new WorldState();
  const ser = new SchemaSerializer<WorldState>();
  (ser as unknown as { reset(s: WorldState): void }).reset(state);
  const clients: Fake[] = [];
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  for (let i = 0; i < nClients; i++) {
    const own = mkPlayer('own' + i);
    state.players.set('c' + i, own);
    const view = new StateView();
    view.add(own);
    const dec = new Decoder(new WorldState());
    const c: Fake = { state: ClientState.JOINED, view, sessionId: 'c' + i, packets: [], raw: (b) => void c.packets.push(Buffer.from(b)), own, dec };
    clients.push(c);
    const full = (ser as unknown as { getFullState(c: unknown): Buffer }).getFullState(c);
    dec.decode(full.subarray(1));
  }
  const apply = () => (ser as unknown as { applyPatches(c: unknown[]): boolean }).applyPatches(clients);
  const flush = () => {
    for (const c of clients) {
      for (const p of c.packets) c.dec.decode(p.subarray(1));
      c.packets.length = 0;
    }
  };
  return { state, clients, apply, flush, errors };
}

/** Mỗi client thấy `perClient` người lạ (khác nhau theo client) trong cùng một tick. */
function crowd(nClients: number, perClient: number, bufferSize: number) {
  Encoder.BUFFER_SIZE = bufferSize;
  const { state, clients, apply, flush, errors } = setup(nClients);
  apply(); // dọn thay đổi lúc vào
  flush();
  const seen: string[][] = clients.map(() => []);
  clients.forEach((c, i) => {
    for (let k = 0; k < perClient; k++) {
      const id = `o${i}_${k}`;
      state.players.set(id, mkPlayer(id));
      c.view.add(state.players.get(id)!);
      seen[i].push(id);
    }
  });
  apply();
  flush();
  return { clients, errors, seen };
}

function check(res: ReturnType<typeof crowd>): number {
  let bad = 0;
  res.clients.forEach((c, i) => {
    for (const id of res.seen[i]) {
      const p = c.dec.state.players.get(id);
      if (!p || p.name !== id || p.wp !== 'weapon_' + id || p.mt !== 'method_' + id) bad++;
    }
  });
  return bad + res.errors.mock.calls.filter((a) => String(a[0]).includes('refId')).length;
}

describe('viewSerializer (L1: gói view bị cắt)', () => {
  it('bản gốc hỏng: 100 client, tổng view vượt bộ đệm → mất thực thể / refId not found', () => {
    expect((SchemaSerializer.prototype as unknown as { applyPatches: unknown }).applyPatches).toBe(ORIGINAL);
    const res = crowd(100, 3, 8 * 1024);
    expect(check(res)).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it('bản gốc hỏng: một client đơn lẻ có view lớn hơn bộ đệm', () => {
    const res = crowd(1, 150, 8 * 1024);
    expect(check(res)).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it('cài bản vá', () => {
    installViewPatchFix();
    expect((SchemaSerializer.prototype as unknown as { applyPatches: unknown }).applyPatches).not.toBe(ORIGINAL);
    expect(Encoder.BUFFER_SIZE).toBeGreaterThanOrEqual(64 * 1024);
  });

  it('đã vá: 100 client, tổng view hàng trăm KB, giải mã đủ giá trị, không lỗi', () => {
    const res = crowd(100, 3, 8 * 1024); // bộ đệm 8 KB: vá chỉ cần chứa một client mỗi lần
    // (phần chung ≈ 3 KB và mỗi client ≈ 0,4 KB nên không client nào tự tràn, nhưng tổng 100 client ≈ 40 KB)
    expect(check(res)).toBe(0);
    expect(res.errors.mock.calls.length).toBe(0);
    vi.restoreAllMocks();
  });

  it('đã vá: một client đơn lẻ có view lớn hơn 8 KB vẫn đủ khi bộ đệm đã nâng', () => {
    installViewPatchFix();
    const res = crowd(1, 150, 128 * 1024);
    expect(check(res)).toBe(0);
    expect(res.errors.mock.calls.length).toBe(0);
    vi.restoreAllMocks();
  });

  it('đã vá: báo lỗi to nếu một client vẫn tràn bộ đệm', () => {
    const res = crowd(1, 150, 8 * 1024);
    expect(res.errors.mock.calls.some((a) => String(a[0]).includes('viewSerializer'))).toBe(true);
    vi.restoreAllMocks();
  });
});
