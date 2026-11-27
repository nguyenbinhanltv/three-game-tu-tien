import * as THREE from 'three/webgpu';
import { DIEN_VO_CENTER, DIEN_VO_HALF, DIEN_VO_ZONES, type DienVoZone } from '@dtl/shared';

/**
 * Sàn của Diễn Võ Trường (phòng tập GM): MỘT tấm đá phẳng đều màu phủ lên mặt đất loang lổ, vẽ sẵn ô lát, ranh sáu khu và tên khu
 * (một texture canvas, một draw call). Sàn tối và ít bão hòa để nhân vật, quái và hiệu ứng nổi lên, đúng tinh thần Dạ Họa.
 * Chỉ là hình: va chạm và chỗ đứng của quái do server quyết từ cùng dữ liệu `DIEN_VO_ZONES`.
 */
export interface DienVoRoomInput {
  heightAt(x: number, z: number): number;
  /** Tên hiển thị của khu (i18n). */
  zoneName(id: string): string;
  font: string;
}

/** Điểm ảnh mỗi mét của texture sàn và số đoạn lưới (sàn bám theo mặt đất, không cắm vào chỗ gồ). */
const PPM = 32;
const SEG = 24;
const LIFT = 0.05;
const BASE = '#232a34';
const TILE = '#2b333f';
const LINE = '#8fc4ff';

/** Tọa độ thế giới → điểm ảnh trên canvas (x tăng sang phải, z tăng xuống dưới). */
export function dienVoPx(x: number, z: number): [number, number] {
  return [(x - DIEN_VO_CENTER.x + DIEN_VO_HALF) * PPM, (z - DIEN_VO_CENTER.z + DIEN_VO_HALF) * PPM];
}

function drawZone(ctx: CanvasRenderingContext2D, z: DienVoZone, name: string, font: string): void {
  const [cx, cy] = dienVoPx(z.x, z.z);
  ctx.strokeStyle = LINE;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 5;
  ctx.beginPath();
  let labelY = cy;
  if (z.r) {
    ctx.arc(cx, cy, z.r * PPM, 0, Math.PI * 2);
    // Vòng trong mảnh: thước 2 m để ước lượng tầm đánh.
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 2;
    for (let r = 2; r < z.r; r += 2) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * PPM, 0, Math.PI * 2);
      ctx.stroke();
    }
    labelY = cy + (z.r - 1.1) * PPM;
  } else {
    const hx = (z.hx ?? 2) * PPM;
    const hz = (z.hz ?? 2) * PPM;
    ctx.rect(cx - hx, cy - hz, hx * 2, hz * 2);
    ctx.stroke();
    labelY = cy + hz - 0.9 * PPM;
  }
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#dfeaf7';
  ctx.font = `700 ${Math.round(PPM * 1.05)}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, labelY);
  ctx.globalAlpha = 1;
}

export class DienVoRoom {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(inp: DienVoRoomInput) {
    this.group.name = 'dien-vo-room';
    const size = DIEN_VO_HALF * 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size * PPM;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, cv.width, cv.height);
    // Ô lát 4 m xen kẽ rất nhẹ + mạch 1 px: đủ để thấy tỉ lệ, không thành hoa văn tranh chỗ với hiệu ứng.
    for (let i = 0; i < size / 4; i++)
      for (let j = 0; j < size / 4; j++) {
        if ((i + j) % 2) continue;
        ctx.fillStyle = TILE;
        ctx.fillRect(i * 4 * PPM + 2, j * 4 * PPM + 2, 4 * PPM - 4, 4 * PPM - 4);
      }
    ctx.strokeStyle = LINE;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, cv.width - 20, cv.height - 20);
    ctx.globalAlpha = 1;
    for (const z of DIEN_VO_ZONES) drawZone(ctx, z, inp.zoneName(z.id), inp.font);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const geo = new THREE.PlaneGeometry(size, size, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + DIEN_VO_CENTER.x;
      const z = pos.getZ(i) + DIEN_VO_CENTER.z;
      pos.setXYZ(i, x, inp.heightAt(x, z) + LIFT, z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'dien-vo-floor';
    this.group.add(mesh);
    this.disposables.push(tex, geo, mat);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
