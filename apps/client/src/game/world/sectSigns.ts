import * as THREE from 'three/webgpu';
import { calliOf } from '../../base/calli';
import { logger } from '../../base/log';
import { createWorldMaterial } from '../../render/materials/world';

const log = logger('sectSigns');

/**
 * Biển hiệu và hoành phi của Lạc Kiếm Tông bằng chữ thư pháp (tools/calli, nhóm `sign`). Chữ khối của `arch_sect` (Blender) vẫn nằm trong GLB;
 * mỗi biển là một tấm phẳng phủ kín biển gốc (tấm gỗ sơn son viền vàng + chữ, vẽ sẵn trong ảnh), đặt cách mặt chữ khối ~3 cm nên nhìn từ mọi góc
 * chữ khối không lộ ra. Tọa độ theo hệ của GLB (gốc = tâm tông môn), khớp `tools/blender/thien_cong_kit.py` (`cong_tam_quan`, `hoanh_phi`) và
 * `thien_cong_sect.py` (đặt ở (0,0,80) và (0,8.7,-35.2)). Thiếu ảnh/ảnh cũ so với i18n (`calliOf`) thì bỏ qua, giữ chữ khối gốc.
 * Mỗi biển 1 draw call; ảnh PNG palette (không có toktx nên chưa KTX2), nạp một lần dùng chung cho cảnh game và nền màn tiêu đề.
 */
const SIGNS = [
  { key: 'ui.sign.lac_kiem_tong', w: 6.8, h: 1.9, x: 0, y: 7.2, z: 80 + 0.37 }, // biển cổng tam quan
  { key: 'ui.sign.thien_kiem_dien', w: 5.8, h: 1.3, x: 0, y: 8.7, z: -35.2 + 0.27 }, // hoành phi chính điện
] as const;

const cache = new Map<string, THREE.Texture>();
function textureOf(file: string): THREE.Texture {
  let tex = cache.get(file);
  if (!tex) {
    tex = new THREE.TextureLoader().load(`/assets/calli/${file}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    cache.set(file, tex);
  }
  return tex;
}

/**
 * Gắn các tấm biển vào gốc GLB `arch_sect`. Trả các vật liệu mới để chủ cảnh `dispose()` cùng vật liệu GLB.
 * Vật liệu cùng loại với kiến trúc (`createWorldMaterial`), `wrap` là hàm bọc nơi gọi dùng cho vật liệu GLB (game: `withOccluderFade`, để biển mờ cùng cổng/điện khi che nhân vật).
 */
export function addSectSigns(
  root: THREE.Object3D,
  wrap: (m: THREE.MeshStandardNodeMaterial) => THREE.MeshStandardNodeMaterial = (m) => m,
): THREE.Material[] {
  const mats: THREE.Material[] = [];
  for (const s of SIGNS) {
    const e = calliOf(s.key);
    if (!e) {
      log.warn('thiếu ảnh biển', s.key);
      continue;
    }
    const tex = textureOf(e.file);
    // Sáng nhẹ tự thân (emissive = chính ảnh) để chữ vàng đọc được từ xa cả lúc sương/tối; vẫn nhận ánh sáng cảnh.
    const mat = wrap(createWorldMaterial({ map: tex, emissiveMap: tex, emissive: 0x555555, roughness: 0.55, metalness: 0.2 }));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    mesh.position.set(s.x, s.y, s.z);
    mesh.name = 'calli_sign';
    mesh.frustumCulled = false;
    root.add(mesh);
    mats.push(mat);
  }
  return mats;
}
