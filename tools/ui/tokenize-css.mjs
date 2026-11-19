// U2-9: chuyển mã màu viết cứng trong CSS về token --u-* mà KHÔNG đổi giá trị (hình giữ nguyên).
// Dùng: node tools/ui/tokenize-css.mjs <file.css>…  — màu trùng token có sẵn dùng lại token đó; màu còn lại thành
// token mới `--u-x-<giá trị>` ghi vào khối cuối ui/u2/tokens.css (gộp dần vào token ngữ nghĩa sau).
import fs from 'node:fs';
import postcss from 'postcss';
const TOK = 'apps/client/src/ui/u2/tokens.css';
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\([^()]*\)/g;
const HEAD = '/* ── U2-9: màu chuyển từ CSS cũ (tên theo giá trị; gộp dần vào token ngữ nghĩa) ── */';

/** Chuẩn hoá về khoá so sánh; null nếu không hiểu. */
function norm(c) {
  c = c.trim().toLowerCase();
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    if (h.length === 6) h += 'ff';
    if (h.length !== 8) return null;
    const [r, g, b, a] = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `${r},${g},${b},${+(a / 255).toFixed(3)}`;
  }
  const m = c.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!m) return null;
  let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return `${+m[1]},${+m[2]},${+m[3]},${+a.toFixed(3)}`;
}
const slug = (c) =>
  c
    .toLowerCase()
    .replace(/^#/, 'h')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

let tokCss = fs.readFileSync(TOK, 'utf8');
const byKey = new Map(); // khoá màu -> tên token
const root = postcss.parse(tokCss);
// Token mang nghĩa riêng (vòng focus bàn phím…) không được dùng lại chỉ vì trùng giá trị: đổi token đó sẽ âm thầm đổi chỗ dùng khác.
const NO_REUSE = new Set(['--u-focus']);
root.walkDecls(/^--u-/, (d) => {
  if (NO_REUSE.has(d.prop)) return;
  if (!/^(#[0-9a-f]+|rgba?\([^()]*\))$/i.test(d.value.trim())) return;
  const k = norm(d.value);
  if (k && !byKey.has(k)) byKey.set(k, d.prop);
});
const added = new Map(); // tên -> giá trị
const skipped = [];
for (const file of process.argv.slice(2)) {
  const css = postcss.parse(fs.readFileSync(file, 'utf8'));
  css.walkDecls((d) => {
    d.value = d.value.replace(COLOR, (c) => {
      const k = norm(c);
      if (!k) return (skipped.push(`${file}: ${c}`), c);
      let name = byKey.get(k);
      if (!name) {
        name = `--u-x-${slug(c)}`;
        byKey.set(k, name);
        added.set(name, c.trim());
      }
      return `var(${name})`;
    });
  });
  fs.writeFileSync(file, css.toString());
}
if (added.size) {
  if (!tokCss.includes(HEAD)) tokCss = tokCss.trimEnd() + `\n\n${HEAD}\n:root {\n}\n`;
  const lines = [...added].map(([n, v]) => `  ${n}: ${v};`).join('\n');
  const at = tokCss.indexOf('\n}\n', tokCss.indexOf(HEAD));
  tokCss = tokCss.slice(0, at) + '\n' + lines + tokCss.slice(at);
  fs.writeFileSync(TOK, tokCss);
}
console.log(`token mới: ${added.size}; bỏ qua: ${skipped.length}`);
skipped.forEach((s) => console.log('  skip', s));
