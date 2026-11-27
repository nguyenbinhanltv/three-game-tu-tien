import { useEffect, useState } from 'react';
import { hasString, skillName, t } from '@dtl/content';
import { Game } from '../game/engine';
import { LabTrace, traceSpans } from '../game/debug/labTrace';
import { useUI } from './store';

/**
 * Lớp phủ NHẬT KÝ ĐIỀU KHIỂN của phòng thử (Diễn Võ Trường, V2c): mỗi lệnh chiêu/né một dòng — phím bấm, lệnh nằm chờ ở máy bao lâu,
 * server trả lời sau bao lâu, đòn trúng sau bao lâu — để chỉnh độ nhạy chuỗi đòn ở các mức ping. Bật bằng nút ở tab Diễn Võ → Giao diện.
 * Chỉ đo ở máy mình; tắt thì gỡ hết bộ nghe và engine không ghi gì.
 */
export function LabTraceView() {
  const on = useUI((s) => s.labTraceOn);
  const queued = useUI((s) => s.queuedSkill);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const tr = new LabTrace();
    const onKey = (e: KeyboardEvent) => {
      if (!e.repeat) tr.key(e.code, performance.now());
    };
    const onMouse = (e: MouseEvent) => tr.key('Mouse' + e.button, performance.now());
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    let seen = -1;
    const id = window.setInterval(() => {
      // Gắn lại sau mỗi lần đổi phòng (engine giữ nguyên nhưng trường có thể bị trả về null khi dựng lại).
      const g = Game.current;
      if (g && g.labTrace !== tr) g.labTrace = tr;
      if (tr.ver !== seen) {
        seen = tr.ver;
        tick((n) => n + 1);
      }
    }, 100);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.clearInterval(id);
      if (Game.current?.labTrace === tr) Game.current.labTrace = null;
    };
  }, [on]);
  if (!on) return null;
  const g = Game.current;
  const rows = g?.labTrace?.rows ?? [];
  const ms = (n: number | null) => (n === null ? t('ui.gm.lab.trace.none') : t('ui.gm.lab.trace.ms', { n }));
  return (
    <div className="lab-trace" data-testid="lab-trace">
      <div className="lab-trace-head">
        {t('ui.gm.lab.trace.title', { ping: Math.round(g?.ping ?? 0), fake: g?.fakePing ?? 0 })}
        {queued >= 0 ? ' · ' + t('ui.gm.lab.trace.queued', { n: queued + 1 }) : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th>{t('ui.gm.lab.trace.cmd')}</th>
            <th>{t('ui.gm.lab.trace.key')}</th>
            <th>{t('ui.gm.lab.trace.hold')}</th>
            <th>{t('ui.gm.lab.trace.ack')}</th>
            <th>{t('ui.gm.lab.trace.hit')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5}>{t('ui.gm.lab.trace.empty')}</td>
            </tr>
          )}
          {rows
            .slice()
            .reverse()
            .map((r) => {
              const s = traceSpans(r);
              return (
                <tr key={r.id} data-type={r.type}>
                  <td>{r.type === 'dg' ? t('ui.gm.lab.trace.dodge') : hasString('skill.' + r.label + '.name') ? skillName(r.label) : r.label}</td>
                  <td>{r.key ?? t('ui.gm.lab.trace.auto')}</td>
                  <td>{ms(s.hold)}</td>
                  <td>{ms(s.ack)}</td>
                  <td>{ms(s.hit)}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
