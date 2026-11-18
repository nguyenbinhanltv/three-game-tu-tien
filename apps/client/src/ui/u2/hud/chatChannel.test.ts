import { describe, expect, it } from 'vitest';
import { sysChannel } from './chatChannel';

describe('sysChannel', () => {
  it('tin chiến đấu và tin hệ thống', () => {
    expect(sysChannel('sys.died')).toBe('combat');
    expect(sysChannel('sys.cooldown')).toBe('combat');
    expect(sysChannel('sys.chant_broken')).toBe('combat');
    expect(sysChannel('sys.loot')).toBe('system');
    expect(sysChannel('sys.quest_done')).toBe('system');
    expect(sysChannel('sys.levelup')).toBe('system');
  });
});
