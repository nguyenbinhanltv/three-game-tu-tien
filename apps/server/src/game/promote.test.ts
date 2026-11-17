import { beforeAll, describe, expect, it } from 'vitest';
import { PROMOTE_MAT, PROMOTE_MAT_COUNT, promoteGold, TIER_MUL, type FxMsg } from '@dtl/shared';

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

const MAT = PROMOTE_MAT[2]!;
const GOLD = promoteGold(2);

let seq = 0;
function setup(level = 16) {
  const acc = 910_000 + ++seq;
  const c: Ch = Character.create(acc, 'Pr' + acc, null, 'kim' as never);
  c.level = level;
  const warns: string[] = [];
  const msgs: string[] = [];
  let now = 10_000;
  const p = { sid: 's' + acc, char: c, trial: 0 } as never as import('./sim').PlayerEnt;
  const sys = new UpgradeSystem({
    now: () => now,
    isDead: () => false,
    nearNpc: () => true,
    idem: (pl, r) => (typeof r === 'string' && r.length >= 4 ? `${pl.char.id}:${r}` : undefined),
    warn: (_p, k) => void warns.push(k),
    sys: (_p, k) => void msgs.push(k),
    fx: (_m: FxMsg) => {},
    questEvent: () => {},
  });
  let n = 0;
  const send = (op: string, extra: Record<string, unknown> = {}, r = 'req-' + ++n, npc = 'npc_thiet_lao') => {
    now += 1000;
    sys.onUpgrade(p, { npc, op, r, ...extra });
  };
  const give = (fn: (d: Draft) => void) => expect(c.tx('test', null, (d) => (fn(d), true))).toBe(true);
  const count = (id: string) => c.inv.reduce((s, x) => s + (x && x.id === id ? x.n : 0), 0);
  const slotOf = (id: string) => c.inv.findIndex((s) => s?.id === id);
  return { c, p, send, give, count, slotOf, warns, msgs };
}

