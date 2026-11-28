// Dạ Họa: đo độ đọc CHỮ SÁT THƯƠNG trên bản đồ thật. Mỗi địa điểm (`--at tong_mon,rung,ho`): dịch chuyển, bắn chùm số (`labNumbers('mix')`), chụp,
// rồi đặt chữ thành trong suốt và chụp lại để lấy NỀN dưới từng con số; tương phản WCAG giữa màu chữ và nền (phân vị 10% và giữa) cho từng cấp đòn.
//   pnpm shots danum --out <thư mục> [--query style=dahoa] [--at tong_mon,rung,ho]
import path from 'node:path';
import sharp from 'sharp';
import { opt } from '../lib/env';
import { gm, skipCutscene } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { sleep } from '../lib/devserver';
import { writeJson } from '../lib/shot';

const lin = (c: number): number => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

type Box = { cls: string; x: number; y: number; w: number; h: number; c: number[] };

export default {
  name: 'danum',
  desc: 'Dạ Họa: tương phản chữ sát thương với nền thật ở các địa điểm trên bản đồ',
  usage: '[--query style=dahoa] [--at tong_mon,rung,ho]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const at = opt('--at', 'tong_mon,rung,ho').split(',').filter(Boolean);
    const { page: pg } = await r.open({
      name: 'DaNum',
      quality: 'high',
      viewport: [1280, 720],
      query: { cam: 'iso', quiet: 1 },
      extra: opt('--query', 'style=dahoa'),
      seenIntro: true,
    });
    await skipCutscene(pg, 20);
    await gm(pg, 'level 15');
    await gm(pg, 'god on');
    const all: Record<string, unknown>[] = [];
    for (const place of at) {
      await gm(pg, `tp ${place}`, 3500);
      await skipCutscene(pg, 12);
      await gm(pg, 'killall', 1200);
      await sleep(1500);
      await pg.evaluate(() => {
        const g = window.__game!;
        g.labNumbers('mix', 14, 0);
        g.labNumbers('hurt', 3, 0);
        g.labNumbers('heal', 3, 0);
      });
      await sleep(250);
      const boxes = (await pg.evaluate(`(() => [...document.querySelectorAll('.dmg-layer .dmg')].map((e) => {
        var r = e.getBoundingClientRect(), cs = getComputedStyle(e), m = cs.color.match(/[\d.]+/g) || ['255','255','255'];
        return { cls: e.className.replace('dmg', '').trim() || 'hit', x: r.left, y: r.top, w: r.width, h: r.height, c: [Number(m[0]), Number(m[1]), Number(m[2]), m.length > 3 ? Number(m[3]) : 1] };
      }).filter((b) => b.w > 4 && b.h > 4))()`)) as Box[];
      await pg.screenshot({ path: path.join(r.out, `danum-${place}.png`) });
      const st = await pg.addStyleTag({ content: '.dmg-layer .dmg { color: transparent !important; text-shadow: none !important; -webkit-text-stroke-color: transparent !important; }' });
      await sleep(120);
      const bg = await pg.screenshot();
      await st.evaluate((e) => (e as HTMLElement).remove());
      const { data, info } = await sharp(bg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const per = new Map<string, number[]>();
      for (const b of boxes) {
        const x0 = Math.max(0, Math.floor(b.x));
        const y0 = Math.max(0, Math.floor(b.y));
        const x1 = Math.min(info.width, Math.ceil(b.x + b.w));
        const y1 = Math.min(info.height, Math.ceil(b.y + b.h));
        const arr = per.get(b.cls) ?? [];
        for (let y = y0; y < y1; y += 2)
          for (let x = x0; x < x1; x += 2) {
            const i = (y * info.width + x) * 3;
            const a = b.c[3]!;
            const fg = lum(b.c[0]! * a + data[i]! * (1 - a), b.c[1]! * a + data[i + 1]! * (1 - a), b.c[2]! * a + data[i + 2]! * (1 - a));
            arr.push(contrast(fg, lum(data[i]!, data[i + 1]!, data[i + 2]!)));
          }
        per.set(b.cls, arr);
      }
      for (const [cls, arr] of per) {
        arr.sort((p, q) => p - q);
        const row = { place, cls, n: arr.length, p10: Math.round(arr[Math.floor(arr.length * 0.1)]! * 100) / 100, median: Math.round(arr[Math.floor(arr.length * 0.5)]! * 100) / 100 };
        all.push(row);
        console.log(`  ${place.padEnd(10)} ${cls.padEnd(14)} p10 ${row.p10} · giữa ${row.median} (${arr.length} mẫu)`);
      }
      await sleep(2500);
    }
    writeJson(r.out, 'danum.json', { rows: all });
  },
} satisfies Scenario;
