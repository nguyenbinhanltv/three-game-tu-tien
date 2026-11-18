import { useEffect, useMemo } from 'react';
import { CHAPTERS, ITEM, itemName, t } from '@dtl/content';
import {
  canTeleTo,
  chapterProgress,
  chapterState,
  nodeState,
  type ChapterCtx,
  type ChapterDef,
  type ChapterNodeDef,
  type ChapterState,
} from '@dtl/shared';
import { Game } from '../../game/engine';
import { useArtUrl } from '../Art';
import { ContentIcon } from '../ContentIcon';
import { Badge, Bar, Button, Panel, Slot, Tabs, type TabDef } from '../u2';
import { openPanel, useUI } from '../store';
import { closeChapters, pickChapter, pickNode, useChapters } from './chaptersStore';
import './chapters.css';

const GLYPH: Record<ChapterNodeDef['kind'], string> = { world: '●', dungeon: '⬡', boss: '☠', trib: '⚡' };
const TONE: Record<ChapterState, 'son' | 'ngoc' | 'kim' | 'lam' | 'xam'> = {
  here: 'kim',
  open: 'ngoc',
  hint: 'son',
  done: 'xam',
  lock: 'xam',
};

const nodeName = (n: ChapterNodeDef): string =>
  t(
    { world: `ui.chapters.world.${n.ref}`, dungeon: `dungeon.${n.ref}.name`, boss: `mon.${n.ref}`, trib: `ui.chapters.trib.${n.ref}` }[
      n.kind
    ],
  );

function useCtx(): ChapterCtx {
  const level = useUI((s) => s.char?.level ?? 1);
  const currentLevel = useUI((s) => s.level);
  const questsDone = useUI((s) => s.quests.done);
  const teleOpen = useUI((s) => s.tele.open);
  return useMemo(() => ({ level, currentLevel, questsDone, teleOpen }), [level, currentLevel, questsDone, teleOpen]);
}

/** Chương nên mở lần đầu: chương đang đứng, không thì chương cao nhất đã mở. */
function defaultChapter(ctx: ChapterCtx): ChapterDef {
  const here = CHAPTERS.find((c) => chapterState(c, ctx) === 'here');
  if (here) return here;
  let best = CHAPTERS[0]!;
  for (const c of CHAPTERS) if (chapterState(c, ctx) !== 'lock') best = c;
  return best;
}

/**
 * Bản đồ chương (U2-4, phím N / nút Hành trình): chọn chương ở tab, bản đồ chương hiện các nút (thế giới, phó bản, boss, độ kiếp) theo
 * trạng thái, cột phải mô tả nút đang chọn. Chỉ ĐỌC dữ liệu có sẵn (`chapters.json`, cấp, nhiệm vụ, trận đã mở); truyền tống dùng lệnh
 * có sẵn, server vẫn quyết định.
 */
export function ChapterMap() {
  const open = useChapters((s) => s.open);
  if (!open) return null;
  return <ChapterMapBody />;
}