describe('Thăng Bậc', () => {
  it('đồ bộ bậc 1 → đồ bộ bậc 2 cùng ô: giữ phẩm, dòng phụ, ngọc; chính tăng; cường hóa −3; thêm lỗ; trừ nguyên liệu + linh thạch', () => {
    const t = setup();
    t.give((d) => (d.addRolled('itm_lk_dao_bao', 13, 3), d.add(MAT, PROMOTE_MAT_COUNT + 3), d.addGold(GOLD + 50)));
    const s0 = t.slotOf('itm_lk_dao_bao');
    // gán cường hóa +5 và một ngọc
    t.c.inv[s0] = { ...t.c.inv[s0]!, plus: 5, inst: { ...t.c.inv[s0]!.inst!, gems: ['gem_kim_1', ''] } };
    const before = t.c.inv[s0]!.inst!;
    t.send('promote', { i: s0 });
    const after = t.c.inv[s0]!;
    expect(after.id).toBe('itm_lm_dao_bao');
    expect(after.plus).toBe(2);
    expect(after.inst!.q).toBe(3);
    expect(after.inst!.affixes).toEqual(before.affixes);
    expect(after.inst!.gems).toEqual(['gem_kim_1', '', '']);
    expect(after.inst!.ilvl).toBeGreaterThanOrEqual(17);
    // dòng chính: hệ số bậc 1,6 trở lên so với cùng cấp bậc 1
    const sum = (m: Record<string, number | undefined>) => Object.values(m).reduce<number>((a, b) => a + (b ?? 0), 0);
    expect(sum(after.inst!.main)).toBeGreaterThan(sum(before.main) * TIER_MUL[2] * 0.9);
    expect(t.count(MAT)).toBe(3);
    expect(t.c.gold).toBe(50);
    expect(t.msgs).toContain('sys.promoted');
    const rows = sqlite.prepare("SELECT ref, delta FROM ledger WHERE char_id = ? AND reason LIKE 'promote:%' AND kind = 'item'").all(t.c.id) as { ref: string; delta: number }[];
    expect(rows.some((r) => r.ref === 'itm_lk_dao_bao' && r.delta === -1)).toBe(true);
    expect(rows.some((r) => r.ref === 'itm_lm_dao_bao' && r.delta === 1)).toBe(true);
    // Đối soát như `ledger:check`: tổng ledger theo vật phẩm khớp số đang có (không sinh/mất đồ khi đổi id).
    const sums = sqlite.prepare("SELECT ref, SUM(delta) AS n FROM ledger WHERE char_id = ? AND kind = 'item' GROUP BY ref").all(t.c.id) as { ref: string; n: number }[];
    for (const r of sums) expect(r.n, r.ref).toBe(t.count(r.ref));
  });

  it('đồ thường → mẫu thường cùng ô (kiếm Liệt Mạch dùng model riêng)', () => {
    const t = setup();
    t.give((d) => (d.addRolled('itm_han_quang_kiem', 12, 2), d.add(MAT, PROMOTE_MAT_COUNT), d.addGold(GOLD)));
    t.send('promote', { i: t.slotOf('itm_han_quang_kiem') });
    expect(t.slotOf('itm_liet_mach_kiem')).toBeGreaterThanOrEqual(0);
    expect(t.c.gold).toBe(0);
  });

  it('thiếu nguyên liệu hoặc linh thạch: giữ nguyên, báo lỗi; replay cùng khóa không trừ lần hai', () => {
    const t = setup();
    t.give((d) => (d.addRolled('itm_han_quang_kiem', 12, 2), d.add(MAT, PROMOTE_MAT_COUNT - 1), d.addGold(GOLD)));
    const s = t.slotOf('itm_han_quang_kiem');
    t.send('promote', { i: s });
    expect(t.c.inv[s]!.id).toBe('itm_han_quang_kiem');
    expect(t.warns).toContain('sys.promote_mats');
    t.give((d) => d.add(MAT, 1 + PROMOTE_MAT_COUNT));
    t.send('promote', { i: s }, 'same-key');
    expect(t.c.inv[s]!.id).toBe('itm_liet_mach_kiem');
    const gold = t.c.gold;
    t.send('promote', { i: s }, 'same-key');
    expect(t.c.gold).toBe(gold);
    expect(t.count(MAT)).toBe(PROMOTE_MAT_COUNT);
  });

  it('bậc 3 → bậc 4 (SETS-4): kiếm và áo bộ thăng đúng đích, trừ 20 Tinh Quang Mặc + phí; bậc 4 không thăng tiếp được', () => {
    const t = setup(24);
    const M4 = PROMOTE_MAT[4]!;
    t.give((d) => (d.addRolled('itm_kinh_quang_kiem', 21, 3), d.addRolled('itm_kq_dao_bao', 21, 3), d.add(M4, PROMOTE_MAT_COUNT * 2 + 1), d.addGold(promoteGold(4) * 2 + 7)));
    t.send('promote', { i: t.slotOf('itm_kinh_quang_kiem') });
    t.send('promote', { i: t.slotOf('itm_kq_dao_bao') });
    expect(t.slotOf('itm_tinh_khuyet_kiem')).toBeGreaterThanOrEqual(0);
    expect(t.slotOf('itm_tk_dao_bao')).toBeGreaterThanOrEqual(0);
    expect(t.count(M4)).toBe(1);
    expect(t.c.gold).toBe(7);
    t.send('promote', { i: t.slotOf('itm_tk_dao_bao') });
    expect(t.warns).toContain('sys.promote_locked');
  });

  it('thiếu cảnh giới đích thì chặn', () => {
    const t = setup(20);
    t.give((d) => (d.addRolled('itm_kinh_quang_kiem', 21, 3), d.add(PROMOTE_MAT[4]!, 40), d.addGold(99999)));
    t.send('promote', { i: t.slotOf('itm_kinh_quang_kiem') });
    expect(t.warns).toContain('sys.equip_level');
    const low = setup(15);
    low.give((d) => (d.addRolled('itm_han_quang_kiem', 12, 2), d.add(MAT, 20), d.addGold(GOLD)));
    low.send('promote', { i: low.slotOf('itm_han_quang_kiem') });
    expect(low.warns).toContain('sys.equip_level');
    expect(low.slotOf('itm_han_quang_kiem')).toBeGreaterThanOrEqual(0);
  });

  it('hai lệnh song song cùng một món: chỉ một lệnh qua', () => {
    const t = setup();
    t.give((d) => (d.addRolled('itm_han_quang_kiem', 12, 2), d.add(MAT, 60), d.addGold(GOLD * 3)));
    const s = t.slotOf('itm_han_quang_kiem');
    t.send('promote', { i: s }, 'one-1');
    t.send('promote', { i: s }, 'two-2');
    expect(t.count(MAT)).toBe(60 - PROMOTE_MAT_COUNT);
    expect(t.c.inv[s]!.id).toBe('itm_liet_mach_kiem');
  });

  it('đồ đang mặc: thăng xong chỉ số tăng', () => {
    const t = setup();
    t.give((d) => (d.addRolled('itm_han_quang_kiem', 12, 2), d.add(MAT, 20), d.addGold(GOLD)));
    const s = t.slotOf('itm_han_quang_kiem');
    expect(t.c.tx('wear', null, (d) => ((d.equip.weapon = d.inv[s]!), (d.inv[s] = null), true))).toBe(true);
    t.c.recalc();
    const atk0 = t.c.atk;
    t.send('promote', { w: 'weapon' });
    expect(t.c.equip.weapon!.id).toBe('itm_liet_mach_kiem');
    expect(t.c.atk).toBeGreaterThan(atk0);
  });

  it('đòn lừa: ô không có đồ, đồ không phải trang bị, ô sai bị bỏ qua không trừ gì', () => {
    const t = setup();
    t.give((d) => (d.add(MAT, 20), d.addGold(GOLD), d.add('itm_thiet_tinh', 3)));
    t.send('promote', { i: 5 });
    t.send('promote', { i: t.slotOf('itm_thiet_tinh') });
    t.send('promote', { i: -1 });
    t.send('promote', { w: 'nonsense' });
    expect(t.count(MAT)).toBe(20);
    expect(t.c.gold).toBe(GOLD);
  });
});

