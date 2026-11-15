// Bước 1 của pipeline asset: sinh GLB thô vào assets/build/raw/<asset_id>.glb bằng Blender (không mở giao diện).
// Bước tối ưu nằm ở tools/asset-pipeline (optimize.ts).
// Lệnh tổng: pnpm assets:build (gọi file này rồi optimize). Chạy riêng: node tools/blender/run.mjs [--only <id>] [--force]
//
// Hai loại job:
//   - script thủ tục (danh sách `procedural` bên dưới): script bpy dựng asset từ đầu, hoặc xử lý riêng một file trong
//     DTL_ASSET_SOURCE (trường `source`, truyền cho script qua `--src`; thiếu file thì bỏ qua job, có cảnh báo).
//   - nhập Tripo: mọi assets/source/<loại>/<id>/meta.json có khối "import" (kind "tripo") → tools/blender/import_tripo.py
//     đọc GLB gốc ở DTL_ASSET_SOURCE (../dtl-asset-source). Máy không có thư mục nguồn thì bỏ qua job, có cảnh báo,
//     và giữ GLB build đã commit.
// Bỏ qua job khi GLB thô mới hơn mọi file nó phụ thuộc (script, meta.json, budgets.json, GLB nguồn): cache theo mtime.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAssetSource, findBlender, runBlender } from './find-blender.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rawDir = path.join(root, 'assets/build/raw');
const sourceDir = path.join(root, 'assets/source');
const budgetsFile = path.join(root, 'assets/budgets.json');
const importScript = path.join(root, 'tools/blender/import_tripo.py');
/** Helper ghép clip dùng chung của các script import.post (nạp bằng runpy). */
const clipsHelper = path.join(root, 'tools/blender/tripo_clips.py');
/** Phần phụ nhân vật người (kiếm rút/tra, vá lưng, lò xo vạt áo), anim_biped_extra.py nạp bằng runpy. */
const partsHelper = path.join(root, 'tools/blender/biped_parts.py');

/**
 * id: asset id (tên file trong assets/build/raw/).
 * legacy: bản chép thêm của GLB thô. Client đã nạp arch_sect qua manifest (M2-8); bản này chỉ còn làm đầu vào
 *         cho test pipeline (tools/asset-pipeline/test), bỏ khi test có fixture riêng.
 * source: đường dẫn tương đối trong DTL_ASSET_SOURCE, truyền cho script qua `--src`.
 */
const procedural = [
  { id: 'arch_sect', script: 'tools/blender/build_sect.py', legacy: 'apps/client/public/assets/sect.glb' },
  // Lưới Tripo v02 (task 70d2072c), tô màu theo vùng bằng script vì texture Tripo mất màu (M0-3).
  { id: 'prop_phi_kiem', script: 'tools/blender/recolor_phi_kiem.py', source: 'prop/prop_phi_kiem/tripo/raw_v02.glb' },
];

/** @typedef {{ id: string, script: string, args: string[], deps: string[], legacy?: string }} Job */

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const force = argv.includes('--force');
const out = (id) => path.join(rawDir, `${id}.glb`);
/** @type {string | null | undefined} */
let assetSource;
const sourceRoot = () => (assetSource === undefined ? (assetSource = findAssetSource(root)) : assetSource);

/** @returns {Job[]} */
function proceduralJobs() {
  const jobs = [];
  for (const j of procedural.filter((p) => !only || p.id === only)) {
    const deps = [path.join(root, j.script)];
    const args = [out(j.id)];
    if (j.source) {
      const src = sourceRoot() ? path.join(sourceRoot(), j.source) : null;
      if (!src || !fs.existsSync(src)) {
        console.warn(
          `[blender] CẢNH BÁO: bỏ qua ${j.id}, không có file nguồn ${src ?? j.source} (đặt DTL_ASSET_SOURCE nếu thư mục nguồn ở chỗ khác); giữ GLB build đã commit.`,
        );
        continue;
      }
      deps.push(src);
      args.push('--src', src);
    }
    jobs.push({ ...j, args, deps });
  }
  return jobs;
}

