#!/usr/bin/env node
// Dựng tài liệu concept trang phục Nguyên Anh bậc 3 (P2-concept) từ outfit3-data.mjs + ảnh Codex (`node tools/codex-assets/gen.mjs outfit3`).
// Dùng: node tools/codex-assets/outfit3-doc.mjs
// Làm: nén ảnh → docs/outfit-concepts-p2/img/<id>.webp, viết docs/outfit-concepts-p2/README.md (kèm hướng dẫn Tripo) + img/prompts.md,
//      sao ảnh gốc + nửa chính diện/3-4 + prompt vào <DTL_ASSET_SOURCE>/<chr|prop>/<id>/concept/ (CHỈ THÊM file, không ghi đè), tạo thư mục tripo/ rỗng.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SETS, SWORD, build3 } from './outfit3-data.mjs';

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

const items = build3();
const docDir = path.join(root, 'docs/outfit-concepts-p2');
const imgDir = path.join(docDir, 'img');
fs.mkdirSync(imgDir, { recursive: true });
const srcImgDir = path.join(source, '2d/concept/outfit3');
const PIECES = ['ao_ngoai', 'lop_duoi', 'vai_giap', 'dai_tua', 'ung', 'trang_suc_dau'];
const SOLID = new Set(['lop_duoi', 'vai_giap', 'dai_tua', 'ung', 'trang_suc_dau']);
const specOf = (id) => (items[id].kind === 'sword' ? SWORD.items[items[id].piece] : SETS[items[id].set].pieces[items[id].piece]);
const ownerOf = (id) => (items[id].kind === 'sword' ? SWORD : SETS[items[id].set]);
const destDir = (id) => path.join(source, ownerOf(id).dir, ownerOf(id).srcId, 'concept');

