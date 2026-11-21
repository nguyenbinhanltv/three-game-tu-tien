// Ấn mục tiêu đang mang (VS-2c): hàng thẻ nhỏ trong khung mục tiêu và thanh thủ lĩnh. Chỉ hiển thị gói bit server gửi.
import type { CSSProperties } from 'react';
import { t } from '@dtl/content';
import { markText, markViews } from '../../../game/entities/markLabel';
import { TipCard, Tooltip } from '../win';

export function MarkChips({ mk }: { mk: number | undefined }) {
  const vs = markViews(mk);
  if (!vs.length) return null;
  return (
    <div className="mark-chips" data-testid="mark-chips" aria-label={t('ui.mark.title')}>
      {vs.map((v) => (
        <Tooltip key={v.id} content={<TipCard title={v.name} sub={t('ui.mark.title')} desc={t(`mark.${v.id}.desc`)} />}>
          <span className="mark-chip" data-mark={v.id} style={{ '--mc': v.color } as CSSProperties}>
            {markText(v)}
          </span>
        </Tooltip>
      ))}
    </div>
  );
}
