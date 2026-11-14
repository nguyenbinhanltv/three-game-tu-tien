import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { POSE, POSES, SKILLS } from '@dtl/content';
import { GCD, POSE_CAST, POSE_FLY, type PoseVec, validateSkillPose } from '@dtl/shared';
import { bakePose, IkRig, poseClipName, probeClip } from './ikpose';
import { buildMixamoFixture } from './mixamoFixture';
import { bakePoseLibrary } from './poseLib';
import { overlayWeight, SkinnedCharacter } from './skinned';
import type { AnimState, CharacterView } from './view';
import { FX_LEAD, releaseAt, SkillPoses } from '../skillPose';

const dist = (a: PoseVec, b: PoseVec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const STILL: AnimState = { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false };
const RUN: AnimState = { ...STILL, speed: 6 };

describe('động tác 6 chiêu (dữ liệu)', () => {
  it('mỗi chiêu có pose riêng, một lần, ≤ GCD, có nhịp chuẩn bị và ≥ 5 key', () => {
    for (const s of SKILLS) expect(validateSkillPose(s.id, s.pose, POSE, GCD), s.id).toEqual([]);
    expect(new Set(SKILLS.map((s) => s.pose)).size).toBe(SKILLS.length);
    expect(validateSkillPose('x', 'kiem_thu', POSE, GCD).join()).toMatch(/một lần/);
    expect(validateSkillPose('x', 'khong_co', POSE, GCD).join()).toMatch(/không có/);
    expect(validateSkillPose('x', 'chem_ngang', POSE, 0.5).join()).toMatch(/quá GCD/);
  });

  it('ngự kiếm và niệm chú là clip lặp', () => {
    expect(POSE.get(POSE_FLY)?.loop).toBe(true);
    expect(POSE.get(POSE_CAST)?.loop).toBe(true);
  });

  it('đầu dò mọi khung: chân chạm đất, lúc ra đòn tay trước vai; các chiêu khác nhau rõ', () => {
    const rig = IkRig.from(buildMixamoFixture())!;
    const atRelease: { id: string; hR: PoseVec; hL: PoseVec; sword: PoseVec }[] = [];
    for (const s of SKILLS) {
      const def = POSE.get(s.pose!)!;
      const clip = bakePose(def, rig);
      for (let t = 0; t <= def.duration; t += 0.05) {
        const p = probeClip(rig, clip, t);
        // Không nhảy: hai chân luôn chạm đất (sai số IK/nội suy dưới 1 cm).
        expect(Math.abs(p.footR[1]), `${def.id} t=${t}`).toBeLessThan(0.01);
        expect(Math.abs(p.footL[1]), `${def.id} t=${t}`).toBeLessThan(0.01);
      }
      const r = probeClip(rig, clip, def.hit![0] + 0.04);
      // Lúc ra đòn ít nhất một tay ở trước vai (đánh/kết ấn về phía trước, không giấu sau lưng).
      expect(Math.max(r.handRFromShoulder[2], r.handLFromShoulder[2]), def.id).toBeGreaterThan(0.08);
      atRelease.push({ id: def.id, hR: r.handR, hL: r.handL, sword: r.sword });
    }
    // Mỗi cặp chiêu khác nhau ít nhất 12 cm ở một tay lúc ra đòn, hoặc kiếm lệch hướng trên 30°.
    for (let i = 0; i < atRelease.length; i++)
      for (let j = i + 1; j < atRelease.length; j++) {
        const a = atRelease[i];
        const b = atRelease[j];
        const diff = Math.max(dist(a.hR, b.hR), dist(a.hL, b.hL));
        const ang = Math.acos(Math.min(1, a.sword[0] * b.sword[0] + a.sword[1] * b.sword[1] + a.sword[2] * b.sword[2]));
        expect(diff > 0.12 || ang > Math.PI / 6, `${a.id} ~ ${b.id}`).toBe(true);
      }
  });
});

/** Nhân vật fixture có clip nền: đứng (tư thế nghỉ tay buông) và chạy (bước dài). */
function makeChar() {
  const scene = buildMixamoFixture({ mesh: true });
  const rig = IkRig.from(scene)!;
  const lib = bakePoseLibrary(scene, POSES)!;
  const idle = bakePose({ id: 'idle', duration: 1, loop: true, keys: [{ t: 0, handR: [-0.25, -0.05, 0.02], handL: [0.25, -0.05, 0.02] }] }, rig, { name: 'idle' });
  const run = bakePose(
    { id: 'run', duration: 1, loop: true, keys: [{ t: 0, footR: [-0.1, 0.05, 0.3], footL: [0.1, 0, -0.3], handR: [-0.3, -0.1, -0.15], handL: [0.3, -0.1, 0.15] }] },
    rig,
    { name: 'run' },
  );
  const ch = new SkinnedCharacter({
    scene,
    clips: [idle, run],
    clipMap: { idle: 'idle', run: 'run', fly: poseClipName(POSE_FLY), cast: poseClipName(POSE_CAST) },
    height: 1.75,
    refSpeed: 5,
    poses: lib,
  });
  return { ch, rig, lib };
}

const step = (ch: SkinnedCharacter, a: AnimState, secs: number) => {
  for (let t = 0; t < secs - 1e-9; t += 1 / 60) ch.update(1 / 60, a);
};

describe('SkinnedCharacter.perform', () => {
  it('trọng số đè: mixer lấy trung bình nên b/(1−b) cho đúng b phần pose', () => {
    for (const b of [0.1, 0.5, 0.9]) expect(overlayWeight(b) / (1 + overlayWeight(b))).toBeCloseTo(b, 6);
    expect(overlayWeight(0)).toBe(0);
    expect(overlayWeight(1)).toBeGreaterThan(100);
  });

  it('đứng yên: cả người theo pose lúc ra đòn', () => {
    const { ch, rig, lib } = makeChar();
    step(ch, STILL, 0.3);
    const def = POSE.get('kiem_khi_tram')!;
    expect(ch.perform('kiem_khi_tram')).toBe(true);
    expect(ch.performing('kiem_khi_tram')).toBe(true);
    const n = Math.round(def.hit![0] * 60);
    for (let i = 0; i < n; i++) ch.update(1 / 60, STILL);
    const got = rig.probe();
    const want = probeClip(rig, lib.get('kiem_khi_tram')!.full, n / 60);
    expect(dist(got.handR, want.handR)).toBeLessThan(0.02);
    expect(dist(got.footR, want.footR)).toBeLessThan(0.02);
    // Hết clip thì về nền.
    step(ch, STILL, def.duration);
    expect(ch.performing('kiem_khi_tram')).toBe(false);
    expect(dist(rig.probe().handR, [-0.25, -0.05, 0.02])).toBeLessThan(0.02);
    ch.dispose();
  });

  it('đang chạy: chân theo clip chạy, tay theo pose', () => {
    const { ch, rig, lib } = makeChar();
    step(ch, RUN, 0.4);
    ch.perform('phi_kiem');
    const t = POSE.get('phi_kiem')!.hit![0];
    step(ch, RUN, t);
    const got = rig.probe();
    expect(dist(got.footR, [-0.1, 0.05, 0.3])).toBeLessThan(0.02);
    const want = probeClip(rig, lib.get('phi_kiem')!.upper, t);
    // Thân trên theo pose so với vai (hông không xoay như pose gốc).
    expect(Math.abs(Math.hypot(...got.handLFromShoulder) - Math.hypot(...want.handLFromShoulder))).toBeLessThan(0.02);
    ch.dispose();
  });

  it('không ra đòn khi trên không / ngự kiếm / chết; bay lên giữa chừng thì tắt', () => {
    const { ch } = makeChar();
    for (const a of [{ ...STILL, airborne: true }, { ...STILL, flying: true }, { ...STILL, dead: true }]) {
      step(ch, a, 0.1);
      expect(ch.perform('phi_kiem')).toBe(true);
      expect(ch.performing('phi_kiem')).toBe(false);
    }
    step(ch, STILL, 0.3);
    ch.perform('thien_kiem_vu');
    step(ch, STILL, 0.1);
    expect(ch.performing('thien_kiem_vu')).toBe(true);
    step(ch, { ...STILL, airborne: true }, 0.15);
    expect(ch.performing('thien_kiem_vu')).toBe(false);
    ch.dispose();
  });

  it('xếp lịch rồi hủy trước lúc ra đòn (chú bị phá)', () => {
    const { ch } = makeChar();
    step(ch, STILL, 0.1);
    ch.perform('loi_dinh', { delay: 0.5 });
    expect(ch.performing('loi_dinh')).toBe(true);
    step(ch, STILL, 0.3);
    ch.cancelPerform();
    step(ch, STILL, 0.5);
    expect(ch.performing('loi_dinh')).toBe(false);
    // Hủy sau lúc ra đòn thì để chạy hết.
    ch.perform('loi_dinh');
    step(ch, STILL, releaseAt(SKILLS.find((s) => s.pose === 'loi_dinh')) + 0.05);
    ch.cancelPerform();
    step(ch, STILL, 0.2);
    expect(ch.performing('loi_dinh')).toBe(true);
    ch.dispose();
  });

  it('bay và niệm chú dùng clip nướng từ pose', () => {
    const { ch } = makeChar();
    step(ch, { ...STILL, flying: true }, 0.3);
    expect(ch.actionOf(poseClipName(POSE_FLY))?.isRunning()).toBe(true);
    step(ch, { ...STILL, casting: true }, 0.3);
    expect(ch.actionOf(poseClipName(POSE_CAST))?.isRunning()).toBe(true);
    ch.dispose();
  });

  it('pose không có trong thư viện thì trả false (gọi attack thay)', () => {
    const { ch } = makeChar();
    expect(ch.perform('khong_co')).toBe(false);
    ch.dispose();
  });
});

describe('SkillPoses (khớp động tác với FX)', () => {
  const fake = () => {
    const calls: { pose: string; o?: { from?: number; delay?: number } }[] = [];
    let current = '';
    const m = {
      attack: vi.fn(),
      perform: (pose: string, o?: { from?: number; delay?: number }) => {
        calls.push({ pose, o });
        current = pose;
        return true;
      },
      performing: (p: string) => p === current,
      cancelPerform: vi.fn(),
    } as unknown as CharacterView;
    return { m, calls };
  };
  const phi = SKILLS.find((s) => s.fx === 'sword')!;

  it('đòn của mình: vào thế khi bấm; FX về sớm thì giữ hiệu ứng tới lúc ra đòn', () => {
    const sp = new SkillPoses();
    const { m, calls } = fake();
    sp.predict(m, phi, 1000);
    expect(calls).toEqual([{ pose: 'phi_kiem', o: undefined }]);
    const hold = sp.onFx('sword', m, true, 1060);
    expect(hold).toBeCloseTo(releaseAt(phi) - 0.06, 5);
    expect(sp.holdLeft(1060)).toBeCloseTo(hold, 5);
    expect(calls.length).toBe(1);
    // FX về sau lúc ra đòn: phát ngay, không chạy lại động tác.
    sp.predict(m, phi, 5000);
    expect(sp.onFx('sword', m, true, 5000 + releaseAt(phi) * 1000 + 50)).toBe(0);
    expect(calls.length).toBe(2);
  });

  it('người khác: bắt đầu gần lúc ra đòn; model khối thì attack()', () => {
    const sp = new SkillPoses();
    const { m, calls } = fake();
    expect(sp.onFx('slash', m, false, 0)).toBe(0);
    const slash = SKILLS.find((s) => s.fx === 'slash')!;
    expect(calls[0].pose).toBe(slash.pose);
    expect(calls[0].o?.from).toBeCloseTo(releaseAt(slash) - FX_LEAD, 6);
    const block = { attack: vi.fn() } as unknown as CharacterView;
    sp.onFx('rain', block, false, 0);
    sp.onFx('heal', block, false, 0);
    expect(block.attack).toHaveBeenCalledTimes(1);
  });

  it('niệm chú: xếp lịch động tác chém để ra đòn đúng lúc niệm xong; FX tới thì không phát lại', () => {
    const sp = new SkillPoses();
    const { m, calls } = fake();
    const thunder = SKILLS.find((s) => s.cast > 0)!;
    sp.onCast(m, thunder.cast);
    expect(calls[0].pose).toBe(thunder.pose);
    expect(calls[0].o?.delay).toBeCloseTo(thunder.cast - releaseAt(thunder), 6);
    sp.onFx(thunder.fx, m, false, 0);
    expect(calls.length).toBe(1);
    sp.onCastEnd(m);
    expect(m.cancelPerform).toHaveBeenCalled();
  });
});

describe('dự đoán theo trạng thái thật của model', () => {
  const phi = SKILLS.find((s) => s.fx === 'sword')!;

  it('đang thiền vẫn ra chiêu (server tự dừng thiền): động tác phát, FX về sớm thì giữ tới lúc ra đòn', () => {
    const { ch } = makeChar();
    step(ch, { ...STILL, meditating: true }, 0.3);
    const sp = new SkillPoses();
    sp.predict(ch, phi, 1000);
    expect(ch.performing('phi_kiem')).toBe(true);
    expect(sp.onFx('sword', ch, true, 1050)).toBeGreaterThan(0.1);
    ch.dispose();
  });

  it('trên không / ngự kiếm: không ghi dự đoán, FX về thì phát ngay (không giữ hiệu ứng, không trễ sát thương)', () => {
    for (const a of [{ ...STILL, airborne: true }, { ...STILL, flying: true }]) {
      const { ch } = makeChar();
      step(ch, a, 0.2);
      const sp = new SkillPoses();
      sp.predict(ch, phi, 1000);
      expect(ch.performing('phi_kiem')).toBe(false);
      expect(sp.onFx('sword', ch, true, 1050)).toBe(0);
      expect(sp.holdLeft(1050)).toBe(0);
      ch.dispose();
    }
  });
});

describe('chi phí', () => {
  it('nướng thư viện pose cho một rig', () => {
    const scene = buildMixamoFixture();
    const t0 = performance.now();
    const lib = bakePoseLibrary(scene, POSES)!;
    const ms = performance.now() - t0;
    console.info(`[perf] nướng ${lib.size} pose: ${ms.toFixed(1)}ms`);
    expect(lib.size).toBe(POSES.length);
    expect(new THREE.Vector3().copy(scene.position).length()).toBe(0);
  });
});
