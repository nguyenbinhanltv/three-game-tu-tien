// Vòng đời và tick người chơi (R-7): vào/ra room, lưu, đồng bộ, nhận input, di chuyển
import type { Client } from 'colyseus';
import {
  COMBAT_REGEN_DELAY,
  PF_STAGGER,
  newDodgeBank,
  PLAYER_STAGGER_GAP_MS,
  planDash,
  standingY,
  playerReaction,
  type HitTier,
  caveBoundOf,
  wearableBy,
  glowStage,
  encodeDye3,
  isEmptyLook,
  lookSet,
  setStatuses,
  visualEquip,
  accessoryCode,
  FLY_UNLOCK_LEVEL,
  HP_REGEN_IDLE,
  HP_REGEN_MEDITATE,
  IN_FLY,
  IN_JUMP,
  type InitMsg,
  type LevelDef,
  meditateXpPerSec,
  type MoveInput,
  MP_REGEN_COMBAT,
  MP_REGEN_IDLE,
  MP_REGEN_MEDITATE,
  PF_FLYING,
  PF_SHIELD,
  PROTOCOL_VERSION,
  S,
  canFlyAt,
  freeFlight,
  STEP,
  collisionOf,
  stepMove,
  type SysMsg,
  skyFlightUnlocked,
  type Terrain,
} from '@dtl/shared';
import { hitReactCfg } from '../hitreactCfg';
import { TribSystem } from '../trib';
import { ITEM, realmName, SETS } from '@dtl/content';
import { PlayerS, type WorldState } from '../../state';
import { type Character } from '../character';
import type { PlayerEnt, SimOptions } from '../entities';
import { CombatSystem } from '../combat';
import { MonsterSystem } from '../monsters';
import { MethodRt } from '../method';
import { RealmSystem } from '../realm';
import { SkillFlow } from '../skillflow';
import { DuelSystem } from '../duel';
import { QuestObjSystem } from '../questobj';
import { SoulSystem } from '../soul';
import { log } from '../../log';

const INPUT_BUDGET_MAX = 0.3;
const FLY_MP_PER_SEC = 1.5;
export const SAVE_INTERVAL = 30_000;

/** Phần GameSim mà hệ người chơi cần. */
export interface PlayerCtx {
  cancelCast(p: PlayerEnt): void;
  readonly combat: CombatSystem;
  readonly duel: DuelSystem;
  endTribulation(p: PlayerEnt, success: boolean, silent: boolean): void;
  finishCast(p: PlayerEnt): void;
  giveXp(p: PlayerEnt, n: number, announce?: boolean): void;
  isDead(p: PlayerEnt): boolean;
  readonly level: LevelDef;
  readonly monSys: MonsterSystem;
  readonly now: number;
  readonly opts: SimOptions;
  readonly players: Map<string, PlayerEnt>;
  questEvent(p: PlayerEnt, type: Parameters<Character['questEvent']>[0], target: string | undefined, n: number): void;
  readonly questObj: QuestObjSystem;
  readonly realm: RealmSystem;
  resolvePending(p: PlayerEnt): void;
  sendCd(p: PlayerEnt): void;
  setFlag(p: PlayerEnt, flag: number, on: boolean): void;
  setMeditating(p: PlayerEnt, on: boolean): void;
  readonly soul: SoulSystem;
  readonly state: WorldState;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string, drop?: Pick<SysMsg, 'i' | 'src' | 'q'>): void;
  readonly terrain: Terrain;
  tickTribulation(p: PlayerEnt): void;
  readonly tribSys: TribSystem;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
}

export class PlayerSystem {
  constructor(private readonly c: PlayerCtx) {}

