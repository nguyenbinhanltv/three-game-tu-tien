// Bảng tổng kết trận (Chân Cảnh U5, X6): hiện sau khi hoàn thành bí cảnh. Toàn bộ số liệu do server tổng hợp (`S.RECAP`); client chỉ vẽ.
import './ui-recap.css';
import { useEffect } from 'react';
import { recapShare, type RecapRow } from '@dtl/shared';
import { realmName, t } from '@dtl/content';
import { Game } from '../game/engine';
import { set, useUI } from './store';
import { Button, Header, Panel, PanelBody } from './u2/win';

const fmt = (n: number): string => n.toLocaleString('vi-VN');
const clock = (secs: number): string => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

function Row({ r, me, total }: { r: RecapRow; me: boolean; total: number }) {
  return (
    <tr className={(me ? 'me ' : '') + (r.dead ? 'dead' : '')} data-testid="recap-row">
      <th scope="row">
        <span className="recap-name">{r.name}</span>
        <span className="recap-lv">{realmName(r.level)}</span>
      </th>
      <td className="recap-dealt">
        <span className="recap-bar" style={{ '--p': total > 0 ? r.dealt / total : 0 } as React.CSSProperties} aria-hidden="true" />
        <span className="recap-num">{fmt(r.dealt)}</span>
        <em>{recapShare(r.dealt, total)}%</em>
      </td>
      <td>{fmt(r.heal)}</td>
      <td>{fmt(r.taken)}</td>
      <td>{r.reflect > 0 ? fmt(r.reflect) : t('ui.recap.none')}</td>
    </tr>
  );
}

export function Recap() {
  const recap = useUI((s) => s.recap);
  const close = () => set({ recap: null });
  useEffect(() => {
    if (!recap) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [recap]);
  if (!recap) return null;
  const total = recap.rows.reduce((a, r) => a + r.dealt, 0);
  const sid = Game.current?.sid;
  return (
    <div className="recap" data-testid="recap">
      <Panel tone="paper" size="l" className="recap-panel" role="dialog" aria-labelledby="recap-title">
        <Header
          id="recap-title"
          title={t('ui.recap.title')}
          sub={`${t(`dungeon.${recap.level}.name`)} · ${t('ui.recap.time', { t: clock(recap.secs) })}`}
          onClose={close}
        />
        <PanelBody>
          <table className="recap-table">
            <thead>
              <tr>
                <th scope="col">{t('ui.recap.player')}</th>
                <th scope="col">{t('ui.recap.dealt')}</th>
                <th scope="col">{t('ui.recap.heal')}</th>
                <th scope="col">{t('ui.recap.taken')}</th>
                <th scope="col">{t('ui.recap.reflect')}</th>
              </tr>
            </thead>
            <tbody>
              {recap.rows.map((r) => (
                <Row key={r.sid} r={r} me={r.sid === sid} total={total} />
              ))}
            </tbody>
          </table>
          <div className="recap-actions">
            <Button variant="primary" onClick={close}>
              {t('ui.recap.close')}
            </Button>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