describe('Thăng Bậc 2 → 3 (E3-F)', () => {
  const MAT3 = PROMOTE_MAT[3]!;
  const GOLD3 = promoteGold(3);

  it('bộ bậc 2 → bộ bậc 3 đúng ô và đúng công pháp: giữ phẩm, dòng phụ; cường hóa −3; trừ Kính Hoa Sa + 2.960 linh thạch', () => {
    expect(GOLD3).toBe(2960);
    const pairs: [string, string][] = [['itm_lm_dao_bao', 'itm_kq_dao_bao'], ['itm_dg_ho_uyen', 'itm_vk_ho_uyen'], ['itm_pm_gioi_chi', 'itm_ll_gioi_chi']];
    for (const [from, to] of pairs) {
      const t = setup(20);
      t.give((d) => (d.addRolled(from, 17, 3), d.add(MAT3, PROMOTE_MAT_COUNT + 2), d.addGold(GOLD3 + 7)));
      const s0 = t.slotOf(from);
      t.c.inv[s0] = { ...t.c.inv[s0]!, plus: 6 };
      const before = t.c.inv[s0]!.inst!;
      t.send('promote', { i: s0 });
      const after = t.c.inv[s0]!;
      expect(after.id, from).toBe(to);
      expect(after.plus).toBe(3);
      expect(after.inst!.q).toBe(3);
      expect(after.inst!.affixes).toEqual(before.affixes);
      expect(after.inst!.ilvl).toBeGreaterThanOrEqual(21);
      expect(after.inst!.gems.length).toBe(Math.min(3, before.gems.length + 1));
      expect(t.count(MAT3)).toBe(2);
      expect(t.c.gold).toBe(7);
      const sums = sqlite.prepare("SELECT ref, SUM(delta) AS n FROM ledger WHERE char_id = ? AND kind = 'item' GROUP BY ref").all(t.c.id) as { ref: string; n: number }[];
      for (const r of sums) expect(r.n, r.ref).toBe(t.count(r.ref));
    }
  });

  it('kiếm bậc 2 → Kính Quang Kiếm (model riêng); chỉ số chính tăng theo hệ số bậc; chặn dưới cảnh giới 20', () => {
    const low = setup(19);
    low.give((d) => (d.addRolled('itm_liet_mach_kiem', 17, 2), d.add(MAT3, 20), d.addGold(GOLD3)));
    low.send('promote', { i: low.slotOf('itm_liet_mach_kiem') });
    expect(low.warns).toContain('sys.equip_level');
    expect(low.slotOf('itm_liet_mach_kiem')).toBeGreaterThanOrEqual(0);

    const t = setup(20);
    t.give((d) => (d.addRolled('itm_liet_mach_kiem', 17, 2), d.add(MAT3, 20), d.addGold(GOLD3)));
    const s = t.slotOf('itm_liet_mach_kiem');
    const atk2 = t.c.inv[s]!.inst!.main.atk ?? 0;
    t.send('promote', { i: s });
    const out = t.c.inv[s]!;
    expect(out.id).toBe('itm_kinh_quang_kiem');
    // Cùng ilvl 17 → 21 và hệ số bậc 1,6 → 2,5: dòng chính phải tăng rõ rệt.
    expect(out.inst!.main.atk ?? 0).toBeGreaterThan(atk2 * 1.4);
  });

  it('chế đồ bậc 3 ở Hứa lão hoặc Thiết lão: đòi cảnh giới 20, ra đồ bậc 3 có ≥ 2 lỗ khảm', () => {
    const mats = (d: Draft) => (d.add('itm_kinh_hoa_sa', 9), d.add('itm_thiet_tinh', 6), d.add('itm_linh_tran', 3), d.addGold(1850));
    const low = setup(19);
    low.give(mats);
    low.send('forge', { id: 'frg_kq_ho_uyen' }, 'frg-dddd', 'npc_hua_lao');
    expect(low.warns).toContain('sys.craft_level');
    const t = setup(20);
    t.give(mats);
    t.send('forge', { id: 'frg_kq_ho_uyen' }, 'frg-eeee', 'npc_thiet_lao');
    const it = t.c.inv.find((s) => s?.id === 'itm_kq_ho_uyen');
    expect(it).toBeTruthy();
    expect(it!.inst!.gems.length).toBeGreaterThanOrEqual(2);
    expect(t.c.gold).toBe(0);
  });
});