  addPlayer(client: Client, char: Character, dev: boolean, session: string, noLoot = false): PlayerEnt {
    const s = new PlayerS();
    s.name = char.name;
    s.g = char.appearance.g;
    s.dye = char.appearance.dye;
    s.hr = char.appearance.hair ?? '';
    let x = this.c.opts.spawn.x;
    let z = this.c.opts.spawn.z;
    let y = 0;
    if (this.c.opts.persistPosition && char.room === this.c.opts.levelId && char.x > 1 && char.z > 1) {
      x = char.x;
      z = char.z;
      y = char.y;
    }
    if (char.hp <= 0) {
      // Rời game lúc đang trọng thương: tỉnh lại ở điểm hồi sinh, không đứng dậy tại chỗ.
      x = this.c.opts.respawn.x;
      z = this.c.opts.respawn.z;
      y = 0;
      char.hp = Math.round(char.mhp * 0.5);
    }
    const g = this.c.terrain.groundAt(x, z);
    if (!(y >= g)) y = g;
    if (y > g + 3) y = g; // không lưu trạng thái đang bay
    char.room = this.c.opts.levelId;
    char.charDirty = char.invDirty = char.questDirty = char.wardrobeDirty = true;
    const p: PlayerEnt = {
      sid: client.sessionId,
      client,
      char,
      s,
      dev,
      god: false,
      move: { x, y, z, vy: 0, grounded: true, flying: false },
      inputs: [],
      budget: 0,
      lastInputAt: this.c.now,
      lastYaw: 0,
      lastFlags: 0,
      gcdAt: 0,
      cds: new Map(),
      itemCdAt: 0,
      equipCdAt: 0,
      casting: null,
      flow: new SkillFlow(),
      shield: null,
      lastCombatAt: 0,
      variantAt: -1e9,
      hazardWin: { until: 0, taken: 0 },
      dodgeUntil: 0,
      evadeFxAt: -1e9,
      dodgeAt: -1e9,
      dodge: newDodgeBank(),
      staggerUntil: 0,
      staggerOkAt: 0,
      meditating: false,
      xpAcc: 0,
      trib: null,
      medAcc: 0,
      trial: null,
      warnAt: 0,
      chatAt: 0,
      msgWindowAt: this.c.now,
      msgCount: 0,
      skillWindowAt: this.c.now,
      skillCount: 0,
      mth: new MethodRt(),
      marks: [],
      saveAt: this.c.now + SAVE_INTERVAL,
      noLoot,
      connected: true,
      kicked: false,
    };
    this.syncPublic(p);
    this.c.state.players.set(p.sid, s);
    this.c.players.set(p.sid, p);
    const init: InitMsg = {
      sid: p.sid,
      protocol: PROTOCOL_VERSION,
      room: this.c.opts.roomName,
      char: char.view(),
      inv: char.inv,
      equip: char.equip,
      quests: char.quests,
      serverTime: Date.now(),
      dev,
      session,
    };
    client.send(S.INIT, init);
    char.charDirty = char.invDirty = char.questDirty = false;
    this.c.sendCd(p);
    return p;
  }

  removePlayer(sid: string): void {
    this.c.combat.echoes.delete(sid);
    const p = this.c.players.get(sid);
    if (!p) return;
    if (p.trib) this.c.endTribulation(p, false, true);
    this.c.realm.onLeave(p);
    this.c.duel.onGone(p);
    this.c.questObj.drop(p);
    this.savePlayer(p);
    this.c.monSys.meleeSlot.delete(sid);
    this.c.monSys.slotWait.delete(sid);
    this.c.players.delete(sid);
    this.c.state.players.delete(sid);
  }

  savePlayer(p: PlayerEnt): void {
    const c = p.char;
    if (this.c.opts.persistPosition) {
      // Đang xuất khiếu thám thính: lưu chỗ thân xác, không phải chỗ nguyên anh (có thể trong tường/giữa không).
      const at = this.c.soul.bodyOf(p) ?? p.move;
      c.x = at.x;
      c.y = at.y;
      c.z = at.z;
      c.room = this.c.opts.levelId;
    }
    try {
      c.save();
    } catch (e) {
      log.error('[save] lỗi lưu nhân vật', c.name, e);
    }
  }

