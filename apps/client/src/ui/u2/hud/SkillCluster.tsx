import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { BAR_SIZE, CHARGE_MAX, PF_FLYING, PF_MEDITATING, type SkillDef } from '@dtl/shared';
import { METHOD, realmName, resolveBarSkill, SKILL, skillBar, t, thanThong10Skill, thanThongSkill, VARIANTS } from '@dtl/content';
import { Game } from '../../../game/engine';
import { ContentIcon } from '../../ContentIcon';
import { SysIcon, type SysIconName } from '../shell';
import { TipCard, Tooltip } from '../win';
import { togglePanel, useUI } from '../../store';
import { IconFrame } from '../Slot';
import { LockMark } from '../patterns';
import { blurAfterPointer, useNow } from './common';
import { chainLines, skillMpNow } from '../../skillChain';
import { barWithStance } from '../../stanceView';
import { CLUSTER, clusterGeom, skillBox, type SlotPos } from './layout';

/** Nhãn phím của ô thanh chiêu thứ i (khớp `Game.useSkill(i)`): 1–8, ô 9 thần thông = 0, ô 10 = `. */
function keyLabelOf(i: number): string {
  return i === BAR_SIZE ? '0' : i === BAR_SIZE + 1 ? '`' : String(i + 1);
}

type SkillState = 'ready' | 'cd' | 'locked' | 'air' | 'nomp' | 'charging' | 'ultready' | 'empty';

/** Trạng thái hiển thị của một chiêu (cùng luật với thanh chiêu cũ: khóa, ngự kiếm, thiếu linh lực, ult chưa sạc, hồi chiêu). */
export function useSkillView() {
  const char = useUI((s) => s.char);
  const cds = useUI((s) => s.cds);
  const gcdAt = useUI((s) => s.gcdAt);
  const mp = useUI((s) => s.mp);
  const airborne = useUI((s) => s.airborne);
  const method = useUI((s) => s.method);
  const queued = useUI((s) => s.queuedSkill);
  const empowered = useUI((s) => s.empowered);
  const auto = useUI((s) => s.autoAttack);
  const now = useNow(100);
  const charge = method?.charge ?? 0;
  return (sk: SkillDef, i: number) => {
    const rs = resolveBarSkill(method, sk);
    const locked = (char?.level ?? 0) < sk.unlock;
    const ready = Math.max(cds[sk.id] ?? 0, gcdAt);
    const left = Math.max(0, ready - now);
    const total = (cds[sk.id] ?? 0) > gcdAt ? Math.max(1, rs.cd) * 1000 : 1000;
    // VS-2b: cửa sổ chuỗi đang mở (server báo hạn qua tin `cd`): sáng viền, tooltip báo thưởng, linh lực tính theo thưởng.
    const chainOpen = (empowered[sk.id] ?? 0) > Date.now();
    const mpNow = skillMpNow(sk, chainOpen);
    const noMp = !locked && mp < mpNow;
    const charging = !locked && !!sk.ult && charge < CHARGE_MAX;
    const state: SkillState = locked
      ? 'locked'
      : airborne
        ? 'air'
        : charging
          ? 'charging'
          : noMp
            ? 'nomp'
            : sk.ult
              ? 'ultready'
              : left > 80
                ? 'cd'
                : 'ready';
    const lv = method?.lv[sk.id] ?? 1;
    const vr = method?.vr[sk.id];
    const lines = [
      ...(lv > 1 ? [{ text: t('ui.skill.level_tag', { n: lv }) }] : []),
      ...(vr && VARIANTS[sk.id] ? [{ text: t('ui.skill.variant_tag', { name: t(`skill.${sk.id}.var.${vr}.name`) }) }] : []),
      ...(sk.ult ? [{ text: t('ui.skill.ult_charge', { n: Math.floor(charge) }), tone: charging ? ('bad' as const) : undefined }] : []),
      ...(sk.mp ? [{ text: `${t('ui.mp')}: ${mpNow}`, tone: noMp ? ('bad' as const) : undefined }] : []),
      ...(rs.cd ? [{ text: t('ui.skill.cd', { n: rs.cd }) }] : []),
      ...(locked ? [] : chainLines(sk, chainOpen)),
      ...(airborne && !locked ? [{ text: t('ui.skill.airborne'), tone: 'bad' as const }] : []),
      ...(noMp ? [{ text: t('ui.skill.no_mp'), tone: 'bad' as const }] : []),
    ];
    return {
      gcd: Math.max(0, gcdAt - now) / 1000,
      state,
      locked,
      left,
      frac: Math.min(1, left / total),
      charging,
      charge,
      lines,
      queued: i === queued,
      auto: i === 0 && auto,
      empowered: chainOpen,
      mcolor: sk.method,
    };
  };
}

