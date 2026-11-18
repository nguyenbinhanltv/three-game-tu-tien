import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  inHazard,
  elemCounterOf,
  ELEMENTS,
  groundAt,
  nguHanhIndex,
  nguHanhSealFor,
  peakGated,
  S,
  tribDef,
  tribForLevel,
  tribSealPos,
  TRIB_LINK_SEAL,
  xpNeed,
  type DmgMsg,
  type FxMsg,
  type HazardMsg,
} from '@dtl/shared';

import { at } from '@dtl/shared';
// Thiên Nhân Kiếp (E4-D): ngũ hành lôi + trận môn (cờ `ke`), phân thân thần niệm (G), mạch nối thiên phạt, thế thân chắn tia lớn, vật phẩm.
process.env.DB_FILE = ':memory:';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let mech: typeof import('./tribnhan');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  mech = await import('./tribnhan');
});

afterEach(() => vi.restoreAllMocks());

const trib = (sim: unknown) => (sim as { tribSys: import('./trib').TribSystem }).tribSys;
const X = 2040;
const Z = 2040;
let acc = 9900;
const ITEM = 'itm_hoa_than_lo';
const DEF = tribDef('hoa_than');
const NG = at(DEF.phases, 0).nguHanh!;

function setup(withItem = true) {
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'hn' + acc);
  char.level = 27;
  char.bk = 27;
  char.xp = xpNeed(27);
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  if (withItem) char.tx('test', null, (d) => d.add(ITEM, 1));
  const p = sim.addPlayer({ sessionId: 'c' + acc, send: () => undefined } as never, char, true, 'c' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  sim.now = 1_000_000;
  const priv = sim as unknown as { tickTribulation(p: Ent): void; tickHazards(): void };
  const count = () => char.inv.reduce((s, it) => s + (it?.id === ITEM ? it.n : 0), 0);
  const begin = () => sim.beginTribulation(p, tribDef('hoa_than'), true);
  let t0 = 0;
  const run = (to: number, each?: (t: number) => void) => {
    if (!t0) t0 = sim.now - (DEF.duration * 1000 - (p.trib!.endAt - sim.now));
    while (p.trib && (sim.now - t0) / 1000 < to) {
      each?.((sim.now - t0) / 1000);
      if (!p.trib) break;
      priv.tickTribulation(p);
      priv.tickHazards();
      sim.now += 50;
    }
  };
  const fx = (t: string) => sent.filter((x) => x.type === S.FX && (x.msg as FxMsg).t === t).map((x) => x.msg as FxMsg);
  const hazards = () => sent.filter((x) => x.type === S.HAZARD).map((x) => x.msg as HazardMsg);
  const dmgs = () => sent.filter((x) => x.type === S.DMG).map((x) => x.msg as DmgMsg);
  const goto = (pos: { x: number; z: number }) => {
    p.move.x = pos.x;
    p.move.z = pos.z;
    p.move.y = groundAt(pos.x, pos.z);
  };
  const seal = (i: number) => tribSealPos({ x: X, z: Z }, NG.ring, i);
  return { sim, p, char, count, begin, run, fx, hazards, dmgs, goto, seal, sent };
}

