import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { AccentChip, LiveChip } from '@/components/live-chip';
import { MatchStatusBadge } from '@/components/match-status-badge';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { formatDate, formatTime } from '@/lib/format';
import { isLiveScored, liveProgress, scoredLive } from '@/lib/live-entry';
import { toLiveEvent } from '@/lib/live-scoring';
import { matchOutcome, scoreRules } from '@/lib/match-scores';
import { getCurrentSeasonYear } from '@/lib/seasons-db';
import { groupStaffMatches } from '@/lib/staff-matches';
import { createClient } from '@/lib/supabase/server';
import Loading from './loading';

async function StaffMatches({ params }: Pick<PageProps<'/[locale]/admin/matches'>, 'params'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const viewer = await requireStaff();
  const t = await getTranslations('Admin.matches');
  const tl = await getTranslations('Admin.match.live');

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
      .select(
        'id, code, status, stage, relay_handicap_home, relay_handicap_away, final_entry, scorer_id, home_team_id, away_team_id, scheduled_at, court_id, referee_id',
      )
      .eq('season_id', season.id),
    supabase.from('team').select('id, name, color').eq('season_id', season.id),
    supabase.from('court').select('id, name').eq('season_id', season.id),
  ]);
  if (matchesResult.error) throw matchesResult.error;
  if (teamsResult.error) throw teamsResult.error;
  if (courtsResult.error) throw courtsResult.error;

  const parsedSettings = parseSeasonSettings(season.settings);
  const settings = parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS;
  const { timezone } = settings;

  // Live scoring (spec-phase-2 §8.0): the matches in progress with a slot scored live come first, with
  // the set being played, its score and the scorer.
  const inProgressIds = matchesResult.data.filter((m) => m.status === 'in_progress').map((m) => m.id);
  const slotsResult =
    inProgressIds.length > 0
      ? await supabase
          .from('match_slot')
          .select('id, match_id, slot_no, live_status, score_home, score_away, handicap_home, handicap_away')
          .in('match_id', inProgressIds)
      : { data: [], error: null };
  if (slotsResult.error) throw slotsResult.error;
  const liveIds = new Set(slotsResult.data.filter(scoredLive).map((slot) => slot.match_id));
  const liveMatches = matchesResult.data.filter((m) => liveIds.has(m.id));
  const playing = slotsResult.data.filter((slot) => liveIds.has(slot.match_id) && slot.live_status === 'live');
  const scorerIds = [...new Set(liveMatches.flatMap((m) => (m.scorer_id ? [m.scorer_id] : [])))];
  const [eventsResult, scorersResult] = await Promise.all([
    playing.length > 0
      ? supabase
          .from('live_event')
          .select('match_slot_id, seq, kind, payload')
          .in(
            'match_slot_id',
            playing.map((slot) => slot.id),
          )
          .order('seq')
      : Promise.resolve({ data: [], error: null }),
    scorerIds.length > 0
      ? supabase.from('scorer_name').select('user_id, display_name').in('user_id', scorerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (scorersResult.error) throw scorersResult.error;
  const scorerName = new Map(scorersResult.data.map((p) => [p.user_id, p.display_name]));
  const liveRows = liveMatches
    .map((m) => {
      const slots = slotsResult.data.filter((slot) => slot.match_id === m.id);
      const rules = scoreRules(m);
      const eventsOf = (slotNo: number) => {
        const slotId = slots.find((slot) => slot.slot_no === slotNo)?.id;
        return eventsResult.data.filter((e) => e.match_slot_id === slotId).map(toLiveEvent);
      };
      return {
        match: m,
        relay: rules.relay,
        progress: liveProgress(rules, slots, eventsOf),
        matchScore: matchOutcome(rules, slots, settings).score,
      };
    })
    .sort((a, b) => a.match.code.localeCompare(b.match.code, 'en', { numeric: true }));
  const teamById = new Map(teamsResult.data.map((team) => [team.id, team]));
  const courtName = new Map(courtsResult.data.map((court) => [court.id, court.name]));

  // "Today" reads the clock, which is request-time data under cacheComponents.
  await connection();
  const groups = groupStaffMatches(
    matchesResult.data.filter((m) => !liveIds.has(m.id)),
    viewer.id,
    new Date(),
    timezone,
  );
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
          {m.status === 'lineup_locked' && isLiveScored(settings, m) ? (
            <AccentChip className="justify-self-end sm:order-last">{t('ready')}</AccentChip>
          ) : (
            <MatchStatusBadge status={m.status} className="justify-self-end sm:order-last" />
          )}
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

  const teamsLine = (m: Row) =>
    m.home_team_id && m.away_team_id
      ? `${teamById.get(m.home_team_id)?.name ?? ''} – ${teamById.get(m.away_team_id)?.name ?? ''}`
      : t('tbd');

  const liveRow = ({ match: m, relay, progress, matchScore }: (typeof liveRows)[number]) => {
    const current = progress
      ? `${tl(relay ? 'legN' : 'setN', { n: progress.slotNo })} · ${progress.score.home}–${progress.score.away}`
      : null;
    const total = relay && progress ? progress.score : matchScore;
    return (
      <li key={m.id}>
        <Link
          href={`/admin/matches/${m.id}?step=scores`}
          className="hover:bg-surface-2 flex flex-col gap-1 p-3"
          aria-label={[m.code, tl('title'), teamsLine(m), current].filter(Boolean).join(', ')}
        >
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <LiveChip />
            <b className="font-display text-lg">{m.code}</b>
            <span className="text-muted-foreground text-sm">
              {m.court_id ? courtName.get(m.court_id) : t('noCourt')}
            </span>
            {current && <span className="font-display ml-auto text-lg font-semibold tabular-nums">{current}</span>}
          </span>
          <span className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{teamsLine(m)}</span>
            <span className="font-display text-xl font-bold tabular-nums">
              {total.home}–{total.away}
            </span>
          </span>
          <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            {m.scorer_id ? (
              <span>
                {t.rich('live.scorer', {
                  name: scorerName.get(m.scorer_id) ?? '—',
                  b: (chunks) => <b className="text-foreground">{chunks}</b>,
                })}
              </span>
            ) : (
              <span>{t('live.noScorer')}</span>
            )}
            {m.scorer_id === viewer.id && <AccentChip>{t('live.you')}</AccentChip>}
            <span className="tabular-nums">
              · {t(relay ? 'live.cumulative' : 'live.setScore', { home: total.home, away: total.away })}
            </span>
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

      {liveRows.length > 0 && (
        <section aria-labelledby="matches-live" className="flex flex-col gap-2">
          <h2
            id="matches-live"
            className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] uppercase"
          >
            <LiveChip />
            {t('live.title', { count: liveRows.length })}
          </h2>
          <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-[10px] border">
            {liveRows.map(liveRow)}
          </ul>
        </section>
      )}

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
    <Suspense fallback={<Loading />}>
      <StaffMatches params={params} />
    </Suspense>
  );
}
