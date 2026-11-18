import { beforeAll, describe, expect, it } from 'vitest';
import { COSMETIC_SLOTS, EQUIP_SLOTS, groundAt, isEquipSlot, isWearSlot, wearableBy, WEAR_SLOTS } from '@dtl/shared';

// Ô ngoại hình (skin, ô thứ 10): chỉ đổi hình, không chỉ số; mặc/tháo qua giao dịch có idem + ledger như trang bị.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;
let ITEM: typeof import('@dtl/content').ITEM;
let APPEARANCE: typeof import('@dtl/content').APPEARANCE;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ sqlite } = await import('../db'));
  ({ ITEM, APPEARANCE } = await import('@dtl/content'));
});

const SKIN = 'itm_skin_varkessa';
const X = 2040;
const Z = 2040;
let acc = 61_000;

/** `g`: giới tính nhân vật thử; skin Varkessa chỉ dành cho nữ nên mặc định là nữ. */
function setup(test = false, g: 'm' | 'f' = 'f') {
  const said: string[] = [];
  const host = { broadcast: () => undefined, broadcastExcept: () => undefined };
  const sim: Sim = new GameSim(new WorldState(), host as never, { levelId: 'van_lam', roomName: 'test', spawn: { x: X, z: Z }, respawn: { x: X, z: Z }, persistPosition: false });
  // Linh căn cố định để so chỉ số trước/sau không phụ thuộc lượt roll.
  const char = Character.create(acc++, 'Sk' + acc, { g, dye: APPEARANCE.defaultDye }, 'kim' as never);
  char.level = 12;
  char.recalc();
  const client = { sessionId: 'c' + acc, send: (type: string, msg: unknown) => said.push(type + ' ' + JSON.stringify(msg)) };
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

  describe('giới hạn giới tính (Varkessa chỉ cho nhân vật nữ)', () => {
    it('hàm thuần: món không giới hạn ai cũng mặc được, món có giới hạn chỉ đúng giới', () => {
      expect(ITEM.get(SKIN)!.gender).toBe('f');
      expect(wearableBy(ITEM.get(SKIN), 'f')).toBe(true);
      expect(wearableBy(ITEM.get(SKIN), 'm')).toBe(false);
      expect(wearableBy(ITEM.get(SKIN), '')).toBe(false);
      expect(wearableBy(ITEM.get('itm_moc_kiem'), 'm')).toBe(true);
      expect(wearableBy(undefined, 'm')).toBe(true);
    });

    it.each([
      ['itm_skin_duskrella', 'f', 'm'],
      ['itm_skin_crimson_knight', 'm', 'f'],
    ] as const)('%s chỉ cho giới %s: đúng giới mặc được (sn đồng bộ), sai giới %s bị từ chối', (id, ok, bad) => {
      expect(ITEM.get(id)!.gender).toBe(ok);
      const good = setup(false, ok);
      good.p.char.tx('test:give', null, (d) => d.add(id, 1));
      good.sim.onEquip(good.p, { slot: 0, r: `skin-${id}-ok` });
      good.sim.tick(50);
      expect(good.p.char.equip.skin?.id).toBe(id);
      expect(good.p.s.sn).toBe(id);
      const no = setup(false, bad);
      no.p.char.tx('test:give', null, (d) => d.add(id, 1));
      no.sim.onEquip(no.p, { slot: 0, r: `skin-${id}-no` });
      expect(no.p.char.equip.skin).toBeUndefined();
      expect(no.said.some((m) => m.includes('sys.equip_gender'))).toBe(true);
    });

    it('nhân vật nam: server từ chối mặc, món vẫn nằm trong túi, có báo lý do, không ghi ledger mặc', () => {
      const { sim, p, said } = setup(false, 'm');
      p.char.tx('test:give', null, (d) => d.add(SKIN, 1));
      sim.onEquip(p, { slot: 0, r: 'skin-gd-0001' });
      expect(p.char.equip.skin).toBeUndefined();
      expect(p.char.inv[0]).toEqual({ id: SKIN, n: 1 });
      expect(said.some((m) => m.includes('sys.equip_gender'))).toBe(true);
      expect(ledger(p.char.id).some((r) => r.reason.startsWith('equip:skin'))).toBe(false);
      sim.tick(50);
      expect(p.s.sn).toBe('');
    });

    it('/gm skin với nhân vật nam (tài khoản thử) cũng bị từ chối, không sinh vật phẩm', () => {
      const { sim, p } = setup(true, 'm');
      sim.onChat(p, { m: `/gm skin ${SKIN}` });
      expect(p.char.equip.skin).toBeUndefined();
      expect(p.char.inv.some((x) => x?.id === SKIN)).toBe(false);
      expect(ledger(p.char.id).filter((r) => r.ref === SKIN)).toHaveLength(0);
    });

    it('đổi giới tính sau khi mặc: skin không còn hiển thị cho người khác, nhưng món vẫn ở ô và tháo ra được', () => {
      const { sim, p } = setup();
      p.char.tx('test:give', null, (d) => d.add(SKIN, 1));
      sim.onEquip(p, { slot: 0, r: 'skin-gd-0002' });
      sim.tick(50);
      expect(p.s.sn).toBe(SKIN);
      p.char.appearance = { ...p.char.appearance, g: 'm' };
      sim.tick(50);
      expect(p.s.sn).toBe('');
      expect(p.char.equip.skin?.id).toBe(SKIN);
      p.equipCdAt = 0;
      sim.onUnequip(p, { slot: 'skin', r: 'skin-gd-0003' });
      expect(p.char.equip.skin).toBeUndefined();
      expect(p.char.inv.filter((x) => x?.id === SKIN)).toHaveLength(1);
    });
  });

  describe('nạp nhân vật đang mặc skin sai giới', () => {
    const setEquip = (id: number, equip: unknown) => sqlite.prepare('UPDATE characters SET equip = ? WHERE id = ?').run(JSON.stringify(equip), id);

    it('nhân vật nam còn mặc Varkessa trong DB: lúc nạp món về túi, ô skin trống, không mất và không ghi ledger', () => {
      const { p } = setup(false, 'm');
      setEquip(p.char.id, { skin: { id: SKIN, n: 1 } });
      const c = Character.load(p.char.id);
      expect(c.equip.skin).toBeUndefined();
      expect(c.inv.filter((x) => x?.id === SKIN)).toEqual([{ id: SKIN, n: 1 }]);
      expect(ledger(p.char.id).filter((r) => r.reason === 'load:drop')).toHaveLength(0);
      // Đã ghi lại DB: nạp lần nữa vẫn đúng một món trong túi.
      const again = Character.load(p.char.id);
      expect(again.equip.skin).toBeUndefined();
      expect(again.inv.filter((x) => x?.id === SKIN)).toHaveLength(1);
    });

    it('nhân vật nữ đang mặc Varkessa: nạp lại vẫn mặc', () => {
      const { p } = setup(false, 'f');
      setEquip(p.char.id, { skin: { id: SKIN, n: 1 } });
      const c = Character.load(p.char.id);
      expect(c.equip.skin).toEqual({ id: SKIN, n: 1 });
      expect(c.inv.some((x) => x?.id === SKIN)).toBe(false);
    });
  });

  it('giao dịch dọn lúc nạp hỏng (lỗi DB): không mất món, cột equip giữ nguyên, lần nạp sau dọn lại được', async () => {
    const { vi } = await import('vitest');
    const { db } = await import('../db');
    const { p } = setup(false, 'm');
    const raw = JSON.stringify({ skin: { id: SKIN, n: 1 } });
    sqlite.prepare('UPDATE characters SET equip = ? WHERE id = ?').run(raw, p.char.id);
    const spy = vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new Error('giả lập lỗi DB');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const c = Character.load(p.char.id);
    spy.mockRestore();
    err.mockRestore();
    // Dọn hỏng: bộ nhớ giữ đúng nội dung DB (món vẫn ở ô), túi không có bản sao.
    expect(c.equip.skin).toEqual({ id: SKIN, n: 1 });
    expect(c.inv.some((x) => x?.id === SKIN)).toBe(false);
    // Một giao dịch thành công sau đó không được ghi đè cột equip thiếu món.
    expect(c.tx('test:other', null, (d) => d.add('itm_linh_thao', 1))).toBe(true);
    expect(JSON.parse((sqlite.prepare('SELECT equip FROM characters WHERE id = ?').get(p.char.id) as { equip: string }).equip)).toEqual({ skin: { id: SKIN, n: 1 } });
    // Lần nạp sau (DB bình thường) dọn được: món về túi, đúng một cái.
    const again = Character.load(p.char.id);
    expect(again.equip.skin).toBeUndefined();
    expect(again.inv.filter((x) => x?.id === SKIN)).toHaveLength(1);
  });

  describe('DB hỏng: món nằm sai ô không bị lặng lẽ xóa', () => {
    const setEquip = (id: number, equip: unknown) => sqlite.prepare('UPDATE characters SET equip = ? WHERE id = ?').run(JSON.stringify(equip), id);
    const drops = (id: number) => ledger(id).filter((r) => r.reason === 'load:drop');

    it('món không phải skin ở ô skin: trả về túi (giữ cấp cường hóa), không ghi ledger, nạp lần hai không nhân đôi', () => {
      const { p } = setup();
      setEquip(p.char.id, { skin: { id: 'itm_moc_kiem', n: 1, plus: 3 } });
      const c = Character.load(p.char.id);
      expect(c.equip.skin).toBeUndefined();
      expect(c.inv.filter((x) => x?.id === 'itm_moc_kiem')).toEqual([{ id: 'itm_moc_kiem', n: 1, plus: 3 }]);
      expect(drops(p.char.id)).toHaveLength(0);
      const again = Character.load(p.char.id);
      expect(again.inv.filter((x) => x?.id === 'itm_moc_kiem')).toHaveLength(1);
      expect(again.equip.skin).toBeUndefined();
    });

    it('skin nằm ở ô có chỉ số: trả về túi, ô đó trống, chỉ số như người không mặc gì', () => {
      const { p } = setup();
      // Mốc so sánh: chính nhân vật này nạp từ DB khi chưa mặc gì (cấp trong bộ nhớ của `setup` không được lưu).
      const clean = Character.load(p.char.id);
      const bare = { atk: clean.atk, def: clean.def, mhp: clean.mhp };
      setEquip(p.char.id, { weapon: { id: SKIN, n: 1, plus: 10 }, robe: { id: SKIN, n: 1 } });
      const c = Character.load(p.char.id);
      expect(c.equip.weapon).toBeUndefined();
      expect(c.equip.robe).toBeUndefined();
      // Skin không có cường hóa: món trả về túi không mang `plus`.
      expect(c.inv.filter((x) => x?.id === SKIN)).toEqual([
        { id: SKIN, n: 1 },
        { id: SKIN, n: 1 },
      ]);
      expect({ atk: c.atk, def: c.def, mhp: c.mhp }).toEqual(bare);
      expect(drops(p.char.id)).toHaveLength(0);
    });

    it('mẫu không còn tồn tại (ô skin và ô thường): bỏ và ghi ledger -1 lý do load:drop', () => {
      const { p } = setup();
      setEquip(p.char.id, { skin: { id: 'itm_khong_con_ton_tai', n: 1 }, ring: { id: 'itm_mau_da_xoa', n: 1 } });
      const c = Character.load(p.char.id);
      expect(c.equip.skin).toBeUndefined();
      expect(c.equip.ring).toBeUndefined();
      expect(drops(p.char.id).map((r) => [r.kind, r.ref, r.delta]).sort()).toEqual([
        ['item', 'itm_khong_con_ton_tai', -1],
        ['item', 'itm_mau_da_xoa', -1],
      ]);
      // Lần nạp sau không còn gì để dọn: không ghi thêm dòng nào.
      Character.load(p.char.id);
      expect(drops(p.char.id)).toHaveLength(2);
    });

    it('túi đầy: món sai ô không có chỗ về thì ghi ledger -1 thay vì biến mất không dấu vết', () => {
      const { p } = setup();
      expect(
        p.char.tx('test:fill', null, (d) => {
          for (let i = 0; i < d.inv.length; i++) d.inv[i] = { id: 'itm_moc_kiem', n: 1 };
          d.bump('itm_moc_kiem', d.inv.length);
          return true;
        }),
      ).toBe(true);
      setEquip(p.char.id, { skin: { id: 'itm_thiet_kiem', n: 1 } });
      const c = Character.load(p.char.id);
      expect(c.equip.skin).toBeUndefined();
      expect(c.inv.some((x) => x?.id === 'itm_thiet_kiem')).toBe(false);
      expect(drops(p.char.id).map((r) => [r.ref, r.delta])).toEqual([['itm_thiet_kiem', -1]]);
    });
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
