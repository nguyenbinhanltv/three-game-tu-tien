// codex exec chỉ sinh ảnh (không bắt copy: shell của Codex hay treo); ta tự lấy PNG từ ~/.codex/generated_images/<thread>/ rồi dừng tiến trình.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
const OUT = 'C:/Users/PC/.ao/data/artifacts/three-game-tu-tien-201/codex';
const HOME = os.homedir().replace(/\\/g, '/');
const GEN = `${HOME}/.codex/generated_images`;
const SESS = `${HOME}/.codex/sessions`;
const [, , jobsFile, jobsN = '3'] = process.argv;
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
const logFile = path.join(OUT, 'codex-log.json');
const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : [];
const save = () => fs.writeFileSync(logFile, JSON.stringify(log, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function sessionFiles(t0) {
  const out = [];
  const d = new Date();
  const day = `${SESS}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  if (!fs.existsSync(day)) return out;
  for (const f of fs.readdirSync(day)) {
    const p = `${day}/${f}`;
    if (fs.statSync(p).mtimeMs >= t0 - 5000) out.push(p);
  }
  return out;
}
function findImage(tag, t0) {
  for (const f of sessionFiles(t0)) {
    const head = fs.readFileSync(f, 'utf8').slice(0, 400000);
    if (!head.includes(`JOBTAG-${tag}-END`)) continue;
    const m = f.match(/-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/);
    if (!m) continue;
    const dir = `${GEN}/${m[1]}`;
    if (fs.existsSync(dir)) {
      const pngs = fs.readdirSync(dir).filter((x) => x.endsWith('.png'));
      if (pngs.length) return `${dir}/${pngs[pngs.length - 1]}`;
    }
  }
  return null;
}
const runOne = async (j) => {
  const dir = path.join(OUT, j.group);
  fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, `${j.id}.png`);
  fs.rmSync(dst, { force: true });
  fs.writeFileSync(path.join(dir, `${j.id}.prompt.txt`), j.prompt + '\n');
  const body = `JOBTAG-${j.id}-END\nUse the built-in image generation tool to create exactly ONE image from the brief below. Do NOT copy, move or save the file anywhere and do not run any shell command. As soon as the image is generated, reply with the single word DONE.\n\n${j.prompt}\n`;
  const t0 = Date.now();
  const p = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', dir, '-'], {
    stdio: ['pipe', 'ignore', 'ignore'],
    shell: true,
  });
  p.stdin.end(body);
  let src = null,
    quota = false;
  while (Date.now() - t0 < 9 * 60_000) {
    await sleep(4000);
    src = findImage(j.id, t0);
    if (src) {
      await sleep(2500);
      break;
    }
  }
  try {
    spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {}
  const ok = !!src;
  if (ok) fs.copyFileSync(src, dst);
  log.push({ id: j.id, group: j.group, ok, sec: Math.round((Date.now() - t0) / 1000), at: new Date().toISOString() });
  save();
  console.log(`${ok ? 'OK ' : 'LỖI'} ${j.group}/${j.id} ${Math.round((Date.now() - t0) / 1000)}s`);
  return ok;
};
let next = 0;
await Promise.all(
  Array.from({ length: Number(jobsN) }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      await runOne(j);
    }
  }),
);
console.log('xong; tổng lượt đã ghi sổ:', log.length);