  saveAll(): void {
    for (const p of this.c.players.values()) this.savePlayer(p);
  }

  syncPublic(p: PlayerEnt): void {
    const s = p.s;
    const c = p.char;
    const m = p.move;
    if (s.x !== m.x) s.x = m.x;
    if (s.y !== m.y) s.y = m.y;
    if (s.z !== m.z) s.z = m.z;
    if (s.vy !== m.vy) s.vy = m.vy;
    if (s.gr !== m.grounded) s.gr = m.grounded;
    const hp = Math.max(0, Math.ceil(c.hp));
    const mp = Math.max(0, Math.floor(c.mp));
    if (s.hp !== hp) s.hp = hp;
    if (s.mhp !== c.mhp) s.mhp = c.mhp;
    if (s.mp !== mp) s.mp = mp;
    if (s.mmp !== c.mmp) s.mmp = c.mmp;
    if (s.lv !== c.level) s.lv = c.level;
    // Tủ ngoại trang: ghi đè hiển thị theo ô (chỉ hình; chỉ số tính từ c.equip). Look rỗng thì đi đường cũ, không cấp phát.
    const ve = isEmptyLook(c.look) ? null : visualEquip(c.equip, c.look);
    const wp = (ve ? ve.weapon?.id : c.equip.weapon?.id) ?? '';
    if (s.wp !== wp) s.wp = wp;
    const wg = glowStage(c.equip.weapon?.plus ?? 0);
    if (s.wg !== wg) s.wg = wg;
    const sk =
      lookSet(
        ve
          ? setStatuses(
              SETS,
              Object.values(ve).map((x) => x.id),
            )
          : c.stats.sets,
      )?.id ?? '';
    if (s.sk !== sk) s.sk = sk;
    const sa = accessoryCode(SETS, ve ?? c.equip);
    if (s.sa !== sa) s.sa = sa;
    // Skin sai giới (đổi giới tính bằng GM sau khi mặc) không được hiển thị; món vẫn nằm ở ô, tháo ra bình thường.
    const skinId = c.equip.skin?.id ?? '';
    const sn = skinId && wearableBy(ITEM.get(skinId), c.appearance.g) ? skinId : '';
    if (s.sn !== sn) s.sn = sn;
    const d3 = encodeDye3(c.look.dye);
    if (s.dye3 !== d3) s.dye3 = d3;
    const art = c.equip.artifact?.id ?? '';
    if (s.art !== art) s.art = art;
    const mt = c.meta.method ?? '';
    if (s.mt !== mt) s.mt = mt;
    this.c.setFlag(p, PF_FLYING, m.flying);
  }

  /** Giới hạn tần suất message. Trả về false nếu phải bỏ message này. */
  rateOk(p: PlayerEnt): boolean {
    if (this.c.now - p.msgWindowAt >= 1000) {
      p.msgWindowAt = this.c.now;
      p.msgCount = 0;
    }
    p.msgCount++;
    if (p.msgCount > 400) {
      p.kicked = true;
      p.client.leave(4002);
      return false;
    }
    return p.msgCount <= 90;
  }

  // ---------- vòng tick ----------

  onInput(p: PlayerEnt, m: unknown): void {
    const i = m as Partial<MoveInput> | null;
    if (!i || typeof i !== 'object') return;
    const { s, mx, mz, yaw, f } = i;
    if (!Number.isInteger(s) || !Number.isFinite(mx) || !Number.isFinite(mz) || !Number.isFinite(yaw) || !Number.isInteger(f)) return;
    if ((s as number) <= p.s.seq && p.inputs.length === 0 && (s as number) !== 0) return;
    p.inputs.push({
      s: (s as number) >>> 0,
      mx: Math.max(-1, Math.min(1, mx as number)),
      mz: Math.max(-1, Math.min(1, mz as number)),
      yaw: yaw as number,
      f: (f as number) & 15,
    });
    p.lastInputAt = this.c.now;
  }

