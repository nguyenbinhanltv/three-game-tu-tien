import { randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  type Appearance,
  appearanceFromDb,
  bottleneckBlocked,
  initialBottleneck,
  isRootId,
  levelAfterBottleneck,
  ROOT_IDS,
  type RootId,
  buffMag,
  STAT_CAPS,
  type CharView,
  computePlayerStats,
  EQUIP_SLOTS,
  type Equipment,
  type InvItem,
  type InvSlot,
  INV_SIZE,
  type ItemInst,
  type EquippedEntry,
  parseInst,
  type PlayerStats,
  type Quality,
  QUALITY_COUNT,
  rollItemInstance,
  seededRng,
  isEquipSlot,
  MAX_ENHANCE,
  MAX_LEVEL,
  NGUNG_KHI_MAX,
  type ObjectiveType,
  playerBaseStats,
  type QuestView,
  SPAWN_POINT,
  xpNeed,
} from '@dtl/shared';
import { APPEARANCE, ITEM, ITEM_SYS, QUEST, ROOT, SETS } from '@dtl/content';
import { characters, db, items, ledger, rootForName } from '../db';
import { methodDefMul, sanitizeMethodMeta, type MethodMeta } from './method';
import { type ArtifactMeta, passiveValue, sanitizeArtifactMeta } from './artifact';

export interface CharMeta extends MethodMeta, ArtifactMeta {
  /** Ngày (YYYY-MM-DD) gần nhất đã nhận thưởng bí cảnh. */
  dungeonDay?: string;
}

/** Bản nháp thay đổi túi đồ/tiền. Chỉ thành thật khi commit trong một transaction. */
export class InvDraft {
  inv: InvSlot[];
  equip: Equipment;
  gold: number;
  itemDelta = new Map<string, number>();
  /** Seed các lần roll trong bản nháp này; ghi vào lý do ledger để truy vết/tái hiện. */
  rollSeeds: string[] = [];
  goldDelta = 0;
  /** Linh căn mới (đổi ở NPC); ghi cùng transaction với phí linh thạch. */
  root: RootId | '' = '';

  constructor(c: Character) {
    this.inv = c.inv.map((s) => (s ? { ...s } : null));
    this.equip = {};
    for (const k of EQUIP_SLOTS) {
      const e = c.equip[k];
      if (e) this.equip[k] = { ...e };
    }
    this.gold = c.gold;
  }

  bump(id: string, n: number) {
    this.itemDelta.set(id, (this.itemDelta.get(id) ?? 0) + n);
  }

  count(id: string): number {
    let n = 0;
    for (const s of this.inv) if (s && s.id === id) n += s.n;
    return n;
  }

  freeSlots(): number {
    let n = 0;
    for (const s of this.inv) if (!s) n++;
    return n;
  }

  /** Chỗ còn lại cho `id` cùng `plus`: ô trống và phần trống của các stack cùng id và cùng `plus` (đan khác phẩm không chồng). */
  roomFor(id: string, plus = 0): number {
    const def = ITEM.get(id);
    if (!def) return 0;
    let room = this.freeSlots() * def.stack;
    if (def.stack > 1) for (const s of this.inv) if (s && s.id === id && (s.plus ?? 0) === plus) room += def.stack - s.n;
    return room;
  }

  /** Thêm vật phẩm mới sinh ra. Trả về false (và không đụng tới túi) nếu không đủ chỗ. */
  add(id: string, n: number, plus = 0): boolean {
    const def = ITEM.get(id);
    if (!def || !Number.isInteger(n) || n <= 0) return false;
    if (this.roomFor(id, plus) < n) return false;
    let left = n;
    if (def.stack > 1) {
      for (const s of this.inv) {
        if (left <= 0) break;
        if (s && s.id === id && (s.plus ?? 0) === plus && s.n < def.stack) {
          const put = Math.min(left, def.stack - s.n);
          s.n += put;
          left -= put;
        }
      }
    }
    while (left > 0) {
      const i = this.inv.findIndex((s) => !s);
      const put = Math.min(left, def.stack);
      const it: InvItem = { id, n: put };
      if (plus > 0) it.plus = plus;
      this.inv[i] = it;
      left -= put;
    }
    this.bump(id, n);
    return true;
  }

