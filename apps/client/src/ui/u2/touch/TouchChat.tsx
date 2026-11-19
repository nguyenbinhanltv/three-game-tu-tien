import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@dtl/content';
import { CHAT_TABS, type ChatTab, setChatTab, useUI } from '../../store';
import { ChatLine, sendChatText } from '../hud/Chat';

/**
 * Vùng nhìn thấy (thu lại khi bàn phím ảo hiện): cao `height` và lệch `top` (iOS Safari cuộn layout viewport lên khi mở bàn phím,
 * `offsetTop` > 0) để tấm `position: fixed` luôn nằm đúng phần không bị bàn phím che.
 */
function useVisualViewport(): { height: number; top: number } {
  const read = () => ({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 });
  const [v, setV] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setV(read());
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => {
      vv.removeEventListener('resize', on);
      vv.removeEventListener('scroll', on);
    };
  }, []);
  return v;
}

/**
 * Tấm chat cảm ứng (U2-6): chạm thẻ chat để mở; ô nhập dùng bàn phím ảo của hệ điều hành (iOS/Android), tấm co theo
 * `visualViewport` nên không bị bàn phím che. Có tab kênh, nút Gửi và nút đóng ≥ 44 px. Lệnh /moi /p /tithi /roi giữ nguyên.
 */
export function TouchChatSheet({ onClose }: { onClose: () => void }) {
  const log = useUI((s) => s.log);
  const tab = useUI((s) => s.chatTab);
  const vv = useVisualViewport();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lines = useMemo(() => (tab === 'all' ? log : log.filter((l) => l.ch === tab)), [log, tab]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, vv.height]);
  const send = () => {
    if (text.trim()) sendChatText(text);
    setText('');
    inputRef.current?.focus(); // giữ bàn phím mở để nói tiếp
  };
  return (
    <div
      className="u2t-chat"
      style={{ height: vv.height, top: vv.top }}
      data-testid="touch-chat"
      role="dialog"
      aria-label={t('ui.chat.title')}
    >
      <div className="u2t-chat-sheet u2h-card">
        <header className="u2t-chat-head">
          <div className="u2t-chat-tabs" role="tablist">
            {CHAT_TABS.map((k: ChatTab) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className="u2t-chat-tab"
                data-on={tab === k ? '1' : undefined}
                onClick={() => setChatTab(k)}
              >
                {t(`ui.chat.tab.${k}`)}
              </button>
            ))}
          </div>
          <button type="button" className="u2t-chat-close" aria-label={t('ui.u2.close')} onClick={onClose} data-testid="touch-chat-close">
            ×
          </button>
        </header>
        <div className="u2t-chat-log" ref={listRef}>
          {lines.map((l) => (
            <ChatLine key={l.id} l={l} />
          ))}
        </div>
        <form
          className="u2t-chat-row"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            ref={inputRef}
            className="u2t-chat-input"
            value={text}
            maxLength={160}
            enterKeyHint="send"
            autoComplete="off"
            autoCapitalize="off"
            placeholder={t('ui.touch.chat_placeholder')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') onClose();
            }}
            data-testid="touch-chat-input"
          />
          <button type="submit" className="u2t-chat-send" data-testid="touch-chat-send">
            {t('ui.touch.chat_send')}
          </button>
        </form>
      </div>
    </div>
  );
}
