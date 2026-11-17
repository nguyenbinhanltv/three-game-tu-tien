// Phân thân thần niệm (E4-K, Hóa Thần sơ kỳ, phím G). Thực thể phụ có chủ do server giữ hết trạng thái:
//  - sinh ở điểm chủ chỉ (kẹp trong CLONE_PLACE_RANGE), sống CLONE_LIFE_MS, chủ chỉ tạo lại sau CLONE_CD_MS (giữ qua đổi room);
//  - đi theo chủ khi chủ ra xa, đánh mục tiêu của chủ (mục tiêu chiêu gần nhất, không thì quái gần phân thân nhất);
//  - danh sách chiêu riêng theo công pháp (`packages/content/data/clones.json`): `echo` lặp chiêu cuối của chủ ở CLONE_POWER_MUL,
//    `finale` chém một đòn khi hết giờ, `taunt` khiêu khích quái quanh nó và gánh một phần sát thương quái vùng đó đánh chủ, `heal` hồi đồng đội;
//  - chủ chết, vào kiếp, tỉ thí, rời room thì tan. Sát thương/hồi tính bằng chỉ số của chủ, ghi công cho chủ.
// Client chỉ gửi ý định (CloneCmd) và vẽ theo FX `clone_*` (gửi người trong tầm). Không đụng túi/tiền nên không có ledger.

import {
  CLONE_CD_MS,
  CLONE_CMD_GAP_MS,
  CLONE_FOLLOW_DIST,
  CLONE_FOLLOW_GAP,
  CLONE_HP_FRAC,
  CLONE_LIFE_MS,
  CLONE_MP,
  CLONE_POWER_MUL,
  CLONE_REACH,
  CLONE_SPEED,
  CLONE_TICK_MS,
  MS_DEAD,
  PF_DEAD,
  S,
  clonePlace,
  cloneUnlocked,
  dealsDamage,
  type CloneMethodDef,
  type CloneMoveDef,
  type CloneStateMsg,
  type FxMsg,
  type SkillDef,
} from '@dtl/shared';
import { CLONE_MOVES, METHOD, SKILL } from '@dtl/content';
import type { MonEnt, PlayerEnt } from './sim';

export interface CloneHost {
  now(): number;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  fx(m: FxMsg): void;
  groundAt(x: number, z: number): number;
  players(): Iterable<PlayerEnt>;
  isDead(p: PlayerEnt): boolean;
  /** Chủ đang bay/lơ lửng, xuất khiếu hoặc mất kết nối: phân thân không hoạt động (chặn khai thác đánh khi quái không với tới). */
  idle(p: PlayerEnt): boolean;
  inDuel(p: PlayerEnt): boolean;
  stopMeditate(p: PlayerEnt): void;
  monsterById(id: string): MonEnt | undefined;
  monstersNear(x: number, z: number, r: number): MonEnt[];
  /** Sức từng đòn và bán kính của `skill` theo cấp/biến thức hiện tại của chủ. */
  powers(p: PlayerEnt, skill: SkillDef): { hits: number[]; radius: number };
  /** Phân thân đánh `mon` bằng chỉ số của chủ: `power` đã gồm hệ số chiêu, `skill` cho hệ ngũ hành. */
  hit(owner: PlayerEnt, mon: MonEnt, power: number, skill: SkillDef | undefined): void;
  /** Khiêu khích: quái nhắm chủ trong `sec` giây. */
  taunt(owner: PlayerEnt, mon: MonEnt, sec: number): void;
  /** Hồi `n` khí huyết cho `p` (kẹp theo khí huyết tối đa, báo số hồi). */
  heal(p: PlayerEnt, n: number): void;
  /** Đồng đội được hưởng hồi của chủ. */
  canAssist(owner: PlayerEnt, o: PlayerEnt): boolean;
  /** Trừ `n` linh lực nếu đủ. */
  spendMp(p: PlayerEnt, n: number): boolean;
}

interface Clone {
  owner: string;
  method: string;
  x: number;
  z: number;
  /** Điểm đứng mục tiêu; gửi `clone_mv` khi đổi hẳn chỗ. */
  gx: number;
  gz: number;
  sentGx: number;
  sentGz: number;
  until: number;
  hp: number;
  mhp: number;
  /** Mốc ra chiêu kế tiếp theo từng chiêu (cùng thứ tự với `moves`). */
  next: number[];
  moves: CloneMoveDef[];
  nextTick: number;
  /** Mốc chiêu của chủ được lặp lại lần kế (theo hồi chiêu gốc, id chiêu → ms). */
  echoAt: Map<string, number>;
}

