import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, S, type FxMsg } from '@dtl/shared';

// HPL2 A: tin `potion` cho client biết đan vừa hồi LINH LỰC (`v: 'mp'`) để vẽ hình khác hồi máu. Chỉ là lớp hình.
process.env.DB_FILE = ':memory:';

let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
});

const X = 2040;
const Z = 2040;
let acc = 9400;

function setup() {
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'pfx' + acc);
  char.level = 15;
  char.recalc();
  char.hp = char.mhp;
  char.mp = 0;
  const client = { sessionId: 'c' + acc, send: () => undefined };
  const p = sim.addPlayer(client as never, char, true, 'c' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  let r = 0;
  const use = (id: string) => {
    expect(char.tx('t' + r, null, (d) => d.add(id, 1))).toBe(true);
    p.itemCdAt = 0;
    sent.length = 0;
    sim.onUse(p, { slot: char.inv.findIndex((it) => it?.id === id), r: 'use' + r++ + 'xx' });
    return sent.filter((s) => s.type === S.FX && (s.msg as FxMsg).t === 'potion').map((s) => s.msg as FxMsg);
  };
  return { p, char, use };
}

describe('tin potion (lớp hình)', () => {
  it('đan hồi linh lực: một tin potion có v = mp, linh lực tăng', () => {
    const t = setup();
    const fx = t.use('itm_hoi_khi_dan');
    expect(fx).toEqual([{ t: 'potion', src: t.p.sid, v: 'mp' }]);
    expect(t.char.mp).toBeGreaterThan(0);
  });

  it('đan hồi máu: tin potion không có v', () => {
    const t = setup();
    t.char.hp = 1;
    const fx = t.use('itm_hoi_xuan_dan');
    expect(fx).toEqual([{ t: 'potion', src: t.p.sid }]);
  });

  it('đan lai (hồi cả máu lẫn linh lực): tin potion có v = mp, máu vẫn báo qua tin sát thương hồi', () => {
    const t = setup();
    t.char.hp = 1;
    const fx = t.use('itm_hoi_mach_dan');
    expect(fx).toEqual([{ t: 'potion', src: t.p.sid, v: 'mp' }]);
    expect(t.char.hp).toBeGreaterThan(1);
    expect(t.char.mp).toBeGreaterThan(0);
  });

  it('tin không mang số linh lực hay trường lạ', () => {
    const t = setup();
    for (const m of t.use('itm_hoi_khi_dan')) expect(Object.keys(m).sort()).toEqual(['src', 't', 'v']);
  });
});
