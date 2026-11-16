#!/usr/bin/env node
// Hậu kỳ concept trang phục bậc 4 (P3-concept) từ ảnh Codex đã sinh bởi outfit-p3-gen.mjs.
// Dùng: node tools/codex-assets/outfit-p3-doc.mjs
// Làm: nén WebP → docs/outfit-concepts-p3/<bộ>/; sao ảnh gốc + nửa chính diện (`_front.png`) + prompt vào <DTL_ASSET_SOURCE>/<chr|prop>/<id>/concept/ (CHỈ THÊM file, không ghi đè)
// và tạo thư mục tripo/ rỗng; viết docs/outfit-concepts-p3/README.md, prompts.md, huong-dan-tripo.md.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SETS, SWORD, build } from './outfit-p3-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const mainRoot = path.dirname(git.stdout.trim());
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(mainRoot, '../dtl-asset-source');
let sharp;
for (const dir of [root, mainRoot]) {
  try {
    sharp = createRequire(path.join(dir, 'tools/asset-pipeline/package.json'))('sharp');
    break;
  } catch {}
}
if (!sharp) throw new Error('Không tìm thấy sharp (chạy pnpm install)');

const items = build();
const docDir = path.join(root, 'docs/outfit-concepts-p3');
const srcImgDir = path.join(source, '2d/outfit_p3');
const PIECES = ['ao_ngoai', 'lop_duoi', 'vai_giap', 'dai_tua', 'ung', 'trang_suc_dau'];
const MODE = { ao_ngoai: 'HD Model', lop_duoi: 'HD Model', vai_giap: 'Smart Mesh', dai_tua: 'Smart Mesh', ung: 'Smart Mesh', trang_suc_dau: 'Smart Mesh', cuoi: 'HD Model', vo: 'Smart Mesh' };
const modeOf = (setId, p) => (setId === 'co_thanh' && p === 'vai_giap' ? 'HD Model (nhiều chi tiết khối)' : MODE[p]);
const winPath = (p) => p.replace(/\//g, '\\');
const rel = (...a) => a.join('/');

const have = (id) => fs.existsSync(path.join(srcImgDir, `${id}.png`));
const destDir = (o) => path.join(source, o.dir, o.srcId, 'concept');
const lines = [];

for (const [id, it] of Object.entries(items)) {
  if (!have(id)) continue;
  const png = path.join(srcImgDir, `${id}.png`);
  const o = it.kind === 'sword' ? SWORD : SETS[it.set];
  const setKey = it.kind === 'sword' ? 'kiem' : it.set;
  const name = it.kind === 'sword' ? `outfit_${id}` : `outfit_${id.replace(/^([a-z_]+?)_(sheet|ao_ngoai|lop_duoi|vai_giap|dai_tua|ung|trang_suc_dau)$/, '$1_$2')}`;
  fs.mkdirSync(path.join(docDir, setKey), { recursive: true });
  await sharp(png)
    .resize({ width: it.kind === 'sheet' ? 1600 : 1000, withoutEnlargement: true })
    .webp({ quality: it.kind === 'sheet' ? 86 : 82 })
    .toFile(path.join(docDir, setKey, `${id}.webp`));
  const d = destDir(o);
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(d, '..', 'tripo'), { recursive: true });
  const put = async (file, make) => {
    const f = path.join(d, file);
    if (fs.existsSync(f)) lines.push(`bỏ qua (đã có): ${f}`);
    else await make(f);
  };
  await put(`${name}_v01.png`, (f) => fs.promises.copyFile(png, f));
  await put(`${name}_v01.prompt.txt`, (f) => fs.promises.writeFile(f, it.prompt + '\n'));
  if (it.kind !== 'sheet') {
    const m = await sharp(png).metadata();
    const half = Math.floor(m.width / 2);
    await put(`${name}_v01_front.png`, (f) => sharp(png).extract({ left: 0, top: 0, width: half, height: m.height }).toFile(f));
  }
}
console.log(lines.join('\n') || 'ok');

