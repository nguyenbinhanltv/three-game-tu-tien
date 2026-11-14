import { and, eq } from 'drizzle-orm';
import {
  type Appearance,
  appearanceFromDb,
  type CharView,
  enhanceMul,
  EQUIP_SLOTS,
  type Equipment,
  type EquipSlot,
  type InvItem,
  type InvSlot,
  INV_SIZE,
  MAX_LEVEL,
  NGUNG_KHI_MAX,
  type ObjectiveType,
  playerBaseStats,
  type QuestView,
  SPAWN_POINT,
  xpNeed,
} from '@dtl/shared';
import { APPEARANCE, ITEM, QUEST } from '@dtl/content';
import { characters, db, items, ledger } from '../db';

export interface CharMeta {
  /** Ngày (YYYY-MM-DD) gần nhất đã nhận thưởng bí cảnh. */
  dungeonDay?: string;
}

/** Bản nháp thay đổi túi đồ/tiền. Chỉ thành thật khi commit trong một transaction. */
export class InvDraft {
  inv: InvSlot[];
  equip: Equipment;
  gold: number;
  itemDelta = new Map<string, number>();
  goldDelta = 0;

  constructor(c: Character) {
    this.inv = c.inv.map((s) => (s ? { ...s } : null));
    this.equip = {};
    for (const k of EQUIP_SLOTS) {
      const e = c.equip[k];
      if (e) this.equip[k] = { ...e };
    }
    this.gold = c.gold;
  }

  private bump(id: string, n: number) {
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

  /** Thêm vật phẩm mới sinh ra. Trả về false nếu túi không đủ chỗ (bản nháp khi đó không dùng được nữa). */
  add(id: string, n: number, plus = 0): boolean {
    const def = ITEM.get(id);
    if (!def || !Number.isInteger(n) || n <= 0) return false;
    let left = n;
    if (def.stack > 1) {
      for (const s of this.inv) {
        if (left <= 0) break;
        if (s && s.id === id && s.n < def.stack) {
          const put = Math.min(left, def.stack - s.n);
          s.n += put;
          left -= put;
        }
      }
    }
    while (left > 0) {
      const i = this.inv.findIndex((s) => !s);
      if (i < 0) return false;
      const put = Math.min(left, def.stack);
      const it: InvItem = { id, n: put };
      if (plus > 0) it.plus = plus;
      this.inv[i] = it;
      left -= put;
    }
    this.bump(id, n);
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
  return a.id === b.id && a.n === b.n && (a.plus ?? 0) === (b.plus ?? 0);
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

  mhp = 1;
  mmp = 0;
  atk = 1;
  def = 0;

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
  static create(accountId: number, name: string, appearance: Appearance | null = null): Character {
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
    try {
      c.equip = JSON.parse(row.equip) as Equipment;
      c.quests = JSON.parse(row.quests) as QuestView;
      c.meta = JSON.parse(row.meta) as CharMeta;
    } catch {
      /* dữ liệu hỏng: dùng mặc định */
    }
    if (!c.quests || typeof c.quests.active !== 'object' || !Array.isArray(c.quests.done)) c.quests = { active: {}, done: [] };
    for (const r of db.select().from(items).where(eq(items.charId, id)).all()) {
      if (r.slot >= 0 && r.slot < INV_SIZE && ITEM.has(r.itemId)) {
        const it: InvItem = { id: r.itemId, n: r.qty };
        if (r.plus > 0) it.plus = r.plus;
        c.inv[r.slot] = it;
      }
    }
    c.recalc();
    if (c.hp > c.mhp) c.hp = c.mhp;
    if (c.mp > c.mmp) c.mp = c.mmp;
    return c;
  }

  /** Tính lại chỉ số từ cảnh giới + trang bị. */
  recalc(): void {
    const b = playerBaseStats(this.level);
    let hp = b.hp;
    let mp = b.mp;
    let atk = b.atk;
    let def = b.def;
    for (const k of EQUIP_SLOTS) {
      const e = this.equip[k];
      const d = e ? ITEM.get(e.id) : undefined;
      if (!d || !d.stats) continue;
      const mul = enhanceMul(e!.plus ?? 0);
      hp += Math.round((d.stats.hp ?? 0) * mul);
      mp += Math.round((d.stats.mp ?? 0) * mul);
      atk += Math.round((d.stats.atk ?? 0) * mul);
      def += Math.round((d.stats.def ?? 0) * mul);
    }
    this.mhp = hp;
    this.mmp = mp;
    this.atk = atk;
    this.def = def;
    if (this.hp > hp) this.hp = hp;
    if (this.mp > mp) this.mp = mp;
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
            tx.insert(items)
              .values({ charId: this.id, slot: i, itemId: b.id, qty: b.n, plus: b.plus ?? 0 })
              .onConflictDoUpdate({ target: [items.charId, items.slot], set: { itemId: b.id, qty: b.n, plus: b.plus ?? 0 } })
              .run();
          } else {
            tx.delete(items).where(and(eq(items.charId, this.id), eq(items.slot, i))).run();
          }
        }
        tx.update(characters).set({ gold: d.gold, equip: JSON.stringify(d.equip) }).where(eq(characters.id, this.id)).run();
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
      if (this.level === NGUNG_KHI_MAX || this.level >= MAX_LEVEL) {
        // Viên mãn: phải độ kiếp mới lên tiếp, tu vi không vượt quá mức đầy.
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

export function isEquipSlot(v: unknown): v is EquipSlot {
  return v === 'weapon' || v === 'robe' || v === 'accessory';
}
