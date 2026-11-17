#!/usr/bin/env node
// UI-0 "Ngọc Giản Kim Văn": sinh bảng phong cách + mockup UI bằng Codex (codex exec + công cụ ảnh tích hợp, không Tripo, không API key).
// Dùng: node tools/codex-assets/ui-ngoc-gian-gen.mjs [id…] [--jobs 2] [--force]
// Ra: <DTL_ASSET_SOURCE>/2d/ui-ngoc-gian/<id>.png + <id>.prompt.txt. Chỉ ảnh duyệt, không vào game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const jobs = Number(flag('--jobs', '2'));
const force = args.includes('--force');
const ids = args.filter((a) => !a.startsWith('--'));

const TOKENS = 'Palette: antique gold #C9A45C (thin double-line filigree), ivory paper #EDE3CC, jade green #3E9C8F (scrolling cloud ornaments), warm lacquer brown-black #1E1712.';
const STYLE = `Original east-asian cultivation-fantasy game UI design, refined and elegant, crisp vector-like clean edges with subtle material texture, original design not copied from any existing game or artwork. ${TOKENS}`;
const MATA = 'Material A "dark lacquer": warm brown-black (#1E1712) semi-transparent lacquer with a very faint lacquer grain, double thin gold lines, small star-and-moon filigree corners, a soft inner glow along the gold edge.';
const MATB = 'Material B "ivory cloud-pattern paper": ivory silk-grain paper (#EDE3CC), border of curling jade-green (#3E9C8F) auspicious clouds with a thin gold line, small jade bead accents at corners.';
const TEXT_RULE = 'Any text must be spelled EXACTLY as given, with correct Vietnamese diacritics. If you are not sure you can render a word correctly, leave that label blank or use abstract placeholder strokes instead. No watermark, no logo, no signature, no purple, no neon.';
const wide = 'Landscape 16:9 image.';

