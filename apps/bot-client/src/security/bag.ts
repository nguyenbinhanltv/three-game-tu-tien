// Bài kiểm tra bảo mật: Túi đồ 120 ô (TD-A) (R-7, tách từ security-check.ts).
import { applyInvMsg, C, type InvMsg, type InvSlot, S } from '@dtl/shared';
import { W, check, health, join, type Ctx } from './lib';

export async function runBag(_ctx: Ctx): Promise<void> {
  // 15. Túi đồ 120 ô (TD-A): ô ngoài phạm vi, kiểu lạ, spam sắp xếp, tách số âm, khóa bán/gộp.
  {
    const g = await join('kt_tui' + (Date.now() % 100000));
    let inv: InvSlot[] = [];
    let gold = -1;
    const msgs: { k: string }[] = [];
    g.room.onMessage(S.SYS, (m: { k: string }) => msgs.push(m));
    g.room.onMessage(S.CHAR, (c: { gold: number }) => (gold = c.gold));
    g.room.onMessage(S.INV, (m: InvMsg) => (inv = applyInvMsg(inv, m)));
    const chat = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(1300);
    };
    const count = (id: string) => inv.reduce((a, x) => a + (x?.id === id ? x.n : 0), 0);
    await chat('/gm give itm_linh_thao 10');
    const total0 = count('itm_linh_thao');
    const slot = inv.findIndex((x) => x?.id === 'itm_linh_thao');
    check('túi nhận đồ trong 120 ô', total0 === 10 && slot >= 0 && inv.length === 120, `tổng ${total0} ô ${slot} dài ${inv.length}`);
    const before = JSON.stringify(inv);
    // Ô ngoài phạm vi / kiểu lạ cho mọi lệnh túi mới và đổi chỗ.
    const bads: unknown[] = [-1, 120, 1e9, 1.5, NaN, '3', null, {}, [0], true];
    for (const b of bads) {
      g.room.send(C.INV_LOCK, { slot: b, on: true });
      g.room.send(C.INV_SPLIT, { slot: b, n: 1, r: 'sec-split-' + String(b) });
      g.room.send(C.MOVE_ITEM, { a: slot, b });
      if (b !== true) g.room.send(C.INV_LOCK, { slot, on: b });
      await W(60);
    }
    for (const bad of [undefined, null, 'x', 5, [], { slot: slot }]) {
      g.room.send(C.INV_LOCK, bad);
      g.room.send(C.INV_SPLIT, bad);
      g.room.send(C.INV_SORT, bad);
      await W(60);
    }
    await W(400);
    check('slot ngoài phạm vi / kiểu lạ không đổi túi, server sống', JSON.stringify(inv) === before && (await health()), 'túi đổi hoặc server chết');
    // Tách số âm / 0 / quá số lượng / không nguyên.
    for (const n of [-5, 0, 10, 11, 2.5, '3', null]) {
      g.room.send(C.INV_SPLIT, { slot, n, r: 'sec-neg-' + String(n) });
      await W(200);
    }
    await W(300);
    check('tách số âm / 0 / vượt số lượng bị từ chối', count('itm_linh_thao') === 10 && inv.filter((x) => x?.id === 'itm_linh_thao').length === 1);
    // Tách hợp lệ, gửi lặp cùng khóa không tách lần hai.
    g.room.send(C.INV_SPLIT, { slot, n: 4, r: 'sec-split-ok' });
    await W(300);
    g.room.send(C.INV_SPLIT, { slot, n: 4, r: 'sec-split-ok' });
    await W(400);
    check('tách chồng hợp lệ một lần, replay cùng khóa không tách thêm', count('itm_linh_thao') === 10 && inv.filter((x) => x?.id === 'itm_linh_thao').length === 2, JSON.stringify(inv.filter(Boolean)));
    // Spam sắp xếp: 40 lệnh khác khóa trong ~1 giây, tổng số lượng không đổi, server sống.
    for (let i = 0; i < 40; i++) {
      g.room.send(C.INV_SORT, { r: 'sec-sort-' + i + '-' + Date.now() });
      await W(25);
    }
    await W(1300);
    check('spam sắp xếp: tổng giữ nguyên, chồng được gộp, server sống', count('itm_linh_thao') === 10 && inv.filter((x) => x?.id === 'itm_linh_thao').length === 1 && (await health()));
    // Khóa rồi cố bán: không bán được, vẫn còn.
    const s2 = inv.findIndex((x) => x?.id === 'itm_linh_thao');
    g.room.send(C.INV_LOCK, { slot: s2, on: true });
    await W(300);
    check('khóa ô được ghi nhận', inv[s2]?.lk === true);
    await chat('/gm tp 2006 2066');
    const gold0 = gold;
    g.room.send(C.SELL, { npc: 'npc_duoc_su', slot: s2, n: 10, r: 'sec-sell-lock' });
    await W(500);
    check('ô khóa không bán được', count('itm_linh_thao') === 10 && gold === gold0 && msgs.some((m) => m.k === 'sys.item_locked'), `gold ${gold0} → ${gold}`);
    g.room.send(C.INV_LOCK, { slot: s2, on: false });
    await W(300);
    g.room.send(C.SELL, { npc: 'npc_duoc_su', slot: s2, n: 10, r: 'sec-sell-free' });
    await W(500);
    check('mở khóa thì bán được', count('itm_linh_thao') === 0 && gold > gold0, `gold ${gold0} → ${gold}`);
    await g.room.leave(true);
  }

}
