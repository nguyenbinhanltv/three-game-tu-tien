import { type CSSProperties, type PointerEvent as RPointerEvent, useEffect, useRef, useState } from 'react';
import { PF_FLYING, PF_MEDITATING, type SkillDef } from '@dtl/shared';
import { METHOD, SKILL, skillBar, t, thanThong10Skill, thanThongSkill } from '@dtl/content';
import { barWithStance } from '../../stanceView';
import { Game } from '../../../game/engine';
import { touchTap } from '../../../game/engine/touch';
import { isTap, joystick, JOY_RADIUS } from '../../../input/touchMode';
import { ContentIcon } from '../../ContentIcon';
import { SysIcon, type SysIconName } from '../shell';
import { TipCard } from '../win';
import { useUI } from '../../store';
import { IconFrame } from '../Slot';
import { useNow } from '../hud/common';
import { useSkillView } from '../hud/SkillCluster';
import { TouchUtility } from './TouchUtility';
import { COMPACT_W, INNER_N, touchCluster, type TPos } from './touchLayout';

const HOLD_MS = 420; // giữ ngón lâu hơn thế = xem mô tả, không ra chiêu

/** Vị trí nút tính từ góc dưới-phải: neo là tâm nút đánh lớn (biến CSS `--t-ax`, `--t-ay`). */
const place = (p: TPos): CSSProperties =>
  ({
    right: `calc(var(--t-ax) - ${p.dx}px - ${p.d / 2}px)`,
    bottom: `calc(var(--t-ay) + ${-p.dy}px - ${p.d / 2}px)`,
    width: p.d,
    height: p.d,
    '--sz': p.d + 'px',
  }) as CSSProperties;

/** Cần ảo bên trái: nơi ngón chạm xuống là tâm (cần nổi), vùng chết, đẩy xa = chạy; gửi ý định như WASD. Chạm nhanh không kéo = chọn mục tiêu. */
function Joystick() {
  const [st, setSt] = useState<{ ox: number; oy: number; kx: number; ky: number; mag: number } | null>(null);
  const ref = useRef<{ id: number; ox: number; oy: number; t0: number; moved: number } | null>(null);
  const stop = () => {
    ref.current = null;
    setSt(null);
    const g = Game.current;
    if (g) g.touchMove = null;
  };
  useEffect(() => stop, []);
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (ref.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    ref.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, t0: performance.now(), moved: 0 };
    setSt({ ox: e.clientX, oy: e.clientY, kx: 0, ky: 0, mag: 0 });
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const r = ref.current;
    if (!r || r.id !== e.pointerId) return;
    const dx = e.clientX - r.ox;
    const dy = e.clientY - r.oy;
    r.moved = Math.max(r.moved, Math.hypot(dx, dy));
    const j = joystick(dx, dy);
    setSt({ ox: r.ox, oy: r.oy, kx: j.kx, ky: j.ky, mag: j.mag });
    const g = Game.current;
    if (!g) return;
    g.touchMove = j.mag > 0 ? { mx: j.mx, mz: j.mz } : null;
    if (j.mag > 0) {
      g.autorun = false;
      g.cancelQueuedSkill(); // bắt đầu di chuyển thì hủy chiêu đang chờ, như phím
    }
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const r = ref.current;
    if (!r || r.id !== e.pointerId) return;
    const tap = e.type === 'pointerup' && isTap(r.moved, performance.now() - r.t0);
    stop();
    const g = Game.current;
    if (tap && g) touchTap(g, e.clientX, e.clientY);
  };
  return (
    <div
      className="u2t-joy"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      data-testid="touch-joystick"
      aria-label={t('ui.touch.joystick')}
    >
      <span className="u2t-joy-hint" aria-hidden="true" data-on={st ? undefined : '1'} />
      {st && (
        <span className="u2t-joy-base" style={{ left: st.ox, top: st.oy, '--r': JOY_RADIUS + 'px' } as CSSProperties} aria-hidden="true">
          <span
            className="u2t-joy-knob"
            style={{ transform: `translate(${st.kx}px, ${st.ky}px)` }}
            data-run={st.mag >= 1 ? '1' : undefined}
          />
        </span>
      )}
    </div>
  );
}

type View = ReturnType<typeof useSkillView>;
type TipState = { sk: SkillDef; i: number } | null;

