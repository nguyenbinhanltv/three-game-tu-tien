// Phép thử QUÁI BỎ ĐUỔI và KẸT VẬT CẢN (bàn cân bằng V2e) trong sim server thật, đồng hồ giả, không mạng.
// Chạy: pnpm --filter @dtl/server leash:check [--levels van_lam,doan_mach] [--per 3] [--only <id quái>] [--verbose] [--strict]
//   Mỗi bản đồ lấy `--per` con (mặc định 3: đầu, giữa, cuối danh sách) của TỪNG loại quái đang có trong room, rồi với mỗi con:
//   1. "kéo chạy": người chơi bất tử đứng sát cho quái vào trận, rồi chạy thẳng ra xa nhà quái (9 m/s, nhanh hơn quái). Mong đợi: quái bỏ đuổi
//      khi rời nhà quá tầm (48 m, boss 80 m) hoặc mục tiêu xa hơn 70 m, chạy về, hồi đầy máu, đứng yên tại nhà trong ≤ 45 giây.
//   2. "dắt đi": như trên nhưng người chơi chỉ nhanh ngang quái (quái bám sát suốt). Mong đợi: vẫn phải bỏ ở mép tầm, không bị dắt đi vô hạn.
//   3. "tám hướng": người chơi đứng yên cách nhà quái 14 m theo 8 hướng. Mỗi hướng phải kết thúc trong ≤ 16 giây bằng một trong hai cách:
//      quái tới được tầm đánh (hoặc đứng vòng ngoài chờ ô cận chiến vì bạn cùng bãi đã áp sát trước), hoặc quái bị vật cản giữ lại thì bỏ đuổi
//      + miễn sát thương (`evadeUntil`). Sau 16 giây vẫn đang bị vật rắn giữ (đang trượt quanh vật) = KẸT.
//   In bảng theo bản đồ × loại quái; `--strict` thoát mã 1 khi có ô lỗi. Phép thử không ghi gì vào CSDL (DB trong bộ nhớ).
process.env.DB_FILE = ':memory:';

import { MS_ATTACK, MS_CHASE, MS_DEAD, MS_IDLE } from '@dtl/shared';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf('--' + name);
  return (i >= 0 ? process.argv[i + 1] : undefined) || def;
};
const LEVELS = arg('levels', 'van_lam,doan_mach,van_hai,thien_khuyet,bac_hoang,van_dinh,cuu_kieu').split(',');
const PER = Math.max(1, Number(arg('per', '3')));
const ONLY = arg('only', '');
const VERBOSE = process.argv.includes('--verbose');
const STRICT = process.argv.includes('--strict');

let fake = Date.now();
Date.now = () => fake;

const { GameSim } = await import('../game/sim');
const { WorldState } = await import('../state');
const { Character } = await import('../game/character');
const { LEVELS: LV } = await import('@dtl/content');
const { LEASH } = await import('../game/combat/consts');
type Sim = InstanceType<typeof GameSim>;
type Mon = Sim['monsters'][number];
type Ply = ReturnType<Sim['addPlayer']>;
interface MonSysPriv {
  /** sid người chơi → id quái đang giữ ô cận chiến của người đó. */
  meleeSlot: Map<string, string>;
  resetAi(m: Mon): void;
  setMonState(m: Mon, st: number): void;
  setPhase(m: Mon, ph: number): void;
}

const TICK = 100;
/** Bỏ đuổi xong phải về tới nhà, đầy máu, đứng yên trong chừng này giây kể từ lúc người chơi bắt đầu chạy. */
const RETURN_MAX = 45;
/** Mỗi hướng của phép "tám hướng" phải ngã ngũ trong chừng này giây. */
const DIR_MAX = 16;
const DIR_DIST = 14;
let acc = 660000;

function makeSim(levelId: string): { sim: Sim; p: Ply; sys: MonSysPriv } {
  const lv = LV[levelId];
  if (!lv) throw new Error(`--levels: không có level ${levelId}`);
  const spawn = lv.spawn ?? { x: 1024, z: 1024 };
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId,
    roomName: 'leash',
    spawn,
    respawn: spawn,
    persistPosition: false,
  });
  const char = Character.create(acc++, 'l' + acc);
  char.level = 47;
  char.recalc();
  char.hp = char.mhp;
  const p = sim.addPlayer({ sessionId: 'l' + acc, send: () => undefined } as never, char, true, 's' + acc);
  p.god = true;
  return { sim, p, sys: (sim as unknown as { monSys: MonSysPriv }).monSys };
}

function put(sim: Sim, p: Ply, x: number, z: number): void {
  p.move.x = x;
  p.move.z = z;
  p.move.y = sim.terrain.groundAt(x, z);
}

