import 'server-only';

import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { toLiveEvent } from '@/lib/live-scoring';
import { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadEvents(supabase: Supabase, slotId: string) {
  const { data, error } = await supabase
    .from('live_event')
    .select('seq, kind, payload')
    .eq('match_slot_id', slotId)
    .order('seq');
  if (error) throw error;
  return data.map(toLiveEvent);
}

/**
 * What `applyLiveEvent` replays, through the caller's session: the slot with its lineup, its match
 * and season settings, its log and, for relay leg 2 and later, the previous leg's score and log.
 * `null` when the slot is not readable.
 */
export async function loadLiveSlot(supabase: Supabase, slotId: string) {
  const { data: slot, error } = await supabase
    .from('match_slot')
    .select(
      'id, match_id, slot_no, home_p1, home_p2, away_p1, away_p2, handicap_home, handicap_away, slot_substitution (side, replaced_id, substitute_id, created_at), match:match_id (status, stage, relay_handicap_home, relay_handicap_away, season:season_id (settings))',
    )
    .eq('id', slotId)
    .maybeSingle();
  if (error) throw error;
  if (!slot?.match?.season) return null;
  const { match, slot_substitution, ...row } = slot;

  const parsedSettings = parseSeasonSettings(match.season.settings);
  const events = await loadEvents(supabase, slotId);

  let previous;
  if (match.stage !== 'group' && row.slot_no > 1) {
    const { data: before, error: beforeError } = await supabase
      .from('match_slot')
      .select('id, score_home, score_away')
      .eq('match_id', row.match_id)
      .eq('slot_no', row.slot_no - 1)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (before) {
      previous = {
        score: { home: before.score_home, away: before.score_away },
        events: await loadEvents(supabase, before.id),
      };
    }
  }

  return {
    slot: {
      ...row,
      substitutions: [...slot_substitution].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    },
    match,
    settings: parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS,
    events,
    previous,
  };
}
