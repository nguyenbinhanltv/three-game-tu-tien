// Bài kiểm tra bảo mật: Tham số kiểm thử ?god/?at và thân /matchmake quá lớn (R-7, tách từ security-check.ts).

import { testParamsChecks } from './testparams';
import { HTTP, check, type Ctx } from './lib';

export async function runMisc(_ctx: Ctx): Promise<void> {
  // 13. Tham số kiểm thử ?god / ?at (M1-10): tài khoản thử dùng được; server production / có Google thì không.
  await testParamsChecks();

  // 12. Thân request /matchmake quá lớn bị từ chối (Colyseus gom cả thân vào bộ nhớ).
  {
    const r = await fetch(HTTP + '/matchmake/joinOrCreate/world', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dev: 'x'.repeat(64 * 1024) }),
    });
    await r.arrayBuffer();
    check('thân /matchmake quá lớn bị từ chối 413', r.status === 413, `HTTP ${r.status}`);
  }
}
