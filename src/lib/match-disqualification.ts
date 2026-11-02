import {
  disqualifyTeam,
  reinstateTeam,
  type DisqualificationResult,
  type ForfeitMatch,
  type MatchStatus,
} from '../domain/forfeit';
import type { Side } from '../domain/lineup';
import { isUuid } from './auth/users';

/** A season match as the disqualification rules read it, with its code for the confirmation list. */
export type DisqualificationMatch = ForfeitMatch & { code: string };

/** One match the confirmation lists: its status now and after the action. */
export type DisqualificationRow = { id: string; code: string; from: MatchStatus; to: MatchStatus };

export type DisqualificationPlan =
  | {
      ok: true;
      rows: DisqualificationRow[];
      /** Knock-out only: the match that becomes a forfeit and the side that loses it. */
      forfeit: { matchId: string; side: Side } | null;
    }
  | { ok: false; messageKey: string };

function toPlan(result: DisqualificationResult, matches: readonly DisqualificationMatch[]): DisqualificationPlan {
  if (!result.ok) return { ok: false, messageKey: result.message_key };
  const byId = new Map(matches.map((m) => [m.id, m]));
  const rows = result.changes
    .flatMap((change) => {
      const match = byId.get(change.id);
      return match ? [{ id: match.id, code: match.code, from: match.status, to: change.status }] : [];
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  const forfeit = result.changes.find((c) => 'forfeitSide' in c);
  return {
    ok: true,
    rows,
    forfeit: forfeit && 'forfeitSide' in forfeit ? { matchId: forfeit.id, side: forfeit.forfeitSide } : null,
  };
}

/** What disqualifying a team changes (spec §4.5, A4): the rows the confirmation dialog lists. */
export function disqualificationPlan(
  teamId: string,
  matches: readonly DisqualificationMatch[],
  groupClosed: boolean,
): DisqualificationPlan {
  return toPlan(disqualifyTeam(teamId, matches, groupClosed), matches);
}

/** What reinstating a team restores; refused once the group is closed. */
export function reinstatementPlan(
  teamId: string,
  matches: readonly DisqualificationMatch[],
  groupClosed: boolean,
  disqualifiedTeamIds: readonly string[],
): DisqualificationPlan {
  return toPlan(reinstateTeam(teamId, matches, groupClosed, disqualifiedTeamIds), matches);
}

export type DisqualifyInput = {
  teamId: string;
  /** Trimmed, may be empty: the action refuses an empty one. */
  reason: string;
  /** The matches the confirmation listed. */
  matchIds: string[];
};

function readIds(formData: FormData): string[] | null {
  const ids = formData.getAll('matchIds').map(String);
  return ids.every(isUuid) ? ids : null;
}

/** Reads the disqualify form: `teamId`, `reason` and one `matchIds` entry per listed match. */
export function parseDisqualifyForm(formData: FormData): DisqualifyInput | null {
  const teamId = String(formData.get('teamId') ?? '');
  const matchIds = readIds(formData);
  if (!isUuid(teamId) || !matchIds) return null;
  return { teamId, reason: String(formData.get('reason') ?? '').trim(), matchIds };
}

/** Reads the reinstate form: `teamId` and one `matchIds` entry per listed match. */
export function parseReinstateForm(formData: FormData): { teamId: string; matchIds: string[] } | null {
  const teamId = String(formData.get('teamId') ?? '');
  const matchIds = readIds(formData);
  if (!isUuid(teamId) || !matchIds) return null;
  return { teamId, matchIds };
}

/** Whether two id lists name the same matches, in any order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return set.size === a.length && a.length === b.length && b.every((id) => set.has(id));
}
