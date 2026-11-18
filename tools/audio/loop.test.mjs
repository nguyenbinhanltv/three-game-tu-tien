// Test tools/audio/loopcore.mjs (tín hiệu tổng hợp) và chạy thật tools/audio/loop.mjs trên file mẫu sinh bằng ffmpeg.
// Chạy: node --test tools/audio/   (phần ffmpeg tự bỏ qua nếu không có ffmpeg có libopus + aac; đặt FFMPEG= để chỉ định)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { decode, findFfmpeg, HERE } from './common.mjs';
import { estimateTempo, findLoop, loudness, makeLoop, momentaryMax, seamReport, SR, trimOneShot, truePeak } from './loopcore.mjs';

const BEAT = 0.6; // 100 BPM
const PATTERN = 8 * BEAT; // mẫu giai điệu lặp sau 2 ô nhịp

/** Nhạc giả: dây gảy ngũ cung đổi nốt theo phách (chu kỳ 2 ô nhịp), trống ở đầu ô nhịp, drone; mở đầu lặng, cuối tắt dần. */
function song({ lead = 2.5, len = 60, fade = 8 } = {}) {
  const n = Math.round((lead + len) * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const penta = [0, 2, 4, 7, 9, 12, 9, 4];
  for (let i = Math.round(lead * SR); i < n; i++) {
    const t = i / SR - lead;
    const b = Math.floor(t / BEAT);
    const ph = t - b * BEAT;
    const f = 220 * 2 ** (penta[b % 8] / 12);
    const pluck = 0.35 * Math.sin(2 * Math.PI * f * ph) * Math.exp(-5 * ph);
    const kick = b % 4 === 0 ? 0.5 * Math.sin(2 * Math.PI * 55 * ph * (1 + 2 * Math.exp(-30 * ph))) * Math.exp(-12 * ph) : 0;
    const drone = 0.08 * Math.sin(2 * Math.PI * 110 * t);
    const env = t > len - fade ? Math.max(0, (len - t) / fade) : 1;
    L[i] = (pluck + kick + drone) * env;
    R[i] = (0.8 * pluck + kick + drone) * env;
  }
  return [L, R];
}

test('loudness: sin 1 kHz biên độ 0,1 hai kênh ≈ -20 LUFS', () => {
  const n = 5 * SR;
  const a = Float32Array.from({ length: n }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 997 * i) / SR));
  const l = loudness([a, a.slice()]);
  assert.ok(Math.abs(l - -20) < 0.2, `đo được ${l}`);
});

test('momentaryMax: âm 100 ms được đo theo khối ngắn, không bị khoảng lặng pha loãng', () => {
  const tone = (n) => Float32Array.from({ length: n }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 997 * i) / SR));
  const burst = new Float32Array(SR);
  burst.set(tone(Math.round(0.1 * SR)));
  // Khối 100 ms trúng đúng đoạn có tiếng: ≈ độ to của sin liên tục cùng biên độ (-23 LUFS mono).
  const short = momentaryMax([burst], SR, 0.1);
  assert.ok(Math.abs(short - -23) < 0.7, `đo được ${short}`);
  // Khối 400 ms (mặc định) pha loãng 4 lần ≈ -6 dB.
  const long = momentaryMax([burst]);
  assert.ok(short - long > 5 && short - long < 7, `chênh ${short - long}`);
  // Âm ngắn hơn một khối được đệm lặng, không lỗi.
  assert.ok(Number.isFinite(momentaryMax([tone(Math.round(0.05 * SR))], SR, 0.4)));
  assert.equal(momentaryMax([new Float32Array(SR)]), -Infinity);
});

test('truePeak: bắt được đỉnh giữa hai mẫu', () => {
  // sin ở fs/4 lệch pha 45°: mẫu chỉ chạm 0,707 nhưng đỉnh thật là 1.
  const a = Float32Array.from({ length: SR }, (_, i) => Math.sin((Math.PI / 2) * i + Math.PI / 4));
  const tp = truePeak([a]);
  assert.ok(tp > -0.5 && tp < 0.3, `dBTP ${tp}`);
  let sp = 0;
  for (const v of a) sp = Math.max(sp, Math.abs(v));
  assert.ok(20 * Math.log10(sp) < -2.9);
});

test('estimateTempo: nhận đúng 100 BPM', () => {
  const [L] = song({ lead: 0, fade: 0.001 });
  const t = estimateTempo(L);
  assert.ok(Math.abs(t.bpm - 100) < 1.5, `bpm ${t.bpm}`);
});

