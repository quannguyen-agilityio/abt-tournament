import {
  effectivePair,
  type MatchStatus,
  type SeasonSettings,
  type Side,
  type SlotSubstitution,
  type SlotType,
} from '../domain';
import { matchScore, type MatchScore, type ScheduleMatchInput } from './public-matches';

/** A season player as the match page shows them: name, rank and skill points. */
export interface MatchPlayer {
  id: string;
  name: string;
  slug: string;
  rank: number;
  skill: number;
}

export interface MatchSlotInput {
  slot_no: number;
  slot_type: SlotType;
  home_p1: string | null;
  home_p2: string | null;
  away_p1: string | null;
  away_p2: string | null;
  handicap_home: number;
  handicap_away: number;
  score_home: number | null;
  score_away: number | null;
  /** In the order they were made. */
  substitutions: (SlotSubstitution & { reason: string })[];
}

/** The `match` row the page reads, with its slots. */
export interface MatchDetailInput extends Omit<ScheduleMatchInput, 'slots' | 'court_id'> {
  status_before_annul: MatchStatus | null;
  forfeit_reason: string | null;
  relay_handicap_home: number | null;
  relay_handicap_away: number | null;
  slots: MatchSlotInput[];
}

export interface SlotView {
  slotNo: number;
  type: SlotType;
  /** Relay: the cumulative score this leg plays to. */
  milestone: number | null;
  /** Effective players, substitutions applied. Unknown ids are left out. */
  pairs: Record<Side, MatchPlayer[]>;
  /** Group: start points of the set. Zero in a relay (see `relay.start`). */
  handicap: Record<Side, number>;
  /** Group: the set score. Relay: the cumulative scoreboard after this leg. */
  score: Record<Side, number> | null;
  winner: Side | null;
  substitutions: { side: Side; out: MatchPlayer | null; in: MatchPlayer | null; reason: string }[];
}

export interface RelayView {
  /** Start-of-leg-1 points, snapshot at lock time; null for a match without one (imported). */
  start: Record<Side, number> | null;
  cap: number;
  /** The final milestone (125): where the progress bars end. */
  target: number;
  milestones: number[];
  /** The scoreboard now: the last scored leg, or the start. */
  current: Record<Side, number>;
}

export interface MatchDetailView {
  /** Lineups are public from `lineup_locked` on (A6); an annulled match keeps its earlier status. */
  lineupVisible: boolean;
  score: MatchScore | null;
  slots: SlotView[];
  relay: RelayView | null;
}

/**
 * A6, as the RLS policy `private.lineup_is_public` puts it. RLS already hides the slots from the
 * public; staff signed in on the public site can read them, so the page checks again.
 */
export function lineupIsPublic(match: Pick<MatchDetailInput, 'status' | 'status_before_annul'>): boolean {
  return match.status !== 'scheduled' && match.status_before_annul !== 'scheduled';
}

const hasScore = (slot: Pick<MatchSlotInput, 'score_home' | 'score_away'>) =>
  slot.score_home !== null && slot.score_away !== null;

/** The public match page (spec §5 P4): set rows or relay legs, with what the header shows. */
export function buildMatchDetail(input: {
  match: MatchDetailInput;
  players: ReadonlyMap<string, MatchPlayer>;
  settings: Pick<
    SeasonSettings,
    'set_target' | 'sets_per_match' | 'relay_milestones' | 'ko_handicap_cap' | 'group_handicap_cap'
  >;
}): MatchDetailView {
  const { match, players, settings } = input;
  const relay = match.stage !== 'group';
  const lineupVisible = lineupIsPublic(match);
  const player = (id: string | null) => (id ? (players.get(id) ?? null) : null);
  const pair = (slot: MatchSlotInput, side: Side) =>
    effectivePair(slot, side)
      .map(player)
      .filter((p): p is MatchPlayer => p !== null);

  const slots = lineupVisible
    ? [...match.slots]
        .sort((a, b) => a.slot_no - b.slot_no)
        .map((slot): SlotView => {
          const score = hasScore(slot) ? { home: slot.score_home!, away: slot.score_away! } : null;
          return {
            slotNo: slot.slot_no,
            type: slot.slot_type,
            milestone: relay ? (settings.relay_milestones[slot.slot_no - 1] ?? null) : null,
            pairs: { home: pair(slot, 'home'), away: pair(slot, 'away') },
            handicap: relay ? { home: 0, away: 0 } : { home: slot.handicap_home, away: slot.handicap_away },
            score,
            winner: score && score.home !== score.away ? (score.home > score.away ? 'home' : 'away') : null,
            substitutions: slot.substitutions.map((sub) => ({
              side: sub.side,
              out: player(sub.replaced_id),
              in: player(sub.substitute_id),
              reason: sub.reason,
            })),
          };
        })
    : [];

  let relayView: RelayView | null = null;
  if (relay) {
    const start =
      match.relay_handicap_home !== null && match.relay_handicap_away !== null
        ? { home: match.relay_handicap_home, away: match.relay_handicap_away }
        : null;
    const last = slots.filter((s) => s.score).at(-1)?.score;
    relayView = {
      start,
      cap: settings.ko_handicap_cap,
      target: settings.relay_milestones.at(-1) ?? 0,
      milestones: [...settings.relay_milestones],
      current: last ?? start ?? { home: 0, away: 0 },
    };
  }

  return { lineupVisible, score: matchScore(match, settings), slots, relay: relayView };
}