  /**
   * Chân Cảnh S1: người chơi trúng đòn của quái. Khựng ngắn (≤ `PLAYER_STAGGER_MAX_MS`) và đẩy lùi theo cấp đòn, do server quyết:
   * vị trí sau đẩy lùi lập bằng `planDash` (kiểm địa hình, vòng va chạm của level, mép hang) nên không xuyên tường; client không
   * gửi được vị trí này. Sau mỗi lần có `PLAYER_STAGGER_GAP_MS` miễn khựng để nhiều đòn liên tiếp không khóa người chơi.
   * Không áp khi độ kiếp, thử thách tâm ma, thám thính, đang bay, hoặc đang bất tử (né).
   */
  hitReact(p: PlayerEnt, tier: HitTier, fromX: number, fromZ: number): void {
    if (!hitReactCfg.enabled) return;
    const r = playerReaction(tier);
    if (r.staggerMs <= 0 && r.knockM <= 0) return;
    if (this.c.isDead(p) || p.trib || p.trial || p.move.flying || this.c.soul.isScouting(p)) return;
    if (this.c.now < p.staggerOkAt) return;
    p.staggerUntil = this.c.now + r.staggerMs;
    p.staggerOkAt = p.staggerUntil + PLAYER_STAGGER_GAP_MS;
    this.c.setFlag(p, PF_STAGGER, r.staggerMs > 0);
    if (r.knockM <= 0) return;
    let dx = p.move.x - fromX;
    let dz = p.move.z - fromZ;
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) return;
    dx /= l;
    dz /= l;
    const plan = planDash(p.move, { x: dx, z: dz }, r.knockM, undefined, {
      terrain: this.c.terrain,
      bound: caveBoundOf(this.c.level),
      collision: collisionOf(this.c.level),
    });
    if (plan.dist < 0.05) return;
    p.move.x = plan.x;
    p.move.z = plan.z;
    p.move.y = standingY(this.c.terrain, collisionOf(this.c.level), plan.x, plan.z, plan.y);
    p.move.vy = 0;
    p.move.grounded = true;
    p.inputs?.splice(0);
  }

  canFly(p: PlayerEnt): boolean {
    return !this.c.isDead(p) && !p.trib && (this.c.soul.isScouting(p) || canFlyAt(p.char.level, p.char.mp, p.move.x, p.move.y, p.move.z));
  }

  applyInput(p: PlayerEnt, inp: MoveInput): void {
    const dead = this.c.isDead(p);
    const active = inp.mx !== 0 || inp.mz !== 0 || (inp.f & IN_JUMP) !== 0 || ((inp.f & IN_FLY) !== 0 && !p.move.flying);
    if (active && !dead) {
      if (p.meditating) this.c.setMeditating(p, false);
      if (p.casting && (inp.mx !== 0 || inp.mz !== 0)) this.c.cancelCast(p);
    }
    const canFly = this.canFly(p);
    const wasFlying = p.move.flying;
    const px = p.move.x;
    const pz = p.move.z;
    const ghost = this.c.soul.ghostOf(p);
    stepMove(p.move, inp, {
      canFly,
      frozen: dead || this.c.tribSys.soulFrozen(p) || this.c.now < p.staggerUntil,
      speedMul: 1,
      terrain: this.c.terrain,
      collision: collisionOf(this.c.level),
      bound: caveBoundOf(this.c.level),
      sky: skyFlightUnlocked(p.char.level),
      ghost,
    });
    if (p.move.flying && !wasFlying && !ghost) {
      this.c.questEvent(p, 'fly', undefined, 1);
    }
    if ((inp.f & IN_FLY) !== 0 && !canFly && !dead && !p.trib && !ghost) {
      if (p.char.level < FLY_UNLOCK_LEVEL) this.c.warn(p, 'sys.fly_locked', { realm: realmName(FLY_UNLOCK_LEVEL) });
      else if (wasFlying) this.c.sys(p, 'sys.fly_no_mp', undefined, 'bad');
    }
    const dx = p.move.x - px;
    const dz = p.move.z - pz;
    if (dx * dx + dz * dz > 1e-5 && !p.casting) p.s.yaw = Math.atan2(dx, dz);
    p.s.seq = inp.s;
    p.lastYaw = inp.yaw;
    p.lastFlags = inp.f;
  }

  tickPlayer(p: PlayerEnt, dt: number): void {
    const c = p.char;
    p.budget = Math.min(p.budget + dt, INPUT_BUDGET_MAX);
    let applied = false;
    while (p.inputs.length > 0 && p.budget >= STEP - 1e-4) {
      this.applyInput(p, p.inputs.shift()!);
      p.budget -= STEP;
      applied = true;
    }
    if (p.inputs.length > 10) p.inputs.splice(0, p.inputs.length - 3);
    const falling = !p.move.grounded && !p.move.flying;
    if (!applied && p.budget >= STEP && (this.c.now - p.lastInputAt > 200 || (falling && p.budget >= STEP * 2))) {
      // Client im lặng (tab ẩn, mất mạng) hoặc cố gửi thưa lúc đang rơi: server tự chạy bước trung tính
      // để trọng lực luôn tác dụng theo giờ thật.
      this.applyInput(p, { s: p.s.seq, mx: 0, mz: 0, yaw: p.lastYaw, f: p.lastFlags & IN_FLY });
      p.budget -= STEP;
    }

    if (p.s.fl & PF_STAGGER && this.c.now >= p.staggerUntil) this.c.setFlag(p, PF_STAGGER, false);
    this.c.realm.tick(p);
    const dead = this.c.isDead(p);
    if (!dead) {
      if (p.move.flying && !this.c.soul.isScouting(p) && !freeFlight(c.level, p.move.x, p.move.y, p.move.z)) {
        c.mp -= FLY_MP_PER_SEC * dt;
        if (c.mp < 0) c.mp = 0;
      }
      const inCombat = this.c.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000;
      const hpRate = p.meditating ? HP_REGEN_MEDITATE : inCombat ? 0 : HP_REGEN_IDLE;
      const mpRate = p.move.flying ? 0 : p.meditating ? MP_REGEN_MEDITATE : inCombat ? MP_REGEN_COMBAT : MP_REGEN_IDLE;
      if (c.hp < c.mhp && hpRate > 0) c.hp = Math.min(c.mhp, c.hp + c.mhp * hpRate * dt);
      if (c.mp < c.mmp && mpRate > 0) c.mp = Math.min(c.mmp, c.mp + c.mmp * mpRate * dt);
      if (p.meditating) {
        p.medAcc += dt;
        if (p.medAcc >= 1) {
          const k = Math.floor(p.medAcc);
          p.medAcc -= k;
          this.c.questEvent(p, 'meditate', undefined, k);
        }
        p.xpAcc += meditateXpPerSec(c.level) * dt;
        if (p.xpAcc >= 1) {
          const n = Math.floor(p.xpAcc);
          p.xpAcc -= n;
          this.c.giveXp(p, n, false);
        }
      }
      if (p.casting && this.c.now >= p.casting.endAt) this.c.finishCast(p);
      if (p.flow.pending && this.c.now >= p.flow.pending.at) this.c.resolvePending(p);
      if (p.flow.buffered) this.c.combat.tickBuffered(p);
      if (p.shield && this.c.now >= p.shield.until) {
        p.shield = null;
        this.c.setFlag(p, PF_SHIELD, false);
      }
      if (p.trib) this.c.tickTribulation(p);
    }
    this.syncPublic(p);
  }

  // ---------- tu vi ----------
}
