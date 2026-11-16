import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, INV_SIZE, mulberry32, rollEquipDrops, S, type SysMsg, VALLEY } from '@dtl/shared';

// Rơi trang bị (3-2): phân bố theo nguồn, roll ở server, mặc/tháo có idempotency + ledger.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let PlayerS: typeof import('../state').PlayerS;
let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;
let content: typeof import('@dtl/content');
let loot: typeof import('@dtl/content/loot');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState, PlayerS } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ sqlite } = await import('../db'));
  content = await import('@dtl/content');
  loot = await import('@dtl/content/loot');
});

const X = VALLEY.x + 40;
const Z = VALLEY.z + 40;

function setup(level = 15) {
  const sent: { type: string; to: string; msg: unknown }[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => sent.push({ type, to: '*', msg }) } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const c = Character.create(800_000 + Math.floor(Math.random() * 90_000), 'G' + Math.floor(Math.random() * 1e7));
  c.level = level;
  c.recalc();
  const p = {
    sid: 'p1',
    s: new PlayerS(),
    move: { x: X, y: groundAt(X, Z), z: Z },
    char: c,
    client: { send: (type: string, msg: unknown) => sent.push({ type, to: 'p1', msg }) },
    shield: null,
    meditating: false,
    lastCombatAt: 0,
    hazardWin: { until: 0, taken: 0 },
  };
  sim.players.set('p1', p as never);
  return { sim, c, p, sent };
}

type WithLoot = { rollLoot(p: unknown, m: unknown): void };

