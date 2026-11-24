// Chụp painted-valley (tham chiếu) ở cảnh cô lập: chỉ cánh đồng (đất + lá + hoa), giờ cố định, thời gian đóng băng, camera chéo
// 52° / 20 m / FOV 32° như game. Ghi ref.png + ref.json (uniform ánh sáng, camera, thời gian) vào thư mục --out.
//   node tools/painted-compare/ref-capture.mjs --out <thư mục> [--hour 15.5] [--at u,v] [--size 1920x1080] [--paint 3] [--url http://127.0.0.1:5384]
// Cần painted-valley chạy sẵn (cd painted-valley && npm run dev, cổng 5384). Ảnh/JSON ra KHÔNG commit (để ở artifact phiên).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../perf/package.json', import.meta.url));
const { chromium } = require('playwright');

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const out = path.resolve(arg('--out', 'painted-ref'));
const hour = Number(arg('--hour', '15.5'));
const [u, v] = arg('--at', '60,10').split(',').map(Number);
const [W, H] = arg('--size', '1920x1080').split('x').map(Number);
const paint = arg('--paint', '3');
const url = arg('--url', 'http://127.0.0.1:5384');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'] }).catch(() => chromium.launch({ headless: true, args: ['--mute-audio'] }));
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${url}/?quality=high&dpr=1&drift=0&mute=1&paint=${paint}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 240000 });
const info = await page.evaluate(
  async ([hour, u, v]) => {
    const tg = window.__tg;
    const { scene, field, frame, camera, THREE } = tg;
    // chỉ cánh đồng
    for (const c of scene.children) if (c !== field.group) c.visible = false;
    tg.setHour(hour);
    const pitch = (52 * Math.PI) / 180;
    const [tx, tz] = tg.fromValley(u, v);
    const [fx, fz] = [0.6, 0.8];
    const cx = tx - fx * Math.cos(pitch) * 20;
    const cz = tz - fz * Math.cos(pitch) * 20;
    const gT = field.heightAt(tx, tz);
    const gC = field.heightAt(cx, cz);
    tg.view = { x: cx, z: cz, y: gT + 1 + Math.sin(pitch) * 20 - gC, yaw: Math.atan2(-fx, -fz), pitch: -pitch, fov: 32 };
    // cho vòng lặp chạy vài khung để camera/ô lá/đất vào chỗ, rồi đóng băng thời gian và dừng cập nhật
    await new Promise((r) => setTimeout(r, 4000));
    field.update(0, camera);
    const U = field.uniforms;
    U.uTime.value = 100;
    U.uWindScroll.value.set(40, 25);
    field.update = () => {};
    camera.updateMatrixWorld();
    const c3 = (x) => [x.r, x.g, x.b];
    return {
      hour,
      at: [u, v],
      target: [tx, gT, tz],
      camera: { position: camera.position.toArray(), rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z], fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far },
      uTime: U.uTime.value,
      uWind: U.uWind.value.toArray(),
      uWindScroll: U.uWindScroll.value.toArray(),
      uSunDir: U.uSunDir.value.toArray(),
      uSunColor: c3(U.uSunColor.value),
      uSkyColor: c3(U.uSkyColor.value),
      uBounceColor: c3(U.uBounceColor.value),
      uFogColor: c3(U.uFogColor.value),
      uFogSunColor: c3(U.uFogSunColor.value),
      uFogDensity: U.uFogDensity.value,
      uCloudShade: U.uCloudShade.value,
      uFire: c3(U.uFireColor.value),
      uHeroEye: U.uHeroEye.value.toArray(),
      uFloor: U.uFloor.value.toArray(),
      uFloorInv: U.uFloorInv.value,
      extentMin: U.uExtentMin.value.toArray(),
      extentInv: U.uExtentInv.value,
      heightRes: U.uHeightRes.value,
      exposure: frame.exposure,
      bloom: frame.bloom,
      paint: frame.paint,
    };
  },
  [hour, u, v],
);
await page.addStyleTag({ content: 'body > *:not(canvas){display:none !important}' });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(out, 'ref.png') });
fs.writeFileSync(path.join(out, 'ref.json'), JSON.stringify(info, null, 2));
console.log('ok', path.join(out, 'ref.png'));
await browser.close();
