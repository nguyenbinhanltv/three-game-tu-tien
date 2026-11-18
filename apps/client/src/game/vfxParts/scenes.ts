// R-8: tách từ game/vfx.ts (hàm nhận `v: Vfx`, trước là phương thức của lớp Vfx).
import * as THREE from 'three/webgpu';
import { groundAt } from '../levelCtx';
import { type FxMesh } from '../../render/materials/vfx';
import { SIGIL_CIRCLE, SIGIL_RECT, sigilLayout } from '../../render/vfx/sigil';
import { seedOr } from '../../render/vfx/common';
import { VORTEX_GEO } from '../../render/vfx/lightning';
import { G } from '../geo';
import { CLOUD_COLOR, PosFn, RING_GEO, TUBE_GEO, _a, _up } from './common';
import type { Vfx } from '../vfx';

/**
 * Đột phá thành công (P2-B4): quầng vàng ấm tỏa từ người, một ống sáng mảnh và chùm tia nắng xòe lên như mây kiếp
 * vừa tách. Mảnh và cộng sáng để giữ màu cảnh (khác `pillar` bọc kín trước camera). 1 + 1 + 5 lưới trong ~2,6 giây.
 */
export function ascendGlow(v: Vfx, pos: PosFn, dur = 2.6, danQuang = false, nguyenAnh = false, hoaThan = false): void {
  // Hóa Thần (E4-D): cùng nhịp mảnh và mờ như Nguyên Anh nhưng màu vàng sao nhạt (bảng `dotpha_hn`).
  const soft = nguyenAnh || hoaThan;
  const core = v.fx(TUBE_GEO, hoaThan ? 0xfff0c0 : nguyenAnh ? 0xcdbcff : danQuang ? 0xffcf8a : 0xffe6a0, 0.3, 'flat');
  const ring = v.fx(RING_GEO, hoaThan ? 0xffe9a8 : nguyenAnh ? 0x9fc8ff : danQuang ? 0x8fcfff : 0xffd98a, 0.7);
  // Kết Đan: thêm một vành đan quang vàng ấm nở chậm hơn vành lam (vẫn cộng sáng, mảnh).
  const ring2 = danQuang || soft ? v.fx(RING_GEO, hoaThan ? 0xcfe0ff : nguyenAnh ? 0xd9ccff : 0xffd98a, 0.5) : null;
  if (ring2) ring2.rotation.x = -Math.PI / 2;
  ring.rotation.x = -Math.PI / 2;
  const rays: { m: FxMesh; dir: THREE.Vector3 }[] = [];
  for (let i = 0; i < 5; i++) {
    const phi = (i / 5) * Math.PI * 2 + 0.4;
    const th = 0.16 + (i % 2) * 0.12;
    const dir = new THREE.Vector3(Math.sin(th) * Math.cos(phi), Math.cos(th), Math.sin(th) * Math.sin(phi));
    rays.push({ m: v.fx(TUBE_GEO, hoaThan ? 0xfff2c8 : nguyenAnh ? 0xcfc6ee : 0xffe2a0, 0.2, 'glow'), dir });
  }
  v.add(
    dur,
    (k) => {
      if (!pos(_a)) return;
      const rise = Math.min(1, k * 4);
      const fade = Math.pow(1 - k, 1.5);
      const h = 46 * rise;
      core.position.set(_a.x, _a.y - 1.1 + h / 2, _a.z);
      core.scale.set(soft ? 0.35 : 0.8, h, soft ? 0.35 : 0.8);
      core.fxOpacity = (soft ? 0.07 : danQuang ? 0.2 : 0.3) * (soft ? Math.pow(1 - k, 2.4) : fade);
      ring.position.set(_a.x, _a.y - 1.0, _a.z);
      ring.scale.setScalar(soft ? 1.0 + k * 3.6 : 1.2 + k * 7);
      ring.fxOpacity = (soft ? 0.2 : 0.7) * (1 - k);
      if (ring2) {
        ring2.position.set(_a.x, _a.y - 0.4 + k * 2.2, _a.z);
        ring2.scale.setScalar(soft ? 0.7 + k * 2.4 : 0.8 + k * 4.2);
        ring2.fxOpacity = (soft ? 0.14 : 0.5) * Math.pow(1 - k, 1.3);
      }
      for (const r of rays) {
        const len = 55 * rise;
        r.m.position.set(_a.x + (r.dir.x * len) / 2, _a.y - 1.1 + (r.dir.y * len) / 2, _a.z + (r.dir.z * len) / 2);
        r.m.quaternion.setFromUnitVectors(_up, r.dir);
        r.m.scale.set(soft ? 0.45 + k * 0.5 : 1.1 + k * 1.5, len, soft ? 0.45 + k * 0.5 : 1.1 + k * 1.5);
        r.m.fxOpacity = (soft ? 0.035 : danQuang ? 0.11 : 0.2) * (soft ? Math.pow(1 - k, 2.4) : fade);
      }
    },
    () => {
      v.drop(core);
      v.drop(ring);
      if (ring2) v.drop(ring2);
      for (const r of rays) v.drop(r.m);
    },
  );
}

