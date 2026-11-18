// Bài ?god/?at (M1-10): tài khoản thử, tham số lạ, server production (R-7, tách từ security-check.ts).
import { Client } from 'colyseus.js';
import { C, type InitMsg, ROOM_WORLD, S } from '@dtl/shared';
import { WS, W, check, health, withServer, type P } from './lib';

export async function testParamsChecks(): Promise<void> {
  // a) Tài khoản thử trên server dev: ?at đưa tới điểm đặt tên, ?god không mất máu dù bị quái đánh.
  {
    const client = new Client(WS);
    const room = await client.joinOrCreate(ROOM_WORLD, { dev: 'kiemthu_god', god: true, at: 'thung_lung' });
    const init = await new Promise<InitMsg>((res) => room.onMessage(S.INIT, res));
    let hits = 0;
    room.onMessage(S.DMG, (m: { dst: string; n: number }) => {
      if (m.dst === init.sid && m.n > 0) hits++;
    });
    room.onMessage('*', () => {});
    await W(500);
    const me = () => (room.state as { players: Map<string, P> }).players.get(init.sid)!;
    check(
      '?at=thung_lung đưa tài khoản thử tới thung lũng',
      Math.hypot(me().x - 2048, me().z - 2400) < 3,
      `(${me().x.toFixed(0)}, ${me().z.toFixed(0)})`,
    );
    // Đứng yên giữa 4 con sói vừa gọi (cách 10 m, trong tầm phát hiện 12 m). Trước đây dịch chuyển sang (2048, 2455) rồi
    // trông vào sói của bãi quái gần đó; sau M-1 bãi quái đổi chỗ nên có lượt không con nào tới đánh.
    room.send(C.CHAT, { m: '/gm spawn mon_soi_xam 4' });
    await W(900);
    let low = me().hp;
    const mhp = me().hp;
    for (let i = 0; i < 16; i++) {
      await W(500);
      low = Math.min(low, me().hp);
    }
    check('?god: bị đánh nhưng không mất máu', hits > 0 && low === mhp, `${hits} đòn trúng, máu thấp nhất ${low}/${mhp}`);
    room.send(C.CHAT, { m: '/gm killall' });
    await W(300);
    await room.leave(true);
  }

  // b) ?at lạ / sai kiểu không làm gì (và không làm sập room).
  for (const at of ['__proto__', 'khong_co', { x: 1 }, 'a'.repeat(5000)]) {
    let ok = false;
    try {
      const r = await new Client(WS).joinOrCreate(ROOM_WORLD, { dev: 'kiemthu_at', at });
      const init = await new Promise<InitMsg>((res) => r.onMessage(S.INIT, res));
      r.onMessage('*', () => {});
      await W(300);
      const p = (r.state as { players: Map<string, P> }).players.get(init.sid);
      ok = !!p && Number.isFinite(p.x);
      await r.leave(true);
    } catch {
      ok = true; // bị từ chối hẳn cũng được
    }
    check(`?at không hợp lệ bị bỏ qua (${JSON.stringify(at).slice(0, 20)})`, ok && (await health()));
  }

  // c) Server production / đã cấu hình Google (kể cả lỡ để AUTH_DEV_BYPASS=1): đăng nhập thử kèm ?god/?at
  //    và token giả kèm ?god/?at đều bị từ chối, không có đường tắt.
  //    Tài khoản Google thật xin ?god/?at bị bỏ qua: xem apps/server/src/testflags.test.ts (cần token thật mới chạy được ở đây).
  const envs: Record<string, string>[] = [
    { GOOGLE_CLIENT_ID: 'security-check.apps.googleusercontent.com' },
    { NODE_ENV: 'production', GOOGLE_CLIENT_ID: '' },
  ];
  for (const env of envs) {
    const tag = env.NODE_ENV ? 'NODE_ENV=production' : 'có GOOGLE_CLIENT_ID';
    await withServer(env, async (http) => {
      const ws = http.replace(/^http/, 'ws');
      for (const opts of [
        { dev: 'kiemthu', god: true, at: 'boss' },
        { token: 'a.b.c', god: true, at: 'boss' },
      ]) {
        let code: number | undefined;
        let joined = false;
        try {
          const r = await new Client(ws).joinOrCreate(ROOM_WORLD, opts);
          joined = true;
          await r.leave(true);
        } catch (e) {
          code = (e as { code?: number }).code;
        }
        check(`${tag}: ${opts.dev ? 'đăng nhập thử' : 'token giả'} kèm ?god/?at bị từ chối`, !joined, `mã ${code}`);
      }
    });
  }
}
