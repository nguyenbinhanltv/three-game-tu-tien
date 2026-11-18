import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  groundAt,
  MS_DEAD,
  PF_DEAD,
  S,
  SPIRIT_CD_MS,
  SPIRIT_CHANNEL_MS,
  SPIRIT_MP,
  type SpiritScanMsg,
  type SpiritStateMsg,
} from '@dtl/shared';

import { at } from '@dtl/shared';
// Thần thức (E2-E): server quyết định mở khóa, giữ 2,5 giây, hủy, tốn linh lực và hồi chiêu, kết quả quét.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
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

afterEach(() => vi.useRealTimers());

const X = 2040;
const Z = 2040;
let nextAcc = 5000;

interface Sent {
  type: string;
  msg: unknown;
}

function setup(level = 20) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000_000);
  const sent: Sent[] = [];
  const host = { broadcast: () => {} };
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const join = (name: string, lv = level): Ent => {
    const char = Character.create(nextAcc++, name + nextAcc);
    char.level = lv;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const client = {
      sessionId: name + nextAcc,
      send: (type: string, msg: unknown) => sent.push({ type, msg: { to: name, ...(msg as object) } }),
    };
    const p = sim.addPlayer(client as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    return p;
  };
  const p = join('a');
  // Bỏ quái sinh sẵn của bản đồ: chúng giao chiến với người thử và hủy việc giữ thần thức.
  sim.monsters.splice(0);
  const mon = (x: number, z: number, id = 'mon_soi_xam') => sim.spawnMonster(MONSTER.get(id)!, 10, x, z, null);
  /** Tiến đồng hồ giả `ms` rồi chạy tick (mỗi tick 50 ms). */
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      vi.setSystemTime(Date.now() + 50);
      sim.tick(50);
    }
  };
  const scans = () => sent.filter((s) => s.type === S.SPIRIT_SCAN).map((s) => s.msg as SpiritScanMsg & { to: string });
  const states = () => sent.filter((s) => s.type === S.SPIRIT_STATE).map((s) => s.msg as SpiritStateMsg);
  return { sim, sent, p, join, mon, advance, scans, states };
}

