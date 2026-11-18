// Bài kiểm tra bảo mật: Trang bị, công pháp, bí tịch/biến thức, nâng cấp trang bị (P3-2…P3-6) (R-7, tách từ security-check.ts).
import { applyInvMsg, C, type InvMsg, type InvSlot, S } from '@dtl/shared';
import { W, check, health, join, type Ctx } from './lib';

export async function runGear(_ctx: Ctx): Promise<void> {
  // 14. Trang bị (3-2): client chỉ gửi ô túi + khóa idempotency; không giả được dòng chính/phụ, không mặc đồ không có, không spam.
  {
    const g = await join('trangbi' + (Date.now() % 100000));
    await W(300);
    let inv: { id: string; inst?: { q: number } }[] = [];
    let equip: Record<string, { id: string; inst?: { q: number } }> = {};
    g.room.onMessage(S.INV, (m: InvMsg) => {
      inv = applyInvMsg(inv as InvSlot[], m) as typeof inv;
      equip = m.equip as typeof equip;
    });
    const say = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(1150); // chat có giới hạn tần suất (~1 giây)
    };
    await say('/gm level 15');
    await say('/gm roll itm_thanh_phong_kiem 0 12');
    await say('/gm roll itm_dao_bao 0 5');
    await W(300);
    const slot = inv.findIndex((x) => x?.id === 'itm_thanh_phong_kiem');
    // Thiếu khóa idempotency, ô ngoài khoảng, ô trống, kiểu sai, thêm trường giả: đều không làm gì.
    for (const bad of [
      { slot },
      { slot, r: 'x' },
      { slot: -1, r: 'bad-0001' },
      { slot: 99, r: 'bad-0002' },
      { slot: 29, r: 'bad-0003' },
      { slot: '0', r: 'bad-0004' },
      { slot: 1.5, r: 'bad-0005' },
      null,
      'weapon',
    ]) {
      g.room.send(C.EQUIP, bad);
      await W(250);
    }
    check(
      'mặc đồ thiếu khóa/ô sai bị bỏ qua',
      !equip.weapon && !equip.robe && inv[slot]?.id === 'itm_thanh_phong_kiem',
      'slot ' + slot + ' inv ' + inv.length + ' ' + JSON.stringify(Object.keys(equip)),
    );
    // Gửi kèm inst giả (Thiên phẩm): server bỏ qua, món mặc vào vẫn là Phàm phẩm đã roll.
    g.room.send(C.EQUIP, {
      slot,
      r: 'forge-0001',
      inst: { q: 4, ilvl: 99, main: { atk: 99999 }, affixes: [], gems: [], bound: false },
      id: 'itm_tram_ta_kiem',
    });
    await W(500);
    check(
      'inst giả từ client bị bỏ qua khi mặc đồ',
      equip.weapon?.id === 'itm_thanh_phong_kiem' && equip.weapon?.inst?.q === 0,
      JSON.stringify(equip.weapon),
    );
    // Cùng khóa gửi lại (mất mạng, bấm đúp): không đổi thêm lần nào.
    const before = JSON.stringify(equip);
    g.room.send(C.UNEQUIP, { slot: 'weapon', r: 'forge-0001' });
    await W(500);
    check('khóa idempotency dùng lại bị bỏ qua', JSON.stringify(equip) === before, JSON.stringify(Object.keys(equip)));
    // Tháo ô không có đồ / tên ô lạ: không crash.
    for (const bad of [
      { slot: 'robe', r: 'un-0001' },
      { slot: '__proto__', r: 'un-0002' },
      { slot: 'artifact', r: 'un-0003' },
      { r: 'un-0004' },
    ]) {
      g.room.send(C.UNEQUIP, bad);
      await W(250);
    }
    // Spam mặc/tháo khác khóa: vài lần đầu có hiệu lực nhưng số dòng ledger bị chặn bởi hồi 200 ms.
    for (let i = 0; i < 60; i++) {
      g.room.send(
        i % 2 ? C.UNEQUIP : C.EQUIP,
        i % 2 ? { slot: 'weapon', r: 'spam-u' + i } : { slot: inv.findIndex((x) => x?.id === 'itm_thanh_phong_kiem'), r: 'spam-e' + i },
      );
      await W(10);
    }
    await W(400);
    check('spam mặc/tháo không làm sập server', await health());
    await g.room.leave(true);
  }

  // 14. Công pháp (P3-5): chiêu của công pháp khác, ult khi chưa sạc, nâng cấp thiếu nguyên liệu, đổi công pháp xa NPC.
  {
    const g = await join('kt_congphap');
    const msgs: { k: string; p?: unknown }[] = [];
    let method: { method: string; lv: Record<string, number>; charge: number } | null = null;
    let gold = -1;
    g.room.onMessage(S.SYS, (m: { k: string }) => msgs.push(m));
    g.room.onMessage(S.METHOD, (m: { method: string; lv: Record<string, number>; charge: number }) => (method = m));
    g.room.onMessage(S.CHAR, (c: { gold: number }) => (gold = c.gold));
    const chat = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(900);
    };
    await chat('/gm level 12');
    await chat('/gm gold 5000');
    const gold0 = gold;
    const has = (k: string) => msgs.some((m) => m.k === k);
    // Chưa chọn công pháp: chiêu của công pháp không ra.
    g.room.send(C.SKILL, { id: 'skl_kim_cuong_bat_hoai' });
    await W(300);
    check('chiêu công pháp khi chưa chọn công pháp bị từ chối', has('sys.no_method'));
    await W(800);
    g.room.send(C.SKILL, { id: 'skl_tran_son_an' });
    await W(300);
    check('khiêu khích giả (chưa có công pháp) bị từ chối', msgs.filter((m) => m.k === 'sys.no_method').length >= 2);
    // Nâng cấp thiếu Bí Tịch: không đổi cấp, không mất linh thạch.
    g.room.send(C.SKILL_UP, { skill: 'skl_phi_kiem', r: 'sec-up-0001' });
    g.room.send(C.SKILL_UP, { skill: 'skl_phi_kiem', r: 'sec-up-0001' });
    g.room.send(C.SKILL_UP, { skill: 'skl_khong_co', r: 'sec-up-0002' });
    g.room.send(C.SKILL_UP, { skill: { $gt: '' }, r: 'sec-up-0003' });
    await W(600);
    check(
      'nâng cấp chiêu thiếu Bí Tịch bị từ chối, không mất linh thạch',
      gold === gold0 && !(method as { lv: Record<string, number> } | null)?.lv?.skl_phi_kiem,
      `vàng ${gold0} → ${gold}`,
    );
    // Biến thức khi chiêu chưa tới cấp 3 (warn của server giới hạn 1 lần/0,7 giây nên chờ giữa các lệnh).
    await W(800);
    g.room.send(C.SKILL_VAR, { skill: 'skl_phi_kiem', v: 'a' });
    g.room.send(C.SKILL_VAR, { skill: 'skl_phi_kiem', v: '__proto__' });
    await W(400);
    check('chọn biến thức khi chưa đủ cấp bị từ chối', has('sys.variant_low'));
    // Chọn công pháp (lần đầu được), rồi đổi ở xa NPC thì không được.
    g.room.send(C.METHOD, { method: 'lac_kiem_quyet' });
    await W(500);
    check('chọn công pháp lần đầu ở tầng 5+ được', (method as { method: string } | null)?.method === 'lac_kiem_quyet');
    await chat('/gm tp 2200 2400');
    g.room.send(C.METHOD, { method: 'bat_dong_kim_than', r: 'sec-sw-0001' });
    await W(500);
    check(
      'đổi công pháp xa Lạc Vân chân nhân bị từ chối',
      (method as { method: string } | null)?.method === 'lac_kiem_quyet' && gold === gold0,
    );
    // Ult khi vòng sạc chưa đầy.
    await W(800);
    g.room.send(C.SKILL, { id: 'skl_van_kiem_quy_tong', t: 'khong-co' });
    await W(300);
    check('chiêu tối thượng khi chưa đầy vòng sạc bị từ chối', has('sys.ult_not_ready'));
    // Gửi rác vào ba message không làm sập server.
    for (const m of [null, 7, 'x', [], { method: {} }, { skill: [], v: 1 }]) {
      g.room.send(C.METHOD, m);
      g.room.send(C.SKILL_UP, m);
      g.room.send(C.SKILL_VAR, m);
    }
    await W(400);
    check('message công pháp rác không làm sập server', await health());
    await g.room.leave(true);
  }

  // 15. Bí tịch và biến thức (P3-6): đổi biến thức dồn dập bị giãn; chép bí tịch giả không ra bí tịch (tài khoản riêng).
  {
    const g = await join('kt_bitich' + (Date.now() % 100000));
    const msgs: { k: string }[] = [];
    let inv: unknown[] = [];
    g.room.onMessage(S.SYS, (m: { k: string }) => msgs.push(m));
    g.room.onMessage(S.INV, (m: InvMsg) => (inv = applyInvMsg(inv as InvSlot[], m)));
    const chat = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(900);
    };
    await chat('/gm level 12');
    await chat('/gm method lac_kiem_quyet 3');
    // 3-6: đổi biến thức dồn dập bị giãn; chép bí tịch giả (thiếu nguyên liệu, xa Dược sư) không ra bí tịch.
    await chat('/gm tp tong_mon');
    await W(800);
    const wait0 = msgs.filter((m) => m.k === 'sys.variant_wait').length;
    g.room.send(C.SKILL_VAR, { skill: 'skl_phi_kiem', v: 'a' });
    await W(800);
    g.room.send(C.SKILL_VAR, { skill: 'skl_kiem_khi_tram', v: 'b' });
    await W(500);
    check('đổi biến thức hai lần liên tiếp: lần sau bị giãn', msgs.filter((m) => m.k === 'sys.variant_wait').length > wait0);
    const scrolls = () =>
      (inv as ({ id: string; n: number } | null)[]).reduce((n, s) => (s?.id === 'itm_bi_tich_tan_quyen' ? n + s.n : n), 0);
    const s0 = scrolls();
    g.room.send(C.CRAFT, { id: 'rcp_bi_tich', n: 20, r: 'sec-cr-0001' });
    g.room.send(C.CRAFT, { id: 'rcp_bi_tich', n: -1, r: 'sec-cr-0002' });
    await W(600);
    check('chép bí tịch thiếu nguyên liệu không ra bí tịch', scrolls() === s0, `${s0} → ${scrolls()}`);
    check('message chép bí tịch/biến thức không làm sập server', await health());
    await g.room.leave(true);
  }

  // 16. Nâng cấp trang bị (P3-3): khảm/tháo/ghép ngọc, tẩy luyện, phân giải, cường hóa. Server quyết định; client chỉ gửi ý định.
  {
    const g = await join('nangcap' + (Date.now() % 100000));
    await W(300);
    type It = { id: string; n: number; plus?: number; inst?: { q: number; gems: string[]; affixes: unknown[] } };
    let inv: (It | null)[] = [];
    let gold = 0;
    g.room.onMessage(S.INV, (m: InvMsg) => {
      inv = applyInvMsg(inv as InvSlot[], m) as typeof inv;
    });
    g.room.onMessage(S.CHAR, (m: { gold: number }) => (gold = m.gold));
    const say = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(1150);
    };
    const count = (id: string) => inv.reduce((n, x) => n + (x && x.id === id ? x.n : 0), 0);
    const upg = async (m: Record<string, unknown>) => {
      g.room.send(C.UPGRADE, { npc: 'npc_thiet_lao', ...m });
      await W(320); // hồi 250 ms mỗi lần
    };
    await say('/gm level 15');
    await say('/gm gold 5000');
    await say('/gm roll itm_thiet_kiem 0 5');
    await say('/gm roll itm_han_quang_kiem 2 12');
    await say('/gm give gem_kim_1 4');
    await say('/gm give itm_linh_tran 6');
    await W(300);
    const sword = inv.findIndex((x) => x?.id === 'itm_thiet_kiem');
    const rare = inv.findIndex((x) => x?.id === 'itm_han_quang_kiem');
    const snap = () => JSON.stringify([inv, gold]);
    // Đứng xa Thiết lão: mọi lệnh bị bỏ qua.
    const far = snap();
    await upg({ op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'], r: 'far-0001' });
    await upg({ op: 'merge', gem: 'gem_kim_1', r: 'far-0002' });
    await upg({ op: 'socket', i: rare, idx: 0, gem: 'gem_kim_1', r: 'far-0003' });
    check('nâng cấp khi đứng xa Thiết lão bị bỏ qua', snap() === far);
    await say('/gm tp 2088 2064');
    await W(600);
    // Payload xấu: thiếu khóa, ô/lỗ ngoài khoảng, kiểu sai, ngọc/loại lạ, lô quá lớn, ô trùng: không đổi gì.
    const bad: Record<string, unknown>[] = [
      { op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'] },
      { op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'], r: 'x' },
      { op: 'salvage', slots: [sword, sword], ids: ['itm_thiet_kiem', 'itm_thiet_kiem'], r: 'bad-0001' },
      { op: 'salvage', slots: [sword], ids: ['itm_dao_bao'], r: 'bad-0002' },
      { op: 'salvage', slots: [sword], ids: [], r: 'bad-0003' },
      { op: 'salvage', slots: Array.from({ length: 31 }, (_, i) => i % 30), ids: Array(31).fill('x'), r: 'bad-0004' },
      { op: 'salvage', slots: [-1], ids: ['x'], r: 'bad-0005' },
      { op: 'salvage', slots: ['0'], ids: ['x'], r: 'bad-0006' },
      { op: 'salvage', slots: 'all', r: 'bad-0007' },
      { op: 'socket', i: rare, idx: 5, gem: 'gem_kim_1', r: 'bad-0008' },
      { op: 'socket', i: rare, idx: -1, gem: 'gem_kim_1', r: 'bad-0009' },
      { op: 'socket', i: rare, idx: 0.5, gem: 'gem_kim_1', r: 'bad-0010' },
      { op: 'socket', i: rare, idx: 0, gem: 'gem_kim_9', r: 'bad-0011' },
      { op: 'socket', i: rare, idx: 0, gem: '__proto__', r: 'bad-0012' },
      { op: 'socket', i: rare, idx: 0, gem: 'gem_tho_3', r: 'bad-0013' }, // không sở hữu
      { op: 'socket', i: 99, idx: 0, gem: 'gem_kim_1', r: 'bad-0014' },
      { op: 'socket', w: 'robe', idx: 0, gem: 'gem_kim_1', r: 'bad-0015' }, // ô chưa mặc
      { op: 'unsocket', i: rare, idx: 0, r: 'bad-0016' }, // lỗ trống
      { op: 'merge', gem: 'gem_kim_3', r: 'bad-0017' }, // đã cấp cao nhất
      { op: 'merge', gem: 'itm_thiet_tinh', r: 'bad-0018' },
      { op: 'refine', i: rare, idx: 0, r: 'bad-0019' }, // thiếu Tẩy Luyện Thạch
      { op: 'refine', i: sword, idx: 0, r: 'bad-0020' }, // Phàm phẩm không có dòng phụ
      { op: 'hack', r: 'bad-0021' },
    ];
    let changed = '';
    for (const b of bad) {
      const was = snap();
      await upg(b);
      if (snap() !== was) changed = JSON.stringify(b).slice(0, 70);
    }
    check('payload nâng cấp xấu không đổi túi/tiền', !changed, changed);
    // inst giả kèm lệnh khảm hợp lệ: chỉ ngọc sở hữu có hiệu lực, ngọc giả cấp 3 không xuất hiện.
    await upg({
      op: 'socket',
      i: rare,
      idx: 0,
      gem: 'gem_kim_1',
      r: 'sock-0001',
      inst: { q: 4, gems: ['gem_kim_3', 'gem_kim_3'], affixes: [] },
    });
    check(
      'inst giả trong lệnh khảm bị bỏ qua',
      inv[rare]?.inst?.gems.join(',') === 'gem_kim_1' && count('gem_kim_3') === 0 && count('gem_kim_1') === 3,
      JSON.stringify(inv[rare]?.inst?.gems),
    );
    // Cùng khóa gửi lại (mất mạng): không trừ thêm ngọc/tiền.
    const goldNow = gold;
    await upg({ op: 'socket', i: rare, idx: 0, gem: 'gem_kim_1', r: 'sock-0001' });
    check(
      'khóa idempotency dùng lại không khảm/trừ tiền lần hai',
      gold === goldNow && count('gem_kim_1') === 3,
      `gold ${gold}/${goldNow} gem ${count('gem_kim_1')}`,
    );
    // Hai lệnh tháo cùng một lỗ (khóa khác nhau): chỉ trả ngọc một lần.
    await upg({ op: 'unsocket', i: rare, idx: 0, r: 'un-a-0001' });
    await upg({ op: 'unsocket', i: rare, idx: 0, r: 'un-b-0001' });
    check(
      'tháo ngọc hai lần cùng lỗ chỉ trả một viên',
      count('gem_kim_1') === 4 && inv[rare]?.inst?.gems[0] === '',
      `gem ${count('gem_kim_1')}`,
    );
    // Ghép ngọc: 3 → 1, không ghép khi thiếu.
    const dust = count('itm_linh_tran');
    await upg({ op: 'merge', gem: 'gem_kim_1', r: 'mg-0001' });
    await upg({ op: 'merge', gem: 'gem_kim_1', r: 'mg-0002' }); // chỉ còn 1 viên
    check(
      'ghép ngọc 3 → 1 và không ghép khi thiếu',
      count('gem_kim_2') === 1 && count('gem_kim_1') === 1 && count('itm_linh_tran') === dust - 2,
      `kim2 ${count('gem_kim_2')} kim1 ${count('gem_kim_1')}`,
    );
    // Phân giải: một lần, rồi không nhân đôi khi gửi lại hoặc khi ô đã trống.
    const ore = count('itm_thiet_tinh');
    await upg({ op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'], r: 'sv-0001' });
    await upg({ op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'], r: 'sv-0001' });
    await upg({ op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'], r: 'sv-0002' });
    check(
      'phân giải không nhân đôi (khóa lặp và ô đã trống)',
      count('itm_thiet_kiem') === 0 && count('itm_thiet_tinh') === ore + 1,
      `Thiết Tinh ${count('itm_thiet_tinh')} (cũ ${ore})`,
    );
    // Spam cường hóa khác khóa: hồi 250 ms/người, server vẫn sống.
    for (let i = 0; i < 60; i++) {
      g.room.send(C.ENHANCE, { npc: 'npc_thiet_lao', i: rare, r: 'enh-spam' + i });
      await W(10);
    }
    await W(500);
    check('spam cường hóa không làm sập server', await health());
    await g.room.leave(true);
  }
}
