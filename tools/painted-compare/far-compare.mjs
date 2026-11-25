// Đo khớp bản đồ độ cao vùng xa (P3a): chạy GLSL gốc của painted-valley (heightFragment trong backdrop.js) và bản TSL của ta
// (`?paintedlab=far`) cùng tham số (hero 0,6/0,8, uDetail 9, SPAN 86), cùng lưới n×n, rồi so min/max/mean, sai số tuyệt đối và SSIM.
//   node tools/painted-compare/far-compare.mjs --src <đường dẫn painted-valley/src/valley/backdrop.js> --out <thư mục ra> [--n 512] [--port 5192]
// Một Chromium (tắt tiếng) + vite của client; tắt cả hai khi xong. Không commit ảnh/số: ghi ở --out.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../perf/package.json', import.meta.url));
const { chromium } = require('playwright');
const sharp = require('sharp');

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const src = path.resolve(arg('--src', '../painted-valley/src/valley/backdrop.js'));
const out = path.resolve(arg('--out', 'far-compare'));
const n = Number(arg('--n', '512'));
const port = Number(arg('--port', '5192'));
const renderer = arg('--renderer', 'webgpu');
fs.mkdirSync(out, { recursive: true });

// trích đoạn GLSL gốc (NOISE + heightFragment) bằng cách chạy phần đầu tệp nguồn
const text = fs.readFileSync(src, 'utf8');
const a = text.indexOf('const SPAN');
const b = text.indexOf('const paintFragment');
const body = text.slice(a, b).replace(/export /g, '');
const { heightFragment, vertex, SPAN } = new Function(`${body}; return { heightFragment, vertex, SPAN };`)();
const frag = '#version 300 es\n' + heightFragment.trim();
const vert = '#version 300 es\nin vec3 position;\n' + vertex.trim();

const root = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const vite = spawn('pnpm', ['--filter', '@dtl/client', 'exec', 'vite', '--port', String(port), '--host', '127.0.0.1', '--strictPort'], {
  cwd: root,
  shell: true,
  stdio: 'ignore',
});
const kill = () => {
  try {
    execFileSync('taskkill', ['/PID', String(vite.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    /* đã tắt */
  }
};
process.on('exit', kill);
const decode = (b64) => new Float32Array(Uint8Array.from(Buffer.from(b64, 'base64')).buffer);

const stat = (A) => {
  let mn = Infinity;
  let mx = -Infinity;
  let s = 0;
  for (const v of A) {
    mn = Math.min(mn, v);
    mx = Math.max(mx, v);
    s += v;
  }
  return { min: mn, max: mx, mean: s / A.length };
};
const mae = (A, B) => {
  let s = 0;
  for (let i = 0; i < A.length; i++) s += Math.abs(A[i] - B[i]);
  return s / A.length;
};
// SSIM trên độ cao chuẩn hóa h/6, cửa sổ 8×8 bước 4
const ssim = (A, B) => {
  const C1 = 0.01 ** 2;
  const C2 = 0.03 ** 2;
  let tot = 0;
  let cnt = 0;
  for (let y = 0; y + 8 <= n; y += 4) {
    for (let x = 0; x + 8 <= n; x += 4) {
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          ma += A[(y + j) * n + x + i] / 6;
          mb += B[(y + j) * n + x + i] / 6;
        }
      }
      ma /= 64;
      mb /= 64;
      let va = 0;
      let vb = 0;
      let cv = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const da = A[(y + j) * n + x + i] / 6 - ma;
          const db = B[(y + j) * n + x + i] / 6 - mb;
          va += da * da;
          vb += db * db;
          cv += da * db;
        }
      }
      va /= 63;
      vb /= 63;
      cv /= 63;
      tot += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      cnt++;
    }
  }
  return tot / cnt;
};

let browser;
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break;
    } catch {
      /* chưa lên */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium
    .launch({
      channel: 'chrome',
      headless: true,
      args: ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'],
    })
    .catch(() => chromium.launch({ headless: true, args: ['--mute-audio'] }));
  const ctx = await browser.newContext({ viewport: { width: 256, height: 256 } });

  // --- GLSL gốc ---
  const ref = await ctx.newPage();
  await ref.setContent('<canvas id="c" width="8" height="8"></canvas>');
  const refB64 = await ref.evaluate(
    ({ vert, frag, n }) => {
      const gl = document.getElementById('c').getContext('webgl2');
      if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('thiếu EXT_color_buffer_float');
      const sh = (t, s) => {
        const o = gl.createShader(t);
        gl.shaderSource(o, s);
        gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
        return o;
      };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, vert));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, frag));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      gl.uniform2f(gl.getUniformLocation(pr, 'uHero'), 0.6, 0.8);
      gl.uniform1i(gl.getUniformLocation(pr, 'uDetail'), 9);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, n, 0, gl.RGBA, gl.FLOAT, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, n, n);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'position');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Float32Array(n * n * 4);
      gl.readPixels(0, 0, n, n, gl.RGBA, gl.FLOAT, px);
      const o = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) o[i] = px[i * 4];
      let bin = '';
      const bytes = new Uint8Array(o.buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    { vert, frag, n },
  );
  const R = decode(refB64);

  // --- bản TSL của ta ---
  const our = await ctx.newPage();
  const logs = [];
  our.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text().slice(0, 300)));
  await our.goto(`http://127.0.0.1:${port}/?paintedlab=far&mute=1&size=256&renderer=${renderer}`, { waitUntil: 'load' });
  await our.waitForFunction(() => window.__farLab, null, { timeout: 60000 });
  const O0 = decode((await our.evaluate((nn) => window.__farLab.readback(nn), n)).b64);

  // ảnh có thể lật dọc giữa hai backend: lấy hướng khớp hơn
  const O1 = new Float32Array(O0.length);
  for (let j = 0; j < n; j++) O1.set(O0.subarray(j * n, (j + 1) * n), (n - 1 - j) * n);
  const useFlip = mae(R, O1) < mae(R, O0);
  const O = useFlip ? O1 : O0;
  let maxAbs = 0;
  for (let i = 0; i < R.length; i++) maxAbs = Math.max(maxAbs, Math.abs(R[i] - O[i]));
  const toPng = (A, f) =>
    sharp(Buffer.from(Uint8Array.from(A, (v) => Math.max(0, Math.min(255, Math.round((v / 6) * 255))))), {
      raw: { width: n, height: n, channels: 1 },
    })
      .png()
      .toFile(path.join(out, f));
  await toPng(R, 'ref.png');
  await toPng(O, 'ours.png');
  const metrics = {
    n,
    span: SPAN,
    renderer,
    flippedOurs: useFlip,
    ref: stat(R),
    ours: stat(O),
    meanAbsErr: mae(R, O),
    maxAbsErr: maxAbs,
    ssim: ssim(R, O),
    logs: logs.slice(0, 6),
  };
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics));
} finally {
  await browser?.close().catch(() => {});
  kill();
}
