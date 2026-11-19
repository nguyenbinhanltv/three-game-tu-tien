import { t } from '@dtl/content';
import { UiIcon } from '../ContentIcon';
import { pctText } from '../gear';
import { Divider, TipCard, Tooltip } from '../u2/win';
import { useUI } from '../store';
import { statText } from './Overview';
import { elemRows, STAT_GROUPS, statRows, type SourceId, type StatRow } from './stats';

const SRC_TONE: Record<SourceId, 'dim' | 'good' | 'set'> = { base: 'dim', gear: 'good', set: 'set', root: 'good', other: 'good' };

function sourceText(r: StatRow, src: SourceId, v: number): string {
  const sign = v > 0 && src !== 'base' ? '+' : '';
  const num = r.kind === 'flat' ? String(Math.round(v)) : pctText(v) + '%';
  return `${t('ui.attr.src.' + src)}: ${sign}${num}`;
}

function AttrRow({ r }: { r: StatRow }) {
  const tip = (
    <TipCard
      title={t('ui.cmp.' + r.id)}
      lines={r.sources.map((s) => ({ text: sourceText(r, s.src, s.v), tone: SRC_TONE[s.src] }))}
      desc={t('ui.attr.desc.' + r.id)}
    />
  );
  return (
    <Tooltip content={tip}>
      <div className="attr-row" tabIndex={0} data-stat={r.id}>
        <span className="attr-name">{t('ui.cmp.' + r.id)}</span>
        <span className="attr-val">{statText(r.id, r.kind, r.total)}</span>
      </div>
    </Tooltip>
  );
}

/** Tab Thuộc tính: mọi chỉ số chia nhóm, rê chuột xem nguồn (gốc cảnh giới / trang bị / bộ / linh căn / khác) và ý nghĩa. */
export function Attributes() {
  const char = useUI((s) => s.char);
  const equip = useUI((s) => s.equip);
  if (!char) return null;
  const rows = statRows(char.level, equip, char.root, char);
  const elems = elemRows(char.level, equip, char.root);
  return (
    <div className="char-attrs">
      {STAT_GROUPS.map((g) => (
        <div key={g.id} className="attr-group" data-group={g.id}>
          <Divider label={t('ui.attr.group.' + g.id)} />
          <div className="attr-rows">
            {rows
              .filter((r) => r.group === g.id)
              .map((r) => (
                <AttrRow key={r.id} r={r} />
              ))}
          </div>
        </div>
      ))}
      <div className="attr-group" data-group="elements">
        <Divider label={t('ui.attr.group.elements')} />
        <div className="attr-elems">
          {elems.map((e) => (
            <Tooltip
              key={e.elem}
              content={
                <TipCard
                  title={t(`elem.${e.elem}`)}
                  lines={[{ text: t('ui.attr.elem_dmg', { v: pctText(e.dmg) }) }, { text: t('ui.attr.elem_res', { v: pctText(e.res) }) }]}
                  desc={t('ui.attr.desc.elements')}
                />
              }
            >
              <div className={'attr-elem' + (e.own ? ' own' : '')} tabIndex={0} data-elem={e.elem}>
                <UiIcon id={`root_${e.elem}`} fallback={t(`elem.${e.elem}`)} className="inline" />
                <span>{pctText(e.dmg)}%</span>
                <span className="k-dim">{pctText(e.res)}%</span>
              </div>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}
