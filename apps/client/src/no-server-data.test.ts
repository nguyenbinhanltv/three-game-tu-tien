// Dữ liệu chỉ server được biết (tỉ lệ rơi, linh thạch rơi) không được lọt vào bundle client.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MONSTERS } from '@dtl/content';

const SRC = fileURLToPath(new URL('.', import.meta.url));

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('dữ liệu chỉ server', () => {
  it('client không import bảng rơi', () => {
    const bad = files(SRC).filter((f) => /@dtl\/content\/loot|loot\.json/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
  it('monsters.json (vào bundle client) không chứa drops/gold', () => {
    for (const m of MONSTERS) {
      expect('drops' in m, m.id).toBe(false);
      expect('gold' in m, m.id).toBe(false);
    }
  });
});