/** Chiêu sát thương cuối của chủ, để phân thân lặp lại. */
interface LastSkill {
  skill: SkillDef;
  target: string;
}

/** Hồi chiêu theo nhân vật, sống ở cấp tiến trình để đổi room không xóa được. */
const cloneCd = new Map<number, number>();
let lastPrune = 0;

export class CloneSystem {
  private clones = new Map<string, Clone>();
  private cmdAt = new Map<string, number>();
  private last = new Map<string, LastSkill>();

  constructor(private h: CloneHost) {}

  get size(): number {
    return this.clones.size;
  }

  has(p: PlayerEnt): boolean {
    return this.clones.size > 0 && this.clones.has(p.sid);
  }

  /** Vị trí và khí huyết phân thân của `p` (test/HUD); null nếu không có. */
  of(p: PlayerEnt): { x: number; z: number; hp: number; mhp: number; until: number } | null {
    const c = this.clones.get(p.sid);
    return c ? { x: c.x, z: c.z, hp: c.hp, mhp: c.mhp, until: c.until } : null;
  }

  /** Chủ vừa dùng một chiêu gây sát thương: phân thân sẽ lặp lại chiêu này. */
  noteSkill(p: PlayerEnt, skill: SkillDef, target: string): void {
    if (cloneUnlocked(p.char.level) && dealsDamage(skill) && !skill.dash) this.last.set(p.sid, { skill, target });
  }

  sendState(p: PlayerEnt): void {
    if (!p.connected) return;
    const now = this.h.now();
    const c = this.clones.get(p.sid);
    const msg: CloneStateMsg = { open: cloneUnlocked(p.char.level), left: c ? Math.max(0, c.until - now) : 0, cd: Math.max(0, (cloneCd.get(p.char.id) ?? 0) - now) };
    p.client.send(S.CLONE_STATE, msg);
  }

  /** Lệnh GM `cd`. */
  resetCooldown(p: PlayerEnt): void {
    cloneCd.delete(p.char.id);
    this.sendState(p);
  }

  /** Rời room / chuyển room / vào kiếp: phân thân tan, không phát chiêu cuối. */
  drop(p: PlayerEnt): void {
    this.last.delete(p.sid);
    this.cmdAt.delete(p.sid);
    const c = this.clones.get(p.sid);
    if (c) this.end(p, c, 'drop');
  }

  private blocker(p: PlayerEnt): string {
    if (!cloneUnlocked(p.char.level)) return 'sys.clone_locked';
    if ((p.s.fl & PF_DEAD) !== 0 || p.trib || p.trial || this.h.inDuel(p) || p.casting || this.h.idle(p)) return 'sys.clone_busy';
    return '';
  }

  /** Phím G ngoài kiếp: đang có phân thân thì thu về, không thì tạo ở điểm chỉ. */
  command(p: PlayerEnt, msg: unknown): void {
    const now = this.h.now();
    if (now - (this.cmdAt.get(p.sid) ?? 0) < CLONE_CMD_GAP_MS) return;
    this.cmdAt.set(p.sid, now);
    const cur = this.clones.get(p.sid);
    if (cur) return this.end(p, cur, 'recall');
    const why = this.blocker(p);
    if (why) return this.h.warn(p, why);
    const left = (cloneCd.get(p.char.id) ?? 0) - now;
    if (left > 0) return this.h.warn(p, 'sys.clone_cd', { s: Math.ceil(left / 1000) });
    if (!this.h.spendMp(p, CLONE_MP)) return this.h.warn(p, 'sys.clone_mp');
    // Lệnh không mang tham số: chỗ đặt do server chọn (ngay trước mặt chủ).
    void msg;
    const at = clonePlace({ x: p.move.x, z: p.move.z, yaw: p.s.yaw });
    const method = p.char.meta.method ?? '';
    const moves = (CLONE_MOVES[method] as CloneMethodDef | undefined)?.moves ?? [];
    const mhp = Math.max(1, Math.round(p.char.mhp * CLONE_HP_FRAC));
    const c: Clone = { owner: p.sid, method, x: at.x, z: at.z, gx: at.x, gz: at.z, sentGx: at.x, sentGz: at.z, until: now + CLONE_LIFE_MS, hp: mhp, mhp, next: moves.map((mv) => now + (mv.cd ?? 0) * 1000), moves, nextTick: now, echoAt: new Map() };
    this.clones.set(p.sid, c);
    this.h.stopMeditate(p);
    cloneCd.set(p.char.id, now + CLONE_CD_MS);
    this.h.fx({ t: 'clone_out', src: p.sid, x: c.x, y: this.h.groundAt(c.x, c.z), z: c.z, d: CLONE_LIFE_MS / 1000, s: METHOD.get(method)?.role ?? 'dps' });
    this.h.sys(p, 'sys.clone_out', { n: CLONE_LIFE_MS / 1000 }, 'info');
    this.sendState(p);
  }

