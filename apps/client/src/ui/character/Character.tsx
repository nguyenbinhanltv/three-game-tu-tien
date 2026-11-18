import { useState } from 'react';
import { realmName, t } from '@dtl/content';
import { type RailTab, TabRail } from '../ngj';
import { closePanel, useUI } from '../store';
import { Window } from '../windows/common';
import { Attributes } from './Attributes';
import { Overview } from './Overview';
import { SetTrain } from './SetTrain';
import { charPower } from './stats';
import './character.css';

type TabId = 'overview' | 'attrs' | 'settrain';
const RAIL: (Omit<RailTab, 'label'> & { id: TabId })[] = [
  { id: 'overview', icon: 'character' },
  { id: 'attrs', icon: 'stone' },
  { id: 'settrain', icon: 'forge' },
];

/** Bảng nhân vật (TD-C): ba tab Tổng quan / Thuộc tính / Bộ & tu luyện; tiêu đề có Lực chiến. */
export function Character() {
  const char = useUI((s) => s.char);
  const equip = useUI((s) => s.equip);
  const [tab, setTab] = useState<TabId>('overview');
  if (!char) return null;
  const power = charPower(char.level, equip, char.root, char);
  const body = (
    <>
      {tab === 'overview' && <Overview />}
      {tab === 'attrs' && <Attributes />}
      {tab === 'settrain' && <SetTrain />}
    </>
  );
  return (
    <Window
      title={char.name}
      sub={`${realmName(char.level)} · ${t('ui.char.power')} ${power.toLocaleString('vi-VN')}`}
      onClose={() => closePanel('char')}
      cls="char"
      width={560}
    >
      <div className="ngj-char">
        <TabRail label={t('ui.char.tabs')} material="paper" value={tab} onChange={(id) => setTab(id as TabId)} items={RAIL.map((r) => ({ ...r, label: t('ui.char.tab.' + r.id) }))} />
        <div className="ngj-char-body">{body}</div>
      </div>
    </Window>
  );
}
