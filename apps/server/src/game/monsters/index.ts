// Quái (R-7): AI từng tick, hồi sinh, vùng nổ (Hazard), đạn, sát thương/chết/rơi đồ của quái, pha và thế của boss.
// Tách nguyên văn từ GameSim, chỉ nhận giao diện hẹp `MonsterCtx`; sát thương lên người vẫn qua damagePlayer của sim.
import { tickMonsterImpl } from './tickMonster';
import { tickHazardsImpl } from './tickHazards';
import { tickBoltsImpl } from './tickBolts';
import { noteDealt } from '../matchstats';
import {
  BOLT_MAX_LIFE,
  BOLT_MAX_LIVE,
  type CollisionSet,
  slideOut,
  boltLift,
  type BoltEndMsg,
  type BoltMsg,
  boltYaws,
  chargeFromDealt,
  bossPhaseAt,
  chantInterrupt,
  nextTurn,
  PARTY_SHARE_RANGE,
  RESONANCE_DMG,
  RESONANCE_XP,
  splitXp,
  xpShareWeight,
  computeDamage,
  type DmgMsg,
  rollEquipDrops,
  type Quality,
  type FxMsg,
  elemCounter,
  STAT_CAPS,
  counterMul,
  type HazardGeom,
  type HazardMsg,
  isHeavyHit,
  BOSS_STAGGER_GAP_MS,
  monsterReaction,
  tierRank,
  resolveTier,
  type HitTier,
  MF_BROKEN,
  MF_CHANT,
  MF_DISP_MASK,
  MF_STUN,
  type MonsterCaster,
  type MonsterChant,
  type MonsterDef,
  type MonsterSweep,
  monsterStats,
  monsterXp,
  phaseRules,
  postureGain,
  QUALITY_THAN,
  MS_ATTACK,
  MS_CHASE,
  MS_DEAD,
  MS_IDLE,
  MS_RETURN,
  S,
  type SpawnDef,
  type SysMsg,
  vulnerableDamage,
  xpLevelFactor,
  type BossTimerMsg,
  markAmp,
  MARK_DOT_MS,
} from '@dtl/shared';
import { type GuardCfg } from '../trib';
import { ITEM_SYS, ITEMS, itemName, MARK, MONSTER, monsterName, t } from '@dtl/content';
import { lootOf } from '@dtl/content/loot';
import { MonS } from '../../state';
import { type Character } from '../character';
import { hitReactCfg } from '../hitreactCfg';
import { LEASH, visualSeed } from '../combat/consts';
import { passiveOf } from '../method';
import { newRt } from '../monskill';
import { parties } from '../party';
import { passiveValue } from '../artifact';
import type { Bolt, Hazard, MonEnt, PlayerEnt, SimHost } from '../entities';
import type { CampSystem } from '../camps';
import type { DomainSystem } from '../domain';
import type { GmSystem } from '../gm';
import type { MirrorSystem } from '../mirror';
import type { MonSkills } from '../monskill';
import type { RealmSystem } from '../realm';
import type { SoulSystem } from '../soul';
import type { WorldState } from '../../state';
import type { Terrain } from '@dtl/shared';
import type { ThanTangSystem } from '../thantang';
import type { TribSystem } from '../trib';
import type { MonZones } from '../monzone';

import { mergeSlow } from '@dtl/shared';
/** Bộ trang bị (P3-4): hệ số tốc độ của quái bị làm chậm (thường / boss). */
const SET_SLOW_MUL = 0.5;
const SET_SLOW_BOSS = 0.8;
/** Một quái giữ ô cận chiến của một người chơi tối đa chừng này rồi nhường nếu có quái khác chờ. */
const SLOT_HOLD_MS = 5000;
/** Sau khi nhường ô, quái nghỉ chừng này mới được giành lại. */
const SLOT_REST_MS = 1500;
/** Quái chỉ giành ô khi đã ở gần mục tiêu trong khoảng này (mét, ngoài tầm đánh). */
const SLOT_CLAIM_DIST = 4;
const boltCount = (c: MonsterCaster) => Math.max(1, Math.min(5, c.n ?? 1));

/** Phần GameSim mà hệ quái cần. */
export interface MonsterCtx {
  /** Đẩy quái ra xa (kiểm địa hình): xem `CombatSystem.pushMonster`. */
  pushMonster(mon: MonEnt, fx: number, fz: number, dist: number): void;
  readonly bolts: Bolt[];
  readonly camps: CampSystem;
  damagePlayer(p: PlayerEnt, dmg: number, src: string, hv?: boolean, ke?: 1 | -1): void;
  readonly domain: DomainSystem;
  emit(type: string, payload: object): void;
  feedArtifact(p: PlayerEnt, mon: MonEnt): void;
  fx(m: FxMsg): void;
  gainCharge(p: PlayerEnt, n: number): void;
  giveXp(p: PlayerEnt, n: number, announce?: boolean): void;
  readonly gmSys: GmSystem;
  readonly hazards: Hazard[];
  readonly host: SimHost;
  isDead(p: PlayerEnt): boolean;
  /** Hợp kích (VS-2f): `p` vừa hạ gục quái. */
  jointFinish(p: PlayerEnt): void;
  /** Tài nguyên riêng (VS-2a): đang đầy không; một nhịp sát thương theo thời gian của `p` vừa nổ. */
  resFull(p: PlayerEnt): boolean;
  resDot(p: PlayerEnt): void;
  healPlayer(o: PlayerEnt, n: number): number;
  lockCut(h: Hazard, p: PlayerEnt): { mul: number; max: number };
  readonly mirror: MirrorSystem;
  readonly monById: Map<string, MonEnt>;
  readonly monSkills: MonSkills;
  readonly monsters: MonEnt[];
  nextId: number;
  readonly now: number;
  pickGuards(h: Hazard): PlayerEnt[];
  readonly players: Map<string, PlayerEnt>;
  questEvent(p: PlayerEnt, type: Parameters<Character['questEvent']>[0], target: string | undefined, n: number): void;
  randomPoint(cx: number, cz: number, radius: number, allowWater: boolean): { x: number; z: number };
  readonly realm: RealmSystem;
  shareToGuards(owner: PlayerEnt, n: number, h: Hazard): number;
  readonly soul: SoulSystem;
  readonly state: WorldState;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string, drop?: Pick<SysMsg, 'i' | 'src' | 'q'>): void;
  sysAll(k: string, params?: Record<string, string | number>, type?: string): void;
  readonly terrain: Terrain;
  /** Hình va chạm 3D của level (COL-1): quái trượt khỏi vật rắn, đạn bị chặn, không đặt chỗ trong vật rắn. */
  readonly collision: CollisionSet;
  readonly than: ThanTangSystem;
  readonly tribSys: TribSystem;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
  readonly zones: MonZones;
}

/** Bán kính thân quái khi trượt khỏi vật rắn (m). */
const MON_RADIUS = 0.7;
/** Quái bị vật rắn giữ lại liên tục chừng này mà không tiến gần mục tiêu ≥ `BLOCK_PROGRESS` m thì coi là không với tới (bỏ đuổi, hồi đầy, miễn sát thương). */
const BLOCK_STALL_MS = 4000;
const BLOCK_PROGRESS = 1;
/** Hai lần trượt cách nhau quá chừng này thì không còn là "liên tục". */
const BLOCK_GAP_MS = 600;