  private end(p: PlayerEnt, c: Clone, why: 'time' | 'recall' | 'drop' | 'broken'): void {
    if (this.clones.get(p.sid) !== c) return;
    if (why === 'time') this.finale(p, c);
    this.clones.delete(p.sid);
    this.h.fx({ t: 'clone_end', src: p.sid, x: c.x, y: this.h.groundAt(c.x, c.z), z: c.z, pg: why === 'broken' ? 1 : 0 });
    if (why === 'drop') return;
    this.h.sys(p, why === 'broken' ? 'sys.clone_broken' : why === 'recall' ? 'sys.clone_recall' : 'sys.clone_end', undefined, why === 'broken' ? 'bad' : 'info');
    this.sendState(p);
  }

  /** Quái chủ đang nhắm (còn sống, trong tầm phân thân) hoặc quái gần phân thân nhất. */
  private targetOf(c: Clone, last: LastSkill | undefined): MonEnt | null {
    const t = last?.target ? this.h.monsterById(last.target) : undefined;
    if (t && t.state !== MS_DEAD && Math.hypot(t.s.x - c.x, t.s.z - c.z) <= CLONE_REACH) return t;
    return this.h.monstersNear(c.x, c.z, CLONE_REACH)[0] ?? null;
  }

  private defaultSkill(c: Clone): SkillDef | undefined {
    const sig = METHOD.get(c.method)?.sig;
    const s = sig ? SKILL.get(sig) : undefined;
    return s && dealsDamage(s) ? s : undefined;
  }

  /** Đánh bằng `skill` của chủ ở `mul` lần sức chiêu: nhiều đòn thì từng đòn, chiêu vùng (`r` > 0) thì mọi quái quanh mục tiêu. */
  private strike(p: PlayerEnt, c: Clone, skill: SkillDef, tgt: MonEnt, mul: number, r: number): void {
    const pw = this.h.powers(p, skill);
    const area = Math.max(r, pw.radius);
    const foes = area > 0 ? this.h.monstersNear(tgt.s.x, tgt.s.z, area) : [tgt];
    for (const o of foes) for (const hp of pw.hits) this.h.hit(p, o, hp * mul, skill);
    this.h.fx({ t: 'clone_act', src: p.sid, dst: tgt.id, x: c.x, z: c.z, r: area, s: skill.fx, n: 0 });
  }

  private finale(p: PlayerEnt, c: Clone): void {
    const mv = c.moves.find((x) => x.kind === 'finale');
    if (!mv || this.h.isDead(p)) return;
    const last = this.last.get(p.sid);
    const skill = last?.skill ?? this.defaultSkill(c);
    const tgt = skill ? this.targetOf(c, last) : null;
    if (skill && tgt) this.strike(p, c, skill, tgt, mv.mul ?? 1, mv.r ?? 0);
  }

  /**
   * Hộ pháp: sát thương quái trong vùng khiêu khích đánh chủ được phân thân gánh `share`. Trả phần chủ còn phải chịu.
   * Phân thân vỡ (hết khí huyết) thì tan.
   */
  absorb(p: PlayerEnt, n: number, src: string): number {
    const c = this.clones.size > 0 ? this.clones.get(p.sid) : undefined;
    if (!c || !src) return n;
    const tm = c.moves.find((x) => x.kind === 'taunt');
    const mon = tm ? this.h.monsterById(src) : undefined;
    if (!tm || !mon || Math.hypot(mon.s.x - c.x, mon.s.z - c.z) > (tm.r ?? 12)) return n;
    const take = Math.min(c.hp, Math.round(n * (tm.share ?? 0.5)));
    c.hp -= take;
    this.h.fx({ t: 'clone_hit', src: p.sid, x: c.x, z: c.z, n: take });
    if (c.hp <= 0) this.end(p, c, 'broken');
    return n - take;
  }

