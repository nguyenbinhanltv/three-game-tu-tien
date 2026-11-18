#!/usr/bin/env node
// Đo độ to (LUFS, BS.1770-4) của từng bus theo bản build trong apps/client/public/audio và ghi bảng mức chuẩn (P2-D2).
//
//   node tools/audio/levels.mjs           in bảng
//   node tools/audio/levels.mjs --write   ghi docs/audio/levels.md
//   node tools/audio/levels.mjs --check   kiểm các quy tắc cân âm (thoát mã 1 nếu lệch), không ghi gì
//
// "Độ to hiệu dụng" = độ to của file × mức trộn của bus (apps/client/src/game/audio/audioMix.json) × gain của mục trong manifest,
// tức mức khi các thanh trượt người chơi ở 100%. SFX đo bằng độ to ngắn hạn lớn nhất (khối 100 ms: "độ to khi đánh"),
// nhạc và âm môi trường đo tích hợp trên cả bài/vòng lặp. Cần ffmpeg (xem common.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { decode, FFMPEG_HELP, findFfmpeg, HERE, ROOT } from './common.mjs';
import { loudness, momentaryMax } from './loopcore.mjs';

const OUT = path.join(ROOT, 'apps/client/public/audio');
const MIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/client/src/game/audio/audioMix.json'), 'utf8')).bus;
const DOC = path.join(ROOT, 'docs/audio/levels.md');

/** Nhóm SFX để so sánh theo vai trò. */
export const SFX_GROUPS = {
  'Đòn đánh': ['sword', 'slash', 'rain', 'hit', 'crit', 'hurt', 'block', 'impact'],
  'Xác nhận thành công': ['ascend', 'spellbreak', 'rare'],
  'Phép, kỹ năng': ['shield', 'heal', 'potion', 'cast', 'mcast', 'thunder', 'trib'],
  'Thế giới': ['death', 'respawn', 'portal', 'levelup', 'quest', 'craft', 'enhance', 'gather', 'fly'],
  'Bước chân': ['step_stone', 'step_grass', 'step_dirt', 'step_sand', 'step_wood', 'step_water'],
};
/** Cửa sổ đo SFX (giây): đủ ngắn để tiếng gõ/keng 0,1–0,3 s không bị pha loãng bởi khoảng lặng. */
const SFX_WINDOW = 0.1;
const db = (g) => 20 * Math.log10(g);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');

function pick(src) {
  const list = Array.isArray(src) ? src : [src];
  return list.find((s) => s.endsWith('.webm')) ?? list[0];
}

export function measure() {
  const ff = findFfmpeg();
  if (!ff) throw new Error(FFMPEG_HELP);
  const man = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const sprites = new Map();
  const spriteBuf = (name) => {
    if (!sprites.has(name)) {
      const s = man.sprites[name];
      sprites.set(name, decode(ff, path.join(OUT, pick(typeof s === 'object' && !Array.isArray(s) ? s.src : s)), 1)[0]);
    }
    return sprites.get(name);
  };
  const sr = 48000;
  const sfx = [];
  for (const [name, e] of Object.entries(man.sfx)) {
    const bus = e.bus ?? 'sfx';
    const per = e.variants.map((v) => {
      const a = spriteBuf(v.sprite);
      const clip = a.slice(Math.round(v.start * sr), Math.round((v.start + v.dur) * sr));
      return momentaryMax([clip], sr, SFX_WINDOW);
    });
    const lufs = mean(per);
    sfx.push({ name, bus, lufs, eff: lufs + db(MIX[bus] * (e.gain ?? 1)) });
  }
  const stream = (kind) => {
    const out = [];
    for (const [id, e] of Object.entries(man[kind] ?? {})) {
      const lufs = loudness(decode(ff, path.join(OUT, pick(e.src)), 2));
      out.push({ id, kind, lufs, eff: lufs + db(MIX[kind] * (e.gain ?? 1)), stem: !!e.stem, sting: id.startsWith('sting_') });
    }
    return out;
  };
  return { sfx, music: stream('music'), ambient: stream('ambient') };
}

/** Các quy tắc cân âm; trả danh sách {ok, text}. */
export function rules(r) {
  const grp = (g) => r.sfx.filter((s) => SFX_GROUPS[g].includes(s.name));
  const combat = mean(grp('Đòn đánh').map((s) => s.eff));
  const zones = r.music.filter((m) => !m.stem && !m.sting);
  const music = mean(zones.map((m) => m.eff));
  const amb = mean(r.ambient.map((a) => a.eff));
  const confirm = grp('Xác nhận thành công');
  const others = r.sfx.filter((s) => !SFX_GROUPS['Xác nhận thành công'].includes(s.name));
  const topOther = Math.max(...others.map((s) => s.eff));
  const lowConfirm = Math.min(...confirm.map((s) => s.eff));
  const steps = mean(grp('Bước chân').map((s) => s.eff));
  const rel = music - combat;
  return [
    { ok: rel >= -11.5 && rel <= -7.5, text: `Nhạc vùng so với đòn đánh: ${f1(rel)} dB (mục tiêu −9,5 dB ± 2, xấp xỉ 1/3 biên độ)` },
    { ok: amb <= music - 3, text: `Âm môi trường so với nhạc: ${f1(amb - music)} dB (phải thấp hơn nhạc ít nhất 3 dB)` },
    { ok: lowConfirm >= topOther + 0.5, text: `Nhóm xác nhận nổi nhất: yếu nhất ${f1(lowConfirm)} LUFS, SFX khác mạnh nhất ${f1(topOther)} LUFS (cần cao hơn ít nhất 0,5 dB)` },
    { ok: steps <= combat - 8, text: `Bước chân so với đòn đánh: ${f1(steps - combat)} dB (phải thấp hơn ít nhất 8 dB)` },
  ];
}

