import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { GmListKind, GmState } from '@dtl/shared';
import { t } from '@dtl/content';
import { gmList, gmRefreshState, gmRun, gmStateNow, gmStateSub } from '../../game/debug/gmRpc';
import { Button } from '../u2/win';
import './gmlab.css';
import { GM_CMDS, GM_GROUPS, gmBuild, gmDefaults, gmKey, gmOptions, type GmCmd, type GmGroup, type GmParam, type GmValues } from './gmCommands';

/** Kết quả lệnh gần nhất (ok/lỗi rõ ràng, dòng kết quả đầu của server). */
interface Result {
  cmd: string;
  ok: boolean;
  text: string;
}
let lastResult: Result | null = null;
const resultSubs = new Set<() => void>();
const useResult = () =>
  useSyncExternalStore(
    (f) => {
      resultSubs.add(f);
      return () => void resultSubs.delete(f);
    },
    () => lastResult,
  );

/** Chạy một lệnh qua kênh GM có cấu trúc; kết quả (hoặc lỗi mạng/quyền) hiện ở dải kết quả. Server kiểm quyền tài khoản thử và tham số. */
async function run(cmd: string): Promise<void> {
  let r: Result;
  try {
    const m = await gmRun(cmd.split(/\s+/));
    const first = m.m[0] ?? '';
    r = { cmd, ok: m.ok, text: m.ok ? first : `${m.e ?? 'fail'}${first ? ': ' + first : ''}` };
  } catch (e) {
    r = { cmd, ok: false, text: e instanceof Error && e.message === 'timeout' ? t('ui.gm.lab.gm.timeout') : t('ui.gm.lab.gm.nogame') };
  }
  lastResult = r;
  for (const f of resultSubs) f();
}

const MAX_SHOWN = 60;
/** Nguồn id → loại danh sách của kênh GM (`GM_LIST_KINDS`). Nguồn không có loại (trang phục) dựng từ nội dung game. */
const KIND: Partial<Record<NonNullable<GmParam['src']>, GmListKind>> = {
  items: 'item',
  weapons: 'weapon',
  skins: 'skin',
  monsters: 'mon',
  skills: 'skill',
  methods: 'method',
  sets: 'set',
  arts: 'art',
  places: 'place',
  quests: 'quest',
  scenes: 'scene',
};

type Opt = { id: string; label: string };

/**
 * Ô chọn id có tìm: gõ để lọc; danh sách lấy từ kênh GM (`list`, lọc không dấu giống `/gm find`, có tên và ghi chú).
 * Khi kênh không trả lời (không phải tài khoản thử, chưa vào phòng) dùng danh sách dựng sẵn từ nội dung game.
 */