export class MonsterSystem {
  constructor(readonly c: MonsterCtx) {}

  /** sid người chơi → id quái đang giữ ô cận chiến của người đó. */
  meleeSlot = new Map<string, string>();
  /** sid người chơi → lần cuối có quái cận chiến phải chờ ở vòng ngoài. */
  slotWait = new Map<string, number>();
  nextBoltId = 1;

  /**
   * `mul`: hệ số sát thương hệ (linh căn, dòng phụ); không đổi việc đòn có nặng hay không (theo `power` gốc).
   * Trả true nếu đòn có hiệu lực (nơi gọi dùng để tích tài nguyên riêng theo chiêu).
   */
  /** Cấp đòn của lần `hitMonster` đang chạy, để `damageMonster` ghi vào tin sát thương. */
  private dmgTier: HitTier | undefined;

  hitMonster(p: PlayerEnt, mon: MonEnt, basePower: number, mul = 1, elem?: string, tier?: HitTier): boolean {
    // Ấn trên quái (VS-2c): ấn của chính người đánh cộng theo tầng (Truy hồn), ấn chung (Mất thế) cộng cho mọi người.
    const power0 = basePower * (1 + markAmp(mon.marks, MARK, p.sid, this.c.now));
    // Cộng hưởng vai trò (tổ đội đủ Kiếm tu/Hộ pháp/Đan sư đứng gần nhau): đánh mạnh hơn một chút.
    const power = parties.resonance(p) ? power0 * (1 + RESONANCE_DMG) : power0;
    // Khắc chế ngũ hành (3-10): server tính, client chỉ nhận cờ `ke` để hiển thị.
    const ke = elemCounter(elem, mon.def.elem);
    // Nội tại công pháp (3-10): kiếm tu đủ kiếm ý thì bạo kích cao hơn; hộ pháp đánh cận chiến mạnh hơn.
    const pas0 = passiveOf(p.char.meta);
    let critRate = Math.min(STAT_CAPS.critRate, p.char.stats.critRate + this.c.domain.critAdd(p));
    if (pas0?.critAtMax && this.c.resFull(p)) critRate = Math.min(STAT_CAPS.critRate, critRate + pas0.critAtMax);
    let meleeMul = 1;
    if (pas0?.melee && Math.hypot(mon.s.x - p.move.x, mon.s.z - p.move.z) <= pas0.melee.r + mon.def.scale) meleeMul += pas0.melee.mul;
    const { dmg, crit } = computeDamage(
      p.char.atk,
      power * mul * counterMul(ke) * meleeMul,
      mon.defn,
      Math.random(),
      Math.random(),
      critRate,
      p.char.stats.critMul,
    );
    // Khựng do đòn (S1) không tính là choáng để nhận thêm sát thương: chuỗi đòn không tự lên điểm cân bằng.
    const stunned = this.c.now < mon.stunUntil && !(this.c.now < mon.staggerUntil && mon.stunUntil === mon.staggerUntil);
    const heavy = isHeavyHit(power);
    // `hv` (lớp hình) tính cả lúc choáng; phá thế chỉ cộng phần đòn nặng cho chiêu hệ số cao thật.
    // Đòn không có hiệu lực (quái đã chết, đang miễn sát thương, bóng tâm ma của người khác) không cho kiếm ý/sạc.
    const lands = mon.state !== MS_DEAD && !(mon.owner && mon.owner !== p.sid) && this.c.now >= mon.evadeUntil;
    const tierUsed = resolveTier(tier, basePower);
    this.dmgTier = tierUsed;
    this.damageMonster(mon, vulnerableDamage(dmg, stunned), p, crit, stunned || heavy, heavy, ke);
    this.dmgTier = undefined;
    if (!lands) return false;
    // Chân Cảnh S1: đẩy lùi / khựng / ngã theo cấp đòn (dữ liệu `tier` của chiêu, không thì suy từ hệ số gốc) và độ chống của quái.
    if (mon.state !== MS_DEAD) this.reactMonster(mon, tierUsed, p.move.x, p.move.z);
    // Bộ Hàn Giao Lân (3 món): đòn bạo kích làm chậm mục tiêu (boss chỉ chậm nhẹ).
    const slowSec = p.char.stats.setFx.critSlowSec;
    if (crit && slowSec > 0 && mon.state !== MS_DEAD)
      mon.slow = mergeSlow(mon.slow, { until: this.c.now + slowSec * 1000, mul: mon.def.boss ? SET_SLOW_BOSS : SET_SLOW_MUL }, this.c.now);
    // Chiêu tối thượng đang ra không tự nạp lại vòng sạc của chính nó.
    if (!p.mth.lockCharge) this.c.gainCharge(p, chargeFromDealt(dmg, p.char.atk));
    return true;
  }

  /**
   * Chân Cảnh S1: phản ứng của quái trước đòn cấp `tier` từ (fromX, fromZ). Bảng và độ chống ở `monsterReaction`.
   * Khựng/ngã = choáng ngắn `stunUntil` (cắt chiêu đang dở như `stun`), không ghi đè choáng dài hơn đang có. Thủ lĩnh không bị đẩy,
   * chỉ khựng khi đòn đủ cấp `poise` và cách lần khựng trước `BOSS_STAGGER_GAP_MS` (thanh phá thế vẫn là đường chính để làm boss quỵ).
   */
  reactMonster(mon: MonEnt, tier: HitTier, fromX: number, fromZ: number): void {
    // Quái đánh xa (caster) giữ khoảng cách và đánh bằng chú: đẩy/khựng làm nó ra khỏi tầm hay mất nhịp chú, đo bằng fight:check thấy hạ chậm hơn nên miễn hẳn.
    if (!hitReactCfg.enabled || mon.owner || mon.def.ai?.caster || this.c.now < mon.evadeUntil) return;
    const r = monsterReaction(mon.def, tier);
    if (r.knockM > 0) this.c.pushMonster(mon, fromX, fromZ, r.knockM * (mon.def.elite ? 2 : 1));
    const ms = Math.max(r.staggerMs, r.knockdownMs);
    if (ms <= 0 || mon.state === MS_DEAD) return;
    if (mon.def.boss) {
      if (this.c.now < mon.staggerOkAt || this.c.now < mon.stunUntil) return;
      mon.staggerOkAt = this.c.now + BOSS_STAGGER_GAP_MS;
    }
    // Đang niệm chú / ra chiêu có báo trước thì là siêu giáp: khựng không phá (chỉ ngắt chú và thanh phá thế làm việc đó).
    // Quái thường chỉ có đòn cắn/combo: khựng cắt các đòn đó như choáng ngắn.
    const busy = mon.chant || mon.cast || mon.mx.act || this.c.now < mon.windUntil || mon.comboAt > 0;
    if (busy && (mon.def.boss || mon.def.elite || mon.chant)) return;
    const until = this.c.now + ms;
    if (until <= mon.stunUntil) return;
    this.c.monSkills.cancel(mon);
    mon.cast = null;
    mon.windUntil = 0;
    mon.comboAt = 0;
    mon.comboTarget = '';
    mon.stunUntil = until;
    mon.staggerUntil = until;
    this.setMonFlags(mon, MF_STUN, until);
  }

