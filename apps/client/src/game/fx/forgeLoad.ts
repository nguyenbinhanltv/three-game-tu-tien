import type * as THREE from 'three/webgpu';
import { assetBaseUrl, createKtx2Loader, detectKtx2Support } from '../core/assets';
import { forgeTexIds, setForgeTexture } from '../../render/vfx/forgeTex';
import { logger } from '../../base/log';

const log = logger('forge-tex');

/**
 * Nạp texture Họa Pháp Lô 2 (KTX2 ở `assets/vfx/<id>.ktx2`) ở nền sau khi có renderer. Không chặn vào game: texture về lúc nào lớp vẽ
 * hiện lúc đó (xem `render/vfx/forgeTex.ts`). Lỗi từng file chỉ ghi cảnh báo.
 */
export async function loadForgeTextures(renderer: THREE.WebGPURenderer): Promise<void> {
  const ktx2 = createKtx2Loader();
  try {
    await detectKtx2Support(ktx2, renderer);
    await Promise.all(
      forgeTexIds().map(async (id) => {
        try {
          setForgeTexture(id, await ktx2.loadAsync(`${assetBaseUrl()}vfx/${id}.ktx2`));
        } catch (e) {
          log.warn(`không nạp được texture VFX ${id}`, e);
        }
      }),
    );
  } finally {
    ktx2.dispose();
  }
}
