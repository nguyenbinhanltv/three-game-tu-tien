import { spatialAmbientBuffer, spatialBuffer, spatialLoop, spatialPartials, spatialReady } from './audio';
import { makeCrackle, type SpatialApi, templeBellPartials } from './soundscape';

/** Nối `Soundscape` với Web Audio của audio.ts: lách tách dựng bằng code, nước lấy từ âm môi trường `water` trong manifest, chuông chùa tổng hợp. */
export function audioSpatialApi(): SpatialApi {
  return {
    ready: spatialReady,
    async loop(kind, x, z, o, rate) {
      const buf = kind === 'crackle' ? spatialBuffer('crackle', (sr) => makeCrackle(sr)) : await spatialAmbientBuffer('water');
      return buf ? spatialLoop(buf, 'ambient', x, z, o, rate) : null;
    },
    bell: (x, z, o, volume) => spatialPartials(templeBellPartials(), 'ambient', x, z, o, volume),
  };
}
