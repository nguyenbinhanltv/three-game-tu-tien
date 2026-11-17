import { beforeAll, describe, expect, it } from 'vitest';
import { COSMETIC_SLOTS, EQUIP_SLOTS, groundAt, isEquipSlot, isWearSlot, WEAR_SLOTS } from '@dtl/shared';

// Ô ngoại hình (skin, ô thứ 10): chỉ đổi hình, không chỉ số; mặc/tháo qua giao dịch có idem + ledger như trang bị.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;
let ITEM: typeof import('@dtl/content').ITEM;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ sqlite } = await import('../db'));
  ({ ITEM } = await import('@dtl/content'));
});

const SKIN = 'itm_skin_varkessa';
const X = 2040;
const Z = 2040;
let acc = 61_000;

function setup(test = false) {
  const said: string[] = [];
  const host = { broadcast: () => undefined, broadcastExcept: () => undefined };
  const sim: Sim = new GameSim(new WorldState(), host as never, { levelId: 'van_lam', roomName: 'test', spawn: { x: X, z: Z }, respawn: { x: X, z: Z }, persistPosition: false });
  // Linh căn cố định để so chỉ số trước/sau không phụ thuộc lượt roll.
  const char = Character.create(acc++, 'Sk' + acc, null, 'kim' as never);
  char.level = 12;
  char.recalc();
  const client = { sessionId: 'c' + acc, send: (_type: string, msg: unknown) => said.push(JSON.stringify(msg)) };
  const p: Ent = sim.addPlayer(client as never, char, test, 's' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  char.inv.fill(null);
  return { sim, p, said };
}

const ledger = (id: number) => sqlite.prepare('SELECT kind, ref, delta, reason, idem FROM ledger WHERE char_id = ? ORDER BY id').all(id) as { kind: string; ref: string; delta: number; reason: string; idem: string | null }[];
const stats = (p: Ent) => ({ atk: p.char.atk, def: p.char.def, mhp: p.char.mhp, mmp: p.char.mmp, sets: JSON.stringify(p.char.stats.sets) });

describe('ô ngoại hình (skin)', () => {
  it('skin là ô mặc nhưng không phải ô có chỉ số', () => {
    expect(COSMETIC_SLOTS).toEqual(['skin']);
    expect(EQUIP_SLOTS).not.toContain('skin');
    expect(WEAR_SLOTS).toHaveLength(EQUIP_SLOTS.length + 1);
    expect(isWearSlot('skin')).toBe(true);
    expect(isEquipSlot('skin')).toBe(false);
    const def = ITEM.get(SKIN)!;
    expect(def.kind).toBe('skin');
    expect(def.stats).toBeUndefined();
    expect(def.skin).toBeTruthy();
  });

  it('mặc: món rời túi vào ô skin, chỉ số không đổi, ledger có dòng noop mang khóa idem, hình hiển thị đổi', () => {
    const { sim, p } = setup();
    expect(p.char.tx('test:give', null, (d) => d.add(SKIN, 1))).toBe(true);
    const slot = p.char.inv.findIndex((s) => s?.id === SKIN);
    const before = stats(p);
    sim.onEquip(p, { slot, r: 'skin-eq-0001' });
    expect(p.char.equip.skin?.id).toBe(SKIN);
    expect(p.char.inv[slot]).toBeNull();
    expect(stats(p)).toEqual(before);
    sim.tick(50);
    expect(p.s.sn).toBe(SKIN);
    const rows = ledger(p.char.id);
    expect(rows.filter((r) => r.kind === 'item')).toEqual([expect.objectContaining({ ref: SKIN, delta: 1 })]);
    expect(rows.find((r) => r.idem === `${p.char.id}:skin-eq-0001`)).toMatchObject({ kind: 'noop', reason: `equip:skin:${SKIN}` });
    expect(p.char.equipCount(SKIN)).toBe(1);
  });

  it('cùng khóa idem lần hai bị từ chối; tháo về túi cũng qua giao dịch có khóa', () => {
    const { sim, p } = setup();
    p.char.tx('test:give', null, (d) => d.add(SKIN, 1));
    sim.onEquip(p, { slot: 0, r: 'skin-eq-0002' });
    p.equipCdAt = 0;
    sim.onUnequip(p, { slot: 'skin', r: 'skin-eq-0002' });
    expect(p.char.equip.skin?.id).toBe(SKIN); // khóa trùng: không tháo
    p.equipCdAt = 0;
    sim.onUnequip(p, { slot: 'skin', r: 'skin-un-0002' });
    expect(p.char.equip.skin).toBeUndefined();
    expect(p.char.inv.filter((s) => s?.id === SKIN)).toHaveLength(1);
    sim.tick(50);
    expect(p.s.sn).toBe('');
    expect(ledger(p.char.id).find((r) => r.idem === `${p.char.id}:skin-un-0002`)).toMatchObject({ kind: 'noop', reason: `unequip:skin:${SKIN}` });
  });

  it('không sở hữu thì không mặc được: ô trống, ô chứa món khác, ô ngoài phạm vi', () => {
    const { sim, p } = setup();
    p.char.tx('test:give', null, (d) => d.add('itm_linh_thao', 3));
    for (const [i, slot] of [0, 5, -1, 9999, 'skin'].entries()) {
      p.equipCdAt = 0;
      sim.onEquip(p, { slot, r: 'skin-bad-000' + i });
    }
    expect(p.char.equip.skin).toBeUndefined();
    sim.tick(50);
    expect(p.s.sn).toBe('');
  });

  it('còn nguyên sau khi nạp lại từ DB và sau một giao dịch khác; túi đầy thì không tháo được', () => {
    const { sim, p } = setup();
    p.char.tx('test:give', null, (d) => d.add(SKIN, 1));
    sim.onEquip(p, { slot: 0, r: 'skin-eq-0003' });
    // Giao dịch không liên quan (thêm vật phẩm) không được làm rơi món ở ô skin.
    expect(p.char.tx('test:other', null, (d) => d.add('itm_linh_thao', 1))).toBe(true);
    expect(p.char.equip.skin?.id).toBe(SKIN);
    expect(Character.load(p.char.id).equip.skin).toEqual({ id: SKIN, n: 1 });
    for (let i = 0; i < p.char.inv.length; i++) if (!p.char.inv[i]) p.char.inv[i] = { id: 'itm_moc_kiem', n: 1 };
    p.equipCdAt = 0;
    sim.onUnequip(p, { slot: 'skin', r: 'skin-un-0003' });
    expect(p.char.equip.skin?.id).toBe(SKIN);
  });

  it('dữ liệu hỏng ở ô skin bị bỏ khi nạp (món không phải skin)', () => {
    const { p } = setup();
    sqlite.prepare('UPDATE characters SET equip = ? WHERE id = ?').run(JSON.stringify({ skin: { id: 'itm_moc_kiem', n: 1, plus: 10 } }), p.char.id);
    expect(Character.load(p.char.id).equip.skin).toBeUndefined();
  });

  it('/gm skin: tài khoản thử lấy + mặc, off tháo; tài khoản thường bị từ chối', () => {
    const t = setup(true);
    t.sim.onChat(t.p, { m: `/gm skin ${SKIN}` });
    expect(t.p.char.equip.skin?.id).toBe(SKIN);
    expect(ledger(t.p.char.id).filter((r) => r.kind === 'item' && r.ref === SKIN)).toEqual([expect.objectContaining({ delta: 1, reason: 'gm:skin' })]);
    (t.p as unknown as { chatAt: number }).chatAt = 0;
    t.sim.onChat(t.p, { m: '/gm skin off' });
    expect(t.p.char.equip.skin).toBeUndefined();
    expect(t.p.char.inv.filter((s) => s?.id === SKIN)).toHaveLength(1);

    const n = setup(false);
    n.sim.onChat(n.p, { m: `/gm skin ${SKIN}` });
    expect(n.p.char.equip.skin).toBeUndefined();
    expect(n.p.char.inv.some((s) => s?.id === SKIN)).toBe(false);
  });
});
