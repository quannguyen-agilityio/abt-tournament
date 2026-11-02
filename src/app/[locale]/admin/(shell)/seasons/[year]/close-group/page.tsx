import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { MatchStatusBadge } from '@/components/match-status-badge';
import { TeamChip } from '@/components/team-chip';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireBtc } from '@/lib/auth/session';
import { bracketStarted, parseManualDraws, tiedGroups, unfinishedGroupMatches } from '@/lib/close-group';
import { formatDateTime, signed } from '@/lib/format';
import { buildStandingsView, type StandingsHint } from '@/lib/public-standings';
import { getPublicSeason, getSeasonMatches, getSeasonTeams } from '@/lib/public-season-db';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { CloseGroupForm, ReopenGroupForm } from './close-group-forms';

const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';
const CHIP_WARN = 'border-warn/60 bg-warn/10 text-warn';
const CHIP_WIN = 'border-win/60 text-win';
const CHIP_NEUTRAL = 'border-border bg-surface-2 text-muted-foreground';
const TH = 'px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const TD = 'px-3 py-2.5 text-right';
const BRACKET_ORDER = ['SF1', 'SF2', '3RD', 'F'];

async function CloseGroup({ params }: Pick<PageProps<'/[locale]/admin/seasons/[year]/close-group'>, 'params'>) {
  const { locale, year: yearParam } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireBtc();
  if (!/^\d{4}$/.test(yearParam)) notFound();
  const [t, ts] = await Promise.all([getTranslations('Admin.closeGroup'), getTranslations('Public.standings')]);

  // The user session: RLS lets the BTC read every season, draft ones included.
  const season = await getPublicSeason(Number(yearParam));
  if (!season) notFound();
  const supabase = await createClient();
  const [teams, groupMatches, bracketMatches, closureResult] = await Promise.all([
    getSeasonTeams(season.id),
    getSeasonMatches(season.id, 'group'),
    getSeasonMatches(season.id, 'knockout'),
    supabase
      .from('group_closure')
      .select('final_order, manual_draws, closed_at, profile(display_name)')
      .eq('season_id', season.id)
      .maybeSingle(),
  ]);
  if (closureResult.error) throw closureResult.error;
  const closure = closureResult.data;

  const view = buildStandingsView({
    teams,
    matches: groupMatches,
    settings: season.settings,
    finalOrder: closure?.final_order ?? null,
  });
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const unfinished = unfinishedGroupMatches(groupMatches).length;
  const started = bracketStarted(bracketMatches);
  const draws = closure ? parseManualDraws(closure.manual_draws) : null;
  const groups = tiedGroups(teams, groupMatches, season.settings).map((group) =>
    group.map((id) => {
      const team = teamById.get(id)!;
      return { id, name: team.name, color: team.color };
    }),
  );
  const bracket = [...bracketMatches].sort((a, b) => BRACKET_ORDER.indexOf(a.code) - BRACKET_ORDER.indexOf(b.code));
  const hintClass = (hint: StandingsHint) => (hint === 'draw' || hint === 'draw_pending' ? CHIP_WARN : CHIP_NEUTRAL);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/admin/seasons/${season.year}`} className="text-primary text-sm font-medium hover:underline">
          {t('back')}
        </Link>
        <h1 className="font-display mt-1 text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('subtitle', { season: season.name, played: view.groupPlayed, total: view.groupTotal })}
        </p>
      </div>

      {closure ? (
        <section className="border-border bg-surface flex flex-col gap-3 rounded-[10px] border p-4 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className={cn(CHIP, CHIP_WIN)}>{t('closed.badge')}</span>
            {t('closed.at', {
              when: formatDateTime(new Date(closure.closed_at), locale, season.settings.timezone),
              by: closure.profile?.display_name ?? '—',
            })}
          </p>
          {draws && draws.groups.length > 0 && (
            <p>
              {t('closed.drawn', {
                teams: draws.groups.map((g) => g.map((id) => teamById.get(id)?.name ?? '?').join(' › ')).join('; '),
              })}
            </p>
          )}
          {draws?.note && <p className="text-muted-foreground">{t('closed.note', { note: draws.note })}</p>}
          {season.status === 'knockout' && !started ? (
            <ReopenGroupForm seasonId={season.id} />
          ) : (
            <p className="text-muted-foreground">{t('closed.locked')}</p>
          )}
        </section>
      ) : (
        season.status !== 'group' && (
          <p role="status" className="border-border bg-surface rounded-[10px] border p-3 text-sm">
            {t('notGroup', { status: season.status })}
          </p>
        )
      )}

      {teams.length === 0 ? (
        <p className="text-muted-foreground text-sm">{ts('empty')}</p>
      ) : (
        <section className="flex flex-col gap-2">
          <div className="border-border bg-surface rounded-[10px] border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm whitespace-nowrap tabular-nums">
                <caption className="sr-only">{ts('caption')}</caption>
                <thead>
                  <tr className="border-border border-b">
                    <th scope="col" className={cn(TH, 'text-left')}>
                      {ts('cols.pos')}
                    </th>
                    <th scope="col" className={cn(TH, 'text-left')}>
                      {ts('cols.team')}
                    </th>
                    <th scope="col" className={TH}>
                      {ts('cols.played')}
                    </th>
                    <th scope="col" className={TH}>
                      {ts('cols.points')}
                    </th>
                    <th scope="col" className={TH}>
                      {ts('cols.setDiff')}
                    </th>
                    <th scope="col" className={TH}>
                      {ts('cols.pointDiff')}
                    </th>
                    <th scope="col" className={cn(TH, 'text-left')}>
                      {ts('cols.why')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr
                      key={row.teamId}
                      className={cn(
                        'border-border border-b last:border-b-0',
                        row.qualifies && 'bg-brand-soft/40',
                        row.rank === view.qualifyingCount && 'border-primary border-b-2 border-dashed',
                      )}
                    >
                      <td className="px-3 py-2.5 text-left">
                        <span
                          className={cn(
                            'font-display text-lg font-bold',
                            row.qualifies ? 'text-primary' : 'text-muted-foreground',
                          )}
                        >
                          {row.rank}
                        </span>
                      </td>
                      <td className="max-w-[16rem] px-3 py-2.5 text-left">
                        <TeamChip name={row.team.name} color={row.team.color} />
                      </td>
                      <td className={TD}>{row.played}</td>
                      <td className={TD}>
                        <b className="font-display text-lg">{row.points}</b>
                      </td>
                      <td className={TD}>{signed(row.setDiff, locale)}</td>
                      <td className={TD}>{signed(row.pointDiff, locale)}</td>
                      <td className="px-3 py-2.5 text-left">
                        {row.hint && <span className={cn(CHIP, hintClass(row.hint))}>{ts(`hint.${row.hint}`)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span className={cn(CHIP, view.closed ? CHIP_WIN : CHIP_WARN)}>
              {view.closed ? t('closed.badge') : t('provisional')}
            </span>
            <span>{ts('topCount', { count: view.qualifyingCount })}</span>
          </p>
          {view.disqualified.length > 0 && (
            <ul className="flex flex-wrap items-center gap-2 text-sm">
              <li className="text-muted-foreground">{ts('disqualifiedTitle')}:</li>
              {view.disqualified.map((team) => (
                <li key={team.id}>
                  <TeamChip name={team.name} color={team.color} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!closure && season.status === 'group' && (
        <CloseGroupForm
          year={season.year}
          groups={groups}
          unfinished={unfinished}
          seeds={view.rows.slice(0, view.qualifyingCount).map(({ team }) => ({
            id: team.id,
            name: team.name,
            color: team.color,
          }))}
        />
      )}

      {bracket.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-bold uppercase">{t('bracket.title')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {bracket.map((m) => (
              <li key={m.id} className="border-border bg-surface flex flex-col gap-2 rounded-[10px] border p-3">
                <div className="flex items-center gap-2">
                  <Link href={`/admin/matches/${m.id}`} className="font-display font-bold hover:underline">
                    {m.code}
                  </Link>
                  <MatchStatusBadge status={m.status} />
                </div>
                {m.home_team_id && m.away_team_id ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {[m.home_team_id, m.away_team_id].map((id, i) => {
                      const team = teamById.get(id);
                      return (
                        <span key={id} className="inline-flex items-center gap-2">
                          {i === 1 && <span className="text-muted-foreground">–</span>}
                          {team && <TeamChip name={team.name} color={team.color} />}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">{t('bracket.tbd')}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-sm">{t('bracket.auto')}</p>
        </section>
      )}
    </div>
  );
}

export default function CloseGroupPage({ params }: PageProps<'/[locale]/admin/seasons/[year]/close-group'>) {
  return (
    <Suspense>
      <CloseGroup params={params} />
    </Suspense>
  );
}