const specOf = (id) => (items[id].kind === 'sword' ? SWORD.items[items[id].piece] : SETS[items[id].set].pieces[items[id].piece]);
const link = (setKey, id, text) => (have(id) ? `[${text}](${setKey}/${id}.webp)` : `${text} (chưa có ảnh)`);
const fileName = (id) => (items[id].kind === 'sword' ? `outfit_${id}` : `outfit_${id}`);

// README
let md = `# Concept trang phục bậc 4 Hóa Thần (gói P3-concept)

Gói concept để **bạn dựng từng mảnh trên Tripo web** (image-to-3D), không tốn credit API. Ba bộ bậc 4 của kế hoạch tổng trang phục và vũ khí (Thiên Khuyết Cổ Thành, Thần Tàng Điện), cộng dạng cuối +10 và vỏ của Tinh Khuyết Kiếm. Cùng định dạng gói bậc 2 ([T-3](../outfit-concepts/README.md)). Ảnh do Codex vẽ (\`node tools/codex-assets/outfit-p3-gen.mjs\`), dữ liệu và prompt ở \`tools/codex-assets/outfit-p3-data.mjs\`, hậu kỳ \`outfit-p3-doc.mjs\`.

**Chủ đề bậc 4:** hoàng giả cổ thành. Vàng cổ, sao đêm, choàng dài chấm đất, viền phân thân mờ (một đường chỉ nhạt chạy lệch ngoài mép vạt, như áo có bản sao; chỉ là họa tiết thêu, không dựng thành hình thứ hai). Bảng màu bậc: mực đêm + vàng cổ, tím sao chỉ là điểm nhỏ dưới 5% (đúng art bible 4.3). Cảm hứng lấy từ ảnh tham khảo bạn đã gửi (chỉ cấu trúc và tinh thần, không chép dáng, hoa văn, logo hay nhân vật nào; ảnh đó **không nằm trong repo**). Mẫu #119 Tinh Khuyết (\`docs/asset-concepts/set_tinh_khuyet_kiem_bao.webp\`) chỉ là bản tạm và tham chiếu dáng.

**Cần duyệt:** xem ảnh dưới đây. Bộ nào chưa ưng thì báo để vẽ lại trước khi bạn dựng. Mỗi mảnh dựng xong lưu GLB đúng nơi ở [huong-dan-tripo.md](huong-dan-tripo.md).

## Tổng quan

| Bộ | Công pháp, ngũ hành | Tổng tam giác 6 mảnh | Bảng thiết kế | Mảnh rời (ảnh nén) |
| --- | --- | --- | --- | --- |
`;
const total = (s) => Object.values(s.pieces).reduce((a, p) => a + Number(p.tris), 0);
for (const [sid, s] of Object.entries(SETS)) {
  md += `| **${s.name}** | ${s.method}, ${s.element} | ${total(s)} | ${link(sid, `${sid}_sheet`, 'bảng thiết kế')} | ${PIECES.map((p) => link(sid, `${sid}_${p}`, s.pieces[p].name)).join(', ')} |\n`;
}
md += `| **Tinh Khuyết Kiếm** | dạng cuối +10 và vỏ, dùng chung ba công pháp | ${Object.values(SWORD.items).reduce((a, p) => a + Number(p.tris), 0)} | – | ${Object.keys(SWORD.items).map((k) => link('kiem', `kiem_tinh_khuyet_${k}`, SWORD.items[k].name)).join(', ')} |

Ô **trang sức đầu** là ô trang bị thứ 9 (ẩn/hiện được), mỗi bộ có một món. Hộ uyển không vẽ riêng (gộp vào áo ngoài nếu cần).

`;
for (const [sid, s] of Object.entries(SETS)) {
  md += `
## ${s.name}

${s.method} · ${s.element} · cảm hứng: ${s.ref}.

${have(`${sid}_sheet`) ? `![Bảng thiết kế](${sid}/${sid}_sheet.webp)` : '(chưa có ảnh)'}

**Bảng màu 3 kênh** (mặt nạ nhuộm của shader T-5 dùng đúng 3 kênh đầu; kênh nhấn là vật liệu phát sáng riêng):

| Kênh | Mã | Tên |
| --- | --- | --- |
${s.palette.map(([k, c, n]) => `| ${k} | \`${c}\` | ${n} |`).join('\n')}