/** Đưa quái về nhà như mới (giữa hai phép thử). */
function home(sim: Sim, sys: MonSysPriv, m: Mon): void {
  sys.resetAi(m);
  m.target = '';
  m.threat.clear();
  m.evadeUntil = 0;
  m.unreachableSince = 0;
  m.slideSince = 0;
  m.s.x = m.homeX;
  m.s.z = m.homeZ;
  m.s.y = sim.terrain.groundAt(m.homeX, m.homeZ);
  m.wx = m.homeX;
  m.wz = m.homeZ;
  m.s.hp = m.s.mhp;
  sys.setPhase(m, 0);
  sys.setMonState(m, MS_IDLE);
}

const step = (sim: Sim) => {
  fake += TICK;
  sim.tick(TICK);
};
const homeDist = (m: Mon) => Math.hypot(m.s.x - m.homeX, m.s.z - m.homeZ);
const fighting = (m: Mon) => m.state === MS_CHASE || m.state === MS_ATTACK;

interface RunOut {
  ok: boolean;
  why: string;
  /** Xa nhà nhất (m) và số giây từ lúc chạy tới lúc bỏ đuổi / tới lúc đứng yên ở nhà. */
  far: number;
  gaveAt: number;
  idleAt: number;
}

/** Kéo quái chạy ra xa nhà. `mul`: tốc độ người chơi so với 9 m/s (kéo chạy) hoặc so với tốc độ quái (dắt đi, `pace` = true). */
function runAway(sim: Sim, p: Ply, sys: MonSysPriv, m: Mon, pace: boolean): RunOut {
  home(sim, sys, m);
  // Hướng chạy: từ nhà quái ra phía người chơi đứng (đông), xa dần nhà.
  put(sim, p, m.homeX + 4, m.homeZ);
  sim.damageMonster(m, 1, p);
  for (let i = 0; i < 20 && !fighting(m); i++) step(sim);
  if (!fighting(m)) return { ok: false, why: 'không vào trận', far: 0, gaveAt: -1, idleAt: -1 };
  const speed = pace ? m.def.speed * 0.95 : 9;
  const limit = m.def.boss ? 80 : LEASH;
  let far = 0;
  let gaveAt = -1;
  let idleAt = -1;
  let x = p.move.x;
  for (let t = 0; t < RETURN_MAX * 1.6 * (1000 / TICK); t++) {
    // Người chơi chạy 14 giây (kéo chạy) hoặc tới khi quái bỏ (dắt đi, tối đa 40 giây), rồi đứng yên ở xa.
    const sec = (t * TICK) / 1000;
    if (gaveAt < 0 && sec < (pace ? 40 : 14)) {
      x += (speed * TICK) / 1000;
      put(sim, p, x, m.homeZ);
    }
    step(sim);
    far = Math.max(far, homeDist(m));
    if (gaveAt < 0 && !fighting(m)) gaveAt = sec;
    if (gaveAt >= 0 && m.state === MS_IDLE) {
      idleAt = sec;
      break;
    }
    if (m.state === MS_DEAD) return { ok: false, why: 'quái chết giữa phép thử', far, gaveAt, idleAt };
  }
  const out = { far, gaveAt, idleAt };
  if (gaveAt < 0) return { ok: false, why: `không bỏ đuổi (xa nhà ${far.toFixed(0)} m)`, ...out };
  if (far > limit + 12) return { ok: false, why: `bị kéo xa nhà ${far.toFixed(0)} m (tầm ${limit} m)`, ...out };
  if (idleAt < 0) return { ok: false, why: `bỏ đuổi rồi KHÔNG về tới nhà (còn cách ${homeDist(m).toFixed(0)} m, trạng thái ${m.state})`, ...out };
  if (idleAt > RETURN_MAX) return { ok: false, why: `về nhà chậm ${idleAt.toFixed(0)} s`, ...out };
  if (m.s.hp < m.s.mhp) return { ok: false, why: `về nhà chưa đầy máu (${m.s.hp}/${m.s.mhp})`, ...out };
  return { ok: true, why: '', ...out };
}

interface DirOut {
  reach: number;
  /** Đứng vòng ngoài chờ ô cận chiến (không bị vật cản giữ). */
  wait: number;
  evade: number;
  stuck: string[];
}

