// Đo khớp pass "bức tranh" vùng xa (P3b): chạy GLSL gốc của painted-valley (heightFragment rồi paintFragment trong backdrop.js, ba đầu ra) và bản
// TSL của ta (`?paintedlab=far&stage=paint`) cùng tham số, rồi so từng đầu ra (sáng / tối+độ sáng / không khí+sương) bằng sai số và SSIM.
//   node tools/painted-compare/far-paint-compare.mjs --src <painted-valley/src/valley/backdrop.js> --out <thư mục ra> [--w 2048] [--ground 1024] [--renderer webgpu|webgl2] [--port 5193]
// Một Chromium (tắt tiếng) + vite của client; tắt cả hai khi xong. Không commit ảnh/số: ghi ở --out.
import fs from 'node:fs';
import vm from 'node:vm';
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
const out = path.resolve(arg('--out', 'far-paint-compare'));
const W = Number(arg('--w', '2048'));
const G = Number(arg('--ground', '1024'));
const port = Number(arg('--port', '5193'));
const renderer = arg('--renderer', 'webgpu');
fs.mkdirSync(out, { recursive: true });

// trích GLSL gốc bằng cách chạy phần đầu tệp nguồn (tệp nguồn do người vận hành chỉ định, không phải đầu vào không tin cậy)
const text = fs.readFileSync(src, 'utf8');
const a = text.indexOf('const SPAN');
const b = text.indexOf('/**\n * @param side');
const body = text.slice(a, b).replace(/export /g, '');
const { heightFragment, paintFragment, vertex, SPAN } = vm.runInNewContext(
  `${body}; ({ heightFragment, paintFragment, vertex, SPAN })`,
  {},
  { timeout: 5000 },
);
const vert = '#version 300 es\nin vec3 position;\n' + vertex.trim();
const fragH = '#version 300 es\n' + heightFragment.trim();
const fragP = '#version 300 es\n' + paintFragment.trim();
const EL = [(-2.6 * Math.PI) / 180, (21.4 * Math.PI) / 180];
const H = Math.round((W * (EL[1] - EL[0])) / (Math.PI * 2));

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
const bytes = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));