const only = process.argv.slice(2); // tiền tố id cần xử lý (mặc định: tất cả), ví dụ: kinh_quang van_kinh
const have = [];
for (const id of Object.keys(items)) {
  if (only.length && !only.some((o) => id.startsWith(o))) continue;
  const png = path.join(srcImgDir, `${id}.png`);
  if (!fs.existsSync(png)) continue;
  have.push(id);
  const isSheet = items[id].kind === 'sheet';
  await sharp(png)
    .resize({ width: isSheet ? 1400 : 1000, withoutEnlargement: true })
    .webp({ quality: isSheet ? 80 : 76 })
    .toFile(path.join(imgDir, `${id}.webp`));
  const d = destDir(id);
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(d, '..', 'tripo'), { recursive: true });
  const put = async (name, make) => {
    const f = path.join(d, name);
    if (!fs.existsSync(f)) await make(f);
  };
  await put(`outfit_${id}_v01.png`, (f) => fs.promises.copyFile(png, f));
  await put(`outfit_${id}_v01.prompt.txt`, (f) => fs.promises.writeFile(f, items[id].prompt + '\n'));
  if (!isSheet) {
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

const tripoPrompt = (id) => {
  const sp = specOf(id);
  if (items[id].kind === 'sword')
    return `A single ${sp.look}. Isolated game prop, no hand, no person, clean geometry, hand-painted PBR materials, semi-realistic cinematic style, mirror-polished silver, cold blue accents.`;
  const set = SETS[items[id].set];
  return `${sp.look.charAt(0).toUpperCase()}${sp.look.slice(1)}. Single isolated costume piece for a game character, no person, no mannequin, no body, clean separated geometry, hand-painted PBR materials, semi-realistic cinematic style, colors ${set.palette
    .slice(0, 3)
    .map((p) => p[1])
    .join(', ')}.`;
};
const mode = (sid, pid) =>
  ['ao_ngoai', 'lop_duoi'].includes(pid) || (sid === 'van_kinh' && pid === 'vai_giap') ? '**HD Model**' : 'Smart Mesh';
const total = (set) => PIECES.reduce((n, p) => n + Number(set.pieces[p].tris), 0);
const ico = (b) => (b ? '✅' : '⏳');

// prompts.md
const T = [
  `# Prompt Tripo và spec từng mảnh (bộ Nguyên Anh bậc 3)\n\nẢnh đầu vào luôn là \`outfit_<id>_v01_front.png\` (một góc chính diện). Hướng dẫn từng bước: [../README.md](../README.md). Ngân sách mỗi nhân vật ≤ 18k tam giác (thân nền 6k + mảnh ≤ 13k), tối đa 2 mảnh xuyên sáng mỗi bộ.\n`,
];
for (const [sid, set] of Object.entries(SETS)) {
  T.push(`\n## ${set.name} (${set.method}, ${set.element})\n`);
  for (const pid of PIECES) {
    const p = set.pieces[pid];
    const id = `${sid}_${pid}`;
    T.push(
      `### ${p.name} · \`${id}\`\n\n![${id}](${id}.webp)\n\n- **Lưu GLB:** \`${set.dir}/${set.srcId}/tripo/raw_${pid}_v01.glb\`\n- **Xương gắn vào:** ${p.bones}\n- **Xương lò xo:** ${p.spring}\n- **Lưu ý khi dựng:** ${p.notes}\n\nPrompt (tùy chọn, dán vào ô mô tả thêm):\n\n\`\`\`text\n${tripoPrompt(id)}\n\`\`\`\n`,
    );
  }
}
T.push(`\n## ${SWORD.short}: dạng cuối +10 và vỏ\n\n${SWORD.base}\n`);
for (const iid of Object.keys(SWORD.items)) {
  const it = SWORD.items[iid];
  const id = `kiem_${SWORD.id}_${iid}`;
  T.push(
    `### ${it.name} · \`${id}\`\n\n![${id}](${id}.webp)\n\n- **Lưu GLB:** \`3d/vu-khi/${SWORD.srcId}/tripo/raw_${iid}_v01.glb\`\n- **Gắn vào:** ${it.bones}\n- **Xương lò xo:** ${it.spring}\n- **Lưu ý khi dựng:** ${it.notes}\n\n\`\`\`text\n${tripoPrompt(id)}\n\`\`\`\n`,
  );
}
fs.writeFileSync(path.join(imgDir, 'prompts.md'), T.join('\n'));

// README
const pal = (set) => set.palette.map((p) => `| ${p[0]} | \`${p[1]}\` | ${p[2]} |`).join('\n');
const win = (p) => p.replace(/\//g, '\\');
const R = [];
R.push(`# Concept trang phục Nguyên Anh bậc 3 (gói P2-concept)

Gói concept để **bạn dựng từng mảnh trên Tripo web** (image-to-3D), không tốn credit API; làm đúng khuôn gói Kết Đan ([../outfit-concepts/README.md](../outfit-concepts/README.md)). Ba bộ bậc 3 của kế hoạch tổng trang phục và vũ khí, cộng dạng cuối +10 và vỏ của Kính Quang Kiếm. Ảnh do Codex vẽ (\`node tools/codex-assets/gen.mjs outfit3\`, rồi \`node tools/codex-assets/outfit3-doc.mjs\`); dữ liệu và prompt ở \`tools/codex-assets/outfit3-data.mjs\`.

**Chủ đề bậc 3** (Vân Hải, Kính Nguyệt Cung): voan xuyên sáng, gương, bạc lạnh, quan đầu. Bảng màu bậc: trắng bạc + lam gương + bạc. Sáng và bắt mắt hơn tông môi trường. Cảm hứng lấy từ ảnh tham khảo bạn đã gửi (chỉ cấu trúc và tinh thần; không chép dáng, hoa văn, logo hay nhân vật nào; các ảnh đó **không nằm trong repo**). Mẫu #119 Kính Quang là bản tạm và tham chiếu dáng cho bộ Kính Quang.

**Cần duyệt:** xem ảnh trong README này. Bộ nào chưa ưng, báo mình vẽ lại trước khi bạn dựng.

## Tổng quan

| Bộ | Công pháp, ngũ hành | Tổng tam giác 6 mảnh | Bảng thiết kế | Mảnh rời |
| --- | --- | --- | --- | --- |
${Object.entries(SETS)
  .map(
    ([sid, s]) =>
      `| **${s.name}** | ${s.method}, ${s.element} | ${total(s)} | [3 góc](img/${sid}_views.webp), [bóc lớp](img/${sid}_layers.webp), [chi tiết](img/${sid}_detail.webp) | ${PIECES.map((p) => `[${s.pieces[p].name.split(' (')[0]}](img/${sid}_${p}.webp)`).join(', ')} |`,
  )
  .join('\n')}
| **${SWORD.short}** | dạng cuối +10 và vỏ | ${Object.values(SWORD.items).reduce((n, i) => n + Number(i.tris), 0)} | – | [dạng cuối](img/kiem_${SWORD.id}_cuoi.webp), [vỏ](img/kiem_${SWORD.id}_vo.webp) |

Ô **trang sức đầu** là ô trang bị thứ 9 (ẩn/hiện được), mỗi bộ có một món. Mỗi bậc **một kiếm chung** cho cả ba công pháp (đã chốt 16/11), không làm kiếm riêng cho Hộ pháp hay Đan sư.
`);
for (const [sid, set] of Object.entries(SETS)) {
  R.push(`
## ${set.name}

${set.method} · ${set.element} · cảm hứng: ${set.ref}.

![3 góc nhìn](img/${sid}_views.webp)

![Bóc lớp](img/${sid}_layers.webp)

![Chi tiết, bảng màu, chất liệu](img/${sid}_detail.webp)

**Bảng màu 3 kênh** (mặt nạ nhuộm của shader T-5 dùng đúng 3 kênh này):

| Kênh | Mã | Tên |
| --- | --- | --- |
${pal(set)}

**Chất liệu:** ${set.materials}.

**Mảnh rời** (mỗi mảnh một ảnh concept hai góc; ảnh tải lên Tripo là bản cắt \`_front\` chỉ một góc chính diện):

| Mảnh | Ảnh | Tam giác | Xương gắn vào | Xương lò xo |
| --- | --- | --- | --- | --- |
${PIECES.map((p) => `| ${set.pieces[p].name} | [\`${sid}_${p}\`](img/${sid}_${p}.webp) | ${set.pieces[p].tris} | ${set.pieces[p].bones} | ${set.pieces[p].spring} |`).join('\n')}
`);
}
R.push(`
## ${SWORD.short}: dạng cuối +10 và vỏ

${SWORD.base}

| Mảnh | Ảnh | Tam giác | Gắn vào | Ghi chú |
| --- | --- | --- | --- | --- |
${Object.entries(SWORD.items)
  .map(
    ([iid, it]) =>
      `| ${it.name} | [\`kiem_${SWORD.id}_${iid}\`](img/kiem_${SWORD.id}_${iid}.webp) | ${it.tris} | ${it.bones} | ${it.notes} |`,
  )
  .join('\n')}

![Dạng cuối](img/kiem_${SWORD.id}_cuoi.webp)

![Vỏ kiếm](img/kiem_${SWORD.id}_vo.webp)

# Hướng dẫn dựng trên Tripo (Image to 3D)

Thư mục nguồn: **\`D:\\METAGRIT\\dtl-asset-source\\\`**. Bài học từ Kết Đan: ảnh nguyên có 2 góc làm Tripo dựng ra 2 cái áo, nên **luôn dùng ảnh \`..._v01_front.png\`** (một góc chính diện, mảnh đứng riêng trên nền trơn sáng). Ngoại lệ hợp lệ: **vai giáp** và **ủng** vốn là một cặp trái-phải, ra 2 mảnh đối xứng là đúng.

## Thiết lập chung (mọi mảnh)

| Mục trên Tripo | Đặt |
| --- | --- |
| Chế độ | **Image to 3D**, ô **ảnh đơn** (ô đầu trong 4 ô). Không dùng nhiều ảnh |
| HD Model / Smart Mesh | Theo bảng từng mảnh bên dưới |
| AI Model | **H3.1 – Best Quality** |
| Generate in Parts | **Tắt** |
| 8K Texture | **Tắt** (texture mặc định ~2K là đủ) |
| Geometry & Texture | Bật texture, bật PBR; nếu có ô giới hạn số mặt (Face limit / Polycount) thì đặt theo cột "Số mặt" |
| Privacy | Private |
| Rig | **Không gắn xương** (pipeline tự gắn) |
| Generate Multi-Views | Không cần; chỉ dùng khi mặt sau ra xấu |

**Kiểm tra trước khi tải.** Xoay đủ mọi hướng, **dựng lại** nếu: mảnh là tấm mỏng không có độ dày; dính liền với người hoặc ma-nơ-canh; thủng ở cổ, cổ tay hoặc đáy; hoa văn nhòe thành vệt loang; hai bên trái phải lệch nhau; (chỉ bộ Lưu Ly và tay áo Kính Quang) đừng bắt Tripo làm trong suốt, voan cứ dựng như vải mỏng đặc, worker đổi sang alpha-test hoặc dither.

**Xuất file:** Export → **GLB**. Lưu vào thư mục \`tripo\\\` của từng bộ, tên \`raw_<mảnh>_v01.glb\`, kèm \`raw_<mảnh>_v01.txt\` ghi task id Tripo. Dựng lại thì tăng số phiên bản (\`v02\`, \`v03\`). **Mặc định HD Model**; ra quá nhiều mặt thì Retopo xuống gần số mặt trong bảng. Nam và nữ dùng chung một mảnh (pipeline căn theo từng thân nền).

## Thứ tự làm

1. Làm trọn từng bộ rồi mới sang bộ sau: **Kính Quang → Vân Kình → Lưu Ly → Kiếm**.
2. Trong mỗi bộ: **áo ngoài trước** (quyết định dáng cả bộ). Xong áo ngoài thì nhắn mình để mặc thử lên nhân vật trước khi làm 5 mảnh còn lại.
`);
const tbl = (sid, set, label) => `
## Bộ ${label} · ${set.name} (${set.method})

Ảnh trong: \`D:\\METAGRIT\\dtl-asset-source\\${win(set.dir)}\\${set.srcId}\\concept\\\`
Lưu vào: \`D:\\METAGRIT\\dtl-asset-source\\${win(set.dir)}\\${set.srcId}\\tripo\\\`

| # | Mảnh | Ảnh tải lên | Chế độ | Số mặt | Lưu thành |
| --- | --- | --- | --- | --- | --- |
${PIECES.map((p, i) => `| ${i + 1} | ${set.pieces[p].name}${['vai_giap', 'ung'].includes(p) ? ' (cặp)' : ''} | \`outfit_${sid}_${p}_v01_front.png\` | ${mode(sid, p)} | ~${Number(set.pieces[p].tris).toLocaleString('vi-VN')} | \`raw_${p}_v01.glb\` |`).join('\n')}
`;
Object.entries(SETS).forEach(([sid, set], i) => R.push(tbl(sid, set, i + 1)));
R.push(`
Lưu ý riêng: **Kính Quang** nửa dưới tay áo là voan (xuyên sáng thứ nhất), dựng mỏng đặc. **Vân Kình** vảy phải là khối nổi thật, vai là mảnh nặng nhất (HD Model). **Lưu Ly** voan choàng (áo ngoài) và dải lụa (đai) là hai mảnh xuyên sáng cho phép; hồ lô lưu ly dựng đặc màu lam nhạt.

