// Kinh tế và nhiệm vụ (R-7): dùng/mặc/mua/bán/chế vật phẩm, công pháp và chiêu, trò chuyện NPC, nhận/giao nhiệm vụ, thu thập.
// Tách nguyên văn từ GameSim, chỉ nhận giao diện hẹp `EconomyCtx`; mọi đổi vật phẩm/tiền vẫn qua Character.tx (transaction + idem + sổ cái).
import { randomInt } from 'node:crypto';
import {
  pillPotency,
  PILL_TIERS,
  rollPillQuality,
  COMBAT_REGEN_DELAY,
  type DmgMsg,
  isWearSlot,
  wearableBy,
  type WearSlot,
  healAmount,
  methodSwitchCost,
  METHOD_SWITCH_COOLDOWN_SEC,
  METHOD_UNLOCK_LEVEL,
  MAX_SKILL_LEVEL,
  skillUpgradeCost,
  variantSwitchBlock,
  BIND_QUALITY,
  sellPrice,
  type InvItem,
  type FxMsg,
  INV_SIZE,
  type InvMsg,
  type InvSlot,
  S,
  type SkillDef,
  type SysMsg,
  tribDef,
} from '@dtl/shared';
import { PILL_QUALITY, ITEM, itemName, NPC, QUEST, realmName, RECIPE, SKILL, t, METHOD, VARIANTS, skillName } from '@dtl/content';
import { type Character, isEquipSlot, sameSlot } from '../character';
import { passiveOf, setSkillLevel, skillLevelOf } from '../method';
import type { DuelSystem } from '../duel';
import type { NodeEnt, PlayerEnt } from '../entities';
import type { TeleportSystem } from '../teleport';
import type { UpgradeSystem } from '../upgrade';

/** Quá số ô đổi này thì gửi ảnh túi đầy đủ thay vì delta. */
const INV_DELTA_MAX = 24;
/** Bí Tịch Tàn Quyển: nguyên liệu nâng cấp chiêu. */
const SKILL_SCROLL = 'itm_bi_tich_tan_quyen';
const METHOD_NPC = 'npc_chuong_mon';
/** Đan dược dùng lên đồng đội (Thanh Mộc Đan Kinh) trong tầm này (mét). */
const POTION_ALLY_RANGE = 12;
const GATHER_RANGE = 5;

/** Phần GameSim mà hệ kinh tế/nhiệm vụ cần. */
export interface EconomyCtx {
  applyPillBuff(
    p: PlayerEnt,
    def: { id: string; use?: { buff?: { kind: 'atk' | 'def' | 'crit' | 'ward'; pct: number; sec: number } } },
    potency: number,
  ): void;
  canAssist(p: PlayerEnt, o: PlayerEnt): boolean;
  readonly duel: DuelSystem;
  emit(type: string, payload: object): void;
  fx(m: FxMsg): void;
  giveXp(p: PlayerEnt, n: number, announce?: boolean): void;
  isDead(p: PlayerEnt): boolean;
  nearNpc(p: PlayerEnt, npcId: string): boolean;
  readonly nodes: Map<string, NodeEnt>;
  readonly now: number;
  readonly players: Map<string, PlayerEnt>;
  questEvent(p: PlayerEnt, type: Parameters<Character['questEvent']>[0], target: string | undefined, n: number): void;
  savePlayer(p: PlayerEnt): void;
  readonly sealHook: { peek(p: PlayerEnt): number; open(i: number): void } | null;
  sendCd(p: PlayerEnt): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string, drop?: Pick<SysMsg, 'i' | 'src' | 'q'>): void;
  readonly tele: TeleportSystem;
  readonly upgrade: UpgradeSystem;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
}

export class EconomySystem {
  constructor(private readonly c: EconomyCtx) {}

