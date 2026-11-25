// Bài kiểm tra bảo mật: Ngự kiếm/ra chiêu khi lơ lửng, rơi, ngắt chú boss, chết và hồi sinh (R-7, tách từ security-check.ts).
import { type Room } from 'colyseus.js';
import { C, IN_FLY, IN_UP, MF_CHANT, MF_STUN, MS_DEAD, S } from '@dtl/shared';
import { W, check, join, type Ctx, type P, type M, waitUntil } from './lib';

export async function runMovement(ctx: Ctx): Promise<void> {
  const { room, me, mons, gm } = ctx;
  // 2. Không ra chiêu được khi lơ lửng trên không.
  await gm('level 15');
  await gm('tp 2048 2455');
  let target = '';
  let best = 1e9;
  mons().forEach((m, id) => {
    const d = Math.hypot(m.x - me().x, m.z - me().z);
    if (m.st !== 4 && d < best) {
      best = d;
      target = id;
    }
  });
  const m0 = mons().get(target);
  if (!m0) {
    // Không có quái còn sống trong tầm thấy: thường do mất phòng (bài 11 làm cạn xô /matchmake, chờ ≥ 1 phút rồi chạy lại cả bộ) hoặc quái chưa đồng bộ.
    check(
      'movement: có quái còn sống để làm mục tiêu (nếu không: chạy lại sau ≥ 1 phút, xem đầu security-check.ts)',
      false,
      `mons=${mons().size}`,
    );
    return;
  }
  await gm(`tp ${m0.x.toFixed(0)} ${m0.z.toFixed(0)}`);
  let seq = 1000;
  // Bay lên khoảng 20m.
  for (let i = 0; i < 40; i++) {
    room.send(C.INPUT, { s: seq++, mx: 0, mz: 0, yaw: 0, f: IN_FLY | IN_UP });
    await W(50);
  }
  const hp0 = mons().get(target)!.hp;
  let sysMsg = '';
  room.onMessage(S.SYS, (m: { k: string }) => (sysMsg = m.k));
  // Tắt ngự kiếm một bước rồi ra chiêu ngay (cách khai thác cũ).
  room.send(C.INPUT, { s: seq++, mx: 0, mz: 0, yaw: 0, f: 0 });
  await W(110);
  room.send(C.SKILL, { id: 'skl_phi_kiem', t: target });
  await W(400);
  const hp1 = mons().get(target)?.hp ?? -1;
  check('không ra chiêu được khi đang ở trên không', hp1 === hp0, `máu quái ${hp0} → ${hp1}, thông báo: ${sysMsg}`);

  // 9. Rơi không bị làm chậm khi gửi input thưa: rơi 20m phải xong trong dưới 3 giây.
  const t0 = Date.now();
  for (let i = 0; i < 16; i++) {
    room.send(C.INPUT, { s: seq++, mx: 0, mz: 0, yaw: 0, f: 0 });
    await W(190);
    if (me().y < 45) break;
  }
  check('rơi theo giờ thật dù gửi input thưa', me().y < 45 && Date.now() - t0 < 3000, `${Date.now() - t0}ms, y=${me().y.toFixed(1)}`);

  // 10. Ngắt chú boss (M5-3): trong đoạn hộ chú không phá được; qua hộ chú thì boss choáng.
  // Dùng hai nhân vật mới vào (đứng trên đất ở điểm xuất hiện); `kiemthu` lúc này còn đang ngự kiếm.
  {
    const a = await join('kiemthu2');
    const b = await join('kiemthu3');
    const say = async (r: Room, cmd: string) => {
      r.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900); // chat giới hạn 800ms/lệnh
    };
    for (const r of [a.room, b.room]) {
      await say(r, 'level 18');
      await say(r, 'heal');
    }
    await say(a.room, 'killall');
    await say(a.room, 'spawn boss_han_giao');
    const am = () => (a.room.state as { monsters: Map<string, M & { mf?: number }> }).monsters;
    const findBoss = () => [...am().entries()].filter(([, m]) => m.t === 'boss_han_giao' && m.st !== MS_DEAD).pop();
    await waitUntil(() => findBoss() !== undefined, 8000); // quái mới gọi tới client sau một nhịp đồng bộ trạng thái
    const boss = findBoss();
    const mf = () => am().get(boss?.[0] ?? '')?.mf ?? 0;
    let guardMsg = '';
    a.room.onMessage(S.SYS, (m: { k: string }) => {
      if (m.k === 'sys.chant_guarded') guardMsg = m.k;
    });
    let guardOk = false;
    let stunOk = false;
    let detail = boss ? '' : 'không gọi được boss';
    if (boss) {
      const id = boss[0];
      a.room.send(C.SKILL, { id: 'skl_phi_kiem', t: id });
      const t0 = Date.now();
      let healAt = t0;
      // Chờ boss bắt đầu niệm (lần đầu sau nửa chu kỳ), giữ máu cho cả hai.
      while (Date.now() - t0 < 16000 && !(mf() & MF_CHANT)) {
        await W(30);
        if (Date.now() - healAt > 2500) {
          healAt = Date.now();
          a.room.send(C.CHAT, { m: '/gm heal' });
          b.room.send(C.CHAT, { m: '/gm heal' });
        }
      }
      const seen = Date.now();
      if (mf() & MF_CHANT) {
        a.room.send(C.SKILL, { id: 'skl_kiem_khi_tram', t: id });
        // Chiêu áp tại hitAt (0,28 s): chờ qua mốc đó rồi mới đọc kết quả.
        await W(500);
        guardOk = guardMsg === 'sys.chant_guarded' && (mf() & MF_CHANT) !== 0;
        // Qua đoạn hộ chú (30% của 2,6 giây) thì người thứ hai phá chú.
        await W(Math.max(0, 1000 - (Date.now() - seen)));
        b.room.send(C.SKILL, { id: 'skl_kiem_khi_tram', t: id });
        await W(550);
        stunOk = (mf() & MF_STUN) !== 0;
        detail = `mf=${mf()}, thông báo hộ chú: ${guardMsg || 'không có'}`;
      } else detail = 'boss không niệm chú trong 16 giây';
    }
    check('phá chú trong đoạn hộ chú không có tác dụng', guardOk, detail);
    check('phá chú đúng cửa sổ thì boss choáng', stunOk, detail);
    await say(a.room, 'killall');
    await a.room.leave(true);
    await b.room.leave(true);
  }

  // 8. Chết rồi vào lại: tỉnh ở điểm hồi sinh.
  await gm('tp 2048 2455');
  await gm('die');
  await room.leave(true);
  await W(600);
  const again = await join('kiemthu');
  await W(400);
  const p2 = (again.room.state as { players: Map<string, P> }).players.get(again.init.sid)!;
  check(
    'chết rồi vào lại thì về điểm hồi sinh',
    Math.hypot(p2.x - 2048, p2.z - 2088) < 5 && p2.hp > 0,
    `(${p2.x.toFixed(0)}, ${p2.z.toFixed(0)}) hp ${p2.hp}`,
  );
  await again.room.leave(true);
}
