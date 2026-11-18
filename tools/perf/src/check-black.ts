// Kiểm cảnh 3D không đen (lỗi "màn hình đen, HUD vẫn chạy"): mở game đang chạy, chụp, đo độ sáng trung bình vùng giữa màn hình.
//   tsx src/check-black.ts <webgpu|webgl2> <tên> <cổng client> <ảnh.png> [query thêm, vd at=2048,2088]   (thoát 1 nếu quá tối)
// Cần server dev đang chạy (PORT/CLIENT_PORT riêng của worktree). Tắt tiếng bằng ?mute=1 và --mute-audio.
import { gameUrl, launchChrome } from './lib/browser';
const [, , renderer = 'webgpu', name = 'Repro1', port = '5134', out = 'out.png', extra = ''] = process.argv;
const b = await launchChrome();
const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 500)));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type().toUpperCase(), m.text().slice(0, 500)));
await page.goto(gameUrl(Number(port), { debug: 1, auto: name }, { renderer, extra }));
await new Promise((r) => setTimeout(r, 20000));
console.log(
  JSON.stringify(
    await page.evaluate(() => {
      return window.__game?.info?.();
    }),
  ),
);
console.log(
  JSON.stringify(
    await page.evaluate(async () => {
      const a = await (navigator as any).gpu?.requestAdapter?.();
      return a ? { info: a.info && { v: a.info.vendor, a: a.info.architecture, d: a.info.description } } : 'no adapter';
    }),
  ),
);
const buf = await page.screenshot({ path: out });
const lum = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  const d = x.getImageData(img.width * 0.2, img.height * 0.2, img.width * 0.6, img.height * 0.6).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return sum / (d.length / 4);
}, buf.toString('base64'));
console.log('luminance', lum.toFixed(1));
if (lum < 25) {
  console.error('CẢNH ĐEN');
  process.exitCode = 1;
}
await b.close();