  /** Chiêu ngắt trúng boss: phá chú nếu đúng cửa sổ. Mục tiêu, tầm, GCD, hồi chiêu đã kiểm ở onSkill. */
  tryInterrupt(p: PlayerEnt, mon: MonEnt, extraStun = 0): void {
    const ch = mon.rules.ai.chant;
    if (!ch || !mon.chant || mon.state === MS_DEAD || this.c.now < mon.evadeUntil) return;
    const r = chantInterrupt(mon.chant.startAt, mon.chant.endAt, ch.open, this.c.now);
    if (r === 'guarded') return this.c.sys(p, 'sys.chant_guarded', { boss: monsterName(mon.def.id) }, 'bad');
    if (r !== 'ok') return;
    mon.chant = null;
    this.c.monSkills.cancel(mon);
    mon.chantAt = this.c.now + ch.cd * 1000;
    mon.stunUntil = this.c.now + (ch.stun + extraStun) * 1000;
    mon.comboAt = 0;
    mon.comboTarget = '';
    this.setMonFlags(mon, MF_STUN, mon.stunUntil);
    this.c.fx({ t: 'interrupt', src: p.sid, dst: mon.id, d: ch.stun + extraStun });
    this.c.sysAll('sys.chant_broken', { name: p.char.name, boss: monsterName(mon.def.id) }, 'good');
    // Ngắt đúng lúc là nguồn lấp thanh phá thế lớn nhất.
    const ps = mon.def.posture;
    if (ps) this.addPosture(mon, ps.interrupt);
  }

  /** Cộng phá thế; đầy thì boss mất thế. Không lấp khi đang quỵ vì mất thế. */
  addPosture(m: MonEnt, n: number): void {
    const ps = m.def.posture;
    if (!ps || !(n > 0) || (m.state !== MS_CHASE && m.state !== MS_ATTACK)) return;
    if (m.s.mf & MF_BROKEN && this.c.now < m.stunUntil) return;
    m.lastHitAt = this.c.now;
    m.posture = Math.min(1, m.posture + n);
    if (m.posture >= 1) this.breakPosture(m);
    else this.syncPosture(m);
  }

  syncPosture(m: MonEnt): void {
    const pz = Math.floor(m.posture * 100);
    if (m.s.pz !== pz) m.s.pz = pz;
  }

  /**
   * Đầy thanh phá thế: boss quỵ `brk` giây (đứng yên, nhận thêm sát thương), mất chú đang niệm.
   * Vùng chém đã thả trước đó vẫn nổ đúng như báo trước (thấy gì thì trúng nấy).
   */
  breakPosture(m: MonEnt): void {
    this.stagger(m, m.def.posture!.brk);
  }

  /** Boss mất thế `sec` giây (cắt chiêu đang dở, choáng + cờ MF_BROKEN). Dùng chung cho phá thế thường và `than.clone.weak` (E4-C); không bị `addPosture` chặn khi đang quỵ. */
  stagger(m: MonEnt, sec: number): void {
    m.posture = 0;
    this.syncPosture(m);
    this.c.monSkills.cancel(m);
    const ch = m.rules.ai.chant;
    if (m.chant && ch) m.chantAt = this.c.now + ch.cd * 1000;
    m.chant = null;
    m.windUntil = 0;
    m.comboAt = 0;
    m.comboTarget = '';
    m.cast = null;
    m.stunUntil = Math.max(m.stunUntil, this.c.now + sec * 1000);
    this.setMonFlags(m, MF_STUN | MF_BROKEN, m.stunUntil);
    this.c.fx({ t: 'break', src: m.id, d: sec });
    this.c.sysAll('sys.posture_broken', { boss: monsterName(m.def.id) }, 'good');
  }

  /**
   * Choáng `sec` giây không phát tin "mất thế" (Nhật Thực Kiếp: thiên lôi trúng boss kiếp mỗi vài giây): cắt chiêu/niệm đang dở và bật cờ MF_STUN để client hạ hover.
   */
  stun(m: MonEnt, sec: number): void {
    this.c.monSkills.cancel(m);
    const ch = m.rules.ai.chant;
    if (m.chant && ch) m.chantAt = this.c.now + ch.cd * 1000;
    m.chant = null;
    m.windUntil = 0;
    m.comboAt = 0;
    m.comboTarget = '';
    m.cast = null;
    m.stunUntil = Math.max(m.stunUntil, this.c.now + sec * 1000);
    this.setMonFlags(m, MF_STUN, m.stunUntil);
  }

  /** Đổi pha boss: thay bộ chiêu/nhịp; `ph` lên state để client vẽ thanh niệm chú đúng thời lượng. */
  setPhase(m: MonEnt, ph: number): void {
    if (m.phase === ph) return;
    m.phase = ph;
    m.rules = phaseRules(m.def, ph);
    if (m.s.ph !== ph) m.s.ph = ph;
  }

  /** Máu xuống dưới ngưỡng pha: đổi pha, báo client (câu thoại chọn ở client qua i18n), chiêu mới ra sớm. */
  checkPhase(m: MonEnt): void {
    const phases = m.def.phases;
    if (!phases || m.s.hp <= 0) return;
    const ph = bossPhaseAt(m.s.hp / m.s.mhp, phases, m.phase);
    if (ph === m.phase) return;
    this.setPhase(m, ph);
    this.c.mirror.onPhase(m, ph);
    // Pha mới bỏ chú/đọc chú thì hủy cái đang dở, không để kẹt cờ niệm chú.
    if (m.chant && !m.rules.ai.chant) {
      m.chant = null;
      m.chantAt = 0;
      if (m.s.mf & MF_CHANT) this.setMonFlags(m, 0, 0);
    }
    if (m.cast && !m.rules.ai.caster) m.cast = null;
    m.comboAt = 0;
    m.comboTarget = '';
    if (m.rules.ai.sweep && !m.chant) m.sweepAt = this.c.now + 2500;
    this.c.fx({ t: 'phase', src: m.id, d: ph });
  }

  setMonFlags(m: MonEnt, mf: number, ce: number): void {
    // Cờ của chiêu mở rộng (phản đòn, yếu điểm, chui đất) do monskill giữ: ghép vào, không để cờ chú/choáng xóa mất.
    if (m.mx.bits) {
      mf |= m.mx.bits;
      if (!ce) ce = m.mx.ce;
    }
    // Cờ chỉ-để-vẽ (chậm/độc/bỏng) do `syncDisplayFlags` giữ: không để cờ chú/choáng xóa mất.
    mf |= m.s.mf & MF_DISP_MASK;
    if (m.s.mf !== mf) m.s.mf = mf;
    if (m.s.ce !== ce) m.s.ce = ce;
  }

