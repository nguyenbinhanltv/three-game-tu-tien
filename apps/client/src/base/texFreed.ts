import * as THREE from 'three/webgpu';

/** Cờ gắn lên texture đã bỏ bản CPU sau khi lên GPU (`freeTexturesAfterUpload`, mảng mặt đất): nạp lại sẽ ghi dữ liệu rỗng. */
export function markCpuFreed(t: THREE.Texture): void {
  t.userData.dtlFreed = true;
}

/**
 * Texture đã bỏ bản CPU mà sắp `dispose`: three cache `NodeBuilderState` theo khóa chương trình giữa các vật liệu nên bind group của vật liệu level kế còn giữ
 * tham chiếu texture cũ một khung và nạp lại nó với dữ liệu rỗng (`GPUQueue.writeTexture` lỗi → pipeline hỏng → màn đen cả phiên). Thay dữ liệu bằng bản nhỏ HỢP LỆ cùng loại:
 *  - nén khối (`CompressedTexture`): một mip 24×24 toàn 0 (24 chia hết mọi khối 4/6/8/12 nên vùng ghi `ceil(w/khối)·khối` không vượt kích thước texture; 576 byte ≥ 36 khối 4×4 × 16 byte);
 *  - `DataTexture`: 1×1; `DataArrayTexture`/`Data3DTexture` (mảng mặt đất): 1×1 giữ nguyên số lớp.
 * Texture còn bản CPU (không có cờ) thì để nguyên.
 */
export function neutralizeFreedTexture(t: THREE.Texture): void {
  if (!t.userData.dtlFreed) return;
  t.name = `dtl-neutral:${t.name}`; // nhãn GPU: lỗi 'Destroyed texture … used in a submit' sẽ nêu tên, phân biệt với texture 1×1 mặc định của three
  const c = t as THREE.CompressedTexture;
  const d = t as THREE.DataArrayTexture;
  if (c.isCompressedTexture) {
    c.mipmaps = [{ data: new Uint8Array(576), width: 24, height: 24 }] as unknown as typeof c.mipmaps;
    c.source = new THREE.Source({ width: 24, height: 24 }); // Source riêng: `Texture.clone()` dùng chung Source, không được đổi kích thước của bản sao còn sống
  } else if ((t as THREE.DataTexture).isDataTexture) {
    t.source = new THREE.Source({ data: new Uint8Array(16), width: 1, height: 1 });
  } else if (d.isDataArrayTexture || (t as THREE.Data3DTexture).isData3DTexture) {
    const depth = Math.max(1, (t.image as { depth?: number }).depth ?? 1);
    t.source = new THREE.Source({ data: new Uint8Array(16 * depth), width: 1, height: 1, depth });
  }
}
