import { useState } from 'react';
import { C, MAX_LEVEL, PF_TRIBULATION } from '@dtl/shared';
import { MONSTERS, monsterName, realmName, t } from '@dtl/content';
import { Game } from '../game/engine';
import { Button } from './kit';
import { type DebugPerf, useUI } from './store';

/** Ngân sách desktop (CLAUDE.md, skill perf-budget): vượt thì tô đỏ, tới 80% thì tô vàng. */
const BUDGET = { cpuMs: 8, drawCalls: 300, triangles: 2_000_000 };

function tone(v: number, max: number): string {
  return v > max ? 'bad' : v > max * 0.8 ? 'warn' : '';
}

const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

/** Gửi lệnh GM qua chat: server kiểm quyền (chỉ tài khoản thử khi bật AUTH_DEV_BYPASS) rồi mới làm; client không tự đổi state. */
function gm(cmd: string): void {
  Game.current?.send(C.CHAT, { m: '/gm ' + cmd });
}

function PerfRows({ p }: { p: DebugPerf }) {
  return (
    <dl>
      <dt>{t('ui.debug.fps')}</dt>
      <dd className={p.fps < 55 ? 'warn' : ''}>{t('ui.debug.fps_v', { n: p.fps, backend: p.backend })}</dd>
      <dt>{t('ui.debug.frame')}</dt>
      <dd className={tone(p.cpuMs, BUDGET.cpuMs)}>{t('ui.debug.frame_v', { avg: p.cpuMs.toFixed(1), max: p.cpuMaxMs.toFixed(1) })}</dd>
      <dt>{t('ui.debug.draw')}</dt>
      <dd className={tone(p.drawCalls, BUDGET.drawCalls)}>{t('ui.debug.draw_v', { n: p.drawCalls })}</dd>
      <dt>{t('ui.debug.tri')}</dt>
      <dd className={tone(p.triangles, BUDGET.triangles)}>{t('ui.debug.tri_v', { n: Math.round(p.triangles / 1000) })}</dd>
      <dt>{t('ui.debug.mem')}</dt>
      <dd>{t('ui.debug.mem_v', { geo: p.geometries, tex: p.textures })}</dd>
      <dt>{t('ui.debug.ents')}</dt>
      <dd>{t('ui.debug.ents_v', { players: p.players, monsters: p.monsters, npcs: p.npcs })}</dd>
      <dt>{t('ui.debug.lod')}</dt>
      <dd>{t('ui.debug.lod_v', { lod: p.lod.join(' / '), off: p.offscreen })}</dd>
      <dt>{t('ui.debug.vfx')}</dt>
      <dd>{t('ui.debug.vfx_v', { fx: p.fxMeshes, n: p.particles, limit: p.particleLimit })}</dd>
      <dt>{t('ui.debug.tiles')}</dt>
      <dd>{p.tiles}</dd>
    </dl>
  );
}

/** Nút thử nhanh. Mỗi nút là một lệnh `/gm`; riêng khung va chạm là lớp hiển thị ở client. */
function Tools() {
  const level = useUI((s) => s.char?.level ?? 1);
  const inTrib = useUI((s) => (s.flags & PF_TRIBULATION) !== 0);
  const colliders = useUI((s) => s.debugColliders);
  const [realm, setRealm] = useState(0);
  const [mon, setMon] = useState(MONSTERS[0]?.id ?? '');
  const want = realm || level;
  return (
    <div className="debug-tools">
      <div className="debug-sub">{t('ui.debug.tools')}</div>
      <div className="debug-row">
        <label>
          <span>{t('ui.debug.realm')}</span>
          <select value={want} onChange={(e) => setRealm(Number(e.target.value))} onKeyDown={(e) => e.stopPropagation()}>
            {LEVELS.map((lv) => (
              <option key={lv} value={lv}>
                {realmName(lv)}
              </option>
            ))}
          </select>
        </label>
        <Button size="s" onClick={() => gm('level ' + want)}>
          {t('ui.debug.set')}
        </Button>
      </div>
      <div className="debug-row">
        <label>
          <span>{t('ui.debug.spawn')}</span>
          <select value={mon} onChange={(e) => setMon(e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
            {MONSTERS.map((m) => (
              <option key={m.id} value={m.id}>
                {monsterName(m.id)}
              </option>
            ))}
          </select>
        </label>
        <Button size="s" disabled={!mon} onClick={() => gm('spawn ' + mon)}>
          {t('ui.debug.spawn_btn')}
        </Button>
      </div>
      <div className="debug-row wrap">
        <Button size="s" onClick={() => gm('heal')}>
          {t('ui.debug.heal')}
        </Button>
        <Button size="s" onClick={() => gm('god')}>
          {t('ui.debug.god')}
        </Button>
        <Button size="s" variant="primary" disabled={inTrib} onClick={() => gm('trib')}>
          {t('ui.debug.trib')}
        </Button>
        <Button size="s" onClick={() => gm('cd')}>
          {t('ui.debug.cd')}
        </Button>
        <Button size="s" onClick={() => gm('killall')}>
          {t('ui.debug.killall')}
        </Button>
        <Button size="s" pressed={colliders} onClick={() => Game.current?.setDebugColliders(!colliders)}>
          {t('ui.debug.colliders')}
        </Button>
      </div>
      <div className="debug-note">{t('ui.debug.tools_hint')}</div>
    </div>
  );
}

/**
 * Bảng gỡ lỗi F3 (M1-2, mở rộng): hiệu năng (FPS, thời gian khung, draw call, tam giác, thực thể, VFX), phím đang giữ,
 * trạng thái, ping, room, và nút thử nhanh. Chỉ mở được ở bản dev hoặc khi URL có `?debug=1`.
 * Engine điền `debug` mỗi 100 ms chỉ khi bảng đang mở, nên tắt bảng thì không tốn gì.
 */
export function DebugPanel() {
  const open = useUI((s) => s.debugOpen);
  const allowed = useUI((s) => s.debugAllowed);
  const d = useUI((s) => s.debug);
  const dev = useUI((s) => s.dev);
  const queued = useUI((s) => s.queuedSkill);
  if (!open || !allowed || !d) return null;
  const none = t('ui.debug.none');
  const yn = (v: boolean): string => t(v ? 'ui.debug.yes' : 'ui.debug.no');
  const states = d.states.map((k) => t(k));
  if (queued >= 0) states.push(t('ui.debug.st.queued', { n: queued + 1 }));
  return (
    <div className="debug-panel">
      <div className="debug-title">{t('ui.debug.title')}</div>
      <div className="debug-sub">{t('ui.debug.perf')}</div>
      <PerfRows p={d.perf} />
      {/* Nút thử nhanh đặt ngay dưới số đo: bảng không nhận chuột để cuộn, nên phần cần bấm phải nằm trong khung nhìn ở 720p. */}
      {dev ? <Tools /> : <div className="debug-note">{t('ui.debug.no_gm')}</div>}
      <div className="debug-sub">{t('ui.debug.input')}</div>
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
