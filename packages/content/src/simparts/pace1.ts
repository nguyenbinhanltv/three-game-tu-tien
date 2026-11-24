// Tách từ sim.ts (tối ưu Đợt E): pace1.
import { levelSpawns } from '@dtl/shared';
import {
  BOTTLENECK_LEVELS,
  HP_REGEN_MEDITATE,
  meditateXpPerSec,
  monsterStats,
  monsterXp,
  NGUNG_KHI_MAX,
  shadowStats,
  TRIAL_DURATION,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { lootOf } from '../loot';
import { LEVELS, MONSTER, QUESTS, realmName } from '../index';

import { at } from '@dtl/shared';
import {
  MethodId,
  playerM,
  playerDps,
  monsterDps,
  PULL_FACTOR,
  selfSustain,
  hit,
  pct,
  METHOD_IDS,
  PULL,
  SUSTAIN_EFF,
  METHOD_NAME,
  SKILL_EFF,
  PlayMode,
} from './common';

// ---------- nhịp lên cấp ----------

// Nhịp lên cấp tính trên quái thường: tinh anh (cờ elite) ít gặp, tính riêng ở bảng tinh anh bên dưới.
const spawns = levelSpawns(at(LEVELS, 'van_lam')).filter((s) => !MONSTER.get(s.mon)?.boss && !MONSTER.get(s.mon)?.elite);
const CAMPS = (at(LEVELS, 'van_lam').camps ?? []).filter((c) => !MONSTER.get(c.mon)?.elite);
/** Tốc độ chạy bộ (m/s) và hệ số đường vòng khi đi từ cụm này sang cụm khác. */
export const RUN_SPEED = 7;
export const PATH_FACTOR = 1.3;
/** Giây đi từ con này sang con kế trong cùng cụm (tới gần + kéo quái). */
export const HOP_SEC = 3.5;

/** Giây tìm quái mỗi lần giết: đi sang cụm gần nhất cùng loại, chia cho số con một cụm, cộng bước chuyển giữa các con. */
export function seekModel(mon: string): { perCamp: number; seek: number } {
  const cs = CAMPS.filter((c) => c.mon === mon);
  if (!cs.length) return { perCamp: 1, seek: 6 };
  const perCamp = cs.reduce((n, c) => n + c.count, 0) / cs.length;
  const nn = cs.map((a) => Math.min(...cs.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z)), 120));
  const dist = nn.reduce((n, d) => n + d, 0) / nn.length;
  return { perCamp, seek: HOP_SEC + (PATH_FACTOR * dist) / RUN_SPEED / perCamp };
}

interface Timeline {
  hours: number;
  fightHours: number;
  restHours: number;
  trialMin: number;
  rows: string[];
  trialRows: string[];
  questXp: number;
  scrollAt: number[];
  goldAt: number[];
  killsByLevel: number[];
  secByLevel: number[];
  goldTotal: number;
}
const SCROLL_ID = 'itm_bi_tich_tan_quyen';
export const questByLevel = new Map<number, number>();
const questScrollByLevel = new Map<number, number>();
for (const q of QUESTS) {
  // Nhiệm vụ làm xong quanh cấp của quái mục tiêu.
  let lv = q.minLevel ?? 1;
  for (const o of q.objectives) {
    const sp = spawns.find((s) => s.mon === o.target);
    if (sp) lv = Math.max(lv, sp.levelMin);
  }
  questByLevel.set(lv, (questByLevel.get(lv) ?? 0) + q.rewards.xp);
  questScrollByLevel.set(
    lv,
    (questScrollByLevel.get(lv) ?? 0) + (q.rewards.items ?? []).filter((i) => i.id === SCROLL_ID).reduce((n, i) => n + i.n, 0),
  );
}

/** Bãi quái người chơi chọn ở cảnh giới `level`: cấp quái gần cấp mình nhất. */
export function pickSpawn(level: number) {
  return at(
    [...spawns].sort((a, b) => Math.abs((a.levelMin + a.levelMax) / 2 - level) - Math.abs((b.levelMin + b.levelMax) / 2 - level)),
    0,
    'spawns',
  );
}

