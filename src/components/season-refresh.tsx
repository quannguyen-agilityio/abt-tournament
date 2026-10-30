import { getLocale, getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import { AutoRefresh } from '@/components/auto-refresh';
import { isMatchDay, REFRESH_INTERVAL_MS } from '@/lib/auto-refresh';
import { formatTime } from '@/lib/format';
import type { PublicSeason } from '@/lib/public-season-db';
import { cn } from '@/lib/utils';

/**
 * On match days, "Last updated" plus a 30 s auto-refresh (spec §5, P1–P5). Renders nothing on
 * other days. Each refresh renders this again, so the time is the one of the data shown.
 */
export async function SeasonRefresh({
  season,
  className,
}: {
  season: Pick<PublicSeason, 'matchDays' | 'settings'>;
  className?: string;
}) {
  await connection();
  const now = new Date();
  const { timezone } = season.settings;
  if (!isMatchDay(season.matchDays, now, timezone)) return null;
  const [t, locale] = await Promise.all([getTranslations('Public.refresh'), getLocale()]);

  return (
    <p className={cn('text-muted-foreground text-sm', className)}>
      {t('lastUpdated', { time: formatTime(now, locale as 'vi' | 'en', timezone) })} ·{' '}
      {t('every', { seconds: REFRESH_INTERVAL_MS / 1000 })}
      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
    </p>
  );
}
