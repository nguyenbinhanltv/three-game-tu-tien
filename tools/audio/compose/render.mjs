// Render bài tự soạn (tools/audio/compose/<id>.mjs) ra âm thanh bằng soundfont GeneralUser GS qua spessasynth_core,
// hoàn toàn trong Node (không cần cài phần mềm hệ thống).
//
// Vòng lặp liền: render 2 vòng liên tiếp + đuôi, lấy đúng vòng thứ hai [P + L, P + 2L) (P = phách dạo đầu,
// L = số mẫu một vòng theo tempo trong file MIDI). Đầu vòng thứ hai đã có đuôi ngân/reverb của cuối vòng thứ nhất,
// giống hệt cái sẽ nối vào khi phát lặp, nên chỗ nối liền mẫu mà không cần crossfade.
// Bài không lặp (sting): render một lần + đuôi, loop.mjs bỏ lặng cuối.
//
// Soundfont: <DTL_ASSET_SOURCE>/audio/sf2/GeneralUser-GS-v2.0.3.sf2 (không commit). Thiếu thì tự tải từ commit ghim
// của repo gốc và kiểm SHA-256; sai checksum thì dừng.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core';
import { SR, sourceRoot } from '../common.mjs';

export const COMPOSE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const SOUNDFONT = {
  name: 'GeneralUser GS v2.0.3',
  author: 'S. Christian Collins',
  license: 'GeneralUser GS License v2.0 (dùng tự do để tạo nhạc, kể cả thương mại)',
  home: 'https://www.schristiancollins.com/generaluser.php',
  repo: 'https://github.com/mrbumpy409/GeneralUser-GS',
  commit: '684543d5e5efaef08d02be50dcda8d552478fa60',
  file: 'GeneralUser-GS-v2.0.3.sf2',
  sha256: '9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe',
  size: 32319396,
};

