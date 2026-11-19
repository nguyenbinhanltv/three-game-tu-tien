#!/usr/bin/env node
// Dựng tài liệu concept trang phục Kết Đan (T-3) từ outfit-data.mjs + ảnh Codex đã sinh (`node tools/codex-assets/gen.mjs outfit`).
// Dùng: node tools/codex-assets/outfit-doc.mjs [--html <thư mục artifact>]
// Làm: nén PNG → docs/outfit-concepts/ket-dan/<id>.webp (≤ 1600 px), viết docs/outfit-concepts/README.md + ket-dan/prompts.md,
//      sao ảnh gốc + nửa ảnh chính diện/3-4 vào <DTL_ASSET_SOURCE>/<chr|prop>/<id>/concept/ (CHỈ THÊM file, không ghi đè), tùy chọn dựng trang HTML xem nhanh.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SETS, SWORD, build } from './outfit-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const mainRoot = path.dirname(git.stdout.trim());
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(mainRoot, '../dtl-asset-source');
const args = process.argv.slice(2);
const htmlDir = args[0] === '--html' ? args[1] : null;

const req = (dir) => createRequire(path.join(dir, 'tools/asset-pipeline/package.json'));
let sharp;
for (const dir of [root, mainRoot]) {
  try {
    sharp = req(dir)('sharp');
    break;
  } catch {}
}
if (!sharp) throw new Error('Không tìm thấy sharp (chạy pnpm install)');

const items = build();
const docDir = path.join(root, 'docs/outfit-concepts');
const imgDir = path.join(docDir, 'ket-dan');
fs.mkdirSync(imgDir, { recursive: true });
const srcImgDir = path.join(source, '2d/concept/outfit');
const PIECES = ['ao_ngoai', 'lop_duoi', 'vai_giap', 'dai_tua', 'ung', 'trang_suc_dau'];
const specOf = (id) => {
  const it = items[id];
  if (it.kind === 'sword') return SWORD.items[it.piece];
  return SETS[it.set].pieces[it.piece];
};
const destDir = (id) => {
  const it = items[id];
  const o = it.kind === 'sword' ? SWORD : SETS[it.set];
  return path.join(source, o.dir, o.srcId, 'concept');
};

// 1. Nén + sao vào thư mục nguồn
const have = [];
for (const id of Object.keys(items)) {
  const png = path.join(srcImgDir, `${id}.png`);
  if (!fs.existsSync(png)) continue;
  have.push(id);
  await sharp(png)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(path.join(imgDir, `${id}.webp`));
  const d = destDir(id);
  fs.mkdirSync(d, { recursive: true });
  const put = async (name, make) => {
    const f = path.join(d, name);
    if (!fs.existsSync(f)) await make(f);
  };
  await put(`outfit_${id}_v01.png`, (f) => fs.promises.copyFile(png, f));
  await put(`outfit_${id}_v01.prompt.txt`, (f) => fs.promises.writeFile(f, items[id].prompt + '\n'));
  if (items[id].kind !== 'sheet') {
    const m = await sharp(png).metadata();
    const half = Math.floor(m.width / 2);
    await put(`outfit_${id}_v01_front.png`, (f) => sharp(png).extract({ left: 0, top: 0, width: half, height: m.height }).toFile(f));
    await put(`outfit_${id}_v01_34.png`, (f) =>
      sharp(png)
        .extract({ left: half, top: 0, width: m.width - half, height: m.height })
        .toFile(f),
    );
  }
}
console.log(`${have.length}/${Object.keys(items).length} ảnh`);