const S = {
  'style-01-chat-lieu-goc': {
    ref: [],
    prompt: `Use case: ui-design. UI STYLE SHEET page 1 of 5, flat front view, on a neutral dark charcoal background, tidy labeled-by-layout (no text needed) presentation. ${STYLE}
Show: LEFT half = two large panel swatches stacked: (top) ${MATA} a rounded-chamfer HUD panel with a faint game scenery glimpse behind it to show transparency; (bottom) ${MATB} a larger panel with jade cloud border.
RIGHT half = a grid of 8 ornamental corner pieces on dark squares: 4 gold filigree corners for lacquer panels (star, crescent moon, tiny sun, double line) and 4 jade cloud + gold corners for ivory panels. Plus two horizontal divider ornaments (gold line with central diamond; jade cloud scroll line).
${wide} ${TEXT_RULE} No text at all on this page.`,
  },
  'style-02-bang-ten': {
    ref: [],
    prompt: `Use case: ui-design. UI STYLE SHEET page 2 of 5: title cartouches (name plates), flat front view on neutral dark charcoal background. ${STYLE}
Show three large horizontal double-line cartouches on ivory cloud-pattern paper, each with a different minimalist landscape motif in its center-left and a blank center for a title:
1) "Van Lam" mountains: layered misty blue-green peaks, a small sun, pine silhouettes, jade cloud border.
2) "Doan Mach" rust-red clay canyon: stepped red-ochre cliffs, a crescent moon, dry reeds, gold border with ochre accents.
3) "Van Hai" floating cloud islands: small islands floating on swirling clouds, a bird, pale gold sun, jade+white cloud border.
Under each large cartouche show a smaller version (narrow banner) and a small lacquer-dark version of the same motif for HUD. Beneath all: one narrow banner (wide ribbon with tiny pavilion roof and cloud, for breakthrough announcements), in dark lacquer with gold.
Cartouche title area: write the Vietnamese titles exactly "Vân Lam Sơn Mạch", "Đoạn Mạch Cổ Cốc", "Vân Hải Phù Đảo" in a serif display type, one per large cartouche; if you cannot render these perfectly leave them blank.
${wide} ${TEXT_RULE}`,
  },
  'style-03-thanh-phan': {
    ref: [],
    prompt: `Use case: ui-design. UI STYLE SHEET page 3 of 5: control components, flat front view on neutral dark charcoal background, clean grid layout. ${STYLE}
Show, grouped in a tidy grid, each in BOTH materials where relevant (dark lacquer ${MATA.slice(0, 60)}… and ivory cloud paper):
- Buttons: primary (solid gold-lacquer gradient, dark text), secondary (jade outline), ghost/line (thin gold line only), disabled (greyed), each with small notched corners and a tiny star/moon accent; labels exactly "Nâng cấp", "Xác nhận", "Hủy".
- Item slots: diamond (rhombus) slot, round slot with gold ring, octagonal skill slot; each shown empty, filled with a small generic glowing item, selected (gold glow), and with quality rim glow in green / blue / violet / gold (glowing border, not solid fill).
- Bars: a health bar (crimson) and a spirit-energy bar (jade-teal) with ornamental gold end-caps (pointed filigree cap on left, small jewel on right), and a thin experience bar; show half-filled.
- A vertical tab rail with 5 small icon tabs (one selected with a glowing gold diamond marker).
- A tooltip card in dark lacquer with a gold double border, title line, divider with diamond, three stat lines, and a colored quality rim.
- A small close "x" button and a small scroll bar.
${wide} ${TEXT_RULE}`,
  },
  'style-04-icon-he-thong': {
    ref: [],
    prompt: `Use case: ui-design. UI STYLE SHEET page 4 of 5: a set of exactly 16 system icons, in a 4x4 grid, each icon centered in a dark lacquer rounded-octagon tile, all drawn in the SAME thin antique-gold (#C9A45C) line style with a uniform stroke width, minimalist, with tiny jade (#3E9C8F) dot accents. ${STYLE}
Icons (left-to-right, top-to-bottom): 1 meditation (sitting figure on lotus), 2 flying sword, 3 bag/pouch, 4 character (person bust), 5 martial method (open scroll with sword), 6 party (three small figures), 7 quest (scroll with seal), 8 world map (compass with mountains), 9 settings (gear with cloud), 10 mail/letter, 11 shop (coin pouch), 12 alchemy furnace (small cauldron with smoke), 13 forge (anvil and hammer), 14 spirit stone (hexagonal crystal), 15 head accessory (hair crown with a jade pin, NOT an emoji crown), 16 close/back (x in diamond).
Each icon must be a clean line icon, no emoji, no photo, no filled color blocks, consistent weight, readable at 32px. ${wide} No text at all.`,
  },
  'style-05-chu-trien-canh-gioi': {
    ref: [],
    prompt: `Use case: ui-design. UI STYLE SHEET page 5 of 5: seal-script (zhuan/triện style) numerals and realm names. ${STYLE}
Top half: a row of nine antique-gold seal-script (Chinese small-seal style) digits 1 to 9 (一二三四五六七八九 in archaic seal script), large, each carved into a small dark lacquer square plaque with gold double border, and below it a smaller modern serif Arabic numeral 1–9 for pairing.
Bottom half: three wide plaques (ivory cloud paper, jade border) showing realm labels: left "Ngưng Khí" with a big seal-script numeral beside it, middle "Trúc Cơ", right "Kết Đan", plus a smaller row of two chapter plaques "Chương 1" and "Chương 2" in dark lacquer with a gold seal-script numeral. Seal-script glyph forms: invent faithful archaic-looking strokes; two thin gold concentric circles in the background.
Vietnamese text exactly as quoted; if not sure, leave blank. ${wide} ${TEXT_RULE}`,
  },
  'mock-hud-lac-kiem': {
    ref: ['docs/ui-tutien/hud-1920.jpg'],
    prompt: `Use case: ui-mockup. Redesign the in-game HUD shown in the attached screenshot (an existing 3D game scene: Lac Kiem sect courtyard). KEEP the 3D scene, camera, character and composition exactly as in the attached image, and only redraw the HUD elements on top in the new "dark lacquer" style. ${STYLE}
${MATA}
HUD elements (same positions as the current game, upgraded):
- Top-left character frame: round-octagon ornamental portrait ring (small head icon) beside name "Outm517" and "Ngưng Khí tầng 12", crimson health bar and jade-teal energy bar with gold ornamental end-caps, thin experience bar below.
- Top-right minimap in a circular compass-like gold double ring with star and moon corner ornaments, with the label cartouche "Lạc Kiếm Tông" under it (small dark lacquer cartouche, mountain motif).
- Bottom-center skill bar: 9 octagonal skill slots in a dark lacquer strip with gold double line, slots 1-6 filled with glowing teal/gold skill icons, 7-9 empty with a small plus.
- Below it a row of small round system buttons with thin gold line icons (meditate, sword, bag, character, method, party, quest) each with a key letter chip.
- Left-middle quest tracker: a small dark lacquer plate titled "Nhiệm vụ" with one quest line "Tìm Lạc Vân nhân" and a progress "0/1".
- Bottom-left chat box: translucent dark lacquer, three lines of chat text, input row "Nhấn Enter để nói…".
Clean, high-contrast readable on the bright scene. ${wide} ${TEXT_RULE}`,
  },
  'mock-hud-van-hai': {
    ref: ['docs/e3i-art/sau/e3i-toan-canh-dao.jpg'],
    prompt: `Use case: ui-mockup. Overlay a new in-game HUD on the attached screenshot of a 3D game scene (Van Hai floating cloud islands). KEEP the 3D scene exactly as the attached image and only add the HUD in the new "dark lacquer" style. ${STYLE}
${MATA}
HUD elements:
- Top-left character frame with octagonal portrait ring, name "Outm517", "Kết Đan tầng 1", crimson health bar and jade-teal energy bar with ornamental gold end-caps, thin xp bar.
- Top-right circular minimap with gold double ring, star/moon corners; under it a small dark lacquer cartouche with a floating-island-and-cloud motif reading "Vân Hải Phù Đảo".
- Left-middle quest tracker plate "Nhiệm vụ" with a title line "Lên Mây" and a progress "1/3".
- Bottom-center skill bar of 9 octagonal slots (filled with glowing teal/gold icons) and a row of small round system buttons with thin gold line icons.
- Bottom-left translucent lacquer chat box with two short lines.
- A boss health bar at top-center: wide ornate gold-framed crimson bar with the name "Vân Hải Kình Vương".
Readable on a bright scene. ${wide} ${TEXT_RULE}`,
  },
  'mock-bang-nhan-vat': {
    ref: ['docs/outfits-ket-dan/bang_liet_mach_m.jpg'],
    prompt: `Use case: ui-mockup. Redesign the Character panel shown in the attached screenshot (keep the same information layout, same 3D character in the middle, the same scene behind it). Output a game screenshot at 16:9 where the panel is a large centered window in "Material B ivory cloud-pattern paper": ${MATB}
${STYLE}
Panel details:
- Title cartouche at the top: a double-line plate with a tiny mountain-and-cloud motif, text "Nhân vật"; under it small subtitle "Outm517 · Ngưng Khí tầng 12 · Lực chiến 1.233". Close button as a small gold diamond with x.
- Left vertical tab rail with 3 small gold-line icons and tab labels "Tổng quan", "Thuộc tính", "Bộ trang bị".
- Middle: the 3D character (keep the attached character render, standing on a faint concentric gold circle ring on the paper background, thin concentric circles like a compass).
- Equipment slots: DIAMOND-shaped (rhombus) slots with a thin gold ring, 5 on the left, 4 on the right of the character, filled with generic glowing item icons, some empty; the head-accessory slot at the bottom-left shows a gold line icon of a hair crown with jade pin (NOT an emoji, no crown emoji); labels under slots (small serif): "Pháp kiếm", "Hộ uyển", "Đai lưng", "Giới chỉ", "Trang sức đầu", "Đạo bào", "Vân ngoa", "Ngọc bội", "Pháp bảo phụ".
- Bottom: crimson health and jade energy bars with gold end-caps, xp bar, then a two-column stat list with thin gold dotted leaders: "Công kích 94", "Phòng ngự 104", "Tỉ lệ bạo kích 17,4%", "Sát thương bạo kích 198,6%".
- Keep the dark-lacquer HUD (top-left frame, minimap, skill bar) visible around, restyled as Material A.
${wide} ${TEXT_RULE}`,
  },
  'mock-chon-cong-phap': {
    ref: ['docs/p3-5/panel-cong-phap-kiem.png'],
    prompt: `Use case: ui-mockup. Full-screen "choose your cultivation method" screen as a card carousel, 16:9. ${STYLE}
Background: dark warm brown-black (#1E1712) with very large thin concentric gold circles (compass / formation rings) centered behind the middle card, soft golden mist, a few drifting gold particles, and faint cracks of light.
Three tall vertical cards (taller than wide, antique-gold engraved double border, ivory paper inset with jade cloud corner ornaments): the CENTER card is selected, much larger, glowing with a gold halo, and shows a large line-art emblem of a flying sword over mountains; the LEFT and RIGHT cards are smaller, dimmed and slightly blurred (emblems: a vajra bell / body guard, and a jade alchemy furnace). A small "new" tag on the right card.
Card titles in serif: center "Lạc Kiếm Quyết" with subtitle "Kiếm tu"; left "Bất Động Kim Thân" with "Hộ pháp"; right "Thanh Mộc Đan Kinh" with "Đan sư".
Left side: a large dark-gold seal-script numeral "一" in a vertical plaque; top: a title cartouche "Chọn công pháp"; right column (dark lacquer panel with gold double line) with a short description block and 3 small octagonal skill slots with gold line icons, and a primary gold button "Tu luyện" at the bottom; a left vertical rail of Roman numerals I II III.
${wide} ${TEXT_RULE}`,
  },
};

