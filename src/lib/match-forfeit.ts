import { groupForfeit, knockoutForfeit } from '../domain/forfeit';
import type { Side } from '../domain/lineup';
import type { Score } from '../domain/score';
import type { SeasonSettings } from '../domain/settings';
import { isUuid } from './auth/users';

export type ForfeitInput = {
  matchId: string;
  /** The team that forfeits. */
  teamId: string;
  /** Why the team forfeits. Trimmed, may be empty: the action refuses an empty one. */
  reason: string;
};

type ForfeitSettings = Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'relay_milestones'>;

/** Reads the forfeit form: `matchId`, `teamId` and `reason`. */
export function parseForfeitForm(formData: FormData): ForfeitInput | null {
  const matchId = String(formData.get('matchId') ?? '');
  const teamId = String(formData.get('teamId') ?? '');
  if (![matchId, teamId].every(isUuid)) return null;
  return { matchId, teamId, reason: String(formData.get('reason') ?? '').trim() };
}

/** A match can be forfeited until it is completed (spec §4.5, A5). */
export function forfeitable(status: string): boolean {
  return status === 'scheduled' || status === 'lineup_locked' || status === 'in_progress';
}

/**
 * The scores to store for a forfeit, one per slot of the match: the forfeiting side gets 0. Null when
 * a slot of the match has no forfeit score.
 */
export function forfeitSlots(
  stage: string,
  forfeitSide: Side,
  settings: ForfeitSettings,
  slotNos: readonly number[],
): { slot_no: number; score_home: number; score_away: number }[] | null {
  const scores =
    stage === 'group' ? groupForfeit(forfeitSide, settings).sets : knockoutForfeit(forfeitSide, settings).legs;
  const slots: { slot_no: number; score_home: number; score_away: number }[] = [];
  for (const slotNo of [...slotNos].sort((a, b) => a - b)) {
    const found = scores.find((s) => s.slot_no === slotNo);
    if (found?.score_home == null || found.score_away == null) return null;
    slots.push({ slot_no: slotNo, score_home: found.score_home, score_away: found.score_away });
  }
  return slots;
}

/**
 * The recorded result of a forfeit: the winner, the match score (sets won in a group, the final relay
 * score in the knock-out) and, in a group, the score of every set. Home first.
 */
export function forfeitResult(
  stage: string,
  forfeitSide: Side,
  settings: ForfeitSettings,
): { winner: Side; score: Score; perSlot: Score | null } {
  if (stage === 'group') {
    const result = groupForfeit(forfeitSide, settings);
    const set = result.sets[0];
    return {
      winner: result.winner,
      score: result.setsWon,
      perSlot:
        set?.score_home != null && set.score_away != null ? { home: set.score_home, away: set.score_away } : null,
    };
  }
  const result = knockoutForfeit(forfeitSide, settings);
  return { winner: result.winner, score: result.score, perSlot: null };
}
