import { describe, expect, it } from 'vitest';
import { buildAwardCards, localized, type AwardInput, type AwardWinnerInput } from './public-awards';

const award = (id: string, extra: Partial<AwardInput> = {}): AwardInput => ({
  id,
  sort_order: 1,
  name_vi: `Giải ${id}`,
  name_en: null,
  criteria_vi: `Tiêu chí ${id}`,
  criteria_en: null,
  sponsor: null,
  value_vnd: null,
  winners: [],
  ...extra,
});

const winner = (id: string, extra: Partial<AwardWinnerInput> = {}): AwardWinnerInput => ({
  id,
  kind: 'player',
  note: null,
  created_at: '2026-01-01T00:00:00Z',
  team: null,
  match: null,
  members: [],
  ...extra,
});

describe('localized', () => {
  it('uses the EN text in EN when it is filled in', () => {
    expect(localized('Cặp đôi', 'Best pair', 'en')).toBe('Best pair');
  });

  it('falls back to VI when the EN text is missing or blank', () => {
    expect(localized('Cặp đôi', null, 'en')).toBe('Cặp đôi');
    expect(localized('Cặp đôi', '  ', 'en')).toBe('Cặp đôi');
  });

  it('always uses VI in VI', () => {
    expect(localized('Cặp đôi', 'Best pair', 'vi')).toBe('Cặp đôi');
  });
});

describe('buildAwardCards', () => {
  it('orders awards by sort order and localizes name and criteria', () => {
    const cards = buildAwardCards(
      [
        award('b', { sort_order: 2, name_en: 'B award' }),
        award('a', { sort_order: 1, name_en: 'A award', criteria_en: 'A criteria' }),
      ],
      'en',
    );
    expect(cards.map((c) => [c.name, c.criteria])).toEqual([
      ['A award', 'A criteria'],
      ['B award', 'Tiêu chí b'],
    ]);
  });

  it('keeps sponsor and value, and drops a blank sponsor', () => {
    const [withSponsor, blank] = buildAwardCards(
      [award('a', { sponsor: 'Demo Co', value_vnd: 1_000_000 }), award('b', { sort_order: 2, sponsor: ' ' })],
      'vi',
    );
    expect(withSponsor).toMatchObject({ sponsor: 'Demo Co', value: 1_000_000 });
    expect(blank).toMatchObject({ sponsor: null, value: null });
  });

  it('lists winners in the order they were added, with pair members by name', () => {
    const team = { id: 't1', name: 'Team 1', color: '#112233' };
    const [card] = buildAwardCards(
      [
        award('a', {
          winners: [
            winner('w2', { kind: 'team', team, created_at: '2026-01-02T00:00:00Z', members: [] }),
            winner('w1', {
              kind: 'pair',
              team,
              match: { code: 'V03' },
              note: ' set 4 ',
              members: [
                { id: 'p2', name: 'Trần B', slug: 'tran-b' },
                { id: 'p1', name: 'Lê A', slug: 'le-a' },
              ],
            }),
          ],
        }),
      ],
      'vi',
    );
    expect(card.winners).toEqual([
      {
        id: 'w1',
        kind: 'pair',
        team,
        players: [
          { id: 'p1', name: 'Lê A', slug: 'le-a' },
          { id: 'p2', name: 'Trần B', slug: 'tran-b' },
        ],
        matchCode: 'V03',
        note: 'set 4',
      },
      { id: 'w2', kind: 'team', team, players: [], matchCode: null, note: null },
    ]);
  });

  it('returns an award without winners as-is (not announced yet)', () => {
    expect(buildAwardCards([award('a')], 'vi')[0].winners).toEqual([]);
  });
});
