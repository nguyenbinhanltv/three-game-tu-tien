// Dựng danh sách biểu tượng minimap từ trạng thái game (đọc, không ghi). Gọi mỗi khung vẽ nên giữ nhẹ.
import { levelSpawns, MS_DEAD, PORTAL_POS, type QuestView } from '@dtl/shared';
import { hasString, ITEM, itemName, LEVELS, MONSTER, monsterName, NPC, NPCS, QUEST, QUESTS, t } from '@dtl/content';
import type { Game } from '../../game/engine';
import { questGoal, trackedQuestId } from '../../game/offscreen';
import { difficultyTone, type Mark, minimapHooks, npcFunction, npcQuestMark } from './model';

/** Bán kính lọc quái quanh mình (m): vừa quá nửa cạnh ở mức phóng xa nhất. */
const RANGE = 330;
/** Vùng tô mục tiêu: chỉ giữ những vùng cách mình không quá mức này (m). */
const GOAL_RANGE = 900;

interface Area {
  x: number;
  z: number;
  r: number;
}
const areaCache = new Map<string, Area[]>();

/** Các vùng xuất hiện của đích nhiệm vụ (bãi quái hoặc điểm hái), tĩnh nên nhớ lại. */
function goalAreas(level: string, goal: { kind: 'mon'; mon: string } | { kind: 'node'; item: string }): Area[] {
  const key = `${level}:${goal.kind}:${goal.kind === 'mon' ? goal.mon : goal.item}`;
  let a = areaCache.get(key);
  if (a) return a;
  const lv = LEVELS[level];
  if (!lv) return (a = []);
  a = goal.kind === 'mon' ? levelSpawns(lv).filter((s) => s.mon === goal.mon).map((s) => ({ x: s.x, z: s.z, r: Math.max(18, s.radius) })) : lv.nodes.filter((n) => n.item === goal.item).map((n) => ({ x: n.x, z: n.z, r: Math.max(18, n.radius) }));
  areaCache.set(key, a);
  return a;
}

/** Kết quả: các biểu tượng và đích nhiệm vụ (để vẽ vùng tô, mũi tên mép). */
export interface MinimapFrame {
  marks: Mark[];
  /** Vùng tô mục tiêu nhiệm vụ. */
  goals: (Area & { label: string })[];
  /** Điểm đích gần nhất của nhiệm vụ đang theo dõi (mũi tên mép khi ngoài tầm). */
  goalPoint: { x: number; z: number; label: string } | null;
  /** Mình đang bị đánh (vòng đỏ quanh mũi tên). */
  selfHurt: boolean;
}

