// Nâng cấp trang bị Phase 3-3 phía server: cường hóa (có Hộ Phù), khảm/tháo/ghép linh ngọc, tẩy luyện dòng phụ, phân giải.
// Tách khỏi sim.ts để ít xung đột; sim.ts chỉ nối hai lệnh (`enh`, `upg`) và cho mượn `UpgradeHost`.
//
// Nguyên tắc (xem CLAUDE.md):
//  - Server quyết định mọi xác suất: seed chọn ở đây, ghi vào lý do ledger để truy vết.
//  - Mỗi thao tác là MỘT `Character.tx`: kiểm lại mọi điều kiện trên bản nháp (không tin trạng thái đọc trước đó),
//    có khóa idem, ghi ledger. Bản nháp là bản sao của túi hiện tại và tx chạy đồng bộ nên hai message song song
//    (khảm + tháo + phân giải cùng một món) luôn xử lý tuần tự, món đã đổi thì message sau không còn khớp và bị hủy.
//  - Client chỉ gửi ý định: món nào (ô đang mặc `w` hoặc ô túi `i`), ngọc nào, dòng phụ nào. Không gửi giá trị.

import { randomInt } from 'node:crypto';
import {
  DUST_ITEM,
  enhanceChance,
  enhanceCost,
  enhanceFail,
  ENHANCE_RISK_FROM,
  type EquipSlot,
  type FxMsg,
  gemMergeCost,
  gemRemoveCost,
  gemSocketCost,
  GEM_MERGE_COUNT,
  GEM_TIERS,
  gemId,
  INV_SIZE,
  type InvItem,
  isEquipSlot,
  isInstance,
  legacyQuality,
  MAX_ENHANCE,
  parseGem,
  pickQuality,
  PROMOTE_MAT,
  PROMOTE_MAT_COUNT,
  promoteGold,
  promoteInst,
  promoteOpen,
  promotePlus,
  REFINE_ITEM,
  refineCost,
  rollAffixes,
  salvageYield,
  SALVAGE_MAX_BATCH,
  seededRng,
  WARD_ITEM,
} from '@dtl/shared';
import { ENHANCE_ORE, FORGE_BY_ID, ITEM, ITEM_SYS, itemTier, NPC, promoteTarget, t } from '@dtl/content';
import type { InvDraft } from './character';
import type { PlayerEnt } from './entities';

import { at } from '@dtl/shared';
/** Phần sim mà hệ nâng cấp cần mượn (sim.ts truyền vào). */
export interface UpgradeHost {
  now(): number;
  isDead(p: PlayerEnt): boolean;
  nearNpc(p: PlayerEnt, npcId: string): boolean;
  idem(p: PlayerEnt, r: unknown): string | null | undefined;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  fx(m: FxMsg): void;
  /** Ghi nhận sự kiện nhiệm vụ (M-5: cường hóa đạt +N). */
  questEvent(p: PlayerEnt, type: 'enhance', target: undefined, n: number): void;
}

/** Món cần xử lý: ô đang mặc (`w`) hoặc ô túi (`i`). */
export type ItemRef = { w: EquipSlot } | { i: number };

export function parseRef(m: { w?: unknown; i?: unknown } | null | undefined): ItemRef | null {
  if (!m) return null;
  if (m.w !== undefined) return isEquipSlot(m.w) ? { w: m.w } : null;
  if (Number.isInteger(m.i) && (m.i as number) >= 0 && (m.i as number) < INV_SIZE) return { i: m.i as number };
  return null;
}

function getRef(inv: { inv: (InvItem | null)[]; equip: Partial<Record<EquipSlot, InvItem>> }, r: ItemRef): InvItem | null {
  return 'w' in r ? (inv.equip[r.w] ?? null) : (inv.inv[r.i] ?? null);
}

function putRef(d: InvDraft, r: ItemRef, it: InvItem | null): void {
  if ('w' in r) {
    if (it) d.equip[r.w] = it;
    else delete d.equip[r.w];
  } else {
    d.inv[r.i] = it;
  }
}

/** Tối thiểu giữa hai thao tác nâng cấp của một người (mỗi lần là một giao dịch DB + dòng ledger). */
const UPGRADE_CD_MS = 250;

export class UpgradeSystem {
  private cdAt = new WeakMap<PlayerEnt, number>();

