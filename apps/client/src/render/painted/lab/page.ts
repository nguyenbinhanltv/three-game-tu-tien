import * as THREE from 'three/webgpu';
import { createBlades } from './blades';
import { RefField, type RefDump } from './field';
import { createFlowers } from './flowers';
import { createFrame } from './frame';
import { createGround, flatTextures } from './ground';
import { heightAt as worldHeightAt, paint as worldPaint } from './ref/world';
import { createStrokes, smoothNoiseTexture, whiteNoiseTexture } from './ref/textures';

/**
 * Cảnh thử đối chiếu `?paintedlab=1`: chỉ cánh đồng của painted-valley (đất + lá + hoa) dựng bằng TSL từ bản dịch từng dòng, không HUD,
 * không quái, không prop. Khớp với `tools/painted-compare/ref-capture.mjs`: cùng bản đồ (hàm `heightAt`/`paint` của nguồn), cùng
 * camera, cùng giờ (uniform lấy từ bản dump), cùng cỡ ảnh. `window.__paintedLab.apply(dump)` rồi `.render()`.
 *
 * Cửa sổ dữ liệu: nguồn nướng 1280 m vuông (1 m một texel, tâm ở 0,0). Ở đây chỉ nướng ô vuông `WIN` m quanh vùng thử, cùng lưới texel
 * (gốc cửa sổ là bội số 5 m so với −640 để texel độ dốc 2,5 m cũng thẳng hàng) nên mọi giá trị đọc được giống hệt.
 */
const WIN = 320;
const EXTENT = 1280;
const SEED = 3;
const HEIGHT = 0.5;

export interface PaintedLab {
  ready: Promise<void>;
  apply(d: RefDump): Promise<void>;
  render(): void;
  info(): { drawCalls: number; triangles: number; frames: number };
}

declare global {
  interface Window {
    __paintedLab?: PaintedLab;
  }
}

