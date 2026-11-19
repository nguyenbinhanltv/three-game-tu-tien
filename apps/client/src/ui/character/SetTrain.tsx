import { METHOD, methodName, realmName, SETS, skillBar, t } from '@dtl/content';
import { ContentIcon } from '../ContentIcon';
import { setLines, wornIds } from '../gear';
import { Button, Divider, Slot } from '../u2/win';
import { RootCard } from '../Realm';
import { openPanel, useUI } from '../store';

/** Bộ trang bị đang mặc (từ một món trở lên): đếm x/N và dòng sáng khi kích hoạt. */
function SetBoard() {
  const equip = useUI((s) => s.equip);
  const worn = wornIds(equip);
  const sets = SETS.filter((st) => st.pieces.some((p) => worn.includes(p)));
  return (
    <div className="set-board" data-testid="set-board">
      <Divider label={t('ui.set.panel')} />
      {!sets.length && <div className="k-dim">{t('ui.char.no_set')}</div>}
      {sets.map((st) => (
        <div key={st.id} className="k-card set-card" data-set={st.id}>
          {setLines(st, equip).map((l, i) => (
            <div key={i} className={'item-stat' + (l.tone ? ' ' + l.tone : '')}>
              {l.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Tab Bộ & tu luyện: bộ đang mặc, công pháp đang tu (nút mở bảng Công pháp), linh căn, chiêu. */
export function SetTrain() {
  const char = useUI((s) => s.char);
  const method = useUI((s) => s.method);
  if (!char) return null;
  const mid = method?.method || undefined;
  const def = mid ? METHOD.get(mid) : undefined;
  const skills = skillBar(mid);
  return (
    <div className="char-settrain">
      <SetBoard />
      <Divider label={t('ui.char.method')} />
      <div className="k-card method-card" data-testid="method-card">
        <div className="method-name">{def ? methodName(def.id) : t('ui.char.no_method')}</div>
        <Button onClick={() => openPanel('method')}>{t('ui.char.open_method')}</Button>
      </div>
      <Divider label={t('ui.root.title')} />
      <RootCard root={char.root} />
      <Divider label={t('ui.char.skills')} />
      <div className="skill-list">
        {skills.map((sk, i) => (
          <div key={sk.id} className={'skill-item' + (char.level < sk.unlock ? ' locked' : '')}>
            <Slot size="s" rarity={1} icon={<ContentIcon def={sk} />} label={t(`skill.${sk.id}.name`)} disabled={char.level < sk.unlock} />
            <div>
              <div className="skill-item-name">
                <kbd>{i + 1}</kbd> {t(`skill.${sk.id}.name`)}
                {char.level < sk.unlock && <i> — {t('ui.char.locked', { realm: realmName(sk.unlock) })}</i>}
              </div>
              <div className="k-dim">{t(`skill.${sk.id}.desc`)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
