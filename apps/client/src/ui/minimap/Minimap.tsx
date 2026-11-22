import { type MouseEvent as RMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { areaKey, biomeAt, levelAssets, levelTerrain } from '../../base/levelCtx';
import { LEVELS, pathOf, t } from '@dtl/content';
import { Game } from '../../game/engine';
import { TipCard, Tooltip } from '../u2/win';
import { togglePanel, useUI } from '../store';
import { uiScale } from '../uiScale';
import { useHudMode } from '../u2/hud/hudVars';
import { ancientMap } from './ancient';
import { drawMinimap, type HitPt } from './draw';
import { fogFor } from './fog';
import { inkMap } from './ink';
import { buildFrame } from './marks';
import {
  backingScale,
  clampZoom,
  screenToWorld,
  DEFAULT_ZOOM,
  formatCountdown,
  type Mark,
  nearestIndex,
  type View,
  zoneStatus,
  ZOOM_SPANS,
} from './model';
import { skyOf } from './rim';
import '../minimap.css';

/** Đường kính la bàn (đơn vị thiết kế): 212 ở chế độ chuẩn, 180 khi compact (720p). Khớp `SIZES.*.mapW - 24` trong u2/hud/layout.ts. */
const DISC = { standard: 212, compact: 180 } as const;
/** Vẽ lại 15 lần/giây: đủ mượt cho chấm di chuyển chậm, và giữ chi phí CPU/khung gần như bằng bản cũ. */
const FRAME_MS = 1000 / 15;
/** Vị trí ba hạt ngọc trên vành, độ từ phía trên theo chiều kim đồng hồ (cung trái-dưới): phóng to, thu nhỏ, mở bản đồ lớn. */
const BEADS = [-98, -114, -130] as const;

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
  if (m.kind === 'boss' && m.dead)
    lines.push({
      text: m.respawnAt ? t('ui.mm.respawn', { t: formatCountdown((m.respawnAt - Date.now()) / 1000) }) : t('ui.mm.respawning'),
      tone: 'dim',
    });
  if (m.kind === 'mon' || m.kind === 'elite' || m.kind === 'boss') {
    if (m.tone === 'red') lines.push({ text: t('ui.mm.tone.red'), tone: 'bad' });
    else if (m.tone === 'gray') lines.push({ text: t('ui.mm.tone.gray'), tone: 'dim' });
  }
  return { title: m.label, sub: m.sub, desc: m.desc, lines };
}

/**
 * Minimap "La Bàn Thiên Cơ" (U2-7): vành ngọc + đồng 24 hướng xoay theo camera, lòng thủy mặc dựng từ địa hình, sương phủ vùng chưa đi,
 * dải lụa tên khu vực (tự mở khi vào vùng mới) kèm tọa độ, ba hạt ngọc ở vành trái-dưới (phóng +, thu −, bản đồ lớn).
 */
