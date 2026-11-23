// pnpm bench:aoi (Chân Cảnh O5): băng thông server → client với N bot (mặc định 100) chung một kênh, để so AOI trước/sau.
// Chạy server game riêng (DB tạm, MAX_CLIENTS=128, RATE_LIMIT_EXEMPT=loopback), N bot `apps/bot-client` (mặc định đi săn rải khắp bản đồ),
// chờ `--warm` giây rồi lấy mẫu dòng "nhận X KB/s mỗi bot" (10 s một dòng) và tick p95 của room trong `--seconds` giây.
//   pnpm bench:aoi [--count 100] [--warm 40] [--seconds 90] [--botargs "--level 15 --tp"] [--out bench/results] [--label tên]
// Ra: aoi-<nhãn|ngày>.json (KB/s mỗi bot: trung vị/p95/trung bình; tick p95 lớn nhất). Cổng 2715/5215 (PORT/CLIENT_PORT đổi được).
import fs from 'node:fs';
import path from 'node:path';
import { createDevServer, sleep } from './lib/devserver';
import { Bots } from './lib/bots';
import { num, opt, outDir, ports } from './lib/env';
import { quant, round } from './lib/isoreport';
import { parseBotLines } from './lib/aoiparse';

const COUNT = num('--count', 100);
const WARM = num('--warm', 40);
const SECONDS = num('--seconds', 90);
const BOT_ARGS = opt('--botargs', '--level 15').split(/\s+/).filter(Boolean);
const LABEL = opt('--label', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
const { port } = ports(2715, 5215);

async function main(): Promise<void> {
  const dev = createDevServer({
    port,
    clientPort: ports(2715, 5215).clientPort,
    tag: 'aoi',
    command: 'pnpm bench:aoi',
    serverOnly: true,
    env: { RATE_LIMIT_EXEMPT: 'loopback', MAX_CLIENTS: '128' },
  });
  const bots = new Bots(port);
  try {
    await dev.start();
    const n = await bots.start(COUNT, 'aoi', BOT_ARGS);
    console.log(`[aoi] ${n} bot đã vào, chờ ${WARM} s rồi đo ${SECONDS} s`);
    await sleep(WARM * 1000);
    const from = bots.out.length;
    await sleep(SECONDS * 1000);
    const { kbps, tick } = parseBotLines(bots.out.slice(from));
    const s = [...kbps].sort((a, b) => a - b);
    const res = {
      label: LABEL,
      bots: n,
      samples: s.length,
      kbpsPerBot: {
        p50: round(quant(s, 0.5)),
        p95: round(quant(s, 0.95)),
        mean: round(s.reduce((a, v) => a + v, 0) / Math.max(1, s.length)),
      },
      tickP95MaxMs: tick.length ? Math.max(...tick) : null,
      refIdLines: bots.out.filter((l) => /refId/.test(l)).length,
    };
    console.log(JSON.stringify(res, null, 1));
    const dir = outDir('bench/results');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `aoi-${LABEL}.json`), JSON.stringify(res, null, 1));
  } finally {
    await bots.stop();
    dev.stop();
  }
}

main().catch((e) => {
  console.error('[aoi] lỗi:', e instanceof Error ? (e.stack ?? e.message) : e);
  process.exitCode = 1;
});