/** Nút chiêu cảm ứng: chạm = ra chiêu, giữ ngón hơn `HOLD_MS` = hiện mô tả (thả ngón không ra chiêu). */
function TouchSlot({
  sk,
  i,
  pos,
  view,
  main,
  onTip,
}: {
  sk: SkillDef | null;
  i: number;
  pos: TPos;
  view: View;
  main?: boolean;
  onTip: (x: TipState) => void;
}) {
  const timer = useRef(0);
  const held = useRef(false);
  if (!sk) return null;
  const v = view(sk, i);
  if (v.locked) return null;
  const cdOn = !v.charging && v.left > 80;
  const clear = () => window.clearTimeout(timer.current);
  return (
    <button
      type="button"
      className={'u2-slot u2-skill u2t-btn' + (v.queued ? ' queued' : '') + (v.empowered ? ' empowered' : '') + (v.auto ? ' auto' : '')}
      style={place(pos)}
      data-state={v.state}
      data-cd={cdOn ? '1' : undefined}
      data-main={main ? '1' : undefined}
      data-method={sk.method ? '1' : undefined}
      data-testid={'touch-skill-' + i}
      aria-label={t(`skill.${sk.id}.name`)}
      onPointerDown={(e) => {
        e.preventDefault();
        held.current = false;
        clear();
        timer.current = window.setTimeout(() => {
          held.current = true;
          onTip({ sk, i });
        }, HOLD_MS);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        clear();
        if (held.current) onTip(null);
        else Game.current?.useSkill(i);
        held.current = false;
      }}
      onPointerCancel={() => {
        clear();
        held.current = false;
        onTip(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (e.detail === 0) Game.current?.useSkill(i); // Enter/Space từ bàn phím ngoài
      }}
    >
      <IconFrame>
        <ContentIcon def={sk} />
      </IconFrame>
      {main && v.gcd > 0.02 && <span className="u2h-gcd" style={{ '--cd': Math.min(1, v.gcd) } as CSSProperties} />}
      {cdOn && (
        <>
          <span className="u2-skill__cd" style={{ '--cd': v.frac } as CSSProperties} />
          {v.left > 1000 && <span className="u2-skill__cdn">{Math.ceil(v.left / 1000)}</span>}
        </>
      )}
    </button>
  );
}

interface QuickProps {
  pos: TPos;
  label: string;
  sys: SysIconName;
  pressed?: boolean;
  cdFrac?: number;
  testid: string;
  onPress: () => void;
  onRelease?: () => void;
}

/** Nút phụ (Lướt, Nhảy, Ngự kiếm, Đả tọa, Tương tác, Đổi mục tiêu): bấm ngay khi chạm; Nhảy giữ ngón để bay lên. */
function Quick({ pos, label, sys, pressed, cdFrac, testid, onPress, onRelease }: QuickProps) {
  return (
    <button
      type="button"
      className="u2-slot u2-skill u2t-btn u2t-quick"
      style={place(pos)}
      aria-pressed={pressed || undefined}
      aria-label={label}
      data-cd={cdFrac ? '1' : undefined}
      data-testid={testid}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (e.detail === 0) {
          onPress();
          onRelease?.();
        }
      }}
    >
      <IconFrame size="s">
        <SysIcon name={sys} size={20} />
      </IconFrame>
      <span className="u2t-lbl" aria-hidden="true">
        {label}
      </span>
      {!!cdFrac && <span className="u2-skill__cd" style={{ '--cd': cdFrac } as CSSProperties} />}
    </button>
  );
}