describe('chế đồ bậc 2 (forge)', () => {
  const RECIPE = 'frg_lm_ho_uyen';
  const mats = (d: Draft) => (d.add('itm_mach_tinh_phien', 9), d.add('itm_thiet_tinh', 6), d.add('itm_linh_tran', 3), d.addGold(1500));

  it('Thiết lão và Hứa lão đều chế được; đòi cảnh giới 16; ra đồ bậc 2 có chỉ số bậc 2', () => {
    const low = setup(15);
    low.give(mats);
    low.send('forge', { id: RECIPE });
    expect(low.warns).toContain('sys.craft_level');
    expect(low.slotOf('itm_lm_ho_uyen')).toBe(-1);

    const t = setup(16);
    t.give(mats);
    t.send('forge', { id: RECIPE }, 'frg-aaaa', 'npc_thiet_lao');
    const it = t.c.inv.find((s) => s?.id === 'itm_lm_ho_uyen');
    expect(it).toBeTruthy();
    expect(it!.inst!.q).toBeGreaterThanOrEqual(2);
    expect(it!.inst!.gems.length).toBeGreaterThanOrEqual(2);
    expect(t.c.gold).toBe(0);

    const h = setup(16);
    h.give(mats);
    h.send('forge', { id: RECIPE }, 'frg-bbbb', 'npc_hua_lao');
    expect(h.slotOf('itm_lm_ho_uyen')).toBeGreaterThanOrEqual(0);
  });

  it('thợ không có trong công thức bị từ chối', () => {
    const t = setup(16);
    t.give(mats);
    t.send('forge', { id: RECIPE }, 'frg-cccc', 'npc_duoc_su');
    expect(t.slotOf('itm_lm_ho_uyen')).toBe(-1);
  });
});
