import './methodpanel.css';
import { type CSSProperties, useState } from 'react';
import { C, MAX_SKILL_LEVEL, VARIANT_SWITCH_COOLDOWN_SEC, METHOD_UNLOCK_LEVEL, methodSwitchCost, type SkillDef, skillUpgradeCost, variantUnlocked, type VariantId } from '@dtl/shared';
import { METHODS, METHOD, realmName, resolveBarSkill, skillBar, SKILL, t, VARIANTS } from '@dtl/content';
import { Game, reqId } from '../game/engine';
import { ContentIcon, UiIcon } from './ContentIcon';
import { Button, Divider, PanelWindow, Slot, TipCard, Tooltip } from './kit';
import { closePanel, set, useUI } from './store';

const SCROLL = 'itm_bi_tich_tan_quyen';

/** Số tiện ích nhỏ: các dòng thông số của chiêu sau khi gộp cấp + biến thức (hồi chiêu, linh lực, sức mạnh). */
function skillFacts(sk: SkillDef, lv: number, vr: VariantId | undefined): string[] {
  const rs = resolveBarSkill({ lv: { [sk.id]: lv }, vr: vr ? { [sk.id]: vr } : {} }, sk);
  const out: string[] = [];
  if (sk.mp) out.push(`${t('ui.mp')}: ${sk.mp}`);
  if (rs.cd) out.push(t('ui.skill.cd', { n: rs.cd }));
  return out;
}

function Pips({ n, max = MAX_SKILL_LEVEL }: { n: number; max?: number }) {
  return (
    <span className="mp-pips" aria-label={t('ui.skillup.level', { n })}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < n ? 'on' : ''} />
      ))}
    </span>
  );
}