  /** Boss niệm chú. Trả về true nếu tick này boss bận niệm (không đi, không đánh). */
  tickChant(m: MonEnt, c: MonsterChant, target: PlayerEnt, d: number, reachable: boolean): boolean {
    if (m.chant) {
      m.s.yaw = Math.atan2(target.move.x - m.s.x, target.move.z - m.s.z);
      this.setMonState(m, MS_ATTACK);
      // Thôn Mạch (E2-C): trong lúc niệm hút mạch hồi máu; phá chú (ngắt/choáng) thì `m.chant` về null nên ngừng.
      if (c.drain) {
        const last = m.chant.lastAt ?? m.chant.startAt;
        const upto = Math.min(this.c.now, m.chant.endAt);
        if (upto > last) m.s.hp = Math.min(m.s.mhp, m.s.hp + Math.round((m.s.mhp * c.drain * (upto - last)) / 1000));
        m.chant.lastAt = upto;
      }
      if (this.c.now >= m.chant.endAt) this.releaseChant(m, c);
      return true;
    }
    if (!m.chantAt) {
      // Vừa vào trận: lần niệm đầu sau nửa chu kỳ.
      m.chantAt = this.c.now + c.cd * 500;
      return false;
    }
    if (this.c.now < m.chantAt || m.comboAt || !reachable || d > c.r + 12) return false;
    m.chant = { startAt: this.c.now, endAt: this.c.now + c.cast * 1000 };
    this.setMonFlags(m, MF_CHANT, m.chant.endAt);
    this.setMonState(m, MS_ATTACK);
    this.c.fx({ t: 'chant', src: m.id, d: c.cast });
    return true;
  }

  /** Niệm xong: thả vùng tròn quanh boss, chạy ra khỏi vòng để né. */
  releaseChant(m: MonEnt, c: MonsterChant): void {
    m.chant = null;
    m.chantAt = this.c.now + c.cd * 1000;
    m.abilityAt = Math.max(m.abilityAt, this.c.now + (c.delay + 2) * 1000);
    this.setMonFlags(m, 0, 0);
    // Nuốt (E3-G): vòng kéo báo trước, kéo xong rồi vùng nổ mới nổ (người bị kéo vào đúng chỗ nổ, phải thoát ra kịp).
    const pull = c.pull;
    if (pull) {
      m.abilityAt = Math.max(m.abilityAt, this.c.now + (pull.delay + pull.dur + c.delay + 2) * 1000);
      this.c.zones.startPull(m, pull, c.kind);
    }
    this.addHazard({ x: m.s.x, z: m.s.z, r: c.r }, c.delay + (pull ? pull.delay + pull.dur : 0), c.mul, false, c.kind, m.id, m.atk);
  }

  damageMonster(
    mon: MonEnt,
    dmg: number,
    p: PlayerEnt | null,
    crit = false,
    hv = false,
    heavy = hv,
    ke: 0 | 1 | -1 = 0,
    dot = false,
  ): void {
    if (mon.state === MS_DEAD) return;
    // Bóng tâm ma chỉ bị chủ đánh: người khác (kể cả vùng nổ lan sang) không làm gì được.
    if (mon.owner && p?.sid !== mon.owner) return;
    if (this.c.now < mon.evadeUntil) {
      this.c.emit(S.DMG, { dst: mon.id, n: 0 } satisfies DmgMsg);
      return;
    }
    // Chiêu mở rộng: chui đất miễn sát thương; phản đòn trả lại người đánh; lộ yếu điểm/giáp nhân sát thương.
    const mxDmg = this.c.monSkills.onHit(mon, dmg, p, dot);
    if (mxDmg < 0) {
      this.c.emit(S.DMG, { dst: mon.id, n: 0 } satisfies DmgMsg);
      return;
    }
    dmg = mxDmg;
    // Khe mạch (DV-3D): boss có `rift` không chết vì sát thương, chỉ về 1 máu; chỉ gột hết tầng cháy (GameSim.purifyMonster) mới hạ được.
    const hp = Math.max(mon.def.rift ? 1 : 0, mon.s.hp - dmg);
    // Tổng kết trận (U5): chỉ tính phần sát thương thật (không vượt máu còn lại), không tính bóng tâm ma của độ kiếp.
    if (!mon.owner) noteDealt(p, mon.s.hp - hp);
    mon.s.hp = hp;
    const msg: DmgMsg = { dst: mon.id, n: dmg };
    if (crit) msg.crit = true;
    if (hv) msg.hv = true;
    if (ke) msg.ke = ke;
    // Chân Cảnh S1: cấp đòn của lần đánh này (chỉ lớp hình ở client).
    if (this.dmgTier) msg.tr = tierRank(this.dmgTier) as 0 | 1 | 2 | 3;
    if (p) msg.src = p.sid;
    this.c.emit(S.DMG, msg);
    // Tâm cảnh (E3-L): đánh trúng Tâm Ma Ảnh của mình thì hồi.
    if (p?.trib && dmg > 0 && mon.owner === p.sid) this.c.tribSys.noteHit(p, 'hit', dot);
    if (p) {
      mon.threat.set(p.sid, (mon.threat.get(p.sid) ?? 0) + dmg);
      if (dmg > 0) this.c.host.onPlayerHitMonster?.(p, mon);
      if (mon.state === MS_IDLE || (mon.state === MS_RETURN && this.homeDist(mon) < LEASH * 0.7)) {
        this.resetAi(mon);
        mon.target = p.sid;
        mon.state = MS_CHASE;
        mon.s.st = MS_CHASE;
        mon.unreachableSince = 0;
      }
    }
    // Sau khi AI đã vào trận (resetAi ở trên xóa phá thế/choáng). Boss đang bỏ đuổi về nhà thì không đổi pha,
    // không lấp phá thế: đuổi theo đánh boss đang chạy về không được lợi gì.
    if (mon.def.boss && hp > 0 && (mon.state === MS_CHASE || mon.state === MS_ATTACK)) {
      this.checkPhase(mon);
      const ps = mon.def.posture;
      if (ps && p) this.addPosture(mon, postureGain(ps, dmg, mon.s.mhp, heavy) * (1 + passiveValue(p.char.equip, p.char.meta, 'posture')));
    }
    if (hp <= 0) {
      this.killMonster(mon);
      // VS-2f: người hạ gục đang mang Mộc ấn của đồng đội thì ấn kết (bóng tâm ma, đệ tử của quái không tính).
      if (p && !mon.owner && !mon.minionOf) this.c.jointFinish(p);
    }
  }

  /** Kênh mới mở không có boss ngay: boss bắt đầu ở trạng thái chờ hồi sinh. */
  delayBosses(): void {
    for (const m of this.c.monsters) {
      if (!m.def.boss || !m.spawn) continue;
      m.state = MS_DEAD;
      m.s.st = MS_DEAD;
      m.s.hp = 0;
      m.target = '';
      m.respawnAt = this.c.now + m.spawn.respawn * 1000;
    }
  }

  homeDist(m: MonEnt): number {
    return Math.hypot(m.s.x - m.homeX, m.s.z - m.homeZ);
  }

  /** Nổ các nhịp `dot` của ấn trên `m`. Trả true nếu `m` chết vì nhịp này (nơi gọi dừng xử lý con này). */
  tickMarkDots(m: MonEnt): boolean {
    const now = this.c.now;
    // Duyệt bản sao: sát thương có thể làm quái chết và xóa sạch `m.marks`.
    for (const mk of [...m.marks]) {
      if (mk.per === undefined || mk.nextAt === undefined || now < mk.nextAt || now >= mk.until) continue;
      mk.nextAt += MARK_DOT_MS;
      const owner = this.c.players.get(mk.sid) ?? null;
      // Người đặt đã rời room hoặc đã ngã: ấn không còn ai nuôi, không gây sát thương.
      if (!owner || this.c.isDead(owner)) continue;
      const dmg = mk.per * mk.n;
      const before = m.s.hp;
      this.damageMonster(m, dmg, owner, false, false, false, 0, true);
      const dealt = Math.max(0, before - m.s.hp);
      const leech = MARK.get(mk.id)?.dot?.leech;
      if (leech && dealt > 0) this.c.healPlayer(owner, Math.max(1, Math.round(dealt * leech)));
      this.c.resDot(owner);
      if (m.state === MS_DEAD) return true;
    }
    return false;
  }