const posStyle = (p: SlotPos): CSSProperties =>
  ({ left: p.cx - p.d / 2, top: p.cy - p.d / 2, width: p.d, height: p.d, '--sz': p.d + 'px' }) as CSSProperties;

interface SlotProps {
  sk: SkillDef | null;
  i: number;
  pos?: SlotPos;
  view: ReturnType<typeof useSkillView>;
  main?: boolean;
}

/** Một ô chiêu (đòn chính hoặc cung): icon khung bát giác (đòn chính tròn), phím, hồi chiêu quét vàng + số giây, khóa. */
function ClusterSlot({ sk, i, pos, view, main }: SlotProps) {
  const key = keyLabelOf(i);
  const style = pos ? posStyle(pos) : undefined;
  if (!sk) {
    // Ô 7–8 khi chưa chọn công pháp: ô trống, bấm để mở bảng Công pháp. Ô 9–10 không có chiêu thì không vẽ.
    if (i >= BAR_SIZE) return null;
    const name = t(i === 6 ? 'ui.method.slot7' : 'ui.method.slot8');
    return (
      <div className="u2h-cell" style={style}>
        <Tooltip content={<TipCard title={name} desc={t('ui.method.empty_slot')} />}>
          <button
            type="button"
            className="u2-slot u2-skill u2h-skill"
            data-state="empty"
            aria-label={`${name} (${key})`}
            onClick={(e) => {
              togglePanel('method');
              blurAfterPointer(e);
            }}
          >
            <IconFrame empty on="dark" />
            <span className="u2h-key">{key}</span>
          </button>
        </Tooltip>
      </div>
    );
  }
  const v = view(sk, i);
  // Ô chiêu chưa mở khóa thì ẩn hẳn (cung chỉ hiện những ô dùng được).
  if (v.locked) return null;
  const cdOn = !v.charging && v.left > 80 && !v.locked;
  return (
    <div className="u2h-cell" style={style} data-main={main ? '1' : undefined}>
      <Tooltip
        content={
          <TipCard
            title={t(`skill.${sk.id}.name`)}
            sub={v.locked ? t('ui.char.locked', { realm: realmName(sk.unlock) }) : undefined}
            lines={v.lines}
            desc={t(`skill.${sk.id}.desc`)}
          />
        }
      >
        <button
          type="button"
          className={
            'u2-slot u2-skill u2h-skill' +
            (v.queued ? ' queued' : '') +
            (v.empowered ? ' empowered' : '') +
            (v.auto ? ' auto' : '') +
            (sk.stanceOf ? ' in-stance' : '')
          }
          data-state={v.state}
          data-cd={cdOn ? '1' : undefined}
          data-main={main ? '1' : undefined}
          data-method={sk.method ? '1' : undefined}
          aria-label={`${t(`skill.${sk.id}.name`)} (${key})`}
          onClick={(e) => {
            Game.current?.useSkill(i);
            blurAfterPointer(e);
          }}
        >
          <IconFrame>
            <ContentIcon def={sk} />
          </IconFrame>
          <span className="u2h-key">{key}</span>
          {main && v.gcd > 0.02 && <span className="u2h-gcd" style={{ '--cd': Math.min(1, v.gcd) } as CSSProperties} />}
          {v.charging && (
            <>
              {/* chiêu tối thượng đang tụ lực: vòng tiến độ quanh ô + số % nhỏ ở đáy, icon vẫn thấy */}
              <span className="u2h-charge" style={{ '--cd': Math.min(1, v.charge / CHARGE_MAX) } as CSSProperties} />
              <span className="u2h-charge-n">{Math.floor((v.charge / CHARGE_MAX) * 100)}%</span>
            </>
          )}
          {cdOn && (
            <>
              <span className="u2-skill__cd" style={{ '--cd': v.frac } as CSSProperties} />
              {v.left > 1000 && <span className="u2-skill__cdn">{Math.ceil(v.left / 1000)}</span>}
            </>
          )}
          {v.locked && (
            <span className="u2-slot__lock">
              <LockMark />
            </span>
          )}
        </button>
      </Tooltip>
    </div>
  );
}

