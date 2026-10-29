import type { SeasonSettings } from '../domain';

/** The numbers the rules page interpolates into its `Public.rules` messages. */
export interface RulesValues {
  setTarget: number;
  sets: number;
  lowMin: number;
  lowMax: number;
  highMin: number;
  highMax: number;
  maxRank: number;
  minSets: number;
  maxSets: number;
  groupCap: number;
  koCap: number;
  legs: number;
  /** The relay milestones joined with "/", e.g. "25/50/75/100/125". */
  milestones: string;
  finalMilestone: number;
  minPresent: number;
  knockoutTeams: number;
}

/** Every rule number comes from the season settings (spec §2), so next year's changes need no code. */
export function rulesValues(settings: SeasonSettings): RulesValues {
  const milestones = settings.relay_milestones;
  return {
    setTarget: settings.set_target,
    sets: settings.sets_per_match,
    lowMin: settings.low_rank_range.min,
    lowMax: settings.low_rank_range.max,
    highMin: settings.high_rank_range.min,
    highMax: settings.high_rank_range.max,
    maxRank: settings.max_rank,
    minSets: settings.min_sets_per_player,
    maxSets: settings.max_sets_per_player,
    groupCap: settings.group_handicap_cap,
    koCap: settings.ko_handicap_cap,
    legs: milestones.length,
    milestones: milestones.join('/'),
    finalMilestone: milestones[milestones.length - 1] ?? 0,
    minPresent: settings.min_players_present,
    knockoutTeams: settings.knockout_teams,
  };
}
