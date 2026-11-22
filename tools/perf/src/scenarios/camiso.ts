// Thiên Nhãn P0: ảnh duyệt + số đo camera chéo (`?cam=iso`) so với camera cũ, cùng vị trí, preset Thấp/Cao, 720p/1080p.
// Ảnh: cũ vs iso, đánh quái (khung sau trúng đòn), trong/ngoài công trình (mái cổng tam quan), ngự kiếm.
import { FOREST, SPAWN_POINT } from '@dtl/shared';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, perfSample, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

const VIEWS: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };
const YAW = Math.PI * 0.25;
const POINTS = [
  { name: 'san', x: SPAWN_POINT.x, z: SPAWN_POINT.z },
  { name: 'cong-trong', x: 2048, z: 2128 },
  { name: 'cong-ngoai', x: 2048, z: 2150 },
];

interface IsoDbg {
  view: { monsters: Map<string, { x: number; z: number; st: number }> };
  renderPos: { x: number; z: number };
  useSkill(n: number): void;
  toggleFly(): void;
}

export default {
  name: 'camiso',
  desc: 'Thiên Nhãn P0: camera chéo ?cam=iso vs camera cũ (ảnh duyệt + draw call/tam giác/ms khung)',
  usage: '[--presets low,high] [--views 720p,1080p] [--cams old,iso]',
  async run(r) {
    const perf: Record<string, unknown> = {};
    for (const preset of list('--presets', 'low,high')) {
      for (const view of list('--views', '720p,1080p')) {
        for (const mode of list('--cams', 'old,iso')) {
          const iso = mode === 'iso';
          const { ctx, page } = await r.open({
            name: `Iso${preset[0]}${view[0]}${mode[0]}`,
            renderer: opt('--renderer', 'webgpu'),
            quality: preset,
            viewport: VIEWS[view]!,
            extra: [iso ? 'cam=iso' : '', opt('--query', '')].filter(Boolean).join('&'),
            seenIntro: true,
          });
          const stem = `${mode}-${preset}-${view}`;
          await gm(page, 'level 15');
          await gm(page, 'god on');
          // Vị trí đo: cùng điểm cho cả hai camera; camera cũ đặt cùng hướng nhìn.
          for (const p of POINTS) {
            await tp(page, p.x, p.z);
            await gm(page, 'killall', 1200);
            if (!iso) await cam(page, { yaw: YAW });
            await sleep(2500);
            await snap(page, r.out, `${stem}-${p.name}.png`);
            perf[`${stem}-${p.name}`] = await perfSample(page);
          }
          if (iso) {
            // Chuột phải: đi tới điểm cách tâm màn hình 200 px về phía phải-dưới; kiểm nhân vật thật sự di chuyển (ý định gửi như WASD).
            await tp(page, SPAWN_POINT.x, SPAWN_POINT.z);
            const [vw, vh] = VIEWS[view]!;
            const a = await page.evaluate(() => ({ ...(window.__game as unknown as IsoDbg).renderPos }));
            await page.mouse.move(vw / 2 + 200, vh / 2 + 120);
            await page.mouse.click(vw / 2 + 200, vh / 2 + 120, { button: 'right' });
            await sleep(1500);
            const b = await page.evaluate(() => ({ ...(window.__game as unknown as IsoDbg).renderPos }));
            console.log(`  chuột phải: đi ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)} m sau 1,5 s`);
            perf[`${stem}-rightclick-m`] = Math.hypot(b.x - a.x, b.z - a.z);
            await snap(page, r.out, `${stem}-chuotphai.png`);
          }
          // Cảnh đánh quái ở rừng: đứng cạnh quái, đặt con trỏ lên quái (iso), ra chiêu 1, chụp các khung sau trúng đòn.
          await tp(page, FOREST.x - 40, FOREST.z);
          await gm(page, 'god on');
          if (!iso) await cam(page, { yaw: YAW });
          await sleep(2500);
          const nearest = () =>
            page.evaluate(() => {
              const g = window.__game as unknown as IsoDbg;
              let best: { x: number; z: number } | null = null;
              let bd = 1e9;
              for (const m of g.view.monsters.values()) {
                if (m.st === 4) continue;
                const d = Math.hypot(m.x - g.renderPos.x, m.z - g.renderPos.z);
                if (d < bd) {
                  bd = d;
                  best = m;
                }
              }
              return best;
            });
          // Đưa người tới sát quái gần nhất (~5 m) để khung đánh thấy cả người lẫn mục tiêu, rồi lấy lại quái gần nhất.
          let mon = await nearest();
          if (mon) {
            await gm(page, `tp ${Math.round(mon.x - 5)} ${Math.round(mon.z)}`, 1500);
            mon = (await nearest()) ?? mon;
          }
          if (mon) {
            if (iso) {
              // Đặt con trỏ lên quái gần nhất: chiêu đơn phải tự khóa đúng quái đó.
              const sp = await page.evaluate((m) => {
                const g = window.__game as unknown as {
                  camera: { updateMatrixWorld(): void };
                  renderPos: { constructor: new (x: number, y: number, z: number) => { project(c: unknown): { x: number; y: number } } };
                };
                g.camera.updateMatrixWorld();
                const v = new g.renderPos.constructor(m.x, 1, m.z).project(g.camera);
                return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
              }, mon);
              await page.mouse.move(sp.x, sp.y);
              await sleep(300);
            }
            await page.evaluate(() => (window.__game as unknown as IsoDbg).useSkill(0));
            await sleep(30);
            await snap(page, r.out, `${stem}-danh-30ms.png`);
            await sleep(600);
            await snap(page, r.out, `${stem}-danh-600ms.png`);
            perf[`${stem}-danh`] = await perfSample(page);
          }
          // Ngự kiếm.
          await gm(page, 'killall', 1000);
          await page.evaluate(() => (window.__game as unknown as IsoDbg).toggleFly());
          await page.keyboard.down('Space');
          await sleep(1200);
          await page.keyboard.up('Space');
          await snap(page, r.out, `${stem}-ngukiem.png`, { wait: 1200 });
          await ctx.close();
        }
      }
    }
    writeJson(r.out, 'perf.json', perf);
  },
} satisfies Scenario;
