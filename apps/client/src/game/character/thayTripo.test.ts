import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HUMAN_CLIPS } from './humanClips';

const DOC = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../docs/chr-v3-anim/thay-clip-tripo.md'),
  'utf8',
);

describe('docs/chr-v3-anim/thay-clip-tripo.md', () => {
  it('có dòng cho mọi clip trong HUMAN_CLIPS (đủ để bỏ ba gói clip cũ)', () => {
    const missing = Object.keys(HUMAN_CLIPS).filter((n) => !DOC.includes('`' + n + '`'));
    expect(missing).toEqual([]);
  });
});
