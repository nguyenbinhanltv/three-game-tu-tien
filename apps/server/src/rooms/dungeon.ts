// Room bí cảnh (R-7, tách từ rooms.ts).
import { ServerError } from 'colyseus';
import { C, MS_DEAD, PF_DEAD, type DungeonDef, type WaveDef, dungeonRoomName } from '@dtl/shared';
import { LEVELS, MONSTER, monsterName, t } from '@dtl/content';
import { ERR_NO_TICKET } from '../auth';
import { Character } from '../game/character';
import { DUNGEON_QUEST_TARGET } from '../game/dungeonquest';
import { MirrorPuzzle } from '../game/mirrorpuzzle';
import { SealSystem } from '../game/seal';
import { KimDaSystem } from '../game/kimda';
import { RiftVeins, SteleHold } from '../game/xichtan';
import type { MonEnt, PlayerEnt, SimOptions } from '../game/entities';
import { tickets } from '../transfer';
import { GameRoom, today, type JoinAuth } from './base';

export class DungeonRoom extends GameRoom {
  static levelId: string = 'kiem_trung';
  private wave = 0;
  private nextWaveAt = 0;
  private clearedAt = 0;
  /** Số lần hồi sinh đã dùng của từng nhân vật (giới hạn `DungeonDef.maxRevives`). */
  private revives = new Map<number, number>();

  private get def(): DungeonDef {
    return LEVELS[this.levelId].dungeon!;
  }

  private get dname(): string {
    return t('dungeon.' + this.levelId + '.name');
  }

  simOptions(): SimOptions {
    const d = this.def;
    return { levelId: this.levelId, roomName: dungeonRoomName(this.levelId), spawn: d.spawn, respawn: d.spawn, persistPosition: false };
  }

  onCreate(options: unknown): void {
    super.onCreate(options);
    this.maxClients = 5;
    this.nextWaveAt = Date.now() + (this.def.waves[0]?.delay ?? 8) * 1000;
    this.clock.setInterval(() => this.director(), 500);
    this.clock.setInterval(() => this.seals?.tick(), 250);
    this.clock.setInterval(() => this.xichTanTick(), 250);
  }

  /** Chỉ vào được bằng vé cấp ở cổng; gọi thẳng joinOrCreate('dungeon') sẽ bị từ chối. */
  static async onAuth(token: string, options: unknown): Promise<JoinAuth> {
    const auth = await GameRoom.onAuth(token, options);
    const level = (this as unknown as { levelId: string }).levelId;
    // Phó bản riêng: vé phải mang khóa nhóm và client phải gửi đúng khóa đó (không khóa/khóa lạ = không vé, vé không bị đốt).
    if (LEVELS[level]?.dungeon?.private) {
      const key = (options as { dgKey?: unknown } | null)?.dgKey;
      const t = tickets.peek(auth.charId, level);
      if (!t?.dg || typeof key !== 'string' || key !== t.dg) throw new ServerError(ERR_NO_TICKET, 'no_ticket');
    }
    if (!tickets.take(auth.charId, level)) throw new ServerError(ERR_NO_TICKET, 'no_ticket');
    return { ...auth, ticket: true };
  }

  /** Ngày đã dùng lượt thưởng của phó bản này (Kiếm Trủng giữ cột cũ `dungeonDay`). */
  private usedDay(char: Character): string | undefined {
    return this.levelId === DungeonRoom.levelId ? char.meta.dungeonDay : char.meta.dungeonDays?.[this.levelId];
  }

  private markUsed(char: Character): void {
    if (this.levelId === DungeonRoom.levelId) char.meta.dungeonDay = today();
    else (char.meta.dungeonDays ??= {})[this.levelId] = today();
  }

  noLootFor(char: Character): boolean {
    return this.usedDay(char) === today();
  }

  afterJoin(p: PlayerEnt): void {
    this.sim.sys(p, 'sys.dungeon_enter', { name: this.dname }, 'info');
    // Hook nhiệm vụ (mục tiêu `dungeon` ×1): phát sự kiện kèm đích của phó bản này để nhiệm vụ có `target` lọc được
    // (q2_phuc_mach, q3_kinh_nguyet, q4_than_tang). Kiếm Trủng không có đích: chỉ khớp mục tiêu `dungeon` không khai `target`.
    this.sim.questEvent(p, 'dungeon', DUNGEON_QUEST_TARGET[this.levelId], 1);
    if (p.noLoot) this.sim.sys(p, 'sys.dungeon_no_reward', { name: this.dname }, 'bad');
  }

