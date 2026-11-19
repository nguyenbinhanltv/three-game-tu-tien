#!/usr/bin/env node
// Sinh tài liệu dựng hàng loạt v3 từ v3-sets-plan.mjs + v3-sets-data.mjs + thiết kế cũ (outfit*-data.mjs):
//   danh-sach-bo-v3.md (thứ tự, quy ước tên, trạng thái) và huong-dan-tripo-v3-tung-bo.md (cài đặt chung + từng bộ).
// Dùng: node tools/codex-assets/v3-sets-doc.mjs --out <thư mục tuyệt đối>
import fs from 'node:fs';
import path from 'node:path';
import { SETS as S1 } from './outfit-data.mjs';
import { SETS as S3 } from './outfit3-data.mjs';
import { SETS as S4 } from './outfit-p3-data.mjs';
import { V3_SETS } from './v3-sets-data.mjs';
import { V3_PLAN } from './v3-sets-plan.mjs';

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
if (!out) throw new Error('--out <thư mục>');
fs.mkdirSync(out, { recursive: true });
const OLD = { ...S1, ...S3, ...S4 };
const SRC = 'D:\\METAGRIT\\dtl-asset-source\\3d\\nhan-vat';
const bo = (id) => id.replace(/^set_/, '');
const WAVES = [
  ['Đợt 1: đồ khởi đầu + bậc 1', (s) => s.tier <= 1 && s.id !== 'set_lac_kiem'],
  ['Đợt 2: bậc 2 (Kết Đan, cấp 16–19)', (s) => s.tier === 2],
  ['Đợt 3: bậc 3 (Nguyên Anh, cấp 20–23)', (s) => s.tier === 3],
  ['Đợt 4: bậc 4 (Hóa Thần, cấp 24–27)', (s) => s.tier === 4],
  ['Đợt 5: bậc 5 (chương 5, cấp 28; chờ chốt thiết kế)', (s) => s.tier === 5],
];
const ST = { done: 'XONG (trong game)', concept: 'concept xong, chờ dựng', todo: 'chưa có concept' };
const hex = (s) => s.look.filter(Boolean).join(' · ');