test('findLoop: độ dài vòng là bội của mẫu 2 ô nhịp, bỏ đoạn lặng đầu và đuôi tắt dần', () => {
  const chans = song();
  const r = findLoop(chans, { xfade: 0.12 });
  const len = (r.end - r.start) / SR;
  const rem = len % PATTERN;
  assert.ok(Math.min(rem, PATTERN - rem) < 0.03, `vòng ${len.toFixed(3)} s không phải bội của ${PATTERN} s`);
  assert.ok(r.start / SR >= 2.5, `điểm đầu ${r.start / SR} rơi vào đoạn lặng`);
  assert.ok(r.end / SR <= 2.5 + 60 - 8 + 0.5, `điểm cuối ${r.end / SR} lấn vào đuôi tắt dần`);
  assert.ok(r.score > 0.8, `độ giống ${r.score}`);
  const loop = makeLoop(chans, r.start, r.end, Math.round(0.12 * SR), r.corr);
  const s = seamReport(loop);
  assert.ok(s.seam < 1.5, `nối ${s.seam}`);
  assert.ok(s.click < 1, `tách ${s.click}`);
});

test('makeLoop: mẫu cuối nối liền mẫu đầu dù điểm vòng lệch pha', () => {
  const n = 4 * SR;
  const x = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 330 * i) / SR));
  // Độ dài vòng không phải bội chu kỳ 330 Hz: cắt thô sẽ có bước nhảy.
  const S = 9000;
  const E = S + 2 * SR + 37;
  const [y] = makeLoop([x], S, E, Math.round(0.1 * SR), 0);
  const step = Math.abs(y[y.length - 1] - y[0]);
  const maxStep = (2 * Math.PI * 330) / SR;
  assert.ok(step <= maxStep * 1.05, `bước nhảy ${step}`);
});

test('trimOneShot: bỏ lặng đầu, fade cuối về 0', () => {
  const n = 2 * SR;
  const x = new Float32Array(n);
  for (let i = SR / 2; i < SR; i++) x[i] = 0.5 * Math.sin(i / 10) * Math.exp(-(i - SR / 2) / 8000);
  const [y] = trimOneShot([x]);
  assert.ok(y.length < SR * 0.8, `dài ${y.length / SR}`);
  assert.equal(y[y.length - 1], 0);
});

const FF = findFfmpeg();

