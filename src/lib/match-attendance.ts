import { isUuid } from './auth/users';

export type AttendanceInput = {
  matchId: string;
  teamId: string;
  /** Season players ticked present, without duplicates. */
  playerIds: string[];
};

/** Reads the attendance form of one team: `matchId`, `teamId` and one `present` per ticked player. */
export function parseAttendanceForm(formData: FormData): AttendanceInput | null {
  const matchId = String(formData.get('matchId') ?? '');
  const teamId = String(formData.get('teamId') ?? '');
  const playerIds = [...new Set(formData.getAll('present').map(String))];
  if (!isUuid(matchId) || !isUuid(teamId) || !playerIds.every(isUuid)) return null;
  return { matchId, teamId, playerIds };
}

/**
 * Attendance is ticked before the lineups (A5 step 1). Once they are locked, the lineup rules have
 * been checked against it, so it only changes through substitutions or a BTC unlock.
 */
export function attendanceEditable(status: string): boolean {
  return status === 'scheduled';
}