describe('Thiên Nhân Kiếp: dữ liệu và hàm thuần', () => {
  it('Hóa Thần bật, có Hóa Thần Lộ, 80 s, room riêng, ba pha; không còn bình cảnh bị chặn', () => {
    expect(tribForLevel(27)?.id).toBe('hoa_than');
    expect(DEF.enabled).toBe(true);
    expect(DEF.item).toBe(ITEM);
    expect(DEF.duration).toBe(80);
    expect(DEF.room).toBe('tribulation');
    expect(DEF.phases.map((p) => p.end)).toEqual([25, 55, 80]);
    expect(peakGated(27)).toBe(false);
  });

  it('năm trận môn cách đều trên vòng, tia xoay Kim→Mộc→Thủy→Hỏa→Thổ, trận môn khắc chế đúng', () => {
    const c = { x: 100, z: 100 };
    for (let i = 0; i < 5; i++) expect(Math.hypot(tribSealPos(c, 9, i).x - 100, tribSealPos(c, 9, i).z - 100)).toBeCloseTo(9);
    expect([0, 1, 2, 3, 4, 5].map((n) => ELEMENTS[nguHanhIndex(n)])).toEqual(['kim', 'moc', 'thuy', 'hoa', 'tho', 'kim']);
    // Kim bị Hỏa khắc, Mộc bị Kim khắc, Thủy bị Thổ khắc, Hỏa bị Thủy khắc, Thổ bị Mộc khắc.
    expect(ELEMENTS.map((_, i) => ELEMENTS[nguHanhSealFor(i)])).toEqual(['hoa', 'kim', 'tho', 'thuy', 'moc']);
    expect(elemCounterOf('moc')).toBe('kim');
  });

  it('linkBlocker: thế thân hoặc thân đứng trong trận môn thứ hai thì chắn, ngược lại không', () => {
    const c = { x: 0, z: 0 };
    const s = tribSealPos(c, NG.ring, TRIB_LINK_SEAL);
    const far = { x: 0, z: 0 };
    expect(mech.linkBlocker(c, NG, s, far)).toBe('clone');
    expect(mech.linkBlocker(c, NG, null, s)).toBe('body');
    expect(mech.linkBlocker(c, NG, far, far)).toBe('none');
    expect(mech.sealAt(c, NG, s.x, s.z)).toBe(TRIB_LINK_SEAL);
    expect(mech.sealAt(c, NG, 0, 0)).toBe(-1);
  });

  it('thiếu Hóa Thần Lộ thì không độ kiếp; bắt đầu kiếp tiêu một viên và phát tribstart hoa_than', () => {
    const none = setup(false);
    none.sim.onBreakthrough(none.p);
    expect(none.p.trib).toBeNull();
    const t = setup();
    expect(t.begin()).toBe(true);
    expect(t.count()).toBe(0);
    expect(t.fx('tribstart')[0]?.tb).toBe('hoa_than');
  });
});

describe('Thiên Nhân Kiếp: pha 1 ngũ hành lôi', () => {
  it('đánh dấu năm trận môn, tia kiếp mang hành xoay vòng mỗi 5 s kèm tin nguhanh', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(24);
    const marks = t.hazards().filter((h) => h.mv === 'pool' && h.r === NG.sealR);
    expect(marks.length).toBeGreaterThanOrEqual(5);
    const seq = t.fx('nguhanh').map((m) => m.n);
    expect(seq.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
    // Tia quét cả sân.
    expect(t.hazards().some((h) => h.r === NG.ring + NG.sealR + NG.pad)).toBe(true);
  });

  it('đứng đúng trận môn khắc chế thì giảm 80% và có cờ ke; đứng ngoài thì nhận đủ', () => {
    const dmgOf = (inSeal: boolean) => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const t = setup();
      t.p.god = true;
      t.begin();
      // Tia đầu (hành Kim) báo lúc 3 s, nổ lúc 5,2 s: chọn chỗ đứng trước đó.
      const spot = inSeal ? t.seal(nguHanhSealFor(0)) : { x: X + 1, z: Z + 1 };
      t.run(5.5, (s) => {
        if (s >= 3.1 && s < 5.3) t.goto(spot);
      });
      const hit = t.dmgs().filter((d) => d.dst === t.p.sid && d.n > 0);
      vi.restoreAllMocks();
      // Chỉ lấy đòn của tia ngũ hành: đòn có ke hoặc đòn lớn nhất trong khoảng nổ.
      return { ke: hit.some((d) => d.ke === 1), max: Math.max(...hit.map((d) => d.n)), keN: hit.find((d) => d.ke === 1)?.n ?? 0 };
    };
    const inside = dmgOf(true);
    const outside = dmgOf(false);
    expect(inside.ke).toBe(true);
    expect(outside.ke).toBe(false);
    expect(inside.keN).toBeGreaterThan(0);
    expect(outside.max).toBeGreaterThan(inside.keN * 3);
  });
});

describe('Thiên Nhân Kiếp: tia ngũ hành luôn trúng chủ kiếp', () => {
  it('chủ kiếp đứng cách tâm 40 m lúc nổ vẫn nhận đủ pct (không có ke)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(5.5, (s) => {
      if (s >= 1) t.goto({ x: X + 40, z: Z });
    });
    vi.restoreAllMocks();
    const hit = t.dmgs().filter((d) => d.dst === t.p.sid && d.n > 0);
    expect(hit.some((d) => d.ke === 1)).toBe(false);
    expect(Math.max(...hit.map((d) => d.n))).toBeGreaterThanOrEqual(Math.round(t.char.mhp * NG.pct) - 1);
  });
});

