import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { LiveEvent } from '@/domain/live';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { liveCardState } from '@/lib/live-entry';
import { toLiveEvent } from '@/lib/live-scoring';
import type { ScorerSlot } from '@/lib/live-scorer';
import { createClient } from '@/lib/supabase/server';
import Loading from '../../../../../loading';
import { Scorer } from './scorer';

/**
 * The scoring screen's own route (spec-phase-2 §8.0 Direct link), outside the admin shell so it fills
 * the screen. It needs the same role as A5. The user who holds the scorer lock gets the scorer screens
 * (L-B–L-E), any other user the read-only viewer (L-H). In every other state it opens the match's
 * Scores step, which shows the Live scoring card for the current lock state.
 */
async function LiveScreen({ params }: Pick<PageProps<'/[locale]/admin/seasons/[year]/matches/[code]/live'>, 'params'>) {
  const { locale, year, code } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const viewer = await requireStaff();
  if (!/^\d{4}$/.test(year)) notFound();

  // The user session: RLS shows referees the matches of non-draft seasons, and the BTC all of them.
  const supabase = await createClient();
  const { data: season, error } = await supabase.from('season').select('id').eq('year', Number(year)).maybeSingle();
  if (error) throw error;
  if (!season) notFound();
  const { data: match, error: matchError } = await supabase
    .from('match')
    .select(
      'id, code, stage, status, final_entry, relay_handicap_home, relay_handicap_away, scorer_id, scorer_since, home_team_id, away_team_id, court:court_id (name), season:season_id (settings, year)',
    )
    .eq('season_id', season.id)
    .eq('code', decodeURIComponent(code))
    .maybeSingle();
  if (matchError) throw matchError;
  if (!match || !match.season) notFound();

  const parsedSettings = parseSeasonSettings(match.season.settings);
  const settings = parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS;
  const scoresStep = () => redirect({ href: `/admin/matches/${match.id}?step=scores`, locale });
  if (!match.home_team_id || !match.away_team_id) return scoresStep();
  const teamIds = [match.home_team_id, match.away_team_id];

  const [teamsResult, playersResult, slotsResult, scorerResult] = await Promise.all([
    supabase.from('team').select('id, name, color').in('id', teamIds),
    supabase.from('season_player').select('id, person:person_id (full_name)').in('team_id', teamIds),
    supabase
      .from('match_slot')
      .select(
        'id, slot_no, slot_type, live_status, home_p1, home_p2, away_p1, away_p2, handicap_home, handicap_away, score_home, score_away, forfeit_side, slot_substitution (side, replaced_id, substitute_id, created_at)',
      )
      .eq('match_id', match.id)
      .order('slot_no'),
    match.scorer_id
      ? supabase.from('scorer_name').select('display_name').eq('user_id', match.scorer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (teamsResult.error) throw teamsResult.error;
  if (playersResult.error) throw playersResult.error;
  if (slotsResult.error) throw slotsResult.error;
  if (scorerResult.error) throw scorerResult.error;

  // Substitutions apply in the order they were made.
  const slots: ScorerSlot[] = slotsResult.data.map(({ slot_substitution, ...slot }) => ({
    ...slot,
    substitutions: [...slot_substitution].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
  const cardState = liveCardState({
    status: match.status,
    settings,
    finalEntry: match.final_entry,
    scorerId: match.scorer_id,
    viewerId: viewer.id,
    slots,
  });
  const home = teamsResult.data.find((team) => team.id === match.home_team_id);
  const away = teamsResult.data.find((team) => team.id === match.away_team_id);
  // The scorer who confirmed the last set or leg keeps the lock, and stays here to see "Trận đấu kết
  // thúc": confirming revalidates the public data, which reloads this route right away.
  const finishedByViewer = cardState === 'done' && match.scorer_id === viewer.id;
  const shown = cardState === 'mine' || cardState === 'other' || finishedByViewer;
  if (!shown || !home || !away || slots.length === 0) return scoresStep();

  const { data: events, error: eventsError } = await supabase
    .from('live_event')
    .select('match_slot_id, seq, kind, payload, client_at')
    .in(
      'match_slot_id',
      slots.map((slot) => slot.id),
    )
    .order('seq');
  if (eventsError) throw eventsError;
  const logs: Record<number, LiveEvent[]> = {};
  const eventTimes: Record<number, Record<number, string>> = {};
  for (const slot of slots) {
    const rows = events.filter((e) => e.match_slot_id === slot.id);
    logs[slot.slot_no] = rows.map(toLiveEvent);
    eventTimes[slot.slot_no] = Object.fromEntries(rows.map((e) => [e.seq, e.client_at]));
  }

  return (
    <Scorer
      mode={cardState === 'other' ? 'viewer' : 'scorer'}
      matchId={match.id}
      code={match.code}
      courtName={match.court?.name ?? null}
      match={{
        stage: match.stage,
        relay_handicap_home: match.relay_handicap_home,
        relay_handicap_away: match.relay_handicap_away,
      }}
      settings={{ set_target: settings.set_target, relay_milestones: settings.relay_milestones }}
      medicalTimeoutMinutes={settings.medical_timeout_minutes}
      teams={{ home: { name: home.name, color: home.color }, away: { name: away.name, color: away.color } }}
      names={Object.fromEntries(playersResult.data.map((p) => [p.id, p.person?.full_name ?? '']))}
      slots={slots}
      logs={logs}
      eventTimes={eventTimes}
      viewerId={viewer.id}
      scorer={match.scorer_id ? { id: match.scorer_id, name: scorerResult.data?.display_name ?? '—' } : null}
    />
  );
}

export default function LiveScreenPage({ params }: PageProps<'/[locale]/admin/seasons/[year]/matches/[code]/live'>) {
  return (
    <Suspense fallback={<Loading />}>
      <LiveScreen params={params} />
    </Suspense>
  );
}
