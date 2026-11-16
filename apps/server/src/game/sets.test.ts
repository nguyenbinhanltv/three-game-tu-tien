import { beforeAll, describe, expect, it } from 'vitest';
import { DUST_ITEM, type FxMsg } from '@dtl/shared';
import { FORGE, ITEM, SETS } from '@dtl/content';

process.env.DB_FILE = ':memory:';

type Ch = InstanceType<typeof import('./character').Character>;
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
  const acc = 950_000 + ++seq;
  const c: Ch = Character.create(acc, 'St' + acc, null, 'kim' as never);
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
    questEvent: (pl, type, target, n) => void pl.char.questEvent(type, target, n),
  });
  let n = 0;
  const forge = (id: string, r = 'frg-' + ++n) => {
    now += 1000;
    sys.onUpgrade(p, { npc: 'npc_thiet_lao', op: 'forge', id, r });
  };
  const fund = (id: string) => {
    const f = FORGE.find((x) => x.id === id)!;
    expect(c.tx('fund', null, (d) => (f.inputs.every((i) => d.add(i.id, i.n)), d.addGold(f.gold), true))).toBe(true);
    return f;
  };
  const count = (id: string) => c.inv.reduce((s, x) => s + (x && x.id === id ? x.n : 0), 0);
  return { c, forge, fund, count, warns };
}

describe('dữ liệu bộ', () => {
  it('bảy bộ, mỗi món trỏ đúng bộ, công thức chế bậc 1 chỉ ra món của bộ Lạc Kiếm', () => {
    expect(SETS.map((s) => s.id)).toEqual(['set_lac_kiem', 'set_huyen_giap', 'set_dan_tam', 'set_han_giao', 'set_liet_mach', 'set_dia_giap', 'set_phuc_mach', 'set_kinh_quang', 'set_van_kinh', 'set_luu_ly']);
    for (const s of SETS) for (const pid of s.pieces) expect(ITEM.get(pid)?.set).toBe(s.id);
    for (const f of FORGE.filter((x) => x.id.startsWith('frg_lk_'))) expect(ITEM.get(f.output)?.set).toBe('set_lac_kiem');
  });
});

describe('chế tạo bộ ở Thiết lão', () => {
  it('trừ nguyên liệu + linh thạch, ra món có inst (Huyền/Địa), ledger ghi seed', () => {
    const t = setup();
    const f = t.fund('frg_lk_dao_bao');
    t.forge(f.id);
    const out = t.c.inv.find((s) => s?.id === f.output);
    expect(out?.inst).toBeTruthy();
    expect([2, 3]).toContain(out!.inst!.q);
    expect(out!.inst!.affixes.length).toBe(out!.inst!.q);
    for (const i of f.inputs) expect(t.count(i.id)).toBe(0);
    expect(t.c.gold).toBe(0);
    const rows = sqlite.prepare("SELECT reason FROM ledger WHERE char_id = ? AND reason LIKE 'forge:%'").all(t.c.id) as { reason: string }[];
    expect(rows.length).toBeGreaterThan(0);
  });

  it('cùng khóa idem không chế hai lần; thiếu nguyên liệu hoặc linh thạch thì không đổi gì', () => {
    const t = setup();
    const f = t.fund('frg_lk_ho_uyen');
    t.fund('frg_lk_ho_uyen');
    t.forge(f.id, 'dup-key');
    t.forge(f.id, 'dup-key');
    expect(t.c.inv.filter((s) => s?.id === f.output)).toHaveLength(1);
    expect(t.count(DUST_ITEM)).toBe(f.inputs.find((i) => i.id === DUST_ITEM)!.n);
    const poor = setup();
    poor.forge(f.id);
    expect(poor.c.inv.some((s) => s?.id === f.output)).toBe(false);
    expect(poor.warns).toContain('sys.not_enough_gold');
    const noMat = setup();
    expect(noMat.c.tx('g', null, (d) => (d.addGold(f.gold), true))).toBe(true);
    noMat.forge(f.id);
    expect(noMat.c.gold).toBe(f.gold);
    expect(noMat.warns).toContain('sys.not_enough_mat');
  });

  it('công thức lạ bị bỏ qua', () => {
    const t = setup();
    t.forge('frg_khong_co');
    expect(t.c.inv.every((s) => !s)).toBe(true);
  });

  it('túi đầy: hủy cả giao dịch, nguyên liệu và linh thạch không mất', () => {
    const t = setup();
    const f = t.fund('frg_lk_van_ngoa');
    // Dư một đơn vị mỗi nguyên liệu để tiêu xong ô vẫn còn đồ (không giải phóng ô trống nào), rồi lấp kín túi.
    for (const i of f.inputs) expect(t.c.tx('extra', null, (d) => d.add(i.id, 1))).toBe(true);
    while (t.c.tx('pad', null, (d) => d.add('itm_linh_thao', 99))) {
      /* lấp tới khi hết ô */
    }
    expect(t.c.inv.some((s) => !s)).toBe(false);
    const mats = f.inputs.map((i) => t.count(i.id));
    t.forge(f.id);
    expect(t.c.inv.some((s) => s?.id === f.output)).toBe(false);
    expect(t.warns).toContain('sys.inv_full');
    expect(t.c.gold).toBe(f.gold);
    expect(f.inputs.map((i) => t.count(i.id))).toEqual(mats);
  });

  it('mặc 1 món chưa có thưởng, 2 món có chỉ số, đủ 4 món bật hiệu ứng Phi Kiếm', () => {
    const t = setup();
    t.c.level = 13;
    const set = SETS.find((s) => s.id === 'set_lac_kiem')!;
    const wear = (ids: string[]) => {
      t.c.tx('wear', null, (d) => {
        d.equip = {};
        for (const id of ids) d.addRolled(id, 12, 2);
        for (const id of ids) {
          const i = d.inv.findIndex((s) => s?.id === id);
          d.equip[ITEM.get(id)!.kind as 'robe'] = d.inv[i]!;
          d.inv[i] = null;
        }
        return true;
      });
      t.c.recalc();
    };
    wear(set.pieces.slice(0, 1));
    expect(t.c.stats.setFx.phiKiemExtra).toBe(0);
    wear(set.pieces.slice(0, 2));
    expect(t.c.stats.sets[0].n).toBe(2);
    expect(t.c.stats.setFx.phiKiemExtra).toBe(0);
    wear(set.pieces);
    expect(t.c.stats.setFx.phiKiemExtra).toBe(0.2);
  });
});
