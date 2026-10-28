import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { findScheduleConflicts } from '@/domain/schedule';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireBtc } from '@/lib/auth/session';
import { formatDay } from '@/lib/format';
import { scheduleGrid, utcToZoned } from '@/lib/schedule';
import { createClient } from '@/lib/supabase/server';
import { GenerateSchedule, MatchSlotForm } from './schedule-forms';

const CELL = 'px-3 py-2 align-top';

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
    .select('id, year, name, settings, match_days')
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

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const courtName = new Map(courts.map((court) => [court.id, court.name]));
  const profileName = new Map(profiles.map((p) => [p.user_id, p.display_name]));
  const codeOf = new Map(matches.map((m) => [m.id, m.code]));
  const teamsLabel = (m: (typeof matches)[number]) =>
    m.home_team_id && m.away_team_id
      ? `${teamById.get(m.home_team_id)?.name ?? ''} – ${teamById.get(m.away_team_id)?.name ?? ''}`
      : t('tbd');

  const conflicts = findScheduleConflicts(
    matches.map((m) => ({
      id: m.id,
      startsAt: m.scheduled_at && new Date(m.scheduled_at).toISOString(),
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      courtId: m.court_id,
      refereeId: m.referee_id,
    })),
  );
  const conflicted = new Set(conflicts.flatMap((c) => c.matchIds));
  const conflictMessages = conflicts.map((c) => {
    const { date, time } = utcToZoned(new Date(c.startsAt), timezone);
    const subject =
      c.kind === 'team'
        ? (teamById.get(c.subjectId)?.name ?? '')
        : c.kind === 'referee'
          ? (profileName.get(c.subjectId) ?? '')
          : (courtName.get(c.subjectId) ?? '');
    return t(`conflicts.${c.kind}`, {
      when: `${formatDay(date, locale)} ${time}`,
      subject,
      matches: c.matchIds.map((id) => codeOf.get(id)).join(', '),
    });
  });

  const grid = scheduleGrid(matches, season.match_days, timezone);
  // A column for matches that have a time but no court yet, only when there are some.
  const columns = [
    ...courts.map((court) => ({ id: court.id as string | null, name: court.name })),
    ...(matches.some((m) => m.scheduled_at && !m.court_id) ? [{ id: null, name: t('noCourt') }] : []),
  ];
  const dayOptions = grid.days.map((day) => ({ value: day.date, label: formatDay(day.date, locale) }));
  const referees = profiles
    .filter((p) => p.is_active || matches.some((m) => m.referee_id === p.user_id))
    .map((p) => ({ id: p.user_id, name: p.display_name }));

  const card = (m: (typeof matches)[number]) => (
    <div
      key={m.id}
      className={`flex min-w-44 flex-col gap-1 rounded-lg border p-2 ${conflicted.has(m.id) ? 'border-loss bg-loss/10' : 'border-border'}`}
    >
      <div className="flex items-center gap-2">
        <b className="font-display">{m.code}</b>
        <span className="text-muted-foreground text-xs">{t(`status.${m.status}`)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {m.home_team_id && m.away_team_id ? (
          [m.home_team_id, m.away_team_id].map((id, i) => (
            <span key={id} className="inline-flex items-center gap-1">
              {i === 1 && <span className="text-muted-foreground">–</span>}
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: teamById.get(id)?.color }}
              />
              {teamById.get(id)?.name}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">{t('tbd')}</span>
        )}
      </div>
      <div className="text-muted-foreground text-xs">
        {m.referee_id ? t('refereeIs', { name: profileName.get(m.referee_id) ?? '' }) : t('noReferee')}
      </div>
    </div>
  );

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
          {conflictMessages.length > 0 ? (
            <section
              aria-label={t('conflicts.title')}
              className="border-loss/40 bg-loss/10 flex flex-col gap-1 rounded-[10px] border p-4 text-sm"
            >
              <h2 className="font-semibold">{t('conflicts.title')}</h2>
              <ul className="list-disc pl-5">
                {conflictMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </section>
          ) : (
            <p role="status" className="border-border bg-surface rounded-[10px] border p-3 text-sm">
              <span className="text-win font-semibold">✓</span> {t('conflicts.none')}
            </p>
          )}

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

          {grid.days.map((day) => (
            <section key={day.date} className="flex flex-col gap-2">
              <h2 className="font-display text-2xl font-bold uppercase">{formatDay(day.date, locale)}</h2>
              {day.times.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('dayEmpty')}</p>
              ) : (
                <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
                  <table
                    className="w-full border-collapse text-left text-sm"
                    aria-label={t('gridLabel', { day: formatDay(day.date, locale) })}
                  >
                    <thead>
                      <tr className="text-muted-foreground text-xs uppercase">
                        <th scope="col" className="px-3 py-2 font-medium">
                          {t('time')}
                        </th>
                        {columns.map((column) => (
                          <th key={column.id ?? 'none'} scope="col" className="px-3 py-2 font-medium">
                            {column.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {day.times.map(({ time, matches: atTime }) => (
                        <tr key={time} className="border-border border-t">
                          <th scope="row" className={`${CELL} font-display text-lg font-semibold tabular-nums`}>
                            {time}
                          </th>
                          {columns.map((column) => {
                            const here = atTime.filter((m) => m.court_id === column.id);
                            return (
                              <td key={column.id ?? 'none'} className={CELL}>
                                {here.length === 0 ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <div className="flex flex-col gap-2">{here.map(card)}</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}

          {grid.unscheduled.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-display text-2xl font-bold uppercase">
                {t('unscheduled', { count: grid.unscheduled.length })}
              </h2>
              <div className="flex flex-wrap gap-2">{grid.unscheduled.map(card)}</div>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-2xl font-bold uppercase">{t('assign')}</h2>
            <p className="text-muted-foreground text-sm">{t('assignHint', { timezone })}</p>
            <ul className="border-border bg-surface divide-border divide-y rounded-[10px] border">
              {matches.map((m) => {
                const local = m.scheduled_at ? utcToZoned(new Date(m.scheduled_at), timezone) : null;
                return (
                  <li key={m.id} className={`p-3 ${conflicted.has(m.id) ? 'bg-loss/10' : ''}`}>
                    <MatchSlotForm
                      seasonId={season.id}
                      match={{
                        id: m.id,
                        code: m.code,
                        label: teamsLabel(m),
                        date: local?.date ?? '',
                        time: local?.time ?? '',
                        courtId: m.court_id ?? '',
                        refereeId: m.referee_id ?? '',
                      }}
                      days={dayOptions}
                      courts={courts}
                      referees={referees}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export default function SeasonSchedulePage({ params }: PageProps<'/[locale]/admin/seasons/[year]/schedule'>) {
  return (
    <Suspense>
      <SeasonSchedule params={params} />
    </Suspense>
  );
}
