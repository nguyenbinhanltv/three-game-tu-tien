import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';
import { t } from '@dtl/content';
import { Tooltip } from '../kit';
import { SysIcon, type SysIconName } from './icons';

/** Bộ thành phần "Ngọc Giản Kim Văn" (UI-1). Khung SVG/CSS, màu theo token `--ngj-*` (tokens.css), chưa gắn vào HUD/bảng thật. */

export type Material = 'lacquer' | 'paper';
export type CornerKind = 'star' | 'moon' | 'sun' | 'plain' | 'cloud';
export type MapMotif = 'van_lam' | 'doan_mach' | 'van_hai';

/* ───────── góc hoa văn ───────── */

const C_FRAME = 'M2 46V11Q2 2 11 2H46M6.5 46V14Q6.5 6.5 14 6.5H46';
const C_STAR = 'M16 8.6l1.7 5.7 5.7 1.7-5.7 1.7L16 23.4l-1.7-5.7L8.6 16l5.7-1.7z';
const C_MOON = 'M19.6 9.6a7 7 0 1 0 0 12.4 5.6 5.6 0 1 1 0-12.4z';
const C_SUN = 'M16 12.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM16 7v3M16 22v3M7 16h3M22 16h3M9.6 9.6l2 2M20.4 20.4l2 2M22.4 9.6l-2 2M11.6 20.4l-2 2';
const C_CLOUD = 'M2 46V16C2 8 8 2 16 2h30c-5 1.6-9 3.4-11 6.4-1.6 2.4.4 4.6-1.6 6.2-2.4 1.8-4.4-.4-6.6.8-2.2 1.4-1.4 4.4-3.2 6.4-1.6 1.8-4.4 1.2-5.6 3.4-1.2 2-.2 4.6-2.2 6.4C13.6 33.6 10 33 8.4 36 7 38.6 8.6 42.6 2 46z';

export function OrnateCorner({ kind = 'star', pos = 'tl' }: { kind?: CornerKind; pos?: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <svg className="ngj-corner" data-pos={pos} data-kind={kind} viewBox="0 0 48 48" aria-hidden="true">
      {kind === 'cloud' ? (
        <>
          <path className="ngj-fill-jade" d={C_CLOUD} />
          <path className="ngj-line-gold" d={C_CLOUD} />
          <circle className="ngj-fill-bead" cx="9" cy="9" r="3.2" />
        </>
      ) : (
        <>
          <path className="ngj-line-gold" d={C_FRAME} />
          {kind === 'star' && <path className="ngj-fill-gold" d={C_STAR} />}
          {kind === 'moon' && <path className="ngj-fill-gold" d={C_MOON} />}
          {kind === 'sun' && <path className="ngj-line-gold" d={C_SUN} />}
        </>
      )}
    </svg>
  );
}

const CORNERS: Record<Material, [CornerKind, CornerKind, CornerKind, CornerKind]> = {
  lacquer: ['star', 'moon', 'moon', 'star'],
  paper: ['cloud', 'cloud', 'cloud', 'cloud'],
};

/** Bốn góc hoa văn đặt tuyệt đối trong khối cha (HUD sơn mài); cha cần `position: relative`. */
export function Corners({ material = 'lacquer' }: { material?: Material }) {
  const k = CORNERS[material];
  return (
    <>
      <OrnateCorner kind={k[0]} pos="tl" />
      <OrnateCorner kind={k[1]} pos="tr" />
      <OrnateCorner kind={k[2]} pos="bl" />
      <OrnateCorner kind={k[3]} pos="br" />
    </>
  );
}

/* ───────── Panel ───────── */

/** Khung bảng: sơn mài huyền (HUD) hoặc giấy ngà tường vân (bảng lớn), bốn góc hoa văn. `corners` = false cho khung nhỏ. */
export function NgjPanel({ material = 'lacquer', corners = true, className, children, ...aria }: { material?: Material; corners?: boolean; className?: string; children: ReactNode; role?: string; 'aria-label'?: string; 'aria-labelledby'?: string }) {
  const k = CORNERS[material];
  return (
    <div className={'ngj-panel' + (className ? ' ' + className : '')} data-mat={material} {...aria}>
      {corners && (
        <>
          <OrnateCorner kind={k[0]} pos="tl" />
          <OrnateCorner kind={k[1]} pos="tr" />
          <OrnateCorner kind={k[2]} pos="bl" />
          <OrnateCorner kind={k[3]} pos="br" />
        </>
      )}
      <div className="ngj-panel-in">{children}</div>
    </div>
  );
}