## Kiếm · ${SWORD.short} (dạng cuối +10 và vỏ)

Ảnh trong: \`D:\\METAGRIT\\dtl-asset-source\\3d\\vu-khi\\${SWORD.srcId}\\concept\\\`
Lưu vào: \`D:\\METAGRIT\\dtl-asset-source\\3d\\vu-khi\\${SWORD.srcId}\\tripo\\\`

| Mảnh | Ảnh tải lên | Chế độ | Số mặt | Lưu thành |
| --- | --- | --- | --- | --- |
| Dạng cuối +10 | \`outfit_kiem_${SWORD.id}_cuoi_v01_front.png\` | **HD Model** | ~4.000 | \`raw_cuoi_v01.glb\` |
| Vỏ kiếm | \`outfit_kiem_${SWORD.id}_vo_v01_front.png\` | Smart Mesh | ~1.500 | \`raw_vo_v01.glb\` |

Kiểm tra riêng: lưỡi thẳng, có độ dày thật, mũi nhọn; chắn hình cánh dày vừa phải; chuôi tròn đều; vỏ kín và vừa dài với lưỡi. Dạng gốc dùng lại model #119, không dựng.

Prompt tiếng Anh tùy chọn và spec xương từng mảnh: [img/prompts.md](img/prompts.md).

## Trạng thái bàn giao

Đây là gói chỉ có ảnh concept; chưa có GLB nào (người dùng dựng trên Tripo web). Tiếp theo: bạn dựng, nhắn "xong áo ngoài Kính Quang" (v.v.), worker chạy pipeline T-5 và gửi ảnh duyệt.
`);
fs.writeFileSync(path.join(docDir, 'README.md'), R.join('\n'));
console.log('README + prompts.md xong');
