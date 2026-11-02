import { describe, expect, it } from 'vitest';
import { canSetCurrent, canTransitionSeason, SEASON_STATUSES, seasonStatusActions } from './season-status';

const notCurrent = { isCurrent: false };
const current = { isCurrent: true };

describe('seasonStatusActions', () => {
  it('lets a draft be published and nothing else', () => {
    expect(seasonStatusActions('draft', notCurrent)).toEqual([{ to: 'published' }]);
  });

  it('lets a published season go forward or back to draft', () => {
    expect(seasonStatusActions('published', notCurrent)).toEqual([{ to: 'draft' }, { to: 'group' }]);
  });

  it('blocks unpublishing the current season', () => {
    expect(seasonStatusActions('published', current)).toEqual([{ to: 'draft', blocked: 'current' }, { to: 'group' }]);
  });

  it('blocks group → knockout with the close-group reason', () => {
    expect(seasonStatusActions('group', notCurrent)).toEqual([{ to: 'knockout', blocked: 'closeGroup' }]);
  });

  it('lets the knockout finish', () => {
    expect(seasonStatusActions('knockout', current)).toEqual([{ to: 'finished' }]);
  });

  it('has no moves once finished', () => {
    expect(seasonStatusActions('finished', notCurrent)).toEqual([]);
  });
});

describe('canTransitionSeason', () => {
  it('allows exactly the unblocked moves', () => {
    const allowed = new Set(['draft>published', 'published>draft', 'published>group', 'knockout>finished']);
    for (const from of SEASON_STATUSES) {
      for (const to of SEASON_STATUSES) {
        expect(canTransitionSeason(from, to, notCurrent), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });

  it('refuses to unpublish the current season', () => {
    expect(canTransitionSeason('published', 'draft', current)).toBe(false);
    expect(canTransitionSeason('published', 'group', current)).toBe(true);
  });

  it('refuses group → knockout here', () => {
    expect(canTransitionSeason('group', 'knockout', notCurrent)).toBe(false);
  });

  it('refuses skipping steps and staying put', () => {
    expect(canTransitionSeason('draft', 'group', notCurrent)).toBe(false);
    expect(canTransitionSeason('draft', 'draft', notCurrent)).toBe(false);
    expect(canTransitionSeason('group', 'published', notCurrent)).toBe(false);
  });
});

describe('canSetCurrent', () => {
  it('rejects only drafts', () => {
    expect(SEASON_STATUSES.filter((s) => !canSetCurrent(s))).toEqual(['draft']);
  });
});
