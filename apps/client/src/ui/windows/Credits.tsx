import { CREDIT_KINDS, CREDIT_LICENSE_URL, CREDITS, t } from '@dtl/content';
import { Divider, PanelWindow } from '../kit';
import { closePanel } from '../store';

/** Ghi công tài nguyên bên thứ ba: đọc từ `packages/content/data/credits.json` (nguồn duy nhất, `content:check` đối chiếu LICENSES.md). */
export function Credits() {
  return (
    <PanelWindow title={t('ui.credits')} onClose={() => closePanel('credits')}>
      <div className="k-dim">{t('ui.credits.intro')}</div>
      {CREDIT_KINDS.map((kind) => {
        const list = CREDITS.filter((c) => c.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind}>
            <Divider label={t('ui.credits.kind.' + kind)} />
            <ul className="credits credits-list">
              {list.map((c) => (
                <li key={c.id}>
                  <div className="credits-title">
                    {c.title}{' '}
                    <a href={c.url} target="_blank" rel="noreferrer noopener">
                      {t('ui.credits.link')}
                    </a>
                  </div>
                  <div className="k-dim">
                    {t('ui.credits.by', { author: c.author })} ·{' '}
                    <a href={CREDIT_LICENSE_URL[c.license]} target="_blank" rel="noreferrer noopener">
                      {t('ui.credits.license', { license: t('ui.credits.license.' + c.license) })}
                    </a>
                  </div>
                  {c.mods.length > 0 && <div className="k-dim">{t('ui.credits.mods', { list: c.mods.map((m) => t('ui.credits.mod.' + m)).join(', ') })}</div>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </PanelWindow>
  );
}
