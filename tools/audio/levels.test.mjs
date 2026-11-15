// Test quy tắc cân âm của tools/audio/levels.mjs trên dữ liệu giả (không cần ffmpeg).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rules, SFX_GROUPS } from './levels.mjs';

const sfx = (names, eff) => names.map((name) => ({ name, bus: 'sfx', lufs: eff, eff }));
function data(over = {}) {
  return {
    sfx: [...sfx(SFX_GROUPS['Đòn đánh'], -14), ...sfx(SFX_GROUPS['Xác nhận thành công'], -10), ...sfx(SFX_GROUPS['Bước chân'], -26), ...sfx(['heal'], -15)],
    music: [{ id: 'sect', kind: 'music', lufs: -16, eff: -24.5, stem: false, sting: false }],
    ambient: [{ id: 'wind', kind: 'ambient', lufs: -22, eff: -31, stem: false, sting: false }],
    ...over,
  };
}

test('bộ số liệu cân: cả bốn quy tắc đạt', () => {
  for (const r of rules(data())) assert.ok(r.ok, r.text);
});

test('nhạc quá to so với đòn đánh thì báo lỗi', () => {
  const r = rules(data({ music: [{ id: 'sect', kind: 'music', lufs: -16, eff: -16, stem: false, sting: false }] }));
  assert.equal(r[0].ok, false);
});

test('âm môi trường to hơn nhạc thì báo lỗi', () => {
  const r = rules(data({ ambient: [{ id: 'wind', kind: 'ambient', lufs: -22, eff: -22, stem: false, sting: false }] }));
  assert.equal(r[1].ok, false);
});

test('âm xác nhận không nổi hơn các SFX khác thì báo lỗi', () => {
  const d = data();
  d.sfx = d.sfx.map((s) => (SFX_GROUPS['Xác nhận thành công'].includes(s.name) ? { ...s, eff: -16 } : s));
  assert.equal(rules(d)[2].ok, false);
});