**Chất liệu:** ${s.materials}.

**Mảnh rời:**

| Mảnh | Ảnh | Tam giác | Xương gắn vào | Xương lò xo | Ghi chú |
| --- | --- | --- | --- | --- | --- |
${PIECES.map((p) => {
  const sp = s.pieces[p];
  return `| ${sp.name} | ${link(sid, `${sid}_${p}`, `\`${sid}_${p}\``)} | ${sp.tris} | ${sp.bones} | ${sp.spring} | ${sp.notes} |`;
}).join('\n')}

${PIECES.filter((p) => have(`${sid}_${p}`)).map((p) => `![${s.pieces[p].name}](${sid}/${sid}_${p}.webp)`).join('\n\n')}
`;
}
md += `
## Tinh Khuyết Kiếm: dạng cuối +10 và vỏ

${SWORD.base}

| Mảnh | Ảnh | Tam giác | Gắn vào | Ghi chú |
| --- | --- | --- | --- | --- |
${Object.entries(SWORD.items).map(([k, it]) => `| ${it.name} | ${link('kiem', `kiem_tinh_khuyet_${k}`, `\`kiem_tinh_khuyet_${k}\``)} | ${it.tris} | ${it.bones} | ${it.notes} |`).join('\n')}

${Object.keys(SWORD.items).filter((k) => have(`kiem_tinh_khuyet_${k}`)).map((k) => `![${SWORD.items[k].name}](kiem/kiem_tinh_khuyet_${k}.webp)`).join('\n\n')}

## Nơi lưu file nguồn (ngoài repo)

Ảnh gốc PNG, ảnh cắt chính diện và prompt nằm ở \`D:\\METAGRIT\\dtl-asset-source\\\`:

| Bộ | Thư mục concept | Thư mục tripo (GLB sẽ lưu vào) |
| --- | --- | --- |
${[...Object.values(SETS), SWORD].map((o) => `| ${o.name.replace(/ \(.*/, '')} | \`${winPath(`${o.dir}/${o.srcId}/concept`)}\` | \`${winPath(`${o.dir}/${o.srcId}/tripo`)}\` |`).join('\n')}

## Dùng lại, không đụng tới

- Dạng gốc của Tinh Khuyết Kiếm là model #119 có sẵn (\`prop_kiem_tinh_khuyet\`), giữ nguyên cho +0…+9. Không làm kiếm riêng cho Hộ pháp và Đan sư (đã chốt 16/11).
- Concept cũ \`docs/asset-concepts/set_tinh_khuyet_kiem_bao.webp\` và ảnh \`concept_34_v01.png\` trong thư mục nguồn vẫn là bản tạm cho tới khi mảnh mới vào.
`;
fs.mkdirSync(docDir, { recursive: true });
fs.writeFileSync(path.join(docDir, 'README.md'), md);