function table(rows, head) {
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

export function report(r) {
  const L = [];
  L.push('# Bảng mức chuẩn âm thanh (P2-D2)', '');
  L.push('Sinh bởi `pnpm audio:levels` (`tools/audio/levels.mjs`) từ bản build trong `apps/client/public/audio/`. Đừng sửa tay.', '');
  L.push(
    '**Độ to hiệu dụng** = độ to file (LUFS, BS.1770-4) × mức trộn bus × `gain` của mục trong manifest, tức mức khi thanh trượt người chơi ở 100%.',
    'SFX đo bằng độ to ngắn hạn lớn nhất (khối 100 ms, "độ to khi đánh"); nhạc và âm môi trường đo tích hợp cả bài/vòng lặp.',
    'Các số so sánh giữa SFX và nhạc là gần đúng (hai cách đo khác nhau), dùng để giữ tỉ lệ, không phải mức tuyệt đối khi nghe.',
    '',
  );
  L.push('## Mức trộn bus (`apps/client/src/game/audio/audioMix.json`)', '');
  L.push(table(Object.entries(MIX).map(([b, g]) => [`\`${b}\``, String(g), `${f1(db(g))} dB`]), ['Bus', 'Hệ số', 'dB']), '');
  L.push(
    'Chuỗi tín hiệu: nguồn → (panner) → bus → master. Nhạc đi thêm hai tầng hạ nhạc: `duck()` ngắn (sấm, đột phá, sting, phá chú) và `duckHold()` giữ lâu (hội thoại NPC, lời boss, thẻ chương); hai tầng nhân với nhau.',
    '',
  );
  L.push('## Quy tắc cân âm', '');
  for (const x of rules(r)) L.push(`- ${x.ok ? '✅' : '❌'} ${x.text}`);
  L.push('');
  L.push('## Theo bus', '');
  const busRows = [];
  const row = (label, xs) => busRows.push([label, f1(mean(xs.map((s) => s.lufs))), f1(mean(xs.map((s) => s.eff))), f1(Math.max(...xs.map((s) => s.eff)))]);
  for (const [g, names] of Object.entries(SFX_GROUPS)) row(`sfx — ${g}`, r.sfx.filter((s) => names.includes(s.name)));
  row('ui', r.sfx.filter((s) => s.bus === 'ui'));
  row('music — bài vùng', r.music.filter((m) => !m.stem && !m.sting));
  const stems = r.music.filter((m) => m.stem);
  if (stems.length) row('music — lớp giao chiến (stem)', stems);
  const stings = r.music.filter((m) => m.sting);
  if (stings.length) row('music — sting', stings);
  row('ambient', r.ambient);
  L.push(table(busRows, ['Nhóm', 'LUFS file (TB)', 'Hiệu dụng TB (LUFS)', 'Hiệu dụng lớn nhất']), '');
  L.push('## Chi tiết SFX (độ to ngắn hạn lớn nhất, khối 100 ms)', '');
  L.push(table(r.sfx.map((s) => [`\`${s.name}\``, s.bus, f1(s.lufs), f1(s.eff)]), ['Âm', 'Bus', 'File', 'Hiệu dụng']), '');
  L.push('## Chi tiết nhạc và âm môi trường (tích hợp)', '');
  L.push(table([...r.music, ...r.ambient].map((m) => [`\`${m.id}\``, m.kind, f1(m.lufs), f1(m.eff)]), ['Id', 'Bus', 'File', 'Hiệu dụng']), '');
  L.push(
    '## Cách cân lại',
    '',
    '1. Đổi mức trộn bus trong `audioMix.json`, hoặc `level` (dB) của từng âm trong `tools/audio/sounds.json`.',
    '2. `pnpm audio:build` (nếu đổi sounds.json), rồi `pnpm audio:levels` để ghi lại bảng này và kiểm quy tắc.',
    '3. `pnpm audio:check` chạy lại phần kiểm quy tắc (không ghi file).',
    '',
  );
  return L.join('\n');
}

function main() {
  const r = measure();
  const res = rules(r);
  if (process.argv.includes('--check')) {
    for (const x of res) console.log(`${x.ok ? 'OK ' : 'LỖI'} ${x.text}`);
    process.exit(res.every((x) => x.ok) ? 0 : 1);
  }
  const md = report(r);
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(DOC), { recursive: true });
    fs.writeFileSync(DOC, md + '\n');
    console.log(`đã ghi ${path.relative(ROOT, DOC)}`);
  } else console.log(md);
  for (const x of res) console.log(`${x.ok ? 'OK ' : 'LỖI'} ${x.text}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(HERE, 'levels.mjs')) main();