  constructor(private h: UpgradeHost) {}

  /** Kiểm chung: còn sống, đứng gần Thiết lão, không đang tâm ma, khóa idem hợp lệ, qua giới hạn tần suất. */
  private begin(p: PlayerEnt, msg: unknown): { m: Record<string, unknown>; idem: string } | null {
    const m = msg as Record<string, unknown> | null;
    if (!m || typeof m.npc !== 'string') return null;
    if (this.h.isDead(p)) return null;
    const idem = this.h.idem(p, m.r);
    if (idem === undefined || idem === null) return null;
    const npc = NPC.get(m.npc);
    if (!npc || !npc.enhance) return null;
    if (!this.h.nearNpc(p, npc.id)) {
      this.h.warn(p, 'sys.too_far');
      return null;
    }
    // Đang tâm ma: chỉ số bóng dựng theo lúc bắt đầu, không đổi đồ giữa chừng (giống onEquip).
    if (p.trial) {
      this.h.warn(p, 'sys.busy');
      return null;
    }
    if (this.h.now() < (this.cdAt.get(p) ?? 0)) return null;
    this.cdAt.set(p, this.h.now() + UPGRADE_CD_MS);
    return { m, idem };
  }

  private itemName(it: InvItem, plus?: number): string {
    return t(`item.${it.id}.name`) + (plus ? ` +${plus}` : '');
  }

  // ---------- cường hóa ----------

  /** Lệnh `enh`: `{ npc, w | i, ward?, r }`. Thất bại không vỡ đồ; từ +7 rớt một cấp trừ khi dùng Hộ Phù. */
  onEnhance(p: PlayerEnt, msg: unknown): void {
    const b = this.begin(p, msg);
    if (!b) return;
    // `slot` là tên cũ của trường ô đang mặc.
    const ref = parseRef({ w: b.m.w ?? b.m.slot, i: b.m.i });
    if (!ref) return;
    const c = p.char;
    const it0 = getRef(c, ref);
    const def = it0 ? ITEM.get(it0.id) : undefined;
    if (!it0 || !def || !isEquipSlot(def.kind)) return;
    const plus = it0.plus ?? 0;
    if (plus >= MAX_ENHANCE) return this.h.warn(p, 'sys.enh_max');
    const cost = enhanceCost(plus, Math.max(def.price, def.sell * 3));
    if (c.gold < cost.gold) return this.h.warn(p, 'sys.not_enough_gold');
    const wantWard = b.m.ward === true;
    // Seed do server chọn; kết quả suy ra từ seed nên ledger tái hiện được.
    const seed = randomInt(0x7fffffff);
    const success = seededRng(seed)() < enhanceChance(plus);
    let outcome = (success ? 'ok' : 'fail') as 'ok' | 'fail' | 'drop' | 'ward';
    let newPlus = plus;
    const ok = c.tx(`enhance:${success ? 'ok' : 'fail'}:${it0.id}+${plus}`, b.idem, (d) => {
      const cur = getRef(d, ref);
      // Món ở ô đó phải đúng món đã đọc (không đổi giữa lúc đọc và lúc ghi).
      if (!cur || cur.id !== it0.id || (cur.plus ?? 0) !== plus) return false;
      if (wantWard && plus >= ENHANCE_RISK_FROM && d.count(WARD_ITEM) < 1) return false;
      if (!d.remove(ENHANCE_ORE, cost.ore) || !d.spendGold(cost.gold)) return false;
      newPlus = plus;
      if (success) {
        newPlus = plus + 1;
      } else {
        const f = enhanceFail(plus, wantWard);
        newPlus = f.plus;
        if (f.wardUsed && !d.remove(WARD_ITEM, 1)) return false;
        outcome = f.wardUsed ? 'ward' : newPlus < plus ? 'drop' : 'fail';
      }
      const next: InvItem = { ...cur };
      if (newPlus > 0) next.plus = newPlus;
      else delete next.plus;
      putRef(d, ref, next);
      d.rollSeeds.push(String(seed));
      return true;
    });
    if (!ok) return this.h.warn(p, 'sys.not_enough_mat');
    if ('w' in ref) c.recalc();
    const name = t(`item.${def.id}.name`);
    if (outcome === 'ok') {
      this.h.questEvent(p, 'enhance', undefined, newPlus);
      this.h.sys(p, 'sys.enh_ok', { item: name, n: newPlus }, 'good');
      this.h.fx({ t: 'enhance', src: p.sid });
    } else if (outcome === 'ward') {
      this.h.sys(p, 'sys.enh_fail_ward', { item: name }, 'info');
    } else if (outcome === 'drop') {
      this.h.sys(p, 'sys.enh_fail_drop', { item: name, n: newPlus }, 'bad');
    } else {
      this.h.sys(p, 'sys.enh_fail', undefined, 'bad');
    }
  }

