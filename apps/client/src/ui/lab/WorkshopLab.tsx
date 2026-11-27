import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { skillName, t } from '@dtl/content';
import { Game } from '../../game/engine';
import { audioLatencyMs, sfxProbe } from '../../game/audio/audio';
import { animWorkshop, SCRUB_STEP, type AnimSnapshot, type LabSubject } from '../../game/debug/animWorkshop';
import { BLEND_POP_WARN, BLEND_SPIN_WARN } from '../../game/debug/blendLog';
import { SLIDE_WARN_CM_PER_M } from '../../game/debug/footSlide';
import { CAST_TOL_MS, castMarks, castRows, castSummary, type CastSummary } from '../../game/debug/sfxCast';
import { Button } from '../u2/win';
import './workshop.css';

// Giao diện của hai xưởng đo (Diễn Võ Trường, V2d). Hai nhóm NÚT (`CastControls`, `ClipControls`) đặt trong tab Diễn Võ của bảng F3;
// SỐ ĐO hiện ở một lớp phủ riêng cạnh bảng (gốc React riêng, không đụng store của HUD) để bảng F3 vẫn nằm trọn khung 720p.
// Mọi thứ chỉ đo/ép hình ở máy mình; tắt nút thì thôi ghi và gỡ lớp phủ.

const ui = { cast: false, anim: false };
const subs = new Set<() => void>();
const sub = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
function setUi(patch: Partial<typeof ui>): void {
  Object.assign(ui, patch);
  mountOverlay();
  for (const f of subs) f();
}
const useUi = <K extends keyof typeof ui>(k: K) => useSyncExternalStore(sub, () => ui[k]);

let host: HTMLDivElement | null = null;
function mountOverlay(): void {
  if (host || (!ui.cast && !ui.anim)) return;
  host = document.createElement('div');
  document.body.appendChild(host);
  createRoot(host).render(<WorkshopOverlay />);
}

/** Bật/tắt đo lệch tiếng theo chiêu (mốc chiêu + đầu dò lời gọi phát tiếng). Dùng chung cho nút và kịch bản kiểm. */
export function labCastOn(on: boolean): void {
  castMarks.on = on;
  if (on) sfxProbe.on = true;
  else castMarks.rows.length = 0;
  setUi({ cast: on });
}

/** Bật/tắt lấy mẫu của xưởng animation (trượt chân, chuyển clip); tắt thì thả clip đang ép. */
export function labAnimOn(on: boolean): void {
  const g = Game.current;
  if (g) {
    if (on) animWorkshop(g).start();
    else animWorkshop(g).stop();
  }
  setUi({ anim: on && !!g });
}

const ms = (v: number | null): string => (v === null ? '—' : (v > 0 ? '+' : '') + v);

/** Nhóm nút của xưởng âm thanh: đo lệch tiếng so với khung trúng theo từng chiêu (lúc chạy). */
export function CastControls() {
  const on = useUi('cast');
  return (
    <div className="debug-row wrap">
      <Button size="s" pressed={on} onClick={() => labCastOn(!on)}>
        {t('ui.gm.lab.cast.on')}
      </Button>
      <Button
        size="s"
        disabled={!on}
        onClick={() => {
          castMarks.rows.length = 0;
          sfxProbe.rows.length = 0;
        }}
      >
        {t('ui.gm.lab.cast.clear')}
      </Button>
      <span className="lab-ws-note">{t('ui.gm.lab.cast.hint')}</span>
    </div>
  );
}

