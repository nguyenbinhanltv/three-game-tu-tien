// Phân kênh cho tin hệ thống (U2-7b): khóa i18n `sys.*` thuộc chiến đấu vào tab Chiến đấu, còn lại vào tab Hệ thống.
import type { ChatChannel } from '../../store';

/** Tiền tố khóa (sau `sys.`) của tin chiến đấu: chết/hồi sinh, chiêu chưa dùng được, niệm chú bị ngắt, khống chế, boss. */
const COMBAT = [
  'died',
  'dead',
  'respawned',
  'revived',
  'out_of_range',
  'no_target',
  'cooldown',
  'not_enough_mp',
  'cast_cancel',
  'chant',
  'pull_',
  'posture',
  'taunted',
  'ult_',
  'no_ally',
  'boss_',
  'dash_',
  'cannot_while',
  'tele_combat',
  'kd_',
  'xt_vein_hit',
] as const;

export function sysChannel(key: string): ChatChannel {
  const k = key.startsWith('sys.') ? key.slice(4) : key;
  return COMBAT.some((p) => k.startsWith(p)) ? 'combat' : 'system';
}
