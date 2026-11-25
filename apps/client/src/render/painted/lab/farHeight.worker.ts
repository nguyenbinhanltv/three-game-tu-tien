import { bakeFarHeightCpu } from './farHeightCpu';

/** Worker nướng một dải hàng của bản đồ độ cao vùng xa (float32 chính xác, xem farHeightCpu.ts). */
export interface FarBakeRequest {
  id: number;
  n: number;
  span: number;
  hero: [number, number];
  detail: number;
  rows: [number, number];
}

self.onmessage = (e: MessageEvent<FarBakeRequest>) => {
  const { id, n, span, hero, detail, rows } = e.data;
  const data = bakeFarHeightCpu(n, span, hero, detail, rows);
  (self as unknown as Worker).postMessage({ id, rows, data }, [data.buffer]);
};
