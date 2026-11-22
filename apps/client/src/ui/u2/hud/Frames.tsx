import { NGUNG_KHI_MAX, PF_TRIBULATION } from '@dtl/shared';
import { MarkChips } from './MarkChips';
import { monsterName, realmName, t } from '@dtl/content';
import { Game } from '../../../game/engine';
import { Portrait } from '../../Art';
import { breakGoal } from '../../breakGoal';
import { openPanel, type TargetCast, useUI } from '../../store';
import { Badge, Bar, Button, JadeRing } from '../index';
import { blurAfterPointer, useNow } from './common';

/** Thanh niệm chú/choáng của mục tiêu (boss). Đoạn đầu tô tối là lúc hộ chú, chưa phá chú được. */
export function TargetCastBar({ cast }: { cast: TargetCast }) {
  const now = useNow(50);
  if (now >= cast.end) return null;
  const done = Math.max(0, Math.min(1, 1 - (cast.end - now) / cast.total));
  const guarded = cast.kind === 'chant' && done < cast.open;
  // Niệm chú: thanh đầy dần; choáng: thanh cạn dần.
  const pct = (cast.kind === 'chant' ? done : 1 - done) * 100;
  const label =
    cast.kind === 'broken'
      ? 'ui.target.broken'
      : cast.kind === 'stun'
        ? 'ui.target.stun'
        : guarded
          ? 'ui.target.chant_guard'
          : 'ui.target.chant';
  return (
    <div className={'gauge tcast ' + cast.kind + (guarded ? ' guarded' : '')}>
      <div className="gauge-in">
        {cast.kind === 'chant' && cast.open > 0 && <div className="tcast-guard" style={{ width: cast.open * 100 + '%' }} />}
        <div className="gauge-fill" style={{ width: pct + '%' }} />
      </div>
      <div className="gauge-text">{t(label)}</div>
    </div>
  );
}

/** Thẻ người chơi góc trái trên: chân dung vòng ngọc + tên + cảnh giới + sinh lực / linh lực / tu vi (+ nút đột phá khi đủ điều kiện). */
export function PlayerCard() {
  const char = useUI((s) => s.char);
  const hp = useUI((s) => s.hp);
  const mhp = useUI((s) => s.mhp);
  const mp = useUI((s) => s.mp);
  const mmp = useUI((s) => s.mmp);
  // Mọi hook phải đứng trước lệnh return sớm (store khởi đầu với char = null).
  const flags = useUI((s) => s.flags);
  if (!char) return null;
  const goal = breakGoal(char);
  // Đang độ kiếp thì không mời đột phá nữa.
  if (flags & PF_TRIBULATION) goal.ready = false;
  const full = goal.ready || (flags & PF_TRIBULATION) !== 0 || (char.level === NGUNG_KHI_MAX && char.xp >= char.xpNeed);
  const female = Game.current?.view?.players.get(Game.current.sid)?.g === 'f';
  return (
    <section className={'u2h-zone u2h-tl u2h-card' + (goal.ready ? ' can-break' : '')} aria-label={t('ui.char')}>
      <div className="u2h-portrait" aria-hidden="true">
        <Portrait id={female ? 'player_f' : 'player_m'} className="u2h-face" />
        <JadeRing />
      </div>
      <div className="u2h-pc-main">
        <div className="u2h-pc-head">
          <span className="u2h-name">{char.name}</span>
          <Badge tone="ngoc">{realmName(char.level)}</Badge>
        </div>
        <Bar kind="hp" value={hp} max={mhp} text={`${hp} / ${mhp}`} label={t('ui.hp')} />
        <Bar kind="mp" value={mp} max={mmp} text={`${mp} / ${mmp}`} label={t('ui.mp')} />
        <div className="u2h-xp">
          <Bar
            kind="xp"
            value={char.xp}
            max={char.xpNeed}
            text={full ? t('ui.xp_full') : `${t('ui.xp')} ${char.xp} / ${char.xpNeed}`}
            label={t('ui.xp')}
          />
          {goal.ready && (
            // Chỉ mở bảng Nhân vật ở khối đột phá: bắt đầu độ kiếp tốn Trúc Cơ Đan nên không làm bằng một cú bấm trên HUD.
            <Button
              size="s"
              title={t(goal.kind === 'trib' ? 'ui.frame.break_trib' : 'ui.frame.break_bk', { n: char.level })}
              onClick={(e) => {
                openPanel('char');
                blurAfterPointer(e);
              }}
            >
              {t('ui.frame.break')}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Thanh boss giữa phía trên: tên Grenze + danh hiệu, thanh boss vát chéo, vạch chuyển pha, thế (posture), niệm chú. */
export function BossCard() {
  const boss = useUI((s) => s.boss);
  if (!boss) return null;
  // Làm tròn xuống, nhưng còn sống thì tối thiểu 1% (không hiện 100% khi đã mất máu, không hiện 0% khi chưa chết).
  const pct = boss.hp > 0 && boss.mhp > 0 ? Math.max(1, Math.floor((boss.hp / boss.mhp) * 100)) : 0;
  return (
    <section className="u2h-zone u2h-tc u2h-card" key={boss.id} aria-label={monsterName(boss.def)}>
      <div className="u2h-boss-head">
        <span className="u2h-boss-name">{monsterName(boss.def)}</span>
        <span className="u2h-boss-sub">
          {t(`mon.${boss.def}.title`)} · {t('ui.level_short', { n: boss.level })}
        </span>
      </div>
      <div className="u2h-boss-hp">
        <Bar
          kind="boss"
          value={boss.hp}
          max={boss.mhp}
          text={`${boss.hp} / ${boss.mhp} · ${t('ui.boss.hp', { pct })}`}
          label={t('ui.hp')}
        />
        {/* Vạch chuyển pha: báo trước boss sẽ đổi chiêu ở mức máu này. */}
        {boss.marks?.map((f) => (
          <i key={f} className="u2h-boss-mark" style={{ left: f * 100 + '%' }} />
        ))}
      </div>
      {boss.face && (
        <div className={'u2h-boss-face ' + (boss.face.am ? 'am' : 'duong')} role="status">
          <span className="u2h-boss-face-ico" aria-hidden="true">
            {boss.face.am ? '陰' : '陽'}
          </span>
          <span className="u2h-boss-face-txt">{t(boss.face.am ? 'ui.boss.face_am' : 'ui.boss.face_duong', { n: boss.face.left })}</span>
        </div>
      )}
      <MarkChips mk={boss.mk} />
      {boss.posture !== undefined && (
        <div className={'gauge posture' + (boss.cast?.kind === 'broken' ? ' broken' : boss.posture >= 0.75 ? ' near' : '')}>
          <div className="gauge-in">
            <div className="gauge-fill" style={{ width: (boss.cast?.kind === 'broken' ? 100 : boss.posture * 100) + '%' }} />
          </div>
          <div className="gauge-label">{t('ui.boss.posture')}</div>
        </div>
      )}
      {boss.cast && <TargetCastBar cast={boss.cast} />}
    </section>
  );
}
