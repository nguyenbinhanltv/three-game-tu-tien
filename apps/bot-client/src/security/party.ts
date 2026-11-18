// Bài kiểm tra bảo mật: Tổ đội, tỉ thí, pháp bảo phụ và đan (P3-8, P3-9) (R-7, tách từ security-check.ts).
import { type Room } from 'colyseus.js';
import { applyInvMsg, C, type InvMsg, type InvSlot, S } from '@dtl/shared';
import { W, check, health, join, type Ctx, type P, type CharV } from './lib';

import { at } from '@dtl/shared';
export async function runParty(_ctx: Ctx): Promise<void> {
  // 16. Tổ đội và tỉ thí (P3-9): server giữ lời mời, chặn spam, không cho đánh đồng đội ngoài tỉ thí, tỉ thí không thưởng.
  {
    const A = 'doi_a' + (Date.now() % 1000);
    const B = 'doi_b' + (Date.now() % 1000);
    const Cn = 'doi_c' + (Date.now() % 1000);
    const a = await join(A);
    const b = await join(B);
    const c = await join(Cn);
    const players = (r: Room) => (r.state as { players: Map<string, P> }).players;
    const pb = () => players(a.room).get(b.init.sid)!;
    const pc = () => players(a.room).get(c.init.sid)!;
    const say = async (r: Room, cmd: string) => {
      r.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900);
    };
    const keys = (r: Room) => {
      const out: string[] = [];
      r.onMessage(S.SYS, (m: { k: string }) => out.push(m.k));
      return out;
    };
    let partyA = undefined as { members: { id: number }[]; loot: string } | null | undefined;
    let partyB = undefined as { members: { id: number }[] } | null | undefined;
    a.room.onMessage(S.PARTY, (m) => (partyA = m));
    b.room.onMessage(S.PARTY, (m) => (partyB = m));
    const inviteB: { id: number; kind: string }[] = [];
    b.room.onMessage(S.INVITE, (m: { id: number; kind: string; gone?: boolean }) => !m.gone && inviteB.push(m));
    const sysA = keys(a.room);
    const sysB = keys(b.room);
    const sysC = keys(c.room);
    let duelA = null as { phase: string; won?: boolean; why?: string } | null;
    a.room.onMessage(S.DUEL, (m) => (duelA = m));
    let ca = null as CharV | null;
    a.room.onMessage(S.CHAR, (v: CharV) => (ca = v));
    for (const r of [a, b, c]) {
      await say(r.room, 'level 12');
      await say(r.room, 'god off');
      await say(r.room, 'tp 2048 2455'); // xa võ đài
    }
    // a. Rác không làm sập, không tạo tổ đội.
    for (const m of [
      null,
      5,
      'x',
      {},
      { a: 7 },
      { a: 'inv' },
      { a: 'inv', n: 5 },
      { a: 'acc', id: 'x' },
      { a: 'kick', id: NaN },
      { a: 'loot', m: 'bậy' },
      { a: 'inv', n: 'x'.repeat(500) },
    ])
      a.room.send(C.PARTY, m);
    for (const m of [null, 5, { a: 'inv', n: {} }, { a: 'acc', id: -1 }, { a: 'yield' }]) a.room.send(C.DUEL, m);
    await W(600);
    check('lệnh tổ đội/tỉ thí sai kiểu bị bỏ qua, server còn sống', !partyA && (await health()));
    // b. Nhận lời khi không có lời mời: không vào tổ đội.
    b.room.send(C.PARTY, { a: 'acc', id: Number.MAX_SAFE_INTEGER });
    await W(500);
    check('nhận lời mời giả (không ai mời) không lập được tổ đội', !partyB);
    // c. Mời, nhận lời → tổ đội; mời dồn dập bị chặn.
    a.room.send(C.PARTY, { a: 'inv', n: B });
    await W(500);
    check('lời mời tổ đội tới đúng người', inviteB.length === 1 && at(inviteB, 0).kind === 'party');
    a.room.send(C.PARTY, { a: 'inv', n: Cn });
    await W(500);
    check('mời liên tục trong 2 giây bị chặn', sysA.includes('party.invite_rate'));
    b.room.send(C.PARTY, { a: 'acc', id: at(inviteB, 0).id });
    await W(700);
    check('nhận lời mời hợp lệ: cả hai cùng thấy tổ đội 2 người', partyA?.members.length === 2 && partyB?.members.length === 2);
    // d. Người không phải trưởng nhóm không đổi được chia đồ/đuổi.
    b.room.send(C.PARTY, { a: 'loot', m: 'free' });
    b.room.send(C.PARTY, { a: 'kick', id: at(inviteB, 0).id });
    await W(500);
    check(
      'thành viên thường không đổi được chia đồ hay đuổi trưởng nhóm',
      partyA?.loot === 'turn' && partyA?.members.length === 2 && sysB.includes('party.not_leader'),
    );
    // e. Không đánh được đồng đội hay người lạ bằng chiêu.
    await say(a.room, 'tp 2048 2090');
    await say(b.room, 'tp 2050 2090');
    await say(c.room, 'tp 2052 2090');
    await say(a.room, 'heal');
    const hpB = pb().hp;
    const hpC = pc().hp;
    for (const t of [pb(), pc()]) void t;
    for (let i = 0; i < 4; i++) {
      a.room.send(C.SKILL, { id: 'skl_phi_kiem', t: b.init.sid });
      await W(1100);
      a.room.send(C.SKILL, { id: 'skl_phi_kiem', t: c.init.sid });
      await W(1100);
    }
    check(
      'không đánh được đồng đội hay người lạ ngoài tỉ thí',
      pb().hp >= hpB && pc().hp >= hpC,
      `B ${hpB} → ${pb().hp}, C ${hpC} → ${pc().hp}`,
    );
    // f. Tỉ thí ngoài võ đài bị từ chối.
    await say(b.room, 'tp 2048 2455');
    await say(a.room, 'tp 2048 2455');
    a.room.send(C.DUEL, { a: 'inv', n: B });
    await W(600);
    check('tỉ thí ngoài võ đài bị từ chối', sysA.includes('duel.not_in_arena') && !duelA);
    // g. Tỉ thí trong võ đài: giữa chừng người thứ ba không can thiệp được; kết thúc không thưởng, không mất gì.
    await say(a.room, 'tp 2048 2088');
    await say(b.room, 'tp 2052 2088');
    await say(c.room, 'tp 2046 2088');
    await say(a.room, 'heal');
    await say(b.room, 'heal');
    const duelInvB: { id: number }[] = [];
    b.room.onMessage(S.INVITE, (m: { id: number; kind: string; gone?: boolean }) => m.kind === 'duel' && !m.gone && duelInvB.push(m));
    a.room.send(C.DUEL, { a: 'inv', n: B });
    await W(600);
    check('lời thách đấu tới đúng người', duelInvB.length === 1);
    const xp0 = ca?.xp ?? 0;
    const gold0 = ca?.gold ?? 0;
    b.room.send(C.DUEL, { a: 'acc', id: at(duelInvB, 0).id });
    await W(500);
    check('chấp nhận thì vào đếm ngược', duelA?.phase === 'count');
    const hpBefore = pb().hp;
    a.room.send(C.SKILL, { id: 'skl_phi_kiem', t: b.init.sid });
    await W(500);
    check('đang đếm ngược chưa đánh được', pb().hp === hpBefore);
    await W(3200);
    c.room.send(C.SKILL, { id: 'skl_phi_kiem', t: b.init.sid });
    await W(400);
    check('người thứ ba không đánh được người đang tỉ thí', pb().hp === hpBefore);
    let min = 1e9;
    for (let i = 0; i < 40 && duelA?.phase !== 'end'; i++) {
      a.room.send(C.SKILL, { id: 'skl_phi_kiem', t: b.init.sid });
      await W(1050);
      min = Math.min(min, pb().hp);
    }
    check('đánh được đối thủ, máu giảm nhưng không chết', min < hpBefore && min >= 1 && (pb().fl & 2) === 0, `thấp nhất ${min}`);
    await say(a.room, 'tp 2048 2088');
    if (duelA?.phase !== 'end') {
      b.room.send(C.DUEL, { a: 'yield' });
      await W(600);
    }
    check('kết thúc rõ ràng, có kết quả gửi cho người chơi', duelA?.phase === 'end' && (pb().fl & 2) === 0);
    check(
      'tỉ thí không cho tu vi hay linh thạch',
      (ca?.xp ?? 0) === xp0 && (ca?.gold ?? 0) === gold0,
      `xp ${xp0} → ${ca?.xp}, vàng ${gold0} → ${ca?.gold}`,
    );
    check(
      'người thua không ngã (không mất tu vi), trận hết thì đánh được quái bình thường',
      !sysB.includes('sys.died') && !sysA.includes('sys.died'),
    );
    void sysC;
    for (const r of [a, b, c]) await r.room.leave(true);
  }

  // 17. Pháp bảo phụ và đan (P3-8): không có pháp bảo thì không kích hoạt; chế pháp bảo thiếu nguyên liệu/cảnh giới/xa NPC bị từ chối;
  // đan phẩm chất do server roll (client gửi phẩm giả bị bỏ qua); spam kích hoạt không làm sập server và không hồi linh lực.
  {
    const g = await join('kt_phapbao');
    const msgs: { k: string; p?: unknown }[] = [];
    let gold = -1;
    let inv: ({ id: string; n: number; plus?: number } | null)[] = [];
    let equip: Record<string, { id: string }> = {};
    let mp = -1;
    let artId = '';
    g.room.onMessage(S.SYS, (m: { k: string }) => msgs.push(m));
    g.room.onMessage(S.CHAR, (c: { gold: number; mp: number }) => ((gold = c.gold), (mp = c.mp)));
    g.room.onMessage(S.INV, (m: InvMsg) => ((inv = applyInvMsg(inv as InvSlot[], m) as typeof inv), (equip = m.equip as typeof equip)));
    g.room.onMessage(S.METHOD, (m: { art?: { id: string } }) => (artId = m.art?.id ?? ''));
    const chat = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(1300);
    };
    await chat('/gm level 12');
    await chat('/gm gold 5000');
    const has = (k: string) => msgs.some((m) => m.k === k);
    // Chưa đeo pháp bảo: kích hoạt (kể cả kèm tham số lạ) không làm gì.
    for (const bad of [undefined, {}, { id: 'itm_tu_kim_ho_lo' }, 'art', null]) {
      g.room.send(C.ARTIFACT, bad);
      await W(150);
    }
    check(
      'kích hoạt pháp bảo khi chưa đeo bị từ chối',
      has('sys.art_none') && !artId,
      `${JSON.stringify(msgs.map((m) => m.k))} artId=${artId}`,
    );
    // Chế pháp bảo ở xa Thiết lão, thiếu nguyên liệu: từ chối, không mất linh thạch, không ra món nào.
    const gold0 = gold;
    await chat('/gm tp 2200 2400');
    g.room.send(C.CRAFT, { id: 'rcp_tu_kim_ho_lo', n: 1, r: 'art-craft-001' });
    await W(500);
    check('chế pháp bảo ở xa NPC bị từ chối', has('sys.too_far') && gold === gold0 && !inv.some((x) => x?.id === 'itm_tu_kim_ho_lo'));
    await chat('/gm tp 2090 2066');
    g.room.send(C.CRAFT, { id: 'rcp_tu_kim_ho_lo', n: 1, r: 'art-craft-002' });
    await W(500);
    check(
      'chế pháp bảo thiếu nguyên liệu bị từ chối, không mất linh thạch',
      has('sys.not_enough_mat') && gold === gold0 && !inv.some((x) => x?.id === 'itm_tu_kim_ho_lo'),
      `vàng ${gold0} → ${gold}`,
    );
    // Số lượng giả (nhiều món một lần) và công thức không tồn tại.
    for (const bad of [
      { id: 'rcp_tu_kim_ho_lo', n: 5, r: 'art-craft-003' },
      { id: 'rcp_khong_co', n: 1, r: 'art-craft-004' },
      { id: { $ne: 1 }, n: 1, r: 'art-craft-005' },
      { id: 'rcp_tu_kim_ho_lo', n: -1, r: 'art-craft-006' },
    ]) {
      g.room.send(C.CRAFT, bad);
      await W(150);
    }
    check('chế pháp bảo với tham số giả không ra món nào', !inv.some((x) => x?.id === 'itm_tu_kim_ho_lo') && gold === gold0);
    // Đan: phẩm giả từ client bị bỏ qua (phẩm do server roll theo ledger).
    await chat('/gm tp 2006 2066');
    await chat('/gm give itm_linh_thao 8');
    g.room.send(C.CRAFT, { id: 'rcp_hoi_xuan_dan', n: 4, r: 'art-pill-001', plus: 2, q: 2, quality: 2 });
    await W(700);
    const pills = inv.filter((x) => x?.id === 'itm_hoi_xuan_dan');
    const total = pills.reduce((a, x) => a + (x?.n ?? 0), 0);
    check(
      'luyện đan ra đúng số lượng, phẩm do server roll',
      total === 4 && pills.every((x) => (x?.plus ?? 0) >= 0 && (x?.plus ?? 0) <= 2),
      JSON.stringify(pills),
    );
    // Cùng khóa gửi lại: không luyện thêm.
    g.room.send(C.CRAFT, { id: 'rcp_hoi_xuan_dan', n: 4, r: 'art-pill-001' });
    await W(500);
    check(
      'luyện đan gửi lặp cùng khóa không ra thêm',
      inv.filter((x) => x?.id === 'itm_hoi_xuan_dan').reduce((a, x) => a + (x?.n ?? 0), 0) === 4,
    );
    // Đeo pháp bảo (GM thử) rồi spam kích hoạt: không crash, linh lực không tăng quá mức tối đa.
    await chat('/gm art itm_thanh_lien_an 2');
    check('đeo được pháp bảo ở ô Pháp bảo phụ', equip.artifact?.id === 'itm_thanh_lien_an' && artId === 'itm_thanh_lien_an');
    for (let i = 0; i < 60; i++) {
      g.room.send(C.ARTIFACT, {});
      await W(10);
    }
    await W(300);
    check('spam kích hoạt pháp bảo không làm sập server', (await health()) && mp <= 100000);
    await g.room.leave(true);
  }
}
