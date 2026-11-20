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

const loaded = new Set<string>();
/** Danh sách ảnh cần nạp trước cho các i18n key (bỏ key chưa có ảnh); tách riêng để test. */
export function calliFilesOf(keys: readonly string[]): string[] {
  return keys.map((k) => calliOf(k)?.file).filter((f): f is string => !!f);
}
/** Nạp trước ảnh thư pháp cho thẻ sống ngắn (thẻ chiêu tối thượng 0,6 s): ảnh phải có sẵn trước lúc thẻ hiện, nếu không thẻ trống. */
export function preloadCalli(keys: readonly string[]): void {
  for (const file of calliFilesOf(keys)) {
    if (loaded.has(file)) continue;
    const im = new Image();
    im.onload = () => loaded.add(file);
    im.src = `/assets/calli/${file}`;
    void im.decode?.().catch(() => undefined);
  }
}

/**
 * Chữ cố định hiện bằng ảnh thư pháp; chữ thật giữ ở `aria-label` và là phương án lùi khi không có ảnh/ảnh lỗi.
 * `em` = chiều cao ảnh theo em của phần tử cha (cỡ chữ). Chỉ dùng cho tên cố định (tiêu đề thẻ chương, địa danh…).
 */
export function Calli({ k, text, em = 2.2, big }: { k: string; text?: string; em?: number; big?: boolean }) {
  const [bad, setBad] = useState(false);
  const label = text ?? t(k);
  const e = bad ? undefined : calliOf(k);
  // Ảnh chưa về (lần đầu, mạng chậm): hiện chữ thường, ảnh nạp ngầm rồi đổi sang; không bao giờ hiện khung trống.
  const [ready, setReady] = useState(() => !!e && loaded.has(e.file));
  if (!e) return <>{label}</>;
  if (!ready)
    return (
      <>
        {label}
        <img
          src={`/assets/calli/${e.file}`}
          alt=""
          hidden
          onLoad={() => {
            loaded.add(e.file);
            setReady(true);
          }}
          onError={() => setBad(true)}
        />
      </>
    );
  return (
    <span className="calli-wrap" role="img" aria-label={label}>
      <img
        className={'calli calli-reveal' + (big ? ' calli-big' : '')}
        src={`/assets/calli/${e.file}`}
        alt=""
        width={e.w}
        height={e.h}
        style={big ? undefined : ({ height: em + 'em' } as CSSProperties)}
        decoding="async"
        draggable={false}
        onError={() => setBad(true)}
      />
    </span>
  );
}
