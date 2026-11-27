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
/**
 * Nền thử của phòng (xưởng VFX): cùng một sàn, bốn bảng màu để soi hiệu ứng trên nền tối, sáng, cỏ và tuyết. `glow` = độ tự sáng của sàn
 * (nền sáng cần cao hơn, nếu không ánh đêm của Dạ Họa kéo nó về xám).
 */
export const DIEN_VO_FLOORS = {
  dark: { base: '#232a34', tile: '#343f4e', line: '#d6e8ff', text: '#dfeaf7', glow: 0.28 },
  light: { base: '#c9c2b2', tile: '#d8d2c4', line: '#3a4656', text: '#2a3340', glow: 0.75 },
  grass: { base: '#3f6b3a', tile: '#4c7a43', line: '#e6f2d8', text: '#eef7e2', glow: 0.5 },
  snow: { base: '#dfe8f0', tile: '#eef3f8', line: '#4a6078', text: '#34485e', glow: 0.9 },
} as const;
export type DienVoFloor = keyof typeof DIEN_VO_FLOORS;
export const DIEN_VO_FLOOR_IDS = Object.keys(DIEN_VO_FLOORS) as DienVoFloor[];
type FloorPal = (typeof DIEN_VO_FLOORS)[DienVoFloor];

/** Tọa độ thế giới → điểm ảnh trên canvas (x tăng sang phải, z tăng xuống dưới). */
export function dienVoPx(x: number, z: number): [number, number] {
  return [(x - DIEN_VO_CENTER.x + DIEN_VO_HALF) * PPM, (z - DIEN_VO_CENTER.z + DIEN_VO_HALF) * PPM];
}

function drawZone(ctx: CanvasRenderingContext2D, z: DienVoZone, name: string, font: string, pal: FloorPal): void {
  const [cx, cy] = dienVoPx(z.x, z.z);
  ctx.strokeStyle = pal.line;
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
  ctx.fillStyle = pal.text;
  ctx.font = `700 ${Math.round(PPM * 1.05)}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, labelY);
  ctx.globalAlpha = 1;
}

export class DienVoRoom {
  readonly group = new THREE.Group();
  floor: DienVoFloor = 'dark';
  private disposables: { dispose(): void }[] = [];
  private cv: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private mat: THREE.MeshStandardNodeMaterial;

  constructor(private inp: DienVoRoomInput) {
    this.group.name = 'dien-vo-room';
    const size = DIEN_VO_HALF * 2;
    this.cv = document.createElement('canvas');
    this.cv.width = this.cv.height = size * PPM;
    this.paint(DIEN_VO_FLOORS.dark);

    const tex = new THREE.CanvasTexture(this.cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.tex = tex;
    const geo = new THREE.PlaneGeometry(size, size, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + DIEN_VO_CENTER.x;
      const z = pos.getZ(i) + DIEN_VO_CENTER.z;
      pos.setXYZ(i, x, inp.heightAt(x, z) + LIFT, z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardNodeMaterial({
      map: tex,
      roughness: 0.95,
      metalness: 0,
      // Tự sáng nhẹ theo chính texture: ranh khu và chữ vẫn đọc được khi nền đêm của Dạ Họa hạ ánh trăng.
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: DIEN_VO_FLOORS.dark.glow,
    });
    this.mat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'dien-vo-floor';
    this.group.add(mesh);
    this.disposables.push(tex, geo, mat);
  }

  /** Vẽ lại sàn theo một bảng màu: nền, ô lát 4 m xen kẽ rất nhẹ, khung ngoài, ranh và tên sáu khu. */
  private paint(pal: FloorPal): void {
    const cv = this.cv;
    const size = DIEN_VO_HALF * 2;
    const ctx = cv.getContext('2d')!;
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.base;
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < size / 4; i++)
      for (let j = 0; j < size / 4; j++) {
        if ((i + j) % 2) continue;
        ctx.fillStyle = pal.tile;
        ctx.fillRect(i * 4 * PPM + 2, j * 4 * PPM + 2, 4 * PPM - 4, 4 * PPM - 4);
      }
    ctx.strokeStyle = pal.line;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, cv.width - 20, cv.height - 20);
    ctx.globalAlpha = 1;
    for (const z of DIEN_VO_ZONES) drawZone(ctx, z, this.inp.zoneName(z.id), this.inp.font, pal);
  }

  /** Đổi nền thử (xưởng VFX). Chỉ đổi hình ở client; trả false nếu không có nền đó. */
  setFloor(id: string): boolean {
    const pal = (DIEN_VO_FLOORS as Record<string, FloorPal | undefined>)[id];
    if (!pal) return false;
    this.floor = id as DienVoFloor;
    this.paint(pal);
    this.tex.needsUpdate = true;
    this.mat.emissiveIntensity = pal.glow;
    return true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
