// Đánh thử trong sim server thật (đồng hồ giả, không mạng): người chơi đứng yên, xoay vòng chiêu, đánh `PULL` quái hợp cấp cùng lúc.
// Đối chiếu số trong `pnpm sim:progress` (TTK và máu mất mỗi lần giết) với luật thật của server (khắc chế, nội tại công pháp, quái, khiên).
// Chạy: pnpm --filter @dtl/server fight:check [--runs 6] [--levels 4,10,15,20,28] [--pull 2] [--nogear] [--mon <id>]
//   Quái chọn từ điểm sinh của MỌI level (E1-G): bãi quái thường có khoảng cấp gần cấp thử nhất. Cấp thử ngoài mọi khoảng cấp của quái hiện có
//   (Trúc Cơ trở lên khi chưa có bản đồ mở rộng) thì dùng quái gần nhất với cấp quái = cấp thử, đánh dấu `*` (ngoại suy theo hệ số cảnh giới).
//   --strict: thoát mã 1 nếu TTK trung bình ngoài 3,5–8,5 s (ngưỡng của sim:progress) hoặc có ca chết.
//   --mon <id>: ép dùng một quái thường (cấp quái = cấp thử), để đo quái mới khi đã có dữ liệu.
process.env.DB_FILE = ':memory:';

import { CHARGE_MAX, groundAt, METHOD_UNLOCK_LEVEL, MS_DEAD, levelSpawns, skillGate, stanceActive, type MonsterDef } from '@dtl/shared';

import { at } from '@dtl/shared';
const arg = (name: string, def: string) => {
  const i = process.argv.indexOf('--' + name);
  return (i >= 0 ? process.argv[i + 1] : undefined) || def;
};
const RUNS = Number(arg('runs', '6'));
const LEVELS = arg('levels', '4,10,15,20,28').split(',').map(Number);
const FORCE_MON = arg('mon', '');
const PULL = Number(arg('pull', '2'));
const NOGEAR = process.argv.includes('--nogear');
/** `--nostance`: bot không vào tư thế (đo riêng phần đóng góp của tư thế, VS-2e). */
const NOSTANCE = process.argv.includes('--nostance');

let fake = Date.now();
Date.now = () => fake;

const { GameSim } = await import('../game/sim');
const { WorldState } = await import('../state');
const { Character } = await import('../game/character');
const { grantPathOf } = await import('../game/method');
const { ITEM, LEVELS: LV, METHOD, MONSTER, SKILL, SKILLS, METHOD_SKILLS, METHODS } = await import('@dtl/content');
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
  const char = Character.create(acc++, 'f' + acc);
  char.level = level;
  char.root = 'tho';
  if (method && level >= METHOD_UNLOCK_LEVEL) {
    char.meta.method = method;
    // TN-2: hướng phải lĩnh ngộ (Hồn tu) coi như đã lĩnh ngộ, chỉ từ cảnh giới mở.
    grantPathOf(char.meta);
  }
  for (const [slot, id] of Object.entries(NOGEAR ? {} : gearFor(level)))
    if (id) (char.equip as Record<string, unknown>)[slot] = { id, n: 1 };
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  const p = sim.addPlayer({ sessionId: 's' + acc, send: () => undefined } as never, char, true, 's' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  const { def, mlv } = pickMon(level);
  const mons = Array.from({ length: PULL }, (_, i) => {
    const m = sim.spawnMonster(def, mlv, X + 4 + i, Z + i, null);
    return m;
  });
  // VS-2d: chọn nhánh đầu tiên ở mỗi mốc đã đủ cảnh giới (chỉ sửa bộ nhớ của nhân vật thử), rồi chỉ dùng chiêu nhánh đó cho.
  const mdef = method ? METHOD.get(method) : undefined;
  if (mdef && level >= METHOD_UNLOCK_LEVEL) {
    const picks: Record<number, string> = {};
    for (const b of mdef.branches) if (level >= b.tier && !picks[b.tier]) picks[b.tier] = b.id;
    char.branches[mdef.id] = picks;
  }
  const usable = [...SKILLS, ...METHOD_SKILLS].filter(
    (s) =>
      s.unlock <= level && (!s.method || s.method === method) && skillGate(mdef, mdef ? char.branches[mdef.id] : undefined, s.id) === 'ok',
  );
  // VS-2e: chiêu tư thế và các chiêu thay ô chỉ dùng trong tư thế (xem vòng lặp).
  const stance = NOSTANCE ? undefined : usable.find((s) => s.kind === 'stance' && s.stance);
  const skills = usable.filter((s) => s.kind !== 'stance' && !s.stanceOf);
  const hp0 = char.hp;
  const t0 = fake;
  for (let step = 0; step < 1200 && mons.some((m) => m.state !== MS_DEAD); step++) {
    fake += 100;
    sim.tick(100);
    if (char.hp <= 0) return { ttk: (fake - t0) / 1000, lost: 1, dead: true };
    const target = mons.find((m) => m.state !== MS_DEAD);
    if (!target) break;
    if (p.casting || p.flow.pending || fake < p.gcdAt) continue;
    // Ưu tiên: hồi/khiên khi máu thấp, chiêu tối thượng khi đầy sạc, chiêu có hồi chiêu, đánh thường.
    const ready = (s: (typeof skills)[number]) => (p.cds.get(s.id) ?? 0) <= fake && char.mp >= s.mp && !s.dash;
    const low = char.hp < char.mhp * 0.6;
    const order = [
      ...skills.filter((s) => low && (s.kind === 'shield' || s.kind === 'heal' || s.kind === 'hot')),
      ...skills.filter((s) => s.ult && p.mth.charge >= CHARGE_MAX && s.kind !== 'revive' && s.kind !== 'guard'),
      ...skills.filter((s) => s.cd > 0 && (s.kind === 'damage' || s.kind === 'aoe' || s.kind === 'taunt' || s.kind === 'hot')),
      SKILL.get('skl_phi_kiem')!,
    ];
    // Vào tư thế ngay khi dùng được; đang giữ tư thế thì ô bị đổi dùng chiêu tư thế.
    const inStance = stanceActive(p.mth.stance, fake) && stance?.id === p.mth.stance.id;
    if (stance && !inStance && ready(stance)) {
      sim.onSkill(p, { id: stance.id });
      continue;
    }
    const swap = inStance ? stance.stance!.swap : {};
    const live = (x: (typeof skills)[number]) => (swap[x.id] ? (SKILL.get(swap[x.id]!) ?? x) : x);
    const s = order.map(live).find((x) => ready(x));
    if (s) sim.onSkill(p, { id: s.id, t: target.id });
  }
  void METHODS;
  return { ttk: (fake - t0) / 1000 / PULL, lost: (hp0 - Math.max(0, char.hp)) / char.mhp / PULL, dead: false };
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
    const { def, mlv, extra } = pickMon(lv);
    const ttk = avg((r) => r.ttk);
    const deaths = rs.filter((r) => r.dead).length;
    if (ttk < 3.5 || ttk > 8.5 || deaths) bad.push(`cấp ${lv} ${m ?? 'không'}: TTK ${ttk.toFixed(1)} s, chết ${deaths}/${RUNS}`);
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
