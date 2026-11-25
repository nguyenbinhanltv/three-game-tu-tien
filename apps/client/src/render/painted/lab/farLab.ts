import * as THREE from 'three/webgpu';
import { float, mix, uv, vec3, vec4 } from 'three/tsl';
import { FAR_SPAN, farHeightAt } from './farHeight';

/**
 * Cảnh thử bản đồ độ cao vùng xa (P3a, `?paintedlab=far`): vẽ độ cao (km) của `farHeightAt` ra màn hình để so mắt với bản gốc và đọc số
 * (`window.__farLab.stats()`: nhỏ nhất, lớn nhất, trung bình trên lưới 256²). Không có trong bundle game (nạp động từ main.tsx).
 */
declare global {
  interface Window {
    __farLab?: { stats(): Promise<{ min: number; max: number; mean: number }>; readback(n: number): Promise<{ n: number; b64: string }> };
  }
}

export async function startFarLab(host: HTMLElement): Promise<void> {
  const q = new URLSearchParams(location.search);
  const size = Number(q.get('size') ?? 1024);
  host.style.cssText = 'position:fixed;inset:0;margin:0;background:#000';
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: q.get('renderer') === 'webgl2' });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.toneMapping = THREE.NoToneMapping;
  host.appendChild(renderer.domElement);
  await renderer.init();

  const hero: [number, number] = [0.6, 0.8];
  const p = uv().sub(0.5).mul(FAR_SPAN);
  const h = farHeightAt(p, hero, 9);
  const g = h.div(6);
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = mix(vec3(0.05, 0.1, 0.2), vec3(1, 1, 0.95), g.clamp(0, 1)).mul(float(1));
  const quad = new THREE.QuadMesh(material);
  quad.render(renderer);

  // số liệu: dựng lại vào RT float 256² rồi đọc về
  const readN = async (n: number): Promise<Float32Array> => {
    const rt = new THREE.RenderTarget(n, n, { type: THREE.FloatType, format: THREE.RGBAFormat });
    const m2 = new THREE.MeshBasicNodeMaterial();
    m2.colorNode = vec4(h, 0, 0, 1);
    const q2 = new THREE.QuadMesh(m2);
    renderer.setRenderTarget(rt);
    q2.render(renderer);
    renderer.setRenderTarget(null);
    return (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, n, n)) as Float32Array;
  };
  window.__farLab = {
    async readback(n: number) {
      const data = await readN(n);
      const out = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) out[i] = data[i * 4]!;
      let bin = '';
      const bytes = new Uint8Array(out.buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { n, b64: btoa(bin) };
    },
    async stats() {
      const n = 256;
      const rt = new THREE.RenderTarget(n, n, { type: THREE.FloatType, format: THREE.RGBAFormat });
      const m2 = new THREE.MeshBasicNodeMaterial();
      m2.colorNode = vec4(h, 0, 0, 1);
      const q2 = new THREE.QuadMesh(m2);
      renderer.setRenderTarget(rt);
      q2.render(renderer);
      renderer.setRenderTarget(null);
      const data = (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, n, n)) as Float32Array;
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      for (let i = 0; i < n * n; i++) {
        const v = data[i * 4]!;
        min = Math.min(min, v);
        max = Math.max(max, v);
        sum += v;
      }
      return { min, max, mean: sum / (n * n) };
    },
  };
}
