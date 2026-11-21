// Ấn trên mục tiêu (VS-2c): Kiếm ấn, Truy hồn, Trấn ấn, Mất thế trên quái; Mộc ấn trên đạo hữu.
// Hàm thuần dùng chung server (đặt/tiêu/tính thưởng) và client (đọc gói bit để vẽ trên đầu mục tiêu).
// Dữ liệu ở packages/content/data/marks.json; chiêu khai `applyMark` / `consumeMark` (types.ts).

export type MarkId = 'kiem_an' | 'truy_hon' | 'tran_an' | 'mat_the' | 'moc_an' | 'hon_an' | 'dao_ngan' | 'co_doc' | 'cam_an';

/**
 * Thứ tự cố định để gói bit vào trường đồng bộ `mk` (mỗi ấn `MARK_BITS` bit). KHÔNG đổi thứ tự, chỉ thêm vào cuối:
 * client và server phải đọc cùng một bảng.
 */
export const MARK_ORDER: readonly MarkId[] = ['kiem_an', 'truy_hon', 'tran_an', 'mat_the', 'moc_an', 'hon_an', 'dao_ngan', 'co_doc', 'cam_an'];
export const MARK_BITS = 3;
export const MARK_STACK_MAX = (1 << MARK_BITS) - 1;
/** Nhịp sát thương của ấn có `dot` (ms). */
export const MARK_DOT_MS = 1000;

export interface MarkDef {
  id: MarkId;
  /** Đặt lên quái hay lên đạo hữu. */
  on: 'mon' | 'ally';
  /** Số tầng tối đa của một người đặt trên một mục tiêu. */
  max: number;
  /** Thời gian tồn tại (giây); đặt thêm tầng thì làm mới. */
  dur: number;
  /** Chỉ người tu công pháp này mới đặt được (chiêu chung như Kiếm Khí Trảm không đặt ấn cho phái khác). */
  method?: string;
  /** Người đặt gây thêm chừng này sát thương lên mục tiêu, mỗi tầng. */
  amp?: number;
  /** Mọi người gây thêm chừng này sát thương lên mục tiêu (không cộng dồn theo người đặt). */
  ampAll?: number;
  /** Lúc đặt: quái thường choáng `stun` giây; thủ lĩnh cộng `posture` vào thanh phá thế (0–1). */
  onApply?: { stun?: number; posture?: number };
  /**
   * TN-2 (Hồn ấn, chỉ ấn trên quái): mỗi giây mỗi tầng gây `per` × công kích của người đặt (chốt lúc đặt); người đặt hồi
   * `leech` phần sát thương đó (rút máu).
   */
  dot?: { per: number; leech?: number };
  /** Màu hiển thị (hex 6 ký tự). */
  color: string;
}

/** Một ấn đang nằm trên mục tiêu, của người đặt `sid`. */
export interface MarkRt {
  id: MarkId;
  sid: string;
  n: number;
  /** Giờ server (ms) hết hạn. */
  until: number;
  /** Ghi đè `amp` của định nghĩa (biến thức "ấn sâu" của Phi Kiếm Truy Hồn). */
  mul?: number;
  /** Ấn có `dot`: sát thương mỗi tầng mỗi nhịp (đã nhân công kích lúc đặt) và giờ server (ms) của nhịp kế. */
  per?: number;
  nextAt?: number;
}

/** Chiêu đặt ấn lên mục tiêu trúng đòn (quái) hoặc người được hồi (đạo hữu). */
export interface ApplyMark {
  id: MarkId;
  /** Số tầng mỗi lần (mặc định 1). */
  n?: number;
  /** Chiêu nhiều nhát: chỉ nhát cuối mới đặt. */
  last?: boolean;
}

/**
 * Chiêu tiêu ấn của chính mình trên mục tiêu. Mỗi trường là một kiểu thưởng, tính theo số tầng đã tiêu:
 * - `extraHit`: mỗi tầng bắn thêm một nhát bằng chừng này × sức mạnh chiêu.
 * - `perMark`: mỗi tầng cộng chừng này vào hệ số sát thương lên mục tiêu đó.
 * - `stun`: choáng thêm (giây). `res`: tích thêm tài nguyên riêng.
 * - `heal`: (ấn trên đạo hữu) người mang ấn được hồi bằng chừng này × lượng hồi của chiêu.
 * - `burst`: (ấn trên đạo hữu) nổ quanh người mang ấn, bán kính `r`, hệ số `mul` × công kích.
 * - `then`: tiêu được ấn và xả đủ `resCost` tài nguyên riêng thì đặt ấn `mark` lên mục tiêu.
 */