function timeline(id?: MethodId): Timeline {
  let totalSec = 0;
  let fightSec = 0;
  let trialSec = 0;
  let questXp = 0;
  let scrollTotal = 0;
  let goldTotal = 0;
  const t: Timeline = {
    hours: 0,
    fightHours: 0,
    restHours: 0,
    trialMin: 0,
    rows: [],
    trialRows: [],
    questXp: 0,
    scrollAt: [],
    goldAt: [],
    killsByLevel: [],
    secByLevel: [],
    goldTotal: 0,
  };
  for (let level = 1; level <= NGUNG_KHI_MAX; level++) {
    const pl = playerM(level, id);
    const sp = pickSpawn(level);
    const def = MONSTER.get(sp.mon)!;
    const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, level));
    const ms = monsterStats(mlv, def.hpMul, def.atkMul);
    const ttk = ms.hp / playerDps(level, pl.atk, ms.def, id, def.elem);
    const inc = monsterDps(def, ms.atk, pl.def);
    // Máu mất mỗi lần giết: quái đánh cả lúc kéo thêm (PULL_FACTOR), trừ phần khiên/hồi nguyên kịp bù trong lúc đánh và đi tìm quái.
    const sk = seekModel(def.id);
    const lost = Math.max(0, inc * ttk * PULL_FACTOR - selfSustain(level, id) * pl.hp * (ttk + sk.seek));
    const rest = lost / (pl.hp * HP_REGEN_MEDITATE);
    const xpPerKill = monsterXp(mlv, def.xpMul) * xpLevelFactor(level, mlv) + meditateXpPerSec(level) * rest;
    let need = xpNeed(level);
    const qx = questByLevel.get(level) ?? 0;
    questXp += qx;
    need = Math.max(0, need - qx);
    const kills = Math.ceil(need / xpPerKill);
    const lt = lootOf(def.id);
    const d = lt.drops.find((x) => x.item === SCROLL_ID);
    scrollTotal += kills * (d ? d.chance * ((d.min + d.max) / 2) : 0) + (questScrollByLevel.get(level) ?? 0);
    goldTotal += kills * ((lt.gold[0] + lt.gold[1]) / 2);
    t.scrollAt[level] = scrollTotal;
    t.goldAt[level] = goldTotal;
    t.killsByLevel[level] = kills;
    // Mỗi lần giết: thời gian đánh + tìm quái (theo mật độ cụm) + đả tọa hồi máu.
    const sec = kills * (ttk + sk.seek + rest);
    t.secByLevel[level] = sec;
    totalSec += sec;
    fightSec += kills * (ttk + sk.seek);
    // Bình cảnh tầng 5/10/15: thêm một thử thách tâm ma (đánh bóng của mình, mỗi lần ~ TTK + 20 giây chuẩn bị/đi lại).
    if (BOTTLENECK_LEVELS.includes(level)) {
      const sh = shadowStats(level, pl.atk, pl.def);
      const tt = sh.hp / playerDps(level, pl.atk, sh.def, id);
      // Bóng đánh mỗi 1,8 giây (xem monsters.json), người chơi dùng khiên/hồi nguyên như thường.
      const raw = (hit(sh.atk, 1, pl.def) / 1.8) * tt;
      const taken = Math.max(0, raw - selfSustain(level, id) * pl.hp * tt);
      trialSec += tt + 20;
      totalSec += tt + 20;
      t.trialRows.push(
        `${realmName(level).padEnd(20)} bóng hp ${String(sh.hp).padStart(5)}  TTK ${tt.toFixed(0).padStart(3)}s / ${TRIAL_DURATION}s  mất máu ${pct(raw / pl.hp).padStart(4)} nếu đứng yên, ${pct(taken / pl.hp).padStart(4)} sau khiên + hồi nguyên`,
      );
    }
    t.rows.push(
      `${realmName(level).padEnd(20)} ${(def.id + ' (' + mlv + ')').padEnd(23)} ${ttk.toFixed(1).padStart(4)}s ${pct(inc / pl.hp).padStart(5)} ${pct(lost / pl.hp).padStart(7)} ${rest.toFixed(0).padStart(4)}s ${sk.seek.toFixed(1).padStart(5)}s ${String(kills).padStart(5)} ${(sec / 60).toFixed(0).padStart(6)} ${(totalSec / 3600).toFixed(1).padStart(8)} giờ`,
    );
  }
  t.hours = totalSec / 3600;
  t.fightHours = fightSec / 3600;
  t.trialMin = trialSec / 60;
  t.restHours = (totalSec - fightSec - trialSec) / 3600;
  t.questXp = questXp;
  t.goldTotal = goldTotal;
  return t;
}

