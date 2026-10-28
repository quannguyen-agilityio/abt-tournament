import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { rulesValues } from '@/lib/public-rules';
import { getPublicSeason } from '@/lib/public-season-db';
import { cn } from '@/lib/utils';

const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';

/** Each section's items, in order, as keys under `Public.rules`. */
const SECTIONS = [
  ['group', ['group.format', 'group.order', 'group.ranks', 'group.sets', 'group.compensation', 'group.points']],
  ['handicap', ['handicap.group', 'handicap.relay', 'handicap.points']],
  ['ranking', ['ranking.order']],
  ['knockout', ['knockout.seeds', 'knockout.relay', 'knockout.minPresent']],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border bg-surface rounded-[10px] border p-5">
      <h2 className="font-display mb-3 text-2xl font-bold uppercase">{title}</h2>
      <ul className="flex max-w-prose list-disc flex-col gap-2 pl-5">{children}</ul>
    </section>
  );
}

async function Rules({ params }: Pick<PageProps<'/[locale]/[year]/rules'>, 'params'>) {
  const { locale, year } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const [t, tm, tn] = await Promise.all([
    getTranslations('Public.rules'),
    getTranslations('Public.match'),
    getTranslations('Nav'),
  ]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const values = rulesValues(season.settings);
  const rich = { ...values, b: (chunks: ReactNode) => <b className="tabular-nums">{chunks}</b> };

  return (
    <>
      <h1 className="font-display mb-1 text-4xl font-extrabold uppercase">{tn('rules')}</h1>
      <p className="text-muted-foreground mb-5">{t('subtitle', { season: season.name })}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map(([section, items]) => (
          <Section key={section} title={t(`${section}.title`)}>
            {items.map((item) => (
              <li key={item}>
                {t.rich(item, rich)}
                {item === 'group.order' && (
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {season.settings.slot_types.map((type, i) => (
                      <span
                        key={i}
                        className={cn(
                          CHIP,
                          type === 'open' ? 'border-border' : 'border-primary/40 bg-brand-soft text-primary',
                        )}
                      >
                        {i + 1}. {tm(`slotType.${type}`)}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </Section>
        ))}
      </div>
    </>
  );
}

export default function RulesPage({ params }: PageProps<'/[locale]/[year]/rules'>) {
  return (
    <Suspense>
      <Rules params={params} />
    </Suspense>
  );
}