export interface ConsumeMark {
  id: MarkId;
  extraHit?: number;
  perMark?: number;
  stun?: number;
  res?: number;
  heal?: number;
  burst?: { r: number; mul: number };
  then?: { mark: MarkId; resCost: number };
}

/** Bỏ ấn đã hết hạn (sửa tại chỗ). Trả true nếu có bỏ. */
export function marksPrune(list: MarkRt[], nowMs: number): boolean {
  let changed = false;
  for (let i = list.length - 1; i >= 0; i--) {
    if (nowMs >= list[i]!.until) {
      list.splice(i, 1);
      changed = true;
    }
  }
  return changed;
}

/** Số tầng ấn `id` của người `sid` còn hiệu lực trên mục tiêu. */
export function markCount(list: readonly MarkRt[], id: MarkId, sid: string, nowMs: number): number {
  for (const m of list) if (m.id === id && m.sid === sid && nowMs < m.until) return m.n;
  return 0;
}

/** Có ấn `id` còn hiệu lực của bất kỳ ai không (ấn dùng chung như Mất thế). Trả ấn đó để biết người đặt. */
export function markAny(list: readonly MarkRt[], id: MarkId, nowMs: number): MarkRt | undefined {
  return list.find((m) => m.id === id && nowMs < m.until);
}

/**
 * Đặt `n` tầng ấn (sửa tại chỗ): cộng vào ấn cùng loại cùng người đặt nếu còn, không quá `max`; mỗi lần đặt làm mới hạn.
 * `durMul`: luật nhánh công pháp kéo dài ấn. `mul`: ghi đè `amp`. Trả số tầng sau khi đặt.
 */
export function markAdd(
  list: MarkRt[],
  def: MarkDef,
  sid: string,
  n: number,
  nowMs: number,
  o: { durMul?: number; mul?: number; maxAdd?: number; per?: number } = {},
): number {
  const add = Math.max(1, Math.floor(n));
  const max = Math.min(MARK_STACK_MAX, def.max + Math.max(0, o.maxAdd ?? 0));
  const until = nowMs + def.dur * (o.durMul ?? 1) * 1000;
  const cur = list.find((m) => m.id === def.id && m.sid === sid);
  if (cur) {
    cur.n = nowMs < cur.until ? Math.min(max, cur.n + add) : Math.min(max, add);
    cur.until = until;
    if (o.mul !== undefined) cur.mul = o.mul;
    if (o.per !== undefined) {
      cur.per = o.per;
      // Đặt thêm tầng không lùi nhịp đang chờ (không kéo dài khoảng nghỉ giữa hai nhịp).
      if (cur.nextAt === undefined || nowMs >= cur.nextAt + MARK_DOT_MS) cur.nextAt = nowMs + MARK_DOT_MS;
    }
    return cur.n;
  }
  const rt: MarkRt = { id: def.id, sid, n: Math.min(max, add), until };
  if (o.mul !== undefined) rt.mul = o.mul;
  if (o.per !== undefined) {
    rt.per = o.per;
    rt.nextAt = nowMs + MARK_DOT_MS;
  }
  list.push(rt);
  return rt.n;
}

/** Tiêu hết ấn `id` của người `sid` (sửa tại chỗ). Trả số tầng đã tiêu (0 nếu không có hoặc đã hết hạn). */
export function markTake(list: MarkRt[], id: MarkId, sid: string, nowMs: number): number {
  const i = list.findIndex((m) => m.id === id && m.sid === sid);
  if (i < 0) return 0;
  const m = list[i]!;
  list.splice(i, 1);
  return nowMs < m.until ? m.n : 0;
}

/** Tiêu ấn `id` của bất kỳ ai (ấn dùng chung). Trả ấn đã tiêu hoặc undefined. */
export function markTakeAny(list: MarkRt[], id: MarkId, nowMs: number): MarkRt | undefined {
  const i = list.findIndex((m) => m.id === id && nowMs < m.until);
  return i < 0 ? undefined : list.splice(i, 1)[0];
}

