import { useState } from 'react';
import { t } from '@dtl/content';
import { ContentIcon } from '../ContentIcon';
import {
  Badge,
  Bar,
  Button,
  CloudScroll,
  CornerCloud,
  Dialog,
  IconFrame,
  InkBanner,
  InkStroke,
  JadeRing,
  LockMark,
  Panel,
  SkillButton,
  Slot,
  SonSeal,
  Tabs,
  Toasts,
  Tooltip,
  WaveLine,
  type ToastItem,
} from './index';
import './viewer.css';

const ITEMS = ['itm_linh_thao', 'itm_huyet_linh_chi', 'itm_yeu_dan', 'itm_thiet_tinh', 'itm_nanh_soi'];
const SKILLS = ['skl_kiem_khi_tram', 'skl_phi_kiem', 'skl_linh_khi_ho_the', 'skl_thien_kiem_vu'];
const TOKENS: Array<[string, string]> = [
  ['ink-0', 'ink'],
  ['ink-1', 'ink'],
  ['ink-2', 'ink'],
  ['ink-3', 'ink'],
  ['gold-hi', 'kim'],
  ['gold', 'kim'],
  ['gold-lo', 'kim'],
  ['son-hi', 'son'],
  ['son', 'son'],
  ['son-lo', 'son'],
  ['ngoc-hi', 'ngọc'],
  ['ngoc', 'ngọc'],
  ['ngoc-lo', 'ngọc'],
  ['cel-0', 'celadon'],
  ['cel-1', 'celadon'],
  ['cel-2', 'celadon'],
  ['cel-3', 'celadon'],
  ['giay', 'giấy'],
  ['giay-lo', 'giấy'],
  ['giay-sau', 'giấy'],
  ['q0', 'phẩm'],
  ['q1', 'phẩm'],
  ['q2', 'phẩm'],
  ['q3', 'phẩm'],
  ['q4', 'phẩm'],
  ['q5', 'phẩm'],
];

function Sec({ id, wide, children }: { id: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className="u2v-sec" data-wide={wide ? '1' : undefined}>
      <h2>{t('ui.u2v.sec.' + id)}</h2>
      {children}
    </section>
  );
}