  /**
   * Thêm một trang bị đã roll (không chồng được). `inst` do `rollItemInstance` ở server sinh ra.
   * Trả về false nếu mẫu không phải trang bị hoặc túi đầy. Ghi ledger như mọi vật phẩm mới (theo id mẫu, +1).
   */
  addInstance(id: string, inst: ItemInst): boolean {
    const def = ITEM.get(id);
    if (!def || !isEquipSlot(def.kind)) return false;
    const i = this.inv.findIndex((s) => !s);
    if (i < 0) return false;
    this.inv[i] = { id, n: 1, inst };
    this.bump(id, 1);
    return true;
  }

  /**
   * Roll một trang bị mới từ mẫu `id` ở server (seed ngẫu nhiên thật, ghi vào ledger) rồi thêm vào túi.
   * Nguồn duy nhất sinh `inst`: client không bao giờ gửi dòng chính/phụ.
   */
  addRolled(id: string, ilvl: number, q: Quality): boolean {
    const def = ITEM.get(id);
    if (!def || !isEquipSlot(def.kind) || !Number.isInteger(q) || q < 0 || q >= QUALITY_COUNT) return false;
    const seed = randomInt(0x7fffffff);
    if (!this.addInstance(id, rollItemInstance(ITEM_SYS, def.kind, ilvl, q, seededRng(seed)))) return false;
    this.rollSeeds.push(`${seed}:q${q}:il${ilvl}`);
    return true;
  }

  /** Tiêu hao vật phẩm theo id. */
  remove(id: string, n: number): boolean {
    if (!Number.isInteger(n) || n <= 0 || this.count(id) < n) return false;
    let left = n;
    for (let i = this.inv.length - 1; i >= 0 && left > 0; i--) {
      const s = this.inv[i];
      if (s && s.id === id) {
        const take = Math.min(left, s.n);
        s.n -= take;
        left -= take;
        if (s.n <= 0) this.inv[i] = null;
      }
    }
    this.bump(id, -n);
    return true;
  }

  /** Tiêu hao vật phẩm ở một ô cụ thể. */
  removeAt(slot: number, n: number): InvItem | null {
    const s = this.inv[slot];
    if (!s || !Number.isInteger(n) || n <= 0 || s.n < n) return null;
    const taken: InvItem = { ...s, n };
    s.n -= n;
    if (s.n <= 0) this.inv[slot] = null;
    this.bump(taken.id, -n);
    return taken;
  }

  addGold(n: number): void {
    if (!Number.isInteger(n) || n <= 0) return;
    this.gold += n;
    this.goldDelta += n;
  }

  spendGold(n: number): boolean {
    if (!Number.isInteger(n) || n < 0 || this.gold < n) return false;
    this.gold -= n;
    this.goldDelta -= n;
    return true;
  }
}

function sameSlot(a: InvSlot, b: InvSlot): boolean {
  if (!a || !b) return a === b;
  return a.id === b.id && a.n === b.n && (a.plus ?? 0) === (b.plus ?? 0) && JSON.stringify(a.inst ?? null) === JSON.stringify(b.inst ?? null);
}

export class Character {
  id = 0;
  accountId = 0;
  name = '';
  level = 1;
  xp = 0;
  gold = 0;
  hp = 1;
  mp = 0;
  x = 0;
  y = 0;
  z = 0;
  room = '';
  inv: InvSlot[] = new Array(INV_SIZE).fill(null);
  equip: Equipment = {};
  quests: QuestView = { active: {}, done: [] };
  meta: CharMeta = {};
  /** Ngoại hình đã kiểm (server quyết định; client chỉ gửi lựa chọn lúc tạo nhân vật). */
  appearance: Appearance = { g: APPEARANCE.defaultGender, dye: APPEARANCE.defaultDye };

