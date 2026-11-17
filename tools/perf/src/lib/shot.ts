// Chụp ảnh và ghép tờ ảnh (contact sheet) cho kịch bản.
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { env } from './env';
import { sleep } from './devserver';

export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ô vuông/chữ nhật quanh giữa màn hình (nhân vật luôn ở giữa vì camera bám theo). `top`: tỉ lệ chiều cao tính từ trên. */
export const centerClip = (vw: number, vh: number, width: number, height: number, top = 0.5 - height / (2 * vh)): Clip => ({ x: vw / 2 - width / 2, y: vh * top, width, height });

/** Thời gian chờ cảnh ổn định trước khi chụp cảnh rộng (ô địa hình, texture nạp lười); chỉnh bằng `SHOT_SETTLE`. */
export const settleMs = (): number => Number(env('SHOT_SETTLE', '2500'));

/** Chụp ra `<dir>/<name>` (đuôi `.jpg` → JPEG chất lượng 86, còn lại PNG), in tên file. */
export async function snap(page: Page, dir: string, name: string, o: { clip?: Clip; wait?: number } = {}): Promise<Buffer> {
  if (o.wait) await sleep(o.wait);
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = await page.screenshot({ path: file, clip: o.clip, ...(name.endsWith('.jpg') ? { type: 'jpeg' as const, quality: 86 } : {}) });
  console.log(`  ảnh ${name}`);
  return buf;
}

export interface SheetRow {
  label: string;
  /** Ảnh (Buffer JPEG/PNG) hoặc ô có chú thích riêng; `mark` viền đỏ (khung trúng đòn). */
  cells: (Buffer | { img: Buffer | string; caption?: string; mark?: boolean })[];
}

/** Ghép nhiều ảnh thành một tờ lưới (mỗi hàng một nhãn) bằng trang HTML phụ rồi chụp cả trang. `crop`: CSS cắt ảnh trong ô. */
export async function sheet(ctx: BrowserContext, file: string, rows: SheetRow[], o: { cell?: number; title?: string; ratio?: number; crop?: string } = {}): Promise<void> {
  const cell = o.cell ?? 240;
  const h = Math.round(cell * (o.ratio ?? 1));
  const src = (i: Buffer | string) => (typeof i === 'string' ? i : `data:image/${i[0] === 0xff ? 'jpeg' : 'png'};base64,${i.toString('base64')}`);
  const html =
    `<body style="margin:0;background:#161b21;color:#e7e3d8;font:12px system-ui">` +
    (o.title ? `<div style="padding:8px 12px;font-size:15px;color:#d8b36a">${o.title}</div>` : '') +
    rows
      .map((r) => {
        const cells = r.cells.map((c) => (Buffer.isBuffer(c) ? { img: c } : c));
        const figs = cells.map(
          (c) =>
            `<figure style="margin:2px;width:${cell}px"><div style="width:${cell}px;height:${h}px;overflow:hidden;${c.mark ? 'outline:3px solid #d85a46' : ''}">` +
            `<img src="${src(c.img)}" style="display:block;${o.crop ?? `width:${cell}px;height:${h}px;object-fit:contain`}"></div>${c.caption ? `<figcaption style="padding:2px 4px">${c.caption}</figcaption>` : ''}</figure>`,
        );
        return `${r.label ? `<div style="padding:4px 8px">${r.label}</div>` : ''}<div style="display:flex;align-items:flex-start">${figs.join('')}</div>`;
      })
      .join('') +
    `</body>`;
  const p = await ctx.newPage();
  await p.setViewportSize({ width: Math.max(...rows.map((r) => r.cells.length), 1) * (cell + 4) + 8, height: 600 });
  await p.setContent(html);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await p.screenshot({ path: file, fullPage: true, ...(file.endsWith('.jpg') ? { type: 'jpeg' as const, quality: 86 } : {}) });
  await p.close();
  console.log(`  tờ ảnh ${path.basename(file)}`);
}

export const writeJson = (dir: string, name: string, data: unknown): void => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));

/** Các cỡ màn hình chuẩn để kiểm UI (CLAUDE.md: phải vừa 1280×720 → 2560×1440). */
export const UI_SIZES: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '4k': [3840, 2160] };

/** Chụp cùng một cảnh ở nhiều cỡ màn hình rồi trả viewport về cỡ đầu. */
export async function snapSizes(page: Page, dir: string, stem: string, sizes: string[], wait = 1000): Promise<void> {
  for (const tag of sizes) {
    const [width, height] = UI_SIZES[tag] ?? UI_SIZES['1080p'];
    await page.setViewportSize({ width, height });
    await snap(page, dir, `${stem}-${tag}.jpg`, { wait });
  }
  const [width, height] = UI_SIZES[sizes[0]] ?? UI_SIZES['1080p'];
  await page.setViewportSize({ width, height });
}