// prompts.md
const tripoPrompt = (id) => {
  const it = items[id];
  const sp = specOf(id);
  if (it.kind === 'sword')
    return `A single ${sp.look}. Isolated game prop, no hand, no person, clean geometry, hand-painted PBR materials, semi-realistic cinematic style, ink-night and dark crystal blade, old gold, silver edge, tiny violet star accents.`;
  const set = SETS[it.set];
  return `${sp.look.charAt(0).toUpperCase()}${sp.look.slice(1)}. Single isolated costume piece for a game character, no person, no mannequin, no body, clean separated geometry, hand-painted PBR materials, semi-realistic cinematic style, colors ${set.palette
    .slice(0, 3)
    .map((c) => c[1])
    .join(', ')}.`;
};
let pm = `# Prompt Tripo (dán vào ô mô tả thêm nếu có)\n\nTiếng Anh, không dấu, mỗi mảnh một đoạn. Ảnh tải lên luôn là \`_v01_front.png\`.\n`;
for (const [sid, s] of Object.entries(SETS)) {
  pm += `\n## ${s.name}\n`;
  for (const p of PIECES) pm += `\n**${s.pieces[p].name}** (\`${sid}_${p}\`)\n\n> ${tripoPrompt(`${sid}_${p}`)}\n`;
}
pm += `\n## Tinh Khuyết Kiếm\n`;
for (const k of Object.keys(SWORD.items)) pm += `\n**${SWORD.items[k].name}**\n\n> ${tripoPrompt(`kiem_tinh_khuyet_${k}`)}\n`;
fs.writeFileSync(path.join(docDir, 'prompts.md'), pm);