/**
 * Hồi sinh (P2-B5): linh quang xanh ngọc nhạt dâng quanh người: ống sáng mảnh, hai vành sóng nối nhau và một vòng
 * hạt linh khí xoáy bay lên. Cộng sáng, mảnh, để lộ màu cảnh khi mực đang rút. 3 + 10 lưới trong ~2,4 giây.
 */
export function reviveGlow(v: Vfx, pos: PosFn, dur = 2.4): void {
  const core = v.fx(TUBE_GEO, 0xcdf6ff, 0.34, 'flat');
  const rings = [v.fx(RING_GEO, 0xbff0ff, 0.8), v.fx(RING_GEO, 0xfff1c4, 0.6)];
  for (const r of rings) r.rotation.x = -Math.PI / 2;
  const N = 10;
  const motes: FxMesh[] = [];
  for (let i = 0; i < N; i++) motes.push(v.fx(G.ico1, i % 3 === 0 ? 0xfff1c4 : 0xbff0ff, 0.9));
  v.add(
    dur,
    (k) => {
      if (!pos(_a)) return;
      const rise = Math.min(1, k * 3);
      const fade = Math.pow(1 - k, 1.4);
      const h = 9 * rise;
      core.position.set(_a.x, _a.y - 1.1 + h / 2, _a.z);
      core.scale.set(0.55 * (1 - k * 0.5), h, 0.55 * (1 - k * 0.5));
      core.fxOpacity = 0.34 * fade;
      rings.forEach((r, j) => {
        const kk = Math.max(0, Math.min(1, (k - j * 0.18) / 0.82));
        r.position.set(_a.x, _a.y - 1.0, _a.z);
        r.scale.setScalar(0.8 + kk * 4.5);
        r.fxOpacity = 0.8 * (1 - kk) * (kk > 0 || j === 0 ? 1 : 0);
      });
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + k * 5;
        const r = (1.5 - k * 0.9) * (0.75 + (i % 3) * 0.2);
        const y = (0.2 + ((k * 3 + i * 0.37) % 1) * 4.2) * (0.6 + 0.4 * rise);
        motes[i].position.set(_a.x + Math.cos(a) * r, _a.y - 1.1 + y, _a.z + Math.sin(a) * r);
        motes[i].scale.setScalar(0.16 * (1 - k * 0.6));
        motes[i].fxOpacity = 0.9 * fade;
      }
    },
    () => {
      v.drop(core);
      for (const r of rings) v.drop(r);
      for (const m of motes) v.drop(m);
    },
  );
}

/**
 * Nguyên anh xuất khiếu (E3-L): một bóng người nhỏ xanh nhạt trong suốt lơ lửng phía trên thân, nối với thân bằng một sợi sáng mảnh.
 * Tông trầm, mờ, cộng sáng thấp để không che nhân vật. Tự khép khi `on()` sai hoặc hết `dur`; `stop()` khép sớm.
 */