  // ---------- các thao tác khác: một lệnh `upg` với trường `op` ----------

  /**
   * Lệnh `upg`: `{ npc, op, r, ... }` với op:
   *  - 'socket'   { w|i, idx, gem }  khảm ngọc `gem` (id) vào lỗ `idx`; lỗ đã có ngọc thì ngọc cũ mất
   *  - 'unsocket' { w|i, idx }       tháo ngọc về túi (mất linh thạch)
   *  - 'merge'    { gem }            ghép 3 ngọc cùng cấp thành 1 cấp trên
   *  - 'refine'   { w|i, idx }       tẩy luyện dòng phụ `idx`; các dòng khác khóa
   *  - 'salvage'  { slots: number[] } phân giải các món ở túi thành Thiết Tinh/Linh Trần
   *  - 'forge'    { id }             chế một món của bộ (công thức `forge.json`); phẩm do server roll
   *  - 'promote'  { w|i }            Thăng Bậc (E2-F): món bậc n → món cùng ô bậc n+1, giữ phẩm/dòng phụ/ngọc
   */
  onUpgrade(p: PlayerEnt, msg: unknown): void {
    const b = this.begin(p, msg);
    if (!b) return;
    switch (b.m.op) {
      case 'socket':
        return this.socket(p, b.m, b.idem);
      case 'unsocket':
        return this.unsocket(p, b.m, b.idem);
      case 'merge':
        return this.merge(p, b.m, b.idem);
      case 'refine':
        return this.refine(p, b.m, b.idem);
      case 'salvage':
        return this.salvage(p, b.m, b.idem);
      case 'forge':
        return this.forge(p, b.m, b.idem);
      case 'promote':
        return this.promote(p, b.m, b.idem);
    }
  }

  /** Đọc món đã roll cần đổi (có `inst`, là trang bị) cùng chỉ số lỗ/dòng. */
  private target(p: PlayerEnt, m: Record<string, unknown>): { ref: ItemRef; it: InvItem; idx: number } | null {
    const ref = parseRef(m as { w?: unknown; i?: unknown });
    if (!ref || !Number.isInteger(m.idx)) return null;
    const it = getRef(p.char, ref);
    const def = it ? ITEM.get(it.id) : undefined;
    if (!it || !def || !isEquipSlot(def.kind) || !isInstance(it)) {
      this.h.warn(p, 'sys.upg_bad_target');
      return null;
    }
    return { ref, it, idx: m.idx as number };
  }

  private socket(p: PlayerEnt, m: Record<string, unknown>, idem: string): void {
    const tg = this.target(p, m);
    const g = parseGem(m.gem);
    if (!tg || !g) return;
    const inst0 = tg.it.inst!;
    if (tg.idx < 0 || tg.idx >= inst0.gems.length) return this.h.warn(p, 'sys.upg_no_socket');
    const gem = m.gem as string;
    const fee = gemSocketCost(g.tier);
    if (p.char.gold < fee) return this.h.warn(p, 'sys.not_enough_gold');
    const ok = p.char.tx(`socket:${tg.it.id}:${tg.idx}:${gem}`, idem, (d) => {
      const cur = getRef(d, tg.ref);
      if (!cur || cur.id !== tg.it.id || !cur.inst || tg.idx >= cur.inst.gems.length) return false;
      if (!d.remove(gem, 1) || !d.spendGold(fee)) return false;
      const gems = cur.inst.gems.slice();
      gems[tg.idx] = gem;
      putRef(d, tg.ref, { ...cur, inst: { ...cur.inst, gems } });
      return true;
    });
    if (!ok) return this.h.warn(p, 'sys.not_enough_mat');
    if ('w' in tg.ref) p.char.recalc();
    this.h.sys(p, 'sys.gem_socketed', { gem: t(`item.${gem}.name`), item: this.itemName(tg.it) }, 'good');
    this.h.fx({ t: 'enhance', src: p.sid });
  }

