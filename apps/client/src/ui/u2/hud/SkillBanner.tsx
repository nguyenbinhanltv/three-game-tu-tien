import { useEffect, useState } from 'react';
import { hasString, t } from '@dtl/content';
import { Game } from '../../../game/engine';
import { useUI } from '../../store';
import { InkBanner } from '../index';

const SHOW_MS = 1300;

/**
 * Dải tên chiêu vệt mực giữa-dưới màn hình: hiện khi MÌNH bắt đầu một chiêu có tên (sự kiện `windup` của animation), chạy vệt quét
 * 400 ms rồi tan. Ba biến thể vệt mực luân phiên. Chỉ là lớp hiển thị, không nhận chuột.
 */
export function SkillBanner() {
  const phase = useUI((s) => s.phase);
  const [cur, setCur] = useState<{ id: number; skill: string; variant: number } | null>(null);
  useEffect(() => {
    const g = Game.current;
    if (phase !== 'game' || !g) return;
    let n = 0;
    let timer = 0;
    const off = g.onSkillEvent((sid, e) => {
      // Đòn đánh thường liên hoàn không hiện tên (sẽ nhấp nháy liên tục); chỉ chiêu có tên riêng.
      if (sid !== g.sid || e.kind !== 'windup' || !e.skill || e.combo >= 0 || !hasString(`skill.${e.skill}.name`)) return;
      n += 1;
      setCur({ id: n, skill: e.skill, variant: n % 3 });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCur(null), SHOW_MS);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [phase]);
  if (!cur) return null;
  return (
    <div className="u2h-zone u2h-banner" aria-hidden="true" key={cur.id}>
      <InkBanner enter variant={cur.variant}>
        {t(`skill.${cur.skill}.name`)}
      </InkBanner>
    </div>
  );
}
