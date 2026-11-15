// Đánh thử trong sim server thật (đồng hồ giả, không mạng): người chơi đứng yên, xoay vòng chiêu, đánh `PULL` quái hợp cấp cùng lúc.
// Đối chiếu số trong `pnpm sim:progress` (TTK và máu mất mỗi lần giết) với luật thật của server (khắc chế, nội tại công pháp, quái, khiên).
// Chạy: pnpm --filter @dtl/server fight:check [--runs 6] [--levels 4,10,15]
process.env.DB_FILE = ':memory:';

import { CHARGE_MAX, groundAt, METHOD_UNLOCK_LEVEL, MS_DEAD, levelSpawns, type MonsterDef } from '@dtl/shared';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const RUNS = Number(arg('runs', '6'));
const LEVELS = arg('levels', '4,10,15').split(',').map(Number);
const PULL = Number(arg('pull', '2'));
const NOGEAR = process.argv.includes('--nogear');

let fake = Date.now();
Date.now = () => fake;

const { GameSim } = await import('../game/sim');
const { WorldState } = await import('../state');
const { Character } = await import('../game/character');
const { ITEM, LEVELS: LV, MONSTER, SKILL, SKILLS, METHOD_SKILLS, METHODS } = await import('@dtl/content');
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
  return { weapon: pick(['itm_moc_kiem', 'itm_thiet_kiem', 'itm_thanh_phong_kiem']), robe: pick(['itm_bo_y', 'itm_dao_bao', 'itm_linh_ti_bao']) };
}

/** Quái thường hợp cấp: bãi gần cấp nhất (cùng cách chọn của sim.ts). */
function pickMon(level: number): { def: MonsterDef; mlv: number } {
  const sp = levelSpawns(LV.van_lam)
    .filter((s) => !MONSTER.get(s.mon)?.boss && !MONSTER.get(s.mon)?.elite)
    .sort((a, b) => Math.abs((a.levelMin + a.levelMax) / 2 - level) - Math.abs((b.levelMin + b.levelMax) / 2 - level))[0];
  return { def: MONSTER.get(sp.mon)!, mlv: Math.min(sp.levelMax, Math.max(sp.levelMin, level)) };
}

interface Result {
  ttk: number;
  lost: number;
  dead: boolean;
}

function fightOnce(level: number, method: string | undefined): Result {
  const host = { broadcast: () => undefined };
  const sim: Sim = new GameSim(new WorldState(), host as never, { levelId: 'van_lam', roomName: 'fight', spawn: { x: X, z: Z }, respawn: { x: X, z: Z }, persistPosition: false });
  const char = Character.create(acc++, 'f' + acc);
  char.level = level;
  char.root = 'tho';
  if (method && level >= METHOD_UNLOCK_LEVEL) char.meta.method = method;
  for (const [slot, id] of Object.entries(NOGEAR ? {} : gearFor(level))) if (id) (char.equip as Record<string, unknown>)[slot] = { id, n: 1 };
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
  const skills = [...SKILLS, ...METHOD_SKILLS].filter((s) => s.unlock <= level && (!s.method || s.method === method));
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
    const s = order.find((x) => ready(x));
    if (s) sim.onSkill(p, { id: s.id, t: target.id });
  }
  void METHODS;
  return { ttk: (fake - t0) / 1000 / PULL, lost: (hp0 - Math.max(0, char.hp)) / char.mhp / PULL, dead: false };
}

console.log(`Đánh thử trong sim server (đứng yên, kéo ${PULL} quái, ${RUNS} lần mỗi ô; TTK và máu mất tính trên mỗi con):`);
console.log('cấp   quái                     công pháp     TTK     mất/con   chết');
for (const lv of LEVELS) {
  for (const m of [undefined, 'lac_kiem_quyet', 'bat_dong_kim_than', 'thanh_moc_dan_kinh'] as const) {
    if (!m && lv >= METHOD_UNLOCK_LEVEL) continue;
    const rs = Array.from({ length: RUNS }, () => fightOnce(lv, m));
    const avg = (f: (r: Result) => number) => rs.reduce((n, r) => n + f(r), 0) / rs.length;
    const { def, mlv } = pickMon(lv);
    console.log(
      `${String(lv).padStart(3)}   ${(def.id + ' (' + mlv + ')').padEnd(24)} ${(m ?? 'không').padEnd(18)} ${avg((r) => r.ttk).toFixed(1).padStart(4)}s  ${(avg((r) => r.lost) * 100).toFixed(0).padStart(5)}%   ${rs.filter((r) => r.dead).length}/${RUNS}`,
    );
  }
}
process.exit(0);
