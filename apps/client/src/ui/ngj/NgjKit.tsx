import { useState } from 'react';
import { realmName, t } from '@dtl/content';
import { Cartouche, type CornerKind, NgjButton, NgjPanel, NgjSlot, NgjTipCard, NgjTooltip, OrnateBar, OrnateCorner, type RailTab, type SlotShape, TabRail } from './ngj';
import { SealNumeral, SYS_ICON_NAMES, SysIcon } from './icons';
import { setReduceMotion, useReduceMotion } from './motion';

const SHAPES: SlotShape[] = ['diamond', 'round', 'octagon'];
const MAPS = ['van_lam', 'doan_mach', 'van_hai', 'thien_khuyet', 'bac_hoang'] as const;
const CORNERS: CornerKind[] = ['star', 'moon', 'sun', 'plain', 'cloud'];
const RAIL: RailTab[] = [
  { id: 'bag', label: t('ui.ngj.rail.bag'), icon: 'bag' },
  { id: 'character', label: t('ui.ngj.rail.character'), icon: 'character' },
  { id: 'method', label: t('ui.ngj.rail.method'), icon: 'method' },
  { id: 'quest', label: t('ui.ngj.rail.quest'), icon: 'quest' },
  { id: 'settings', label: t('ui.ngj.rail.settings'), icon: 'settings' },
];

