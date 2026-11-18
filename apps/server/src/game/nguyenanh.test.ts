import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groundAt, MS_DEAD, peakGated, S, tribDef, tribForLevel, xpNeed, type FxMsg, type HazardMsg } from '@dtl/shared';

// Tam Trọng Kiếp (E3-L): tia xích, xuất khiếu (móc tạm), tâm cảnh + Tâm Ma Ảnh, vật phẩm, thành công/thất bại.
process.env.DB_FILE = ':memory:';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let tamMaSkills: typeof import('./tribmech').tamMaSkills;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ tamMaSkills } = await import('./tribmech'));
});

afterEach(() => vi.restoreAllMocks());

const trib = (sim: unknown) => (sim as { tribSys: import('./trib').TribSystem }).tribSys;
const X = 2040;
const Z = 2040;
let acc = 9700;
const ITEM = 'itm_nguyen_anh_dan';

function setup(withItem = true, method?: string) {
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'na' + acc);
  char.level = 23;
  char.bk = 23;
  char.xp = xpNeed(23);
  if (method) char.meta.method = method;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  if (withItem) char.tx('test', null, (d) => d.add(ITEM, 1));
  const p = sim.addPlayer({ sessionId: 'c' + acc, send: () => undefined } as never, char, true, 'c' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  sim.now = 1_000_000;
  const priv = sim as unknown as { tickTribulation(p: Ent): void };
  const count = () => char.inv.reduce((s, it) => s + (it?.id === ITEM ? it.n : 0), 0);
  /** Bắt đầu kiếp ngay trong sim này (room riêng thật cấp vé rồi gọi đúng hàm này khi tới nơi). */
  const begin = () => sim.beginTribulation(p, tribDef('nguyen_anh'), true);
  const run = (to: number, each?: (t: number) => void) => {
    const def = tribDef('nguyen_anh');
    const start = sim.now - (def.duration * 1000 - (p.trib!.endAt - sim.now));
    while (p.trib && (sim.now - start) / 1000 < to) {
      each?.((sim.now - start) / 1000);
      if (!p.trib) break;
      priv.tickTribulation(p);
      sim.now += 50;
    }
  };
  const fx = (t: string) => sent.filter((x) => x.type === S.FX && (x.msg as FxMsg).t === t).map((x) => x.msg as FxMsg);
  const hazards = () => sent.filter((x) => x.type === S.HAZARD).map((x) => x.msg as HazardMsg);
  const shadow = () => sim.monsters.find((m) => m.owner === p.sid && m.state !== MS_DEAD);
  return { sim, p, char, count, begin, run, fx, hazards, shadow, sent };
}

describe('Tam Trọng Kiếp: dữ liệu và cổng', () => {
  it('Nguyên Anh bật, Kết Đan 23 mở, Hóa Thần 27 vẫn chặn', () => {
    expect(tribForLevel(23)?.id).toBe('nguyen_anh');
    expect(tribDef('nguyen_anh').enabled).toBe(true);
    expect(tribDef('nguyen_anh').room).toBe('tribulation');
    expect(tribDef('nguyen_anh').duration).toBe(65);
    expect(peakGated(23)).toBe(false);
    expect(peakGated(27)).toBe(false); // E4-D: Thiên Nhân Kiếp đã bật
  });

  it('thiếu Ngưng Anh Đan thì không độ kiếp; kiếp chạy ở room riêng nên room thế giới chỉ cấp vé', () => {
    const t = setup(false);
    t.sim.onBreakthrough(t.p);
    expect(t.p.trib).toBeNull();
    const ok = setup();
    ok.sim.onBreakthrough(ok.p);
    // Sim thử không có host room: không có vé nên không bắt đầu ở room này.
    expect(ok.p.trib).toBeNull();
    expect(ok.count()).toBe(1);
  });

  it('bắt đầu kiếp tiêu một viên, phát tribstart mang id nguyen_anh', () => {
    const t = setup();
    expect(t.begin()).toBe(true);
    expect(t.count()).toBe(0);
    expect(t.fx('tribstart')[0]?.tb).toBe('nguyen_anh');
  });

  it('Tâm Ma Ảnh dùng hai chiêu của người chơi (chiêu đặc trưng công pháp + một chiêu chung đã mở)', () => {
    const ids = tamMaSkills(undefined, 23);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
    expect(tamMaSkills('mth_kiem_tu', 23).length).toBeLessThanOrEqual(2);
  });
});

describe('Tam Trọng Kiếp: pha 1 tia xích', () => {
  it('có vạch sét nối hai tia: 16 m, rộng 2,6 m, hai đầu là tia tròn', () => {
    const t = setup();
    t.begin();
    t.run(14);
    const hz = t.hazards();
    const chain = hz.filter((h) => h.sh === 'rect' && h.r === 16 && h.w === 2.6);
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(hz.filter((h) => !h.sh && h.r === 3.2).length).toBeGreaterThanOrEqual(chain.length * 2);
  });

  it('xuất khiếu chưa dùng được ở pha lôi', () => {
    const t = setup();
    t.begin();
    t.run(5);
    expect(trib(t.sim).soul(t.p)).toBe(false);
    expect(t.fx('xuatkhieu').length).toBe(0);
  });
});

