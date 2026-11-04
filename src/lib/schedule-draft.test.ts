import { describe, expect, it } from 'vitest';
import {
  EMPTY_SLOT_DRAFT,
  MAX_SLOT_CHANGES,
  draftChanges,
  draftErrors,
  draftSlot,
  editSlot,
  normalizeSlotDraft,
  parseSlotChanges,
  slotStart,
  type DraftMatch,
} from './schedule-draft';

const TZ = 'Asia/Ho_Chi_Minh';
const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const COURT = '33333333-3333-4333-8333-333333333333';
const REFEREE = '44444444-4444-4444-8444-444444444444';

const blank = { date: '', time: '', courtId: '', refereeId: '' };
const m1: DraftMatch = {
  id: M1,
  locked: false,
  slot: { date: '2027-01-09', time: '08:00', courtId: COURT, refereeId: '' },
};
const m2: DraftMatch = { id: M2, locked: false, slot: blank };

describe('editSlot', () => {
  it('starts from the saved slot, then from the drafted one', () => {
    const once = editSlot(EMPTY_SLOT_DRAFT, m1, { time: '09:00' });
    expect(once[M1]).toEqual({ ...m1.slot, time: '09:00' });
    const twice = editSlot(once, m1, { refereeId: REFEREE });
    expect(twice[M1]).toEqual({ ...m1.slot, time: '09:00', refereeId: REFEREE });
  });
});

describe('normalizeSlotDraft', () => {
  it('drops slots back to their saved values', () => {
    const draft = editSlot(editSlot(EMPTY_SLOT_DRAFT, m1, { time: '09:00' }), m1, { time: '08:00' });
    expect(normalizeSlotDraft([m1, m2], draft)).toEqual({});
  });

  it('drops unknown and locked matches, keeps real changes', () => {
    const draft = {
      [M1]: { ...m1.slot, courtId: '' },
      [M2]: { ...blank, date: '2027-01-09' },
      other: blank,
    };
    expect(normalizeSlotDraft([{ ...m1, locked: true }, m2], draft)).toEqual({ [M2]: draft[M2] });
  });

  it('rebases on a refreshed schedule', () => {
    const draft = editSlot(EMPTY_SLOT_DRAFT, m2, { date: '2027-01-09', time: '08:00' });
    const saved = { ...m2, slot: { ...blank, date: '2027-01-09', time: '08:00' } };
    expect(normalizeSlotDraft([saved], draft)).toEqual({});
  });
});

describe('draftSlot', () => {
  it('shows the drafted slot, else the saved one', () => {
    const draft = editSlot(EMPTY_SLOT_DRAFT, m2, { courtId: COURT });
    expect(draftSlot(m2, draft)).toEqual({ ...blank, courtId: COURT });
    expect(draftSlot(m1, draft)).toBe(m1.slot);
  });
});

describe('slotStart', () => {
  it('is the UTC start of a full date and time', () => {
    expect(slotStart(m1.slot, TZ)).toBe('2027-01-09T01:00:00.000Z');
  });

  it('is null while unscheduled or half filled', () => {
    expect(slotStart(blank, TZ)).toBeNull();
    expect(slotStart({ ...blank, date: '2027-01-09' }, TZ)).toBeNull();
  });
});

describe('draftErrors', () => {
  it('reports the slots that cannot be saved, by match', () => {
    const draft = { [M1]: { ...m1.slot, time: '' }, [M2]: { ...blank, courtId: COURT } };
    expect(draftErrors(draft, TZ)).toEqual({ [M1]: ['dateTime'] });
  });
});

describe('draftChanges and parseSlotChanges', () => {
  it('round-trips a draft', () => {
    const draft = { [M1]: { ...m1.slot, refereeId: REFEREE }, [M2]: blank };
    const changes = draftChanges(draft);
    expect(changes).toEqual([
      { matchId: M1, ...m1.slot, refereeId: REFEREE },
      { matchId: M2, ...blank },
    ]);
    expect(parseSlotChanges(changes)).toEqual(changes);
    expect(parseSlotChanges([])).toEqual([]);
  });

  it('refuses a bad shape', () => {
    expect(parseSlotChanges(null)).toBeNull();
    expect(parseSlotChanges({})).toBeNull();
    expect(parseSlotChanges([{ matchId: 'x', ...blank }])).toBeNull();
    expect(parseSlotChanges([{ matchId: M1, ...blank, courtId: null }])).toBeNull();
    expect(parseSlotChanges([{ matchId: M1, date: '' }])).toBeNull();
  });

  it('refuses a match listed twice and too many changes', () => {
    expect(
      parseSlotChanges([
        { matchId: M1, ...blank },
        { matchId: M1, ...blank },
      ]),
    ).toBeNull();
    expect(
      parseSlotChanges(Array.from({ length: MAX_SLOT_CHANGES + 1 }, () => ({ matchId: M1, ...blank }))),
    ).toBeNull();
  });
});
