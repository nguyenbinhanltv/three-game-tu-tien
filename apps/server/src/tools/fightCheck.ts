// Đánh thử trong sim server thật (đồng hồ giả, không mạng): người chơi đứng yên, xoay vòng chiêu, đánh `PULL` quái hợp cấp cùng lúc.
// Đối chiếu số trong `pnpm sim:progress` (TTK và máu mất mỗi lần giết) với luật thật của server (khắc chế, nội tại công pháp, quái, khiên).
// Chạy: pnpm --filter @dtl/server fight:check [--runs 6] [--levels 4,10,15,20,28] [--pull 2] [--nogear] [--tier 6] [--mon <id>]
//   Quái chọn từ điểm sinh của MỌI level (E1-G): bãi quái thường có khoảng cấp gần cấp thử nhất. Cấp thử ngoài mọi khoảng cấp của quái hiện có
//   (Trúc Cơ trở lên khi chưa có bản đồ mở rộng) thì dùng quái gần nhất với cấp quái = cấp thử, đánh dấu `*` (ngoại suy theo hệ số cảnh giới).
//   --strict: thoát mã 1 nếu TTK trung bình ngoài 3,5–8,5 s (ngưỡng của sim:progress) hoặc có ca chết.
//   --mon <id>: ép dùng một quái thường (cấp quái = cấp thử), để đo quái mới khi đã có dữ liệu.
//   --target <id[:cấp]>: đo MỘT quái bất kỳ (tinh anh/boss/quái phó bản) đơn lẻ ở cấp quái cho trước (mặc định = cấp thử), --pull bị bỏ qua.
//   --god: người chơi không chết (đo TTK hạ boss thuần theo sát thương; không có --god thì "TTK" của ca chết là giờ cả nhóm bị diệt).
//   --party <n>: n người cùng đánh một mục tiêu (phó bản 4 người); TTK là thời gian cả nhóm hạ mục tiêu, máu mất tính trung bình mỗi người.
//   --elites: BẢNG TINH ANH (bàn cân bằng V2e): mọi tinh anh có điểm sinh, ở cấp cao nhất của bãi, đánh đơn với --god, cho cả 9 hướng tu;
//     in thời gian hạ theo luật thật của server, đánh dấu `!` ô ngoài 18–40 s, và (chặng Ngưng Khí, nơi mô hình trang bị của sim khớp)
//     dòng "sim" là số của `pnpm sim:progress` cho mục tiêu đơn. Kèm --strict thì thoát mã 1 khi có ô ngoài khoảng.
//   --dps [giây]: BẢNG SÁT THƯƠNG MỖI GIÂY trên hình nộm (bàn cân bằng V2e): mỗi cấp × hướng tu đánh một quái thường hợp cấp bị khóa máu
//     và hồi đầy mỗi nhịp trong chừng đó giây (mặc định 60), quái vẫn đánh lại (để hướng tích tài nguyên khi bị đánh có tài nguyên), bot bất tử.
//     Số lấy từ đồng hồ `/gm dps` của server. In kèm tỉ lệ so với trung vị của cấp đó; "!" = lệch quá ±35%.
//   Cấp thử từ 32 trở lên mặc bộ 7 ô bậc 5 phẩm Huyền theo ilvl = cấp; `--tier 6` mặc bộ bậc 6 (mốc mặc trọn; người chơi thật pha dần, xem `CH6_GEAR_FRAC` ở sim.ts). Ở cấp 43 với `--tier 6`: Kiếm tu 3,0 s, còn lại 3,1–5,8 s.
process.env.DB_FILE = ':memory:';

import {
  CHARGE_MAX,
  droppableSlots,
  groundAt,
  ANH_BIEN_LEVEL,
  HOA_THAN_LEVEL,
  rollItemInstance,
  seededRng,
  templatesFor,
  METHOD_UNLOCK_LEVEL,
  MS_DEAD,
  levelSpawns,
  skillGate,
  stanceActive,
  starEnough,
  sanitizeStars,
  COTHAN_METHOD,
  type MonsterDef,
} from '@dtl/shared';