  /** Về bản đồ thế giới `returnLevel` tại `returnSpawn`, bằng vé (cùng đường với mọi lần chuyển bản đồ). */
  private leave(p: PlayerEnt): void {
    const d = this.def;
    tickets.issue(p.char.id, d.returnLevel, d.returnSpawn);
    this.sendTransfer(p, d.returnLevel);
  }

  onPortal(p: PlayerEnt): void {
    const ex = this.def.exit;
    if ((p.move.x - ex.x) ** 2 + (p.move.z - ex.z) ** 2 > 14 * 14) return this.sim.sys(p, 'sys.too_far', undefined, 'bad');
    this.leave(p);
  }

  /** Hồi sinh ở điểm vào; tối đa `maxRevives` lần mỗi người, hết lượt thì được hồi sinh rồi bị đưa ra ngoài. */
  onRespawn(p: PlayerEnt): void {
    const max = this.def.maxRevives;
    if (max === undefined || (p.s.fl & PF_DEAD) === 0) return super.onRespawn(p);
    const used = this.revives.get(p.char.id) ?? 0;
    super.onRespawn(p);
    if (used >= max) {
      this.sim.sys(p, 'sys.dungeon_revive_out', { name: this.dname }, 'bad');
      return this.leave(p);
    }
    this.revives.set(p.char.id, used + 1);
    this.sim.sys(p, 'sys.dungeon_revive', { n: max - used - 1 }, 'info');
  }

  onMonsterKilled(m: MonEnt): void {
    // Hạ con quái đầu tiên là đã dùng lượt thưởng hôm nay; trong lượt này vẫn nhận đủ.
    void m;
    for (const p of this.sim.players.values()) {
      if (!p.noLoot && this.usedDay(p.char) !== today()) {
        this.markUsed(p.char);
        this.sim.savePlayer(p);
      }
    }
  }

  /**
   * Thưởng hoàn thành: người còn trong lượt thưởng hôm nay (chưa `noLoot` khi vào). Khóa idem theo level, nhân vật và ngày
   * nên dù director chạy lại hay người chơi vào lại cùng ngày cũng không phát hai lần.
   */
  private payReward(): void {
    const r = this.def.reward;
    if (!r) return;
    for (const p of this.sim.players.values()) {
      if (this.sim.grantDungeonReward(p, r, `dungeon:${this.levelId}:${p.char.id}:${today()}`, this.levelId)) this.sim.savePlayer(p);
    }
  }

  private director(): void {
    const now = Date.now();
    if (this.clearedAt) {
      if (now >= this.clearedAt + 20000) {
        this.clearedAt = now + 3600_000;
        for (const p of this.sim.players.values()) this.leave(p);
      }
      return;
    }
    if (this.sim.players.size === 0) return;
    if (this.puzzle?.active) {
      this.puzzle.tick();
      return;
    }
    // Đợt phong ấn (E4-C): chưa mở đủ cửa thì không sang đợt sau, dù quái đã hết.
    if (this.seals && !this.seals.all) return;
    // Đợt giữ bia (DV-3D): chưa đủ thời gian giữ thì không sang đợt sau.
    if (this.stele && !this.stele.complete) return;
    if (this.sim.monsters.some((m) => m.state !== MS_DEAD)) return;
    if (this.seals) this.endSeals();
    if (this.stele) this.stele = null;
    const waves = this.def.waves;
    if (!this.nextWaveAt) this.nextWaveAt = now + (waves[this.wave]?.delay ?? 6) * 1000;
    if (now < this.nextWaveAt) return;
    this.nextWaveAt = 0;
    this.wave++;
    if (this.wave > waves.length) {
      this.clearedAt = now;
      this.sim.sysAll('sys.dungeon_clear', { name: this.dname }, 'good');
      this.payReward();
      return;
    }
    if (this.wave === (this.def.lockAt ?? 2)) this.lock();
    this.spawnWave(waves[this.wave - 1]);
  }

  /** Đợt phong ấn đang chạy (E4-C, Thần Tàng Điện). */
  private seals: SealSystem | null = null;

  private endSeals(): void {
    this.seals = null;
    this.sim.sealHook = null;
  }

