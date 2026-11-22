import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MF_STUN,
  ANH_BIEN_LEVEL,
  groundAt,
  MAX_LEVEL,
  parseRealmCode,
  peakGated,
  S,
  tribDef,
  tribForLevel,
  tribLevelOf,
  tribRoomNameOf,
  tribSealPos,
  xpNeed,
  type FxMsg,
  type HazardMsg,
} from '@dtl/shared';
import { LEVELS } from '@dtl/content';

// Nhật Thực Kiếp (DV-3K, Anh Biến): dẫn lôi thắp năm Trấn Giới Bia, Nhật Thực Dực Chủ dập bia, tia cuối đánh vào khe khi đủ bia, vật phẩm, lên cấp 32.
process.env.DB_FILE = ':memory:';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let mech: typeof import('./tribanh');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  mech = await import('./tribanh');
});

afterEach(() => vi.restoreAllMocks());

const X = 2040;
const Z = 2040;
let acc = 7700;
const ITEM = 'itm_anh_bien_lo';
const DEF = tribDef('anh_bien');
const DL = DEF.phases[0].danLoi!;
const CTR = LEVELS[tribLevelOf(DEF)].dungeon!.center;

function setup(withItem = true) {
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'ab' + acc);
  char.level = 31;
  char.bk = 31;
  char.xp = xpNeed(31);
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  if (withItem) char.tx('test', null, (d) => d.add(ITEM, 1));
  const p = sim.addPlayer({ sessionId: 'c' + acc, send: () => undefined } as never, char, true, 'c' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  sim.now = 1_000_000;
  const priv = sim as unknown as { tickTribulation(p: Ent): void; tickHazards(): void };
  const count = () => char.inv.reduce((s, it) => s + (it?.id === ITEM ? it.n : 0), 0);
  const begin = () => sim.beginTribulation(p, DEF, true);
  let t0 = 0;
  const run = (to: number, each?: (t: number) => void) => {
    if (!t0) t0 = sim.now - (DEF.duration * 1000 - (p.trib!.endAt - sim.now));
    while (p.trib && (sim.now - t0) / 1000 < to) {
      each?.((sim.now - t0) / 1000);
      if (!p.trib) break;
      priv.tickTribulation(p);
      priv.tickHazards();
      sim.now += 50;
    }
  };
  const fx = (t: string) => sent.filter((x) => x.type === S.FX && (x.msg as FxMsg).t === t).map((x) => x.msg as FxMsg);
  const hazards = () => sent.filter((x) => x.type === S.HAZARD).map((x) => x.msg as HazardMsg);
  const goto = (pos: { x: number; z: number }) => {
    p.move.x = pos.x;
    p.move.z = pos.z;
    p.move.y = groundAt(pos.x, pos.z);
  };
  const bosses = () => sim.monsters.filter((m) => m.def.id === 'boss_nhat_thuc_duc_chu');
  const st = () => mech.danLoiOf(p.trib);
  return { sim, p, char, count, begin, run, fx, hazards, goto, bosses, st };
}

/** "Bot giỏi": mỗi nhịp tia (3 s từ giây 2) đứng cạnh bia chưa sáng kế tiếp lúc tia bắn, lùi ra giữa sân sau đó. */
function lightAll(t: ReturnType<typeof setup>) {
  t.run(24.9, (s) => {
    const k = Math.floor((s - 2) / 3);
    const phase = (s - 2) % 3;
    if (s < 2 || k > 4) return;
    if (phase < 0.2) t.goto(tribSealPos(CTR, DL.ring, k));
    else if (phase > 0.4) t.goto(CTR);
  });
}