function ChapterMapBody() {
  const ctx = useCtx();
  const { ch, sel } = useChapters();
  const def = CHAPTERS.find((c) => c.id === ch) ?? defaultChapter(ctx);
  useEffect(() => {
    if (!ch) pickChapter(def.id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeChapters();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const art = useArtUrl('loading', def.art);
  const nodes = def.nodes.map((n) => ({ n, st: nodeState(def, n, ctx) }));
  const cur = nodes.find((x) => x.n.id === sel) ?? nodes.find((x) => x.st === 'here') ?? nodes.find((x) => x.st === 'hint') ?? nodes[0]!;
  const prog = chapterProgress(def, ctx);
  const tabs: TabDef[] = CHAPTERS.map((c, i) => {
    const st = chapterState(c, ctx);
    return { id: c.id, label: t('ui.chapters.tab', { n: i + 1 }) + (st === 'done' ? ' ✓' : ''), disabled: st === 'lock' };
  });
  const chIdx = CHAPTERS.indexOf(def) + 1;
  const canTele = canTeleTo(cur.n, ctx);
  return (
    <div
      className="u2c"
      role="dialog"
      aria-modal="true"
      aria-label={t('ui.chapters.title')}
      onPointerDown={(e) => e.target === e.currentTarget && closeChapters()}
    >
      <Panel title={t('ui.chapters.title')} onClose={closeChapters} className="u2c__panel">
        <div className="u2c__tabs">
          <Tabs tabs={tabs} value={def.id} onChange={(id) => pickChapter(id)} label={t('ui.chapters.title')} />
        </div>
        <div className="u2c__body">
          <div className="u2c__map" style={art ? { backgroundImage: `url("${art}")` } : undefined}>
            <div className="u2c__cap">
              <div className="u2c__cap-h">{`${t('ui.chapters.tab', { n: chIdx })} · ${t('ui.chapters.hoi', { h: t(`ui.chapters.hoi.${chIdx}`) })}`}</div>
              <div className="u2c__cap-s">{t(`ui.chapters.${def.id}.name`)}</div>
            </div>
            <svg className="u2c__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {def.nodes.slice(1).map((n) => (
                <line key={n.id} x1={def.nodes[0]!.x} y1={def.nodes[0]!.y} x2={n.x} y2={n.y} vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {nodes.map(({ n, st }) => (
              <button
                key={n.id}
                type="button"
                className="u2c__node"
                data-kind={n.kind}
                data-st={st}
                data-sel={cur.n.id === n.id ? '1' : undefined}
                style={{ left: n.x + '%', top: n.y + '%' }}
                aria-label={`${nodeName(n)}, ${t('ui.chapters.state.' + st)}`}
                aria-pressed={cur.n.id === n.id}
                onClick={() => pickNode(n.id)}
              >
                <span className="u2c__glyph">{st === 'done' ? '✓' : st === 'lock' ? '🔒' : GLYPH[n.kind]}</span>
                <span className="u2c__label">{nodeName(n)}</span>
                <span className="u2c__sub">{t('ui.chapters.kind.' + n.kind)}</span>
              </button>
            ))}
            <div className="u2c__legend">
              {(['here', 'open', 'hint', 'done', 'lock'] as const).map((s) => (
                <span key={s} data-st={s}>
                  {t('ui.chapters.state.' + s)}
                </span>
              ))}
            </div>
          </div>
          <div className="u2c__info">
            <h2 className="u2c__title">{t(`ui.chapters.${def.id}.name`)}</h2>
            <div className="u2c__tags">
              <Badge tone="son">{t('ui.chapters.level', { a: def.levels[0], b: def.levels[1] })}</Badge>
            </div>
            <p className="u2c__desc">{t(`ui.chapters.${def.id}.desc`)}</p>
            <div className="u2c__h">{t('ui.chapters.progress')}</div>
            <Bar kind="mp" value={prog.done} max={prog.total} text={t('ui.chapters.progress_n', { a: prog.done, b: prog.total })} />
            <Bar
              kind="xp"
              value={Math.max(0, ctx.level - def.levels[0] + 1)}
              max={def.levels[1] - def.levels[0] + 1}
              text={t('ui.chapters.yours', { a: ctx.level, b: def.levels[1] })}
            />
            <div className="u2c__rule" />
            <div className="u2c__h">
              {t('ui.chapters.selected')}: {nodeName(cur.n)}
            </div>
            <div className="u2c__tags">
              <Badge tone={TONE[cur.st]}>{t('ui.chapters.state.' + cur.st)}</Badge>
              <Badge tone="lam">{t('ui.chapters.kind.' + cur.n.kind)}</Badge>
              {cur.st === 'lock' && <Badge tone="xam">{t('ui.chapters.min', { n: cur.n.minLevel })}</Badge>}
            </div>
            <p className="u2c__note">{t('ui.chapters.note_free')}</p>
            <div className="u2c__h">{t('ui.chapters.feature')}</div>
            <div className="u2c__feat">
              {def.featured.map((id) => (
                <Slot
                  key={id}
                  on="light"
                  size="s"
                  rarity={ITEM.get(id)?.rarity ?? 0}
                  icon={<ContentIcon def={ITEM.get(id)} />}
                  label={itemName(id)}
                />
              ))}
            </div>
            <div className="u2c__act">
              <Button kind="ngoc" size="s" onClick={() => (closeChapters(), openPanel('map'))}>
                {t('ui.chapters.to_map')}
              </Button>
              <Button
                kind={canTele ? 'son' : 'khoa'}
                title={canTele ? undefined : t('ui.chapters.tele_lock')}
                onClick={() => canTele && (Game.current?.teleport(cur.n.tele!), closeChapters())}
              >
                {t('ui.chapters.tele')}
              </Button>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
