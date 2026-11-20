// Thanh tài nguyên riêng của công pháp (VS-2a): Kiếm ý (ô rời), Huyết khí và Đan hỏa (thanh liền).
// Chỉ hiển thị: server gửi giá trị và mốc tích gần nhất, phần rụng theo thời gian tính bằng luật chung `resNow`.
import type { CSSProperties } from 'react';
import { METHOD, t } from '@dtl/content';
import { useUI } from '../../store';
import { TipCard, Tooltip } from '../win';
import { useNow } from './common';
import { resView } from './resView';

export function ResourceBar() {
  const method = useUI((s) => s.method);
  const off = useUI((s) => s.methodOff);
  const now = useNow(100);
  const def = method?.method ? METHOD.get(method.method)?.resource : undefined;
  if (!method || !def) return null;
  const rv = resView(def, method.res, method.resAt, now - off, method.resMods);
  const name = t(`ui.method.res.${def.id}`);
  const n = Math.floor(rv.v);
  const value = t('ui.method.res.value', { n, max: rv.max });
  return (
    <Tooltip content={<TipCard title={name} sub={value} desc={t(`ui.method.res.${def.id}.tip`)} />}>
      <div
        className="res-bar"
        data-testid="res-bar"
        data-res={def.id}
        data-ui={def.ui}
        data-full={rv.full ? '1' : undefined}
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={rv.max}
        aria-valuenow={n}
      >
        <span className="res-name">{name}</span>
        {def.ui === 'pips' ? (
          <span className="res-pips">
            {Array.from({ length: rv.max }, (_, i) => (
              <i key={i} className={i < n ? 'on' : ''} />
            ))}
          </span>
        ) : (
          <>
            <span className="res-track">
              <i style={{ '--v': rv.max > 0 ? rv.v / rv.max : 0 } as CSSProperties} />
            </span>
            <span className="res-n">{n}</span>
          </>
        )}
      </div>
    </Tooltip>
  );
}
