import { beforeAll, describe, expect, it } from 'vitest';
import { allowSkillForTest } from './testkit';
import { groundAt, S, type CdMsg } from '@dtl/shared';

// VS-2b: chuỗi chiêu khai báo trong JSON (`chain.after`, `window`). Server mở/đóng cửa sổ và tính thưởng; client chỉ nhận hạn để sáng ô.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;
let SKILL: typeof import('@dtl/content').SKILL;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER, SKILL } = await import('@dtl/content'));
});

const X = 2040;
const Z = 2040;
let nextAcc = 8000;

function setup(method: string, level = 28) {
  const sent: { type: string; msg: unknown }[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const raw0 = sim.onSkill.bind(sim);
  // VS-2d: test cơ chế chiêu, không đi qua bước chọn nhánh công pháp.
  const raw = (pl: Ent, msg: { id: string; t?: string }) => {
    allowSkillForTest(pl.char, msg.id);
    raw0(pl, msg);
  };
  /** Bấm rồi "xả" đòn chờ ngay (hiệu quả áp liền). `sim.onSkill` gốc giữ ở `raw` cho test về đòn chờ. */
  const use = (pl: Ent, id: string, t?: string) => {
    raw(pl, { id, t });
    const st = pl.flow.pending;
    if (st) {
      st.at = sim.now;
      (sim as unknown as { resolvePending(p: Ent): void }).resolvePending(pl);
    }
  };
  const char = Character.create(nextAcc++, 'ch' + nextAcc);
  char.level = level;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  const client = { sessionId: 'c' + nextAcc, send: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const p = sim.addPlayer(client as never, char, true, 's' + nextAcc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  sim.onMethod(p, { method });
  const mon = (x = X + 5, z = Z) => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, x, z, null);
    m.s.hp = m.s.mhp = 50_000_000;
    return m;
  };
  /** Cho ra chiêu tiếp: bỏ GCD, hồi chiêu, đầy linh lực; KHÔNG xóa cửa sổ chuỗi. */
  const fresh = () => {
    p.gcdAt = 0;
    p.cds.clear();
    p.flow.lastDashAt = -1e9;
    p.char.mp = p.char.mmp;
    p.lastCombatAt = 0;
    p.skillCount = 0;
    // Tài nguyên riêng làm lệch phép so sát thương: giữ ở 0.
    p.mth.res = 0;
  };
  /** Sát thương trung bình của một lần dùng `id` (sau khi chạy `prep`), lấy trung bình `n` lần để bỏ ngẫu nhiên. */
  const avg = (id: string, m: { id: string; s: { hp: number } }, prep: () => void, n = 60) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      p.flow.opened.clear();
      prep();
      fresh();
      const hp = m.s.hp;
      use(p, id, m.id);
      sum += hp - m.s.hp;
    }
    return sum / n;
  };
  return { sim, sent, p, mon, fresh, use, raw, avg };
}

