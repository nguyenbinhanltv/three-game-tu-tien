#!/usr/bin/env node
// Dựng docs/ASSET_CONCEPTS.md và bản HTML xem ảnh + prompt từ tools/codex-assets/concepts.json.
// Dùng: node tools/codex-assets/concepts-doc.mjs [--html <đường dẫn .html>]
// Ảnh WebP nằm ở docs/asset-concepts/<id>.webp (nén từ <DTL_ASSET_SOURCE>/2d/concepts/<id>.png).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const data = JSON.parse(fs.readFileSync(path.join(here, 'concepts.json'), 'utf8'));
const args = process.argv.slice(2);
const htmlOut = args[0] === '--html' ? args[1] : null;

const PRIO = {
  1: 'Ưu tiên 1 · Tinh anh (Vân Lam hiện có + bản đồ mới)',
  2: 'Ưu tiên 2 · Boss (phó bản và ngoài trời)',
  3: 'Ưu tiên 3 · Quái đặc trưng ba bản đồ',
  4: 'Ưu tiên 4 · Cỏ rừng mới (thay bụi nhọn sẫm, G7) và cỏ ba bản đồ',
  5: 'Ưu tiên 5 · Cây, đá, kiến trúc, prop môi trường ba bản đồ',
  6: 'Ưu tiên 6 · Trang bị, kiếm, pháp bảo, bộ trang bị bậc mới',
};
const MAP = { vl: 'Vân Lam', m2: 'Đoạn Mạch Cổ Cốc (E-2)', m3: 'Vân Hải Phù Đảo (E-3)', m4: 'Thiên Khuyết Cổ Thành (E-4)' };
const RIG = {
  quadruped: 'Có xương, **quadruped**: Tripo rig quadruped, sau đó `tools/blender/anim_quadruped.py` (thư viện clip chung quái bốn chân)',
  biped: 'Có xương, **biped**: Tripo rig biped (spec mixamo), sau đó `tools/blender/anim_biped_extra.py`',
  human: 'Có xương, **người**: Tripo rig biped; dùng chung clip `anim_human_base` (retarget theo tên xương, `game/character/animLib.ts`)',
  serpent: 'Xương **serpent** theo đốt: xuất GLB tĩnh nằm trục +Z, worker E-2 dựng xương đốt bằng `tools/blender/anim_serpent.py` (không cần rig trên Tripo)',
  float: '**Không xương**: bay/lơ lửng bằng transform thủ tục; nếu muốn vỗ cánh, tách cánh thành mesh riêng gắn gốc',
  none: 'Không xương (mesh tĩnh)',
};
const TRIPO_SUFFIX = {
  creature: 'semi-realistic stylized game asset, Chinese fantasy cultivation world, painterly PBR texture, believable anatomy, clean readable silhouette, neutral standing pose, plain background, no base, no ground, no text',
  grass: 'game-ready foliage card clump, stylized semi-realistic, alpha cutout blades, no ground, no base, no text',
  env: 'semi-realistic stylized game prop, weathered PBR texture, clean readable silhouette, plain background, no ground plane, no text',
  gear: 'semi-realistic stylized game item, clean readable silhouette, fine PBR detail, plain background, no stand, no hand, no text',
  set: 'outfit concept reference only',
};
const kind = (c) => (['elite', 'boss', 'mon'].includes(c) ? 'creature' : c);
const face = (tris) => (/^\d+$/.test(tris) ? Number(tris) : null);
const dirOf = (a) => (a.dir === 'chr' ? 'chr' : a.dir);
const dest = (id, a) => `D:/METAGRIT/dtl-asset-source/${dirOf(a)}/${id}/`;
const tripoPrompt = (a) => `${a.look}. ${TRIPO_SUFFIX[kind(a.cat)]}.`;
const tripoParams = (a) => {
  if (a.cat === 'set') return 'Không dựng trên Tripo (dùng recolor + phụ kiện thủ tục của hệ 3-4); ảnh chỉ để chốt màu và hình khối.';
  const f = face(a.tris);
  const tex = a.tex.split('/')[0];
  return `model H3.1 (v3.1), Texture: Detailed, PBR: bật, Smart Low-poly: bật, Polycount ${f ?? a.tris}, quad tắt, GLB`
    + `; texture mục tiêu base color ${tex}${a.tex.includes('/') ? ` / normal ${a.tex.split('/')[1]} / ORM ${a.tex.split('/')[2]}` : ''}`;
};
const pipeline = (id, a) => {
  if (a.cat === 'set') return 'Không import GLB. Tham chiếu cho `recolorSet` và `setAccessories.ts` (xem `docs/set-accessories/README.md`).';
  const d = dirOf(a);
  const post = { quadruped: 'anim_quadruped.py', biped: 'anim_biped_extra.py', human: 'anim_human_base (retarget)', serpent: 'anim_serpent.py', float: '(không)', none: '(không)' }[a.rig];
  return `\`${d}/${id}/tripo/raw_v01.glb\` (dựng hình), \`lowpoly_v01.glb\` (nếu Retopo), \`rig_v01.glb\` (nếu có xương) → \`assets/source/${d}/${id}/meta.json\` (\`import.kind: "tripo"\`, \`import.source\`, \`size\`, \`yaw\`, \`post: ${post}\`) → \`pnpm assets:build\` → \`pnpm assets:validate\` (ngân sách tam giác/texture) → khai báo trong \`assets/budgets.json\`/lớp ngân sách \`${budgetClass(a)}\`.`;
};
const budgetClass = (a) => a.budget ?? ({ elite: 'monster', mon: 'monster', boss: 'boss', grass: 'prop', env: 'prop', gear: 'weapon' }[a.cat] ?? 'prop');