/* ───────── Cartouche (bảng tên + họa tiết theo bản đồ) ───────── */

function Motif({ map }: { map: MapMotif }) {
  switch (map) {
    case 'van_lam':
      return (
        <>
          <circle className="ngj-m-sun" cx="52" cy="14" r="5" />
          <path className="ngj-m-far" d="M0 34l14-12 10 8 12-16 14 20z" />
          <path className="ngj-m-near" d="M-2 38l18-17 12 11 14-8 14 14z" />
          <path className="ngj-m-line" d="M8 38V28m-4 4l4-5 4 5m-8 3l4-5 4 5" />
        </>
      );
    case 'doan_mach':
      return (
        <>
          <path className="ngj-m-sun" d="M50 8a6 6 0 1 0 0 11 4.6 4.6 0 1 1 0-11z" />
          <path className="ngj-m-near" d="M0 38V22h12v-6h14v8h10v-5h18v19z" />
          <path className="ngj-m-far" d="M0 38V30h18v-3h16v6h26v5z" />
          <path className="ngj-m-line" d="M10 38v-9m3 9v-6m3 6v-8" />
        </>
      );
    case 'van_hai':
      return (
        <>
          <circle className="ngj-m-sun" cx="50" cy="12" r="5" />
          <path className="ngj-m-near" d="M8 24h24l-4 8h-5l-3 5-3-5h-5zM40 29h14l-2.4 5h-3l-2 3-2-3h-3z" />
          <path className="ngj-m-line" d="M10 21l5-4 5 4M28 14c2-2 4-2 6 0 2-2 4-2 6 0M0 40c8-3 14 0 22-2s14 1 22-1 14 1 20-1" />
        </>
      );
  }
}

/** Bảng tên nét đôi, họa tiết phong cảnh theo bản đồ nằm bên trái, chữ bên phải. `material` quyết định nền giấy hay sơn mài. */
export function Cartouche({ map, title, material = 'paper', size = 'm' }: { map: MapMotif; title: ReactNode; material?: Material; size?: 's' | 'm' | 'l' }) {
  return (
    <div className="ngj-cart" data-mat={material} data-map={map} data-size={size}>
      <svg className="ngj-cart-motif" viewBox="0 0 64 42" preserveAspectRatio="xMinYMid slice" aria-hidden="true">
        <Motif map={map} />
      </svg>
      <span className="ngj-cart-title">{title}</span>
    </div>
  );
}

/* ───────── Button ───────── */

export type NgjButtonVariant = 'primary' | 'secondary' | 'ghost';

export function NgjButton({ variant = 'primary', onClick, disabled, children, type = 'button', ...aria }: { variant?: NgjButtonVariant; onClick?: () => void; disabled?: boolean; children: ReactNode; type?: 'button' | 'submit'; 'aria-label'?: string }) {
  return (
    <button type={type} className="ngj-btn" data-variant={variant} disabled={disabled} onClick={onClick} {...aria}>
      <span className="ngj-btn-in">{children}</span>
    </button>
  );
}

/* ───────── Slot ───────── */

export type SlotShape = 'diamond' | 'round' | 'octagon';
const RING: Record<SlotShape, string> = {
  diamond: 'M50 2L98 50 50 98 2 50z',
  round: 'M50 2a48 48 0 1 1 0 96 48 48 0 0 1 0-96z',
  octagon: 'M31 2h38l29 29v38L69 98H31L2 69V31z',
};
const CLIP: Record<SlotShape, string> = {
  diamond: 'polygon(50% 3%, 97% 50%, 50% 97%, 3% 50%)',
  round: 'circle(47% at 50% 50%)',
  octagon: 'polygon(31% 3%, 69% 3%, 97% 31%, 97% 69%, 69% 97%, 31% 97%, 3% 69%, 3% 31%)',
};

/**
 * Ô hình thoi/tròn/bát giác có vòng chỉ vàng. Phẩm chất (0–4) hiện thành viền phát sáng, không tô đặc ô.
 * Hành vi như `Slot` của kit: không `onClick` vẫn là nút (focus, Tooltip), `empty` là ô trống.
 */