test('loop.mjs: chạy thật trên MP3 sinh bằng ffmpeg', { skip: FF ? false : 'không có ffmpeg (đặt FFMPEG=)' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-loop-test-'));
  try {
    const srcDir = path.join(tmp, 'src', 'audio', 'music');
    fs.mkdirSync(srcDir, { recursive: true });
    // Nhạc mẫu chỉ bằng ffmpeg: dây gảy đổi nốt theo phách (chu kỳ 8 phách = 4,8 s), trống đầu ô nhịp, drone; lặng 2,5 s đầu, tắt dần 8 s cuối.
    const b = 'floor(t/0.6)';
    const ph = 'mod(t,0.6)';
    const f = `220*pow(2,(eq(mod(${b},8),1)*2+eq(mod(${b},8),2)*4+eq(mod(${b},8),3)*7+eq(mod(${b},8),4)*9+eq(mod(${b},8),5)*12+eq(mod(${b},8),6)*9+eq(mod(${b},8),7)*4)/12)`;
    const pluck = `0.35*sin(2*PI*${f}*${ph})*exp(-5*${ph})`;
    const kick = `eq(mod(${b},4),0)*0.2*sin(2*PI*55*${ph}*(1+2*exp(-30*${ph})))*exp(-12*${ph})`;
    const drone = '0.08*sin(2*PI*110*t)';
    const expr = `${pluck}+${kick}+${drone}|0.8*${pluck}+${kick}+${drone}`;
    const mp3 = path.join(srcDir, 'sect.mp3');
    const g = spawnSync(
      FF,
      [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `aevalsrc='${expr}':s=44100:d=60`,
        '-af',
        'afade=t=out:st=52:d=8,adelay=2500|2500,volume=3',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        mp3,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(g.status, 0, g.stderr);

    // Sting không lặp, sinh bằng ffmpeg: tiếng chuông tắt dần sau 0,5 s lặng.
    const sting = path.join(srcDir, 'sting_levelup.mp3');
    const g2 = spawnSync(
      FF,
      [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        "aevalsrc='0.5*sin(2*PI*880*t)*exp(-3*t)|0.5*sin(2*PI*880*t)*exp(-3*t)':s=44100:d=3",
        '-af',
        'adelay=500|500',
        '-c:a',
        'libmp3lame',
        sting,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(g2.status, 0, g2.stderr);

    const out = path.join(tmp, 'out');
    fs.mkdirSync(out);
    // Manifest cũ có SFX: loop.mjs phải giữ nguyên.
    fs.writeFileSync(
      path.join(out, 'manifest.json'),
      JSON.stringify({
        sprites: { a: ['sfx/a.webm'] },
        sfx: { hit: { variants: [] } },
        music: {},
        ambient: { wind: { src: ['amb/w.webm'] } },
      }),
    );
    const lic = path.join(tmp, 'LICENSES.md');
    fs.writeFileSync(lic, '# Giấy phép\n');
    const spec = path.join(tmp, 'music.json');
    fs.writeFileSync(
      spec,
      JSON.stringify({
        defaults: { lufs: -16, peak: -1, xfade: 0.12, by: 'Suno (free, non-commercial)', license: 'phi thương mại, ghi nguồn' },
        tracks: {
          sect: { title: 'Lạc Kiếm Tông', url: 'https://suno.com/song/test', loop: true },
          combat: { title: 'Giao Phong', url: '', loop: true },
          sting_levelup: { title: 'Tu Vi Tinh Tiến', url: '', loop: false },
        },
      }),
    );
    const env = { ...process.env, DTL_ASSET_SOURCE: path.join(tmp, 'src'), FFMPEG: FF };
    const run = spawnSync(process.execPath, [path.join(HERE, 'loop.mjs'), '--spec', spec, '--out', out, '--licenses', lic, '--preview'], {
      encoding: 'utf8',
      env,
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    process.stdout.write(run.stdout.replace(/^/gm, '    '));

    const m = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    assert.deepEqual(m.sfx, { hit: { variants: [] } });
    assert.deepEqual(m.ambient, { wind: { src: ['amb/w.webm'] } });
    assert.deepEqual(Object.keys(m.music).sort(), ['sect', 'sting_levelup']);
    const e = m.music.sect;
    assert.equal(e.loop, true);
    assert.deepEqual(e.credit, {
      title: 'Lạc Kiếm Tông',
      by: 'Suno (free, non-commercial)',
      license: 'phi thương mại, ghi nguồn',
      url: 'https://suno.com/song/test',
    });
    assert.match(e.src[0], /^music\/sect\.[0-9a-f]{10}\.webm$/);
    assert.match(e.src[1], /^music\/sect\.[0-9a-f]{10}\.m4a$/);
    assert.equal(m.music.sting_levelup.loop, false);
    assert.equal(m.music.sting_levelup.credit.url, undefined);

    // Độ dài vòng là bội 4,8 s; độ to đo bằng bộ đo EBU R128 của chính ffmpeg ≈ -16 LUFS.
    const webm = path.join(out, e.src[0]);
    const dec = decode(FF, webm, 2);
    const len = dec[0].length / SR;
    const rem = len % PATTERN;
    // Opus/WebM có thể thêm tối đa vài chục ms đệm.
    assert.ok(Math.min(rem, PATTERN - rem) < 0.06, `vòng ${len.toFixed(3)} s`);
    const eb = spawnSync(FF, ['-hide_banner', '-nostats', '-i', webm, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
    const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(eb.stderr.split('Summary:').pop())?.[1]);
    assert.ok(Math.abs(I - -16) < 0.5, `ffmpeg ebur128 đo ${I} LUFS`);
    const tp = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(eb.stderr.split('Summary:').pop())?.[1]);
    assert.ok(tp <= -0.5, `đỉnh thực ${tp} dBTP`);

    const md = fs.readFileSync(lic, 'utf8');
    assert.match(md, /<!-- music:begin/);
    assert.match(
      md,
      /\| `sect` \| Lạc Kiếm Tông \| Suno \(free, non-commercial\) \| phi thương mại, ghi nguồn \| \d{4}-\d{2}-\d{2} \| https:\/\/suno\.com\/song\/test \|/,
    );
    assert.match(run.stdout, /chưa điền url Suno.*sting_levelup/);
    assert.match(run.stdout, /Chưa có nguồn.*combat/);
    assert.match(run.stdout, /nghe thử chỗ nối: .*sect\.seam\.wav/);

    // Chạy lại: cùng nguồn → cùng file (hash ổn định), không sinh file thừa.
    const before = fs.readdirSync(path.join(out, 'music')).sort();
    const run2 = spawnSync(process.execPath, [path.join(HERE, 'loop.mjs'), '--spec', spec, '--out', out, '--licenses', lic], {
      encoding: 'utf8',
      env,
    });
    assert.equal(run2.status, 0, run2.stderr);
    assert.deepEqual(fs.readdirSync(path.join(out, 'music')).sort(), before);
    assert.equal(fs.readFileSync(lic, 'utf8'), md);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
