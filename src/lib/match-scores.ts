import type { Handicap } from '../domain/handicap';
import type { Side } from '../domain/lineup';
import {
  groupMatchResult,
  validateGroupSet,
  validateRelayLegs,
  type GroupSetScore,
  type Score,
  type ScoreViolation,
  type ScoreWarningCode,
} from '../domain/score';
import type { SeasonSettings } from '../domain/settings';
import { isUuid } from './auth/users';

export type ScoreInput = { matchId: string; slotNo: number; score: Score };

/** A whole number that fits the `smallint` score columns. */
const WHOLE = /^\d{1,4}$/;

/** Reads one row's score form: `matchId`, `slotNo` and both scores, as whole numbers ≥ 0. */
export function parseScoreForm(formData: FormData): ScoreInput | null {
  const matchId = String(formData.get('matchId') ?? '');
  const slotNo = Number(formData.get('slotNo'));
  const home = String(formData.get('home') ?? '').trim();
  const away = String(formData.get('away') ?? '').trim();
  if (!isUuid(matchId) || !Number.isInteger(slotNo) || slotNo < 1 || !WHOLE.test(home) || !WHOLE.test(away)) {
    return null;
  }
  return { matchId, slotNo, score: { home: Number(home), away: Number(away) } };
}

/** Scores are entered once the lineups are locked, until the match is completed (A5 step 4). */
export function scoresEditable(status: string): boolean {
  return status === 'lineup_locked' || status === 'in_progress';
}

/** A slot as the score step reads it: its scores and its start points (group; 0–0 for a relay leg). */
export type ScoreSlot = GroupSetScore;

/**
 * The state `save_slot_score` and `complete_match` compare with `private.match_score_state`, so a save
 * that landed in the meantime is refused rather than overwritten.
 */
export function scoreState(slots: readonly ScoreSlot[]) {
  return [...slots]
    .sort((a, b) => a.slot_no - b.slot_no)
    .map(({ slot_no, score_home, score_away, handicap_home, handicap_away }) => ({
      slot_no,
      score_home,
      score_away,
      handicap_home,
      handicap_away,
    }));
}

/** The slots with one slot's score replaced, as they would be after saving it. */
export function withScore(slots: readonly ScoreSlot[], slotNo: number, score: Score): ScoreSlot[] {
  return slots.map((slot) =>
    slot.slot_no === slotNo ? { ...slot, score_home: score.home, score_away: score.away } : slot,
  );
}

type ScoreSettings = Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'relay_milestones' | 'ko_handicap_cap'>;

/** How a match is scored: group sets, or relay legs from the leg-1 start (`match.relay_handicap_*`). */
export type ScoreRules = { relay: false } | { relay: true; start: Handicap };

/** The scoring rules of a match row. Relay legs build on the start of leg 1, snapshot at the lock (§4.3). */
export function scoreRules(match: {
  stage: string;
  relay_handicap_home: number | null;
  relay_handicap_away: number | null;
}): ScoreRules {
  if (match.stage === 'group') return { relay: false };
  return { relay: true, start: { home: match.relay_handicap_home ?? 0, away: match.relay_handicap_away ?? 0 } };
}

/**
 * The violations that keep one slot's score from being saved (spec §4.4), on the slots as they would
 * be after saving it. A group set stands alone. Relay legs are cumulative, so every leg is checked: a
 * changed leg may no longer fit the legs saved after it, and a leg is only entered after the one before.
 */
export function slotScoreViolations(
  rules: ScoreRules,
  slots: readonly ScoreSlot[],
  slotNo: number,
  settings: ScoreSettings,
): ScoreViolation[] {
  if (rules.relay) return validateRelayLegs(slots, rules.start, settings).violations;
  const slot = slots.find((s) => s.slot_no === slotNo);
  return slot ? validateGroupSet(slot, settings).violations : [];
}

/** Relay legs are entered in order: leg n opens once leg n − 1 is saved. Group sets are always open. */
export function slotEnterable(rules: ScoreRules, slots: readonly ScoreSlot[], slotNo: number): boolean {
  if (!rules.relay || slotNo === 1) return true;
  const previous = slots.find((s) => s.slot_no === slotNo - 1);
  return previous !== undefined && previous.score_home !== null && previous.score_away !== null;
}

export type MatchOutcome = {
  /** Null until every slot is entered and valid. */
  winner: Side | null;
  /** Group: sets won. Relay: the scoreboard after the last valid leg, or the start. */
  score: Score;
  /** Relay only: a season whose cap reaches the first milestone (spec §4.4). */
  warnings: ScoreViolation<ScoreWarningCode>[];
};

/**
 * The match result from the saved scores (spec §4.4): sets won decide a group match, and a relay goes
 * to the side at the final milestone.
 */
export function matchOutcome(rules: ScoreRules, slots: readonly ScoreSlot[], settings: ScoreSettings): MatchOutcome {
  if (rules.relay) {
    const result = validateRelayLegs(slots, rules.start, settings);
    return { winner: result.winner, score: result.score, warnings: result.warnings };
  }
  const result = groupMatchResult(slots, settings);
  return { winner: result.winner, score: result.setsWon, warnings: [] };
}