/** Trang xem UI Kit 2.0 (`?ui=kit`): token, chữ, họa tiết, mọi thành phần và trạng thái của chúng. */
export function U2Kit() {
  const [tab, setTab] = useState('all');
  const [dialog, setDialog] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [sel, setSel] = useState(1);
  const [enter, setEnter] = useState(0);
  const tabs = ['all', 'gear', 'pill', 'mat'].map((id) => ({ id, label: t('ui.u2v.tab.' + id) }));
  const icon = (i: number) => <ContentIcon def={{ icon: ITEMS[i % ITEMS.length]! }} />;
  const toast = (tone?: 'ok' | 'bad') => {
    const id = Date.now();
    setToasts((l) => [...l, { id, text: t('ui.u2v.toast.' + (tone ?? 'info')), tone }]);
    window.setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 2600);
  };

  return (
    <div className="u2 u2v">
      <header className="u2v-head">
        <h1>{t('ui.u2v.title')}</h1>
        <p>{t('ui.u2v.sub')}</p>
      </header>

      <div className="u2v-grid">
        <Sec id="color" wide>
          <div className="u2v-swatches">
            {TOKENS.map(([n, g]) => (
              <div key={n} className="u2v-sw" data-g={g}>
                <span style={{ background: `var(--u-${n})` }} />
                <code>--u-{n}</code>
              </div>
            ))}
          </div>
        </Sec>

        <Sec id="font">
          <div className="u2v-type">
            <div className="u2v-display">{t('ui.u2v.font.display')}</div>
            <div className="u2v-head2">{t('ui.u2v.font.head')}</div>
            <p className="u2v-body">{t('ui.u2v.font.body')}</p>
            <p className="u2v-body">
              <em>{t('ui.u2v.font.italic')}</em>
            </p>
            <p className="u2v-num">1 234 567 · 0123456789 · 3.508 / 4.410</p>
          </div>
        </Sec>

        <Sec id="pattern">
          <div className="u2v-pat">
            <span className="u2v-box">
              <CornerCloud />
            </span>
            <span className="u2v-box wide">
              <CloudScroll />
            </span>
            <span className="u2v-box wide">
              <WaveLine />
            </span>
            <span className="u2v-box wide ink">
              <InkStroke variant={0} />
            </span>
            <span className="u2v-box wide ink">
              <InkStroke variant={1} />
            </span>
            <span className="u2v-box wide ink">
              <InkStroke variant={2} />
            </span>
            <span className="u2v-box seal">
              <SonSeal />
            </span>
            <span className="u2v-box">
              <LockMark />
            </span>
          </div>
        </Sec>

        <Sec id="panel" wide>
          <div className="u2v-row">
            <div className="u2v-panelbox">
              <Panel title={t('ui.u2v.panel.title')} onClose={() => undefined}>
                <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('ui.u2v.sec.tabs')} />
                <p>{t('ui.u2v.panel.body')}</p>
                <div className="u2v-row">
                  <Badge>{t('ui.u2v.badge.son')}</Badge>
                  <Badge tone="ngoc">{t('ui.u2v.badge.ngoc')}</Badge>
                </div>
              </Panel>
            </div>
            <div className="u2v-panelbox">
              <Panel tone="ink">
                <p>{t('ui.u2v.panel.ink')}</p>
                <div className="u2v-bars">
                  <Bar kind="hp" value={494} max={494} text="494 / 494" label={t('ui.u2v.bar.hp')} />
                  <Bar kind="mp" value={150} max={234} text="150 / 234" label={t('ui.u2v.bar.mp')} />
                  <Bar kind="xp" value={4410} max={12960} text="4.410 / 12.960" label={t('ui.u2v.bar.xp')} />
                </div>
              </Panel>
            </div>
          </div>
        </Sec>

        <Sec id="button">
          <div className="u2v-row">
            <Button>{t('ui.u2v.btn.main')}</Button>
            <Button kind="ngoc">{t('ui.u2v.btn.sub')}</Button>
            <Button kind="khoa">{t('ui.u2v.btn.lock')}</Button>
            <Button size="s">{t('ui.u2v.btn.small')}</Button>
          </div>
          <div className="u2v-row">
            <Button force="hover">{t('ui.u2v.state.hover')}</Button>
            <Button force="active">{t('ui.u2v.state.active')}</Button>
            <Button disabled>{t('ui.u2v.state.disabled')}</Button>
          </div>
        </Sec>

        <Sec id="badge">
          <div className="u2v-row">
            <Badge>{t('ui.u2v.badge.son')}</Badge>
            <Badge tone="ngoc">{t('ui.u2v.badge.ngoc')}</Badge>
            <Badge tone="kim">{t('ui.u2v.badge.kim')}</Badge>
            <Badge tone="lam">{t('ui.u2v.badge.lam')}</Badge>
            <Badge tone="xam">{t('ui.u2v.badge.xam')}</Badge>
          </div>
        </Sec>

        <Sec id="bar">
          <div className="u2v-bars on-ink">
            <Bar kind="hp" value={494} max={494} text="494 / 494" label={t('ui.u2v.bar.hp')} />
            <Bar kind="hp" value={120} max={494} text="120 / 494" label={t('ui.u2v.bar.hp')} />
            <Bar kind="mp" value={150} max={234} text="150 / 234" label={t('ui.u2v.bar.mp')} />
            <Bar kind="xp" value={4410} max={12960} text="4.410 / 12.960" label={t('ui.u2v.bar.xp')} />
            <Bar kind="boss" value={71200} max={98800} text="71.200 / 98.800" label={t('ui.u2v.bar.boss')} />
          </div>
        </Sec>

        <Sec id="slot">
          <div className="u2v-row on-giay">
            {[0, 1, 2, 3, 4, 5].map((q) => (
              <Slot
                key={q}
                rarity={q}
                icon={icon(q)}
                count={q === 1 ? 12 : undefined}
                plus={q === 4 ? 7 : undefined}
                on="light"
                label={t('ui.u2v.slot.item')}
              />
            ))}
            <Slot empty on="light" />
            <Slot rarity={3} icon={icon(2)} locked on="light" label={t('ui.u2v.slot.item')} />
          </div>
          <div className="u2v-row on-ink">
            {[0, 1, 2, 3, 4, 5].map((q) => (
              <Slot
                key={q}
                rarity={q}
                icon={icon(q + 1)}
                selected={sel === q}
                onClick={() => setSel(q)}
                count={q * 3 + 2}
                label={t('ui.u2v.slot.item')}
              />
            ))}
            <Slot size="s" rarity={2} icon={icon(0)} label={t('ui.u2v.slot.item')} />
            <Slot size="l" rarity={4} icon={icon(3)} label={t('ui.u2v.slot.item')} />
            <IconFrame rarity={1}>{icon(4)}</IconFrame>
          </div>
        </Sec>

        <Sec id="skill">
          <div className="u2v-row on-ink">
            {SKILLS.map((s, i) => (
              <SkillButton
                key={s}
                icon={<ContentIcon def={{ icon: s }} />}
                keyLabel={String(i + 1)}
                cooldown={[0, 0.65, 0.3, 0][i]}
                cdText={['', '12', '5', ''][i]}
                active={i === 0}
                locked={i === 3}
                label={t('ui.u2v.slot.skill')}
              />
            ))}
          </div>
          <div className="u2v-row on-cel">
            <InkBanner enter key={enter}>
              {t('ui.u2v.ink')}
            </InkBanner>
            <InkBanner variant={1}>{t('ui.u2v.ink2')}</InkBanner>
            <InkBanner variant={2}>{t('ui.u2v.ink3')}</InkBanner>
            <Button size="s" kind="ngoc" onClick={() => setEnter((n) => n + 1)}>
              {t('ui.u2v.replay')}
            </Button>
          </div>
        </Sec>

        <Sec id="tip">
          <div className="u2v-row u2v-tiprow">
            <Tooltip open rarity={3} title={t('ui.u2v.tip.title')} sub={t('ui.u2v.tip.sub')} tip={<p>{t('ui.u2v.tip.body')}</p>}>
              <Slot rarity={3} icon={icon(2)} label={t('ui.u2v.slot.item')} />
            </Tooltip>
          </div>
        </Sec>

        <Sec id="overlay">
          <div className="u2v-row">
            <Button onClick={() => setDialog(true)}>{t('ui.u2v.dialog.open')}</Button>
            <Button kind="ngoc" onClick={() => toast('ok')}>
              {t('ui.u2v.toast.open')}
            </Button>
            <Button kind="ngoc" onClick={() => toast('bad')}>
              {t('ui.u2v.toast.openBad')}
            </Button>
          </div>
          <div className="u2v-row on-ink">
            <div className="u2v-portrait">
              <JadeRing />
              <span className="u2v-pimg" />
            </div>
            <div className="u2v-portrait">
              <JadeRing tone="kim" />
              <span className="u2v-pimg" />
            </div>
            <div className="u2v-portrait">
              <JadeRing tone="son" />
              <span className="u2v-pimg" />
            </div>
          </div>
        </Sec>
      </div>

      {dialog && (
        <Dialog title={t('ui.u2v.dialog.title')} onConfirm={() => setDialog(false)} onCancel={() => setDialog(false)}>
          {t('ui.u2v.dialog.body')}
        </Dialog>
      )}
      <Toasts items={toasts} />
    </div>
  );
}