  private startSeals(w: WaveDef): void {
    const def = w.seals!;
    const marker = (x: number, z: number, r: number, dur: number, open: boolean) =>
      this.sim.addHazard({ x, z, r }, 0.2, 0, false, open ? 'frost' : 'fire', '', 0, false, 0, undefined, undefined, 'pool', false, dur);
    this.seals = new SealSystem(
      {
        now: () => Date.now(),
        players: () => this.sim.players.values(),
        isDead: (p) => (p.s.fl & PF_DEAD) !== 0,
        isGhost: (p) => this.sim.soul.isScouting(p),
        teleport: (p, x, z) => void this.sim.teleportTo(p, x, z),
        sys: (p, k, params, type) => this.sim.sys(p, k, params, type),
        sysAll: (k, params, type) => this.sim.sysAll(k, params, type),
        onOpen: (i) => {
          const g = def.reinforce;
          const mon = MONSTER.get(g.mon);
          const d = def.doors[i];
          if (!mon) return;
          for (let k = 0; k < g.n; k++) {
            const a = (k / Math.max(1, g.n)) * Math.PI * 2;
            this.sim.spawnMonster(mon, g.level, d.x + Math.cos(a) * 4, d.z + Math.sin(a) * 4, null);
          }
        },
        marker,
      },
      def,
    );
    this.sim.sealHook = { peek: (p) => this.seals?.peekTalisman(p) ?? -1, open: (i) => this.seals?.unlockDoor(i) };
    this.sim.sysAll('sys.seal_need', undefined, 'info');
  }

  /** Đợt giữ bia (DV-3D, Xích Tẫn Khích) và khe mạch của boss cuối. */
  private stele: SteleHold | null = null;
  private veins: RiftVeins | null = null;

  private xichTanTick(): void {
    this.stele?.tick();
    this.veins?.tick();
    this.kimda?.tick();
  }

  /** Cơ chế Kim Dạ Cung (DV-3E): dựng khi đợt có quái mang `kd`, giữ tới hết phó bản. */
  private kimda: KimDaSystem | null = null;

  private startKimDa(): void {
    const sim = this.sim;
    const c = this.def.center;
    const pool = (x: number, z: number, r: number, dur: number, kind: 'fire' | 'frost') => sim.addHazard({ x, z, r }, 0.2, 0, false, kind, '', 0, false, 0, undefined, undefined, 'pool', false, dur);
    this.kimda = new KimDaSystem({
      now: () => Date.now(),
      monsters: () => sim.monsters,
      players: () => sim.players.values(),
      isDead: (p) => (p.s.fl & PF_DEAD) !== 0,
      isGhost: (p) => sim.soul.isScouting(p),
      damagePlayer: (p, n, src) => sim.damagePlayer(p, n, src, true),
      healMonster: (m, n) => {
        m.s.hp = Math.min(m.s.mhp, m.s.hp + n);
      },
      spawn: (mon, level, x, z) => {
        const def = MONSTER.get(mon);
        return def ? sim.spawnMonster(def, level, x, z, null) : null;
      },
      // Gỡ lặng lẽ (cùng cách gỡ bóng giả của gương): không qua đường giết nên không rơi đồ, không tính hạ.
      despawn: (m) => {
        if (m.state === MS_DEAD) return;
        m.s.hp = 0;
        m.state = MS_DEAD;
        m.s.st = MS_DEAD;
        m.removeAt = Date.now() + 500;
      },
      hazardsOf: (m) => sim.hazards.filter((h) => h.mon === m),
      marker: pool,
      smash: (m, x, z, r, delay, mul) => sim.addHazard({ x, z, r }, delay, mul, false, 'spirit', m.id, m.atk),
      fx: (msg) => sim.fx(msg),
      center: () => c,
      sysAll: (k, params, type) => sim.sysAll(k, params, type),
    });
  }

  private startSteles(w: WaveDef): void {
    const sim = this.sim;
    const marker = (x: number, z: number, r: number, dur: number, kind: 'fire' | 'frost') => sim.addHazard({ x, z, r }, 0.2, 0, false, kind, '', 0, false, 0, undefined, undefined, 'pool', false, dur);
    this.stele = new SteleHold(
      {
        now: () => Date.now(),
        players: () => sim.players.values(),
        isDead: (p) => (p.s.fl & PF_DEAD) !== 0,
        isGhost: (p) => sim.soul.isScouting(p),
        damagePlayer: (p, n, src) => sim.damagePlayer(p, n, src, true),
        marker,
        spawn: (mon, level, x, z) => {
          const def = MONSTER.get(mon);
          if (def) sim.spawnMonster(def, level, x, z, null);
        },
        sysAll: (k, params, type) => sim.sysAll(k, params, type),
      },
      w.steles!,
    );
    sim.sysAll('sys.xt_stele_need', { secs: w.steles!.secs }, 'info');
  }

