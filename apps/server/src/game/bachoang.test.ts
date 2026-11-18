import { beforeAll, describe, expect, it } from 'vitest';
import { HOME_LEVEL, S, TELE_CAST_LEVEL_MS, TELE_PAD, TELE_TOUCH_R, terrainOf, type TransferMsg } from '@dtl/shared';

// DV-1: Bắc Hoang Tẫn Nguyên (level thật) đi qua đường vé + Truyền Tống như E4-A: Thiên Khuyết (Ngoại Thành Trạm) → bh_tp_tram, tới nơi trận tự mở, trận vùng chưa mở thì từ chối, về bằng trận tông môn.
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
type Rooms = typeof import('../rooms');
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let parties: typeof import('./party').parties;
let rooms: Rooms;
let transfer: typeof import('../transfer');
let LEVELS: typeof import('@dtl/content').LEVELS;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ parties } = await import('./party'));
  rooms = await import('../rooms');
  transfer = await import('../transfer');
  ({ LEVELS } = await import('@dtl/content'));
  await import('../db');
});

const sent: { type: string; msg: unknown; to: string }[] = [];
let nextAcc = 43000;

function mkRoom(levelId: string, cls: { prototype: object }) {
  const room = Object.create(cls.prototype) as InstanceType<Rooms['GameRoom']> & { sim: InstanceType<typeof GameSim> };
  const lv = LEVELS[levelId];
  const spawn = lv.spawn ?? { x: 2048, z: 2088 };
  room.sim = new GameSim(new WorldState(), room as never, { levelId, roomName: levelId, spawn, respawn: spawn, persistPosition: true });
  const enter = (char: InstanceType<typeof Character>, spawnAt: { x: number; z: number } | null = null): Ent => {
    room.prepareChar(char, spawnAt);
    const client = { sessionId: 'sid' + nextAcc++, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) };
    const p = room.sim.addPlayer(client as never, char, true, 's' + nextAcc);
    parties.attach(p, room);
    return p;
  };
  const join = (name: string, level = 25): Ent => {
    const char = Character.create(nextAcc++, name + nextAcc);
    char.level = level;
    char.recalc();
    char.hp = char.mhp;
    return enter(char);
  };
  const advance = (ms: number) => {
    room.sim.now += ms;
    (room.sim.tele as unknown as { stepAt: number }).stepAt = 0;
    room.sim.tele.tick();
  };
  return { room, sim: room.sim, join, enter, advance };
}
const xfers = (p: Ent) => sent.filter((s) => s.type === S.TRANSFER && s.to === p.char.name).map((s) => s.msg as TransferMsg);
const keys = (p: Ent) => sent.filter((s) => s.type === S.SYS && s.to === p.char.name).map((s) => (s.msg as { k: string }).k);

describe('Bắc Hoang Tẫn Nguyên qua Truyền Tống', () => {
  it('từ Thiên Khuyết: trận trạm chưa mở khóa thì từ chối; mở rồi niệm đủ thì cấp vé vào world-bac_hoang, tới nơi trận tự mở và đứng trong vùng chơi', () => {
    const tk = mkRoom('thien_khuyet', rooms.defineWorld('thien_khuyet'));
    const bh = mkRoom('bac_hoang', rooms.defineWorld('bac_hoang'));
    const p = tk.join('vao', 28);
    tk.sim.tele.command(p, { id: 'bh_tp_tram' });
    expect(keys(p)).toContain('sys.tele_locked');
    expect(xfers(p)).toEqual([]);

    p.char.unlockTele('bh_tp_tram');
    tk.advance(500);
    tk.sim.tele.command(p, { id: 'bh_tp_tram' });
    tk.advance(TELE_CAST_LEVEL_MS + 100);
    expect(xfers(p)).toEqual([{ room: 'world-bac_hoang', level: 'bac_hoang', options: {} }]);
    const t = transfer.tickets.take(p.char.id, 'bac_hoang')!;
    expect(t).not.toBeNull();

    const pad = TELE_PAD.get('bh_tp_tram')!;
    expect(Math.hypot(t.spawn!.x - pad.x, t.spawn!.z - pad.z)).toBeLessThan(TELE_TOUCH_R);
    const q = bh.enter(Character.load(p.char.id), t.spawn);
    expect(q.char.room).toBe('bac_hoang');
    const tr = terrainOf('bac_hoang');
    expect(q.move.y).toBeCloseTo(tr.heightAt(q.move.x, q.move.z), 0);
    expect(tr.playDist(q.move.x, q.move.z)).toBeLessThan(700);
    expect(q.char.teleOpen()).toContain('bh_tp_tram');
  });

  it('người chơi cấp thấp bị từ chối dù trận trạm đã mở khóa; không cấp vé', () => {
    const tk = mkRoom('thien_khuyet', rooms.defineWorld('thien_khuyet'));
    const p = tk.join('thap', 20);
    p.char.unlockTele('bh_tp_tram');
    tk.advance(500);
    tk.sim.tele.command(p, { id: 'bh_tp_tram' });
    tk.advance(TELE_CAST_LEVEL_MS + 100);
    expect(xfers(p)).toEqual([]);
    expect(keys(p)).toContain('sys.dungeon_level');
    expect(transfer.tickets.take(p.char.id, 'bac_hoang')).toBeNull();
  });

  it('trận vùng chưa chạm thì không dùng được; về Vân Lam bằng trận tông môn (mở sẵn)', () => {
    const bh = mkRoom('bac_hoang', rooms.defineWorld('bac_hoang'));
    const p = bh.join('ve', 28);
    bh.sim.tele.command(p, { id: 'bh_tp_tran_gioi' });
    expect(keys(p)).toContain('sys.tele_locked');
    bh.advance(500);
    bh.sim.tele.command(p, { id: 'tp_tong_mon' });
    bh.advance(TELE_CAST_LEVEL_MS + 100);
    expect(xfers(p).at(-1)).toEqual({ room: 'world', level: HOME_LEVEL, options: {} });
  });
});