  private unsocket(p: PlayerEnt, m: Record<string, unknown>, idem: string): void {
    const tg = this.target(p, m);
    if (!tg) return;
    const gem0 = tg.it.inst!.gems[tg.idx] ?? '';
    const g = parseGem(gem0);
    if (!g) return this.h.warn(p, 'sys.upg_no_socket');
    const fee = gemRemoveCost(g.tier);
    if (p.char.gold < fee) return this.h.warn(p, 'sys.not_enough_gold');
    const ok = p.char.tx(`unsocket:${tg.it.id}:${tg.idx}:${gem0}`, idem, (d) => {
      const cur = getRef(d, tg.ref);
      // Ngọc trong lỗ phải đúng viên đã đọc: hai lệnh tháo song song chỉ một lệnh qua (lệnh sau thấy lỗ trống).
      if (!cur || cur.id !== tg.it.id || !cur.inst || cur.inst.gems[tg.idx] !== gem0) return false;
      if (!d.spendGold(fee)) return false;
      const gems = cur.inst.gems.slice();
      gems[tg.idx] = '';
      putRef(d, tg.ref, { ...cur, inst: { ...cur.inst, gems } });
      return d.add(gem0, 1);
    });
    if (!ok) return this.h.warn(p, p.char.txFail === 'abort' ? 'sys.inv_full' : 'sys.upg_bad_target');
    if ('w' in tg.ref) p.char.recalc();
    this.h.sys(p, 'sys.gem_removed', { gem: t(`item.${gem0}.name`), item: this.itemName(tg.it) }, 'info');
  }

  private merge(p: PlayerEnt, m: Record<string, unknown>, idem: string): void {
    const g = parseGem(m.gem);
    if (!g || g.tier >= GEM_TIERS) return;
    const gem = m.gem as string;
    const out = gemId(g.elem, g.tier + 1);
    const cost = gemMergeCost(g.tier);
    const c = p.char;
    if (c.gold < cost.gold) return this.h.warn(p, 'sys.not_enough_gold');
    const ok = c.tx(
      `merge:${gem}`,
      idem,
      (d) => d.remove(gem, GEM_MERGE_COUNT) && d.remove(DUST_ITEM, cost.dust) && d.spendGold(cost.gold) && d.add(out, 1),
    );
    if (!ok) return this.h.warn(p, c.txFail === 'abort' ? 'sys.not_enough_mat' : 'sys.upg_bad_target');
    this.h.sys(p, 'sys.gem_merged', { gem: t(`item.${out}.name`) }, 'good');
    this.h.fx({ t: 'craft', src: p.sid });
  }

  private refine(p: PlayerEnt, m: Record<string, unknown>, idem: string): void {
    const tg = this.target(p, m);
    if (!tg) return;
    const inst0 = tg.it.inst!;
    if (tg.idx < 0 || tg.idx >= inst0.affixes.length) return this.h.warn(p, 'sys.upg_no_socket');
    const cost = refineCost(inst0.ilvl, inst0.q);
    if (p.char.gold < cost.gold) return this.h.warn(p, 'sys.not_enough_gold');
    const slot = ITEM.get(tg.it.id)!.kind as EquipSlot;
    // Dòng bị đổi: đúng dòng đã đọc (id + giá trị) để hai lệnh song song không đổi nhầm dòng đã dịch chỗ.
    const old = inst0.affixes[tg.idx];
    const seed = randomInt(0x7fffffff);
    const ok = p.char.tx(`refine:${tg.it.id}:${tg.idx}`, idem, (d) => {
      const cur = getRef(d, tg.ref);
      const inst = cur?.inst;
      if (!cur || cur.id !== tg.it.id || !inst) return false;
      const now = inst.affixes[tg.idx];
      if (!old || !now || now.id !== old.id || now.p !== old.p || now.v !== old.v) return false;
      if (!d.remove(REFINE_ITEM, cost.stones) || !d.remove(DUST_ITEM, cost.dust) || !d.spendGold(cost.gold)) return false;
      // Roll một dòng mới, không trùng các dòng đang khóa (dòng cũ được phép ra lại).
      const locked = inst.affixes.filter((_, i) => i !== tg.idx);
      const [fresh] = rollAffixes(ITEM_SYS, slot, 1, inst.ilvl, inst.q, seededRng(seed), locked);
      if (!fresh) return false;
      const affixes = inst.affixes.slice();
      affixes[tg.idx] = fresh;
      putRef(d, tg.ref, { ...cur, inst: { ...inst, affixes } });
      d.rollSeeds.push(`${seed}:${old.id}->${fresh.id}`);
      return true;
    });
    if (!ok) return this.h.warn(p, 'sys.not_enough_mat');
    if ('w' in tg.ref) p.char.recalc();
    this.h.sys(p, 'sys.refined', { item: this.itemName(tg.it) }, 'good');
    this.h.fx({ t: 'enhance', src: p.sid });
  }

