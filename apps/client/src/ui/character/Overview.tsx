import { useState } from 'react';
import { C, EQUIP_SLOTS, wearableBy, type WearSlot } from '@dtl/shared';
import { ITEM, itemName, realmName, SETS, swordModelOf, t } from '@dtl/content';
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
import { HoaTruc } from './HoaTruc';
import { pickPortrait } from './portraitPick';
import './hoatruc.css';
import { statRows, type StatId } from './stats';

const BOARD_LEFT: WearSlot[] = ['weapon', 'bracer', 'belt', 'ring', 'head'];
/** Ô thứ 10 `skin` là ô ngoại hình: đổi hình toàn thân, không có chỉ số. */
const BOARD_RIGHT: WearSlot[] = ['robe', 'boots', 'jade', 'artifact', 'skin'];

/** 9 ô trang bị + ô skin quanh xem trước nhân vật. Thả đồ từ túi lên ô để mặc; chọn ô để xem chi tiết và tháo. */
function EquipBoard() {
  const equip = useUI((s) => s.equip);
  const [sel, setSel] = useState<WearSlot | null>(null);
  const drag = useBagDrag((d) => d.drag);
  const g = Game.current;
  const level = useUI((s) => s.char?.level ?? 1);
  const worn = EQUIP_SLOTS.flatMap((es) => (equip[es] ? [equip[es]!.id] : []));
  const pick = pickPortrait({
    sets: SETS,
    worn,
    gender: g?.myGender() ?? '',
    level,
    swordModel: equip.weapon ? swordModelOf(equip.weapon.id) : undefined,
    hasWeapon: !!equip.weapon,
  });
  const best = EQUIP_SLOTS.reduce((m, es) => (equip[es] ? Math.max(m, gearQuality(equip[es]!)) : m), -1);
  // Thả được khi đúng loại ô VÀ nhân vật của mình mặc được món đó (giới hạn giới tính); server vẫn là bên quyết định.
  const canDrop = (id: string, es: WearSlot) => itemKindOk((x) => ITEM.get(x), id, es) && wearableBy(ITEM.get(id), g?.myGender() ?? '');
  const cell = (es: WearSlot) => (
    <div
      key={es}
      className="equip-cell"
      data-slot={es}
      data-drop={drag ? (canDrop(drag.id, es) ? 'ok' : 'no') : undefined}
      title={
        drag && itemKindOk((x) => ITEM.get(x), drag.id, es) && !canDrop(drag.id, es)
          ? t('ui.item.gender.' + ITEM.get(drag.id)!.gender)
          : undefined
      }
      onDragOver={(e) => {
        if (drag && canDrop(drag.id, es)) {
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
        <HoaTruc q={Math.max(0, best)} pick={pick} />
        <div className="equip-spacer" />
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
        <ProgressBar
          cls="xp"
          value={char.xp}
          max={char.xpNeed}
          text={xpFull ? t('ui.xp_full') : `${t('ui.xp')} ${char.xp} / ${char.xpNeed}`}
          label={t('ui.xp')}
        />
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