describe('Tam Trọng Kiếp: pha 2 ô lửa và xuất khiếu', () => {
  it('xuất khiếu: 6 s, thân đứng yên, hồi 20 s, tự về thân', () => {
    const t = setup();
    t.begin();
    t.run(19);
    expect(trib(t.sim).soul(t.p)).toBe(true);
    expect(t.fx('xuatkhieu')[0]?.d).toBe(6);
    expect(trib(t.sim).soulFrozen(t.p)).toBe(true);
    // Đang rời thân thì bấm nữa không có tác dụng.
    expect(trib(t.sim).soul(t.p)).toBe(false);
    t.run(19 + 6.2);
    expect(trib(t.sim).soulFrozen(t.p)).toBe(false);
    expect(t.fx('xuatkhieu_end').length).toBe(1);
    // Còn hồi chiêu (20 s kể từ lúc dùng).
    expect(trib(t.sim).soul(t.p)).toBe(false);
    t.run(19 + 20.2);
    expect(trib(t.sim).soul(t.p)).toBe(true);
  });

  it('lửa nặng nhất bị đẩy khỏi ô thân đứng khi nguyên anh đang rời thân; không xuất khiếu thì rơi đúng ô thân', () => {
    // Ép các ô ngẫu nhiên rơi vào ô 0 (góc), để chỉ còn "ô người độ kiếp đứng" là biến số.
    const cellHit = (soul: boolean) => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const t = setup();
      t.begin();
      t.run(18.5);
      if (soul) trib(t.sim).soul(t.p);
      const before = t.hazards().length;
      t.run(23);
      const fire = t
        .hazards()
        .slice(before)
        .filter((h) => h.kind === 'fire' && h.sh === 'rect');
      vi.restoreAllMocks();
      return fire.some((h) => X >= h.x - (h.w ?? 0) / 2 && X <= h.x + (h.w ?? 0) / 2 && Z >= h.z && Z <= h.z + h.r);
    };
    expect(cellHit(false)).toBe(true);
    expect(cellHit(true)).toBe(false);
  });
});

describe('Tam Trọng Kiếp: pha 3 tâm ma, tâm cảnh', () => {
  it('hiện một Tâm Ma Ảnh cấp +2, thanh tâm cảnh 100, bóng ra chiêu kèm vạch báo', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(47);
    const sh = t.shadow();
    expect(sh).toBeTruthy();
    expect(sh!.level).toBe(25);
    expect(t.fx('tamcanh').some((m) => m.pg === 100)).toBe(true);
    const before = t.hazards().length;
    t.run(53);
    expect(t.fx('tamma_cast').length).toBeGreaterThanOrEqual(1);
    expect(
      t
        .hazards()
        .slice(before)
        .some((h) => h.src === sh!.id),
    ).toBe(true);
  });

  it('bị đánh trúng thì tâm cảnh giảm, đánh trúng bóng thì hồi; về 0 thì thất bại và hoàn đan (trụ quá nửa)', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(44);
    const xp0 = t.char.xp;
    const tc = () =>
      t
        .fx('tamcanh')
        .filter((m) => m.pg !== undefined && m.pg >= 0)
        .pop()?.pg ?? -1;
    trib(t.sim).noteHit(t.p, 'hurt');
    t.run(44.6);
    expect(tc()).toBe(95);
    trib(t.sim).noteHit(t.p, 'hit');
    t.run(45.2);
    expect(tc()).toBeGreaterThan(95);
    for (let i = 0; i < 20; i++) trib(t.sim).noteHit(t.p, 'hurt');
    expect(t.p.trib).toBeNull();
    expect(t.char.level).toBe(23);
    expect(t.char.xp).toBeLessThan(xp0);
    expect(t.count()).toBe(1);
  });

  it('hạ Tâm Ma Ảnh thì kiếp thành ngay, lên cấp 24, phát ascend mang id kiếp', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(46);
    const sh = t.shadow()!;
    t.sim.damageMonster(sh, sh.s.mhp + 1, t.p);
    const hz0 = t.hazards().length;
    t.run(47);
    // Đã ascend thì không còn tia/bóng nào mang tên người đó phát thêm.
    expect(t.hazards().length).toBe(hz0);
    expect(t.p.trib).toBeNull();
    expect(t.char.level).toBe(24);
    expect(t.fx('ascend')[0]?.tb).toBe('nguyen_anh');
  });

  it('kéo dài tới giây 65 cũng qua kiếp (lên cấp 24); tâm cảnh khép lại', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(66);
    expect(t.p.trib).toBeNull();
    expect(t.char.level).toBe(24);
    expect(t.fx('ascend').length).toBe(1);
  });

  it('chết giữa kiếp thì thất bại, cấp giữ nguyên', () => {
    const t = setup();
    t.begin();
    t.run(10);
    t.sim.damagePlayer(t.p, 1e9, 'x');
    expect(t.p.trib).toBeNull();
    expect(t.char.level).toBe(23);
  });
});
