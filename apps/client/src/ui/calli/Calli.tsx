import { useState, type CSSProperties } from 'react';
import { hasString, t } from '@dtl/content';
import manifest from './manifest.json';

interface Entry {
  key: string;
  text: string;
  file: string;
  w: number;
  h: number;
}

/** Ảnh thư pháp đã vẽ (tools/calli) theo i18n key. Trả undefined khi chưa có ảnh hoặc chữ i18n đã đổi sau lần vẽ (ảnh cũ). */
export function calliOf(key: string): Entry | undefined {
  if (!hasString(key)) return undefined;
  const e = Object.values(manifest as Record<string, Entry>).find((x) => x.key === key);
  return e && e.text === t(key) ? e : undefined;
}

/**
 * Chữ cố định hiện bằng ảnh thư pháp; chữ thật giữ ở `aria-label` và là phương án lùi khi không có ảnh/ảnh lỗi.
 * `em` = chiều cao ảnh theo em của phần tử cha (cỡ chữ). Chỉ dùng cho tên cố định (tiêu đề thẻ chương, địa danh…).
 */
export function Calli({ k, text, em = 2.2 }: { k: string; text?: string; em?: number }) {
  const [bad, setBad] = useState(false);
  const label = text ?? t(k);
  const e = bad ? undefined : calliOf(k);
  if (!e) return <>{label}</>;
  return (
    <span className="calli-wrap" role="img" aria-label={label}>
      <img
        className="calli calli-reveal"
        src={`/assets/calli/${e.file}`}
        alt=""
        width={e.w}
        height={e.h}
        style={{ height: em + 'em' } as CSSProperties}
        decoding="async"
        draggable={false}
        onError={() => setBad(true)}
      />
    </span>
  );
}