// 2. Prompt Tripo
const tripoPrompt = (id) => {
  const it = items[id];
  const sp = specOf(id);
  if (it.kind === 'sword')
    return `A single ${sp.look}. Isolated game prop, no hand, no person, clean geometry, hand-painted PBR materials, semi-realistic cinematic style, dark aged bronze, silver edge, amber accents.`;
  const set = SETS[it.set];
  return `${sp.look.charAt(0).toUpperCase()}${sp.look.slice(1)}. Single isolated costume piece for a game character, no person, no mannequin, no body, clean separated geometry, hand-painted PBR materials, semi-realistic cinematic style, colors ${set.palette
    .slice(0, 3)
    .map((p) => p[1])
    .join(', ')}.`;
};
const settingsLine = (tris) =>
  `Image to 3D · model H3.1 · texture Detailed · PBR bật · Smart Low-poly bật · Polycount (face limit) **${tris}** · không quad · không rig`;

const rows = (set) => PIECES.map((p) => set.pieces[p]);
const total = (set) => rows(set).reduce((n, p) => n + Number(p.tris), 0);

const T = [];
T.push(`# Prompt Tripo và spec từng mảnh (bộ Kết Đan bậc 2)

Chung cho mọi mảnh: ${settingsLine('<xem từng mảnh>')}. Ảnh đầu vào là **nửa chính diện** (\`outfit_<id>_v01_front.png\`, cắt sẵn trong thư mục nguồn); nửa 3/4 để đối chiếu hoặc dùng khi thử lại. Hướng dẫn từng bước: [../README.md](../README.md).

Ngân sách mỗi nhân vật ≤ 18k tam giác (thân nền 6k + các mảnh ≤ 12k). Texture 1024² mỗi mảnh (pipeline T-5 gộp atlas theo bộ). Tối đa 2 mảnh xuyên sáng mỗi bộ.
`);
for (const [sid, set] of Object.entries(SETS)) {
  T.push(`\n## ${set.name} (${set.method}, ${set.element})\n`);
  T.push(`Tổng tam giác 6 mảnh: **${total(set)}**. Thư mục lưu: \`<DTL_ASSET_SOURCE>/${set.dir}/${set.srcId}/tripo/\`.\n`);
  for (const pid of PIECES) {
    const p = set.pieces[pid];
    const id = `${sid}_${pid}`;
    T.push(`### ${p.name} · \`${id}\`

![${id}](${id}.webp)

- **Tripo:** ${settingsLine(p.tris)}
- **Lưu GLB:** \`${set.dir}/${set.srcId}/tripo/raw_${pid}_v01.glb\`
- **Xương gắn vào:** ${p.bones}
- **Xương lò xo:** ${p.spring}
- **Lưu ý khi dựng:** ${p.notes}

Prompt (tùy chọn, dán vào ô mô tả thêm):

\`\`\`text
${tripoPrompt(id)}
\`\`\`
`);
  }
}
T.push(`\n## Kiếm Liệt Mạch (dạng cuối +10 và vỏ)\n\n${SWORD.base}\n`);
for (const [iid, it] of Object.entries(SWORD.items)) {
  const id = `kiem_liet_mach_${iid}`;
  T.push(`### ${it.name} · \`${id}\`

![${id}](${id}.webp)

- **Tripo:** ${settingsLine(it.tris)}
- **Lưu GLB:** \`3d/vu-khi/${SWORD.srcId}/tripo/raw_${iid}_v01.glb\`
- **Gắn vào:** ${it.bones}
- **Xương lò xo:** ${it.spring}
- **Lưu ý khi dựng:** ${it.notes}

\`\`\`text
${tripoPrompt(id)}
\`\`\`
`);
}
fs.writeFileSync(path.join(imgDir, 'prompts.md'), T.join('\n'));