import { at } from '@dtl/shared';
const arg = (name: string, def: string) => {
  const i = process.argv.indexOf('--' + name);
  return (i >= 0 ? process.argv[i + 1] : undefined) || def;
};
const RUNS = Number(arg('runs', '6'));
const LEVELS = arg('levels', '4,10,15,20,28').split(',').map(Number);
const FORCE_MON = arg('mon', '');
let TARGET = arg('target', '');
const PARTY = Number(arg('party', '1'));
const PULL = Number(arg('pull', '2'));
const NOGEAR = process.argv.includes('--nogear');
/** `--god`: người chơi không chết (hồi đầy máu mỗi nhịp), để đo thời gian hạ mục tiêu thuần theo sát thương (boss mà bot đứng yên bị đánh chết trước khi hạ được). */
let GOD = process.argv.includes('--god');
/** `--dps [giây]`: > 0 thì `fightOnce` đánh hình nộm khóa máu trong chừng đó giây và trả sát thương mỗi giây ở trường `ttk`. */
let DUMMY_SECS = 0;
/** `--nostance`: bot không vào tư thế (đo riêng phần đóng góp của tư thế, VS-2e). */
const NOSTANCE = process.argv.includes('--nostance');

let fake = Date.now();
Date.now = () => fake;

const { GameSim } = await import('../game/sim');
const { WorldState } = await import('../state');
const { Character } = await import('../game/character');
const { grantPathOf } = await import('../game/method');
const { labMeter } = await import('../game/gm/meter');
const { ITEM, ITEMS, ITEM_SYS, LEVELS: LV, METHOD, MONSTER, SKILL, SKILLS, METHOD_SKILLS, METHODS, STARS } = await import('@dtl/content');
const { MAX_LEVEL } = await import('@dtl/shared');
for (const lv of LEVELS) if (!(lv >= 1 && lv <= MAX_LEVEL)) throw new Error(`--levels: cấp ${lv} ngoài 1–${MAX_LEVEL}`);
if (FORCE_MON && (!MONSTER.get(FORCE_MON) || MONSTER.get(FORCE_MON)!.boss || MONSTER.get(FORCE_MON)!.elite))
  throw new Error(`--mon: ${FORCE_MON} không phải quái thường`);
type Sim = InstanceType<typeof GameSim>;

const X = 2040;
const Z = 2040;
let acc = 9000;

/** Trang bị dự kiến theo cấp (cùng quy tắc `gear()` của sim.ts: phần thưởng nhiệm vụ). */
function gearFor(level: number): Record<string, string> {
  const pick = (ids: string[]) => {
    let best = '';
    for (const id of ids) {
      const d = ITEM.get(id);
      if (d && (d.reqLevel ?? 1) <= level) best = id;
    }
    return best;
  };
  const g: Record<string, string> = {
    weapon: pick(['itm_moc_kiem', 'itm_thiet_kiem', 'itm_thanh_phong_kiem']),
    robe: pick(['itm_bo_y', 'itm_dao_bao', 'itm_linh_ti_bao']),
  };
  // Chương 2 (E2-J): đồ bậc 2 về dần (rơi từ quái/tinh anh/phó bản, chế ở Hứa lão): cấp 17 kiếm, 18 thêm đạo bào, 19 thêm hộ uyển.
  if (level >= 17) g.weapon = 'itm_liet_mach_kiem';
  if (level >= 18) g.robe = 'itm_mach_van_dao_bao';
  if (level >= 19) g.bracer = 'itm_sa_thach_ho_uyen';
  return g;
}

/** `--tier 6`: đo với bộ bậc 6 (reqLevel Anh Biến) thay cho bộ bậc 5 từ cấp 32 (người chơi thật pha dần, đây là mốc mặc trọn bậc 6). */
const GEAR_REQ =
  process.argv.includes('--tier') && process.argv[process.argv.indexOf('--tier') + 1] === '6' ? ANH_BIEN_LEVEL : HOA_THAN_LEVEL;

/** Bộ bậc 5 (hoặc 6 với `--tier 6`) cho cấp ≥ 32: mỗi ô thường phẩm Huyền, ilvl = cấp; roll tất định theo cấp. */
function tier5Gear(level: number): Record<string, { id: string; n: number; inst: ReturnType<typeof rollItemInstance> }> {
  const rng = seededRng(2000 + level);
  const out: Record<string, { id: string; n: number; inst: ReturnType<typeof rollItemInstance> }> = {};
  for (const sl of droppableSlots(ITEM_SYS, ITEMS)) {
    const tpl = at(templatesFor(ITEMS, sl, GEAR_REQ), 0);
    out[sl] = { id: tpl.id, n: 1, inst: rollItemInstance(ITEM_SYS, sl, level, 1, rng, tpl.tier) };
  }
  return out;
}

