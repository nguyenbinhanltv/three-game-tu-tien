// Đồng hồ sát thương của phòng tập (Diễn Võ Trường V2e, `/gm dps`): cộng dồn sát thương THẬT mà server đã áp lên quái,
// tách theo chiêu, kèm thời gian hạ từng con. Chỉ đo, không đổi luật: không có lần đo nào đang chạy thì mọi hàm thoát ngay.
// Giữ ngoài `PlayerEnt` (WeakMap, như matchstats) để không đổi hình dạng thực thể; mất cùng người chơi khi rời room.

/** Khóa gom của sát thương theo thời gian (độc, bỏng, ấn bào mòn): không quy được về một lần ra chiêu. */
export const METER_DOT = '(dot)';
/** Sát thương đến trước khi có chiêu nào được ghi (trận, linh thú, phản đòn...). */
export const METER_OTHER = '(khác)';

interface SkillRow {
  dmg: number;
  hits: number;
  crits: number;
}

interface TargetRow {
  def: string;
  mhp: number;
  firstAt: number;
  dmg: number;
}

interface Kill {
  def: string;
  /** Giây từ đòn đầu lên con này tới lúc hạ. */
  ttk: number;
}

interface Run {
  startAt: number;
  firstAt: number;
  lastAt: number;
  total: number;
  hits: number;
  crits: number;
  skill: string;
  skills: Map<string, SkillRow>;
  targets: Map<string, TargetRow>;
  kills: Kill[];
  /** Dòng "vừa hạ" chưa báo cho người đo (GmSystem.tick lấy ra). */
  pending: Kill[];
}

export interface MeterSkill extends SkillRow {
  id: string;
  /** Phần trong tổng sát thương, 0–1. */
  share: number;
}

export interface MeterKills {
  def: string;
  n: number;
  avg: number;
  min: number;
  max: number;
}

export interface MeterReport {
  /** Giây từ đòn đầu tới đòn cuối (tối thiểu 1). 0 nếu chưa có đòn nào. */
  secs: number;
  total: number;
  dps: number;
  hits: number;
  critRate: number;
  targets: number;
  skills: MeterSkill[];
  kills: MeterKills[];
  /** Mục tiêu đang đánh dở to máu nhất: thời gian hạ ước tính theo DPS hiện tại (máu tối đa / DPS). */
  est?: { def: string; mhp: number; secs: number };
}

const newRun = (now: number): Run => ({
  startAt: now,
  firstAt: 0,
  lastAt: 0,
  total: 0,
  hits: 0,
  crits: 0,
  skill: '',
  skills: new Map(),
  targets: new Map(),
  kills: [],
  pending: [],
});

export class DpsMeter<P extends object> {
  private readonly runs = new WeakMap<P, Run>();

  active(p: P): boolean {
    return this.runs.has(p);
  }

  /** Bắt đầu (hoặc bắt đầu lại từ số 0). */
  start(p: P, now: number): void {
    this.runs.set(p, newRun(now));
  }

  stop(p: P): void {
    this.runs.delete(p);
  }

  /** Chiêu vừa được áp hiệu quả: các đòn sau đó tính cho chiêu này tới khi có chiêu khác. */
  cast(p: P, skill: string): void {
    const r = this.runs.get(p);
    if (r) r.skill = skill;
  }

  /**
   * Nhãn chiêu cho đòn tiếp theo của người đang đo (để gắn vào tin sát thương, trường `sk`); undefined khi người đó không đo.
   * Cùng quy tắc quy chiêu với `hit`.
   */
  label(p: P | null | undefined, dot: boolean): string | undefined {
    const r = p ? this.runs.get(p) : undefined;
    return r ? (dot ? METER_DOT : r.skill || METER_OTHER) : undefined;
  }

  /** Một lần sát thương đã áp lên quái `monId` (loại `def`, máu tối đa `mhp`). `dmg` ≤ 0 thì bỏ qua (né, miễn). */
  hit(p: P | null | undefined, now: number, monId: string, def: string, mhp: number, dmg: number, crit: boolean, dot: boolean): void {
    const r = p ? this.runs.get(p) : undefined;
    if (!r || !(dmg > 0) || !Number.isFinite(dmg)) return;
    if (!r.firstAt) r.firstAt = now;
    r.lastAt = now;
    r.total += dmg;
    r.hits++;
    if (crit) r.crits++;
    const key = dot ? METER_DOT : r.skill || METER_OTHER;
    let s = r.skills.get(key);
    if (!s) r.skills.set(key, (s = { dmg: 0, hits: 0, crits: 0 }));
    s.dmg += dmg;
    s.hits++;
    if (crit) s.crits++;
    let t = r.targets.get(monId);
    if (!t) r.targets.set(monId, (t = { def, mhp, firstAt: now, dmg: 0 }));
    t.dmg += dmg;
  }

