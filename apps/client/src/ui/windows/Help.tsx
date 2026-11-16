import { t } from '@dtl/content';
import { closePanel } from '../store';
import { Window } from './common';

export function Help() {
  const rows = ['move', 'camera', 'jump', 'fly', 'target', 'skill', 'dash', 'interact', 'meditate', 'panels', 'chat'];
  return (
    <Window title={t('ui.help')} onClose={() => closePanel('help')} cls="help" width={520}>
      <table className="help-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td>{t(`ui.help.${r}`)}</td>
              <td>{t(`ui.help.${r}_v`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="k-dim">{t('ui.help.tip')}</div>
    </Window>
  );
}