export function soulOut(v: Vfx, pos: PosFn, dur: number, on: () => boolean): { stop(): void } {
  const body = v.fx(G.ico1, 0x9fcfff, 0.3);
  const head = v.fx(G.ico1, 0xc6e2ff, 0.4);
  const cord = v.fx(TUBE_GEO, 0x8fb8f0, 0.16, 'flat');
  let t = 0;
  let fade = 0;
  let stopping = false;
  const it = {
    t: 0,
    dur: dur + 1,
    update: (_k: number, dt: number) => {
      t += dt;
      const live = !stopping && t < dur && on();
      fade = live ? Math.min(1, fade + dt * 4) : Math.max(0, fade - dt * 3);
      if (!live && fade <= 0) it.t = it.dur;
      if (!pos(_a)) return;
      const bob = Math.sin(t * 2.2) * 0.12;
      const hy = _a.y + 2.6 + bob;
      body.position.set(_a.x, hy, _a.z);
      body.scale.set(0.28, 0.5, 0.2);
      body.fxOpacity = 0.3 * fade;
      head.position.set(_a.x, hy + 0.6, _a.z);
      head.scale.setScalar(0.17);
      head.fxOpacity = 0.4 * fade;
      const len = Math.max(0.1, hy - _a.y - 0.4);
      cord.position.set(_a.x, _a.y + 0.4 + len / 2, _a.z);
      cord.scale.set(0.05, len, 0.05);
      cord.fxOpacity = 0.16 * fade;
    },
    end: () => {
      v.drop(body);
      v.drop(head);
      v.drop(cord);
    },
  };
  v.items.push(it);
  return {
    stop: () => {
      stopping = true;
    },
  };
}

/**
 * Thế thân thần niệm (E4-D): bóng người vàng sao nhạt trong suốt đứng yên ở (x, z) trong `dur` giây, vòng sao nhạt dưới chân, vài hạt sao bay lên.
 * `end(boom)` thu lại (boom = nổ ra một chớp khi gánh đòn). Cộng sáng, mờ, dưới trần HDR.
 */
export function thanNiem(v: Vfx, x: number, z: number, groundY: number, dur: number, on: () => boolean): { stop(boom?: boolean): void } {
  const body = v.fx(G.ico1, 0xf2dc96, 0.34);
  const head = v.fx(G.ico1, 0xfff4cf, 0.44);
  const ring = v.fx(RING_GEO, 0xffe9a8, 0.5);
  ring.rotation.x = -Math.PI / 2;
  const motes: FxMesh[] = [];
  for (let i = 0; i < 6; i++) motes.push(v.fx(G.ico1, i % 2 ? 0xfff4cf : 0xaee0ff, 0.7));
  let t = 0;
  let fade = 0;
  let stopping = false;
  let boom = false;
  const it = {
    t: 0,
    dur: dur + 2,
    update: (_k: number, dt: number) => {
      t += dt;
      const live = !stopping && t < dur && on();
      fade = live ? Math.min(1, fade + dt * 3) : Math.max(0, fade - dt * 3);
      if (!live && fade <= 0) it.t = it.dur;
      const bob = Math.sin(t * 1.8) * 0.06;
      const y = groundY + 1.1 + bob;
      body.position.set(x, y, z);
      body.scale.set(0.34, 0.9, 0.24);
      body.fxOpacity = 0.3 * fade;
      head.position.set(x, y + 0.85, z);
      head.scale.setScalar(0.2);
      head.fxOpacity = 0.42 * fade;
      ring.position.set(x, groundY + 0.06, z);
      ring.scale.setScalar(1.3 + Math.sin(t * 2) * 0.08);
      ring.fxOpacity = 0.4 * fade;
      motes.forEach((m, i) => {
        const k = (t * 0.35 + i / motes.length) % 1;
        const a = (i / motes.length) * Math.PI * 2 + t * 0.6;
        m.position.set(x + Math.cos(a) * 0.7, groundY + 0.3 + k * 2.4, z + Math.sin(a) * 0.7);
        m.scale.setScalar(0.07);
        m.fxOpacity = 0.6 * fade * (1 - k);
      });
    },
    end: () => {
      if (boom) v.burst(new THREE.Vector3(x, groundY + 1.2, z), 0xffe9a8, 2.4, 0.5);
      for (const m of [body, head, ring, ...motes]) v.drop(m);
    },
  };
  v.items.push(it);
  return {
    stop: (b = false) => {
      stopping = true;
      boom = b;
    },
  };
}

