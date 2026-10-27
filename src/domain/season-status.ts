// Season lifecycle (spec §3.1, §6 A1): draft → published → group → knockout → finished.

export const SEASON_STATUSES = ['draft', 'published', 'group', 'knockout', 'finished'] as const;

export type SeasonStatus = (typeof SEASON_STATUSES)[number];

/** Why a move is not available, so the UI can explain it. */
export type SeasonMoveBlock =
  /** group → knockout is done by "Close group" (spec §6 A6), which locks the order and seeds the bracket. */
  | 'closeGroup'
  /** A current season must stay public, so it cannot go back to draft. */
  | 'current';

export interface SeasonMove {
  to: SeasonStatus;
  /** `undefined` when the move is allowed. */
  blocked?: SeasonMoveBlock;
}

/** Moves worth showing from `status`: the next step and, from published only, back to draft. */
export function seasonStatusActions(status: SeasonStatus, { isCurrent }: { isCurrent: boolean }): SeasonMove[] {
  const index = SEASON_STATUSES.indexOf(status);
  const moves: SeasonMove[] = [];
  if (status === 'published') moves.push({ to: 'draft', ...(isCurrent ? { blocked: 'current' as const } : {}) });
  const next = SEASON_STATUSES[index + 1];
  if (next) moves.push({ to: next, ...(status === 'group' ? { blocked: 'closeGroup' as const } : {}) });
  return moves;
}

/** True when the move is allowed (not merely listed). */
export function canTransitionSeason(from: SeasonStatus, to: SeasonStatus, opts: { isCurrent: boolean }): boolean {
  return seasonStatusActions(from, opts).some((m) => m.to === to && !m.blocked);
}

/** Only a published (or later) season can be the current one: the public site redirects to it. */
export function canSetCurrent(status: SeasonStatus): boolean {
  return status !== 'draft';
}