// huong-dan-tripo.md
const S = (o) => winPath(`D:/METAGRIT/dtl-asset-source/${o.dir}/${o.srcId}`);
let g = `# Hướng dẫn dựng trang phục bậc 4 và kiếm Tinh Khuyết trên Tripo (Image to 3D)

Áp dụng cho 3 bộ Hóa Thần và dạng cuối + vỏ của Tinh Khuyết Kiếm. Cùng cách làm [bảng bậc 2](../outfit-concepts/README.md) (bản gốc: \`huong-dan-tripo-trang-phuc-kiem.md\` của phiên điều phối). Thư mục nguồn: **\`D:\\METAGRIT\\dtl-asset-source\\\`**.

## Luôn dùng ảnh \`_front.png\`

Ảnh nguyên (\`..._v01.png\`) có 2 góc nhìn đặt cạnh nhau; Tripo hiểu là 2 vật và dựng ra 2 cái. Ảnh **\`..._v01_front.png\`** đã cắt sẵn, chỉ một góc chính diện. Ngoại lệ: **vai giáp** và **ủng** vốn là cặp trái và phải, ra 2 mảnh đối xứng là **đúng**.

## Thiết lập chung (mọi mảnh)

| Mục trên Tripo | Đặt |
| --- | --- |
| Chế độ | **Image to 3D**, biểu tượng **ảnh đơn** (ô đầu tiên). Không dùng ô nhiều ảnh |
| HD Model / Smart Mesh | Theo bảng từng mảnh bên dưới |
| AI Model | **H3.1 – Best Quality** |
| Generate in Parts | **Tắt** |
| 8K Texture | **Tắt** (texture mặc định khoảng 2K là đủ) |
| Geometry & Texture | Bật texture, bật PBR nếu có. Có ô giới hạn số mặt thì đặt theo cột "Số mặt" |
| Privacy | Private |
| Rig | **Không gắn xương** (pipeline của worker tự gắn) |
| Generate Multi-Views | Không cần; chỉ dùng khi mặt sau ra xấu |

**Kiểm tra trước khi tải.** Xoay đủ mọi hướng, **dựng lại** nếu: mảnh là tấm mỏng không có độ dày; dính liền với người hoặc ma-nơ-canh; thủng ở cổ, cổ tay, đáy; hoa văn nhòe thành vệt loang; hai bên trái phải lệch nhau.

**Xuất file:** Export → **GLB**. Lưu vào thư mục \`tripo\\\` của từng bộ, tên \`raw_<mảnh>_v01.glb\`, kèm \`raw_<mảnh>_v01.txt\` ghi task id Tripo. Dựng lại thì tăng phiên bản \`v02\`, \`v03\`.

## Thứ tự làm

1. Tinh Khuyết → Cổ Thành → Thần Tàng → kiếm.
2. Trong mỗi bộ: **áo ngoài trước** (quyết định dáng cả bộ), xong báo "xong áo ngoài <bộ>" để worker mặc thử lên nhân vật trước khi làm 5 mảnh còn lại.
3. Choàng dài là một phần của áo ngoài; nếu Tripo dính choàng vào thân thì dựng lại hoặc báo để tách.

`;
const bo = (s, sid, n) => {
  let t = `## Bộ ${n} · ${s.name} (${s.method})\n\nẢnh trong: \`${S(s)}\\concept\\\`\nLưu vào: \`${S(s)}\\tripo\\\`\n\n| # | Mảnh | Ảnh tải lên | Chế độ | Số mặt | Lưu thành |\n| --- | --- | --- | --- | --- | --- |\n`;
  PIECES.forEach((p, i) => {
    t += `| ${i + 1} | ${s.pieces[p].name} | \`outfit_${sid}_${p}_v01_front.png\` | ${modeOf(sid, p) === 'HD Model' ? '**HD Model**' : modeOf(sid, p).startsWith('HD') ? `**${modeOf(sid, p)}**` : modeOf(sid, p)} | ~${Number(s.pieces[p].tris).toLocaleString('vi-VN')} | \`raw_${p}_v01.glb\` |\n`;
  });
  return t + '\n';
};
Object.entries(SETS).forEach(([sid, s], i) => {
  g += bo(s, sid, i + 1);
  if (sid === 'than_tang') g += `**Choàng sao và dải lụa** (xuyên sáng, tối đa 2 mảnh của bộ) cứ dựng như vải mỏng đặc; worker sẽ đổi sang chất liệu xuyên sáng. Đừng bắt Tripo làm trong suốt.\n\n`;
  if (sid === 'tinh_khuyet') g += `Choàng dài và viền phân thân mờ: vải đặc, viền phân thân chỉ là đường chỉ nhạt trên texture, không cần tách mesh.\n\n`;
  if (sid === 'co_thanh') g += `Vai giáp hình lỗ châu mai tường thành là khối nổi thật; nếu Tripo ra tấm phẳng thì dựng lại bằng HD Model.\n\n`;
});
g += `## Tinh Khuyết Kiếm (dạng cuối +10 và vỏ)\n\nẢnh trong: \`${S(SWORD)}\\concept\\\`\nLưu vào: \`${S(SWORD)}\\tripo\\\` (thư mục đã có file cũ \`raw_v01.glb\` của #119: **không ghi đè**, tên mới có hậu tố mảnh)\n\n| Mảnh | Ảnh tải lên | Chế độ | Số mặt | Lưu thành |\n| --- | --- | --- | --- | --- |\n| Dạng cuối +10 | \`outfit_kiem_tinh_khuyet_cuoi_v01_front.png\` | **HD Model** | ~4.000 | \`raw_cuoi_v01.glb\` |\n| Vỏ kiếm | \`outfit_kiem_tinh_khuyet_vo_v01_front.png\` | Smart Mesh | ~1.500 | \`raw_vo_v01.glb\` |\n\nKiểm tra riêng cho kiếm: lưỡi thẳng, có độ dày, mũi nhọn; chắn sừng đối xứng hai bên, tia linh khí là sợi kim loại cong dựng cứng quanh chắn; chuôi tròn đều; vỏ kín và vừa dài với lưỡi. Một kiếm dùng chung cho Kiếm tu, Hộ pháp, Đan sư.\n\n## Mẹo\n\n- Mặc định chọn HD Model. Nếu ra quá nhiều mặt thì dùng **Retopo** giảm về khoảng số mặt trong bảng. Smart Mesh chỉ cho mảnh cứng nhỏ; ra thô quá thì dựng lại bằng HD.\n- Nam và nữ dùng chung một mảnh: pipeline tự căn theo thân nền từng giới.\n- Credit: mỗi lượt Generate trừ credit tài khoản của bạn; Free Retry dựng lại miễn phí một lần.\n- Xong mỗi bộ (hoặc chỉ áo ngoài) nhắn "xong áo ngoài Tinh Khuyết", v.v.; worker chạy pipeline T-5 và gửi ảnh duyệt.\n`;
fs.writeFileSync(path.join(docDir, 'huong-dan-tripo.md'), g);
console.log('docs ok');