/**
 * Quầng nhận diện Tâm Ma Ảnh (E3-L): vành tím dưới chân bóng + vành đỏ sẫm nở nhịp + một sợi khói tím mảnh bốc lên theo dáng bóng,
 * để thấy rõ bản sao tối màu của người chơi ngay cả khi nhìn từ xa/trên cao. Tông trầm, mảnh, mờ dần ở mép; không lóa.
 * `at(out)` trả vị trí chân bóng (false = chưa có); tự khép khi `on()` sai.
 */
export function tamMaAura(v: Vfx, at: (out: THREE.Vector3) => boolean, on: () => boolean): void {
  const ring = v.fx(RING_GEO, 0x9a5fd8, 0.3);
  const ring2 = v.fx(RING_GEO, 0xc2485a, 0.2);
  const wisp = v.fx(TUBE_GEO, 0x7b55b8, 0.1, 'flat');
  ring.rotation.x = -Math.PI / 2;
  ring2.rotation.x = -Math.PI / 2;
  let t = 0;
  let fade = 0;
  const it = {
    t: 0,
    dur: 120,
    update: (_k: number, dt: number) => {
      t += dt;
      const live = on();
      fade = live ? Math.min(1, fade + dt * 2.5) : Math.max(0, fade - dt * 3);
      if (!live && fade <= 0) it.t = it.dur;
      if (!at(_a)) {
        ring.fxOpacity = ring2.fxOpacity = wisp.fxOpacity = 0;
        return;
      }
      ring.position.set(_a.x, _a.y + 0.12, _a.z);
      ring.scale.setScalar(1.5);
      ring.fxOpacity = 0.3 * fade;
      const p = (t * 0.8) % 1;
      ring2.position.set(_a.x, _a.y + 0.14, _a.z);
      ring2.scale.setScalar(1.2 + p * 1.4);
      ring2.fxOpacity = 0.2 * (1 - p) * fade;
      wisp.position.set(_a.x, _a.y + 1.5, _a.z);
      wisp.scale.set(0.12, 3, 0.12);
      wisp.fxOpacity = 0.045 * fade;
    },
    end: () => {
      v.drop(ring);
      v.drop(ring2);
      v.drop(wisp);
    },
  };
  v.items.push(it);
}

/**
 * Mây kiếp xoáy (M4-4) trên đầu người độ kiếp: một đĩa xoắn ốc vẽ trong fragment, mắt bão tím ở
 * giữa, bừng sáng trong mây khi có tia sét đánh gần. `seed` (từ server) cho cùng vân mây.
 */
export function tribulationCloud(v: Vfx, pos: PosFn, dur: number, stillOn: () => boolean, seed?: number): void {
  // Hai tầng xoáy ngược chiều, tầng dưới nhỏ và thấp hơn: mây dày và có chiều sâu mà chỉ thêm 1 draw call.
  const layers = [
    { y: 48, scale: 125, spin: 0.06, op: 0.95, seedAdd: 0 },
    { y: 34, scale: 90, spin: -0.1, op: 0.8, seedAdd: 41 },
  ];
  for (const L of layers) {
    const cloud = v.fx(VORTEX_GEO, CLOUD_COLOR, 0, 'vortex');
    cloud.fxA.z = ((seedOr(seed) + L.seedAdd) % 997) / 10;
    v.clouds.add(cloud);
    let t = 0;
    let op = 0;
    v.add(
      dur + 1.5,
      (_k, dt) => {
        t += dt;
        cloud.fxA.y = Math.max(0, cloud.fxA.y - dt * 3);
        if (!pos(_a)) return;
        op = stillOn() ? Math.min(1, t / 2.5) : Math.max(0, op - dt);
        cloud.position.set(_a.x, _a.y + L.y, _a.z);
        cloud.scale.setScalar(L.scale);
        cloud.rotation.y = t * L.spin;
        cloud.fxOpacity = op * L.op;
      },
      () => {
        v.clouds.delete(cloud);
        v.drop(cloud);
      },
    );
  }
}

