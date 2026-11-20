import { hasString, t } from '@dtl/content';
import manifest from './calliManifest.json';

export interface CalliEntry {
  key: string;
  text: string;
  file: string;
  w: number;
  h: number;
}

/** Ảnh thư pháp đã vẽ (tools/calli) theo i18n key. Trả undefined khi chưa có ảnh hoặc chữ i18n đã đổi sau lần vẽ (ảnh cũ). */
export function calliOf(key: string): CalliEntry | undefined {
  if (!hasString(key)) return undefined;
  const e = Object.values(manifest as Record<string, CalliEntry>).find((x) => x.key === key);
  return e && e.text === t(key) ? e : undefined;
}
