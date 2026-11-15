// Tổ đội và tỉ thí (P3-9): khung tổ đội trên HUD, lời mời, đếm ngược tỉ thí, bảng tổ đội. Chỉ hiển thị và gửi ý định.
import './party.css';
import { useEffect, useState } from 'react';
import { C, inArena, type LootMode, type PartyMember } from '@dtl/shared';
import { realmName, t } from '@dtl/content';
import { Game } from '../game/engine';
import { Button, Divider, PanelWindow, ProgressBar } from './kit';
import { set, togglePanel, useUI } from './store';

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const send = (type: string, msg: unknown) => Game.current?.send(type, msg);

function RoleTag({ role }: { role: PartyMember['role'] }) {
  if (!role) return null;
  return <span className={'pty-role ' + role}>{t(`ui.party.role.${role}`)}</span>;
}

/** Khung tổ đội dưới khung nhân vật: máu và linh lực của từng thành viên (kể cả mình). */
export function PartyFrame() {
  const party = useUI((s) => s.party);
  const sid = Game.current?.sid;
  if (!party) return null;
  return (
    <div className="pty-frame" data-res={party.res ? '1' : undefined}>
      {party.res && (
        <div className="pty-res" title={t('ui.party.res_tip')}>
          ☯ {t('ui.party.res')}
        </div>
      )}
      {party.members.map((m) => (
        <div key={m.id} className={'pty-row' + (m.dead ? ' dead' : '') + (!m.room ? ' off' : '') + (m.sid && m.sid === sid ? ' me' : '')}>
          <div className="pty-head">
            <span className="pty-name">
              {m.lead && <i className="pty-crown" title={t('ui.party.leader')}>♛</i>}
              {m.name || '…'}
            </span>
            <RoleTag role={m.role} />
            <span className="pty-lv">{m.room ? realmName(m.lv) : t('ui.party.offline')}</span>
          </div>
          {m.room && (
            <>
              <ProgressBar cls="hp ally" value={m.hp} max={m.mhp} text={`${m.hp} / ${m.mhp}`} label={t('ui.hp')} />
              <div className="pty-mp">
                <i style={{ width: (m.mmp > 0 ? Math.min(100, (m.mp / m.mmp) * 100) : 0) + '%' }} />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Lời mời tổ đội/tỉ thí đang chờ: thẻ nhỏ ở giữa phía trên, có đếm ngược. */
export function InviteStack() {
  const invites = useUI((s) => s.invites);
  const now = useNow(500);
  const live = invites.filter((i) => i.until > now);
  useEffect(() => {
    if (live.length !== invites.length) set({ invites: live });
  }, [live.length, invites.length]);
  if (!live.length) return null;
  return (
    <div className="pty-invites">
      {live.map((i) => {
        const cmd = i.kind === 'party' ? C.PARTY : C.DUEL;
        const answer = (a: 'acc' | 'dec') => {
          send(cmd, { a, id: i.id });
          set((s) => ({ invites: s.invites.filter((x) => !(x.kind === i.kind && x.id === i.id)) }));
        };
        return (
          <div key={i.kind + i.id} className="pty-invite" data-kind={i.kind}>
            <div className="pty-invite-title">{t(i.kind === 'party' ? 'ui.party.invite_title' : 'ui.duel.invite_title', { name: i.name })}</div>
            <div className="pty-invite-btns">
              <Button size="s" variant="primary" onClick={() => answer('acc')}>
                {t('ui.party.accept')}
              </Button>
              <Button size="s" onClick={() => answer('dec')}>
                {t('ui.party.decline')}
              </Button>
              <span className="pty-count">{Math.max(0, Math.ceil((i.until - now) / 1000))}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Đếm ngược, tên đối thủ, nút chịu thua và kết quả tỉ thí. */
export function DuelBanner() {
  const duel = useUI((s) => s.duel);
  const now = useNow(200);
  if (!duel) return null;
  if (duel.phase === 'end') {
    const key = duel.won ? 'win' : duel.why === 'win' || duel.why === 'yield' || duel.why === 'leave' ? 'lose' : 'draw';
    return (
      <div className="duel-banner end" data-res={key}>
        <div className="duel-result">{t('ui.duel.' + key)}</div>
        <div className="duel-sub">{t('ui.duel.why.' + (duel.why ?? 'abort'))}</div>
        <div className="duel-sub dim">{t('ui.duel.note')}</div>
      </div>
    );
  }
  const left = Math.ceil((duel.at - now) / 1000);
  if (duel.phase === 'count' && left > 0) {
    return (
      <div className="duel-banner count">
        <div className="duel-big">{left}</div>
        <div className="duel-sub">{t('ui.duel.fight', { name: duel.name })}</div>
      </div>
    );
  }
  return (
    <div className="duel-banner fight">
      <span>{t('ui.duel.fight', { name: duel.name })}</span>
      <Button size="s" onClick={() => send(C.DUEL, { a: 'yield' })}>
        {t('ui.duel.yield')}
      </Button>
    </div>
  );
}

/** Bảng tổ đội (phím P): thành viên, chia đồ, mời đạo hữu gần đây, thách đấu ở võ đài. */
export function PartyPanel() {
  const party = useUI((s) => s.party);
  const nearby = useUI((s) => s.nearby);
  const x = useUI((s) => s.x);
  const z = useUI((s) => s.z);
  const sid = Game.current?.sid;
  const me = party?.members.find((m) => m.sid && m.sid === sid);
  const lead = !!me?.lead;
  const full = (party?.members.length ?? 0) >= 4;
  const canInvite = !party || lead;
  const inRing = inArena(x, z);
  const mode: LootMode = party?.loot ?? 'turn';
  return (
    <PanelWindow title={t('ui.party.title')} sub={t('ui.party.cmd_hint')} onClose={() => togglePanel('party')} width={460}>
      {party ? (
        <>
          <Divider label={t('ui.party.members', { n: party.members.length })} />
          <div className="pty-list">
            {party.members.map((m) => (
              <div key={m.id} className="pty-li">
                <span className="pty-name">
                  {m.lead && <i className="pty-crown">♛</i>}
                  {m.name || '…'}
                </span>
                <RoleTag role={m.role} />
                <span className="k-dim">{m.room ? realmName(m.lv) : t('ui.party.offline')}</span>
                {lead && m !== me && (
                  <span className="pty-acts">
                    <Button size="s" disabled={!m.room} onClick={() => send(C.PARTY, { a: 'lead', id: m.id })}>
                      {t('ui.party.lead')}
                    </Button>
                    <Button size="s" onClick={() => send(C.PARTY, { a: 'kick', id: m.id })}>
                      {t('ui.party.kick')}
                    </Button>
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="pty-loot">
            <b>{t('ui.party.loot')}</b>
            {(['turn', 'free'] as const).map((m) => (
              <Button key={m} size="s" pressed={mode === m} disabled={!lead} onClick={() => send(C.PARTY, { a: 'loot', m })}>
                {t('ui.party.loot_' + m)}
              </Button>
            ))}
          </div>
          <div className="k-dim pty-hint">{t('ui.party.loot_hint')}</div>
          <div className="k-dim pty-hint">{party.res ? t('ui.party.res_tip') : t('ui.party.res_off')}</div>
          <div className="pty-foot">
            <Button size="s" onClick={() => send(C.PARTY, { a: 'leave' })}>
              {t('ui.party.leave')}
            </Button>
          </div>
        </>
      ) : (
        <div className="k-dim pty-hint">{t('ui.party.none')}</div>
      )}
      <Divider label={t('ui.party.nearby')} />
      <div className="pty-list">
        {nearby.length === 0 && <div className="k-dim pty-hint">{t('ui.party.none_nearby')}</div>}
        {nearby.map((n) => (
          <div key={n.name} className="pty-li">
            <span className="pty-name">{n.name}</span>
            <span className="k-dim">{realmName(n.lv)}</span>
            <span className="pty-acts">
              <Button size="s" variant="primary" disabled={!canInvite || full} onClick={() => send(C.PARTY, { a: 'inv', n: n.name })}>
                {t('ui.party.invite')}
              </Button>
              <Button size="s" disabled={!inRing} title={t('ui.duel.arena_hint')} onClick={() => send(C.DUEL, { a: 'inv', n: n.name })}>
                {t('ui.duel.challenge')}
              </Button>
            </span>
          </div>
        ))}
      </div>
      <div className="k-dim pty-hint">{t('ui.duel.arena_hint')}</div>
    </PanelWindow>
  );
}