// 3. README
const palRows = (set) => set.palette.map((p) => `| ${p[0]} | \`${p[1]}\` | ${p[2]} |`).join('\n');
const R = [];
R.push(`# Concept trang phục Kết Đan (gói T-3)

Gói concept để **bạn dựng từng mảnh trên Tripo web** (image-to-3D), không tốn credit API. Ba bộ bậc 2 của kế hoạch tổng trang phục và vũ khí, cộng dạng cuối +10 và vỏ của Kiếm Liệt Mạch. Ảnh do Codex vẽ (\`node tools/codex-assets/gen.mjs outfit\`), dữ liệu và prompt ở \`tools/codex-assets/outfit-data.mjs\`.

Phong cách: áo nhiều lớp, viền kim loại chạm trổ, vai giáp, trang sức đầu, tay áo và vạt dài, tua ngọc; sáng và bắt mắt hơn tông môi trường. Cảm hứng lấy từ ảnh tham khảo bạn đã gửi (chỉ cấu trúc và tinh thần; không chép dáng, hoa văn, logo hay nhân vật nào, và các ảnh đó **không nằm trong repo**).

**Cần duyệt:** xem ảnh (README này, hoặc trang HTML xem nhanh ở artifact của phiên). Bộ nào chưa ưng, báo mình vẽ lại trước khi bạn dựng. Mỗi mảnh dựng xong lưu GLB đúng nơi ở dưới.

## Tổng quan

| Bộ | Công pháp, ngũ hành | Tổng tam giác 6 mảnh | Bảng thiết kế | Mảnh rời |
| --- | --- | --- | --- | --- |
${Object.entries(SETS)
  .map(
    ([sid, s]) =>
      `| **${s.name}** | ${s.method}, ${s.element} | ${total(s)} | [3 góc](ket-dan/${sid}_views.webp), [bóc lớp](ket-dan/${sid}_layers.webp), [chi tiết](ket-dan/${sid}_detail.webp) | ${PIECES.map((p) => `[${s.pieces[p].name.split(' (')[0]}](ket-dan/${sid}_${p}.webp)`).join(', ')} |`,
  )
  .join('\n')}
| **Kiếm Liệt Mạch** | dạng cuối +10 và vỏ | ${Object.values(SWORD.items).reduce((n, i) => n + Number(i.tris), 0)} | – | [dạng cuối](ket-dan/kiem_liet_mach_cuoi.webp), [vỏ](ket-dan/kiem_liet_mach_vo.webp) |

Ô **trang sức đầu** là ô trang bị mới (thứ 9, ẩn/hiện được), mỗi bộ có một món. Hộ uyển không vẽ riêng: nếu muốn, gộp vào áo ngoài.
`);
for (const [sid, set] of Object.entries(SETS)) {
  R.push(`
## ${set.name}

${set.method} · ${set.element} · cảm hứng: ${set.ref}.

![3 góc nhìn](ket-dan/${sid}_views.webp)

![Bóc lớp](ket-dan/${sid}_layers.webp)

![Chi tiết, bảng màu, chất liệu](ket-dan/${sid}_detail.webp)

**Bảng màu 3 kênh** (mặt nạ nhuộm của shader T-5 dùng đúng 3 kênh này):

| Kênh | Mã | Tên |
| --- | --- | --- |
${palRows(set)}

**Chất liệu:** ${set.materials}.

**Mảnh rời:**

| Mảnh | Ảnh | Tam giác | Xương gắn vào | Xương lò xo |
| --- | --- | --- | --- | --- |
${PIECES.map((p) => `| ${set.pieces[p].name} | [\`${sid}_${p}\`](ket-dan/${sid}_${p}.webp) | ${set.pieces[p].tris} | ${set.pieces[p].bones} | ${set.pieces[p].spring} |`).join('\n')}
`);
}
R.push(`
## Kiếm Liệt Mạch: dạng cuối +10 và vỏ

${SWORD.base}

| Mảnh | Ảnh | Tam giác | Gắn vào | Ghi chú |
| --- | --- | --- | --- | --- |
${Object.entries(SWORD.items)
  .map(
    ([iid, it]) =>
      `| ${it.name} | [\`kiem_liet_mach_${iid}\`](ket-dan/kiem_liet_mach_${iid}.webp) | ${it.tris} | ${it.bones} | ${it.notes} |`,
  )
  .join('\n')}

![Dạng cuối](ket-dan/kiem_liet_mach_cuoi.webp)

![Vỏ kiếm](ket-dan/kiem_liet_mach_vo.webp)

## Hướng dẫn dựng từng mảnh trên Tripo web

**Thứ tự:** làm trọn từng bộ rồi mới sang bộ sau (Liệt Mạch → Địa Long → Phục Mạch), rồi kiếm. Trong một bộ: 1) áo ngoài (quyết định dáng cả bộ; xong nên xem thử trước khi làm tiếp) → 2) lớp dưới → 3) vai giáp → 4) đai và tua → 5) ủng → 6) trang sức đầu.