/** Quái thường hợp cấp: bãi gần cấp nhất trong mọi level (cùng cách chọn của sim.ts). `extra`: cấp quái ngoại suy vì cấp thử vượt mọi bãi hiện có. */
function pickMon(level: number): { def: MonsterDef; mlv: number; extra: boolean } {
  if (FORCE_MON) return { def: MONSTER.get(FORCE_MON)!, mlv: level, extra: true };
  const sp = at(
    Object.values(LV)
      .flatMap((l) => levelSpawns(l))
      .filter((s) => !MONSTER.get(s.mon)?.boss && !MONSTER.get(s.mon)?.elite)
      .sort((a, b) => Math.abs((a.levelMin + a.levelMax) / 2 - level) - Math.abs((b.levelMin + b.levelMax) / 2 - level)),
    0,
  );
  // Ngoài khoảng cấp cao nhất của mọi quái hiện có: ngoại suy cấp quái = cấp thử; còn lại kẹp vào khoảng cấp của bãi.
  const top = Math.max(
    ...Object.values(LV)
      .flatMap((l) => levelSpawns(l))
      .filter((s) => !MONSTER.get(s.mon)?.boss && !MONSTER.get(s.mon)?.elite)
      .map((s) => s.levelMax),
  );
  const extra = level > top;
  return { def: MONSTER.get(sp.mon)!, mlv: extra ? level : Math.min(sp.levelMax, Math.max(sp.levelMin, level)), extra };
}

/** `--target id[:cấp]`: một quái bất kỳ; không có thì quái thường hợp cấp (`pickMon`). */
function pickTarget(level: number): { def: MonsterDef; mlv: number; extra: boolean } {
  if (!TARGET) return pickMon(level);
  const [id, lv] = TARGET.split(':');
  const def = MONSTER.get(id!);
  if (!def) throw new Error(`--target: không có quái ${id}`);
  return { def, mlv: lv ? Number(lv) : level, extra: false };
}

interface Result {
  ttk: number;
  lost: number;
  dead: boolean;
}