/** Cụm bên phải: nút đánh lớn + vòng kỹ năng Kiếm Luân (biến thể cảm ứng) + hàng nút phụ + thẻ mô tả khi giữ ngón. */
function ActionCluster() {
  const method = useUI((s) => s.method);
  const flags = useUI((s) => s.flags);
  const wantFly = useUI((s) => s.wantFly);
  const cds = useUI((s) => s.cds);
  const char = useUI((s) => s.char);
  const view = useSkillView();
  const now = useNow(100);
  const [tip, setTip] = useState<TipState>(null);
  const [compact, setCompact] = useState(() => window.innerWidth < COMPACT_W);
  useEffect(() => {
    const on = () => setCompact(window.innerWidth < COMPACT_W);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  if (!char) return null;
  const g = touchCluster(compact);
  const tt = thanThongSkill(method?.method, method?.br);
  const tt10 = thanThong10Skill(method?.method);
  const methodOff = useUI((st) => st.methodOff);
  const bar = barWithStance([...skillBar(method?.method), ...(tt ? [tt] : []), ...(tt10 ? [tt10] : [])], method, Date.now() - methodOff);
  const slot = (i: number): SkillDef | null => bar[i] ?? null;
  const mdef = method?.method ? METHOD.get(method.method) : undefined;
  const dash = mdef ? SKILL.get(mdef.dash) : undefined;
  const dashLeft = dash ? Math.max(0, (cds[dash.id] ?? 0) - now) : 0;
  const dashTotal = Math.max(1, (dash?.cd ?? 1) * 1000);
  const mc = mdef ? ({ '--mc': '#' + mdef.color } as CSSProperties) : undefined;
  const space = (down: boolean) => {
    const eng = Game.current;
    if (!eng) return;
    if (down) {
      eng.keys.press('Space');
      eng.cancelQueuedSkill();
    } else eng.keys.onUp('Space');
  };
  const tv = tip ? view(tip.sk, tip.i) : null;
  return (
    <div className="u2t-act" style={mc} data-testid="touch-actions">
      {/* đòn chính = ô 1; cung trong = ô 2–5, cung ngoài = ô 6–10 (cùng thứ tự phím như PC) */}
      <TouchSlot sk={slot(0)} i={0} pos={g.main} view={view} main onTip={setTip} />
      {g.inner.map((p, k) => (
        <TouchSlot key={'i' + k} sk={slot(1 + k)} i={1 + k} pos={p} view={view} onTip={setTip} />
      ))}
      {g.outer.map((p, k) => (
        <TouchSlot key={'o' + k} sk={slot(1 + INNER_N + k)} i={1 + INNER_N + k} pos={p} view={view} onTip={setTip} />
      ))}
      <Quick
        pos={g.quick[0]!}
        label={t('ui.dash')}
        sys="dash"
        cdFrac={dashLeft > 80 ? Math.min(1, dashLeft / dashTotal) : 0}
        testid="touch-dash"
        onPress={() => Game.current?.useDash()}
      />
      <Quick
        pos={g.quick[1]!}
        label={t('ui.touch.jump')}
        sys="jump"
        testid="touch-jump"
        onPress={() => space(true)}
        onRelease={() => space(false)}
      />
      <Quick
        pos={g.quick[2]!}
        label={t('ui.fly')}
        sys="sword"
        pressed={wantFly || (flags & PF_FLYING) !== 0}
        testid="touch-fly"
        onPress={() => Game.current?.toggleFly()}
      />
      <Quick
        pos={g.quick[3]!}
        label={t('ui.meditate')}
        sys="meditate"
        pressed={(flags & PF_MEDITATING) !== 0}
        testid="touch-meditate"
        onPress={() => Game.current?.toggleMeditate()}
      />
      <Quick pos={g.quick[4]!} label={t('ui.touch.interact')} sys="talk" testid="touch-interact" onPress={() => Game.current?.interact()} />
      <Quick
        pos={g.quick[5]!}
        label={t('ui.touch.target')}
        sys="target"
        testid="touch-target"
        onPress={() => {
          const eng = Game.current;
          if (!eng) return;
          const id = eng.ents.nextTarget(eng.targetId, eng.cur.x, eng.cur.z);
          if (id) eng.setTarget(id, 'mon');
        }}
      />
      {tip && tv && (
        <div className="u2t-tip" role="status" data-testid="touch-tip">
          <TipCard title={t(`skill.${tip.sk.id}.name`)} lines={tv.lines} desc={t(`skill.${tip.sk.id}.desc`)} />
        </div>
      )}
    </div>
  );
}

/** Gợi ý xoay ngang khi cầm dọc (đóng được, nhớ trong phiên). */
function RotateHint() {
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const [shut, setShut] = useState(false);
  useEffect(() => {
    const on = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  if (!portrait || shut) return null;
  return (
    <div className="u2t-rotate" role="status" data-testid="touch-rotate">
      <span>{t('ui.touch.rotate')}</span>
      <button type="button" onClick={() => setShut(true)} aria-label={t('ui.touch.rotate_close')}>
        ×
      </button>
    </div>
  );
}

/** Lớp điều khiển cảm ứng của HUD (chỉ dựng ở chế độ cảm ứng). */
export function TouchControls() {
  return (
    <div className="u2t">
      <Joystick />
      <ActionCluster />
      <TouchUtility />
      <RotateHint />
    </div>
  );
}