export function Minimap() {
  const D = DISC[useHudMode() === 'compact' ? 'compact' : 'standard'];
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const hits = useRef<HitPt[]>([]);
  const viewRef = useRef<View | null>(null);
  const mouse = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [zoom, setZoom] = useState(readZoom);
  const [hover, setHover] = useState<{ mark: Mark; x: number; y: number; key: string } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const rx = useUI((s) => Math.round(s.x));
  const rz = useUI((s) => Math.round(s.z));
  const myLv = useUI((s) => s.char?.level ?? 1);
  const room = useUI((s) => s.room);
  const level = useUI((s) => s.level);
  const zones = LEVELS[level]?.zones;
  const zs = useMemo(() => zoneStatus(room === 'dungeon' ? undefined : zones, rx, rz, myLv), [zones, room, rx, rz, myLv]);
  const zoneName = zs.zone ? t(`zone.${zs.zone.id}`) : t(areaKey(level, biomeAt(rx, rz)));

  useEffect(() => {
    localStorage.setItem('dtl.mm.zoom', String(zoom));
  }, [zoom]);

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
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let dpr = 0;
    // Đổi cỡ cửa sổ, zoom trình duyệt hay kéo sang màn khác (DPR đổi): cấp lại bộ đệm cho khớp điểm ảnh thật.
    const fit = () => {
      const d = backingScale(window.devicePixelRatio, uiScale());
      if (d === dpr) return;
      dpr = d;
      cv.width = Math.round(D * dpr);
      cv.height = Math.round(D * dpr);
    };
    fit();
    let raf = 0;
    let last = 0;
    let span: number = ZOOM_SPANS[zoomRef.current] ?? ZOOM_SPANS[0]!;
    let prevT = performance.now();
    let hoverKey = '';
    let hoverAt = 0;
    const labels = { n: t('ui.mm.n'), e: t('ui.mm.e'), s: t('ui.mm.s'), w: t('ui.mm.w') };
    const tick = (nowT: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || nowT - last < FRAME_MS) return;
      last = nowT;
      fit();
      const g = Game.current;
      if (!g || !g.view) return;
      const dt = Math.min(0.1, (nowT - prevT) / 1000);
      prevT = nowT;
      // Mượt khi đổi mức phóng: nội suy theo hàm mũ trên log(mét).
      const want = ZOOM_SPANS[zoomRef.current]!;
      span = Math.exp(Math.log(span) + (Math.log(want) - Math.log(span)) * Math.min(1, dt * 12));
      if (Math.abs(span - want) < 0.5) span = want;
      const st = useUI.getState();
      const me = g.view.players.get(g.sid);
      const lv = me?.lv ?? st.char?.level ?? 1;
      const order = st.party ? st.party.members.map((m) => m.sid) : [];
      const frame = buildFrame(g, st.quests, st.trackQuest, lv, order, nowT, st.marks, pathOf(st.method?.method)?.id);
      // Bản đồ xoay theo camera (vành la bàn cũng xoay): hướng Bắc lệch `yaw` so với phía trên màn hình.
      const v: View = { cx: g.renderPos.x, cz: g.renderPos.z, span, size: D, rot: g.yaw };
      viewRef.current = v;
      const fog = fogFor(st.char?.name ?? '?', st.level, levelTerrain().size);
      fog.reveal(g.renderPos.x, g.renderPos.z);
      fog.save(nowT);
      drawMinimap(
        ctx,
        frame,
        v,
        dpr,
        nowT,
        { ink: inkMap(), ancient: ancientMap(levelAssets(st.level).minimap), fog, sky: skyOf(g.levelMood ?? ''), labels },
        g.yaw,
        hits.current,
      );
      // Tooltip theo con trỏ: chọn lại theo từng khung (biểu tượng đang chuyển động) nhưng chỉ cập nhật React khi nội dung đổi.
      const m = mouse.current;
      if (m) {
        const i = nearestIndex(hits.current, m.x, m.y);
        const mark = i >= 0 ? hits.current[i]!.mark : null;
        const key = mark
          ? `${mark.kind}:${mark.id}:${mark.dead ? 1 : 0}:${mark.respawnAt ? Math.ceil((mark.respawnAt - Date.now()) / 1000) : ''}:${mark.quest ?? ''}`
          : '';
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
    return () => {
      cancelAnimationFrame(raf);
      const st = useUI.getState();
      fogFor(st.char?.name ?? '?', st.level, levelTerrain().size).save(0, true);
    };
  }, [D]);

  const bump = (d: number) => setZoom((z0) => clampZoom(z0 + d));
  const zoneLv = zs.zone
    ? zs.zone.lvMin === zs.zone.lvMax
      ? t('ui.mm.zone_lv1', { a: zs.zone.lvMin })
      : t('ui.mm.zone_lv', { a: zs.zone.lvMin, b: zs.zone.lvMax })
    : '';
  const tip = hover ? tipOf(hover.mark) : null;
  const R = D / 2;
  const bead = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { left: 12 + R + (R + 1) * Math.sin(a) - 11, top: R - (R + 1) * Math.cos(a) - 11 };
  };

  return (
    <div className="mm2" style={{ width: D + 24, height: D + 40 }} data-status={zs.status}>
      <div ref={box} className="mm2-disc" style={{ width: D, height: D }} onClick={() => togglePanel('map')}>
        <canvas
          ref={ref}
          style={{ width: D, height: D }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            // Canvas nằm trong khối `zoom`: tọa độ chuột lấy theo px màn hình, chia lại ra đơn vị thiết kế.
            const k = uiScale();
            mouse.current = { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, cx: e.clientX, cy: e.clientY };
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
            const k = uiScale();
            const w = screenToWorld(v, (e.clientX - r.left) / k, (e.clientY - r.top) / k);
            const own = useUI.getState().marks.find((m) => m.own);
            if (own) {
              const a = Math.hypot(own.x - w.x, own.z - w.z) * (v.size / v.span);
              if (a < 10) return g.setMark();
            }
            g.setMark(w);
          }}
        />
      </div>
      <Tooltip content={t('ui.mm.zoom_in')}>
        <button
          type="button"
          className="mm2-bead"
          style={bead(BEADS[0])}
          aria-label={t('ui.mm.zoom_in')}
          disabled={zoom === 0}
          onClick={(e) => (blurAfterPointer(e), bump(-1))}
        >
          +
        </button>
      </Tooltip>
      <Tooltip content={t('ui.mm.zoom_out')}>
        <button
          type="button"
          className="mm2-bead"
          style={bead(BEADS[1])}
          aria-label={t('ui.mm.zoom_out')}
          disabled={zoom === ZOOM_SPANS.length - 1}
          onClick={(e) => (blurAfterPointer(e), bump(1))}
        >
          −
        </button>
      </Tooltip>
      <Tooltip content={t('ui.mm.open_map')}>
        <button
          type="button"
          className="mm2-bead"
          style={bead(BEADS[2])}
          aria-label={t('ui.mm.open_map')}
          onClick={(e) => (blurAfterPointer(e), togglePanel('map'))}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 0.8v2.4M6 8.8v2.4M0.8 6h2.4M8.8 6h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </Tooltip>
      <div
        className="mm2-ribbon"
        style={{ top: D - 8 }}
        title={zs.status === 'low' ? t('ui.mm.zone_low') : zs.status === 'high' ? t('ui.mm.zone_high') : undefined}
      >
        {/* key theo tên vùng: vào vùng mới thì dải lụa chạy lại hiệu ứng mở */}
        <div key={zoneName} className="mm2-band" data-long={zoneName.length > 14 ? (zoneName.length > 22 ? 2 : 1) : undefined}>
          <span>{zoneName}</span>
        </div>
        <div className="mm2-coord">
          {rx}, {rz}
          {zoneLv && <em>{zoneLv}</em>}
        </div>
      </div>
      {hover &&
        tip &&
        createPortal(
          <div
            className="k-tip mm-tip"
            role="tooltip"
            data-show="true"
            style={{ left: Math.min(hover.x + 14, window.innerWidth - 220 * uiScale()) / uiScale(), top: (hover.y + 16) / uiScale() }}
          >
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
