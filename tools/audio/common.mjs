// Tiện ích chung cho tools/audio/build.mjs (SFX, âm môi trường) và tools/audio/loop.mjs (nhạc nền).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const SR = 48000;

/** Thư mục nguồn asset lớn (không commit): DTL_ASSET_SOURCE, mặc định dtl-asset-source cạnh repo gốc (dò qua git common dir để chạy được trong worktree). */
export function sourceRoot() {
  if (process.env.DTL_ASSET_SOURCE) return path.resolve(process.env.DTL_ASSET_SOURCE);
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' });
  const common = r.status === 0 ? r.stdout.trim() : path.join(ROOT, '.git');
  return path.resolve(path.dirname(common), '..', 'dtl-asset-source');
}

/** ffmpeg có libopus + aac: biến FFMPEG, rồi `ffmpeg` trong PATH, rồi gói ffmpeg-static nếu cài. */
export function findFfmpeg() {
  const tries = [];
  if (process.env.FFMPEG) tries.push(process.env.FFMPEG);
  tries.push('ffmpeg');
  try {
    const p = createRequire(import.meta.url)('ffmpeg-static');
    if (typeof p === 'string') tries.push(p);
  } catch {
    // không cài ffmpeg-static
  }
  for (const t of tries) {
    const r = spawnSync(t, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    if (r.status === 0 && /libopus/.test(r.stdout) && /\baac\b/.test(r.stdout)) return t;
  }
  return null;
}

export const FFMPEG_HELP =
  'Không tìm thấy ffmpeg có libopus + aac. Đặt FFMPEG=<đường dẫn>, cài ffmpeg vào PATH, hoặc `npm i ffmpeg-static` ở thư mục tạm rồi đặt FFMPEG.';

/** Giải mã về float32 48 kHz, `ch` kênh, trả mảng kênh. */
export function decode(ff, abs, ch) {
  const r = spawnSync(ff, ['-v', 'error', '-i', abs, '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg không giải mã được ${abs}: ${r.stderr}`);
  const all = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
  const n = all.length / ch;
  const out = [];
  for (let c = 0; c < ch; c++) {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = all[i * ch + c];
    out.push(a);
  }
  return out;
}

/** Mã hóa mảng kênh float 48 kHz ra webm (Opus) hoặc m4a (AAC). Byte ổn định giữa các lần build. */
export function encode(ff, chans, kind, args) {
  const ch = chans.length;
  const n = chans[0].length;
  const inter = new Float32Array(n * ch);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) inter[i * ch + c] = chans[c][i];
  const fmt = kind === 'webm' ? ['-c:a', 'libopus', '-vbr', 'on', '-application', 'audio', '-f', 'webm'] : ['-c:a', 'aac', '-movflags', '+faststart', '-f', 'mp4'];
  // MP4 cần đầu ra tua được nên ghi qua file tạm. Không ghi metadata thời gian/bộ mã hóa để byte ổn định giữa các lần build.
  const tmp = path.join(os.tmpdir(), `dtl-audio-${process.pid}-${crypto.randomBytes(4).toString('hex')}.${kind}`);
  const r = spawnSync(
    ff,
    ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(ch), '-i', 'pipe:0', ...args, ...fmt, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', tmp],
    { input: Buffer.from(inter.buffer), maxBuffer: 1 << 30 },
  );
  if (r.status !== 0) throw new Error(`ffmpeg mã hóa ${kind} lỗi: ${r.stderr}`);
  const buf = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  return buf;
}

/** Ghi `buf` thành `<base>.<hash10>.<ext>` trong `dir`, trả tên file. */
export function hashName(dir, base, ext, buf) {
  const h = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
  const name = `${base}.${h}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}

/** Ngày theo giờ máy (không phải UTC) để khớp ngày làm việc của người build. */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Thay khối `begin`…`end` trong file markdown bằng `block` (thêm vào cuối nếu chưa có).
 * Dòng bảng dạng "| `id` | … | <ngày> | <chi tiết> |" giữ ngày cũ khi phần còn lại không đổi, để build lại không làm bẩn diff.
 */
export function replaceBlock(file, begin, end, block) {
  let md = fs.readFileSync(file, 'utf8');
  const s = md.indexOf(begin);
  const e = md.indexOf(end);
  if (s >= 0 && e > s) {
    const old = md.slice(s, e + end.length);
    const dateRe = /^\| `([a-z0-9_]+)` (\|.*\| )(\d{4}-\d{2}-\d{2})( \|.*)$/;
    const oldRows = new Map();
    for (const line of old.split('\n')) {
      const m = dateRe.exec(line);
      if (m) oldRows.set(m[1], m);
    }
    block = block
      .split('\n')
      .map((line) => {
        const m = dateRe.exec(line);
        const o = m && oldRows.get(m[1]);
        return o && o[2] === m[2] && o[4] === m[4] ? `| \`${m[1]}\` ${m[2]}${o[3]}${m[4]}` : line;
      })
      .join('\n');
    md = md.slice(0, s) + block + md.slice(e + end.length);
  } else md = md.trimEnd() + '\n\n' + block + '\n';
  fs.writeFileSync(file, md);
}
