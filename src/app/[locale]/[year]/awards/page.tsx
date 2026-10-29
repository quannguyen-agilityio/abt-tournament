import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Fragment, Suspense } from 'react';
import { TeamChip } from '@/components/team-chip';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { buildAwardCards } from '@/lib/public-awards';
import { getPublicSeason, getSeasonAwards } from '@/lib/public-season-db';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';

async function Awards({ params }: Pick<PageProps<'/[locale]/[year]/awards'>, 'params'>) {
  const { locale, year } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const [t, tn] = await Promise.all([getTranslations('Public.awards'), getTranslations('Nav')]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const cards = buildAwardCards(await getSeasonAwards(season.id), locale);

  return (
    <>
      <h1 className="font-display mb-1 text-4xl font-extrabold uppercase">{tn('awards')}</h1>
      <p className="text-muted-foreground mb-5">{t('subtitle', { count: cards.length })}</p>

      {cards.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-[10px] border p-8 text-center">
          {t('empty')}
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {cards.map((award) => (
            <li key={award.id} className="min-w-0">
              <article className="border-border bg-surface flex h-full flex-col gap-3 rounded-[10px] border p-5">
                <div className="flex items-start gap-3">
                  <h2 className="font-display min-w-0 text-2xl leading-tight font-bold break-words uppercase">
                    {award.name}
                  </h2>
                  {award.value !== null && (
                    <span className="font-display text-primary ml-auto text-xl font-bold whitespace-nowrap tabular-nums">
                      {formatMoney(award.value, locale)}
                    </span>
                  )}
                </div>
                <p className="text-sm">{award.criteria}</p>
                {award.sponsor && (
                  <p className="text-muted-foreground text-xs">{t('sponsor', { name: award.sponsor })}</p>
                )}
                <div className="border-border mt-auto border-t pt-3">
                  <h3 className="sr-only">{t('winners')}</h3>
                  {award.winners.length === 0 ? (
                    <span className={cn(CHIP, 'border-warn/60 bg-warn/10 text-warn')}>{t('pending')}</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {award.winners.map((w) => (
                        <li key={w.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={cn(CHIP, 'border-border text-muted-foreground')}>{t(`kind.${w.kind}`)}</span>
                          {w.kind === 'team' ? (
                            w.team && (
                              <Link href={`/${year}/teams/${w.team.id}`} className="min-w-0 hover:underline">
                                <TeamChip name={w.team.name} color={w.team.color} />
                              </Link>
                            )
                          ) : (
                            <span className="font-semibold">
                              {w.players.map((p, i) => (
                                <Fragment key={p.id}>
                                  {i > 0 && ' + '}
                                  <Link href={`/${year}/players/${p.slug}`} className="hover:underline">
                                    {p.name}
                                  </Link>
                                </Fragment>
                              ))}
                            </span>
                          )}
                          {w.kind !== 'team' && w.team && (
                            <Link
                              href={`/${year}/teams/${w.team.id}`}
                              className="text-muted-foreground min-w-0 text-sm hover:underline"
                            >
                              <TeamChip
                                name={w.team.name}
                                color={w.team.color}
                                className="[&>span:last-child]:font-normal"
                              />
                            </Link>
                          )}
                          {w.matchCode && (
                            <Link
                              href={`/${year}/matches/${w.matchCode}`}
                              className="text-primary text-sm hover:underline"
                            >
                              {t('match', { code: w.matchCode })}
                            </Link>
                          )}
                          {w.note && <span className="text-muted-foreground text-sm">· {w.note}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function AwardsPage({ params }: PageProps<'/[locale]/[year]/awards'>) {
  return (
    <Suspense>
      <Awards params={params} />
    </Suspense>
  );
}