describe('bảng rơi trang bị theo nguồn (server)', () => {
  const N = 4000;
  const dist = (monId: string, lvl: number) => {
    const rng = mulberry32(7);
    const q = [0, 0, 0, 0, 0];
    let drops = 0;
    for (let i = 0; i < N; i++) {
      for (const d of rollEquipDrops(loot.lootOf(monId).equip, content.ITEM_SYS, content.ITEMS, lvl, rng)) {
        q[d.q]++;
        drops++;
      }
    }
    return { q, drops };
  };

  it('quái thường: chỉ Phàm/Linh, tỉ lệ thấp', () => {
    const { q, drops } = dist('mon_yeu_lang', 6);
    expect(q[2] + q[3] + q[4]).toBe(0);
    expect(drops / N).toBeGreaterThan(0.03);
    expect(drops / N).toBeLessThan(0.08);
  });

  it('tinh anh: ít nhất một món mỗi lần, chủ yếu Huyền, không Thiên', () => {
    const { q, drops } = dist('elite_cu_nham_vien', 13);
    expect(drops / N).toBeGreaterThan(1.3);
    expect(q[2]).toBeGreaterThan(q[3]);
    expect(q[2]).toBeGreaterThan(q[0]);
    expect(q[4]).toBe(0);
  });

  it('boss: luôn rơi, Hàn Giao có Thiên phẩm hiếm, boss bí cảnh không Phàm/Linh/Thiên ở món chính', () => {
    const han = dist('boss_han_giao', 15);
    expect(han.drops / N).toBeGreaterThan(1.9);
    expect(han.q[4] / han.drops).toBeGreaterThan(0.02);
    expect(han.q[4] / han.drops).toBeLessThan(0.15);
    const khoi = dist('boss_kiem_khoi', 15);
    expect(khoi.drops).toBe(N);
    expect(khoi.q[0] + khoi.q[1] + khoi.q[4]).toBe(0);
  });

  it('ilvl bám cấp quái ±1 và mẫu theo cảnh giới (không rơi kiếm gỗ ở cấp 15)', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 300; i++) {
      for (const d of rollEquipDrops(loot.lootOf('boss_han_giao').equip, content.ITEM_SYS, content.ITEMS, 15, rng)) {
        expect(d.ilvl).toBeGreaterThanOrEqual(14);
        expect(d.ilvl).toBeLessThanOrEqual(16);
        expect(content.ITEM.get(d.id)!.reqLevel ?? 1).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('dữ liệu quái (vào bundle client) không chứa bảng rơi', () => {
    const monsters = JSON.stringify(content.MONSTERS);
    expect(monsters).not.toContain('"equip"');
  });
});

describe('rơi và mặc/tháo trong sim', () => {
  it('hạ boss: món rơi vào túi có inst, ledger kèm seed, client nhận q của phẩm', () => {
    const { sim, c, p, sent } = setup();
    const mon = sim.spawnMonster(content.MONSTER.get('boss_han_giao')!, 15, X + 3, Z, null);
    (sim as unknown as WithLoot).rollLoot(p, mon);
    const gear = c.inv.filter((s) => s?.inst);
    expect(gear.length).toBeGreaterThanOrEqual(1);
    for (const g of gear) expect(g!.inst!.q).toBeGreaterThanOrEqual(2);
    const msgs = sent
      .filter((x) => x.type === S.SYS && x.to === 'p1')
      .map((x) => x.msg as SysMsg)
      .filter((m) => m.k === 'sys.loot_gear');
    expect(msgs).toHaveLength(gear.length);
    expect(msgs.every((m) => typeof m.q === 'number' && m.i && m.src === mon.id)).toBe(true);
    const led = sqlite.prepare("SELECT reason FROM ledger WHERE char_id = ? AND kind = 'item'").all(c.id) as { reason: string }[];
    expect(led.some((l) => /roll=\d+:q\d:il\d+/.test(l.reason))).toBe(true);
  });

  it('túi đầy: món trang bị bị bỏ, vàng vẫn vào', () => {
    const { sim, c, p } = setup();
    for (let i = 0; i < INV_SIZE; i++) c.tx('fill', null, (d) => d.addRolled('itm_moc_kiem', 3, 0));
    const mon = sim.spawnMonster(content.MONSTER.get('elite_cu_nham_vien')!, 13, X, Z, null);
    const gold0 = c.gold;
    (sim as unknown as WithLoot).rollLoot(p, mon);
    expect(c.inv.filter(Boolean)).toHaveLength(INV_SIZE);
    expect(c.gold).toBeGreaterThan(gold0);
  });

  it('mặc: đổi chỗ món đang mặc, ràng buộc Địa phẩm, ledger có khóa idem, gửi lặp không đổi gì', () => {
    const { sim, c, p } = setup();
    c.tx('t', null, (d) => d.addRolled('itm_thanh_phong_kiem', 12, 3) && d.addRolled('itm_thanh_phong_kiem', 12, 1));
    const a = c.inv.findIndex((s) => s?.inst?.q === 3);
    const b = c.inv.findIndex((s) => s?.inst?.q === 1);
    sim.now += 300;
    sim.onEquip(p as never, { slot: a, r: 'req-aaaa' });
    expect(c.equip.weapon?.inst?.q).toBe(3);
    expect(c.equip.weapon?.inst?.bound).toBe(true);
    expect(c.inv[a]).toBeNull();
    sim.now += 300;
    sim.onEquip(p as never, { slot: a, r: 'req-aaaa' });
    sim.now += 300;
    sim.onEquip(p as never, { slot: b, r: 'req-bbbb' });
    expect(c.equip.weapon?.inst?.q).toBe(1);
    expect(c.inv[b]?.inst?.q).toBe(3);
    const led = sqlite.prepare("SELECT reason, idem FROM ledger WHERE char_id = ? AND kind = 'noop' ORDER BY id").all(c.id) as { reason: string; idem: string }[];
    expect(led.map((l) => l.idem)).toEqual([`${c.id}:req-aaaa`, `${c.id}:req-bbbb`]);
    expect(led[1].reason).toContain('equip:weapon:');
    expect(Character.load(c.id).equip.weapon).toEqual(c.equip.weapon);
  });

  it('thiếu khóa idempotency, sai ô, quá cấp hoặc chỉ số ô vô lý đều bị từ chối', () => {
    const { sim, c, p } = setup(1);
    c.tx('t', null, (d) => d.addRolled('itm_han_quang_kiem', 12, 2));
    const i = c.inv.findIndex(Boolean);
    sim.now += 300;
    sim.onEquip(p as never, { slot: i });
    sim.now += 300;
    sim.onEquip(p as never, { slot: i, r: 'x' });
    sim.now += 300;
    sim.onEquip(p as never, { slot: i, r: 'req-cccc' });
    expect(c.equip.weapon).toBeUndefined();
    sim.now += 300;
    sim.onUnequip(p as never, { slot: 'weapon', r: 'req-dddd' });
    sim.now += 300;
    sim.onUnequip(p as never, { slot: 'khong', r: 'req-eeee' });
    sim.now += 300;
    sim.onEquip(p as never, { slot: -1, r: 'req-ffff' });
    expect(c.inv[i]).not.toBeNull();
  });

  it('mặc/tháo dồn dập trong 200 ms bị bỏ qua (không ghi thêm ledger)', () => {
    const { sim, c, p } = setup();
    c.tx('t', null, (d) => d.addRolled('itm_thanh_phong_kiem', 12, 2) && d.addRolled('itm_thanh_phong_kiem', 12, 1));
    sim.now += 300;
    sim.onEquip(p as never, { slot: 0, r: 'spam-0001' });
    const n0 = (sqlite.prepare("SELECT COUNT(*) AS n FROM ledger WHERE char_id = ? AND kind = 'noop'").get(c.id) as { n: number }).n;
    for (let i = 0; i < 20; i++) sim.onEquip(p as never, { slot: 1, r: 'spam-' + (100 + i) });
    const n1 = (sqlite.prepare("SELECT COUNT(*) AS n FROM ledger WHERE char_id = ? AND kind = 'noop'").get(c.id) as { n: number }).n;
    expect(n1).toBe(n0);
  });

  it('tháo: túi đầy thì giữ trên người; còn chỗ thì về túi, chỉ số cập nhật', () => {
    const { sim, c, p } = setup();
    c.tx('t', null, (d) => d.addRolled('itm_thanh_phong_kiem', 12, 2));
    const i = c.inv.findIndex(Boolean);
    const atk0 = c.atk;
    sim.now += 300;
    sim.onEquip(p as never, { slot: i, r: 'req-gggg' });
    expect(c.atk).toBeGreaterThan(atk0);
    for (let k = 0; k < INV_SIZE; k++) c.tx('fill', null, (d) => d.addRolled('itm_moc_kiem', 3, 0));
    sim.now += 300;
    sim.onUnequip(p as never, { slot: 'weapon', r: 'req-hhhh' });
    expect(c.equip.weapon).toBeDefined();
    c.tx('t', null, (d) => !!d.removeAt(0, 1));
    sim.now += 300;
    sim.onUnequip(p as never, { slot: 'weapon', r: 'req-iiii' });
    expect(c.equip.weapon).toBeUndefined();
    expect(c.atk).toBe(atk0);
  });
});