/**
 * Đan Trận (E2-D, Đan Hỏa Kiếp): vòng pháp trận lam đậm nằm dưới chân người độ kiếp, vành tiến độ chạy theo thanh ngưng đan,
 * một viên đan nhỏ lơ lửng giữa vòng lớn dần và ngả sang vàng ấm khi đầy. Tông trầm, mảnh, cộng sáng thấp để không che người.
 * Trả tay cầm: `set(pg)` cập nhật tiến độ 0..100, `stop()` khép vòng. Tự khép khi `stillOn()` sai (hết kiếp, chết).
 */
export function danTran(v: Vfx, x: number, z: number, r: number, dur: number, stillOn: () => boolean): { set(pg: number): void; stop(): void } {
  const y = groundAt(x, z);
  const m = v.sigil(SIGIL_CIRCLE, x, z, 0, r, 0, 0x4f8fd8, y + 0.18);
  const orb = v.fx(G.ico1, 0x7fbfff, 0.5);
  const ring = v.fx(RING_GEO, 0x6fa8ee, 0.4);
  ring.rotation.x = -Math.PI / 2;
  let pg = 0;
  let t = 0;
  let fade = 0;
  let stopping = false;
  const it = {
    t: 0,
    dur: dur + 2,
    update: (_k: number, dt: number) => {
      t += dt;
      const on = !stopping && stillOn();
      fade = on ? Math.min(1, fade + dt * 3) : Math.max(0, fade - dt * 2.5);
      if (!on && fade <= 0) it.t = it.dur;
      const f = pg / 100;
      m.fxA.x = f;
      m.fxA.z = 0;
      m.fxOpacity = 0.75 * fade;
      const pulse = 1 + Math.sin(t * 2.4) * 0.06;
      ring.position.set(x, y + 0.25, z);
      ring.scale.setScalar(r * 0.98 * pulse);
      ring.fxOpacity = 0.35 * fade;
      orb.position.set(x, y + 3.1 + Math.sin(t * 1.7) * 0.12, z);
      orb.scale.setScalar(0.08 + 0.2 * f);
      orb.fxColor.setHex(f >= 1 ? 0xffd79a : 0x7fbfff);
      orb.fxOpacity = (0.25 + 0.3 * f) * fade;
    },
    end: () => {
      v.drop(m);
      v.drop(orb);
      v.drop(ring);
    },
  };
  v.items.push(it);
  return {
    set: (v) => {
      pg = Math.max(0, Math.min(100, v));
    },
    stop: () => {
      stopping = true;
    },
  };
}

/**
 * Đĩa gương (E3-M, Kính Nguyệt Chân Quân): `n` tia dài `len` rộng `w` xoay quanh (x, z) từ góc `theta0` (rad) với tốc độ `spin`
 * độ/giây, theo CÙNG công thức server (`discAngle`: góc 0 hướng +z). `warn` giây đầu tia mờ và chưa gây sát thương (vạch tụ dần), sau
 * đó sáng lên; một vành đĩa mờ nằm dưới chân. Cộng sáng thấp, sắc lam bạc để không che nhân vật. Tự tắt khi hết giờ hoặc `stillOn()` sai.
 */
export function mirrorDisc(v: Vfx, x: number, z: number, len: number, w: number, n: number, theta0: number, spin: number, warn: number, dur: number, stillOn: () => boolean): void {
  const y = groundAt(x, z) + 0.16;
  const L = sigilLayout(SIGIL_RECT, len, w);
  const beams: FxMesh[] = [];
  for (let i = 0; i < n; i++) beams.push(v.sigil(SIGIL_RECT, x, z, 0, len, w, 0x9fd0ff, y));
  const ring = v.fx(RING_GEO, 0xbfe0ff, 0.3);
  ring.rotation.x = -Math.PI / 2;
  let t = 0;
  let fade = 0;
  const it = {
    t: 0,
    dur: warn + dur + 1,
    update: (_k: number, dt: number) => {
      t += dt;
      const on = t < warn + dur && stillOn();
      fade = on ? Math.min(1, fade + dt * 4) : Math.max(0, fade - dt * 3);
      if (!on && fade <= 0) it.t = it.dur;
      const live = t >= warn;
      const rot = live ? t - warn : 0;
      for (let i = 0; i < beams.length; i++) {
        const yaw = theta0 + (i * Math.PI * 2) / n + (spin * Math.PI * rot) / 180;
        const m = beams[i];
        m.position.set(x + Math.sin(yaw) * L.offset, y, z + Math.cos(yaw) * L.offset);
        m.rotation.y = yaw;
        m.fxA.x = live ? 1 : Math.min(1, t / warn);
        m.fxOpacity = (live ? 0.8 : 0.4) * fade;
        m.fxColor.setHex(live ? 0xdff0ff : 0x9fd0ff);
      }
      ring.position.set(x, y + 0.05, z);
      ring.scale.setScalar(2.6 + Math.sin(t * 3) * 0.12);
      ring.fxOpacity = 0.35 * fade;
    },
    end: () => {
      for (const m of beams) v.drop(m);
      v.drop(ring);
    },
  };
  v.items.push(it);
}

