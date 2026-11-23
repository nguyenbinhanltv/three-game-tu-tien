// Chạy trọn quy trình một texture: ảnh nguồn → alpha → cân sáng → khử viền → lưới → (đóng kênh) → PNG/KTX2 + contact sheet + manifest.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { balance, defringe, detectGrid, extractAlpha, packChannels, parseGrid, stats, type AlphaMode, type Raster } from './forge.js';
import { contactSheet, encodeKtx2, findToktx, fitRaster, loadRaster, toPng, tmpDir } from './io.js';

/** Dòng ghi nguồn bắt buộc cho mọi texture vào repo. */
export const SOURCE_NOTE = 'Codex-generated, dự án sở hữu';

export interface ForgeOpts {
  id: string;
  /** Ảnh nguồn (PNG/JPG/WebP). */
  input: string;
  /** Thư mục ra của game (mặc định `apps/client/public/assets/vfx`). */
  outDir: string;
  /** Thư mục contact sheet (ngoài repo: ảnh duyệt để ở artifact phiên). */
  sheetDir?: string;
  mode?: AlphaMode;
  /** `color`: RGBA màu (sRGB); `packed`: R mặt nạ, G ăn mòn, B méo (tuyến tính). */
  pack?: 'color' | 'packed';
  /** `4x4`, `8x8`... hoặc `auto` (mặc định). */
  grid?: string;
  erode?: string;
  distort?: string;
  /** Cạnh dài tối đa (mặc định 1024). */
  max?: number;
  ktx?: boolean;
  /** Ghi mô tả/ý tưởng vào manifest. */
  note?: string;
}

export interface ManifestEntry {
  id: string;
  file: string;
  pack: 'color' | 'packed';
  grid: { cols: number; rows: number };
  size: [number, number];
  bytes: number;
  format: 'ktx2' | 'png';
  sha: string;
  source: string;
  note?: string;
}

export interface ForgeResult {
  entry: ManifestEntry;
  raster: Raster;
  warnings: string[];
}

export function manifestPath(outDir: string): string {
  return path.join(outDir, 'manifest.json');
}

export function readManifest(outDir: string): ManifestEntry[] {
  const f = manifestPath(outDir);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as ManifestEntry[]) : [];
}

export async function forge(o: ForgeOpts, root: string): Promise<ForgeResult> {
  if (!/^[a-z0-9_]+$/.test(o.id)) throw new Error(`id không hợp lệ: ${o.id}`);
  const warnings: string[] = [];
  const src = await loadRaster(o.input);
  let r = defringe(balance(extractAlpha(src, o.mode ?? 'auto')));
  const g = !o.grid || o.grid === 'auto' ? detectGrid(r) : { ...(parseGrid(o.grid) ?? { cols: 1, rows: 1 }), ratio: 0 };
  if (o.grid && o.grid !== 'auto' && !parseGrid(o.grid)) throw new Error(`lưới không hợp lệ: ${o.grid}`);
  const pack = o.pack ?? 'color';
  if (pack === 'packed') {
    const eroder: Raster | undefined = o.erode ? await loadRaster(o.erode) : undefined;
    const dist: Raster | undefined = o.distort ? await loadRaster(o.distort) : undefined;
    for (const x of [eroder, dist]) if (x && (x.w !== r.w || x.h !== r.h)) throw new Error('ảnh ăn mòn/méo phải cùng cỡ với ảnh nguồn');
    r = packChannels(r, { erode: eroder, distort: dist });
  }
  r = await fitRaster(r, o.max ?? 1024);
  const st = stats(r);
  if (pack === 'color' && st.cover > 0.9) warnings.push(`phủ ${(st.cover * 100).toFixed(0)}% khung: ảnh nền đen chưa tách được? Kiểm --mode`);
  if (g.cols * g.rows > 1 && (r.w % g.cols || r.h % g.rows)) warnings.push('cỡ ảnh không chia hết cho lưới');

  fs.mkdirSync(o.outDir, { recursive: true });
  const png = await toPng(r);
  const tmp = tmpDir();
  let format: 'ktx2' | 'png' = 'png';
  let file = `${o.id}.png`;
  try {
    const toktx = o.ktx === false ? null : findToktx(root);
    if (toktx) {
      const p = path.join(tmp, `${o.id}.png`);
      fs.writeFileSync(p, png);
      encodeKtx2(toktx, p, path.join(o.outDir, `${o.id}.ktx2`), pack === 'color');
      format = 'ktx2';
      file = `${o.id}.ktx2`;
      fs.rmSync(path.join(o.outDir, `${o.id}.png`), { force: true });
    } else {
      if (o.ktx !== false) warnings.push('không tìm thấy toktx: xuất PNG (cài KTX-Software hoặc đặt TOKTX, rồi chạy lại để ra KTX2 trước khi commit)');
      fs.writeFileSync(path.join(o.outDir, file), png);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const bytes = fs.statSync(path.join(o.outDir, file)).size;
  const sha = createHash('sha256').update(fs.readFileSync(path.join(o.outDir, file))).digest('hex').slice(0, 12);
  if (o.sheetDir) {
    fs.mkdirSync(o.sheetDir, { recursive: true });
    fs.writeFileSync(path.join(o.sheetDir, `${o.id}.contact.png`), await contactSheet(r, g));
  }
  const entry: ManifestEntry = {
    id: o.id,
    file,
    pack,
    grid: { cols: g.cols, rows: g.rows },
    size: [r.w, r.h],
    bytes,
    format,
    sha,
    source: SOURCE_NOTE,
    ...(o.note ? { note: o.note } : {}),
  };
  const all = readManifest(o.outDir).filter((e) => e.id !== o.id);
  all.push(entry);
  all.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(manifestPath(o.outDir), JSON.stringify(all, null, 2) + '\n');
  return { entry, raster: r, warnings };
}

/** Kiểm manifest: file tồn tại, có dòng nguồn, id hợp lệ, tổng dung lượng trong ngân sách. Trả danh sách lỗi. */
export function checkManifest(outDir: string, budgetBytes = 3 * 1024 * 1024): string[] {
  const errs: string[] = [];
  let total = 0;
  const seen = new Set<string>();
  for (const e of readManifest(outDir)) {
    if (seen.has(e.id)) errs.push(`vfx-forge: id trùng ${e.id}`);
    seen.add(e.id);
    if (!/^[a-z0-9_]+$/.test(e.id)) errs.push(`vfx-forge: id không hợp lệ ${e.id}`);
    if (e.source !== SOURCE_NOTE) errs.push(`vfx-forge: ${e.id} thiếu dòng nguồn "${SOURCE_NOTE}"`);
    const f = path.join(outDir, e.file);
    if (!fs.existsSync(f)) errs.push(`vfx-forge: thiếu file ${e.file}`);
    else {
      total += fs.statSync(f).size;
      if (e.format === 'png') errs.push(`vfx-forge: ${e.id} còn là PNG, cần KTX2 trước khi commit`);
    }
  }
  if (total > budgetBytes) errs.push(`vfx-forge: tổng texture VFX ${(total / 1048576).toFixed(2)} MB vượt ${(budgetBytes / 1048576).toFixed(1)} MB`);
  return errs;
}
