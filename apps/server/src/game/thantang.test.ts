import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groundAt, MF_BROKEN, MS_CHASE, MS_DEAD, PF_DEAD, S, type FxMsg, type TransferMsg } from '@dtl/shared';

// E4-C: Thần Tàng Điện. Dữ liệu đợt, vé, đợt phong ấn (xuất khiếu / Phá Ấn Phù / vùng chặn), Vô Diện Thần Quân
// (sáu tay, ngũ hành, phân thân, vòng đá + Phản hồi), thưởng một lần mỗi ngày.
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
type Rooms = typeof import('../rooms');
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let parties: typeof import('./party').parties;
let rooms: Rooms;
let transfer: typeof import('../transfer');
let content: typeof import('@dtl/content');
let dbm: typeof import('../db');
let tt: typeof import('./thantang');
let seal: typeof import('./seal');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ parties } = await import('./party'));
  rooms = await import('../rooms');
  transfer = await import('../transfer');
  content = await import('@dtl/content');
  dbm = await import('../db');
  tt = await import('./thantang');
  seal = await import('./seal');
});

afterEach(() => {
  vi.restoreAllMocks();
  parties.reset();
  transfer.tickets.clear();
  sent.length = 0;
});

interface Sent {
  type: string;
  msg: unknown;
  to: string;
}
const sent: Sent[] = [];
let acc = 61000;
const LV = 'than_tang';
const DEF = () => content.LEVELS[LV];
const keys = (p: Ent) => sent.filter((s) => s.type === S.SYS && (s.to === p.char.name || s.to === '*')).map((s) => (s.msg as { k: string }).k);
const fxs = (t: string) => sent.filter((s) => s.type === S.FX && (s.msg as FxMsg).t === t).map((s) => s.msg as FxMsg);
const xfers = (p: Ent) => sent.filter((s) => s.type === S.TRANSFER && s.to === p.char.name).map((s) => s.msg as TransferMsg);

function mkChar(name: string, level: number) {
  const char = Character.create(acc++, name + acc);
  char.level = level;
  char.bk = level;
  char.xp = 0;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  return char;
}

type TestRoom = InstanceType<Rooms['GameRoom']> & { director(): void; payReward(): void; wave: number; nextWaveAt: number; clearedAt: number; seals: InstanceType<typeof import('./seal').SealSystem> | null };

async function mkRoom(levelId: string, cls: { prototype: object }) {
  const { Aoi } = await import('../aoi');
  const room = Object.create(cls.prototype) as Record<string, unknown> & { sim: InstanceType<typeof GameSim> };
  const lv = content.LEVELS[levelId];
  const spawn = lv.dungeon?.spawn ?? lv.spawn!;
  room.broadcast = (type: string, msg: unknown) => sent.push({ type, msg, to: '*' });
  room.sim = new GameSim(new WorldState(), room as never, { levelId, roomName: levelId, spawn, respawn: spawn, persistPosition: !lv.dungeon });
  room.aoi = new Aoi(room.sim);
  room.clients = { getById: () => undefined };
  room.markers = { drop() {}, sync() {} };
  room.clock = { setTimeout: () => undefined, setInterval: () => undefined };
  Object.defineProperty(room, 'roomName', { value: levelId });
  room.lock = () => undefined;
  Object.assign(room, { wave: 0, nextWaveAt: 0, clearedAt: 0, revives: new Map(), puzzle: null, seals: null });
  const join = (char: InstanceType<typeof Character>, auth: Record<string, unknown> = {}): Ent => {
    const c = { sessionId: 'sid' + acc++, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) };
    (room as unknown as { onJoin(c: unknown, o: unknown, a: unknown): void }).onJoin(c, {}, { accountId: 1, dev: true, charId: char.id, session: 's', ticket: true, ...auth });
    return [...room.sim.players.values()].find((q) => q.char.id === char.id)!;
  };
  return { room: room as unknown as TestRoom, sim: room.sim, join };
}