describe('Kiếm tu: Kiếm Khí Trảm → Phi Kiếm Truy Hồn → Hoành Kiếm / Kiếm Vũ → Thuấn Di Trảm', () => {
  it('Phi Kiếm Truy Hồn mạnh gấp rưỡi trong cửa sổ, dùng xong thì đóng', () => {
    const { p, mon, fresh, use, avg } = setup('lac_kiem_quyet');
    const m = mon();
    // Dấu Truy Hồn (+20%) có ở cả hai phép đo nên tỉ số chỉ còn phần chuỗi.
    const plain = avg('skl_phi_kiem_truy_hon', m, () => undefined);
    const chained = avg('skl_phi_kiem_truy_hon', m, () => {
      fresh();
      use(p, 'skl_kiem_khi_tram', m.id);
    });
    expect(chained / plain).toBeGreaterThan(1.35);
    expect(chained / plain).toBeLessThan(1.65);
    expect(p.flow.opened.has('skl_kiem_khi_tram')).toBe(false);
  });
  it('hết cửa sổ thì không còn thưởng', () => {
    const { sim, p, mon, fresh, use } = setup('lac_kiem_quyet');
    const m = mon();
    fresh();
    use(p, 'skl_kiem_khi_tram', m.id);
    sim.now += 3500;
    fresh();
    use(p, 'skl_phi_kiem_truy_hon', m.id);
    // Cửa sổ đã đóng: mốc của chiêu mở không bị tiêu.
    expect(p.flow.opened.has('skl_kiem_khi_tram')).toBe(true);
  });
  it('chuỗi bậc ba giảm linh lực; một chiêu mở chỉ nuôi được một nhánh', () => {
    const { p, mon, fresh, use } = setup('lac_kiem_quyet');
    const m = mon();
    const hoanh = SKILL.get('skl_hoanh_kiem_pha_mach')!;
    fresh();
    use(p, 'skl_phi_kiem_truy_hon', m.id);
    fresh();
    const mp0 = p.char.mp;
    use(p, 'skl_hoanh_kiem_pha_mach', m.id);
    expect(mp0 - p.char.mp).toBe(Math.ceil(hoanh.mp * 0.7));
    // Nhánh kia (Kiếm Vũ Tam Điệp) đã đóng theo: tốn đủ linh lực.
    const kv = SKILL.get('skl_kiem_vu_tam_diep')!;
    fresh();
    const mp1 = p.char.mp;
    use(p, 'skl_kiem_vu_tam_diep', m.id);
    expect(mp1 - p.char.mp).toBe(kv.mp);
  });
  it('Thuấn Di Trảm sau Hoành Kiếm: hồi chiêu ngắn đi 25%', () => {
    const { sim, p, mon, fresh, use } = setup('lac_kiem_quyet');
    const m = mon();
    fresh();
    use(p, 'skl_thuan_di_tram', m.id);
    const plainCd = p.cds.get('skl_thuan_di_tram')! - sim.now;
    fresh();
    use(p, 'skl_hoanh_kiem_pha_mach', m.id);
    p.gcdAt = 0;
    p.cds.delete('skl_thuan_di_tram');
    use(p, 'skl_thuan_di_tram', m.id);
    const chainCd = p.cds.get('skl_thuan_di_tram')! - sim.now;
    expect(chainCd / plainCd).toBeCloseTo(0.75, 2);
  });
  it('thiếu linh lực giá gốc nhưng đủ giá chuỗi thì vẫn ra chiêu; không có chuỗi thì bị từ chối', () => {
    const { p, mon, fresh, use } = setup('lac_kiem_quyet');
    const m = mon();
    const hoanh = SKILL.get('skl_hoanh_kiem_pha_mach')!;
    const need = Math.ceil(hoanh.mp * 0.7);
    fresh();
    p.char.mp = need;
    use(p, 'skl_hoanh_kiem_pha_mach', m.id);
    expect(p.char.mp).toBe(need);
    expect(p.cds.has('skl_hoanh_kiem_pha_mach')).toBe(false);
    fresh();
    use(p, 'skl_phi_kiem_truy_hon', m.id);
    p.gcdAt = 0;
    p.char.mp = need;
    use(p, 'skl_hoanh_kiem_pha_mach', m.id);
    expect(p.char.mp).toBe(0);
    expect(p.cds.has('skl_hoanh_kiem_pha_mach')).toBe(true);
  });
  it('đòn chờ bị hủy vì mục tiêu chết: hoàn đúng số linh lực đã trả theo giá chuỗi', () => {
    const { sim, p, mon, fresh, use, raw } = setup('lac_kiem_quyet');
    const m = mon();
    fresh();
    use(p, 'skl_phi_kiem_truy_hon', m.id);
    fresh();
    const mp0 = p.char.mp;
    raw(p, { id: 'skl_hoanh_kiem_pha_mach', t: m.id });
    expect(p.flow.pending).not.toBeNull();
    expect(mp0 - p.char.mp).toBe(Math.ceil(SKILL.get('skl_hoanh_kiem_pha_mach')!.mp * 0.7));
    (sim as unknown as { removeMonster(m: unknown): void }).removeMonster(m);
    p.flow.pending!.at = sim.now;
    (sim as unknown as { resolvePending(p: Ent): void }).resolvePending(p);
    expect(p.flow.pending).toBeNull();
    expect(p.char.mp).toBe(mp0);
  });
  it('tin `cd` mang hạn cửa sổ của mọi chiêu đang mở chuỗi', () => {
    const { sim, sent, p, mon, fresh, use } = setup('lac_kiem_quyet');
    const m = mon();
    fresh();
    use(p, 'skl_phi_kiem_truy_hon', m.id);
    const last = sent.filter((s) => s.type === S.CD).at(-1)!.msg as CdMsg;
    expect(Object.keys(last.em ?? {}).sort()).toEqual(['skl_hoanh_kiem_pha_mach', 'skl_kiem_vu_tam_diep']);
    expect(last.em!.skl_hoanh_kiem_pha_mach).toBe(sim.now + 4000);
  });
});

