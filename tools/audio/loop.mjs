#!/usr/bin/env node
// Hậu kỳ nhạc nền (M0-5, M4-10): cắt vòng lặp liền, chuẩn hóa độ to, mã hóa Opus + AAC, ghi manifest và ghi nguồn.
//
//   node tools/audio/loop.mjs                 xử lý mọi bài có file nguồn, ghi apps/client/public/audio/music/ + manifest.json (mục music)
//                                            + khối "Nhạc nền" trong assets/LICENSES.md
//   node tools/audio/loop.mjs --check         chỉ kiểm khai báo, liệt kê bài đã có/chưa có nguồn (không cần ffmpeg, không ghi gì)
//   node tools/audio/loop.mjs --only sect,combat   chỉ xử lý các bài này (bài khác giữ nguyên trong manifest)
//   node tools/audio/loop.mjs --preview       thêm file WAV nghe thử chỗ nối (6 s cuối + 6 s đầu, lặp 2 lần) vào thư mục tạm
//   Cho test: --spec <music.json> --out <thư mục audio> --licenses <LICENSES.md>; DTL_ASSET_SOURCE=<thư mục nguồn>.
//
// Đầu vào: tools/audio/music.json + <DTL_ASSET_SOURCE>/audio/music/<id>.mp3 (không commit; nhạc Suno tải về).
// Xử lý (DSP ở loopcore.mjs): giải mã 48 kHz stereo → dò nhịp và phần có nhạc (bỏ lặng đầu, đuôi fade-out)
// → chọn điểm vòng theo ô nhịp, khớp pha, điểm qua 0 → crossfade đoạn nối (mặc định 120 ms)
// → chuẩn hóa -16 LUFS, đỉnh thực ≤ -1 dBTP → Opus/WebM 96 kbps + AAC/M4A 128 kbps, tên file theo hash.
// Bài `loop: false` (sting) chỉ cắt lặng và chuẩn hóa.
//
// Ghi nguồn: Suno bản free chỉ cho dùng phi thương mại và bắt buộc ghi nguồn. Mỗi bài có `credit` trong manifest
// (mục "Nguồn nhạc" trong Cài đặt đọc trường này) và một dòng trong assets/LICENSES.md.
// Bài chưa có file nguồn: giữ nguyên mục cũ trong manifest nếu có (không xóa nhạc đã build).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decode, encode, FFMPEG_HELP, findFfmpeg, hashName, HERE, localDate, replaceBlock, ROOT, SR, sourceRoot } from './common.mjs';
import { applyGain, findLoop, loudness, makeLoop, normalizeGain, seamReport, trimOneShot, truePeak } from './loopcore.mjs';

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const CHECK = argv.includes('--check');
const PREVIEW = argv.includes('--preview');
const ONLY = arg('--only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const SPEC_FILE = path.resolve(arg('--spec') ?? path.join(HERE, 'music.json'));
const OUT_DIR = path.resolve(arg('--out') ?? path.join(ROOT, 'apps/client/public/audio'));
const MUSIC_DIR = path.join(OUT_DIR, 'music');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const LICENSES = path.resolve(arg('--licenses') ?? path.join(ROOT, 'assets/LICENSES.md'));
const LIC_BEGIN = '<!-- music:begin (sinh bởi tools/audio/loop.mjs, đừng sửa tay) -->';
const LIC_END = '<!-- music:end -->';
const EXTS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg'];
const ID_RE = /^[a-z0-9_]+$/;

function sourceOf(id, def) {
  const dir = path.join(sourceRoot(), 'audio', 'music');
  if (def.file) return path.join(dir, def.file);
  for (const e of EXTS) {
    const p = path.join(dir, id + e);
    if (fs.existsSync(p)) return p;
  }
  return path.join(dir, id + '.mp3');
}

function credit(def, d) {
  const c = { title: def.title ?? undefined, by: def.by ?? d.by, license: def.license ?? d.license };
  if (def.url) c.url = def.url;
  return c;
}

function wav(chans) {
  const ch = chans.length;
  const n = chans[0].length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * ch * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767))), 44 + (i * ch + c) * 2);
  return buf;
}

/** 6 s cuối + 6 s đầu, hai lần liền: nghe chỗ nối mà không phải chờ hết bài. */
function seamPreview(chans) {
  const k = Math.min(6 * SR, Math.floor(chans[0].length / 2));
  return chans.map((a) => {
    const seg = new Float32Array(k * 2);
    seg.set(a.subarray(a.length - k), 0);
    seg.set(a.subarray(0, k), k);
    const out = new Float32Array(seg.length * 2);
    out.set(seg, 0);
    out.set(seg, seg.length);
    return out;
  });
}

