import { beforeAll, describe, expect, it } from 'vitest';
import { DAO_DOMAIN, DAO_UNLOCK_LEVEL, DOMAIN_EFFECT, domainScale, groundAt } from '@dtl/shared';

// TN-3: Đạo (chọn Nguồn chính từ Vấn Đỉnh, một lần) và biến thể lĩnh vực theo Ý cảnh. Server quyết định hết: client chỉ gửi `{ root }`.
process.env.DB_FILE = ':memory:';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
});

const X = 2040;
const Z = 2040;
let acc = 31000;

function setup() {
  const sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const sent: { type: string; msg: unknown }[] = [];
  const join = (level: number, root: 'kim' | 'moc' | 'thuy' | 'hoa' | 'tho' | 'loi' = 'moc'): Ent => {
    const char = Character.create(acc++, 'dao' + acc, null, root);
    char.level = level;
    char.recalc();
    char.hp = char.mhp;
    const p = sim.addPlayer(
      { sessionId: 'd' + acc, send: (type: string, msg: unknown) => sent.push({ type, msg }) } as never,
      char,
      true,
      's' + acc,
    );
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    return p;
  };
  return { sim, join, sent };
}

describe('Đạo', () => {
  it('chưa đủ cấp Vấn Đỉnh thì không chọn được', () => {
    const { sim, join } = setup();
    const p = join(DAO_UNLOCK_LEVEL - 1);
    sim.onChooseDao(p, { root: 'hoa' });
    expect(p.char.meta.dao).toBeUndefined();
  });

  it('đủ cấp: chọn một lần, cộng nửa thưởng nguồn (hỏa: +2,5% công), không chọn lại được', () => {
    const { sim, join } = setup();
    const p = join(DAO_UNLOCK_LEVEL, 'moc');
    const before = p.char.atk;
    sim.onChooseDao(p, { root: 'hoa' });
    expect(p.char.meta.dao).toBe('hoa');
    expect(p.char.atk).toBeGreaterThan(before);
    expect(p.char.atk / before).toBeGreaterThan(1.02);
    expect(p.char.atk / before).toBeLessThan(1.03);
    expect(p.char.view().dao).toBe('hoa');
    sim.onChooseDao(p, { root: 'kim' });
    expect(p.char.meta.dao).toBe('hoa');
  });

  it('chọn trùng nguồn Bản Nguyên cộng dồn (1,5 lần): hỏa + hỏa = +7,5% công', () => {
    const { sim, join } = setup();
    const p = join(DAO_UNLOCK_LEVEL, 'hoa');
    const before = p.char.atk;
    sim.onChooseDao(p, { root: 'hoa' });
    expect(p.char.atk / before).toBeGreaterThan(1.02);
  });

  it('id lạ, nguồn khóa, thiếu trường, chết hay đang độ kiếp thì bị bỏ qua', () => {
    const { sim, join } = setup();
    const p = join(DAO_UNLOCK_LEVEL);
    for (const bad of [null, undefined, {}, { root: 'sinh_tu' }, { root: 42 }, { root: '__proto__' }, 'hoa']) sim.onChooseDao(p, bad);
    expect(p.char.meta.dao).toBeUndefined();
    p.trib = {} as never;
    sim.onChooseDao(p, { root: 'hoa' });
    expect(p.char.meta.dao).toBeUndefined();
  });

  it('meta.dao bị sửa bậy trong DB thì coi như chưa có Đạo', () => {
    const { join } = setup();
    const p = join(DAO_UNLOCK_LEVEL);
    const before = p.char.atk;
    (p.char.meta as { dao?: string }).dao = 'khong_co';
    p.char.recalc();
    expect(p.char.atk).toBe(before);
    expect(p.char.view().dao).toBe('');
  });
});

describe('lĩnh vực biến thể theo Đạo', () => {
  it('Đạo Kim thêm bạo kích cho chủ lĩnh vực kể cả khi công pháp không phải kiếm tu', () => {
    const { sim, join } = setup();
    const p = join(28);
    p.char.meta.method = 'thanh_moc_dan_kinh';
    expect(sim.domain.critAdd(p)).toBe(0);
    p.char.meta.dao = 'kim';
    expect(sim.domain.critAdd(p)).toBeCloseTo((DAO_DOMAIN.kim.crit ?? 0) * domainScale(28));
  });

  it('cộng vào hiệu ứng theo vai trò (kiếm tu + Đạo Lôi) và biến mất khi chưa có lĩnh vực', () => {
    const { sim, join } = setup();
    const k = join(28);
    k.char.meta.method = 'lac_kiem_quyet';
    k.char.meta.dao = 'loi';
    expect(sim.domain.critAdd(k)).toBeCloseTo((DOMAIN_EFFECT.dps.crit + (DAO_DOMAIN.loi.crit ?? 0)) * domainScale(28));
    const low = join(24);
    low.char.meta.dao = 'loi';
    expect(sim.domain.critAdd(low)).toBe(0);
  });

  it('Đạo Thổ giảm sát thương nhận cho chủ trong lĩnh vực dù không phải hộ pháp', () => {
    const { sim, join } = setup();
    const p = join(28);
    p.char.meta.method = 'lac_kiem_quyet';
    p.char.meta.dao = 'tho';
    (sim.domain as unknown as { nextAt: number }).nextAt = 0;
    sim.domain.tick();
    expect(sim.domain.reduce(p)).toBeCloseTo((DAO_DOMAIN.tho.reduce ?? 0) * domainScale(28));
  });
});
