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
  // Thư viện clip Quaternius UAL1+UAL2 (CC0): `source` = UAL1, `source2` = UAL2 (truyền `--src2`), xem anim_human_ual.py.
  {
    id: 'anim_human_ual',
    script: 'tools/blender/anim_human_ual.py',
    source: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    source2: 'anim/ual/ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb',
  },
  // Nhân vật v3 (N-0): lưới nguyên khối → xương UE5 Mannequin (chr_v3.py). `extra` = đối số thêm, `template` = UAL1 để lấy bộ xương mẫu.
  // Lạc Kiếm Môn Phục v3 (N-3): hai model Tripo toàn thân không xương (người dùng dựng), tự ước lượng mốc (`--auto`), lò xo vạt (`repo:` = đường dẫn trong repo).
  ...['nam', 'nu'].map((g) => ({
    id: `chr_v3_lac_kiem_${g}`,
    script: 'tools/blender/chr_v3.py',
    source: `chr/set_lac_kiem/tripo/raw_v3_${g}.glb`,
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', `chr_v3_lac_kiem_${g}`, '--auto', '--height', g === 'nam' ? '1.84' : '1.70', '--springs', 'repo:tools/blender/skins/v3_lac_kiem_springs.json'],
  })),
  // Lạc Kiếm Môn Phục v3b: vạt xẻ hai bên đối xứng (concept v3b), cùng cấu hình lò xo/vạt với v3; asset v3 cũ giữ để so.
  ...['nam', 'nu'].map((g) => ({
    id: `chr_v3b_lac_kiem_${g}`,
    script: 'tools/blender/chr_v3.py',
    source: `chr/set_lac_kiem/tripo/raw_v3b_${g}.glb`,
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', `chr_v3b_lac_kiem_${g}`, '--auto', '--height', g === 'nam' ? '1.84' : '1.70', '--springs', 'repo:tools/blender/skins/v3_lac_kiem_springs.json'],
  })),
  // Nướng vải vạt v3b (thử nghiệm): đọc GLB thô đã dựng của chr_v3b_lac_kiem_<giới> (`raw:`), chạy Cloth sim trên các clip UAL và nướng vào xương chuỗi vạt.
  ...['nam', 'nu'].map((g) => ({
    id: `chr_v3b_cloth_${g}`,
    script: 'tools/blender/cloth_bake.py',
    source: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    source2: 'anim/ual/ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb',
    extra: ['--id', `chr_v3b_cloth_${g}`, '--base', `raw:chr_v3b_lac_kiem_${g}`, '--cfg', 'repo:tools/blender/skins/v3_lac_kiem_cloth.json', '--report', `repo:assets/build/cloth_${g}.json`],
  })),
  {
    id: 'chr_v3_varkessa_nu',
    script: 'tools/blender/chr_v3.py',
    source: 'chr/skin_varkessa/prep/rig_v01.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'chr_v3_varkessa_nu'],
  },
  {
    id: 'chr_v3_duskrella_nu',
    script: 'tools/blender/chr_v3.py',
    source: 'chr/skin_duskrella/prep/rig_v01.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'chr_v3_duskrella_nu', '--height', '1.8'],
  },
  {
    id: 'chr_v3_crimson_nam',
    script: 'tools/blender/chr_v3.py',
    source: 'chr/skin_crimson/prep/rig_v01.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'chr_v3_crimson_nam', '--height', '1.9'],
  },
  {
    id: 'chr_v3_noxavyra_nu',
    script: 'tools/blender/chr_v3.py',
    source: 'chr/skin_noxavyra/prep/rig_v01.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'chr_v3_noxavyra_nu', '--height', '1.8'],
  },
  {
    id: 'chr_v3_kings_demon_nu',
    script: 'tools/blender/chr_v3.py',
    source: 'chr/skin_kings_demon/prep/rig_v01.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'chr_v3_kings_demon_nu', '--height', '1.8'],
  },
  // Quái hai chân Dị Vực (DV-2 đợt 2): bản điêu khắc CC BY → `skin_prep.py --stage bake` (cấu hình tools/blender/skins/dv2_*.json) → lưới thấp
  // không xương `mon/<id>/prep/bake.glb` (thư mục nguồn ngoài repo hoặc thư mục làm việc: `DTL_ASSET_SOURCE=<thư mục>`) → chr_v3.py đặt lên xương Mannequin.
  // Hai con không chữ A khai mốc `--landmarks` và vùng cứng `--bind` (vũ khí/khiên/áo choàng đi theo một xương).
  {
    id: 'mon_tan_chung',
    script: 'tools/blender/chr_v3.py',
    source: 'mon/mon_tan_chung/prep/bake.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'mon_tan_chung', '--auto', '--height', '2.2', '--tris', '9000'],
  },
  {
    id: 'mon_giac_kiem_trong_binh',
    script: 'tools/blender/chr_v3.py',
    source: 'mon/mon_giac_kiem_trong_binh/prep/bake.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'mon_giac_kiem_trong_binh', '--height', '2.5', '--tris', '9000', '--landmarks', 'repo:tools/blender/skins/dv2_maltherion_landmarks.json', '--bind', 'repo:tools/blender/skins/dv2_maltherion_bind.json'],
  },
  {
    id: 'elite_hoi_giac_cu_thu',
    script: 'tools/blender/chr_v3.py',
    source: 'mon/elite_hoi_giac_cu_thu/prep/bake.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'elite_hoi_giac_cu_thu', '--height', '3.0', '--tris', '14000', '--landmarks', 'repo:tools/blender/skins/dv2_gorthazul_landmarks.json', '--bind', 'repo:tools/blender/skins/dv2_gorthazul_bind.json'],
  },
  // DV-2 đợt 3 (boss hình người): cùng đường ống, bản nướng thấp từ `skin_prep.py --stage bake` (tools/blender/skins/dv2_protector.json, dv2_ravenyth.json).
  {
    id: 'boss_tan_hoa_kiem_co',
    script: 'tools/blender/chr_v3.py',
    source: 'boss/boss_tan_hoa_kiem_co/prep/bake.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'boss_tan_hoa_kiem_co', '--height', '2.4', '--tris', '30000', '--landmarks', 'repo:tools/blender/skins/dv2_protector_landmarks.json', '--bind', 'repo:tools/blender/skins/dv2_protector_bind.json'],
  },
  {
    id: 'boss_kim_da_ma_hau',
    script: 'tools/blender/chr_v3.py',
    source: 'boss/boss_kim_da_ma_hau/prep/bake.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'boss_kim_da_ma_hau', '--height', '2.6', '--tris', '30000', '--landmarks', 'repo:tools/blender/skins/dv2_ravenyth_landmarks.json', '--bind', 'repo:tools/blender/skins/dv2_ravenyth_bind.json'],
  },
  // DV-2 đợt 4 (boss có cánh): Aetherion Nemesis (tools/blender/skins/dv2_aetherion.json); cánh là ba chuỗi xương mỗi bên (`--wings`, chr_v3.py).
  {
    id: 'boss_thu_khich_duc_chu',
    script: 'tools/blender/chr_v3.py',
    source: 'boss/boss_thu_khich_duc_chu/prep/bake.glb',
    template: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    extra: ['--id', 'boss_thu_khich_duc_chu', '--height', '3.6', '--tris', '36000', '--landmarks', 'repo:tools/blender/skins/dv2_aetherion_landmarks.json', '--wings', 'repo:tools/blender/skins/dv2_aetherion_wings.json'],
  },
  // Clip UAL giữ tên xương Mannequin, phát thẳng lên chr_v3_* (không chuyển clip).
  {
    id: 'anim_ual_native',
    script: 'tools/blender/anim_ual_native.py',
    source: 'anim/ual/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    source2: 'anim/ual/ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb',
  },
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
      if (j.template) {
        const tp = path.join(sourceRoot(), j.template);
        if (!fs.existsSync(tp)) {
          console.warn(`[blender] CẢNH BÁO: bỏ qua ${j.id}, thiếu ${tp}`);
          continue;
        }
        deps.push(tp);
        args.push('--template', tp);
      }
      if (j.extra) {
        args.push(...j.extra.map((x) => (x.startsWith('repo:') ? path.join(root, x.slice(5)) : x.startsWith('raw:') ? out(x.slice(4)) : x)));
        for (const x of j.extra) if (x.startsWith('raw:')) deps.push(out(x.slice(4)));
        for (const x of j.extra) if (x.startsWith('repo:') && x.endsWith('.json') && !x.includes('/build/')) deps.push(path.join(root, x.slice(5)));
      }
      if (j.source2) {
        const src2 = path.join(sourceRoot(), j.source2);
        if (!fs.existsSync(src2)) {
          console.warn(`[blender] CẢNH BÁO: bỏ qua ${j.id}, thiếu ${src2}`);
          continue;
        }
        deps.push(src2);
        args.push('--src2', src2);
      }
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
  const wanted = metas.filter((m) => ['tripo', 'external'].includes(m.data.import?.kind) && (!only || m.data.id === only));
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