Cho mỗi mảnh:

1. Mở ảnh nửa chính diện \`<DTL_ASSET_SOURCE>/<3d/nhan-vat|3d/vu-khi>/<id bộ>/concept/outfit_<id>_v01_front.png\` (đã cắt sẵn; nửa 3/4 là \`..._34.png\`, ảnh nguyên là \`..._v01.png\`).
2. Tripo web → **Image to 3D**, tải ảnh lên. Thiết lập: model **H3.1**, texture **Detailed**, **PBR** bật, **Smart Low-poly** bật, **Polycount** theo bảng tam giác của mảnh, không quad, **không rig** (pipeline T-5 tự gắn xương).
3. Dán prompt tiếng Anh của mảnh (trong [ket-dan/prompts.md](ket-dan/prompts.md), mục từng mảnh) vào ô mô tả thêm nếu có.
4. Kiểm kết quả: xoay đủ mọi hướng. **Làm lại** nếu: mảnh là một tấm mỏng không có chiều dày; dính liền với người hoặc ma-nơ-canh; thủng ở đáy hoặc cổ tay; hoa văn bị nhòe thành loang; vai giáp hay ủng lệch trái phải. Tripo cho phép thử lại nên chọn phương án tốt nhất.
5. Tải **GLB** về, lưu: \`<DTL_ASSET_SOURCE>/<3d/nhan-vat|3d/vu-khi>/<id bộ>/tripo/raw_<mảnh>_v01.glb\` (ví dụ \`chr/set_liet_mach_kiem_y/tripo/raw_ao_ngoai_v01.glb\`; kiếm: \`prop/prop_kiem_liet_mach/tripo/raw_cuoi_v01.glb\`, \`raw_vo_v01.glb\`). Lưu thêm task id Tripo vào file \`.txt\` cạnh GLB (để tải lại được).
6. Báo mình khi xong từng bộ; mình chạy pipeline T-5 (căn thân nền, trọng số xương, lồng đệm, xương lò xo, LOD, shader nhuộm 3 kênh) và gửi ảnh duyệt.

Id bộ và thư mục nguồn: ${Object.values(SETS)
  .map((s) => `\`${s.dir}/${s.srcId}\``)
  .join(', ')}, kiếm \`3d/vu-khi/${SWORD.srcId}\`. Các thư mục \`concept/\` đã chứa ảnh và prompt gốc.

**Mẹo:** mảnh xuyên sáng (voan, dải lụa của Phục Mạch) cứ dựng như vải mỏng đặc; worker sẽ đổi sang alpha-test hoặc dither. Đừng cố bắt Tripo làm trong suốt. Mảnh đối xứng (vai, ủng, bên trái và phải) chỉ cần dựng một cặp; không cần dựng riêng nam và nữ, pipeline fit theo từng thân nền.

## Dùng lại, không đụng tới

- Dạng gốc của Kiếm Liệt Mạch là model #119 có sẵn (\`prop_kiem_liet_mach\`), giữ nguyên cho +0…+9.
- Ảnh concept cũ \`docs/asset-concepts/set_*\` và các mẫu #119 vẫn dùng làm bản tạm cho tới khi mảnh mới vào (kế hoạch tổng mục 5).
`);
fs.writeFileSync(path.join(docDir, 'README.md'), R.join('\n'));