  onGather(p: PlayerEnt, msg: unknown): void {
    const id = (msg as { id?: unknown } | null)?.id;
    if (typeof id !== 'string') return;
    const n = this.c.nodes.get(id);
    if (!n || !n.s.on || this.c.isDead(p)) return;
    const dx = p.move.x - n.s.x;
    const dz = p.move.z - n.s.z;
    if (dx * dx + dz * dz > GATHER_RANGE * GATHER_RANGE || Math.abs(p.move.y - n.s.y) > 5) return this.c.warn(p, 'sys.gather_far');
    const qty = 1 + (Math.random() < 0.3 ? 1 : 0);
    if (!p.char.tx('gather', null, (d) => d.add(n.s.t, qty))) return this.c.warn(p, 'sys.inv_full');
    n.s.on = false;
    n.respawnAt = this.c.now + n.respawn * 1000;
    this.c.sys(p, 'sys.loot', { item: itemName(n.s.t), n: qty }, 'loot', { i: n.s.t, src: id });
    this.c.questEvent(p, 'gather', n.s.t, qty);
    this.c.fx({ t: 'gather', src: p.sid, x: n.s.x, y: n.s.y, z: n.s.z });
  }

  // ---------- vật phẩm ----------

  /**
   * Tin S.INV: gửi phần thay đổi (`d`) so với lần gửi trước khi ít ô đổi, còn lại gửi ảnh đầy đủ (lần đầu, hoặc đổi > INV_DELTA_MAX ô như sắp xếp).
   * `invSent` là ảnh client đang có (các tin S.INV trước; chưa có thì tin đầu tiên là ảnh đầy đủ).
   */
  invMsg(p: PlayerEnt): InvMsg {
    const c = p.char;
    const prev = p.invSent;
    p.invSent = c.inv.slice();
    if (!prev) return { inv: c.inv, equip: c.equip };
    const d: [number, InvSlot][] = [];
    for (let i = 0; i < INV_SIZE; i++) if (!sameSlot(prev[i] ?? null, c.inv[i] ?? null)) d.push([i, c.inv[i] ?? null]);
    return d.length > INV_DELTA_MAX ? { inv: c.inv, equip: c.equip } : { d, equip: c.equip };
  }

  idem(p: PlayerEnt, r: unknown): string | null | undefined {
    if (typeof r !== 'string' || r.length < 4 || r.length > 40) return undefined;
    return `${p.char.id}:${r}`;
  }

