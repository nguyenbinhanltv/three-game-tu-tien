// Mục "Đạp Thiên" (kết game) nối `DapView` với store và `Game`; gắn vào tab Cửu Kiều ở `NpcDialog` (một tab duy nhất, hiện khi đủ chín cầu).
import { useEffect } from 'react';
import { C } from '@dtl/shared';
import { Game } from '../game/engine';
import { DapView, showDap } from './DapView';
import { openPanel, useUI } from './store';

export function DapSection() {
  const char = useUI((s) => s.char);
  const board = useUI((s) => s.kieuBoard);
  const g = Game.current;
  const show = !!char && showDap(char);
  // Xin Bảng Thiên Lộ khi mục hiện ra (server giãn cách và cache).
  useEffect(() => {
    if (show) g?.send(C.KIEU_BOARD, undefined);
  }, [g, show]);
  if (!char || !show) return null;
  return <DapView char={char} board={board} send={(type, msg) => g?.send(type, msg)} onCredits={() => openPanel('credits')} />;
}
