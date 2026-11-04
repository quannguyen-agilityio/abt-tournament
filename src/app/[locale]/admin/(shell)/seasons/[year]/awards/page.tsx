import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { loadSeasonAwards, type AdminAward } from '@/lib/award-admin-db';
import { requireBtc } from '@/lib/auth/session';
import { localized } from '@/lib/public-awards';
import { getPublicSeason, getSeasonMatches, getSeasonPlayers, getSeasonTeams } from '@/lib/public-season-db';
import { createClient } from '@/lib/supabase/server';
import { AddWinnerForm, AwardForm, DeleteAwardForm, WinnerRow, type AwardFormValues } from './award-forms';
import { AwardList } from './award-list';
import Loading from './loading';

const BRACKET_ORDER = ['SF1', 'SF2', '3RD', 'F'];

function formValues(award: AdminAward): AwardFormValues {
  return {
    id: award.id,
    nameVi: award.name_vi,
    nameEn: award.name_en ?? '',
    criteriaVi: award.criteria_vi,
    criteriaEn: award.criteria_en ?? '',
    sponsor: award.sponsor ?? '',
    value: award.value_vnd === null ? '' : String(award.value_vnd),
    note: award.note ?? '',
  };
}

async function Awards({ params, searchParams }: PageProps<'/[locale]/admin/seasons/[year]/awards'>) {
  const [{ locale, year: yearParam }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireBtc();
  if (!/^\d{4}$/.test(yearParam)) notFound();
  const t = await getTranslations('Admin.awards');

  // The user session: RLS lets the BTC read every season, draft ones included.
  const season = await getPublicSeason(Number(yearParam));
  if (!season) notFound();
  const supabase = await createClient();
  const [awards, players, teams, groupMatches, bracketMatches] = await Promise.all([
    loadSeasonAwards(supabase, season.id),
    getSeasonPlayers(season.id),
    getSeasonTeams(season.id),
    getSeasonMatches(season.id, 'group'),
    getSeasonMatches(season.id, 'knockout'),
  ]);

  // `?award=new` opens an empty form; no choice opens the first award, or the empty form when there is none.
  const choice = typeof query.award === 'string' ? query.award : undefined;
  const selected = choice === 'new' ? null : (awards.find((a) => a.id === choice) ?? awards[0] ?? null);
  const matches = [
    ...[...groupMatches].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true })),
    ...[...bracketMatches].sort((a, b) => BRACKET_ORDER.indexOf(a.code) - BRACKET_ORDER.indexOf(b.code)),
  ].map((m) => ({ id: m.id, code: m.code, homeTeamId: m.home_team_id, awayTeamId: m.away_team_id }));
  const pickerPlayers = players
    .map((p) => ({ id: p.id, name: p.name, teamId: p.teamId }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const listItems = awards.map((a) => ({
    id: a.id,
    name: localized(a.name_vi, a.name_en, locale),
    sponsor: a.sponsor,
    value: a.value_vnd,
    winners: a.winners.length,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <Link href={`/admin/seasons/${season.year}`} className="text-primary text-sm font-medium hover:underline">
            {t('back')}
          </Link>
          <h1 className="font-display mt-1 text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('subtitle', { season: season.name, count: awards.length })}
          </p>
        </div>
        {selected && (
          <Link href={`/admin/seasons/${season.year}/awards?award=new`} className={`${buttonVariants()} ml-auto`}>
            {t('add')}
          </Link>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {awards.length === 0 ? (
          <p className="border-border bg-surface text-muted-foreground self-start rounded-[10px] border p-5 text-sm">
            {t('empty')}
          </p>
        ) : (
          <AwardList
            // Remount with the saved order and names after a refresh.
            key={listItems.map((a) => `${a.id}:${a.name}:${a.sponsor}:${a.value}:${a.winners}`).join('|')}
            seasonId={season.id}
            year={season.year}
            selectedId={selected?.id ?? null}
            awards={listItems}
          />
        )}

        <section className="border-border bg-surface flex min-w-0 flex-col gap-5 self-start rounded-[10px] border p-5">
          <AwardForm
            key={selected?.id ?? 'new'}
            seasonId={season.id}
            year={season.year}
            award={selected ? formValues(selected) : null}
          />

          <div className="border-border flex flex-col gap-3 border-t pt-4">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t('winners.title')}
            </h2>
            {selected ? (
              <>
                {selected.winners.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('winners.empty')}</p>
                ) : (
                  <ul className="divide-border divide-y">
                    {selected.winners.map((w) => (
                      <WinnerRow
                        key={w.id}
                        winner={{
                          id: w.id,
                          kind: w.kind,
                          team: w.team,
                          players: w.members.map((m) => m.name),
                          matchCode: w.match?.code ?? null,
                          note: w.note,
                        }}
                      />
                    ))}
                  </ul>
                )}
                <AddWinnerForm
                  // A fresh form after each added winner.
                  key={`${selected.id}:${selected.winners.length}`}
                  awardId={selected.id}
                  players={pickerPlayers}
                  teams={teams.map(({ id, name, color }) => ({ id, name, color }))}
                  matches={matches}
                />
              </>
            ) : (
              <p className="text-muted-foreground text-sm">{t('winners.saveFirst')}</p>
            )}
          </div>

          {selected && (
            <div className="border-border flex justify-end border-t pt-4">
              <DeleteAwardForm awardId={selected.id} year={season.year} name={selected.name_vi} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function AwardsPage({ params, searchParams }: PageProps<'/[locale]/admin/seasons/[year]/awards'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Awards params={params} searchParams={searchParams} />
    </Suspense>
  );
}
