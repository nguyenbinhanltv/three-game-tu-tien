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
const TARGET = arg('target', '');
const PARTY = Number(arg('party', '1'));
const PULL = Number(arg('pull', '2'));
const NOGEAR = process.argv.includes('--nogear');
/** `--god`: người chơi không chết (hồi đầy máu mỗi nhịp), để đo thời gian hạ mục tiêu thuần theo sát thương (boss mà bot đứng yên bị đánh chết trước khi hạ được). */
const GOD = process.argv.includes('--god');
/** `--nostance`: bot không vào tư thế (đo riêng phần đóng góp của tư thế, VS-2e). */
const NOSTANCE = process.argv.includes('--nostance');

let fake = Date.now();
Date.now = () => fake;

const { GameSim } = await import('../game/sim');
const { WorldState } = await import('../state');
const { Character } = await import('../game/character');
const { grantPathOf } = await import('../game/method');
const { ITEM, ITEMS, ITEM_SYS, LEVELS: LV, METHOD, MONSTER, SKILL, SKILLS, METHOD_SKILLS, METHODS } = await import('@dtl/content');
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
      skillGate(mdef, mdef ? party[0]!.char.branches[mdef.id] : undefined, s.id) === 'ok',
  );
  // VS-2e: chiêu tư thế và các chiêu thay ô chỉ dùng trong tư thế (xem vòng lặp).
  const stance = NOSTANCE ? undefined : usable.find((s) => s.kind === 'stance' && s.stance);
  const skills = usable.filter((s) => s.kind !== 'stance' && !s.stanceOf);
  const hpAll = mons.reduce((n, m) => n + m.s.hp, 0);
  const t0 = fake;
  const avgLost = () => party.reduce((n, a) => n + (a.hp0 - Math.max(0, a.char.hp)) / a.char.mhp, 0) / party.length;
  const MAX_STEPS = TARGET ? 6000 : 1200;
  for (let step = 0; step < MAX_STEPS && mons.some((m) => m.state !== MS_DEAD); step++) {
    fake += 100;
    sim.tick(100);
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
  return { ttk: (fake - t0) / 1000 / count, lost: avgLost() / count, dead: false };
}

console.log(`Đánh thử trong sim server (đứng yên, kéo ${PULL} quái, ${RUNS} lần mỗi ô; TTK và máu mất tính trên mỗi con):`);
console.log('cấp   quái                     công pháp     TTK     mất/con   chết');
const STRICT = process.argv.includes('--strict');
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
