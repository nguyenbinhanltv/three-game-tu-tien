#!/usr/bin/env node
// C6: contact sheet 4 hướng cho mỗi quái/boss trong mon-concepts.json (nhãn + nền xám) và tờ hướng dẫn Tripo (HTML) ở thư mục ra.
// Dùng: node tools/codex-assets/mon-sheet.mjs --out <thư mục tuyệt đối> [--only id,id]. Ảnh concept đọc từ <DTL_ASSET_SOURCE>/3d/<quai|boss>/<id>/concept/.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sharp = createRequire(path.join(root, 'tools/asset-pipeline/package.json'))('sharp');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const out = opt('--out', '');
if (!out) throw new Error('thiếu --out <thư mục>');
const only = opt('--only', '').split(',').filter(Boolean);
const concepts = JSON.parse(fs.readFileSync(path.join(here, 'mon-concepts.json'), 'utf8'));
const ids = Object.keys(concepts).filter((k) => !k.startsWith('_') && (!only.length || only.includes(k)));
fs.mkdirSync(out, { recursive: true });
const VIEWS = ['front', 'left', 'right', 'back'];
const CELL = 420;
const IMG_H = Math.round(CELL * 1.15);
const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);

const rows = [];
for (const id of ids) {
  const c = concepts[id];
  const dir = path.join(source, '3d', c.dir, id, 'concept');
  const tiles = [];
  for (const [i, v] of VIEWS.entries()) {
    const f = path.join(dir, `concept_${v}.png`);
    if (!fs.existsSync(f)) continue;
    const img = await sharp(f).resize(CELL, IMG_H, { fit: 'contain', background: '#d8d8d8' }).png().toBuffer();
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="28"><rect width="${CELL}" height="28" fill="#222"/><text x="10" y="20" font-family="sans-serif" font-size="16" fill="#fff">${esc(c.vi)} - ${v.toUpperCase()}</text></svg>`,
    );
    const tile = await sharp({ create: { width: CELL, height: IMG_H + 28, channels: 3, background: '#d8d8d8' } })
      .composite([
        { input: label, left: 0, top: 0 },
        { input: img, left: 0, top: 28 },
      ])
      .png()
      .toBuffer();
    tiles.push({ input: tile, left: i * CELL, top: 0 });
  }
  if (tiles.length < 4) console.log(`THIẾU hướng: ${id} (${tiles.length}/4)`);
  await sharp({ create: { width: CELL * 4, height: IMG_H + 28, channels: 3, background: '#d8d8d8' } })
    .composite(tiles)
    .jpeg({ quality: 88 })
    .toFile(path.join(out, `${id}-contact.jpg`));
  rows.push({ id, c });
  console.log('sheet', id);
}

// Kích thước tham khảo (mét): quái bốn chân theo art-bible 2.2; hai chân/boss theo scale và tỉ lệ boss 2-3 lần quái thường.
const SIZE = {
  mon_yeu_lang: 'dài ~1,95 m, cao vai ~1,05 m (sói thường 1,5 × 0,8; scale 1,3)',
  mon_u_minh_lang: 'dài ~2,2 m, cao vai ~1,15 m (scale 1,45)',
  mon_kiem_linh: 'dài ~1,3 m, cao vai ~0,7 m (scale 1,2)',
  mon_tt_cot_ve: 'cao ~1,8 m (cỡ người)',
  mon_tt_thach_tuong: 'cao ~2,1 m, vai rộng',
  mon_tt_chien_ma: 'dài ~1,6 m, cao vai ~0,9 m',
  boss_xich_tan_cu_khoi: 'cao ~4 m',
  boss_tu_nhan_ma_tuong: 'cao ~3 m',
  boss_tu_quang_duc_chu: 'cao ~3,4 m, sải cánh ~5 m',
};
const card = ({ id, c }) => {
  const tri = c.cls === 'boss' ? '20-50 nghìn (Tripo tối đa 20.000 mỗi lần dựng, đặt 20000)' : '5-10 nghìn (đặt 8000)';
  return `<section><h2>${esc(c.vi)} <small>${id} · ${esc(c.chapter)}</small></h2>
<img src="${id}-contact.jpg" alt="${id}">
<table>
<tr><th>Tư thế concept</th><td>${c.pose === 'biped' ? 'A-pose (hai chân)' : 'đứng bốn chân chuẩn'}</td></tr>
<tr><th>Màu nhận diện</th><td>${esc(c.colors)}</td></tr>
<tr><th>Kích thước thật (tham khảo)</th><td>${SIZE[id] ?? ''}; số chính xác khai ở <code>meta.json → import.size</code> (Claude lo)</td></tr>
<tr><th>Lớp ngân sách</th><td><code>${c.cls}</code>: ${tri} tam giác LOD0; Polycount Tripo <b>${c.poly}</b> (Topology Triangle)</td></tr>
<tr><th>Rig trên Tripo</th><td>${c.rig === 'quadruped' ? 'quadruped (clip làm thủ tục bằng Blender, không tải clip Tripo)' : 'biped (clip làm thủ tục bằng Blender)'}</td></tr>
<tr><th>Ảnh concept</th><td><code>dtl-asset-source/3d/${c.dir}/${id}/concept/concept_{front,left,right,back}.png</code></td></tr>
<tr><th>Đặt file GLB vào</th><td><code>dtl-asset-source/3d/${c.dir}/${id}/tripo/</code> với tên <code>raw_v01.glb</code> (Generate, chưa Retopo), <code>lowpoly_v01.glb</code> (sau Retopo), <code>rig_v01.glb</code> (sau Rig). Không ghi đè bản cũ; bản mới tăng số: <code>_v02</code></td></tr>
</table></section>`;
};
const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Hướng dẫn dựng quái/boss trên Tripo web: đợt 1</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:1500px;margin:24px auto;padding:0 16px;color:#222}img{max-width:100%}h2 small{font-weight:400;color:#666;font-size:.65em;margin-left:8px}table{border-collapse:collapse;margin:8px 0 28px}th,td{border:1px solid #ccc;padding:4px 10px;text-align:left;vertical-align:top}th{background:#f3f3f3;width:210px}code{background:#f3f3f3;padding:0 4px}.box{background:#fff8e1;border:1px solid #e8d48a;padding:10px 16px;margin:12px 0}</style></head><body>
<h1>Hướng dẫn dựng quái/boss trên Tripo web: đợt 1 (${rows.length} con)</h1>
<div class="box"><b>Không dùng Tripo API/CLI.</b> Tự bấm trên web app (gói Max). Ghi lại số credit trước/sau mỗi bước rồi báo Claude. Ảnh concept do Codex vẽ, dự án sở hữu; không đưa lên chỗ công khai.</div>
<h2>Quy trình cho mỗi con (theo docs/tripo-runbook.md mục 6)</h2>
<ol>
<li><b>Model → Generate Model → tab HD Model</b>, ảnh <b>Multiview</b>: <b>Front</b> = <code>concept_front.png</code>, <b>Left</b> = <code>concept_left.png</code>, <b>Back</b> = <code>concept_back.png</code>, <b>Right</b> = <code>concept_right.png</code> nếu có ô (không có thì để trống).</li>
<li>General Settings: Generate in Parts <b>tắt</b>, 8K Texture <b>tắt</b>, Privacy <b>bật</b>; AI Model <b>H3.1</b>.</li>
<li>Geometry &amp; Texture: Ultra Mesh Quality <b>tắt</b>; Texture <b>bật</b>, chất lượng <b>2K</b>; Remove Lighting <b>bật</b>; PBR <b>bật</b>; Topology <b>Triangle</b>; Polycount theo từng con bên dưới.</li>
<li>Generate (khoảng 65 credit). Xoay kiểm: chân tách rời, không dính vào thân, không méo mặt, vũ khí/cánh không dính thân. Quá 3 lần không đạt thì báo Claude để sửa concept.</li>
<li>Nếu quá nặng: <b>Retopo</b> (Triangle, Polycount theo bảng). Texture lệch: <b>Texture</b> (2K, PBR, Remove Lighting). Không dựng lại từ đầu.</li>
<li><b>Rig</b> trên bản đúng Polycount: quái bốn chân chọn <b>quadruped</b>, hai chân chọn <b>biped</b>. Không tải clip animation của Tripo cho quái (clip làm thủ tục bằng Blender).</li>
<li><b>Export GLB</b> (không FBX): lưu <code>raw_v01.glb</code>, <code>lowpoly_v01.glb</code> (nếu Retopo), <code>rig_v01.glb</code> vào thư mục <code>tripo/</code> của con đó.</li>
<li><b>Báo Claude</b>: asset id, credit từng bước, có Mixamo không. Claude kiểm số tam giác/xương/hash, điền <code>meta.json</code>, nhập qua <code>import_tripo.py</code> và thay model khối.</li>
</ol>
<div class="box"><b>Lưu ý hướng Left/Right:</b> <code>concept_left</code> vẽ con vật quay mặt sang <b>trái</b> khung hình (thấy bên TRÁI của nó), <code>concept_right</code> quay mặt sang phải. Ghi chú ở runbook cho thấy ô Left của Tripo từng ra đúng hình khi ảnh quay mặt sang <b>phải</b> (chưa kiểm riêng). Nếu model bị lật/đảo trước-sau thì đổi chỗ hai ảnh Left và Right, dựng lại một lần và báo Claude kết quả.</div>
<h2>Đợt 1</h2>
${rows.map(card).join('\n')}
</body></html>`;
fs.writeFileSync(path.join(out, 'huong-dan-tripo-dot-1.html'), html);
console.log('đã ghi huong-dan-tripo-dot-1.html');
