import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireBtc } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { nextTeamColors, teamWarnings } from '@/lib/teams';
import { TeamBoard, type BoardPlayer, type BoardTeam } from './team-board';
import { TeamDrawImport } from './team-draw-import';
import { CreateTeamForm } from './team-forms';

async function SeasonTeams({ params }: Pick<PageProps<'/[locale]/admin/seasons/[year]/teams'>, 'params'>) {
  const { locale, year: yearParam } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireBtc();
  if (!/^\d{4}$/.test(yearParam)) notFound();
  const t = await getTranslations('Admin.teams');

  // The user session: RLS lets the BTC read and write every team and season player.
  const supabase = await createClient();
  const { data: season, error } = await supabase
    .from('season')
    .select('id, year, name, settings')
    .eq('year', Number(yearParam))
    .maybeSingle();
  if (error) throw error;
  if (!season) notFound();

  const { data: teamRows, error: teamsError } = await supabase
    .from('team')
    .select('id, name, color, captain_id')
    .eq('season_id', season.id)
    .order('name');
  if (teamsError) throw teamsError;

  const { data: seasonPlayers, error: playersError } = await supabase
    .from('season_player')
    .select('id, rank, skill_points, status, team_id, person(full_name)')
    .eq('season_id', season.id);
  if (playersError) throw playersError;

  const parsedSettings = parseSeasonSettings(season.settings);
  const { max_rank: maxRank } = parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS;

  const teams: BoardTeam[] = teamRows.map((team) => ({
    id: team.id,
    name: team.name,
    color: team.color,
    captainId: team.captain_id,
  }));
  const players: BoardPlayer[] = seasonPlayers.map((sp) => ({
    id: sp.id,
    fullName: sp.person?.full_name ?? '',
    rank: sp.rank,
    skillPoints: sp.skill_points,
    status: sp.status,
    teamId: sp.team_id,
  }));

  const warnings = teamWarnings(
    teams.map((team) => ({ id: team.id, players: players.filter((p) => p.teamId === team.id) })),
    players.filter((p) => p.teamId === null),
    { maxRank },
  );
  const teamName = new Map(teams.map((team) => [team.id, team.name]));
  const messages = [
    ...Object.entries(warnings.missingRanks).map(([id, ranks]) =>
      t('warnings.missingRanks', { team: teamName.get(id) ?? '', ranks: ranks.map((r) => `R${r}`).join(', ') }),
    ),
    ...(warnings.sizes
      ? [
          t('warnings.sizes', {
            sizes: Object.entries(warnings.sizes)
              .map(([id, size]) => `${teamName.get(id)} ${size}`)
              .join(' · '),
          }),
        ]
      : []),
    ...(warnings.unassigned > 0 ? [t('warnings.unassigned', { count: warnings.unassigned })] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/admin/seasons/${season.year}`} className="text-primary text-sm font-medium hover:underline">
            {t('back')}
          </Link>
          <h1 className="font-display mt-1 text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('subtitle', { season: season.name, count: teams.length, players: players.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TeamDrawImport seasonId={season.id} />
          <CreateTeamForm
            seasonId={season.id}
            defaultColor={
              nextTeamColors(
                teams.map((team) => team.color),
                1,
              )[0]
            }
          />
        </div>
      </div>
      {teams.length > 0 && messages.length > 0 && (
        <section
          aria-label={t('warnings.title')}
          className="border-warn/40 bg-warn/10 flex flex-col gap-1 rounded-[10px] border p-4 text-sm"
        >
          <h2 className="font-semibold">{t('warnings.title')}</h2>
          <ul className="list-disc pl-5">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-muted-foreground text-sm">{t('dragHint')}</p>
      <TeamBoard seasonId={season.id} teams={teams} players={players} />
    </div>
  );
}

export default function SeasonTeamsPage({ params }: PageProps<'/[locale]/admin/seasons/[year]/teams'>) {
  return (
    <Suspense>
      <SeasonTeams params={params} />
    </Suspense>
  );
}
