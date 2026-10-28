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
import { lineupEditable, type SlotPair } from '@/lib/match-lineup';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { AttendanceForm, type AttendancePlayer } from './attendance-form';
import { LineupStep, type LineupTeam } from './lineup-step';
import { LockedLineups } from './locked-lineups';

const STEPS = ['attendance', 'lineup', 'lock', 'scores', 'done'] as const;
type Step = (typeof STEPS)[number];
/** The lineups are locked from `lineup_locked` on; later steps only read them. */
const LOCKED_STATUSES: readonly string[] = ['lineup_locked', 'in_progress', 'completed'];

async function StaffMatch({ params, searchParams }: PageProps<'/[locale]/admin/matches/[id]'>) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
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
      'id, code, stage, status, imported, relay_handicap_home, relay_handicap_away, scheduled_at, home_team_id, away_team_id, court:court_id (name), season:season_id (settings)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!match || !match.season) notFound();

  const parsedSettings = parseSeasonSettings(match.season.settings);
  const settings = parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS;
  const teamIds = [match.home_team_id, match.away_team_id].filter((x): x is string => x !== null);

  const [teamsResult, playersResult, attendanceResult, slotsResult, overridesResult] = await Promise.all([
    supabase.from('team').select('id, name, color').in('id', teamIds),
    supabase
      .from('season_player')
      .select('id, team_id, rank, skill_points, status, person:person_id (full_name)')
      .in('team_id', teamIds)
      .order('rank')
      .order('skill_points', { ascending: false }),
    supabase.from('match_attendance').select('team_id, season_player_id').eq('match_id', match.id),
    supabase
      .from('match_slot')
      .select('slot_no, slot_type, home_p1, home_p2, away_p1, away_p2, handicap_home, handicap_away')
      .eq('match_id', match.id)
      .order('slot_no'),
    // Which rules the BTC overrode, without the reasons (lineup_override itself is BTC-only).
    supabase.rpc('lineup_override_codes', { p_match_id: match.id }),
  ]);
  if (teamsResult.error) throw teamsResult.error;
  if (playersResult.error) throw playersResult.error;
  if (attendanceResult.error) throw attendanceResult.error;
  if (slotsResult.error) throw slotsResult.error;
  if (overridesResult.error) throw overridesResult.error;

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
  const slots = slotsResult.data;
  const lineupTeam = (team: (typeof teams)[number], side: 'home' | 'away'): LineupTeam => ({
    team,
    side,
    present: rosterOf(team.id).filter((p) => present.has(p.id)),
    saved: slots.map((slot): SlotPair => [slot[`${side}_p1`], slot[`${side}_p2`]]),
    overridden: overridesResult.data.filter((o) => o.team_id === team.id).map((o) => o.rule_code),
  });

  // Steps reachable now: attendance and lineups while the match is scheduled, the locked lineups once
  // they are locked. The scores follow in a later update.
  const locked = LOCKED_STATUSES.includes(match.status);
  const available: Step[] =
    teams.length < 2
      ? ['attendance']
      : lineupEditable(match.status)
        ? ['attendance', 'lineup']
        : locked
          ? ['attendance', 'lock']
          : ['attendance'];
  const bothTicked =
    teams.length === 2 && teams.every((team) => attendanceResult.data.some((a) => a.team_id === team.id));
  const requested = STEPS.find((step) => step === query.step);
  const step: Step =
    requested && available.includes(requested)
      ? requested
      : locked && available.includes('lock')
        ? 'lock'
        : available.includes('lineup') && bothTicked
          ? 'lineup'
          : 'attendance';
  const nameOf = new Map(playersResult.data.map((p) => [p.id, p.person?.full_name ?? '']));
  const namesOf = (...ids: (string | null)[]) => ids.filter((x) => x !== null).map((x) => nameOf.get(x) ?? '—');
  const current = STEPS.indexOf(step);

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
        {STEPS.map((stepName, i) => (
          <li
            key={stepName}
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
            {available.includes(stepName) && i !== current ? (
              <Link
                href={`/admin/matches/${match.id}?step=${stepName}`}
                className="hover:text-foreground hover:underline"
              >
                {t(`steps.${stepName}`)}
              </Link>
            ) : (
              t(`steps.${stepName}`)
            )}
          </li>
        ))}
      </ol>

      {teams.length < 2 ? (
        <p className="border-border bg-surface text-muted-foreground rounded-[10px] border p-8 text-center text-sm">
          {t('tbd')}
        </p>
      ) : step === 'lock' ? (
        <section aria-labelledby="lock-title" className="flex flex-col gap-3">
          <h2 id="lock-title" className="font-display text-2xl font-bold uppercase">
            {t('steps.lock')}
          </h2>
          <LockedLineups
            matchId={match.id}
            code={match.code}
            relay={match.stage !== 'group'}
            relayStart={
              match.relay_handicap_home !== null && match.relay_handicap_away !== null
                ? { home: match.relay_handicap_home, away: match.relay_handicap_away }
                : null
            }
            teams={teams}
            slots={slots.map((slot) => ({
              slotNo: slot.slot_no,
              slotType: slot.slot_type,
              home: namesOf(slot.home_p1, slot.home_p2),
              away: namesOf(slot.away_p1, slot.away_p2),
              handicap: { home: slot.handicap_home, away: slot.handicap_away },
            }))}
            canUnlock={viewer.role === 'btc' && match.status === 'lineup_locked'}
          />
        </section>
      ) : step === 'lineup' ? (
        <section aria-labelledby="lineup-title" className="flex flex-col gap-3">
          <div>
            <h2 id="lineup-title" className="font-display text-2xl font-bold uppercase">
              {t('steps.lineup')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('lineup.hint')}</p>
          </div>
          <LineupStep
            matchId={match.id}
            stage={match.stage}
            imported={match.imported}
            slots={slots.map((slot) => ({ slotNo: slot.slot_no, slotType: slot.slot_type }))}
            teams={[lineupTeam(teams[0], 'home'), lineupTeam(teams[1], 'away')]}
            settings={settings}
            editable={lineupEditable(match.status)}
            isBtc={viewer.role === 'btc'}
          />
        </section>
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

export default function StaffMatchPage({ params, searchParams }: PageProps<'/[locale]/admin/matches/[id]'>) {
  return (
    <Suspense>
      <StaffMatch params={params} searchParams={searchParams} />
    </Suspense>
  );
}
