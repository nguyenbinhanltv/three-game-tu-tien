// Kịch bản một lần (KHÔNG commit): vì sao mỗi mesh Standard bị vẽ hai lần ('rt' và 'output' trong perf:iso passes)?
// Móc _renderObjectDirect: ghi theo đích vẽ (kích thước, số texture, tên) + 3 khung gọi gần nhất. Vân Lam (cảnh gốc), Cao.
import fs from 'node:fs';
import path from 'node:path';
import { createDevServer, sleep } from './lib/devserver';
import { ports, outDir } from './lib/env';
import { launchChrome } from './lib/browser';
import { openGame } from './lib/game';

const { port: PORT, clientPort: CLIENT_PORT } = ports(2695, 5195);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'drawpass', command: 'drawpass' });
const out = outDir('bench/results');

async function main() {
  fs.mkdirSync(out, { recursive: true });
  await dev.start();
  const browser = await launchChrome({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'], tag: 'drawpass' });
  try {
    const g = await openGame(browser, { clientPort: CLIENT_PORT, name: 'DrawP', seenIntro: true, quality: 'high' });
    await sleep(4000);
    const res = await g.page.evaluate(async () => {
      const r = (window as any).__game.renderer;
      const direct = Object.getPrototypeOf(r)._renderObjectDirect;
      const rows = new Map<string, { n: number; size: string; texs: number; names: string; stack: string }>();
      let on = false;
      const hook = function (this: any, object: any, material: any, ...rest: unknown[]) {
        if (on) {
          const rt = r.getRenderTarget();
          const texs = rt?.textures?.length ?? (rt ? 1 : 0);
          const names = rt?.textures ? rt.textures.map((t: any) => t.name || '·').join(',') : rt?.texture?.name || '';
          const key = `${rt ? `${rt.width}x${rt.height}` : 'screen'}|${texs}|${names}|${object.isSkinnedMesh ? 'skin' : object.isInstancedMesh ? 'inst' : 'mesh'}`;
          const stack = (new Error().stack ?? '').split('\n').slice(3, 8).map((s) => s.replace(/\(.*[\/]/, '(').trim()).join(' < ');
          const row = rows.get(key) ?? { n: 0, size: key, texs, names, stack };
          row.n++;
          rows.set(key, row);
        }
        return direct.call(this, object, material, ...rest);
      };
      r._handleObjectFunction = r._renderObjectDirect = hook;
      on = true;
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(null)))));
      on = false;
      return [...rows.values()];
    });
    console.log(JSON.stringify(res, null, 1));
    fs.writeFileSync(path.join(out, 'drawpass.json'), JSON.stringify(res, null, 1));
    await g.ctx.close();
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