/** Tám hướng quanh nhà quái: tới được, bỏ đuổi đúng cách, hay kẹt. */
function eightWays(sim: Sim, p: Ply, sys: MonSysPriv, m: Mon): DirOut {
  const out: DirOut = { reach: 0, wait: 0, evade: 0, stuck: [] };
  for (let k = 0; k < 8; k++) {
    home(sim, sys, m);
    const a = (k / 8) * Math.PI * 2;
    put(sim, p, m.homeX + Math.sin(a) * DIR_DIST, m.homeZ + Math.cos(a) * DIR_DIST);
    sim.damageMonster(m, 1, p);
    const reach = m.def.attackRange + 0.4;
    // Quái đánh xa đứng ở tầm chú, không cần áp sát.
    const need = Math.max(reach, m.rules.ai.caster?.range ?? 0);
    let res: 'reach' | 'evade' | '' = '';
    for (let t = 0; t < DIR_MAX * (1000 / TICK) && !res; t++) {
      step(sim);
      const d = Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z);
      if (fighting(m) && d <= need + 0.3) res = 'reach';
      else if (!fighting(m)) res = m.evadeUntil > fake ? 'evade' : 'reach';
    }
    if (res === 'reach') out.reach++;
    else if (res === 'evade') out.evade++;
    // Không trượt quanh vật rắn trong 600 ms gần nhất, hoặc ô cận chiến đang do con khác giữ: quái chỉ đang chờ lượt ở vòng ngoài.
    else if (!m.slideSince || fake - m.slideLast > 600 || (sys.meleeSlot.get(p.sid) ?? m.id) !== m.id) out.wait++;
    else {
      const d = Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z);
      out.stuck.push(`hướng ${k * 45}°: sau ${DIR_MAX} s còn cách ${d.toFixed(1)} m, kẹt ở (${m.s.x.toFixed(0)}, ${m.s.z.toFixed(0)})`);
    }
  }
  return out;
}

const bad: string[] = [];
console.log('Phép thử quái bỏ đuổi và kẹt vật cản (sim server, đồng hồ giả). Cột: kéo chạy / dắt đi = giây tới lúc bỏ đuổi → giây về tới nhà (xa nhà nhất);');
console.log('tám hướng = số hướng tới được / đứng vòng ngoài chờ lượt / bị vật cản nên bỏ đuổi đúng cách / KẸT.');
for (const levelId of LEVELS) {
  const { sim, p, sys } = makeSim(levelId);
  const by = new Map<string, Mon[]>();
  for (const m of sim.monsters) {
    if (m.state === MS_DEAD || m.owner || m.minionOf) continue;
    if (ONLY && m.def.id !== ONLY) continue;
    by.set(m.def.id, [...(by.get(m.def.id) ?? []), m]);
  }
  console.log(`\n== ${levelId}: ${sim.monsters.length} quái, ${by.size} loại ==`);
  for (const [id, all] of by) {
    const pick = all.length <= PER ? all : Array.from({ length: PER }, (_, i) => all[Math.round((i * (all.length - 1)) / (PER - 1 || 1))]!);
    const errs: string[] = [];
    const cells = { a: [] as string[], b: [] as string[], reach: 0, wait: 0, evade: 0, stuck: 0 };
    for (const m of pick) {
      const at = `${id} tại (${m.homeX.toFixed(0)}, ${m.homeZ.toFixed(0)})`;
      const a = runAway(sim, p, sys, m, false);
      const b = runAway(sim, p, sys, m, true);
      const c = eightWays(sim, p, sys, m);
      home(sim, sys, m);
      cells.a.push(a.ok ? `${a.gaveAt.toFixed(0)}→${a.idleAt.toFixed(0)}s (${a.far.toFixed(0)}m)` : 'LỖI');
      cells.b.push(b.ok ? `${b.gaveAt.toFixed(0)}→${b.idleAt.toFixed(0)}s (${b.far.toFixed(0)}m)` : 'LỖI');
      cells.reach += c.reach;
      cells.wait += c.wait;
      cells.evade += c.evade;
      cells.stuck += c.stuck.length;
      if (!a.ok) errs.push(`${at} kéo chạy: ${a.why}`);
      if (!b.ok) errs.push(`${at} dắt đi: ${b.why}`);
      for (const s of c.stuck) errs.push(`${at} ${s}`);
    }
    const flag = errs.length ? '!' : ' ';
    console.log(
      `${flag} ${id.padEnd(30)} ×${String(pick.length).padEnd(2)} kéo chạy ${cells.a.join(', ').padEnd(46)} dắt đi ${cells.b.join(', ').padEnd(46)} tám hướng ${cells.reach}/${cells.wait}/${cells.evade}/${cells.stuck}`,
    );
    if (errs.length && VERBOSE) for (const e of errs) console.log('      ' + e);
    bad.push(...errs.map((e) => `${levelId}: ${e}`));
  }
}
if (bad.length) console.log(`\nLỗi (${bad.length}):\n  ` + bad.join('\n  '));
else console.log('\nKhông có lỗi.');
process.exit(STRICT && bad.length ? 1 : 0);
