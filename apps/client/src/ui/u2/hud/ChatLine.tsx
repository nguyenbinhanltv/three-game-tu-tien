import type { ReactNode } from 'react';
import { C } from '@dtl/shared';
import { ITEM, itemName, t } from '@dtl/content';
import { Game } from '../../../game/engine';
import { TipCard, Tooltip } from '../win';
import { SysIcon, type SysIconName } from '../shell';
import type { useUI } from '../../store';
import { itemQuality } from './chatItem';

export type Line = ReturnType<typeof useUI.getState>['log'][number];

/** Icon nét vàng cho dòng hệ thống: theo kênh chiến đấu hoặc loại tin. */
function iconOf(l: Line): SysIconName {
  if (l.ch === 'combat') return 'sword';
  switch (l.type) {
    case 'loot':
      return 'bag';
    case 'xp':
      return 'meditate';
    case 'good':
      return 'quest';
    case 'bad':
      return 'sword';
    default:
      return 'help';
  }
}

/** Tên vật phẩm trong dòng: tô màu phẩm, rê chuột xem chú giải (tên đã qua i18n từ server, không bao giờ là mã thô). */
function lineBody(l: Line): ReactNode {
  const def = l.item ? ITEM.get(l.item.id) : undefined;
  const name = def ? itemName(def.id) : '';
  const at = name ? l.text.indexOf(name) : -1;
  if (!def || at < 0) return l.text;
  const q = itemQuality(l.item?.q, def.rarity);
  const desc = t(`item.${def.id}.desc`);
  return (
    <>
      {l.text.slice(0, at)}
      <Tooltip
        content={<TipCard title={name} rarity={q} sub={t(`ui.quality.${q}`)} desc={desc === `item.${def.id}.desc` ? undefined : desc} />}
      >
        <span className="u2h-chat-item" data-q={q} tabIndex={0}>
          {name}
        </span>
      </Tooltip>
      {l.text.slice(at + name.length)}
    </>
  );
}

export function ChatLine({ l }: { l: Line }) {
  if (l.type === 'chat' || l.type === 'party') {
    return (
      // Không dùng lớp `chat` (trùng khung chat cũ, có viền/định vị): tin thế giới là `world`, tổ đội là `party`.
      <div className={'chat-line say ' + (l.type === 'chat' ? 'world' : l.type)}>
        {l.from ? <b className="who">{l.from}: </b> : null}
        {l.text}
      </div>
    );
  }
  return (
    <div className={'chat-line sys ' + l.type} data-ch={l.ch}>
      <SysIcon name={iconOf(l)} size={13} />
      <span>{lineBody(l)}</span>
    </div>
  );
}

/** Gửi một dòng chat hoặc lệnh /moi /p /tithi /roi: chỉ là ý định, server kiểm mọi điều kiện (dùng chung PC và cảm ứng). */
export function sendChatText(text: string): void {
  const m = text.trim();
  const cmd = /^\/(moi|p|tithi|roi)(?:\s+(.*))?$/i.exec(m);
  if (cmd) {
    const arg = (cmd[2] ?? '').trim();
    const g = Game.current;
    const c = cmd[1]!.toLowerCase();
    if (c === 'moi' && arg) g?.send(C.PARTY, { a: 'inv', n: arg });
    else if (c === 'p' && arg) g?.send(C.PARTY, { a: 'say', m: arg });
    else if (c === 'tithi' && arg) g?.send(C.DUEL, { a: 'inv', n: arg });
    else if (c === 'roi') g?.send(C.PARTY, { a: 'leave' });
  } else if (m) Game.current?.send(C.CHAT, { m });
}
