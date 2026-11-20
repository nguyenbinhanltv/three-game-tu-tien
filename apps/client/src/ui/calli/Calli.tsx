import { useState, type CSSProperties } from 'react';
import { t } from '@dtl/content';
import { calliOf } from '../../base/calli';

/**
 * Chữ cố định hiện bằng ảnh thư pháp; chữ thật giữ ở `aria-label` và là phương án lùi khi không có ảnh/ảnh lỗi.
 * `em` = chiều cao ảnh theo em của phần tử cha (cỡ chữ). Chỉ dùng cho tên cố định (tiêu đề thẻ chương, địa danh…).
 */
export function Calli({ k, text, em = 2.2, big }: { k: string; text?: string; em?: number; big?: boolean }) {
  const [bad, setBad] = useState(false);
  const label = text ?? t(k);
  const e = bad ? undefined : calliOf(k);
  if (!e) return <>{label}</>;
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
