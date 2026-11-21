// Khung chạy kịch bản chụp: một kịch bản chỉ khai báo tên, mô tả, tham số và hàm `run`; khung lo dựng server dev ở
// cổng riêng (DB tạm), mở Chrome tắt tiếng, thư mục ra, gom lỗi console và LUÔN tắt server khi xong hay khi lỗi.
import fs from 'node:fs';
import type { Browser } from 'playwright';
import { launchChrome, reportErrors } from './browser';
import { createDevServer } from './devserver';
import { opt, outDir, ports } from './env';
import { openGame, type GamePage, type OpenOpts } from './game';

export interface Run {
  /** Thư mục ra (đã tạo). */
  out: string;
  clientPort: number;
  /** Cổng server game (cho bot, `/health`). */
  port: number;
  renderer: string;
  browser: Browser;
  /** Lỗi console của mọi trang mở qua `open`. */
  errors: string[];
  /** Vào game bằng tài khoản thử; cổng lấy từ lần chạy, `renderer` mặc định theo `--renderer`. */
  open(o: Omit<OpenOpts, 'clientPort' | 'errors'>): Promise<GamePage>;
}

export interface Scenario {
  name: string;
  /** Một dòng: chụp gì, dùng khi nào. */
  desc: string;
  /** Tham số riêng (in ở `pnpm shots <tên> --help`). */
  usage?: string;
  /** Biến môi trường thêm cho server dev (vd. `RATE_LIMIT_EXEMPT=loopback` khi kịch bản chạy bot). */
  env?: Record<string, string>;
  /** Không cần server/trình duyệt (vd. `--dry`): trả true thì khung thoát luôn. */
  dry?(): boolean;
  run(r: Run): Promise<void>;
}

/** Cặp cổng mặc định của `pnpm shots` (đổi bằng PORT/CLIENT_PORT khi chạy song song nhiều worktree). */
const DEFAULT_PORTS = [2675, 5175] as const;

export async function runScenario(sc: Scenario): Promise<void> {
  if (sc.dry?.()) return;
  const tag = `shots:${sc.name}`;
  const out = outDir(`shots-${sc.name}`);
  fs.mkdirSync(out, { recursive: true });
  const { port, clientPort } = ports(...DEFAULT_PORTS);
  const dev = createDevServer({ port, clientPort, tag: `shots-${sc.name}`, command: `pnpm shots ${sc.name}`, env: sc.env });
  const errors: string[] = [];
  let browser: Browser | undefined;
  try {
    await dev.start();
    browser = await launchChrome();
    const renderer = opt('--renderer', 'webgpu');
    const b = browser;
    await sc.run({ out, clientPort, port, renderer, browser: b, errors, open: (o) => openGame(b, { renderer, ...o, clientPort, errors }) });
    reportErrors(tag, errors);
    console.log(`[${tag}] xong, ảnh ở ${out}`);
  } catch (e) {
    console.error(`[${tag}] lỗi:`, e instanceof Error ? (e.stack ?? e.message) : e);
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
    dev.stop();
  }
}
