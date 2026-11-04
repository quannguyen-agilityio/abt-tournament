import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireBtc } from '@/lib/auth/session';
import { utcToZoned } from '@/lib/schedule';
import { createClient } from '@/lib/supabase/server';
import { ScheduleBoard } from './schedule-board';
import { GenerateSchedule } from './schedule-forms';
import Loading from './loading';

async function SeasonSchedule({ params }: Pick<PageProps<'/[locale]/admin/seasons/[year]/schedule'>, 'params'>) {
  const { locale, year: yearParam } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireBtc();
  if (!/^\d{4}$/.test(yearParam)) notFound();
  const t = await getTranslations('Admin.schedule');

  // The user session: RLS lets the BTC read every match, court and profile.
  const supabase = await createClient();
  const { data: season, error } = await supabase
    .from('season')
    .select('id, year, name, status, settings, match_days')
    .eq('year', Number(yearParam))
    .maybeSingle();
  if (error) throw error;
  if (!season) notFound();

  const [courtsResult, teamsResult, matchesResult, profilesResult] = await Promise.all([
    supabase.from('court').select('id, name').eq('season_id', season.id).order('sort_order').order('name'),
    supabase.from('team').select('id, name, color').eq('season_id', season.id).order('name'),
    supabase
      .from('match')
      .select('id, code, stage, status, home_team_id, away_team_id, scheduled_at, court_id, referee_id')
      .eq('season_id', season.id)
      .order('scheduled_at', { nullsFirst: false })
      .order('code'),
    supabase.from('profile').select('user_id, display_name, is_active').order('display_name'),
  ]);
  if (courtsResult.error) throw courtsResult.error;
  if (teamsResult.error) throw teamsResult.error;
  if (matchesResult.error) throw matchesResult.error;
  if (profilesResult.error) throw profilesResult.error;
  const courts = courtsResult.data;
  const teams = teamsResult.data;
  const matches = matchesResult.data;
  const profiles = profilesResult.data;

  // Mirrors the guard of generate_group_schedule, which has the final say.
  const groupIds = matches.filter((m) => m.stage === 'group').map((m) => m.id);
  let locked = matches.some((m) => m.stage === 'group' && m.status !== 'scheduled');
  if (!locked && groupIds.length > 0) {
    const [slots, attendance] = await Promise.all([
      supabase
        .from('match_slot')
        .select('id')
        .in('match_id', groupIds)
        .or(
          'home_p1.not.is.null,home_p2.not.is.null,away_p1.not.is.null,away_p2.not.is.null,score_home.not.is.null,score_away.not.is.null',
        )
        .limit(1),
      supabase.from('match_attendance').select('id').in('match_id', groupIds).limit(1),
    ]);
    if (slots.error) throw slots.error;
    if (attendance.error) throw attendance.error;
    locked = slots.data.length > 0 || attendance.data.length > 0;
  }

  const parsedSettings = parseSeasonSettings(season.settings);
  const { timezone } = parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS;

  const referees = profiles
    .filter((p) => p.is_active || matches.some((m) => m.referee_id === p.user_id))
    .map((p) => ({ id: p.user_id, name: p.display_name }));
  // Mirrors the guard of save_match_slots, which has the final say.
  const pastGroupStage = season.status === 'knockout' || season.status === 'finished';
  const boardMatches = matches.map((m) => {
    const local = m.scheduled_at ? utcToZoned(new Date(m.scheduled_at), timezone) : null;
    return {
      id: m.id,
      code: m.code,
      status: m.status,
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      locked: (m.status !== 'scheduled' && m.status !== 'lineup_locked') || (m.stage === 'group' && pastGroupStage),
      slot: {
        date: local?.date ?? '',
        time: local?.time ?? '',
        courtId: m.court_id ?? '',
        refereeId: m.referee_id ?? '',
      },
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/admin/seasons/${season.year}`} className="text-primary text-sm font-medium hover:underline">
            {t('back')}
          </Link>
          <h1 className="font-display mt-1 text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('subtitle', { season: season.name, count: matches.length, teams: teams.length })}
          </p>
          <p className="text-muted-foreground text-sm">{locked ? t('lockedHint') : t('regenerateHint')}</p>
        </div>
        <GenerateSchedule
          seasonId={season.id}
          hasMatches={groupIds.length > 0}
          locked={locked}
          teamCount={teams.length}
        />
      </div>

      {matches.length === 0 ? (
        <p className="text-muted-foreground text-sm">{teams.length < 2 ? t('needTeams') : t('empty')}</p>
      ) : (
        <>
          {season.match_days.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {t.rich('noMatchDays', {
                link: (chunks) => (
                  <Link href={`/admin/seasons/${season.year}`} className="text-primary hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          )}

          <ScheduleBoard
            seasonId={season.id}
            timezone={timezone}
            matchDays={season.match_days}
            matches={boardMatches}
            teams={teams}
            courts={courts}
            referees={referees}
          />
        </>
      )}
    </div>
  );
}

export default function SeasonSchedulePage({ params }: PageProps<'/[locale]/admin/seasons/[year]/schedule'>) {
  return (
    <Suspense fallback={<Loading />}>
      <SeasonSchedule params={params} />
    </Suspense>
  );
}