describe('Nhật Thực Kiếp: dữ liệu và hàm thuần', () => {
  it('Anh Biến bắt đầu ở cấp 32 (trần mới là 47 từ TN-7); kiếp mở từ Hóa Thần đại viên mãn 31, 90 s, room riêng ở sân Bắc Hoang', () => {
    expect(ANH_BIEN_LEVEL).toBe(32);
    expect(MAX_LEVEL).toBe(47);
    expect(tribForLevel(31)?.id).toBe('anh_bien');
    expect(DEF.enabled).toBe(true);
    expect(DEF.item).toBe(ITEM);
    expect(DEF.duration).toBe(90);
    expect(DEF.phases.map((p) => p.end)).toEqual([25, 65, 90]);
    expect(tribLevelOf(DEF)).toBe('do_kiep_bac_hoang');
    expect(tribRoomNameOf('do_kiep_bac_hoang')).toBe('tribulation-do_kiep_bac_hoang');
    expect(tribRoomNameOf('do_kiep')).toBe('tribulation');
    expect(LEVELS.do_kiep_bac_hoang.tribulation).toBe(true);
    expect(peakGated(31)).toBe(false);
    expect(parseRealmCode('ab')).toBe(32);
    expect(parseRealmCode('ab4')).toBe(35);
    expect(parseRealmCode('ht4')).toBe(31);
  });

  it('steleHit: tia rơi gần bia chưa sáng thì trúng bia đó; bia đã sáng hoặc ở xa thì không', () => {
    const lit = [false, false, false, false, false];
    const s2 = tribSealPos(CTR, DL.ring, 2);
    expect(mech.steleHit(CTR, DL, lit, s2.x + 1, s2.z)).toBe(2);
    expect(mech.steleHit(CTR, DL, lit, CTR.x, CTR.z)).toBe(-1);
    expect(mech.steleHit(CTR, DL, [false, false, true, false, false], s2.x, s2.z)).toBe(-1);
  });

  it('pickSmash chọn bia sáng gần người nhất, -1 nếu chưa bia nào sáng', () => {
    const near = tribSealPos(CTR, DL.ring, 3);
    expect(mech.pickSmash(CTR, DL.ring, [false, true, false, true, false], near.x, near.z)).toBe(3);
    expect(mech.pickSmash(CTR, DL.ring, [false, false, false, false, false], 0, 0)).toBe(-1);
    expect(mech.riftPos(CTR, DL.ring).z).toBeLessThan(CTR.z);
  });
});

describe('Nhật Thực Kiếp: chạy hết một lượt', () => {
  it('thiếu Anh Biến Lộ không độ kiếp; bắt đầu kiếp tiêu một viên và phát tribstart anh_bien', () => {
    const none = setup(false);
    none.sim.onBreakthrough(none.p);
    expect(none.p.trib).toBeNull();
    const t = setup();
    expect(t.begin()).toBe(true);
    expect(t.count()).toBe(0);
    expect(t.fx('tribstart')[0]?.tb).toBe('anh_bien');
  });

  it('pha 1: đứng cạnh bia lúc tia bắn thì bia sáng, tia rơi chỗ khác thì không', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(4);
    expect(t.fx('steles')[0]?.n).toBe(0);
    // Không đứng gần bia nào: không bia nào sáng.
    t.goto(CTR);
    t.run(24);
    expect(t.st()!.lit.filter(Boolean)).toHaveLength(0);
    const u = setup();
    u.p.god = true;
    u.begin();
    lightAll(u);
    expect(mech.litCount(u.st())).toBe(5);
    expect(u.fx('steles').at(-1)?.n).toBe(31);
  });

  it('pha 2: Nhật Thực Dực Chủ xuất hiện đầu pha, bị gỡ khi hết pha; dập bia làm tắt bia', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t = setup();
    t.p.god = true;
    t.begin();
    lightAll(t);
    t.run(26);
    expect(t.bosses()).toHaveLength(1);
    const boss = t.bosses()[0];
    // Giữ hắn không mất thế để chú dập bia xong: đưa người độ kiếp tránh xa chỗ tia rơi (tia nhắm đúng chỗ đứng lúc bắn) rồi dịch chuyển mỗi nhịp.
    const litBefore = mech.litCount(t.st());
    t.run(64, (s) => {
      boss.stunUntil = 0;
      t.goto({ x: CTR.x + 40 * Math.sin(s), z: CTR.z + 40 * Math.cos(s) });
    });
    expect(mech.litCount(t.st())).toBeLessThan(litBefore);
    t.run(66);
    expect(t.bosses().filter((m) => m.state !== 4 && t.sim.monById.has(m.id))).toHaveLength(0);
  });

  it('thiên lôi rơi trúng Nhật Thực Dực Chủ: bật cờ MF_STUN cho client và cắt chú đang niệm', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t = setup();
    t.p.god = true;
    t.begin();
    t.goto(CTR);
    t.run(26);
    const boss = t.bosses()[0];
    boss.chant = { startAt: 0, endAt: 1e12 };
    let seen = false;
    t.run(36, () => {
      // Giữ hắn sát người độ kiếp (trong tầm tia) và quan sát cờ choáng.
      if (!seen) {
        boss.s.x = t.p.move.x;
        boss.s.z = t.p.move.z;
      }
      if (boss.s.mf & MF_STUN) seen = true;
    });
    expect(seen).toBe(true);
    expect(boss.chant).toBeNull();
    expect(boss.stunUntil).toBeGreaterThan(t.sim.now);
  });

  it('đủ bia: tia cuối đánh vào khe (fx rift), không có tia khóa mệnh vào người; thành công lên cấp 32', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    lightAll(t);
    // Giữ bia: chặn Nhật Thực Dực Chủ dập bằng cách giữ hắn choáng suốt pha 2.
    t.run(65, () => {
      for (const b of t.bosses()) b.stunUntil = t.sim.now + 5000;
      t.goto(CTR);
    });
    expect(mech.litCount(t.st())).toBe(5);
    t.run(91);
    expect(t.fx('rift')).toHaveLength(1);
    const rp = mech.riftPos(CTR, DL.ring);
    expect(t.hazards().some((h) => Math.abs(h.x - rp.x) < 0.01 && Math.abs(h.z - rp.z) < 0.01)).toBe(true);
    expect(t.p.trib).toBeNull();
    expect(t.char.level).toBe(32);
    expect(t.char.xp).toBe(0);
  });

  it('dưới ba bia sáng: tia cuối vẫn đánh vào người (không có fx rift)', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.goto(CTR);
    t.run(91);
    expect(t.fx('rift')).toHaveLength(0);
  });
});