const outDir = path.join(source, '2d', 'ui-ngoc-gian');
fs.mkdirSync(outDir, { recursive: true });
const todo = (ids.length ? ids : Object.keys(S)).filter((id) => {
  if (!S[id]) throw new Error(`Không có: ${id}`);
  return force || !fs.existsSync(path.join(outDir, `${id}.png`));
});
console.log(`ui-ngoc-gian: ${todo.length}/${Object.keys(S).length} ảnh, ${jobs} luồng → ${outDir}`);

const runOne = (id) =>
  new Promise((resolve) => {
    const { prompt, ref } = S[id];
    fs.writeFileSync(path.join(outDir, `${id}.prompt.txt`), prompt + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below${ref.length ? ' (the attached image(s) are the current game screenshot to restyle)' : ''}, then copy the generated PNG to ./${id}.png in the current directory (shell copy). Do nothing else.\n\n${prompt}\n`;
    const imgArgs = ref.flatMap((r) => ['-i', path.resolve(root, r)]);
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', outDir, ...imgArgs, '-'], {
      stdio: ['pipe', 'ignore', 'ignore'],
      shell: process.platform === 'win32',
    });
    p.stdin.end(body);
    const timer = setTimeout(() => p.kill(), 10 * 60_000);
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code) console.log(`  ${id}: codex thoát mã ${code}`);
      resolve(fs.existsSync(path.join(outDir, `${id}.png`)));
    });
  });

let next = 0;
const failed = [];
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < todo.length) {
      const id = todo[next++];
      let done = false;
      for (let attempt = 0; attempt < 2 && !done; attempt++) {
        if (force || attempt) fs.rmSync(path.join(outDir, `${id}.png`), { force: true });
        done = await runOne(id);
      }
      if (!done) failed.push(id);
      console.log(`${done ? 'OK ' : 'LỖI'} ${id}`);
    }
  }),
);
if (failed.length) {
  console.log('Thất bại:', failed.join(' '));
  process.exitCode = 1;
}
