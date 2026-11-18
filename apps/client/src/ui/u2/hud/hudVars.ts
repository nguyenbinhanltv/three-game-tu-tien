import { type CSSProperties, useEffect, useState } from 'react';
import { uiScale } from '../../uiScale';
import { useTouchMode } from '../../../input/touchMode';
import {
  BOSS_H,
  BOSS_MAX_W,
  designArea,
  hudBoxes,
  modeOf,
  QUEST_COLLAPSED_H,
  SAFE,
  SIZES,
  UTILITY,
  type HudMode,
  type HudOpts,
} from './layout';

/** Chế độ HUD đang dùng (compact khi hệ số UI < 0,95): đổi khi `ui/uiScale.ts` áp hệ số mới. */
export function useHudMode(): HudMode {
  const touch = useTouchMode();
  const [mode, setMode] = useState<HudMode>(() => modeOf(uiScale(), touch));
  useEffect(() => {
    const on = () => setMode(modeOf(uiScale(), touch));
    window.addEventListener('dtl:uiscale', on);
    on();
    return () => window.removeEventListener('dtl:uiscale', on);
  }, [touch]);
  return mode;
}

/**
 * Biến CSS bố cục lấy từ `layout.ts` (nguồn duy nhất của số đo), ghi lên `.hud`: hud.css chỉ đọc `var(--h-*)`.
 * Đơn vị thiết kế (px trước khi nhân `zoom: var(--ui-scale)`).
 */
export function hudVars(mode: HudMode, o: HudOpts = {}): CSSProperties {
  if (mode === 'touch') return {}; // bố cục cảm ứng nằm hết trong `u2/touch/touch.css`
  const m = mode;
  const z = SIZES[m];
  const b = hudBoxes(1920, 1080, m, o);
  // Chat theo kích thước người chơi kéo, kẹp theo vùng thiết kế hiện tại (không đè cụm kỹ năng).
  const area = designArea(window.innerWidth, window.innerHeight, uiScale());
  const chat = hudBoxes(area.W, area.H, m, o).chat;
  const v: Record<string, string> = {
    '--h-safe': SAFE + 'px',
    '--h-tl-w': z.tl.w + 'px',
    '--h-tl-h': z.tl.h + 'px',
    '--h-hub-w': z.hubW + 'px',
    '--h-hub-h': z.hubH + 'px',
    '--h-map-w': z.mapW + 'px',
    '--h-quest-w': z.questW + 'px',
    '--h-quest-h': (o.questCollapsed ? QUEST_COLLAPSED_H : z.questH) + 'px',
    '--h-chat-w': chat.w + 'px',
    '--h-chat-h': chat.h + 'px',
    '--h-boss-max': BOSS_MAX_W + 'px',
    '--h-boss-h': BOSS_H + 'px',
    '--h-side': Math.max(z.tl.w, z.hubW) + 'px',
    '--h-skills-w': b.skills.w + 'px',
    '--h-skills-h': b.skills.h + 'px',
    '--h-util-w': UTILITY.w + 'px',
    '--h-util-h': UTILITY.h + 'px',
  };
  return v as CSSProperties;
}
