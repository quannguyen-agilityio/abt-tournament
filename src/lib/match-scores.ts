import type { Side } from '../domain/lineup';
import {
  groupMatchResult,
  validateGroupSet,
  type GroupSetScore,
  type Score,
  type ScoreViolation,
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

/** A slot as the score step reads it: its scores and its start points (group). */
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

/** The violations that keep one slot's score from being saved (spec §4.4). */
export function slotScoreViolations(
  slots: readonly ScoreSlot[],
  slotNo: number,
  settings: Pick<SeasonSettings, 'set_target'>,
): ScoreViolation[] {
  const slot = slots.find((s) => s.slot_no === slotNo);
  return slot ? validateGroupSet(slot, settings).violations : [];
}

export type MatchOutcome = {
  /** Null until every slot is entered and valid. */
  winner: Side | null;
  /** Group: sets won. */
  score: Score;
};

/** The match result from the saved scores (spec §4.4): sets won decide a group match. */
export function matchOutcome(
  slots: readonly ScoreSlot[],
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match'>,
): MatchOutcome {
  const result = groupMatchResult(slots, settings);
  return { winner: result.winner, score: result.setsWon };
}
