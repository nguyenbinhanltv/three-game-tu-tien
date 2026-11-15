import { useState } from 'react';
import { ITEM, itemName, t } from '@dtl/content';
import { ContentIcon } from '../ContentIcon';
import { Button, Divider, Header, Modal, Panel, PanelBody, ProgressBar, Segmented, Slider, Slot, Tabs, TipCard, Tooltip } from './index';

const SAMPLE = ['itm_linh_thao', 'itm_huyet_linh_chi', 'itm_kiem_phach', 'itm_han_giao_dan'];
const TAB_IDS = ['bag', 'equip', 'pill'];

/** Trang xem thử bộ khung UI (`?viewer=ui`): mọi thành phần, mọi trạng thái, ba tông nền. Dùng để kiểm bằng mắt. */
export function KitViewer() {
  const [tab, setTab] = useState('bag');
  const [seg, setSeg] = useState('mid');
  const [vol, setVol] = useState(60);
  const [modal, setModal] = useState(false);
  const [sel, setSel] = useState(1);
  const tabs = TAB_IDS.map((id) => ({
    id,
    label: t('ui.kit.tab.' + id),
    badge: id === 'pill' ? 3 : undefined,
  }));
  return (
    <div className="kit-view">
      <h1 className="kit-view-title">{t('ui.kit.title')}</h1>
      <div className="kit-view-grid">
        <Panel>
          <Header title={t('ui.kit.sec.panel')} sub={t('ui.kit.sub.night')} onClose={() => undefined} />
          <PanelBody>
            <Tabs items={tabs} value={tab} onChange={setTab} label={t('ui.kit.sec.tabs')} />
            <p className="k-dim">{t('ui.kit.lorem')}</p>
            <Divider />
            <Divider label={t('ui.kit.sec.divider')} />
            <Segmented
              label={t('ui.kit.sec.seg')}
              value={seg}
              onChange={setSeg}
              options={['low', 'mid', 'high'].map((v) => ({
                value: v,
                label: t('ui.kit.seg.' + v),
              }))}
            />
            <Slider label={t('ui.kit.slider')} value={vol} onChange={setVol} step={5} format={(n) => n + '%'} />
          </PanelBody>
        </Panel>

        <Panel tone="paper">
          <Header title={t('ui.kit.sec.panel')} sub={t('ui.kit.sub.paper')} />
          <PanelBody>
            <p className="k-dim">{t('ui.kit.lorem')}</p>
            <Divider label={t('ui.kit.sec.divider')} />
            <Tabs items={tabs} value={tab} onChange={setTab} />
            <div className="kit-row">
              <Button variant="primary">{t('ui.kit.btn.primary')}</Button>
              <Button>{t('ui.kit.btn.secondary')}</Button>
              <Button variant="danger">{t('ui.kit.btn.danger')}</Button>
            </div>
          </PanelBody>
        </Panel>

        <Panel tone="stone" size="s">
          <Header title={t('ui.kit.sec.panel')} sub={t('ui.kit.sub.stone')} />
          <PanelBody>
            <p className="k-dim">{t('ui.kit.lorem')}</p>
            <div className="kit-row">
              <Button size="s">{t('ui.kit.btn.small')}</Button>
              <Button>{t('ui.kit.btn.secondary')}</Button>
              <Button size="l" variant="primary">
                {t('ui.kit.btn.large')}
              </Button>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <Header title={t('ui.kit.sec.buttons')} />
          <PanelBody>
            <div className="kit-row">
              <Button variant="primary">{t('ui.kit.btn.primary')}</Button>
              <Button>{t('ui.kit.btn.secondary')}</Button>
              <Button variant="ghost">{t('ui.kit.btn.ghost')}</Button>
              <Button variant="danger">{t('ui.kit.btn.danger')}</Button>
            </div>
            <div className="kit-row">
              <Button pressed>{t('ui.kit.btn.pressed')}</Button>
              <Button disabled>{t('ui.kit.btn.disabled')}</Button>
              <Button variant="primary" disabled>
                {t('ui.kit.btn.disabled')}
              </Button>
              <Button autoFocus>{t('ui.kit.btn.focus')}</Button>
            </div>
            <p className="k-dim">{t('ui.kit.hint.keys')}</p>
          </PanelBody>
        </Panel>

        <Panel>
          <Header title={t('ui.kit.sec.slots')} />
          <PanelBody>
            <div className="kit-row">
              {SAMPLE.map((id, i) => {
                const def = ITEM.get(id)!;
                return (
                  <Tooltip
                    key={id}
                    content={
                      <TipCard title={itemName(id)} rarity={def.rarity} sub={t('ui.item.kind.' + def.kind)} lines={[{ text: t('ui.kit.tip.line'), tone: 'good' }]} desc={t(`item.${id}.desc`)} />
                    }
                  >
                    <Slot
                      icon={<ContentIcon def={def} />}
                      rarity={def.rarity}
                      count={i === 0 ? 12 : undefined}
                      plus={i === 3 ? 4 : undefined}
                      selected={sel === i}
                      onClick={() => setSel(i)}
                      label={itemName(id)}
                      size="l"
                    />
                  </Tooltip>
                );
              })}
              <Slot empty size="l" />
            </div>
            <div className="kit-row">
              {SAMPLE.map((id, i) => {
                const def = ITEM.get(id)!;
                return <Slot key={id} icon={<ContentIcon def={def} />} rarity={def.rarity} count={i === 0 ? 7 : undefined} label={itemName(id)} />;
              })}
              <Slot empty />
              <Slot size="s" icon={<ContentIcon def={ITEM.get(SAMPLE[1])!} />} rarity={1} label={itemName(SAMPLE[1])} />
            </div>
            <p className="k-dim">{t('ui.kit.hint.slots')}</p>
          </PanelBody>
        </Panel>

        <Panel>
          <Header title={t('ui.kit.sec.bars')} />
          <PanelBody>
            <ProgressBar cls="hp" value={86} max={120} text="86 / 120" segs={4} trail label={t('ui.kit.bar.hp')} />
            <ProgressBar cls="mp" value={50} max={80} text="50 / 80" segs={4} label={t('ui.kit.bar.mp')} />
            <ProgressBar cls="xp" value={30} max={70} text={t('ui.kit.bar.xp')} label={t('ui.kit.bar.xp')} />
            <ProgressBar cls="hp boss" value={640} max={1000} text="640 / 1000" segs={10} label={t('ui.kit.bar.boss')} />
            <Button onClick={() => setModal(true)}>{t('ui.kit.open_modal')}</Button>
          </PanelBody>
        </Panel>
      </div>
      <Modal
        open={modal}
        title={t('ui.kit.modal.title')}
        onClose={() => setModal(false)}
        actions={
          <>
            <Button onClick={() => setModal(false)}>{t('ui.kit.modal.cancel')}</Button>
            <Button variant="primary" onClick={() => setModal(false)}>
              {t('ui.kit.modal.ok')}
            </Button>
          </>
        }
      >
        <p className="k-dim">{t('ui.kit.modal.body')}</p>
      </Modal>
    </div>
  );
}