function Sec({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className="ngj-sec" data-wide={wide || undefined}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** Ô mẫu: icon hệ thống nét vàng đóng vai món đồ (kit không tải atlas). */
const item = (name: Parameters<typeof SysIcon>[0]['name']) => <SysIcon name={name} size={30} />;

/** Trang xem toàn bộ thành phần của bộ giao diện Ngọc Giản Kim Văn (`?ui=kit`): chất liệu, góc, bảng tên, nút, ô, thanh, tab, chú giải, icon, chữ triện. */
export function NgjKit() {
  const [rail, setRail] = useState('character');
  const [sel, setSel] = useState(1);
  const reduce = useReduceMotion();
  const [openKey, setOpenKey] = useState(0);
  return (
    <div className="ngj-kit">
      <header className="ngj-kit-head">
        <h1>{t('ui.ngj.title')}</h1>
        <p>{t('ui.ngj.sub')}</p>
        <div className="ngj-kit-motion">
          <NgjButton variant="ghost" onClick={() => setReduceMotion(!reduce)}>
            {reduce ? t('ui.ngj.motion.on') : t('ui.ngj.motion.off')}
          </NgjButton>
          <NgjButton variant="ghost" onClick={() => setOpenKey((k) => k + 1)}>
            {t('ui.ngj.motion.try')}
          </NgjButton>
        </div>
      </header>

      <div className="ngj-kit-grid">
        <Sec title={t('ui.ngj.sec.lacquer')}>
          <NgjPanel key={'a' + openKey} material="lacquer">
            <h3 className="ngj-kit-h3">{t('ui.ngj.sec.panel')}</h3>
            <OrnateBar value={0.72} tone="health" label={t('ui.ngj.bar.health')} text="1953 / 2700" />
            <div className="ngj-gap" />
            <OrnateBar value={0.45} tone="energy" label={t('ui.ngj.bar.energy')} text="390 / 865" />
          </NgjPanel>
        </Sec>
        <Sec title={t('ui.ngj.sec.paper')}>
          <NgjPanel key={'b' + openKey} material="paper">
            <h3 className="ngj-kit-h3">{t('ui.ngj.sec.panel')}</h3>
            <p className="ngj-kit-p">{t('ui.kit.lorem')}</p>
            <div className="ngj-kit-row">
              <NgjButton>{t('ui.ngj.btn.upgrade')}</NgjButton>
              <NgjButton variant="secondary">{t('ui.ngj.btn.confirm')}</NgjButton>
            </div>
          </NgjPanel>
        </Sec>

        <Sec title={t('ui.ngj.sec.corners')}>
          <div className="ngj-kit-row ngj-kit-corners">
            {CORNERS.map((k) => (
              <div key={k} className="ngj-kit-corner" data-kind={k}>
                <OrnateCorner kind={k} />
              </div>
            ))}
          </div>
        </Sec>

        <Sec title={t('ui.ngj.sec.cart')} wide>
          <div className="ngj-kit-col">
            {MAPS.map((m) => (
              <div className="ngj-kit-row" key={m}>
                <Cartouche map={m} title={t('ui.ngj.map.' + m)} material="paper" />
                <Cartouche map={m} title={t('ui.ngj.map.' + m)} material="lacquer" size="s" />
              </div>
            ))}
          </div>
        </Sec>

        <Sec title={t('ui.ngj.sec.btn')}>
          <div className="ngj-kit-bg dark">
            <div className="ngj-kit-row">
              <NgjButton>{t('ui.ngj.btn.upgrade')}</NgjButton>
              <NgjButton variant="secondary">{t('ui.ngj.btn.confirm')}</NgjButton>
              <NgjButton variant="ghost">{t('ui.ngj.btn.cancel')}</NgjButton>
              <NgjButton disabled>{t('ui.ngj.btn.locked')}</NgjButton>
            </div>
          </div>
        </Sec>

        <Sec title={t('ui.ngj.sec.slot')} wide>
          <div className="ngj-kit-bg dark">
            {SHAPES.map((s) => (
              <div className="ngj-kit-row" key={s}>
                <span className="ngj-kit-label">{t('ui.ngj.shape.' + s)}</span>
                <NgjSlot shape={s} empty />
                {[0, 1, 2, 3, 4].map((q) => (
                  <NgjSlot key={q} shape={s} rarity={q} icon={item(q % 2 ? 'sword' : 'stone')} label={t('ui.ngj.slot.item')} selected={s === 'diamond' && sel === q} onClick={() => setSel(q)} />
                ))}
              </div>
            ))}
            <div className="ngj-kit-row">
              <span className="ngj-kit-label">{t('ui.ngj.rail.character')}</span>
              <NgjSlot shape="diamond" rarity={3} icon={item('head')} label={t('ui.equip.head')} size="l" />
              <NgjSlot shape="round" rarity={2} icon={item('alchemy')} size="s" />
              <NgjSlot shape="octagon" rarity={4} icon={item('method')} size="l" />
            </div>
          </div>
        </Sec>

        <Sec title={t('ui.ngj.sec.bar')}>
          <div className="ngj-kit-bg dark">
            <OrnateBar value={0.85} tone="health" label={t('ui.ngj.bar.health')} text="2295 / 2700" />
            <div className="ngj-gap" />
            <OrnateBar value={0.4} tone="energy" label={t('ui.ngj.bar.energy')} text="346 / 865" />
            <div className="ngj-gap" />
            <OrnateBar value={0.2} tone="exp" label={t('ui.ngj.bar.exp')} />
          </div>
        </Sec>

        <Sec title={t('ui.ngj.sec.rail')}>
          <div className="ngj-kit-row">
            <TabRail items={RAIL} value={rail} onChange={setRail} label={t('ui.ngj.rail.label')} />
            <TabRail items={RAIL.slice(0, 3)} value={rail} onChange={setRail} label={t('ui.ngj.rail.label')} material="paper" />
          </div>
        </Sec>

        <Sec title={t('ui.ngj.sec.tip')}>
          <div className="ngj-kit-bg dark">
            <NgjTooltip
              content={
                <NgjTipCard
                  title={t('ui.ngj.tip.title')}
                  rarity={3}
                  sub={t('ui.ngj.tip.sub')}
                  lines={[
                    { name: t('ui.ngj.tip.atk'), value: '412' },
                    { name: t('ui.ngj.tip.crit'), value: '8,5%' },
                    { name: t('ui.ngj.tip.req'), value: realmName(20) },
                  ]}
                />
              }
            >
              <NgjSlot shape="diamond" rarity={3} icon={item('sword')} label={t('ui.ngj.tip.title')} size="l" />
            </NgjTooltip>
            <p className="ngj-kit-p dim">{t('ui.ngj.tip.hover')}</p>
          </div>
        </Sec>

        <Sec title={t('ui.ngj.sec.icons')} wide>
          <div className="ngj-kit-icons">
            {SYS_ICON_NAMES.map((n) => (
              <div key={n} className="ngj-kit-icon">
                <SysIcon name={n} size={32} />
                <code>{n}</code>
              </div>
            ))}
          </div>
        </Sec>

        <Sec title={t('ui.ngj.sec.seal')} wide>
          <div className="ngj-kit-bg dark">
            <div className="ngj-kit-seals">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((n) => (
                <div key={n} className="ngj-kit-seal">
                  <SealNumeral n={n} size={34} />
                  <span>{n}</span>
                </div>
              ))}
            </div>
            <div className="ngj-kit-row">
              {[1, 2, 3].map((n) => (
                <NgjPanel key={n} material="lacquer" corners={false} className="ngj-kit-plaque">
                  <SealNumeral n={n} size={30} />
                  <span className="ngj-kit-realm">{realmName(n === 1 ? 1 : n === 2 ? 16 : 20)}</span>
                </NgjPanel>
              ))}
              {[1, 2].map((n) => (
                <NgjPanel key={'c' + n} material="paper" corners={false} className="ngj-kit-plaque">
                  <span className="ngj-kit-realm">
                    {t('ui.ngj.chapter')} {n}
                  </span>
                  <SealNumeral n={n} size={30} />
                </NgjPanel>
              ))}
            </div>
            <p className="ngj-kit-p dim">{t('ui.ngj.seal.note')}</p>
          </div>
        </Sec>
      </div>
    </div>
  );
}
