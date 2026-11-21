// Cảnh giới Phase 3-7 phía server: vượt bình cảnh (thử thách tâm ma hoặc Phá Cảnh Đan) và đổi linh căn.
// Tách khỏi sim.ts để ít xung đột; sim.ts chỉ nối bốn chỗ (tick, rời room, hai lệnh) và cho mượn `RealmHost`.
// Mọi phán định ở đây: client chỉ gửi ý định ('trial' | 'pill', đổi sang linh căn X).

import {
  bottleneckReady,
  BOTTLENECK_RETRY_SEC,
  isRootId,
  peakGated,
  bottleneckPill,
  rootChangeCost,
  shadowStats,
  TRIAL_DURATION,
  TRIAL_RADIUS,
  xpNeed,
  type FxMsg,
} from '@dtl/shared';
import { nextMajorRealmName, NPC, realmName, t } from '@dtl/content';
import type { MonEnt, PlayerEnt } from './entities';
import { log } from '../log';

/** Phần sim mà hệ bình cảnh cần mượn (sim.ts truyền vào, không import ngược để tránh vòng). */
interface RealmHost {
  now(): number;
  /** Chỉ thế giới chính có thử thách tâm ma (không phải bí cảnh). */
  inWorld(): boolean;
  isDead(p: PlayerEnt): boolean;
  nearNpc(p: PlayerEnt, npcId: string): boolean;
  idem(p: PlayerEnt, r: unknown): string | null | undefined;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  fx(m: FxMsg): void;
  /** Dựng bóng tâm ma của `p` (quái riêng của người đó) với chỉ số cho trước. Null nếu không dựng được. */
  spawnShadow(p: PlayerEnt, st: { hp: number; atk: number; def: number }): MonEnt | null;
  /** Gỡ bóng ngay (hết giờ, thua, người chơi rời đi). */
  dismissShadow(id: string): void;
  stopMeditate(p: PlayerEnt): void;
  savePlayer(p: PlayerEnt): void;
  questEvent(p: PlayerEnt, type: 'level', target: undefined, n: number): void;
  inCombat(p: PlayerEnt): boolean;
  /** Đang tỉ thí: không mở thử thách tâm ma. */
  inDuel(p: PlayerEnt): boolean;
  player(sid: string): PlayerEnt | undefined;
}

export class RealmSystem {
  constructor(private h: RealmHost) {}

  // ---------- bình cảnh ----------

  /** Có đang kẹt ở bình cảnh với tu vi đầy không (điều kiện để bắt đầu thử thách hoặc dùng đan). */
  private ready(p: PlayerEnt): boolean {
    const c = p.char;
    return !peakGated(c.level) && bottleneckReady(c.level, c.bk, c.xp, xpNeed(c.level));
  }

  /** Lệnh `bk`: `{ m: 'trial' | 'pill', r? }`. */
  onBottleneck(p: PlayerEnt, msg: unknown): void {
    const m = msg as { m?: unknown; r?: unknown } | null;
    if (!m) return;
    if (m.m === 'trial') return this.startTrial(p);
    if (m.m === 'pill') return this.usePill(p, m.r);
  }

  private startTrial(p: PlayerEnt): void {
    const h = this.h;
    const c = p.char;
    if (h.inDuel(p)) return h.warn(p, 'duel.busy');
    if (peakGated(c.level)) return h.warn(p, 'sys.bk_not_yet');
    if (h.isDead(p) || p.trib || p.trial || !h.inWorld() || p.casting || p.move.flying) return h.warn(p, 'sys.bk_not_now');
    if (!this.ready(p)) return h.warn(p, 'sys.bk_not_ready');
    const wait = Math.ceil((c.retryAt - h.now()) / 1000);
    if (wait > 0) return h.warn(p, 'sys.bk_wait', { n: wait });
    // Không kéo quái đang đánh dở vào thử thách: phải ra khỏi giao chiến trước.
    if (h.inCombat(p)) return h.warn(p, 'sys.busy');
    const st = shadowStats(c.level, c.atk, c.def);
    const shadow = h.spawnShadow(p, st);
    if (!shadow) return h.warn(p, 'sys.bk_not_now');
    if (p.meditating) h.stopMeditate(p);
    p.trial = { endAt: h.now() + TRIAL_DURATION * 1000, monId: shadow.id, x: p.move.x, z: p.move.z };
    c.trialEndsAt = p.trial.endAt;
    c.charDirty = true;
    h.sys(p, 'sys.bk_start', { n: TRIAL_DURATION }, 'info');
    log.info(`[bk] ${c.name} bắt đầu tâm ma ở tầng ${c.level}`);
  }

