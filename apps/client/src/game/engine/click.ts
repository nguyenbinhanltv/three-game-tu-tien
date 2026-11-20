// Chọn mục tiêu bằng con trỏ/chạm (module lá: `input.ts` và `touch.ts` cùng dùng, không import nhau ngược).
import { C } from '@dtl/shared';
import { t } from '@dtl/content';
import { pushToast } from '../../ui/store';
import type { Game } from '../engine';

export function onClick(eng: Game, x: number, y: number, aim?: number): void {
  const hit = eng.ents.pick(x, y, window.innerWidth, window.innerHeight, eng.camera, aim);
  if (!hit) return;
  if (hit.kind === 'npc') {
    const n = eng.ents.npcs.find((e) => e.id === hit.id)!;
    eng.setTarget(hit.id, 'npc');
    if (Math.hypot(n.x - eng.cur.x, n.z - eng.cur.z) < 8) eng.openNpc(hit.id);
    else pushToast(t('sys.too_far'), 'bad');
  } else if (hit.kind === 'node') {
    eng.send(C.GATHER, { id: hit.id });
  } else {
    if (hit.kind === 'mon' && hit.id === eng.targetId) eng.useSkill(0);
    else eng.setTarget(hit.id, hit.kind);
  }
}
