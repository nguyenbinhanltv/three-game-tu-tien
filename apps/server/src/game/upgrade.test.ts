import { beforeAll, describe, expect, it } from 'vitest';
import { DUST_ITEM, REFINE_ITEM, WARD_ITEM, gemId, type FxMsg } from '@dtl/shared';

process.env.DB_FILE = ':memory:';

type Ch = InstanceType<typeof import('./character').Character>;
type Draft = InstanceType<typeof import('./character').InvDraft>;
let Character: typeof import('./character').Character;
let UpgradeSystem: typeof import('./upgrade').UpgradeSystem;
let sqlite: typeof import('../db').sqlite;

beforeAll(async () => {
  ({ Character } = await import('./character'));
  ({ UpgradeSystem } = await import('./upgrade'));
  ({ sqlite } = await import('../db'));
});

let seq = 0;
function setup() {
  const acc = 900_000 + ++seq;
  const c: Ch = Character.create(acc, 'Ug' + acc, null, 'kim' as never);
  const warns: string[] = [];
  let now = 10_000;
  const p = { sid: 's' + acc, char: c, trial: 0 } as never as import('./sim').PlayerEnt;
  const sys = new UpgradeSystem({
    now: () => now,
    isDead: () => false,
    nearNpc: () => true,
    idem: (pl, r) => (typeof r === 'string' && r.length >= 4 ? `${pl.char.id}:${r}` : undefined),
    warn: (_p, k) => void warns.push(k),
    sys: () => {},
    fx: (_m: FxMsg) => {},
  });
  let n = 0;
  const send = (op: string, extra: Record<string, unknown> = {}, r = 'req-' + ++n) => {
    now += 1000;
    sys.onUpgrade(p, { npc: 'npc_thiet_lao', op, r, ...extra });
  };
  const enhance = (extra: Record<string, unknown>, r = 'enh-' + ++n) => {
    now += 1000;
    sys.onEnhance(p, { npc: 'npc_thiet_lao', r, ...extra });
  };
  const give = (fn: (d: Draft) => void) => expect(c.tx('test', null, (d) => (fn(d), true))).toBe(true);
  const count = (id: string) => c.inv.reduce((s, x) => s + (x && x.id === id ? x.n : 0), 0);
  return { c, p, send, enhance, give, count, warns };
}

const SWORD = 'itm_han_quang_kiem';

