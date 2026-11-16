import { type MouseEvent as RMouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type LevelDef, PORTAL_POS, SECT, TELE_CAST_MS, TELE_PADS } from '@dtl/shared';
import { itemName, LEVELS, monsterName, NPCS, QUESTS, t } from '@dtl/content';
import { Game } from '../../game/engine';
import { Button, Divider, PanelWindow, ProgressBar, TipCard } from '../kit';
import { ancientMap, mipFor } from '../minimap/ancient';
import { levelAssets, levelTerrain } from '../../game/levelCtx';
import { questOverlay } from '../minimap/marks';
import { difficultyTone, formatCountdown, npcFunction, npcQuestMark } from '../minimap/model';
import { bossSprite, eliteSprite, flagSprite, mateSprite, nodeSprite, npcSprite, selfSprite, teleSprite } from '../minimap/sprites';
import { set, useUI } from '../store';
import './worldmap.css';
import { campSpots, clampView, fitView, type LabelBox, placeLabels, type Layer, LAYERS, type MapView, panBy, parseLayers, pick, screenToWorld, soloSpawns, worldToScreen, zoneInfos, zoomAt } from './model';

const W = 660;
const H = 560;
const SIZE = { w: W, h: H };
const LS_LAYERS = 'dtl.wm.layers';

interface Hit {
  x: number;
  y: number;
  r: number;
  title: string;
  sub?: string;
  desc?: string;
  lines?: { text: string; tone?: 'good' | 'bad' | 'dim' }[];
  /** Bấm vào (không kéo) thì làm gì. */
  act?: () => void;
}

const EMPTY_LEVEL: LevelDef = { id: '', spawns: [], nodes: [] };
const LEVEL_CACHE = new Map<string, { def: LevelDef; spots: ReturnType<typeof campSpots>; solo: ReturnType<typeof soloSpawns> }>();
/** Dữ liệu bản đồ lớn của một level (cache; level chưa có LevelDef thì rỗng). */
function levelData(id: string) {
  let d = LEVEL_CACHE.get(id);
  if (!d) {
    const def = LEVELS[id] ?? EMPTY_LEVEL;
    d = { def, spots: campSpots(def), solo: soloSpawns(def) };
    LEVEL_CACHE.set(id, d);
  }
  return d;
}

