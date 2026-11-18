import { useUI } from '../../ui/store';
import { assets } from '../assets';
import { urlParams } from '../flags';
import { FrameIdle, type NavInfo } from './policy';
import { HiresStreamer } from './streamer';

/** Sau khi vào game bao lâu (ms) thì bắt đầu tải bậc texture cao. */
const START_DELAY_MS = 8000;

function navInfo(): NavInfo {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string; downlink?: number } };
  return { deviceMemory: n.deviceMemory, saveData: n.connection?.saveData, effectiveType: n.connection?.effectiveType, downlink: n.connection?.downlink };
}

let streamer: HiresStreamer | null = null;

/** Khởi động một lần ở trang game (không dùng ở viewer). `?hires=0` tắt (so ảnh, đo). */
export function startHires(): HiresStreamer | null {
  if (streamer) return streamer;
  if (urlParams().get('hires') === '0') return null;
  const idle = new FrameIdle();
  let last = performance.now();
  let raf = 0;
  // Đo khung chỉ khi preset có tải bậc cao (Vừa/Thấp không dựng vòng rAF).
  const frame = (t: number) => {
    idle.push(t - last);
    last = t;
    raf = requestAnimationFrame(frame);
  };
  const measure = (on: boolean) => {
    if (on && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!on && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  let firstLoaded = 0;
  streamer = new HiresStreamer(assets, {
    quality: () => useUI.getState().quality,
    nav: navInfo,
    ready: () => {
      measure(true);
      if (document.hidden || assets.stats().loaded === 0) return false;
      firstLoaded ||= performance.now();
      return performance.now() - firstLoaded > START_DELAY_MS && idle.idle();
    },
  });
  setInterval(() => {
    void streamer?.tick();
    if (streamer?.policy.tier === 0) measure(false);
  }, 500);
  (window as unknown as { __hires?: typeof hiresInfo }).__hires = hiresInfo;
  return streamer;
}

export function hiresInfo(): { tier: number; loaded: number; memMB: number } {
  return { tier: streamer?.policy.tier ?? 0, loaded: streamer?.loaded ?? 0, memMB: Math.round(assets.hiresMemory() / 1048576) };
}
