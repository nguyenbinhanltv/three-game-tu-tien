#!/usr/bin/env node
// Kiểm tương phản WCAG AA cho chữ thân của bộ giao diện Ngọc Giản (UI-5). Dùng: node tools/ui/contrast.mjs [--json]
// Mỗi dòng: chữ (màu, độ mờ) trên nền (giấy ngà / sơn mài) → tỉ lệ; chữ thân cần ≥ 4,5, chữ lớn/in đậm ≥ 3.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const mix = (fg, bg, a) => fg.map((v, i) => v * a + bg[i] * (1 - a));
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// nền: giấy ngà (sáng nhất / tối nhất của texture), sơn mài (sáng nhất của lớp phủ vân)
const PAPER = ['#ede3cc', '#dcd0b0'].map(hex);
const LAC = ['#1e1712', '#2c2119'].map(hex);
const rows = [];
const add = (name, fg, a, bgs, min = 4.5) => {
  const worst = Math.min(...bgs.map((bg) => ratio(mix(hex(fg), bg, a), bg)));
  rows.push({ name, fg, a, ratio: +worst.toFixed(2), min, ok: worst >= min });
};
// giấy ngà
add('giấy: chữ mực', '#2a2118', 1, PAPER);
add('giấy: chữ mực mờ (--ngj-ink-dim)', '#574a34', 1, PAPER);
add('giấy: tiêu đề nâu vàng', '#6b4d1c', 1, PAPER);
add('giấy: phẩm lục', '#3b6322', 1, PAPER);
add('giấy: phẩm lam', '#215a8a', 1, PAPER);
add('giấy: phẩm tím', '#5f35b3', 1, PAPER);
add('giấy: phẩm vàng', '#744b00', 1, PAPER);
add('giấy: tốt (xanh lá)', '#22633a', 1, PAPER);
add('giấy: xấu (đỏ)', '#8f2a21', 1, PAPER);
add('giấy: nhấn lam ngọc', '#145877', 1, PAPER);
add('giấy: nhấn ngọc bích', '#145f53', 1, PAPER);
// sơn mài
add('sơn mài: chữ ngà', '#ede3cc', 1, LAC);
add('sơn mài: ngà mờ 0,85', '#ede3cc', 0.85, LAC);
add('sơn mài: ngà mờ 0,78', '#ede3cc', 0.78, LAC);
add('sơn mài: ngà mờ 0,62 (phụ)', '#ede3cc', 0.62, LAC);
add('sơn mài: vàng sáng', '#f0d78e', 1, LAC);
add('sơn mài: vàng cổ', '#c9a45c', 1, LAC);
add('sơn mài: ngọc sáng', '#7fe3d0', 1, LAC);
add('sơn mài: đỏ sáng (cảnh báo)', '#e4624f', 1, LAC);
add('sơn mài: lục chat (loot)', '#9fd9a0', 1, LAC);
add('sơn mài: phẩm lục', '#b6dc96', 1, LAC);
add('sơn mài: phẩm lam', '#9ccdf0', 1, LAC);
add('sơn mài: phẩm tím', '#cfb3ff', 1, LAC);
// ── UI Kit 2.0 (U2-1): token ở apps/client/src/ui/u2/tokens.css ──
const G2 = ['#efe6d0', '#d8cba8'].map(hex); // --u-giay, --u-giay-lo
const I2 = ['#15110e', '#33281f'].map(hex); // --u-ink-1, --u-ink-3
add('U2 giấy: chữ mực --u-muc', '#2b2118', 1, G2);
add('U2 giấy: chữ phụ --u-muc-dim', '#5c4c34', 1, G2);
add('U2 tối: chữ --u-chu', '#efe6d0', 1, I2);
add('U2 tối: chữ phụ --u-chu-dim', '#bfae87', 1, I2);
add('U2 tối: kim --u-gold', '#e2b955', 1, I2);
add('U2 tối: ngọc --u-ngoc-hi', '#6fd6c1', 1, I2);
add('U2 tối: son sáng --u-son-hi', '#e8553f', 1, [I2[0]], 3);
add('U2 tab: chữ trên ngọc tối', '#d9fff5', 1, [hex('#17493f')]);
add('U2 tab chọn: chữ trên ngọc nhạt', '#08302a', 1, [hex('#5fd0bb')]);
add('U2 nút son: chữ', '#fff3c6', 1, [hex('#b3261e')]);
add('U2 tiêu đề cuộn: chữ kim trên ngọc', '#fff6cf', 1, [hex('#2f8f7f')], 3);
for (const r of rows) console.log(`${r.ok ? 'OK ' : 'LỖI'} ${String(r.ratio).padStart(5)} (≥${r.min})  ${r.name}`);
const bad = rows.filter((r) => !r.ok);
console.log(bad.length ? `\n${bad.length} cặp chưa đạt` : '\nTất cả đạt AA');
process.exitCode = bad.length ? 1 : 0;