describe('Hộ pháp: Trấn Sơn Ấn → Thiết Bích Xung → Thiết Quyền Chấn Địa', () => {
  it('Thiết Quyền mạnh hơn sau cú húc; húc hụt không mở chuỗi cho Thiết Quyền', () => {
    const { p, mon, fresh, use, avg } = setup('bat_dong_kim_than');
    const m = mon(X + 3, Z);
    const plain = avg('skl_thiet_quyen_chan_dia', m, () => undefined);
    const chained = avg('skl_thiet_quyen_chan_dia', m, () => {
      fresh();
      use(p, 'skl_thiet_bich_xung', m.id);
    });
    expect(chained / plain).toBeGreaterThan(1.18);
    expect(chained / plain).toBeLessThan(1.42);
  });
});

describe('Đan sư: Lưu Hương Bộ → Hồi Xuân Quyết → Hồi Nguyên Thuật / Mộc Linh Trận → Đan Hỏa Phong Tràn', () => {
  it('Hồi Nguyên Thuật sau Hồi Xuân Quyết tốn nửa linh lực', () => {
    const { p, fresh, use } = setup('thanh_moc_dan_kinh');
    const heal = SKILL.get('skl_hoi_nguyen_thuat')!;
    fresh();
    const mp0 = p.char.mp;
    use(p, 'skl_hoi_nguyen_thuat');
    expect(mp0 - p.char.mp).toBe(heal.mp);
    fresh();
    use(p, 'skl_hoi_xuan_quyet');
    fresh();
    const mp1 = p.char.mp;
    use(p, 'skl_hoi_nguyen_thuat');
    expect(mp1 - p.char.mp).toBe(Math.ceil(heal.mp * 0.5));
  });
  it('Mộc Linh Trận sau Hồi Xuân Quyết hồi nhiều hơn 20%', () => {
    const { sim, p, fresh, use } = setup('thanh_moc_dan_kinh');
    const hots = () => (sim as unknown as { combat: { hots: { sid: string; per: number }[] } }).combat.hots;
    fresh();
    use(p, 'skl_moc_linh_tran');
    const plain = hots().find((h) => h.sid === p.sid)!.per;
    hots().length = 0;
    fresh();
    use(p, 'skl_hoi_xuan_quyet');
    hots().length = 0;
    fresh();
    use(p, 'skl_moc_linh_tran');
    const chained = hots().find((h) => h.sid === p.sid)!.per;
    expect(chained / plain).toBeCloseTo(1.2, 2);
  });
  it('Hồi Xuân Quyết sau Lưu Hương Bộ: hồi chiêu ngắn đi 20%', () => {
    const { sim, p, fresh, use } = setup('thanh_moc_dan_kinh');
    fresh();
    use(p, 'skl_hoi_xuan_quyet');
    const plainCd = p.cds.get('skl_hoi_xuan_quyet')! - sim.now;
    fresh();
    p.flow.opened.clear();
    use(p, 'skl_luu_huong_bo');
    expect(p.flow.opened.has('skl_luu_huong_bo')).toBe(true);
    p.gcdAt = 0;
    p.cds.delete('skl_hoi_xuan_quyet');
    use(p, 'skl_hoi_xuan_quyet');
    expect((p.cds.get('skl_hoi_xuan_quyet')! - sim.now) / plainCd).toBeCloseTo(0.8, 2);
  });
  it('Kiếm tu dùng Hồi Nguyên Thuật (chiêu chung) không được thưởng chuỗi của Đan sư', () => {
    const { p, fresh, use } = setup('lac_kiem_quyet');
    fresh();
    const mp0 = p.char.mp;
    use(p, 'skl_hoi_nguyen_thuat');
    expect(mp0 - p.char.mp).toBe(SKILL.get('skl_hoi_nguyen_thuat')!.mp);
  });
});