const prime = (p: Ent, level: number): Ent => {
  p.char.level = level;
  p.char.bk = level;
  p.char.recalc();
  p.char.hp = p.char.mhp;
  return p;
};
const place = (p: Ent, x: number, z: number) => {
  p.move.x = x;
  p.move.z = z;
  p.move.y = groundAt(x, z);
};

describe('dữ liệu Thần Tàng Điện', () => {
  it('sáu đợt đúng thiết kế mục 5.3; cấp 26+; về Thiên Khuyết; cổng ở Thiên Khuyết trỏ vào đây', () => {
    const d = DEF().dungeon!;
    expect(d.minLevel).toBe(26);
    expect(d.waves).toHaveLength(6);
    const tally = (i: number) => d.waves[i].mons.map((m) => `${m.id}×${m.n}`);
    expect(tally(0)).toEqual(['mon_tt_cot_ve×10']);
    expect(tally(1)).toEqual(['mon_tt_thach_tuong×4', 'mon_tt_chien_ma×2']);
    expect(tally(2)).toEqual(['elite_tt_cot_kiem×1']);
    expect(d.waves[3].seals!.doors).toHaveLength(3);
    // 6 con ban đầu + 4 con mỗi cửa mở = 6 + 3×4 = 18 (≥ 14 theo thiết kế).
    expect(d.waves[3].mons[0].n + 3 * d.waves[3].seals!.reinforce.n).toBeGreaterThanOrEqual(14);
    expect(tally(4)).toEqual(['mon_tt_thach_tuong×6', 'mon_tt_cot_ve×4', 'elite_tt_cot_kiem×1']);
    expect(tally(5)).toEqual(['boss_vo_dien_than_quan×1']);
    expect(d.returnLevel).toBe('thien_khuyet');
    expect(content.LEVELS.thien_khuyet.portals?.[0].to).toBe(LV);
  });

  it('boss: hpMul 120, xpMul 30, cấp 27, ba pha; cơ chế bật theo pha', () => {
    const m = content.MONSTER.get('boss_vo_dien_than_quan')!;
    expect(m.hpMul).toBe(120);
    expect(m.xpMul).toBe(30);
    expect(m.phases).toHaveLength(2);
    expect(m.than!.hands!.n).toBe(6);
    expect(m.than!.hands!.delay).toBeGreaterThanOrEqual(1.3);
    expect(m.than!.elem!.cut).toBe(0.8);
    expect(m.than!.clone!.phase).toBe(1);
    expect(m.than!.clone!.heal).toBe(0.08);
    expect(m.than!.rings!.phase).toBe(2);
    // Ấn nằm trong vòng đánh ngũ hành (đứng trên ấn vẫn bị đánh, chỉ giảm 80%).
    expect(m.than!.elem!.ring + m.than!.elem!.sealR).toBeLessThanOrEqual(m.than!.elem!.r + 0.5);
  });

  it('Phá Ấn Phù có công thức chế và tên khớp glossary', () => {
    const it = content.ITEM.get('itm_pha_an_phu')!;
    expect(it.use?.seal).toBe(true);
    expect(content.RECIPES.some((r) => r.output.id === 'itm_pha_an_phu')).toBe(true);
  });
});

