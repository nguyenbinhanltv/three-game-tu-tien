// Bài kiểm tra bảo mật: điểm ngắm và né của camera chéo (Thiên Nhãn P1). Client chỉ gửi ý định; server kẹp, kiểm tầm, hồi, quãng.
import { C, DODGE_CD_MS, DODGE_DIST } from '@dtl/shared';
import { W, check, health, join, type Ctx, type M, type P } from './lib';

/**
 * Bài này tự vào một nhân vật riêng (không dùng `ctx.room`): bài `movement` ngay trước nó kết thúc bằng `room.leave(true)` trên chính phòng
 * dùng chung, nên trong bộ đầy đủ `ctx.room` đã đóng, né gửi vào hư không và "né hợp lệ có di chuyển" ra 0,00 m (chạy riêng thì đạt vì chưa
 * có bài nào rời phòng). Nhân vật mới cũng không thừa hưởng hồi né/khe 0,4 s hay trạng thái bay/chết từ các bài trước.
 */
export async function runAim(_ctx: Ctx): Promise<void> {
  const g = await join('ngamthu');
  const room = g.room;
  const me = () => (room.state as { players: Map<string, P> }).players.get(g.init.sid)!;
  const mons = () => (room.state as { monsters: Map<string, M> }).monsters;
  const gm = async (cmd: string) => {
    room.send(C.CHAT, { m: '/gm ' + cmd });
    await W(900);
  };
  await W(500);
  await gm('level 15');
  await gm('tp 2048 2088');
  await gm('heal');
  let seq = 5000;
  room.send(C.INPUT, { s: seq++, mx: 0, mz: 0, yaw: 0, f: 0 });
  await W(300);

  // 1. Né: một lần né hợp lệ phải đi được; sau đó điểm ngắm rác và spam trong thời gian hồi không đưa đi thêm (tổng ≤ DODGE_DIST).
  const x0 = me().x;
  const z0 = me().z;
  await W(1200);
  room.send(C.DODGE, { ax: x0 + 30, az: z0 });
  await W(500);
  const first = Math.hypot(me().x - x0, me().z - z0);
  check(
    'né hợp lệ có di chuyển, không quá DODGE_DIST',
    first >= 1 && first <= DODGE_DIST + 1,
    `đi ${first.toFixed(2)} m (giới hạn ${DODGE_DIST})`,
  );
  for (const bad of [{ ax: 1e308, az: -1e308 }, { ax: 'x', az: [] }, { ax: null, az: NaN }, { ax: 1e9, az: 1e9 }, {}, null, 'rác']) {
    room.send(C.DODGE, bad);
  }
  for (let i = 0; i < 25; i++) room.send(C.DODGE, { ax: x0 + 30, az: z0 });
  await W(900);
  const moved = Math.hypot(me().x - x0, me().z - z0);
  check(
    'né: điểm ngắm rác và spam trong thời gian hồi không đi thêm',
    moved <= DODGE_DIST + 1,
    `tổng ${moved.toFixed(2)} m (giới hạn ${DODGE_DIST})`,
  );
  check('server còn sống sau tin né/ngắm rác', await health());

  // 2. Chiêu với điểm ngắm rác không làm hỏng (không mục tiêu → không ra chiêu), server còn sống.
  for (const bad of [
    { ax: NaN, az: 1 },
    { ax: 1e308, az: 1e308 },
    { ax: {}, az: [] },
  ])
    room.send(C.SKILL, { id: 'skl_kiem_khi_tram', ...bad });
  await W(300);
  check('chiêu với điểm ngắm rác không làm sập server', await health());

  // 3. Tự khóa theo điểm ngắm không với tới quái ngoài tầm: không gây sát thương.
  let far = '';
  let fd = 0;
  mons().forEach((m, id) => {
    const d = Math.hypot(m.x - me().x, m.z - me().z);
    if (m.st !== 4 && d > fd && d < 200) {
      fd = d;
      far = id;
    }
  });
  if (far) {
    const m = mons().get(far)!;
    const hp = m.hp;
    await W(DODGE_CD_MS + 200);
    for (let i = 0; i < 5; i++) {
      room.send(C.SKILL, { id: 'skl_kiem_khi_tram', ax: m.x, az: m.z });
      await W(1100);
    }
    check(
      'điểm ngắm lên quái ngoài tầm không gây sát thương',
      (mons().get(far)?.hp ?? hp) >= hp,
      `máu ${hp} → ${mons().get(far)?.hp}, cách ${fd.toFixed(0)} m`,
    );
  }
  await room.leave(true);
}
