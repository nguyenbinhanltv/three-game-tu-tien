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

/** Chạy một việc Codex; trả đường dẫn PNG hoặc null nếu Codex không ra ảnh. Prompt cũng được lưu cạnh ảnh để tái lập. */
export function runCodex(job: CodexJob): Promise<string | null> {
  fs.mkdirSync(job.outDir, { recursive: true });
  const out = path.join(job.outDir, `${job.name}.png`);
  fs.writeFileSync(path.join(job.outDir, `${job.name}.prompt.txt`), job.prompt + '\n');
  const body = `${DEFAULT_RUN_NOTE.replace('./OUT', `./${job.name}.png`)}\n\n${job.prompt}\n`;
  const args = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', job.outDir];
  for (const i of job.images) args.push('-i', path.resolve(i));
  args.push('-');
  return new Promise((resolve) => {
    const p = spawn('codex', args, { stdio: ['pipe', 'ignore', 'ignore'], shell: process.platform === 'win32' });
    p.stdin.end(body);
    const t = setTimeout(() => p.kill(), job.timeoutMs ?? 8 * 60_000);
    p.on('close', () => {
      clearTimeout(t);
      resolve(fs.existsSync(out) ? out : null);
    });
    p.on('error', () => {
      clearTimeout(t);
      resolve(null);
    });
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
