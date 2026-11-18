import { useEffect, useRef, useState } from 'react';
import { C } from '@dtl/shared';
import { QUEST, t } from '@dtl/content';
import { Game } from '../../../game/engine';
import { trackedQuestId } from '../../../game/entities/offscreen';
import { objectiveText } from '../../objective';
import { set, setHudPref, setTrackQuest, useUI } from '../../store';
import { SysIcon } from '../../ngj';
import { blurAfterPointer } from './common';

/** Mũi tên thu/mở của khối có thể thu gọn. */
function Fold({ open, onClick, label }: { open: boolean; onClick: (e: React.MouseEvent<HTMLElement>) => void; label: string }) {
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

const CHAT_IDLE_MS = 12_000;

/**
 * Chat góc trái dưới, thu gọn được thành một dòng 32 px (dòng mới nhất); Enter mở lại để gõ. Lệnh /moi /p /tithi /roi giữ nguyên:
 * chỉ là ý định, server kiểm mọi điều kiện.
 */
export function ChatBox() {
  const log = useUI((s) => s.log);
  const open = useUI((s) => s.chatOpen);
  const pref = useUI((s) => s.chatCollapsed);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Không gõ và không có dòng mới trong 12 giây thì nhật ký mờ đi (HUD gọn); có dòng mới hoặc mở chat thì hiện lại.
  const [idle, setIdle] = useState(false);
  // Đang gõ thì luôn mở rộng, dù đã thu gọn.
  const collapsed = pref && !open;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setIdle(false);
    const id = window.setTimeout(() => setIdle(true), CHAT_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [log]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  const submit = () => {
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
    setText('');
    set({ chatOpen: false });
    inputRef.current?.blur();
  };
  const last = log[log.length - 1];
  return (
    <section
      className="u2h-zone u2h-chat u2h-card"
      data-open={open ? '1' : undefined}
      data-idle={idle && !open ? '1' : undefined}
      data-collapsed={collapsed ? '1' : undefined}
      aria-label={t('ui.chat.title')}
    >
      <header className="u2h-card-head">
        <span>{t('ui.chat.title')}</span>
        {collapsed && last && (
          <span className="u2h-chat-last">
            {last.from ? <b>{last.from}: </b> : null}
            {last.text}
          </span>
        )}
        <Fold
          open={!pref}
          label={t(pref ? 'ui.hud.expand' : 'ui.hud.collapse')}
          onClick={(e) => {
            setHudPref('chatCollapsed', !pref);
            blurAfterPointer(e);
          }}
        />
      </header>
      <div className="u2h-chat-log" ref={listRef}>
        {log.map((l) => (
          <div key={l.id} className={'chat-line ' + l.type}>
            {l.from ? <b>{l.from}: </b> : null}
            {l.text}
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        className="u2h-chat-input"
        value={text}
        maxLength={160}
        placeholder={t('ui.chat.placeholder')}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => set({ chatOpen: true })}
        onBlur={() => set({ chatOpen: false })}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') submit();
          else if (e.key === 'Escape') {
            setText('');
            set({ chatOpen: false });
            inputRef.current?.blur();
          }
        }}
      />
    </section>
  );
}
