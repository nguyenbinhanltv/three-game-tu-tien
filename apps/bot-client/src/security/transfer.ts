// Bài kiểm tra bảo mật: Vào bí cảnh không vé, chuyển bản đồ trái phép (E1-B) (R-7, tách từ security-check.ts).
import { Client } from 'colyseus.js';
import { C, ROOM_DUNGEON, S } from '@dtl/shared';
import { WS, W, check, health, join, tag, type Ctx } from './lib';

export async function runTransfer(ctx: Ctx): Promise<void> {
  const { client, init } = ctx;
  // 6. Vào bí cảnh không có vé bị từ chối.
  let direct = false;
  try {
    const d = await client.joinOrCreate(ROOM_DUNGEON, { session: init.session });
    direct = true;
    await d.leave(true);
  } catch {
    /* mong đợi */
  }
  check('vào bí cảnh không qua cổng bị từ chối', !direct);

  // 6b. Chuyển bản đồ trái phép (E1-B): room không tồn tại, cổng ở xa, trận lạ, vé dùng lại, vé hết hạn.
  {
    const tryJoin = async (name: string, opts: Record<string, unknown>) => {
      try {
        const r = await new Client(WS).joinOrCreate(name, opts);
        await r.leave(true);
        return true;
      } catch {
        return false;
      }
    };
    const j1 = await tryJoin('world-doan_mach', { dev: 'xferbad' });
    const j2 = await tryJoin('dungeon-van_lam', { dev: 'xferbad' });
    const j3 = await tryJoin('world-van_lam', { dev: 'xferbad' });
    check('room level không tồn tại / đặt tên bậy bị từ chối', !j1 && !j2 && !j3, `${j1}/${j2}/${j3}`);

    const b = await join('xferb' + tag);
    const xfers: { room: string; level?: string }[] = [];
    b.room.onMessage(S.TRANSFER, (m: { room: string; level?: string }) => xfers.push(m));
    const bgm = async (cmd: string) => {
      b.room.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900);
    };
    await bgm('level 10');
    b.room.send(C.PORTAL, {});
    await W(700);
    check('bấm cổng khi đứng xa cổng: không có vé, không đổi room', xfers.length === 0);
    b.room.send(C.TELE, { id: 'dm_khong_co' });
    b.room.send(C.TELE, { id: '__proto__' });
    b.room.send(C.TELE, { id: { toString: 1 } });
    await W(900);
    b.room.send(C.TELE, { id: 'tp_rung' });
    await W(700);
    check('Truyền Tống tới trận lạ / chưa mở khóa không chuyển room', xfers.length === 0 && (await health()));
    // E2-H: nhận nhiệm vụ mở trận khi chưa đủ điều kiện (chưa Trúc Cơ xong, đứng xa NPC) không được mở trận.
    b.room.send(C.QUEST, { a: 'accept', id: 'q2_thu_ha_son' });
    b.room.send(C.QUEST, { a: 'accept', id: { toString: 1 } });
    await W(900);
    b.room.send(C.TELE, { id: 'dm_tp_tram' });
    await W(700);
    check('nhận q2_thu_ha_son sai điều kiện không mở dm_tp_tram; spam thần thức không sập', xfers.length === 0 && (await health()));

    await bgm('tp 2048 1712');
    b.room.send(C.PORTAL, {});
    await W(700);
    check(
      'bấm cổng đúng chỗ: có lệnh chuyển sang bí cảnh',
      xfers.length === 1 && xfers[0]?.room === ROOM_DUNGEON && xfers[0]?.level === 'kiem_trung',
      JSON.stringify(xfers),
    );
    let first = false;
    try {
      const d = await new Client(WS).joinOrCreate(ROOM_DUNGEON, { session: b.init.session });
      first = true;
      let bounced = false;
      d.onMessage(S.TRANSFER, () => (bounced = true));
      d.onMessage('*', () => {});
      await W(1500);
      check(
        'vào bí cảnh bằng vé: ở lại bí cảnh, không bị dẫn ngược về thế giới',
        !bounced && d.name === ROOM_DUNGEON,
        `bounced=${bounced} room=${d.name}`,
      );
      await d.leave(true);
    } catch {
      /* xem bên dưới */
    }
    check('vé vào bí cảnh dùng được một lần', first);
    check('vé đã dùng không dùng lại được', !(await tryJoin(ROOM_DUNGEON, { session: b.init.session })));
    await W(1500);

    // vé hết hạn sau 15 s: nhân vật mới nhận vé rồi để quá hạn
    const c = await join('xferc' + tag);
    const xc: unknown[] = [];
    c.room.onMessage(S.TRANSFER, (m: unknown) => xc.push(m));
    const cgm = async (cmd: string) => {
      c.room.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900);
    };
    await cgm('level 10');
    await cgm('tp 2048 1712');
    c.room.send(C.PORTAL, {});
    await W(700);
    await W(16_000);
    check(
      'vé hết hạn sau 15 s bị từ chối',
      xc.length === 1 && !(await tryJoin(ROOM_DUNGEON, { session: c.init.session })),
      `lệnh chuyển ${xc.length}`,
    );
    // Phiên b đã bị đá khi vào bí cảnh (đăng nhập trùng): leave có thể không bao giờ trả về, nên chỉ chờ có hạn.
    await Promise.race([c.room.leave(true).catch(() => {}), W(1500)]);
    await Promise.race([b.room.leave(true).catch(() => {}), W(1500)]);
  }
}
