import { beforeAll, describe, expect, it } from 'vitest';
import { C, groundAt, S } from '@dtl/shared';

// Tủ ngoại trang (P4): mở khóa trong transaction, chọn dáng/nhuộm do server kiểm, chỉ đổi hiển thị không đổi chỉ số.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;
let migrateWardrobe: typeof import('../db').migrateWardrobe;
let openDb: typeof import('../db').openDb;
let ITEM: typeof import('@dtl/content').ITEM;
let APPEARANCE: typeof import('@dtl/content').APPEARANCE;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ sqlite, migrateWardrobe, openDb } = await import('../db'));
  ({ ITEM, APPEARANCE } = await import('@dtl/content'));
});

const X = 2040;
const Z = 2040;
let acc = 71_000;
let seq = 0;
const ROBE_A = 'itm_bo_y';
const ROBE_B = 'itm_dao_bao';
const SWORD_A = 'itm_moc_kiem';
const SWORD_B = 'itm_thanh_phong_kiem';

function setup(g: 'm' | 'f' = 'm') {
  const said: { type: string; msg: unknown }[] = [];
  const host = { broadcast: () => undefined, broadcastExcept: () => undefined };
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'Wd' + acc, { g, dye: APPEARANCE.defaultDye }, 'kim' as never);
  char.level = 12;
  char.recalc();
  const client = { sessionId: 'c' + acc, send: (type: string, msg: unknown) => said.push({ type, msg }) };
  const p: Ent = sim.addPlayer(client as never, char, false, 's' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  char.inv.fill(null);
  return { sim, p, said, char };
}

type Char = InstanceType<typeof Character>;
const give = (c: Char, id: string) => c.tx('give:' + id, `give${++seq}`, (d) => d.add(id, 1));
const msgOf = (extra: object = {}) => ({ r: 'r' + ++seq + 'xyz', ...extra });
/** Cho qua giãn 200 ms của mặc/tháo đồ. */
const wait = (p: Ent) => {
  p.equipCdAt = 0;
};
const ledger = (id: number) =>
  sqlite.prepare('SELECT kind, reason, idem FROM ledger WHERE char_id = ? ORDER BY id').all(id) as {
    kind: string;
    reason: string;
    idem: string | null;
  }[];
const owned = (id: number) =>
  (sqlite.prepare('SELECT item_id FROM wardrobe WHERE char_id = ?').all(id) as { item_id: string }[]).map((r) => r.item_id).sort();
function dyeTriple(): [string, string, string] {
  const [a, b, c] = APPEARANCE.dyes;
  return [a!.id, b!.id, c!.id];
}

describe('tủ ngoại trang: mở khóa', () => {
  it('món vào túi thì vào tủ (DB + bộ nhớ); bán đi vẫn còn', () => {
    const { char } = setup();
    expect(give(char, ROBE_A)).toBe(true);
    expect(char.wardrobe.has(ROBE_A)).toBe(true);
    expect(owned(char.id)).toEqual([ROBE_A]);
    char.tx('sell', null, (d) => {
      const i = d.inv.findIndex((s) => s?.id === ROBE_A);
      d.inv[i] = null;
      return true;
    });
    expect(char.inv.some((s) => s?.id === ROBE_A)).toBe(false);
    expect(owned(char.id)).toEqual([ROBE_A]);
    expect(char.wardrobeDirty).toBe(true);
  });

  it('vật phẩm không có hình trên người (nguyên liệu, nhẫn, skin) không vào tủ', () => {
    const { char } = setup();
    const odd = [...ITEM.values()].filter((d) => d.kind === 'material' || d.kind === 'ring' || d.kind === 'skin').slice(0, 6);
    expect(odd.length).toBeGreaterThan(0);
    for (const d of odd) give(char, d.id);
    expect(owned(char.id)).toEqual([]);
  });

  it('giao dịch thất bại thì không mở khóa và túi không đổi (hủy, trùng idem)', () => {
    const { char } = setup();
    const key = 'dupkey' + acc;
    expect(char.tx('x', key, (d) => d.add(ROBE_A, 1))).toBe(true);
    // trùng idem: DB ném UNIQUE → cả giao dịch (kể cả ghi tủ) lùi lại
    const before = JSON.stringify(char.inv);
    expect(char.tx('x', key, (d) => d.add(ROBE_B, 1))).toBe(false);
    expect(char.txFail).toBe('dup');
    expect(JSON.stringify(char.inv)).toBe(before);
    expect(char.wardrobe.has(ROBE_B)).toBe(false);
    expect(owned(char.id)).toEqual([ROBE_A]);
    // hủy trong fn
    expect(char.tx('x', null, (d) => (d.add(ROBE_B, 1), false))).toBe(false);
    expect(owned(char.id)).toEqual([ROBE_A]);
  });

  it('không có tin nhắn nào để client tự mở khóa', () => {
    const { sim, p, char } = setup();
    sim.wardrobe.onLookSet(p, msgOf({ slot: 'robe', id: ROBE_A }));
    expect(char.look.over).toEqual({});
    expect(owned(char.id)).toEqual([]);
  });
});

