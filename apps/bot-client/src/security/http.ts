// Bài kiểm tra bảo mật: Request HTTP xấu, matchmake không đăng nhập, ngoại hình lúc tạo nhân vật (R-7, tách từ security-check.ts).
import { Client, type Room } from 'colyseus.js';
import { ROOM_WORLD } from '@dtl/shared';
import { HTTP, WS, W, check, health, tag } from './lib';

export async function runHttp(): Promise<void> {
  // 1. Request HTTP xấu không được làm sập server.
  for (const path of ['//', '/%', '/..%2f..%2fpackage.json', '/%E0%A4%A']) {
    try {
      await fetch(HTTP + path);
    } catch {
      /* lỗi phía client cũng được, miễn server còn sống */
    }
  }
  await W(300);
  check('request HTTP xấu không làm sập server', await health());

  // 4. Matchmake không có thông tin đăng nhập bị từ chối và không dựng room.
  const before = ((await (await fetch(HTTP + '/health')).json()) as { rooms: unknown[] }).rooms.length;
  const r1 = await fetch(HTTP + '/matchmake/joinOrCreate/world', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const j1 = (await r1.json()) as { error?: string; code?: number };
  check('matchmake không đăng nhập bị từ chối', !!j1.error || !!j1.code, JSON.stringify(j1).slice(0, 80));

  // 3. Client không tự create được kênh mới.
  const r2 = await fetch(HTTP + '/matchmake/create/world', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dev: 'kiemthu' }),
  });
  const j2 = (await r2.json()) as { error?: string; code?: number };
  check('client không tự tạo được kênh', !!j2.error || !!j2.code, JSON.stringify(j2).slice(0, 80));
  const after = ((await (await fetch(HTTP + '/health')).json()) as { rooms: unknown[] }).rooms.length;
  check('không có room mới bị dựng', after <= Math.max(before, 1), `${before} → ${after}`);

  // Ngoại hình lúc tạo nhân vật: giới tính không tồn tại ('x'; nữ 'f' đã mở nên là ca dương tính bên dưới), màu tự do, dữ liệu sai kiểu/quá lớn → server dùng mặc định, không lỗi.
  const bad: [string, unknown][] = [
    ['ap' + tag + 'a', { g: 'x', dye: 'attire_ink' }],
    ['ap' + tag + 'b', { g: 'm', dye: '#ff00ff' }],
    ['ap' + tag + 'c', { g: 'm', dye: 'x'.repeat(100000) }],
    ['ap' + tag + 'd', ['m', 'attire_ink']],
  ];
  for (const [name, ap] of bad) {
    const c = new Client(WS);
    let r: Room;
    try {
      r = await c.joinOrCreate(ROOM_WORLD, { dev: name, ap });
    } catch (e) {
      // Body quá lớn bị chặn trước khi tới onAuth (giới hạn kích thước /matchmake) cũng là đạt.
      const code = (e as { code?: number }).code;
      check(`ngoại hình không hợp lệ bị từ chối (${JSON.stringify(ap).slice(0, 30)})`, code === 413, `mã ${code}`);
      continue;
    }
    r.onMessage('*', () => {});
    await W(400);
    const me = (r.state as unknown as { players: Map<string, { g: string; dye: string }> }).players.get(r.sessionId);
    check(
      `ngoại hình không hợp lệ thì về mặc định (${JSON.stringify(ap).slice(0, 30)})`,
      me?.g === 'm' && me?.dye === 'attire_sect',
      `${me?.g}/${me?.dye}`,
    );
    await r.leave(true);
  }
  // Ca dương tính: nữ tu hợp lệ được nhận lúc tạo nhân vật mới.
  {
    const c = new Client(WS);
    const r = await c.joinOrCreate(ROOM_WORLD, { dev: 'ap' + tag + 'f', ap: { g: 'f', dye: 'attire_ink' } });
    r.onMessage('*', () => {});
    await W(400);
    const me = (r.state as unknown as { players: Map<string, { g: string; dye: string }> }).players.get(r.sessionId);
    check('giới tính nữ hợp lệ được nhận lúc tạo nhân vật', me?.g === 'f' && me?.dye === 'attire_ink', `${me?.g}/${me?.dye}`);
    await r.leave(true);
  }
  // Chỉ nhận lúc tạo: vào lại nhân vật cũ với lựa chọn khác không đổi được màu.
  {
    const c = new Client(WS);
    const r = await c.joinOrCreate(ROOM_WORLD, { dev: 'ap' + tag + 'a', ap: { g: 'm', dye: 'attire_ink' } });
    r.onMessage('*', () => {});
    await W(400);
    const me = (r.state as unknown as { players: Map<string, { dye: string }> }).players.get(r.sessionId);
    check('ngoại hình chỉ nhận lúc tạo nhân vật', me?.dye === 'attire_sect', String(me?.dye));
    await r.leave(true);
  }
}