export function NgjSlot({ shape = 'diamond', icon, rarity = 0, selected, empty, size = 'm', onClick, label, disabled }: { shape?: SlotShape; icon?: ReactNode; rarity?: number; selected?: boolean; empty?: boolean; size?: 's' | 'm' | 'l'; onClick?: () => void; label?: string; disabled?: boolean }) {
  const q = Math.max(0, Math.min(4, Math.round(rarity)));
  const aria = empty ? t('ui.kit.slot.empty') : [label, t('ui.kit.rarity.' + q)].filter(Boolean).join(', ');
  return (
    <button type="button" className="ngj-slot" data-shape={shape} data-size={size} data-q={empty ? undefined : q} data-empty={empty ? 'true' : undefined} data-selected={selected || undefined} aria-label={aria} aria-pressed={selected || undefined} disabled={disabled} tabIndex={empty ? -1 : undefined} onClick={empty ? undefined : onClick}>
      <span className="ngj-slot-fill" style={{ clipPath: CLIP[shape] }}>
        {!empty && icon}
      </span>
      <svg className="ngj-slot-ring" viewBox="0 0 100 100" aria-hidden="true">
        <path d={RING[shape]} />
      </svg>
    </button>
  );
}

/* ───────── OrnateBar ───────── */

/** Thanh máu / linh lực / tu vi có đầu mút: trái hoa văn vàng, phải hạt ngọc. `value` 0–1; phần đầy co bằng transform, không tính layout. */
export function OrnateBar({ value, tone = 'health', label, text }: { value: number; tone?: 'health' | 'energy' | 'exp'; label: string; text?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className="ngj-bar" data-tone={tone} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg className="ngj-bar-cap" viewBox="0 0 24 24" aria-hidden="true">
        <path className="ngj-line-gold" d="M23 4H12C7 4 5 7 5 9.5S8 12 8 12s-3 .5-3 2.5S7 20 12 20h11" />
        <path className="ngj-fill-gold" d="M3 12l3-3 3 3-3 3z" />
      </svg>
      <div className="ngj-bar-track">
        <div className="ngj-bar-fill" style={{ transform: `scaleX(${v})` }} />
        {text && <span className="ngj-bar-text">{text}</span>}
      </div>
      <svg className="ngj-bar-jewel" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="ngj-bead" cx="12" cy="12" r="6.5" />
        <circle className="ngj-line-gold" cx="12" cy="12" r="9.5" />
      </svg>
    </div>
  );
}

/* ───────── TabRail ───────── */

export type RailTab = { id: string; label: string; icon: SysIconName };

/** Tab dọc có icon nét vàng; mũi tên lên/xuống chuyển tab, tab đang chọn có mốc thoi vàng phát sáng. */
export function TabRail({ items, value, onChange, label, material = 'lacquer' }: { items: RailTab[]; value: string; onChange: (id: string) => void; label: string; material?: Material }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + items.length) % items.length;
    onChange(items[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div className="ngj-rail" data-mat={material} role="tablist" aria-orientation="vertical" aria-label={label}>
      {items.map((it, i) => (
        <button
          key={it.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          aria-selected={it.id === value}
          tabIndex={it.id === value ? 0 : -1}
          className="ngj-rail-tab"
          onClick={() => onChange(it.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          <SysIcon name={it.icon} size={22} />
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ───────── Tooltip ───────── */

/** Chú giải kiểu sơn mài: dùng lại định vị của `Tooltip` kit (portal, lật khi hết chỗ), chỉ đổi khung và chữ. */
export function NgjTooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Tooltip content={content} tipClass="ngj-tip">
      {children}
    </Tooltip>
  );
}

/** Nội dung chuẩn của chú giải: tên (viền phẩm chất), phân cách có mốc thoi, các dòng chỉ số. */
export function NgjTipCard({ title, rarity = 0, sub, lines }: { title: string; rarity?: number; sub?: string; lines?: { name: string; value: string }[] }) {
  const id = useId();
  return (
    <div className="ngj-tipcard" data-q={rarity} aria-labelledby={id}>
      <div className="ngj-tipcard-title" id={id}>
        {title}
      </div>
      {sub && <div className="ngj-tipcard-sub">{sub}</div>}
      <div className="ngj-tipcard-div" aria-hidden="true">
        <i />
      </div>
      {lines?.map((l) => (
        <div className="ngj-tipcard-line" key={l.name}>
          <span>{l.name}</span>
          <b>{l.value}</b>
        </div>
      ))}
    </div>
  );
}
