// Tủ ngoại trang (P4-3, docs/wardrobe/README.md): chọn dáng đã mở khóa để HIỂN THỊ thay cho món đang mặc, nhuộm 3 kênh.
// Chỉ gửi ý định (C.LOOK_SET / LOOK_DYE / LOOK_RESET); server kiểm sở hữu, ô, giới tính. Không đổi chỉ số. Miễn phí.
// Khung trái là xem trước 3D (xoay được) của bản nháp, nên thấy dáng + màu trước khi Áp dụng.
import { type PointerEvent as RPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { C, DISPLAY_SLOTS, DYE_CHANNELS, type DisplaySlot } from '@dtl/shared';
import { APPEARANCE, ITEM, itemName, t } from '@dtl/content';
import { Game, reqId } from '../../game/engine';
import { ContentIcon } from '../ContentIcon';
import { useUI } from '../store';
import { Button, Divider, PanelWindow, Slot, Tabs, Tooltip } from '../u2/win';
import { gearQuality } from '../gear';
import { draftFrom, itemsForSlot, planApply, withChannel, type Draft, type LookCmd } from './model';
import { closeWardrobe } from './nav';
import { draftLook } from './previewLook';
import './wardrobe.css';

/** Server giãn 200 ms giữa hai lần đổi (cùng chặn với mặc/tháo đồ): gửi lần lượt, cách nhau một chút. */
const SEND_GAP_MS = 260;

function send(cmd: LookCmd): void {
  const g = Game.current;
  if (!g) return;
  if (cmd.kind === 'set') g.send(C.LOOK_SET, { slot: cmd.slot, id: cmd.id, r: reqId() });
  else g.send(C.LOOK_DYE, { dye: cmd.dye, r: reqId() });
}

/** Xem trước 3D của bản nháp: vẽ bằng `CharPreview` của game (cùng đường dựng nhân vật), kéo chuột để xoay. */
function Preview({ draft }: { draft: Draft }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);
  const equip = useUI((s) => s.equip);

  useEffect(() => {
    const g = Game.current;
    const cv = canvas.current;
    if (!g || !cv) return;
    const pv = g.preview;
    pv.onFail = () => setFailed(true);
    pv.attach(cv);
    return () => {
      pv.onFail = null;
      pv.detach();
      g.ents.setPreviewLook(null);
    };
  }, []);

  useEffect(() => {
    const g = Game.current;
    if (g) g.ents.setPreviewLook(draftLook(g.ents.localLookNow(), equip, draft));
  }, [draft, equip]);

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    drag.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return;
    Game.current?.preview.rotate(e.clientX - drag.current);
    drag.current = e.clientX;
  };
  const up = () => void (drag.current = null);
  return (
    <div className="wd-pv">
      <div
        className="wd-pv-stage"
        data-testid="wardrobe-preview"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="img"
        aria-label={t('ui.wardrobe.preview')}
      >
        {failed ? <div className="k-dim">{t('ui.wardrobe.preview_off')}</div> : <canvas ref={canvas} />}
      </div>
      <div className="k-dim wd-pv-hint">{t('ui.wardrobe.drag')}</div>
    </div>
  );
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
  const worn = equip[tab];
  const wornDef = worn ? ITEM.get(worn.id) : undefined;

  const apply = () => {
    timers.current.forEach((x) => window.clearTimeout(x));
    timers.current = cmds.map((c, i) => window.setTimeout(() => send(c), i * SEND_GAP_MS));
  };
  const reset = () => {
    timers.current.forEach((x) => window.clearTimeout(x));
    Game.current?.send(C.LOOK_RESET, { r: reqId() });
  };

  return (
    <PanelWindow title={t('ui.wardrobe.title')} width={760} onClose={closeWardrobe}>
      <div className="wd" data-testid="wardrobe">
        <Preview draft={draft} />
        <div className="wd-main">
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
            <div className="wd-cell" data-sel={draft.over[tab] === null ? '1' : undefined}>
              <Slot
                icon={wornDef ? <ContentIcon def={wornDef} /> : <span className="wd-default">{t('ui.equip.empty')}</span>}
                rarity={worn && wornDef ? gearQuality(worn, wornDef) : 0}
                selected={draft.over[tab] === null}
                onClick={() => setDraft({ ...draft, over: { ...draft.over, [tab]: null } })}
                label={worn ? `${t('ui.wardrobe.worn')}: ${itemName(worn.id)}` : t('ui.wardrobe.worn')}
              />
              <div className="wd-name">{t('ui.wardrobe.worn')}</div>
            </div>
            {list.map(({ id, ok }) => {
              const def = ITEM.get(id)!;
              return (
                <div key={id} className="wd-cell" data-locked={ok ? undefined : '1'} data-sel={draft.over[tab] === id ? '1' : undefined}>
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
                  <Tooltip key={d.id} content={t('appearance.dye.' + d.id)}>
                    <button
                      type="button"
                      role="radio"
                      className="wd-swatch"
                      aria-checked={draft.dye?.[ch] === d.id}
                      aria-label={t('appearance.dye.' + d.id)}
                      style={{ '--sw': d.hex } as React.CSSProperties}
                      onClick={() => setDraft({ ...draft, dye: withChannel(draft.dye, ch, d.id, base) })}
                    />
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="wd-actions">
          <Button variant="primary" disabled={cmds.length === 0} onClick={apply}>
            {t('ui.wardrobe.apply')}
          </Button>
          <Button onClick={() => setDraft(draftFrom(wardrobe.look))} disabled={cmds.length === 0}>
            {t('ui.wardrobe.revert')}
          </Button>
          <Button onClick={reset}>{t('ui.wardrobe.reset')}</Button>
          <span className="k-dim wd-hint">{t('ui.wardrobe.free_hint')}</span>
        </div>
      </div>
    </PanelWindow>
  );
}