function CastTable() {
  const [sum, setSum] = useState<CastSummary[]>([]);
  const [lat, setLat] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      setSum(castSummary(castRows(castMarks.rows, sfxProbe.rows)).slice(-10));
      setLat(audioLatencyMs());
    }, 300);
    return () => window.clearInterval(id);
  }, []);
  const bad = (v: number | null) => (v !== null && Math.abs(v) > CAST_TOL_MS ? 'num bad' : 'num');
  return (
    <>
      <div className="lab-trace-head">
        {t('ui.gm.lab.cast.head', { tol: CAST_TOL_MS })}
        {lat !== null ? ' · ' + t('ui.gm.lab.cast.latency', { n: lat }) : ''}
      </div>
      {sum.length === 0 ? (
        <div>{t('ui.gm.lab.cast.empty')}</div>
      ) : (
        <table data-testid="lab-cast">
          <thead>
            <tr>
              <th>{t('ui.gm.lab.cast.c.skill')}</th>
              <th className="num">{t('ui.gm.lab.cast.c.n')}</th>
              <th className="num">{t('ui.gm.lab.cast.c.plan')}</th>
              <th className="num">{t('ui.gm.lab.cast.c.dmg')}</th>
              <th className="num">{t('ui.gm.lab.cast.c.swing')}</th>
              <th className="num">{t('ui.gm.lab.cast.c.hit')}</th>
              <th className="num">{t('ui.gm.lab.cast.c.worst')}</th>
            </tr>
          </thead>
          <tbody>
            {sum.map((s) => {
              const [id, combo] = s.key.split('#');
              return (
                <tr key={s.key} data-key={s.key}>
                  <td>
                    {skillName(id!)}
                    {combo ? ' ' + t('ui.gm.lab.cast.combo', { n: combo }) : ''}
                  </td>
                  <td className="num">{s.n}</td>
                  <td className="num">{ms(s.planErrMs)}</td>
                  <td className="num">{ms(s.dmgMs)}</td>
                  <td className="num">{ms(s.swingMs)}</td>
                  <td className={bad(s.hitSndMs)}>{ms(s.hitSndMs)}</td>
                  <td className={bad(s.hitSndWorst)}>{ms(s.hitSndWorst)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

/** Nhóm nút của xưởng animation: chọn đối tượng, đo, chọn clip, kéo thời gian, bước khung, phát lặp, thả. */
export function ClipControls() {
  const on = useUi('anim');
  const [snap, setSnap] = useState<AnimSnapshot | null>(null);
  const [find, setFind] = useState('');
  const [clip, setClip] = useState('');
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = Game.current;
      if (g) setSnap(animWorkshop(g).snapshot());
    }, 250);
    return () => window.clearInterval(id);
  }, []);
  const ws = () => (Game.current ? animWorkshop(Game.current) : null);
  const q = find.trim().toLowerCase();
  const clips = (snap?.clips ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  const cur = clips.find((c) => c.name === clip) ?? clips[0];
  const hold = snap?.hold ?? null;
  const subject = (s: LabSubject) => ws()?.setSubject(s);
  return (
    <>
      <div className="debug-row wrap">
        <span>{t('ui.gm.lab.clip.who')}</span>
        {(['me', 'target'] as const).map((s) => (
          <Button key={s} size="s" pressed={snap?.subject === s} onClick={() => subject(s)}>
            {t('ui.gm.lab.clip.who.' + s)}
          </Button>
        ))}
        <Button size="s" pressed={on} onClick={() => labAnimOn(!on)}>
          {t('ui.gm.lab.clip.measure')}
        </Button>
        <Button size="s" disabled={!on} onClick={() => ws()?.resetStats()}>
          {t('ui.gm.lab.cast.clear')}
        </Button>
      </div>
      {snap && !snap.ok ? (
        <div className="debug-note">{t('ui.gm.lab.clip.none')}</div>
      ) : (
        <>
          <div className="debug-row wrap">
            <label>
              <span>{t('ui.gm.lab.fx_find')}</span>
              <input value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            </label>
            <label>
              <span>{t('ui.gm.lab.clip.clip')}</span>
              <select value={cur?.name ?? ''} onChange={(e) => setClip(e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
                {clips.slice(0, 200).map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.dur.toFixed(2)})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="debug-row wrap">
            <Button size="s" variant="primary" disabled={!cur} onClick={() => cur && ws()?.hold(cur.name, hold?.name === cur.name ? hold.t : 0)}>
              {t('ui.gm.lab.clip.hold')}
            </Button>
            <Button size="s" disabled={!hold} onClick={() => ws()?.nudge(-1)}>
              ◀
            </Button>
            <input
              className="lab-clip-seek"
              type="range"
              min={0}
              max={hold?.dur ?? cur?.dur ?? 1}
              step={SCRUB_STEP / 2}
              value={hold?.t ?? 0}
              disabled={!cur}
              data-testid="lab-clip-seek"
              onChange={(e) => cur && ws()?.hold(hold?.name ?? cur.name, Number(e.target.value))}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <Button size="s" disabled={!hold} onClick={() => ws()?.nudge(1)}>
              ▶
            </Button>
            <Button size="s" pressed={!!hold?.playing} disabled={!hold} onClick={() => hold && ws()?.hold(hold.name, hold.t, !hold.playing)}>
              {t('ui.gm.lab.clip.loop')}
            </Button>
            <Button size="s" disabled={!hold} onClick={() => ws()?.hold(null)}>
              {t('ui.gm.lab.clip.release')}
            </Button>
          </div>
          <div className="debug-note" data-testid="lab-clip-now">
            {hold
              ? t('ui.gm.lab.clip.held', { name: hold.name, t: hold.t.toFixed(2), dur: hold.dur.toFixed(2) })
              : t('ui.gm.lab.clip.playing', {
                  list:
                    (snap?.active ?? [])
                      .slice(0, 3)
                      .map((a) => `${a.name} ${a.w.toFixed(2)}`)
                      .join(' · ') || '—',
                })}
            {snap?.clock ? ' · ' + t('ui.gm.lab.clip.clock', { name: skillName(snap.clock.skill), t: snap.clock.t.toFixed(2) }) : ''}
          </div>
        </>
      )}
    </>
  );
}

function AnimTables() {
  const [snap, setSnap] = useState<AnimSnapshot | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = Game.current;
      if (g) setSnap(animWorkshop(g).snapshot());
    }, 300);
    return () => window.clearInterval(id);
  }, []);
  if (!snap) return null;
  const slide = snap.slide.filter((s) => s.time >= 0.4).slice(0, 6);
  const blends = snap.blends.slice(-6);
  return (
    <>
      <div className="lab-trace-head">
        {t('ui.gm.lab.clip.slide_head', { warn: SLIDE_WARN_CM_PER_M })}
        {snap.feet.length
          ? ' · ' + snap.feet.map((f) => t('ui.gm.lab.clip.foot.' + (f.planted ? 'down' : 'up'), { bone: f.bone, h: (f.h * 100).toFixed(0) })).join(' · ')
          : ''}
      </div>
      {slide.length === 0 ? (
        <div>{t(snap.feet.length ? 'ui.gm.lab.clip.slide_empty' : 'ui.gm.lab.clip.no_feet')}</div>
      ) : (
        <table data-testid="lab-slide">
          <thead>
            <tr>
              <th>{t('ui.gm.lab.clip.clip')}</th>
              <th className="num">{t('ui.gm.lab.clip.c.time')}</th>
              <th className="num">{t('ui.gm.lab.clip.c.travel')}</th>
              <th className="num">{t('ui.gm.lab.clip.c.cmm')}</th>
              <th className="num">{t('ui.gm.lab.clip.c.cms')}</th>
              <th className="num">{t('ui.gm.lab.clip.c.peak')}</th>
            </tr>
          </thead>
          <tbody>
            {slide.map((s) => (
              <tr key={s.key}>
                <td>{s.key}</td>
                <td className="num">{s.time.toFixed(1)}</td>
                <td className="num">{s.travel.toFixed(1)}</td>
                <td className={s.cmPerM !== null && s.cmPerM > SLIDE_WARN_CM_PER_M ? 'num bad' : 'num'}>{s.cmPerM === null ? '—' : s.cmPerM.toFixed(1)}</td>
                <td className="num">{s.cmPerS.toFixed(1)}</td>
                <td className="num">{(s.peak * 100).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="lab-trace-head">{t('ui.gm.lab.clip.blend_head')}</div>
      {blends.length === 0 ? (
        <div>{t('ui.gm.lab.clip.blend_empty')}</div>
      ) : (
        <table data-testid="lab-blend">
          <tbody>
            {blends.map((b, i) => (
              <tr key={b.at + ':' + i}>
                <td>
                  {b.from} → {b.to}
                </td>
                <td className={b.pop >= BLEND_POP_WARN ? 'num bad' : 'num'}>{t('ui.gm.lab.clip.blend_ms', { n: b.ms })}</td>
                <td className={b.spin >= BLEND_SPIN_WARN ? 'num bad' : 'num'}>{t('ui.gm.lab.clip.blend_spin', { n: b.spin })}
                  {b.bone ? ' ' + b.bone : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/**
 * Gắn hai nhóm nút vào một phần tử bất kỳ (console / kịch bản kiểm dùng khi chưa mở bảng F3). Trả hàm gỡ.
 * Trong game hai nhóm nút nằm ở tab Diễn Võ của bảng F3.
 */
export function mountWorkshopControls(el: HTMLElement): () => void {
  const root = createRoot(el);
  root.render(
    <>
      <CastControls />
      <ClipControls />
    </>,
  );
  return () => root.unmount();
}

function WorkshopOverlay() {
  const cast = useUi('cast');
  const anim = useUi('anim');
  if (!cast && !anim) return null;
  return (
    <div className="lab-trace lab-ws" data-testid="lab-ws">
      {cast && <CastTable />}
      {anim && <AnimTables />}
    </div>
  );
}