const ids = Object.keys(data);
const sorted = [...ids].sort((x, y) => data[x].prio - data[y].prio || (data[x].map > data[y].map ? 1 : -1));
const byPrio = (p) => sorted.filter((i) => data[i].prio === p);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- Markdown ----------
let md = `# Asset concept cho Tripo (E-0)

Bản 1 · 2026-11-16 · đi kèm \`docs/EXPANSION_DESIGN.md\`.

**${ids.length} asset** người dùng tự dựng trên **Tripo web** (kênh web app trong \`docs/tripo-runbook.md\`; không dùng credit CLI). Mỗi mục có ảnh concept sinh bằng Codex (\`node tools/codex-assets/gen.mjs concepts [id…]\`, không tốn credit Tripo), prompt Tripo tiếng Anh theo \`docs/art-bible.md\` v3 (bán tả thực điện ảnh, sương sớm), số tam giác/texture, xương, tên file và thư mục đích trong \`D:/METAGRIT/dtl-asset-source/\`, ghi chú pipeline. Thiết kế là gốc của dự án, không chép game/truyện có sẵn.

Bản HTML xem ảnh + prompt có nút sao chép: \`huong-dan-concept-asset.html\` (thư mục artifact của phiên). Ảnh gốc PNG (3:2) nằm ở \`D:/METAGRIT/dtl-asset-source/2d/concepts/<id>.png\` kèm \`<id>.prompt.txt\` (prompt sinh ảnh); ảnh nén WebP trong repo: \`docs/asset-concepts/<id>.webp\`.

## Cách dùng một mục (quy trình rút gọn)

1. Mở ảnh concept (\`docs/asset-concepts/<id>.webp\`).
2. Tripo web → **Image to 3D** (model **H3.1**), tải ảnh PNG gốc từ \`2d/concepts/<id>.png\`; dán prompt Tripo làm mô tả phụ. Thiết lập theo dòng "Tripo" của mục (Texture Detailed, PBR bật, Smart Low-poly bật, Polycount theo mục, quad tắt).
3. Chọn bản tốt nhất; nếu lưới nặng, dùng **Retopo** về đúng Polycount. Với asset **có xương**: rig theo cột "Xương" (cùng preset với quái/NPC hiện có, \`docs/prompts/tripo.md\` mục 2). Không mua animation: clip thủ tục đã có (\`anim_quadruped\`, \`anim_biped_extra\`, \`anim_serpent\`, \`anim_human_base\`).
4. Tải **GLB** về thư mục đích (cột "Thư mục"): \`tripo/raw_v01.glb\` (dựng hình), \`lowpoly_v01.glb\`, \`rig_v01.glb\`; chép ảnh concept đã duyệt vào \`concept/concept_34_v01.png\` (đúng quy ước đặt tên ở \`docs/tripo-runbook.md\` mục 3). Tăng \`NN\` khi thử lại.
5. Báo cho Claude/worker: worker tạo \`assets/source/<loại>/<id>/meta.json\`, chạy \`tools/blender/import_tripo.py\` và \`pnpm assets:build\`.

Giới hạn art bible mục 6 (LOD0 tam giác / texture): quái thường 5–10 nghìn (Polycount 8.000); tinh anh 10–15 nghìn (Polycount 12.000–14.000); boss một lần dựng 20.000 (tách bộ phận nếu muốn 30–50 nghìn); prop 500–5 nghìn; vũ khí 1–3 nghìn; kiến trúc: **bản Tripo chỉ là nháp**, bản cuối dựng bằng pipeline bpy (art bible mục 6). Mọi vật phát sáng (HDR dưới 2,4) do shader game làm; texture không vẽ sẵn quầng sáng.

**Ghi chú về ảnh**: ảnh concept chỉ để Tripo hiểu hình khối; chi tiết quá nhỏ (khóa, hoa văn nhỏ hơn 1% khung) không cần. Nếu Tripo cho ra chi tiết lệch, ưu tiên **hình bóng** và **màu**.

## Mục lục theo thứ tự cần

| Ưu tiên | Nhóm | Số mục |
| --- | --- | --- |
${[1, 2, 3, 4, 5, 6].map((p) => `| ${p} | ${PRIO[p].split(' · ')[1]} | ${byPrio(p).length} |`).join('\n')}

`;
for (const p of [1, 2, 3, 4, 5, 6]) {
  md += `\n---\n\n## ${PRIO[p]}\n\n`;
  for (const id of byPrio(p)) {
    const a = data[id];
    md += `### \`${id}\` · ${a.name}\n\n![${id}](asset-concepts/${id}.webp)\n\n`;
    md += `| | |\n| --- | --- |\n`;
    md += `| Vai trò | ${a.role} |\n| Bản đồ | ${MAP[a.map]} |\n| Kích thước trong game | ${a.size} |\n`;
    md += `| Tam giác (Polycount LOD0) | ${a.tris} |\n| Texture (base color / normal / ORM) | ${a.tex} |\n| Xương | ${RIG[a.rig]} |\n`;
    md += `| Thư mục đích | \`${dest(id, a)}\` (\`concept/\`, \`tripo/\`) |\n| Tripo | ${tripoParams(a)} |\n\n`;
    md += `**Prompt Tripo (tiếng Anh):**\n\n\`\`\`text\n${tripoPrompt(a)}\n\`\`\`\n\n`;
    md += `**Ghi chú pipeline:** ${a.notes}\n\n**Import:** ${pipeline(id, a)}\n\n`;
  }
}
md += `\n---\n\n## Phụ lục: xương dùng chung (không dựng mới)\n\n| Nhóm | Thư viện clip | File |\n| --- | --- | --- |\n| Bốn chân | \`anim_quadruped\` | \`tools/blender/anim_quadruped.py\` |\n| Hai chân (vượn, tượng, khôi lỗi) | \`anim_biped_extra\` | \`tools/blender/anim_biped_extra.py\` |\n| Người (hộ vệ, bộ xương cầm kiếm, bộ trang bị) | \`anim_human_base\`, \`anim_human_k3\` | \`tools/blender/anim_human_k3.py\`, \`game/character/animLib.ts\` |\n| Rắn, ngô công, kình ngư | \`anim_serpent\` | \`tools/blender/anim_serpent.py\` |\n| Bay lơ lửng | transform thủ tục | \`game/character/\` |\n`;
fs.writeFileSync(path.join(root, 'docs/ASSET_CONCEPTS.md'), md);
console.log(`docs/ASSET_CONCEPTS.md: ${ids.length} mục`);

