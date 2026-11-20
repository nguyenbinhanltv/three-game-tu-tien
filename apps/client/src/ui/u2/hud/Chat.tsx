import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@dtl/content';
import { CHAT_TABS, type ChatChannel, type ChatTab, set, setChatSize, setChatTab, setHudPref, useUI } from '../../store';
import { uiScale } from '../../uiScale';
import { blurAfterPointer } from './common';
import { CHAT_MIN, chatLimits, designArea } from './layout';
import { useHudMode } from './hudVars';
import { Fold } from './QuestChat';
import { TouchChatSheet } from '../touch/TouchChat';
import { ChatLine, sendChatText } from './ChatLine';

const CHAT_IDLE_MS = 12_000;

/**
 * Chat góc trái dưới "Truyền Âm Gian" (U2-7b): thu gọn = thẻ ngọc mảnh chạy dòng tin mới nhất + số tin chưa đọc (bấm hoặc Enter mở);
 * mở ra có tab kênh (Tất cả, Thế giới, Tổ đội, Hệ thống, Chiến đấu), góc trên-phải để kéo giãn (nhớ kích thước, bấm đúp về mặc định),
 * mờ dần khi lâu không có tin, rõ lại khi rê chuột hoặc có tin mới. Lệnh /moi /p /tithi /roi giữ nguyên: chỉ là ý định, server kiểm mọi điều kiện.
 */