// ---------- danh sách ----------
let md = `# Dựng hàng loạt nhân vật v3: danh sách bộ và thứ tự

Mục tiêu: mỗi bộ trang bị là **một model toàn thân có mặt (nam + nữ)** dựng trên Tripo web, nhập bằng \`tools/blender/chr_v3.py\`. Không dùng Tripo API.
Đã xong: **Lạc Kiếm Môn Phục** (v3b2) và 5 skin (Varkessa, Duskrella, Crimson, Kings Demon, Noxavyra). Còn **${V3_PLAN.filter((s) => s.status !== 'done').length} bộ = ${V3_PLAN.filter((s) => s.status !== 'done').length * 2} model**.

## Quy ước tên và đường dẫn (chỉ THÊM file, không ghi đè)
| | |
| --- | --- |
| Concept (ảnh đầu vào) | \`${SRC}\\<set_id>\\concept\\v3_<nam|nu>_<front|side|back>.png\` (+ \`.prompt.txt\` cạnh ảnh) |
| Model Tripo (GLB có texture, không xương) | \`${SRC}\\<set_id>\\tripo\\raw_v3_<bo>_<nam|nu>.glb\` (\`<bo>\` = set_id bỏ tiền tố \`set_\`, ví dụ \`raw_v3_huyen_giap_nam.glb\`) |
| Cấu hình nhập | MỘT file \`tools/blender/skins/v3sets/<bo>.json\` (sao chép từ \`_template_ao_dai.json\` / \`_template_giap.json\` / \`_template_de_tu.json\`) |

## Thứ tự dựng (theo thứ tự người chơi gặp)
`;
for (const [title, f] of WAVES) {
  const rows = V3_PLAN.filter(f);
  md += `\n### ${title}: ${rows.length} bộ = ${rows.length * 2} model\n\n| # | Bộ (id) | Nhánh | Mở ở | Nguồn | Màu chính · viền · ánh | Trạng thái | File Tripo |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  for (const s of rows) {
    const n = V3_PLAN.indexOf(s) + 0;
    md += `| ${n} | **${s.nameVi}** (\`${s.id}\`) | ${s.branch} | ${s.cap} | ${s.src}${s.pieces ? `, ${s.pieces} món` : ''} | ${hex(s)} | ${ST[s.status]} | \`raw_v3_${bo(s.id)}_nam.glb\`, \`raw_v3_${bo(s.id)}_nu.glb\` |\n`;
  }
}
md += `
## Nhập một bộ mới chỉ bằng MỘT file JSON
1. Dựng 2 model, đặt vào \`...\\<set_id>\\tripo\\\` đúng tên ở trên.
2. Sao chép mẫu: \`tools/blender/skins/v3sets/_template_ao_dai.json\` (Kiếm tu, Đan sư; vạt dài xẻ hai bên), \`_template_giap.json\` (Hộ pháp; tấm giáp trước/sau tới gối), hoặc \`_template_de_tu.json\`, thành \`tools/blender/skins/v3sets/<bo>.json\`; sửa \`set\`, \`name\`, \`raw\`, \`height\` (nam 1,84, nữ 1,70 m là mặc định).
3. \`node tools/blender/v3-newset.mjs <bo>\` (tạo meta.json + dòng LICENSES) rồi \`DTL_ASSET_SOURCE=… pnpm assets:build --only chr_v3_<bo>_nam\` và \`..._nu\` (job \`chr_v3_<bo>_<giới>\` do \`run.mjs\` sinh từ file JSON). \`pnpm assets:validate\` kiểm ngân sách.
4. Đo xuyên thân/ảnh tờ khung bằng \`springMetrics\` và \`pnpm shots chrv3 --six\` như các bộ trước (xem \`docs/chr-v3-arm/README.md\`).
Đã thử đường này bằng model Lạc Kiếm v3b làm "bộ giả": nhập, build, validate đều đạt (0 lỗi).

## Sinh concept cho đợt kế
Concept 3 bộ đầu đã sinh (xem \`huong-dan-tripo-v3-tung-bo.md\`). Bộ khác: thêm mục vào \`tools/codex-assets/v3-sets-data.mjs\` (mô tả trang phục theo luật v3b, mặt riêng cho từng bộ) rồi \`node tools/codex-assets/chr-v3-sets-gen.mjs --sets set_liet_mach,…\` (Codex tích hợp công cụ ảnh, không tốn credit Tripo).
`;
fs.writeFileSync(path.join(out, 'danh-sach-bo-v3.md'), md);