  private startVeins(): void {
    const sim = this.sim;
    this.veins = new RiftVeins({
      now: () => Date.now(),
      monsters: () => sim.monsters,
      stagger: (m, sec) => sim.stagger(m, sec),
      purify: (m) => sim.purifyMonster(m),
      marker: (x, z, r, dur) => sim.addHazard({ x, z, r }, 0.2, 0, false, 'frost', '', 0, false, 0, undefined, undefined, 'pool', false, dur),
      sysAll: (k, params, type) => sim.sysAll(k, params, type),
    });
  }

  /** Đợt giải đố ba gương đang chạy (E3-M). */
  private puzzle: MirrorPuzzle | null = null;

  private startPuzzle(w: WaveDef): void {
    const pz = w.puzzle!;
    const c = this.def.center;
    this.puzzle = new MirrorPuzzle(pz, {
      now: () => Date.now(),
      players: () => [...this.sim.players.values()].map((p) => ({ sid: p.sid, x: p.move.x, z: p.move.z, dead: (p.s.fl & PF_DEAD) !== 0 })),
      spawnWrong: (g) => {
        const def = MONSTER.get(g.mon);
        if (!def) return;
        for (let k = 0; k < g.n; k++) {
          const a = (k / g.n) * Math.PI * 2;
          this.sim.spawnMonster(def, g.level, c.x + Math.cos(a) * 18, c.z + Math.sin(a) * 18, null);
        }
      },
      fx: (m) => this.sim.fx(m),
      say: (k, params, type) => this.sim.sysAll(k, params, type),
      colorName: (i) => t('mirror.color.' + i),
      solved: (cut) => {
        this.sim.bossDmgMul = 1 - cut;
      },
    });
    this.puzzle.start();
  }

  private spawnWave(w: WaveDef): void {
    const c = this.def.center;
    if (w.puzzle) {
      this.sim.sysAll('sys.dungeon_wave', { n: this.wave, boss: t('dungeon.' + this.levelId + '.wave.' + this.wave) }, 'info');
      return this.startPuzzle(w);
    }
    if (w.seals) this.startSeals(w);
    if (w.steles) this.startSteles(w);
    if (w.mons.some((g) => MONSTER.get(g.id)?.rift)) this.startVeins();
    if (!this.kimda && w.mons.some((g) => MONSTER.get(g.id)?.kd)) this.startKimDa();
    let lead = '';
    let i = 0;
    for (const g of w.mons) {
      const def = MONSTER.get(g.id);
      if (!def) continue;
      if (!lead || def.boss) lead = monsterName(def.id);
      const pt = g.at !== undefined ? w.points?.[g.at] : undefined;
      for (let k = 0; k < g.n; k++) {
        if (pt) {
          // Điểm sinh riêng (khe tường, cửa hầm): tỏa quanh điểm trong 4 m.
          const a = (k / Math.max(1, g.n)) * Math.PI * 2;
          this.sim.spawnMonster(def, g.level, pt.x + Math.cos(a) * 3, pt.z + Math.sin(a) * 3, null);
          continue;
        }
        const a = (i++ / 7) * Math.PI * 2 + this.wave;
        const r = def.boss ? 14 : 24 + (k % 2) * 8;
        this.sim.spawnMonster(def, g.level, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, null);
      }
    }
    this.sim.sysAll('sys.dungeon_wave', { n: this.wave, boss: w.title ? t('dungeon.' + this.levelId + '.wave.' + this.wave) : lead }, 'info');
  }
}

/** Lớp room cho một bí cảnh (E1-B): `dungeon` cho Kiếm Trủng, `dungeon-<id>` cho bí cảnh khác. */
export function defineDungeon(levelId: string): typeof DungeonRoom {
  if (!LEVELS[levelId]?.dungeon) throw new Error(`defineDungeon: ${levelId} không phải bí cảnh`);
  if (levelId === DungeonRoom.levelId) return DungeonRoom;
  return class extends DungeonRoom {
    static levelId = levelId;
  };
}
