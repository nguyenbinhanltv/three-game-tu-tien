// Đọc dòng log của bot (`apps/bot-client/src/index.ts`): KB/s nhận mỗi bot và tick p95 của room.

/** Lấy KB/s mỗi bot và tick p95 từ các dòng log của bot (`…tick p95 5ms … nhận 12.3 KB/s mỗi bot`). */
export function parseBotLines(lines: string[]): { kbps: number[]; tick: number[] } {
  const kbps: number[] = [];
  const tick: number[] = [];
  for (const l of lines) {
    const k = /nhận ([0-9.]+) KB\/s mỗi bot/.exec(l);
    if (k) kbps.push(Number(k[1]));
    for (const t of l.matchAll(/tick p95 ([0-9.]+)ms/g)) tick.push(Number(t[1]));
  }
  return { kbps, tick };
}
