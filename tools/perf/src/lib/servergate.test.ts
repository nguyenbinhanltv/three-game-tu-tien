import { describe, expect, it } from 'vitest';
import { evaluate, gateMarkdown, roomStats, type ServerGateInput } from './servergate';

const room = (name: string, players: number, tickP95: number) => ({ name, players, monsters: 300, tickP95 });

describe('roomStats', () => {
  it('gom theo room, bỏ room trống, lấy kênh nặng nhất mỗi lần hỏi', () => {
    const s = roomStats([
      [room('world', 50, 3), room('world', 50, 5), room('dungeon', 0, 40)],
      [room('world', 50, 4), room('world', 48, 2)],
      [room('world', 50, 7)],
    ]);
    expect(s).toEqual([{ name: 'world', players: 50, monsters: 300, tickP95Median: 5, tickP95Max: 7, samples: 3 }]);
  });
});

describe('evaluate', () => {
  const base: ServerGateInput = {
    botsWanted: 100,
    botsJoined: 100,
    rooms: [{ name: 'world', players: 100, monsters: 320, tickP95Median: 5.1, tickP95Max: 6.4, samples: 12 }],
    refIdLines: 0,
    ledgerOk: true,
    ledgerSummary: 'Sổ cái khớp.',
    kbpsPerBotP95: 30,
  };
  const lim = { tickMs: 8, minBots: 100 };

  it('đạt khi mọi chỉ số trong ngưỡng', () => {
    const r = evaluate(base, lim);
    expect(r.ok).toBe(true);
    expect(gateMarkdown(base, r.checks, r.ok, 'ghi chú')).toContain('Cổng server: ĐẠT');
  });

  it('chặn từng loại vi phạm', () => {
    const bad = (patch: Partial<ServerGateInput>) => evaluate({ ...base, ...patch }, lim).ok;
    expect(bad({ rooms: [{ ...base.rooms[0]!, tickP95Max: 8.01 }] })).toBe(false);
    expect(bad({ refIdLines: 1 })).toBe(false);
    expect(bad({ ledgerOk: false })).toBe(false);
    expect(bad({ botsJoined: 99 })).toBe(false);
    expect(bad({ rooms: [] })).toBe(false);
  });

  it('bỏ qua sổ cái khi không chạy đối soát', () => {
    const r = evaluate({ ...base, ledgerOk: null }, lim);
    expect(r.ok).toBe(true);
    expect(r.checks.some((c) => c.name.includes('Sổ cái'))).toBe(false);
  });
});
