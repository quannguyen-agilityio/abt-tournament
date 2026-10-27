// Score validation (spec §4.4): group sets, cumulative relay legs and the group match result.
import type { Handicap } from './handicap';
import type { Side } from './lineup';
import type { SeasonSettings } from './settings';

export type ScoreRuleCode =
  | 'SCORE_INVALID'
  | 'SCORE_INCOMPLETE'
  | 'SET_TARGET'
  | 'BELOW_HANDICAP'
  | 'LEG_MILESTONE'
  | 'LEG_DECREASING'
  | 'LEG_OUT_OF_ORDER';

/** Non-blocking: the season can be played, but a relay may be decided oddly. */
export type ScoreWarningCode = 'KO_CAP_REACHES_MILESTONE';

export interface ScoreViolation<Code extends string = ScoreRuleCode> {
  code: Code;
  slotNo?: number;
  side?: Side;
  /** next-intl key, e.g. `Score.violations.SET_TARGET`. */
  message_key: string;
  /** ICU values for the message. */
  params?: Record<string, number>;
}

/** The score columns of `match_slot`. Group: final set score. Relay: cumulative at the end of the leg. */
export interface SlotScore {
  slot_no: number;
  score_home: number | null;
  score_away: number | null;
}

/** A group set with its start points (`match_slot.handicap_*`). */
export interface GroupSetScore extends SlotScore {
  handicap_home: number;
  handicap_away: number;
}

export type Score = Record<Side, number>;

const SIDES: readonly Side[] = ['home', 'away'];

function violation<Code extends string>(
  namespace: string,
  code: Code,
  details: Omit<ScoreViolation<Code>, 'code' | 'message_key'> = {},
): ScoreViolation<Code> {
  return { code, ...details, message_key: `Score.${namespace}.${code}` };
}

const scoreViolation = (code: ScoreRuleCode, details?: Omit<ScoreViolation, 'code' | 'message_key'>) =>
  violation('violations', code, details);

const isScore = (n: number) => Number.isInteger(n) && n >= 0;

/**
 * Reads a slot's scores. Returns `null` with no violation when nothing is entered yet, or `null`
 * with a violation when only one side is entered or a value is not a whole number ≥ 0.
 */
function readScore(slot: SlotScore, violations: ScoreViolation[]): Score | null {
  const { slot_no: slotNo, score_home: home, score_away: away } = slot;
  if (home === null && away === null) return null;
  if (home === null || away === null) {
    violations.push(scoreViolation('SCORE_INCOMPLETE', { slotNo }));
    return null;
  }
  const invalid = SIDES.filter((side) => !isScore(side === 'home' ? home : away));
  for (const side of invalid) violations.push(scoreViolation('SCORE_INVALID', { slotNo, side }));
  return invalid.length > 0 ? null : { home, away };
}

export interface GroupSetResult {
  /** The side at `set_target`; `null` while the set is not entered or has violations. */
  winner: Side | null;
  violations: ScoreViolation[];
}

/**
 * Group set: exactly one side at `set_target` and the other below it, each side at or above its
 * start points. There is no 2-point lead rule.
 */
export function validateGroupSet(set: GroupSetScore, settings: Pick<SeasonSettings, 'set_target'>): GroupSetResult {
  const violations: ScoreViolation[] = [];
  const score = readScore(set, violations);
  if (!score) return { winner: null, violations };

  const slotNo = set.slot_no;
  const target = settings.set_target;
  const atTarget = SIDES.filter((side) => score[side] === target);
  if (atTarget.length !== 1 || SIDES.some((side) => score[side] > target)) {
    violations.push(scoreViolation('SET_TARGET', { slotNo, params: { target } }));
  }

  const start: Handicap = { home: set.handicap_home, away: set.handicap_away };
  for (const side of SIDES) {
    if (score[side] < start[side]) {
      violations.push(scoreViolation('BELOW_HANDICAP', { slotNo, side, params: { handicap: start[side] } }));
    }
  }

  return { winner: violations.length === 0 ? atTarget[0] : null, violations };
}