describe('tủ ngoại trang: chọn dáng', () => {
  it('chọn món đã mở khóa: đổi hiển thị, KHÔNG đổi chỉ số/trang bị thật, ghi ledger noop có idem', () => {
    const { sim, p, char } = setup();
    give(char, SWORD_A);
    give(char, SWORD_B);
    sim.onEquip(p, { slot: char.inv.findIndex((s) => s?.id === SWORD_B), r: 'eq' + ++seq + 'abc' });
    wait(p);
    expect(char.equip.weapon?.id).toBe(SWORD_B);
    sim.syncPublic(p);
    expect(p.s.wp).toBe(SWORD_B);
    const stats = [char.atk, char.def, char.mhp];
    const m = msgOf({ slot: 'weapon', id: SWORD_A });
    sim.wardrobe.onLookSet(p, m);
    expect(char.look.over.weapon).toBe(SWORD_A);
    sim.syncPublic(p);
    expect(p.s.wp).toBe(SWORD_A); // người xem thấy kiếm khác
    expect([char.atk, char.def, char.mhp]).toEqual(stats);
    expect(char.equip.weapon?.id).toBe(SWORD_B); // trang bị thật không đổi
    const rows = ledger(char.id).filter((r) => r.reason.startsWith('look:'));
    expect(rows).toEqual([{ kind: 'noop', reason: `look:weapon:${SWORD_A}`, idem: `${char.id}:${(m as { r: string }).r}` }]);
    // lưu DB và nạp lại
    expect(Character.load(char.id).look.over.weapon).toBe(SWORD_A);
  });

  it('nhuộm hiện qua dye3 cho người xem; bỏ nhuộm thì rỗng', () => {
    const { sim, p } = setup();
    sim.wardrobe.onLookDye(p, msgOf({ dye: dyeTriple() }));
    sim.syncPublic(p);
    expect(p.s.dye3).toBe(dyeTriple().join(','));
    wait(p);
    sim.wardrobe.onLookDye(p, msgOf({ dye: null }));
    sim.syncPublic(p);
    expect(p.s.dye3).toBe('');
  });

  it('chưa mở khóa / sai ô / mẫu lạ / kiểu sai: từ chối, không đổi gì', () => {
    const { sim, p, char } = setup();
    give(char, ROBE_A);
    const bads: unknown[] = [
      { slot: 'robe', id: ROBE_B }, // chưa có trong tủ
      { slot: 'head', id: ROBE_A }, // sai ô
      { slot: 'robe', id: 'itm_khong_co' },
      { slot: 'skin', id: ROBE_A },
      { slot: 'robe', id: 5 },
      { slot: 'robe', id: ['x'] },
      { slot: 'robe' },
      'robe',
      null,
    ];
    for (const bad of bads) {
      wait(p);
      sim.wardrobe.onLookSet(p, typeof bad === 'object' && bad ? msgOf(bad) : bad);
    }
    expect(char.look.over).toEqual({});
    expect(ledger(char.id).some((r) => r.reason.startsWith('look:'))).toBe(false);
  });

  it('sai giới tính: từ chối (món vẫn trong tủ)', () => {
    const { sim, p, char } = setup('m');
    give(char, ROBE_A);
    const def = ITEM.get(ROBE_A) as { gender?: string };
    def.gender = 'f';
    try {
      sim.wardrobe.onLookSet(p, msgOf({ slot: 'robe', id: ROBE_A }));
    } finally {
      delete def.gender;
    }
    expect(char.look.over).toEqual({});
    expect(char.wardrobe.has(ROBE_A)).toBe(true);
  });

  it('khóa idem trùng không áp dụng hai lần; thiếu r hợp lệ thì bỏ', () => {
    const { sim, p, char } = setup();
    give(char, ROBE_A);
    const m = msgOf({ slot: 'robe', id: ROBE_A });
    sim.wardrobe.onLookSet(p, m);
    wait(p);
    sim.wardrobe.onLookSet(p, { slot: 'robe', id: null, r: (m as { r: string }).r });
    expect(char.look.over.robe).toBe(ROBE_A);
    wait(p);
    sim.wardrobe.onLookSet(p, { slot: 'robe', id: null });
    expect(char.look.over.robe).toBe(ROBE_A);
  });

  it('id null và reset trả về dáng đang mặc', () => {
    const { sim, p, char } = setup();
    give(char, ROBE_A);
    sim.wardrobe.onLookSet(p, msgOf({ slot: 'robe', id: ROBE_A }));
    wait(p);
    sim.wardrobe.onLookDye(p, msgOf({ dye: dyeTriple() }));
    wait(p);
    sim.wardrobe.onLookSet(p, msgOf({ slot: 'robe', id: null }));
    expect(char.look.over).toEqual({});
    expect(char.look.dye).toBeDefined();
    wait(p);
    sim.wardrobe.onLookReset(p, msgOf());
    expect(char.look.dye).toBeUndefined();
    expect(char.look.over).toEqual({});
  });

  it('tâm ma: không đổi', () => {
    const { sim, p, char } = setup();
    give(char, ROBE_A);
    p.trial = { endAt: 0, monId: 'x', x: 0, z: 0 };
    sim.wardrobe.onLookSet(p, msgOf({ slot: 'robe', id: ROBE_A }));
    expect(char.look.over).toEqual({});
  });
});

