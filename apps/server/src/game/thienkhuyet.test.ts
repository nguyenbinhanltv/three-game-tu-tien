import { beforeAll, describe, expect, it } from 'vitest';
import { HOME_LEVEL, S, TELE_CAST_LEVEL_MS, TELE_PAD, TELE_TOUCH_R, terrainOf, type TransferMsg } from '@dtl/shared';

// E4-A: Thiên Khuyết Cổ Thành (level thật) đi qua đường vé + Truyền Tống như E1-B: Vân Lam → tk_tp_tram, tới nơi trận tự mở, trận vùng chưa mở thì từ chối, về bằng trận tông môn.
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

describe('Thiên Khuyết Cổ Thành qua Truyền Tống', () => {
  it('trận trạm chưa mở khóa thì từ chối; mở rồi niệm đủ thì cấp vé vào world-thien_khuyet, đến nơi trận tự mở và đứng trong vùng chơi', () => {
    const home = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const dm = mkRoom('thien_khuyet', rooms.defineWorld('thien_khuyet'));
    const p = home.join('vao');
    home.sim.tele.command(p, { id: 'tk_tp_tram' });
    expect(keys(p)).toContain('sys.tele_locked');
    expect(xfers(p)).toEqual([]);

    p.char.unlockTele('tk_tp_tram');
    home.advance(500); // giãn tối thiểu giữa hai lệnh tele
    home.sim.tele.command(p, { id: 'tk_tp_tram' });
    home.advance(TELE_CAST_LEVEL_MS + 100);
    expect(xfers(p)).toEqual([{ room: 'world-thien_khuyet', level: 'thien_khuyet', options: {} }]);
    const t = transfer.tickets.take(p.char.id, 'thien_khuyet')!;
    expect(t).not.toBeNull();

    const pad = TELE_PAD.get('tk_tp_tram')!;
    expect(Math.hypot(t.spawn!.x - pad.x, t.spawn!.z - pad.z)).toBeLessThan(TELE_TOUCH_R); // tới nơi là chạm trận
    const q = dm.enter(Character.load(p.char.id), t.spawn);
    expect(q.char.room).toBe('thien_khuyet');
    const tr = terrainOf('thien_khuyet');
    expect(q.move.y).toBeCloseTo(tr.heightAt(q.move.x, q.move.z), 0); // địa hình của Thiên Khuyết, không phải Vân Lam
    expect(tr.playDist(q.move.x, q.move.z)).toBeLessThan(120);
    expect(q.char.teleOpen()).toContain('tk_tp_tram');
  });

  it('trận vùng của Thiên Khuyết chưa chạm thì không dùng được; về Vân Lam bằng trận tông môn (mở sẵn)', () => {
    const dm = mkRoom('thien_khuyet', rooms.defineWorld('thien_khuyet'));
    const p = dm.join('ve');
    dm.sim.tele.command(p, { id: 'tk_tp_mo_dao' });
    expect(keys(p)).toContain('sys.tele_locked');
    dm.advance(500);
    dm.sim.tele.command(p, { id: 'tp_tong_mon' });
    dm.advance(TELE_CAST_LEVEL_MS + 100);
    expect(xfers(p).at(-1)).toEqual({ room: 'world', level: HOME_LEVEL, options: {} });
  });
});
