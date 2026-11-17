// Ngưỡng CPU cho test đo thời gian (chỉ dùng trong *.test.ts). Số ghi trong test là ngân sách trên máy dev rảnh;
// runner CI (2 vCPU dùng chung) và máy đang chạy nhiều worker chậm hơn vài lần và dao động, nên nới ngưỡng ở đó:
// test vẫn bắt được hồi quy cỡ bậc độ lớn mà không đỏ vì nhiễu. `PERF_BUDGET_SCALE=<hệ số>` ghi đè (1 = nghiêm như máy dev).

const scale = (): number => Number(process.env.PERF_BUDGET_SCALE ?? (process.env.CI ? 4 : 1));

/** Ngưỡng `ms` đã nhân hệ số của môi trường chạy. */
export const cpuBudget = (ms: number): number => ms * scale();

/** Chạy `fn` `rounds` lần, lấy lần nhanh nhất: bỏ nhiễu do GC hoặc tiến trình khác chen vào. */
export function fastest(rounds: number, fn: () => number): number {
  let best = Infinity;
  for (let i = 0; i < rounds; i++) best = Math.min(best, fn());
  return best;
}
