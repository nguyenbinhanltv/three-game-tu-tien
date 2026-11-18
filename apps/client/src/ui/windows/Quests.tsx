import { QUEST, QUESTS, t } from '@dtl/content';
import { objectiveText } from '../objective';
import { closePanel, useUI } from '../store';
import { RewardLine, Window } from './common';

export function Quests() {
  const quests = useUI((s) => s.quests);
  const ids = Object.keys(quests.active);
  return (
    <Window
      title={t('ui.quests')}
      sub={t('ui.quest.done_count', { n: quests.done.length, total: QUESTS.length })}
      onClose={() => closePanel('quests')}
      cls="quests"
      width={460}
    >
      {ids.length === 0 && <div className="k-dim">{t('ui.quest.none')}</div>}
      {ids.map((id) => {
        const q = QUEST.get(id);
        if (!q) return null;
        const prog = quests.active[id];
        return (
          <div key={id} className="k-card quest-card">
            <div className="quest-title">{t(`quest.${id}.name`)}</div>
            <div className="quest-desc">{t(`quest.${id}.desc`)}</div>
            {q.objectives.map((o, i) => {
              const cur = Math.min(o.count, prog[i] ?? 0);
              const ok = cur >= o.count;
              const count = o.type === 'kill' || o.type === 'gather' || o.type === 'craft' ? ` ${cur}/${o.count}` : '';
              return (
                <div key={i} className={'quest-obj' + (ok ? ' ok' : '')}>
                  {ok ? '✔' : '○'} {objectiveText(o)}
                  {count}
                </div>
              );
            })}
            <div className="k-dim">{t('ui.quest.turnin_at', { npc: t(`npc.${q.turnin}.name`) })}</div>
            <RewardLine id={id} />
          </div>
        );
      })}
    </Window>
  );
}