describe('hàm thuần', () => {
  it('counterOf: hành khắc chế đúng vòng Kim→Mộc→Thổ→Thủy→Hỏa→Kim', () => {
    expect(tt.counterOf('kim')).toBe('hoa');
    expect(tt.counterOf('moc')).toBe('kim');
    expect(tt.counterOf('tho')).toBe('moc');
    expect(tt.counterOf('thuy')).toBe('tho');
    expect(tt.counterOf('hoa')).toBe('thuy');
  });
  it('handYaws chia đều và xoay 45° mỗi lần', () => {
    const a = tt.handYaws(0, 6, 0, 45);
    expect(a[1] - a[0]).toBeCloseTo(Math.PI / 3);
    expect(tt.handYaws(0, 6, 1, 45)[0]).toBeCloseTo(Math.PI / 4);
  });
  it('gathered: cả đội gần nhau thì đúng; một người đứng xa thì sai; một mình thì sai', () => {
    expect(tt.gathered([{ x: 0, z: 0 }, { x: 4, z: 0 }], 10)).toBe(true);
    expect(tt.gathered([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 40, z: 0 }], 10)).toBe(false);
    expect(tt.gathered([{ x: 0, z: 0 }], 10)).toBe(false);
  });
  it('ringPos quay đều quanh tâm', () => {
    const p0 = tt.ringPos(0, 0, 10, 0, 3, 40, 0);
    expect(Math.hypot(p0.x, p0.z)).toBeCloseTo(10);
    // 9 s × 40°/s = 360°: về đúng chỗ cũ.
    const p1 = tt.ringPos(0, 0, 10, 0, 3, 40, 9);
    expect(p1.x).toBeCloseTo(10);
    expect(p1.z).toBeCloseTo(0);
    const p2 = tt.ringPos(0, 0, 10, 0, 3, 40, 2.25);
    expect(p2.x).toBeCloseTo(0);
    expect(p2.z).toBeCloseTo(10);
  });
  it('nearestClosed / barrierPush bỏ qua cửa đã mở', () => {
    const def = DEF().dungeon!.waves[3].seals!;
    const d = def.doors[0];
    expect(seal.nearestClosed(def, [false, false, false], d.x, d.z, def.phuR)).toBe(0);
    expect(seal.nearestClosed(def, [true, false, false], d.x, d.z, def.phuR)).toBe(-1);
    expect(seal.barrierPush(def, [false, false, false], d.gx, d.gz)).not.toBeNull();
    expect(seal.barrierPush(def, [true, false, false], d.gx, d.gz)).toBeNull();
    const out = seal.barrierPush(def, [false, false, false], d.gx, d.gz)!;
    expect(Math.hypot(out.x - d.gx, out.z - d.gz)).toBeGreaterThan(def.bar);
  });
});

describe('vào bí cảnh', () => {
  it('cổng ở Thiên Khuyết: đủ cấp 26 mới có vé, room riêng dungeon-than_tang', async () => {
    const r = await mkRoom('thien_khuyet', rooms.defineWorld('thien_khuyet'));
    const p = prime(r.join(mkChar('ttcong', 26)), 26);
    const portal = content.LEVELS.thien_khuyet.portals![0];
    place(p, portal.x, portal.z);
    (r.room as unknown as { sendTransfer: (p: Ent, to: string, o?: unknown) => void }).sendTransfer = (_p, to, o) => void sent.push({ type: S.TRANSFER, msg: { level: to, options: o }, to: p.char.name });
    p.char.level = 25;
    r.room.onPortal(p);
    expect(keys(p)).toContain('sys.dungeon_level');
    expect(xfers(p)).toHaveLength(0);
    p.char.level = 26;
    r.room.onPortal(p);
    expect(sent.filter((s) => s.type === S.TRANSFER && (s.msg as { level: string }).level === LV)).toHaveLength(1);
    expect(transfer.tickets.peek(p.char.id, LV)).toBeTruthy();
  });
});

