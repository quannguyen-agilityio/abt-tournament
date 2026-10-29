import type { Handicap } from '../domain/handicap';
import type { LineupViolation } from '../domain/lineup';
import type { SeasonSettings } from '../domain/settings';
import { isUuid } from './auth/users';
import { handicapPreview, type LineupSlotPicks } from './match-lineup';
import { scoreState, type ScoreSlot } from './match-scores';

export type SubstitutionInput = {
  matchId: string;
  teamId: string;
  slotNo: number;
  replacedId: string;
  substituteId: string;
  /** Why the substitution is made. Trimmed, may be empty. */
  reason: string;
  /** BTC only: why the substitution is accepted with violations. Trimmed, may be empty. */
  overrideReason: string;
};

/** Reads the substitution form: `matchId`, `teamId`, `slotNo`, `replacedId`, `substituteId`, `reason` and `overrideReason`. */
export function parseSubstitutionForm(formData: FormData): SubstitutionInput | null {
  const matchId = String(formData.get('matchId') ?? '');
  const teamId = String(formData.get('teamId') ?? '');
  const replacedId = String(formData.get('replacedId') ?? '');
  const substituteId = String(formData.get('substituteId') ?? '');
  const slotNo = Number(formData.get('slotNo'));
  if (![matchId, teamId, replacedId, substituteId].every(isUuid)) return null;
  if (replacedId === substituteId || !Number.isInteger(slotNo) || slotNo < 1) return null;
  return {
    matchId,
    teamId,
    slotNo,
    replacedId,
    substituteId,
    reason: String(formData.get('reason') ?? '').trim(),
    overrideReason: String(formData.get('overrideReason') ?? '').trim(),
  };
}

/** After the lineups are locked, changes go through substitutions, until the match is completed (spec §4.1). */
export function substitutionsOpen(status: string): boolean {
  return status === 'lineup_locked' || status === 'in_progress';
}

/**
 * The state `substitute_player` compares with the match's current one, so a score or a substitution
 * that landed in the meantime is refused rather than overwritten.
 */
export function substitutionState(slots: readonly ScoreSlot[], substitutionIds: readonly string[]) {
  return { slots: scoreState(slots), substitutions: [...substitutionIds].sort() };
}

const violationKey = (v: LineupViolation) => `${v.code}|${v.slotNo ?? ''}|${v.playerId ?? ''}`;

/** The violations the substitution adds: those in `after` that `before` did not already have. */
export function addedViolations(
  before: readonly LineupViolation[],
  after: readonly LineupViolation[],
): LineupViolation[] {
  const known = new Set(before.map(violationKey));
  return after.filter((v) => !known.has(violationKey(v)));
}

export type SubstitutionHandicap =
  /** Group: the new start points of the slot. */
  | { kind: 'group'; slot: Handicap }
  /** Relay: the start of leg 1. */
  | { kind: 'relay'; start: Handicap };

/**
 * The handicap to store with a substitution (D18). `slots` are the effective pairs, substitution
 * applied. A group set gets its start points recomputed. A relay start is recomputed while no leg is
 * scored; once one is, leg 1 is already played and the start stays. Null while a player's skill is unknown.
 */
export function substitutionHandicap(
  stage: string,
  slots: readonly (LineupSlotPicks & { scored: boolean })[],
  slotNo: number,
  skillOf: ReadonlyMap<string, number>,
  settings: Pick<SeasonSettings, 'group_handicap_cap' | 'ko_handicap_cap'>,
  currentRelay: Handicap | null,
): SubstitutionHandicap | null {
  const preview = handicapPreview(stage, slots, skillOf, settings);
  if (preview.kind === 'group') {
    const ordered = [...slots].sort((a, b) => a.slotNo - b.slotNo);
    const slot = preview.slots[ordered.findIndex((s) => s.slotNo === slotNo)];
    return slot ? { kind: 'group', slot } : null;
  }
  if (slots.some((s) => s.scored)) return { kind: 'relay', start: currentRelay ?? { home: 0, away: 0 } };
  return preview.start ? { kind: 'relay', start: preview.start } : null;
}