  /** Linh căn ngũ hành (`RootId`), gán lúc tạo nhân vật hoặc migration; đổi ở NPC (tx). */
  root: RootId = 'kim';
  /** Bình cảnh đã vượt cao nhất (0, 5, 10, 15). Tu vi chỉ tràn qua tầng 5/10/15 khi đã vượt. */
  bk = 0;
  /** Thử thách tâm ma: lúc kết thúc (ms; 0 = không chạy) và lúc được thử lại (ms). Không lưu DB. */
  trialEndsAt = 0;
  retryAt = 0;

  mhp = 1;
  mmp = 0;
  atk = 1;
  def = 0;
  /** Chỉ số phụ từ dòng phụ trang bị (bạo kích, giảm hồi chiêu...). Xem `computePlayerStats`. */
  stats!: PlayerStats;

  charDirty = true;
  invDirty = true;
  questDirty = true;
  /** Lý do lần tx gần nhất thất bại: 'abort' (điều kiện không đạt), 'dup' (trùng khóa), 'db'. */
  txFail: '' | 'abort' | 'dup' | 'db' = '';

  static findByAccount(accountId: number): number | null {
    const row = db.select({ id: characters.id }).from(characters).where(eq(characters.accountId, accountId)).get();
    return row ? row.id : null;
  }

  static nameTaken(name: string): boolean {
    return !!db.select({ id: characters.id }).from(characters).where(eq(characters.name, name)).get();
  }

  /** `appearance` phải đã qua `parseAppearance` (rooms.ts); null = mặc định. */
  static create(accountId: number, name: string, appearance: Appearance | null = null, root: RootId | null = null): Character {
    const base = playerBaseStats(1);
    const row = db
      .insert(characters)
      .values({
        accountId,
        name,
        level: 1,
        xp: 0,
        gold: 0,
        hp: base.hp,
        mp: base.mp,
        x: SPAWN_POINT.x,
        y: 0,
        z: SPAWN_POINT.z,
        room: '',
        appearance: JSON.stringify(appearance ?? { g: APPEARANCE.defaultGender, dye: APPEARANCE.defaultDye }),
        // Người chơi chọn thì theo, không thì thiên ý (ngẫu nhiên thật, server quyết).
        root: root ?? ROOT_IDS[randomInt(ROOT_IDS.length)],
        updatedAt: Date.now(),
      })
      .returning({ id: characters.id })
      .get();
    return Character.load(row.id);
  }

  static load(id: number): Character {
    const row = db.select().from(characters).where(eq(characters.id, id)).get();
    if (!row) throw new Error('character not found: ' + id);
    const c = new Character();
    c.id = row.id;
    c.accountId = row.accountId;
    c.name = row.name;
    c.level = row.level;
    c.xp = row.xp;
    c.gold = row.gold;
    c.hp = row.hp;
    c.mp = row.mp;
    c.x = row.x;
    c.y = row.y;
    c.z = row.z;
    c.room = row.room;
    c.appearance = appearanceFromDb(APPEARANCE, row.appearance, row.name);
    c.root = isRootId(row.root) ? row.root : rootForName(row.name);
    c.bk = [0, 5, 10, 15].includes(row.bk) ? row.bk : initialBottleneck(row.level);
    try {
      c.equip = sanitizeEquip(JSON.parse(row.equip));
      c.quests = JSON.parse(row.quests) as QuestView;
      c.meta = JSON.parse(row.meta) as CharMeta;
    } catch {
      /* dữ liệu hỏng: dùng mặc định */
    }
    if (!c.meta || typeof c.meta !== 'object') c.meta = {};
    sanitizeMethodMeta(c.meta);
    sanitizeArtifactMeta(c.meta);
    if (!c.quests || typeof c.quests.active !== 'object' || !Array.isArray(c.quests.done)) c.quests = { active: {}, done: [] };
    for (const r of db.select().from(items).where(eq(items.charId, id)).all()) {
      if (r.slot >= 0 && r.slot < INV_SIZE && ITEM.has(r.itemId)) {
        const it: InvItem = { id: r.itemId, n: r.qty };
        if (r.plus > 0) it.plus = r.plus;
        const inst = parseStoredInst(r.itemId, r.inst);
        if (inst) it.inst = inst;
        c.inv[r.slot] = it;
      }
    }
    c.recalc();
    if (c.hp > c.mhp) c.hp = c.mhp;
    if (c.mp > c.mmp) c.mp = c.mmp;
    return c;
  }

