import { randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  type Appearance,
  appearanceFromDb,
  bottleneckBlocked,
  BOTTLENECK_LEVELS,
  isPeakLevel,
  initialBottleneck,
  isRootId,
  levelAfterBottleneck,
  ROOT_IDS,
  type RootId,
  buffMag,
  STAT_CAPS,
  type CharView,
  computePlayerStats,
  COSMETIC_SLOTS,
  EQUIP_SLOTS,
  WEAR_SLOTS,
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
  wearableBy,
  MAX_ENHANCE,
  MAX_LEVEL,
  type ObjectiveType,
  playerBaseStats,
  type QuestView,
  SPAWN_POINT,
  xpNeed,
  TELE_FREE,
  TELE_PAD,
} from '@dtl/shared';
import { APPEARANCE, ITEM, ITEM_SYS, QUEST, ROOT, SETS } from '@dtl/content';
import { characters, db, items, ledger, rootForName, wardrobe } from '../db';
import { methodDefMul, methodOf, sanitizeMethodMeta, type MethodMeta } from './method';
import { type ArtifactMeta, bondedHpPassive, passiveValue, sanitizeArtifactMeta } from './artifact';
import { log } from '../log';

import { at, emptyLook, isWardrobeKind, outfitLookFromDb, outfitLookToDb, type OutfitLook } from '@dtl/shared';
interface CharMeta extends MethodMeta, ArtifactMeta {
  /** Ngày (YYYY-MM-DD) gần nhất đã nhận thưởng bí cảnh. */
  dungeonDay?: string;
  /** Như `dungeonDay` nhưng theo từng phó bản (E2-C): level → ngày nhận thưởng gần nhất. */
  dungeonDays?: Record<string, string>;
}