describe('khảm / tháo ngọc', () => {
  it('khảm trừ ngọc và linh thạch, ghi vào món, ledger có dòng; replay cùng khóa không trừ lần hai', () => {
    const t = setup();
    t.give((d) => (d.addRolled(SWORD, 12, 3), d.add(gemId('kim', 2), 2), d.addGold(500)));
    const slot = t.c.inv.findIndex((s) => s?.id === SWORD);
    t.send('socket', { i: slot, idx: 0, gem: gemId('kim', 2) }, 'same-key');
    expect(t.c.inv[slot]!.inst!.gems).toEqual([gemId('kim', 2), '']);
    expect(t.count(gemId('kim', 2))).toBe(1);
    expect(t.c.gold).toBe(500 - 80);
    t.send('socket', { i: slot, idx: 1, gem: gemId('kim', 2) }, 'same-key');
    expect(t.count(gemId('kim', 2))).toBe(1);
    expect(t.c.inv[slot]!.inst!.gems[1]).toBe('');
    const rows = sqlite.prepare("SELECT * FROM ledger WHERE char_id = ? AND reason LIKE 'socket:%'").all(t.c.id);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('khảm đồ đang mặc làm tăng chỉ số; lỗ không tồn tại / ngọc không có bị từ chối', () => {
    const t = setup();
    t.give((d) => (d.addRolled(SWORD, 12, 3), d.add(gemId('kim', 3), 1), d.addGold(500)));
    const slot = t.c.inv.findIndex((s) => s?.id === SWORD);
    t.c.level = 12;
    const eq = t.c.tx('wear', null, (d) => {
      d.equip.weapon = d.inv[slot]!;
      d.inv[slot] = null;
      return true;
    });
    expect(eq).toBe(true);
    t.c.recalc();
    const atk0 = t.c.atk;
    t.send('socket', { w: 'weapon', idx: 5, gem: gemId('kim', 3) });
    expect(t.c.equip.weapon!.inst!.gems).toEqual(['', '']);
    t.send('socket', { w: 'weapon', idx: 0, gem: gemId('moc', 1) });
    expect(t.c.equip.weapon!.inst!.gems).toEqual(['', '']);
    t.send('socket', { w: 'weapon', idx: 0, gem: gemId('kim', 3) });
    expect(t.c.equip.weapon!.inst!.gems[0]).toBe(gemId('kim', 3));
    expect(t.c.atk).toBeGreaterThan(atk0);
  });

  it('hai lệnh tháo song song (khóa khác nhau) chỉ trả ngọc một lần', () => {
    const t = setup();
    t.give((d) => (d.addRolled(SWORD, 12, 3), d.add(gemId('hoa', 1), 1), d.addGold(500)));
    const slot = t.c.inv.findIndex((s) => s?.id === SWORD);
    t.send('socket', { i: slot, idx: 0, gem: gemId('hoa', 1) });
    expect(t.count(gemId('hoa', 1))).toBe(0);
    t.send('unsocket', { i: slot, idx: 0 });
    t.send('unsocket', { i: slot, idx: 0 });
    expect(t.count(gemId('hoa', 1))).toBe(1);
    expect(t.c.inv[slot]!.inst!.gems[0]).toBe('');
  });

  it('tháo khi túi đầy bị hủy, ngọc vẫn nằm trong lỗ và linh thạch không mất', () => {
    const t = setup();
    t.give((d) => (d.addRolled(SWORD, 12, 3), d.add(gemId('tho', 1), 1), d.addGold(500)));
    const slot = t.c.inv.findIndex((s) => s?.id === SWORD);
    t.send('socket', { i: slot, idx: 0, gem: gemId('tho', 1) });
    t.give((d) => {
      while (d.freeSlots() > 0) d.add('itm_hoi_xuan_dan', 50);
    });
    const gold = t.c.gold;
    t.send('unsocket', { i: slot, idx: 0 });
    expect(t.c.inv[slot]!.inst!.gems[0]).toBe(gemId('tho', 1));
    expect(t.c.gold).toBe(gold);
    expect(t.warns).toContain('sys.inv_full');
  });
});

describe('ghép ngọc', () => {
  it('3 → 1 cấp trên, tốn linh thạch + Linh Trần; thiếu thì không đổi gì', () => {
    const t = setup();
    t.give((d) => (d.add(gemId('thuy', 1), 3), d.addGold(300), d.add(DUST_ITEM, 2)));
    t.send('merge', { gem: gemId('thuy', 1) });
    expect(t.count(gemId('thuy', 2))).toBe(1);
    expect(t.count(gemId('thuy', 1))).toBe(0);
    expect(t.count(DUST_ITEM)).toBe(0);
    t.give((d) => d.add(gemId('thuy', 1), 2));
    t.send('merge', { gem: gemId('thuy', 1) });
    expect(t.count(gemId('thuy', 1))).toBe(2);
    t.send('merge', { gem: gemId('thuy', 3) });
    expect(t.count(gemId('thuy', 3))).toBe(0);
  });
});

describe('tẩy luyện', () => {
  it('chỉ đổi đúng dòng đã chọn, khóa các dòng khác, tốn thạch + trần + linh thạch, ghi seed vào ledger', () => {
    const t = setup();
    t.give((d) => (d.addRolled(SWORD, 12, 3), d.add(REFINE_ITEM, 3), d.add(DUST_ITEM, 6), d.addGold(2000)));
    const slot = t.c.inv.findIndex((s) => s?.id === SWORD);
    for (let k = 0; k < 3; k++) {
      const before = t.c.inv[slot]!.inst!.affixes.map((a) => ({ ...a }));
      const stones = t.count(REFINE_ITEM);
      t.send('refine', { i: slot, idx: 1 });
      const after = t.c.inv[slot]!.inst!.affixes;
      expect(after.length).toBe(before.length);
      expect(after[0]).toEqual(before[0]);
      expect(after[2]).toEqual(before[2]);
      const keys = after.map((a) => a.id + '|' + (a.p ?? ''));
      expect(new Set(keys).size).toBe(keys.length);
      expect(t.count(REFINE_ITEM)).toBe(stones - 1);
    }
    const row = sqlite.prepare("SELECT reason FROM ledger WHERE char_id = ? AND reason LIKE 'refine:%' LIMIT 1").get(t.c.id) as { reason: string };
    expect(row.reason).toMatch(/roll=\d+:/);
  });

  it('thiếu thạch hoặc dòng không tồn tại thì không đổi', () => {
    const t = setup();
    t.give((d) => (d.addRolled(SWORD, 12, 3), d.add(DUST_ITEM, 6), d.addGold(2000)));
    const slot = t.c.inv.findIndex((s) => s?.id === SWORD);
    const before = JSON.stringify(t.c.inv[slot]);
    t.send('refine', { i: slot, idx: 0 });
    expect(JSON.stringify(t.c.inv[slot])).toBe(before);
    t.give((d) => d.add(REFINE_ITEM, 1));
    t.send('refine', { i: slot, idx: 9 });
    expect(JSON.stringify(t.c.inv[slot])).toBe(before);
    expect(t.count(REFINE_ITEM)).toBe(1);
  });
});

describe('phân giải', () => {
  it('đổi đồ thành Thiết Tinh + Linh Trần, trả ngọc đã khảm; không đụng vật phẩm khác', () => {
    const t = setup();
    t.give((d) => (d.addRolled(SWORD, 12, 3), d.addRolled('itm_dao_bao', 6, 1), d.add(gemId('kim', 1), 1), d.addGold(500), d.add('itm_hoi_xuan_dan', 3)));
    const a = t.c.inv.findIndex((s) => s?.id === SWORD);
    const b = t.c.inv.findIndex((s) => s?.id === 'itm_dao_bao');
    t.send('socket', { i: a, idx: 0, gem: gemId('kim', 1) });
    const potion = t.c.inv.findIndex((s) => s?.id === 'itm_hoi_xuan_dan');
    t.send('salvage', { slots: [potion], ids: ['itm_hoi_xuan_dan'] });
    expect(t.count('itm_hoi_xuan_dan')).toBe(3);
    t.send('salvage', { slots: [a, b], ids: [SWORD, 'itm_dao_bao'] });
    expect(t.count(SWORD)).toBe(0);
    expect(t.count('itm_dao_bao')).toBe(0);
    expect(t.count('itm_thiet_tinh')).toBe(1 + 3 + (1 + 1));
    expect(t.count(DUST_ITEM)).toBe(3 + 1);
    expect(t.count(gemId('kim', 1))).toBe(1);
  });

  it('trùng ô, id sai, hoặc phân giải lần hai cùng khóa: không nhân đôi', () => {
    const t = setup();
    t.give((d) => (d.addRolled(SWORD, 12, 3), d.addRolled('itm_dao_bao', 6, 1)));
    const a = t.c.inv.findIndex((s) => s?.id === SWORD);
    t.send('salvage', { slots: [a, a], ids: [SWORD, SWORD] });
    expect(t.count(SWORD)).toBe(1);
    t.send('salvage', { slots: [a], ids: ['itm_dao_bao'] });
    expect(t.count(SWORD)).toBe(1);
    t.send('salvage', { slots: [a], ids: [SWORD] }, 'dupkey');
    const ore = t.count('itm_thiet_tinh');
    t.send('salvage', { slots: [a], ids: [SWORD] }, 'dupkey');
    expect(t.count('itm_thiet_tinh')).toBe(ore);
    expect(t.count(SWORD)).toBe(0);
  });

  it('đồ mua ở cửa hàng (không inst, giá thấp) phân giải không ra Thiết Tinh rẻ hơn giá cửa hàng', () => {
    const t = setup();
    // Mộc kiếm giá 30 < Thiết Tinh 60.
    t.give((d) => void d.add('itm_moc_kiem', 1));
    const a = t.c.inv.findIndex((s) => s?.id === 'itm_moc_kiem');
    const ore = t.count('itm_thiet_tinh');
    const swords = t.count('itm_moc_kiem');
    t.send('salvage', { slots: [a], ids: ['itm_moc_kiem'] });
    expect(t.count('itm_moc_kiem')).toBe(swords - 1);
    expect(t.count('itm_thiet_tinh')).toBe(ore);
  });

  it('túi đầy khiến cả lô bị hủy (không mất đồ)', () => {
    const t = setup();
    t.give((d) => {
      d.addRolled(SWORD, 12, 3);
      while (d.freeSlots() > 0) d.add('itm_hoi_xuan_dan', 50);
    });
    // Sau khi gỡ kiếm chỉ có đúng một ô trống, mà Thiết Tinh + Linh Trần cần hai ô.
    const a = t.c.inv.findIndex((s) => s?.id === SWORD);
    t.send('salvage', { slots: [a], ids: [SWORD] });
    expect(t.count(SWORD)).toBe(1);
    expect(t.warns).toContain('sys.inv_full');
  });
});

describe('cường hóa + Hộ Phù', () => {
  function wear(t: ReturnType<typeof setup>, plus: number) {
    t.give((d) => (d.addRolled(SWORD, 12, 2), d.addGold(1_000_000), d.add('itm_thiet_tinh', 99), d.add(WARD_ITEM, 20)));
    const slot = t.c.inv.findIndex((s) => s?.id === SWORD);
    t.c.level = 15;
    t.c.tx('wear', null, (d) => {
      d.equip.weapon = { ...d.inv[slot]!, plus };
      d.inv[slot] = null;
      return true;
    });
  }

  it('không bao giờ vỡ đồ; thất bại từ +7 rớt một cấp, có Hộ Phù thì giữ cấp và tiêu một phù', () => {
    const t = setup();
    wear(t, 9);
    let sawDrop = false;
    let sawWard = false;
    for (let k = 0; k < 600 && !(sawDrop && sawWard); k++) {
      const plus = t.c.equip.weapon!.plus ?? 0;
      if (plus >= 10) {
        t.c.tx('reset', null, (d) => ((d.equip.weapon = { ...d.equip.weapon!, plus: 9 }), true));
        continue;
      }
      t.give((d) => void (d.count('itm_thiet_tinh') < 5 && d.add('itm_thiet_tinh', 50)));
      t.give((d) => void (d.count(WARD_ITEM) < 3 && d.add(WARD_ITEM, 5)));
      t.give((d) => d.addGold(5000));
      const useWard = k % 2 === 0;
      const wards = t.count(WARD_ITEM);
      t.enhance({ w: 'weapon', ward: useWard });
      const w = t.c.equip.weapon;
      expect(w).toBeTruthy();
      const np = w!.plus ?? 0;
      if (np === plus - 1) {
        sawDrop = true;
        expect(useWard).toBe(false);
        expect(t.count(WARD_ITEM)).toBe(wards);
      } else if (np === plus && t.count(WARD_ITEM) === wards - 1) {
        sawWard = true;
        expect(useWard).toBe(true);
      } else {
        expect(np).toBe(plus + 1);
      }
    }
    expect(sawDrop).toBe(true);
    expect(sawWard).toBe(true);
  });

  it('muốn dùng Hộ Phù ở +7 trở lên mà không có thì hủy hẳn; dưới +5 luôn thành công', () => {
    const t = setup();
    wear(t, 8);
    t.give((d) => d.remove(WARD_ITEM, 20));
    const ore = t.count('itm_thiet_tinh');
    t.enhance({ w: 'weapon', ward: true });
    expect(t.c.equip.weapon!.plus).toBe(8);
    expect(t.count('itm_thiet_tinh')).toBe(ore);
    const t2 = setup();
    wear(t2, 3);
    t2.enhance({ w: 'weapon' });
    expect(t2.c.equip.weapon!.plus).toBe(4);
  });

  it('+10 là trần', () => {
    const t = setup();
    wear(t, 10);
    t.enhance({ w: 'weapon' });
    expect(t.c.equip.weapon!.plus).toBe(10);
    expect(t.warns).toContain('sys.enh_max');
  });

  it('cường hóa đồ trong túi, khóa idem chống nhân đôi', () => {
    const t = setup();
    t.give((d) => (d.addRolled(SWORD, 12, 2), d.addGold(5000), d.add('itm_thiet_tinh', 20)));
    const slot = t.c.inv.findIndex((s) => s?.id === SWORD);
    t.enhance({ i: slot }, 'enh-key');
    expect(t.c.inv[slot]!.plus).toBe(1);
    t.enhance({ i: slot }, 'enh-key');
    expect(t.c.inv[slot]!.plus).toBe(1);
  });
});