  /** Tính lại chỉ số từ cảnh giới + trang bị (8 ô, dòng chính + dòng phụ). */
  recalc(): void {
    const worn: EquippedEntry[] = [];
    for (const k of EQUIP_SLOTS) {
      const e = this.equip[k];
      if (e) worn.push({ item: e, tpl: ITEM.get(e.id)?.stats });
    }
    const st = computePlayerStats(this.level, worn, ROOT.get(this.root), SETS);
    // Đan tăng sức đang chạy (P3-8): công/thủ nhân thêm, bạo kích cộng thẳng.
    const now = Date.now();
    const buffCrit = buffMag(this.meta.buffs, 'crit', now);
    this.stats = buffCrit > 0 ? { ...st, critRate: Math.min(st.critRate + buffCrit, STAT_CAPS.critRate) } : st;
    this.mhp = st.hp;
    // Nội tại pháp bảo (P3-8): Hồ Lô cộng linh lực tối đa, Thanh Liên Ấn cộng phòng ngự.
    const mpPas = passiveValue(this.equip, this.meta, 'mp');
    this.mmp = mpPas > 0 ? Math.round(st.mp * (1 + mpPas)) : st.mp;
    const atkBuff = buffMag(this.meta.buffs, 'atk', now);
    this.atk = atkBuff > 0 ? Math.round(st.atk * (1 + atkBuff)) : st.atk;
    // Nội tại Kim Thân: phòng ngự cộng thêm theo tỉ lệ.
    this.def = Math.round(st.def * (1 + methodDefMul(this.meta) + passiveValue(this.equip, this.meta, 'def') + buffMag(this.meta.buffs, 'def', now)));
    if (this.hp > st.hp) this.hp = st.hp;
    if (this.mp > this.mmp) this.mp = this.mmp;
    this.charDirty = true;
  }

  view(): CharView {
    return {
      name: this.name,
      level: this.level,
      xp: Math.floor(this.xp),
      xpNeed: xpNeed(this.level),
      hp: Math.ceil(this.hp),
      mhp: this.mhp,
      mp: Math.floor(this.mp),
      mmp: this.mmp,
      atk: this.atk,
      def: this.def,
      gold: this.gold,
      root: this.root,
      bk: this.bk,
      trial: this.trialEndsAt > 0 ? Math.max(0, Math.ceil((this.trialEndsAt - Date.now()) / 1000)) : 0,
      retry: Math.max(0, Math.ceil((this.retryAt - Date.now()) / 1000)),
    };
  }

  /** Đổi ngoại hình (chỉ lệnh GM thử); `a` phải đã qua `parseAppearance`. Ghi ngay. */
  setAppearance(a: Appearance): void {
    this.appearance = a;
    db.update(characters).set({ appearance: JSON.stringify(a) }).where(eq(characters.id, this.id)).run();
  }

  /** Lưu các trường thay đổi liên tục (không phải vật phẩm/tiền — chúng lưu ngay trong transaction). */
  save(): void {
    db.update(characters)
      .set({
        level: this.level,
        bk: this.bk,
        xp: Math.floor(this.xp),
        hp: Math.max(0, Math.ceil(this.hp)),
        mp: Math.max(0, Math.floor(this.mp)),
        x: this.x,
        y: this.y,
        z: this.z,
        room: this.room,
        quests: JSON.stringify(this.quests),
        meta: JSON.stringify(this.meta),
        updatedAt: Date.now(),
      })
      .where(eq(characters.id, this.id))
      .run();
  }

