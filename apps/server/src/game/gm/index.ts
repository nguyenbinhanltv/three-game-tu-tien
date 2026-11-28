// Lệnh GM của tài khoản thử (`/gm …`, `?realm=`, `?tribulation=`): tách từ GameSim (R-7), giữ nguyên hành vi.
// Hệ con chỉ biết GameSim qua giao diện hẹp `GmCtx`; mọi đổi vật phẩm/tiền vẫn qua `Character.tx` (tx + idem + sổ cái).
import {
  isRootId,
  ROOT_IDS,
  ARTIFACT_MAX_LEVEL,
  CHARGE_MAX,
  parseAppearance,
  EQUIP_SLOTS,
  wearableBy,
  MAX_ENHANCE,
  MAX_SKILL_LEVEL,
  METHOD_UNLOCK_LEVEL,
  VARIANT_MIN_LEVEL,
  type EquipSlot,
  type Quality,
  QUALITY_COUNT,
  initialBottleneck,
  MAX_LEVEL,
  parseRealmCode,
  INV_SIZE,
  planSort,
  MF_BROKEN,
  MF_CHANT,
  MF_STUN,
  MF_WEAK,
  MS_DEAD,
  MS_IDLE,
  MS_RETURN,
  MS_CHASE,
  MON_SKILLS,
  bossPhaseAt,
  type MonSkillName,
  tribDef,
  chainDone,
  setChainCleared,
  TRIB_DEFS,
  type TribId,
  xpNeed,
  sanitizeStars,
  type GmErr,
  type GmState,
} from '@dtl/shared';
import {
  ARTIFACT,
  APPEARANCE,
  ITEM,
  LAB_SCENES,
  itemName,
  itemTier,
  methodName,
  LEVELS,
  MONSTER,
  monsterName,
  QUEST,
  QUESTS,
  SET,
  SETS,
  SKILL,
  t,
  METHOD,
  VARIANTS,
  skillName,
} from '@dtl/content';
import { PLACE } from '@dtl/content/places';
import { isEquipSlot, type Character } from '../character';
import {
  BRANCH_METHOD,
  findIds,
  GM_GROUPS,
  GM_MAX_TIER,
  hasOutfitAsset,
  helpLine,
  isGmBranch,
  outfitRows,
  parsePlus,
  planKit,
  skinIds,
  weaponIds,
  type GmBranch,
} from './tools';
import { grantPathOf, methodOf, picksOf, resourceOf, setSkillLevel, skillLevelOf } from '../method';
import { DIEN_VO_ZONES, dienVoSpawnAt, dienVoStandAt, type LabScene, type LevelDef, type MonsterDef } from '@dtl/shared';
import type { MonEnt, PlayerEnt } from '../entities';
import { labMeter, meterLines } from './meter';

/** Loại chiêu quái ép được bằng `/gm cast`: bốn chiêu nền (hẹn giờ trên `MonEnt`) + chiêu mở rộng (`MON_SKILLS`, hẹn giờ ở `mx.next`). */
const CAST_BASE = ['chant', 'sweep', 'caster', 'slam'] as const;
type CastKind = (typeof CAST_BASE)[number] | MonSkillName;
const CAST_KINDS: readonly CastKind[] = [...CAST_BASE, ...MON_SKILLS];
/** Lặp một chiêu: nghỉ chừng này (ms) giữa hai lần; các chiêu khác bị hoãn `CAST_HOLD` ms. */
const CAST_LOOP_GAP = 1200;
const CAST_HOLD = 600_000;

/** Phần GameSim mà lệnh GM cần (giao diện hẹp, tránh import vòng lớp GameSim). */
interface GmCtx {
  level(): LevelDef;
  monsters(): readonly MonEnt[];
  playerCount(): number;
  tickP95(): number;
  inDuel(p: PlayerEnt): boolean;
  isDead(p: PlayerEnt): boolean;
  transferLevel(p: PlayerEnt, level: string, spawn: { x: number; z: number } | null, o?: { force?: boolean }): boolean;
  /** Vào Diễn Võ Trường (đang ở bản đồ thế giới) hoặc rời nó (đang ở trong). false = room này không làm được. */
  practice(p: PlayerEnt, key?: string): boolean;
  teleportTo(p: PlayerEnt, x: number, z: number, level?: string): boolean;
  teleGm(p: PlayerEnt, arg: string | undefined): string;
  players(): Iterable<PlayerEnt>;
  /** Công tắc và thao tác trên quái của phòng thử (MonsterSystem). */
  lab(): {
    gmFreeze: boolean;
    gmLockHp: boolean;
    gmPhaseLock: boolean;
    enterPhase(m: MonEnt, ph: number): void;
    resetAi(m: MonEnt): void;
    setMonState(m: MonEnt, st: number): void;
    stagger(m: MonEnt, sec: number): void;
    stun(m: MonEnt, sec: number): void;
    setPhase(m: MonEnt, ph: number): void;
    setMonFlags(m: MonEnt, mf: number, ce: number): void;
  };
  placeIds(): string[];
  questEvent(p: PlayerEnt, type: Parameters<Character['questEvent']>[0], target: string | undefined, n: number): void;
  damageMonster(mon: MonEnt, dmg: number, p: PlayerEnt | null): void;
  spawnMonster(def: MonsterDef, level: number, x: number, z: number, spawn: null): MonEnt;
  removeMonster(m: MonEnt): void;
  damagePlayer(p: PlayerEnt, dmg: number, src: string): void;
  heal(p: PlayerEnt): void;
  giveXp(p: PlayerEnt, n: number): void;
  sendCd(p: PlayerEnt): void;
  resetCooldowns(p: PlayerEnt): void;
  onBreakthrough(p: PlayerEnt, force?: boolean, id?: TribId): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
}

export class GmSystem {
  constructor(private readonly c: GmCtx) {}

  /** Đặt cấp cho tài khoản thử (`/gm level`, `/gm realm`, `?realm=`): bình cảnh các mốc thấp hơn coi như đã vượt, hồi đầy. */
  setLevel(p: PlayerEnt, level: number): void {
    const c = p.char;
    const lv = Math.max(1, Math.min(MAX_LEVEL, level | 0));
    c.level = lv;
    c.bk = initialBottleneck(lv);
    c.xp = 0;
    c.recalc();
    c.hp = c.mhp;
    c.mp = c.mmp;
    this.c.questEvent(p, 'level', undefined, lv);
  }

  /**
   * Kích độ kiếp ngay cho tài khoản thử (`/gm trib [truc_co|ket_dan|nguyen_anh|hoa_than]`, `?tribulation=1`): đưa về đại viên mãn đã vượt bình cảnh
   * của kiếp `id` (mặc định Trúc Cơ: Ngưng Khí 15), cấp một viên vật phẩm đột phá nếu có và thiếu (qua tx + sổ cái),
   * rồi đi đúng đường `onBreakthrough` như người chơi thật (`force`: bỏ qua cờ `enabled` của kiếp chưa mở).
   * Trả dòng báo cho người gọi.
   */
  tribulation(p: PlayerEnt, id: TribId = 'truc_co', stage?: number): string {
    const c = p.char;
    const def = tribDef(id);
    if (this.c.level().dungeon || this.c.isDead(p) || p.trib || p.trial || this.c.inDuel(p)) return 'trib: không độ kiếp được lúc này';
    // Đặt sau dòng kiểm bận: đang trong kiếp mà đổi tiến độ thì ải đang chạy sẽ không được lưu và nội tại pháp tắc bị mất giữa chừng.
    // Kiếp chuỗi (TN-4): `/gm trib ngu_suy [ải 1..5]` đặt lại tiến độ để vào thẳng ải đó (thưởng từng ải vẫn chỉ nhận một lần nhờ khóa chống trùng).
    if (def.chain) {
      if (stage !== undefined && Number.isInteger(stage) && stage >= 1 && stage <= def.phases.length)
        setChainCleared(c.meta, def, stage - 1);
      else if (chainDone(c.meta, def)) setChainCleared(c.meta, def, 0);
      c.recalc();
    }
    if (c.level !== def.from) this.setLevel(p, def.from);
    if (def.to > def.from) {
      c.bk = def.from;
      c.xp = xpNeed(def.from);
    }
    const item = def.item;
    if (item && !c.inv.some((it) => it?.id === item) && !c.tx('gm', null, (d) => d.add(item, 1)))
      return 'trib: túi đầy, không thêm được vật phẩm đột phá';
    this.c.onBreakthrough(p, true, id);
    return p.trib ? 'trib: bắt đầu độ kiếp' : def.room === 'tribulation' ? 'trib: đang vào room độ kiếp' : 'trib: không bắt đầu được';
  }

  /** Mỗi tick: người bật `/gm free` được xóa hồi chiêu và hồi đầy linh lực (GCD và khóa đòn giữ nguyên để nhịp ra chiêu vẫn thật). */
  tick(): void {
    if (this.dummy || this.loop) {
      const now = Date.now();
      for (const m of this.spawned) {
        if (m.state === MS_DEAD) continue;
        // Hình nộm cạn máu: chốt một lần "hạ" cho mọi đồng hồ đang đo rồi hồi đầy.
        if (this.dummy && m.s.hp <= 1) {
          for (const p of this.c.players()) labMeter.kill(p, now, m.id);
          m.s.hp = m.s.mhp;
        }
        if (this.loop) this.prime(m, this.loop, true);
      }
    }
    for (const p of this.c.players()) {
      if (labMeter.active(p))
        for (const k of labMeter.drain(p)) this.c.sys(p, 'sys.gm', { m: `hạ ${monsterName(k.def)}: ${k.ttk.toFixed(1)} s` }, 'info');
      if (!p.gmFree) continue;
      p.char.mp = p.char.mmp;
      if (p.cds.size) {
        p.cds.clear();
        this.c.sendCd(p);
        this.c.resetCooldowns(p);
      }
    }
  }

