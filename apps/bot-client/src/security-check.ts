// Kiểm tra hồi quy các lỗ hổng đã vá (soát netcode 2026-11-12).
// Chạy khi server dev đang bật với AUTH_DEV_BYPASS=1:  pnpm --filter @dtl/bot-client security
// Server khác cổng: thêm đối số http://localhost:2597, hoặc đặt SERVER_URL / PORT.
// Server KHÔNG được bật RATE_LIMIT_EXEMPT (bài 11 kiểm giới hạn /matchmake). Bài 11 làm cạn xô
// của IP này, chạy lại cả bộ sau khoảng 1 phút.

import { C } from '@dtl/shared';
import { runHttp } from './security/http';
import { runTransfer } from './security/transfer';
import { runMovement } from './security/movement';
import { runRealm } from './security/realm';
import { runGear } from './security/gear';
import { runParty } from './security/party';
import { runDashaoi } from './security/dashaoi';
import { runMisc } from './security/misc';
import { runTeleport } from './security/teleport';
import { runBag } from './security/bag';
import { runWardrobe } from './security/wardrobe';
import { runRatelimit } from './security/ratelimit';
import { testParamsChecks } from './security/testparams';
import { type Ctx, join, M, P, stats, W } from './security/lib';

async function main() {
  // SECURITY_ONLY=testparams: chỉ chạy bài ?god/?at (bài 13) để thử lại nhanh.
  if (process.env.SECURITY_ONLY === 'testparams') {
    await testParamsChecks();
    console.log(stats.failed ? `${stats.failed} mục HỎNG` : 'Tất cả đều ĐẠT');
    process.exit(stats.failed ? 1 : 0);
  }
  // SECURITY_ONLY=wardrobe: chỉ chạy bài Tủ ngoại trang (P4-4).
  if (process.env.SECURITY_ONLY === 'wardrobe') {
    await runWardrobe();
    console.log(stats.failed ? `${stats.failed} mục HỎNG` : 'Tất cả đều ĐẠT');
    process.exit(stats.failed ? 1 : 0);
  }
  await runHttp();
  const { client, room, init } = await join('kiemthu');
  const me = () => (room.state as { players: Map<string, P> }).players.get(init.sid)!;
  const mons = () => (room.state as { monsters: Map<string, M> }).monsters;
  const gm = async (cmd: string) => {
    room.send(C.CHAT, { m: '/gm ' + cmd });
    await W(900);
  };
  await W(500);

  const ctx: Ctx = { client, room, init, me, mons, gm };
  await runTransfer(ctx);
  await runMovement(ctx);
  await runRealm(ctx);
  await runGear(ctx);
  await runParty(ctx);
  await runDashaoi(ctx);
  await runMisc(ctx);
  await runTeleport(ctx);
  await runBag(ctx);
  await runWardrobe(ctx);
  await runRatelimit(ctx);
  console.log(stats.failed ? `\n${stats.failed} mục HỎNG` : '\nTất cả đều ĐẠT');
  process.exit(stats.failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
