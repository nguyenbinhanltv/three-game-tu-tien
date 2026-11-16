// E1-C: thang 28 cấp — migration tu vi Trúc Cơ (DB v4) và bình cảnh Trúc Cơ → Nguyên Anh phía server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { bottleneckPill, xpNeed } from '@dtl/shared';

process.env.DB_FILE = ':memory:';

let openDb: typeof import('../db').openDb;
let DATA_VERSION: number;
let Character: typeof import('./character').Character;
let RealmSystem: typeof import('./realm').RealmSystem;

beforeAll(async () => {
  ({ openDb, DATA_VERSION } = await import('../db'));
  ({ Character } = await import('./character'));
  ({ RealmSystem } = await import('./realm'));
});

const OLD_NEED = (l: number) => 30_000 + (l - 16) * 20_000;

describe('migration tu vi Trúc Cơ (DB v3 → v4)', () => {
  it('giữ tỉ lệ tiến độ trong cấp, chặn ở đầy, nâng bk; chạy lại không nhân thêm', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-e1c-')), 'v3.db');
    const a = openDb(file);
    const ins = a.sqlite.prepare('INSERT INTO characters (account_id, name, level, xp, bk) VALUES (?, ?, ?, ?, ?)');
    ins.run(1, 'tc16_nuamay', 16, 15_000, 15); // nửa cấp
    ins.run(2, 'tc17_day', 17, 50_000, 15); // đầy cấp cũ
    ins.run(3, 'tc18_tran', 18, 90_000_000, 17 - 2); // cấp tối đa cũ, tu vi tích quá nhiều
    ins.run(4, 'tc18_ba', 18, 35_000, 15);
    ins.run(5, 'nk15_giu', 15, 9_999, 15); // Ngưng Khí không bị đụng
    ins.run(6, 'tc16_moi', 16, 0, 15);
    a.sqlite.pragma('user_version = 3');
    a.sqlite.close();

    const rows = (s: ReturnType<typeof openDb>['sqlite']) =>
      Object.fromEntries((s.prepare('SELECT name, level, xp, bk FROM characters').all() as { name: string; level: number; xp: number; bk: number }[]).map((r) => [r.name, r]));
    const b = openDb(file);
    expect(b.sqlite.pragma('user_version', { simple: true })).toBe(DATA_VERSION);
    const r = rows(b.sqlite);
    expect(r.tc16_nuamay.xp).toBe(Math.round((15_000 * xpNeed(16)) / OLD_NEED(16)));
    expect(r.tc16_nuamay.xp / xpNeed(16)).toBeCloseTo(0.5, 2);
    expect(r.tc17_day.xp).toBe(xpNeed(17));
    expect(r.tc17_day.bk).toBe(15); // cấp 17 là nút bình cảnh mới, chưa vượt
    expect(r.tc18_tran.xp).toBe(xpNeed(18)); // vẫn đủ điều kiện lên cấp 19
    expect(r.tc18_tran.bk).toBe(17); // đã qua nút 17
    expect(r.tc18_ba.xp).toBe(Math.round((35_000 * xpNeed(18)) / OLD_NEED(18)));
    expect(r.tc18_ba.bk).toBe(17);
    expect(r.nk15_giu.xp).toBe(9_999);
    expect(r.tc16_moi.xp).toBe(0);
    const snap = JSON.stringify(r);
    b.sqlite.close();

    const c = openDb(file);
    expect(JSON.stringify(rows(c.sqlite))).toBe(snap);
    expect(c.sqlite.prepare('SELECT COUNT(*) AS n FROM ledger').get()).toEqual({ n: 0 });
    c.sqlite.close();
  }, 30_000);
});