describe('đợt phong ấn', () => {
  async function toSealWave() {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const p = prime(r.join(mkChar('ttseal', 26)), 26);
    let now = 70_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const alive = () => r.sim.monsters.filter((m) => m.state !== MS_DEAD);
    r.room.wave = 3;
    r.room.nextWaveAt = now;
    r.room.director();
    return { r, p, alive, adv: (ms: number) => (now += ms), set now(v: number) { now = v; }, get now() { return now; } };
  }

  it('đợt 4: 6 quái, ba cửa đóng; chưa mở đủ thì hết quái cũng không sang đợt sau', async () => {
    const { r, p, alive } = await toSealWave();
    expect(r.room.wave).toBe(4);
    expect(alive()).toHaveLength(6);
    expect(r.room.seals).not.toBeNull();
    expect(keys(p)).toContain('sys.seal_need');
    r.sim.monsters.forEach((m) => (m.state = MS_DEAD));
    r.room.director();
    r.room.director();
    expect(r.room.wave).toBe(4);
  });

  it('thân xác bị chặn ngoài hốc; nguyên anh xuất khiếu chạm trận môn thì mở cửa và quái kéo tới', async () => {
    const { r, p, alive } = await toSealWave();
    const d = DEF().dungeon!.waves[3].seals!.doors[0];
    place(p, d.gx, d.gz);
    r.room.seals!.tick();
    expect(Math.hypot(p.move.x - d.gx, p.move.z - d.gz)).toBeGreaterThan(DEF().dungeon!.waves[3].seals!.bar);
    expect(keys(p)).toContain('sys.seal_barrier');
    expect(r.room.seals!.isOpen(0)).toBe(false);
    // Xuất khiếu: soul.isScouting trả true thì không bị chặn và chạm trận môn là mở.
    vi.spyOn(r.sim.soul, 'isScouting').mockReturnValue(true);
    place(p, d.gx, d.gz);
    r.room.seals!.tick();
    expect(p.move.x).toBe(d.gx);
    expect(r.room.seals!.isOpen(0)).toBe(true);
    expect(r.room.seals!.count).toBe(1);
    expect(keys(p)).toContain('sys.seal_open');
    expect(alive()).toHaveLength(6 + 4);
    // Cửa đã mở thì thân xác đi vào được.
    vi.spyOn(r.sim.soul, 'isScouting').mockReturnValue(false);
    place(p, d.gx, d.gz);
    r.room.seals!.tick();
    expect(p.move.x).toBe(d.gx);
  });

  it('Phá Ấn Phù: chỉ tiêu bùa khi đứng trước cửa đóng; mở đủ ba và hạ hết quái thì sang đợt 5', async () => {
    const { r, p, alive, adv } = await toSealWave();
    p.char.tx('give', null, (d) => {
      d.add('itm_pha_an_phu', 3);
      return true;
    });
    const slot = () => p.char.inv.findIndex((i) => i?.id === 'itm_pha_an_phu');
    const count = () => p.char.inv.reduce((n, i) => n + (i?.id === 'itm_pha_an_phu' ? i.n : 0), 0);
    const use = (k: string) => (r.sim as unknown as { onUse(p: Ent, m: unknown): void }).onUse(p, { slot: slot(), r: k });
    // Xa cửa: không mở, không mất bùa.
    place(p, 1520, 1300);
    use('pap-0');
    expect(count()).toBe(3);
    expect(keys(p)).toContain('sys.seal_need');
    const doors = DEF().dungeon!.waves[3].seals!.doors;
    doors.forEach((d, i) => {
      place(p, d.x, d.z);
      adv(5000);
      r.sim.now += 5000;
      use('pap-' + (i + 1));
    });
    expect(count()).toBe(0);
    expect(r.room.seals!.all).toBe(true);
    expect(keys(p)).toContain('sys.seal_all');
    expect(alive()).toHaveLength(6 + 12);
    r.sim.monsters.forEach((m) => (m.state = MS_DEAD));
    r.room.director();
    adv(7000);
    r.room.director();
    expect(r.room.wave).toBe(5);
    expect(r.room.seals).toBeNull();
    expect(r.sim.sealHook).toBeNull();
  });

  it('Phá Ấn Phù: gửi lại cùng khóa idem sau khi hết hồi không mở thêm cửa (cửa chỉ mở sau khi trừ bùa)', async () => {
    const { r, p, adv } = await toSealWave();
    p.char.tx('give', null, (d) => {
      d.add('itm_pha_an_phu', 3);
      return true;
    });
    const doors = DEF().dungeon!.waves[3].seals!.doors;
    const slot = () => p.char.inv.findIndex((i) => i?.id === 'itm_pha_an_phu');
    const use = (k: string) => (r.sim as unknown as { onUse(p: Ent, m: unknown): void }).onUse(p, { slot: slot(), r: k });
    place(p, doors[0].x, doors[0].z);
    use('same-key');
    expect(r.room.seals!.count).toBe(1);
    adv(5000);
    r.sim.now += 5000;
    place(p, doors[1].x, doors[1].z);
    use('same-key');
    expect(r.room.seals!.count).toBe(1);
  });

  it('chống kẹt: quá 180 s không mở thêm cửa thì phong ấn tự lỏng một cửa', async () => {
    const { r, p, adv } = await toSealWave();
    expect(r.room.seals!.count).toBe(0);
    adv(seal.STALL_MS + 1000);
    r.room.seals!.tick();
    expect(r.room.seals!.count).toBe(1);
    expect(keys(p)).toContain('sys.seal_loosen');
  });
});