  private salvage(p: PlayerEnt, m: Record<string, unknown>, idem: string): void {
    const raw = m.slots;
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > SALVAGE_MAX_BATCH) return;
    const slots: number[] = [];
    for (const s of raw) {
      if (!Number.isInteger(s) || s < 0 || s >= INV_SIZE || slots.includes(s)) return;
      slots.push(s);
    }
    // Món phải còn đúng như client thấy: gửi kèm id mong đợi để không phân giải nhầm khi túi đã xếp lại.
    const ids = Array.isArray(m.ids) ? (m.ids as unknown[]) : [];
    if (ids.length !== slots.length) return;
    let ore = 0;
    let dust = 0;
    let n = 0;
    const ok = p.char.tx(`salvage:${slots.length}`, idem, (d) => {
      let totalOre = 0;
      let totalDust = 0;
      const gems: string[] = [];
      for (let k = 0; k < slots.length; k++) {
        const it = d.inv[at(slots, k)];
        const def = it ? ITEM.get(it.id) : undefined;
        // Chỉ trang bị trong túi (không đụng đồ đang mặc, nguyên liệu, đan dược).
        if (!it || it.id !== ids[k] || !def || !isEquipSlot(def.kind) || it.n !== 1) return false;
        if (it.lk) return false;
        const q = it.inst ? it.inst.q : legacyQuality(def.rarity);
        const y = salvageYield(q, it.plus ?? 0, it.inst ? 0 : def.price, ITEM.get(ENHANCE_ORE)?.price ?? 0);
        totalOre += y.ore;
        totalDust += y.dust;
        for (const g of it.inst?.gems ?? []) if (g) gems.push(g);
        if (!d.removeAt(at(slots, k), 1)) return false;
      }
      // Ngọc đã khảm không mất: trả về túi.
      if (totalOre > 0 && !d.add(ENHANCE_ORE, totalOre)) return false;
      if (totalDust > 0 && !d.add(DUST_ITEM, totalDust)) return false;
      for (const g of gems) if (!d.add(g, 1)) return false;
      ore = totalOre;
      dust = totalDust;
      n = slots.length;
      return true;
    });
    if (!ok) return this.h.warn(p, p.char.txFail === 'abort' ? 'sys.inv_full' : 'sys.upg_bad_target');
    this.h.sys(p, 'sys.salvaged', { n, ore, dust }, 'good');
    this.h.fx({ t: 'craft', src: p.sid });
  }

  // ---------- Thăng Bậc (E2-F) ----------

  /**
   * Thăng Bậc: món bậc n (ở túi hoặc đang mặc) + 20 nguyên liệu bậc n+1 + linh thạch → món đích cùng ô, bậc n+1.
   * Giữ phẩm, dòng phụ, ngọc đã khảm và ràng buộc; dòng chính roll lại theo bậc mới (seed server, ghi ledger);
   * cấp cường hóa trừ `PROMOTE_ENHANCE_LOSS`. Client chỉ gửi ô; đích, giá và nguyên liệu do server suy ra.
   */
  private promote(p: PlayerEnt, m: Record<string, unknown>, idem: string): void {
    const ref = parseRef(m as { w?: unknown; i?: unknown });
    if (!ref) return;
    const c = p.char;
    const it0 = getRef(c, ref);
    const def = it0 ? ITEM.get(it0.id) : undefined;
    if (!it0 || !def || !isEquipSlot(def.kind) || def.kind === 'artifact' || !isInstance(it0)) return this.h.warn(p, 'sys.upg_bad_target');
    const from = itemTier(def.id);
    if (!promoteOpen(from)) return this.h.warn(p, 'sys.promote_locked');
    const toId = promoteTarget(def.id);
    const toDef = toId ? ITEM.get(toId) : undefined;
    if (!toId || !toDef) return this.h.warn(p, 'sys.promote_none');
    // Đồ đang mặc mà đích đòi cảnh giới cao hơn thì món mặc không hợp lệ: chặn ngay từ đầu.
    if ((toDef.reqLevel ?? 1) > c.level) return this.h.warn(p, 'sys.equip_level');
    const to = itemTier(toId);
    const mat = PROMOTE_MAT[to];
    const gold = promoteGold(to);
    if (!mat) return this.h.warn(p, 'sys.promote_locked');
    if (c.gold < gold) return this.h.warn(p, 'sys.not_enough_gold');
    const seed = randomInt(0x7fffffff);
    const slot = def.kind as EquipSlot;
    const ok = c.tx(`promote:${def.id}->${toId}`, idem, (d) => {
      const cur = getRef(d, ref);
      // Món ở ô đó phải đúng món đã đọc (hai lệnh song song: lệnh sau thấy món đã đổi id và bị hủy).
      if (!cur || cur.id !== it0.id || !cur.inst || cur.n !== 1) return false;
      if (!d.remove(mat, PROMOTE_MAT_COUNT) || !d.spendGold(gold)) return false;
      const next: InvItem = { id: toId, n: 1, inst: promoteInst(ITEM_SYS, slot, cur.inst, to, seededRng(seed)) };
      if (cur.lk) next.lk = true;
      const plus = promotePlus(cur.plus ?? 0);
      if (plus > 0) next.plus = plus;
      putRef(d, ref, next);
      // Đổi id mẫu: ghi hai dòng ledger (−món cũ, +món mới) để đối soát vật phẩm không lệch.
      d.bump(cur.id, -1);
      d.bump(toId, 1);
      d.rollSeeds.push(`promote:${seed}`);
      return true;
    });
    if (!ok) return this.h.warn(p, 'sys.promote_mats');
    if ('w' in ref) c.recalc();
    this.h.sys(p, 'sys.promoted', { item: t(`item.${def.id}.name`), to: t(`item.${toId}.name`) }, 'good');
    this.h.fx({ t: 'craft', src: p.sid });
  }

  // ---------- chế tạo bộ trang bị (P3-4) ----------

  /**
   * Chế một món của bộ: tiêu nguyên liệu + linh thạch, rồi roll phẩm (seed server) và dòng chính/phụ như đồ rơi.
   * Một transaction, khóa idem, seed ghi vào ledger. Công thức đòi đúng NPC đang đứng gần (`begin` kiểm).
   */
  private forge(p: PlayerEnt, m: Record<string, unknown>, idem: string): void {
    const rcp = typeof m.id === 'string' ? FORGE_BY_ID.get(m.id) : undefined;
    if (!rcp || (rcp.npc !== m.npc && !rcp.alsoAt?.includes(m.npc as string))) return;
    const c = p.char;
    if (rcp.reqLevel && c.level < rcp.reqLevel) return this.h.warn(p, 'sys.craft_level');
    if (c.gold < rcp.gold) return this.h.warn(p, 'sys.not_enough_gold');
    const seed = randomInt(0x7fffffff);
    const q = pickQuality(rcp.q, seededRng(seed));
    if (q === null) return;
    let full = false;
    const ok = c.tx(`forge:${rcp.id}:q${q}`, idem, (d) => {
      for (const i of rcp.inputs) if (!d.remove(i.id, i.n)) return false;
      if (!d.spendGold(rcp.gold)) return false;
      if (!d.addRolled(rcp.output, rcp.ilvl, q)) {
        full = true;
        return false;
      }
      d.rollSeeds.push(`forge:${seed}`);
      return true;
    });
    if (!ok) return this.h.warn(p, full ? 'sys.inv_full' : 'sys.not_enough_mat');
    this.h.sys(p, 'sys.forged', { item: t(`item.${rcp.output}.name`), quality: t('ui.quality.' + q) }, 'loot');
    this.h.fx({ t: 'craft', src: p.sid });
  }
}
