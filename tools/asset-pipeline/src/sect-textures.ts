// Tải bộ texture PBR 2K CC0 (Poly Haven) cho kiến trúc và đảo nổi của Lạc Kiếm Tông (MAP-1 bản B tả thực).
//   tsx src/sect-textures.ts [id ...]       (lệnh gốc repo: pnpm assets:sect-textures)
// Nguồn lớn (JPG 2K gốc: Diffuse, nor_gl, Rough) để ở ../dtl-asset-source/texture/<id>/<id>_<Loại>_2k.jpg (ngoài repo);
// script Blender `tools/blender/thien_cong_kit.py` đọc từ đó và nướng vào `arch_sect.glb`, `pnpm assets:sect-sky` (bước dựng texture đảo) ghi `public/sky/`.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';

/** id Poly Haven → tác giả (ghi ở assets/LICENSES.md). */
export const SECT_TEXTURES = {
  marble_rock_01: 'Amal Kumar',
  japanese_stone_wall: 'Rico Cilliers, Charlotte Baglioni, Dario Barresi',
  plastered_stone_wall: 'Rob Tuytel',
  ceramic_roof_01: 'Rob Tuytel',
  lacquered_cherry_wood: 'Jenelle van Heerden, Rico Cilliers',
  dark_wood: 'Dario Barresi, Dimitrios Savva, Rico Cilliers',
  cliff_side: 'James Ray Cock, Jenelle van Heerden, Dario Barresi',
} as const;

const SRC = process.env.DTL_ASSET_SOURCE
  ? path.resolve(process.env.DTL_ASSET_SOURCE, 'texture')
  : path.resolve(ROOT, '..', 'dtl-asset-source', 'texture');

async function fetchBuf(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  for (const ph of ids.length ? ids : Object.keys(SECT_TEXTURES)) {
    const files = (await (await fetch(`https://api.polyhaven.com/files/${ph}`)).json()) as Record<
      string,
      Record<string, Record<string, { url: string }>>
    >;
    for (const kind of ['Diffuse', 'nor_gl', 'Rough'] as const) {
      const f = path.join(SRC, ph, `${ph}_${kind}_2k.jpg`);
      if (existsSync(f)) continue;
      const entry = files[kind]?.['2k']?.jpg;
      if (!entry) {
        console.warn(`[sect-textures] ${ph}: thiếu ${kind} 2k`);
        continue;
      }
      await mkdir(path.dirname(f), { recursive: true });
      await writeFile(f, await fetchBuf(entry.url));
      console.log(`[sect-textures] ${ph}/${kind} 2k`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
