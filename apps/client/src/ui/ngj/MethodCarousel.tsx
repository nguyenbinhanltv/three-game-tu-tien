import { type CSSProperties, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { METHODS, SKILL, t } from '@dtl/content';
import { ContentIcon, UiIcon } from '../ContentIcon';
import { NgjButton, NgjSlot } from './ngj';
import { SealNumeral } from './icons';
import { useReduceMotion } from './motion';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/**
 * Màn chọn công pháp dạng băng chuyền thẻ (UI-4, mockup `mock-chon-cong-phap`): thẻ đang chọn phóng to và phát sáng,
 * thẻ hai bên mờ đi, vòng tròn mảnh đồng tâm làm nền, số triện bên trái, thanh số La Mã, cột chi tiết bên phải.
 * Chỉ là lớp chọn: `onPick` gửi cùng ý định như nút ở bảng Công pháp; server vẫn quyết định.
 */
export function MethodCarousel({
  current,
  canPick,
  pickLabel,
  onPick,
  onClose,
}: {
  current?: string;
  canPick: boolean;
  pickLabel: (id: string) => string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(() =>
    Math.max(
      0,
      METHODS.findIndex((m) => m.id === current),
    ),
  );
  const reduce = useReduceMotion();
  const n = METHODS.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter' && canPick && METHODS[i]!.id !== current) onPick(METHODS[i]!.id);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  });
  const m = METHODS[i]!;
  const skills = [SKILL.get(m.sig), SKILL.get(m.ult)];
  const card = (k: number, pos: 'prev' | 'cur' | 'next') => {
    const mm = METHODS[(i + k + n) % n]!;
    return (
      <button
        key={mm.id + pos}
        type="button"
        className="ngj-car-card"
        data-pos={pos}
        aria-label={t(`method.${mm.id}.name`)}
        aria-current={pos === 'cur' || undefined}
        tabIndex={pos === 'cur' ? 0 : -1}
        style={{ '--mc': '#' + mm.color } as CSSProperties}
        onClick={() => (pos === 'prev' ? go(-1) : pos === 'next' ? go(1) : undefined)}
      >
        <span className="ngj-car-card-emblem">
          <UiIcon id={`met_${mm.id}`} fallback="" className="ngj-car-ico" />
        </span>
        <span className="ngj-car-card-name">{t(`method.${mm.id}.name`)}</span>
        <span className="ngj-car-card-role">{t(`method.${mm.id}.role`)}</span>
        {mm.id === current && <span className="ngj-car-tag">{t('ui.method.current')}</span>}
      </button>
    );
  };
  return createPortal(
    <div
      className="ngj-car"
      data-still={reduce || undefined}
      role="dialog"
      aria-label={t('ui.ngj.car.title')}
      style={{ '--mc': '#' + m.color } as CSSProperties}
    >
      <div className="ngj-car-rings" aria-hidden="true">
        <i /> <i /> <i /> <i />
      </div>
      <div className="ngj-car-title">
        <span>{t('ui.ngj.car.title')}</span>
      </div>
      <button type="button" className="ngj-car-close" onClick={onClose} aria-label={t('ui.close')}>
        ×
      </button>
      <div className="ngj-car-seal" aria-hidden="true">
        <SealNumeral n={i + 1} size={46} />
      </div>
      <div className="ngj-car-rail" role="tablist" aria-label={t('ui.ngj.car.title')}>
        {METHODS.map((mm, k) => (
          <button key={mm.id} type="button" role="tab" aria-selected={k === i} className="ngj-car-roman" onClick={() => setI(k)}>
            {ROMAN[k] ?? k + 1}
          </button>
        ))}
      </div>
      <div className="ngj-car-stage">
        <button type="button" className="ngj-car-arrow" aria-label="‹" onClick={() => go(-1)}>
          ‹
        </button>
        {card(-1, 'prev')}
        {card(0, 'cur')}
        {card(1, 'next')}
        <button type="button" className="ngj-car-arrow" aria-label="›" onClick={() => go(1)}>
          ›
        </button>
      </div>
      <aside className="ngj-car-info">
        <h3>{t(`method.${m.id}.name`)}</h3>
        <div className="ngj-car-role">{t(`method.${m.id}.role`)}</div>
        <p>{t(`method.${m.id}.desc`)}</p>
        <p className="ngj-car-passive">
          <b>{t('ui.method.passive')}</b>: {t(`method.${m.id}.passive`)}
        </p>
        <div className="ngj-car-skills">
          {skills.map(
            (sk) =>
              sk && (
                <div key={sk.id} className="ngj-car-skill">
                  <NgjSlot
                    shape="octagon"
                    size="s"
                    rarity={sk.ult ? 4 : 1}
                    icon={<ContentIcon def={sk} />}
                    label={t(`skill.${sk.id}.name`)}
                  />
                  <span>{t(`skill.${sk.id}.name`)}</span>
                </div>
              ),
          )}
        </div>
        <NgjButton disabled={!canPick || m.id === current} onClick={() => onPick(m.id)}>
          {pickLabel(m.id)}
        </NgjButton>
      </aside>
      <div className="ngj-car-hint">{t('ui.ngj.car.hint')}</div>
    </div>,
    document.body,
  );
}