export function soundfontPath() {
  return path.join(sourceRoot(), 'audio', 'sf2', SOUNDFONT.file);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Đọc soundfont, tải về nếu thiếu; luôn kiểm SHA-256. */
export async function loadSoundfont() {
  const p = soundfontPath();
  if (!fs.existsSync(p)) {
    const url = `https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/${SOUNDFONT.commit}/GeneralUser-GS.sf2`;
    console.log(`Tải soundfont ${SOUNDFONT.name} (${(SOUNDFONT.size / 1048576).toFixed(0)} MB) → ${p}`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`tải soundfont lỗi ${r.status}: ${url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (sha256(buf) !== SOUNDFONT.sha256) throw new Error(`soundfont tải về sai SHA-256 (${url})`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
  }
  const buf = fs.readFileSync(p);
  if (sha256(buf) !== SOUNDFONT.sha256) throw new Error(`${p} sai SHA-256: xóa file để tải lại`);
  return buf;
}

/** Nạp bài từ tools/audio/compose/<id>.mjs (export default () => Song). */
export async function loadSong(id) {
  const file = path.join(COMPOSE_DIR, `${id}.mjs`);
  if (!fs.existsSync(file)) throw new Error(`không có ${file}`);
  const mod = await import(pathToFileURL(file).href);
  return mod.default();
}

export function hasComposer(id) {
  return fs.existsSync(path.join(COMPOSE_DIR, `${id}.mjs`));
}

let bank = null;

/**
 * Render `repeats` vòng (mặc định: 2 nếu bài lặp, 1 nếu không) thành [trái, phải] đầy đủ, kể cả phách dạo đầu và đuôi.
 * Tự lập lịch sự kiện theo đúng mẫu (không qua sequencer theo khối), nên mọi vòng giống nhau tới từng mẫu.
 */
export async function renderRaw(song, repeats = song.loop ? 2 : 1) {
  if (!bank) bank = await loadSoundfont();
  const { tracks, endTick } = song.timeline({ repeats });
  // Gộp mọi track, giữ thứ tự trong cùng mẫu (track 0 trước, rồi theo thứ tự đã sắp trong từng track).
  const evs = [];
  tracks.forEach((tr, ti) => tr.forEach(([tick, msg], i) => msg[0] !== 0xff && evs.push({ at: song.tickToSample(tick, SR), ti, i, msg })));
  evs.sort((x, y) => x.at - y.at || x.ti - y.ti || x.i - y.i);
  const synth = new SpessaSynthProcessor(SR, { eventsEnabled: false });
  synth.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(bank.buffer.slice(bank.byteOffset, bank.byteOffset + bank.byteLength)), 'main');
  await synth.ready;
  synth.setSystemParameter('autoAllocateVoices', true);
  const total = song.tickToSample(endTick, SR);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  // Khối tối đa 64 mẫu (điều biến/LFO cập nhật theo khối), cắt khối ngay tại mẫu có sự kiện.
  const BLOCK = 64;
  let pos = 0;
  let k = 0;
  while (pos < total) {
    while (k < evs.length && evs[k].at <= pos) {
      const m = evs[k++].msg;
      if (m[0] === 0xf0) synth.systemExclusive(m.slice(1 + vlqLen(m, 1)));
      else synth.processMessage(m);
    }
    const next = k < evs.length ? Math.min(evs[k].at, total) : total;
    const len = Math.max(1, Math.min(BLOCK, next - pos, total - pos));
    synth.process(left, right, pos, len);
    pos += len;
  }
  return [left, right];
}

/** Số byte của độ dài VLQ bắt đầu ở `i`. */
function vlqLen(m, i) {
  let n = 1;
  while (m[i + n - 1] & 0x80) n++;
  return n;
}

/** Độ dài đoạn trộn ở đầu vòng (giây), xem renderSong. */
export const SEAM_XFADE = 0.2;

/**
 * Render bài thành [trái, phải] Float32Array 48 kHz. Bài lặp trả đúng một vòng (độ dài = song.cycleSamples(SR)).
 *
 * Bài lặp: render 3 vòng, lấy vòng thứ hai. Phần khô (dry) của các vòng giống nhau tới từng mẫu, nhưng reverb GS có
 * điều biến chạy tự do nên phần ướt lệch chút ít giữa các vòng. Vì vậy SEAM_XFADE giây đầu vòng được trộn tuyến tính
 * từ đầu vòng thứ ba (đúng là âm thanh nối tiếp cuối vòng thứ hai) sang chính đầu vòng thứ hai: mẫu đầu vòng liền
 * với mẫu cuối, và hai tín hiệu được trộn gần như trùng nhau nên không nghe ra chỗ trộn.
 * Bài không lặp trả từ đầu vòng tới hết đuôi.
 * Ghi kèm file .mid một vòng vào `midiOut` (nếu có) để mở bằng phần mềm soạn nhạc khi cần.
 */
export async function renderSong(song, { midiOut } = {}) {
  if (midiOut) {
    fs.mkdirSync(path.dirname(midiOut), { recursive: true });
    fs.writeFileSync(midiOut, song.toMidi({ repeats: 1 }));
  }
  const pre = song.preSamples(SR);
  if (!song.loop) {
    const [left, right] = await renderRaw(song, 1);
    return [left.slice(pre), right.slice(pre)];
  }
  const raw = await renderRaw(song, 3);
  const L = song.cycleSamples(SR);
  const s = pre + L;
  const X = Math.min(Math.round(SEAM_XFADE * SR), L >> 2);
  return raw.map((a) => {
    const out = a.slice(s, s + L);
    for (let i = 0; i < X; i++) {
      const w = i / X;
      out[i] = a[s + L + i] * (1 - w) + a[s + i] * w;
    }
    return out;
  });
}

/** WAV float 32-bit (giữ nguyên độ động trước khi chuẩn hóa). */
export function wavFloat(chans, sr = SR) {
  const ch = chans.length;
  const n = chans[0].length;
  const buf = Buffer.alloc(44 + n * ch * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * ch * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * 4, 28);
  buf.writeUInt16LE(ch * 4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * ch * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) buf.writeFloatLE(chans[c][i], 44 + (i * ch + c) * 4);
  return buf;
}