export function ChatBox() {
  const log = useUI((s) => s.log);
  const open = useUI((s) => s.chatOpen);
  const pref = useUI((s) => s.chatCollapsed);
  const tab = useUI((s) => s.chatTab);
  const mode = useHudMode();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Không gõ và không có dòng mới trong 12 giây thì nhật ký mờ đi (HUD gọn); có dòng mới, rê chuột hoặc mở chat thì hiện lại.
  const [idle, setIdle] = useState(false);
  // Đang gõ thì luôn mở rộng, dù đã thu gọn.
  const collapsed = mode === 'touch' || (pref && !open);
  const lastId = log.length ? log[log.length - 1]!.id : 0;
  // Dòng đã xem theo kênh và tổng (id lớn nhất đã thấy): chỉ cập nhật khi chat đang mở và tab đang hiện kênh đó.
  const [seen, setSeen] = useState<Record<ChatChannel | 'all', number>>({
    all: lastId,
    world: lastId,
    party: lastId,
    system: lastId,
    combat: lastId,
  });

  const lines = useMemo(() => (tab === 'all' ? log : log.filter((l) => l.ch === tab)), [log, tab]);
  const unread = useMemo(() => {
    const per: Record<ChatChannel, number> = { world: 0, party: 0, system: 0, combat: 0 };
    let all = 0;
    for (const l of log) {
      if (l.id > seen[l.ch]) per[l.ch]++;
      if (l.id > seen.all) all++;
    }
    return { per, all };
  }, [log, seen]);

  // Tin chưa đọc: chỉ đặt mốc "đã xem tất cả" đúng lúc chuyển từ mở sang thu gọn; sau đó tin mới tích lũy cho tới khi mở lại.
  const wasCollapsed = useRef(collapsed);
  useEffect(() => {
    const justCollapsed = collapsed && !wasCollapsed.current;
    wasCollapsed.current = collapsed;
    if (collapsed) {
      if (justCollapsed) setSeen((s) => ({ ...s, all: lastId }));
      return;
    }
    setSeen((s) => {
      const next = { ...s };
      if (tab === 'all') for (const k of ['all', 'world', 'party', 'system', 'combat'] as const) next[k] = lastId;
      else next[tab] = lastId;
      return next.all === s.all && next.world === s.world && next.party === s.party && next.system === s.system && next.combat === s.combat
        ? s
        : next;
    });
  }, [collapsed, tab, lastId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setIdle(false);
    const id = window.setTimeout(() => setIdle(true), CHAT_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [log, collapsed, tab]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    sendChatText(text);
    setText('');
    set({ chatOpen: false });
    inputRef.current?.blur();
  };

  /** Kéo góc trên-phải để đổi cỡ: khung neo góc trái-dưới nên kéo sang phải tăng rộng, kéo lên tăng cao; đo theo đơn vị thiết kế. */
  const startResize = (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const box = el.parentElement!.getBoundingClientRect();
    const k = uiScale();
    const start = { x: e.clientX, y: e.clientY, w: box.width / k, h: box.height / k };
    const m = mode === 'compact' ? 'compact' : 'standard';
    const area = designArea(window.innerWidth, window.innerHeight, k);
    const lim = chatLimits(area.W, area.H, m, { skillLayout: useUI.getState().skillLayout });
    let cur = { w: start.w, h: start.h };
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      cur = {
        w: Math.round(Math.max(CHAT_MIN.w, Math.min(lim.maxW, start.w + (ev.clientX - start.x) / k))),
        h: Math.round(Math.max(CHAT_MIN.h, Math.min(lim.maxH, start.h - (ev.clientY - start.y) / k))),
      };
      set({ chatSize: cur });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setChatSize(cur);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    e.preventDefault();
  };

  const last = log[log.length - 1];
  const [sheet, setSheet] = useState(false);
  // Cảm ứng: `collapsed` luôn true nên mốc "đã xem" không chạy; khi tấm chat mở (và có tin mới lúc đang mở) coi như đã đọc hết mọi kênh.
  useEffect(() => {
    if (!sheet) return;
    setSeen({ all: lastId, world: lastId, party: lastId, system: lastId, combat: lastId });
  }, [sheet, lastId]);
  const expand = (e: React.MouseEvent<HTMLElement>) => {
    if (mode === 'touch') {
      setSheet(true); // cảm ứng: mở tấm chat có bàn phím ảo thay vì khung PC
      return;
    }
    setHudPref('chatCollapsed', false);
    blurAfterPointer(e);
  };

  if (collapsed) {
    return (
      <>
        <section className="u2h-zone u2h-chat u2h-chat-mini" data-collapsed="1" aria-label={t('ui.chat.title')}>
          <button type="button" className="u2h-chat-pill" onClick={expand} aria-label={t('ui.hud.expand')}>
            <span className="u2h-bead" aria-hidden="true" />
            <span className="u2h-pill-title">{t('ui.chat.title')}</span>
            <span className="u2h-chat-last">
              {last ? (
                <>
                  {last.from ? <b>{last.from}: </b> : null}
                  {last.text}
                </>
              ) : (
                t('ui.chat.empty')
              )}
            </span>
            {unread.all > 0 && (
              <span className="u2h-unread" aria-label={t('ui.chat.unread', { n: unread.all })}>
                {unread.all > 99 ? '99+' : unread.all}
              </span>
            )}
          </button>
        </section>
        {sheet && <TouchChatSheet onClose={() => setSheet(false)} />}
      </>
    );
  }

  return (
    <section
      className="u2h-zone u2h-chat u2h-card"
      data-open={open ? '1' : undefined}
      data-idle={idle && !open ? '1' : undefined}
      aria-label={t('ui.chat.title')}
    >
      <div
        className="u2h-chat-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('ui.chat.resize')}
        title={t('ui.chat.resize_tip')}
        onPointerDown={startResize}
        onDoubleClick={() => setChatSize(null)}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M11 1v4.5M11 1H6.5M9.5 2.5l-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <header
        className="u2h-chat-head"
        // Bấm vùng trống của thanh tiêu đề để thu gọn (nút mũi tên chỉ là gợi ý); tab có xử lý riêng.
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          setHudPref('chatCollapsed', true);
          blurAfterPointer(e);
        }}
      >
        <div className="u2h-chat-tabs" role="tablist" aria-label={t('ui.chat.title')}>
          {CHAT_TABS.map((k: ChatTab) => {
            const n = k === 'all' ? 0 : unread.per[k];
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className="u2h-chat-tab"
                data-on={tab === k ? '1' : undefined}
                onClick={(e) => {
                  setChatTab(k);
                  blurAfterPointer(e);
                }}
              >
                {t(`ui.chat.tab.${k}`)}
                {n > 0 && tab !== k && <b className="u2h-tabn">{n > 99 ? '99+' : n}</b>}
              </button>
            );
          })}
        </div>
        <Fold
          open
          label={t('ui.hud.collapse')}
          onClick={(e) => {
            setHudPref('chatCollapsed', true);
            blurAfterPointer(e);
          }}
        />
      </header>
      <div className="u2h-chat-log" ref={listRef}>
        {lines.map((l) => (
          <ChatLine key={l.id} l={l} />
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
