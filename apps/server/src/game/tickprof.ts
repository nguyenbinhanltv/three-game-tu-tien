// Profiler tick nhẹ theo hệ (PERF-TICK2). Mặc định TẮT (TICK_PROF=1 để bật): khi tắt, `lap` chỉ là một phép so sánh.
// Dùng: p.begin(); ...làm việc...; p.lap('tên'); ...; p.end(). Mỗi tick ghi mili giây của từng đoạn, /health trả p50/p95/max.

import { log } from '../log';

const ENABLED = process.env.TICK_PROF === '1';
const KEEP = 1200;

export class TickProf {
  readonly enabled = ENABLED;
  private t = 0;
  private cur = new Map<string, number>();
  private samples = new Map<string, number[]>();

  begin(): void {
    if (!ENABLED) return;
    this.t = performance.now();
    this.cur.clear();
  }

  lap(name: string): void {
    if (!ENABLED) return;
    const n = performance.now();
    this.cur.set(name, (this.cur.get(name) ?? 0) + (n - this.t));
    this.t = n;
  }

  end(): void {
    if (!ENABLED) return;
    for (const [k, v] of this.cur) {
      let a = this.samples.get(k);
      if (!a) this.samples.set(k, (a = []));
      a.push(v);
      if (a.length > KEEP) a.splice(0, KEEP / 2);
    }
  }

  /** Ghi một mẫu đo ngoài tick (vd. cập nhật AOI mỗi 250 ms). */
  add(name: string, ms: number): void {
    if (!ENABLED) return;
    let a = this.samples.get(name);
    if (!a) this.samples.set(name, (a = []));
    a.push(ms);
    if (a.length > KEEP) a.splice(0, KEEP / 2);
  }

  report(): Record<string, { p50: number; p95: number; max: number; mean: number }> {
    const o: Record<string, { p50: number; p95: number; max: number; mean: number }> = {};
    for (const [k, a] of this.samples) {
      const s = [...a].sort((x, y) => x - y);
      const q = (f: number) => Number(s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(3));
      o[k] = {
        p50: q(0.5),
        p95: q(0.95),
        max: Number(s[s.length - 1].toFixed(3)),
        mean: Number((s.reduce((x, y) => x + y, 0) / s.length).toFixed(3)),
      };
    }
    return o;
  }
}

/**
 * CPU profile của cả tiến trình server (mở bằng Chrome DevTools): CPU_PROF=<file.cpuprofile>[,<giây bắt đầu>,<giây ghi>].
 * Chỉ để đo (tắt mặc định). Ghi file sau `<giây ghi>` rồi thôi.
 */
export async function maybeCpuProfile(): Promise<void> {
  const spec = process.env.CPU_PROF;
  if (!spec) return;
  const [file, startS = '20', durS = '30'] = spec.split(',');
  const inspector = await import('node:inspector');
  const fs = await import('node:fs');
  const session = new inspector.Session();
  session.connect();
  const post = (m: string, p?: object) => new Promise<unknown>((res, rej) => session.post(m, p ?? {}, (e, r) => (e ? rej(e) : res(r))));
  await post('Profiler.enable');
  setTimeout(
    async () => {
      await post('Profiler.start');
      log.info('[cpuprof] bắt đầu');
      setTimeout(
        async () => {
          const r = (await post('Profiler.stop')) as { profile: unknown };
          fs.writeFileSync(file, JSON.stringify(r.profile));
          log.info('[cpuprof] đã ghi', file);
        },
        Number(durS) * 1000,
      );
    },
    Number(startS) * 1000,
  );
}
