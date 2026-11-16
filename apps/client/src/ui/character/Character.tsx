import { type ReactNode, useState } from 'react';
import { C, EQUIP_SLOTS, type EquipSlot, NGUNG_KHI_MAX } from '@dtl/shared';
import { itemName, realmName, SETS, SKILLS, t, TRUC_CO_PILL } from '@dtl/content';
import { ContentIcon, UiIcon } from '../ContentIcon';
import { Game, reqId } from '../../game/engine';
import { gearQuality, setLines, wornIds } from '../gear';
import { Button, Divider, ProgressBar, Slot } from '../kit';
import { BottleneckBox, RootCard } from '../Realm';
import { closePanel, useUI } from '../store';
import { ItemDetail, ItemIcon, Window } from '../windows/common';

const BOARD_LEFT: EquipSlot[] = ['weapon', 'bracer', 'belt', 'ring'];
const BOARD_RIGHT: EquipSlot[] = ['robe', 'boots', 'jade', 'artifact'];

/** Bảng trang bị 8 ô quanh hình người (viền theo phẩm). Chọn ô để xem chi tiết và tháo. */
function EquipBoard() {
  const equip = useUI((s) => s.equip);
  const [sel, setSel] = useState<EquipSlot | null>(null);
  const g = Game.current;
  const best = EQUIP_SLOTS.reduce((m, es) => (equip[es] ? Math.max(m, gearQuality(equip[es]!)) : m), -1);
  const cell = (es: EquipSlot) => (
    <div key={es} className="equip-cell">
      <ItemIcon item={equip[es]} worn selected={sel === es} onClick={() => setSel(sel === es ? null : es)} />
      <div className="equip-label">{t('ui.equip.' + es)}</div>
    </div>
  );
  const item = sel ? equip[sel] : undefined;
  return (
    <div className="equip-board">
      <div className="equip-board-grid">
        <div className="equip-col">{BOARD_LEFT.map(cell)}</div>
        <div className="equip-figure" data-q={best} aria-hidden="true">
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
        <div className="k-dim equip-hint">{EQUIP_SLOTS.some((es) => equip[es]) ? t('ui.equip.hint') : t('ui.equip.none')}</div>
      )}
    </div>
  );
}

/** Bảng bộ trang bị trong bảng nhân vật: mỗi bộ đang mặc từ một món trở lên, đếm x/N và dòng sáng khi kích hoạt. */
function SetBoard() {
  const equip = useUI((s) => s.equip);
  const worn = wornIds(equip);
  const sets = SETS.filter((st) => st.pieces.some((p) => worn.includes(p)));
  if (!sets.length) return null;
  return (
    <div className="set-board" data-testid="set-board">
      <Divider label={t('ui.set.panel')} />
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

export function Character() {
  const char = useUI((s) => s.char);
  const inv = useUI((s) => s.inv);
  if (!char) return null;
  // Tầng 15 phải vượt bình cảnh (char.bk = 15) trước khi độ kiếp.
  const canTrib = char.level === NGUNG_KHI_MAX && char.bk >= NGUNG_KHI_MAX;
  const xpFull = char.xp >= char.xpNeed;
  const hasPill = inv.some((s) => s?.id === TRUC_CO_PILL);
  const stat = (k: string, v: ReactNode) => (
    <div className="stat-cell">
      <dt>{t(k)}</dt>
      <dd>{v}</dd>
    </div>
  );
  return (
    <Window title={char.name} sub={realmName(char.level)} onClose={() => closePanel('char')} cls="char" width={440}>
      <ProgressBar cls="xp" value={char.xp} max={char.xpNeed} text={xpFull ? t('ui.xp_full') : `${t('ui.xp')} ${char.xp} / ${char.xpNeed}`} label={t('ui.xp')} />
      <dl className="stats">
        {stat('ui.hp', char.mhp)}
        {stat('ui.mp', char.mmp)}
        {stat('ui.atk', char.atk)}
        {stat('ui.def', char.def)}
        {stat('ui.gold', <>{char.gold} <UiIcon id="cur_linh_thach" fallback="💠" className="inline" /></>)}
      </dl>
      {/* Khối đột phá (bình cảnh, độ kiếp) nằm ngay dưới thanh tu vi: nút Đột Phá trên HUD mở bảng là thấy liền, không phải cuộn. */}
      <BottleneckBox char={char} />
      {canTrib && (
        <div className="k-card trib-box">
          <div className="k-dim">{t('ui.char.breakthrough_hint')}</div>
          <div className={xpFull ? 'ok' : 'bad'}>
            {xpFull ? '✔' : '✘'} {t('ui.xp_full')}
          </div>
          <div className={hasPill ? 'ok' : 'bad'}>
            {hasPill ? '✔' : '✘'} {itemName(TRUC_CO_PILL)}
          </div>
          <Button
            variant="primary"
            disabled={!xpFull || !hasPill}
            onClick={() => {
              Game.current?.send(C.BREAKTHROUGH);
              closePanel('char');
            }}
          >
            {t('ui.char.breakthrough')}
          </Button>
        </div>
      )}
      <RootCard root={char.root} />
      <Divider label={t('ui.equip.board')} />
      <EquipBoard />
      <SetBoard />
      <Divider label={t('ui.char.skills')} />
      <div className="skill-list">
        {SKILLS.map((sk, i) => (
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
    </Window>
  );
}