export function buildFrame(g: Game, quests: QuestView, trackPin: string, myLevel: number, partyOrder: readonly string[], now: number): MinimapFrame {
  const marks: Mark[] = [];
  const goals: MinimapFrame['goals'] = [];
  let goalPoint: MinimapFrame['goalPoint'] = null;
  const px = g.renderPos.x;
  const pz = g.renderPos.z;
  const hurt = (id: string): number | undefined => {
    const at = g.hurtAt.get(id);
    return at !== undefined && now - at < 1600 ? at + 1600 : undefined;
  };
  const level = g.view.level;

  // Loại boss có trong trạng thái room (mọi khoảng cách): quyết định boss còn sống hay chỉ là chỗ sinh.
  const bossInRoom = new Set<string>();
  // Quái: lấy từ trạng thái room (không phải model đang dựng) để thấy cả bãi ở xa.
  g.view.monsters.forEach((m, id) => {
    if (m.st !== MS_DEAD && MONSTER.get(m.t)?.boss) bossInRoom.add(m.t);
    if ((m.x - px) ** 2 + (m.z - pz) ** 2 > RANGE * RANGE) return;
    const def = MONSTER.get(m.t);
    if (!def) return;
    const dead = m.st === MS_DEAD;
    if (dead && !def.boss) return;
    if (def.boss) bossInRoom.add(m.t); // chết trong tầm đã có biểu tượng, không vẽ thêm chỗ sinh
    const kind = def.boss ? 'boss' : def.elite ? 'elite' : 'mon';
    const sub = t('ui.mm.level', { n: m.lv }) + (def.boss ? ` · ${t('ui.mm.boss')}` : def.elite ? ` · ${t('ui.mm.elite')}` : '');
    marks.push({ kind, id, x: m.x, z: m.z, label: monsterName(m.t), sub, tone: difficultyTone(m.lv, myLevel), dead, respawnAt: dead ? minimapHooks.bossRespawnAt.get(m.t) : undefined, hurtUntil: hurt(id) });
  });

  // Đồng đội (có số theo thứ tự trong tổ đội) và người chơi khác.
  g.view.players.forEach((p, sid) => {
    if (sid === g.sid) return;
    const n = partyOrder.indexOf(sid);
    if (n >= 0) marks.push({ kind: 'mate', id: sid, x: p.x, z: p.z, label: p.name, sub: t('ui.mm.level', { n: p.lv }) + ` · ${Math.round((p.hp / Math.max(1, p.mhp)) * 100)}%`, num: n + 1, hurtUntil: hurt(sid) });
    else if ((p.x - px) ** 2 + (p.z - pz) ** 2 <= RANGE * RANGE) marks.push({ kind: 'player', id: sid, x: p.x, z: p.z, label: p.name, sub: t('ui.mm.level', { n: p.lv }) });
  });

  if (level === 'van_lam') {
    for (const n of NPCS) {
      const fn = npcFunction(n);
      marks.push({ kind: 'npc', id: n.id, x: n.x, z: n.z, label: t(`npc.${n.id}.name`), sub: t(`ui.mm.fn.${fn}`), desc: hasString(`npc.${n.id}.title`) ? t(`npc.${n.id}.title`) : undefined, quest: npcQuestMark(n.id, QUESTS, quests, myLevel) });
    }
    g.view.nodes.forEach((n, id) => {
      if (!n.on || (n.x - px) ** 2 + (n.z - pz) ** 2 > RANGE * RANGE) return;
      marks.push({ kind: 'node', id, x: n.x, z: n.z, label: itemName(n.t), sub: ITEM.get(n.t) ? t('ui.mm.node') : undefined });
    });
    marks.push({ kind: 'portal', id: 'portal', x: PORTAL_POS.x, z: PORTAL_POS.z, label: t('ui.mm.portal'), sub: t('ui.mm.portal_sub') });
    for (const tp of minimapHooks.teleports) marks.push({ kind: 'tele', id: tp.id, x: tp.x, z: tp.z, label: tp.label, sub: t('ui.mm.tele') });

    // Boss đã chết và không còn trong trạng thái room: vẫn vẽ biểu tượng xám ở chỗ sinh để người chơi biết nơi trở lại.
    const lv = LEVELS[level];
    if (lv) {
      for (const s of lv.spawns) {
        const def = MONSTER.get(s.mon);
        if (!def?.boss || bossInRoom.has(s.mon)) continue;
        marks.push({ kind: 'boss', id: `spawn:${s.mon}`, x: s.x, z: s.z, label: monsterName(s.mon), sub: t('ui.mm.level', { n: s.levelMax }) + ` · ${t('ui.mm.boss')}`, dead: true, respawnAt: minimapHooks.bossRespawnAt.get(s.mon) });
      }
    }
  }

  // Nhiệm vụ đang theo dõi: vùng tô + điểm đích cho mũi tên.
  const qid = trackedQuestId(quests, trackPin);
  const def = qid ? QUEST.get(qid) : undefined;
  const goal = def && questGoal(def, quests.active[qid], NPCS);
  if (def && goal) {
    const label = t(`quest.${qid}.name`);
    if (goal.kind === 'npc') {
      const n = NPC.get(goal.npc);
      if (n && level === 'van_lam') goalPoint = { x: n.x, z: n.z, label };
    } else if (level === 'van_lam') {
      let best = Infinity;
      for (const a of goalAreas(level, goal)) {
        const d = Math.hypot(a.x - px, a.z - pz);
        if (d > GOAL_RANGE) continue;
        goals.push({ ...a, label });
        if (d < best) {
          best = d;
          goalPoint = { x: a.x, z: a.z, label };
        }
      }
    }
  }

  return { marks, goals, goalPoint, selfHurt: hurt(g.sid) !== undefined };
}