// ---------- HTML ----------
if (htmlOut) {
  const card = (id) => {
    const a = data[id];
    return `<section class="card" id="${id}">
<div class="img"><img loading="lazy" src="asset-concepts/${id}.webp" alt="${id}"></div>
<div class="txt"><h3>${esc(a.name)} <code>${id}</code></h3>
<p class="role">${esc(a.role)}</p>
<table>
<tr><th>Bản đồ</th><td>${MAP[a.map]}</td></tr>
<tr><th>Kích thước</th><td>${esc(a.size)}</td></tr>
<tr><th>Tam giác</th><td>${a.tris}</td></tr>
<tr><th>Texture</th><td>${a.tex}</td></tr>
<tr><th>Xương</th><td>${esc(RIG[a.rig].replace(/\*\*/g, '').replace(/`/g, ''))}</td></tr>
<tr><th>Thư mục</th><td><code>${dest(id, a)}</code></td></tr>
<tr><th>Tripo</th><td>${esc(tripoParams(a))}</td></tr>
</table>
<div class="prompt"><button onclick="cp(this)">Sao chép prompt</button><pre>${esc(tripoPrompt(a))}</pre></div>
<p class="note">${esc(a.notes)}</p></div></section>`;
  };
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Đạp Thiên Lộ · Concept asset cho Tripo (E-0)</title>
<style>
:root{--bg:#0f1c20;--panel:#16282d;--ink:#dce6df;--mut:#9db1ab;--gold:#ae8b49;--jade:#7fe3d0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,Segoe UI,sans-serif}
header{padding:28px 32px;border-bottom:1px solid #26403f}h1{margin:0 0 6px;font-size:24px;color:var(--gold)}
header p{margin:4px 0;color:var(--mut);max-width:980px}nav{position:sticky;top:0;background:#0f1c20ee;padding:10px 32px;border-bottom:1px solid #26403f;display:flex;gap:10px;flex-wrap:wrap;z-index:5}
nav a{color:var(--jade);text-decoration:none;padding:4px 10px;border:1px solid #2b5552;border-radius:6px;font-size:13px}nav a:hover{background:#2b5552}
main{padding:12px 32px 64px;max-width:1400px;margin:0 auto}h2{margin:44px 0 14px;color:var(--gold);border-bottom:1px solid #26403f;padding-bottom:6px;font-size:19px}
.card{display:grid;grid-template-columns:minmax(300px,520px) 1fr;gap:20px;background:var(--panel);border:1px solid #26403f;border-radius:10px;padding:14px;margin:14px 0}
.card img{width:100%;border-radius:6px;background:#d8d8d8;display:block}h3{margin:0;font-size:17px}code{color:var(--jade);font-size:12.5px}
.role{margin:4px 0 8px;color:var(--mut)}table{border-collapse:collapse;width:100%;font-size:13px}th{width:90px;text-align:left;color:var(--mut);vertical-align:top;padding:3px 8px 3px 0}td{padding:3px 0}
.prompt{margin-top:10px;position:relative}pre{margin:0;white-space:pre-wrap;background:#0b1518;border:1px solid #26403f;border-radius:6px;padding:10px 10px 10px;font-size:12.5px;color:#cfe3db}
button{position:absolute;right:6px;top:6px;background:#2b5552;color:var(--ink);border:0;border-radius:5px;padding:4px 10px;cursor:pointer;font-size:12px}button:hover{background:#3b7771}.note{color:var(--mut);font-size:13px;margin:10px 0 0}
@media(max-width:900px){.card{grid-template-columns:1fr}}
</style></head><body>
<header><h1>Concept asset cho Tripo · Đạp Thiên Lộ</h1>
<p>${ids.length} asset bạn tự dựng trên Tripo web (Image to 3D, model H3.1, Texture Detailed, PBR, Smart Low-poly). Ảnh concept sinh bằng Codex, không tốn credit Tripo. Thiết kế gốc, theo art bible v3 (bán tả thực điện ảnh, sương sớm). Làm theo thứ tự ưu tiên 1 → 6.</p>
<p>Quy trình: mở ảnh → Tripo web Image to 3D → chọn Polycount và rig theo bảng → tải GLB về thư mục đích (<code>tripo/raw_v01.glb</code>, <code>rig_v01.glb</code>) → báo Claude để import (<code>tools/blender/import_tripo.py</code>, <code>pnpm assets:build</code>). Tài liệu đầy đủ: <code>docs/ASSET_CONCEPTS.md</code> và <code>docs/EXPANSION_DESIGN.md</code>.</p></header>
<nav>${[1, 2, 3, 4, 5, 6].map((p) => `<a href="#p${p}">${PRIO[p].split(' · ')[0].replace('Ưu tiên ', 'P')} · ${PRIO[p].split(' · ')[1].split(' (')[0]}</a>`).join('')}</nav>
<main>${[1, 2, 3, 4, 5, 6].map((p) => `<h2 id="p${p}">${PRIO[p]}</h2>${byPrio(p).map(card).join('\n')}`).join('\n')}</main>
<script>function cp(b){navigator.clipboard.writeText(b.nextElementSibling.textContent).then(()=>{const t=b.textContent;b.textContent='Đã chép';setTimeout(()=>b.textContent=t,1200)})}</script>
</body></html>`;
  fs.writeFileSync(htmlOut, html);
  console.log(`HTML: ${htmlOut}`);
}