  killMonster(mon: MonEnt): void {
    // Vũng độc khi chết (E3-G): đệ tử và bóng tâm ma không để lại.
    if (!mon.owner && !mon.minionOf) this.c.zones.onDeath(mon, mon.def.deathPool);
    mon.marks.length = 0;
    if (mon.s.mk !== 0) mon.s.mk = 0;
    mon.taunt = undefined;
    mon.state = MS_DEAD;
    mon.s.st = MS_DEAD;
    mon.target = '';
    this.resetAi(mon);
    if (mon.camp) this.c.camps.onKill(mon);
    else if (mon.spawn) mon.respawnAt = this.c.now + mon.spawn.respawn * 1000;
    else mon.removeAt = this.c.now + 4000;
    if (this.isTimed(mon)) this.sendBossTimers();
    this.c.mirror.onKill(mon);
    this.c.than.onKill(mon);
    if (mon.minionOf) {
      // Đệ tử do quái gọi: không tu vi, không rơi đồ, không tính nhiệm vụ.
      mon.threat.clear();
      return;
    }
    if (mon.owner) {
      // Bóng tâm ma: không tu vi, không rơi đồ, không tính nhiệm vụ; chỉ báo cho hệ bình cảnh.
      mon.threat.clear();
      this.c.realm.onShadowDown(mon);
      return;
    }
    const xp = monsterXp(mon.level, mon.def.xpMul);
    const minShare = mon.s.mhp * 0.05;
    const dealers = new Set<PlayerEnt>();
    for (const [sid, dealt] of mon.threat) {
      const p = this.c.players.get(sid);
      if (!p || dealt < minShare) continue;
      if (Math.hypot(p.move.x - mon.s.x, p.move.z - mon.s.z) > 90) continue;
      dealers.add(p);
    }
    const done = new Set<PlayerEnt>();
    const dist = (o: PlayerEnt) => Math.hypot(o.move.x - mon.s.x, o.move.z - mon.s.z);
    // Tổ đội (P3-9): đồng đội còn sống trong tầm cùng chia tu vi, cùng được tính diệt quái và chia đồ,
    // kể cả khi không ra đòn (Hộ pháp, Đan sư). Người đánh mà ở xa/đã ngã thì tính riêng như người đơn.
    const groups = new Map<NonNullable<ReturnType<typeof parties.partyOf>>, PlayerEnt[]>();
    for (const p of dealers) {
      const party = parties.partyOf(p.char.id);
      if (!party || groups.has(party)) continue;
      groups.set(
        party,
        parties.matesInRoom(p.char.id, this.c.host).filter((o) => !this.c.isDead(o) && !o.trib && !o.trial && dist(o) <= PARTY_SHARE_RANGE),
      );
    }
    for (const [party, pool] of groups) {
      const raw = splitXp(
        xp,
        pool.map((o) => xpShareWeight(dist(o))),
      );
      pool.forEach((o, i) => {
        const res = parties.resonance(o) ? 1 + RESONANCE_XP : 1;
        this.c.giveXp(o, Math.max(1, Math.round((raw[i] ?? 0) * xpLevelFactor(o.char.level, mon.level) * (o.noLoot ? 0.3 : 1) * res)));
        this.c.questEvent(o, 'kill', mon.def.id, 1);
        this.c.feedArtifact(o, mon);
        done.add(o);
      });
      // Chia đồ: boss hoặc chế độ tự do thì ai cũng có phần riêng; theo lượt thì một người nhận đồ, mọi người nhận linh thạch.
      const turn = party.loot === 'turn' && !mon.def.boss;
      let pick = -1;
      if (turn) {
        pick = nextTurn(party.members.length, party.lastTurn, (i) => pool.some((o) => o.char.id === party.members[i] && !o.noLoot));
        if (pick >= 0) party.lastTurn = pick;
      }
      for (const o of pool) this.rollLoot(o, mon, !turn || party.members[pick] === o.char.id ? 'all' : 'gold');
    }
    for (const p of dealers) {
      if (done.has(p)) continue;
      // Người trong tổ đội đã ra đòn nhưng đứng quá xa/đã ngã lúc quái chết: không né được phần chia để nhận trọn như người đơn;
      // chỉ được tính nhiệm vụ diệt quái (tu vi và đồ thuộc phần chia của tổ).
      if (parties.partyOf(p.char.id)) {
        this.c.questEvent(p, 'kill', mon.def.id, 1);
        this.c.feedArtifact(p, mon);
        continue;
      }
      if (!this.c.isDead(p)) this.c.giveXp(p, Math.max(1, Math.round(xp * xpLevelFactor(p.char.level, mon.level) * (p.noLoot ? 0.3 : 1))));
      this.rollLoot(p, mon);
      this.c.questEvent(p, 'kill', mon.def.id, 1);
      this.c.feedArtifact(p, mon);
    }
    mon.threat.clear();
    if (mon.def.boss) {
      this.c.sysAll('sys.boss_dead', { boss: monsterName(mon.def.id) }, 'good');
      // Boss gục: client hiện câu cuối (nếu có) cho người đứng gần.
      this.c.fx({ t: 'bfall', src: mon.id });
    }
    this.c.host.onMonsterKilled?.(mon);
  }

  rollLoot(p: PlayerEnt, mon: MonEnt, part: 'all' | 'gold' = 'all'): void {
    if (p.noLoot) return;
    const loot = lootOf(mon.def.id);
    const [g0, g1] = loot.gold;
    const gold = g0 + Math.floor(Math.random() * (g1 - g0 + 1));
    const got: { id: string; n: number }[] = [];
    for (const d of part === 'gold' ? [] : loot.drops) {
      if (Math.random() < d.chance) got.push({ id: d.item, n: d.min + Math.floor(Math.random() * (d.max - d.min + 1)) });
    }
    // Trang bị đã roll (Phase 3-2): phẩm, ô, ilvl chọn ở server; dòng chính/phụ roll trong addRolled (seed vào ledger).
    const gear = part === 'gold' ? [] : rollEquipDrops(loot.equip, ITEM_SYS, ITEMS, mon.level, Math.random);
    // Vàng luôn vào túi; vật phẩm nào không còn chỗ thì bỏ.
    const kept: { id: string; n: number }[] = [];
    const keptGear: { id: string; q: Quality; ilvl: number }[] = [];
    let full = false;
    const saved = p.char.tx('loot:' + mon.def.id, null, (d) => {
      d.addGold(gold);
      for (const g of gear) {
        // addRolled chỉ đụng túi khi còn chỗ; hết chỗ thì món đó bỏ, bản nháp vẫn dùng được.
        if (d.freeSlots() > 0 && d.addRolled(g.id, g.ilvl, g.q)) keptGear.push(g);
        else full = true;
      }
      for (const g of got) {
        // Kiểm tra trước để một món không vừa không làm hỏng cả bản nháp.
        const room = d.roomFor(g.id);
        if (room >= g.n && d.add(g.id, g.n)) kept.push(g);
        else full = true;
      }
      return true;
    });
    // Ghi DB lỗi: túi/ví không đổi nên không báo gì (tránh báo Thiên phẩm giả cho cả phòng).
    if (!saved) return;
    if (gold > 0) this.c.sys(p, 'sys.gold', { n: gold }, 'loot', { src: mon.id });
    for (const g of kept) this.c.sys(p, 'sys.loot', { item: itemName(g.id), n: g.n }, 'loot', { i: g.id, src: mon.id });
    for (const g of keptGear) {
      this.c.sys(p, 'sys.loot_gear', { item: itemName(g.id), quality: t('ui.quality.' + g.q) }, 'loot', { i: g.id, src: mon.id, q: g.q });
      if (g.q >= QUALITY_THAN) this.c.sysAll('sys.loot_than', { name: p.char.name, item: itemName(g.id) }, 'good');
      else if (g.q >= 4) this.c.sysAll('sys.loot_heaven', { name: p.char.name, item: itemName(g.id) }, 'good');
    }
    if (full) this.c.warn(p, 'sys.inv_full');
  }

