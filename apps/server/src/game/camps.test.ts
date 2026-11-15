import { beforeAll, describe, expect, it } from 'vitest';
import { AOI_IN, AOI_OUT, CAMP_RESPAWN_MAX, CAMP_RESPAWN_MIN, campMeleeCount, groundAt, MS_CHASE, MS_DEAD, MS_IDLE, S, WATER_Y, heightAt, type BossTimerMsg } from '@dtl/shared';

// M-2: bãi quái theo cụm, hồi sinh theo số người, giờ hồi sinh tinh anh/boss, AOI.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
type Mon = import('./sim').MonEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let Aoi: typeof import('../aoi').Aoi;
let LEVELS: typeof import('@dtl/content').LEVELS;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ Aoi } = await import('../aoi'));
  ({ LEVELS } = await import('@dtl/content'));
});

let acc = 9000;

interface Sent {
  type: string;
  msg: any;
  except?: ReadonlySet<string>;
}

function setup() {
  const sent: Sent[] = [];
  const host = {
    broadcast: (type: string, msg: unknown) => sent.push({ type, msg }),
    broadcastExcept: (type: string, msg: unknown, except: ReadonlySet<string>) => sent.push({ type, msg, except }),
  };
  const sim: Sim = new GameSim(new WorldState(), host as never, { levelId: 'van_lam', roomName: 'test', spawn: { x: 2040, z: 2040 }, respawn: { x: 2040, z: 2040 }, persistPosition: false });
  const join = (x: number, z: number): Ent => {
    const char = Character.create(acc++, 'cp' + acc);
    char.level = 10;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const client = { sessionId: 'c' + acc, send: (type: string, msg: unknown) => sent.push({ type: 'to:' + type, msg }) };
    const p = sim.addPlayer(client as never, char, true, 's' + acc);
    p.move.x = x;
    p.move.z = z;
    p.move.y = groundAt(x, z);
    return p;
  };
  const kill = (m: Mon) => {
    m.s.hp = 0;
    (sim as unknown as { killMonster(m: Mon): void }).killMonster(m);
  };
  return { sim, sent, join, kill };
}

const level = () => LEVELS['van_lam'];
const members = (rt: { melee: Mon[]; ranged?: Mon }) => (rt.ranged ? [...rt.melee, rt.ranged] : rt.melee);

