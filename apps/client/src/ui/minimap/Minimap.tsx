import { type MouseEvent as RMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { biomeAt } from '@dtl/shared';
import { LEVELS, t } from '@dtl/content';
import { Game } from '../../game/engine';
import { TipCard, Tooltip } from '../kit';
import { togglePanel, useUI } from '../store';
import { ancientMap } from './ancient';
import { drawMinimap, type HitPt } from './draw';
import { buildFrame } from './marks';
import { clampZoom, screenToWorld, DEFAULT_ZOOM, formatCountdown, type Mark, nearestIndex, type View, zoneStatus, ZOOM_SPANS } from './model';
import '../minimap.css';

const SIZE = 176;
/** Vẽ lại 15 lần/giây: đủ mượt cho chấm di chuyển chậm, và giữ chi phí CPU/khung gần như bằng bản cũ. */
const FRAME_MS = 1000 / 15;

function readZoom(): number {
  const n = Number(localStorage.getItem('dtl.mm.zoom'));
  return localStorage.getItem('dtl.mm.zoom') === null || Number.isNaN(n) ? DEFAULT_ZOOM : clampZoom(n);
}

/** Bỏ focus sau khi bấm chuột để phím số/mũi tên tiếp theo vẫn tới game. */
function blurAfterPointer(e: RMouseEvent<HTMLElement>): void {
  if (e.detail > 0) e.currentTarget.blur();
}

function tipOf(m: Mark): { title: string; sub?: string; desc?: string; lines: { text: string; tone?: 'good' | 'bad' | 'dim' }[] } {
  const lines: { text: string; tone?: 'good' | 'bad' | 'dim' }[] = [];
  if (m.kind === 'npc' && m.quest) lines.push({ text: t(`ui.mm.q.${m.quest}`), tone: m.quest === 'wait' ? 'dim' : 'good' });
  if (m.kind === 'boss' && m.dead) lines.push({ text: m.respawnAt ? t('ui.mm.respawn', { t: formatCountdown((m.respawnAt - Date.now()) / 1000) }) : t('ui.mm.respawning'), tone: 'dim' });
  if (m.kind === 'mon' || m.kind === 'elite' || m.kind === 'boss') {
    if (m.tone === 'red') lines.push({ text: t('ui.mm.tone.red'), tone: 'bad' });
    else if (m.tone === 'gray') lines.push({ text: t('ui.mm.tone.gray'), tone: 'dim' });
  }
  return { title: m.label, sub: m.sub, desc: m.desc, lines };
}

export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const hits = useRef<HitPt[]>([]);
  const viewRef = useRef<View | null>(null);
  const mouse = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [zoom, setZoom] = useState(readZoom);
  const [rotate, setRotate] = useState(() => localStorage.getItem('dtl.mm.rot') === '1');
  const [hover, setHover] = useState<{ mark: Mark; x: number; y: number; key: string } | null>(null);
  const zoomRef = useRef(zoom);
  const rotRef = useRef(rotate);
  zoomRef.current = zoom;
  rotRef.current = rotate;

  const rx = useUI((s) => Math.round(s.x));
  const rz = useUI((s) => Math.round(s.z));
  const myLv = useUI((s) => s.char?.level ?? 1);
  const room = useUI((s) => s.room);
  const zones = LEVELS.van_lam.zones;
  const zs = useMemo(() => zoneStatus(room === 'world' || room === '' ? zones : undefined, rx, rz, myLv), [zones, room, rx, rz, myLv]);
  const zoneName = zs.zone ? t(`zone.${zs.zone.id}`) : t('ui.zone.' + biomeAt(rx, rz));

  useEffect(() => {
    localStorage.setItem('dtl.mm.zoom', String(zoom));
  }, [zoom]);
  useEffect(() => {
    localStorage.setItem('dtl.mm.rot', rotate ? '1' : '0');
  }, [rotate]);

  // Lăn chuột trên minimap đổi mức phóng (listener gốc để chặn cuộn trang).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setZoom((z0) => clampZoom(z0 + (e.deltaY < 0 ? -1 : 1)));
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, []);

  useEffect(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = ref.current!;
    cv.width = Math.round(SIZE * dpr);
    cv.height = Math.round(SIZE * dpr);
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let last = 0;
    let span: number = ZOOM_SPANS[zoomRef.current];
    let prevT = performance.now();
    let hoverKey = '';
    let hoverAt = 0;
    const tick = (nowT: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || nowT - last < FRAME_MS) return;
      last = nowT;
      const g = Game.current;
      if (!g || !g.view) return;
      const dt = Math.min(0.1, (nowT - prevT) / 1000);
      prevT = nowT;
      // Mượt khi đổi mức phóng: nội suy theo hàm mũ trên log(mét).
      const want = ZOOM_SPANS[zoomRef.current];
      span = Math.exp(Math.log(span) + (Math.log(want) - Math.log(span)) * Math.min(1, dt * 12));
      if (Math.abs(span - want) < 0.5) span = want;
      const st = useUI.getState();
      const me = g.view.players.get(g.sid);
      const lv = me?.lv ?? st.char?.level ?? 1;
      const order = st.party ? st.party.members.map((m) => m.sid) : [];
      const frame = buildFrame(g, st.quests, st.trackQuest, lv, order, nowT, st.marks);
      const yaw = g.yaw;
      const v: View = { cx: g.renderPos.x, cz: g.renderPos.z, span, size: SIZE, rot: rotRef.current ? yaw : 0 };
      viewRef.current = v;
      drawMinimap(ctx, g, frame, v, dpr, nowT, ancientMap(), yaw, hits.current);
      // Tooltip theo con trỏ: chọn lại theo từng khung (biểu tượng đang chuyển động) nhưng chỉ cập nhật React khi nội dung đổi.
      const m = mouse.current;
      if (m) {
        const i = nearestIndex(hits.current, m.x, m.y);
        const mark = i >= 0 ? hits.current[i].mark : null;
        const key = mark ? `${mark.kind}:${mark.id}:${mark.dead ? 1 : 0}:${mark.respawnAt ? Math.ceil((mark.respawnAt - Date.now()) / 1000) : ''}:${mark.quest ?? ''}` : '';
        if (key !== hoverKey || (mark && nowT - hoverAt > 500)) {
          hoverKey = key;
          hoverAt = nowT;
          setHover(mark ? { mark, x: m.cx, y: m.cy, key } : null);
        }
      } else if (hoverKey) {
        hoverKey = '';
        setHover(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const bump = (d: number) => setZoom((z0) => clampZoom(z0 + d));
  const zoneLv = zs.zone ? t('ui.mm.zone_lv', { a: zs.zone.lvMin, b: zs.zone.lvMax }) : '';
  const tip = hover ? tipOf(hover.mark) : null;

  return (
    <div className="minimap-wrap">
      <div ref={box} className="minimap" onClick={() => togglePanel('map')}>
        <canvas
          ref={ref}
          style={{ width: SIZE, height: SIZE }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY };
          }}
          onMouseLeave={() => {
            mouse.current = null;
          }}
          onContextMenu={(e) => {
            // Chuột phải: đặt điểm đánh dấu tại chỗ chỉ, hoặc xóa nếu bấm vào chính điểm của mình.
            e.preventDefault();
            e.stopPropagation();
            const v = viewRef.current;
            const g = Game.current;
            if (!v || !g) return;
            const r = e.currentTarget.getBoundingClientRect();
            const w = screenToWorld(v, e.clientX - r.left, e.clientY - r.top);
            const own = useUI.getState().marks.find((m) => m.own);
            if (own) {
              const a = Math.hypot(own.x - w.x, own.z - w.z) * (v.size / v.span);
              if (a < 10) return g.setMark();
            }
            g.setMark(w);
          }}
        />
        <div className="minimap-ctl" onClick={(e) => e.stopPropagation()}>
          <Tooltip content={t('ui.mm.zoom_in')}>
            <button type="button" className="mm-btn" aria-label={t('ui.mm.zoom_in')} disabled={zoom === 0} onClick={(e) => (blurAfterPointer(e), bump(-1))}>
              +
            </button>
          </Tooltip>
          <Tooltip content={t('ui.mm.zoom_out')}>
            <button type="button" className="mm-btn" aria-label={t('ui.mm.zoom_out')} disabled={zoom === ZOOM_SPANS.length - 1} onClick={(e) => (blurAfterPointer(e), bump(1))}>
              −
            </button>
          </Tooltip>
          <Tooltip content={rotate ? t('ui.mm.rot_on') : t('ui.mm.rot_off')}>
            <button type="button" className="mm-btn" data-on={rotate} aria-pressed={rotate} aria-label={t('ui.mm.rot')} onClick={(e) => (blurAfterPointer(e), setRotate((r) => !r))}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M6 1 L9 7 L6 5.6 L3 7 Z" fill="currentColor" />
                <path d="M10.2 8.6A5 5 0 0 1 1.8 8.6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
            </button>
          </Tooltip>
        </div>
        <div className="minimap-pos">
          {rx}, {rz}
        </div>
      </div>
      <div className="minimap-foot" data-status={zs.status} title={zs.status === 'low' ? t('ui.mm.zone_low') : zs.status === 'high' ? t('ui.mm.zone_high') : undefined}>
        <span className="minimap-foot-name">{zoneName}</span>
        {zoneLv && <span className="minimap-foot-lv">{zoneLv}</span>}
      </div>
      {hover &&
        tip &&
        createPortal(
          <div className="k-tip mm-tip" role="tooltip" data-show="true" style={{ left: Math.min(hover.x + 14, window.innerWidth - 220), top: hover.y + 16 }}>
            <div className="k-tip-edge">
              <div className="k-tip-in">
                <TipCard title={tip.title} sub={tip.sub} lines={tip.lines} desc={tip.desc} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