export async function startPaintedLab(host: HTMLElement): Promise<void> {
  const q = new URLSearchParams(location.search);
  const win = (q.get('win') ?? '-20,-90').split(',').map(Number) as [number, number];
  const paintLevel = q.has('paint') ? Number(q.get('paint')) : 3;
  host.style.cssText = 'position:fixed;inset:0;margin:0;background:#000';
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: q.get('renderer') === 'webgl2' });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NoToneMapping;
  host.appendChild(renderer.domElement);
  await renderer.init();

  // ---- bản đồ trong cửa sổ ----
  const res = WIN;
  const heights = new Float32Array(res * res);
  const map = new Uint8Array(res * res * 4);
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = win[0] + (i + 0.5);
      const z = win[1] + (j + 0.5);
      const k = i + j * res;
      heights[k] = worldHeightAt(x, z);
      const p = worldPaint(x, z);
      map[k * 4] = Math.round(255 * clamp01(p.dry));
      map[k * 4 + 1] = Math.round(255 * clamp01(p.growth));
      map[k * 4 + 2] = Math.round(255 * clamp01(p.wet));
      map[k * 4 + 3] = Math.round(255 * clamp01(p.flowers));
    }
  }
  const tHeight = new THREE.DataTexture(heights, res, res, THREE.RedFormat, THREE.FloatType);
  tHeight.minFilter = tHeight.magFilter = THREE.NearestFilter;
  tHeight.needsUpdate = true;
  const tMap = new THREE.DataTexture(map, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
  tMap.minFilter = tMap.magFilter = THREE.LinearFilter;
  tMap.wrapS = tMap.wrapT = THREE.ClampToEdgeWrapping;
  tMap.needsUpdate = true;
  // độ dốc cho ánh sáng trên đồng cỏ: lấy trên vài mét, 2,5 m một texel (EXTENT / 512 của nguồn)
  const SL = Math.round(WIN / (EXTENT / 512));
  const stepM = EXTENT / 512;
  const slope = new Uint8Array(SL * SL * 2);
  const byte = (s: number): number => Math.round(255 * Math.min(1, Math.max(0, 0.5 + s * 2)));
  for (let j = 0, k = 0; j < SL; j++) {
    const z = win[1] + (j + 0.5) * stepM;
    for (let i = 0; i < SL; i++) {
      const x = win[0] + (i + 0.5) * stepM;
      slope[k++] = byte((worldHeightAt(x + 24, z) - worldHeightAt(x - 24, z)) / 48);
      slope[k++] = byte((worldHeightAt(x, z + 24) - worldHeightAt(x, z - 24)) / 48);
    }
  }
  const tSlope = new THREE.DataTexture(slope, SL, SL, THREE.RGFormat, THREE.UnsignedByteType);
  tSlope.minFilter = tSlope.magFilter = THREE.LinearFilter;
  tSlope.wrapS = tSlope.wrapT = THREE.ClampToEdgeWrapping;
  tSlope.unpackAlignment = 1;
  tSlope.needsUpdate = true;

  const one = (r: number, g: number, b: number, a: number): THREE.DataTexture => {
    const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1);
    t.needsUpdate = true;
    return t;
  };
  const F = new RefField({
    tHeight,
    tMap,
    tNoise: smoothNoiseTexture(256, SEED * 13 + 1),
    tNoiseHi: smoothNoiseTexture(256, SEED * 13 + 1, true),
    tWhite: whiteNoiseTexture(256, SEED * 7 + 2),
    tStrokes: createStrokes(),
    tSlope,
    tShade: one(0, 0, 0, 255),
    tFloor: one(0, 0, 0, 0),
  });
  F.uExtentMin.value.set(win[0], win[1]);
  F.uExtentInv.value = 1 / WIN;
  F.uHeightRes.value = res;

  /** Độ cao đọc song tuyến giữa tâm texel, đúng như `field.heightAt` của nguồn (đặt chỗ cho từng ô lá). */
  const groundAt = (x: number, z: number): number => {
    const px = Math.min(res - 1, Math.max(0, x - win[0] - 0.5));
    const pz = Math.min(res - 1, Math.max(0, z - win[1] - 0.5));
    const i = Math.min(res - 2, Math.floor(px));
    const j = Math.min(res - 2, Math.floor(pz));
    const fx = px - i;
    const fz = pz - j;
    const a = i + j * res;
    const b = a + res;
    return (heights[a]! * (1 - fx) + heights[a + 1]! * fx) * (1 - fz) + (heights[b]! * (1 - fx) + heights[b + 1]! * fx) * fz;
  };

  const scene = new THREE.Scene();
  const ground = createGround(F, flatTextures(), { extentMin: win, texel: 1 });
  const blades = createBlades(F, { height: HEIGHT, seed: SEED, density: 1 }, groundAt);
  blades.init();
  const flowers = createFlowers(F, { height: HEIGHT, seed: SEED }, groundAt);
  // ?parts=ground,blades,flowers (mặc định cả ba): chia nhỏ để đo phần nào làm khung nặng
  const parts = (q.get('parts') ?? 'ground,blades,flowers').split(',');
  if (parts.includes('ground')) scene.add(ground.mesh);
  if (parts.includes('blades')) scene.add(blades.group);
  if (parts.includes('flowers')) scene.add(flowers.group);
  let frames = 0;

  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.12, 40000);
  camera.rotation.order = 'YXZ';
  const frame = createFrame(renderer, scene, camera, { paint: paintLevel, exposure: 1, vignette: 0.14, samples: 4 });

  const lab: PaintedLab = {
    ready: Promise.resolve(),
    async apply(d: RefDump): Promise<void> {
      void renderer;
      F.applyDump(d);
      camera.fov = d.camera.fov;
      camera.near = d.camera.near;
      camera.far = d.camera.far;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.position.fromArray(d.camera.position);
      camera.rotation.set(d.camera.rotation[0]!, d.camera.rotation[1]!, d.camera.rotation[2]!, 'YXZ');
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      const [cx, , cz] = d.camera.position as [number, number, number];
      blades.follow(cx, cz);
      ground.follow(cx, cz);
      flowers.follow(cx, cz);
      // vòng rAF: khung WebGPU chỉ được present (và chụp được) khi vẽ trong vòng rAF; cảnh đóng băng nên khung nào cũng như nhau
      void renderer.setAnimationLoop(() => {
        frame.render();
        frames++;
      });
    },
    render(): void {
      frame.render();
    },
    info() {
      return { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles, frames };
    },
  };
  window.__paintedLab = lab;
}
