import type { ReactNode } from 'react';
import { t } from '@dtl/content';
import { Cartouche, Corners, type MapMotif } from '../ngj/ngj';
import { ngjHud } from '../ngj/motion';
import { useUI } from '../store';
import '../ngj/tokens.css';
import '../ngj/panels.css';

export type PanelTone = 'night' | 'paper' | 'stone';

/**
 * Khung vát: lớp ngoài là viền đồng thau, lớp trong là nền lam đêm / giấy ngà / đá (theo bảng màu tâm trạng).
 * Dùng `Header` ở đầu và `PanelBody` cho phần cuộn.
 */
export function Panel({
  tone = 'night',
  size = 'l',
  className,
  children,
  ...aria
}: {
  tone?: PanelTone;
  size?: 's' | 'l';
  className?: string;
  children: ReactNode;
  role?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <div className={'k-panel' + (className ? ' ' + className : '')} data-tone={tone} data-size={size} {...aria}>
      <div className="k-panel-edge">
        <div className="k-panel-in">{children}</div>
      </div>
    </div>
  );
}

export function PanelBody({ flush, children }: { flush?: boolean; children: ReactNode }) {
  return <div className={'k-panel-body' + (flush ? ' flush' : '')}>{children}</div>;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1.5 1.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="square" />
    </svg>
  );
}

/** Tiêu đề bảng: mốc thoi, chữ serif giãn cách, đường kẻ đồng thau, nút đóng (nếu có `onClose`). */
export function Header({ title, sub, onClose, actions, id, plate }: { title: string; sub?: string; onClose?: () => void; actions?: ReactNode; id?: string; plate?: MapMotif }) {
  const heading = (
    <h2 className="k-head-title" id={id}>
      {title}
    </h2>
  );
  return (
    <div className={'k-head' + (plate ? ' ngj-head' : '')}>
      <span className="k-head-mark" aria-hidden="true" />
      <div className="k-head-text">
        {plate ? <Cartouche map={plate} material="paper" title={heading} /> : heading}
        {sub && <div className="k-head-sub">{sub}</div>}
      </div>
      <div className="k-head-actions">
        {actions}
        {onClose && (
          <button type="button" className="k-close" onClick={onClose} aria-label={t('ui.close')} title={t('ui.close')}>
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}

/** Đường kẻ có mốc thoi giữa; có `label` thì thành tiêu đề mục (thay `.section-title`). */
export function Divider({ label }: { label?: ReactNode }) {
  return (
    <div className="k-divider" role={label ? undefined : 'separator'}>
      <i aria-hidden="true" />
      {label && <span>{label}</span>}
      {label && <i aria-hidden="true" />}
    </div>
  );
}

const MOTIFS: string[] = ['van_lam', 'doan_mach', 'van_hai', 'thien_khuyet', 'bac_hoang'];

/**
 * Cửa sổ nằm giữa màn hình (Panel + Header + phần thân cuộn). `width` tính bằng px.
 * HUD kiểu Ngọc Giản (UI-3, `?ngj=0` tắt): giấy ngà tường vân, bảng tên theo bản đồ, góc hoa văn, viền vẽ dần khi mở.
 */
export function PanelWindow({
  title,
  sub,
  onClose,
  width = 430,
  tone,
  className,
  children,
}: {
  title: string;
  sub?: string;
  onClose?: () => void;
  width?: number;
  tone?: PanelTone;
  className?: string;
  children: ReactNode;
}) {
  const level = useUI((s) => s.level);
  const motif = (MOTIFS.includes(level) ? level : 'van_lam') as MapMotif;
  return (
    <div className={'k-window' + (ngjHud ? ' ngj-win' : '') + (className ? ' ' + className : '')} style={{ '--w': width + 'px' } as React.CSSProperties}>
      <Panel tone={tone} role="dialog" aria-label={title}>
        {ngjHud && (
          <>
            <Corners material="paper" />
            <svg className="ngj-draw" aria-hidden="true">
              <rect pathLength={1} rx="12" ry="12" />
            </svg>
          </>
        )}
        <Header title={title} sub={sub} onClose={onClose} plate={ngjHud ? motif : undefined} />
        <PanelBody>{children}</PanelBody>
      </Panel>
    </div>
  );
}