describe('Thiên Nhân Kiếp: pha 2 phân thân thần niệm', () => {
  it('G không dùng được ở pha 1; ở pha 2 tạo thế thân 20 s, không tạo thêm khi còn sống, tối đa 4', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(10);
    expect(trib(t.sim).clone(t.p)).toBe(false);
    t.run(26);
    expect(trib(t.sim).clone(t.p)).toBe(true);
    expect(t.fx('phanthan')[0]?.d).toBe(20);
    expect(trib(t.sim).clone(t.p)).toBe(false);
    t.run(26 + 20.2);
    expect(t.fx('phanthan_end').length).toBe(1);
    expect(trib(t.sim).clone(t.p)).toBe(true);
  });

  it('có hai tia quét và cột thiên phạt rơi lên ba trận môn (không gồm trận môn thứ hai)', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(25);
    const before = t.hazards().length;
    t.run(51);
    const hz = t.hazards().slice(before);
    expect(hz.filter((h) => h.sh === 'rect' && h.r === 30 && h.w === 4).length).toBe(2);
    const pillars = hz.filter((h) => !h.sh && h.r === 4 && h.kind === 'lightning');
    const link = t.seal(TRIB_LINK_SEAL);
    const atSeal = pillars.filter((h) => [0, 1, 2, 3, 4].some((i) => Math.hypot(h.x - t.seal(i).x, h.z - t.seal(i).z) < 0.01));
    expect(atSeal.length).toBe(3);
    expect(atSeal.some((h) => Math.hypot(h.x - link.x, h.z - link.z) < 0.01)).toBe(false);
  });

  const linkDamage = (who: 'clone' | 'body' | 'none') => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(25.2);
    t.goto(who === 'none' ? { x: X + 1, z: Z + 1 } : t.seal(TRIB_LINK_SEAL));
    if (who === 'clone') {
      expect(trib(t.sim).clone(t.p)).toBe(true);
      t.goto({ x: X + 1, z: Z + 1 });
    }
    const n0 = t.dmgs().length;
    // Mạch nối báo lúc 49 s (phút 24+25), nổ sau 2,5 s; quan sát tới 52,6 s, giữ thân đúng chỗ.
    t.run(52.6, () => {
      if (who === 'body') t.goto(t.seal(TRIB_LINK_SEAL));
      else t.goto({ x: X + 1, z: Z + 1 });
    });
    return { t, hit: t.fx('thienphat').length, end: t.fx('phanthan_end'), n0 };
  };

  it('mạch nối thiên phạt: không ai đứng trận môn thứ hai thì đánh thẳng thân chính', () => {
    expect(linkDamage('none').hit).toBe(1);
  });

  it('mạch nối thiên phạt: thân chính đứng trận môn thứ hai thì vẫn trúng nhưng giảm 80% (ke)', () => {
    const r = linkDamage('body');
    expect(r.hit).toBe(1);
    expect(r.t.dmgs().some((d) => d.ke === 1)).toBe(true);
  });
});

describe('Thiên Nhân Kiếp: pha 3 và kết thúc', () => {
  it('thế thân còn sống chắn thay 40% tia khóa mệnh rồi tan; hộ pháp không chia thêm khi không có', () => {
    const dmgOfFinal = (clone: boolean) => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const t = setup();
      t.p.god = true;
      t.begin();
      t.run(55.5);
      if (clone) expect(trib(t.sim).clone(t.p)).toBe(true);
      const n0 = t.dmgs().length;
      t.run(60.2);
      const hits = t
        .dmgs()
        .slice(n0)
        .filter((d) => d.dst === t.p.sid);
      vi.restoreAllMocks();
      return { max: Math.max(0, ...hits.map((d) => d.n)), ended: t.fx('phanthan_end').some((m) => m.pg === 1) };
    };
    const with_ = dmgOfFinal(true);
    const without = dmgOfFinal(false);
    expect(without.ended).toBe(false);
    expect(with_.ended).toBe(true);
    expect(with_.max).toBeLessThan(without.max);
    expect(with_.max / without.max).toBeCloseTo(0.6, 1);
  });

  it('hai tâm ma phân thân xuất hiện ở pha cuối', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(57);
    expect(t.sim.monsters.filter((m) => m.owner === t.p.sid && m.state !== 4 && m.def.id === 'mon_tam_ma').length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('trụ tới 80 s thì lên Hóa Thần sơ kỳ (28), phát ascend hoa_than', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(81);
    expect(t.p.trib).toBeNull();
    expect(t.char.level).toBe(28);
    expect(t.fx('ascend')[0]?.tb).toBe('hoa_than');
  });

  it('chết giữa kiếp thì thất bại, mất 15% tu vi, hoàn Hóa Thần Lộ nếu đã trụ quá 40 s', () => {
    const t = setup();
    t.p.god = true;
    t.begin();
    t.run(41);
    t.p.god = false;
    t.sim.damagePlayer(t.p, 99999999, '');
    expect(t.p.trib).toBeNull();
    expect(t.char.level).toBe(27);
    expect(t.count()).toBe(1);
  });
});

