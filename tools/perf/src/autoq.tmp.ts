// Kịch bản một lần (KHÔNG commit): kiểm #672 tự hạ preset trong trình duyệt. Hai pha: (A) không throttle, 45 s: preset phải giữ nguyên;
// (B) CPU throttle N lần: preset Vừa phải tự hạ xuống Thấp có toast. Không đặt khóa preset.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { createDevServer, sleep } from './lib/devserver';
import { opt, ports, outDir } from './lib/env';
import { launchChrome } from './lib/browser';
import { openGame } from './lib/game';

const { port: PORT, clientPort: CLIENT_PORT } = ports(2695, 5195);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'autoq', command: 'autoq' });
const out = outDir('bench/results');
const THROTTLE = Number(opt('--throttle', '12'));

const state = (page: Page) =>
  page.evaluate(() => ({
    q: localStorage.getItem('dtl.quality'),
    lock: localStorage.getItem('dtl.qualityLock'),
    toast: document.body.innerText.includes('tự hạ xuống'),
  }));

async function phase(browser: Awaited<ReturnType<typeof launchChrome>>, label: string, throttle: number, maxS: number): Promise<{ downgraded: boolean; atS: number; q: string | null }> {
  const g = await openGame(browser, { clientPort: CLIENT_PORT, name: 'AutoQ', seenIntro: true, store: { 'dtl.quality': 'medium' }, warnings: /models/ });
  if (throttle > 1) await (await g.ctx.newCDPSession(g.page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const t0 = Date.now();
  let res = { downgraded: false, atS: -1, q: 'medium' as string | null };
  while ((Date.now() - t0) / 1000 < maxS) {
    await sleep(2000);
    const s = await state(g.page);
    if (s.q !== 'medium') {
      res = { downgraded: true, atS: Math.round((Date.now() - t0) / 1000), q: s.q };
      await sleep(800);
      await g.page.screenshot({ path: path.join(out, `autoq-${label}.png`) });
      console.log(`[autoq] ${label}: hạ xuống ${s.q} sau ${res.atS} s, toast=${s.toast}, lock=${s.lock}`);
      break;
    }
  }
  if (!res.downgraded) console.log(`[autoq] ${label}: giữ nguyên Vừa sau ${maxS} s`);
  await g.ctx.close();
  return res;
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  await dev.start();
  const browser = await launchChrome({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'], tag: 'autoq' });
  try {
    const a = await phase(browser, 'khong-throttle', 1, 45);
    const b = await phase(browser, `throttle${THROTTLE}`, THROTTLE, 120);
    fs.writeFileSync(path.join(out, 'autoq.json'), JSON.stringify({ a, b, throttle: THROTTLE }, null, 1));
    console.log(`[autoq] kết quả: A(không throttle) hạ=${a.downgraded}; B(throttle ${THROTTLE}×) hạ=${b.downgraded}`);
  } finally {
    await browser.close();
    dev.stop();
  }
}
main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exitCode = 1;
});
