import { type DragEvent, type MouseEvent, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, INV_PAGE, INV_PAGES, INV_SIZE, isWearSlot, wearableBy, type InvItem, type InvSlot } from '@dtl/shared';
import { ITEM, itemName, t } from '@dtl/content';
import { ContentIcon, UiIcon } from '../ContentIcon';
import { Game, reqId } from '../../game/engine';
import { gearQuality } from '../gear';
import { Button, Modal, Slot, Tabs, Tooltip } from '../kit';
import { closePanel, pushToast, useUI } from '../store';
import { ItemTip, Window } from '../windows/common';
import { clearNewMark, endBagDrag, startBagDrag, useBagDrag, useNewMarks } from './dnd';
import {
  BAG_TABS,
  type BagFilter,
  type BagTab,
  clampSplit,
  isFiltering,
  matchesFilter,
  NO_FILTER,
  pageCounts,
  pageRange,
  planDrop,
  type QualityFilter,
  usedCount,
} from './model';
import './bag.css';

const Q_OPTIONS: QualityFilter[] = ['all', 0, 1, 2, 3, 4];

/** Gửi một lệnh thả đã được `planDrop` quyết định. `onSplit` mở hộp hỏi số lượng. */
function runDrop(
  inv: readonly InvSlot[],
  from: number,
  target: Parameters<typeof planDrop>[2],
  split: boolean,
  onSplit: (s: { slot: number; to: number; max: number }) => void,
): void {
  const g = Game.current;
  const cmd = planDrop(inv, from, target, split, (id) => ITEM.get(id));
  if (cmd.cmd === 'move') g?.send(C.MOVE_ITEM, { a: cmd.a, b: cmd.b });
  else if (cmd.cmd === 'equip') g?.send(C.EQUIP, { slot: cmd.slot, r: reqId() });
  else if (cmd.cmd === 'split') onSplit({ slot: cmd.slot, to: cmd.to, max: cmd.max });
  else if (cmd.why === 'full') pushToast(t('ui.bag.full_page'));
}

/** Ghi nhận thao tác thả từ DataTransfer/state kéo (dùng chung cho ô và số trang). */
export function dropFromDrag(
  target: Parameters<typeof planDrop>[2],
  onSplit: (s: { slot: number; to: number; max: number }) => void,
  shift = false,
): void {
  const d = useBagDrag.getState().drag;
  endBagDrag();
  if (!d) return;
  runDrop(useUI.getState().inv, d.slot, target, d.split || shift, onSplit);
}

function LockIcon() {
  return (
    <svg className="bag-lock" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor" />
      <path d="M3.8 5.5V4a2.2 2.2 0 014.4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function BagCell({
  slot,
  item,
  dim,
  selected,
  isNew,
  onSelect,
  onSplit,
}: {
  slot: number;
  item: InvSlot;
  dim: boolean;
  selected: boolean;
  isNew: boolean;
  onSelect: () => void;
  onSplit: (s: { slot: number; to: number; max: number }) => void;
}) {
  const [over, setOver] = useState(false);
  const def = item ? ITEM.get(item.id) : undefined;
  const g = Game.current;
  // Món giới hạn giới tính mà nhân vật của mình không mặc được: tô xám, có dấu khóa (server cũng từ chối khi mặc).
  const noWear = !!def && !wearableBy(def, g?.myGender() ?? '');
  const onDragStart = (e: DragEvent): void => {
    if (!item) return e.preventDefault();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(slot));
    startBagDrag({ slot, split: e.shiftKey, id: item.id });
  };
  const onClick = (e: MouseEvent): void => {
    if (!item) return;
    if (e.ctrlKey || e.metaKey) {
      g?.send(C.INV_LOCK, { slot, on: !item.lk });
      return;
    }
    onSelect();
  };
  const onContext = (e: MouseEvent): void => {
    e.preventDefault();
    if (!item || !def) return;
    if (def.kind === 'consumable') g?.send(C.USE, { slot, r: reqId() });
    else if (isWearSlot(def.kind)) g?.send(C.EQUIP, { slot, r: reqId() });
  };
  const body =
    item && def ? (
      <Slot
        icon={<ContentIcon def={def} />}
        rarity={gearQuality(item, def)}
        count={item.n}
        plus={def.kind === 'consumable' ? undefined : item.plus}
        selected={selected}
        size="m"
        label={itemName(def.id, item.plus)}
      />
    ) : (
      <Slot empty size="m" />
    );
  return (
    <div
      className="bag-cell"
      data-slot={slot}
      data-item={item?.id}
      data-n={item?.n}
      data-dim={dim ? '1' : undefined}
      data-over={over ? '1' : undefined}
      data-locked={item?.lk ? '1' : undefined}
      data-nowear={noWear ? '1' : undefined}
      data-new={isNew ? '1' : undefined}
      draggable={!!item}
      onDragStart={onDragStart}
      onDragEnd={endBagDrag}
      onDragOver={(e) => {
        if (useBagDrag.getState().drag) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!over) setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        dropFromDrag({ kind: 'cell', slot }, onSplit, e.shiftKey);
      }}
      onClick={onClick}
      onContextMenu={onContext}
      onMouseEnter={() => item && isNew && clearNewMark(item.id)}
    >
      {item && def ? <Tooltip content={<ItemTip item={item} def={def} />}>{body}</Tooltip> : body}
      {item?.lk && <LockIcon />}
      {isNew && <i className="bag-new" title={t('ui.bag.new')} />}
    </div>
  );
}

