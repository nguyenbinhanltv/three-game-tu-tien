import { bakeFarHeightCpu } from './farHeightCpu';
import type { FarBakeRequest } from './farHeight.worker';

/**
 * Nướng bản đồ độ cao vùng xa n×n (km) bằng float32 chính xác trên các Web Worker (chia theo hàng); không có Worker thì chạy ngay trên luồng chính.
 * Cùng kết quả trên mọi máy và mọi backend (xem farHeightCpu.ts). Chỉ gọi MỘT lần cho mỗi level.
 */
export async function bakeFarHeight(
  n: number,
  span: number,
  hero: readonly [number, number],
  detail = 9,
  workers = 0,
): Promise<Float32Array> {
  const count = workers || Math.max(1, Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 2) - 1));
  if (typeof Worker === 'undefined' || count < 2) return bakeFarHeightCpu(n, span, hero, detail);
  const out = new Float32Array(n * n);
  const per = Math.ceil(n / count);
  const pool: Worker[] = [];
  try {
    await Promise.all(
      Array.from({ length: count }, (_, k) => {
        const r0 = k * per;
        const r1 = Math.min(n, r0 + per);
        if (r0 >= r1) return Promise.resolve();
        const w = new Worker(new URL('./farHeight.worker.ts', import.meta.url), { type: 'module' });
        pool.push(w);
        return new Promise<void>((resolve, reject) => {
          w.onmessage = (e: MessageEvent<{ rows: [number, number]; data: Float32Array }>) => {
            out.set(e.data.data, e.data.rows[0] * n);
            resolve();
          };
          w.onerror = (e) => reject(new Error(e.message));
          const req: FarBakeRequest = { id: k, n, span, hero: [hero[0], hero[1]], detail, rows: [r0, r1] };
          w.postMessage(req);
        });
      }),
    );
  } finally {
    for (const w of pool) w.terminate();
  }
  return out;
}