/** Chữ mực có viền giấy (halo) để đọc được trên mọi nền, kể cả khi đè lên nét đồng mức. */
function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, size: number, weight = 700): void {
  ctx.font = `${weight} ${size}px "Palatino Linotype", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = 'rgba(244,234,208,0.96)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function WorldMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef<MapView>(fitView(SIZE));
  const hits = useRef<Hit[]>([]);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const mouse = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [layers, setLayers] = useState(() => parseLayers(localStorage.getItem(LS_LAYERS)));
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const [hover, setHover] = useState<{ hit: Hit; x: number; y: number } | null>(null);
  const tele = useUI((s) => s.tele);
  const marks = useUI((s) => s.marks);
  const myLv = useUI((s) => s.char?.level ?? 1);
  const zone = useUI((s) => s.zone);
  const level = useUI((s) => s.level);
  const infos = useMemo(() => zoneInfos(levelData(level).def), [level]);
  const ownMark = marks.find((m) => m.own);
  const [now, setNow] = useState(performance.now());

  useEffect(() => {
    localStorage.setItem(LS_LAYERS, JSON.stringify(layers));
  }, [layers]);
  // Đồng hồ cho thanh niệm và hồi chiêu (chỉ chạy khi cần).
  const timed = !!tele.cast || tele.cdUntil > performance.now();
  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => setNow(performance.now()), 150);
    return () => clearInterval(id);
  }, [timed]);

  useEffect(() => {
    const cv = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const g0 = Game.current;
    if (g0) {
      const me = g0.renderPos;
      view.current = clampView({ ...fitView(SIZE), cx: me.x, cz: me.z, scale: fitView(SIZE).scale * 1.6 }, SIZE);
    }
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const tick = (nowT: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const g = Game.current;
      if (!g) return;
      const st = useUI.getState();
      const L = layersRef.current;
      const v = view.current;
      // Móc cho kịch bản chụp ảnh/kiểm thử (tools/perf/src/shots-m4.ts): vị trí khung nhìn hiện tại.
      (window as unknown as { __wm?: unknown }).__wm = { view: v, w: W, h: H };
      const lv = g.view.players.get(g.sid)?.lv ?? st.char?.level ?? 1;
      const out: Hit[] = [];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#2a2218';
      ctx.fillRect(0, 0, W, H);
      const LV = levelData(st.level);
      const map = ancientMap(levelAssets(st.level).minimap);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(v.scale, v.scale);
      ctx.translate(-v.cx, -v.cz);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (map) ctx.drawImage(mipFor(map, v.scale * dpr), map.meta.x0, map.meta.z0, map.meta.size, map.meta.size);
      else if (g.minimap) ctx.drawImage(g.minimap, 0, 0, levelTerrain().size, levelTerrain().size);
      ctx.restore();
      const P = (x: number, z: number) => worldToScreen(v, SIZE, x, z);
      const inView = (p: { x: number; y: number }, m = 14) => p.x > -m && p.y > -m && p.x < W + m && p.y < H + m;

      // Vùng tô mục tiêu nhiệm vụ.
      const q = L.quest ? questOverlay(g.view.level, st.quests, st.trackQuest, g.renderPos.x, g.renderPos.z) : null;
      if (q) {
        for (const a of q.goals) {
          const c = P(a.x, a.z);
          const r = a.r * v.scale;
          ctx.beginPath();
          ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,196,64,0.2)';
          ctx.fill();
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(255,214,90,0.9)';
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Tên vùng + khoảng cấp: đặt phía trên mép vùng (không đè lên bãi quái, boss, trận), chữ mực có viền giấy, nhãn không chồng nhau.
      const labels: (LabelBox & { name: string; lvText: string; lvColor: string })[] = [];
      ctx.font = '700 14px "Palatino Linotype", Georgia, serif';
      const zoneBox = (zi: (typeof infos)[number]) => {
        const xs = zi.zone.poly.map((q) => q[0]);
        const zs = zi.zone.poly.map((q) => q[1]);
        const a = P(Math.min(...xs), Math.min(...zs));
        const b = P(Math.max(...xs), Math.max(...zs));
        return { l: a.x, t: a.y, r: b.x, b: b.y };
      };
      const boxes = infos.map(zoneBox);
      for (const [i, zi] of infos.entries()) {
        const bx = boxes[i];
        const cx = (bx.l + bx.r) / 2;
        if (!inView({ x: cx, y: bx.t }, 80)) continue;
        const name = t(`zone.${zi.zone.id}`);
        const w = Math.max(ctx.measureText(name).width, 60) + 8;
        // Ưu tiên phía trên mép vùng; nếu chỗ đó đã nằm trong vùng khác thì đặt phía dưới.
        const aboveHits = boxes.some((o, j) => j !== i && cx + w / 2 > o.l && cx - w / 2 < o.r && bx.t - 6 > o.t && bx.t - 36 < o.b);
        labels.push({
          x: cx,
          y: aboveHits ? bx.b + 36 : bx.t - 6,
          w,
          h: 30,
          name,
          lvText: t('ui.mm.zone_lv', { a: zi.zone.lvMin, b: zi.zone.lvMax }),
          lvColor: lv < zi.zone.lvMin ? '#b3402c' : lv > zi.zone.lvMax ? '#5d6466' : '#3d6b36',
        });
      }
      const place = (name: string, x: number, z: number, dy: number) => {
        const c = P(x, z);
        if (inView(c, 60)) labels.push({ x: c.x, y: c.y + dy, w: ctx.measureText(name).width + 8, h: 16, name, lvText: '', lvColor: '' });
      };
      place(t('ui.zone.sect'), SECT.x, SECT.z, -95 * v.scale - 6);
      place(t('ui.zone.dungeon'), PORTAL_POS.x, PORTAL_POS.z, -48 * v.scale - 6);
      placeLabels(labels);
      for (const l of labels) {
        haloText(ctx, l.name, l.x, l.y - (l.lvText ? 17 : 8), '#33210f', l.lvText ? 14 : 13, 700);
        if (l.lvText) haloText(ctx, l.lvText, l.x, l.y - 4, l.lvColor, 11, 700);
      }

      const put = (s: { cv: HTMLCanvasElement; w: number; h: number }, x: number, y: number, dy = 0, alpha = 1) => {
        ctx.globalAlpha = alpha;
        ctx.drawImage(s.cv, x - s.w / 2, y - s.h / 2 + dy, s.w, s.h);
        ctx.globalAlpha = 1;
      };

      // Thu thập: điểm hái là vòng mờ + lá ở tâm.
      if (L.gather) {
        for (const n of LV.def.nodes) {
          const c = P(n.x, n.z);
          if (!inView(c, n.radius * v.scale + 10)) continue;
          ctx.beginPath();
          ctx.arc(c.x, c.y, n.radius * v.scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(105,210,140,0.12)';
          ctx.fill();
          put(nodeSprite(dpr), c.x, c.y);
          out.push({ x: c.x, y: c.y, r: 8, title: itemName(n.item), sub: t('ui.wm.gather') });
        }
      }
      // Quái: mỗi bãi một chấm (màu theo độ khó so cấp mình), tinh anh sọ, boss ngôi sao.
      if (L.mon) {
        const dot = Math.max(2, Math.min(4.5, v.scale * 6));
        for (const sp of LV.spots) {
          const c = P(sp.x, sp.z);
          if (!inView(c)) continue;
          const tone = difficultyTone(sp.lvMax, lv);
          ctx.beginPath();
          ctx.arc(c.x, c.y, dot, 0, Math.PI * 2);
          ctx.fillStyle = { gray: '#9aa0a3', white: '#f4f1e8', yellow: '#ffd23f', red: '#e0412f' }[tone];
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#2a1f16';
          ctx.stroke();
          out.push({ x: c.x, y: c.y, r: dot + 2, title: monsterName(sp.mon), sub: sp.lvMin === sp.lvMax ? t('ui.mm.level', { n: sp.lvMin }) : t('ui.wm.level_range', { a: sp.lvMin, b: sp.lvMax }) });
        }
        for (const s of LV.solo) {
          const c = P(s.x, s.z);
          if (!inView(c)) continue;
          put(s.boss ? bossSprite(false, dpr) : eliteSprite(false, dpr), c.x, c.y);
          out.push({ x: c.x, y: c.y, r: s.boss ? 11 : 8, title: monsterName(s.id), sub: t('ui.mm.level', { n: s.lvMax }) + ` · ${s.boss ? t('ui.mm.boss') : t('ui.mm.elite')}` });
        }
      }
      // NPC (dấu nhiệm vụ chỉ khi lớp nhiệm vụ bật).
      if (L.npc || L.quest) {
        for (const n of NPCS) {
          const c = P(n.x, n.z);
          if (!inView(c)) continue;
          const qm = L.quest ? npcQuestMark(n.id, QUESTS, st.quests, lv) : '';
          if (!L.npc && !qm) continue;
          put(npcSprite(npcFunction(n), qm, dpr), c.x, c.y, -6);
          out.push({ x: c.x, y: c.y, r: 9, title: t(`npc.${n.id}.name`), sub: t(`ui.mm.fn.${npcFunction(n)}`), desc: qm ? t(`ui.mm.q.${qm}`) : undefined });
        }
      }
      // Truyền Tống Trận: đã mở bấm để dịch chuyển, chưa mở thì mờ.
      if (L.tele) {
        const open = new Set(st.tele.open);
        for (const pad of TELE_PADS) {
          const c = P(pad.x, pad.z);
          if (!inView(c)) continue;
          const isOpen = open.has(pad.id);
          const casting = st.tele.cast?.id === pad.id;
          if (casting) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, 13 + 2 * Math.sin(nowT / 160), 0, Math.PI * 2);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#7fe0f0';
            ctx.stroke();
          }
          put(teleSprite(dpr), c.x, c.y, 0, isOpen ? 1 : 0.4);
          out.push({
            x: c.x,
            y: c.y,
            r: 10,
            title: t(`tele.${pad.id}`),
            sub: isOpen ? t('ui.wm.tele_open') : t('ui.wm.tele_locked'),
            desc: isOpen ? t('ui.wm.tele_click') : t('ui.wm.tele_touch'),
            act: isOpen ? () => g.teleport(pad.id) : undefined,
          });
        }
      }
      // Đồng đội, điểm đánh dấu, mình.
      const order = st.party ? st.party.members.map((m) => m.sid) : [];
      g.view.players.forEach((p, sid) => {
        const n = order.indexOf(sid);
        if (sid === g.sid || n < 0) return;
        const c = P(p.x, p.z);
        if (!inView(c)) return;
        put(mateSprite(n + 1, dpr), c.x, c.y);
        out.push({ x: c.x, y: c.y, r: 8, title: p.name, sub: t('ui.mm.level', { n: p.lv }) });
      });
      for (const m of st.marks) {
        const c = P(m.x, m.z);
        if (!inView(c)) continue;
        put(flagSprite(m.own, dpr), c.x, c.y, -5);
        out.push({ x: c.x, y: c.y, r: 10, title: m.own ? t('ui.wm.mark_own') : t('ui.wm.mark_of', { name: m.name }), sub: m.own ? t('ui.wm.mark_remove') : undefined });
      }
      const me = P(g.renderPos.x, g.renderPos.z);
      ctx.save();
      ctx.translate(me.x, me.y);
      ctx.rotate(-g.yaw);
      put(selfSprite(dpr), 0, 0);
      ctx.restore();

      hits.current = out;
      const m = mouse.current;
      if (m && !drag.current?.moved) {
        const h = pick(out, m.x, m.y, 8);
        setHover((cur) => (h ? (cur && cur.hit.title === h.title && cur.hit.sub === h.sub ? cur : { hit: h, x: m.cx, y: m.cy }) : cur ? null : cur));
      } else setHover((cur) => (cur ? null : cur));
    };
    raf = requestAnimationFrame(tick);
    const el = cv;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      view.current = zoomAt(view.current, SIZE, e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('wheel', onWheel);
    };
  }, [infos]);

  const pos = (e: RMouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const castLeft = tele.cast ? Math.max(0, tele.cast.until - now) : 0;
  const cdLeft = Math.max(0, tele.cdUntil - now);
  const toggle = (l: Layer) => setLayers((s) => ({ ...s, [l]: !s[l] }));
  const focusZone = (cx: number, cz: number) => {
    view.current = clampView({ cx, cz, scale: fitView(SIZE).scale * 2.4 }, SIZE);
  };

  return (
    <PanelWindow title={t('ui.map')} sub={zone} onClose={() => set({ panel: null })} className="map worldmap" width={980}>
      <div className="wm">
        <div className="wm-main">
          <canvas
            ref={ref}
            style={{ width: W, height: H }}
            onMouseDown={(e) => {
              if (e.button === 0) drag.current = { x: e.clientX, y: e.clientY, moved: false };
            }}
            onMouseMove={(e) => {
              const p = pos(e);
              mouse.current = { x: p.x, y: p.y, cx: e.clientX, cy: e.clientY };
              const d = drag.current;
              if (!d) return;
              const dx = e.clientX - d.x;
              const dy = e.clientY - d.y;
              if (!d.moved && Math.hypot(dx, dy) < 4) return;
              d.moved = true;
              d.x = e.clientX;
              d.y = e.clientY;
              view.current = panBy(view.current, SIZE, dx, dy);
            }}
            onMouseUp={(e) => {
              const d = drag.current;
              drag.current = null;
              if (!d || d.moved || e.button !== 0) return;
              const p = pos(e);
              pick(hits.current, p.x, p.y, 8)?.act?.();
            }}
            onMouseLeave={() => {
              mouse.current = null;
              drag.current = null;
            }}
            onContextMenu={(e) => {
              // Chuột phải: đặt điểm đánh dấu (đồng đội thấy), hoặc xóa nếu bấm vào chính điểm của mình.
              e.preventDefault();
              const g = Game.current;
              if (!g) return;
              const p = pos(e);
              const w = screenToWorld(view.current, SIZE, p.x, p.y);
              const own = useUI.getState().marks.find((m) => m.own);
              if (own && Math.hypot(own.x - w.x, own.z - w.z) * view.current.scale < 12) return g.setMark();
              g.setMark(w);
            }}
          />
          <div className="wm-hint">{t('ui.wm.hint')}</div>
        </div>
        <div className="wm-side">
          <div className="wm-layers" role="group" aria-label={t('ui.wm.layers')}>
            {LAYERS.map((l) => (
              <button key={l} type="button" className="wm-chip" data-on={layers[l]} aria-pressed={layers[l]} onClick={(e) => (toggle(l), e.detail > 0 && e.currentTarget.blur())}>
                {t(`ui.wm.layer.${l}`)}
              </button>
            ))}
          </div>
          <div className="wm-actions">
            <Button
              onClick={(e) => {
                Game.current?.setMark();
                if (e.detail > 0) e.currentTarget.blur();
              }}
              disabled={!ownMark}
            >
              {t('ui.wm.mark_clear')}
            </Button>
            <Button
              onClick={(e) => {
                const g = Game.current;
                if (g) view.current = clampView({ cx: g.renderPos.x, cz: g.renderPos.z, scale: fitView(SIZE).scale * 2 }, SIZE);
                if (e.detail > 0) e.currentTarget.blur();
              }}
            >
              {t('ui.wm.center')}
            </Button>
          </div>
          {(tele.cast || cdLeft > 0) && (
            <div className="wm-tele">
              {tele.cast ? (
                <>
                  <div>{t('ui.wm.casting', { n: t(`tele.${tele.cast.id}`) })}</div>
                  <ProgressBar cls="mp" value={TELE_CAST_MS - castLeft} max={TELE_CAST_MS} label={t('ui.wm.cast_bar')} />
                  <Button onClick={() => Game.current?.teleport()}>{t('ui.wm.cancel')}</Button>
                </>
              ) : (
                <div className="wm-cd">{t('ui.wm.cooldown', { t: formatCountdown(cdLeft / 1000) })}</div>
              )}
            </div>
          )}
          <Divider />
          <div className="wm-zones">
            {infos.map((zi) => {
              const here = zone === t(`zone.${zi.zone.id}`);
              const status = myLv < zi.zone.lvMin ? 'low' : myLv > zi.zone.lvMax ? 'high' : 'ok';
              return (
                <div key={zi.zone.id} className="wm-zone" data-here={here} data-status={status}>
                  <button type="button" className="wm-zone-head" onClick={() => focusZone(zi.cx, zi.cz)}>
                    <i style={{ background: zi.zone.color }} />
                    <span className="wm-zone-name">{t(`zone.${zi.zone.id}`)}</span>
                    <span className="wm-zone-lv">{t('ui.mm.zone_lv', { a: zi.zone.lvMin, b: zi.zone.lvMax })}</span>
                  </button>
                  <Row label={t('ui.wm.row.mon')}>{zi.monsters.map((m) => `${monsterName(m.id)} (${m.lvMin}–${m.lvMax})`).join(', ')}</Row>
                  {zi.elites.length > 0 && <Row label={t('ui.wm.row.elite')}>{zi.elites.map((m) => monsterName(m.id)).join(', ')}</Row>}
                  {zi.resources.length > 0 && <Row label={t('ui.wm.row.res')}>{zi.resources.map((i) => itemName(i)).join(', ')}</Row>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {hover &&
        createPortal(
          <div className="k-tip mm-tip" role="tooltip" data-show="true" style={{ left: Math.min(hover.x + 14, window.innerWidth - 240), top: hover.y + 16 }}>
            <div className="k-tip-edge">
              <div className="k-tip-in">
                <TipCard title={hover.hit.title} sub={hover.hit.sub} desc={hover.hit.desc} lines={hover.hit.lines} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </PanelWindow>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wm-row">
      <b>{label}</b> {children}
    </div>
  );
}

