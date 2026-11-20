// Tủ ngoại trang (P4-3, docs/wardrobe/README.md): chọn dáng đã mở khóa để HIỂN THỊ thay cho món đang mặc, nhuộm 3 kênh.
// Chỉ gửi ý định (C.LOOK_SET / LOOK_DYE / LOOK_RESET); server kiểm sở hữu, ô, giới tính. Không đổi chỉ số. Miễn phí.
import { useEffect, useMemo, useRef, useState } from 'react';
import { C, DISPLAY_SLOTS, DYE_CHANNELS, type DisplaySlot } from '@dtl/shared';
import { APPEARANCE, ITEM, itemName, t } from '@dtl/content';
import { Game, reqId } from '../../game/engine';
import { ContentIcon } from '../ContentIcon';
import { closePanel, useUI } from '../store';
import { Button, Divider, PanelWindow, Slot, Tabs, Tooltip } from '../u2/win';
import { gearQuality } from '../gear';
import { draftFrom, itemsForSlot, planApply, withChannel, type Draft, type LookCmd } from './model';
import './wardrobe.css';

/** Server giãn 200 ms giữa hai lần đổi (cùng chặn với mặc/tháo đồ): gửi lần lượt, cách nhau một chút. */
const SEND_GAP_MS = 260;

function send(cmd: LookCmd): void {
  const g = Game.current;
  if (!g) return;
  if (cmd.kind === 'set') g.send(C.LOOK_SET, { slot: cmd.slot, id: cmd.id, r: reqId() });
  else g.send(C.LOOK_DYE, { dye: cmd.dye, r: reqId() });
}

export function Wardrobe() {
  const wardrobe = useUI((s) => s.wardrobe);
  const equip = useUI((s) => s.equip);
  const gender = Game.current?.myGender() ?? '';
  const [tab, setTab] = useState<DisplaySlot>('robe');
  const [draft, setDraft] = useState<Draft>(() => draftFrom(wardrobe.look));
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);
  // Server xác nhận (hoặc từ chối) thì bản nháp bám theo lựa chọn thật.
  useEffect(() => setDraft(draftFrom(wardrobe.look)), [wardrobe.look]);

  const cmds = useMemo(() => planApply(wardrobe.look, draft), [wardrobe.look, draft]);
  const list = useMemo(() => itemsForSlot(wardrobe.owned, tab, gender, (id) => ITEM.get(id)), [wardrobe.owned, tab, gender]);
  const base = APPEARANCE.defaultDye;
  const wornId = equip[tab]?.id;

  const apply = () => {
    timers.current.forEach((x) => window.clearTimeout(x));
    timers.current = cmds.map((c, i) => window.setTimeout(() => send(c), i * SEND_GAP_MS));
  };
  const reset = () => {
    timers.current.forEach((x) => window.clearTimeout(x));
    Game.current?.send(C.LOOK_RESET, { r: reqId() });
  };

  return (
    <PanelWindow title={t('ui.wardrobe.title')} width={560} onClose={() => closePanel('wardrobe')}>
      <div className="wd" data-testid="wardrobe">
        {equip.skin && (
          <div className="wd-note" role="status">
            {t('ui.wardrobe.skin_over', { name: itemName(equip.skin.id) })}
          </div>
        )}
        <Tabs
          label={t('ui.wardrobe.slots')}
          value={tab}
          onChange={(id) => setTab(id as DisplaySlot)}
          items={DISPLAY_SLOTS.map((s) => ({ id: s, label: t('ui.equip.' + s) }))}
        />
        <div className="wd-grid" role="group" aria-label={t('ui.equip.' + tab)}>
          <div className="wd-cell">
            <Slot
              icon={<span className="wd-default">{t('ui.wardrobe.default_short')}</span>}
              selected={draft.over[tab] === null}
              onClick={() => setDraft({ ...draft, over: { ...draft.over, [tab]: null } })}
              label={t('ui.wardrobe.default')}
            />
            <div className="wd-name">{wornId ? itemName(wornId) : t('ui.equip.empty')}</div>
          </div>
          {list.map(({ id, ok }) => {
            const def = ITEM.get(id)!;
            return (
              <div key={id} className="wd-cell" data-locked={ok ? undefined : '1'}>
                <Tooltip content={ok ? itemName(id) : t('ui.item.gender.' + def.gender)}>
                  <Slot
                    icon={<ContentIcon def={def} />}
                    rarity={gearQuality({ id, n: 1 }, def)}
                    selected={draft.over[tab] === id}
                    disabled={!ok}
                    label={itemName(id)}
                    onClick={() => setDraft({ ...draft, over: { ...draft.over, [tab]: id } })}
                  />
                </Tooltip>
                <div className="wd-name">{itemName(id)}</div>
              </div>
            );
          })}
        </div>
        {list.length === 0 && <div className="k-dim">{t('ui.wardrobe.none')}</div>}

        <Divider label={t('ui.wardrobe.dye')} />
        {Array.from({ length: DYE_CHANNELS }, (_, ch) => (
          <div key={ch} className="wd-dye-row">
            <span className="wd-dye-label">{t('ui.wardrobe.ch.' + ch)}</span>
            <div className="wd-swatches" role="radiogroup" aria-label={t('ui.wardrobe.ch.' + ch)}>
              {APPEARANCE.dyes.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  className="wd-swatch"
                  aria-checked={draft.dye?.[ch] === d.id}
                  aria-label={t('appearance.dye.' + d.id)}
                  title={t('appearance.dye.' + d.id)}
                  style={{ '--sw': d.hex } as React.CSSProperties}
                  onClick={() => setDraft({ ...draft, dye: withChannel(draft.dye, ch, d.id, base) })}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="k-dim">{t('ui.wardrobe.dye_hint')}</div>

        <div className="wd-actions">
          <Button variant="primary" disabled={cmds.length === 0} onClick={apply}>
            {t('ui.wardrobe.apply')}
          </Button>
          <Button onClick={() => setDraft(draftFrom(wardrobe.look))} disabled={cmds.length === 0}>
            {t('ui.wardrobe.revert')}
          </Button>
          <Button onClick={reset}>{t('ui.wardrobe.reset')}</Button>
        </div>
        <div className="k-dim">{t('ui.wardrobe.free_hint')}</div>
      </div>
    </PanelWindow>
  );
}