function fightOnce(level: number, method: string | undefined): Result {
  const host = { broadcast: () => undefined };
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'fight',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const mdef = method ? METHOD.get(method) : undefined;
  const party = Array.from({ length: PARTY }, (_, k) => {
    const char = Character.create(acc++, 'f' + acc);
    char.level = level;
    char.root = 'tho';
    if (method && level >= METHOD_UNLOCK_LEVEL) {
      char.meta.method = method;
      // TN-2: hướng phải lĩnh ngộ (Hồn tu) coi như đã lĩnh ngộ, chỉ từ cảnh giới mở.
      grantPathOf(char.meta);
    }
    const eq = NOGEAR ? {} : level >= 32 ? tier5Gear(level) : gearFor(level);
    for (const [slot, it] of Object.entries(eq)) {
      if (typeof it === 'string') {
        if (it) (char.equip as Record<string, unknown>)[slot] = { id: it, n: 1 };
      } else (char.equip as Record<string, unknown>)[slot] = it;
    }
    // VS-2d: chọn nhánh đầu tiên ở mỗi mốc đã đủ cảnh giới (chỉ sửa bộ nhớ của nhân vật thử), rồi chỉ dùng chiêu nhánh đó cho.
    if (mdef && level >= METHOD_UNLOCK_LEVEL) {
      const picks: Record<number, string> = {};
      for (const b of mdef.branches) if (level >= b.tier && !picks[b.tier]) picks[b.tier] = b.id;
      char.branches[mdef.id] = picks;
    }
    // Sao Cổ Thần: người chơi tới cấp nào coi như đã rèn mọi sao mở ở cấp đó (thang ở stars.json).
    if (method === COTHAN_METHOD) char.meta.stars = STARS.stars.filter((st) => st.level <= level).length;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const sid = 's' + acc + '_' + k;
    const p = sim.addPlayer({ sessionId: sid, send: () => undefined } as never, char, true, sid);
    p.move.x = X - k;
    p.move.z = Z + k;
    p.move.y = groundAt(X, Z);
    return { char, p, hp0: char.hp };
  });
  const { def, mlv } = pickTarget(level);
  const count = TARGET ? 1 : PULL;
  const mons = Array.from({ length: count }, (_, i) => sim.spawnMonster(def, mlv, X + 4 + i, Z + i, null));
  const usable = [...SKILLS, ...METHOD_SKILLS].filter(
    (s) =>
      s.unlock <= level &&
      (!s.method || s.method === method) &&
      skillGate(mdef, mdef ? party[0]!.char.branches[mdef.id] : undefined, s.id) === 'ok' &&
      // Chiêu cần sao Cổ Thần mà chưa đủ sao: server từ chối và không đặt hồi chiêu, bot sẽ bấm mãi chiêu đó thay cho đòn thường
      // (trước bản sửa 28/11: Cổ Thần cấp 21+ chạm trần 600 s với mọi tinh anh vì Tinh Bạo cần 3 sao).
      starEnough(sanitizeStars(party[0]!.char.meta.stars), s.star),
  );
  // VS-2e: chiêu tư thế và các chiêu thay ô chỉ dùng trong tư thế (xem vòng lặp).
  const stance = NOSTANCE ? undefined : usable.find((s) => s.kind === 'stance' && s.stance);
  const skills = usable.filter((s) => s.kind !== 'stance' && !s.stanceOf);
  const hpAll = mons.reduce((n, m) => n + m.s.hp, 0);
  const t0 = fake;
  const lead = party[0]!.p;
  if (DUMMY_SECS) {
    sim.gmSys.run(lead, ['lockhp', 'on']);
    labMeter.start(lead, fake);
  }
  const avgLost = () => party.reduce((n, a) => n + (a.hp0 - Math.max(0, a.char.hp)) / a.char.mhp, 0) / party.length;
  const MAX_STEPS = TARGET ? 6000 : 1200;
  for (let step = 0; step < (DUMMY_SECS ? DUMMY_SECS * 10 : MAX_STEPS) && mons.some((m) => m.state !== MS_DEAD); step++) {
    fake += 100;
    sim.tick(100);
    // Hình nộm: hồi đầy mỗi nhịp (bot luôn thấy "trận còn dài" nên dùng cả tư thế).
    if (DUMMY_SECS) for (const m of mons) m.s.hp = m.s.mhp;
    if (GOD) for (const a of party) a.char.hp = a.char.mhp;
    if (party.every((a) => a.char.hp <= 0)) return { ttk: (fake - t0) / 1000, lost: 1, dead: true };
    const target = mons.find((m) => m.state !== MS_DEAD);
    if (!target) break;
    for (const { char, p } of party) {
      if (char.hp <= 0) continue;
      if (p.casting || p.flow.pending || fake < p.gcdAt) continue;
      // Ưu tiên: hồi/khiên khi máu thấp, chiêu tối thượng khi đầy sạc, chiêu có hồi chiêu, đánh thường.
      const ready = (s: (typeof skills)[number]) => (p.cds.get(s.id) ?? 0) <= fake && char.mp >= s.mp && !s.dash;
      const low = char.hp < char.mhp * 0.6;
      const order = [
        ...skills.filter((s) => low && (s.kind === 'shield' || s.kind === 'heal' || s.kind === 'hot')),
        ...skills.filter((s) => s.ult && p.mth.charge >= CHARGE_MAX && s.kind !== 'revive' && s.kind !== 'guard'),
        // Chiêu `line` (chiêu nhánh VS-2d như Hoành Kiếm Phá Mạch) cũng là chiêu đánh: quái đứng trước mặt nên luôn trúng.
        ...skills.filter(
          (s) => s.cd > 0 && (s.kind === 'damage' || s.kind === 'aoe' || s.kind === 'line' || s.kind === 'taunt' || s.kind === 'hot'),
        ),
        SKILL.get('skl_phi_kiem')!,
      ];
      // Dồn chiêu có hồi chiêu trước, hết rồi mới vào tư thế (thay cho đánh thường); đang giữ tư thế thì ô bị đổi dùng chiêu tư thế.
      // (Vào tư thế ngay đầu trận tốn một nhịp GCD và đổi chiêu mở màn sang bản trận hệ số thấp hơn.)
      const inStance = stanceActive(p.mth.stance, fake) && stance?.id === p.mth.stance.id;
      const burstReady = order.some((x) => x.cd > 0 && ready(x));
      // Tư thế hồi 45 giây: chỉ đáng bật khi trận còn dài (quái còn hơn nửa tổng máu), không bật để dứt điểm con sắp chết.
      const hpLeft = mons.reduce((n, m) => n + (m.state === MS_DEAD ? 0 : m.s.hp), 0);
      const longFight = hpLeft > hpAll * 0.5;
      if (stance && !inStance && !burstReady && longFight && ready(stance)) {
        sim.onSkill(p, { id: stance.id });
        continue;
      }
      const swap = inStance ? stance.stance!.swap : {};
      const live = (x: (typeof skills)[number]) => (swap[x.id] ? (SKILL.get(swap[x.id]!) ?? x) : x);
      const s = order.map(live).find((x) => ready(x));
      if (s) sim.onSkill(p, { id: s.id, t: target.id });
    }
  }
  void METHODS;
  if (DUMMY_SECS) {
    const total = labMeter.report(lead)?.total ?? 0;
    labMeter.stop(lead);
    return { ttk: total / DUMMY_SECS, lost: avgLost(), dead: false };
  }
  return { ttk: (fake - t0) / 1000 / count, lost: avgLost() / count, dead: false };
}