// ---------- hướng dẫn ----------
let g = `# Hướng dẫn dựng từng bộ v3 trên Tripo web

Cùng cách làm với \`huong-dan-tripo-v3b.md\` (Lạc Kiếm). Phần chung ở đây; phần riêng từng bộ ở dưới (ảnh đầu vào, màu, tên file, lưu ý tay áo/vạt/phụ kiện).

## Cài đặt chung (mọi bộ, nam và nữ làm riêng)
1. Tripo web → **Image to 3D** → **Multi-view** (front, side, back), tải đúng 3 ảnh vào đúng ô.
2. **HD / Ultra**, **PBR bật**, **Auto-rig TẮT**, giữ pose chữ A theo ảnh (đừng bật "ép T-pose"), **Triangle**, **40.000–60.000 mặt**, texture cao nhất, xuất **GLB có texture, không xương**.
3. Thử lại tối đa 3 lần với cùng ảnh nếu hình sai; vẫn lỗi thì báo để chỉnh concept. Giữ bản mặt đẹp nhất.
4. Lưu đúng tên và thư mục (xem từng bộ). **Chỉ thêm file, không ghi đè** file cũ.

## Tự kiểm trước khi gửi (xoay 360°)
- **Khe nách rõ**, tay không dính sườn/vai giáp; **có khe giữa hai chân**.
- **Vạt/tấm giáp đối xứng trái–phải**, xẻ hai bên (hoặc hai tấm trước/sau tách rời); không có mảnh vải/tua/sợi/hồ lô/túi treo lệch một bên; không lớp vải chồng lên một chân.
- Tay áo vừa phải, không loe rộng/bồng; vai giáp gọn, không chạm cổ hay đầu.
- Mặt rõ, hai mắt cân; tóc không dính vào áo/vai giáp.
- Không kiếm, vỏ kiếm, vật cầm; bàn tay mở; chân chạm đáy khung, không có bục.

## Bài học từ Lạc Kiếm (áp cho mọi bộ)
| Thấy gì ở model | Nguyên nhân hay gặp | Làm gì |
| --- | --- | --- |
| Tay áo đâm vào thân khi chạy/ngồi | Tay áo rộng đè lên áo ngực ở vai–nách | Tay áo vừa; game có \`ARM_FIT\` bù dang tay nhưng không cứu được tay áo quá rộng |
| Vạt rách, mảnh vải lệch một đùi | Concept có mảnh treo/đuôi lệch | Dựng lại; concept đã bỏ mọi mảnh treo |
| Một mắt khép / mặt méo | Lỗi dựng mặt | Dựng lại, giữ bản đẹp nhất |
| Vai giáp dính cổ/đầu | Vai giáp quá lớn | Dựng lại; báo để thu nhỏ trong concept |
| Hai chân dính nhau bởi váy | Váy liền | Dựng lại; báo để xẻ rộng hơn |
`;
for (const [title, f] of WAVES) {
  g += `\n---\n\n## ${title}\n`;
  for (const s of V3_PLAN.filter(f)) {
    const d = V3_SETS[s.id];
    const old = s.key ? OLD[s.key] : null;
    g += `\n### ${s.nameVi} (\`${s.id}\`, ${s.branch}, ${s.cap})\n`;
    g += `- **Màu (giữ để item/chỉ số/nhuộm không đổi)**: chính \`${s.look[0]}\`, viền \`${s.look[1]}\`${s.look[2] ? `, ánh vũ khí \`${s.look[2]}\`` : ''}.\n`;
    if (old) g += `- **Bảng màu thiết kế cũ**: ${old.palette.map((p) => `${p[0]} \`${p[1]}\` (${p[2]})`).join('; ')}.\n`;
    g += `- **Trạng thái concept**: ${ST[s.status]}.\n`;
    if (s.status === 'concept') {
      g += `- **Ảnh đầu vào** \`${SRC}\\${d.folder}\\concept\\\`: nam \`v3_nam_front.png\`, \`v3_nam_side.png\`, \`v3_nam_back.png\`; nữ \`v3_nu_front.png\`, \`v3_nu_side.png\`, \`v3_nu_back.png\` (prompt gốc: \`*.prompt.txt\` cạnh ảnh).\n`;
    } else if (s.status === 'todo') {
      g += `- **Ảnh đầu vào**: chưa sinh (sinh khi tới lượt: thêm mục vào \`v3-sets-data.mjs\`, chạy \`chr-v3-sets-gen.mjs --sets ${s.id}\`).\n`;
    }
    g += `- **Lưu file**: \`${SRC}\\${s.id}\\tripo\\raw_v3_${bo(s.id)}_nam.glb\` và \`raw_v3_${bo(s.id)}_nu.glb\`.\n`;
    if (s.keep.length) g += `- **Giữ**: ${s.keep.join('; ')}.\n`;
    const notes = [...(d?.guide ?? []), ...s.fix];
    if (notes.length) g += `- **Lưu ý riêng (tay áo, vạt, phụ kiện)**:\n${notes.map((n) => `  - ${n}`).join('\n')}\n`;
    if (d)
      g += `- **Mặt/tóc**: mỗi bộ một mặt riêng, xem ảnh concept (mô tả gốc trong \`v3_<nam|nu>_front.prompt.txt\`); dựng giống ảnh, nhất quán giữa các góc.
`;
    else
      g += `- **Mặt/tóc**: chưa chốt (mỗi bộ một mặt riêng theo model Tripo; sẽ ghi trong concept khi sinh).
`;
    g += `- **Kiểu dáng cấu hình nhập**: ${s.branch === 'Hộ pháp' ? '`_template_giap.json`' : s.id === 'set_de_tu' ? '`_template_de_tu.json`' : '`_template_ao_dai.json`'}.\n`;
  }
}
g += `\n---\n\n## Sau khi dựng\nGửi lại hai file mỗi bộ (hoặc cứ đặt vào thư mục \`tripo\` rồi báo); mình nhập bằng \`chr_v3.py\` (mỗi bộ một file \`skins/v3sets/<bo>.json\`), đo xuyên thân và quay video so với bản ghép hiện tại để bạn duyệt.\n`;
fs.writeFileSync(path.join(out, 'huong-dan-tripo-v3-tung-bo.md'), g);
console.log('ok', out);
