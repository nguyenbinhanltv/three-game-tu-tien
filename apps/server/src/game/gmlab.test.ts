import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groundAt, MF_BROKEN, MF_CHANT, MF_STUN, MF_WEAK, MS_DEAD } from '@dtl/shared';

// Lệnh GM của phòng thử (Diễn Võ Trường): đóng băng quái, khóa máu, ép trạng thái, chiêu không hồi. Server quyết định hết.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER } = await import('@dtl/content'));
});

const X = 2040;
const Z = 2040;
let nextAcc = 93000;

function setup(dev = true, levelId = 'van_lam') {
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => {} } as never, {
    levelId,
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(nextAcc++, 'Lab' + nextAcc);
  char.level = 20;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  const p = sim.addPlayer({ sessionId: 'lab' + nextAcc, send: () => {} } as never, char, dev, 's' + nextAcc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  const mon = (id = 'mon_soi_xam') => sim.spawnMonster(MONSTER.get(id)!, 10, X + 5, Z, null);
  // Tài khoản thử: gọi thẳng bộ lệnh (bỏ qua giới hạn 800 ms của chat); tài khoản thường: đi qua chat như thật để thấy bị chặn.
  const gm = (cmd: string) => {
    if (dev) return sim.gmSys.run(p, cmd.split(' '));
    p.chatAt = 0;
    sim.onChat(p, { m: '/gm ' + cmd });
  };
  const run = (ms: number) => {
    // Sim lấy giờ từ Date.now(): đẩy đồng hồ giả theo từng tick để AI (nghĩ, đuổi) chạy như thời gian thật.
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let t = 0; t < ms; t += 50) {
      vi.setSystemTime(Date.now() + 50);
      sim.tick(50);
    }
  };
  return { sim, p, mon, gm, run };
}

afterEach(() => vi.useRealTimers());

describe('lệnh GM phòng thử', () => {
  it('freeze: quái đang thấy người vẫn đứng yên, không đổi trạng thái; tắt thì đuổi lại', () => {
    const ctx = setup();
    const { mon, gm, run, sim, p } = ctx;
    const m = mon();
    gm('lockhp on');
    gm('freeze on');
    sim.damageMonster(m, 5, p); // bị đánh: bình thường sẽ quay sang đuổi
    const x0 = m.s.x;
    const z0 = m.s.z;
    run(3000);
    expect(m.s.x).toBe(x0);
    expect(m.s.z).toBe(z0);
    gm('freeze off');
    p.move.x = X - 12; // lùi ra để quái phải chạy tới
    run(3000);
    expect(Math.hypot(m.s.x - x0, m.s.z - z0)).toBeGreaterThan(1);
  });

  it('lockhp: quái không tụt dưới 1 máu; tắt thì chết được', () => {
    const { sim, p, mon, gm } = setup();
    const m = mon();
    gm('lockhp on');
    sim.damageMonster(m, m.s.mhp * 10, p);
    expect(m.s.hp).toBe(1);
    expect(m.state).not.toBe(MS_DEAD);
    gm('lockhp off');
    sim.damageMonster(m, 10, p);
    expect(m.state).toBe(MS_DEAD);
  });

  it('state: ép vỡ thế, choáng, lộ yếu điểm, niệm chú rồi xóa', () => {
    const { mon, gm } = setup();
    const m = mon();
    gm('freeze on');
    gm('state break 10');
    expect(m.s.mf & MF_BROKEN).toBe(MF_BROKEN);
    expect(m.s.mf & MF_STUN).toBe(MF_STUN);
    gm('state clear');
    expect(m.s.mf & (MF_BROKEN | MF_STUN)).toBe(0);
    gm('state weak 10');
    expect(m.s.mf & MF_WEAK).toBe(MF_WEAK);
    gm('state chant 10');
    expect(m.s.mf & MF_CHANT).toBe(MF_CHANT);
    gm('state clear');
    expect(m.s.mf & (MF_WEAK | MF_CHANT)).toBe(0);
  });

  it('free: hồi chiêu bị xóa và linh lực đầy lại mỗi tick; tắt thì thôi', () => {
    const { p, gm, run } = setup();
    gm('free on');
    p.cds.set('skl_x', Date.now() + 60_000);
    p.char.mp = 0;
    run(100);
    expect(p.cds.size).toBe(0);
    expect(p.char.mp).toBe(p.char.mmp);
    gm('free off');
    p.cds.set('skl_x', Date.now() + 60_000);
    run(100);
    expect(p.cds.size).toBe(1);
  });

  it('scene: chỉ nạp trong phòng tập; mọi cảnh mẫu dựng đủ quái, đúng khu, đúng trạng thái', async () => {
    const { LAB_SCENES } = await import('@dtl/content');
    const { dienVoZone, dienVoStandAt } = await import('@dtl/shared');
    const out = setup();
    const n0 = out.sim.monsters.length;
    out.gm('scene soi_thuong');
    expect(out.sim.monsters.length).toBe(n0);

    const { sim, p, gm } = setup(true, 'dien_vo');
    for (const sc of LAB_SCENES) {
      gm('scene ' + sc.id);
      const live = sim.monsters.filter((m) => m.state !== MS_DEAD);
      expect(live.length, sc.id).toBe(sc.mons.reduce((n, g) => n + g.n, 0));
      for (const m of live) {
        const z = dienVoZone(m.def.boss ? 'boss' : 'arena');
        expect(Math.hypot(m.s.x - z.x, m.s.z - z.z), sc.id).toBeLessThanOrEqual(z.r!);
        if (sc.state === 'break') expect(m.s.mf & MF_BROKEN, sc.id).toBe(MF_BROKEN);
        if (sc.state === 'weak') expect(m.s.mf & MF_WEAK, sc.id).toBe(MF_WEAK);
      }
      const at = dienVoStandAt(sc.at);
      expect(Math.hypot(p.move.x - at.x, p.move.z - at.z), sc.id).toBeLessThan(0.5);
      expect(p.char.level).toBe(sc.level);
      expect(p.char.meta.method).toBe(sc.method);
    }
  });

  it('scene save: cảnh đang dựng đọc lại đúng như cảnh mẫu đã nạp', async () => {
    const { LAB_SCENES } = await import('@dtl/content');
    const { sim, p, gm } = setup(true, 'dien_vo');
    for (const id of ['soi_vo_the', 'tinh_anh', 'boss', 'nhan_vat_can']) {
      const sc = LAB_SCENES.find((s) => s.id === id)!;
      gm('scene ' + id);
      const got = sim.gmSys.sceneOf(p, id);
      expect(got.at, id).toBe(sc.at);
      expect(got.method).toBe(sc.method);
      expect(got.level).toBe(sc.level);
      expect(got.mons, id).toEqual(sc.mons);
      expect(got.state, id).toBe(sc.state);
    }
  });

  it('tài khoản thường gõ lệnh không có tác dụng', () => {
    const { sim, mon, gm } = setup(false);
    const m = mon();
    gm('lockhp on');
    gm('freeze on');
    sim.damageMonster(m, m.s.mhp * 10, null);
    expect(m.state).toBe(MS_DEAD);
  });
});