  /** Quái còn sống trong 40 m quanh người gọi lệnh. */
  private near(p: PlayerEnt): MonEnt[] {
    return this.c.monsters().filter((m) => m.state !== MS_DEAD && Math.hypot(m.s.x - p.move.x, m.s.z - p.move.z) < 40);
  }

  /**
   * `/gm state <weak|break|stun|chant|phase N|clear> [giây]`: ép trạng thái hiển thị lên quái quanh mình để soi viền, mood, hiệu ứng.
   * `break`/`stun`/`phase` đi đúng đường của trận thật; `weak`/`chant` chỉ bật cờ (nên dùng kèm `/gm freeze on` để AI không ghi đè).
   */
  private forceState(p: PlayerEnt, kind: string | undefined, arg: string | undefined): string {
    const lab = this.c.lab();
    const ms = this.near(p);
    const sec = Math.max(1, Math.min(600, Number(arg) || 8));
    const until = Date.now() + sec * 1000;
    switch (kind) {
      case 'break':
        for (const m of ms) lab.stagger(m, sec);
        break;
      case 'stun':
        for (const m of ms) lab.stun(m, sec);
        break;
      case 'weak':
        for (const m of ms) lab.setMonFlags(m, MF_WEAK, until);
        break;
      case 'chant':
        for (const m of ms) lab.setMonFlags(m, MF_CHANT, until);
        break;
      case 'phase': {
        const ph = Math.max(0, Number(arg) | 0);
        for (const m of ms) lab.setPhase(m, Math.min(ph, m.def.phases?.length ?? 0));
        break;
      }
      case 'clear':
        for (const m of ms) {
          m.stunUntil = 0;
          m.chant = null;
          lab.setMonFlags(m, 0, 0);
        }
        break;
      default:
        return helpLine('state')!;
    }
    return `state ${kind}: ${ms.length} quái`;
  }

  /**
   * `/gm scene <id>`: dựng lại một cảnh mẫu của phòng tập: trả phòng về như mới, dựng nhân vật, đưa tới khu, gọi quái vào chỗ cố định,
   * đóng băng + khóa máu + bất tử rồi ép trạng thái. Chỉ chạy trong phòng tập (chỗ đứng là tọa độ của phòng).
   */
  private scene(p: PlayerEnt, sc: LabScene): string {
    this.run(p, ['labreset']);
    this.run(p, ['build', sc.method, String(sc.level)]);
    const at = dienVoStandAt(sc.at);
    this.c.teleportTo(p, at.x, at.z);
    const lab = this.c.lab();
    lab.gmFreeze = true;
    lab.gmLockHp = true;
    p.god = true;
    const list = sc.mons.flatMap((g) => {
      const def = MONSTER.get(g.id);
      return def ? Array.from({ length: Math.min(GM_SPAWN_MAX, g.n) }, () => def) : [];
    });
    const small = list.filter((d) => !d.boss);
    const big = list.filter((d) => d.boss);
    const put = (defs: MonsterDef[], boss: boolean) =>
      defs.forEach((def, i) => {
        const s = dienVoSpawnAt(i, defs.length, boss);
        this.spawned.add(this.c.spawnMonster(def, Math.max(1, sc.level - 1), s.x, s.z, null));
      });
    put(small, false);
    put(big, true);
    if (sc.phase !== undefined) for (const m of this.spawned) lab.setPhase(m, Math.min(sc.phase, m.def.phases?.length ?? 0));
    if (sc.state) this.forceState(p, sc.state, '600');
    return `scene ${sc.id}: ${list.length} quái`;
  }

  /** Cảnh đang dựng dưới dạng `LabScene`: khu gần người gọi nhất, quái gọi bằng lệnh (gộp theo loại, giữ thứ tự gọi), trạng thái chung nếu mọi con cùng mang. */
  sceneOf(p: PlayerEnt, id: string): LabScene {
    let at = DIEN_VO_ZONES[0]!;
    for (const z of DIEN_VO_ZONES) if (Math.hypot(z.x - p.move.x, z.z - p.move.z) < Math.hypot(at.x - p.move.x, at.z - p.move.z)) at = z;
    const live = [...this.spawned].filter((m) => m.state !== MS_DEAD);
    const mons: { id: string; n: number }[] = [];
    for (const m of live) {
      const g = mons.find((x) => x.id === m.def.id);
      if (g) g.n++;
      else mons.push({ id: m.def.id, n: 1 });
    }
    const all = (bit: number) => live.length > 0 && live.every((m) => (m.s.mf & bit) !== 0);
    const sc: LabScene = { id, at: at.id, method: p.char.meta.method ?? '', level: p.char.level, mons };
    if (all(MF_BROKEN)) sc.state = 'break';
    else if (all(MF_WEAK)) sc.state = 'weak';
    else if (all(MF_CHANT)) sc.state = 'chant';
    else if (all(MF_STUN)) sc.state = 'stun';
    const ph = live.find((m) => m.phase > 0)?.phase;
    if (ph) sc.phase = ph;
    return sc;
  }

  /** Kết quả đang gom của `exec` (kênh C.GM); null khi lệnh đi qua chat. */
  private cap: { lines: string[]; ok: boolean; e?: GmErr; d?: unknown } | null = null;

