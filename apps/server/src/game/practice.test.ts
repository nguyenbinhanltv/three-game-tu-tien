import { beforeAll, describe, expect, it } from 'vitest';

// Hàng rào Diễn Võ Trường: chụp nhân vật lúc vào, trả nguyên trạng lúc ra; sổ cái vẫn khớp và khóa chống trùng được nhả.
process.env.DB_FILE = ':memory:';

let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;
let practice: typeof import('./practice');

beforeAll(async () => {
  ({ Character } = await import('./character'));
  ({ sqlite } = await import('../db'));
  practice = await import('./practice');
});

let nextAcc = 91000;
function mk() {
  const acc = nextAcc++;
  sqlite.prepare('INSERT INTO accounts (id, sub, email, created_at) VALUES (?, ?, ?, 0)').run(acc, `p${acc}`, `p${acc}@t`);
  return Character.create(acc, 'Tap' + acc, null, null);
}

const ledgerSum = (id: number, kind: string, ref = '') =>
  (sqlite.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM ledger WHERE char_id = ? AND kind = ? AND ref = ?').get(id, kind, ref) as { s: number }).s;

describe('practice (ảnh chụp nhân vật của phòng tập)', () => {
  it('ra khỏi phòng: cấp, tiền, túi, meta trở về như lúc vào', () => {
    const c = mk();
    c.tx('seed', null, (d) => d.add('itm_hoi_khi_dan', 3) && (d.addGold(100), true));
    c.save();
    practice.practiceBegin(c.id);
    expect(practice.practicePending(c.id)).toBe(true);

    const in1 = Character.load(c.id);
    in1.level = 30;
    in1.meta.method = 'lac_kiem_quyet';
    in1.tx('gm', 'reward:once', (d) => d.add('itm_hoi_khi_dan', 7) && (d.addGold(5000), true));
    in1.save();

    expect(practice.practiceEnd(c.id)).toBe(true);
    expect(practice.practicePending(c.id)).toBe(false);
    const out = Character.load(c.id);
    expect(out.level).toBe(1);
    expect(out.gold).toBe(100);
    expect(out.meta.method).toBeUndefined();
    expect(out.inv.filter((x) => x?.id === 'itm_hoi_khi_dan').reduce((n, x) => n + (x?.n ?? 0), 0)).toBe(3);
  });

  it('sổ cái: tổng vẫn khớp với túi, khóa chống trùng dùng trong phòng được nhả', () => {
    const c = mk();
    c.tx('seed', null, (d) => (d.addGold(40), true));
    practice.practiceBegin(c.id);
    const inside = Character.load(c.id);
    expect(inside.tx('quest', `q:${c.id}`, (d) => d.add('itm_hoi_khi_dan', 2) && (d.addGold(60), true))).toBe(true);
    practice.practiceEnd(c.id);
    expect(ledgerSum(c.id, 'gold')).toBe(40);
    expect(ledgerSum(c.id, 'item', 'itm_hoi_khi_dan')).toBe(0);
    // Thưởng thật về sau với cùng khóa không bị coi là đã phát.
    const real = Character.load(c.id);
    expect(real.tx('quest', `q:${c.id}`, (d) => (d.addGold(60), true))).toBe(true);
    expect(Character.load(c.id).gold).toBe(100);
  });

  it('không có ảnh chụp thì không đổi gì; vào lại khi còn ảnh cũ thì trả ảnh cũ trước', () => {
    const c = mk();
    expect(practice.practiceEnd(c.id)).toBe(false);
    practice.practiceBegin(c.id);
    const a = Character.load(c.id);
    a.level = 20;
    a.save();
    // Server chết giữa chừng rồi người chơi vào phòng tập lần nữa: ảnh mới phải là nhân vật THẬT (cấp 1), không phải bản cấp 20.
    practice.practiceBegin(c.id);
    const b = Character.load(c.id);
    b.level = 40;
    b.save();
    practice.practiceEnd(c.id);
    expect(Character.load(c.id).level).toBe(1);
  });

  it('nhớ level đứng trước khi vào', () => {
    const c = mk();
    c.room = 'van_hai';
    c.save();
    practice.practiceBegin(c.id);
    expect(practice.practiceOrigin(c.id)).toBe('van_hai');
    practice.practiceEnd(c.id);
    expect(practice.practiceOrigin(c.id)).toBeNull();
  });
});
