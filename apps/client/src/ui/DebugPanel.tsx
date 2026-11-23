import { Fragment, useState } from 'react';
import { C, MAX_LEVEL, PF_TRIBULATION } from '@dtl/shared';
import {
  ITEMS,
  itemName,
  itemTier,
  METHODS,
  methodName,
  MONSTERS,
  monsterName,
  OUTFITS,
  realmName,
  SETS,
  SKILL,
  skillName,
  t,
} from '@dtl/content';
import { Game } from '../game/engine';
import { Button } from './u2/win';
import { type DebugPerf, useUI } from './store';

/** Ngân sách desktop (CLAUDE.md, skill perf-budget): vượt thì tô đỏ, tới 80% thì tô vàng. */
const BUDGET = { cpuMs: 8, drawCalls: 300, triangles: 2_000_000 };

function tone(v: number, max: number): string {
  return v > max ? 'bad' : v > max * 0.8 ? 'warn' : '';
}

const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

/** Gửi lệnh GM qua chat: server kiểm quyền (chỉ tài khoản thử khi bật AUTH_DEV_BYPASS) rồi mới làm; client không tự đổi state. */
function gm(cmd: string): void {
  Game.current?.send(C.CHAT, { m: '/gm ' + cmd });
}

function PerfRows({ p }: { p: DebugPerf }) {
  return (
    <dl>
      <dt>{t('ui.debug.fps')}</dt>
      <dd className={p.fps < 55 ? 'warn' : ''}>{t('ui.debug.fps_v', { n: p.fps, backend: p.backend })}</dd>
      <dt>{t('ui.debug.gpu')}</dt>
      <dd className="gpu-info">{p.gpu}</dd>
      <dt>{t('ui.debug.frame')}</dt>
      <dd className={tone(p.cpuMs, BUDGET.cpuMs)}>{t('ui.debug.frame_v', { avg: p.cpuMs.toFixed(1), max: p.cpuMaxMs.toFixed(1) })}</dd>
      {p.budget.map((b) => (
        <Fragment key={b.section}>
          <dt className="sub">{t(`ui.debug.budget.${b.section}`)}</dt>
          <dd className={tone(b.avg, b.limit)}>
            {t('ui.debug.budget_v', { avg: b.avg.toFixed(2), max: b.max.toFixed(1), limit: b.limit })}
          </dd>
        </Fragment>
      ))}
      <dt>{t('ui.debug.draw')}</dt>
      <dd className={tone(p.drawCalls, BUDGET.drawCalls)}>{t('ui.debug.draw_v', { n: p.drawCalls })}</dd>
      <dt>{t('ui.debug.tri')}</dt>
      <dd className={tone(p.triangles, BUDGET.triangles)}>{t('ui.debug.tri_v', { n: Math.round(p.triangles / 1000) })}</dd>
      <dt>{t('ui.debug.mem')}</dt>
      <dd>{t('ui.debug.mem_v', { geo: p.geometries, tex: p.textures })}</dd>
      <dt>{t('ui.debug.ents')}</dt>
      <dd>{t('ui.debug.ents_v', { players: p.players, monsters: p.monsters, npcs: p.npcs })}</dd>
      <dt>{t('ui.debug.lod')}</dt>
      <dd>{t('ui.debug.lod_v', { lod: p.lod.join(' / '), off: p.offscreen })}</dd>
      <dt>{t('ui.debug.vfx')}</dt>
      <dd>{t('ui.debug.vfx_v', { fx: p.fxMeshes, n: p.particles, limit: p.particleLimit })}</dd>
      <dt>{t('ui.debug.tiles')}</dt>
      <dd>{p.tiles}</dd>
    </dl>
  );
}

type GmGroup = 'char' | 'skill' | 'gear' | 'outfit' | 'weapon' | 'map' | 'mon';
const GM_GROUP_IDS: GmGroup[] = ['char', 'skill', 'gear', 'outfit', 'weapon', 'map', 'mon'];
const TIERS = [1, 2, 3, 4];
const BRANCHES = ['kiem', 'hophap', 'dansu'] as const;
const PLUSES = Array.from({ length: 11 }, (_, i) => i);
const SPAWN_COUNTS = [1, 5, 10, 20];
const WEAPONS = ITEMS.filter((i) => i.kind === 'weapon')
  .sort((a, b) => itemTier(a.id) - itemTier(b.id) || (a.reqLevel ?? 1) - (b.reqLevel ?? 1))
  .map((i) => i.id);