describe('Character: Trúc Cơ → Nguyên Anh', () => {
  let n = 0;
  const at = (level: number, bk: number) => {
    const c = Character.create(800_000 + ++n, 'Tc' + n + Date.now(), null, null);
    c.level = level;
    c.bk = bk;
    c.xp = 0;
    c.recalc();
    return c;
  };

  it('Trúc Cơ sơ kỳ lên được tới trung kỳ, kẹt bình cảnh 17', () => {
    const c = at(16, 15);
    expect(c.gainXp(xpNeed(16))).toBe(1);
    expect(c.level).toBe(17);
    c.gainXp(xpNeed(17) * 3);
    expect(c.level).toBe(17);
    expect(c.xp).toBe(xpNeed(17));
    expect(c.passBottleneck()).toBe(18);
    expect(c.bk).toBe(17);
    expect(c.xp).toBe(0);
  });

  it('hậu kỳ lên đại viên mãn 19 rồi dừng đầy tu vi: cần bình cảnh viên mãn rồi độ kiếp (chưa có)', () => {
    const c = at(18, 17);
    expect(c.gainXp(xpNeed(18) + 100)).toBe(1);
    expect(c.level).toBe(19);
    c.gainXp(xpNeed(19) * 5);
    expect(c.level).toBe(19);
    expect(c.xp).toBe(xpNeed(19));
    expect(c.passBottleneck()).toBe(19); // vượt viên mãn: không đổi cấp
    expect(c.bk).toBe(19);
    c.gainXp(xpNeed(19));
    expect(c.level).toBe(19);
  });

  it('mỗi đại cảnh giới có hai nút: 21 → 22 và 23 chặn đầy; 25 → 26 và 27 chặn đầy; 28 là trần', () => {
    for (const [mid, peak] of [[21, 23], [25, 27]] as const) {
      const c = at(mid, mid - 2);
      c.gainXp(xpNeed(mid) * 2);
      expect(c.level).toBe(mid);
      expect(c.passBottleneck()).toBe(mid + 1);
      c.gainXp(xpNeed(mid + 1));
      expect(c.level).toBe(peak);
      c.gainXp(xpNeed(peak) * 2);
      expect(c.level).toBe(peak);
      expect(c.xp).toBe(xpNeed(peak));
    }
    const top = at(28, 27);
    top.gainXp(1e9);
    expect(top.level).toBe(28);
  });

  it('chỉ số tăng theo hệ số cảnh giới khi lên Kết Đan', () => {
    const lo = at(19, 19);
    const hi = at(20, 19);
    expect(hi.mhp).toBeGreaterThan(lo.mhp * 1.5);
  });
});

describe('đại viên mãn chưa có độ kiếp: không vượt bình cảnh', () => {
  const pills = (c: InstanceType<typeof Character>) => c.inv.reduce((n, s) => n + (s?.id === bottleneckPill(c.level) ? s.n : 0), 0);
  const setup = (level: number, bk: number) => {
    const c = Character.create(700_000 + level * 10 + Math.floor(Math.random() * 9), 'Pk' + level + Date.now() + Math.floor(Math.random() * 1e6), null, null);
    c.level = level;
    c.bk = bk;
    c.xp = xpNeed(level);
    c.recalc();
    c.tx('t:pill', 'give' + c.id, (d) => d.add(bottleneckPill(level), 2));
    const warns: string[] = [];
    const spawned: unknown[] = [];
    const host = {
      now: () => Date.now(),
      inWorld: () => true,
      isDead: () => false,
      inDuel: () => false,
      inCombat: () => false,
      idem: (_p: unknown, r: unknown) => (typeof r === 'string' ? r : undefined),
      warn: (_p: unknown, k: string) => void warns.push(k),
      sys: () => {},
      fx: () => {},
      spawnShadow: () => (spawned.push(1), null),
      stopMeditate: () => {},
      savePlayer: () => {},
      questEvent: () => {},
    };
    const rs = new RealmSystem(host as never);
    const p = { char: c, trial: null, trib: null, casting: false, meditating: false, move: { flying: false, x: 0, z: 0 } };
    return { c, rs, p, warns, spawned };
  };

  it.each([19, 23, 27])('cấp %i đầy tu vi: Phá Cảnh Đan không bị tiêu, không dựng tâm ma', (lv) => {
    const { c, rs, p, warns, spawned } = setup(lv, lv - 2);
    rs.onBottleneck(p as never, { m: 'pill', r: 'k1' });
    rs.onBottleneck(p as never, { m: 'trial' });
    expect(warns).toEqual(['sys.bk_not_yet', 'sys.bk_not_yet']);
    expect(pills(c)).toBe(2);
    expect(c.bk).toBe(lv - 2);
    expect(c.level).toBe(lv);
    expect(spawned).toHaveLength(0);
  });

  it('nút trung kỳ (17) vẫn dùng đan được', () => {
    const { c, rs, p, warns } = setup(17, 15);
    rs.onBottleneck(p as never, { m: 'pill', r: 'k2' });
    expect(warns).toEqual([]);
    expect(pills(c)).toBe(1);
    expect(c.level).toBe(18);
  });
});
