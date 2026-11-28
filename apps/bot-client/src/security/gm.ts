// Bài kiểm tra bảo mật: kênh GM có cấu trúc (C.GM → S.GM, phòng tập). Server dev bật đăng nhập thử nên MỌI tài khoản của bài là tài khoản thử:
// bài này kiểm đường chạy đúng (trả lời, mã r, ok/lỗi, trạng thái, danh sách), tin hỏng/kiểu lạ/quá cỡ không đụng trạng thái hay làm sập, và dồn dập bị giới hạn.
// Phần "tài khoản thường im lặng, không đổi trạng thái" kiểm ở test đơn vị `apps/server/src/game/gmrpc.test.ts` (cần tài khoản không phải dev).
// Chạy riêng: SECURITY_ONLY=gm pnpm --filter @dtl/bot-client security.
import { C, S, GM_MAX_ARG_LEN, GM_MAX_ARGS, type GmListResult, type GmReply, type GmState } from '@dtl/shared';
import { W, check, health, join, waitUntil } from './lib';

export async function runGm(): Promise<void> {
  const g = await join('kt_gm');
  const replies: GmReply[] = [];
  g.room.onMessage(S.GM, (m: GmReply) => replies.push(m));
  /** Gửi một yêu cầu và chờ trả lời mới (undefined nếu server im lặng trong `ms`). Chừa khoảng giãn để không dính giới hạn dồn dập. */
  const ask = async (body: unknown, ms = 2500): Promise<GmReply | undefined> => {
    await W(180);
    const n0 = replies.length;
    g.room.send(C.GM, body as never);
    await waitUntil(() => replies.length > n0, ms);
    return replies.length > n0 ? replies[replies.length - 1] : undefined;
  };

  // 1. Chạy lệnh: ok, r trả lại nguyên, dòng kết quả, trạng thái sau lệnh.
  const r1 = await ask({ r: 7, a: ['level', '9'] });
  check('GM: chạy lệnh trả ok + r + dòng kết quả + trạng thái', !!r1 && r1.ok && r1.r === 7 && r1.m.includes('level = 9') && r1.st?.level === 9, JSON.stringify(r1)?.slice(0, 160));

  // 2. Lệnh lỗi có mã.
  const unk = await ask({ r: 8, a: ['khong_co_lenh'] });
  const usg = await ask({ r: 9, a: ['build'] });
  check('GM: lệnh lạ trả unknown, thiếu tham số trả usage', unk?.ok === false && unk.e === 'unknown' && usg?.ok === false && usg.e === 'usage', `${unk?.e}/${usg?.e}`);

  // 3. Trạng thái và danh sách.
  const st = await ask({ r: 10, q: 'state' });
  check('GM: trạng thái có cấp và cờ', (st?.d as GmState | undefined)?.level === 9 && typeof (st?.d as GmState | undefined)?.god === 'boolean');
  const ls = await ask({ r: 11, q: 'list', k: 'boss', f: 'han giao' });
  check('GM: danh sách boss lọc không dấu', (ls?.d as GmListResult | undefined)?.items.map((x) => x.id).join() === 'boss_han_giao', JSON.stringify(ls?.d)?.slice(0, 160));

  // 4. Tin hỏng: trả bad, không đổi cấp.
  const bads: unknown[] = [
    {},
    { a: 5 },
    { a: [] },
    { a: ['level', 5] },
    { a: ['level', 'a b'] },
    { a: ['level\n99'] },
    { a: ['level', 'x'.repeat(GM_MAX_ARG_LEN + 1)] },
    { a: Array.from({ length: GM_MAX_ARGS + 1 }, () => 'x') },
    { q: 'list', k: 'khong_co' },
    { q: 'khong_co' },
  ];
  let badOk = 0;
  for (const b of bads) {
    const r = await ask({ r: 12, ...(b as object) });
    if (r && !r.ok && r.e === 'bad') badOk++;
  }
  const after = await ask({ r: 13, q: 'state' });
  check('GM: tin hỏng trả bad, không đổi trạng thái', badOk === bads.length && (after?.d as GmState | undefined)?.level === 9, `${badOk}/${bads.length}`);

  // 5. Kiểu lạ (nhỏ): server không sập, kết nối vẫn trả lời.
  for (const odd of [null, 5, 'level 3', true, [], { a: { 0: 'level' } }, { r: 1.5, a: ['level', '11'] }, { r: Number.MAX_SAFE_INTEGER + 2, q: 'state' }]) {
    g.room.send(C.GM, odd as never);
    await W(80);
  }
  const alive = await ask({ r: 14, q: 'state' }, 4000);
  check('GM: tin kiểu lạ không làm sập, vẫn trả lời, không đổi cấp', !!alive?.ok && (alive.d as GmState).level === 9 && (await health()));

  // 5b. Tin quá cỡ (> giới hạn tải của Colyseus): server tự đóng KẾT NỐI GỬI, không sập; kết nối khác vẫn phục vụ. Dùng kết nối riêng dùng một lần.
  const junk = await join('kt_gm_big');
  junk.room.send(C.GM, { a: Array.from({ length: 3000 }, () => 'y'.repeat(40)) });
  junk.room.send(C.GM, 'x'.repeat(20_000));
  await W(800);
  const stillAlive = await ask({ r: 16, q: 'state' }, 4000);
  check('GM: tin quá cỡ không làm sập server, kết nối khác vẫn trả lời', !!stillAlive?.ok && (await health()));
  try {
    junk.room.leave();
  } catch {
    /* kết nối đã bị server đóng */
  }

  // 6. Dồn dập: có trả rate, server sống, lệnh chạy bình thường sau đó.
  const n0 = replies.length;
  for (let i = 0; i < 40; i++) g.room.send(C.GM, { r: 100 + i, q: 'state' });
  await W(1200);
  const burst = replies.slice(n0);
  check('GM: dồn dập bị giới hạn (có trả rate), server sống', burst.some((x) => x.e === 'rate') && burst.length <= 40 && (await health()), `${burst.length} trả lời, ${burst.filter((x) => x.e === 'rate').length} rate`);
  const again = await ask({ r: 15, a: ['level', '10'] }, 4000);
  check('GM: sau dồn dập lệnh chạy bình thường', again?.ok === true && again.st?.level === 10, JSON.stringify(again)?.slice(0, 120));

  g.room.leave();
}