/** @returns {Job[]} */
function tripoJobs() {
  if (!fs.existsSync(sourceDir)) return [];
  const metas = [];
  for (const type of fs.readdirSync(sourceDir).sort()) {
    const dir = path.join(sourceDir, type);
    if (type.startsWith('_') || !fs.statSync(dir).isDirectory()) continue;
    for (const id of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, id, 'meta.json');
      if (fs.existsSync(file)) metas.push({ file, data: JSON.parse(fs.readFileSync(file, 'utf8')) });
    }
  }
  const wanted = metas.filter((m) => m.data.import?.kind === 'tripo' && (!only || m.data.id === only));
  if (wanted.length === 0) return [];
  const src = sourceRoot();
  if (!src) {
    console.warn(
      `[blender] CẢNH BÁO: không tìm thấy thư mục nguồn asset (DTL_ASSET_SOURCE hoặc ../dtl-asset-source), bỏ qua ${wanted.length} job nhập Tripo; giữ GLB build đã commit.`,
    );
    return [];
  }
  const jobs = [];
  for (const m of wanted) {
    const glb = path.join(src, m.data.import.source);
    if (!fs.existsSync(glb)) {
      console.warn(`[blender] CẢNH BÁO: ${m.data.id}: thiếu GLB nguồn ${glb}, bỏ qua.`);
      continue;
    }
    const clips = (m.data.import.clips ?? []).map((c) => path.join(src, c.source));
    const missingClip = clips.find((c) => !fs.existsSync(c));
    if (missingClip) {
      console.warn(`[blender] CẢNH BÁO: ${m.data.id}: thiếu GLB clip ${missingClip}, bỏ qua.`);
      continue;
    }
    const post = m.data.import.post ? path.join(root, m.data.import.post) : null;
    if (post && !fs.existsSync(post)) {
      console.error(`[blender] LỖI ${m.data.id}: import.post trỏ tới ${m.data.import.post} nhưng file không tồn tại`);
      process.exit(1);
    }
    jobs.push({
      id: m.data.id,
      script: path.relative(root, importScript),
      args: [glb, out(m.data.id), '--meta', m.file, '--budgets', budgetsFile],
      deps: [importScript, m.file, budgetsFile, glb, ...clips, ...(post ? [post, clipsHelper, partsHelper] : [])],
    });
  }
  return jobs;
}

/** @type {Job[]} */
const jobs = [...proceduralJobs(), ...tripoJobs()];

const pending = jobs.filter((j) => {
  const o = out(j.id);
  if (force || !fs.existsSync(o)) return true;
  const built = fs.statSync(o).mtimeMs;
  return j.deps.some((d) => fs.statSync(d).mtimeMs > built);
});

if (pending.length === 0) {
  console.log(`[blender] ${jobs.length} job, không có gì đổi (cache theo mtime).`);
  process.exit(0);
}

const blender = findBlender();
if (!blender) {
  console.warn(
    '[blender] CẢNH BÁO: không tìm thấy Blender, bỏ qua bước sinh GLB thô. Cài Blender 4.x trở lên, thêm vào PATH hoặc đặt BLENDER=đường_dẫn.',
  );
  process.exit(0);
}

fs.mkdirSync(rawDir, { recursive: true });
for (const job of pending) {
  console.log(`[blender] ${job.script} → ${path.relative(root, out(job.id))}`);
  const status = runBlender(blender, path.join(root, job.script), job.args);
  if (status !== 0) {
    console.error(`[blender] lỗi khi chạy ${job.script} (${job.id})`);
    process.exit(status);
  }
  if (job.legacy) {
    fs.copyFileSync(out(job.id), path.join(root, job.legacy));
    console.log(`[blender] chép thêm → ${job.legacy} (đầu vào test pipeline)`);
  }
}
console.log('[blender] xong.');
