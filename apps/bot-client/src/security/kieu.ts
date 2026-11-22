// Bài kiểm tra bảo mật: Cửu Kiều (TN-7). Server quyết định: client chỉ xin "vào cầu n"; không có tin "đã qua cầu", vé chỉ cấp khi đủ
// cấp, đúng cầu kế tiếp, đứng cạnh Dẫn Kiều Nhân và cầu đã mở. Mọi tin sai/spam không được cấp vé (không có S.TRANSFER) và không làm hỏng server.
import { C, S } from '@dtl/shared';
import { W, check, health, join, type Ctx } from './lib';

export async function runKieu(_ctx?: Ctx): Promise<void> {
  const g = await join('kt_kieu' + (Date.now() % 100000));
  let xfers = 0;
  g.room.onMessage(S.TRANSFER, () => void xfers++);
  const chat = async (m: string) => {
    g.room.send(C.CHAT, { m });
    await W(1300);
  };
  await chat('/gm level 44');

  // Tin lạ, cầu ngoài 1..9, kiểu sai, spam: không vé, không chuyển room.
  const bads: unknown[] = [
    { n: 0 },
    { n: 10 },
    { n: -1 },
    { n: 1.5 },
    { n: NaN },
    { n: '1' },
    { n: [1] },
    { n: { a: 1 } },
    { n: null },
    { n: '__proto__' },
    { n: 1, extra: 'x'.repeat(2000) },
    {},
    null,
    undefined,
    'kieu',
    7,
    [],
    true,
  ];
  for (const b of bads) {
    g.room.send(C.KIEU, b);
    await W(120);
  }
  await W(400);
  check('tin xin cầu sai/lạ: không cấp vé, server sống', xfers === 0 && (await health()), `xfers=${xfers}`);

  // Hợp lệ về dạng nhưng sai điều kiện: xa NPC (đang ở sân Vân Lam), nhảy cầu 9 khi chưa qua cầu nào, cầu chưa mở.
  for (const n of [1, 2, 5, 9]) {
    g.room.send(C.KIEU, { n });
    await W(150);
  }
  await W(400);
  check('xin cầu khi xa NPC / nhảy cầu / cầu chưa mở: không vé', xfers === 0 && (await health()), `xfers=${xfers}`);

  // GM đặt đã qua 8 cầu vẫn không đưa client tới cầu khi xa NPC: điều kiện đứng cạnh NPC do server kiểm.
  await chat('/gm kieu 8');
  g.room.send(C.KIEU, { n: 9 });
  await W(500);
  check('đã qua 8 cầu nhưng xa NPC: vẫn không vé', xfers === 0, `xfers=${xfers}`);

  // Spam 200 tin trong ~2 s: server sống, vẫn không có vé.
  for (let i = 0; i < 200; i++) {
    g.room.send(C.KIEU, { n: 1 + (i % 9) });
    await W(10);
  }
  await W(1000);
  check('spam xin cầu: server sống, không vé', xfers === 0 && (await health()), `xfers=${xfers}`);
  await g.room.leave(true);
}