  tick(): void {
    const now = this.h.now();
    // Dọn mục hồi chiêu đã hết hạn (không xóa mục còn hạn: đổi room/đăng nhập lại không được reset hồi chiêu).
    if (cloneCd.size > 0 && now - lastPrune > 60_000) {
      lastPrune = now;
      for (const [id, t] of cloneCd) if (t <= now) cloneCd.delete(id);
    }
    if (this.clones.size === 0) return;
    const live = new Set<string>();
    for (const p of this.h.players()) {
      live.add(p.sid);
      const c = this.clones.get(p.sid);
      if (!c || now < c.nextTick) continue;
      c.nextTick = now + CLONE_TICK_MS;
      if (this.h.isDead(p) || p.trib || p.trial || this.h.inDuel(p) || this.h.idle(p)) {
        this.end(p, c, 'drop');
        continue;
      }
      if (now >= c.until) {
        this.end(p, c, 'time');
        continue;
      }
      this.follow(p, c);
      this.act(p, c, now);
    }
    // Chủ đã rời room mà phân thân còn: dọn.
    for (const sid of this.clones.keys()) if (!live.has(sid)) this.clones.delete(sid);
  }

  /** Chủ đi xa hơn CLONE_FOLLOW_DIST thì phân thân bước theo tới cách chủ CLONE_FOLLOW_GAP; bước theo nhịp tick. */
  private follow(p: PlayerEnt, c: Clone): void {
    const dx = p.move.x - c.x;
    const dz = p.move.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > CLONE_FOLLOW_DIST) {
      c.gx = p.move.x - (dx / d) * CLONE_FOLLOW_GAP;
      c.gz = p.move.z - (dz / d) * CLONE_FOLLOW_GAP;
    }
    const gd = Math.hypot(c.gx - c.x, c.gz - c.z);
    if (gd > 0.05) {
      const step = Math.min(gd, CLONE_SPEED * (CLONE_TICK_MS / 1000));
      c.x += ((c.gx - c.x) / gd) * step;
      c.z += ((c.gz - c.z) / gd) * step;
    }
    // Báo client đoạn đường mới khi đích đổi hẳn (nội suy tuyến tính ở client).
    if (Math.hypot(c.gx - c.sentGx, c.gz - c.sentGz) > 1.5) {
      c.sentGx = c.gx;
      c.sentGz = c.gz;
      this.h.fx({ t: 'clone_mv', src: p.sid, x: c.gx, z: c.gz, ox: c.x, oz: c.z, r: CLONE_SPEED });
    }
  }

  private act(p: PlayerEnt, c: Clone, now: number): void {
    for (let i = 0; i < c.moves.length; i++) {
      const mv = c.moves[i];
      if (mv.kind === 'finale' || now < c.next[i]) continue;
      c.next[i] = now + (mv.cd ?? 2) * 1000;
      if (mv.kind === 'echo') {
        const last = this.last.get(p.sid);
        const skill = last?.skill ?? this.defaultSkill(c);
        // Tôn trọng hồi chiêu gốc của chiêu: mỗi chiêu chỉ lặp lại sau `skill.cd` (chiêu cd dài chỉ lặp một lần trong đời phân thân).
        if (!skill || now < (c.echoAt.get(skill.id) ?? 0)) continue;
        const tgt = this.targetOf(c, last);
        if (!tgt) continue;
        c.echoAt.set(skill.id, now + Math.max(skill.cd, mv.cd ?? 2) * 1000);
        this.strike(p, c, skill, tgt, mv.mul ?? CLONE_POWER_MUL, 0);
      } else if (mv.kind === 'taunt') {
        const foes = this.h.monstersNear(c.x, c.z, mv.r ?? 12);
        for (const o of foes) this.h.taunt(p, o, mv.sec ?? 4);
        if (foes.length) this.h.fx({ t: 'clone_act', src: p.sid, x: c.x, z: c.z, r: mv.r ?? 12, s: 'taunt', n: foes.length });
      } else if (mv.kind === 'heal') {
        let any = false;
        for (const o of this.h.players()) {
          if (!this.h.canAssist(p, o) || Math.hypot(o.move.x - c.x, o.move.z - c.z) > (mv.r ?? 14) || o.char.hp >= o.char.mhp) continue;
          this.h.heal(o, Math.max(1, Math.round(o.char.mhp * (mv.pct ?? 0.04))));
          any = true;
        }
        if (any) this.h.fx({ t: 'clone_act', src: p.sid, x: c.x, z: c.z, r: mv.r ?? 14, s: 'heal', n: 1 });
      }
    }
  }
}