// 4. HTML xem nhanh
if (htmlDir) {
  fs.mkdirSync(htmlDir, { recursive: true });
  for (const id of have) fs.copyFileSync(path.join(imgDir, `${id}.webp`), path.join(htmlDir, `${id}.webp`));
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const card = (id, title, extra) =>
    `<div class="card"><h3>${esc(title)}</h3><a href="${id}.webp" target="_blank"><img loading="lazy" src="${id}.webp"></a>${extra ?? ''}</div>`;
  const piece = (id) => {
    const sp = specOf(id);
    return `<details><summary>Spec và prompt Tripo</summary><p><b>Tam giác:</b> ${sp.tris} · <b>Xương:</b> ${esc(sp.bones)}<br><b>Lò xo:</b> ${esc(sp.spring)}<br><b>Lưu ý:</b> ${esc(sp.notes)}</p><pre>${esc(tripoPrompt(id))}</pre><button onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent);this.textContent='Đã sao chép'">Sao chép prompt</button></details>`;
  };
  let body = '';
  for (const [sid, set] of Object.entries(SETS)) {
    body += `<h2>${esc(set.name)} <small>${esc(set.method)} · ${esc(set.element)}</small></h2>`;
    body += `<div class="pal">${set.palette.map((p) => `<span style="background:${p[1]}" title="${p[0]}"><i>${p[1]}<br>${esc(p[2])}</i></span>`).join('')}</div>`;
    body += `<div class="grid big">${['views', 'layers', 'detail']
      .filter((k) => have.includes(`${sid}_${k}`))
      .map((k) => card(`${sid}_${k}`, items[`${sid}_${k}`].title))
      .join('')}</div>`;
    body += `<h3>Mảnh rời</h3><div class="grid">${PIECES.filter((p) => have.includes(`${sid}_${p}`))
      .map((p) => card(`${sid}_${p}`, set.pieces[p].name, piece(`${sid}_${p}`)))
      .join('')}</div>`;
  }
  body += `<h2>Kiếm Liệt Mạch <small>dạng cuối +10 và vỏ</small></h2><div class="grid">${Object.keys(SWORD.items)
    .filter((i) => have.includes(`kiem_liet_mach_${i}`))
    .map((i) => card(`kiem_liet_mach_${i}`, SWORD.items[i].name, piece(`kiem_liet_mach_${i}`)))
    .join('')}</div>`;
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Concept trang phục Kết Đan (T-3)</title><style>
body{margin:0;background:#15201f;color:#e6ddcb;font:15px/1.5 system-ui,sans-serif;padding:24px 32px}h1{margin:0 0 4px}h2{margin:36px 0 8px;border-bottom:1px solid #ae8b49;padding-bottom:4px}h2 small{font-weight:400;color:#a9b8b0;font-size:.6em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px}.grid.big{grid-template-columns:repeat(auto-fill,minmax(640px,1fr))}.card{background:#1e2c2b;border:1px solid #3a4b49;border-radius:6px;padding:10px}.card h3{margin:0 0 8px;font-size:14px}img{width:100%;display:block;border-radius:4px}
.pal{display:flex;gap:8px;margin:8px 0 14px}.pal span{width:120px;height:56px;border-radius:4px;display:flex;align-items:flex-end;border:1px solid #0006}.pal i{font-style:normal;font-size:11px;background:#000a;color:#fff;width:100%;padding:1px 4px}
details{margin-top:8px;font-size:13px}pre{white-space:pre-wrap;background:#0f1716;padding:8px;border-radius:4px}button{background:#ae8b49;border:0;border-radius:4px;padding:4px 10px;cursor:pointer}</style>
<h1>Concept trang phục Kết Đan (T-3)</h1><p>Ba bộ bậc 2 (Liệt Mạch Kiếm Y, Địa Long Hộ Giáp, Phục Mạch Đan Bào) và dạng cuối + vỏ Kiếm Liệt Mạch. Bấm ảnh để xem cỡ lớn. Duyệt trước khi dựng trên Tripo.</p>${body}</html>`;
  fs.writeFileSync(path.join(htmlDir, 'index.html'), html);
  console.log('HTML:', path.join(htmlDir, 'index.html'));
}
