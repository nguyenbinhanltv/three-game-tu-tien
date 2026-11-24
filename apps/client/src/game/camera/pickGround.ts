import { bridgeSurfaceT, bridgeModel, cauTreoDeckY, VAN_LAM } from '@dtl/shared';
import { groundAt, levelId } from '../../base/levelCtx';

let bridge: ReturnType<typeof bridgeModel> | null = null;
/** Cao hơn mặt đất ít nhất chừng này (m) mới coi là đang đứng trên ván cầu (đi dưới đáy hác thì vẫn chọn đất). */
const ON_DECK_ABOVE = 2;

/**
 * Hàm "mặt để chọn" cho tia chuột (chuột phải đi tới, ngắm chiêu): mặt đất, và khi người đang đứng TRÊN ván cầu treo Lạc Kiếm thì cả mặt cầu.
 * Không có nó, tia xuyên qua ván trúng đáy hác/bờ xa và nhân vật đi sai hướng. Chỉ client (ý định); server vẫn tự quyết vị trí.
 */
export function pickGround(player: { x: number; y: number; z: number }): (x: number, z: number) => number {
  if (levelId() !== 'van_lam' || player.y < groundAt(player.x, player.z) + ON_DECK_ABOVE) return groundAt;
  bridge ??= bridgeModel(VAN_LAM.groundAt);
  const m = bridge;
  if (bridgeSurfaceT(m, player.x, player.z, 1) === null) return groundAt;
  return (x, z) => {
    const g = groundAt(x, z);
    const t = bridgeSurfaceT(m, x, z, 0);
    if (t === null) return g;
    const d = cauTreoDeckY(m, t);
    return d > g ? d : g;
  };
}
