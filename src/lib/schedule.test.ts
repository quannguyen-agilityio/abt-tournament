import { describe, expect, it } from 'vitest';
import { parseMatchSlot, scheduleGrid, utcToZoned, zonedToUtc } from './schedule';

const TZ = 'Asia/Ho_Chi_Minh';
const COURT = '11111111-1111-4111-8111-111111111111';
const REFEREE = '22222222-2222-4222-8222-222222222222';

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe('zonedToUtc and utcToZoned', () => {
  it('converts a Vietnam wall-clock time (UTC+7)', () => {
    expect(zonedToUtc('2027-01-09', '08:30', TZ).toISOString()).toBe('2027-01-09T01:30:00.000Z');
    expect(zonedToUtc('2027-01-09', '03:00', TZ).toISOString()).toBe('2027-01-08T20:00:00.000Z');
    expect(utcToZoned(new Date('2027-01-08T20:00:00Z'), TZ)).toEqual({ date: '2027-01-09', time: '03:00' });
  });

  it('follows daylight saving time', () => {
    expect(zonedToUtc('2027-07-01', '12:00', 'Europe/Paris').toISOString()).toBe('2027-07-01T10:00:00.000Z');
    expect(zonedToUtc('2027-01-01', '12:00', 'Europe/Paris').toISOString()).toBe('2027-01-01T11:00:00.000Z');
  });

  it('round-trips', () => {
    const instant = zonedToUtc('2027-03-14', '19:05', 'America/New_York');
    expect(utcToZoned(instant, 'America/New_York')).toEqual({ date: '2027-03-14', time: '19:05' });
  });
});

describe('parseMatchSlot', () => {
  it('reads a full slot', () => {
    expect(parseMatchSlot(form({ date: '2027-01-09', time: '08:30', courtId: COURT, refereeId: REFEREE }), TZ)).toEqual(
      {
        ok: true,
        value: { scheduledAt: new Date('2027-01-09T01:30:00Z'), courtId: COURT, refereeId: REFEREE },
      },
    );
  });

  it('treats blanks as cleared', () => {
    expect(parseMatchSlot(form({ date: '', time: ' ', courtId: '', refereeId: '' }), TZ)).toEqual({
      ok: true,
      value: { scheduledAt: null, courtId: null, refereeId: null },
    });
    expect(parseMatchSlot(new FormData(), TZ)).toEqual({
      ok: true,
      value: { scheduledAt: null, courtId: null, refereeId: null },
    });
  });

  it('needs date and time together', () => {
    expect(parseMatchSlot(form({ date: '2027-01-09' }), TZ)).toEqual({ ok: false, errors: ['dateTime'] });
    expect(parseMatchSlot(form({ time: '08:30' }), TZ)).toEqual({ ok: false, errors: ['dateTime'] });
  });

  it('collects every error', () => {
    expect(parseMatchSlot(form({ date: '2027-02-30', time: '24:00', courtId: 'x', refereeId: 'y' }), TZ)).toEqual({
      ok: false,
      errors: ['dateTime', 'court', 'referee'],
    });
  });
});

describe('scheduleGrid', () => {
  const m = (id: string, at: string | null) => ({ id, scheduled_at: at });

  it('groups by local day and time, keeping empty match days', () => {
    const grid = scheduleGrid(
      [
        m('a', '2027-01-09T02:00:00Z'),
        m('b', null),
        m('c', '2027-01-09T01:00:00Z'),
        m('d', '2027-01-09T02:00:00Z'),
        m('e', '2027-01-20T01:00:00Z'),
      ],
      ['2027-01-16', '2027-01-09'],
      TZ,
    );
    expect(grid.unscheduled.map((x) => x.id)).toEqual(['b']);
    expect(grid.days.map((d) => [d.date, d.times.map((t) => [t.time, t.matches.map((x) => x.id)])])).toEqual([
      [
        '2027-01-09',
        [
          ['08:00', ['c']],
          ['09:00', ['a', 'd']],
        ],
      ],
      ['2027-01-16', []],
      ['2027-01-20', [['08:00', ['e']]]],
    ]);
  });

  it('puts a late-evening UTC time on the next local day', () => {
    const grid = scheduleGrid([m('a', '2027-01-08T20:00:00Z')], [], TZ);
    expect(grid.days.map((d) => d.date)).toEqual(['2027-01-09']);
  });
});
