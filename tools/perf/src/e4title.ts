// Chụp nền màn tiêu đề (camera lượn quanh sơn môn) mỗi vài giây, để soi mặt trời/núi. Dùng kèm e4shots.
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createDevServer, sleep } from './devserver';

const OUT = path.resolve(process.argv[2] ?? 'shots');
const TAG = process.argv[3] ?? 'title';
const N = Number(process.argv[4] ?? 10);
const dev = createDevServer({ port: Number(process.env.PORT ?? 2586), clientPort: Number(process.env.CLIENT_PORT ?? 5187), tag: 'e4title', command: 'pnpm tsx src/e4title.ts' });
async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const args = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args }).catch(() => chromium.launch({ headless: true, args }));
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await page.goto(`http://localhost:${process.env.CLIENT_PORT ?? 5187}/?mute=1`, { waitUntil: 'load' });
    await sleep(8000);
    for (let i = 0; i < N; i++) {
      await page.screenshot({ path: path.join(OUT, `${TAG}-${String(i).padStart(2, '0')}.png`) });
      await sleep(3500);
    }
  } finally {
    await browser.close();
    dev.stop();
  }
}
main().catch((e) => { console.error(e); dev.stop(); process.exit(1); });
