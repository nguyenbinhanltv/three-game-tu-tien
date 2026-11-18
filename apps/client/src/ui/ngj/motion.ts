import { useSyncExternalStore } from 'react';
import { FLAGS } from '../../game/flags';

/**
 * Cài đặt "Giảm chuyển động" (UI-1): tắt mọi hiệu ứng mở bảng, vòng quét, hạt sáng của bộ giao diện Ngọc Giản.
 * Lưu ở localStorage `dtl.reduceMotion` ('1' | '0'); chưa chọn thì theo `prefers-reduced-motion` của hệ điều hành.
 * Kết quả ghi vào `data-reduce-motion` trên <html> để CSS (`ngj.css`) bắt bằng một chỗ.
 */
const KEY = 'dtl.reduceMotion';
const subs = new Set<() => void>();
let override: boolean | null = null; // khi localStorage bị chặn

function stored(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === '1' ? true : v === '0' ? false : override;
  } catch {
    return override;
  }
}

function system(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function reduceMotion(): boolean {
  return stored() ?? system();
}

function apply(): void {
  document.documentElement.dataset.reduceMotion = reduceMotion() ? 'true' : 'false';
  subs.forEach((f) => f());
}

export function setReduceMotion(on: boolean): void {
  override = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* localStorage bị chặn: chỉ áp cho phiên này */
  }
  apply();
}

/** Gọi một lần lúc khởi động (và ở trang ?ui=kit). */
export function installMotion(): void {
  apply();
  if (typeof matchMedia === 'function') matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', apply);
}

export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    reduceMotion,
    () => false,
  );
}

/**
 * HUD kiểu Ngọc Giản (UI-2): bật mặc định; `?ngj=0` về HUD cũ để so ảnh trước/sau. Đặt `data-ngj="1"` trên <html>
 * (CSS `:root[data-ngj='1']`), và JSX đọc `ngjHud` để chọn cấu trúc mới.
 */
export const ngjHud: boolean = FLAGS.ngj;
export function installNgjHud(): void {
  if (ngjHud) document.documentElement.dataset.ngj = '1';
}