function SrcField({ p, value, onChange }: { p: GmParam; value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState('');
  const kind = KIND[p.src!];
  const [srv, setSrv] = useState<Opt[] | null>(null);
  useEffect(() => {
    if (!kind) return;
    let live = true;
    const h = window.setTimeout(() => {
      gmList(kind, q.trim(), MAX_SHOWN)
        .then((r) => live && setSrv(r.items.map((i) => ({ id: i.id, label: `${i.name && i.name !== i.id ? i.name + ' (' + i.id + ')' : i.id}${i.sub ? ' · ' + i.sub : ''}` }))))
        .catch(() => live && setSrv(null));
    }, 200);
    return () => {
      live = false;
      window.clearTimeout(h);
    };
  }, [kind, q]);
  const k = q.trim().toLowerCase();
  const local = gmOptions(p.src!);
  // Server trả danh sách rỗng khi không lọc (ví dụ địa điểm trong phòng tập không có bản đồ): dùng danh sách dựng sẵn thay vì ô chọn trống.
  const list = srv && (srv.length || k) ? srv : (k ? local.filter((o) => o.label.toLowerCase().includes(k)) : local).slice(0, MAX_SHOWN);
  const cur = list.some((o) => o.id === value) ? value : (list[0]?.id ?? '');
  useEffect(() => {
    if (cur !== value) onChange(cur);
  }, [cur, value, onChange]);
  return (
    <>
      <input className="gm-find" placeholder={t('ui.gm.lab.find')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <select value={cur} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}

function Field({ p, value, onChange }: { p: GmParam; value: string; onChange: (v: string) => void }) {
  const label = t('ui.gm.param.' + p.k);
  let input;
  if (p.kind === 'src') input = <SrcField p={p} value={value} onChange={onChange} />;
  else if (p.kind === 'pick')
    input = (
      <select value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
        {p.opt && <option value="">{t('ui.gm.opt.none')}</option>}
        {p.opts!.map((o) => (
          <option key={o} value={o}>
            {t('ui.gm.opt.' + o)}
          </option>
        ))}
      </select>
    );
  else if (p.kind === 'int')
    input = <input className="gm-num" type="number" min={p.min} max={p.max} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />;
  else input = <input className="gm-text" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />;
  return (
    <label>
      <span>{label}</span>
      {input}
    </label>
  );
}

function CmdRow({ c }: { c: GmCmd }) {
  const [v, setV] = useState<GmValues>(() => gmDefaults(c));
  const cmd = gmBuild(c, v);
  const help = t('gm.cmd.' + c.name);
  const tip = help.startsWith('gm.cmd.') || help.startsWith('[') ? undefined : help;
  return (
    <div className="debug-row wrap gm-cmd" data-cmd={gmKey(c)}>
      <b title={tip}>{t('ui.gm.cmd.' + gmKey(c))}</b>
      {c.params.map((p) => (
        <Field key={p.k} p={p} value={v[p.k] ?? ''} onChange={(x) => setV((o) => ({ ...o, [p.k]: x }))} />
      ))}
      <Button size="s" variant="primary" disabled={!cmd} title={cmd ? '/gm ' + cmd : undefined} onClick={() => cmd && void run(cmd)}>
        {t('ui.gm.lab.gm.run')}
      </Button>
      {c.extra?.map((x) => (
        <Button key={x.k} size="s" onClick={() => void run(x.cmd)}>
          {t('ui.gm.extra.' + x.k)}
        </Button>
      ))}
    </div>
  );
}

const SWITCHES = ['god', 'free', 'freeze', 'lockhp', 'phaseLock', 'dummy'] as const;

/** Trạng thái phòng thử/nhân vật từ server (`GmState`): cấp, công pháp, phòng tập, các công tắc đang bật. Làm mới khi mở cửa sổ và sau mỗi lệnh. */
function StateBar() {
  const [st, setSt] = useState<GmState | null>(gmStateNow());
  useEffect(() => {
    const off = gmStateSub(setSt);
    void gmRefreshState().catch(() => setSt(null));
    return off;
  }, []);
  if (!st) return <div className="gm-state gm-off">{t('ui.gm.lab.gm.nostate')}</div>;
  return (
    <div className="gm-state">
      <span>{t('ui.gm.lab.gm.st_level', { n: st.level })}</span>
      {st.method && <span>{st.method}</span>}
      <span>{st.practice ? t('ui.gm.lab.gm.st_practice') : st.levelId}</span>
      {SWITCHES.filter((k) => st[k]).map((k) => (
        <span key={k} className="gm-on">
          {t('ui.gm.sw.' + k)}
        </span>
      ))}
    </div>
  );
}

/** Dải kết quả lệnh gần nhất: xanh ok / đỏ lỗi, kèm lệnh đã gửi. */
function ResultBar() {
  const r = useResult();
  if (!r) return null;
  return (
    <div className={'gm-result ' + (r.ok ? 'gm-ok' : 'gm-bad')} role="status">
      <b>{r.ok ? t('ui.gm.lab.gm.ok') : t('ui.gm.lab.gm.fail')}</b> /gm {r.cmd}
      {r.text ? ` — ${r.text}` : ''}
    </div>
  );
}

const win = { open: false };
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
let host: HTMLDivElement | null = null;

/** Mở/đóng cửa sổ lệnh GM (gốc React riêng gắn vào body để không phụ thuộc tab đang mở và không đẩy chiều cao bảng F3). */
export function gmWindow(open: boolean): void {
  win.open = open;
  if (open && !host) {
    host = document.createElement('div');
    document.body.appendChild(host);
    createRoot(host).render(<GmWindow />);
  }
  for (const f of subs) f();
}

const useOpen = () => useSyncExternalStore(subscribe, () => win.open);

/** Cửa sổ nổi bên phải: sáu nhóm lệnh, danh sách cuộn bên trong để luôn nằm trọn khung 720p. Lệnh nhóm Cân bằng ở tab Cân bằng. */
function GmWindow() {
  const open = useOpen();
  const [g, setG] = useState<GmGroup>('char');
  if (!open) return null;
  const rows = GM_CMDS.filter((c) => c.group === g);
  return (
    <div className="gm-win" role="dialog" aria-label={t('ui.gm.lab.tab.gm')}>
      <div className="gm-win-head">
        <b>{t('ui.gm.lab.tab.gm')}</b>
        <Button size="s" onClick={() => gmWindow(false)}>
          {t('ui.gm.lab.gm.close')}
        </Button>
      </div>
      <div className="debug-row wrap gm-groups">
        {GM_GROUPS.map((k) => (
          <Button key={k} size="s" variant={k === g ? 'primary' : undefined} onClick={() => setG(k)}>
            {t('ui.gm.lab.gm.group.' + k)}
          </Button>
        ))}
      </div>
      <StateBar />
      <ResultBar />
      <div className="gm-list">{rows.length ? rows.map((c) => <CmdRow key={gmKey(c)} c={c} />) : <div className="debug-row">{t('ui.gm.lab.gm.empty')}</div>}</div>
    </div>
  );
}

/** Tab "Lệnh GM" trong tab Diễn Võ: nút mở/đóng cửa sổ lệnh. */
export function GmLab() {
  const open = useOpen();
  return (
    <div className="debug-row wrap">
      <Button size="s" variant="primary" onClick={() => gmWindow(!open)}>
        {t(open ? 'ui.gm.lab.gm.close' : 'ui.gm.lab.gm.open')}
      </Button>
      <span>{t('ui.gm.lab.gm.hint')}</span>
    </div>
  );
}