/**
 * Cột gương của đợt đố (E3-M): ống sáng mảnh ở (x, z) tới khi hết `dur` giây hoặc `stillOn()` sai; `lit` thì sáng hơn
 * (đã chạm đúng). Màu theo thứ tự cột (lam, đỏ, vàng).
 */
export function mirrorPillar(v: Vfx, x: number, z: number, color: number, dur: number, lit: boolean, stillOn: () => boolean): void {
  const y = groundAt(x, z);
  const tube = v.fx(TUBE_GEO, color, lit ? 0.5 : 0.28, 'flat');
  const ring = v.fx(RING_GEO, color, lit ? 0.9 : 0.55);
  ring.rotation.x = -Math.PI / 2;
  let t = 0;
  let fade = 0;
  const it = {
    t: 0,
    dur: dur + 1,
    update: (_k: number, dt: number) => {
      t += dt;
      const on = t < dur && stillOn();
      fade = on ? Math.min(1, fade + dt * 3) : Math.max(0, fade - dt * 2);
      if (!on && fade <= 0) it.t = it.dur;
      const pulse = 1 + Math.sin(t * 3.2) * 0.08;
      tube.position.set(x, y + 4.5, z);
      tube.scale.set(0.9 * pulse, 9, 0.9 * pulse);
      tube.fxOpacity = (lit ? 0.5 : 0.28) * fade;
      ring.position.set(x, y + 0.15, z);
      ring.scale.setScalar(2.4 * pulse);
      ring.fxOpacity = (lit ? 0.9 : 0.55) * fade;
    },
    end: () => {
      v.drop(tube);
      v.drop(ring);
    },
  };
  v.items.push(it);
}

/**
 * Bia Kim dạ (DV-3E): vòng kim dát quanh bia (bán kính `r` = ranh vòng sáng trên server) và cột sáng mảnh; `lit` thì vàng sáng, tắt thì tím thẫm
 * mờ. Tự khép khi hết `dur` giây hoặc `stillOn()` sai (server gửi lại mỗi 2 s nên đổi sáng/tắt thay hình ngay). Cường độ thấp để không che người.
 */
export function kdStele(v: Vfx, x: number, z: number, r: number, dur: number, lit: boolean, stillOn: () => boolean): void {
  const y = groundAt(x, z);
  const color = lit ? 0xe0b44a : 0x6a3fa0;
  const o = lit ? 0.7 : 0.4;
  const tube = v.fx(TUBE_GEO, color, lit ? 0.4 : 0.18, 'flat');
  const ring = v.fx(RING_GEO, color, o);
  ring.rotation.x = -Math.PI / 2;
  let t = 0;
  let fade = 0;
  const it = {
    t: 0,
    dur: dur + 1,
    update: (_k: number, dt: number) => {
      t += dt;
      const on = t < dur && stillOn();
      fade = on ? Math.min(1, fade + dt * 3) : Math.max(0, fade - dt * 2);
      if (!on && fade <= 0) it.t = it.dur;
      const pulse = 1 + Math.sin(t * 2.4) * 0.05;
      tube.position.set(x, y + 6, z);
      tube.scale.set(1.1 * pulse, 12, 1.1 * pulse);
      tube.fxOpacity = (lit ? 0.4 : 0.18) * fade;
      ring.position.set(x, y + 0.15, z);
      ring.scale.setScalar(r * pulse);
      ring.fxOpacity = o * fade;
    },
    end: () => {
      v.drop(tube);
      v.drop(ring);
    },
  };
  v.items.push(it);
}
