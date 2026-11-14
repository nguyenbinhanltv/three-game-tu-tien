import { t } from '@dtl/content';
import { useUI } from './store';

/**
 * Bảng gỡ lỗi F3 (M1-2): phím đang giữ, trạng thái, tốc độ, focus, 8 sự kiện phím gần nhất, ping, room.
 * Engine điền `debug` mỗi 100 ms chỉ khi bảng đang mở, nên tắt bảng thì không tốn gì.
 */
export function DebugPanel() {
  const open = useUI((s) => s.debugOpen);
  const d = useUI((s) => s.debug);
  const queued = useUI((s) => s.queuedSkill);
  if (!open || !d) return null;
  const none = t('ui.debug.none');
  const yn = (v: boolean): string => t(v ? 'ui.debug.yes' : 'ui.debug.no');
  const states = d.states.map((k) => t(k));
  if (queued >= 0) states.push(t('ui.debug.st.queued', { n: queued + 1 }));
  return (
    <div className="debug-panel">
      <div className="debug-title">{t('ui.debug.title')}</div>
      <dl>
        <dt>{t('ui.debug.keys')}</dt>
        <dd className="mono">{d.keys.length ? d.keys.join(' ') : none}</dd>
        <dt>{t('ui.debug.state')}</dt>
        <dd>{states.length ? states.join(' · ') : none}</dd>
        <dt>{t('ui.debug.speed')}</dt>
        <dd>{t('ui.debug.speed_v', { n: d.speed.toFixed(1) })}</dd>
        <dt>{t('ui.debug.focus')}</dt>
        <dd>
          {t('ui.debug.focus_v', {
            win: yn(d.focus),
            tab: t(d.visible ? 'ui.debug.visible' : 'ui.debug.hidden'),
            el: d.active || none,
          })}
        </dd>
        <dt>{t('ui.debug.pointer')}</dt>
        <dd>{t('ui.debug.pointer_v', { mode: d.controls, lock: yn(d.pointerLock) })}</dd>
        <dt>{t('ui.debug.ping')}</dt>
        <dd>{d.ping > 0 ? t('ui.debug.ping_v', { n: d.ping }) : none}</dd>
        <dt>{t('ui.debug.room')}</dt>
        <dd className="mono">
          {d.room} · {d.roomId} · {d.sid}
        </dd>
      </dl>
      <div className="debug-sub">{t('ui.debug.events')}</div>
      <ol className="debug-events mono">
        {d.events.length === 0 && <li>{none}</li>}
        {d.events
          .slice()
          .reverse()
          .map((e) => (
            <li key={e.id} className={'ev-' + e.kind}>
              <span>{t('ui.debug.ev.' + e.kind)}</span> <b>{e.code}</b> <i>{t('ui.debug.ago', { n: e.ago })}</i>
            </li>
          ))}
      </ol>
    </div>
  );
}
