// Phần thuần của cổng server (B12, `pnpm perf:server`): gom mẫu `/health`, áp ngưỡng, dựng bảng Markdown.

export interface HealthRoom {
  name: string;
  players: number;
  monsters: number;
  tickP95: number;
}

export interface RoomStat {
  name: string;
  /** Số người lớn nhất thấy được trong cửa sổ đo. */
  players: number;
  monsters: number;
  /** Trung vị và lớn nhất của tick p95 (ms; server tính p95 trượt trên 30–60 s gần nhất) qua các lần hỏi `/health`. */
  tickP95Median: number;
  tickP95Max: number;
  samples: number;
}

export interface ServerGateLimits {
  /** Trần tick p95 (ms) của mọi room có người. */
  tickMs: number;
  /** Số bot tối thiểu phải vào được (thường = số bot yêu cầu). */
  minBots: number;
}

export interface ServerGateInput {
  botsWanted: number;
  botsJoined: number;
  rooms: RoomStat[];
  /** Số dòng log bot có `refId` (gói state bị cắt, xem `viewSerializer.ts`). */
  refIdLines: number;
  /** `null` = không chạy đối soát sổ cái. */
  ledgerOk: boolean | null;
  ledgerSummary: string;
  kbpsPerBotP95: number | null;
}

export interface GateCheck {
  name: string;
  value: string;
  limit: string;
  ok: boolean;
}

const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Gom các lần hỏi `/health` theo tên room; bỏ mẫu của room không có người (room vừa trống giữ p95 cũ). */
export function roomStats(polls: HealthRoom[][]): RoomStat[] {
  const by = new Map<string, HealthRoom[]>();
  for (const rooms of polls) {
    // Nhiều kênh cùng tên room: gộp theo tên, lấy kênh nặng nhất của mỗi lần hỏi.
    const worst = new Map<string, HealthRoom>();
    for (const r of rooms) {
      if (r.players <= 0) continue;
      const w = worst.get(r.name);
      if (!w || r.tickP95 > w.tickP95) worst.set(r.name, r);
    }
    for (const [name, r] of worst) {
      const list = by.get(name) ?? [];
      list.push(r);
      by.set(name, list);
    }
  }
  return [...by].map(([name, list]) => {
    const ticks = list.map((r) => r.tickP95);
    return {
      name,
      players: Math.max(...list.map((r) => r.players)),
      monsters: Math.max(...list.map((r) => r.monsters)),
      tickP95Median: Number(median(ticks).toFixed(2)),
      tickP95Max: Math.max(...ticks),
      samples: list.length,
    };
  });
}

export function evaluate(inp: ServerGateInput, lim: ServerGateLimits): { ok: boolean; checks: GateCheck[] } {
  const checks: GateCheck[] = [];
  checks.push({
    name: 'Bot vào được',
    value: `${inp.botsJoined}/${inp.botsWanted}`,
    limit: `≥ ${lim.minBots}`,
    ok: inp.botsJoined >= lim.minBots,
  });
  if (!inp.rooms.length) checks.push({ name: 'Mẫu tick', value: '0', limit: '≥ 1 room có người', ok: false });
  for (const r of inp.rooms) {
    checks.push({
      name: `Tick p95 \`${r.name}\` (${r.players} người, ${r.monsters} quái)`,
      value: `lớn nhất ${r.tickP95Max} ms, giữa ${r.tickP95Median} ms (${r.samples} mẫu)`,
      limit: `≤ ${lim.tickMs} ms`,
      ok: r.tickP95Max <= lim.tickMs,
    });
  }
  checks.push({ name: 'Dòng `refId` (gói state hỏng)', value: String(inp.refIdLines), limit: '0', ok: inp.refIdLines === 0 });
  if (inp.ledgerOk !== null) checks.push({ name: 'Sổ cái (`ledger:check`)', value: inp.ledgerSummary, limit: 'khớp', ok: inp.ledgerOk });
  return { ok: checks.every((c) => c.ok), checks };
}

export function gateMarkdown(inp: ServerGateInput, checks: GateCheck[], ok: boolean, note: string): string {
  const rows = checks.map((c) => `| ${c.name} | ${c.value} | ${c.limit} | ${c.ok ? 'đạt' : '**KHÔNG ĐẠT**'} |`);
  return [
    `### Cổng server: ${ok ? 'ĐẠT' : 'KHÔNG ĐẠT'}`,
    '',
    note,
    '',
    '| Kiểm | Đo được | Ngưỡng | Kết quả |',
    '|---|---|---|---|',
    ...rows,
    '',
    inp.kbpsPerBotP95 === null ? '' : `Băng thông nhận p95: ${inp.kbpsPerBotP95} KB/s mỗi bot (chỉ ghi lại, không chặn).`,
    '',
  ].join('\n');
}
