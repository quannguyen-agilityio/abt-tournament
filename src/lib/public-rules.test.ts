import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS, type SeasonSettings } from '../domain';
import { rulesValues } from './public-rules';

describe('rulesValues', () => {
  it('reads the ABT 2026 defaults', () => {
    expect(rulesValues(DEFAULT_SEASON_SETTINGS)).toEqual({
      setTarget: 31,
      sets: 5,
      lowMin: 4,
      lowMax: 7,
      highMin: 1,
      highMax: 3,
      maxRank: 7,
      minSets: 1,
      maxSets: 2,
      groupCap: 20,
      koCap: 15,
      legs: 5,
      milestones: '25/50/75/100/125',
      finalMilestone: 125,
      minPresent: 5,
      knockoutTeams: 4,
    });
  });

  it('follows a changed setting', () => {
    const settings: SeasonSettings = {
      ...DEFAULT_SEASON_SETTINGS,
      set_target: 21,
      group_handicap_cap: 12,
      relay_milestones: [30, 60, 90],
      min_players_present: 6,
    };
    expect(rulesValues(settings)).toMatchObject({
      setTarget: 21,
      groupCap: 12,
      legs: 3,
      milestones: '30/60/90',
      finalMilestone: 90,
      minPresent: 6,
    });
  });
});