const TL = new Map<MethodId, Timeline>(METHOD_IDS.map((m) => [m, timeline(m)] as const));
export const main = TL.get('lac_kiem_quyet')!;
export const scrollAt = main.scrollAt;
export const goldTotal = main.goldTotal;
console.log(
  'Nhịp lên cấp (Kiếm tu; từ tầng 5 dùng công pháp; tìm quái = đi giữa các cụm của M-2, kéo ' +
    PULL +
    ' con mỗi cụm, hiệu suất khiên/hồi ' +
    pct(SUSTAIN_EFF) +
    ')',
);
console.log('Cảnh giới            quái (cấp)              TTK  máu/s  mất/lần  tọa   tìm   giết   phút   cộng dồn');
for (const r of main.rows) console.log(r);
console.log(
  `\nTổng tu vi từ nhiệm vụ: ${main.questXp}. Ước tính từ tầng 1 đến viên mãn tầng 15 (một mình, chưa tính boss, bí cảnh, tinh anh): ` +
    METHOD_IDS.map((m) => `${METHOD_NAME[m]} ${TL.get(m)!.hours.toFixed(2)} giờ`).join(', ') +
    ` (Kiếm tu: ${main.fightHours.toFixed(1)} giờ đánh và tìm quái + ${main.restHours.toFixed(1)} giờ đả tọa hồi máu; đã gồm ${main.trialMin.toFixed(0)} phút thử thách tâm ma ở bình cảnh).`,
);
{
  const hs = METHOD_IDS.map((m) => TL.get(m)!.hours);
  if (Math.min(...hs) < 3 || Math.max(...hs) > 4) {
    console.error('LỖI: nhịp tới viên mãn tầng 15 phải 3–4 giờ cho cả ba công pháp');
    process.exitCode = 1;
  }
}
{
  // VS-2: phần thưởng của cơ chế mới so với "bấm theo hồi chiêu" (mô hình trước VS-2), trên quái thường cùng cấp.
  //  - `đúng cơ chế`: làm đủ (ấn, tư thế, xả tài nguyên); `thực tế`: người chơi thật (`SKILL_EFF`), là số nhịp lên cấp dùng.
  //  - Ràng buộc: chơi đúng không được lợi quá +20% (cơ chế lấn át chỉ số), không bị thiệt; mức thực tế lệch mô hình cũ không quá +5%.
  console.log(
    `
VS-2: sát thương mỗi giây so với bấm theo hồi chiêu (đúng cơ chế / thực tế ${pct(SKILL_EFF)}), và máu tự hồi mỗi giây (thực tế so với cũ)`,
  );
  console.log('Cảnh giới            ' + METHOD_IDS.map((m) => METHOD_NAME[m].padEnd(22)).join(''));
  for (const level of [5, 8, 12, 15]) {
    const sp = pickSpawn(level);
    const def = MONSTER.get(sp.mon)!;
    const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, level));
    const ms = monsterStats(mlv, def.hpMul, def.atkMul);
    const cells: string[] = [];
    for (const id of METHOD_IDS) {
      const pl = playerM(level, id);
      const dps = (mode: PlayMode) => playerDps(level, pl.atk, ms.def, id, def.elem, mode);
      const skilled = dps('skilled') / dps('base') - 1;
      const avg = dps('avg') / dps('base') - 1;
      const sus = selfSustain(level, id, 'avg') / Math.max(1e-9, selfSustain(level, id, 'base')) - 1;
      cells.push(`+${pct(skilled)} / +${pct(avg)}, hồi +${pct(sus)}`.padEnd(22));
      const who = `VS-2 tầng ${level} ${METHOD_NAME[id]}`;
      if (skilled < -1e-9 || skilled > 0.2) {
        console.error(`LỖI: ${who}: chơi đúng cơ chế đổi sát thương ${pct(skilled)}, ngoài 0–20%`);
        process.exitCode = 1;
      }
      if (avg > 0.05) {
        console.error(`LỖI: ${who}: sát thương thực tế lệch mô hình trước VS-2 ${pct(avg)}, quá +5%`);
        process.exitCode = 1;
      }
    }
    console.log(`${realmName(level).padEnd(20)} ${cells.join('')}`);
  }
}
