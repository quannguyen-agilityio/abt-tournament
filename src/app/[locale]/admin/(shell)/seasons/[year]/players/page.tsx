import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireBtc } from '@/lib/auth/session';
import { formatMoney } from '@/lib/format';
import { sortSeasonPlayers, summarizeFees } from '@/lib/season-players';
import { createClient } from '@/lib/supabase/server';
import { PlayersTable, type PlayerRow } from './players-table';

async function SeasonPlayers({ params }: Pick<PageProps<'/[locale]/admin/seasons/[year]/players'>, 'params'>) {
  const { locale, year: yearParam } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireBtc();
  if (!/^\d{4}$/.test(yearParam)) notFound();
  const t = await getTranslations('Admin.players');

  // The user session: RLS lets the BTC read every season player and the private fee rows.
  const supabase = await createClient();
  const { data: season, error } = await supabase
    .from('season')
    .select('id, year, name, settings')
    .eq('year', Number(yearParam))
    .maybeSingle();
  if (error) throw error;
  if (!season) notFound();

  const { data: teams, error: teamsError } = await supabase
    .from('team')
    .select('id, name, color')
    .eq('season_id', season.id)
    .order('name');
  if (teamsError) throw teamsError;

  const { data: seasonPlayers, error: playersError } = await supabase
    .from('season_player')
    .select(
      'id, rank, skill_points, status, team_id, person(full_name, slug, gender), season_player_private(member_type, fee_amount, fee_paid_at)',
    )
    .eq('season_id', season.id);
  if (playersError) throw playersError;

  const parsedSettings = parseSeasonSettings(season.settings);
  const settings = parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS;
  const teamById = new Map((teams ?? []).map((team) => [team.id, team]));

  const rows: PlayerRow[] = sortSeasonPlayers(
    (seasonPlayers ?? []).map((sp) => {
      const team = sp.team_id ? teamById.get(sp.team_id) : undefined;
      const priv = sp.season_player_private;
      return {
        id: sp.id,
        fullName: sp.person?.full_name ?? '',
        gender: sp.person?.gender ?? 'male',
        rank: sp.rank,
        skillPoints: sp.skill_points,
        status: sp.status,
        teamId: sp.team_id,
        teamName: team?.name ?? null,
        teamColor: team?.color ?? null,
        memberType: priv?.member_type ?? null,
        feeAmount: priv ? priv.fee_amount : null,
        paid: !!priv?.fee_paid_at,
      };
    }),
  );
  const summary = summarizeFees(rows);

  const stats = [
    { label: t('summary.collected'), value: formatMoney(summary.collected, locale) },
    { label: t('summary.expected'), value: formatMoney(summary.expected, locale) },
    { label: t('summary.paid'), value: t('summary.paidValue', { paid: summary.paid, total: summary.total }) },
    { label: t('summary.unpaid'), value: String(summary.unpaid) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/admin/seasons/${season.year}`} className="text-primary text-sm font-medium hover:underline">
          {t('back')}
        </Link>
        <h1 className="font-display mt-1 text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('subtitle', { season: season.name, count: rows.length })}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="border-border bg-surface rounded-[10px] border p-4">
            <p className="text-muted-foreground text-sm">{stat.label}</p>
            <p className="font-display mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>
      <PlayersTable
        seasonId={season.id}
        players={rows}
        teams={(teams ?? []).map(({ id, name, color }) => ({ id, name, color }))}
        maxRank={settings.max_rank}
        defaultFees={settings.fees}
      />
    </div>
  );
}

export default function SeasonPlayersPage({ params }: PageProps<'/[locale]/admin/seasons/[year]/players'>) {
  return (
    <Suspense>
      <SeasonPlayers params={params} />
    </Suspense>
  );
}