const SKILL_IDS = [...SKILL.values()].map((s) => s.id);
const OUTFIT_IDS = [...new Set([...SETS.map((s) => s.id), ...Object.keys(OUTFITS)])];

/** Ô chọn một giá trị trong danh sách (dữ liệu lấy từ @dtl/content, không viết cứng). */
function Pick<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label>
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const GENDERS = (['m', 'f'] as const).map((v) => ({ value: v, label: t('ui.gm.gender.' + v) }));

/**
 * Nút thử nhanh theo nhóm (GM-TEST). Mỗi nút là một lệnh `/gm`; riêng khung va chạm là lớp hiển thị ở client.
 * Danh sách bộ, kiếm, chiêu, địa điểm, quái lấy từ dữ liệu game; server vẫn kiểm quyền và đi qua tx + sổ cái.
 */
function Tools() {
  const level = useUI((s) => s.char?.level ?? 1);
  const inTrib = useUI((s) => (s.flags & PF_TRIBULATION) !== 0);
  const colliders = useUI((s) => s.debugColliders);
  const [group, setGroup] = useState<GmGroup>('char');
  const [realm, setRealm] = useState(0);
  const [mon, setMon] = useState(MONSTERS[0]?.id ?? '');
  const [count, setCount] = useState(1);
  const [tier, setTier] = useState(2);
  const [branch, setBranch] = useState<(typeof BRANCHES)[number]>('kiem');
  const [plus, setPlus] = useState(10);
  const [gender, setGender] = useState<'m' | 'f'>('m');
  const [outfit, setOutfit] = useState(OUTFIT_IDS[0] ?? '');
  const [weapon, setWeapon] = useState(WEAPONS[0] ?? '');
  const [method, setMethod] = useState(METHODS[0]?.id ?? '');
  const [skill, setSkill] = useState(SKILL_IDS[0] ?? '');
  const [place, setPlace] = useState('tong_mon');
  const want = realm || level;
  const plusArg = plus > 0 ? ' +' + plus : '';
  return (
    <div className="debug-tools">
      <div className="debug-sub">{t('ui.gm.title')}</div>
      <div className="debug-row wrap">
        {GM_GROUP_IDS.map((g) => (
          <Button key={g} size="s" pressed={g === group} onClick={() => setGroup(g)}>
            {t('ui.gm.g.' + g)}
          </Button>
        ))}
        <Button size="s" onClick={() => gm('help')}>
          {t('ui.gm.help')}
        </Button>
      </div>
      {group === 'char' && (
        <>
          <div className="debug-row">
            <Pick
              label={t('ui.debug.realm')}
              value={want}
              onChange={setRealm}
              options={LEVELS.map((lv) => ({ value: lv, label: realmName(lv) }))}
            />
            <Button size="s" onClick={() => gm('level ' + want)}>
              {t('ui.debug.set')}
            </Button>
          </div>
          <div className="debug-row wrap">
            <Button size="s" onClick={() => gm('heal')}>
              {t('ui.debug.heal')}
            </Button>
            <Button size="s" onClick={() => gm('god')}>
              {t('ui.debug.god')}
            </Button>
            <Button size="s" variant="primary" disabled={inTrib} onClick={() => gm('trib')}>
              {t('ui.debug.trib')}
            </Button>
            <Button size="s" onClick={() => gm('cd')}>
              {t('ui.debug.cd')}
            </Button>
            <Button size="s" onClick={() => gm('gold 100000')}>
              {t('ui.gm.gold')}
            </Button>
            <Button size="s" onClick={() => gm('die')}>
              {t('ui.gm.die')}
            </Button>
          </div>
        </>
      )}
      {group === 'skill' && (
        <>
          <div className="debug-row wrap">
            <Button size="s" variant="primary" onClick={() => gm('skills all')}>
              {t('ui.gm.skills_all')}
            </Button>
            <Button size="s" onClick={() => gm('skills max')}>
              {t('ui.gm.skills_max')}
            </Button>
            <Button size="s" onClick={() => gm('skills list')}>
              {t('ui.gm.skills_list')}
            </Button>
          </div>
          <div className="debug-row">
            <Pick
              label={t('ui.gm.method')}
              value={method}
              onChange={setMethod}
              options={METHODS.map((m) => ({ value: m.id, label: methodName(m.id) }))}
            />
            <Button size="s" onClick={() => gm(`method ${method} 5`)}>
              {t('ui.debug.set')}
            </Button>
          </div>
          <div className="debug-row">
            <Pick
              label={t('ui.gm.learn')}
              value={skill}
              onChange={setSkill}
              options={SKILL_IDS.map((id) => ({ value: id, label: skillName(id) }))}
            />
            <Button size="s" onClick={() => gm(`learn ${skill} 5`)}>
              {t('ui.gm.learn')}
            </Button>
          </div>
        </>
      )}
      {group === 'gear' && (
        <>
          <div className="debug-row wrap">
            <Pick label={t('ui.gm.tier')} value={tier} onChange={setTier} options={TIERS.map((v) => ({ value: v, label: String(v) }))} />
            <Pick
              label={t('ui.gm.branch')}
              value={branch}
              onChange={setBranch}
              options={BRANCHES.map((v) => ({ value: v, label: t('ui.gm.branch.' + v) }))}
            />
            <Pick label={t('ui.gm.plus')} value={plus} onChange={setPlus} options={PLUSES.map((v) => ({ value: v, label: '+' + v }))} />
            <Pick label={t('ui.gm.gender')} value={gender} onChange={setGender} options={GENDERS} />
          </div>
          <div className="debug-row wrap">
            <Button size="s" variant="primary" onClick={() => gm(`kit ${tier} ${branch}${plusArg} ${gender}`)}>
              {t('ui.gm.kit')}
            </Button>
            <Button size="s" onClick={() => gm('bag sort')}>
              {t('ui.gm.bag_sort')}
            </Button>
            <Button size="s" onClick={() => gm('bag clear')}>
              {t('ui.gm.bag_clear')}
            </Button>
          </div>
        </>
      )}
      {group === 'outfit' && (
        <div className="debug-row wrap">
          <Pick
            label={t('ui.gm.outfit')}
            value={outfit}
            onChange={setOutfit}
            options={OUTFIT_IDS.map((id) => ({ value: id, label: t('set.' + id + '.name') }))}
          />
          <Pick label={t('ui.gm.gender')} value={gender} onChange={setGender} options={GENDERS} />
          <Button size="s" variant="primary" onClick={() => gm(`outfit ${outfit} ${gender}`)}>
            {t('ui.gm.outfit_btn')}
          </Button>
          <Button size="s" onClick={() => gm('outfit off')}>
            {t('ui.gm.outfit_off')}
          </Button>
        </div>
      )}
      {group === 'weapon' && (
        <div className="debug-row wrap">
          <Pick
            label={t('ui.gm.weapon')}
            value={weapon}
            onChange={setWeapon}
            options={WEAPONS.map((id) => ({ value: id, label: itemName(id) }))}
          />
          <Pick label={t('ui.gm.plus')} value={plus} onChange={setPlus} options={PLUSES.map((v) => ({ value: v, label: '+' + v }))} />
          <Button size="s" variant="primary" disabled={!weapon} onClick={() => gm(`weapon ${weapon}${plusArg}`)}>
            {t('ui.gm.weapon_btn')}
          </Button>
        </div>
      )}
      {group === 'map' && (
        <>
          <div className="debug-row">
            <label>
              <span>{t('ui.gm.place')}</span>
              <input value={place} onChange={(e) => setPlace(e.target.value.trim())} onKeyDown={(e) => e.stopPropagation()} />
            </label>
            <Button size="s" onClick={() => gm('tp')}>
              {t('ui.gm.tp_list')}
            </Button>
            <Button size="s" disabled={!place} onClick={() => gm('tp ' + place)}>
              {t('ui.gm.tp')}
            </Button>
          </div>
          <div className="debug-row wrap">
            <Button size="s" onClick={() => gm('tele all')}>
              {t('ui.gm.tele_all')}
            </Button>
            <Button size="s" pressed={colliders} onClick={() => Game.current?.setDebugColliders(!colliders)}>
              {t('ui.debug.colliders')}
            </Button>
            <Button
              size="s"
              onClick={() => void Game.current?.enterLevel(Game.current.shownLevel === 'thu_nghiem' ? 'van_lam' : 'thu_nghiem')}
            >
              {t('ui.debug.level_test')}
            </Button>
          </div>
        </>
      )}
      {group === 'mon' && (
        <>
          <div className="debug-row wrap">
            <Pick
              label={t('ui.debug.spawn')}
              value={mon}
              onChange={setMon}
              options={MONSTERS.map((m) => ({ value: m.id, label: monsterName(m.id) }))}
            />
            <Pick
              label={t('ui.gm.spawn_n')}
              value={count}
              onChange={setCount}
              options={SPAWN_COUNTS.map((v) => ({ value: v, label: String(v) }))}
            />
            <Button size="s" variant="primary" disabled={!mon} onClick={() => gm(`spawn ${mon} ${count}`)}>
              {t('ui.debug.spawn_btn')}
            </Button>
          </div>
          <div className="debug-row wrap">
            <Button size="s" onClick={() => gm('spawn clear')}>
              {t('ui.gm.spawn_clear')}
            </Button>
            <Button size="s" onClick={() => gm('killall')}>
              {t('ui.debug.killall')}
            </Button>
          </div>
        </>
      )}
      <div className="debug-note">{t('ui.debug.tools_hint')}</div>
    </div>
  );
}

