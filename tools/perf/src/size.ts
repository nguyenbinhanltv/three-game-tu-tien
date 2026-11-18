// pnpm size: đo tổng tải trước khi vào game (bản build ở apps/client/dist) so với ngân sách tải đầu.
//
// "Tải đầu" = những gì trình duyệt phải kéo về từ lúc mở trang tới lúc đứng trong thế giới:
//   - HTML, JS/CSS khởi động (script/link trong index.html, gồm cả modulepreload), tính theo gzip
//   - font (preload trong HTML và @font-face trong CSS khởi động)
//   - asset 3D nạp ở màn tải qua AssetCache: assets/manifest.json + mọi id gọi `assets.acquire('<id>'`
//     bằng chuỗi hằng trong apps/client/src (trừ trang viewer)
//   - bảng icon HUD (bảng vật phẩm nạp lười khi mở Túi)
//   - âm thanh nạp đầu: audio/manifest.json + sprite SFX không `lazy` (audio.ts tải trước byte khi không tắt tiếng)
// Âm thanh tính theo từng định dạng (webm cho Chrome/Firefox/Edge, m4a cho Safari); ngân sách so với định dạng nặng hơn.
// Phần nạp sau khi vào (âm môi trường, nhạc, sprite lazy, chunk JS động, GLB khác) in riêng, không cộng vào ngân sách.
//
// Kết quả: bảng ra stdout và JSON ở bench/results/size-<ngày>.json. Thoát mã 1 nếu vượt ngân sách.
// Cờ: --build (build lại trước khi đo), --budget-mb <n> (mặc định 30).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { at } from '@dtl/shared';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIST = path.join(ROOT, 'apps/client/dist');
const CLIENT_SRC = path.join(ROOT, 'apps/client/src');
const OUT_DIR = path.join(ROOT, 'bench/results');

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const BUDGET_MB = Number(opt('--budget-mb', '30'));
const MB = 1024 * 1024;

type Entry = { group: string; file: string; bytes: number; wire: number; note?: string };
type Profile = 'webm' | 'm4a';

if (flag('--build') || !fs.existsSync(path.join(DIST, 'index.html'))) {
  console.log('[size] build client (pnpm build)…');
  execSync('pnpm build', { cwd: ROOT, stdio: 'inherit' });
}

