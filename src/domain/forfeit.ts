// Forfeit and disqualification (spec §4.5, A4, A5): forfeit scores.
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
