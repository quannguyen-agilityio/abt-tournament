// Forfeit and disqualification (spec §4.5, A4, A5): forfeit scores, and the match changes for
// disqualifying or reinstating a team.
import type { Side } from './lineup';
import type { GroupSetScore, Score, SlotScore } from './score';
import type { SeasonSettings } from './settings';

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

const sideScore = (winner: Side, points: number): Score =>
  winner === 'home' ? { home: points, away: 0 } : { home: 0, away: points };

export interface GroupForfeitResult {
  winner: Side;
  setsWon: Score;
  points: Score;
  /** One set per slot, `set_target`–0 to the winner, with no start points. */
  sets: GroupSetScore[];
}

/**
 * Group forfeit (D17): the winner gets every set (5–0) at `set_target`–0 (31–0). Lineups and
 * handicaps are ignored, so every set starts at 0–0.
 */
export function groupForfeit(
  forfeitSide: Side,
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match'>,
): GroupForfeitResult {
  const winner = other(forfeitSide);
  const set = sideScore(winner, settings.set_target);
  const sets = Array.from({ length: settings.sets_per_match }, (_, i) => ({
    slot_no: i + 1,
    score_home: set.home,
    score_away: set.away,
    handicap_home: 0,
    handicap_away: 0,
  }));
  return {
    winner,
    setsWon: sideScore(winner, settings.sets_per_match),
    points: sideScore(winner, settings.set_target * settings.sets_per_match),
    sets,
  };
}

export interface KnockoutForfeitResult {
  winner: Side;
  /** The final scoreboard: the last relay milestone to 0 (125–0). */
  score: Score;
  /** Cumulative legs, each milestone to 0, with no start handicap. */
  legs: SlotScore[];
}

/** Knock-out forfeit (A5): the winner advances, and the relay is recorded as 125–0. */
export function knockoutForfeit(
  forfeitSide: Side,
  settings: Pick<SeasonSettings, 'relay_milestones'>,
): KnockoutForfeitResult {
  const winner = other(forfeitSide);
  const legs = settings.relay_milestones.map((milestone, i) => {
    const score = sideScore(winner, milestone);
    return { slot_no: i + 1, score_home: score.home, score_away: score.away };
  });
  return { winner, score: sideScore(winner, settings.relay_milestones.at(-1) ?? 0), legs };
}

export type MatchStatus = 'scheduled' | 'lineup_locked' | 'in_progress' | 'completed' | 'forfeit' | 'annulled';
export type MatchStage = 'group' | 'semi_final' | 'third_place' | 'final';
/** Any status a match can be restored to. */
export type ActiveStatus = Exclude<MatchStatus, 'annulled'>;

/** The `match` columns these rules read. */
export interface ForfeitMatch {
  id: string;
  stage: MatchStage;
  status: MatchStatus;
  status_before_annul: ActiveStatus | null;
  home_team_id: string | null;
  away_team_id: string | null;
}

/** The `match` columns to write. Only the listed matches change. */
export type MatchChange =
  | {
      id: string;
      status: 'annulled';
      status_before_annul: ActiveStatus;
    }
  | {
      id: string;
      status: ActiveStatus;
      status_before_annul: null;
    }
  | {
      id: string;
      status: 'forfeit';
      forfeit_team_id: string;
      /** The side that loses, for `knockoutForfeit`. */
      forfeitSide: Side;
    };

export type DisqualificationRuleCode = 'NOT_IN_SEASON' | 'NO_NEXT_MATCH' | 'GROUP_CLOSED';

export type DisqualificationResult =
  | { ok: true; changes: MatchChange[] }
  | {
      ok: false;
      code: DisqualificationRuleCode;
      /** next-intl key, e.g. `Disqualification.errors.GROUP_CLOSED`. */
      message_key: string;
    };

const refuse = (code: DisqualificationRuleCode): DisqualificationResult => ({
  ok: false,
  code,
  message_key: `Disqualification.errors.${code}`,
});

const sideOf = (match: ForfeitMatch, teamId: string): Side | null =>
  match.home_team_id === teamId ? 'home' : match.away_team_id === teamId ? 'away' : null;

const STAGE_ORDER: Record<MatchStage, number> = { group: 0, semi_final: 1, third_place: 2, final: 2 };
const UNFINISHED: readonly MatchStatus[] = ['scheduled', 'lineup_locked', 'in_progress'];

/**
 * Disqualify a team (BTC). The returned changes are also what the confirmation dialog lists.
 * - Group stage (group not closed): every group match of the team is annulled, played ones
 *   included (A4). A match already annulled (its opponent was disqualified first) stays as it is.
 * - Knock-out (group closed): the team's next unfinished match becomes a forfeit and the opponent
 *   advances. Group results stay as they are.
 */
export function disqualifyTeam(
  teamId: string,
  matches: readonly ForfeitMatch[],
  groupClosed: boolean,
): DisqualificationResult {
  const own = matches.filter((m) => sideOf(m, teamId) !== null);
  if (own.length === 0) return refuse('NOT_IN_SEASON');

  if (!groupClosed) {
    const changes = own
      .filter((m): m is ForfeitMatch & { status: ActiveStatus } => m.stage === 'group' && m.status !== 'annulled')
      .map((m): MatchChange => ({ id: m.id, status: 'annulled', status_before_annul: m.status }));
    return { ok: true, changes };
  }

  const next = own
    .filter((m) => m.stage !== 'group' && UNFINISHED.includes(m.status))
    .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage])[0];
  if (!next) return refuse('NO_NEXT_MATCH');
  return {
    ok: true,
    changes: [{ id: next.id, status: 'forfeit', forfeit_team_id: teamId, forfeitSide: sideOf(next, teamId)! }],
  };
}

/**
 * Reinstate a team (BTC): its annulled group matches go back to `status_before_annul`. A match
 * whose opponent is still disqualified stays annulled. Refused once the group is closed, so a
 * knock-out forfeit is final.
 */
export function reinstateTeam(
  teamId: string,
  matches: readonly ForfeitMatch[],
  groupClosed: boolean,
  disqualifiedTeamIds: readonly string[] = [],
): DisqualificationResult {
  if (groupClosed) return refuse('GROUP_CLOSED');
  const own = matches.filter((m) => sideOf(m, teamId) !== null);
  if (own.length === 0) return refuse('NOT_IN_SEASON');

  const stillOut = new Set(disqualifiedTeamIds.filter((id) => id !== teamId));
  const changes = own
    .filter((m) => m.stage === 'group' && m.status === 'annulled' && m.status_before_annul !== null)
    .filter((m) => {
      const opponent = sideOf(m, teamId) === 'home' ? m.away_team_id : m.home_team_id;
      return opponent === null || !stillOut.has(opponent);
    })
    .map((m): MatchChange => ({ id: m.id, status: m.status_before_annul!, status_before_annul: null }));
  return { ok: true, changes };
}