/**
 * Bảng gỡ lỗi F3 (M1-2, mở rộng): hiệu năng (FPS, thời gian khung, draw call, tam giác, thực thể, VFX), phím đang giữ,
 * trạng thái, ping, room, và nút thử nhanh. Chỉ mở được ở bản dev hoặc khi URL có `?debug=1`.
 * Engine điền `debug` mỗi 100 ms chỉ khi bảng đang mở, nên tắt bảng thì không tốn gì.
 */
export function DebugPanel() {
  const open = useUI((s) => s.debugOpen);
  const allowed = useUI((s) => s.debugAllowed);
  const d = useUI((s) => s.debug);
  const dev = useUI((s) => s.dev);
  const queued = useUI((s) => s.queuedSkill);
  if (!open || !allowed || !d) return null;
  const none = t('ui.debug.none');
  const yn = (v: boolean): string => t(v ? 'ui.debug.yes' : 'ui.debug.no');
  const states = d.states.map((k) => t(k));
  if (queued >= 0) states.push(t('ui.debug.st.queued', { n: queued + 1 }));
  return (
    <div className="debug-panel">
      <div className="debug-title">{t('ui.debug.title')}</div>
      <div className="debug-sub">{t('ui.debug.perf')}</div>
      <PerfRows p={d.perf} />
      {/* Nút thử nhanh đặt ngay dưới số đo: bảng không nhận chuột để cuộn, nên phần cần bấm phải nằm trong khung nhìn ở 720p. */}
      {dev ? <Tools /> : <div className="debug-note">{t('ui.debug.no_gm')}</div>}
      <div className="debug-sub">{t('ui.debug.input')}</div>
      <dl>
        <dt>{t('ui.debug.keys')}</dt>
        <dd className="mono">{d.keys.length ? d.keys.join(' ') : none}</dd>
        <dt>{t('ui.debug.state')}</dt>
        <dd>{states.length ? states.join(' · ') : none}</dd>
        <dt>{t('ui.debug.speed')}</dt>
        <dd>{t('ui.debug.speed_v', { n: d.speed.toFixed(1) })}</dd>
        <dt>{t('ui.debug.focus')}</dt>
        <dd>
          {t('ui.debug.focus_v', {
            win: yn(d.focus),
            tab: t(d.visible ? 'ui.debug.visible' : 'ui.debug.hidden'),
            el: d.active || none,
          })}
        </dd>
        <dt>{t('ui.debug.ping')}</dt>
        <dd>{d.ping > 0 ? t('ui.debug.ping_v', { n: d.ping }) : none}</dd>
        <dt>{t('ui.debug.room')}</dt>
        <dd className="mono">
          {d.room} · {d.roomId} · {d.sid}
        </dd>
      </dl>
      <div className="debug-sub">{t('ui.debug.events')}</div>
      <ol className="debug-events mono">
        {d.events.length === 0 && <li>{none}</li>}
        {d.events
          .slice()
          .reverse()
          .map((e) => (
            <li key={e.id} className={'ev-' + e.kind}>
              <span>{t('ui.debug.ev.' + e.kind)}</span> <b>{e.code}</b> <i>{t('ui.debug.ago', { n: e.ago })}</i>
            </li>
          ))}
      </ol>
    </div>
  );
}
