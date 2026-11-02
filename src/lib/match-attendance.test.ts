import { describe, expect, it } from 'vitest';
import { attendanceEditable, parseAttendanceForm } from './match-attendance';

const MATCH = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';
const P2 = '44444444-4444-4444-8444-444444444444';

function form(values: [string, string][]): FormData {
  const formData = new FormData();
  for (const [key, value] of values) formData.append(key, value);
  return formData;
}

describe('parseAttendanceForm', () => {
  it('reads the ticked players without duplicates', () => {
    expect(
      parseAttendanceForm(
        form([
          ['matchId', MATCH],
          ['teamId', TEAM],
          ['present', P1],
          ['present', P2],
          ['present', P1],
        ]),
      ),
    ).toEqual({ matchId: MATCH, teamId: TEAM, playerIds: [P1, P2] });
  });

  it('accepts nobody present', () => {
    expect(
      parseAttendanceForm(
        form([
          ['matchId', MATCH],
          ['teamId', TEAM],
        ]),
      ),
    ).toEqual({ matchId: MATCH, teamId: TEAM, playerIds: [] });
  });

  it('rejects ids that are not uuids', () => {
    expect(parseAttendanceForm(form([['teamId', TEAM]]))).toBeNull();
    expect(
      parseAttendanceForm(
        form([
          ['matchId', MATCH],
          ['teamId', 'team'],
        ]),
      ),
    ).toBeNull();
    expect(
      parseAttendanceForm(
        form([
          ['matchId', MATCH],
          ['teamId', TEAM],
          ['present', 'x); drop table match;--'],
        ]),
      ),
    ).toBeNull();
  });
});

describe('attendanceEditable', () => {
  it('is open only before the lineups are locked', () => {
    expect(attendanceEditable('scheduled')).toBe(true);
    for (const status of ['lineup_locked', 'in_progress', 'completed', 'forfeit', 'annulled']) {
      expect(attendanceEditable(status)).toBe(false);
    }
  });
});