const distFile = (url: string) => path.join(DIST, decodeURIComponent(at(url.replace(/^\//, '').split(/[?#]/), 0)));
const TEXT = /\.(js|mjs|css|html|json|svg|wasm)$/i;

/** Byte trên dây: gzip mức 9 cho file văn bản/wasm (CDN nén), nguyên kích thước cho file đã nén sẵn (glb, webm, woff2, webp…). */
function measure(group: string, rel: string, note?: string): Entry {
  const abs = distFile(rel);
  if (!fs.existsSync(abs)) throw new Error(`thiếu file ${rel} trong dist (build cũ? chạy lại với --build)`);
  const buf = fs.readFileSync(abs);
  const wire = TEXT.test(rel) ? zlib.gzipSync(buf, { level: 9 }).length : buf.length;
  return { group, file: rel.replace(/^\//, ''), bytes: buf.length, wire, ...(note ? { note } : {}) };
}

// ---------- HTML + JS/CSS khởi động ----------
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const boot: Entry[] = [measure('html', '/index.html')];
const bootUrls = new Set<string>();
for (const m of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) bootUrls.add(at(m, 1));
for (const m of html.matchAll(/<link[^>]*\brel="(?:stylesheet|modulepreload)"[^>]*\bhref="([^"]+)"/g)) bootUrls.add(at(m, 1));
for (const m of html.matchAll(/<link[^>]*\bhref="([^"]+)"[^>]*\brel="(?:stylesheet|modulepreload)"/g)) bootUrls.add(at(m, 1));
for (const u of bootUrls) boot.push(measure(u.endsWith('.css') ? 'css' : 'js', u));

// ---------- font ----------
const fontUrls = new Set<string>();
const cssText = [html, ...[...bootUrls].filter((u) => u.endsWith('.css')).map((u) => fs.readFileSync(distFile(u), 'utf8'))];
for (const text of cssText) {
  for (const m of text.matchAll(/url\(\s*['"]?(\/?fonts\/[^'")]+)['"]?\s*\)/g)) fontUrls.add('/' + at(m, 1).replace(/^\//, ''));
}
for (const m of html.matchAll(/<link[^>]*\bas="font"[^>]*\bhref="([^"]+)"|<link[^>]*\bhref="([^"]+)"[^>]*\bas="font"/g)) {
  const u = m[1] ?? m[2];
  if (u) fontUrls.add(u);
}
for (const u of fontUrls) boot.push(measure('font', u));

// ---------- asset 3D (AssetCache) ----------
type AssetManifest = { assets: Record<string, { file: string; bytes: number }> };
const assetManifest = JSON.parse(fs.readFileSync(path.join(DIST, 'assets/manifest.json'), 'utf8')) as AssetManifest;
boot.push(measure('asset', '/assets/manifest.json'));

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'viewer') walk(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const bootAssetIds = new Map<string, string[]>();
for (const f of walk(CLIENT_SRC)) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bassets\.acquire\(\s*['"]([\w-]+)['"]/g)) {
    const list = bootAssetIds.get(at(m, 1)) ?? [];
    list.push(path.relative(CLIENT_SRC, f).replace(/\\/g, '/'));
    bootAssetIds.set(at(m, 1), list);
  }
}
for (const [id, from] of bootAssetIds) {
  const a = assetManifest.assets[id];
  if (!a) throw new Error(`asset "${id}" (gọi trong ${from.join(', ')}) không có trong manifest`);
  boot.push(measure('asset', '/assets/' + a.file, `${id} ← ${[...new Set(from)].join(', ')}`));
}

// ---------- icon UI ----------
const iconsJson = path.join(DIST, 'assets/ui/icons.json');
if (fs.existsSync(iconsJson)) {
  boot.push(measure('ui', '/assets/ui/icons.json'));
  boot.push(
    measure(
      'ui',
      '/assets/ui/' + (JSON.parse(fs.readFileSync(iconsJson, 'utf8')) as { sheets: { hud: { file: string } } }).sheets.hud.file,
    ),
  );
}

// ---------- âm thanh ----------
type Src = string | string[];
type SpriteSrc = Src | { src: Src; lazy?: boolean };
type AudioManifest = {
  sprites?: Record<string, SpriteSrc>;
  sfx?: Record<string, { variants?: { file?: Src }[] }>;
  ambient?: Record<string, { src: Src }>;
  music?: Record<string, { src: Src }>;
};
const audioPath = path.join(DIST, 'audio/manifest.json');
const audio: AudioManifest = fs.existsSync(audioPath) ? JSON.parse(fs.readFileSync(audioPath, 'utf8')) : {};
if (fs.existsSync(audioPath)) boot.push(measure('audio', '/audio/manifest.json'));

const pick = (src: Src, profile: Profile): string => {
  const list = Array.isArray(src) ? src : [src];
  return list.find((s) => s.endsWith('.' + profile)) ?? at(list, 0);
};
/** Bài nhạc phát trước khi vào game (apps/client/src/ui/App.tsx): tính vào tải đầu. */
const PRE_GAME_MUSIC = new Set(['title']);
const audioBoot: Record<Profile, Entry[]> = { webm: [], m4a: [] };
const audioLater: Record<Profile, Entry[]> = { webm: [], m4a: [] };
for (const profile of ['webm', 'm4a'] as Profile[]) {
  for (const [name, s] of Object.entries(audio.sprites ?? {})) {
    const lazy = typeof s === 'object' && !Array.isArray(s) && !!s.lazy;
    const src = typeof s === 'object' && !Array.isArray(s) ? s.src : s;
    (lazy ? audioLater : audioBoot)[profile].push(
      measure('audio', '/audio/' + pick(src, profile), (lazy ? 'sprite lazy ' : 'sprite ') + name),
    );
  }
  const loose = new Set<string>();
  for (const e of Object.values(audio.sfx ?? {})) for (const v of e.variants ?? []) if (v.file) loose.add(pick(v.file, profile));
  for (const f of loose) audioBoot[profile].push(measure('audio', '/audio/' + f, 'sfx lẻ'));
  for (const [kind, table] of [
    ['ambient', audio.ambient],
    ['music', audio.music],
  ] as const) {
    for (const [id, e] of Object.entries(table ?? {})) {
      // Nhạc chủ đề phát ở màn đăng nhập/màn tải (App.tsx) nên tải trước khi vào game.
      const pre = kind === 'music' && PRE_GAME_MUSIC.has(id);
      (pre ? audioBoot : audioLater)[profile].push(
        measure('audio', '/audio/' + pick(e.src, profile), `${kind} ${id}${pre ? ' (màn tiêu đề)' : ''}`),
      );
    }
  }
}

// ---------- phần nạp sau khi vào ----------
const later: Entry[] = [];
const bootFiles = new Set(boot.map((e) => e.file));
for (const f of fs.readdirSync(path.join(DIST, 'assets'))) {
  const rel = '/assets/' + f;
  if (bootFiles.has(rel.slice(1)) || fs.statSync(distFile(rel)).isDirectory()) continue;
  if (/\.(js|css|wasm)$/.test(f)) later.push(measure('js-lazy', rel, 'chunk động'));
  else if (f.endsWith('.glb')) {
    const id = Object.values(assetManifest.assets).find((a) => a.file === f);
    later.push(measure('asset-lazy', rel, id ? 'theo nhu cầu' : 'không có trong manifest (không nạp)'));
  }
}

// ---------- tổng hợp ----------
const sum = (list: Entry[], k: 'bytes' | 'wire' = 'wire') => list.reduce((s, e) => s + e[k], 0);
const profiles = (['webm', 'm4a'] as Profile[]).map((p) => ({ profile: p, wire: sum(boot) + sum(audioBoot[p]) }));
const worst = profiles.reduce((a, b) => (b.wire > a.wire ? b : a));
const budget = BUDGET_MB * MB;
const groups = new Map<string, { files: number; bytes: number; wire: number }>();
for (const e of [...boot, ...audioBoot[worst.profile]]) {
  const g = groups.get(e.group) ?? { files: 0, bytes: 0, wire: 0 };
  g.files++;
  g.bytes += e.bytes;
  g.wire += e.wire;
  groups.set(e.group, g);
}

const fmt = (n: number) => (n >= MB ? (n / MB).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB');
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const lpad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const row = (a: string, b: string, c: string, d = '') => console.log(pad(a, 52) + lpad(b, 12) + lpad(c, 12) + '  ' + d);

console.log(`\nTải đầu trước khi vào game (apps/client/dist, âm thanh theo ${worst.profile}):\n`);
row('file', 'gốc', 'trên dây', 'ghi chú');
row('-'.repeat(50), '-'.repeat(10), '-'.repeat(10));
for (const e of [...boot, ...audioBoot[worst.profile]]) row(e.file, fmt(e.bytes), fmt(e.wire), e.note ?? e.group);
console.log('\nTheo nhóm:');
for (const [g, v] of groups) row(`  ${g} (${v.files} file)`, fmt(v.bytes), fmt(v.wire));
for (const p of profiles) row(`  TỔNG tải đầu, âm thanh ${p.profile}`, '', fmt(p.wire));
const pct = ((worst.wire / budget) * 100).toFixed(1);
const ok = worst.wire <= budget;
console.log(`\nNgân sách tải đầu: ${fmt(worst.wire)} / ${BUDGET_MB} MB (${pct}%) → ${ok ? 'ĐẠT' : 'VƯỢT'}`);

const laterAll = [...later, ...audioLater[worst.profile]];
console.log(`\nNạp sau khi vào (không tính vào ngân sách): ${fmt(sum(laterAll))}`);
for (const e of laterAll) row('  ' + e.file, fmt(e.bytes), fmt(e.wire), e.note ?? e.group);

let gitSha = '';
try {
  gitSha = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
} catch {
  /* không có git */
}
const date = new Date();
const day = date.toLocaleDateString('sv-SE'); // YYYY-MM-DD theo giờ máy
const result = {
  kind: 'size',
  date: date.toISOString(),
  git: gitSha,
  budgetBytes: budget,
  ok,
  totalWire: worst.wire,
  audioProfile: worst.profile,
  profiles,
  groups: Object.fromEntries(groups),
  boot: [...boot, ...audioBoot[worst.profile]],
  audioBootByProfile: audioBoot,
  later: laterAll,
};
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `size-${day}.json`);
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(`\nĐã lưu ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
process.exit(ok ? 0 : 1);