function SkillRow({ sk, scrolls, gold, locked, canChange }: { sk: SkillDef; scrolls: number; gold: number; locked: boolean; canChange: boolean }) {
  const method = useUI((s) => s.method);
  const lv = method?.lv[sk.id] ?? 1;
  const vr = method?.vr[sk.id];
  const cost = skillUpgradeCost(lv + 1);
  const can = !!cost && scrolls >= cost.scrolls && gold >= cost.gold;
  const vars = VARIANTS[sk.id];
  const g = Game.current;
  return (
    <div className={'mp-skill' + (locked ? ' locked' : '')} data-ult={sk.ult ? '1' : undefined}>
      <div className="mp-skill-head">
        <Slot size="s" rarity={sk.ult ? 4 : 1} icon={<ContentIcon def={sk} />} label={t(`skill.${sk.id}.name`)} disabled={locked} />
        <div className="mp-skill-main">
          <div className="mp-skill-name">
            {t(`skill.${sk.id}.name`)} <Pips n={lv} />
          </div>
          <div className="k-dim">{t(`skill.${sk.id}.desc`)}</div>
          {skillFacts(sk, lv, vr).length > 0 && <div className="mp-facts">{skillFacts(sk, lv, vr).join(' · ')}</div>}
        </div>
        <div className="mp-up">
          {lv >= MAX_SKILL_LEVEL ? (
            <span className="ok">{t('ui.skillup.max')}</span>
          ) : (
            <Tooltip content={<TipCard title={t('ui.skillup.title')} lines={[{ text: cost ? t('ui.skillup.cost', { n: lv + 1, scrolls: cost.scrolls, gold: cost.gold }) : '' }, { text: t('ui.skillup.have', { n: scrolls }) }]} desc={t('ui.skillup.bonus')} />}>
              <Button size="s" variant="primary" disabled={locked || !can} onClick={() => g?.send(C.SKILL_UP, { skill: sk.id, r: reqId() })}>
                {t('ui.skillup.btn')}
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
      {vars && (
        <div className="mp-vars">
          {(['a', 'b'] as const).map((id) => {
            const open = variantUnlocked(lv);
            const picked = vr === id;
            return (
              <Tooltip key={id} content={<TipCard title={t(`skill.${sk.id}.var.${id}.name`)} sub={lv >= MAX_SKILL_LEVEL ? t('ui.variant.empower') : undefined} desc={t(`skill.${sk.id}.var.${id}.desc`)} />}>
                <button
                  type="button"
                  className={'mp-var' + (picked ? ' picked' : '')}
                  disabled={locked || !open || !canChange}
                  data-var={id}
                  onClick={() => g?.send(C.SKILL_VAR, { skill: sk.id, v: id })}
                >
                  <UiIcon id={`var_${sk.id.replace('skl_', '')}_${id}`} fallback={id.toUpperCase()} className="inline" /> <b>{id.toUpperCase()}</b> {t(`skill.${sk.id}.var.${id}.name`)}
                  {picked && <i> · {t('ui.variant.picked')}</i>}
                </button>
              </Tooltip>
            );
          })}
          {!variantUnlocked(lv) && <span className="k-dim mp-var-lock">{t('ui.variant.locked')}</span>}
        </div>
      )}
    </div>
  );
}

/** Bảng Công pháp (phím K): chọn/đổi công pháp, nội tại, hai chiêu riêng, cấp chiêu và biến thức A/B. */
export function MethodPanel() {
  const char = useUI((s) => s.char);
  const method = useUI((s) => s.method);
  const inv = useUI((s) => s.inv);
  const [view, setView] = useState<string>('');
  if (!char) return null;
  const cur = method?.method ? METHOD.get(method.method) : undefined;
  const shown = METHOD.get(view) ?? cur ?? METHODS[0];
  const scrolls = inv.reduce((n, s) => (s?.id === SCROLL ? n + s.n : n), 0);
  const gold = char.gold;
  const open = char.level >= METHOD_UNLOCK_LEVEL;
  const g = Game.current;
  const bar = skillBar(cur?.id);
  const pickLabel = !cur ? t('ui.method.pick') : shown.id === cur.id ? t('ui.method.current') : t('ui.method.switch', { n: methodSwitchCost(char.level) });
  return (
    <PanelWindow title={t('ui.method.title')} sub={cur ? t(`method.${cur.id}.name`) : t('ui.method.none')} onClose={() => closePanel('method')} width={600} className="method">
      {!open && <div className="k-card bad">{t('ui.method.locked', { realm: realmName(METHOD_UNLOCK_LEVEL) })}</div>}
      {open && !cur && <div className="k-dim">{t('ui.method.pick_hint')}</div>}
      <div className="mp-cards" role="tablist">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === shown.id}
            className={'mp-card' + (m.id === shown.id ? ' sel' : '') + (m.id === cur?.id ? ' cur' : '')}
            style={{ '--mc': '#' + m.color } as CSSProperties}
            onClick={() => setView(m.id)}
          >
            <UiIcon id={`met_${m.id}`} fallback="" className="inline" />
            <span className="mp-card-name">{t(`method.${m.id}.name`)}</span>
            <span className="mp-card-role">{t(`method.${m.id}.role`)}</span>
          </button>
        ))}
      </div>
      <div className="mp-detail" style={{ '--mc': '#' + shown.color } as CSSProperties}>
        <div className="k-dim">{t(`method.${shown.id}.desc`)}</div>
        <div className="mp-passive">
          <b>{t('ui.method.passive')}</b>: {t(`method.${shown.id}.passive`)}
        </div>
        <div className="mp-pick">
          <Button variant="primary" disabled={!open || shown.id === cur?.id} onClick={() => g?.send(C.METHOD, { method: shown.id, r: reqId() })}>
            {pickLabel}
          </Button>
        </div>
      </div>
      <Divider label={t('ui.char.skills')} />
      <div className="mp-skills">
        {bar.map((sk) => (
          <SkillRow key={sk.id} sk={sk} scrolls={scrolls} gold={gold} locked={char.level < sk.unlock} canChange />
        ))}
        {!cur &&
          [SKILL.get(shown.sig), SKILL.get(shown.ult)].map(
            (sk) =>
              sk && (
                <div key={sk.id} className="mp-skill locked" data-ult={sk.ult ? '1' : undefined}>
                  <div className="mp-skill-head">
                    <Slot size="s" rarity={sk.ult ? 4 : 1} icon={<ContentIcon def={sk} />} label={t(`skill.${sk.id}.name`)} disabled />
                    <div className="mp-skill-main">
                      <div className="mp-skill-name">{t(`skill.${sk.id}.name`)}</div>
                      <div className="k-dim">{t(`skill.${sk.id}.desc`)}</div>
                    </div>
                  </div>
                </div>
              ),
          )}
      </div>
      <div className="k-dim mp-foot">{t('ui.skillup.have', { n: scrolls })}</div>
      <div className="k-dim mp-foot">{t('ui.skillup.sources')}</div>
      <div className="k-dim mp-foot">{t('ui.variant.rule', { n: VARIANT_SWITCH_COOLDOWN_SEC })}</div>
    </PanelWindow>
  );
}
