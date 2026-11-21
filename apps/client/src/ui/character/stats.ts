// Bảng thuộc tính (TD-C): mọi chỉ số của `computePlayerStats` (shared), chia nhóm, kèm nguồn từng phần.
// Không copy công thức: nguồn = hiệu hai lần gọi `computePlayerStats` (thêm dần gốc, trang bị, bộ, linh căn).
// Phần còn lại giữa số server gửi (CharView) và số tính được là "khác" (đan tăng sức, nội tại công pháp/pháp bảo).
import { combatPower, computePlayerStats, daoOrigin, ELEMENTS, type Equipment, type PlayerStats } from '@dtl/shared';
import { ROOT, SETS } from '@dtl/content';
import { entries } from '../gear';

export type StatId = 'atk' | 'critRate' | 'critMul' | 'eliteDmg' | 'def' | 'hp' | 'mp' | 'moveSpeed' | 'lifesteal' | 'healRecv' | 'cdr';
export type StatGroup = 'attack' | 'defense' | 'recovery';
export type SourceId = 'base' | 'gear' | 'set' | 'root' | 'dao' | 'other';

/** Bản Nguyên của Đạo (nửa thưởng, TN-3); null khi chưa chọn Đạo. */
const daoDef = (daoId: string) => (daoId ? daoOrigin(ROOT.get(daoId)) : null);

export interface StatSource {
  src: SourceId;
  /** Giá trị đóng góp (phẳng, hoặc phân số với chỉ số tỉ lệ). */
  v: number;
}

export interface StatRow {
  id: StatId;
  group: StatGroup;
  /** `pct`: hiển thị phần trăm. */
  kind: 'flat' | 'pct';
  total: number;
  sources: StatSource[];
}

export const STAT_GROUPS: { id: StatGroup; stats: StatId[] }[] = [
  { id: 'attack', stats: ['atk', 'critRate', 'critMul', 'eliteDmg'] },
  { id: 'defense', stats: ['def', 'hp', 'mp', 'moveSpeed'] },
  { id: 'recovery', stats: ['lifesteal', 'healRecv', 'cdr'] },
];

const PCT = new Set<StatId>(['critRate', 'critMul', 'eliteDmg', 'moveSpeed', 'lifesteal', 'healRecv', 'cdr']);

/** Giá trị "đóng góp" của chỉ số: hệ số (critMul, moveSpeed) trừ mốc 1. */
function val(s: PlayerStats, id: StatId): number {
  if (id === 'critMul' || id === 'moveSpeed') return (s[id] as number) - 1;
  return s[id] as number;
}

/** Số server gửi (đã gồm buff, nội tại) cho bốn chỉ số phẳng. */
interface ServerStats {
  mhp: number;
  mmp: number;
  atk: number;
  def: number;
}

function serverVal(id: StatId, c: ServerStats): number | null {
  return id === 'hp' ? c.mhp : id === 'mp' ? c.mmp : id === 'atk' ? c.atk : id === 'def' ? c.def : null;
}

export function statRows(level: number, equip: Equipment, rootId: string, c: ServerStats, daoId = ''): StatRow[] {
  const root = ROOT.get(rootId) ?? null;
  const s0 = computePlayerStats(level, [], null, []);
  const s1 = computePlayerStats(level, entries(equip), null, []);
  const s2 = computePlayerStats(level, entries(equip), null, SETS);
  const s3 = computePlayerStats(level, entries(equip), root, SETS);
  const s4 = computePlayerStats(level, entries(equip), root, SETS, daoDef(daoId));
  const rows: StatRow[] = [];
  for (const g of STAT_GROUPS) {
    for (const id of g.stats) {
      const kind = PCT.has(id) ? 'pct' : 'flat';
      const total = serverVal(id, c) ?? val(s4, id);
      const parts: StatSource[] = [
        { src: 'base', v: val(s0, id) },
        { src: 'gear', v: val(s1, id) - val(s0, id) },
        { src: 'set', v: val(s2, id) - val(s1, id) },
        { src: 'root', v: val(s3, id) - val(s2, id) },
        { src: 'dao', v: val(s4, id) - val(s3, id) },
        { src: 'other', v: total - val(s4, id) },
      ];
      const eps = kind === 'pct' ? 0.00005 : 0.5;
      rows.push({ id, group: g.id, kind, total, sources: parts.filter((p) => Math.abs(p.v) > eps) });
    }
  }
  return rows;
}

/** Lực chiến theo số server gửi cho bốn chỉ số phẳng; phần tỉ lệ tính từ trang bị + bộ + linh căn. */
export function charPower(level: number, equip: Equipment, rootId: string, c: ServerStats, daoId = ''): number {
  const st = computePlayerStats(level, entries(equip), ROOT.get(rootId) ?? null, SETS, daoDef(daoId));
  return combatPower({ ...st, hp: c.mhp, mp: c.mmp, atk: c.atk, def: c.def });
}

interface ElemRow {
  elem: (typeof ELEMENTS)[number];
  dmg: number;
  res: number;
  /** Linh căn của mình thuộc hệ này. */
  own: boolean;
}

/** Hàng ngũ hành: sát thương và kháng theo hệ (từ trang bị + bộ + linh căn). */
export function elemRows(level: number, equip: Equipment, rootId: string, daoId = ''): ElemRow[] {
  const root = ROOT.get(rootId) ?? null;
  const st = computePlayerStats(level, entries(equip), root, SETS, daoDef(daoId));
  return ELEMENTS.map((e) => ({ elem: e, dmg: st.elemDmg[e] ?? 0, res: st.elemRes[e] ?? 0, own: !!root && root.elem === e }));
}
