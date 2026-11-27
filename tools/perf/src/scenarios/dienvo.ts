// Diễn Võ Trường (phòng tập GM): vào bằng `/gm dvt`, dựng nhân vật một nút, gọi quái, đóng băng và ép trạng thái rồi chụp.
// Đây là kịch bản gốc cho "bộ ảnh chuẩn" của phòng (V1 sẽ mở rộng thành nhiều cảnh mẫu).
//   pnpm shots dienvo --out <thư mục> [--view 720p|1080p] [--tag sau|truoc] [--query style=dahoa] [--mon mon_soi_xam] [--n 3] [--method lac_kiem_quyet]
import { num, opt } from '../lib/env';
import { cam, gm, perfSample, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

export default {
  name: 'dienvo',
  desc: 'Diễn Võ Trường: vào phòng tập, dựng nhân vật, gọi quái, ép trạng thái (thường / lộ yếu điểm / vỡ thế), chụp + đo',
  usage: '[--view 720p|1080p] [--tag sau] [--query style=dahoa] [--mon <id quái>] [--n 3] [--method <id công pháp>]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const view = opt('--view', '720p');
    const tag = opt('--tag', 'sau');
    const mon = opt('--mon', 'mon_soi_xam');
    const n = num('--n', 3);
    const { page } = await r.open({
      name: 'DienVo',
      quality: 'high',
      viewport: view === '1080p' ? [1920, 1080] : [1280, 720],
      query: { cam: 'iso', quiet: 1 },
      extra: opt('--query', ''),
      seenIntro: true,
      hide: 'chat',
    });
    await skipCutscene(page, 20);
    await gm(page, 'dvt');
    await waitLevel(page, 'dien_vo');
    await gm(page, `build ${opt('--method', 'lac_kiem_quyet')} 30`);
    await gm(page, 'god on', 900);
    await gm(page, 'freeze on', 900);
    await gm(page, 'lockhp on', 900);
    const log: Record<string, unknown> = { view, mon, n };
    const base = `${tag}-${view}`;
    await snap(page, r.out, `${base}-1-phong-trong.png`, { wait: 1200 });
    await gm(page, `spawn ${mon} ${n}`, 3500);
    await snap(page, r.out, `${base}-2-quai-thuong.png`, { wait: 800 });
    log.perf = await perfSample(page);
    await gm(page, 'state weak 60', 1500);
    await snap(page, r.out, `${base}-3-lo-yeu-diem.png`, { wait: 600 });
    await gm(page, 'state clear', 900);
    await gm(page, 'state break 60', 1500);
    await snap(page, r.out, `${base}-4-vo-the.png`, { wait: 600 });
    await cam(page, { pitch: 0.9, dist: 9 });
    await snap(page, r.out, `${base}-5-can-canh.png`, { wait: 800 });
    await gm(page, 'labreset', 1500);
    await gm(page, 'dvt');
    await waitLevel(page, 'van_lam');
    log.back = await page.evaluate(() => window.__game!.info());
    writeJson(r.out, `${base}-dienvo.json`, log);
  },
} satisfies Scenario;