export interface RelayResult {
  /** The side at the final milestone after the last leg; `null` until every leg is entered and valid. */
  winner: Side | null;
  /** The scoreboard after the last valid leg entered, or the start handicap. */
  score: Score;
  violations: ScoreViolation[];
  warnings: ScoreViolation<ScoreWarningCode>[];
}

/**
 * Relay legs (cumulative scores, starting from the leg-1 handicap): leg i ends when one side
 * reaches `relay_milestones[i]`, neither side's score goes down, and legs are entered in order.
 * Checking stops at the first leg with a violation, since the next legs build on it.
 */
export function validateRelayLegs(
  legs: readonly SlotScore[],
  start: Handicap,
  settings: Pick<SeasonSettings, 'relay_milestones' | 'ko_handicap_cap'>,
): RelayResult {
  const milestones = settings.relay_milestones;
  const warnings: ScoreViolation<ScoreWarningCode>[] = [];
  // A start at or past the first milestone means leg 1 can end without a rally (or never end).
  if (settings.ko_handicap_cap >= milestones[0]) {
    warnings.push(
      violation('warnings', 'KO_CAP_REACHES_MILESTONE', {
        params: { cap: settings.ko_handicap_cap, milestone: milestones[0] },
      }),
    );
  }

  const violations: ScoreViolation[] = [];
  let previous: Score = { ...start };
  let entered = 0;

  for (const leg of [...legs].sort((a, b) => a.slot_no - b.slot_no)) {
    const slotNo = leg.slot_no;
    const before = violations.length;
    const score = readScore(leg, violations);
    if (violations.length > before) break;
    if (!score) continue;
    // A blank or missing earlier leg: this one cannot be checked against it.
    if (slotNo !== entered + 1) {
      violations.push(scoreViolation('LEG_OUT_OF_ORDER', { slotNo, params: { leg: entered + 1 } }));
      break;
    }

    // max(H, A) = milestone, and only one side: the leg ends when the first side gets there.
    const milestone = milestones[slotNo - 1];
    if (Math.max(score.home, score.away) !== milestone || score.home === score.away) {
      violations.push(scoreViolation('LEG_MILESTONE', { slotNo, params: { milestone } }));
    }
    for (const side of SIDES) {
      if (score[side] < previous[side]) {
        violations.push(scoreViolation('LEG_DECREASING', { slotNo, side, params: { previous: previous[side] } }));
      }
    }
    if (violations.length > before) break;

    previous = score;
    entered += 1;
  }

  const finalMilestone = milestones.at(-1);
  const complete = violations.length === 0 && entered === milestones.length;
  const winner = complete ? (SIDES.find((side) => previous[side] === finalMilestone) ?? null) : null;
  return { winner, score: previous, violations, warnings };
}

export interface GroupMatchResult {
  /** More sets won; `null` until all `sets_per_match` sets are entered and valid. */
  winner: Side | null;
  setsWon: Score;
  /** Scoreboard points, start points included; they feed the point difference (D14). */
  points: Score;
  violations: ScoreViolation[];
}

/**
 * Group match result: every set is validated, then sets won decide the winner. An odd
 * `sets_per_match` (5) means there is no draw. Points only count sets without violations.
 */
export function groupMatchResult(
  sets: readonly GroupSetScore[],
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match'>,
): GroupMatchResult {
  const setsWon: Score = { home: 0, away: 0 };
  const points: Score = { home: 0, away: 0 };
  const violations: ScoreViolation[] = [];
  let decided = 0;

  for (const set of [...sets].sort((a, b) => a.slot_no - b.slot_no)) {
    const result = validateGroupSet(set, settings);
    violations.push(...result.violations);
    if (!result.winner) continue;
    decided += 1;
    setsWon[result.winner] += 1;
    // A set with a winner has both scores entered.
    points.home += set.score_home!;
    points.away += set.score_away!;
  }

  const complete = violations.length === 0 && decided === settings.sets_per_match;
  const winner = complete && setsWon.home !== setsWon.away ? (setsWon.home > setsWon.away ? 'home' : 'away') : null;
  return { winner, setsWon, points, violations };
}
