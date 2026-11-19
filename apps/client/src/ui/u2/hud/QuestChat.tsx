import { QUEST, t } from '@dtl/content';
import { trackedQuestId } from '../../../game/entities/offscreen';
import { objectiveText } from '../../objective';
import { setHudPref, setTrackQuest, useUI } from '../../store';
import { SysIcon } from '../shell';
import { blurAfterPointer } from './common';

/** Mũi tên thu/mở (dùng chung với Chat.tsx) của khối có thể thu gọn. */
export function Fold({ open, onClick, label }: { open: boolean; onClick: (e: React.MouseEvent<HTMLElement>) => void; label: string }) {
  return (
    <button type="button" className="u2h-fold" aria-expanded={open} aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path
          d={open ? 'M2 8l4-4 4 4' : 'M2 4l4 4 4-4'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** Theo dõi nhiệm vụ dưới minimap, thu gọn được thành thanh 34 px (lưu `dtl.questCollapsed`). */
export function QuestTrack() {
  const quests = useUI((s) => s.quests);
  const track = useUI((s) => s.trackQuest);
  const collapsed = useUI((s) => s.questCollapsed);
  const ids = Object.keys(quests.active);
  if (!ids.length) return null;
  // Nhiệm vụ đang theo dõi (chỉ báo ngoài màn hình trỏ tới): ghim bằng cú nhấp; mặc định nhiệm vụ đầu tiên có đích.
  // Cùng hàm với engine để chấm và chỉ báo luôn cùng một nhiệm vụ.
  const tracked = trackedQuestId(quests, track);
  return (
    <section className="u2h-zone u2h-quest u2h-card" data-collapsed={collapsed ? '1' : undefined} aria-label={t('ui.quests')}>
      <header className="u2h-card-head">
        <SysIcon name="quest" size={16} />
        <span>{t('ui.quests')}</span>
        {collapsed && <span className="u2h-count">{ids.length}</span>}
        <Fold
          open={!collapsed}
          label={t(collapsed ? 'ui.hud.expand' : 'ui.hud.collapse')}
          onClick={(e) => {
            setHudPref('questCollapsed', !collapsed);
            blurAfterPointer(e);
          }}
        />
      </header>
      {!collapsed &&
        ids.slice(0, 4).map((id) => {
          const q = QUEST.get(id);
          if (!q) return null;
          const prog = quests.active[id]!;
          const complete = q.objectives.every((o, i) => (prog[i] ?? 0) >= o.count);
          return (
            <div
              key={id}
              className={'u2h-q' + (complete ? ' done' : '') + (id === tracked ? ' tracked' : '')}
              title={t(id === tracked ? 'ui.quest.tracked' : 'ui.quest.track')}
              onClick={() => setTrackQuest(id === track ? '' : id)}
            >
              <div className="u2h-q-title">{t(`quest.${id}.name`)}</div>
              {q.objectives.map((o, i) => {
                const cur = Math.min(o.count, prog[i] ?? 0);
                const ok = cur >= o.count;
                // Nhiệm vụ không theo dõi chỉ hiện mục tiêu chưa xong đầu tiên cho gọn.
                if (id !== tracked && (ok || q.objectives.findIndex((x, j) => (prog[j] ?? 0) < x.count) !== i)) return null;
                const count = [
                  'level',
                  'talk',
                  'fly',
                  'breakthrough',
                  'enhance',
                  'dungeon',
                  'duel',
                  'clone',
                  'touch',
                  'scan',
                  'escort',
                ].includes(o.type)
                  ? ''
                  : ` ${cur}/${o.count}`;
                return (
                  <div key={i} className={'u2h-q-obj' + (ok ? ' ok' : '')}>
                    {ok ? '✔ ' : '· '}
                    {objectiveText(o)}
                    {count}
                  </div>
                );
              })}
              {complete && <div className="u2h-q-turnin">{t('ui.quest.turnin_at', { npc: t(`npc.${q.turnin}.name`) })}</div>}
            </div>
          );
        })}
    </section>
  );
}
