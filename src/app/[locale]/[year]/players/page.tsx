import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PlayerAvatar } from '@/components/player-avatar';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { filterPlayers, parsePlayerFilters } from '@/lib/public-players';
import { getPublicSeason, getSeasonPlayers, getSeasonTeams } from '@/lib/public-season-db';
import { cn } from '@/lib/utils';
import { PlayerFiltersForm } from './player-filters';

async function Players({ params, searchParams }: PageProps<'/[locale]/[year]/players'>) {
  const { locale, year } = await params;
  if (!hasLocale(routing.locales, locale) || !/^\d{4}$/.test(year)) notFound();
  setRequestLocale(locale);
  const [t, tp, tn] = await Promise.all([
    getTranslations('Public.players'),
    getTranslations('Public'),
    getTranslations('Nav'),
  ]);

  const season = await getPublicSeason(Number(year));
  if (!season) notFound();
  const [teams, players, query] = await Promise.all([
    getSeasonTeams(season.id),
    getSeasonPlayers(season.id),
    searchParams,
  ]);
  const { max_rank: maxRank } = season.settings;
  const filters = parsePlayerFilters(query, { teamIds: teams.map((x) => x.id), maxRank });
  const list = filterPlayers(players, filters);
  const teamById = new Map(teams.map((team) => [team.id, team]));

  return (
    <>
      <h1 className="font-display mb-1 text-4xl font-extrabold uppercase">{tn('players')}</h1>
      <p className="text-muted-foreground mb-5">{t('subtitle', { count: list.length })}</p>

      <PlayerFiltersForm
        filters={filters}
        teams={teams.map((team) => ({ value: team.id, label: team.name }))}
        maxRank={maxRank}
      />

      {list.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-[10px] border p-8 text-center">
          {players.length === 0 ? t('noPlayers') : t('empty')}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((player) => {
            const team = player.teamId ? teamById.get(player.teamId) : undefined;
            return (
              <li key={player.id} className="min-w-0">
                <Link
                  href={`/${year}/players/${player.slug}`}
                  className={cn(
                    'border-border bg-surface hover:border-primary/60 flex h-full min-w-0 items-center gap-3 rounded-[10px] border p-4 transition-colors',
                    player.status === 'withdrawn' && 'opacity-75',
                  )}
                >
                  <PlayerAvatar name={player.name} src={player.avatarUrl} alt="" size={44} className="text-lg" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{player.name}</div>
                    <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
                      {team && (
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: team.color }}
                        />
                      )}
                      <span className="truncate">
                        {team?.name ?? t('noTeam')} · {tp(`gender.${player.gender}`)}
                        {player.status === 'withdrawn' && ` · ${t('withdrawn')}`}
                      </span>
                    </div>
                  </div>
                  <abbr
                    title={t('rankSkillFull', { rank: player.rank, skill: player.skill })}
                    className="ml-auto shrink-0 text-right no-underline"
                  >
                    <span className="font-display block text-xl font-bold">
                      {t('rankShort', { rank: player.rank })}
                    </span>
                    <span className="text-muted-foreground block text-xs tabular-nums">
                      {t('skillShort', { skill: player.skill })}
                    </span>
                  </abbr>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function PlayersPage(props: PageProps<'/[locale]/[year]/players'>) {
  return (
    <Suspense>
      <Players {...props} />
    </Suspense>
  );
}