describe('tủ ngoại trang: nhuộm', () => {
  it('nhận ba id màu trong bảng; màu tự do/sai số lượng bị từ chối', () => {
    const { sim, p, char } = setup();
    sim.wardrobe.onLookDye(p, msgOf({ dye: dyeTriple() }));
    expect(char.look.dye).toEqual(dyeTriple());
    const bads = [{ dye: ['#ff0000', 'x', 'y'] }, { dye: dyeTriple().slice(0, 2) }, { dye: 'a,b,c' }, { dye: [...dyeTriple(), 'z'] }, {}];
    for (const bad of bads) {
      wait(p);
      sim.wardrobe.onLookDye(p, msgOf(bad));
    }
    expect(char.look.dye).toEqual(dyeTriple());
  });

  it('miễn phí: không đụng linh thạch/vật phẩm, chỉ dòng noop', () => {
    const { sim, p, char } = setup();
    char.gold = 100;
    const before = ledger(char.id).length;
    sim.wardrobe.onLookDye(p, msgOf({ dye: dyeTriple() }));
    expect(char.gold).toBe(100);
    expect(
      ledger(char.id)
        .slice(before)
        .map((r) => r.kind),
    ).toEqual(['noop']);
  });
});

describe('tủ ngoại trang: tải lại và dữ liệu cũ', () => {
  it('look còn món đã mất khỏi tủ thì bị dọn khi nạp', () => {
    const { sim, p, char } = setup();
    give(char, ROBE_A);
    sim.wardrobe.onLookSet(p, msgOf({ slot: 'robe', id: ROBE_A }));
    sqlite.prepare('DELETE FROM wardrobe WHERE char_id = ?').run(char.id);
    expect(Character.load(char.id).look.over).toEqual({});
  });

  it('JSON look hỏng: nạp không lỗi, look rỗng', () => {
    const { char } = setup();
    sqlite.prepare('UPDATE characters SET look = ? WHERE id = ?').run('{hỏng', char.id);
    expect(Character.load(char.id).look).toEqual({ over: {} });
  });

  it('migrate v7: điền tủ từ túi + trang bị cũ, không ghi ledger, chạy lại không nhân đôi', () => {
    const { sqlite: s2 } = openDb(':memory:');
    const equip = JSON.stringify({ robe: { id: ROBE_A, n: 1 }, ring: { id: 'itm_x', n: 1 } });
    s2.prepare("INSERT INTO characters (account_id, name, equip) VALUES (1, 'a', ?)").run(equip);
    s2.prepare('INSERT INTO items (char_id, slot, item_id, qty) VALUES (1, 0, ?, 1), (1, 1, ?, 1), (1, 2, ?, 5)').run(
      SWORD_B,
      ROBE_B,
      'itm_khong_co',
    );
    s2.prepare("INSERT INTO characters (account_id, name, equip) VALUES (2, 'b', 'hỏng')").run();
    migrateWardrobe(s2);
    migrateWardrobe(s2);
    const rows = (s2.prepare('SELECT item_id FROM wardrobe WHERE char_id = 1').all() as { item_id: string }[]).map((r) => r.item_id).sort();
    expect(rows).toEqual([ROBE_A, ROBE_B, SWORD_B].sort());
    expect((s2.prepare('SELECT COUNT(*) AS n FROM ledger').get() as { n: number }).n).toBe(0);
  });
});

describe('tủ ngoại trang: giao thức', () => {
  it('S.WARDROBE gửi cho chủ khi có thay đổi, kèm danh sách sở hữu và look', () => {
    const { sim, p, said, char } = setup();
    give(char, ROBE_A);
    sim.wardrobe.flush(p);
    const sent = said.filter((m) => m.type === S.WARDROBE).pop()!.msg as { owned: string[]; look: unknown };
    expect(sent.owned).toContain(ROBE_A);
    expect(sent.look).toEqual({ over: {} });
    const n = said.length;
    sim.wardrobe.flush(p); // không đổi thì không gửi
    expect(said.length).toBe(n);
  });

  it('kết nối lại: client mới nhận lại tủ khi đánh dấu gửi lại như nhánh allowReconnection (base.ts)', () => {
    const { sim, p, said, char } = setup();
    give(char, ROBE_A);
    sim.wardrobe.flush(p);
    sim.wardrobe.flush(p);
    const n = said.filter((m) => m.type === S.WARDROBE).length;
    // Đúng cờ mà base.ts bật khi kết nối lại thành công.
    char.charDirty = char.invDirty = char.questDirty = char.wardrobeDirty = true;
    sim.wardrobe.flush(p);
    expect(said.filter((m) => m.type === S.WARDROBE).length).toBe(n + 1);
    expect(C.LOOK_SET).toBe('lk');
  });
});