  /**
   * Thay đổi vật phẩm/tiền một cách nguyên tử. `fn` sửa bản nháp và trả về false để hủy.
   * `idem` là khóa chống xử lý trùng (cùng khóa lần hai sẽ bị từ chối).
   */
  tx(reason: string, idem: string | null, fn: (d: InvDraft) => boolean): boolean {
    const d = new InvDraft(this);
    this.txFail = '';
    if (!fn(d)) {
      this.txFail = 'abort';
      return false;
    }
    const ts = Date.now();
    try {
      db.transaction((tx) => {
        const rows: (typeof ledger.$inferInsert)[] = [];
        if (d.rollSeeds.length) reason += ' roll=' + d.rollSeeds.join(',');
        if (d.goldDelta !== 0) rows.push({ charId: this.id, kind: 'gold', ref: '', delta: d.goldDelta, reason, ts });
        for (const [id, delta] of d.itemDelta) {
          if (delta !== 0) rows.push({ charId: this.id, kind: 'item', ref: id, delta, reason, ts });
        }
        if (idem) {
          if (rows.length === 0) rows.push({ charId: this.id, kind: 'noop', ref: '', delta: 0, reason, ts });
          rows[0].idem = idem;
        }
        if (rows.length) tx.insert(ledger).values(rows).run();
        for (let i = 0; i < INV_SIZE; i++) {
          const a = this.inv[i];
          const b = d.inv[i];
          if (sameSlot(a, b)) continue;
          if (b) {
            const inst = b.inst ? JSON.stringify(b.inst) : null;
            tx.insert(items)
              .values({ charId: this.id, slot: i, itemId: b.id, qty: b.n, plus: b.plus ?? 0, inst })
              .onConflictDoUpdate({ target: [items.charId, items.slot], set: { itemId: b.id, qty: b.n, plus: b.plus ?? 0, inst } })
              .run();
          } else {
            tx.delete(items).where(and(eq(items.charId, this.id), eq(items.slot, i))).run();
          }
        }
        tx.update(characters)
          .set({ gold: d.gold, equip: JSON.stringify(d.equip), ...(d.root ? { root: d.root } : {}) })
          .where(eq(characters.id, this.id))
          .run();
      });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes('UNIQUE')) {
        this.txFail = 'dup';
      } else {
        this.txFail = 'db';
        console.error('[tx] lỗi ghi DB:', reason, msg);
      }
      return false;
    }
    this.inv = d.inv;
    this.equip = d.equip;
    this.gold = d.gold;
    if (d.root && d.root !== this.root) {
      this.root = d.root;
      this.recalc();
    }
    this.invDirty = true;
    this.charDirty = true;
    return true;
  }

  /** Cộng tu vi. Trả về số tầng vừa lên (chỉ tự lên trong Ngưng Khí và sau Trúc Cơ). */
  gainXp(n: number): number {
    if (n <= 0) return 0;
    let ups = 0;
    this.xp += n;
    for (;;) {
      const need = xpNeed(this.level);
      if (this.level === NGUNG_KHI_MAX || this.level >= MAX_LEVEL || bottleneckBlocked(this.level, this.bk)) {
        // Viên mãn hoặc kẹt bình cảnh (tầng 5/10/15 chưa vượt): phải độ kiếp / vượt bình cảnh mới lên tiếp,
        // tu vi không vượt quá mức đầy.
        if (this.xp > need) this.xp = need;
        break;
      }
      if (this.xp < need) break;
      this.xp -= need;
      this.level++;
      ups++;
    }
    if (ups > 0) {
      this.recalc();
      this.hp = this.mhp;
      this.mp = this.mmp;
    }
    this.charDirty = true;
    return ups;
  }

  /**
   * Vượt bình cảnh (thắng tâm ma hoặc dùng Phá Cảnh Đan). Server đã kiểm điều kiện. Tầng 5/10: lên một tầng, tu vi
   * về 0 (tu vi không tràn qua bình cảnh). Tầng 15: chỉ mở đường độ kiếp, tu vi giữ đầy. Trả về tầng mới.
   */
  passBottleneck(): number {
    this.bk = this.level;
    const next = levelAfterBottleneck(this.level);
    if (next !== this.level) {
      this.level = next;
      this.xp = 0;
      this.recalc();
      this.hp = this.mhp;
      this.mp = this.mmp;
    }
    this.charDirty = true;
    return this.level;
  }

  loseXp(frac: number): number {
    const lost = Math.floor(Math.min(this.xp, xpNeed(this.level) * frac));
    this.xp -= lost;
    this.charDirty = true;
    return lost;
  }

  equipCount(id: string): number {
    let n = 0;
    for (const k of EQUIP_SLOTS) if (this.equip[k]?.id === id) n++;
    return n;
  }

  // ---- Nhiệm vụ ----

  questComplete(id: string): boolean {
    const q = QUEST.get(id);
    const prog = this.quests.active[id];
    if (!q || !prog) return false;
    return q.objectives.every((o, i) => (prog[i] ?? 0) >= o.count);
  }

  /** Ghi nhận sự kiện vào các nhiệm vụ đang làm. Trả về id những nhiệm vụ vừa đủ điều kiện trả. */
  questEvent(type: ObjectiveType, target: string | undefined, n: number): string[] {
    const ready: string[] = [];
    for (const id in this.quests.active) {
      const q = QUEST.get(id);
      if (!q) continue;
      const prog = this.quests.active[id];
      const was = this.questComplete(id);
      let changed = false;
      q.objectives.forEach((o, i) => {
        if (o.type !== type) return;
        if (o.target && o.target !== target) return;
        const cur = prog[i] ?? 0;
        if (cur >= o.count) return;
        const next = type === 'level' ? Math.min(o.count, Math.max(cur, n)) : Math.min(o.count, cur + n);
        if (next !== cur) {
          prog[i] = next;
          changed = true;
        }
      });
      if (changed) {
        this.questDirty = true;
        if (!was && this.questComplete(id)) ready.push(id);
      }
    }
    return ready;
  }
}

