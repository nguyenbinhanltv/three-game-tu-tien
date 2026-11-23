// Gọi Codex sinh ảnh cho quy trình Họa Pháp Lô (cùng cách các script tools/codex-assets: `codex exec` + công cụ tạo ảnh có sẵn).
// Ảnh ra để ở thư mục `--out` NGOÀI repo (artifact phiên / dtl-asset-source); chỉ texture đã qua lò rèn mới vào repo (KTX2).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PATH } from '@dtl/content';
import type { VfxCard } from '@dtl/shared';
import { conceptPrompt, DEFAULT_RUN_NOTE, texturePrompt, type PalHex, type StyleSheet, type TextureKind } from './prompts.js';

export function loadCard(root: string, skillId: string): VfxCard {
  const f = path.join(root, 'packages/content/data/vfx/cards', `${skillId}.json`);
  if (!fs.existsSync(f)) throw new Error(`chưa có thẻ chiêu ${skillId} (${f})`);
  return JSON.parse(fs.readFileSync(f, 'utf8')) as VfxCard;
}

export const loadStyle = (root: string): StyleSheet =>
  JSON.parse(fs.readFileSync(path.join(root, 'tools/vfx-forge/style-sheet.json'), 'utf8')) as StyleSheet;

/** Bảng màu của hướng tu trong thẻ (paths.json → palette). */
export function paletteOfCard(card: VfxCard): PalHex {
  const p = PATH.get(card.path);
  if (!p) throw new Error(`hướng tu lạ: ${card.path}`);
  return p.palette as PalHex;
}

export interface CodexJob {
  /** Tên file ra (không đuôi). */
  name: string;
  prompt: string;
  /** Ảnh đính kèm: ảnh chụp game trước, rồi ảnh mẫu đã duyệt. */
  images: string[];
  outDir: string;
  timeoutMs?: number;
}

export interface CodexResult {
  /** Đường dẫn PNG, hoặc null nếu Codex không ra ảnh. */
  file: string | null;
  /** Mã thoát của codex (null nếu không chạy được hoặc bị ngắt do quá giờ). */
  code: number | null;
  /** File log stdout+stderr cạnh prompt, để chẩn đoán (thiếu codex trong PATH, lỗi xác thực...). */
  log: string;
}

/** Bọc một tham số cho cmd.exe khi chạy qua shell (Windows): có dấu cách/ký tự đặc biệt thì đặt trong ngoặc kép. */
export function quoteArg(a: string): string {
  return /^[\w@%+=:,./\-]+$/.test(a) && !/[%^&|<>]/.test(a) ? a : `"${a.replace(/"/g, '\\"').replace(/%/g, '%%')}"`;
}

/** Chạy một việc Codex. Prompt và log (stdout+stderr) được lưu cạnh ảnh để tái lập và chẩn đoán. */
export function runCodex(job: CodexJob): Promise<CodexResult> {
  fs.mkdirSync(job.outDir, { recursive: true });
  const out = path.join(job.outDir, `${job.name}.png`);
  const logFile = path.join(job.outDir, `${job.name}.log`);
  fs.writeFileSync(path.join(job.outDir, `${job.name}.prompt.txt`), job.prompt + '\n');
  const body = `${DEFAULT_RUN_NOTE.replace('./OUT', `./${job.name}.png`)}\n\n${job.prompt}\n`;
  const args = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', job.outDir];
  for (const i of job.images) args.push('-i', path.resolve(i));
  args.push('-');
  const win = process.platform === 'win32';
  const log = fs.createWriteStream(logFile);
  return new Promise((resolve) => {
    // Windows cần shell để chạy codex.cmd; khi đó Node nối tham số bằng dấu cách không quote nên tự quote từng tham số.
    const p = spawn('codex', win ? args.map(quoteArg) : args, { stdio: ['pipe', 'pipe', 'pipe'], shell: win });
    p.stdout.pipe(log, { end: false });
    p.stderr.pipe(log, { end: false });
    p.stdin.end(body);
    let done = false;
    const finish = (code: number | null, note?: string) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      if (note) log.write(`\n[vfx-forge] ${note}\n`);
      log.end(() => resolve({ file: fs.existsSync(out) ? out : null, code, log: logFile }));
    };
    const t = setTimeout(
      () => {
        p.kill();
        finish(null, 'quá giờ');
      },
      job.timeoutMs ?? 8 * 60_000,
    );
    p.on('close', (code) => finish(code));
    p.on('error', (e) => finish(null, `không chạy được codex: ${e.message}`));
  });
}

export function conceptJob(root: string, skillId: string, shot: string, refs: string[], outDir: string): CodexJob {
  const card = loadCard(root, skillId);
  return { name: `${skillId}_concept`, prompt: conceptPrompt(card, loadStyle(root), paletteOfCard(card)), images: [shot, ...refs], outDir };
}

export function textureJob(
  root: string,
  skillId: string,
  kind: TextureKind,
  name: string,
  grid: string,
  refs: string[],
  outDir: string,
): CodexJob {
  const card = loadCard(root, skillId);
  return { name, prompt: texturePrompt(kind, card, loadStyle(root), paletteOfCard(card), grid), images: refs, outDir };
}