describe('thần thức', () => {
  it('chưa Kết Đan thì không vận được', () => {
    const { sim, p, advance, scans } = setup(19);
    sim.spirit.command(p, { on: true });
    advance(SPIRIT_CHANNEL_MS + 200);
    expect(scans()).toHaveLength(0);
    expect(p.char.mp).toBe(p.char.mmp);
  });

  it('giữ đủ 2,5 giây thì quét, tốn linh lực và vào hồi chiêu; chưa đủ thì chưa có kết quả', () => {
    const { sim, p, advance, scans, states } = setup();
    sim.spirit.command(p, { on: true });
    advance(SPIRIT_CHANNEL_MS - 400);
    expect(scans()).toHaveLength(0);
    expect(p.char.mp).toBe(p.char.mmp);
    advance(600);
    expect(scans()).toHaveLength(1);
    expect(Math.abs(p.char.mp - (p.char.mmp - SPIRIT_MP))).toBeLessThan(15); // trừ hồi tự nhiên
    const last = at(states(), states().length - 1);
    expect(last.cd).toBeGreaterThan(SPIRIT_CD_MS - 500);
    // Đang hồi chiêu: vận lại không được.
    sim.spirit.command(p, { on: true });
    advance(SPIRIT_CHANNEL_MS + 200);
    expect(scans()).toHaveLength(1);
    // Hết hồi chiêu thì vận lại được.
    advance(SPIRIT_CD_MS);
    sim.spirit.command(p, { on: true });
    advance(SPIRIT_CHANNEL_MS + 200);
    expect(scans()).toHaveLength(2);
  });

  it('thả phím sớm hoặc di chuyển thì hủy, không tốn linh lực, không hồi chiêu', () => {
    const { sim, p, advance, scans } = setup();
    sim.spirit.command(p, { on: true });
    advance(1200);
    sim.spirit.command(p, { on: false });
    advance(SPIRIT_CHANNEL_MS);
    expect(scans()).toHaveLength(0);
    expect(p.char.mp).toBe(p.char.mmp);
    sim.spirit.command(p, { on: true });
    advance(800);
    p.move.x += 5;
    advance(SPIRIT_CHANNEL_MS);
    expect(scans()).toHaveLength(0);
    expect(p.char.mp).toBe(p.char.mmp);
    // Không bị hồi chiêu: vận lại được ngay.
    sim.spirit.command(p, { on: true });
    advance(SPIRIT_CHANNEL_MS + 200);
    expect(scans()).toHaveLength(1);
  });

  it('chạm nhanh: thả phím ngay sau khi giữ (dưới 120 ms) vẫn hủy, không quét, không tốn gì', () => {
    const { sim, p, advance, scans } = setup();
    sim.spirit.command(p, { on: true });
    sim.spirit.command(p, { on: false });
    advance(SPIRIT_CHANNEL_MS + 400);
    expect(scans()).toHaveLength(0);
    expect(Math.abs(p.char.mp - p.char.mmp)).toBeLessThan(1);
    // Không bị hồi chiêu: giữ lại ngay vẫn quét được.
    sim.spirit.command(p, { on: true });
    advance(SPIRIT_CHANNEL_MS + 400);
    expect(scans()).toHaveLength(1);
  });

  it('thiếu linh lực thì không bắt đầu', () => {
    const { sim, p, advance, scans } = setup();
    p.char.mp = SPIRIT_MP - 1;
    sim.spirit.command(p, { on: true });
    advance(SPIRIT_CHANNEL_MS + 200);
    expect(scans()).toHaveLength(0);
  });

  it('chết giữa chừng thì hủy', () => {
    const { sim, p, advance, scans } = setup();
    sim.spirit.command(p, { on: true });
    advance(1000);
    p.s.fl |= PF_DEAD;
    advance(SPIRIT_CHANNEL_MS);
    expect(scans()).toHaveLength(0);
  });

  it('kết quả: chỉ gồm điểm trong phạm vi 60 m, đúng loại, bỏ quái chết', () => {
    const { sim, p, join, mon, advance, scans } = setup(20);
    const near = mon(X + 20, Z);
    const elite = mon(X, Z + 30, 'elite_huyet_nha_lang');
    const boss = mon(X - 40, Z, 'boss_han_giao');
    mon(X + 90, Z); // ngoài 60 m
    const dead = mon(X + 10, Z + 10);
    dead.state = MS_DEAD;
    const stranger = join('b');
    stranger.move.x = X + 50;
    const far = join('c');
    far.move.x = X + 200;
    sim.spirit.command(p, { on: true });
    advance(SPIRIT_CHANNEL_MS + 200);
    const res = scans().find((s) => s.to === 'a')!;
    expect(res.r).toBe(60);
    const kinds = (k: string) => res.hits.filter((h) => h.k === k);
    expect(kinds('boss').map((h) => h.n)).toEqual([boss.def.id]);
    expect(kinds('elite').map((h) => h.n)).toEqual([elite.def.id]);
    expect(kinds('mon').map((h) => h.n)).toEqual([near.def.id]);
    expect(kinds('player').map((h) => h.n)).toEqual([stranger.char.name]);
    for (const h of res.hits) expect(Math.hypot(h.x - X, h.z - Z)).toBeLessThanOrEqual(60.1);
  });

  it('điểm hái còn mọc lộ ra, điểm đã hái thì không; phạm vi 80 m từ trung kỳ', () => {
    const { sim, p, advance, scans } = setup(21);
    const node = at([...sim.nodes.values()], 0);
    p.move.x = node.s.x + 70;
    p.move.z = node.s.z;
    p.move.y = groundAt(p.move.x, p.move.z);
    node.s.on = true;
    sim.spirit.command(p, { on: true });
    advance(SPIRIT_CHANNEL_MS + 200);
    expect(at(scans(), 0).r).toBe(80);
    expect(at(scans(), 0).hits.some((h) => h.k === 'node' && Math.abs(h.x - node.s.x) < 0.2)).toBe(true);
    advance(SPIRIT_CD_MS);
    node.s.on = false;
    node.respawnAt = Infinity;
    sim.spirit.command(p, { on: true });
    advance(SPIRIT_CHANNEL_MS + 200);
    expect(at(scans(), 1).hits.some((h) => h.k === 'node' && Math.abs(h.x - node.s.x) < 0.2)).toBe(false);
  });

  it('số điểm trả về bị chặn trần, boss được giữ (gọi trực tiếp quét, không tick để quái khỏi giao chiến)', () => {
    const { sim, p, mon } = setup();
    for (let i = 0; i < 130; i++) mon(X + 5 + (i % 40), Z + ((i * 7) % 40) - 20);
    const boss = mon(X - 50, Z, 'boss_han_giao');
    const hits = sim.spirit.scan(p, 60);
    expect(hits.length).toBe(90);
    expect(hits.some((h) => h.k === 'boss' && h.n === boss.def.id)).toBe(true);
  });

  it('lệnh rác không làm sập server', () => {
    const { sim, p } = setup();
    for (const m of [null, undefined, 5, 'x', { on: 'yes' }, { on: {} }]) sim.spirit.command(p, m);
    expect(true).toBe(true);
  });
});
