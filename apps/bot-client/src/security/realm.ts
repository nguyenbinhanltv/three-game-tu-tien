// Bài kiểm tra bảo mật: Bình cảnh, tâm ma, linh căn (P3-7) (R-7, tách từ security-check.ts).
import { type Room } from 'colyseus.js';
import { C, rootChangeCost, MS_DEAD, S } from '@dtl/shared';
import { W, check, health, join, type Ctx, type P, type CharV, type M } from './lib';

export async function runRealm(_ctx: Ctx): Promise<void> {
  // 15. Bình cảnh, tâm ma, linh căn (P3-7): mọi thứ do server phán định, client chỉ gửi ý định.
  {
    const a = await join('binhcanh1');
    const b = await join('binhcanh2');
    let ca = null as CharV | null;
    a.room.onMessage(S.CHAR, (c: CharV) => (ca = c));
    // Tin hệ thống gần nhất của a: ghi vào chi tiết mục kiểm để biết server từ chối vì đâu.
    let sysA = '';
    a.room.onMessage(S.SYS, (m: { k?: string }) => (sysA = m?.k ?? ''));
    let cb = null as CharV | null;
    b.room.onMessage(S.CHAR, (c: CharV) => (cb = c));
    const say = async (r: Room, cmd: string) => {
      r.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900);
    };
    const mons = () => (a.room.state as { monsters: Map<string, M> }).monsters;
    const shadows = () => [...mons().entries()].filter(([, m]) => m.t === 'mon_tam_ma' && m.st !== MS_DEAD);
    const rq = () => 'r' + Math.random().toString(36).slice(2, 10);
    await say(a.room, 'tp 2048 2088'); // DB dev lưu vị trí lần chạy trước: về sân (xa Lạc Vân) cho bài đổi linh căn từ xa
    await say(a.room, 'level 5');
    await say(a.room, 'heal');
    await W(300);
    // a. Tu vi chưa đầy: không bắt đầu được tâm ma, không dùng được đan (kể cả khi có đan).
    await say(a.room, 'give itm_pha_canh_dan 1');
    a.room.send(C.BOTTLENECK, { m: 'trial' });
    a.room.send(C.BOTTLENECK, { m: 'pill', r: rq() });
    await W(700);
    check(
      'tu vi chưa đầy: không mở được tâm ma, không dùng được Phá Cảnh Đan',
      shadows().length === 0 && ca?.level === 5 && ca?.bk === 0 && ca?.trial === 0,
      `lv ${ca?.level} bk ${ca?.bk}`,
    );
    // b. Kiểu gửi lạ không làm gì, không sập.
    for (const m of [null, 'x', { m: 'hack' }, { m: 'pill' }, { m: 'pill', r: 5 }, { m: ['trial'] }]) a.room.send(C.BOTTLENECK, m);
    await W(500);
    check('lệnh bình cảnh sai kiểu bị bỏ qua', ca?.level === 5 && (await health()));
    // c. Đầy tu vi: chủ chưa đủ điều kiện độ kiếp tầng 15 khi chưa vượt bình cảnh.
    await say(a.room, 'level 15');
    await say(a.room, 'xp 9999999');
    await say(a.room, 'give itm_truc_co_dan 1');
    a.room.send(C.BREAKTHROUGH);
    await W(700);
    const pa = (a.room.state as { players: Map<string, P> }).players.get(a.init.sid)!;
    check(
      'tầng 15 chưa vượt bình cảnh: không độ kiếp được',
      (pa.fl & 16) === 0 && ca?.level === 15 && ca?.bk === 10,
      `fl ${pa.fl} bk ${ca?.bk}`,
    );
    // d. Đan: dùng một viên, vượt đúng một lần; trên tầng 15 chỉ mở đường độ kiếp.
    await say(a.room, 'give itm_pha_canh_dan 1');
    const r1 = rq();
    a.room.send(C.BOTTLENECK, { m: 'pill', r: r1 });
    a.room.send(C.BOTTLENECK, { m: 'pill', r: r1 });
    await W(900);
    check(
      'Phá Cảnh Đan tầng 15: bình cảnh vỡ (bk 15), vẫn Ngưng Khí 15',
      ca?.bk === 15 && ca?.level === 15,
      `lv ${ca?.level} bk ${ca?.bk}`,
    );
    // e. Tâm ma: người khác không đánh được bóng của mình.
    await say(a.room, 'level 5');
    await say(a.room, 'xp 9999999');
    await say(b.room, 'level 5');
    await say(b.room, 'heal');
    a.room.send(C.BOTTLENECK, { m: 'trial' });
    await W(900);
    const sh = shadows()[0];
    // Quái lạ còn sống quanh a (bài trước gọi ra mà chưa dọn) sẽ đánh a: server coi là đang giao chiến và từ chối mở tâm ma (sys.busy).
    const meA = (a.room.state as { players: Map<string, P> }).players.get(a.init.sid)!;
    const near = [...mons().values()]
      .filter((m) => m.st !== MS_DEAD && m.t !== 'mon_tam_ma' && Math.hypot(m.x - meA.x, m.z - meA.z) < 20)
      .map((m) => m.t);
    check(
      'tâm ma: server dựng bóng riêng và báo thời gian',
      !!sh && (ca?.trial ?? 0) > 100,
      `bóng ${sh ? 'có' : 'không'}, còn ${ca?.trial}s, lv ${ca?.level} bk ${ca?.bk} xp ${ca?.xp}, tin cuối ${sysA}, quái gần: ${near.join(' ') || 'không'}`,
    );
    if (sh) {
      const hp0 = sh[1].hp;
      for (let i = 0; i < 4; i++) {
        b.room.send(C.SKILL, { id: 'skl_phi_kiem', t: sh[0] });
        await W(1100);
      }
      check('người khác không làm bóng tâm ma mất máu', (mons().get(sh[0])?.hp ?? 0) >= hp0, `${hp0} → ${mons().get(sh[0])?.hp}`);
    }
    // e2. Chết trong thử thách: thua ngay, KHÔNG mất tu vi, phải đợi thử lại (người chơi b, bóng của b).
    b.room.send(C.RESPAWN); // DB dev nhớ lần chạy trước (b có thể đang trọng thương, tu vi đã tụt)
    await W(700);
    await say(b.room, 'level 5');
    await say(b.room, 'heal');
    await say(b.room, 'xp 9999999');
    await W(5000); // b vừa ra chiêu lên bóng của a: đợi hết giao chiến (6 giây) mới mở tâm ma được
    b.room.send(C.BOTTLENECK, { m: 'trial' });
    await W(900);
    const trialB = cb?.trial ?? 0;
    await say(b.room, 'die');
    await W(600);
    check(
      'chết trong tâm ma: không mất tu vi, đợi thử lại',
      trialB > 100 && cb?.trial === 0 && (cb?.retry ?? 0) > 30 && cb?.xp === cb?.xpNeed,
      `trial ${trialB} → ${cb?.trial}, retry ${cb?.retry}, xp ${cb?.xp}/${cb?.xpNeed}`,
    );
    // f. Chủ hạ bóng thì thắng (GM killall chạy qua damageMonster như đòn thật).
    await say(a.room, 'killall');
    await W(600);
    check(
      'hạ bóng tâm ma: vượt bình cảnh tầng 5 → tầng 6',
      ca?.level === 6 && ca?.bk === 5 && ca?.trial === 0,
      `lv ${ca?.level} bk ${ca?.bk}`,
    );
    // g. Đổi linh căn: sai NPC / xa NPC / root lạ / thiếu tiền đều bị từ chối.
    const before = ca?.root;
    await say(a.room, 'gold 100000');
    for (const m of [
      { npc: 'npc_chuong_mon', root: before === 'kim' ? 'moc' : 'kim', r: rq() }, // đứng xa NPC
      { npc: 'npc_thiet_lao', root: 'kim', r: rq() }, // NPC không đổi linh căn
      { npc: 'npc_chuong_mon', root: 'rong', r: rq() },
      { npc: 'npc_chuong_mon', root: 'kim' }, // thiếu khóa chống trùng
      { npc: 5, root: 'kim', r: rq() },
    ])
      a.room.send(C.ROOT, m);
    await W(700);
    check('đổi linh căn từ xa / sai NPC / root lạ / thiếu khóa bị từ chối', ca?.root === before, `${before} → ${ca?.root}`);
    // h. Đứng cạnh Lạc Vân: đổi được, trừ đúng phí một lần; gửi lại cùng khóa không bị trừ lần hai.
    await say(a.room, 'tp 2048 2033');
    const want = before === 'kim' ? 'moc' : 'kim';
    const g0 = (ca as CharV | null)?.gold ?? 0;
    const rr = rq();
    a.room.send(C.ROOT, { npc: 'npc_chuong_mon', root: want, r: rr });
    await W(700);
    const g1 = (ca as CharV | null)?.gold ?? 0;
    const flipped = ca?.root === want;
    a.room.send(C.ROOT, { npc: 'npc_chuong_mon', root: before, r: rr }); // cùng khóa, root khác: phải bị chặn
    await W(700);
    check(
      'đổi linh căn cạnh NPC: đổi đúng, trừ phí một lần, khóa trùng bị chặn',
      flipped && g0 - g1 === rootChangeCost(6) && ca?.root === want && ((ca as CharV | null)?.gold ?? 0) === g1,
      `${before} → ${ca?.root}, linh thạch ${g0} → ${g1}`,
    );
    // i. Bản Nguyên đang khóa (TN-1): đứng cạnh NPC, đủ tiền, khóa mới vẫn bị từ chối và không trừ phí; Lôi thì đổi được.
    for (const root of ['sinh_tu', 'luan_hoi', 'khoi_nguyen', 'sat_luc']) a.room.send(C.ROOT, { npc: 'npc_chuong_mon', root, r: rq() });
    await W(700);
    check(
      'Bản Nguyên đang khóa: server không cho đổi sang, không trừ linh thạch',
      ca?.root === want && ((ca as CharV | null)?.gold ?? 0) === g1,
      `${ca?.root}, linh thạch ${(ca as CharV | null)?.gold}`,
    );
    a.room.send(C.ROOT, { npc: 'npc_chuong_mon', root: 'loi', r: rq() });
    await W(700);
    check(
      'Bản Nguyên Lôi: đổi được ở NPC, trừ đúng phí',
      ca?.root === 'loi' && g1 - ((ca as CharV | null)?.gold ?? 0) === rootChangeCost(6),
      `${ca?.root}, linh thạch ${g1} → ${(ca as CharV | null)?.gold}`,
    );
    // j. Đạo (TN-3): chưa tới Vấn Đỉnh thì mọi lệnh bị bỏ; tới rồi, nguồn khóa/lạ bị bỏ, chọn hợp lệ được đúng một lần.
    for (const root of ['kim', 'hoa', 'sinh_tu']) a.room.send(C.DAO, { root });
    await W(600);
    check('Đạo: chưa đủ cấp Vấn Đỉnh thì không chọn được', !(ca as CharV | null)?.dao, `dao "${(ca as CharV | null)?.dao}"`);
    await say(a.room, 'level 36');
    await W(400);
    for (const m of [{ root: 'sinh_tu' }, { root: 'rong' }, { root: 7 }, {}, null, 'kim']) a.room.send(C.DAO, m);
    await W(600);
    check('Đạo: nguồn khóa, id lạ, tin sai dạng bị bỏ', !(ca as CharV | null)?.dao, `dao "${(ca as CharV | null)?.dao}"`);
    a.room.send(C.DAO, { root: 'hoa' });
    await W(500);
    a.room.send(C.DAO, { root: 'kim' });
    await W(600);
    check('Đạo: chọn hợp lệ được một lần, chọn lại bị chặn', (ca as CharV | null)?.dao === 'hoa', `dao "${(ca as CharV | null)?.dao}"`);
    await say(a.room, 'killall');
    await a.room.leave(true);
    await b.room.leave(true);
  }
}
