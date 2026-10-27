import type { MemberType } from '@/domain/settings';
import { isUuid } from './auth/users';

export const MAX_PLAYER_NAME_LENGTH = 80;
/** `season_player.skill_points` is a smallint. */
export const MAX_SKILL_POINTS = 32767;
/** `season_player_private.fee_amount` is an integer (VND). */
export const MAX_FEE_AMOUNT = 2_000_000_000;

export type PlayerEditError = 'fullName' | 'gender' | 'rank' | 'skillPoints' | 'team' | 'memberType' | 'feeAmount';

export type PlayerEdit = {
  fullName: string;
  gender: 'male' | 'female';
  rank: number;
  skillPoints: number;
  teamId: string | null;
  memberType: MemberType;
  feeAmount: number;
};

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** A whole number written with digits only (after trimming); otherwise `null`. */
export function wholeNumber(value: string): number | null {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** Validates the inline "edit player" form. Collects every error, not just the first. */
export function parsePlayerEdit(
  formData: FormData,
  { maxRank }: { maxRank: number },
): { ok: true; value: PlayerEdit } | { ok: false; errors: PlayerEditError[] } {
  const errors: PlayerEditError[] = [];

  const fullName = text(formData, 'fullName').trim().replace(/\s+/g, ' ');
  if (!fullName || fullName.length > MAX_PLAYER_NAME_LENGTH) errors.push('fullName');

  const gender = text(formData, 'gender');
  if (gender !== 'male' && gender !== 'female') errors.push('gender');

  const rank = wholeNumber(text(formData, 'rank'));
  if (rank === null || rank < 1 || rank > maxRank) errors.push('rank');

  const skillPoints = wholeNumber(text(formData, 'skillPoints'));
  if (skillPoints === null || skillPoints > MAX_SKILL_POINTS) errors.push('skillPoints');

  const team = text(formData, 'teamId');
  if (team !== '' && !isUuid(team)) errors.push('team');

  const memberType = text(formData, 'memberType');
  if (memberType !== 'employee' && memberType !== 'intern' && memberType !== 'guest') errors.push('memberType');

  const feeAmount = wholeNumber(text(formData, 'feeAmount'));
  if (feeAmount === null || feeAmount > MAX_FEE_AMOUNT) errors.push('feeAmount');

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      fullName,
      gender: gender as PlayerEdit['gender'],
      rank: rank as number,
      skillPoints: skillPoints as number,
      teamId: team || null,
      memberType: memberType as MemberType,
      feeAmount: feeAmount as number,
    },
  };
}

export type FeeRow = { status: 'active' | 'withdrawn'; feeAmount: number | null; paid: boolean };

export type FeeSummary = {
  /** VND paid so far. */
  collected: number;
  /** VND due from every active player. */
  expected: number;
  /** Active players who have paid. */
  paid: number;
  /** Active players. */
  total: number;
  /** Active players who have not paid. */
  unpaid: number;
};

/** Fee totals over active players only; a missing private row counts as fee 0, unpaid. */
export function summarizeFees(players: FeeRow[]): FeeSummary {
  const summary: FeeSummary = { collected: 0, expected: 0, paid: 0, total: 0, unpaid: 0 };
  for (const player of players) {
    if (player.status !== 'active') continue;
    const fee = player.feeAmount ?? 0;
    summary.total += 1;
    summary.expected += fee;
    if (player.paid) {
      summary.paid += 1;
      summary.collected += fee;
    } else {
      summary.unpaid += 1;
    }
  }
  return summary;
}

/** Orders by team name (no team last), then rank, then name. Returns a new array. */
export function sortSeasonPlayers<T extends { teamName: string | null; rank: number; fullName: string }>(
  players: T[],
): T[] {
  return [...players].sort((a, b) => {
    if (a.teamName !== b.teamName) {
      if (a.teamName === null) return 1;
      if (b.teamName === null) return -1;
      const byTeam = a.teamName.localeCompare(b.teamName, 'vi');
      if (byTeam !== 0) return byTeam;
    }
    return a.rank - b.rank || a.fullName.localeCompare(b.fullName, 'vi');
  });
}