  spawnFromDef(sp: SpawnDef): MonEnt | null {
    const def = MONSTER.get(sp.mon);
    if (!def) return null;
    const pos = this.c.randomPoint(sp.x, sp.z, sp.radius, !!def.boss);
    const level = sp.levelMin + Math.floor(Math.random() * (sp.levelMax - sp.levelMin + 1));
    return this.spawnMonster(def, level, pos.x, pos.z, sp);
  }

  spawnMonster(def: MonsterDef, level: number, x: number, z: number, spawn: SpawnDef | null): MonEnt {
    const st = monsterStats(level, def.hpMul, def.atkMul);
    const s = new MonS();
    s.t = def.id;
    s.x = x;
    s.z = z;
    s.y = this.c.terrain.groundAt(x, z);
    s.yaw = Math.random() * Math.PI * 2;
    s.hp = st.hp;
    s.mhp = st.hp;
    s.lv = level;
    s.st = MS_IDLE;
    const id = 'm' + this.c.nextId++;
    const m: MonEnt = {
      id,
      def,
      s,
      level,
      atk: st.atk,
      defn: st.def,
      homeX: x,
      homeZ: z,
      spawn,
      state: MS_IDLE,
      target: '',
      attackAt: 0,
      respawnAt: 0,
      removeAt: 0,
      thinkAt: this.c.now + Math.random() * 400,
      wanderAt: this.c.now + 2000 + Math.random() * 6000,
      wx: x,
      wz: z,
      unreachableSince: 0,
      slideSince: 0,
      slideLast: 0,
      slideD0: 0,
      evadeUntil: 0,
      marks: [],
      abilityAt: 0,
      threat: new Map(),
      owner: '',
      slotUntil: 0,
      slotCdAt: 0,
      slotSid: '',
      orbitSign: Math.random() < 0.5 ? -1 : 1,
      comboAt: 0,
      comboTarget: '',
      cast: null,
      castReadyAt: 0,
      chant: null,
      chantAt: 0,
      stunUntil: 0,
      phase: 0,
      rules: phaseRules(def, 0),
      posture: 0,
      staggerUntil: 0,
      staggerOkAt: 0,
      lastHitAt: 0,
      sweepAt: 0,
      windUntil: 0,
      mx: newRt(),
    };
    this.c.monsters.push(m);
    this.c.monById.set(id, m);
    this.c.state.monsters.set(id, s);
    return m;
  }

  respawnMonster(m: MonEnt, at?: { x: number; z: number }): void {
    const sp = m.spawn!;
    const pos = at ?? this.c.randomPoint(sp.x, sp.z, sp.radius, !!m.def.boss);
    m.level = sp.levelMin + Math.floor(Math.random() * (sp.levelMax - sp.levelMin + 1));
    const st = monsterStats(m.level, m.def.hpMul, m.def.atkMul);
    m.atk = st.atk;
    m.defn = st.def;
    m.homeX = m.wx = pos.x;
    m.homeZ = m.wz = pos.z;
    m.s.x = pos.x;
    m.s.z = pos.z;
    m.s.y = this.c.terrain.groundAt(pos.x, pos.z);
    m.s.lv = m.level;
    m.s.mhp = st.hp;
    m.s.hp = st.hp;
    m.state = MS_IDLE;
    m.s.st = MS_IDLE;
    m.target = '';
    m.threat.clear();
    this.resetAi(m);
    this.setPhase(m, 0);
    if (m.def.boss) this.c.sysAll('sys.boss_spawn', { boss: monsterName(m.def.id) }, 'info');
    if (this.isTimed(m)) this.sendBossTimers();
  }

  /** Tinh anh/boss đứng lẻ (không thuộc bãi): có giờ hồi sinh gửi xuống client (BossTimerMsg). */
  isTimed(m: MonEnt): boolean {
    return !m.camp && !!m.spawn && !m.owner && (!!m.def.boss || !!m.def.elite);
  }

  /** Giờ hồi sinh mọi tinh anh/boss của bản đồ; `at` = 0 khi đang sống. Không phụ thuộc AOI. */
  bossTimers(): BossTimerMsg {
    const list: BossTimerMsg['list'] = [];
    for (const m of this.c.monsters) {
      if (!this.isTimed(m)) continue;
      list.push({
        id: m.id,
        t: m.def.id,
        x: Math.round(m.homeX),
        z: Math.round(m.homeZ),
        lv: m.level,
        at: m.state === MS_DEAD ? Math.round(m.respawnAt) : 0,
      });
    }
    return { now: this.c.now, list };
  }

  /** Gửi giờ hồi sinh cho một người (lúc vào) hoặc cả phòng (khi một con đổi trạng thái). */
  sendBossTimers(p?: PlayerEnt): void {
    const msg = this.bossTimers();
    if (!msg.list.length) return;
    if (p) p.client.send(S.BOSS_TIMERS, msg);
    else this.c.host.broadcast(S.BOSS_TIMERS, msg);
  }

  removeMonster(m: MonEnt): void {
    this.c.gmSys.spawned.delete(m);
    this.resetAi(m);
    const i = this.c.monsters.indexOf(m);
    if (i >= 0) this.c.monsters.splice(i, 1);
    this.c.monById.delete(m.id);
    this.c.state.monsters.delete(m.id);
  }

  /**
   * Quái bị vật rắn (cây, đá, tường, phiến đá người đang đứng trên) giữ lại liên tục ≥ `BLOCK_STALL_MS` mà vẫn ngoài tầm đánh và không tiến gần mục tiêu
   * ≥ `BLOCK_PROGRESS` m: coi là không với tới, dùng chung nhánh `unreachableSince` → `evadeUntil` (không đứng ép vật mãi cho người đánh xa an toàn).
   */
  blockedStall(m: MonEnt, d: number, reach: number): boolean {
    if (!m.slideSince || this.c.now - m.slideLast > BLOCK_GAP_MS) return false;
    if (d <= reach) return false;
    return this.c.now - m.slideSince > BLOCK_STALL_MS && d > m.slideD0 - BLOCK_PROGRESS;
  }

