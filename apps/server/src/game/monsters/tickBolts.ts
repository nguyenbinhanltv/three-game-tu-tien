import { boltBlockedAt, BOLT_HEIGHT, boltHits, boltXZ, computeDamage, type DmgMsg, hazardHit, MS_DEAD, MS_RETURN, S } from '@dtl/shared';
import type { PlayerEnt } from '../entities';
import { at } from '@dtl/shared';
import type { MonsterSystem } from './index';

/** Điểm tạm dùng lại giữa các lần quét đạn (tránh cấp phát). */
const _bp = { x: 0, z: 0 };

export function tickBoltsImpl(sys: MonsterSystem): void {
  for (let i = sys.c.bolts.length - 1; i >= 0; i--) {
    const b = at(sys.c.bolts, i);
    const m = b.mon;
    // Quái bắn đã chết, đã bị gỡ, hoặc đang bỏ đuổi (hồi đầy + miễn sát thương): đạn tan, không gây sát thương.
    if (m.state === MS_DEAD || m.state === MS_RETURN || !sys.c.monById.has(m.id)) {
      sys.endBolt(i, b.px, b.pz);
      continue;
    }
    const t = Math.min(sys.c.now, b.endAt);
    boltXZ(b.x0, b.z0, b.yaw, b.v, (t - b.t0) / 1000, _bp);
    // Vật cản trên đường quét: rút ngắn đoạn tới chỗ chạm trước khi xét người (không trúng người sau tường).
    const bt = boltBlockedAt(b.px, b.pz, _bp.x, _bp.z, b.r, sys.c.collision, sys.c.terrain.groundAt(b.px, b.pz) + BOLT_HEIGHT + b.lift);
    if (bt >= 0) {
      _bp.x = b.px + (_bp.x - b.px) * bt;
      _bp.z = b.pz + (_bp.z - b.pz) * bt;
    }
    let hit: PlayerEnt | null = null;
    let best = Infinity;
    for (const p of sys.c.players.values()) {
      if (sys.c.isDead(p)) continue;
      if (!boltHits(b.px, b.pz, _bp.x, _bp.z, b.r, b.lift, p.move.x, p.move.y, p.move.z)) continue;
      // Nhiều người trên đường bay: trúng người gần điểm xuất phát tick này nhất.
      const dd = (p.move.x - b.px) ** 2 + (p.move.z - b.pz) ** 2;
      if (dd < best) {
        best = dd;
        hit = p;
      }
    }
    if (hit) {
      sys.endBolt(i, hit.move.x, hit.move.z, hit.sid);
      const n = computeDamage(b.atk, b.mul, hit.char.def, Math.random(), 1).dmg;
      // Chung cửa sổ miễn với vùng nổ của quái: nhiều quái bắn trúng cùng lúc chỉ tính đòn mạnh nhất
      // (giữ cân bằng cũ khi đổi Kiếm Linh từ vùng chữ nhật sang đạn).
      const r = hazardHit(Math.max(1, Math.round(n)), hit.hazardWin.until, hit.hazardWin.taken, sys.c.now);
      hit.hazardWin.until = r.until;
      hit.hazardWin.taken = r.taken;
      if (r.dmg <= 0) sys.c.emit(S.DMG, { dst: hit.sid, n: 0, src: m.id } satisfies DmgMsg);
      else sys.c.damagePlayer(hit, r.dmg, m.id, true);
      continue;
    }
    if (bt >= 0) {
      sys.endBolt(i, _bp.x, _bp.z);
      continue;
    }
    b.px = _bp.x;
    b.pz = _bp.z;
    // Hết hạn: client tự tắt theo `life`, không cần gửi tin.
    if (sys.c.now >= b.endAt) sys.c.bolts.splice(i, 1);
  }
}