function processTrack(FF, id, def, d) {
  const src = sourceOf(id, def);
  let chans = decode(FF, src, 2);
  const info = { id, src: path.relative(sourceRoot(), src).replaceAll('\\', '/'), srcDur: chans[0].length / SR };
  const loop = def.loop !== false;
  if (loop) {
    const r = findLoop(chans, { bpm: def.bpm, beatsPerBar: def.beatsPerBar, start: def.start, end: def.end, minLen: def.minLen, maxLen: def.maxLen, xfade: def.xfade ?? d.xfade }, SR);
    chans = makeLoop(chans, r.start, r.end, Math.round((def.xfade ?? d.xfade) * SR), r.corr);
    Object.assign(info, { start: r.start / SR, end: r.end / SR, bpm: r.bpm, conf: r.confidence, sim: r.score, corr: r.corr, bars: r.bars });
  } else {
    // Sting cắt từ một bài dài: start/end (giây) chọn đoạn, rồi bỏ lặng và fade cuối.
    if (def.start !== undefined || def.end !== undefined) {
      const s = Math.round((def.start ?? 0) * SR);
      const e = def.end !== undefined ? Math.round(def.end * SR) : chans[0].length;
      chans = chans.map((a) => a.slice(s, e));
      const fi = Math.min(chans[0].length, Math.round(0.005 * SR));
      if (s > 0) for (const a of chans) for (let i = 0; i < fi; i++) a[i] *= i / fi;
    }
    chans = trimOneShot(chans, SR);
  }
  const n = normalizeGain(chans, def.lufs ?? d.lufs, def.peak ?? d.peak, SR);
  applyGain(chans, n.gainDb);
  Object.assign(info, { dur: chans[0].length / SR, lufsIn: n.before, gainDb: n.gainDb, limited: n.limited, lufs: loudness(chans, SR), tp: truePeak(chans), loop });
  if (loop) Object.assign(info, seamReport(chans, SR));
  return { chans, info };
}

function licenseBlock(spec, entries) {
  const d = spec.defaults ?? {};
  const lines = [LIC_BEGIN, '', '### Nhạc nền', ''];
  lines.push(
    'Nhạc tạo bằng **Suno gói Free**: chỉ dùng **phi thương mại**, Suno giữ quyền sở hữu, **bắt buộc ghi nguồn** (game cũng ghi ở Cài đặt → Nguồn nhạc).',
    'File nguồn nằm ở `../dtl-asset-source/audio/music/`, khai báo ở `tools/audio/music.json`, hậu kỳ (cắt vòng, -16 LUFS) bằng `tools/audio/loop.mjs`. Bản build trong `apps/client/public/audio/music/`.',
    '',
    '| Bài | Tên | Nguồn | Giấy phép | Ngày | Link |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const [id, e] of Object.entries(entries)) {
    const c = e.credit ?? {};
    lines.push(`| \`${id}\` | ${c.title ?? id} | ${c.by ?? d.by} | ${c.license ?? d.license} | ${e.date ?? localDate()} | ${c.url ?? '(chưa điền url)'} |`);
  }
  lines.push('', LIC_END);
  return lines.join('\n');
}

