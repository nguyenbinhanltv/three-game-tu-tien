import { setActiveLevel } from '../../base/levelCtx';
import { buildTileGeometry, buildVegetation, initTerrainBuild, packGeometry, packTransfer, type PackedGeo } from './terrainBuild';

/** Worker dựng lưới ô địa hình và cây (B3): cùng hàm với luồng chính (`terrainBuild.ts`), trả mảng thuần chuyển không sao chép. */
export type TileReq =
  | { type: 'init'; level: string }
  | { type: 'tile'; id: number; tx: number; tz: number; tile: number; res: number; skirt: number }
  | { type: 'veg'; id: number; tx: number; tz: number; far: boolean };
export type TileRes = { type: 'ready' } | { type: 'tile' | 'veg'; id: number; geo: PackedGeo | null } | { type: 'error'; message: string };

const post = (m: TileRes, tr: Transferable[] = []): void => (self as unknown as Worker).postMessage(m, tr);

self.onmessage = (e: MessageEvent<TileReq>) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      setActiveLevel(m.level);
      initTerrainBuild();
      post({ type: 'ready' });
    } else if (m.type === 'tile') {
      const geo = packGeometry(buildTileGeometry(m.tx * m.tile, m.tz * m.tile, m.tile, m.res, m.skirt));
      post({ type: 'tile', id: m.id, geo }, packTransfer(geo));
    } else {
      const g = buildVegetation(m.tx, m.tz, m.far);
      const geo = g ? packGeometry(g) : null;
      post({ type: 'veg', id: m.id, geo }, geo ? packTransfer(geo) : []);
    }
  } catch (err) {
    post({ type: 'error', message: String((err as Error)?.stack ?? err) });
  }
};