  private usePill(p: PlayerEnt, r: unknown): void {
    const h = this.h;
    const c = p.char;
    const idem = h.idem(p, r);
    if (idem === undefined) return;
    if (peakGated(c.level)) return h.warn(p, 'sys.bk_not_yet');
    if (h.isDead(p) || p.trib) return h.warn(p, 'sys.bk_not_now');
    if (!this.ready(p)) return h.warn(p, 'sys.bk_not_ready');
    if (!c.tx('bk:pill', idem, (d) => d.remove(bottleneckPill(c.level), 1))) {
      if (c.txFail === 'abort') h.warn(p, 'sys.bk_need_pill');
      return;
    }
    this.endTrial(p);
    this.pass(p, true);
  }

  /** Vượt bình cảnh thành công (thắng tâm ma hoặc dùng đan): server đổi cảnh giới và lưu ngay. */
  private pass(p: PlayerEnt, byPill: boolean): void {
    const h = this.h;
    const c = p.char;
    const from = c.level;
    const lv = c.passBottleneck();
    const top = lv === from;
    h.sys(p, (byPill ? 'sys.bk_pill_ok' : 'sys.bk_ok') + (top ? '15' : ''), { realm: realmName(lv), to: nextMajorRealmName(lv) }, 'good');
    // Chỉ hiệu ứng lên cấp nhẹ: `tribstart`/`ascend` là cảnh điện ảnh độ kiếp, không dùng cho bình cảnh.
    h.fx({ t: 'levelup', src: p.sid });
    if (!top) h.questEvent(p, 'level', undefined, lv);
    h.savePlayer(p);
    log.info(`[bk] ${c.name} vượt bình cảnh tầng ${from}${byPill ? ' bằng Phá Cảnh Đan' : ''} → ${lv}`);
  }

  // ---------- thử thách tâm ma ----------

  /** Gỡ trạng thái thử thách của người chơi (không báo, không phạt). */
  private endTrial(p: PlayerEnt): void {
    if (!p.trial) return;
    this.h.dismissShadow(p.trial.monId);
    p.trial = null;
    p.char.trialEndsAt = 0;
    p.char.charDirty = true;
  }

  failTrial(p: PlayerEnt, key: 'time' | 'dead' | 'far'): void {
    this.endTrial(p);
    const c = p.char;
    c.retryAt = this.h.now() + BOTTLENECK_RETRY_SEC * 1000;
    this.h.sys(p, 'sys.bk_fail_' + key, { n: BOTTLENECK_RETRY_SEC }, 'bad');
    log.info(`[bk] ${c.name} thua tâm ma (${key})`);
  }

  /** Mỗi tick, cho mỗi người chơi: hết giờ / chết / đi quá xa thì thua. */
  tick(p: PlayerEnt): void {
    const tr = p.trial;
    if (!tr) return;
    if (this.h.isDead(p)) return this.failTrial(p, 'dead');
    if (this.h.now() >= tr.endAt) return this.failTrial(p, 'time');
    if (Math.hypot(p.move.x - tr.x, p.move.z - tr.z) > TRIAL_RADIUS) return this.failTrial(p, 'far');
  }

  /** Bóng tâm ma bị hạ: nếu chủ đang trong thử thách thì thắng. Gọi từ killMonster. */
  onShadowDown(m: MonEnt): void {
    const p = this.h.player(m.owner);
    if (!p?.trial || p.trial.monId !== m.id) return;
    // Hết giờ đúng lúc đòn cuối vẫn tính thắng: bóng đã gục trước khi tick thua chạy.
    p.trial = null;
    p.char.trialEndsAt = 0;
    if (this.ready(p)) this.pass(p, false);
  }

  /** Người chơi rời room: gỡ bóng, không phạt (lần sau vào lại thử lại được ngay). */
  onLeave(p: PlayerEnt): void {
    this.endTrial(p);
  }

  // ---------- linh căn ----------

  /** Lệnh `root`: `{ npc, root, r? }`. Đổi linh căn ở NPC có `rootChange`, tốn linh thạch (một transaction + ledger). */
  onChangeRoot(p: PlayerEnt, msg: unknown): void {
    const h = this.h;
    const m = msg as { npc?: unknown; root?: unknown; r?: unknown } | null;
    if (!m || typeof m.npc !== 'string' || !isRootId(m.root)) return;
    const idem = h.idem(p, m.r);
    if (idem === undefined || h.isDead(p)) return;
    const npc = NPC.get(m.npc);
    if (!npc?.rootChange) return;
    if (!h.nearNpc(p, npc.id)) return h.warn(p, 'sys.too_far');
    const c = p.char;
    if (m.root === c.root) return h.warn(p, 'sys.root_same');
    const cost = rootChangeCost(c.level);
    if (c.gold < cost) return h.warn(p, 'sys.not_enough_gold');
    const to = m.root;
    const ok = c.tx('root:' + c.root + '>' + to, idem, (d) => {
      if (!d.spendGold(cost)) return false;
      d.root = to;
      return true;
    });
    if (!ok) return;
    h.sys(p, 'sys.root_changed', { root: t(`origin.${to}.name`), n: cost }, 'good');
    h.fx({ t: 'potion', src: p.sid });
  }
}
