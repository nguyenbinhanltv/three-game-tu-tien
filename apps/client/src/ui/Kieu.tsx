// Tab Thiên Lộ ở Dẫn Kiều Nhân (TN-7): nối `KieuView` với store và `Game` (client chỉ gửi ý định; server phán mọi điều kiện).
import { useEffect } from 'react';
import { C } from '@dtl/shared';
import { Game } from '../game/engine';
import { KieuView } from './KieuView';
import { openPanel, useUI } from './store';

export function KieuTab() {
  const char = useUI((s) => s.char);
  const board = useUI((s) => s.kieuBoard);
  const g = Game.current;
  // Xin bảng khi mở tab (server giãn cách và cache, nên mở đi mở lại không tốn truy vấn).
  useEffect(() => {
    g?.send(C.KIEU_BOARD, undefined);
  }, [g]);
  if (!char) return null;
  return <KieuView char={char} board={board} send={(type, msg) => g?.send(type, msg)} onCredits={() => openPanel('credits')} />;
}
