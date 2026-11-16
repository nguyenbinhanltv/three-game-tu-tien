import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ARTIFACT_MAX_LEVEL, BONDED_ARTIFACT_ID, bondedLevel, groundAt } from '@dtl/shared';

// Bản mệnh pháp bảo Ngưng Đan Lô (E2-E): tự có từ Kết Đan, cấp theo cấp của chủ, hồi khí huyết, không đụng túi/tiền.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let ARTIFACT: typeof import('@dtl/content').ARTIFACT;
let parties: typeof import('./party').parties;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ ARTIFACT } = await import('@dtl/content'));
  ({ parties } = await import('./party'));
});

afterEach(() => parties.reset());

const X = 2040;
const Z = 2040;
let nextAcc = 7000;

interface Sent {
  type: string;
  msg: unknown;
}

function setup(level = 20) {
  const sent: Sent[] = [];
  const host = { broadcast: () => {} };
  const sim: Sim = new GameSim(new WorldState(), host as never, { levelId: 'van_lam', roomName: 'test', spawn: { x: X, z: Z }, respawn: { x: X, z: Z }, persistPosition: false });
  const join = (name: string, lv = level): Ent => {
    const char = Character.create(nextAcc++, name + nextAcc);
    char.level = lv;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const client = { sessionId: name + nextAcc, send: (type: string, msg: unknown) => sent.push({ type, msg: { to: name, ...(msg as object) } }) };
    const p = sim.addPlayer(client as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    parties.attach(p, host);
    return p;
  };
  const p = join('a');
  return { sim, sent, p, join };
}

describe('Ngưng Đan Lô (bản mệnh pháp bảo)', () => {
  it('dữ liệu: đúng một bản mệnh, cấp theo cấp của chủ, tối đa 5', () => {
    expect([...ARTIFACT.values()].filter((a) => a.bonded).map((a) => a.id)).toEqual([BONDED_ARTIFACT_ID]);
    expect([19, 20, 21, 22, 23, 24, 30].map(bondedLevel)).toEqual([0, 1, 2, 3, 4, 5, ARTIFACT_MAX_LEVEL]);
  });

  it('chưa Kết Đan thì không dùng được và không tốn gì', () => {
    const { sim, p } = setup(19);
    p.char.hp = 1;
    const mp = p.char.mp;
    sim.onBonded(p);
    expect(p.char.hp).toBe(1);
    expect(p.char.mp).toBe(mp);
    expect(p.cds.has('art_lo')).toBe(false);
  });

  it('hồi khí huyết cho mình theo cấp, tốn linh lực, vào hồi chiêu; dùng lại khi đang hồi thì không làm gì', () => {
    const { sim, p } = setup(20);
    p.char.hp = 1;
    const mp = p.char.mp;
    sim.onBonded(p);
    const def = ARTIFACT.get(BONDED_ARTIFACT_ID)!;
    expect(p.char.hp).toBeGreaterThan(p.char.mhp * def.power * 0.9);
    expect(p.char.hp).toBeLessThan(p.char.mhp);
    expect(p.char.mp).toBe(mp - def.mp);
    expect(p.cds.get('art_lo')).toBeGreaterThan(Date.now());
    const hp = p.char.hp;
    sim.onBonded(p);
    expect(p.char.hp).toBe(hp);
  });

  it('cấp cao hồi nhiều hơn cấp thấp', () => {
    const lo = setup(20);
    const hi = setup(24);
    for (const { p } of [lo, hi]) p.char.hp = 1;
    lo.sim.onBonded(lo.p);
    hi.sim.onBonded(hi.p);
    expect((hi.p.char.hp - 1) / hi.p.char.mhp).toBeGreaterThan((lo.p.char.hp - 1) / lo.p.char.mhp);
  });

  it('hồi cho đồng đội cùng tổ đội trong tầm, không hồi người ngoài tổ đội hay người xa', () => {
    const { sim, p, join } = setup(20);
    const mate = join('b');
    const stranger = join('c');
    const far = join('d');
    mate.move.x = X + 6;
    far.move.x = X + 60;
    for (const o of [p, mate, stranger, far]) o.char.hp = 1;
    for (const o of [mate, far]) {
      parties.command(p, { a: 'inv', n: o.char.name });
      parties.command(o, { a: 'acc', id: p.char.id });
    }
    sim.onBonded(p);
    expect(mate.char.hp).toBeGreaterThan(1);
    expect(stranger.char.hp).toBe(1);
    expect(far.char.hp).toBe(1);
  });

  it('không đụng túi đồ: không thêm/bớt vật phẩm, không đổi linh thạch', () => {
    const { sim, p } = setup(20);
    const before = JSON.stringify([p.char.inv, p.char.gold, p.char.equip]);
    sim.onBonded(p);
    expect(JSON.stringify([p.char.inv, p.char.gold, p.char.equip])).toBe(before);
  });

  it('nội tại: khí huyết tối đa tăng theo cấp, chưa Kết Đan thì không có', () => {
    const lv19 = setup(19).p.char;
    const lv20 = setup(20).p.char;
    const lv24 = setup(24).p.char;
    const base20 = Math.round(lv20.stats.hp);
    expect(lv20.mhp).toBeGreaterThan(base20);
    expect(lv24.mhp / lv24.stats.hp).toBeGreaterThan(lv20.mhp / lv20.stats.hp);
    expect(lv19.mhp).toBe(lv19.stats.hp);
  });
});