/** Đọc `inst` lưu trong DB; hỏng/vượt trần thì bỏ (món đó thành đồ cũ chỉ số mẫu). */
function parseStoredInst(itemId: string, raw: string | null): ItemInst | null {
  if (!raw) return null;
  const kind = ITEM.get(itemId)?.kind;
  if (!isEquipSlot(kind)) return null;
  try {
    const inst = parseInst(ITEM_SYS, kind, JSON.parse(raw));
    if (!inst) console.warn('[load] inst trong túi bị bác, về chỉ số mẫu:', itemId);
    return inst;
  } catch {
    return null;
  }
}

/** Đọc JSON trang bị: chỉ giữ ô hợp lệ, mẫu còn tồn tại, đúng loại ô, `inst` đã qua kiểm. */
function sanitizeEquip(raw: unknown): Equipment {
  const out: Equipment = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of EQUIP_SLOTS) {
    const e = (raw as Record<string, InvItem | undefined>)[k];
    if (!e || typeof e.id !== 'string') continue;
    const kind = ITEM.get(e.id)?.kind;
    if (!kind) {
      console.warn('[load] bỏ trang bị có mẫu không còn tồn tại:', e.id);
      continue;
    }
    if (kind !== k) console.warn('[load] trang bị lệch ô (giữ nguyên):', e.id, 'ở', k);
    const it: InvItem = { id: e.id, n: 1 };
    if (e.plus && e.plus > 0) it.plus = Math.min(e.plus | 0, MAX_ENHANCE);
    const inst = e.inst ? parseInst(ITEM_SYS, k, e.inst) : null;
    if (inst) it.inst = inst;
    else if (e.inst) console.warn('[load] inst trang bị bị bác, về chỉ số mẫu:', e.id, k);
    out[k] = it;
  }
  return out;
}

export { isEquipSlot };
