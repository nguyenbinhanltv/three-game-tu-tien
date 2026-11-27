// Xưởng âm thanh của phòng thử (Diễn Võ Trường, V2d): đo LÚC CHẠY độ lệch giữa tiếng và khung trúng đòn của từng lần ra chiêu.
// Engine đánh mốc (vào thế, khung trúng của hoạt ảnh, sát thương server về); nhật ký lời gọi phát tiếng lấy từ `sfxProbe` (game/audio/audio.ts).
// Mọi mốc là `performance.now()` nên đo ở tốc độ 100% (làm chậm lớp hình thì các khoảng giãn theo). Phần ghép là hàm thuần, không phát gì.

export type CastMarkKind = 'windup' | 'hit' | 'recovery' | 'cancel' | 'end' | 'dmg';

export interface CastMark {
  kind: CastMarkKind;
  /** `performance.now()` lúc mốc xảy ra. */
  at: number;
  /** Id chiêu (mốc `dmg` để rỗng: tin sát thương không mang id chiêu). */
  skill: string;
  /** Đòn thứ mấy của chuỗi đánh thường, -1 nếu không phải chuỗi. */
  combo: number;
  /** Mốc `hit` thứ mấy của chiêu (0-based). */
  index: number;
  /** Chỉ ở `windup`: số ms dự kiến tới khung trúng đầu tiên (theo dữ liệu chiêu). */
  planMs?: number;
}

/** Một dòng của nhật ký lời gọi phát tiếng (cùng hình với `SfxRow`, thêm `delayMs` cho tiếng đặt lịch trễ). */
export interface CastSfx {
  name: string;
  at: number;
  why: string;
  delayMs?: number;
}

const MAX_MARKS = 400;

/** Nhật ký mốc, chỉ ghi khi `on` (bật cùng đầu dò tiếng ở tab Diễn Võ). */
export const castMarks: { on: boolean; rows: CastMark[] } = { on: false, rows: [] };

/** Engine gọi ở sự kiện chiêu của MÌNH và lúc sát thương của mình về. Tắt thì không làm gì. `hitIn` tính bằng giây. */
export function castMark(kind: CastMarkKind, skill: string, combo = -1, index = 0, hitIn?: number): void {
  if (!castMarks.on) return;
  castMarks.rows.push({ kind, at: performance.now(), skill, combo, index, planMs: hitIn === undefined ? undefined : hitIn * 1000 });
  if (castMarks.rows.length > MAX_MARKS) castMarks.rows.splice(0, castMarks.rows.length - MAX_MARKS);
}

/** Tiếng trúng lệch khung trúng quá ngần này (ms) thì tai nghe ra tiếng và hình không khớp. */
export const CAST_TOL_MS = 60;
/** Một lần ra chiêu gom tiếng và sát thương tối đa chừng này ms sau lúc vào thế (hoặc tới lần vào thế kế tiếp). */
export const CAST_WINDOW_MS = 4000;
/** Tiếng trúng đòn (phát ở `applyDmg`) và tiếng vung (đặt lịch ở `windup`). */
export const HIT_SFX: ReadonlySet<string> = new Set(['hit', 'crit', 'block', 'hurt']);
export const SWING_SFX: ReadonlySet<string> = new Set(['sword', 'slash']);
/** Lý do của lời gọi mà người chơi SẼ nghe thấy nếu bật tiếng. */
const HEARD: ReadonlySet<string> = new Set(['ok', 'mute', 'idle']);

export interface CastSound {
  name: string;
  /** Lệch so với khung trúng (ms; âm = trước khung trúng). Chiêu không tới khung trúng thì so với lúc vào thế. */
  offMs: number;
}

/**
 * `ok` tiếng trúng trong dung sai; `late`/`early` lệch quá dung sai; `mute` có sát thương mà không có tiếng trúng (bị giãn hoặc thiếu);
 * `miss` không trúng ai (không sát thương, không tiếng trúng); `cut` chiêu bị hủy trước khung trúng.
 */
export type CastVerdict = 'ok' | 'late' | 'early' | 'mute' | 'miss' | 'cut';

export interface CastRow {
  skill: string;
  combo: number;
  /** Lúc vào thế. */
  at: number;
  /** Vào thế → khung trúng đo được, và dự kiến theo dữ liệu (ms). */
  hitMs: number | null;
  planMs: number | null;
  /** Sát thương server về so với khung trúng (ms; âm = về trước, được giữ chờ khung trúng nên tiếng rơi đúng khung). */
  dmgMs: number | null;
  /** Tiếng vung và tiếng trúng so với khung trúng (ms). */
  swingMs: number | null;
  hitSndMs: number | null;
  sounds: CastSound[];
  verdict: CastVerdict;
}