function main() {
  const spec = JSON.parse(fs.readFileSync(SPEC_FILE, 'utf8'));
  const d = { lufs: -16, peak: -1, xfade: 0.12, by: 'Suno (free, non-commercial)', license: 'phi thương mại, ghi nguồn', ...(spec.defaults ?? {}) };
  const tracks = spec.tracks ?? {};
  const errors = [];
  for (const [id, def] of Object.entries(tracks)) {
    if (!ID_RE.test(id)) errors.push(`${id}: id chỉ gồm a-z, 0-9, _`);
    if (!def.title) errors.push(`${id}: thiếu title`);
    if (def.xfade !== undefined && (def.xfade < 0.01 || def.xfade > 0.5)) errors.push(`${id}: xfade nên trong 0,01–0,5 s`);
    if (def.start !== undefined && def.end !== undefined && def.end <= def.start) errors.push(`${id}: end phải lớn hơn start`);
  }
  for (const id of ONLY ?? []) if (!tracks[id]) errors.push(`--only: không có bài "${id}" trong ${path.relative(ROOT, SPEC_FILE)}`);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  const have = [];
  const missing = [];
  for (const [id, def] of Object.entries(tracks)) (fs.existsSync(sourceOf(id, def)) ? have : missing).push(id);
  const noUrl = have.filter((id) => !tracks[id].url);
  if (CHECK) {
    console.log(`Nguồn: ${path.join(sourceRoot(), 'audio', 'music')}`);
    console.log(`Đã có (${have.length}): ${have.join(', ') || '—'}`);
    console.log(`Chưa có (${missing.length}): ${missing.join(', ') || '—'}`);
    if (noUrl.length) console.log(`Cảnh báo: chưa điền url Suno (cần để ghi nguồn): ${noUrl.join(', ')}`);
    return;
  }
  const FF = findFfmpeg();
  if (!FF) {
    console.error(FFMPEG_HELP);
    process.exit(1);
  }

  const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const oldMusic = old.music ?? {};
  const music = {};
  const report = [];
  const failed = [];
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  for (const [id, def] of Object.entries(tracks)) {
    const todo = have.includes(id) && (!ONLY || ONLY.includes(id));
    if (!todo) {
      // Không xử lý lần này: giữ mục cũ, cập nhật credit theo khai báo mới.
      if (oldMusic[id]) music[id] = { ...oldMusic[id], credit: credit(def, d) };
      continue;
    }
    try {
      const { chans, info } = processTrack(FF, id, def, d);
      const files = [];
      for (const [kind, args] of [
        ['webm', ['-b:a', '96k']],
        ['m4a', ['-b:a', '128k']],
      ]) {
        const buf = encode(FF, chans, kind, args);
        files.push(`music/${hashName(MUSIC_DIR, id, kind, buf)}`);
        info[kind] = buf.length;
      }
      music[id] = { src: files, loop: info.loop, credit: credit(def, d) };
      if (PREVIEW && info.loop) {
        const dir = path.join(os.tmpdir(), 'dtl-music-preview');
        fs.mkdirSync(dir, { recursive: true });
        const p = path.join(dir, `${id}.seam.wav`);
        fs.writeFileSync(p, wav(seamPreview(chans)));
        info.preview = p;
      }
      report.push(info);
    } catch (e) {
      failed.push(`${id}: ${e.message}`);
      if (oldMusic[id]) music[id] = { ...oldMusic[id], credit: credit(def, d) };
    }
  }

  // Xóa file nhạc không còn mục nào trỏ tới.
  const keep = new Set(Object.values(music).flatMap((e) => (Array.isArray(e.src) ? e.src : [e.src])).map((f) => path.basename(f)));
  for (const f of fs.readdirSync(MUSIC_DIR)) if (!keep.has(f)) fs.rmSync(path.join(MUSIC_DIR, f));

  const manifest = { sprites: old.sprites ?? {}, sfx: old.sfx ?? {}, music, ambient: old.ambient ?? {} };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  if (fs.existsSync(LICENSES)) replaceBlock(LICENSES, LIC_BEGIN, LIC_END, licenseBlock(spec, music));
  else console.warn(`Không thấy ${LICENSES}, bỏ qua ghi nguồn.`);

  const f1 = (x) => x.toFixed(1);
  const kb = (b) => (b / 1024).toFixed(0);
  if (report.length) {
    console.log('bài              gốc(s) vòng(s)  điểm vòng (s)     BPM  ô nhịp giống  khớp  nối  LUFS vào→ra   dBTP  webm KB  m4a KB');
    for (const r of report) {
      const pts = r.loop ? `${f1(r.start)}→${f1(r.end)}`.padEnd(16) : 'một lần'.padEnd(16);
      const bpm = r.loop ? `${r.bpm.toFixed(0).padStart(4)}${r.conf < 0.08 ? '?' : ' '}` : '    -';
      const loopCols = r.loop ? `${String(r.bars).padStart(6)} ${r.sim.toFixed(2).padStart(5)} ${r.corr.toFixed(2).padStart(5)} ${r.seam.toFixed(1).padStart(4)}` : `${'-'.padStart(6)} ${'-'.padStart(5)} ${'-'.padStart(5)} ${'-'.padStart(4)}`;
      console.log(
        `${r.id.padEnd(16)} ${f1(r.srcDur).padStart(6)} ${f1(r.dur).padStart(7)}  ${pts} ${bpm} ${loopCols}  ${f1(r.lufsIn).padStart(5)}→${f1(r.lufs).padStart(5)} ${f1(r.tp).padStart(6)} ${kb(r.webm).padStart(8)} ${kb(r.m4a).padStart(7)}${r.limited ? '  (giới hạn đỉnh, nhỏ hơn đích)' : ''}`,
      );
      if (r.preview) console.log(`  nghe thử chỗ nối: ${r.preview}`);
      if (r.loop && (r.sim < 0.5 || r.seam > 2)) console.log(`  ⚠ ${r.id}: chỗ nối có thể nghe ra (giống=${r.sim.toFixed(2)}, nối=${r.seam.toFixed(1)}). Thử --preview, ép bpm hoặc start/end trong music.json.`);
    }
    console.log('Cột: giống = độ giống nhạc ngay sau điểm đầu và điểm cuối vòng (1 = như hệt); khớp = tương quan dạng sóng sau khi khớp pha; nối = bước nhảy âm sắc ở chỗ nối so với một phách mạnh trong bài (≤1 tốt, >2 dễ nghe ra). BPM có "?" là dò nhịp không chắc.');
  }
  if (noUrl.length) console.log(`Cảnh báo: chưa điền url Suno trong music.json (Suno free bắt buộc ghi nguồn): ${noUrl.join(', ')}`);
  if (missing.length) console.log(`Chưa có nguồn (giữ bài giữ chỗ thủ tục trong game): ${missing.join(', ')}`);
  console.log(`${Object.keys(music).length} bài nhạc trong ${path.relative(ROOT, MANIFEST) || MANIFEST}`);
  if (failed.length) {
    console.error('Lỗi:\n' + failed.join('\n'));
    process.exit(1);
  }
}

main();
