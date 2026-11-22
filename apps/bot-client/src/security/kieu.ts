// Bài kiểm tra bảo mật: Cửu Kiều (TN-7). Server quyết định: client chỉ xin "vào cầu n"; không có tin "đã qua cầu", vé chỉ cấp khi đủ
// cấp, đúng cầu kế tiếp, đứng cạnh Dẫn Kiều Nhân và cầu đã mở. Mọi tin sai/spam không được cấp vé (không có S.TRANSFER) và không làm hỏng server.
import { Client } from 'colyseus.js';
import { C, S } from '@dtl/shared';
import { WS, W, check, health, join, type Ctx } from './lib';

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

  // Chọn nguồn Cực nguyên (kết game): chưa đủ chín cầu / xa NPC / id lạ: không có hiệu lực, server sống (không có kênh đọc meta nên chỉ kiểm sống + không transfer).
  for (const b of [{ id: 'sat_luc' }, { id: 'kim' }, { id: 7 }, { id: '__proto__' }, {}, null, undefined, 'sat_luc', []]) {
    g.room.send(C.DAP, b);
    await W(100);
  }
  await chat('/gm kieu 9');
  for (const id of ['khoi_nguyen', 'tich_diet', 'cam_che', 'sat_luc']) {
    g.room.send(C.DAP, { id });
    await W(100);
  }
  check('chọn nguồn Cực nguyên sai/lạ/xa NPC: bị bỏ qua, server sống', xfers === 0 && (await health()), `xfers=${xfers}`);

  // Bảng Thiên Lộ: spam xin bảng (giãn cách phía server) và tin kèm tham số lạ: server sống, không chuyển room.
  for (let i = 0; i < 60; i++) {
    g.room.send(C.KIEU_BOARD, i % 3 ? undefined : { n: 'x'.repeat(500) });
    await W(15);
  }
  check('spam xin Bảng Thiên Lộ: server sống', xfers === 0 && (await health()), `xfers=${xfers}`);

  // Spam 200 tin trong ~2 s: server sống, vẫn không có vé.
  for (let i = 0; i < 200; i++) {
    g.room.send(C.KIEU, { n: 1 + (i % 9) });
    await W(10);
  }
  await W(1000);
  check('spam xin cầu: server sống, không vé', xfers === 0 && (await health()), `xfers=${xfers}`);

  // Vào thẳng room phòng cầu (không qua Dẫn Kiều Nhân): không vé, vé không khóa nhóm, cầu chưa có room: đều bị từ chối ở onAuth.
  const tryJoin = async (name: string, opts: Record<string, unknown>) => {
    try {
      const r = await new Client(WS).joinOrCreate(name, opts);
      await r.leave(true);
      return true;
    } catch {
      return false;
    }
  };
  const d1 = await tryJoin('dungeon-kieu_1', { dev: 'kt_kieu_direct' });
  const d2 = await tryJoin('dungeon-kieu_2', { dev: 'kt_kieu_direct', dgKey: 'khoa-gia' });
  const d4 = await tryJoin('dungeon-kieu_4', { dev: 'kt_kieu_direct', dgKey: 'khoa-gia' });
  const d5 = await tryJoin('dungeon-kieu_5', { dev: 'kt_kieu_direct', dgKey: 'khoa-gia' });
  const d6 = await tryJoin('dungeon-kieu_6', { dev: 'kt_kieu_direct', dgKey: 'khoa-gia' });
  // Cầu 3 là sân kiếp: không vé kiếp, khóa phòng giả, tự đặt id kiếp: đều bị từ chối.
  const t3 = await tryJoin('tribulation-kieu_3', { dev: 'kt_kieu_direct', tribRoom: 'khoa-gia' });
  const t3b = await tryJoin('tribulation-kieu_3', { dev: 'kt_kieu_direct' });
  const t789 = [
    await tryJoin('tribulation-kieu_7', { dev: 'kt_kieu_direct', tribRoom: 'khoa-gia' }),
    await tryJoin('tribulation-kieu_8', { dev: 'kt_kieu_direct', tribRoom: 'khoa-gia' }),
    await tryJoin('tribulation-kieu_9', { dev: 'kt_kieu_direct', tribRoom: 'khoa-gia' }),
  ];
  const d9 = await tryJoin('dungeon-kieu_9', { dev: 'kt_kieu_direct', dgKey: 'khoa-gia' });
  check(
    'vào thẳng room phòng cầu không vé: bị từ chối',
    !d1 && !d2 && !d9 && !d4 && !d5 && !d6 && !t3 && !t3b && !t789.some(Boolean) && (await health()),
    `${d1}/${d2}/${d9}/${d4}/${d5}/${d6}/${t3}/${t3b}/${t789.join(',')}`,
  );
  await g.room.leave(true);
}
