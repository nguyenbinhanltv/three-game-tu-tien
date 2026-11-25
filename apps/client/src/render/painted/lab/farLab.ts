import * as THREE from 'three/webgpu';
import { float, mix, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { FAR_SPAN, farHeightAt } from './farHeight';
import { bakeFarHeight } from './farHeightBake';
import { farPaint } from './farPaint';

/**
 * Cảnh thử bản đồ độ cao vùng xa (P3a, `?paintedlab=far`): vẽ độ cao (km) của `farHeightAt` ra màn hình để so mắt với bản gốc và đọc số
 * (`window.__farLab.stats()`: nhỏ nhất, lớn nhất, trung bình trên lưới 256²). Không có trong bundle game (nạp động từ main.tsx).
 */
declare global {
  interface Window {
    __farLab?: {
      stats(): Promise<{ min: number; max: number; mean: number }>;
      readback(n: number): Promise<{ n: number; b64: string }>;
      cpuReadback(n: number): Promise<{ n: number; ms: number; b64: string }>;
      paint?(): Promise<{ w: number; h: number; light: string; shade: string; air: string; cpuMs: number }>;
    };
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
  const h = farHeightAt(p, hero, 9, Number(q.get('stop') ?? 0));
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
  // P3b: bản đồ độ cao -> ba đầu ra của pass bức tranh (`?stage=paint&w=2048&ground=1024`)
  const paintStage = async () => {
    const W = Number(q.get('w') ?? 2048);
    const G = Number(q.get('ground') ?? 1024);
    const el: [number, number] = [(-2.6 * Math.PI) / 180, (21.4 * Math.PI) / 180];
    const H = Math.round((W * (el[1] - el[0])) / (Math.PI * 2));
    const heights = new THREE.RenderTarget(G, G, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false });
    heights.texture.minFilter = heights.texture.magFilter = THREE.LinearFilter;
    heights.texture.wrapS = heights.texture.wrapT = THREE.ClampToEdgeWrapping;
    const mh = new THREE.MeshBasicNodeMaterial();
    mh.colorNode = vec4(h, 0, 0, 1);
    const qh = new THREE.QuadMesh(mh);
    renderer.setRenderTarget(heights);
    qh.render(renderer);
    renderer.setRenderTarget(null);
    let tHeight: THREE.Texture = heights.texture;
    let cpuMs = 0;
    if (q.get('cpu') === '1') {
      // bản đồ độ cao nướng trên CPU bằng float32 chính xác (worker) rồi lên texture nửa-float: cùng kết quả mọi backend
      const t0 = performance.now();
      const data = await bakeFarHeight(G, FAR_SPAN, hero, 9);
      cpuMs = performance.now() - t0;
      const half = new Uint16Array(G * G * 4);
      for (let i = 0; i < G * G; i++) half[i * 4] = THREE.DataUtils.toHalfFloat(data[i]!);
      const dt = new THREE.DataTexture(half, G, G, THREE.RGBAFormat, THREE.HalfFloatType);
      dt.minFilter = dt.magFilter = THREE.LinearFilter;
      dt.wrapS = dt.wrapT = THREE.ClampToEdgeWrapping;
      dt.needsUpdate = true;
      tHeight = dt;
    }
    const sun = new THREE.Vector2(0.7168, -0.1073).normalize();
    const uOut = uniform(0);
    const pm = new THREE.MeshBasicNodeMaterial();
    pm.colorNode = farPaint(uv().x, uv().y, {
      tHeight,
      uTexel: float(FAR_SPAN / G),
      uSide: vec2(sun.x, sun.y),
      uHero: vec2(hero[0], hero[1]),
      uEl: vec2(el[0], el[1]),
      uEye: float(0.06),
      uOut,
    });
    const qp = new THREE.QuadMesh(pm);
    const planes: Uint8Array[] = [];
    for (let k = 0; k < 6; k++) {
      uOut.value = k;
      const rt = new THREE.RenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false });
      renderer.setRenderTarget(rt);
      qp.render(renderer);
      renderer.setRenderTarget(null);
      planes.push((await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H)) as Uint8Array);
    }
    const outs: string[] = [];
    for (let k = 0; k < 3; k++) {
      const m = new Uint8Array(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        m[i * 4] = planes[k]![i * 4]!;
        m[i * 4 + 1] = planes[k]![i * 4 + 1]!;
        m[i * 4 + 2] = planes[k]![i * 4 + 2]!;
        m[i * 4 + 3] = planes[k + 3]![i * 4]!;
      }
      let bin = '';
      for (let i = 0; i < m.length; i += 0x8000) bin += String.fromCharCode(...m.subarray(i, i + 0x8000));
      outs.push(btoa(bin));
    }
    return { w: W, h: H, light: outs[0]!, shade: outs[1]!, air: outs[2]!, cpuMs };
  };
  window.__farLab = {
    paint: paintStage,
    async cpuReadback(n: number) {
      const t0 = performance.now();
      const data = await bakeFarHeight(n, FAR_SPAN, hero, 9);
      const ms = performance.now() - t0;
      let bin = '';
      const bytes = new Uint8Array(data.buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { n, ms, b64: btoa(bin) };
    },
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