const audible = (s: CastSfx): number => s.at + (s.delayMs ?? 0);

/** Ghép mốc và nhật ký tiếng thành từng lần ra chiêu (theo thứ tự thời gian). */
export function castRows(marks: readonly CastMark[], sfx: readonly CastSfx[]): CastRow[] {
  const heard = sfx.filter((s) => HEARD.has(s.why));
  const starts = marks.filter((m) => m.kind === 'windup');
  return starts.map((w, i) => {
    const end = Math.min(starts[i + 1]?.at ?? Infinity, w.at + CAST_WINDOW_MS);
    const inWin = (t: number) => t >= w.at && t < end;
    const hit = marks.find((m) => m.kind === 'hit' && m.index === 0 && m.skill === w.skill && inWin(m.at));
    const ref = hit?.at ?? w.at;
    const dmg = marks.find((m) => m.kind === 'dmg' && inWin(m.at));
    // Tiếng vung được gọi ngay lúc vào thế (cùng khung, có thể sớm hơn mốc vài phần ms) nên nới đầu cửa sổ 5 ms.
    const mine = heard.filter((s) => s.at >= w.at - 5 && s.at < end);
    const sounds = mine.map((s) => ({ name: s.name, offMs: Math.round(audible(s) - ref) }));
    const swing = mine.find((s) => SWING_SFX.has(s.name) && audible(s) <= ref + CAST_TOL_MS);
    const hitSnd = hit ? mine.find((s) => HIT_SFX.has(s.name) && audible(s) >= hit.at - 30) : undefined;
    const hitSndMs = hitSnd && hit ? Math.round(audible(hitSnd) - hit.at) : null;
    let verdict: CastVerdict;
    if (!hit) verdict = 'cut';
    else if (hitSndMs === null) verdict = dmg ? 'mute' : 'miss';
    else if (Math.abs(hitSndMs) <= CAST_TOL_MS) verdict = 'ok';
    else verdict = hitSndMs < 0 ? 'early' : 'late';
    return {
      skill: w.skill,
      combo: w.combo,
      at: w.at,
      hitMs: hit ? Math.round(hit.at - w.at) : null,
      planMs: w.planMs === undefined ? null : Math.round(w.planMs),
      dmgMs: dmg && hit ? Math.round(dmg.at - hit.at) : null,
      swingMs: swing ? Math.round(audible(swing) - ref) : null,
      hitSndMs,
      sounds,
      verdict,
    };
  });
}

export interface CastSummary {
  /** Id chiêu; đòn thường thêm `#<đòn>` (1-based). */
  key: string;
  n: number;
  /** Trung vị (ms) qua các lần có số đo; null = chưa lần nào đo được. */
  hitSndMs: number | null;
  /** Lệch tiếng trúng lớn nhất theo trị tuyệt đối (ms). */
  hitSndWorst: number | null;
  dmgMs: number | null;
  swingMs: number | null;
  /** Khung trúng đo được trừ dự kiến theo dữ liệu (ms): hoạt ảnh ra đòn sớm/muộn hơn dữ liệu chiêu. */
  planErrMs: number | null;
  /** Số lần không đạt (lệch quá dung sai hoặc có sát thương mà câm). */
  bad: number;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

const nums = (xs: (number | null)[]): number[] => xs.filter((x): x is number => x !== null);

/** Gộp các lần ra chiêu theo chiêu (đòn thường tách từng đòn của chuỗi), giữ thứ tự xuất hiện đầu tiên. */
export function castSummary(rows: readonly CastRow[]): CastSummary[] {
  const by = new Map<string, CastRow[]>();
  for (const r of rows) {
    const key = r.combo >= 0 ? `${r.skill}#${r.combo + 1}` : r.skill;
    const list = by.get(key);
    if (list) list.push(r);
    else by.set(key, [r]);
  }
  return [...by.entries()].map(([key, list]) => {
    const snd = nums(list.map((r) => r.hitSndMs));
    return {
      key,
      n: list.length,
      hitSndMs: median(snd),
      hitSndWorst: snd.length ? snd.reduce((w, x) => (Math.abs(x) > Math.abs(w) ? x : w), 0) : null,
      dmgMs: median(nums(list.map((r) => r.dmgMs))),
      swingMs: median(nums(list.map((r) => r.swingMs))),
      planErrMs: median(nums(list.map((r) => (r.hitMs === null || r.planMs === null ? null : r.hitMs - r.planMs)))),
      bad: list.filter((r) => r.verdict === 'late' || r.verdict === 'early' || r.verdict === 'mute').length,
    };
  });
}