/** Nút phụ Q / F / Z (Lướt, Ngự kiếm, Đả tọa): ô nhỏ cùng hình bát giác. */
function QuickButton({
  pos,
  icon,
  sysIcon,
  label,
  kbd,
  pressed,
  cdFrac,
  cdText,
  lit,
  tip,
  onClick,
}: {
  /** Viền sáng (cửa sổ chuỗi chiêu đang mở) và thẻ tooltip đầy đủ thay cho nhãn ngắn. */
  lit?: boolean;
  tip?: ReactNode;
  pos?: SlotPos;
  icon?: ReactNode;
  sysIcon?: SysIconName;
  label: string;
  kbd: string;
  pressed?: boolean;
  cdFrac?: number;
  cdText?: string;
  onClick: (e: MouseEvent<HTMLElement>) => void;
}) {
  return (
    <div className="u2h-cell u2h-quick" style={pos ? posStyle(pos) : undefined}>
      <Tooltip content={tip ?? <span className="u2h-tip">{`${label} · ${kbd}`}</span>}>
        <button
          type="button"
          className={'u2-slot u2-skill u2h-skill' + (lit ? ' empowered' : '')}
          aria-pressed={pressed || undefined}
          data-cd={cdFrac ? '1' : undefined}
          aria-label={`${label} (${kbd})`}
          onClick={onClick}
        >
          <IconFrame size="s">{icon ?? (sysIcon && <SysIcon name={sysIcon} size={22} />)}</IconFrame>
          <span className="u2h-key">{kbd}</span>
          {!!cdFrac && <span className="u2-skill__cd" style={{ '--cd': cdFrac } as CSSProperties} />}
          {!!cdFrac && cdText && <span className="u2-skill__cdn u2h-cdn-s">{cdText}</span>}
        </button>
      </Tooltip>
    </div>
  );
}

/**
 * Kiếm Luân (U2-2): cụm kỹ năng góc phải dưới. Đòn chính tròn (phím 1) + cung trong 5 chiêu (phím 2–6) + cung ngoài
 * (7, 8, thần thông 0, ô 10 `), cùng trải từ 180° tới 270° quanh đòn chính; hàng ngắn Q Lướt / F Ngự kiếm / Z Đả tọa.
 * `layout="bar"` là thanh ngang giữa dưới (tùy chọn Cài đặt). `utility` là các ô tiện ích có sẵn (pháp bảo, đan lô, thần thức,
 * nguyên anh), hàng chiêu bậc cao, buff do nơi gọi truyền vào. Logic ra chiêu không đổi: mọi nút gọi `Game.useSkill(i)` / `useDash`.
 */
