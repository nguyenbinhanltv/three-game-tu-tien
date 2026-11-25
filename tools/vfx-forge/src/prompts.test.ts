import { describe, expect, it } from 'vitest';
import type { VfxCard } from '@dtl/shared';
import { quoteArg } from './quote.js';
import { conceptPrompt, texturePrompt, warnColorRule, type PalHex, type StyleSheet } from './prompts.js';

const style: StyleSheet = {
  name: 'T',
  summary: 's',
  ramp: { core: 'c', body: 'b', rim: 'r' },
  stroke: { minWidthPctOfFrame: 3, note: 'n' },
  contrast: 'k',
  forbidden: ['đỏ, cam'],
  perspective: 'p',
  approvedSamples: 'a',
};
const pal: PalHex = { core: '0a3f5e', body: '2cc7dc', rim: 'f2fdff', accent: 'f3c860', shadow: '08202e' };
const card = {
  skillId: 'x',
  idea: 'vệt kiếm khí',
  shapeLang: ['arc', 'line'],
  timing: { anticipationMs: 280, impactMs: 60, lingerMs: 400 },
  footprint: { lengthM: 9, widthM: 2.5, heightM: 2 },
} as unknown as VfxCard;

describe('prompts', () => {
  it('concept: đủ 4 khung, màu hướng tu, cấm đỏ cam, đính phối cảnh', () => {
    const p = conceptPrompt(card, style, pal);
    expect(p).toMatch(/2x2/);
    expect(p).toMatch(/#2CC7DC/);
    expect(p).toMatch(/đỏ, cam/);
    expect(p).toMatch(/FIRST attached image/);
    expect(p).toMatch(/280 ms/);
  });
  it('flipbook: nền đen và lưới đúng', () => {
    const p = texturePrompt('flipbook', card, style, pal, '8x8');
    expect(p).toMatch(/8x8/);
    expect(p).toMatch(/#000000/);
  });
  it('noise: xám, lát được; ramp: ba tông', () => {
    expect(texturePrompt('noise', card, style, pal)).toMatch(/tileable/);
    expect(texturePrompt('ramp', card, style, pal)).toMatch(/#0A3F5E/);
  });
});

describe('quoteArg', () => {
  it('quote đường dẫn có dấu cách hoặc ký tự cmd', () => {
    expect(quoteArg('C:/a b/c.png')).toBe('"C:/a b/c.png"');
    expect(quoteArg('a&b')).toBe('"a&b"');
    expect(quoteArg('exec')).toBe('exec');
    expect(quoteArg('-C')).toBe('-C');
  });
});

describe('monConceptPrompt', () => {
  const mon = {
    monId: 'boss_han_giao',
    move: 'slam',
    idea: 'nện đuôi',
    palette: { core: '0a2a55', body: '3a8cf0', rim: 'ffe9b0', accent: 'ff1f3d' },
    zone: { shape: 'circle', r: 5.5, at: 'target' },
    timing: { anticipationMs: 1700, impactMs: 120, lingerMs: 700 },
    readability: 'vành đỏ rõ',
  } as unknown as import('@dtl/shared').MonVfxCard;
  it('đủ hình vùng đúng mét, đỏ cho cảnh báo, màu hệ cho vùng nổ, 4 khung', async () => {
    const { monConceptPrompt, zoneWords } = await import('./prompts.js');
    const p = monConceptPrompt(mon, style);
    expect(p).toMatch(/radius 5\.5 m/);
    expect(p).toMatch(/#FF1F3D/);
    expect(p).toMatch(/#3A8CF0/);
    expect(p).toMatch(/2x2/);
    expect(p).toMatch(/1700 ms/);
    expect(zoneWords({ shape: 'cone', r: 14, w: 35, at: 'forward' })).toMatch(/half-angle 35/);
  });
});

describe('warnColorRule: vạch báo luôn đỏ-cam, thân hiệu ứng không đỏ/cam khi hệ không phải lửa', () => {
  it('vạch báo luôn đỏ-cam, kể cả hệ tím/hổ phách', () => {
    expect(warnColorRule({ accent: 'ff1f3d', rim: 'ffffff', core: '000000', body: '888888' })).toMatch(/RED-ORANGE/);
    expect(warnColorRule({ accent: 'ff1f3d', rim: 'f0d8ff', core: '140a1e', body: '6a3fa0' })).toMatch(/RED-ORANGE/);
    expect(warnColorRule({ accent: 'ff1f3d', rim: 'f2d28a', core: '2a1a10', body: '7a4a2c' })).toMatch(/RED-ORANGE/);
  });
  it('thân tím hoặc nâu hổ phách: cấm đỏ/cam ở vùng nổ; thân lửa đỏ thì không cấm', () => {
    expect(warnColorRule({ accent: 'ff1f3d', rim: 'f0d8ff', core: '140a1e', body: '6a3fa0' })).toMatch(/NO red and NO orange/);
    expect(warnColorRule({ accent: 'ff1f3d', rim: 'f2d28a', core: '2a1a10', body: '3a8ca0' })).toMatch(/NO red and NO orange/);
    expect(warnColorRule({ accent: 'ff1f3d', rim: 'ffe9a8', core: '1a0f0a', body: 'c03a1c' })).not.toMatch(/NO red and NO orange/);
  });
});
