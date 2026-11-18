// Bài kiểm tra bảo mật: Giới hạn tần suất /matchmake theo IP (chạy cuối: làm cạn xô của IP) (R-7, tách từ security-check.ts).
import { Client } from 'colyseus.js';
import { ROOM_WORLD } from '@dtl/shared';
import { HTTP, WS, check, health, join, type Ctx } from './lib';

export async function runRatelimit(ctx: Ctx): Promise<void> {
  const { client } = ctx;
  // 11. Giới hạn tần suất /matchmake theo IP (đặt cuối: làm cạn xô của IP này; chạy lại sau ~1 phút).
  //     Mỗi request mang X-Forwarded-For khác nhau: khi chưa bật TRUST_PROXY thì không lách được.
  {
    let limited: Response | null = null;
    let sent = 0;
    for (let batch = 0; batch < 10 && !limited; batch++) {
      const rs = await Promise.all(
        Array.from({ length: 20 }, () =>
          fetch(HTTP + '/matchmake/joinOrCreate/world', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${1 + (sent++ % 250)}` },
            body: '{}',
          }),
        ),
      );
      for (const r of rs) {
        if (r.status === 429 && !limited) limited = r;
        else await r.arrayBuffer();
      }
    }
    const body = limited ? ((await limited.json()) as { code?: number; error?: string }) : null;
    check(
      '/matchmake dồn dập bị chặn 429 (X-Forwarded-For giả không lách được)',
      !!limited && body?.code === 429 && Number(limited.headers.get('retry-after')) > 0,
      limited ? `sau ${sent} request, Retry-After ${limited.headers.get('retry-after')}s` : `${sent} request không bị chặn — server đang bật RATE_LIMIT_EXEMPT/TRUST_PROXY hoặc RATE_LIMIT_BURST<=0?`,
    );
    // Bị chặn rồi thì join qua colyseus.js báo lỗi 429 thay vì treo.
    let code: number | undefined;
    try {
      const r = await new Client(WS).joinOrCreate(ROOM_WORLD, { dev: 'kiemthu' });
      await r.leave(true);
    } catch (e) {
      code = (e as { code?: number }).code;
    }
    check('client nhận mã 429 khi bị giới hạn', code === 429, `mã ${code}`);
    check('/health không bị giới hạn', await health());
  }

  check('server vẫn sống sau toàn bộ bài kiểm tra', await health());
}