const STRICT = process.argv.includes('--strict');
if (process.argv.includes('--elites')) {
  const { playerDps, playerM } = await import('@dtl/content/sim-model');
  const { monsterStats } = await import('@dtl/shared');
  type SimMethod = Parameters<typeof playerDps>[3];
  /** Khoảng thời gian hạ tinh anh của `sim:progress` (chương 2 trở đi; Vân Lam không đồ là 20–40 s). */
  const LO = 18;
  const HI = 40;
  /** Mô hình trang bị của sim (`player()`: đồ thưởng nhiệm vụ) chỉ phủ chặng Ngưng Khí. */
  const SIM_MAX_LEVEL = 16;
  GOD = true;
  const seen = new Set<string>();
  const rows: { def: MonsterDef; lv: number; map: string }[] = [];
  for (const l of Object.values(LV))
    for (const sp of levelSpawns(l)) {
      const def = MONSTER.get(sp.mon);
      if (!def?.elite || seen.has(def.id)) continue;
      seen.add(def.id);
      rows.push({ def, lv: sp.levelMax, map: l.id });
    }
  rows.sort((a, b) => a.lv - b.lv);
  console.log(`Tinh anh, đánh đơn theo luật server (bot đứng yên xoay vòng chiêu, bất tử, ${RUNS} lần mỗi ô). Khoảng mong muốn ${LO}–${HI} s; "!" = ngoài khoảng.`);
  console.log('Cột: ' + METHODS.map((m, i) => `${i + 1}=${m.id}`).join('  '));
  const bad: string[] = [];
  const cell = (x: number, flag: boolean) => (x.toFixed(0) + (flag ? '!' : ' ')).padStart(5);
  for (const r of rows) {
    TARGET = `${r.def.id}:${r.lv}`;
    const real = METHODS.map((m) => {
      const rs = Array.from({ length: RUNS }, () => fightOnce(r.lv, m.id));
      return rs.reduce((n, x) => n + x.ttk, 0) / rs.length;
    });
    real.forEach((x, i) => {
      if (x < LO || x > HI) bad.push(`${r.def.id} (${r.lv}) ${METHODS[i]!.id}: ${x.toFixed(0)} s`);
    });
    console.log(`${(r.def.id + ' (' + r.lv + ', ' + r.map + ')').padEnd(44)} thật ${real.map((x) => cell(x, x < LO || x > HI)).join('')}`);
    if (r.lv <= SIM_MAX_LEVEL) {
      const ms = monsterStats(r.lv, r.def.hpMul, r.def.atkMul);
      const sim = METHODS.map((m) => ms.hp / playerDps(r.lv, playerM(r.lv, m.id as SimMethod).atk, ms.def, m.id as SimMethod, r.def.elem, 'avg', 0));
      console.log(`${''.padEnd(44)} sim  ${sim.map((x) => cell(x, false)).join('')}`);
    }
  }
  if (bad.length) console.log(`\nNgoài khoảng ${LO}–${HI} s (${bad.length} ô):\n  ` + bad.join('\n  '));
  process.exit(STRICT && bad.length ? 1 : 0);
}