describe('Thiên Nhân Kiếp: cân bằng bản đầu', () => {
  // Bot "người chơi giỏi": đứng đúng trận môn từng nhịp, pha 2 giữ trận môn thứ hai, pha 3 có thế thân; còn lại né mọi vạch báo bằng chân (tìm điểm gần nhất
  // ngoài các vạch sắp nổ trong 1,3 s). Một mình, không đan, không hộ pháp: phải qua được (spec: solo được) và không quá dễ.
  const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const play = (seed: number) => {
    vi.spyOn(Math, 'random').mockImplementation(lcg(seed));
    const t = setup();
    t.begin();
    let low = 1;
    let cloned = false;
    let seen = 0;
    const pend: { g: HazardMsg; at: number }[] = [];
    t.run(81, (s) => {
      low = Math.min(low, t.char.hp / t.char.mhp);
      const all = t.hazards();
      for (; seen < all.length; seen++) pend.push({ g: at(all, seen), at: s + at(all, seen).delay });
      if (s < 0.5) return; // tâm trận môn đặt ở chỗ đứng lúc vào kiếp
      let want: { x: number; z: number };
      let must = false;
      if (s >= 25 && s < 25.4) {
        // Tia ngũ hành cuối (nổ lúc 25,2 s) còn đang bay sang pha 2.
        want = t.seal(nguHanhSealFor(4));
        must = true;
      } else if (s < 25) {
        const idx = Math.min(4, Math.max(0, Math.floor((s - 3) / 5)));
        // Tia nổ lúc 3 + 5·idx + 2,2 s: người chơi bước vào trận môn ~0,9 s trước đó (bot dịch chuyển tức thì nên cho dư), rời ngay sau khi nổ.
        const pending = s >= 3 + 5 * idx + 1.3 && s < 3 + 5 * idx + 2.4;
        want = t.seal(nguHanhSealFor(pending ? idx : Math.min(4, Math.floor((s + 2) / 5))));
        must = pending;
      } else if (s < 55) {
        want = t.seal(TRIB_LINK_SEAL);
        // Mạch nối nổ lúc 52,5 s: giữ trận môn thứ hai từ trước đó.
        must = s >= 51.6 && s < 52.7;
      } else {
        if (!cloned) {
          cloned = true;
          trib(t.sim).clone(t.p);
        }
        want = { x: X + 6, z: Z };
      }
      const danger = (x: number, z: number) =>
        pend.some(
          (h) => h.at > s - 0.05 && h.at - s < 1.3 && !(h.g.r > 14 && !h.g.sh && h.g.r < 16) && h.g.mv !== 'pool' && inHazardMsg(h.g, x, z),
        );
      let best = want;
      if (!must && danger(want.x, want.z)) {
        best = want;
        outer: for (const r of [3, 5, 7, 9])
          for (let k = 0; k < 8; k++) {
            const c = { x: want.x + Math.cos((k * Math.PI) / 4) * r, z: want.z + Math.sin((k * Math.PI) / 4) * r };
            if (!danger(c.x, c.z)) {
              best = c;
              break outer;
            }
          }
      }
      t.goto(best);
    });
    vi.restoreAllMocks();
    return { ok: t.char.level === 28, low };
  };

  it('một mình, không đan, bot giỏi qua kiếp ở đa số hạt giống và có lúc xuống thấp (không quá dễ)', () => {
    const res = [1, 2, 3, 4, 5, 6, 7, 8].map(play);
    console.log('[bal]', res.map((r) => `${r.ok ? 'ok' : 'chết'}:${(r.low * 100).toFixed(0)}%`).join(' '));
    expect(res.filter((r) => r.ok).length).toBeGreaterThanOrEqual(6);
    expect(Math.min(...res.filter((r) => r.ok).map((r) => r.low))).toBeLessThan(0.6);
  });
});

function inHazardMsg(g: HazardMsg, x: number, z: number): boolean {
  return inHazard({ x: g.x, z: g.z, r: g.r, sh: g.sh, yaw: g.yaw, w: g.w }, x, z);
}
