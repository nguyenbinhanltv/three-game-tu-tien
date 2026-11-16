import { type PointerEvent as RPointerEvent, type ReactNode, useEffect, useRef } from 'react';
import { installNewMarks } from '../bag/dnd';
import { Bag } from '../bag/Bag';
import { Character } from '../character/Character';
import { MethodPanel } from '../MethodPanel';
import { PartyPanel } from '../Party';
import { focusPanel, movePanel, panelScale, useUI } from '../store';
import { WorldMap } from '../worldmap/WorldMap';
import { Help } from './Help';
import type { WinId } from './layout';
import { Quests } from './Quests';
import { Settings } from './Settings';

function Body({ id }: { id: WinId }): ReactNode {
  switch (id) {
    case 'bag':
      return <Bag />;
    case 'char':
      return <Character />;
    case 'quests':
      return <Quests />;
    case 'help':
      return <Help />;
    case 'settings':
      return <Settings />;
    case 'map':
      return <WorldMap />;
    case 'method':
      return <MethodPanel />;
    case 'party':
      return <PartyPanel />;
  }
}

/**
 * Khung một cửa sổ đang mở: đặt theo `{x, y, z}` trong store, bấm vào thì lên trên cùng, kéo thanh tiêu đề (`.k-head`,
 * trừ nút bấm) thì di chuyển và nhớ vị trí. Nội dung bảng vẫn là PanelWindow cũ (CSS `.win-host > .k-window` bỏ định vị giữa màn hình).
 */
function WindowHost({ id, x, y, z, top }: { id: WinId; x: number; y: number; z: number; top: boolean }) {
  const drag = useRef<{ dx: number; dy: number; k: number } | null>(null);
  const onDown = (e: RPointerEvent<HTMLDivElement>): void => {
    if (!top) focusPanel(id);
    const el = e.target as HTMLElement;
    if (e.button !== 0 || !el.closest('.k-head') || el.closest('button, a, input')) return;
    const k = panelScale(id);
    drag.current = { dx: e.clientX / k - x, dy: e.clientY / k - y, k };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (d) movePanel(id, e.clientX / d.k - d.dx, e.clientY / d.k - d.dy);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    movePanel(id, e.clientX / d.k - d.dx, e.clientY / d.k - d.dy, true);
  };
  return (
    <div className="win-host" data-id={id} data-top={top ? '1' : undefined} style={{ left: x, top: y, zIndex: 20 + z, '--y': y + 'px' } as React.CSSProperties} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <Body id={id} />
    </div>
  );
}

export function Panels() {
  const windows = useUI((s) => s.windows);
  useEffect(() => installNewMarks(), []);
  const topZ = windows.reduce((m, w) => Math.max(m, w.z), 0);
  return (
    <>
      {windows.map((w) => (
        <WindowHost key={w.id} id={w.id} x={w.x} y={w.y} z={w.z} top={w.z === topZ} />
      ))}
    </>
  );
}
