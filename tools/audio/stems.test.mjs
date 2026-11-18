// Test nhạc phân lớp (M4-13) trên file đã build trong apps/client/public/audio: mỗi vùng có ba lớp (nền, nhịp, căng)
// bằng nhau TỪNG MẪU (đồng bộ vòng lặp), độ to sau trộn ở mọi mức giao chiến gần −16 LUFS và không clip.
// Chạy sau `pnpm music:build`. Thiếu stem trong manifest thì báo lỗi.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SR } from './common.mjs';
import { loudness, truePeak } from './loopcore.mjs';
import { loadGroup, manifest, mixStatic, readRamps, readStemMix, readStemZones } from './stemsmix.mjs';

const zones = readStemZones();
const table = readStemMix();
const TARGET = -16;

test('khai báo: vùng có stem là sect, wild, dungeon; mỗi vùng đủ pulse + edge, loop, ghi nguồn', () => {
  assert.deepEqual(zones, ['sect', 'wild', 'dungeon']);
  const m = manifest().music;
  for (const z of zones) {
    for (const role of ['pulse', 'edge']) {
      const e = Object.entries(m).find(([, v]) => v.stem?.of === z && v.stem.role === role);
      assert.ok(e, `${z}: thiếu stem ${role}`);
      assert.equal(e[1].loop, true);
      assert.ok(e[1].credit?.license, `${e[0]}: thiếu credit`);
      assert.equal(e[1].src.length, 2, `${e[0]}: cần webm + m4a`);
    }
  }
});

test('bảng trộn: mức 0 chỉ nền, lớp không giảm khi mức tăng', () => {
  assert.deepEqual(table[0], { base: 1, pulse: 0, edge: 0 });
  for (const k of ['pulse', 'edge'])
    for (const lv of [1, 2]) assert.ok(table[lv][k] >= table[lv - 1][k], `${k} giảm từ mức ${lv - 1} lên ${lv}`);
});

for (const z of zones) {
  test(`${z}: ba lớp bằng nhau từng mẫu, độ to sau trộn ~${TARGET} LUFS, không clip`, () => {
    const g = loadGroup(z);
    const n = g.base[0].length;
    assert.equal(g.pulse[0].length, n, `${z}: nhịp lệch độ dài so với nền`);
    assert.equal(g.edge[0].length, n, `${z}: căng lệch độ dài so với nền`);
    const lufs = {};
    for (const lv of [0, 1, 2]) {
      const mix = mixStatic(g, table[lv]);
      lufs[lv] = loudness(mix, SR);
      const peak = Math.max(...mix.map((a) => a.reduce((p, x) => Math.max(p, Math.abs(x)), 0)));
      assert.ok(peak < 1, `${z} mức ${lv}: clip (đỉnh mẫu ${peak.toFixed(3)})`);
      assert.ok(truePeak(mix) < 0, `${z} mức ${lv}: đỉnh thực ${truePeak(mix).toFixed(2)} dBTP ≥ 0`);
      assert.ok(Math.abs(lufs[lv] - TARGET) <= 1.5, `${z} mức ${lv}: ${lufs[lv].toFixed(2)} LUFS lệch quá 1,5 dB so với ${TARGET}`);
    }
    // Vào giao tranh không được to lên hay nhỏ đi quá 1,5 dB so với lúc khám phá.
    assert.ok(Math.abs(lufs[2] - lufs[0]) <= 1.5, `${z}: nhảy ${(lufs[2] - lufs[0]).toFixed(2)} dB giữa mức 0 và 2`);
    console.log(
      `  ${z}: LUFS mức0 ${lufs[0].toFixed(2)}, mức1 ${lufs[1].toFixed(2)}, mức2 ${lufs[2].toFixed(2)}; ${n} mẫu/lớp (${(n / SR).toFixed(2)} s)`,
    );
  });
}

test('hằng chuyển lớp: lên nhanh hơn xuống', () => {
  const r = readRamps();
  assert.ok(r.attack > 0 && r.attack < r.release);
});
