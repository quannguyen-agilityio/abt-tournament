// Season settings (spec §2): every rule number is configuration stored in season.settings.
import { z } from 'zod';

export type SlotType = 'open' | 'low' | 'high';
export type MemberType = 'employee' | 'intern' | 'guest';
export type Placing = 'champion' | 'runner_up' | 'third';

export interface RankRange {
  min: number;
  max: number;
}

export interface SeasonSettings {
  set_target: number;
  sets_per_match: number;
  slot_types: SlotType[];
  low_rank_range: RankRange;
  high_rank_range: RankRange;
  max_rank: number;
  group_handicap_cap: number;
  ko_handicap_cap: number;
  relay_milestones: number[];
  min_sets_per_player: number;
  max_sets_per_player: number;
  min_players_present: number;
  knockout_teams: 4;
  fees: Record<MemberType, number>;
  /** Placing prizes in VND (spec §5 P1); 0 means none is shown. */
  prizes: Record<Placing, number>;
  timezone: string;
}

/** The ABT 2026 rules. A new season starts from these. */
export const DEFAULT_SEASON_SETTINGS: Readonly<SeasonSettings> = Object.freeze<SeasonSettings>({
  set_target: 31,
  sets_per_match: 5,
  slot_types: ['open', 'low', 'open', 'high', 'open'],
  low_rank_range: { min: 4, max: 7 },
  high_rank_range: { min: 1, max: 3 },
  max_rank: 7,
  group_handicap_cap: 20,
  ko_handicap_cap: 15,
  relay_milestones: [25, 50, 75, 100, 125],
  min_sets_per_player: 1,
  max_sets_per_player: 2,
  min_players_present: 5,
  knockout_teams: 4,
  fees: { employee: 300_000, intern: 150_000, guest: 300_000 },
  prizes: { champion: 0, runner_up: 0, third: 0 },
  timezone: 'Asia/Ho_Chi_Minh',
});

const defaults = (): SeasonSettings => structuredClone(DEFAULT_SEASON_SETTINGS) as SeasonSettings;

/** Players per side in a set or relay leg (doubles). */
const PLAYERS_PER_SLOT = 2;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const positiveInt = z.int().min(1);
const nonNegativeInt = z.int().min(0);
const rankRange = z.strictObject({ min: positiveInt, max: positiveInt });

/** Custom issue codes; each maps to `SeasonSettings.errors.<code>` in messages/*.json. */
export type SettingsRuleCode =
  | 'rankRangeReversed'
  | 'rankRangeAboveMaxRank'
  | 'slotCountMismatch'
  | 'milestoneCountMismatch'
  | 'milestonesNotIncreasing'
  | 'setsPerPlayerReversed'
  | 'groupHandicapTooLarge'
  | 'koHandicapTooLarge'
  | 'minPlayersTooLow'
  | 'invalidTimezone';

type Ctx = z.RefinementCtx<SeasonSettings>;

function addRuleIssue(
  ctx: Ctx,
  code: SettingsRuleCode,
  path: (string | number)[],
  params?: Record<string, string | number>,
) {
  ctx.addIssue({ code: 'custom', message: code, path, params });
}

function checkRankRange(ctx: Ctx, key: 'low_rank_range' | 'high_rank_range', range: RankRange, maxRank: number) {
  if (range.min > range.max) addRuleIssue(ctx, 'rankRangeReversed', [key, 'min']);
  if (range.max > maxRank) addRuleIssue(ctx, 'rankRangeAboveMaxRank', [key, 'max'], { maxRank });
}

// Cross-field checks only make sense once every field is valid on its own (Zod would otherwise run
// them after non-aborting issues such as a too-small number).
const crossFieldWhenFieldsValid = { when: (payload: z.core.ParsePayload) => payload.issues.length === 0 };

