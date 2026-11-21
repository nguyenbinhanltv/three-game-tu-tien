// Cây nhánh công pháp (VS-2d): bốn mốc cảnh giới, mỗi mốc chọn một nhánh. Chỉ gửi ý định; server kiểm và ghi DB.
import { BRANCH_TIERS, branchesAt, branchResetCost, C, pickedBranch, type BranchDef, type BranchPicks, type MethodDef } from '@dtl/shared';
import { realmName, SKILL, t } from '@dtl/content';
import { Game, reqId } from '../game/engine';
import { ContentIcon } from './ContentIcon';
import { branchState, type BranchState } from './branchState';
import { chainLines } from './skillChain';
import { Button, Slot, TipCard, Tooltip } from './u2/win';

function BranchCard({ m, b, state }: { m: MethodDef; b: BranchDef; state: BranchState }) {
  const g = Game.current;
  return (
    <div className="br-card" data-state={state} data-testid={`branch-${b.tier}-${b.id}`}>
      <div className="br-card-head">
        <span className="br-name">{t(`branch.${m.id}.${b.id}.name`)}</span>
        {state === 'picked' && <span className="br-tag">{t('ui.branch.picked')}</span>}
      </div>
      <div className="k-dim br-desc">{t(`branch.${m.id}.${b.id}.desc`)}</div>
      <div className="br-grants">
        {b.grants.map((id) => {
          const sk = SKILL.get(id);
          if (!sk) return null;
          return (
            <Tooltip
              key={id}
              content={<TipCard title={t(`skill.${id}.name`)} lines={chainLines(sk, false)} desc={t(`skill.${id}.desc`)} />}
            >
              <span className="br-grant">
                <Slot size="s" rarity={1} icon={<ContentIcon def={sk} />} label={t(`skill.${id}.name`)} disabled={state === 'other'} />
                <span>{t(`skill.${id}.name`)}</span>
              </span>
            </Tooltip>
          );
        })}
      </div>
      {state === 'open' && (
        <Button size="s" variant="primary" onClick={() => g?.send(C.BRANCH, { a: 'pick', tier: b.tier, id: b.id, r: reqId() })}>
          {t('ui.branch.pick')}
        </Button>
      )}
    </div>
  );
}

export function BranchTree({
  method,
  picks,
  level,
  gold,
}: {
  method: MethodDef;
  picks: BranchPicks | undefined;
  level: number;
  gold: number;
}) {
  const g = Game.current;
  const cost = branchResetCost(level);
  const any = BRANCH_TIERS.some((tier) => pickedBranch(method, picks, tier));
  return (
    <div className="br-tree" data-testid="branch-tree">
      <div className="k-dim">{t('ui.branch.hint')}</div>
      {BRANCH_TIERS.map((tier) => {
        const list = branchesAt(method, tier);
        if (!list.length) return null;
        const reached = level >= tier;
        return (
          <div key={tier} className="br-tier" data-reached={reached ? '1' : undefined}>
            <div className="br-tier-head">
              <b>{t('ui.branch.tier', { realm: realmName(tier) })}</b>
              {!reached && <span className="k-dim">{t('ui.branch.locked', { realm: realmName(tier) })}</span>}
            </div>
            <div className="br-row">
              {list.map((b) => (
                <BranchCard key={b.id} m={method} b={b} state={branchState(method, picks, b, level)} />
              ))}
            </div>
          </div>
        );
      })}
      <div className="br-foot">
        <Button size="s" disabled={!any || gold < cost} onClick={() => g?.send(C.BRANCH, { a: 'reset', r: reqId() })}>
          {t('ui.branch.reset', { n: cost })}
        </Button>
        <span className="k-dim">{t('ui.branch.reset_hint')}</span>
      </div>
    </div>
  );
}
