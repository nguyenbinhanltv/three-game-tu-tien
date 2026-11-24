import { computeDamage, type DmgMsg, hazardHit, inHazard, MS_DEAD, MS_RETURN, S, buffMag } from '@dtl/shared';
import { at } from '@dtl/shared';
import type { MonsterSystem } from './index';

export function tickHazardsImpl(sys: MonsterSystem): void {
  const hitGrp = new Set<string>();
  for (let i = sys.c.hazards.length - 1; i >= 0; i--) {
    const h = at(sys.c.hazards, i);
    if (sys.c.now < h.at) continue;
    sys.c.hazards.splice(i, 1);
    // Quái thả vùng đã chết hoặc đang bỏ đuổi (miễn sát thương) thì vùng không gây sát thương.
    if (h.mon && (h.mon.state === MS_DEAD || h.mon.state === MS_RETURN || !sys.c.monById.has(h.mon.id))) continue;
    // Vạch chỉ để báo (gọi đệ tử): không sát thương.
    if (h.dmg <= 0 && !h.pct) continue;
    // Tia khóa mệnh có hộ pháp: hộ pháp chỉ chịu phần chắn thay (shareToGuards), không ăn thêm đòn của vòng.
    const guards = h.guard && h.lock ? sys.c.pickGuards(h) : null;
    for (const p of sys.c.players.values()) {
      if (sys.c.isDead(p)) continue;
      if (guards?.includes(p)) continue;
      // Tia cuối khóa mệnh: chủ kiếp luôn trúng (không né bằng chạy hay bay); người khác chỉ trúng khi đứng trong vòng.
      // Chỉ khi kiếp còn chạy: chết/hồi sinh/hủy kiếp trước lúc nổ thì tia mất khóa và rơi về kiểm vị trí.
      const locked = !!h.lock && h.src === p.sid && !!p.trib;
      const reached = !!h.reach && h.src === p.sid && !!p.trib;
      if (!locked && !reached && !inHazard(h, p.move.x, p.move.z)) continue;
      if (!locked && !reached && p.move.y - sys.c.terrain.groundAt(p.move.x, p.move.z) > 8) continue;
      if (h.grp) {
        const key = h.grp + ':' + p.sid;
        if (hitGrp.has(key)) continue;
        hitGrp.add(key);
      }
      let n =
        h.atk > 0
          ? computeDamage(h.atk, h.dmg, p.char.def, Math.random(), 1).dmg
          : h.pct
            ? p.char.mhp *
              h.dmg *
              (h.lock ? 1 - Math.min(sys.c.lockCut(h, p).max, buffMag(p.char.meta.buffs, 'def', Date.now()) * sys.c.lockCut(h, p).mul) : 1)
            : Math.max(1, h.dmg - p.char.def * 0.6);
      if (h.mon) {
        // Vùng của quái: trong cửa sổ HAZARD_IFRAME chỉ chịu vùng mạnh nhất (chống dồn đòn).
        const r = hazardHit(Math.max(1, Math.round(n)), p.hazardWin.until, p.hazardWin.taken, sys.c.now);
        p.hazardWin.until = r.until;
        p.hazardWin.taken = r.taken;
        if (r.dmg <= 0) {
          sys.c.emit(S.DMG, { dst: p.sid, n: 0, src: h.src } satisfies DmgMsg);
          continue;
        }
        n = r.dmg;
      }
      // Thiên kiếp của người khác: đứng trong vòng vẫn trúng đòn, nhưng không chết vì kiếp của người khác (dừng ở 1 khí huyết).
      // Nếu không, độ kiếp ở sân tông môn giết oan người mới và người treo máy (mất tu vi), kể cả khi chủ kiếp đã rớt mạng.
      if (!h.mon && h.src !== p.sid) {
        n = Math.min(n, p.char.hp - 1);
        if (n <= 0) continue;
      }
      // Trận môn khắc chế (Thiên Nhân Kiếp, E4-D): đứng trong vòng lúc nổ thì giảm `cut`, báo cờ `ke`.
      let ke: 1 | undefined;
      if (h.seal && Math.hypot(p.move.x - h.seal.x, p.move.z - h.seal.z) <= h.seal.r) {
        n *= 1 - h.seal.cut;
        ke = 1;
      }
      // Tia khóa mệnh: thế thân thần niệm còn sống chắn thay một phần, rồi hộ pháp chắn phần của mình (tính trên sát thương gốc).
      const full = n;
      if (locked && h.lock) n -= sys.c.tribSys.cloneAbsorb(p, n);
      if (h.guard && locked) n -= sys.c.shareToGuards(p, full, h);
      sys.c.damagePlayer(p, n, h.src, true, ke);
    }
  }
}