export function SkillCluster({ layout, utility }: { layout: 'arc' | 'bar'; utility?: ReactNode }) {
  const method = useUI((s) => s.method);
  const flags = useUI((s) => s.flags);
  const wantFly = useUI((s) => s.wantFly);
  const cds = useUI((s) => s.cds);
  const char = useUI((s) => s.char);
  const empowered = useUI((s) => s.empowered);
  const view = useSkillView();
  const now = useNow(100);
  if (!char) return null;
  const tt = thanThongSkill(method?.method, method?.br);
  const tt10 = thanThong10Skill(method?.method);
  const methodOff = useUI((s) => s.methodOff);
  // VS-2e: đang giữ tư thế thì ô chiêu đổi theo tư thế.
  const bar = barWithStance([...skillBar(method?.method), ...(tt ? [tt] : []), ...(tt10 ? [tt10] : [])], method, now - methodOff);
  const slots: (SkillDef | null)[] = Array.from({ length: BAR_SIZE + 2 }, (_, i) => bar[i] ?? null);
  const mdef = method?.method ? METHOD.get(method.method) : undefined;
  const dash = mdef ? SKILL.get(mdef.dash) : undefined;
  const dashLeft = dash ? Math.max(0, (cds[dash.id] ?? 0) - now) : 0;
  const dashTotal = Math.max(1, (dash?.cd ?? 1) * 1000);
  // VS-2b: chiêu lướt cũng nằm trong chuỗi (Thiết Bích Xung sau Trấn Sơn Ấn): sáng viền và có tooltip như ô chiêu.
  const dashOpen = !!dash && (empowered[dash.id] ?? 0) > now;
  const quick = (pos: (SlotPos | undefined)[]) => [
    <QuickButton
      key="q"
      pos={pos[0]}
      icon={dash ? <ContentIcon def={dash} /> : undefined}
      sysIcon="sword"
      label={t('ui.dash')}
      kbd="Q"
      cdFrac={dashLeft > 80 ? Math.min(1, dashLeft / dashTotal) : 0}
      cdText={dashLeft > 1000 ? String(Math.ceil(dashLeft / 1000)) : undefined}
      lit={dashOpen}
      tip={
        dash ? (
          <TipCard
            title={t(`skill.${dash.id}.name`)}
            sub={`${t('ui.dash')} · Q`}
            lines={[
              ...(dash.mp ? [{ text: `${t('ui.mp')}: ${dash.mp}` }] : []),
              ...(dash.cd ? [{ text: t('ui.skill.cd', { n: dash.cd }) }] : []),
              ...chainLines(dash, dashOpen),
            ]}
            desc={t(`skill.${dash.id}.desc`)}
          />
        ) : undefined
      }
      onClick={(e) => {
        Game.current?.useDash();
        blurAfterPointer(e);
      }}
    />,
    <QuickButton
      key="f"
      pos={pos[1]}
      sysIcon="sword"
      label={t('ui.fly')}
      kbd="F"
      pressed={wantFly || (flags & PF_FLYING) !== 0}
      onClick={(e) => {
        Game.current?.toggleFly();
        blurAfterPointer(e);
      }}
    />,
    <QuickButton
      key="z"
      pos={pos[2]}
      sysIcon="meditate"
      label={t('ui.meditate')}
      kbd="Z"
      pressed={(flags & PF_MEDITATING) !== 0}
      onClick={(e) => {
        Game.current?.toggleMeditate();
        blurAfterPointer(e);
      }}
    />,
  ];
  const mc = mdef ? ({ '--mc': '#' + mdef.color } as CSSProperties) : undefined;
  if (layout === 'bar') {
    return (
      <div className="u2h-skills" data-layout="bar" style={mc}>
        {utility && <div className="u2h-utility">{utility}</div>}
        <div className="u2h-barrow">
          {slots.map((sk, i) => (
            <ClusterSlot key={i} sk={sk} i={i} view={view} main={i === 0} />
          ))}
          <div className="u2h-quickrow">{quick([undefined, undefined, undefined])}</div>
        </div>
      </div>
    );
  }
  const g = clusterGeom(skillBox(1920, 1080));
  // Ô thứ i: 0 = đòn chính; 1–5 = cung trong; 6… = cung ngoài.
  return (
    <div className="u2h-skills" data-layout="arc" style={mc}>
      <div className="u2h-utility">{utility}</div>
      <ClusterSlot sk={slots[0] ?? null} i={0} pos={g.main} view={view} main />
      {g.inner.map((p, k) => (
        <ClusterSlot key={'i' + k} sk={slots[1 + k] ?? null} i={1 + k} pos={p} view={view} />
      ))}
      {g.outer.map((p, k) => (
        <ClusterSlot key={'o' + k} sk={slots[1 + CLUSTER.innerN + k] ?? null} i={1 + CLUSTER.innerN + k} pos={p} view={view} />
      ))}
      {quick(g.qer)}
    </div>
  );
}