function PageButton({
  page,
  active,
  count,
  onPick,
  onSplit,
}: {
  page: number;
  active: boolean;
  count: number;
  onPick: () => void;
  onSplit: (s: { slot: number; to: number; max: number }) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      className="bag-page"
      data-active={active ? '1' : undefined}
      data-over={over ? '1' : undefined}
      aria-pressed={active}
      aria-label={t('ui.bag.page', { n: page + 1 })}
      title={t('ui.bag.page_drop', { n: page + 1 })}
      onClick={onPick}
      onDragOver={(e) => {
        if (useBagDrag.getState().drag) {
          e.preventDefault();
          if (!over) setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        dropFromDrag({ kind: 'page', page }, onSplit, e.shiftKey);
      }}
    >
      {page + 1}
      <small>{count}</small>
    </button>
  );
}

function SplitDialog({ split, onClose }: { split: { slot: number; to: number; max: number } | null; onClose: () => void }) {
  const [raw, setRaw] = useState('');
  const open = split !== null;
  const max = split?.max ?? 1;
  const n = clampSplit(raw === '' ? Math.ceil(max / 2) : Number(raw), max);
  const go = (): void => {
    if (!split) return;
    Game.current?.send(C.INV_SPLIT, { slot: split.slot, n, to: split.to >= 0 ? split.to : undefined, r: reqId() });
    setRaw('');
    onClose();
  };
  // Portal ra `.hud`: Modal nằm trong stacking context của `.win-host` sẽ bị cửa sổ z cao hơn đè lên.
  const host = document.querySelector('.hud');
  const dlg = (
    <Modal
      open={open}
      title={t('ui.bag.split_title')}
      width={340}
      onClose={() => {
        setRaw('');
        onClose();
      }}
      actions={
        <>
          <Button onClick={onClose}>{t('ui.bag.cancel')}</Button>
          <Button variant="primary" onClick={go}>
            {t('ui.bag.split_ok')}
          </Button>
        </>
      }
    >
      <label className="bag-split">
        <span>{t('ui.bag.split_qty', { max })}</span>
        <input
          type="number"
          min={1}
          max={max}
          value={raw === '' ? String(n) : raw}
          autoFocus
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go();
          }}
        />
      </label>
    </Modal>
  );
  return host ? createPortal(dlg, host) : dlg;
}