/**
 * Phần sát thương cộng thêm (0 = không) khi người `sid` đánh mục tiêu mang các ấn `list`:
 * ấn của chính mình cộng `amp` (hoặc `mul`) mỗi tầng; ấn `ampAll` của bất kỳ ai cộng một lần mỗi loại.
 */
export function markAmp(list: readonly MarkRt[], defs: ReadonlyMap<string, MarkDef>, sid: string, nowMs: number): number {
  let amp = 0;
  const seenAll = new Set<string>();
  for (const m of list) {
    if (nowMs >= m.until) continue;
    const def = defs.get(m.id);
    if (!def) continue;
    if (m.sid === sid) amp += (m.mul ?? def.amp ?? 0) * m.n;
    if (def.ampAll && !seenAll.has(m.id)) {
      seenAll.add(m.id);
      amp += def.ampAll;
    }
  }
  return amp;
}

/** Gói các ấn còn hiệu lực thành một số để đồng bộ: mỗi loại lấy số tầng cao nhất trong các người đặt. */
export function packMarks(list: readonly MarkRt[], nowMs: number): number {
  let out = 0;
  for (const m of list) {
    if (nowMs >= m.until) continue;
    const i = MARK_ORDER.indexOf(m.id);
    if (i < 0) continue;
    const shift = i * MARK_BITS;
    const cur = (out >> shift) & MARK_STACK_MAX;
    const n = Math.min(MARK_STACK_MAX, Math.max(1, m.n));
    if (n > cur) out = (out & ~(MARK_STACK_MAX << shift)) | (n << shift);
  }
  return out;
}

/** Đọc gói bit: danh sách ấn đang có và số tầng, theo `MARK_ORDER`. Số lạ/âm trả mảng rỗng. */
export function unpackMarks(mk: number | undefined): { id: MarkId; n: number }[] {
  const out: { id: MarkId; n: number }[] = [];
  if (!mk || !Number.isFinite(mk) || mk < 0) return out;
  MARK_ORDER.forEach((id, i) => {
    const n = (mk >> (i * MARK_BITS)) & MARK_STACK_MAX;
    if (n > 0) out.push({ id, n });
  });
  return out;
}

/** Kiểm bảng định nghĩa ấn; trả danh sách lỗi (rỗng = hợp lệ). */
export function markDefErrors(defs: readonly MarkDef[]): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const d of defs) {
    const at = `mark ${d.id}`;
    if (!MARK_ORDER.includes(d.id)) errs.push(`${at}: id lạ (thêm vào MARK_ORDER trước)`);
    if (seen.has(d.id)) errs.push(`${at}: trùng id`);
    seen.add(d.id);
    if (d.on !== 'mon' && d.on !== 'ally') errs.push(`${at}: on phải là mon hoặc ally`);
    if (!(Number.isInteger(d.max) && d.max >= 1 && d.max <= MARK_STACK_MAX)) errs.push(`${at}: max 1–${MARK_STACK_MAX}`);
    if (!(d.dur > 0 && d.dur <= 30)) errs.push(`${at}: dur 0–30 giây`);
    if (d.amp !== undefined && !(d.amp > 0 && d.amp * d.max <= 1)) errs.push(`${at}: amp × max không quá +100%`);
    if (d.dot) {
      if (d.on !== 'mon') errs.push(`${at}: dot chỉ cho ấn trên quái`);
      if (!(d.dot.per > 0 && d.dot.per * d.max <= 1)) errs.push(`${at}: dot.per × max không quá 100% công kích mỗi giây`);
      if (d.dot.leech !== undefined && !(d.dot.leech > 0 && d.dot.leech <= 0.5)) errs.push(`${at}: dot.leech trong (0; 0,5]`);
    }
    if (d.ampAll !== undefined && !(d.ampAll > 0 && d.ampAll <= 0.5)) errs.push(`${at}: ampAll trong (0; 0,5]`);
    if (d.on === 'ally' && (d.amp !== undefined || d.ampAll !== undefined || d.onApply))
      errs.push(`${at}: ấn trên đạo hữu không có amp/onApply`);
    if (d.onApply?.stun !== undefined && !(d.onApply.stun > 0 && d.onApply.stun <= 3)) errs.push(`${at}: onApply.stun 0–3 giây`);
    if (d.onApply?.posture !== undefined && !(d.onApply.posture > 0 && d.onApply.posture <= 0.5)) errs.push(`${at}: onApply.posture 0–0,5`);
    if (!/^[0-9a-f]{6}$/i.test(d.color)) errs.push(`${at}: màu phải là hex 6 ký tự`);
  }
  for (const id of MARK_ORDER) if (!seen.has(id)) errs.push(`mark ${id}: có trong MARK_ORDER nhưng thiếu định nghĩa`);
  return errs;
}

