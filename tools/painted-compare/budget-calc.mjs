// Tính offline số tam giác lá+hoa Họa Cảnh (ô × mẫu/ô × tam giác/mẫu, cắt khung hình theo camera iso). Dùng: node tools/painted-compare/budget-calc.mjs '[{"name":"x","mid":{"tile":9.6,"tiles":5,"cell":0.15},"wide":{...},"fl":{...,"subs":2}}]'
import { createRequire } from 'module';
const require = createRequire(new URL('../../apps/client/package.json', import.meta.url));
const THREE = require('three');
const cfgs = JSON.parse(process.argv[2]);
const pitch = (52 * Math.PI) / 180,
  dist = 20;
function tilesDrawn(tile, tiles, yaw, tx, tz) {
  const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 250);
  const dx = Math.sin(yaw) * Math.cos(pitch) * dist,
    dz = Math.cos(yaw) * Math.cos(pitch) * dist,
    dy = Math.sin(pitch) * dist;
  cam.position.set(tx + dx, dy, tz + dz);
  cam.lookAt(tx, 0, tz);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const fr = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
  );
  const cx = cam.position.x,
    cz = cam.position.z; // follow centre = camera xz (như paintedField: center)
  const sx = Math.floor(cx / tile),
    sz = Math.floor(cz / tile);
  let n = 0;
  for (let j = 0; j < tiles; j++)
    for (let i = 0; i < tiles; i++) {
      const ox = (sx + i - tiles / 2) * tile,
        oz = (sz + j - tiles / 2) * tile;
      const s = new THREE.Sphere(new THREE.Vector3(ox + tile / 2, 0.3, oz + tile / 2), tile * 0.75 + 2.5);
      if (fr.intersectsSphere(s)) n++;
    }
  return n;
}
for (const c of cfgs) {
  let tot = 0,
    mx = 0,
    k = 0;
  for (let yaw of [0, 0.4, 0.8, 1.2, 1.6, 2.4, 3.1, 4])
    for (const o of [0, 3, 6, 9, 12])
      for (const p of [0, 5]) {
        const nm = tilesDrawn(c.mid.tile, c.mid.tiles, yaw, o, p),
          nw = tilesDrawn(c.wide.tile, c.wide.tiles, yaw, o, p),
          nf = tilesDrawn(c.fl.tile, c.fl.tiles, yaw, o, p);
        const tm =
          nm * (c.mid.tile / c.mid.cell) ** 2 * 6 +
          nw * (c.wide.tile / c.wide.cell) ** 2 * 4 +
          nf * Math.round(c.fl.tile / c.fl.cell) ** 2 * 44 * c.fl.subs;
        tot += tm;
        mx = Math.max(mx, tm);
        k++;
        if (k === 1) c._first = { nm, nw, nf };
      }
  console.log(c.name, 'tri lá+hoa mean', (tot / k / 1e6).toFixed(2), 'max', (mx / 1e6).toFixed(2), JSON.stringify(c._first));
}
