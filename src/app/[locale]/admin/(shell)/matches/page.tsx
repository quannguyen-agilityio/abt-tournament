import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { MatchStatusBadge } from '@/components/match-status-badge';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { formatDate, formatTime } from '@/lib/format';
import { getCurrentSeasonYear } from '@/lib/seasons-db';
import { groupStaffMatches } from '@/lib/staff-matches';
import { createClient } from '@/lib/supabase/server';

async function StaffMatches({ params }: Pick<PageProps<'/[locale]/admin/matches'>, 'params'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const viewer = await requireStaff();
  const t = await getTranslations('Admin.matches');

  // The user session: RLS shows referees the matches of non-draft seasons, and the BTC all of them.
  const supabase = await createClient();
  const year = await getCurrentSeasonYear();
  const { data: season, error } = await supabase
    .from('season')
    .select('id, name, settings')
    .eq('year', year)
    .maybeSingle();
  if (error) throw error;

  if (!season) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('noSeason')}</p>
      </div>
    );
  }

  const [matchesResult, teamsResult, courtsResult] = await Promise.all([
    supabase
      .from('match')
      .select('id, code, status, home_team_id, away_team_id, scheduled_at, court_id, referee_id')
      .eq('season_id', season.id),
    supabase.from('team').select('id, name, color').eq('season_id', season.id),
    supabase.from('court').select('id, name').eq('season_id', season.id),
  ]);
  if (matchesResult.error) throw matchesResult.error;
  if (teamsResult.error) throw teamsResult.error;
  if (courtsResult.error) throw courtsResult.error;

  const parsedSettings = parseSeasonSettings(season.settings);
  const { timezone } = parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS;
  const teamById = new Map(teamsResult.data.map((team) => [team.id, team]));
  const courtName = new Map(courtsResult.data.map((court) => [court.id, court.name]));

  // "Today" reads the clock, which is request-time data under cacheComponents.
  await connection();
  const groups = groupStaffMatches(matchesResult.data, viewer.id, new Date(), timezone);
  type Row = (typeof groups.mine)[number];

  const row = (m: Row) => {
    const at = m.scheduled_at ? new Date(m.scheduled_at) : null;
    return (
      <li key={m.id}>
        <Link
          href={`/admin/matches/${m.id}`}
          className="hover:bg-surface-2 grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 p-3 sm:grid-cols-[3.5rem_13rem_minmax(0,1fr)_auto]"
        >
          <b className="font-display text-lg">{m.code}</b>
          <span className="text-muted-foreground text-sm tabular-nums">
            {at ? `${formatDate(at, locale, timezone)} ${formatTime(at, locale, timezone)}` : t('unscheduled')}
            {' · '}
            {m.court_id ? courtName.get(m.court_id) : t('noCourt')}
          </span>
          <MatchStatusBadge status={m.status} className="justify-self-end sm:order-last" />
          <span className="col-span-2 col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 text-sm sm:col-span-1 sm:col-start-auto">
            {m.home_team_id && m.away_team_id ? (
              [m.home_team_id, m.away_team_id].map((id, i) => (
                <span key={id} className="inline-flex min-w-0 items-center gap-1.5">
                  {i === 1 && <span className="text-muted-foreground">–</span>}
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: teamById.get(id)?.color }}
                  />
                  <span className="truncate">{teamById.get(id)?.name}</span>
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">{t('tbd')}</span>
            )}
          </span>
        </Link>
      </li>
    );
  };

  const sections = [
    { key: 'mine', matches: groups.mine },
    { key: 'today', matches: groups.today },
    { key: 'rest', matches: groups.rest },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('subtitle', { season: season.name, count: matchesResult.data.length })}
        </p>
      </div>

      {matchesResult.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        sections
          .filter((section) => section.matches.length > 0)
          .map((section) => (
            <section key={section.key} aria-labelledby={`matches-${section.key}`} className="flex flex-col gap-2">
              <h2
                id={`matches-${section.key}`}
                className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase"
              >
                {t(`groups.${section.key}`, { count: section.matches.length })}
              </h2>
              <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-[10px] border">
                {section.matches.map(row)}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}

export default function StaffMatchesPage({ params }: PageProps<'/[locale]/admin/matches'>) {
  return (
    <Suspense>
      <StaffMatches params={params} />
    </Suspense>
  );
}