/** Kiểm `applyMark` / `consumeMark` của một chiêu so với bảng ấn. `kind`, `method` là của chiêu. */
export function skillMarkErrors(
  s: { id: string; kind: string; method?: string; applyMark?: ApplyMark; consumeMark?: ConsumeMark },
  defs: ReadonlyMap<string, MarkDef>,
): string[] {
  const errs: string[] = [];
  const at = `skill ${s.id}`;
  const heals = s.kind === 'heal' || s.kind === 'hot';
  const ap = s.applyMark;
  if (ap) {
    const d = defs.get(ap.id);
    if (!d) errs.push(`${at}: applyMark.id "${ap.id}" không phải ấn`);
    else {
      if (d.on === 'ally' && !heals) errs.push(`${at}: ấn ${ap.id} đặt lên đạo hữu, chỉ chiêu hồi mới đặt được`);
      if (d.on === 'mon' && heals) errs.push(`${at}: ấn ${ap.id} đặt lên quái, chiêu hồi không đặt được`);
      if (d.method && s.method && s.method !== d.method) errs.push(`${at}: ấn ${ap.id} thuộc công pháp khác`);
      if (ap.n !== undefined && !(Number.isInteger(ap.n) && ap.n >= 1 && ap.n <= d.max)) errs.push(`${at}: applyMark.n 1–${d.max}`);
    }
    if (ap.last && s.kind !== 'damage') errs.push(`${at}: applyMark.last chỉ dùng với kind damage`);
  }
  const cm = s.consumeMark;
  if (cm) {
    const d = defs.get(cm.id);
    if (!d) errs.push(`${at}: consumeMark.id "${cm.id}" không phải ấn`);
    else {
      if (d.method && s.method && s.method !== d.method) errs.push(`${at}: ấn ${cm.id} thuộc công pháp khác`);
      if (d.on === 'ally' && (cm.extraHit !== undefined || cm.perMark !== undefined || cm.stun !== undefined || cm.then))
        errs.push(`${at}: ấn ${cm.id} trên đạo hữu chỉ tiêu bằng heal/burst`);
      if (d.on === 'mon' && (cm.heal !== undefined || cm.burst)) errs.push(`${at}: ấn ${cm.id} trên quái không tiêu bằng heal/burst`);
    }
    if (cm.extraHit !== undefined && !(cm.extraHit > 0 && cm.extraHit <= 1)) errs.push(`${at}: consumeMark.extraHit trong (0; 1]`);
    if (cm.extraHit !== undefined && s.kind !== 'damage') errs.push(`${at}: consumeMark.extraHit chỉ dùng với kind damage`);
    if (cm.perMark !== undefined && !(cm.perMark > 0 && cm.perMark <= 0.5)) errs.push(`${at}: consumeMark.perMark trong (0; 0,5]`);
    if (cm.stun !== undefined && !(cm.stun > 0 && cm.stun <= 3)) errs.push(`${at}: consumeMark.stun 0–3 giây`);
    if (cm.res !== undefined && !(cm.res > 0)) errs.push(`${at}: consumeMark.res phải dương`);
    if (cm.heal !== undefined && !(cm.heal > 0 && cm.heal <= 1)) errs.push(`${at}: consumeMark.heal trong (0; 1]`);
    if (cm.burst && !(cm.burst.r > 0 && cm.burst.r <= 10 && cm.burst.mul > 0 && cm.burst.mul <= 3))
      errs.push(`${at}: consumeMark.burst r 0–10 m, mul 0–3`);
    if (cm.then) {
      const t = defs.get(cm.then.mark);
      if (!t || t.on !== 'mon') errs.push(`${at}: consumeMark.then.mark phải là ấn trên quái`);
      if (!(cm.then.resCost > 0)) errs.push(`${at}: consumeMark.then.resCost phải dương`);
    }
    const effects = [cm.extraHit, cm.perMark, cm.stun, cm.res, cm.heal, cm.burst, cm.then].filter((x) => x !== undefined);
    if (!effects.length) errs.push(`${at}: consumeMark không có tác dụng`);
  }
  return errs;
}