  moveToward(m: MonEnt, tx: number, tz: number, speed: number, dt: number): number {
    const dx = tx - m.s.x;
    const dz = tz - m.s.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05) return d;
    const slowed = m.slow && this.c.now < m.slow.until ? m.slow.mul : 1;
    const step = Math.min(d, speed * slowed * dt);
    const nx = m.s.x + (dx / d) * step;
    const nz = m.s.z + (dz / d) * step;
    m.s.x = nx;
    m.s.z = nz;
    m.s.y = this.c.terrain.groundAt(nx, nz);
    // Không xuyên cây/đá/tường thấy được: trượt ra khỏi hình rắn (rẻ, không pathfinding; kẹt thì cơ chế bỏ đuổi `evadeUntil` lo).
    if (slideOut(this.c.collision, m.s, m.s.y, MON_RADIUS)) {
      m.s.y = this.c.terrain.groundAt(m.s.x, m.s.z);
      // Ghi nhận đang bị vật rắn giữ lại (xem `blockedStall`): trượt liên tục, mốc đầu và khoảng cách lúc đó.
      if (!m.slideSince || this.c.now - m.slideLast > BLOCK_GAP_MS) {
        m.slideSince = this.c.now;
        m.slideD0 = d;
      }
      m.slideLast = this.c.now;
    }
    m.s.yaw = Math.atan2(dx, dz);
    return d - step;
  }

  setMonState(m: MonEnt, st: number): void {
    m.state = st;
    if (m.s.st !== st) m.s.st = st;
    if (st === MS_RETURN || st === MS_DEAD || st === MS_IDLE) this.resetAi(m);
  }

  /** Hủy chuỗi đòn/niệm chú đang dở và nhả ô cận chiến (bỏ đuổi, chết, hồi sinh). */
  resetAi(m: MonEnt): void {
    this.c.monSkills.reset(m);
    m.chant = null;
    m.chantAt = 0;
    m.stunUntil = 0;
    m.posture = 0;
    m.sweepAt = 0;
    m.windUntil = 0;
    this.syncPosture(m);
    this.setMonFlags(m, 0, 0);
    this.resetTargetAi(m);
  }

  /**
   * Đổi mục tiêu: chỉ hủy phần nhắm người cũ (đòn đôi, chú đánh xa, ô cận chiến). Chú của boss là vòng quanh
   * chính nó nên giữ nguyên, kể cả lịch niệm, để không né được chú bằng cách đổi người giữ thù hận.
   */
  resetTargetAi(m: MonEnt): void {
    m.comboAt = 0;
    m.comboTarget = '';
    m.cast = null;
    m.slotUntil = 0;
    if (m.slotSid && this.meleeSlot.get(m.slotSid) === m.id) this.meleeSlot.delete(m.slotSid);
    m.slotSid = '';
  }

  /**
   * Mỗi người chơi chỉ một quái cận chiến được đánh cùng lúc. Trả về true nếu `m` đang giữ
   * (hoặc vừa giành được) ô của `target`; false thì `m` phải đi vòng ngoài.
   */
  holdsMeleeSlot(m: MonEnt, target: PlayerEnt, d: number, reach: number): boolean {
    const sid = target.sid;
    const hid = this.meleeSlot.get(sid);
    if (hid === m.id) {
      if (this.c.now < m.slotUntil) return true;
      // Hết lượt: có quái khác đang chờ thì nhường, không thì giữ tiếp.
      if (this.c.now - (this.slotWait.get(sid) ?? 0) > 400) {
        m.slotUntil = this.c.now + SLOT_HOLD_MS;
        return true;
      }
      this.meleeSlot.delete(sid);
      m.slotUntil = 0;
      m.slotSid = '';
      m.slotCdAt = this.c.now + SLOT_REST_MS;
      return false;
    }
    if (hid) {
      const h = this.c.monById.get(hid);
      if (h && h.target === sid && this.c.now < h.slotUntil && (h.state === MS_CHASE || h.state === MS_ATTACK)) {
        if (d <= reach + SLOT_CLAIM_DIST * 2) this.slotWait.set(sid, this.c.now);
        return false;
      }
    }
    if (d > reach + SLOT_CLAIM_DIST || this.c.now < m.slotCdAt) return false;
    if (m.slotSid && m.slotSid !== sid && this.meleeSlot.get(m.slotSid) === m.id) this.meleeSlot.delete(m.slotSid);
    this.meleeSlot.set(sid, m.id);
    m.slotSid = sid;
    m.slotUntil = this.c.now + SLOT_HOLD_MS;
    return true;
  }

  /** Đi vòng ngoài quanh mục tiêu, mặt hướng vào, chờ tới lượt. */
  orbit(m: MonEnt, target: PlayerEnt, d: number, reach: number, dt: number): void {
    const R = reach + 2.2 + m.def.scale;
    const px = target.move.x;
    const pz = target.move.z;
    const a = Math.atan2(m.s.x - px, m.s.z - pz) + m.orbitSign * 0.5;
    const far = d > R + 1.5;
    this.moveToward(m, px + Math.sin(a) * R, pz + Math.cos(a) * R, m.def.speed * (far ? 1 : 0.45), dt);
    if (!far) m.s.yaw = Math.atan2(px - m.s.x, pz - m.s.z);
    this.setMonState(m, MS_CHASE);
  }

  /** Đòn thứ hai của chuỗi: né được nếu đã ra khỏi tầm. */
  resolveCombo(m: MonEnt): void {
    const combo = m.rules.ai.combo;
    const p = this.c.players.get(m.comboTarget);
    m.comboAt = 0;
    m.comboTarget = '';
    if (!combo || !p || this.c.isDead(p)) return;
    const dx = p.move.x - m.s.x;
    const dz = p.move.z - m.s.z;
    const reach = m.def.attackRange + 0.8;
    const hit = dx * dx + dz * dz <= reach * reach && p.move.y - m.s.y < 3.5 + m.def.scale * 1.5;
    m.s.yaw = Math.atan2(dx, dz);
    this.c.fx(hit ? { t: 'bite', src: m.id, dst: p.sid } : { t: 'bite', src: m.id });
    if (!hit) return;
    const { dmg } = computeDamage(m.atk, combo.mul, p.char.def, Math.random(), 1);
    this.c.damagePlayer(p, dmg, m.id, true);
  }

  /** Quái đánh xa: giữ khoảng cách, đọc chú, rồi thả vùng báo trước đúng hình chiêu. */
  tickCaster(m: MonEnt, target: PlayerEnt, c: MonsterCaster, d: number, reachable: boolean, dt: number): void {
    const dx = target.move.x - m.s.x;
    const dz = target.move.z - m.s.z;
    if (m.cast) {
      m.s.yaw = Math.atan2(dx, dz);
      this.setMonState(m, MS_ATTACK);
      if (this.c.now >= m.cast.endAt) this.releaseCast(m, target, c, d, reachable);
      return;
    }
    if (d > c.range) {
      this.moveToward(m, target.move.x, target.move.z, m.def.speed, dt);
      this.setMonState(m, MS_CHASE);
      return;
    }
    if (d < c.range * 0.35 && d > 0.01) {
      // Bị áp sát: lùi ra cho đủ khoảng cách.
      this.moveToward(m, m.s.x - (dx / d) * 3, m.s.z - (dz / d) * 3, m.def.speed * 0.6, dt);
      this.setMonState(m, MS_CHASE);
    } else this.setMonState(m, MS_ATTACK);
    m.s.yaw = Math.atan2(dx, dz);
    if (reachable && this.c.now >= m.castReadyAt) {
      // Room gần trần số đạn: hoãn đọc chú thay vì tụ lực rồi xịt.
      if (c.shape === 'bolt' && this.c.bolts.length + boltCount(c) > BOLT_MAX_LIVE) {
        m.castReadyAt = this.c.now + 500;
        return;
      }
      m.cast = { endAt: this.c.now + c.cast * 1000 };
      this.c.fx({ t: 'mcast', src: m.id, dst: target.sid, d: c.cast });
    }
  }

  /**
   * Boss chém vùng: khóa hướng về mục tiêu, vùng báo trước (quạt/chữ nhật từ boss) hiện ngay, nổ sau `delay` giây.
   * Boss đứng yên tới lúc nổ để hình vùng và tư thế khớp nhau; ai đứng trong vùng lúc nổ mới trúng.
   */
  startSweep(m: MonEnt, target: PlayerEnt, sw: MonsterSweep): void {
    const yaw = Math.atan2(target.move.x - m.s.x, target.move.z - m.s.z);
    m.s.yaw = yaw;
    const g: HazardGeom =
      sw.shape === 'rect'
        ? { x: m.s.x, z: m.s.z, r: sw.r, sh: 'rect', yaw, w: sw.w }
        : { x: m.s.x, z: m.s.z, r: sw.r, sh: 'cone', yaw, w: (sw.w * Math.PI) / 180 };
    this.addHazard(g, sw.delay, sw.mul, false, sw.kind, m.id, m.atk);
    this.c.fx({ t: 'mcast', src: m.id, dst: target.sid, d: sw.delay });
    m.sweepAt = this.c.now + sw.cd * 1000;
    m.windUntil = this.c.now + sw.delay * 1000 + 250;
    m.attackAt = Math.max(m.attackAt, m.windUntil + 400);
    this.setMonState(m, MS_ATTACK);
  }

  releaseCast(m: MonEnt, target: PlayerEnt, c: MonsterCaster, d: number, reachable: boolean): void {
    m.cast = null;
    m.castReadyAt = this.c.now + c.cd * 1000;
    // Mục tiêu đã chạy xa hoặc lên chỗ không với tới: chiêu xịt.
    if (!reachable || d > c.range * 1.4) return;
    const yaw = Math.atan2(target.move.x - m.s.x, target.move.z - m.s.z);
    if (c.shape === 'bolt')
      return this.fireBolts(m, c, yaw, boltLift(target.move.y, this.c.terrain.groundAt(target.move.x, target.move.z)));
    let g: HazardGeom;
    if (c.shape === 'circle') g = { x: target.move.x, z: target.move.z, r: c.r };
    else if (c.shape === 'rect') g = { x: m.s.x, z: m.s.z, r: c.r, sh: 'rect', yaw, w: c.w ?? 2 };
    else g = { x: m.s.x, z: m.s.z, r: c.r, sh: 'cone', yaw, w: ((c.w ?? 30) * Math.PI) / 180 };
    this.addHazard(g, c.delay, c.mul, false, c.kind, m.id, m.atk);
  }

  tickMonster(m: MonEnt, dt: number): void {
    tickMonsterImpl(this, m, dt);
  }

  // ---------- vùng nguy hiểm (thiên lôi, chiêu boss) ----------

  /** `atk` > 0: `dmg` là hệ số, sát thương tính bằng computeDamage theo phòng thủ từng người lúc nổ. */
  addHazard(
    g: HazardGeom,
    delay: number,
    dmg: number,
    pct: boolean,
    kind: HazardMsg['kind'],
    src: string,
    atk = 0,
    lock = false,
    grp = 0,
    guard?: GuardCfg,
    cut?: { mul: number; max: number },
    mv?: HazardMsg['mv'],
    hot = false,
    dur = 0,
    seal?: Hazard['seal'],
    reach = false,
  ): void {
    const mon = this.c.monById.get(src) ?? null;
    this.c.hazards.push({
      x: g.x,
      z: g.z,
      r: g.r,
      sh: g.sh,
      yaw: g.yaw,
      w: g.w,
      at: this.c.now + delay * 1000,
      dmg,
      pct,
      atk,
      src,
      mon,
      lock,
      grp: grp || undefined,
      guard,
      cut,
      seal,
      reach: reach || undefined,
    });
    const msg: HazardMsg = { x: g.x, z: g.z, r: g.r, delay, kind, src };
    // Tia sét có hình theo seed để mọi client thấy cùng một tia (chỉ là lớp hình).
    if (kind === 'lightning') msg.sd = visualSeed();
    if (lock) msg.big = true;
    if (mv) msg.mv = mv;
    if (hot) msg.hot = true;
    if (dur > 0) msg.dur = dur;
    if (g.sh) {
      msg.sh = g.sh;
      msg.yaw = g.yaw ?? 0;
      msg.w = g.w;
    }
    this.c.emit(S.HAZARD, msg);
  }

  hazardGrp = 0;
  nextHazardGrp(): number {
    return ++this.hazardGrp;
  }

  tickHazards(): void {
    tickHazardsImpl(this);
  }

  /**
   * Bắn một loạt đạn về hướng `yaw` (nhắm chỗ mục tiêu đứng lúc bắn, không đón đầu: bước ngang là né).
   * Đạn bay thẳng, bám địa hình; server phán định trúng theo vị trí người chơi server giữ.
   */
  fireBolts(m: MonEnt, c: MonsterCaster, yaw: number, lift = 0): void {
    const v = c.speed ?? 9;
    const life = Math.min(BOLT_MAX_LIFE, (c.range * 1.6) / v);
    // Đầu nòng: trước mặt quái một chút để đạn không mọc ra từ giữa thân.
    const off = 0.6 + m.def.scale * 0.5;
    const ox = m.s.x + Math.sin(yaw) * off;
    const oz = m.s.z + Math.cos(yaw) * off;
    const spread = ((c.spread ?? 0) * Math.PI) / 180;
    for (const a of boltYaws(yaw, boltCount(c), spread)) {
      if (this.c.bolts.length >= BOLT_MAX_LIVE) return;
      const b: Bolt = {
        id: this.nextBoltId++,
        x0: ox,
        z0: oz,
        yaw: a,
        v,
        r: c.r,
        lift,
        t0: this.c.now,
        endAt: this.c.now + life * 1000,
        px: ox,
        pz: oz,
        atk: m.atk,
        mul: c.mul,
        mon: m,
      };
      this.c.bolts.push(b);
      const msg: BoltMsg = { id: b.id, x: ox, z: oz, yaw: a, v, r: c.r, life, t: this.c.now, kind: c.kind, src: m.id, sd: visualSeed() };
      if (lift > 0) msg.h = Math.round(lift * 100) / 100;
      this.c.emit(S.BOLT, msg);
    }
  }

  endBolt(i: number, x: number, z: number, hit?: string): void {
    const b = this.c.bolts[i];
    if (!b) return;
    this.c.bolts.splice(i, 1);
    const msg: BoltEndMsg = { id: b.id, x, z };
    if (hit) msg.hit = hit;
    this.c.emit(S.BOLT_END, msg);
  }

  tickBolts(): void {
    tickBoltsImpl(this);
  }

  // ---------- độ kiếp ----------
}
