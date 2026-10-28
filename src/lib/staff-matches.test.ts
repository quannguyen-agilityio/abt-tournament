import { describe, expect, it } from 'vitest';
import { groupStaffMatches, type StaffListMatch } from './staff-matches';

const TZ = 'Asia/Ho_Chi_Minh';
const ME = 'referee-me';
const OTHER = 'referee-other';
// 2027-01-09 09:00 in Vietnam.
const NOW = new Date('2027-01-09T02:00:00Z');

const match = (code: string, scheduled_at: string | null, referee_id: string | null = null): StaffListMatch => ({
  code,
  scheduled_at,
  referee_id,
});

const codes = (ms: StaffListMatch[]) => ms.map((m) => m.code);

describe('groupStaffMatches', () => {
  it('puts my matches first, then today, then the rest', () => {
    const groups = groupStaffMatches(
      [
        match('V01', '2027-01-02T01:00:00Z', ME),
        match('V02', '2027-01-09T03:00:00Z', OTHER),
        match('V03', '2027-01-16T01:00:00Z'),
        match('V04', '2027-01-09T01:30:00Z', ME),
        match('V05', '2027-01-09T01:00:00Z'),
      ],
      ME,
      NOW,
      TZ,
    );
    expect(codes(groups.mine)).toEqual(['V01', 'V04']);
    expect(codes(groups.today)).toEqual(['V05', 'V02']);
    expect(codes(groups.rest)).toEqual(['V03']);
  });

  it('uses the season timezone for today', () => {
    // 2027-01-09 23:30 in Vietnam.
    const late = match('V01', '2027-01-09T16:30:00Z');
    // 2027-01-10 01:00 in Vietnam, which is 2027-01-09 in UTC.
    const nextDay = match('V02', '2027-01-09T18:00:00Z');
    const groups = groupStaffMatches([late, nextDay], ME, NOW, TZ);
    expect(codes(groups.today)).toEqual(['V01']);
    expect(codes(groups.rest)).toEqual(['V02']);
  });

  it('sorts unscheduled matches last, then by code with numbers in order', () => {
    const groups = groupStaffMatches(
      [match('V10', null), match('F', null), match('V02', null), match('V09', '2027-01-16T01:00:00Z')],
      ME,
      NOW,
      TZ,
    );
    expect(codes(groups.rest)).toEqual(['V09', 'F', 'V02', 'V10']);
  });

  it('keeps an unscheduled match of mine in my group', () => {
    const groups = groupStaffMatches([match('SF1', null, ME)], ME, NOW, TZ);
    expect(codes(groups.mine)).toEqual(['SF1']);
    expect(groups.today).toEqual([]);
  });
});