describe('bãi quái theo cụm', () => {
  it('mỗi bãi dựng đủ cụm: số con gốc, quái đánh xa nếu có, đứng quanh tâm trên đất liền', () => {
    const { sim } = setup();
    const camps = level().camps!;
    expect(sim.camps.camps).toHaveLength(camps.length);
    for (const rt of sim.camps.camps) {
      expect(rt.melee).toHaveLength(rt.def.count);
      expect(!!rt.ranged).toBe(!!rt.def.ranged);
      for (const m of members(rt)) {
        expect(m.camp).toBe(rt);
        expect(m.state).toBe(MS_IDLE);
        expect(Math.hypot(m.s.x - rt.def.x, m.s.z - rt.def.z)).toBeLessThanOrEqual(rt.def.radius);
        expect(heightAt(m.s.x, m.s.z)).toBeGreaterThan(WATER_Y);
        expect(m.homeX).toBe(m.s.x);
      }
    }
  });
  it('quái trong cụm đứng gần nhau (đội hình), không rải khắp bãi', () => {
    const { sim } = setup();
    for (const rt of sim.camps.camps) {
      const ms = rt.melee;
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) expect(Math.hypot(ms[i].s.x - ms[j].s.x, ms[i].s.z - ms[j].s.z)).toBeLessThan(23);
    }
  });
  it('hạ một phần không hẹn tái sinh; hạ hết cụm thì hẹn theo số người (không người: 25 s)', () => {
    const { sim, kill } = setup();
    const rt = sim.camps.camps[0];
    const [first, ...rest] = members(rt);
    kill(first);
    expect(rt.respawnAt).toBe(0);
    const t0 = sim.now;
    for (const m of rest) kill(m);
    expect(rt.respawnAt - t0).toBeGreaterThanOrEqual(CAMP_RESPAWN_MIN * 1000 - 5);
    expect(rt.respawnAt - t0).toBeLessThanOrEqual(CAMP_RESPAWN_MAX * 1000 + 5);
    expect(rt.respawnAt - t0).toBeCloseTo(Math.min(rt.def.respawn, CAMP_RESPAWN_MAX) * 1000, -2);
  });
  it('cả cụm tái sinh cùng lúc, đúng đội hình, đầy máu; chưa tới giờ thì chưa', () => {
    const { sim, kill } = setup();
    const rt = sim.camps.camps[0];
    for (const m of members(rt)) kill(m);
    sim.now = rt.respawnAt - 1;
    sim.camps.tick();
    expect(members(rt).every((m) => m.state === MS_DEAD)).toBe(true);
    sim.now = rt.respawnAt;
    sim.camps.tick();
    expect(rt.respawnAt).toBe(0);
    expect(members(rt)).toHaveLength(rt.def.count + (rt.def.ranged ? 1 : 0));
    for (const m of members(rt)) {
      expect(m.state).toBe(MS_IDLE);
      expect(m.s.hp).toBe(m.s.mhp);
      expect(Math.hypot(m.s.x - rt.def.x, m.s.z - rt.def.z)).toBeLessThanOrEqual(rt.def.radius);
      expect(m.homeX).toBe(m.s.x);
    }
  });
  it('quái chết không tự hồi sinh lẻ (cụm quản), dù tới giờ riêng', () => {
    const { sim, kill } = setup();
    const rt = sim.camps.camps[0];
    const [a, ...rest] = members(rt);
    kill(a);
    sim.now += 120_000;
    (sim as unknown as { tickMonster(m: Mon, dt: number): void }).tickMonster(a, 0.05);
    expect(a.state).toBe(MS_DEAD);
    expect(rest.every((m) => m.state !== MS_DEAD)).toBe(true);
  });
  it('đông người trong vùng: hồi nhanh hơn và cụm đẻ nhiều con hơn (tối đa 1,5 lần); vắng lại thì gỡ con thừa', () => {
    const { sim, join, kill } = setup();
    const rt = sim.camps.camps[0];
    const crowd: Ent[] = [];
    for (let i = 0; i < 12; i++) crowd.push(join(rt.def.x + i * 0.2, rt.def.z));
    const t0 = sim.now;
    for (const m of members(rt)) kill(m);
    const wait = rt.respawnAt - t0;
    expect(wait).toBeLessThan(CAMP_RESPAWN_MAX * 1000);
    expect(wait).toBeGreaterThanOrEqual(CAMP_RESPAWN_MIN * 1000 - 5);
    sim.now = rt.respawnAt;
    sim.camps.tick();
    expect(rt.melee).toHaveLength(campMeleeCount(rt.def.count, 12));
    expect(rt.melee.length).toBeLessThanOrEqual(Math.floor(rt.def.count * 1.5));
    expect(rt.melee.length).toBeGreaterThan(rt.def.count);
    const total = sim.monsters.length;
    // Mọi người rời vùng, cụm bị dọn lại: tái sinh về số gốc, con thừa bị gỡ khỏi thế giới.
    for (const p of crowd) {
      p.move.x = 2040;
      p.move.z = 2040;
    }
    for (const m of members(rt)) kill(m);
    sim.now = rt.respawnAt;
    sim.camps.tick();
    expect(rt.melee).toHaveLength(rt.def.count);
    expect(sim.monsters.length).toBeLessThan(total);
    for (const m of rt.melee) expect(sim.monById.get(m.id)).toBe(m);
  });
  it('một con bị đánh thì đồng bọn rảnh trong 14 m cùng lao vào', () => {
    const { sim, join } = setup();
    const rt = sim.camps.camps.find((c) => c.melee.length >= 3)!;
    const p = join(rt.def.x, rt.def.z);
    const [a, ...rest] = rt.melee;
    (sim as unknown as { aggroMonster(m: Mon, p: Ent): void }).aggroMonster(a, p);
    expect(a.state).toBe(MS_CHASE);
    const near = rest.filter((m) => Math.hypot(m.s.x - a.s.x, m.s.z - a.s.z) <= 14);
    expect(near.length).toBeGreaterThan(0);
    for (const m of near) {
      expect(m.state).toBe(MS_CHASE);
      expect(m.target).toBe(p.sid);
    }
  });
});

describe('giờ hồi sinh tinh anh và boss', () => {
  const timed = (sim: Sim) => sim.monsters.filter((m) => !m.camp && m.spawn && (m.def.boss || m.def.elite));

  it('chỉ có tinh anh/boss đứng lẻ, kèm điểm nhà và cấp; đang sống thì at = 0', () => {
    const { sim } = setup();
    const msg = sim.bossTimers();
    const ids = new Set(timed(sim).map((m) => m.id));
    expect(msg.list.length).toBe(ids.size);
    expect(msg.list.length).toBeGreaterThan(10);
    for (const t of msg.list) {
      expect(ids.has(t.id)).toBe(true);
      expect(t.t).toMatch(/^(elite|boss)_/);
      expect(Number.isFinite(t.x) && Number.isFinite(t.z) && t.lv >= 1).toBe(true);
      expect(t.at).toBe(0);
    }
  });
  it('hạ tinh anh: giờ hồi sinh > 0 và được phát cho cả phòng; hồi sinh: về 0 và phát lại', () => {
    const { sim, sent, kill } = setup();
    const e = timed(sim).find((m) => m.def.elite)!;
    kill(e);
    const last = () => sent.filter((s) => s.type === S.BOSS_TIMERS).pop()!.msg as BossTimerMsg;
    const at = last().list.find((t) => t.id === e.id)!.at;
    expect(at).toBe(Math.round(e.respawnAt));
    expect(at).toBeGreaterThan(sim.now);
    sim.now = e.respawnAt;
    (sim as unknown as { tickMonster(m: Mon, dt: number): void }).tickMonster(e, 0.05);
    expect(last().list.find((t) => t.id === e.id)!.at).toBe(0);
  });
  it('người mới vào nhận giờ hồi sinh ngay', () => {
    const { sim, sent, join } = setup();
    const p = join(2040, 2040);
    sent.length = 0;
    sim.sendBossTimers(p);
    const m = sent.find((s) => s.type === 'to:' + S.BOSS_TIMERS);
    expect(m).toBeDefined();
    expect((m!.msg as BossTimerMsg).list.length).toBeGreaterThan(10);
  });
  it('quái trong bãi không có trong danh sách giờ hồi sinh (cụm quản)', () => {
    const { sim, kill } = setup();
    const before = sim.bossTimers().list.length;
    const rt = sim.camps.camps[0];
    for (const m of members(rt)) kill(m);
    expect(sim.bossTimers().list.length).toBe(before);
  });
});