if (process.argv.includes('--dps')) {
  const secs = Number(arg('dps', '60'));
  DUMMY_SECS = Number.isFinite(secs) && secs >= 5 ? Math.min(600, secs) : 60;
  GOD = true;
  const levels = process.argv.includes('--levels') ? LEVELS : [10, 15, 19, 23, 27, 31, 36, 40, 44, 47];
  const OFF = 0.35;
  console.log(`Sát thương mỗi giây trên hình nộm (quái thường hợp cấp, khóa máu, ${DUMMY_SECS} s, ${RUNS} lần mỗi ô). Dòng hai: tỉ lệ so với trung vị của cấp; "!" = lệch quá ±${OFF * 100}%.`);
  console.log('Cột: ' + METHODS.map((m, i) => `${i + 1}=${m.id}`).join('  '));
  const bad: string[] = [];
  for (const lv of levels) {
    const { def, mlv } = pickMon(lv);
    TARGET = `${def.id}:${mlv}`;
    const dps = METHODS.map((m) => {
      const rs = Array.from({ length: RUNS }, () => fightOnce(lv, lv >= METHOD_UNLOCK_LEVEL ? m.id : undefined));
      return rs.reduce((n, x) => n + x.ttk, 0) / rs.length;
    });
    const sorted = [...dps].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)]!;
    console.log(`cấp ${String(lv).padStart(2)} ${(def.id + ' (' + mlv + ')').padEnd(30)} ${dps.map((x) => x.toFixed(0).padStart(7)).join('')}`);
    console.log(
      `${''.padEnd(37)} ${dps
        .map((x, i) => {
          const r = x / med;
          const off = Math.abs(r - 1) > OFF;
          if (off) bad.push(`cấp ${lv} ${METHODS[i]!.id}: ${r.toFixed(2)} lần trung vị`);
          return (r.toFixed(2) + (off ? '!' : ' ')).padStart(7);
        })
        .join('')}`,
    );
  }
  if (bad.length) console.log(`\nLệch quá ±${OFF * 100}% so với trung vị (${bad.length} ô):\n  ` + bad.join('\n  '));
  process.exit(STRICT && bad.length ? 1 : 0);
}

console.log(`Đánh thử trong sim server (đứng yên, kéo ${PULL} quái, ${RUNS} lần mỗi ô; TTK và máu mất tính trên mỗi con):`);
console.log('cấp   quái                     công pháp     TTK     mất/con   chết');
const bad: string[] = [];
for (const lv of LEVELS) {
  for (const m of [undefined, ...METHODS.map((x) => x.id)]) {
    if (!m && lv >= METHOD_UNLOCK_LEVEL) continue;
    const rs = Array.from({ length: RUNS }, () => fightOnce(lv, m));
    const avg = (f: (r: Result) => number) => rs.reduce((n, r) => n + f(r), 0) / rs.length;
    const { def, mlv, extra } = pickTarget(lv);
    const ttk = avg((r) => r.ttk);
    const deaths = rs.filter((r) => r.dead).length;
    if ((!TARGET && (ttk < 3.5 || ttk > 8.5)) || deaths)
      bad.push(`cấp ${lv} ${m ?? 'không'}: TTK ${ttk.toFixed(1)} s, chết ${deaths}/${RUNS}`);
    console.log(
      `${String(lv).padStart(3)}   ${(def.id + ' (' + mlv + (extra ? '*' : '') + ')').padEnd(24)} ${(m ?? 'không').padEnd(18)} ${avg(
        (r) => r.ttk,
      )
        .toFixed(1)
        .padStart(4)}s  ${(avg((r) => r.lost) * 100).toFixed(0).padStart(5)}%   ${rs.filter((r) => r.dead).length}/${RUNS}`,
    );
  }
}
if (bad.length) console.log('\nNgoài khoảng (TTK 3,5–8,5 s, không chết):\n  ' + bad.join('\n  '));
process.exit(STRICT && bad.length ? 1 : 0);
