import { beforeAll, describe, expect, it } from 'vitest';
import { HOME_LEVEL, S, TELE_CAST_LEVEL_MS, TELE_PAD, TELE_TOUCH_R, terrainOf, type TransferMsg } from '@dtl/shared';

// E3-A/E3-N: Vân Hải Phù Đảo (level thật) đi qua đường vé + Truyền Tống như E2-A, nhận nhiệm vụ mở trận hub, và rơi khỏi đảo trong sim server thật không mất máu.
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
}, 60_000);

const sent: { type: string; msg: unknown; to: string }[] = [];
let nextAcc = 41000;

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
  const join = (name: string, level = 19): Ent => {
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

describe('Vân Hải Phù Đảo qua Truyền Tống và địa hình đảo', () => {
  it('hub chưa mở thì từ chối; mở rồi niệm đủ thì cấp vé vào world-van_hai, tới nơi đứng trên mặt đảo hub', () => {
    const home = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const vh = mkRoom('van_hai', rooms.defineWorld('van_hai'));
    const p = home.join('vh_vao', 20);
    home.sim.tele.command(p, { id: 'vh_tp_hub' });
    expect(keys(p)).toContain('sys.tele_locked');
    p.char.unlockTele('vh_tp_hub');
    home.advance(500);
    home.sim.tele.command(p, { id: 'vh_tp_hub' });
    home.advance(TELE_CAST_LEVEL_MS + 100);
    expect(xfers(p)).toEqual([{ room: 'world-van_hai', level: 'van_hai', options: {} }]);
    const t = transfer.tickets.take(p.char.id, 'van_hai')!;
    expect(t).not.toBeNull();
    const pad = TELE_PAD.get('vh_tp_hub')!;
    expect(Math.hypot(t.spawn!.x - pad.x, t.spawn!.z - pad.z)).toBeLessThan(TELE_TOUCH_R);
    const q = vh.enter(Character.load(p.char.id), t.spawn);
    const tr = terrainOf('van_hai');
    expect(q.move.y).toBeCloseTo(tr.heightAt(q.move.x, q.move.z), 0);
    expect(q.move.y).toBeGreaterThan((tr.def.voidFloor ?? 0) + 40); // trên đảo, không phải sàn mây
    expect(q.char.teleOpen()).toContain('vh_tp_hub');
  });

  it('người chơi vào room van_hai đứng trên đảo hub; sàn mây quanh đó là mặt đứng hợp lệ (rơi không chết: không có luật sát thương rơi)', () => {
    const vh = mkRoom('van_hai', rooms.defineWorld('van_hai'));
    const p = vh.join('vh_san', 20);
    const tr = terrainOf('van_hai');
    expect(tr.def.voidFloor).toBeDefined();
    expect(Math.hypot(p.move.x - 1024, p.move.z - 1036)).toBeLessThan(30);
    expect(p.move.y).toBeGreaterThan(tr.def.voidFloor! + 40);
    const hp = p.char.hp;
    expect(hp).toBeGreaterThan(0);
    // chỗ ngoài mọi đảo là sàn mây: groundAt = voidFloor, đứng được
    let cloud = 0;
    for (let a = 0; a < 360; a += 10) if (Math.abs(tr.groundAt(1024 + Math.cos((a * Math.PI) / 180) * 160, 1024 + Math.sin((a * Math.PI) / 180) * 160) - tr.def.voidFloor!) < 0.001) cloud++;
    expect(cloud).toBeGreaterThan(10);
  });
});