  /** Số nguyên từ một từ của lệnh (cắt phần thập phân); null nếu thiếu hoặc không phải số. */
  private int(v: string | undefined): number | null {
    if (v === undefined || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? Math.trunc(x) : null;
  }

  /** Gắn dữ liệu có cấu trúc vào kết quả của `exec` (bỏ qua khi lệnh đi qua chat). */
  private data(d: unknown): void {
    if (this.cap) this.cap.d = d;
  }

  /**
   * Chạy một lệnh GM và trả kết quả CÓ CẤU TRÚC cho kênh C.GM: các dòng in ra (không gửi chat), thành công hay lỗi (+ mã lỗi), dữ liệu kèm theo.
   * Chỉ gọi cho tài khoản thử (nơi gọi kiểm `p.dev`); đường chạy là đúng `run`, nên mọi kiểm tham số/quyền/phòng giữ nguyên.
   */
  exec(p: PlayerEnt, a: string[]): { ok: boolean; e?: GmErr; m: string[]; d?: unknown } {
    const prev = this.cap;
    const cap: NonNullable<GmSystem['cap']> = { lines: [], ok: true };
    this.cap = cap;
    try {
      this.run(p, a);
    } finally {
      this.cap = prev;
    }
    return { ok: cap.ok, ...(cap.e ? { e: cap.e } : {}), m: cap.lines, ...(cap.d !== undefined ? { d: cap.d } : {}) };
  }

  /** Trạng thái phòng thử/nhân vật cho giao diện (công tắc, số đo, quái đã gọi). */
  state(p: PlayerEnt): GmState {
    const lab = this.c.lab();
    const lv = this.c.level();
    return {
      level: p.char.level,
      levelId: lv.id,
      practice: !!lv.dungeon?.practice,
      method: p.char.meta.method ?? null,
      branches: Object.fromEntries(Object.entries(picksOf(p.char) ?? {}).map(([tier, id]) => [tier, String(id)])),
      stars: p.char.meta.stars ?? 0,
      god: p.god,
      free: !!p.gmFree,
      freeze: lab.gmFreeze,
      lockhp: lab.gmLockHp,
      phaseLock: lab.gmPhaseLock,
      dummy: this.dummy,
      loop: this.loop,
      meter: labMeter.active(p),
      spawned: [...this.spawned]
        .filter((m) => m.state !== MS_DEAD)
        .map((m) => ({ id: m.id, def: m.def.id, hp: m.s.hp, mhp: m.s.mhp, phase: m.phase, state: m.state })),
    };
  }

  /** Quái gọi bằng `/gm spawn` (để `spawn clear` dọn). */
  readonly spawned = new Set<MonEnt>();
  /** `/gm dummy`: quái gọi bằng lệnh là hình nộm (cạn máu thì tính một lần hạ rồi hồi đầy). */
  private dummy = false;
  /** `/gm cast <loại> loop`: quái gọi bằng lệnh chỉ lặp một loại chiêu. */
  private loop: CastKind | null = null;

  /** Loại chiêu mà pha hiện tại của quái có. */
  private castKinds(m: MonEnt): CastKind[] {
    const ai = m.rules.ai;
    return CAST_KINDS.filter((k) => !!ai[k]);
  }

  private setCastAt(m: MonEnt, k: CastKind, f: (cur: number) => number): void {
    if (k === 'chant') m.chantAt = f(m.chantAt);
    else if (k === 'sweep') m.sweepAt = f(m.sweepAt);
    else if (k === 'caster') m.castReadyAt = f(m.castReadyAt);
    else if (k === 'slam') m.abilityAt = f(m.abilityAt);
    else m.mx.next[k] = f(m.mx.next[k] ?? 0);
  }

  /**
   * Hẹn chiêu `kind` của quái ra ngay (`only` = false) hoặc lặp mỗi `CAST_LOOP_GAP` ms và hoãn mọi chiêu khác (`only` = true).
   * Chỉ đổi mốc hẹn giờ: điều kiện ra chiêu (khoảng cách, với tới, đang không niệm dở) vẫn do AI thật kiểm.
   */
  private prime(m: MonEnt, kind: CastKind, only: boolean): void {
    const now = Date.now();
    for (const k of this.castKinds(m)) {
      if (k === kind) this.setCastAt(m, k, (cur) => (only ? Math.min(cur || now + CAST_LOOP_GAP, now + CAST_LOOP_GAP) : now));
      else if (only) this.setCastAt(m, k, (cur) => Math.max(cur, now + CAST_HOLD));
    }
  }

  /** Thôi lặp: các chiêu bị hoãn được dùng lại sau 2 giây. */
  private unloop(): void {
    this.loop = null;
    const now = Date.now();
    for (const m of this.spawned) for (const k of CAST_KINDS) this.setCastAt(m, k, (cur) => (cur > now + 60_000 ? now + 2000 : cur));
  }

  /** Dọn mọi quái gọi bằng lệnh và các công tắc sân boss/hình nộm. */
  private clearLab(): void {
    for (const m of [...this.spawned]) {
      this.c.removeMonster(m);
      this.spawned.delete(m);
    }
    this.c.lab().gmPhaseLock = false;
    this.dummy = false;
    this.loop = null;
  }

  private meterSay(p: PlayerEnt): void {
    const r = labMeter.report(p);
    if (!r) return;
    this.data(r);
    for (const line of meterLines(
      r,
      (id) => (SKILL.has(id) ? skillName(id) : id),
      (id) => monsterName(id),
    ))
      this.c.sys(p, 'sys.gm', { m: line }, 'info');
  }

  /** Mặc `n` món đầu của bộ `st` (Địa phẩm), cất đồ cũ vào túi. Dùng cho `/gm set` và `/gm outfit`. */
  wearSet(p: PlayerEnt, st: { pieces: string[] }, n: number): boolean {
    const c = p.char;
    const ok = c.tx('gm:set', null, (d) => {
      for (const pid of st.pieces.slice(0, n)) {
        if (!d.addRolled(pid, c.level, 3)) return false;
        const i = d.inv.findIndex((s) => s?.id === pid && s.inst);
        const slot = ITEM.get(pid)!.kind as EquipSlot;
        const old = d.equip[slot];
        d.equip[slot] = d.inv[i]!;
        d.inv[i] = old ?? null;
      }
      return true;
    });
    if (ok) c.recalc();
    return ok;
  }

  /**
   * Roll và mặc trực tiếp từng món (phẩm cao nhất, cường hóa `plus`); món đang mặc ở ô đó bị thu hồi qua sổ cái (-1).
   * Một transaction: túi đầy hoặc id lạ thì không đổi gì.
   */
  equipPieces(p: PlayerEnt, pieces: { slot: EquipSlot; id: string }[], plus: number, quality: Quality = 4): boolean {
    const c = p.char;
    const ok = c.tx('gm:kit', null, (d) => {
      for (const { slot, id } of pieces) {
        const def = ITEM.get(id);
        if (!def || def.kind !== slot) return false;
        const old = d.equip[slot];
        if (old) {
          d.bump(old.id, -(old.n || 1));
          delete d.equip[slot];
        }
        const i = d.inv.findIndex((x) => !x);
        if (i < 0 || !d.addRolled(id, Math.max(c.level, def.reqLevel ?? 1), quality)) return false;
        const it = d.inv[i]!;
        d.inv[i] = null;
        d.equip[slot] = plus > 0 ? { ...it, plus } : it;
      }
      return true;
    });
    if (ok) c.recalc();
    return ok;
  }

  gender(p: PlayerEnt, g: 'm' | 'f'): void {
    const ap = parseAppearance(APPEARANCE, { g, dye: p.char.appearance.dye, hair: p.char.appearance.hair });
    if (!ap) return;
    p.char.setAppearance(ap);
    p.s.g = ap.g;
    p.s.dye = ap.dye;
  }

  /** Lệnh GM, chỉ dành cho tài khoản dev khi AUTH_DEV_BYPASS bật. */
  run(p: PlayerEnt, a: string[]): void {
    const c = p.char;
    // Kênh C.GM (`exec`): gom dòng in ra thay vì gửi chat; `fail`/`usage` đánh dấu lỗi (ngoài kênh đó chúng chỉ in như `say`).
    const say = (m: string): void => {
      if (this.cap) this.cap.lines.push(m);
      else this.c.sys(p, 'sys.gm', { m }, 'info');
    };
    const fail = (m: string, e: GmErr = 'fail'): void => {
      if (this.cap) {
        this.cap.ok = false;
        this.cap.e ??= e;
      }
      say(m);
    };
    const usage = (m: string): void => fail(m, 'usage');
    /** In kết quả thành công và gắn dữ liệu có cấu trúc cho kênh C.GM. */
    const done = (m: string, d?: unknown): void => {
      say(m);
      if (d !== undefined) this.data(d);
    };
    const num = (v: string | undefined): number | null => this.int(v);
    switch (a[0]) {
      case 'level':
      case 'realm': {
        // `level N` hoặc `realm nk1…nk15 | tc | tc1…tc3`: cùng một đường đặt cấp.
        const lvArg = num(a[1]);
        const lv = a[0] === 'realm' ? parseRealmCode(a[1] ?? '') : lvArg === null ? null : Math.max(1, Math.min(MAX_LEVEL, lvArg));
        if (lv === null) return usage(a[0] === 'realm' ? 'realm nk1…nk15 | tc | tc1…tc3' : `level <1-${MAX_LEVEL}>`);
        this.setLevel(p, lv);
        return done('level = ' + c.level, { level: c.level });
      }
      case 'dao': {
        // /gm dao <kim|moc|thuy|hoa|tho|loi|clear>: đặt hoặc xóa Đạo (TN-3), không cần đủ cấp Vấn Đỉnh.
        if (a[1] === 'clear') delete c.meta.dao;
        else if (isRootId(a[1])) c.meta.dao = a[1];
        else return usage('dao ' + ROOT_IDS.join(' | ') + ' | clear');
        c.recalc();
        c.charDirty = true;
        return done('dao = ' + (c.meta.dao ?? 'không'), { dao: c.meta.dao ?? null });
      }
      case 'kieu': {
        // /gm kieu <0..9>: đặt số cầu Cửu Kiều đã qua (TN-7) để thử; không phát thưởng, không đổi cấp.
        const n = Number(a[1]);
        if (!Number.isInteger(n) || n < 0 || n > 9) return usage('kieu 0..9');
        c.meta.kieu = n;
        c.recalc();
        c.charDirty = true;
        c.gainXp(0);
        return done(`kieu = ${n} (trần cấp ${c.levelCap()})`, { kieu: n, levelCap: c.levelCap() });
      }
      case 'trib':
        // /gm trib [id]: kích độ kiếp ngay (mặc định Trúc Cơ: Ngưng Khí 15 viên mãn + Trúc Cơ Đan nếu thiếu).
        if (a[1] && !(a[1] in TRIB_DEFS)) return usage(`trib ${Object.keys(TRIB_DEFS).join(' | ')}`);
        const tr = this.tribulation(p, (a[1] as TribId | undefined) ?? 'truc_co', a[2] ? Number(a[2]) : undefined);
        return tr.startsWith('trib: không') ? fail(tr) : done(tr, { id: a[1] ?? 'truc_co' });
      case 'xp': {
        const x = num(a[1]);
        if (x === null || x < 0) return usage('xp <n ≥ 0>');
        this.c.giveXp(p, x);
        return done(`xp +${x}`, { added: x, level: c.level, xp: c.xp });
      }
      case 'gold': {
        const x = num(a[1]);
        if (x === null) return usage('gold <n>');
        c.tx('gm', null, (d) => (d.addGold(Math.max(1, x)), true));
        return done('gold = ' + c.gold, { gold: c.gold, added: Math.max(1, x) });
      }
      case 'roll': {
        // /gm roll <mẫu trang bị> [phẩm 0-5] [ilvl]: roll một món (kiểm thử hệ trang bị 8 ô).
        const q0 = a[2] === undefined ? 0 : num(a[2]);
        const il0 = a[3] === undefined ? c.level : num(a[3]);
        if (!a[1] || !ITEM.has(a[1]) || q0 === null || il0 === null) return usage('roll <mẫu trang bị> [phẩm 0-5] [ilvl]');
        const q = Math.min(QUALITY_COUNT - 1, Math.max(0, q0));
        const il = Math.max(1, il0);
        const ok = c.tx('gm', null, (d) => d.addRolled(a[1]!, il, q as Quality));
        return ok ? done(`đã roll ${a[1]} phẩm ${q} ilvl ${il}`, { id: a[1], quality: q, ilvl: il }) : fail(t('gm.msg.bag_full'));
      }
      case 'plus': {
        // Đặt cấp cường hóa của món đang mặc ở ô `a[2]` (mặc định pháp kiếm) để thử VFX +7/+10 và rớt cấp.
        const n0 = num(a[1]);
        if (n0 === null || (a[2] !== undefined && !isEquipSlot(a[2]))) return usage('plus <0-10> [ô]');
        const slot = isEquipSlot(a[2]) ? a[2] : 'weapon';
        const n = Math.max(0, Math.min(MAX_ENHANCE, n0));
        const ok = c.tx('gm:plus', null, (d) => {
          const w = d.equip[slot];
          if (!w) return false;
          d.equip[slot] = n > 0 ? { ...w, plus: n } : { ...w, plus: undefined };
          if (n === 0) delete d.equip[slot]!.plus;
          return true;
        });
        if (ok) c.recalc();
        return ok ? done(`${slot} +${n}`, { slot, plus: n }) : fail(`ô ${slot} chưa mặc đồ`);
      }
      case 'art': {
        // /gm art <id pháp bảo> [cấp 1-5]: có và đeo luôn (không cần chế); `art off` cất vào túi. Chỉ để thử.
        if (a[1] === 'off') {
          const ok = c.tx('gm:art', null, (d) => {
            const it = d.equip.artifact;
            if (!it) return true;
            const i = d.inv.findIndex((x) => !x);
            if (i < 0) return false;
            d.inv[i] = it;
            delete d.equip.artifact;
            return true;
          });
          if (ok) c.recalc();
          return ok ? done('đã cất pháp bảo', { artifact: null }) : fail('túi đầy');
        }
        if (!ARTIFACT.has(a[1] ?? '')) return usage('art ' + [...ARTIFACT.keys()].join(' | ') + ' | off');
        const ok = c.tx('gm:art', null, (d) => {
          const prev = d.equip.artifact;
          if (prev) {
            const i = d.inv.findIndex((x) => !x);
            if (i < 0) return false;
            d.inv[i] = prev;
          }
          d.equip.artifact = { id: a[1] ?? '', n: 1 };
          d.bump(a[1] ?? '', 1);
          return true;
        });
        if (!ok) return fail('không đeo được');
        const lv = Math.max(1, Math.min(ARTIFACT_MAX_LEVEL, Number(a[2] ?? 1) | 0));
        c.meta.art ??= {};
        c.meta.art[a[1] ?? ''] = { lv, qi: 0 };
        c.recalc();
        p.mth.dirty = true;
        return done('art = ' + a[1] + ' cấp ' + lv, { id: a[1], level: lv });
      }
      case 'give': {
        const cnt = a[2] === undefined ? 1 : num(a[2]);
        if (!a[1] || cnt === null) return usage('give <id vật phẩm> [số lượng]');
        if (!ITEM.has(a[1])) return fail(`Không có vật phẩm ${a[1]}. Thử /gm find <tên>.`);
        const ok = c.tx('gm', null, (d) => d.add(a[1]!, Math.max(1, cnt)));
        return ok ? done('đã thêm ' + a[1], { id: a[1], n: Math.max(1, cnt) }) : fail(t('gm.msg.bag_full'));
      }
      case 'set': {
        // `set <id bộ> [số món]`: roll rồi mặc luôn các món của bộ (Địa phẩm) để thử hiệu ứng 2/4 món và màu áo; `set off` cởi hết.
        if (a[1] === 'off') {
          // Cất đồ vào túi (không xóa) để sổ cái vẫn khớp.
          const ok = c.tx('gm:set', null, (d) => {
            for (const k of EQUIP_SLOTS) {
              const it = d.equip[k];
              if (!it) continue;
              const i = d.inv.findIndex((x) => !x);
              if (i < 0) return false;
              d.inv[i] = it;
              delete d.equip[k];
            }
            return true;
          });
          if (ok) c.recalc();
          return ok ? done(t('gm.msg.set_off'), { worn: 0 }) : fail(t('gm.msg.bag_full'));
        }
        if (a[1] === 'list') {
          for (const x of SETS) say(`${x.id} — ${t('set.' + x.id + '.name')} (${x.pieces.length} món)`);
          return this.data({ sets: SETS.map((x) => ({ id: x.id, name: t('set.' + x.id + '.name'), pieces: x.pieces.length })) });
        }
        const st = SET.get(a[1] ?? '');
        const cnt = a[2] === undefined ? (st?.pieces.length ?? 0) : num(a[2]);
        if (!st || cnt === null) return usage('set off | list | ' + SETS.map((x) => x.id).join(' | ') + ' [số món]');
        const n = Math.max(1, Math.min(st.pieces.length, cnt));
        return this.wearSet(p, st, n)
          ? done(t('gm.msg.set_worn', { n, total: st.pieces.length, name: t('set.' + st.id + '.name') }), { id: st.id, worn: n, total: st.pieces.length })
          : fail(t('gm.msg.bag_full'));
      }
      case 'tp': {
        // `tp x z` hoặc `tp <địa điểm>` (bảng packages/content/data/places.json, cùng bảng với ?at=).
        if (a.length === 2) {
          const pl = PLACE.get(a[1] ?? '');
          if (!pl) return usage('tp ' + this.c.placeIds().join(' | '));
          if (pl.level !== this.c.level().id) {
            const ok = !LEVELS[pl.level]?.dungeon && this.c.transferLevel(p, pl.level, { x: pl.x, z: pl.z }, { force: true });
            return ok ? done(`tp ${pl.id} → ${pl.level}`, { place: pl.id, level: pl.level, x: pl.x, z: pl.z }) : fail(`${pl.id} thuộc ${pl.level}, không chuyển được`);
          }
          this.c.teleportTo(p, pl.x, pl.z);
          return done(`tp ${pl.id} (${pl.x}, ${pl.z})`, { place: pl.id, level: pl.level, x: pl.x, z: pl.z });
        }
        if (a.length === 1) return usage('tp x z | tp ' + this.c.placeIds().join(' | '));
        const x = Number(a[1]);
        const z = Number(a[2]);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return usage('tp x z | tp <địa điểm>');
        this.c.teleportTo(p, x, z);
        return done(`tp ${x} ${z}`, { x, z });
      }
      case 'tele': {
        const r = this.c.teleGm(p, a[1]);
        return r.startsWith('tele all |') ? usage(r) : say(r);
      }
      case 'qdone': {
        // /gm qdone <id|chuong2>: ghi nhiệm vụ đã xong (bỏ qua điều kiện) để thử chuỗi nhiệm vụ; chuong2 = mọi q2_* trước q2_ket_dan.
        const ids =
          a[1] === 'chuong2'
            ? QUESTS.filter((q) => q.id.startsWith('q2_') && q.id !== 'q2_ket_dan').map((q) => q.id)
            : QUEST.has(a[1] ?? '')
              ? [a[1]!]
              : [];
        if (!ids.length) return usage('qdone <id nhiệm vụ> | chuong2');
        for (const id of ids) {
          delete p.char.quests.active[id];
          if (!p.char.quests.done.includes(id)) p.char.quests.done.push(id);
        }
        p.char.questDirty = true;
        return done('qdone ' + ids.join(','), { ids });
      }
      case 'qev': {
        // /gm qev <loại> [đích] [n]: bắn một sự kiện nhiệm vụ (ví dụ `qev dungeon phuc_mach_quat` thay cho phó bản chưa có).
        const types = [...new Set(QUESTS.flatMap((q) => q.objectives.map((o) => o.type as string)))];
        const cnt = a[3] === undefined ? 1 : num(a[3]);
        if (!a[1] || !types.includes(a[1]) || cnt === null) return usage('qev <loại> [đích|-] [n] — loại: ' + types.join(' | '));
        this.c.questEvent(p, a[1] as never, a[2] === '-' ? undefined : a[2], cnt);
        return done(`qev ${a[1]} ${a[2] ?? '-'} ${cnt}`, { type: a[1], target: a[2] === undefined || a[2] === '-' ? null : a[2], n: cnt });
      }
      case 'god': {
        p.god = a[1] === 'off' ? false : a[1] === 'on' ? true : !p.god;
        if (p.god) this.c.heal(p);
        return done('god ' + (p.god ? 'on' : 'off'), { god: p.god });
      }
      case 'heal':
        c.hp = c.mhp;
        c.mp = c.mmp;
        return done('đã hồi đầy', { hp: c.hp, mp: c.mp });
      case 'branch': {
        // /gm branch <mốc> <id> | reset: chọn nhánh công pháp ngay (bỏ kiểm cảnh giới/giao chiến) hoặc xóa hết nhánh, không tốn linh thạch.
        const mdef = methodOf(c.meta);
        if (!mdef) return fail('chưa chọn công pháp');
        if (a[1] === 'reset') {
          c.tx('gm:branch:reset', null, (d) => d.clearBranches(mdef.id));
          p.mth.dirty = true;
          return done('đã xóa nhánh của ' + mdef.id, { picks: {} });
        }
        const tier = num(a[1]);
        const br = mdef.branches.find((b) => b.tier === tier && b.id === a[2]);
        if (!br) return usage('branch <mốc> <id>: ' + mdef.branches.map((b) => `${b.tier} ${b.id}`).join(' | '));
        c.tx('gm:branch:pick', null, (d) => d.setBranch(mdef.id, br.tier, br.id));
        p.mth.dirty = true;
        return done(`nhánh ${br.tier} = ${br.id}; đang có: ${JSON.stringify(picksOf(c) ?? {})}`, { picks: picksOf(c) ?? {} });
      }
      case 'res': {
        // /gm res [n]: đặt tài nguyên riêng của công pháp (mặc định đầy).
        const rdef = resourceOf(c.meta);
        if (!rdef) return fail('chưa chọn công pháp');
        const rv = a[1] === undefined ? rdef.max : num(a[1]);
        if (rv === null) return usage('res [n]');
        p.mth.res = Math.max(0, Math.min(rdef.max, rv));
        // Giờ của sim là `Date.now()` mỗi tick.
        p.mth.resAt = Date.now();
        p.mth.dirty = true;
        return done(rdef.id + ' = ' + p.mth.res, { id: rdef.id, value: p.mth.res, max: rdef.max });
      }
      case 'stars': {
        // /gm stars <0-9>: đặt sao Cổ Thần ngay (chỉ để thử/chụp ảnh): bỏ cấp, vật phẩm, linh thạch; không ghi ledger.
        const sv = num(a[1]);
        if (sv === null) return usage('stars <0-9>');
        c.meta.stars = sanitizeStars(sv);
        c.recalc();
        c.save();
        p.mth.dirty = true;
        return done('sao Cổ Thần = ' + (c.meta.stars ?? 0), { stars: c.meta.stars ?? 0 });
      }
      case 'charge': {
        // /gm charge [0-100]: đặt vòng sạc chiêu tối thượng (mặc định đầy).
        const cv = a[1] === undefined ? CHARGE_MAX : num(a[1]);
        if (cv === null) return usage('charge [0-100]');
        p.mth.charge = Math.max(0, Math.min(CHARGE_MAX, cv));
        p.mth.dirty = true;
        return done('sạc = ' + p.mth.charge, { charge: p.mth.charge });
      }
      case 'cd':
        // /gm cd: xóa hồi chiêu, GCD và hồi thần thức (chụp ảnh nhiều chiêu liên tiếp).
        p.cds.clear();
        p.gcdAt = 0;
        this.c.sendCd(p);
        this.c.resetCooldowns(p);
        return done('đã xóa hồi chiêu', {});
      case 'variant': {
        // /gm variant <id chiêu> <a|b>: chọn biến thức ngay (không cần cấp 3, ngoài combat, hồi chờ) để chụp ảnh/thử.
        const sk = SKILL.get(a[1] ?? '');
        if (!sk || !VARIANTS[sk.id] || (a[2] !== 'a' && a[2] !== 'b'))
          return usage('variant <skill> a|b — skill: ' + Object.keys(VARIANTS).join(' | '));
        if (skillLevelOf(c.meta, sk.id) < VARIANT_MIN_LEVEL) setSkillLevel(c.meta, sk.id, VARIANT_MIN_LEVEL);
        c.meta.skillVar ??= {};
        c.meta.skillVar[sk.id] = a[2];
        p.mth.dirty = true;
        return done('variant ' + sk.id + ' = ' + a[2], { skill: sk.id, variant: a[2] });
      }
      case 'method': {
        // /gm method <id> [cấp chiêu]: chọn công pháp ngay (không cần tầng/NPC/linh thạch); cấp chiêu áp cho mọi chiêu mở.
        if (!METHOD.has(a[1] ?? '')) return usage('method ' + [...METHOD.keys()].join(' | '));
        c.meta.method = a[1] ?? '';
        grantPathOf(c.meta);
        const lv0 = a[2] === undefined ? 1 : num(a[2]);
        if (lv0 === null) return usage('method <id> [cấp chiêu 1-5]');
        const lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, lv0));
        for (const sk of SKILL.values()) if (!sk.method || sk.method === a[1]) setSkillLevel(c.meta, sk.id, lv);
        p.mth.reset();
        c.recalc();
        return done('method = ' + a[1] + ' cấp chiêu ' + lv, { method: a[1], skillLevel: lv });
      }

      case 'dye': {
        // Thử đổi màu áo lúc đang chơi (người khác thấy qua schema); vẫn kiểm như lúc tạo nhân vật.
        const ap = parseAppearance(APPEARANCE, { g: c.appearance.g, dye: a[1], hair: c.appearance.hair });
        if (!ap) return usage('dye ' + APPEARANCE.dyes.map((d) => d.id).join(' | '));
        c.setAppearance(ap);
        p.s.g = ap.g;
        p.s.dye = ap.dye;
        return done('dye = ' + ap.dye, { dye: ap.dye });
      }
      case 'die': {
        const god = p.god;
        p.god = false;
        this.c.damagePlayer(p, 999999, '');
        p.god = god;
        return done('đã chết (hồi sinh ở điểm hồi sinh)', { dead: true });
      }
      case 'killall': {
        let n = 0;
        for (const m of this.c.monsters()) {
          if (m.state !== MS_DEAD && Math.hypot(m.s.x - p.move.x, m.s.z - p.move.z) < 40) {
            this.c.damageMonster(m, m.s.hp, p);
            n++;
          }
        }
        return done('hạ ' + n + ' quái', { n });
      }
      case 'hurt': {
        // Thử pha boss: hạ máu quái quanh mình về `pct`% (qua damageMonster nên pha/phá thế chạy như thật).
        const pv = a[1] === undefined ? 50 : num(a[1]);
        if (pv === null) return usage(helpLine('hurt')!);
        const pct = Math.max(1, Math.min(100, pv || 50));
        let n = 0;
        for (const m of this.c.monsters()) {
          if (m.state === MS_DEAD || Math.hypot(m.s.x - p.move.x, m.s.z - p.move.z) >= 40) continue;
          const want = Math.ceil((m.s.mhp * pct) / 100);
          if (m.s.hp > want) {
            this.c.damageMonster(m, m.s.hp - want, p);
            n++;
          }
        }
        return done('hạ máu ' + n + ' quái về ' + pct + '%', { n, pct });
      }
      case 'spawn': {
        // Gọi quái thử ngay trước mặt (không hồi sinh, tự dọn sau khi chết); `spawn clear` dọn hết quái gọi bằng lệnh này.
        if (a[1] === 'clear') {
          let n = 0;
          for (const m of [...this.spawned]) {
            this.c.removeMonster(m);
            n++;
          }
          return done(t('gm.msg.spawn_clear', { n }), { n });
        }
        if (!a[1]) return usage('spawn <id quái|clear> [n ≤ ' + GM_SPAWN_MAX + ']');
        const def = MONSTER.get(a[1]);
        if (!def) return fail(t('gm.msg.no_mon', { id: a[1] }));
        const n0 = a[2] === undefined ? 1 : num(a[2]);
        if (n0 === null) return usage('spawn <id quái|clear> [n ≤ ' + GM_SPAWN_MAX + ']');
        const n = Math.max(1, Math.min(GM_SPAWN_MAX, n0));
        const fwd = p.s.yaw;
        const made: string[] = [];
        // Phòng tập: quái thường xếp vòng trong sàn đấu, boss vào hố boss (luôn nằm trong khung camera, không phụ thuộc hướng người gọi).
        if (this.c.level().dungeon?.practice) {
          for (let i = 0; i < n; i++) {
            const at = dienVoSpawnAt(i, n, !!def.boss);
            const mm = this.c.spawnMonster(def, Math.max(1, p.char.level - 1), at.x, at.z, null);
            this.spawned.add(mm);
            made.push(mm.id);
          }
          return done(`gọi ${n} ${def.id}`, { def: def.id, n, ids: made });
        }
        for (let i = 0; i < n; i++) {
          // Quạt rộng 150° phía trước, cách 8 m (xếp hai hàng khi đông).
          const ang = fwd + (n === 1 ? 0 : ((i / (n - 1) - 0.5) * (Math.PI * 5)) / 6);
          const r = 8 + (i % 2) * 3;
          const mm = this.c.spawnMonster(def, Math.max(1, p.char.level - 1), p.move.x + Math.sin(ang) * r, p.move.z + Math.cos(ang) * r, null);
          this.spawned.add(mm);
          made.push(mm.id);
        }
        return done(`gọi ${n} ${def.id}`, { def: def.id, n, ids: made });
      }
      case 'help': {
        // /gm help [lệnh]: cú pháp + ví dụ mọi lệnh (chuỗi ở i18n `gm.cmd.*`).
        if (a[1]) {
          const hl = helpLine(a[1]);
          return hl ? done(hl, { cmd: a[1], help: hl }) : fail(t('gm.msg.help_none', { c: a[1] }), 'unknown');
        }
        say(t('gm.help.head'));
        for (const g of GM_GROUPS) {
          say(t('gm.group.' + g.id));
          for (const cmd of g.cmds) say(t('gm.cmd.' + cmd));
        }
        return this.data({ groups: GM_GROUPS.map((g) => ({ id: g.id, name: t('gm.group.' + g.id), cmds: g.cmds.map((cmd) => ({ cmd, help: t('gm.cmd.' + cmd) })) })) });
      }
      case 'skills': {
        // /gm skills list | max | all: liệt kê chiêu, đặt cấp chiêu tối đa (công pháp đang tu), hoặc mở mọi chiêu của mọi công pháp.
        const mode = a[1] ?? 'list';
        if (mode === 'all') {
          this.setLevel(p, MAX_LEVEL);
          for (const sk of SKILL.values()) setSkillLevel(c.meta, sk.id, MAX_SKILL_LEVEL);
          p.mth.dirty = true;
          c.recalc();
          const locked = [...SKILL.values()].filter((x) => x.locked).length;
          return done(t('gm.msg.skills_all', { lv: c.level, n: SKILL.size, locked }), { level: c.level, n: SKILL.size, locked });
        }
        if (mode === 'max') {
          let n = 0;
          for (const sk of SKILL.values()) {
            if (sk.method && sk.method !== c.meta.method) continue;
            setSkillLevel(c.meta, sk.id, MAX_SKILL_LEVEL);
            n++;
          }
          p.mth.dirty = true;
          c.recalc();
          return done(t('gm.msg.skills_max', { n, lv: MAX_SKILL_LEVEL }), { n, skillLevel: MAX_SKILL_LEVEL });
        }
        if (mode !== 'list') return usage(helpLine('skills')!);
        const own = [...SKILL.values()].filter((sk) => !sk.method || sk.method === c.meta.method);
        say(t('gm.msg.skills_head', { m: c.meta.method ? methodName(c.meta.method) : '—', n: own.length }));
        for (let i = 0; i < own.length; i += 4) {
          say(
            own
              .slice(i, i + 4)
              .map((sk) => `${sk.id} (${sk.unlock}${sk.locked ? ',' + t('gm.msg.locked') : ''})`)
              .join(' · '),
          );
        }
        return this.data({ method: c.meta.method ?? null, skills: own.map((sk) => ({ id: sk.id, unlock: sk.unlock, locked: !!sk.locked })) });
      }
      case 'learn': {
        // /gm learn <id chiêu> [cấp]: chuyển sang công pháp của chiêu, nâng tới cấp mở khóa, đặt cấp chiêu.
        const sk = SKILL.get(a[1] ?? '');
        if (!sk) return fail(t('gm.msg.no_skill', { id: a[1] ?? '' }));
        const lv0 = a[2] === undefined ? MAX_SKILL_LEVEL : num(a[2]);
        if (lv0 === null) return usage('learn <id chiêu> [cấp 1-5]');
        const lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, lv0 || MAX_SKILL_LEVEL));
        if (sk.method && c.meta.method !== sk.method) {
          c.meta.method = sk.method;
          grantPathOf(c.meta);
          p.mth.reset();
        }
        if (c.level < sk.unlock) this.setLevel(p, sk.unlock);
        setSkillLevel(c.meta, sk.id, lv);
        p.mth.dirty = true;
        c.recalc();
        return done(t('gm.msg.learn', { id: sk.id, name: skillName(sk.id), lv, lock: sk.locked ? t('gm.msg.learn_locked') : '' }), { id: sk.id, skillLevel: lv, method: c.meta.method ?? null, level: c.level });
      }
      case 'kit': {
        // /gm kit <bậc 1-4> <kiem|hophap|dansu> [+N] [m|f]: trọn bộ theo bậc/nhánh, phẩm cao nhất, kèm công pháp và pháp bảo của nhánh.
        const tier = Number(a[1]);
        const br = a[2];
        if (!Number.isInteger(tier) || tier < 1 || tier > GM_MAX_TIER || !isGmBranch(br)) return usage(helpLine('kit')!);
        let plus = 0;
        let g: 'm' | 'f' | undefined;
        for (const x of a.slice(3)) {
          if (x === 'm' || x === 'f') g = x;
          else {
            const n = parsePlus(x, MAX_ENHANCE);
            if (n === null) return usage(helpLine('kit')!);
            plus = n;
          }
        }
        const plan = planKit(tier, br);
        const need = Math.max(...plan.pieces.map((x) => ITEM.get(x.id)?.reqLevel ?? 1));
        if (c.level < need) this.setLevel(p, need);
        c.meta.method = BRANCH_METHOD[br];
        grantPathOf(c.meta);
        for (const sk of SKILL.values()) if (!sk.method || sk.method === c.meta.method) setSkillLevel(c.meta, sk.id, MAX_SKILL_LEVEL);
        p.mth.reset();
        if (!this.equipPieces(p, plan.pieces, plus)) return fail(t('gm.msg.bag_full'));
        if (g) this.gender(p, g);
        this.run(p, ['art', KIT_ARTIFACT[br], '5']);
        c.hp = c.mhp;
        c.mp = c.mmp;
        return done(
          t('gm.msg.kit', {
            tier: plan.tier,
            used: plan.used,
            set: t('set.' + plan.set + '.name'),
            n: plan.pieces.length,
            plus,
            m: methodName(c.meta.method!),
          }) + (plan.used < plan.tier ? ' ' + t('gm.msg.kit_cap', { used: plan.used }) : ''),
          { branch: br, tier: plan.tier, used: plan.used, set: plan.set, pieces: plan.pieces.length, plus, method: c.meta.method ?? null, level: c.level },
        );
      }
      case 'preset': {
        // /gm preset <kiem|hophap|dansu> <cấp> [phẩm 0-5] [chiêu 1-5]: dựng nhân vật thử ĐÚNG MỐC để chơi thử cân bằng: đặt cấp, công pháp, bộ đồ bậc cao nhất đã mặc được
        // ở cấp đó (chỉ món có yêu cầu ≤ cấp, phẩm mặc định 2, +0), chiêu cấp mặc định 1 (như phép đo của fight:check), nhánh đầu tiên của mỗi mốc đã tới. Khác /gm build:
        // KHÔNG bật free (chiêu còn hồi chiêu và tốn linh lực như thật), không pháp bảo. Đổi nhánh bằng /gm branch. Chạy lại để dựng ở cấp khác (đồ cũ bị thu hồi qua sổ cái).
        const br = a[1];
        const lv = Math.floor(Number(a[2]));
        const q = a[3] === undefined ? 2 : Math.floor(Number(a[3]));
        const sl = a[4] === undefined ? 1 : Math.floor(Number(a[4]));
        if (!isGmBranch(br) || !(lv >= METHOD_UNLOCK_LEVEL && lv <= MAX_LEVEL) || !(q >= 0 && q < QUALITY_COUNT) || !(sl >= 1 && sl <= MAX_SKILL_LEVEL))
          return usage(helpLine('preset')!);
        this.setLevel(p, lv);
        c.meta.method = BRANCH_METHOD[br];
        grantPathOf(c.meta);
        for (const sk of SKILL.values()) if (!sk.method || sk.method === c.meta.method) setSkillLevel(c.meta, sk.id, sl);
        p.mth.reset();
        const mdef = methodOf(c.meta)!;
        const picked = new Set<number>();
        c.tx('gm:preset:branch', null, (d) => {
          d.clearBranches(mdef.id);
          for (const b of mdef.branches) {
            if (b.tier > lv || picked.has(b.tier)) continue;
            picked.add(b.tier);
            d.setBranch(mdef.id, b.tier, b.id);
          }
          return true;
        });
        p.mth.dirty = true;
        // Bậc đồ cao nhất mà cả bộ (cả món cao nhất) mặc được ở cấp này. Chưa có bậc nào trọn (cấp < 15: bậc 1 đòi cấp 15) thì mặc đồ phần thưởng nhiệm vụ như người
        // chơi thật và như `fight:check` (kiếm + bào tốt nhất có yêu cầu ≤ cấp), bậc 0.
        const need = (k: number) => Math.max(...planKit(k, br).pieces.map((x) => ITEM.get(x.id)?.reqLevel ?? 1));
        let tier = 0;
        for (let k = 1; k <= GM_MAX_TIER; k++) if (need(k) <= lv) tier = k;
        const best = (ids: string[]) => ids.filter((id) => (ITEM.get(id)?.reqLevel ?? 1) <= lv).pop();
        const questPieces = (
          [
            ['weapon', best(['itm_moc_kiem', 'itm_thiet_kiem', 'itm_thanh_phong_kiem'])],
            ['robe', best(['itm_bo_y', 'itm_dao_bao', 'itm_linh_ti_bao'])],
          ] as const
        ).flatMap(([slot, id]) => (id ? [{ slot: slot as EquipSlot, id }] : []));
        const pieces = tier > 0 ? planKit(tier, br).pieces : questPieces;
        // Gỡ đồ cũ (trừ pháp bảo) rồi mặc bộ mới trong các giao dịch có sổ cái.
        c.tx('gm:preset:unequip', null, (d) => {
          for (const slot of EQUIP_SLOTS) {
            const old = d.equip[slot];
            if (slot === 'artifact' || !old) continue;
            d.bump(old.id, -(old.n || 1));
            delete d.equip[slot];
          }
          return true;
        });
        if (!this.equipPieces(p, pieces, 0, q as Quality)) return fail(t('gm.msg.bag_full'));
        p.gmFree = false;
        p.cds.clear();
        p.gcdAt = 0;
        this.c.sendCd(p);
        c.recalc();
        this.c.heal(p);
        this.data({ branch: br, level: lv, tier, pieces: pieces.length, quality: q, skillLevel: sl, branches: picksOf(c) ?? {} });
        return say(
          `preset ${br} cấp ${lv}: ${methodName(c.meta.method!)}, ${tier > 0 ? 'đồ bậc ' + tier : 'đồ nhiệm vụ'} (${pieces.length} món, phẩm ${q}), chiêu cấp ${sl}, nhánh ${JSON.stringify(picksOf(c) ?? {})}`,
        );
      }
      case 'outfit': {
        // /gm outfit <id bộ|list|off> [m|f]: mặc bộ để xem trang phục (hình áo theo bộ đang mặc).
        if (!a[1] || a[1] === 'list') {
          say(t('gm.msg.outfit_head'));
          const rows = outfitRows();
          for (const r of rows) say(`${r.id} — ${t('set.' + r.id + '.name')} · ${r.wearable ? t('gm.msg.outfit_ok') : t('gm.msg.outfit_asset')}`);
          return this.data({ outfits: rows.map((r) => ({ id: r.id, name: t('set.' + r.id + '.name'), wearable: !!r.wearable })) });
        }
        if (a[1] === 'off') return this.run(p, ['set', 'off']);
        const st = SET.get(a[1]);
        if (!st || !st.pieces.length)
          return fail(t(st || hasOutfitAsset(a[1]) ? 'gm.msg.outfit_asset_only' : 'gm.msg.outfit_none', { id: a[1] }));
        if (a[2] === 'm' || a[2] === 'f') this.gender(p, a[2]);
        return this.wearSet(p, st, st.pieces.length)
          ? done(t('gm.msg.outfit', { id: st.id, name: t('set.' + st.id + '.name'), n: st.pieces.length }), { id: st.id, pieces: st.pieces.length })
          : fail(t('gm.msg.bag_full'));
      }
      case 'weapon': {
        // /gm weapon <id|list> [+N]: lấy và cầm kiếm (phẩm cao nhất), +10 = dạng cuối, vỏ lưng.
        const ids = weaponIds();
        if (!a[1] || a[1] === 'list') {
          say(t('gm.msg.weapon_head'));
          for (const id of ids)
            say(
              `${id} — ${itemName(id)} · ${t('gm.msg.tier', { n: itemTier(id) })} · ${t('gm.msg.req', { n: ITEM.get(id)?.reqLevel ?? 1 })}`,
            );
          return this.data({ weapons: ids.map((id) => ({ id, name: itemName(id), tier: itemTier(id), req: ITEM.get(id)?.reqLevel ?? 1 })) });
        }
        if (!ids.includes(a[1])) return fail(t('gm.msg.no_weapon', { id: a[1] }));
        const plus = a[2] === undefined ? 0 : parsePlus(a[2], MAX_ENHANCE);
        if (plus === null) return usage(helpLine('weapon')!);
        return this.equipPieces(p, [{ slot: 'weapon', id: a[1] }], plus)
          ? done(t('gm.msg.weapon', { name: itemName(a[1]), plus }), { id: a[1], plus })
          : fail(t('gm.msg.bag_full'));
      }
      case 'skin': {
        // /gm skin <id|list|off>: lấy (nếu chưa có) và mặc skin vào ô ngoại hình; off = tháo về túi. Skin không có chỉ số.
        const ids = skinIds();
        if (!a[1] || a[1] === 'list') {
          say(t('gm.msg.skin_head'));
          for (const id of ids) say(`${id} — ${itemName(id)}`);
          return this.data({ skins: ids.map((id) => ({ id, name: itemName(id) })), worn: c.equip.skin?.id ?? null });
        }
        if (a[1] === 'off') {
          const ok = c.tx('gm:skin', null, (d) => {
            const i = d.inv.findIndex((x) => !x);
            if (!d.equip.skin || i < 0) return false;
            d.inv[i] = { ...d.equip.skin };
            delete d.equip.skin;
            return true;
          });
          return ok ? done(t('gm.msg.skin_off'), { skin: null }) : fail(t('gm.msg.skin_none'));
        }
        const id = a[1];
        if (!ids.includes(id)) return fail(t('gm.msg.no_skin', { id }));
        if (!wearableBy(ITEM.get(id), c.appearance.g)) return fail(t('sys.equip_gender'));
        if (c.equip.skin?.id === id) return done(t('gm.msg.skin', { name: itemName(id) }), { skin: id });
        const ok = c.tx('gm:skin', null, (d) => {
          // Chưa có trong túi thì thêm một cái (ghi sổ cái), rồi đổi chỗ với skin đang mặc.
          if (!d.inv.some((x) => x?.id === id) && !d.add(id, 1)) return false;
          const i = d.inv.findIndex((x) => x?.id === id);
          const prev = d.equip.skin;
          d.equip.skin = { id, n: 1 };
          d.inv[i] = prev ? { ...prev } : null;
          return true;
        });
        return ok ? done(t('gm.msg.skin', { name: itemName(id) }), { skin: id }) : fail(t('gm.msg.bag_full'));
      }
      case 'find': {
        // /gm find <từ khóa>: tìm id vật phẩm/chiêu/bộ/quái/công pháp theo tên hoặc id (bỏ dấu cũng được).
        const hits = findIds(a.slice(1).join(' '), GM_FIND_MAX);
        if (!hits.length) return fail(t('gm.msg.find_none'));
        for (const h of hits) say(`${t('gm.kind.' + h.kind)}: ${h.id} — ${h.name}`);
        return this.data({ hits: hits.map((h) => ({ kind: h.kind, id: h.id, name: h.name })) });
      }
      case 'bag': {
        // /gm bag clear | sort: dọn túi (bỏ ô khóa) hoặc xếp lại; một transaction, vật phẩm mất đi ghi sổ cái.
        if (a[1] === 'sort') {
          const ok = c.tx('gm:bag', null, (d) => {
            const next = planSort(d.inv, { def: (id) => ITEM.get(id), name: (it) => itemName(it.id) });
            for (let i = 0; i < INV_SIZE; i++) d.inv[i] = next[i] ?? null;
            return true;
          });
          return ok ? done(t('gm.msg.bag_sort'), { sorted: true }) : fail(t('gm.msg.bag_fail'));
        }
        if (a[1] !== 'clear') return usage(helpLine('bag')!);
        let n = 0;
        const ok = c.tx('gm:bag', null, (d) => {
          for (let i = 0; i < d.inv.length; i++) {
            const it = d.inv[i];
            if (!it || it.lk) continue;
            d.bump(it.id, -it.n);
            d.inv[i] = null;
            n++;
          }
          return true;
        });
        return ok ? done(t('gm.msg.bag_clear', { n }), { cleared: n }) : fail(t('gm.msg.bag_fail'));
      }
      case 'freeze':
      case 'lockhp': {
        // /gm freeze|lockhp [on|off]: quái đứng yên không nghĩ / quái không tụt dưới 1 máu (cả room; phòng tập là room riêng).
        const lab = this.c.lab();
        const k = a[0] === 'freeze' ? 'gmFreeze' : 'gmLockHp';
        lab[k] = a[1] === 'off' ? false : a[1] === 'on' ? true : !lab[k];
        return done(`${a[0]} ${lab[k] ? 'on' : 'off'}`, { [a[0]!]: lab[k] });
      }
      case 'face': {
        // /gm face [độ]: mọi quái còn sống trong PHÒNG TẬP quay về hướng này (0 = +z, 90 = +x) và bị đóng băng để giữ hướng. Dùng cho cổng duyệt VFX:
        // mục tiêu đứng ngang so với camera thì mặt nạ thân to và ổn định.
        if (!this.c.level().dungeon?.practice) return fail(t('gm.msg.scene_no'));
        const deg = a[1] === undefined ? 90 : num(a[1]);
        if (deg === null) return usage('face [độ]');
        const yaw = ((((deg % 360) + 360) % 360) * Math.PI) / 180;
        let n = 0;
        for (const m of this.c.monsters()) {
          if (m.s.hp <= 0) continue;
          m.s.yaw = yaw;
          n++;
        }
        this.c.lab().gmFreeze = true;
        return done(`face ${deg}: ${n} quái, freeze on`, { deg, n, freeze: true });
      }
      case 'free':
        // /gm free [on|off]: chiêu không hồi, linh lực luôn đầy.
        p.gmFree = a[1] === 'off' ? false : a[1] === 'on' ? true : !p.gmFree;
        return done('free ' + (p.gmFree ? 'on' : 'off'), { free: p.gmFree });
      case 'state': {
        const r = this.forceState(p, a[1], a[2]);
        if (!r.startsWith('state ')) return usage(r);
        const k = Number(/(\d+) quái$/.exec(r)?.[1] ?? 0);
        return k ? done(r, { kind: a[1], n: k }) : fail('không có quái trong 40 m');
      }
      case 'scene': {
        // /gm scene <id>: nạp cảnh mẫu của phòng tập (danh sách ở packages/content/data/lab/scenes.json).
        // /gm scene save [id]: in cảnh đang dựng thành một mục JSON để dán vào scenes.json (không ghi file: dữ liệu game chỉ đổi qua commit).
        if (a[1] === 'save') {
          const sv = this.sceneOf(p, a[2] ?? 'canh_moi');
          return done(JSON.stringify(sv), { scene: sv });
        }
        const sc = LAB_SCENES.find((s) => s.id === a[1]);
        if (!sc) return usage('scene save [id] | scene ' + LAB_SCENES.map((s) => s.id).join(' | '));
        if (!this.c.level().dungeon?.practice) return fail(t('gm.msg.scene_no'));
        return done(this.scene(p, sc), { scene: sc.id });
      }
      case 'build': {
        // /gm build <công pháp> [cấp]: dựng nhân vật thử một nút: đặt cấp (mặc định 30), theo công pháp, mọi chiêu cấp tối đa, chiêu không hồi, hồi đầy.
        if (!METHOD.has(a[1] ?? '')) return usage('build ' + [...METHOD.keys()].join(' | ') + ' [cấp]');
        const bl = a[2] === undefined ? 30 : num(a[2]);
        if (bl === null) return usage('build <công pháp> [cấp]');
        this.setLevel(p, bl || 30);
        this.run(p, ['method', a[1]!, String(MAX_SKILL_LEVEL)]);
        p.gmFree = true;
        p.cds.clear();
        p.gcdAt = 0;
        this.c.sendCd(p);
        this.c.heal(p);
        return done(`build ${a[1]} cấp ${c.level}, free on`, { method: a[1], level: c.level, free: true });
      }
      case 'labreset': {
        // /gm labreset: trả phòng thử về như mới: dọn mọi quái gọi bằng lệnh, tắt freeze/lockhp/free/god, xóa hồi chiêu, hồi đầy.
        const lab = this.c.lab();
        this.clearLab();
        labMeter.stop(p);
        lab.gmFreeze = false;
        lab.gmLockHp = false;
        p.gmFree = false;
        p.god = false;
        p.cds.clear();
        p.gcdAt = 0;
        this.c.sendCd(p);
        this.c.heal(p);
        return done('phòng thử đã về như mới', { reset: true });
      }
      case 'dps': {
        // /gm dps [start|stop]: đồng hồ sát thương của riêng mình. Lần đầu gõ = bắt đầu đo; gõ lại = xem số (vẫn đo tiếp); stop = xem rồi dừng.
        if (a[1] === 'stop' || a[1] === 'off') {
          if (!labMeter.active(p)) return fail('dps: chưa đo');
          this.meterSay(p);
          labMeter.stop(p);
          return say('dps: đã dừng'); // d = báo cáo cuối của lần đo (meterSay đã gắn)
        }
        if (a[1] === 'start' || a[1] === 'reset' || !labMeter.active(p)) {
          labMeter.start(p, Date.now());
          return done('dps: bắt đầu đo từ 0 (gõ /gm dps để xem số, /gm dps stop để dừng)', { active: true });
        }
        return this.meterSay(p); // d = báo cáo hiện tại
      }
      case 'dummy': {
        // /gm dummy [id quái] [cấp] | off: hình nộm đo sát thương trong phòng tập: một con đứng yên, khóa máu, cạn máu thì tính một lần hạ rồi hồi đầy.
        if (!this.c.level().dungeon?.practice) return fail(t('gm.msg.scene_no'));
        if (a[1] === 'off') {
          this.dummy = false;
          return done('dummy off', { dummy: false });
        }
        const def = MONSTER.get(a[1] ?? 'mon_soi_xam');
        if (!def) return fail(t('gm.msg.no_mon', { id: a[1] ?? '' }));
        const lvArg = a[2] === undefined ? c.level : num(a[2]);
        if (lvArg === null) return usage('dummy [id quái] [cấp] | off');
        const lv = Math.max(1, Math.min(MAX_LEVEL, lvArg || c.level));
        this.clearLab();
        const at = dienVoSpawnAt(0, 1, !!def.boss);
        const dm = this.c.spawnMonster(def, lv, at.x, at.z, null);
        this.spawned.add(dm);
        const lab = this.c.lab();
        lab.gmFreeze = true;
        lab.gmLockHp = true;
        this.dummy = true;
        labMeter.start(p, Date.now());
        return done(`hình nộm ${def.id} cấp ${lv}: đứng yên, cạn máu thì tính một lần hạ rồi hồi đầy; đồng hồ đang đo (/gm dps)`, { id: dm.id, def: def.id, level: lv, hp: dm.s.mhp });
      }
      case 'boss': {
        // /gm boss <id> [cấp]: sân boss của phòng tập: dọn quái cũ, gọi boss/tinh anh vào hố boss ở cấp cho trước (mặc định cấp mình), AI chạy thật,
        // mình bất tử, đồng hồ đo từ 0. Đi kèm /gm phase, /gm hp, /gm cast.
        if (!this.c.level().dungeon?.practice) return fail(t('gm.msg.scene_no'));
        const def = MONSTER.get(a[1] ?? '');
        if (!def || !(def.boss || def.elite))
          return usage(
            'boss <id> [cấp] — ' +
              [...MONSTER.values()]
                .filter((m) => m.boss)
                .map((m) => m.id)
                .join(' | '),
          );
        const lvArg = a[2] === undefined ? c.level : num(a[2]);
        if (lvArg === null) return usage('boss <id> [cấp]');
        const lv = Math.max(1, Math.min(MAX_LEVEL, lvArg || c.level));
        this.clearLab();
        const lab = this.c.lab();
        lab.gmFreeze = false;
        lab.gmLockHp = false;
        const at = dienVoSpawnAt(0, 1, true);
        const m = this.c.spawnMonster(def, lv, at.x, at.z, null);
        this.spawned.add(m);
        p.god = true;
        labMeter.start(p, Date.now());
        const kinds = new Set<string>();
        for (const ai of [def.ai, ...(def.phases ?? []).map((ph) => ph.ai)]) for (const k of CAST_KINDS) if (ai?.[k]) kinds.add(k);
        this.data({ id: m.id, def: def.id, level: lv, hp: m.s.mhp, phases: def.phases?.length ?? 0, kinds: [...kinds] });
        return say(
          `boss ${def.id} cấp ${lv}: máu ${m.s.mhp}, ${def.phases?.length ?? 0} lần đổi pha, chiêu ${[...kinds].join(', ') || 'không'}; god on, đồng hồ đang đo`,
        );
      }
      case 'phase': {
        // /gm phase <n> | off: ép boss quanh mình vào pha n (0 = pha đầu) như trận thật rồi KHÓA pha (máu đổi không đổi pha); off = bỏ khóa.
        const lab = this.c.lab();
        if (a[1] === 'off') {
          lab.gmPhaseLock = false;
          return done('phase: bỏ khóa, pha đổi theo máu', { lock: false });
        }
        const n = num(a[1]);
        if (n === null || n < 0) return usage(helpLine('phase')!);
        let k = 0;
        for (const m of this.near(p)) {
          if (!m.def.phases?.length) continue;
          const ph = Math.min(n, m.def.phases.length);
          if (m.phase !== ph) lab.enterPhase(m, ph);
          k++;
        }
        if (!k) return fail('không có boss (quái nhiều pha) trong 40 m');
        lab.gmPhaseLock = true;
        return done(`phase ${n}: ${k} boss, khóa pha on`, { phase: n, n: k, lock: true });
      }
      case 'hp': {
        // /gm hp <pct>: tua máu quái quanh mình về đúng pct% (lên hoặc xuống, không qua sát thương). Chưa khóa pha thì pha đặt lại theo mức máu mới.
        const pct = num(a[1]);
        if (pct === null || !(pct >= 1 && pct <= 100)) return usage(helpLine('hp')!);
        const lab = this.c.lab();
        const ms = this.near(p);
        for (const m of ms) {
          m.s.hp = Math.max(1, Math.ceil((m.s.mhp * pct) / 100));
          if (lab.gmPhaseLock || !m.def.phases?.length) continue;
          const ph = bossPhaseAt(m.s.hp / m.s.mhp, m.def.phases, 0);
          if (ph !== m.phase) lab.enterPhase(m, ph);
        }
        return ms.length ? done(`hp ${pct}%: ${ms.length} quái`, { pct, n: ms.length }) : fail('không có quái trong 40 m');
      }
      case 'cast': {
        // /gm cast <loại> [loop] | off: quái gọi bằng lệnh ra ngay một loại chiêu (loop: chỉ lặp chiêu đó, hoãn mọi chiêu khác); off = thôi lặp.
        // Chỉ đổi mốc hẹn giờ, AI thật vẫn kiểm khoảng cách/với tới; quái đang đứng yên thì cho vào trận với người gọi.
        if (a[1] === 'off') {
          this.unloop();
          return done('cast: thôi lặp', { loop: null });
        }
        const live = [...this.spawned].filter((m) => m.state !== MS_DEAD);
        const kind = CAST_KINDS.find((k) => k === a[1]);
        const has = kind ? live.filter((m) => this.castKinds(m).includes(kind)) : [];
        if (!kind || !has.length) {
          const all = [...new Set(live.flatMap((m) => this.castKinds(m)))];
          return usage('cast <loại> [loop] | off — pha hiện tại có: ' + (all.join(', ') || 'không có (gọi quái bằng /gm boss hoặc /gm spawn trước)'));
        }
        const lab = this.c.lab();
        lab.gmFreeze = false;
        const loop = a[2] === 'loop';
        if (this.loop && !loop) this.unloop();
        for (const m of has) {
          if (m.state === MS_IDLE || m.state === MS_RETURN) {
            lab.resetAi(m);
            m.target = p.sid;
            m.unreachableSince = 0;
            lab.setMonState(m, MS_CHASE);
          }
          this.prime(m, kind, loop);
        }
        this.loop = loop ? kind : null;
        return done(`cast ${kind}${loop ? ' (lặp)' : ''}: ${has.length} quái`, { kind, loop, n: has.length });
      }
      case 'dvt':
        // /gm dvt: vào Diễn Võ Trường (phòng tập riêng); gõ lại trong phòng để ra. Nhân vật được trả về nguyên trạng khi ra.
        // /gm dvt <khóa>: nhiều tài khoản GM gõ CÙNG khóa thì vào chung một phòng (đo đám đông bằng bot). Khóa chỉ gồm chữ thường, số, `_`, `-`, tối đa 24 ký tự.
        if (a[1] !== undefined && !PRACTICE_KEY_RE.test(a[1])) return fail(t('gm.msg.dvt_key'));
        return this.c.practice(p, a[1]) ? undefined : fail(t('gm.msg.dvt_no'));
      case 'tick':
        return done(`tick p95 ${this.c.tickP95().toFixed(2)}ms, ${this.c.playerCount()} người, ${this.c.monsters().length} quái`, { p95: this.c.tickP95(), players: this.c.playerCount(), monsters: this.c.monsters().length });
      default:
        return fail(t('gm.msg.unknown'), 'unknown');
    }
  }
}

/** Số quái tối đa mỗi lần `/gm spawn`, số kết quả tối đa của `/gm find`, pháp bảo đi kèm `/gm kit` theo nhánh. */
/** Khóa phòng tập chung của `/gm dvt <khóa>`. */
export const PRACTICE_KEY_RE = /^[a-z0-9_-]{1,24}$/;
const GM_SPAWN_MAX = 20;
const GM_FIND_MAX = 30;
const KIT_ARTIFACT: Record<GmBranch, string> = { kiem: 'itm_tu_kim_ho_lo', hophap: 'itm_tran_hon_linh', dansu: 'itm_thanh_lien_an' };