  onUse(p: PlayerEnt, msg: unknown): void {
    const m = msg as { slot?: unknown; r?: unknown } | null;
    if (!m || !Number.isInteger(m.slot)) return;
    const slot = m.slot as number;
    if (slot < 0 || slot >= INV_SIZE || this.c.isDead(p)) return;
    const idem = this.idem(p, m.r);
    if (idem === undefined) return;
    const c = p.char;
    const it = c.inv[slot];
    const def = it ? ITEM.get(it.id) : undefined;
    if (!it || !def) return;
    if (isWearSlot(def.kind)) return this.onEquip(p, { slot, r: m.r });
    if (!def.use) return;
    if (this.c.duel.inDuel(p)) return this.c.warn(p, 'duel.no_items');
    if (this.c.now < p.itemCdAt) return this.c.warn(p, 'sys.item_cd');
    // Phá Ấn Phù (E4-C): chỉ dùng được khi đứng trước một cửa đóng; cửa chỉ mở SAU KHI tx trừ bùa thành công (idem lặp thì không mở).
    const sealIdx = def.use.seal ? (this.c.sealHook?.peek(p) ?? -1) : -1;
    if (def.use.seal && sealIdx < 0) return this.c.warn(p, 'sys.seal_need');
    // Độ kiếp: tối đa `pillMax` của kiếp đan hồi phục (đan độc tích tụ), để không thành cuộc thi uống thuốc.
    const healing = !!def.use.hpPct;
    if (p.trib && healing && p.trib.pills >= tribDef(p.trib.id).pillMax)
      return this.c.warn(p, 'sys.trib_pill_limit', { n: tribDef(p.trib.id).pillMax });
    let taken = null as InvItem | null;
    if (!c.tx('use:' + def.id, idem, (d) => !!(taken = d.removeAt(slot, 1)))) return;
    p.itemCdAt = this.c.now + def.use.cd * 1000;
    if (sealIdx >= 0) this.c.sealHook?.open(sealIdx);
    if (p.trib && healing) p.trib.pills++;
    // Thanh Mộc Đan Kinh: hồi phục +20%, và đan dược dùng được lên đạo hữu gần (`to` = sid).
    const healMul = passiveOf(c.meta)?.healMul;
    let who = p;
    const to = (msg as { to?: unknown }).to;
    if (healMul !== undefined && typeof to === 'string' && to !== p.sid) {
      const o = this.c.players.get(to);
      if (o && this.c.canAssist(p, o) && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) <= POTION_ALLY_RANGE) who = o;
    }
    const wc = who.char;
    // Phẩm đan (P3-8): Hạ/Trung/Thượng nhân hiệu lực hồi phục, tu vi và mức buff.
    const potency = pillPotency(PILL_QUALITY, taken?.plus);
    if (def.use.hpPct) {
      const n = Math.round(healAmount(Math.round(wc.mhp * def.use.hpPct * potency), healMul) * (1 + wc.stats.healRecv));
      wc.hp = Math.min(wc.mhp, wc.hp + n);
      this.c.emit(S.DMG, { dst: who.sid, n, heal: true } satisfies DmgMsg);
    }
    if (def.use.mpPct) wc.mp = Math.min(wc.mmp, wc.mp + wc.mmp * def.use.mpPct * potency * (1 + (healMul ?? 0)));
    // Tu vi chỉ cho chính người dùng (không chuyển tu vi qua đan dược).
    if (def.use.xp) this.c.giveXp(p, Math.round(def.use.xp * potency));
    if (def.use.buff) this.c.applyPillBuff(p, def, potency);
    if (who !== p) this.c.fx({ t: 'potion', src: who.sid });
    this.c.fx({ t: 'potion', src: p.sid });
  }

  onEquip(p: PlayerEnt, msg: unknown): void {
    const m = msg as { slot?: unknown; r?: unknown } | null;
    const slot = m?.slot;
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= INV_SIZE || this.c.isDead(p)) return;
    if (this.c.duel.inDuel(p)) return this.c.warn(p, 'duel.no_items');
    // Đang tâm ma: không đổi trang bị (bóng dựng theo chỉ số lúc bắt đầu).
    if (p.trial) return this.c.warn(p, 'sys.busy');
    const idem = this.idem(p, m?.r);
    if (idem === undefined || this.c.now < (p.equipCdAt ?? 0)) return;
    p.equipCdAt = this.c.now + 200;
    const c = p.char;
    const it = c.inv[slot as number];
    const def = it ? ITEM.get(it.id) : undefined;
    // Ô có chỉ số hoặc ô ngoại hình (skin): cùng một đường giao dịch. Sở hữu = món đang nằm trong túi của chính người chơi.
    if (!it || !def || !isWearSlot(def.kind)) return;
    if ((def.reqLevel ?? 1) > c.level) return this.c.warn(p, 'sys.equip_level');
    // Món giới hạn giới tính (skin dựng cho một dáng): sai giới thì từ chối, món vẫn nằm trong túi.
    if (!wearableBy(def, c.appearance.g)) return this.c.warn(p, 'sys.equip_gender');
    const es: WearSlot = def.kind;
    // Đổi đồ không sinh/mất vật phẩm nên ledger ghi một dòng 'noop' có khóa idem và lý do (món vào/ra) để truy vết.
    const prev0 = c.equip[es];
    const ok = c.tx(`equip:${es}:${it.id}${prev0 ? '<-' + prev0.id : ''}`, idem, (d) => {
      const prev = d.equip[es];
      const cur = d.inv[slot as number];
      // Bản nháp là bản sao của túi hiện tại; kiểm lại để món ở ô đó không đổi giữa lúc đọc và lúc ghi.
      if (!cur || cur.id !== it.id) return false;
      const next: InvItem = { ...cur };
      delete next.lk; // khóa chỉ có ở túi
      // Địa/Thiên phẩm ràng buộc khi mặc (không giao dịch được nữa).
      if (next.inst && next.inst.q >= BIND_QUALITY && !next.inst.bound) next.inst = { ...next.inst, bound: true };
      d.equip[es] = next;
      d.inv[slot as number] = prev ? { ...prev } : null;
      return true;
    });
    if (ok) {
      c.recalc();
      if (p.mth) p.mth.dirty = true;
    }
  }

  onUnequip(p: PlayerEnt, msg: unknown): void {
    const m = msg as { slot?: unknown; r?: unknown } | null;
    const es = m?.slot;
    if (!isWearSlot(es) || this.c.isDead(p)) return;
    if (this.c.duel.inDuel(p)) return this.c.warn(p, 'duel.no_items');
    if (p.trial) return this.c.warn(p, 'sys.busy');
    const idem = this.idem(p, m?.r);
    if (idem === undefined || this.c.now < (p.equipCdAt ?? 0)) return;
    p.equipCdAt = this.c.now + 200;
    const c = p.char;
    const worn = c.equip[es];
    if (!worn) return;
    const ok = c.tx(`unequip:${es}:${worn.id}`, idem, (d) => {
      const i = d.inv.findIndex((s) => !s);
      if (i < 0 || !d.equip[es]) return false;
      d.inv[i] = { ...d.equip[es]! };
      delete d.equip[es];
      return true;
    });
    if (!ok) {
      if (c.txFail === 'abort') this.c.warn(p, 'sys.inv_full');
      return;
    }
    c.recalc();
    if (p.mth) p.mth.dirty = true;
  }

  onMoveItem(p: PlayerEnt, msg: unknown): void {
    const m = msg as { a?: unknown; b?: unknown } | null;
    if (!m || !Number.isInteger(m.a) || !Number.isInteger(m.b)) return;
    const a = m.a as number;
    const b = m.b as number;
    if (a === b || a < 0 || b < 0 || a >= INV_SIZE || b >= INV_SIZE) return;
    p.char.tx('move', null, (d) => {
      const sa = d.inv[a];
      const sb = d.inv[b];
      if (!sa) return false;
      const def = ITEM.get(sa.id);
      if (sb && def && sb.id === sa.id && (sb.plus ?? 0) === (sa.plus ?? 0) && def.stack > 1 && !sa.lk && !sb.lk) {
        const put = Math.min(sa.n, def.stack - sb.n);
        if (put <= 0) {
          d.inv[a] = sb ?? null;
          d.inv[b] = sa;
        } else {
          sb.n += put;
          sa.n -= put;
          if (sa.n <= 0) d.inv[a] = null;
        }
      } else {
        d.inv[a] = sb ?? null;
        d.inv[b] = sa;
      }
      return true;
    });
  }

  onBuy(p: PlayerEnt, msg: unknown): void {
    const m = msg as { npc?: unknown; item?: unknown; n?: unknown; r?: unknown } | null;
    if (!m || typeof m.npc !== 'string' || typeof m.item !== 'string' || !Number.isInteger(m.n)) return;
    const n = m.n as number;
    const idem = this.idem(p, m.r);
    if (idem === undefined || n < 1 || n > 99 || this.c.isDead(p)) return;
    const npc = NPC.get(m.npc);
    const def = ITEM.get(m.item);
    if (!npc || !def || !npc.sells?.includes(def.id) || def.price <= 0) return;
    if (!this.c.nearNpc(p, npc.id)) return this.c.warn(p, 'sys.too_far');
    const cost = def.price * n;
    if (p.char.gold < cost) return this.c.warn(p, 'sys.not_enough_gold');
    const ok = p.char.tx('buy:' + def.id, idem, (d) => d.spendGold(cost) && d.add(def.id, n));
    if (!ok) {
      if (p.char.txFail === 'abort') this.c.warn(p, 'sys.inv_full');
      return;
    }
    this.c.sys(p, 'sys.bought', { item: itemName(def.id), n }, 'loot');
  }

  onSell(p: PlayerEnt, msg: unknown): void {
    const m = msg as { npc?: unknown; slot?: unknown; n?: unknown; r?: unknown } | null;
    if (!m || typeof m.npc !== 'string' || !Number.isInteger(m.slot) || !Number.isInteger(m.n)) return;
    const slot = m.slot as number;
    const n = m.n as number;
    const idem = this.idem(p, m.r);
    if (idem === undefined || slot < 0 || slot >= INV_SIZE || n < 1 || this.c.isDead(p)) return;
    const npc = NPC.get(m.npc);
    if (!npc || !npc.sells) return;
    if (!this.c.nearNpc(p, npc.id)) return this.c.warn(p, 'sys.too_far');
    const it = p.char.inv[slot];
    const def = it ? ITEM.get(it.id) : undefined;
    if (!it || !def || it.n < n || def.sell <= 0) return;
    if (it.lk) return this.c.warn(p, 'sys.item_locked');
    if (it.inst?.bound) return this.c.warn(p, 'sys.item_bound');
    const gold = sellPrice(it, def) * n;
    const ok = p.char.tx('sell:' + def.id, idem, (d) => {
      if (d.inv[slot]?.lk || !d.removeAt(slot, n)) return false;
      d.addGold(gold);
      return true;
    });
    if (ok) this.c.sys(p, 'sys.sold', { item: itemName(def.id, it.plus), n, gold }, 'loot');
  }

  onCraft(p: PlayerEnt, msg: unknown): void {
    const m = msg as { id?: unknown; n?: unknown; r?: unknown } | null;
    if (!m || typeof m.id !== 'string' || !Number.isInteger(m.n)) return;
    const n = m.n as number;
    const idem = this.idem(p, m.r);
    if (idem === undefined || n < 1 || n > 20 || this.c.isDead(p)) return;
    const rcp = RECIPE.get(m.id);
    if (!rcp) return;
    if (!this.c.nearNpc(p, rcp.npc)) return this.c.warn(p, 'sys.too_far');
    const c = p.char;
    if (rcp.reqLevel && c.level < rcp.reqLevel) return this.c.warn(p, 'sys.craft_level');
    // Pháp bảo: mỗi người chỉ cần một món mỗi loại.
    const outDef = ITEM.get(rcp.output.id);
    if (outDef && isEquipSlot(outDef.kind) && (n !== 1 || c.inv.some((s) => s?.id === rcp.output.id) || c.equipCount(rcp.output.id) > 0))
      return this.c.warn(p, 'sys.art_owned');
    if (c.gold < rcp.gold * n) return this.c.warn(p, 'sys.not_enough_gold');
    // Phẩm chất đan (P3-8): mỗi viên roll riêng ở server; công pháp đan sư (Thanh Mộc) ra phẩm cao dễ hơn.
    const support = passiveOf(c.meta)?.kind === 'dan_kinh';
    const tiers = new Array<number>(PILL_TIERS).fill(0);
    let missing = false;
    let full = false;
    const ok = c.tx('craft:' + rcp.id, idem, (d) => {
      for (const i of rcp.inputs) {
        if (!d.remove(i.id, i.n * n)) {
          missing = true;
          return false;
        }
      }
      if (!d.spendGold(rcp.gold * n)) return false;
      if (rcp.quality) {
        const rolls: number[] = [];
        for (let i = 0; i < rcp.output.n * n; i++) {
          const q = rollPillQuality(PILL_QUALITY, support, randomInt(1_000_000) / 1_000_000);
          tiers[q] = (tiers[q] ?? 0) + 1;
          rolls.push(q);
        }
        for (let q = 0; q < PILL_TIERS; q++) {
          const cnt = tiers[q] ?? 0;
          if (cnt > 0 && !d.add(rcp.output.id, cnt, q)) {
            full = true;
            return false;
          }
        }
        d.rollSeeds.push(`pill:${rolls.join('')}`);
      } else if (!d.add(rcp.output.id, rcp.output.n * n)) {
        full = true;
        return false;
      }
      return true;
    });
    if (!ok) {
      if (missing) this.c.warn(p, 'sys.not_enough_mat');
      else if (full) this.c.warn(p, 'sys.inv_full');
      return;
    }
    if (rcp.quality) {
      for (let q = PILL_TIERS - 1; q >= 0; q--)
        if ((tiers[q] ?? 0) > 0)
          this.c.sys(
            p,
            'sys.crafted_q',
            { item: itemName(rcp.output.id), q: t('ui.pill.q' + q), n: tiers[q] ?? 0 },
            q > 0 ? 'good' : 'loot',
          );
    } else this.c.sys(p, 'sys.crafted', { item: itemName(rcp.output.id), n: rcp.output.n * n }, 'loot');
    this.c.questEvent(p, 'craft', rcp.output.id, rcp.output.n * n);
    this.c.fx({ t: 'craft', src: p.sid });
  }

  onEnhance(p: PlayerEnt, msg: unknown): void {
    this.c.upgrade.onEnhance(p, msg);
  }

  onUpgrade(p: PlayerEnt, msg: unknown): void {
    this.c.upgrade.onUpgrade(p, msg);
  }

  // ---------- công pháp (Phase 3-5) ----------

  /** Chọn lần đầu (Ngưng Khí tầng 5 trở lên, ở đâu cũng được) hoặc đổi (phải ở chỗ Lạc Vân chân nhân, tốn linh thạch). */
  onMethod(p: PlayerEnt, msg: unknown): void {
    const m = msg as { method?: unknown; r?: unknown } | null;
    if (!m || typeof m.method !== 'string' || this.c.isDead(p) || p.casting) return;
    const def = METHOD.get(m.method);
    if (!def) return;
    const c = p.char;
    if (c.level < METHOD_UNLOCK_LEVEL) return this.c.warn(p, 'sys.method_low', { realm: realmName(METHOD_UNLOCK_LEVEL) });
    if (c.meta.method === def.id) return this.c.warn(p, 'sys.method_same');
    if (this.c.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000) return this.c.warn(p, 'sys.method_combat');
    if (c.meta.method) {
      // Đổi công pháp: gặp người, tốn linh thạch, có chờ.
      if (!this.c.nearNpc(p, METHOD_NPC)) return this.c.warn(p, 'sys.method_far', { npc: t(`npc.${METHOD_NPC}.name`) });
      if (this.c.now - (c.meta.methodAt ?? 0) < METHOD_SWITCH_COOLDOWN_SEC * 1000) return this.c.warn(p, 'sys.method_cd');
      const idem = this.idem(p, m.r);
      if (idem === undefined) return;
      const cost = methodSwitchCost(c.level);
      if (c.gold < cost) return this.c.warn(p, 'sys.not_enough_gold');
      if (!c.tx('method:switch', idem, (d) => d.spendGold(cost))) return this.c.warn(p, 'sys.not_enough_gold');
    }
    c.meta.method = def.id;
    c.meta.methodAt = this.c.now;
    p.mth.reset();
    // Cooldown của chiêu công pháp cũ không mang sang.
    for (const id of [...p.cds.keys()]) if (SKILL.get(id)?.method) p.cds.delete(id);
    c.recalc();
    c.save();
    this.c.sys(p, 'sys.method_chosen', { method: t(`method.${def.id}.name`) }, 'good');
    this.c.fx({ t: 'levelup', src: p.sid });
    this.c.sendCd(p);
  }

  /** Chiêu mà người chơi này được phép nâng/chọn biến thức: đã mở khóa, và là chiêu chung hoặc của công pháp đang tu. */
  ownedSkill(p: PlayerEnt, id: unknown): SkillDef | null {
    if (typeof id !== 'string') return null;
    const sk = SKILL.get(id);
    if (!sk) return null;
    if (sk.method && p.char.meta.method !== sk.method) return null;
    if (p.char.level < sk.unlock) return null;
    return sk;
  }

  /** Nâng cấp chiêu: tốn Bí Tịch Tàn Quyển và linh thạch trong một giao dịch có khóa chống trùng và ghi ledger. */
  onSkillUp(p: PlayerEnt, msg: unknown): void {
    const m = msg as { skill?: unknown; r?: unknown } | null;
    if (!m || this.c.isDead(p)) return;
    const idem = this.idem(p, m.r);
    if (idem === undefined) return;
    const sk = this.ownedSkill(p, m.skill);
    if (!sk) return this.c.warn(p, 'sys.skill_locked_up');
    const c = p.char;
    const lv = skillLevelOf(c.meta, sk.id);
    if (lv >= MAX_SKILL_LEVEL) return this.c.warn(p, 'sys.skill_max');
    const cost = skillUpgradeCost(lv + 1);
    if (!cost) return this.c.warn(p, 'sys.skill_max');
    if (c.gold < cost.gold) return this.c.warn(p, 'sys.skill_need');
    // Cấp chỉ tăng nếu giao dịch ghi DB thành công (trùng khóa hoặc thiếu nguyên liệu thì không đổi gì).
    if (!c.tx(`skillup:${sk.id}:${lv + 1}`, idem, (d) => d.remove(SKILL_SCROLL, cost.scrolls) && d.spendGold(cost.gold)))
      return this.c.warn(p, 'sys.skill_need');
    setSkillLevel(c.meta, sk.id, lv + 1);
    c.save();
    p.mth.dirty = true;
    this.c.sys(p, 'sys.skill_up_ok', { skill: skillName(sk.id), n: lv + 1 }, 'good');
    this.c.fx({ t: 'enhance', src: p.sid });
  }

  /** Chọn biến thức A/B (từ cấp 3), đổi miễn phí khi không giao chiến. */
  onSkillVar(p: PlayerEnt, msg: unknown): void {
    const m = msg as { skill?: unknown; v?: unknown } | null;
    if (!m || this.c.isDead(p) || p.casting || (m.v !== 'a' && m.v !== 'b')) return;
    const sk = this.ownedSkill(p, m.skill);
    const vars = sk ? VARIANTS[sk.id] : undefined;
    if (!sk || !vars) return this.c.warn(p, 'sys.skill_locked_up');
    const c = p.char;
    if (c.meta.skillVar?.[sk.id] === m.v) return;
    const block = variantSwitchBlock({
      skillLevel: skillLevelOf(c.meta, sk.id),
      inCombat: this.c.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000,
      casting: !!p.casting,
      sinceLastSwitchMs: this.c.now - p.variantAt,
    });
    if (block) return this.c.warn(p, `sys.variant_${block === 'cooldown' || block === 'casting' ? 'wait' : block}`);
    p.variantAt = this.c.now;
    c.meta.skillVar ??= {};
    c.meta.skillVar[sk.id] = m.v;
    c.save();
    p.mth.dirty = true;
    this.c.sys(p, 'sys.variant_set', { skill: skillName(sk.id), name: t(`skill.${sk.id}.var.${m.v}.name`) }, 'info');
  }

  // ---------- NPC, nhiệm vụ ----------

  onTalk(p: PlayerEnt, msg: unknown): void {
    const npc = (msg as { npc?: unknown } | null)?.npc;
    if (typeof npc !== 'string' || !NPC.has(npc) || this.c.isDead(p)) return;
    if (!this.c.nearNpc(p, npc)) return;
    this.c.questEvent(p, 'talk', npc, 1);
  }

  onQuest(p: PlayerEnt, msg: unknown): void {
    const m = msg as { a?: unknown; id?: unknown } | null;
    if (!m || typeof m.id !== 'string' || this.c.isDead(p)) return;
    const q = QUEST.get(m.id);
    if (!q) return;
    const c = p.char;
    if (m.a === 'accept') {
      if (c.quests.active[q.id] || c.quests.done.includes(q.id)) return;
      if (q.requires && !c.quests.done.includes(q.requires)) return;
      if ((q.minLevel ?? 1) > c.level) return this.c.warn(p, 'sys.level_low');
      if (!this.c.nearNpc(p, q.giver)) return this.c.warn(p, 'sys.too_far');
      c.quests.active[q.id] = q.objectives.map((o) => {
        if (o.type === 'level') return Math.min(o.count, c.level);
        // Đã độ kiếp trước khi nhận nhiệm vụ thì tính là xong, không thì kẹt vĩnh viễn. `target` = id kiếp (`ket_dan`...);
        // không có thì là Trúc Cơ (q_truc_co). So với cấp ĐÍCH của đúng kiếp đó, không phải một mốc chung.
        if (o.type === 'breakthrough' && c.level >= tribDef(o.target ?? 'truc_co').to) return o.count;
        return 0;
      });
      c.questDirty = true;
      let teleNew = false;
      for (const id of q.unlockTele ?? []) if (c.unlockTele(id)) teleNew = true;
      if (teleNew) {
        for (const id of q.unlockTele ?? []) this.c.sys(p, 'sys.tele_unlock', { n: t(`tele.${id}`) }, 'good');
        this.c.tele.sendState(p);
      }
      this.c.sys(p, 'sys.quest_accept', { name: t(`quest.${q.id}.name`) }, 'info');
      // Mục tiêu "nói chuyện" với chính NPC đang đứng cạnh thì tính luôn.
      for (const o of q.objectives)
        if (o.type === 'talk' && o.target && this.c.nearNpc(p, o.target)) this.c.questEvent(p, 'talk', o.target, 1);
      return;
    }
    if (m.a === 'turnin') {
      if (!c.quests.active[q.id]) return;
      if (!this.c.nearNpc(p, q.turnin)) return this.c.warn(p, 'sys.too_far');
      // Đứng cạnh NPC trả nhiệm vụ cũng là đã "nói chuyện".
      this.c.questEvent(p, 'talk', q.turnin, 1);
      if (!c.questComplete(q.id)) return;
      const ok = c.tx('quest:' + q.id, `quest:${c.id}:${q.id}`, (d) => {
        if (q.rewards.gold > 0) d.addGold(q.rewards.gold);
        for (const it of q.rewards.items ?? []) if (!d.add(it.id, it.n)) return false;
        return true;
      });
      if (!ok && c.txFail !== 'dup') return this.c.warn(p, 'sys.inv_full');
      // txFail === 'dup': phần thưởng đã phát ở lần trước (server tắt giữa chừng) — chỉ đánh dấu hoàn thành.
      const rewarded = ok;
      delete c.quests.active[q.id];
      c.quests.done.push(q.id);
      c.questDirty = true;
      this.c.sys(p, 'sys.quest_done', { name: t(`quest.${q.id}.name`) }, 'good');
      if (rewarded) {
        if (q.rewards.gold > 0) this.c.sys(p, 'sys.gold', { n: q.rewards.gold }, 'loot');
        for (const it of q.rewards.items ?? []) this.c.sys(p, 'sys.loot', { item: itemName(it.id), n: it.n }, 'loot');
        if (q.rewards.xp > 0) this.c.giveXp(p, q.rewards.xp);
      }
      this.c.fx({ t: 'quest', src: p.sid });
      this.c.savePlayer(p);
    }
  }

  // ---------- chat & lệnh GM ----------
}
