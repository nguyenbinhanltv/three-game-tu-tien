import * as THREE from 'three/webgpu';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGltfLoader, createKtx2Loader } from './assets';

/**
 * Loader GLB cho test chạy trong Node (chỉ test dùng, không vào bundle game): cùng cấu hình với game (Meshopt + KTX2) nhưng
 * mọi texture thay bằng `Texture` rỗng, vì Node không giải mã được ảnh và không có GPU/Worker để chuyển mã KTX2.
 * Test chỉ kiểm hình học, xương, clip và vật liệu.
 *
 * Plugin thay thế phải mang đúng tên `KHR_texture_basisu`: GLTFLoader giữ plugin theo tên và hỏi lần lượt theo thứ tự đăng ký,
 * plugin KTX2 có sẵn của three đứng trước mọi plugin đăng ký thêm. Đặt tên khác thì plugin có sẵn vẫn chạy trước và gọi
 * KTX2Loader thật (lỗi trong Node); trùng tên thì nó bị thay tại chỗ.
 */
export function nodeGltfLoader(): GLTFLoader {
  const loader = createGltfLoader(createKtx2Loader());
  loader.register(() => ({ name: 'KHR_texture_basisu', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return loader;
}