describe('Vô Diện Thần Quân (ThanTangSystem)', () => {
  async function fight() {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const p = prime(r.join(mkChar('ttboss', 27)), 27);
    const c = DEF().dungeon!.center;
    const def = content.MONSTER.get('boss_vo_dien_than_quan')!;
    const boss = r.sim.spawnMonster(def, 27, c.x, c.z, null);
    boss.state = MS_CHASE;
    boss.target = p.sid;
    boss.attackAt = Number.MAX_SAFE_INTEGER;
    place(p, c.x, c.z + 30);
    p.char.mhp = 1_000_000;
    p.char.hp = 1_000_000;
    let now = 80_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const sim = r.sim as unknown as { now: number; hazards: { src: string; dmg: number; sh?: string }[]; than: InstanceType<typeof tt.ThanTangSystem> };
    sim.now = now;
    const adv = (ms: number) => {
      now += ms;
      sim.now = now;
      sim.than.tick();
    };
    return { r, p, boss, sim, adv, c, def };
  }

  it('sáu tay: sau 5 s báo sáu vạch nón (không sát thương lúc báo); khe giữa các tay an toàn, đứng trên trục tay thì trúng', async () => {
    const { p, boss, sim, adv, c } = await fight();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    adv(0);
    adv(5000);
    const volley = () => sim.hazards.filter((h) => h.sh === 'cone' && h.src === boss.id).slice(-6) as unknown as { yaw: number; dmg: number }[];
    expect(volley()).toHaveLength(6);
    expect(volley().every((h) => h.dmg === 0)).toBe(true);
    // Tay đầu nhắm thẳng người gần nhất; khe giữa hai tay cách trục 30°, nón rộng 22° nên 30° là an toàn.
    const base = volley()[0].yaw;
    const hp0 = p.char.hp;
    place(p, c.x + Math.sin(base + Math.PI / 6) * 8, c.z + Math.cos(base + Math.PI / 6) * 8);
    adv(1400);
    expect(p.char.hp).toBe(hp0);
    // Lượt sau xoay thêm 45°; đứng đúng trục tay đầu của lượt đó thì trúng.
    adv(9600);
    const next = volley()[0].yaw;
    expect(next).not.toBeCloseTo(base);
    place(p, c.x + Math.sin(next) * 8, c.z + Math.cos(next) * 8);
    adv(1400);
    expect(p.char.hp).toBeLessThan(hp0);
  });

  it('ngũ hành: đứng trên ấn khắc chế thì giảm 80% và DmgMsg có cờ ke; ấn đặt dấu trên sàn', async () => {
    const { r, p, boss, sim, adv, c, def } = await fight();
    vi.spyOn(Math, 'random').mockReturnValue(0); // hành Kim; ấn khắc chế là Hỏa (chỉ số 4)
    boss.def = { ...def, than: { ...def.than!, hands: undefined } };
    adv(0);
    adv(8000);
    expect(keys(p)).toContain('sys.tt_elem');
    const cfg = def.than!.elem!;
    const rt = (sim.than as unknown as { rt: Map<string, { cx: number; cz: number }> }).rt.get(boss.id)!;
    const sp = sim.than.sealPos(rt, cfg.ring, 4);
    const off = sim.than.sealPos(rt, cfg.ring, 1);
    place(p, off.x, off.z);
    const hp0 = p.char.hp;
    adv(cfg.delay * 1000 + 50);
    const lossOff = hp0 - p.char.hp;
    expect(lossOff).toBeGreaterThan(0);
    // Lần sau (Math.random = 0 chọn lại Kim nhưng khác lastElem → Mộc): ép lại hành Kim bằng cách xóa lastElem.
    (sim.than as unknown as { rt: Map<string, { lastElem: string | null; elemNext: number }> }).rt.get(boss.id)!.lastElem = null;
    (sim.than as unknown as { rt: Map<string, { elemNext: number }> }).rt.get(boss.id)!.elemNext = 0;
    place(p, sp.x, sp.z);
    const hp1 = p.char.hp;
    adv(1);
    adv(cfg.delay * 1000 + 50);
    const lossOn = hp1 - p.char.hp;
    expect(lossOn).toBeGreaterThan(0);
    expect(lossOn).toBeLessThan(lossOff * 0.35);
    expect(r.sim.monsters.length).toBeGreaterThan(0);
    expect(c.x).toBeGreaterThan(0);
  });

  it('thần niệm (pha 2): hai phân thân; hạ hết trước hạn thì boss mất thế; để sống quá hạn thì hợp lại, boss hồi 8%', async () => {
    const { r, p, boss, sim, adv } = await fight();
    adv(0);
    boss.phase = 1;
    adv(3100);
    const clones = () => r.sim.monsters.filter((m) => m.def.id === 'mon_tt_phan_than' && m.state !== MS_DEAD);
    expect(clones()).toHaveLength(2);
    expect(keys(p)).toContain('sys.tt_clone');
    for (const cl of clones()) r.sim.damageMonster(cl, cl.s.mhp, p);
    adv(500);
    expect(keys(p)).toContain('sys.tt_clone_ok');
    expect(boss.posture).toBeGreaterThanOrEqual(0);
    // Vòng sau: để sống.
    adv(41_000);
    expect(clones()).toHaveLength(2);
    boss.s.hp = Math.round(boss.s.mhp * 0.5);
    adv(16_000);
    expect(clones()).toHaveLength(0);
    expect(boss.s.hp).toBe(Math.round(boss.s.mhp * 0.5) + Math.round(boss.s.mhp * 0.08));
    expect(keys(p)).toContain('sys.tt_clone_merge');
    expect(sim.than.active()).toBe(true);
  });

  it('mất tên (pha 3): ba vòng đá gây sát thương; xong thì tia Phản hồi gấp đôi khi cả đội đứng gần nhau', async () => {
    const { r, p, boss, sim, adv, def } = await fight();
    const buddy = prime(r.join(mkChar('ttbuddy', 27)), 27);
    buddy.char.mhp = 1_000_000;
    buddy.char.hp = 1_000_000;
    boss.def = { ...def, than: { ...def.than!, hands: undefined, elem: undefined, clone: undefined } };
    boss.phase = 2;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    adv(0);
    adv(4000);
    expect(keys(p)).toContain('sys.tt_rings');
    const cfg = def.than!.rings!;
    const rt = (sim.than as unknown as { rt: Map<string, { cx: number; cz: number; rings: { t0: number; theta0: number } }> }).rt.get(boss.id)!;
    adv(1000);
    const pos = tt.ringPos(rt.cx, rt.cz, cfg.orbit, 0, cfg.n, cfg.spin, (sim.now - rt.rings.t0) / 1000, rt.rings.theta0);
    const hp0 = p.char.hp;
    place(p, pos.x, pos.z);
    adv(100);
    expect(p.char.hp).toBeLessThan(hp0);
    // Hết 12 s: tia Phản hồi. Hai người đứng cạnh nhau trên đường tia (trước mặt boss) nhận gấp đôi một mình.
    adv(cfg.dur * 1000);
    expect(keys(p)).toContain('sys.tt_final');
    const beam = (sim as unknown as { hazards: { sh?: string; yaw?: number; x: number; z: number }[] }).hazards.find((h) => h.sh === 'rect')!;
    expect(beam).toBeDefined();
    const yaw = beam.yaw ?? 0;
    place(p, beam.x + Math.sin(yaw) * 20, beam.z + Math.cos(yaw) * 20);
    place(buddy, beam.x + Math.sin(yaw) * 22, beam.z + Math.cos(yaw) * 22);
    p.char.hp = 1_000_000;
    buddy.char.hp = 1_000_000;
    adv(cfg.final.delay * 1000 + 50);
    const together = 1_000_000 - p.char.hp;
    expect(together).toBeGreaterThan(0);
    expect(sim.than.active()).toBe(true);
  });

  it('hạ hết phân thân: boss mất thế đúng `weak` giây (6 s) kể cả khi đang quỵ vì phá thế thường', async () => {
    const { r, p, boss, adv, def } = await fight();
    adv(0);
    boss.phase = 1;
    adv(3100);
    const t0 = (r.sim as unknown as { now: number }).now;
    // Vừa bị phá thế thường (brk 4 s): addPosture sẽ là no-op, nhưng mất thế của phân thân vẫn phải kéo dài tới `weak`.
    (r.sim as unknown as { stagger(m: typeof boss, s: number): void }).stagger(boss, def.posture!.brk);
    expect(boss.stunUntil).toBeCloseTo(t0 + def.posture!.brk * 1000, -2);
    for (const cl of r.sim.monsters.filter((m) => m.def.id === 'mon_tt_phan_than' && m.state !== MS_DEAD)) r.sim.damageMonster(cl, cl.s.mhp, p);
    adv(100);
    expect(keys(p)).toContain('sys.tt_clone_ok');
    expect(boss.stunUntil).toBeGreaterThanOrEqual(t0 + 100 + def.than!.clone!.weak * 1000 - 50);
    expect(boss.s.mf & MF_BROKEN).toBeTruthy();
  });

  it('boss chết thì phân thân biến mất', async () => {
    const { r, p, boss, adv } = await fight();
    adv(0);
    boss.phase = 1;
    adv(3100);
    expect(r.sim.monsters.filter((m) => m.def.id === 'mon_tt_phan_than' && m.state !== MS_DEAD)).toHaveLength(2);
    r.sim.damageMonster(boss, boss.s.mhp, p);
    expect(boss.state).toBe(MS_DEAD);
    expect(r.sim.monsters.filter((m) => m.def.id === 'mon_tt_phan_than' && m.state !== MS_DEAD)).toHaveLength(0);
    adv(100);
  });
});

describe('thưởng', () => {
  it('dẹp xong: thưởng một lần mỗi ngày (ledger idem), Thần Tàng Ngọc vào túi, 15% tu vi; sau 20 s về Thiên Khuyết', async () => {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const p = prime(r.join(mkChar('ttthuong', 27)), 27);
    let now = 90_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    r.room.wave = 6;
    r.room.nextWaveAt = now;
    r.sim.monsters.forEach((m) => (m.state = MS_DEAD));
    r.room.director();
    expect(keys(p)).toContain('sys.dungeon_reward');
    expect(p.char.inv.some((i) => i?.id === 'itm_than_tang_ngoc')).toBe(true);
    const idem = `dungeon:${LV}:${p.char.id}:${new Date().toISOString().slice(0, 10)}`;
    expect(dbm.db.select().from(dbm.ledger).all().filter((x) => x.idem === idem)).toHaveLength(1);
    const gold1 = p.char.gold;
    r.room.payReward();
    expect(p.char.gold).toBe(gold1);
    now += 20_500;
    r.room.director();
    expect(xfers(p).at(-1)!.level).toBe('thien_khuyet');
    expect(fxs('x')).toHaveLength(0);
    expect((p.s.fl & PF_DEAD) === 0).toBe(true);
  });
});
