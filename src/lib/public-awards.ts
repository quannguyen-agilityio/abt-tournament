type AppLocale = 'vi' | 'en';

export type AwardWinnerKind = 'player' | 'pair' | 'team';

/** An `award_winner` row with what it names: its team, its related match and its members. */
export interface AwardWinnerInput {
  id: string;
  kind: AwardWinnerKind;
  note: string | null;
  created_at: string;
  team: { id: string; name: string; color: string } | null;
  match: { code: string } | null;
  members: { id: string; name: string; slug: string }[];
}

/** An `award` row with its winners, as the public page reads it. */
export interface AwardInput {
  id: string;
  sort_order: number;
  name_vi: string;
  name_en: string | null;
  criteria_vi: string;
  criteria_en: string | null;
  sponsor: string | null;
  value_vnd: number | null;
  winners: AwardWinnerInput[];
}

export interface AwardWinnerView {
  id: string;
  kind: AwardWinnerKind;
  /** The winning team, or the team the player or pair played for. */
  team: { id: string; name: string; color: string } | null;
  /** Players of a player or pair winner, by name. Empty for a team winner. */
  players: { id: string; name: string; slug: string }[];
  matchCode: string | null;
  note: string | null;
}

export interface AwardCard {
  id: string;
  name: string;
  criteria: string;
  sponsor: string | null;
  value: number | null;
  /** In the order the BTC added them. Empty until the award is given. */
  winners: AwardWinnerView[];
}

/** The `_en` text when the locale is EN and it is filled in; VI otherwise (spec §7). */
export function localized(vi: string, en: string | null, locale: AppLocale): string {
  return locale === 'en' && en?.trim() ? en : vi;
}

/** Award cards in the BTC's order, with their text in the active locale. */
export function buildAwardCards(awards: AwardInput[], locale: AppLocale): AwardCard[] {
  return [...awards]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((award) => ({
      id: award.id,
      name: localized(award.name_vi, award.name_en, locale),
      criteria: localized(award.criteria_vi, award.criteria_en, locale),
      sponsor: award.sponsor?.trim() || null,
      value: award.value_vnd,
      winners: [...award.winners]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((w) => ({
          id: w.id,
          kind: w.kind,
          team: w.team,
          players: w.kind === 'team' ? [] : [...w.members].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
          matchCode: w.match?.code ?? null,
          note: w.note?.trim() || null,
        })),
    }));
}