export function Bag() {
  const inv = useUI((s) => s.inv);
  const gold = useUI((s) => s.char?.gold ?? 0);
  const marks = useNewMarks((s) => s.marks);
  const [filter, setFilter] = useState<BagFilter>(NO_FILTER);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [split, setSplit] = useState<{ slot: number; to: number; max: number } | null>(null);
  const g = Game.current;
  const { from } = pageRange(page);
  const used = usedCount(inv);
  const counts = useMemo(() => pageCounts(inv), [inv]);
  const filtering = isFiltering(filter);
  const selItem: InvItem | null = sel !== null ? (inv[sel] ?? null) : null;
  const selDef = selItem ? ITEM.get(selItem.id) : undefined;
  const cells = Array.from({ length: INV_PAGE }, (_, i) => from + i);
  const hits = filtering
    ? inv.reduce((n, it) => (it && matchesFilter(it, ITEM.get(it.id), itemName(it.id, it.plus), gearQuality(it), filter) ? n + 1 : n), 0)
    : 0;
  return (
    <Window title={t('ui.bag')} sub={t('ui.bag.count', { used, max: INV_SIZE })} onClose={() => closePanel('bag')} cls="bag" width={520}>
      <Tabs
        label={t('ui.bag.tabs')}
        value={filter.tab}
        onChange={(id) => setFilter((f) => ({ ...f, tab: id as BagTab }))}
        items={BAG_TABS.map((id) => ({ id, label: t('ui.bag.tab.' + id) }))}
      />
      <div className="bag-tools">
        <input
          className="bag-search"
          type="search"
          value={filter.query}
          placeholder={t('ui.bag.search')}
          aria-label={t('ui.bag.search')}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <select
          className="bag-quality"
          aria-label={t('ui.bag.quality')}
          value={String(filter.quality)}
          onChange={(e) =>
            setFilter((f) => ({ ...f, quality: e.target.value === 'all' ? 'all' : (Number(e.target.value) as QualityFilter) }))
          }
        >
          {Q_OPTIONS.map((q) => (
            <option key={String(q)} value={String(q)}>
              {q === 'all' ? t('ui.bag.quality.all') : t(`ui.quality.${q}`)}
            </option>
          ))}
        </select>
        <Button size="s" title={t('ui.bag.sort_hint')} onClick={() => g?.send(C.INV_SORT, { r: reqId() })}>
          ⇅ {t('ui.bag.sort')}
        </Button>
      </div>
      <div className="bag-grid" role="grid" aria-label={t('ui.bag.page', { n: page + 1 })}>
        {cells.map((i) => {
          const it = inv[i] ?? null;
          const def = it ? ITEM.get(it.id) : undefined;
          const match = matchesFilter(it, def, it ? itemName(it.id, it.plus) : '', it ? gearQuality(it, def) : 0, filter);
          return (
            <BagCell
              key={i}
              slot={i}
              item={it}
              dim={!match}
              selected={sel === i}
              isNew={!!it && !!marks[it.id]}
              onSelect={() => setSel(sel === i ? null : i)}
              onSplit={setSplit}
            />
          );
        })}
      </div>
      {filtering && hits === 0 && <div className="k-dim bag-empty">{t('ui.bag.no_match')}</div>}
      <div className="bag-foot">
        <div className="bag-pages" role="group" aria-label={t('ui.bag.pages')}>
          {Array.from({ length: INV_PAGES }, (_, p) => (
            <PageButton key={p} page={p} active={p === page} count={counts[p]} onPick={() => setPage(p)} onSplit={setSplit} />
          ))}
        </div>
        <div className="gold">
          <b>{gold}</b> <UiIcon id="cur_linh_thach" fallback="💠" className="inline" />
        </div>
      </div>
      {selItem && selDef && sel !== null && (
        <div className="bag-sel">
          <span className="bag-sel-name" data-q={gearQuality(selItem, selDef)}>
            {itemName(selDef.id, selItem.plus)}
            {selItem.n > 1 ? ` ×${selItem.n}` : ''}
          </span>
          {selDef.kind === 'consumable' && (
            <Button size="s" variant="primary" onClick={() => g?.send(C.USE, { slot: sel, r: reqId() })}>
              {t('ui.item.use')}
            </Button>
          )}
          {isWearSlot(selDef.kind) && (
            <Button
              size="s"
              variant="primary"
              disabled={!wearableBy(selDef, g?.myGender() ?? '')}
              title={selDef.gender && !wearableBy(selDef, g?.myGender() ?? '') ? t('ui.item.gender.' + selDef.gender) : undefined}
              onClick={() => g?.send(C.EQUIP, { slot: sel, r: reqId() })}
            >
              {t('ui.item.equip')}
            </Button>
          )}
          {selDef.gender && !wearableBy(selDef, g?.myGender() ?? '') && (
            <span className="bad bag-sel-why">{t('ui.item.gender.' + selDef.gender)}</span>
          )}
          <Button size="s" onClick={() => g?.send(C.INV_LOCK, { slot: sel, on: !selItem.lk })}>
            {selItem.lk ? t('ui.bag.unlock') : t('ui.bag.lock')}
          </Button>
          {selItem.n > 1 && (
            <Button size="s" onClick={() => setSplit({ slot: sel, to: -1, max: selItem.n - 1 })}>
              {t('ui.bag.split')}
            </Button>
          )}
        </div>
      )}
      <div className="k-dim bag-hint">{t('ui.bag.hint')}</div>
      <SplitDialog split={split} onClose={() => setSplit(null)} />
    </Window>
  );
}