// xám = trung bình bốn kênh /255
const gray = (U) => {
  const o = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) o[i] = (U[i * 4] + U[i * 4 + 1] + U[i * 4 + 2] + U[i * 4 + 3]) / 1020;
  return o;
};
const mae = (A, B) => {
  let s = 0;
  for (let i = 0; i < A.length; i++) s += Math.abs(A[i] - B[i]);
  return s / A.length;
};
const ssim = (A, B) => {
  const C1 = 0.01 ** 2;
  const C2 = 0.03 ** 2;
  let tot = 0;
  let cnt = 0;
  for (let y = 0; y + 8 <= H; y += 4) {
    for (let x = 0; x + 8 <= W; x += 4) {
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          ma += A[(y + j) * W + x + i];
          mb += B[(y + j) * W + x + i];
        }
      }
      ma /= 64;
      mb /= 64;
      let va = 0;
      let vb = 0;
      let cv = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const da = A[(y + j) * W + x + i] - ma;
          const db = B[(y + j) * W + x + i] - mb;
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
const flipRows = (U) => {
  const F = new Uint8Array(U.length);
  const row = W * 4;
  for (let j = 0; j < H; j++) F.set(U.subarray(j * row, (j + 1) * row), (H - 1 - j) * row);
  return F;
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

  // --- GLSL gốc: độ cao -> bức tranh ---
  const ref = await ctx.newPage();
  await ref.setContent('<canvas id="c" width="8" height="8"></canvas>');
  const refOut = await ref.evaluate(
    ({ vert, fragH, fragP, W, H, G, SPAN, EL }) => {
      const gl = document.getElementById('c').getContext('webgl2');
      if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('thiếu EXT_color_buffer_float');
      const sh = (t, s) => {
        const o = gl.createShader(t);
        gl.shaderSource(o, s);
        gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
        return o;
      };
      const prog = (f) => {
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, vert));
        gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, f));
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        return pr;
      };
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const bind = (pr) => {
        gl.useProgram(pr);
        const loc = gl.getAttribLocation(pr, 'position');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      };
      // độ cao (nửa float, lọc song tuyến như nguồn)
      const hTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, hTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, G, G, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbH = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbH);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, hTex, 0);
      gl.viewport(0, 0, G, G);
      const ph = prog(fragH);
      bind(ph);
      gl.uniform2f(gl.getUniformLocation(ph, 'uHero'), 0.6, 0.8);
      gl.uniform1i(gl.getUniformLocation(ph, 'uDetail'), 9);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // bức tranh: ba đầu ra RGBA8
      const targets = [0, 1, 2].map(() => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return t;
      });
      const fbP = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbP);
      targets.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
      gl.viewport(0, 0, W, H);
      const pp = prog(fragP);
      bind(pp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, hTex);
      gl.uniform1i(gl.getUniformLocation(pp, 'tHeight'), 0);
      gl.uniform1f(gl.getUniformLocation(pp, 'uTexel'), SPAN / G);
      const sl = Math.hypot(0.7168, -0.1073);
      gl.uniform2f(gl.getUniformLocation(pp, 'uSide'), 0.7168 / sl, -0.1073 / sl);
      gl.uniform2f(gl.getUniformLocation(pp, 'uHero'), 0.6, 0.8);
      gl.uniform2f(gl.getUniformLocation(pp, 'uEl'), EL[0], EL[1]);
      gl.uniform1f(gl.getUniformLocation(pp, 'uEye'), 0.06);
      // vẽ theo dải đứng để một lệnh vẽ không giữ GPU quá lâu (như nguồn)
      gl.enable(gl.SCISSOR_TEST);
      const strips = 16;
      const step = Math.ceil(W / strips);
      for (let i = 0; i < strips; i++) {
        gl.scissor(i * step, 0, step, H);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.finish();
      }
      const res = [];
      for (let i = 0; i < 3; i++) {
        gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
        const px = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let bin = '';
        for (let k = 0; k < px.length; k += 0x8000) bin += String.fromCharCode(...px.subarray(k, k + 0x8000));
        res.push(btoa(bin));
      }
      return res;
    },
    { vert, fragH, fragP, W, H, G, SPAN, EL },
  );

  // --- bản TSL của ta ---
  const our = await ctx.newPage();
  const logs = [];
  our.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text().slice(0, 300)));
  await our.goto(`http://127.0.0.1:${port}/?paintedlab=far&mute=1&size=256&renderer=${renderer}&w=${W}&ground=${G}`, { waitUntil: 'load' });
  await our.waitForFunction(() => window.__farLab, null, { timeout: 60000 });
  const t0 = Date.now();
  const ours = await our.evaluate(() => window.__farLab.paint());
  const ms = Date.now() - t0;

  const names = ['light', 'shade', 'air'];
  const metrics = { w: W, h: H, ground: G, renderer, oursPaintMs: ms, logs: logs.slice(0, 6), outputs: {} };
  for (let k = 0; k < 3; k++) {
    const R = bytes(refOut[k]);
    const O0 = bytes(ours[names[k]]);
    const O1 = flipRows(O0);
    const g = gray(R);
    const g0 = gray(O0);
    const g1 = gray(O1);
    const useFlip = mae(g, g1) < mae(g, g0);
    const O = useFlip ? O1 : O0;
    const go = useFlip ? g1 : g0;
    const chan = (U) =>
      [0, 1, 2, 3].map((c) => {
        let t = 0;
        for (let i = 0; i < W * H; i++) t += U[i * 4 + c];
        return +(t / (W * H)).toFixed(1);
      });
    metrics.outputs[names[k]] = {
      flipped: useFlip,
      meanAbsErr: mae(g, go),
      ssim: ssim(g, go),
      refMeanRGBA: chan(R),
      oursMeanRGBA: chan(O),
    };
    await sharp(Buffer.from(R), { raw: { width: W, height: H, channels: 4 } })
      .flip()
      .png()
      .toFile(path.join(out, `ref-${names[k]}.png`));
    await sharp(Buffer.from(O), { raw: { width: W, height: H, channels: 4 } })
      .flip()
      .png()
      .toFile(path.join(out, `ours-${names[k]}.png`));
  }
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics));
} finally {
  await browser?.close().catch(() => {});
  kill();
}
