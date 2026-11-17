// Mở Chrome cho công cụ đo/chụp: LUÔN tắt tiếng (`--mute-audio`, URL game có `?mute=1`), bật WebGPU ở headless.
import { chromium, type Browser, type Page } from 'playwright';
import './window';

export const CHROME_ARGS = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];

/** Chrome cài sẵn (`channel`), không có thì lùi về Chromium của Playwright. `channel: 'chromium'` dùng thẳng bản Playwright. */
export async function launchChrome(o: { channel?: string; headed?: boolean; args?: string[]; tag?: string } = {}): Promise<Browser> {
  const args = [...CHROME_ARGS, ...(o.args ?? [])];
  const channel = o.channel ?? 'chrome';
  const fallback = () => chromium.launch({ headless: !o.headed, args });
  if (channel === 'chromium') return fallback();
  return chromium.launch({ channel, headless: !o.headed, args }).catch((e: Error) => {
    if (o.tag) console.warn(`[${o.tag}] không mở được channel "${channel}" (${e.message.split('\n')[0]}), dùng Chromium của Playwright`);
    return fallback();
  });
}

type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * URL game/viewer ở client dev, luôn có `mute=1`. `renderer: 'webgl2'` thêm `renderer=webgl2` (webgpu là mặc định).
 * `extra`: chuỗi query thô của người dùng (`a=b&c=d`, có hay không có `&` đầu đều được).
 */
export function gameUrl(clientPort: number, query: Query = {}, o: { renderer?: string; extra?: string } = {}): string {
  const q = new URLSearchParams({ mute: '1' });
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== false) q.set(k, v === true ? '1' : String(v));
  if (o.renderer === 'webgl2') q.set('renderer', 'webgl2');
  const extra = (o.extra ?? '').replace(/^[&?]+/, '');
  return `http://localhost:${clientPort}/?${q.toString()}${extra ? '&' + extra : ''}`;
}

/** Gom lỗi trang và lỗi console (kèm cảnh báo khớp `warnings`) vào một mảng để in cuối lần chạy. */
export function watchErrors(page: Page, o: { tag?: string; warnings?: boolean | RegExp; into?: string[] } = {}): string[] {
  const errors = o.into ?? [];
  const pre = o.tag ? o.tag + ': ' : '';
  page.on('pageerror', (e) => errors.push(`${pre}pageerror: ${e.message}`));
  page.on('console', (m) => {
    const warn = m.type() === 'warning' && (o.warnings === true || (o.warnings instanceof RegExp && o.warnings.test(m.text())));
    if (m.type() === 'error' || warn) errors.push(pre + m.text().slice(0, 500));
  });
  return errors;
}

/** In tối đa `max` lỗi console không trùng (hoặc dòng "0 lỗi"). */
export function reportErrors(tag: string, errors: string[], max = 10): void {
  const uniq = [...new Set(errors)];
  console.log(uniq.length ? `[${tag}] ${uniq.length} lỗi console:\n  ` + uniq.slice(0, max).join('\n  ') : `[${tag}] 0 lỗi console`);
}