/** Bản nháp thay đổi túi đồ/tiền. Chỉ thành thật khi commit trong một transaction. */
const DYE_IDS: ReadonlySet<string> = new Set(APPEARANCE.dyes.map((d) => d.id));

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
  /** Lựa chọn tủ ngoại trang mới (đã kiểm ở `WardrobeSystem`); ghi cùng transaction với dòng ledger `noop`. */
  look: OutfitLook | null = null;

  constructor(c: Character) {
    this.inv = c.inv.map((s) => (s ? { ...s } : null));
    this.equip = {};
    // Cả ô ngoại hình (skin): bản nháp ghi đè toàn bộ cột `equip`, bỏ sót là mất món đang mặc.
    for (const k of WEAR_SLOTS) {
      const e = c.equip[k];
      if (e) this.equip[k] = { ...e };
    }
    this.gold = c.gold;
  }

  bump(id: string, n: number) {
    this.itemDelta.set(id, (this.itemDelta.get(id) ?? 0) + n);
  }

  /** Số lượng dùng được (không tính ô khóa: ô khóa không làm nguyên liệu). */
  count(id: string): number {
    let n = 0;
    for (const s of this.inv) if (s && s.id === id && !s.lk) n += s.n;
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
    if (def.stack > 1) for (const s of this.inv) if (s && !s.lk && s.id === id && (s.plus ?? 0) === plus) room += def.stack - s.n;
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
        if (s && !s.lk && s.id === id && (s.plus ?? 0) === plus && s.n < def.stack) {
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
    if (!this.addInstance(id, rollItemInstance(ITEM_SYS, def.kind, ilvl, q, seededRng(seed), def.tier))) return false;
    this.rollSeeds.push(`${seed}:q${q}:il${ilvl}`);
    return true;
  }

  /** Tiêu hao vật phẩm theo id. */
  remove(id: string, n: number): boolean {
    if (!Number.isInteger(n) || n <= 0 || this.count(id) < n) return false;
    let left = n;
    for (let i = this.inv.length - 1; i >= 0 && left > 0; i--) {
      const s = this.inv[i];
      if (s && s.id === id && !s.lk) {
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

export function sameSlot(a: InvSlot, b: InvSlot): boolean {
  if (!a || !b) return a === b;
  return (
    a.id === b.id &&
    a.n === b.n &&
    (a.plus ?? 0) === (b.plus ?? 0) &&
    !a.lk === !b.lk &&
    JSON.stringify(a.inst ?? null) === JSON.stringify(b.inst ?? null)
  );
}

/** Đọc cột `tele`: mảng JSON id trận; '' hoặc hỏng thì rỗng, id lạ bị bỏ. */
export function parseTele(raw: string): string[] {
  try {
    const a = JSON.parse(raw || '[]') as unknown;
    return Array.isArray(a) ? [...new Set(a.filter((x): x is string => typeof x === 'string' && TELE_PAD.has(x)))] : [];
  } catch {
    return [];
  }
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
  /** Tủ ngoại trang (P4): id món đã mở khóa (bảng `wardrobe`) và lựa chọn đang áp dụng (cột `look`). Chỉ để hiển thị, không đổi chỉ số. */
  wardrobe = new Set<string>();
  look: OutfitLook = emptyLook();
  /** Cần gửi lại `S.WARDROBE` cho chủ. */
  wardrobeDirty = true;

  /** Linh căn ngũ hành (`RootId`), gán lúc tạo nhân vật hoặc migration; đổi ở NPC (tx). */
  root: RootId = 'kim';
  /** Bình cảnh đã vượt cao nhất (0, 5, 10, 15). Tu vi chỉ tràn qua tầng 5/10/15 khi đã vượt. */
  bk = 0;
  /** Truyền Tống Trận đã mở khóa (không gồm trận mở sẵn `TELE_FREE`). Lưu ở cột `tele`. */
  tele: string[] = [];
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
  /** Buff công/thủ ngắn hạn của chiêu (Thiên Đan Pháp Giới): chỉ ở bộ nhớ, không lưu DB, không dính buff đan (`meta.buffs`); cộng dồn với đan trong `recalc`. */
  skillBuff: { atk?: { m: number; until: number }; def?: { m: number; until: number } } = {};
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
    c.xp = Math.min(row.xp, xpNeed(row.level));
    c.gold = row.gold;
    c.hp = row.hp;
    c.mp = row.mp;
    c.x = row.x;
    c.y = row.y;
    c.z = row.z;
    c.room = row.room;
    c.appearance = appearanceFromDb(APPEARANCE, row.appearance, row.name);
    c.root = isRootId(row.root) ? row.root : rootForName(row.name);
    c.bk = row.bk === 0 || BOTTLENECK_LEVELS.includes(row.bk) ? row.bk : initialBottleneck(row.level);
    c.tele = parseTele(row.tele);
    for (const r of db.select({ itemId: wardrobe.itemId }).from(wardrobe).where(eq(wardrobe.charId, id)).all()) {
      if (isWardrobeKind(ITEM.get(r.itemId)?.kind)) c.wardrobe.add(r.itemId);
    }
    c.look = outfitLookFromDb(row.look, c.appearance.g, (i) => ITEM.get(i), c.wardrobe, DYE_IDS);
    // Món nằm sai chỗ trong cột `equip` (DB hỏng/sửa tay): `stray` trả về túi, `dropped` (mẫu không còn) ghi sổ cái -1.
    let misplaced: { stray: InvItem[]; dropped: string[] } = { stray: [], dropped: [] };
    let rawEquip: Equipment | null = null;
    try {
      rawEquip = JSON.parse(row.equip) as Equipment;
      const clean = sanitizeEquip(rawEquip, c.appearance.g);
      c.equip = clean.equip;
      misplaced = clean;
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
        if (r.locked) it.lk = true;
        c.inv[r.slot] = it;
      }
    }
    // Giao dịch dọn hỏng (lỗi DB): KHÔNG giữ bản đã dọn trong bộ nhớ, nếu không lần ghi thành công kế tiếp sẽ ghi đè cột `equip`
    // thiếu món `stray` (mất đồ không có ledger). Giữ nguyên nội dung cột như trong DB; lần nạp sau sẽ thử dọn lại.
    if (
      (misplaced.stray.length || misplaced.dropped.length) &&
      !c.settleMisplaced(misplaced.stray, misplaced.dropped) &&
      rawEquip &&
      typeof rawEquip === 'object'
    )
      c.equip = rawEquip;
    c.recalc();
    if (c.hp > c.mhp) c.hp = c.mhp;
    if (c.mp > c.mmp) c.mp = c.mmp;
    return c;
  }

  /**
   * Dọn món nằm sai ô lúc nạp, trong MỘT giao dịch để sổ cái luôn khớp: món còn mẫu được trả về ô túi trống (không đổi số lượng
   * nên không cần dòng ledger), hết chỗ hoặc mẫu không còn thì ghi ledger -1 với lý do `load:drop`. Cột `equip` được ghi lại bản đã dọn.
   */
  private settleMisplaced(stray: InvItem[], dropped: string[]): boolean {
    const ok = this.tx('load:drop', null, (d) => {
      for (const it of stray) {
        const i = d.inv.findIndex((s) => !s);
        if (i >= 0) d.inv[i] = it;
        else d.bump(it.id, -1);
      }
      for (const id of dropped) d.bump(id, -1);
      return true;
    });
    if (!ok) log.error('[load] không dọn được món sai ô của nhân vật', this.id, this.txFail);
    return ok;
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
    // Nội tại công pháp (3-10): kiếm tu cộng bạo kích gốc, hộ pháp cộng khí huyết tối đa.
    const mp0 = methodOf(this.meta)?.passive;
    const critAdd = buffCrit + (mp0?.critBase ?? 0);
    this.stats = critAdd > 0 ? { ...st, critRate: Math.min(st.critRate + critAdd, STAT_CAPS.critRate) } : st;
    // Bản mệnh pháp bảo Ngưng Đan Lô (E2-E): khí huyết tối đa cộng thêm theo cấp của chủ.
    const bondedHp = bondedHpPassive(this.level);
    this.mhp = mp0?.hpMul || bondedHp > 0 ? Math.round(st.hp * (1 + (mp0?.hpMul ?? 0) + bondedHp)) : st.hp;
    // Nội tại pháp bảo (P3-8): Hồ Lô cộng linh lực tối đa, Thanh Liên Ấn cộng phòng ngự.
    const mpPas = passiveValue(this.equip, this.meta, 'mp');
    this.mmp = mpPas > 0 ? Math.round(st.mp * (1 + mpPas)) : st.mp;
    const sb = (k: 'atk' | 'def'): number => ((this.skillBuff[k]?.until ?? 0) > now ? this.skillBuff[k]!.m : 0);
    const atkBuff = buffMag(this.meta.buffs, 'atk', now) + sb('atk');
    this.atk = atkBuff > 0 ? Math.round(st.atk * (1 + atkBuff)) : st.atk;
    // Nội tại Kim Thân: phòng ngự cộng thêm theo tỉ lệ.
    this.def = Math.round(
      st.def *
        (1 + methodDefMul(this.meta) + passiveValue(this.equip, this.meta, 'def') + buffMag(this.meta.buffs, 'def', now) + sb('def')),
    );
    if (this.hp > this.mhp) this.hp = this.mhp;
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

  /** Trận đã mở (kể cả trận mở sẵn). */
  teleOpen(): string[] {
    return [...TELE_FREE, ...this.tele.filter((id) => !TELE_FREE.includes(id))];
  }

  /** Mở khóa một trận; true nếu là lần đầu (ghi ngay vào DB). Id lạ bị bỏ qua. */
  unlockTele(id: string): boolean {
    if (!TELE_PAD.has(id) || TELE_FREE.includes(id) || this.tele.includes(id)) return false;
    this.tele.push(id);
    db.update(characters)
      .set({ tele: JSON.stringify(this.tele) })
      .where(eq(characters.id, this.id))
      .run();
    return true;
  }

  /** Đổi ngoại hình (chỉ lệnh GM thử); `a` phải đã qua `parseAppearance`. Ghi ngay. */
  setAppearance(a: Appearance): void {
    this.appearance = a;
    db.update(characters)
      .set({ appearance: JSON.stringify(a) })
      .where(eq(characters.id, this.id))
      .run();
  }

  /** Lưu các trường thay đổi liên tục (không phải vật phẩm/tiền — chúng lưu ngay trong transaction). */
  save(): void {
    db.update(characters)
      .set({
        level: this.level,
        bk: this.bk,
        tele: JSON.stringify(this.tele),
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
    // Mở khóa tủ ngoại trang: tính từ bản nháp và ghi TRONG cùng transaction (không có cửa sổ "đã vào túi nhưng chưa vào tủ").
    const unlock = this.newWardrobeIds(d);
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
          at(rows, 0).idem = idem;
        }
        if (rows.length) tx.insert(ledger).values(rows).run();
        for (let i = 0; i < INV_SIZE; i++) {
          const a = this.inv[i] ?? null;
          const b = d.inv[i] ?? null;
          if (sameSlot(a, b)) continue;
          if (b) {
            const inst = b.inst ? JSON.stringify(b.inst) : null;
            tx.insert(items)
              .values({ charId: this.id, slot: i, itemId: b.id, qty: b.n, plus: b.plus ?? 0, inst, locked: b.lk ? 1 : 0 })
              .onConflictDoUpdate({
                target: [items.charId, items.slot],
                set: { itemId: b.id, qty: b.n, plus: b.plus ?? 0, inst, locked: b.lk ? 1 : 0 },
              })
              .run();
          } else {
            tx.delete(items)
              .where(and(eq(items.charId, this.id), eq(items.slot, i)))
              .run();
          }
        }
        for (const id of unlock) tx.insert(wardrobe).values({ charId: this.id, itemId: id, at: ts }).onConflictDoNothing().run();
        tx.update(characters)
          .set({
            gold: d.gold,
            equip: JSON.stringify(d.equip),
            ...(d.root ? { root: d.root } : {}),
            ...(d.look ? { look: outfitLookToDb(d.look) } : {}),
          })
          .where(eq(characters.id, this.id))
          .run();
      });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes('UNIQUE')) {
        this.txFail = 'dup';
      } else {
        this.txFail = 'db';
        log.error('[tx] lỗi ghi DB:', reason, msg);
      }
      return false;
    }
    // Chỉ sau khi commit thành công mới đổi bộ nhớ và báo cho chủ.
    for (const id of unlock) this.wardrobe.add(id);
    if (d.look) this.look = d.look;
    if (unlock.length || d.look) this.wardrobeDirty = true;
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

  /** Món có hình trên người đang ở túi/trang bị của bản nháp mà chưa có trong tủ. */
  private newWardrobeIds(d: InvDraft): string[] {
    const out = new Set<string>();
    const see = (id: string | undefined) => {
      if (id && !this.wardrobe.has(id) && isWardrobeKind(ITEM.get(id)?.kind)) out.add(id);
    };
    for (const s of d.inv) see(s?.id);
    for (const k of WEAR_SLOTS) see(d.equip[k]?.id);
    return [...out];
  }

  /** Cộng tu vi. Trả về số cấp vừa lên (tự lên giữa các nút bình cảnh; dừng ở bình cảnh chưa vượt và ở đại viên mãn 15/19/23/27). */
  gainXp(n: number): number {
    if (n <= 0) return 0;
    let ups = 0;
    this.xp += n;
    for (;;) {
      const need = xpNeed(this.level);
      if (isPeakLevel(this.level) || this.level >= MAX_LEVEL || bottleneckBlocked(this.level, this.bk)) {
        // Viên mãn (15/19/23/27) hoặc kẹt bình cảnh (chưa vượt): phải độ kiếp / vượt bình cảnh mới lên tiếp,
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
   * Vượt bình cảnh (thắng tâm ma hoặc dùng Phá Cảnh Đan). Server đã kiểm điều kiện. Nút trung kỳ (5/10/17/21/25): lên một cấp, tu vi
   * về 0 (tu vi không tràn qua bình cảnh). Đại viên mãn (15/19/23/27): chỉ mở đường độ kiếp, tu vi giữ đầy. Trả về tầng mới.
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
    for (const k of WEAR_SLOTS) if (this.equip[k]?.id === id) n++;
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
      if (!prog) continue;
      const was = this.questComplete(id);
      let changed = false;
      q.objectives.forEach((o, i) => {
        if (o.type !== type) return;
        if (o.target && o.target !== target) return;
        const cur = prog[i] ?? 0;
        if (cur >= o.count) return;
        const next = type === 'level' || type === 'enhance' ? Math.min(o.count, Math.max(cur, n)) : Math.min(o.count, cur + n);
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
    if (!inst) log.warn('[load] inst trong túi bị bác, về chỉ số mẫu:', itemId);
    return inst;
  } catch {
    return null;
  }
}

/**
 * Đọc JSON trang bị: chỉ giữ ô hợp lệ, mẫu còn tồn tại, `inst` đã qua kiểm. Món không được ở ô đó không bị lặng lẽ xóa:
 * `stray` = món còn mẫu nhưng sai lớp ô (skin nằm ở ô có chỉ số, hoặc món không phải skin nằm ở ô skin) để trả về túi;
 * `dropped` = id món mà mẫu không còn tồn tại, để ghi sổ cái.
 */
function sanitizeEquip(raw: unknown, gender: string): { equip: Equipment; stray: InvItem[]; dropped: string[] } {
  const out: Equipment = {};
  const stray: InvItem[] = [];
  const dropped: string[] = [];
  if (!raw || typeof raw !== 'object') return { equip: out, stray, dropped };
  for (const k of EQUIP_SLOTS) {
    const e = (raw as Record<string, InvItem | undefined>)[k];
    if (!e || typeof e.id !== 'string') continue;
    const kind = ITEM.get(e.id)?.kind;
    if (!kind) {
      log.warn('[load] bỏ trang bị có mẫu không còn tồn tại:', e.id);
      dropped.push(e.id);
      continue;
    }
    // Skin ở ô có chỉ số: không bao giờ hợp lệ (ô đó sẽ vào tính chỉ số, nâng cấp): trả về túi.
    if (!isEquipSlot(kind)) {
      log.warn('[load] món không phải trang bị nằm ở ô có chỉ số, trả về túi:', e.id, 'ở', k);
      stray.push({ id: e.id, n: 1 });
      continue;
    }
    if (kind !== k) log.warn('[load] trang bị lệch ô (giữ nguyên):', e.id, 'ở', k);
    const it: InvItem = { id: e.id, n: 1 };
    if (e.plus && e.plus > 0) it.plus = Math.min(e.plus | 0, MAX_ENHANCE);
    const inst = e.inst ? parseInst(ITEM_SYS, k, e.inst) : null;
    if (inst) it.inst = inst;
    else if (e.inst) log.warn('[load] inst trang bị bị bác, về chỉ số mẫu:', e.id, k);
    out[k] = it;
  }
  // Ô ngoại hình: chỉ giữ món còn tồn tại và đúng loại; không có plus/inst (skin không có chỉ số).
  for (const k of COSMETIC_SLOTS) {
    const e = (raw as Record<string, InvItem | undefined>)[k];
    if (!e || typeof e.id !== 'string') continue;
    const def = ITEM.get(e.id);
    // Đúng loại nhưng sai giới (vd. nhân vật nam còn mặc skin chỉ cho nữ từ trước khi có giới hạn, hoặc đổi giới tính): cũng trả về túi.
    if (def?.kind === k && wearableBy(def, gender)) out[k] = { id: e.id, n: 1 };
    else if (def) {
      // Món khác loại hoặc sai giới nằm ở ô skin: trả về túi, giữ cấp cường hóa và dòng đã roll nếu là trang bị.
      log.warn('[load] món không hợp lệ ở ô ngoại hình (sai loại hoặc sai giới), trả về túi:', e.id);
      const it: InvItem = { id: e.id, n: 1 };
      if (isEquipSlot(def.kind)) {
        if (e.plus && e.plus > 0) it.plus = Math.min(e.plus | 0, MAX_ENHANCE);
        const inst = e.inst ? parseInst(ITEM_SYS, def.kind, e.inst) : null;
        if (inst) it.inst = inst;
      }
      stray.push(it);
    } else {
      log.warn('[load] bỏ món ở ô ngoại hình có mẫu không còn tồn tại:', e.id);
      dropped.push(e.id);
    }
  }
  return { equip: out, stray, dropped };
}

export { isEquipSlot };
