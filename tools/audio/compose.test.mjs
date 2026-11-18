// Test nhạc tự soạn: thư viện soạn (compose/lib.mjs), giới hạn đỉnh vòng tròn (loopcore.limitPeaks), render vòng lặp
// (compose/render.mjs, cần soundfont ở <DTL_ASSET_SOURCE>/audio/sf2/, thiếu thì bỏ qua) và mọi bài compose khai báo
// trong music.json đều nạp được, đúng cấu trúc tối thiểu.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BasicMIDI } from 'spessasynth_core';
import { SR } from './common.mjs';
import { n, PPQ, Scale, Song } from './compose/lib.mjs';
import { loadSong, renderSong, soundfontPath } from './compose/render.mjs';
import { limitPeaks } from './loopcore.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('Scale: ngũ cung theo bậc, quãng tám âm/dương', () => {
  const d = new Scale('D4', 'gong');
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((k) => d.deg(k)),
    [62, 64, 66, 69, 71, 74],
  );
  assert.equal(d.deg(-1), 59);
  assert.equal(new Scale('B3', 'yu').deg(1), n('D4'));
});

test('phrase: độ dài token cộng đúng, nốt bị cắt ở cuối vòng, vê sinh nhiều nốt', () => {
  const s = new Song({ id: 't', bpm: 120, bars: 1 });
  const tr = s.track('a', { ch: 0, humanTime: 0, humanVel: 0 });
  const end = tr.phrase(0, new Scale('C4'), '0:1 r:1/2 2:1/2 | 4:3', {});
  assert.equal(end, 5);
  const offs = tr.events.filter((e) => e.kind === 'off').map((e) => e.beat);
  assert.ok(Math.max(...offs) <= s.beats, 'không có nốt tắt sau cuối vòng');
  const t2 = s.track('b', { ch: 1, humanTime: 0, humanVel: 0 });
  t2.phrase(0, new Scale('C4'), '0*:1', { trem: 8 });
  assert.equal(t2.events.filter((e) => e.kind === 'on').length, 8);
  assert.throws(() => t2.phrase(0, new Scale('C4'), '0-1'), /token/);
});

test('toMidi: SMF đọc lại được, nốt cuối kết ở cuối vòng thứ n', () => {
  const s = new Song({ id: 't', bpm: 90, bars: 4, tailSec: 2 });
  s.track('a', { ch: 0, program: 107 }).phrase(0, new Scale('D4'), '0:4 2:4 4:4 3:4');
  const midi = BasicMIDI.fromArrayBuffer(s.toMidi({ repeats: 2 }).buffer);
  // spessasynth tính duration tới nốt tắt cuối (không tính đuôi lặng): phách dạo + 2 vòng, trừ phần legato của nốt cuối.
  const want = ((PPQ + 2 * s.beats * PPQ) / PPQ) * (60 / 90);
  assert.ok(midi.duration <= want + 1e-6 && midi.duration > want - 0.2, `${midi.duration} ≈ ${want}`);
  assert.equal(s.cycleSamples(SR), Math.round(16 * (60 / 90) * SR));
});

test('limitPeaks: đỉnh ≤ trần, đường bao vòng tròn khớp đầu-cuối', () => {
  const len = SR;
  const a = new Float32Array(len);
  for (let i = 0; i < len; i++) a[i] = 0.3 * Math.sin(i * 0.05);
  // Cú trống ngay cuối vòng: theo vòng tròn, đầu vòng cũng phải đang nhả.
  for (let i = len - 200; i < len; i++) a[i] = 0.98 * Math.sign(Math.sin(i));
  const chans = [a, Float32Array.from(a)];
  const db = limitPeaks(chans, -6, SR, { circular: true });
  assert.ok(db < -5.5 && db > -6.5, `giảm ${db} dB ≈ 20·log10(0,501/0,98)`);
  const ceil = 10 ** (-6 / 20) + 1e-6;
  for (const x of chans[0]) assert.ok(Math.abs(x) <= ceil);
  // Đầu vòng vẫn đang nhả sau cú trống ở cuối: biên độ đầu < biên độ sin gốc.
  assert.ok(Math.abs(chans[0][40]) < Math.abs(0.3 * Math.sin(40 * 0.05)) - 0.01);
});

const music = JSON.parse(fs.readFileSync(path.join(HERE, 'music.json'), 'utf8'));
const composed = Object.entries(music.tracks).filter(([, d]) => d.compose);

test('mọi bài compose trong music.json nạp được, đủ 3 phần và đúng kiểu lặp', async () => {
  assert.ok(composed.length > 0);
  for (const [id, def] of composed) {
    const s = await loadSong(id);
    assert.equal(s.id, id);
    assert.equal(s.loop, def.loop !== false, `${id}: loop`);
    if (s.loop) {
      assert.ok(s.sections.length >= 3, `${id}: cần ít nhất 3 phần A/B/C`);
      const secs = (s.beats * 60) / s.bpm;
      if (def.maxLen) assert.ok(secs <= def.maxLen + 0.01, `${id}: vòng ${secs.toFixed(1)} s > maxLen ${def.maxLen}`);
      assert.equal(s.sections.at(-1).toBar, s.bars, `${id}: phần cuối phải kết ở ô ${s.bars}`);
    }
  }
});

test('render: vòng lặp đúng độ dài, chỗ nối liền mẫu', { skip: !fs.existsSync(soundfontPath()) && 'chưa có soundfont' }, async () => {
  const s = new Song({ id: 'seam', bpm: 100, bars: 2, tailSec: 3 });
  const D = new Scale('D4');
  s.track('koto', { ch: 0, program: 107, reverb: 90 }).phrase(0, D, '0:1 2:1 4:1 5:1 | 3:2 4~:2');
  s.track('pad', { ch: 1, program: 89, reverb: 100, chorus: 30 }).chord(0, [n('D3'), n('A3')], 8, 70);
  s.section('A', 0, 1).section('B', 1, 2);
  const [l, r] = await renderSong(s);
  assert.equal(l.length, s.cycleSamples(SR));
  for (const a of [l, r]) {
    let step = 0;
    for (let i = 1; i < a.length; i++) step = Math.max(step, Math.abs(a[i] - a[i - 1]));
    // Bước nhảy cuối→đầu không lớn hơn bước lớn nhất trong bài.
    assert.ok(Math.abs(a[0] - a[a.length - 1]) <= step, `nối ${Math.abs(a[0] - a.at(-1))} > ${step}`);
  }
});