describe('AOI: chỉ đồng bộ quái/người trong tầm', () => {
  class FakeView {
    set = new Set<unknown>();
    add(o: unknown) {
      this.set.add(o);
      return true;
    }
    remove(o: unknown) {
      this.set.delete(o);
      return this;
    }
  }
  const asView = (v: FakeView) => v as never;

  it('thấy quái trong AOI_IN, giữ tới AOI_OUT (trễ), bỏ khi quá; người xa không thấy', () => {
    const { sim, join } = setup();
    const rt = sim.camps.camps[0];
    const a = join(rt.def.x, rt.def.z);
    const far = join(rt.def.x + 1500, rt.def.z);
    const views = new Map<string, FakeView>([[a.sid, new FakeView()], [far.sid, new FakeView()]]);
    const aoi = new Aoi(sim);
    aoi.update((sid) => asView(views.get(sid)!));
    const va = views.get(a.sid)!;
    const near = sim.monsters.filter((m) => Math.hypot(m.s.x - a.move.x, m.s.z - a.move.z) <= AOI_IN);
    const out = sim.monsters.filter((m) => Math.hypot(m.s.x - a.move.x, m.s.z - a.move.z) > AOI_OUT && !m.def.boss);
    expect(near.length).toBeGreaterThan(0);
    expect(out.length).toBeGreaterThan(0);
    for (const m of near) expect(va.set.has(m.s)).toBe(true);
    for (const m of out) expect(va.set.has(m.s)).toBe(false);
    expect(va.set.has(far.s)).toBe(false);
    // Đi ra giữa AOI_IN và AOI_OUT: quái đã thấy vẫn giữ (độ trễ).
    const pick = near.find((m) => Math.hypot(m.s.x - a.move.x, m.s.z - a.move.z) < AOI_IN - 5)!;
    a.move.x += AOI_IN - Math.hypot(pick.s.x - a.move.x, pick.s.z - a.move.z) + 15;
    const d = Math.hypot(pick.s.x - a.move.x, pick.s.z - a.move.z);
    if (d > AOI_IN && d <= AOI_OUT) {
      aoi.update((sid) => asView(views.get(sid)!));
      expect(va.set.has(pick.s)).toBe(true);
    }
    // Ra hẳn: bị gỡ.
    a.move.x += 400;
    aoi.update((sid) => asView(views.get(sid)!));
    expect(va.set.has(pick.s)).toBe(false);
  });
  it('quái bị gỡ khỏi thế giới thì AOI chỉ quên, không lỗi', () => {
    const { sim, join } = setup();
    const rt = sim.camps.camps[0];
    const a = join(rt.def.x, rt.def.z);
    const v = new FakeView();
    const aoi = new Aoi(sim);
    aoi.update(() => asView(v));
    const m = rt.melee[rt.melee.length - 1];
    (sim as unknown as { removeMonster(m: Mon): void }).removeMonster(m);
    expect(() => aoi.update(() => asView(v))).not.toThrow();
    void a;
  });
  it('tin FX/sát thương ở xa không gửi cho người ngoài tầm (nhưng người có tên trong tin vẫn nhận)', () => {
    const { sim, sent, join } = setup();
    const rt = sim.camps.camps[0];
    const a = join(rt.def.x, rt.def.z);
    const far = join(rt.def.x + 1500, rt.def.z);
    sent.length = 0;
    sim.fx({ t: 'sword', src: a.sid, dst: rt.melee[0].id });
    const m = sent.find((s) => s.type === S.FX)!;
    expect(m.except?.has(far.sid)).toBe(true);
    expect(m.except?.has(a.sid)).toBeFalsy();
    sent.length = 0;
    sim.fx({ t: 'sword', src: far.sid, dst: rt.melee[0].id });
    const m2 = sent.find((s) => s.type === S.FX)!;
    expect(m2.except?.has(far.sid)).toBeFalsy();
    expect(AOI_OUT).toBeGreaterThan(AOI_IN);
  });
});
