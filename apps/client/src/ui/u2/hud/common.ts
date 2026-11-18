import { type MouseEvent, useEffect, useState } from 'react';

/** Đồng hồ làm mới theo `ms` (hồi chiêu, niệm chú, thời hạn hiển thị). */
export function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Bấm bằng chuột xong thì bỏ focus để phím số/mũi tên tiếp theo tới game (bàn phím giữ focus). */
export function blurAfterPointer(e: MouseEvent<HTMLElement>): void {
  if (e.detail > 0) e.currentTarget.blur();
}
