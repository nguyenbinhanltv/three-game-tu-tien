import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@dtl/content';
import { type FrameInfo, HUMAN_HEIGHT, type LoadedInfo, ViewerScene } from './scene';
import { fmtBytes } from './stats';
import { poseClipName } from '../game/character/ikpose';
import { assetBaseUrl, type Manifest } from '../game/core/assets';
import { isBossViewer, isSkillViewer, SHOW_ALIASES, showAssetId } from '../game/core/testParams';
import { SkillPanel } from './SkillPanel';
import { skillForId } from './skillTiming';
import { currentSearch, urlParams } from '../base/flags';

const BASE_URL = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL;
/** Chỉ nhận đường dẫn tương đối cùng origin tới .glb/.gltf, không có "..". */
const SAFE_PATH = /^[\w\-./]+\.(glb|gltf)$/i;

const num = (n: number) => n.toLocaleString('vi-VN');
const m = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

function resolveFile(file: string): string | null {
  const p = file.replace(/^\/+/, '');
  if (!SAFE_PATH.test(p) || p.includes('..')) return null;
  return BASE_URL + p;
}

export function AssetViewer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<ViewerScene | null>(null);
  const [info, setInfo] = useState<LoadedInfo | null>(null);
  const [frame, setFrame] = useState<FrameInfo | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [clip, setClip] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [skillId, setSkillId] = useState('');
  const skillMode = isSkillViewer(currentSearch());
  const bossMode = isBossViewer(currentSearch());
  const [bossIds, setBossIds] = useState<string[]>([]);
  const [bossId, setBossId] = useState('');
  const [opts, setOpts] = useState({ human: true, wire: false, skeleton: false });

  const load = useCallback(async (job: () => Promise<LoadedInfo>, name: string) => {
    setError('');
    setStatus(t('viewer.loading', { name }));
    try {
      const res = await job();
      setInfo(res);
      setClip(0);
      // Khung lưới giữ nguyên (scene tự áp lại cho model mới); xương luôn tạo mới ở trạng thái ẩn.
      setOpts((o) => ({ ...o, skeleton: false }));
    } catch (e) {
      console.error('[viewer]', e);
      setError(t('viewer.err.load', { name, msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setStatus('');
    }
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const v = new ViewerScene(host);
    let alive = true;
    v.init()
      .then(() => {
        if (!alive) return;
        setViewer(v);
        (window as unknown as { __viewer: ViewerScene }).__viewer = v;
        const params = urlParams();
        const file = params.get('file');
        if (bossMode) {
          // ?show=boss[&id=<id>]: danh sách mọi boss trong manifest, chọn để xem model + clip.
          void (async () => {
            const res = await fetch(`${assetBaseUrl()}manifest.json`, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status} manifest.json`);
            const man = (await res.json()) as Manifest;
            const ids = Object.keys(man.assets).filter((k) => k.startsWith('boss_')).sort();
            if (!alive) return;
            setBossIds(ids);
            const want = params.get('id');
            const id = want && ids.includes(want) ? want : ids[0];
            if (!id) return;
            setBossId(id);
            v.setHuman(true);
            await load(() => v.loadUrl(assetBaseUrl() + man.assets[id].file), id);
          })().catch((e) => setError(t('viewer.err.load', { name: 'boss', msg: e instanceof Error ? e.message : String(e) })));
          return;
        }
        if (skillMode) {
          // ?show=skill&id=<chiêu|pose>[&model=char]: rig mẫu (hoặc model người chơi thật) chạy pose của chiêu.
          const id = skillForId(params.get('id') ?? '')?.id ?? 'skl_phi_kiem';
          setSkillId(id);
          // Người chuẩn che khung nhìn bên: ẩn mặc định ở trang chiêu (bật lại ở ô «Người chuẩn»).
          v.setHuman(false);
          setOpts((o) => ({ ...o, human: false }));
          const real = params.get('model');
          void load(async () => {
            if (!real) return v.loadPoseFixture();
            const key = SHOW_ALIASES[real] ?? real;
            const res = await fetch(`${assetBaseUrl()}manifest.json`, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status} manifest.json`);
            const a = ((await res.json()) as Manifest).assets[key];
            if (!a) throw new Error(`manifest.json: ${key}?`);
            return v.loadUrl(assetBaseUrl() + a.file);
          }, real ?? 'mixamo_fixture');
          return;
        }
        if (!file && v.poseMode) {
          // ?pose=<id>[&t=giây]: rig mẫu chạy pose; chọn sẵn clip và dừng ở khung t nếu có.
          let i = 0;
          const t = Number(params.get('t'));
          const seek = params.has('t') && Number.isFinite(t);
          void load(async () => {
            const res = v.loadPoseFixture();
            i = Math.max(0, res.clips.findIndex((c) => c.name === poseClipName(params.get('pose') ?? '')));
            v.playClip(i);
            if (seek) v.seek(t);
            return res;
          }, 'mixamo_fixture').then(() => {
            setClip(i);
            setPaused(seek);
          });
          return;
        }
        const show = file ? null : showAssetId(currentSearch());
        if (show) {
          void load(async () => {
            const res = await fetch(`${assetBaseUrl()}manifest.json`, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status} manifest.json`);
            const man = (await res.json()) as Manifest;
            const a = man.assets[show];
            if (!a) throw new Error(`manifest.json: ${show}?`);
            // ?lib=1: thêm clip của thư viện chung anim_human_base (K-3), retarget sang model người.
            // ?lib=ual: clip UAL phát thẳng lên model Mannequin (quái hai chân Dị Vực, nhân vật v3).
            const libs =
              params.get('lib') === 'ual'
                ? [`native:${assetBaseUrl()}${man.assets.anim_ual_native.file}`]
                : params.get('lib')
                  ? [man.assets.anim_human_base, man.assets.anim_human_k3].filter(Boolean).map((l) => assetBaseUrl() + l.file)
                  : [];
            return v.loadUrl(assetBaseUrl() + a.file, libs);
          }, show);
          return;
        }
        if (!file) return;
        const url = resolveFile(file);
        if (!url) setError(t('viewer.err.bad_path', { file }));
        else void load(() => v.loadUrl(url), file);
      })
      .catch((e) => setError(t('viewer.err.init', { msg: e instanceof Error ? e.message : String(e) })));
    return () => {
      alive = false;
      v.dispose();
    };
  }, [load]);

  useEffect(() => {
    if (!viewer) return;
    const id = window.setInterval(() => setFrame(viewer.frameInfo()), 500);
    return () => window.clearInterval(id);
  }, [viewer]);

  const openLocal = (f: File | undefined) => {
    if (!f || !viewer) return;
    void load(async () => viewer.loadBuffer(await f.arrayBuffer(), f.name), f.name);
  };

  const toggle = (k: keyof typeof opts) => {
    const on = !opts[k];
    setOpts({ ...opts, [k]: on });
    if (k === 'human') viewer?.setHuman(on);
    if (k === 'wire') viewer?.setWireframe(on);
    if (k === 'skeleton') viewer?.setSkeleton(on);
  };

  const pickBoss = (id: string) => {
    if (!viewer) return;
    setBossId(id);
    const u = new URL(location.href);
    u.searchParams.set('id', id);
    history.replaceState(null, '', u);
    void load(async () => {
      const res = await fetch(`${assetBaseUrl()}manifest.json`, { cache: 'no-cache' });
      const man = (await res.json()) as Manifest;
      return viewer.loadUrl(assetBaseUrl() + man.assets[id].file);
    }, id);
  };

  const s = info?.stats;
  const pickSkill = (id: string) => {
    setSkillId(id);
    const u = new URL(location.href);
    u.searchParams.set('id', id);
    history.replaceState(null, '', u);
  };
  return (
    <div
      className="viewer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        openLocal(e.dataTransfer.files[0]);
      }}
    >
      <div ref={hostRef} className="viewer-host" />
      <aside className="viewer-panel">
        <h1>{t('viewer.title')}</h1>
        <label className="viewer-file">
          {t('viewer.open_file')}
          <input type="file" accept=".glb" onChange={(e) => openLocal(e.target.files?.[0])} />
        </label>
        <p className="viewer-hint">{t('viewer.drop_hint')}</p>
        {status && <p className="viewer-status">{status}</p>}
        {error && <p className="viewer-error">{error}</p>}

        {bossMode && bossIds.length > 0 && (
          <label className="viewer-boss">
            {t('viewer.boss.pick')}{' '}
            <select value={bossId} onChange={(e) => pickBoss(e.target.value)}>
              {bossIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        )}

        {skillMode && viewer && info && skillId && (
          <SkillPanel viewer={viewer} skillId={skillId} onPick={pickSkill} clips={info.clips.map((c) => c.name)} />
        )}

        {info && s && (
          <>
            <h2>{info.name}</h2>
            <dl>
              <dt>{t('viewer.file_size')}</dt>
              <dd>{fmtBytes(info.fileBytes)}</dd>
              <dt>{t('viewer.size')}</dt>
              <dd>
                {m(s.size.x)} × {m(s.size.y)} × {m(s.size.z)} m
              </dd>
              <dt>{t('viewer.height_ratio', { h: m(HUMAN_HEIGHT) })}</dt>
              <dd>{m(s.size.y / HUMAN_HEIGHT)}×</dd>
              <dt>{t('viewer.triangles')}</dt>
              <dd className="viewer-big">{num(s.triangles)}</dd>
              <dt>{t('viewer.draw_model')}</dt>
              <dd className="viewer-big">{num(s.drawCalls)}</dd>
              <dt>{t('viewer.meshes')}</dt>
              <dd>
                {num(s.meshes)}
                {s.skinned > 0 && ` (${t('viewer.skinned', { n: s.skinned })})`}
              </dd>
              <dt>{t('viewer.materials')}</dt>
              <dd>{num(s.materials)}</dd>
              {s.bones > 0 && (
                <>
                  <dt>{t('viewer.bones')}</dt>
                  <dd>{num(s.bones)}</dd>
                </>
              )}
              <dt>{t('viewer.extensions')}</dt>
              <dd className="viewer-ext">{info.extensions.length ? info.extensions.join(', ') : t('viewer.none')}</dd>
            </dl>

            <h3>{t('viewer.textures', { n: s.textures.length, mem: fmtBytes(s.textureBytes) })}</h3>
            {s.textures.length === 0 ? (
              <p className="viewer-hint">{t('viewer.no_textures')}</p>
            ) : (
              <table className="viewer-tex">
                <tbody>
                  {s.textures.map((tx, i) => (
                    <tr key={i}>
                      <td title={tx.name}>{tx.slots.join(', ')}</td>
                      <td>
                        {tx.width}×{tx.height}
                        {tx.compressed && ` · ${t('viewer.tex_compressed')}`}
                      </td>
                      <td>{fmtBytes(tx.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3>{t('viewer.anim')}</h3>
            {info.clips.length === 0 ? (
              <p className="viewer-hint">{t('viewer.no_clips')}</p>
            ) : (
              <div className="viewer-anim">
                <select
                  value={clip}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setClip(i);
                    viewer?.playClip(i);
                  }}
                >
                  {info.clips.map((c, i) => (
                    <option key={i} value={i}>
                      {(c.name || `#${i}`) + ` (${m(c.duration)}s)`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (viewer) viewer.paused = !paused;
                    setPaused(!paused);
                  }}
                >
                  {paused ? t('viewer.play') : t('viewer.pause')}
                </button>
                <label>
                  {t('viewer.speed')}{' '}
                  <select
                    value={speed}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSpeed(v);
                      if (viewer) viewer.speed = v;
                    }}
                  >
                    {[0.1, 0.25, 0.5, 1, 2].map((x) => (
                      <option key={x} value={x}>
                        {m(x)}×
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </>
        )}

        <h3>{t('viewer.display')}</h3>
        <div className="viewer-opts">
          <label>
            <input type="checkbox" checked={opts.human} onChange={() => toggle('human')} /> {t('viewer.opt.human', { h: m(HUMAN_HEIGHT) })}
          </label>
          <label>
            <input type="checkbox" checked={opts.wire} onChange={() => toggle('wire')} /> {t('viewer.opt.wire')}
          </label>
          {s && s.bones > 0 && (
            <label>
              <input type="checkbox" checked={opts.skeleton} onChange={() => toggle('skeleton')} /> {t('viewer.opt.skeleton')}
            </label>
          )}
        </div>

        {frame && (
          <p className="viewer-frame">
            {t('viewer.frame', { backend: frame.backend, fps: frame.fps, calls: num(frame.drawCalls), tris: num(frame.triangles) })}
          </p>
        )}
        <p className="viewer-hint">{t('viewer.help')}</p>
      </aside>
    </div>
  );
}