export const seasonSettingsSchema = z
  .strictObject({
    set_target: positiveInt.default(() => defaults().set_target),
    sets_per_match: positiveInt.default(() => defaults().sets_per_match),
    slot_types: z
      .array(z.enum(['open', 'low', 'high']))
      .min(1)
      .default(() => defaults().slot_types),
    low_rank_range: rankRange.default(() => defaults().low_rank_range),
    high_rank_range: rankRange.default(() => defaults().high_rank_range),
    max_rank: positiveInt.default(() => defaults().max_rank),
    group_handicap_cap: nonNegativeInt.default(() => defaults().group_handicap_cap),
    ko_handicap_cap: nonNegativeInt.default(() => defaults().ko_handicap_cap),
    relay_milestones: z
      .array(positiveInt)
      .min(1)
      .default(() => defaults().relay_milestones),
    min_sets_per_player: nonNegativeInt.default(() => defaults().min_sets_per_player),
    max_sets_per_player: positiveInt.default(() => defaults().max_sets_per_player),
    min_players_present: positiveInt.default(() => defaults().min_players_present),
    // The bracket (spec §4.8) is SF1 = 1 v 4, SF2 = 2 v 3, so only 4 teams are supported.
    knockout_teams: z.literal(4).default(4),
    fees: z
      .strictObject({ employee: nonNegativeInt, intern: nonNegativeInt, guest: nonNegativeInt })
      .default(() => defaults().fees),
    prizes: z
      .strictObject({ champion: nonNegativeInt, runner_up: nonNegativeInt, third: nonNegativeInt })
      .default(() => defaults().prizes),
    timezone: z
      .string()
      .refine(isTimeZone, { message: 'invalidTimezone' satisfies SettingsRuleCode })
      .default(() => defaults().timezone),
  })
  .superRefine((s, ctx) => {
    checkRankRange(ctx, 'low_rank_range', s.low_rank_range, s.max_rank);
    checkRankRange(ctx, 'high_rank_range', s.high_rank_range, s.max_rank);

    // Group and relay use the same slot order, one type per set or leg.
    if (s.slot_types.length !== s.sets_per_match) {
      addRuleIssue(ctx, 'slotCountMismatch', ['slot_types'], { count: s.sets_per_match });
    }
    if (s.relay_milestones.length !== s.sets_per_match) {
      addRuleIssue(ctx, 'milestoneCountMismatch', ['relay_milestones'], { count: s.sets_per_match });
    }
    s.relay_milestones.forEach((m, i) => {
      if (i > 0 && m <= s.relay_milestones[i - 1])
        addRuleIssue(ctx, 'milestonesNotIncreasing', ['relay_milestones', i]);
    });

    if (s.min_sets_per_player > s.max_sets_per_player) {
      addRuleIssue(ctx, 'setsPerPlayerReversed', ['min_sets_per_player']);
    }

    // A start of the whole target (or more) would decide the set or relay before it begins.
    if (s.group_handicap_cap >= s.set_target) {
      addRuleIssue(ctx, 'groupHandicapTooLarge', ['group_handicap_cap'], { target: s.set_target });
    }
    const relayTarget = s.relay_milestones.at(-1) ?? 0;
    if (s.ko_handicap_cap >= relayTarget) {
      addRuleIssue(ctx, 'koHandicapTooLarge', ['ko_handicap_cap'], { target: relayTarget });
    }

    // With fewer players than this, a team cannot fill every slot within max_sets_per_player.
    const fillable = Math.ceil((s.sets_per_match * PLAYERS_PER_SLOT) / s.max_sets_per_player);
    if (s.min_players_present < fillable) {
      addRuleIssue(ctx, 'minPlayersTooLow', ['min_players_present'], { minimum: fillable });
    }
  }, crossFieldWhenFieldsValid);

export type SeasonSettingsInput = z.input<typeof seasonSettingsSchema>;

export interface SettingsError {
  /** Dotted path to the field, e.g. `low_rank_range.max` or `relay_milestones.2`; empty for the root. */
  path: string;
  /** next-intl key, e.g. `SeasonSettings.errors.tooSmall`. */
  message_key: string;
  /** ICU values for the message. */
  params: Record<string, string | number>;
}

export type SettingsResult = { ok: true; settings: SeasonSettings } | { ok: false; errors: SettingsError[] };

const MESSAGE_NAMESPACE = 'SeasonSettings.errors';

function toSettingsError(issue: z.core.$ZodIssue): SettingsError {
  const path = issue.path.map(String).join('.');
  const error = (key: string, params: Record<string, string | number> = {}): SettingsError => ({
    path,
    message_key: `${MESSAGE_NAMESPACE}.${key}`,
    params,
  });
  switch (issue.code) {
    case 'custom':
      return error(issue.message, (issue.params ?? {}) as Record<string, string | number>);
    case 'invalid_type':
      // NaN is what a blank or non-numeric form field turns into (`received` is set at runtime only).
      return error(
        issue.expected === 'int' || ('received' in issue && issue.received === 'NaN') ? 'notInteger' : 'invalidType',
      );
    case 'too_small':
      return issue.origin === 'array'
        ? error('tooFewItems', { minimum: Number(issue.minimum) })
        : error('tooSmall', { minimum: Number(issue.minimum) });
    case 'too_big':
      return error('tooBig', { maximum: Number(issue.maximum) });
    case 'invalid_value':
      return error('invalidValue', { values: issue.values.map(String).join(', ') });
    case 'unrecognized_keys':
      return error('unknownKeys', { keys: issue.keys.join(', ') });
    default:
      return error('invalid');
  }
}

/**
 * Validates season.settings. Missing fields take the ABT 2026 defaults, so `{}` (the column default) is valid.
 * Cross-field checks run once every field is individually valid.
 */
export function parseSeasonSettings(input: unknown): SettingsResult {
  const result = seasonSettingsSchema.safeParse(input);
  if (result.success) return { ok: true, settings: result.data };
  return { ok: false, errors: result.error.issues.map(toSettingsError) };
}
