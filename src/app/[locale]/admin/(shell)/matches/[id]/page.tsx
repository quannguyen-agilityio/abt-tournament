import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { MatchStatusBadge } from '@/components/match-status-badge';
import { TeamChip } from '@/components/team-chip';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import { formatDate, formatTime } from '@/lib/format';
import { attendanceEditable } from '@/lib/match-attendance';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { AttendanceForm, type AttendancePlayer } from './attendance-form';

const STEPS = ['attendance', 'lineup', 'lock', 'scores', 'done'] as const;

async function StaffMatch({ params }: Pick<PageProps<'/[locale]/admin/matches/[id]'>, 'params'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const viewer = await requireStaff();
  if (!isUuid(id)) notFound();
  const t = await getTranslations('Admin.match');

  // The user session: RLS shows referees the matches of non-draft seasons, and the BTC all of them.
  const supabase = await createClient();
  const { data: match, error } = await supabase
    .from('match')
    .select(
      'id, code, stage, status, scheduled_at, home_team_id, away_team_id, court:court_id (name), season:season_id (settings)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!match || !match.season) notFound();

  const parsedSettings = parseSeasonSettings(match.season.settings);
  const settings = parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS;
  const teamIds = [match.home_team_id, match.away_team_id].filter((x): x is string => x !== null);

  const [teamsResult, playersResult, attendanceResult] = await Promise.all([
    supabase.from('team').select('id, name, color').in('id', teamIds),
    supabase
      .from('season_player')
      .select('id, team_id, rank, skill_points, status, person:person_id (full_name)')
      .in('team_id', teamIds)
      .order('rank')
      .order('skill_points', { ascending: false }),
    supabase.from('match_attendance').select('team_id, season_player_id').eq('match_id', match.id),
  ]);
  if (teamsResult.error) throw teamsResult.error;
  if (playersResult.error) throw playersResult.error;
  if (attendanceResult.error) throw attendanceResult.error;

  const present = new Set(attendanceResult.data.map((a) => a.season_player_id));
  // Withdrawn players stay listed only if they were ticked before they withdrew.
  const rosterOf = (teamId: string): AttendancePlayer[] =>
    playersResult.data
      .filter((p) => p.team_id === teamId && (p.status === 'active' || present.has(p.id)))
      .map((p) => ({ id: p.id, name: p.person?.full_name ?? '', rank: p.rank, skillPoints: p.skill_points }));
  const teams = teamIds
    .map((teamId) => teamsResult.data.find((team) => team.id === teamId))
    .filter((team) => team !== undefined);

  const at = match.scheduled_at ? new Date(match.scheduled_at) : null;
  const editable = attendanceEditable(match.status);
  // Attendance is the only step built so far; the step bar shows where the flow goes next.
  const current = 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/matches" className="text-primary text-sm font-medium hover:underline">
          {t('back')}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-display text-3xl font-bold">{match.code}</h1>
          <MatchStatusBadge status={match.status} />
          <span className="text-muted-foreground text-sm">
            {[
              t(`stage.${match.stage}`),
              match.court?.name ?? t('noCourt'),
              at
                ? `${formatDate(at, locale, settings.timezone)} ${formatTime(at, locale, settings.timezone)}`
                : t('unscheduled'),
            ].join(' · ')}
          </span>
        </div>
        {teams.length === 2 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-lg">
            <TeamChip name={teams[0].name} color={teams[0].color} />
            <span className="text-muted-foreground">vs</span>
            <TeamChip name={teams[1].name} color={teams[1].color} />
          </div>
        )}
      </div>

      <ol
        aria-label={t('stepsLabel')}
        className="border-border bg-surface flex gap-5 overflow-x-auto rounded-[10px] border p-3"
      >
        {STEPS.map((step, i) => (
          <li
            key={step}
            aria-current={i === current ? 'step' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 text-sm whitespace-nowrap',
              i === current ? 'text-foreground font-semibold' : 'text-muted-foreground',
            )}
          >
            <b
              className={cn(
                'grid size-6 place-items-center rounded-full border text-xs',
                i === current ? 'bg-primary text-primary-foreground border-transparent' : 'border-border',
              )}
            >
              {i + 1}
            </b>
            {t(`steps.${step}`)}
          </li>
        ))}
      </ol>

      {teams.length < 2 ? (
        <p className="border-border bg-surface text-muted-foreground rounded-[10px] border p-8 text-center text-sm">
          {t('tbd')}
        </p>
      ) : (
        <section aria-labelledby="attendance-title" className="flex flex-col gap-3">
          <div>
            <h2 id="attendance-title" className="font-display text-2xl font-bold uppercase">
              {t('steps.attendance')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('attendance.hint', { minimum: settings.min_players_present })}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {teams.map((team) => (
              <AttendanceForm
                key={team.id}
                matchId={match.id}
                team={team}
                players={rosterOf(team.id)}
                present={attendanceResult.data.filter((a) => a.team_id === team.id).map((a) => a.season_player_id)}
                minPresent={settings.min_players_present}
                editable={editable}
                isBtc={viewer.role === 'btc'}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function StaffMatchPage({ params }: PageProps<'/[locale]/admin/matches/[id]'>) {
  return (
    <Suspense>
      <StaffMatch params={params} />
    </Suspense>
  );
}