describe('Anh Biến: dữ liệu cũ khi nâng trần', () => {
  it('migrateHoaThanXp kẹp tu vi cấp 28 (từng là trần 99.999.999) về xpNeed(28), không đụng cấp khác', async () => {
    const { default: Database } = await import('better-sqlite3');
    const { migrateHoaThanXp } = await import('../db');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE characters (id INTEGER PRIMARY KEY, level INTEGER, xp REAL)');
    db.prepare('INSERT INTO characters VALUES (1, 28, 99999999), (2, 28, 1000), (3, 27, 170000)').run();
    migrateHoaThanXp(db);
    const xp = (id: number) => (db.prepare('SELECT xp FROM characters WHERE id = ?').get(id) as { xp: number }).xp;
    expect(xp(1)).toBe(xpNeed(28));
    expect(xp(2)).toBe(1000);
    expect(xp(3)).toBe(170000);
  });
});

describe('Anh Biến: nạp nhân vật và sổ cái', () => {
  it('Character.load kẹp tu vi theo xpNeed(cấp): cấp 28 từng là trần 99.999.999 thì về xpNeed(28), trần mới (44) giữ nguyên', () => {
    const a = Character.create(acc++, 'kepa' + acc);
    a.level = 28;
    a.xp = 99_999_999;
    a.save();
    expect(Character.load(a.id).xp).toBe(xpNeed(28));
    const b = Character.create(acc++, 'kepb' + acc);
    b.level = MAX_LEVEL;
    b.xp = 99_999_999;
    b.save();
    expect(Character.load(b.id).xp).toBe(99_999_999);
    expect(xpNeed(MAX_LEVEL)).toBe(99_999_999);
  });

  it('ledger: tiêu Anh Biến Lộ khi vào kiếp và hoàn khi thất bại muộn đều có idem, hoàn không lặp', async () => {
    const { sqlite } = await import('../db');
    const t = setup();
    t.p.god = true;
    t.begin();
    const rows = () =>
      sqlite.prepare("SELECT reason, idem, delta FROM ledger WHERE char_id = ? AND reason LIKE 'tribulation%'").all(t.char.id) as {
        reason: string;
        idem: string | null;
        delta: number;
      }[];
    const spent = rows().filter((r) => r.reason === 'tribulation');
    expect(spent).toHaveLength(1);
    expect(spent[0].idem).toMatch(new RegExp(`^trib:anh_bien:${t.char.id}:`));
    expect(spent[0].delta).toBe(-1);
    t.run(50);
    const end = (t.sim as unknown as { endTribulation(p: Ent, ok: boolean, silent: boolean): void }).endTribulation.bind(t.sim);
    end(t.p, false, false);
    end(t.p, false, false); // lần hai: không còn kiếp, không hoàn nữa
    const refunds = rows().filter((r) => r.reason === 'tribulation:refund');
    expect(refunds).toHaveLength(1);
    expect(refunds[0].idem).toMatch(new RegExp(`^trib-refund:anh_bien:${t.char.id}:`));
    expect(refunds[0].delta).toBe(1);
    expect(t.count()).toBe(1);
  });
});
