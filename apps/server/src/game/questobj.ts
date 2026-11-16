// Mục tiêu nhiệm vụ do server chấm (E2-H): `touch` (chạm điểm đáng chú ý), `scan` (thần thức), `escort` (hộ tống).
// Client chỉ gửi ý định (lệnh `scan`); vị trí, khoảng cách, tiến độ, người đồng hành đều ở đây. Người đồng hành là của riêng
// từng người nhận (không phải thực thể room), nên không đi qua schema/AOI: chỉ gửi tin `S.ESCORT` cho đúng người đó.

import {
  ESCORT_FOLLOW_R,
  ESCORT_LOST_R,
  escortAdvance,
  type EscortDef,
  type EscortMsg,
  type EscortWalk,
  escortStart,
  type LevelDef,
  type ObjectiveDef,
  PF_DEAD,
  questSpot,
  S,
  SCAN_CD_MS,
  SCAN_MIN_LEVEL,
  SCAN_R,
  TOUCH_R,
} from '@dtl/shared';
import { QUEST, t } from '@dtl/content';
import type { PlayerEnt } from './sim';

export interface QuestObjHost {
  now(): number;
  level(): LevelDef;
  players(): Iterable<PlayerEnt>;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
  questEvent(p: PlayerEnt, type: 'touch' | 'scan' | 'escort', target: string | undefined, n: number): void;
}

interface Convoy {
  def: EscortDef;
  walk: EscortWalk;
  /** Khóa trạng thái đã gửi lần cuối (không gửi lặp). */
  sent: string;
}

/** Nhịp chấm mục tiêu (ms). */
const STEP_MS = 250;

/** Mục tiêu chưa xong của các nhiệm vụ đang làm, theo loại. */
function openObjectives(p: PlayerEnt, type: ObjectiveDef['type']): ObjectiveDef[] {
  const out: ObjectiveDef[] = [];
  for (const id in p.char.quests.active) {
    const q = QUEST.get(id);
    const prog = p.char.quests.active[id];
    if (!q) continue;
    q.objectives.forEach((o, i) => {
      if (o.type === type && (prog[i] ?? 0) < o.count) out.push(o);
    });
  }
  return out;
}

export class QuestObjSystem {
  private convoys = new Map<string, Map<string, Convoy>>();
  private scanAt = new Map<string, number>();
  private stepAt = 0;

  constructor(private h: QuestObjHost) {}

  /** Gọi mỗi tick của sim; tự giãn còn mỗi `STEP_MS`. */
  tick(): void {
    const now = this.h.now();
    if (now - this.stepAt < STEP_MS) return;
    const dt = this.stepAt ? (now - this.stepAt) / 1000 : STEP_MS / 1000;
    this.stepAt = now;
    const lv = this.h.level();
    for (const p of this.h.players()) {
      if (!p.connected) continue;
      const alive = (p.s.fl & PF_DEAD) === 0;
      if (alive) this.touch(p, lv);
      this.escort(p, lv, dt, alive);
    }
  }

  private touch(p: PlayerEnt, lv: LevelDef): void {
    for (const o of openObjectives(p, 'touch')) {
      const spot = questSpot(lv, o.target);
      if (spot && Math.hypot(p.move.x - spot.x, p.move.z - spot.z) <= TOUCH_R && !p.move.flying) {
        this.h.questEvent(p, 'touch', spot.id, 1);
        this.h.sys(p, 'sys.touch_ok', { name: t(spot.nameKey) }, 'good');
      }
    }
  }

  private escort(p: PlayerEnt, lv: LevelDef, dt: number, alive: boolean): void {
    const mine = this.convoys.get(p.sid);
    const wanted = new Map<string, EscortDef>();
    for (const o of openObjectives(p, 'escort')) {
      const def = lv.escorts?.find((e) => e.id === o.target);
      if (def) wanted.set(def.id, def);
    }
    // Hết mục tiêu (xong, bỏ, hoặc người chơi đã sang level khác) thì người đồng hành biến mất.
    if (mine) {
      for (const [id, c] of mine) {
        if (!wanted.has(id)) {
          this.send(p, c, 0);
          mine.delete(id);
        }
      }
    }
    for (const [id, def] of wanted) {
      let m = this.convoys.get(p.sid);
      if (!m) this.convoys.set(p.sid, (m = new Map()));
      let c = m.get(id);
      if (!c) m.set(id, (c = { def, walk: escortStart(def), sent: '' }));
      const dist = Math.hypot(p.move.x - c.walk.x, p.move.z - c.walk.z);
      if (dist > ESCORT_LOST_R) {
        // Bỏ rơi quá xa: người đồng hành quay về đầu đường, làm lại.
        c.walk = escortStart(def);
        this.h.warn(p, 'sys.escort_lost', { name: t(`npc.${def.npc}.name`) });
      }
      const follow = alive && dist <= ESCORT_FOLLOW_R && !p.move.flying;
      if (follow) c.walk = escortAdvance(def, c.walk, def.speed * dt);
      if (c.walk.done) {
        this.send(p, c, 0);
        m.delete(id);
        this.h.sys(p, 'sys.escort_done', { name: t(`npc.${def.npc}.name`) }, 'good');
        this.h.questEvent(p, 'escort', id, 1);
        continue;
      }
      this.send(p, c, follow ? 1 : 2);
    }
    if (mine && !mine.size) this.convoys.delete(p.sid);
  }

  private send(p: PlayerEnt, c: Convoy, st: 0 | 1 | 2): void {
    const x = Math.round(c.walk.x * 10) / 10;
    const z = Math.round(c.walk.z * 10) / 10;
    const key = `${st}:${x}:${z}`;
    if (key === c.sent) return;
    c.sent = key;
    const msg: EscortMsg = { id: c.def.id, npc: c.def.npc, x, z, yaw: Math.round(c.walk.yaw * 100) / 100, st };
    p.client.send(S.ESCORT, msg);
  }

  /** Lệnh `scan`: thần thức quét quanh mình, trúng điểm đáng chú ý của mục tiêu `scan` đang làm thì tính. */
  scan(p: PlayerEnt): void {
    const now = this.h.now();
    if (now - (this.scanAt.get(p.sid) ?? 0) < SCAN_CD_MS) return;
    this.scanAt.set(p.sid, now);
    if ((p.s.fl & PF_DEAD) !== 0) return this.h.warn(p, 'sys.dead');
    if (p.char.level < SCAN_MIN_LEVEL) return this.h.warn(p, 'sys.scan_locked');
    const lv = this.h.level();
    let hit = 0;
    for (const o of openObjectives(p, 'scan')) {
      const spot = questSpot(lv, o.target);
      if (!spot || Math.hypot(p.move.x - spot.x, p.move.z - spot.z) > SCAN_R) continue;
      hit++;
      this.h.questEvent(p, 'scan', spot.id, 1);
      this.h.sys(p, 'sys.scan_ok', { name: t(spot.nameKey) }, 'good');
    }
    if (!hit) this.h.sys(p, 'sys.scan_none', undefined, 'info');
  }

  drop(p: PlayerEnt): void {
    this.convoys.delete(p.sid);
    this.scanAt.delete(p.sid);
  }
}
