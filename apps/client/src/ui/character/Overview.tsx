import { useState } from 'react';
import { C, EQUIP_SLOTS, type WearSlot } from '@dtl/shared';
import { ITEM, itemName, realmName, t } from '@dtl/content';
import { Game, reqId } from '../../game/engine';
import { gearQuality, pctText } from '../gear';
import { Button, ProgressBar } from '../kit';
import { BottleneckBox } from '../Realm';
import { closePanel, useUI } from '../store';
import { ItemDetail, ItemIcon } from '../windows/common';
import { breakInfo } from './breakthrough';
import { dropFromDrag } from '../bag/Bag';
import { useBagDrag } from '../bag/dnd';
import { itemKindOk } from '../bag/model';
import { Preview3D } from './Preview3D';
import { statRows, type StatId } from './stats';

const BOARD_LEFT: WearSlot[] = ['weapon', 'bracer', 'belt', 'ring', 'head'];
/** Ô thứ 10 `skin` là ô ngoại hình: đổi hình toàn thân, không có chỉ số. */
const BOARD_RIGHT: WearSlot[] = ['robe', 'boots', 'jade', 'artifact', 'skin'];

/** Hình bóng 2D dự phòng khi xem trước 3D không dùng được. */
function Silhouette({ q }: { q: number }) {
  return (
    <div className="equip-figure" data-q={q} aria-hidden="true">
      <svg viewBox="0 0 80 160" width="100%" height="100%">
        <defs>
          <radialGradient id="eqglow" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="40" cy="80" rx="38" ry="74" fill="url(#eqglow)" />
        <path d="M40 18c7 0 11 5 11 11s-4 12-11 12-11-6-11-12 4-11 11-11zm-17 30c6-4 12-6 17-6s11 2 17 6l9 40-10 4 2 50H44l-4-34-4 34H22l2-50-10-4z" fill="rgba(20,32,46,0.92)" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </div>
  );
}

/** 9 ô trang bị + ô skin quanh xem trước nhân vật. Thả đồ từ túi lên ô để mặc; chọn ô để xem chi tiết và tháo. */
function EquipBoard() {
  const equip = useUI((s) => s.equip);
  const [sel, setSel] = useState<WearSlot | null>(null);
  const drag = useBagDrag((d) => d.drag);
  const g = Game.current;
  const best = EQUIP_SLOTS.reduce((m, es) => (equip[es] ? Math.max(m, gearQuality(equip[es]!)) : m), -1);
  const cell = (es: WearSlot) => (
    <div
      key={es}
      className="equip-cell"
      data-slot={es}
      data-drop={drag ? (itemKindOk((id) => ITEM.get(id), drag.id, es) ? 'ok' : 'no') : undefined}
      onDragOver={(e) => {
        if (drag && itemKindOk((id) => ITEM.get(id), drag.id, es)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dropFromDrag({ kind: 'equip', slot: es }, () => undefined);
      }}
    >
      <ItemIcon item={equip[es]} worn selected={sel === es} onClick={() => setSel(sel === es ? null : es)} />
      <div className="equip-label">{t('ui.equip.' + es)}</div>
    </div>
  );
  const item = sel ? equip[sel] : undefined;
  return (
    <div className="equip-board">
      <div className="equip-board-grid">
        <div className="equip-col">{BOARD_LEFT.map(cell)}</div>
        <div className="equip-stage" data-q={best}>
          <Preview3D fallback={<Silhouette q={best} />} />
        </div>
        <div className="equip-col">{BOARD_RIGHT.map(cell)}</div>
      </div>
      {item && sel ? (
        <ItemDetail item={item} worn>
          <Button
            onClick={() => {
              g?.send(C.UNEQUIP, { slot: sel, r: reqId() });
              setSel(null);
            }}
          >
            {t('ui.item.unequip')}
          </Button>
        </ItemDetail>
      ) : (
        <div className="k-dim equip-hint">{EQUIP_SLOTS.some((es) => equip[es]) ? t('ui.equip.hint2') : t('ui.equip.none')}</div>
      )}
    </div>
  );
}

const MAIN_STATS: StatId[] = ['atk', 'def', 'critRate', 'critMul', 'cdr', 'lifesteal', 'healRecv', 'moveSpeed'];

/** Số hiển thị của một chỉ số: phẳng làm tròn, tỉ lệ phần trăm (hệ số thì cộng lại mốc 1). */
export function statText(id: StatId, kind: 'flat' | 'pct', v: number): string {
  if (kind === 'flat') return String(Math.round(v));
  const x = id === 'critMul' || id === 'moveSpeed' ? v + 1 : v;
  return pctText(x) + '%';
}

/** Khối độ kiếp theo `tribulations.json` cho mọi cảnh giới (không còn viết cứng Trúc Cơ). */
function BreakBox() {
  const char = useUI((s) => s.char);
  const inv = useUI((s) => s.inv);
  if (!char) return null;
  const b = breakInfo(char, inv);
  if (!b.def) return null;
  const id = b.def.id;
  const tick = (ok: boolean, text: string) => (
    <div className={ok ? 'ok' : 'bad'}>
      {ok ? '✔' : '✘'} {text}
    </div>
  );
  return (
    <div className="k-card trib-box" data-testid="trib-box" data-trib={id}>
      <div className="bk-title">{t(`ui.trib.${id}.title`)}</div>
      <div className="k-dim">{t('ui.char.trib.hint', { from: realmName(b.def.from), to: realmName(b.def.to) })}</div>
      {!b.atPeak && tick(false, t('ui.char.trib.need_peak', { realm: realmName(b.def.from) }))}
      {b.atPeak && tick(b.xpFull, t('ui.xp_full'))}
      {b.atPeak && tick(b.bkOk, t('ui.char.trib.bk_ok'))}
      {b.item && tick(b.have > 0, `${itemName(b.item)} (${b.have})`)}
      {!b.enabled && <div className="k-dim">{t('ui.char.trib.locked')}</div>}
      <Button
        variant="primary"
        disabled={!b.ready}
        onClick={() => {
          Game.current?.send(C.BREAKTHROUGH);
          closePanel('char');
        }}
      >
        {t('ui.char.trib.go', { name: t(`ui.trib.${id}.title`) })}
      </Button>
    </div>
  );
}

export function Overview() {
  const char = useUI((s) => s.char);
  const equip = useUI((s) => s.equip);
  if (!char) return null;
  const xpFull = char.xp >= char.xpNeed;
  const rows = statRows(char.level, equip, char.root, char);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (
    <div className="char-overview">
      <EquipBoard />
      <div className="char-bars">
        <ProgressBar cls="hp" value={char.hp} max={char.mhp} text={`${t('ui.hp')} ${char.hp} / ${char.mhp}`} label={t('ui.hp')} />
        <ProgressBar cls="mp" value={char.mp} max={char.mmp} text={`${t('ui.mp')} ${char.mp} / ${char.mmp}`} label={t('ui.mp')} />
        <ProgressBar cls="xp" value={char.xp} max={char.xpNeed} text={xpFull ? t('ui.xp_full') : `${t('ui.xp')} ${char.xp} / ${char.xpNeed}`} label={t('ui.xp')} />
      </div>
      <dl className="stats char-main-stats">
        {MAIN_STATS.map((id) => {
          const r = byId.get(id)!;
          return (
            <div key={id} className="stat-cell">
              <dt>{t('ui.cmp.' + id)}</dt>
              <dd>{statText(id, r.kind, r.total)}</dd>
            </div>
          );
        })}
      </dl>
      <BottleneckBox char={char} />
      <BreakBox />
    </div>
  );
}
