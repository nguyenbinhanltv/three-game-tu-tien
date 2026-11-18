import { SYS_GLYPHS } from './sysGlyphs';

/** Id có icon hệ thống nét vàng (hub, dấu nhiệm vụ, tiền, trạng thái, nhãn…). Màu theo `color` của phần tử cha. */
export const isSysGlyph = (id: string): boolean => Object.prototype.hasOwnProperty.call(SYS_GLYPHS, id);

/** Icon hệ thống vẽ bằng SVG (U2-I): nét theo `currentColor`, vùng tô nhẹ cho vật có khối. Kích thước theo `font-size` (1.35em). */
export function SysGlyph({ id, className }: { id: string; className?: string }) {
  const g = isSysGlyph(id) ? SYS_GLYPHS[id] : undefined;
  if (!g) return null;
  return (
    <svg className={'sys-glyph' + (className ? ' ' + className : '')} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {g[1] ? <path className="sys-glyph__fill" d={g[1]} /> : null}
      <path className="sys-glyph__line" d={g[0]} />
    </svg>
  );
}