  /** Quái `monId` vừa bị hạ (hoặc hình nộm vừa cạn máu): chốt thời gian hạ tính từ đòn đầu của người đo lên con đó. */
  kill(p: P | null | undefined, now: number, monId: string): void {
    const r = p ? this.runs.get(p) : undefined;
    const t = r?.targets.get(monId);
    if (!r || !t) return;
    const k: Kill = { def: t.def, ttk: Math.max(0, now - t.firstAt) / 1000 };
    r.kills.push(k);
    r.pending.push(k);
    r.targets.delete(monId);
  }

  /** Lấy các dòng "vừa hạ" chưa báo. */
  drain(p: P): Kill[] {
    const r = this.runs.get(p);
    if (!r || !r.pending.length) return [];
    const out = r.pending;
    r.pending = [];
    return out;
  }

  report(p: P): MeterReport | null {
    const r = this.runs.get(p);
    if (!r) return null;
    const secs = r.hits ? Math.max(1, (r.lastAt - r.firstAt) / 1000) : 0;
    const dps = secs ? r.total / secs : 0;
    const skills = [...r.skills.entries()]
      .map(([id, s]) => ({ id, ...s, share: r.total ? s.dmg / r.total : 0 }))
      .sort((a, b) => b.dmg - a.dmg);
    const by = new Map<string, number[]>();
    for (const k of r.kills) by.set(k.def, [...(by.get(k.def) ?? []), k.ttk]);
    const kills = [...by.entries()].map(([def, a]) => ({
      def,
      n: a.length,
      avg: a.reduce((x, y) => x + y, 0) / a.length,
      min: Math.min(...a),
      max: Math.max(...a),
    }));
    let big: TargetRow | undefined;
    for (const t of r.targets.values()) if (!big || t.mhp > big.mhp) big = t;
    const rep: MeterReport = {
      secs,
      total: r.total,
      dps,
      hits: r.hits,
      critRate: r.hits ? r.crits / r.hits : 0,
      targets: r.targets.size + r.kills.length,
      skills,
      kills,
    };
    if (big && dps > 0) rep.est = { def: big.def, mhp: big.mhp, secs: big.mhp / dps };
    return rep;
  }
}

/** Đồng hồ dùng chung của tiến trình (khóa theo thực thể người chơi nên các room không lẫn nhau). */
export const labMeter = new DpsMeter<object>();

const int = (n: number): string => String(Math.round(n));

/** Báo cáo thành các dòng chat. `skill`/`mon`: id → tên hiển thị. Tối đa 8 chiêu đầu. */
export function meterLines(r: MeterReport, skill: (id: string) => string, mon: (id: string) => string): string[] {
  if (!r.hits) return ['dps: đang đo, chưa có đòn nào trúng'];
  const out = [
    `dps: ${r.secs.toFixed(1)} s · tổng ${int(r.total)} · ${int(r.dps)}/s · ${r.hits} đòn · bạo kích ${int(r.critRate * 100)}% · ${r.targets} mục tiêu`,
  ];
  for (const s of r.skills.slice(0, 8))
    out.push(`  ${skill(s.id)}: ${int(s.share * 100)}% · ${int(s.dmg)} · ${s.hits} đòn · ${int(s.dmg / s.hits)}/đòn`);
  for (const k of r.kills)
    out.push(
      k.n > 1
        ? `  hạ ${mon(k.def)} ×${k.n}: trung bình ${k.avg.toFixed(1)} s (${k.min.toFixed(1)}–${k.max.toFixed(1)})`
        : `  hạ ${mon(k.def)}: ${k.avg.toFixed(1)} s`,
    );
  if (r.est) out.push(`  ước hạ ${mon(r.est.def)} (máu ${int(r.est.mhp)}) với nhịp này: ${r.est.secs.toFixed(1)} s`);
  return out;
}
