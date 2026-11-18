import { useEffect, useState } from 'react';
import { METHOD_SKILLS, POSE, SKILLS, skillName, t } from '@dtl/content';
import { POSE_VOICES, VOICED_POSES, type PoseVoice } from '@dtl/shared';
import { poseOf } from '../game/combat/skillPose';
import { poseClipName } from '../game/character/ikpose';
import { timingOf } from './skillTiming';
import type { ViewerScene } from './scene';
import { urlParams } from '../game/core/flags';

const s2 = (n: number) => n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ALL = [...SKILLS, ...METHOD_SKILLS].filter((s) => s.pose);

/**
 * Bảng xem chiêu (K-1, `?show=skill&id=…`): chọn chiêu, phát/dừng, chậm, thanh kéo thời gian có mốc khung khóa và khung vung,
 * camera quanh người, khung xương, đầu dò số (tay/chân/mũi kiếm) theo khung đang xem.
 */
export function SkillPanel({ viewer, skillId, onPick, clips }: { viewer: ViewerScene; skillId: string; onPick: (id: string) => void; clips: string[] }) {
  const skill = ALL.find((s) => s.id === skillId) ?? ALL[0];
  // Giọng động tác (K-5) và đòn thứ mấy của chuỗi: `?voice=hp&hit=2` mở thẳng; chỉ chiêu có đủ bộ mới đổi được.
  const q = urlParams();
  const [voice, setVoice] = useState<PoseVoice>(() => (POSE_VOICES as readonly string[]).includes(q.get('voice') ?? '') ? (q.get('voice') as PoseVoice) : 'kt');
  const [hit, setHit] = useState(() => Math.max(0, Number(q.get('hit') ?? 1) - 1) || 0);
  const voiced = VOICED_POSES.has(skill.pose!);
  const hits = skill.combo?.hits.length ?? 1;
  const method = { kt: 'lac_kiem_quyet', hp: 'bat_dong_kim_than', ds: 'thanh_moc_dan_kinh' }[voice];
  const pose = POSE.get(poseOf(skill, hits > 1 ? Math.min(hit, hits - 1) : undefined, voiced ? method : undefined))!;
  const tm = timingOf(skill, pose);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [probe, setProbe] = useState('');
  const [bones, setBones] = useState(false);
  const [spin, setSpin] = useState(false);

  // `clips` là mảng mới mỗi lần cha vẽ lại: chỉ phát lại khi đổi chiêu hay đổi danh sách clip thật sự.
  const clipsKey = clips.join('|');
  useEffect(() => {
    const i = clipsKey.split('|').indexOf(poseClipName(pose.id));
    if (i >= 0) viewer.playClip(i);
    viewer.paused = false;
    setPaused(false);
  }, [viewer, pose.id, clipsKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTime(viewer.clipTime);
      setProbe(viewer.probeText());
    }, 80);
    return () => window.clearInterval(id);
  }, [viewer]);

  const pct = (x: number) => `${Math.min(100, (x / pose.duration) * 100)}%`;
  const step = (d: number) => {
    viewer.paused = true;
    setPaused(true);
    viewer.scrub(Math.min(Math.max(0, viewer.clipTime + d), pose.duration - 1e-3));
  };

  return (
    <div className="skill-panel">
      <h2>{t('viewer.skill.title')}</h2>
      <select value={skill.id} onChange={(e) => onPick(e.target.value)}>
        {ALL.map((s) => (
          <option key={s.id} value={s.id}>
            {skillName(s.id)} ({s.pose})
          </option>
        ))}
      </select>

      {(voiced || hits > 1) && (
        <div className="viewer-anim">
          {voiced && (
            <label>
              {t('viewer.skill.voice')}{' '}
              <select value={voice} onChange={(e) => setVoice(e.target.value as PoseVoice)}>
                {POSE_VOICES.map((v) => (
                  <option key={v} value={v}>
                    {t('viewer.skill.voice.' + v)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {hits > 1 && (
            <label>
              {t('viewer.skill.combo')}{' '}
              <select value={Math.min(hit, hits - 1)} onChange={(e) => setHit(Number(e.target.value))}>
                {Array.from({ length: hits }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="viewer-anim">
        <button
          onClick={() => {
            viewer.paused = !paused;
            setPaused(!paused);
          }}
        >
          {paused ? t('viewer.play') : t('viewer.pause')}
        </button>
        <button onClick={() => step(-1 / 30)}>◀</button>
        <button onClick={() => step(1 / 30)}>▶</button>
        <button
          onClick={() => {
            viewer.scrub(0);
            viewer.paused = false;
            setPaused(false);
            viewer.playClip(Math.max(0, clips.indexOf(poseClipName(pose.id))));
          }}
        >
          ⟲
        </button>
        <label>
          {t('viewer.speed')}{' '}
          <select
            value={speed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeed(v);
              viewer.speed = v;
            }}
          >
            {[0.1, 0.25, 0.5, 1].map((x) => (
              <option key={x} value={x}>
                {x.toLocaleString('vi-VN')}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="skill-track">
        <input
          type="range"
          min={0}
          max={pose.duration}
          step={1 / 60}
          value={Math.min(time, pose.duration)}
          onChange={(e) => {
            viewer.paused = true;
            setPaused(true);
            viewer.scrub(Number(e.target.value));
          }}
        />
        <div className="skill-marks">
          {pose.keys.map((k, i) => (
            <i key={i} style={{ left: pct(k.t) }} title={`${t('viewer.skill.key')} ${i + 1}: ${s2(k.t)}s`} />
          ))}
          {pose.hit && <b style={{ left: pct(pose.hit[0]), width: `calc(${pct(pose.hit[1])} - ${pct(pose.hit[0])})` }} />}
        </div>
        <p className="viewer-hint">
          {t('viewer.skill.time', { t: s2(time), d: s2(pose.duration) })} · {t('viewer.skill.legend')}
        </p>
      </div>

      {tm && (
        <dl>
          <dt>{t('viewer.skill.keys')}</dt>
          <dd>
            {tm.keys.length}: {tm.keys.map(s2).join(' · ')}
          </dd>
          <dt>{t('viewer.skill.windup')}</dt>
          <dd>{s2(tm.windup)}s</dd>
          <dt>{t('viewer.skill.hit')}</dt>
          <dd>
            {s2(tm.hit[0])} – {s2(tm.hit[1])}s
          </dd>
          <dt>{t('viewer.skill.recovery')}</dt>
          <dd>{s2(tm.recovery)}s</dd>
          <dt>{t('viewer.skill.server')}</dt>
          <dd>
            {s2(tm.serverAt)}s ({tm.cast > 0 ? t('viewer.skill.after_cast') : t('viewer.skill.instant')})
          </dd>
          <dt>{t('viewer.skill.fx')}</dt>
          <dd>{s2(tm.fxAt)}s</dd>
          <dt>{t('viewer.skill.gcd')}</dt>
          <dd>
            {s2(tm.gcd)}s · CD {tm.cd}s
          </dd>
        </dl>
      )}

      <h3>{t('viewer.skill.camera')}</h3>
      <div className="viewer-anim">
        {(['front', 'side', 'back', 'iso'] as const).map((v) => (
          <button key={v} onClick={() => viewer.setView(v)}>
            {t('viewer.skill.view.' + v)}
          </button>
        ))}
        <label>
          <input
            type="checkbox"
            checked={spin}
            onChange={() => {
              viewer.setAutoRotate(!spin);
              setSpin(!spin);
            }}
          />{' '}
          {t('viewer.skill.spin')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={bones}
            onChange={() => {
              viewer.setSkeleton(!bones);
              setBones(!bones);
            }}
          />{' '}
          {t('viewer.opt.skeleton')}
        </label>
      </div>

      <h3>{t('viewer.skill.probe')}</h3>
      <pre className="skill-probe">{probe || t('viewer.skill.no_probe')}</pre>
    </div>
  );
}
