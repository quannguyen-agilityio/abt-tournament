'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment, useState, useTransition } from 'react';
import { TeamChip } from '@/components/team-chip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Handicap } from '@/domain/handicap';
import type { Side } from '@/domain/lineup';
import type { Score, ScoreViolation } from '@/domain/score';
import type { SeasonSettings, SlotType } from '@/domain/settings';
import {
  matchOutcome,
  slotEnterable,
  slotScoreViolations,
  withScore,
  type ScoreRules,
  type ScoreSlot,
} from '@/lib/match-scores';
import { cn } from '@/lib/utils';
import { saveSlotScore, type ScoreState } from './actions';

export type ScoreRowSlot = {
  slotNo: number;
  slotType: SlotType;
  home: string[];
  away: string[];
  /** Group start points, as snapshot at the lock (0–0 for a relay leg). */
  handicap: Handicap;
  /** The saved score, or null before the first save. */
  score: Score | null;
};

type Team = { id: string; name: string; color: string };

type Props = {
  matchId: string;
  teams: [Team, Team];
  slots: ScoreRowSlot[];
  /** Group sets, or relay legs from the leg-1 start. */
  rules: ScoreRules;
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'relay_milestones' | 'ko_handicap_cap'>;
  /** False once the match is completed: the scores are shown read-only. */
  editable: boolean;
};

const SIDES: readonly Side[] = ['home', 'away'];

const toScoreSlot = (slot: ScoreRowSlot): ScoreSlot => ({
  slot_no: slot.slotNo,
  score_home: slot.score?.home ?? null,
  score_away: slot.score?.away ?? null,
  handicap_home: slot.handicap.home,
  handicap_away: slot.handicap.away,
});

/**
 * A5 step 4: one row per set (or relay leg), each saved on its own, with the §4.4 checks as the referee
 * types. Relay legs hold the cumulative score and open one after the other.
 */
export function ScoresStep({ matchId, teams, slots, rules, settings, editable }: Props) {
  const t = useTranslations('Admin.match.scores');
  const ts = useTranslations('Score');
  const saved = slots.map(toScoreSlot);
  const outcome = matchOutcome(rules, saved, settings);

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border bg-surface flex flex-col gap-2 rounded-[10px] border p-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-muted-foreground">{t(rules.relay ? 'relayScore' : 'setsWon')}</span>
          <TeamChip name={teams[0].name} color={teams[0].color} />
          <b className="font-display text-lg tabular-nums">
            {outcome.score.home}–{outcome.score.away}
          </b>
          <TeamChip name={teams[1].name} color={teams[1].color} />
        </div>
        {rules.relay && (
          <p>
            {t('relayStart')}:{' '}
            <b className="font-display text-lg tabular-nums">
              {rules.start.home}–{rules.start.away}
            </b>
          </p>
        )}
        {outcome.warnings.map((w) => (
          <p key={w.code} role="note" className="text-warn">
            {ts(`warnings.${w.code}`, w.params)}
          </p>
        ))}
      </div>
      <ul className="border-border bg-surface divide-border divide-y rounded-[10px] border">
        {slots.map((slot) => (
          <ScoreRow
            // A new saved score remounts the row, so its draft starts from what is saved.
            key={`${slot.slotNo}:${slot.score?.home}-${slot.score?.away}`}
            matchId={matchId}
            teams={teams}
            slot={slot}
            relay={rules.relay}
            milestone={settings.relay_milestones[slot.slotNo - 1]}
            // A relay shows the start of leg 1 on that leg; a group set shows its own start points.
            start={rules.relay ? (slot.slotNo === 1 ? rules.start : { home: 0, away: 0 }) : slot.handicap}
            waitsFor={slotEnterable(rules, saved, slot.slotNo) ? null : slot.slotNo - 1}
            violationsFor={(score) =>
              slotScoreViolations(rules, withScore(saved, slot.slotNo, score), slot.slotNo, settings)
            }
            editable={editable}
          />
        ))}
      </ul>
    </div>
  );
}

type RowError = Extract<ScoreState, { error: unknown }>['error'] | 'network';

function Start({ points }: { points: number }) {
  if (points <= 0) return null;
  return (
    <span className="font-display bg-shuttle/15 text-warn w-fit rounded px-1.5 text-[13px] font-semibold tabular-nums">
      +{points}
    </span>
  );
}

/** One side's pair, with its start points under it. */
function Players({ names, start, alignEnd = false }: { names: string[]; start: number; alignEnd?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 text-sm', alignEnd && 'items-end text-right')}>
      {names.length > 0 ? (
        names.map((name, i) => (
          <span key={i} className="max-w-full truncate">
            {name}
          </span>
        ))
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      <Start points={start} />
    </div>
  );
}

const WHOLE = /^\d{1,4}$/;

function ScoreRow({
  matchId,
  teams,
  slot,
  relay,
  milestone,
  start,
  waitsFor,
  violationsFor,
  editable,
}: {
  matchId: string;
  teams: [Team, Team];
  slot: ScoreRowSlot;
  relay: boolean;
  /** Relay only: the score that ends this leg. */
  milestone: number | undefined;
  /** The start points shown under each pair. */
  start: Handicap;
  /** Relay only: the leg that must be saved before this one opens. */
  waitsFor: number | null;
  violationsFor: (score: Score) => ScoreViolation[];
  editable: boolean;
}) {
  const t = useTranslations('Admin.match.scores');
  const tl = useTranslations('Admin.match.lineup');
  const ts = useTranslations('Score');
  const router = useRouter();
  const [draft, setDraft] = useState<Record<Side, string>>({
    home: slot.score ? String(slot.score.home) : '',
    away: slot.score ? String(slot.score.away) : '',
  });
  const [error, setError] = useState<RowError | null>(null);
  const [pending, startTransition] = useTransition();

  const label = tl(relay ? 'leg' : 'set', { no: slot.slotNo });
  const open = editable && waitsFor === null;
  const filled = SIDES.every((side) => draft[side].trim() !== '');
  const whole = SIDES.every((side) => WHOLE.test(draft[side].trim()));
  const score: Score | null = whole ? { home: Number(draft.home), away: Number(draft.away) } : null;
  const violations: ScoreViolation[] = score
    ? violationsFor(score)
    : filled
      ? [{ code: 'SCORE_INVALID', message_key: 'Score.violations.SCORE_INVALID' }]
      : [];
  const dirty = !slot.score || !score || score.home !== slot.score.home || score.away !== slot.score.away;
  const canSave = open && !pending && score !== null && violations.length === 0 && (dirty || error !== null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSave) return;
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveSlotScore(formData);
        if ('error' in result) {
          setError(result.error);
          // Another save landed first: show it, and keep this row's draft to check and save again.
          if (result.error === 'changed') router.refresh();
        }
      } catch {
        // The request did not get through (weak connection): the draft stays for a retry.
        setError('network');
      }
    });
  };

  return (
    <li>
      <form onSubmit={submit} aria-label={label} className="flex flex-col gap-2 p-3">
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="slotNo" value={slot.slotNo} />
        <div className="flex items-baseline gap-2">
          <b className="font-display text-lg">{label}</b>
          <span className={cn('text-xs', slot.slotType === 'open' ? 'text-muted-foreground' : 'text-primary')}>
            {tl(`slotType.${slot.slotType}`)}
          </span>
          {relay && milestone !== undefined && (
            <span className="text-muted-foreground text-xs tabular-nums">{t('toMilestone', { milestone })}</span>
          )}
          <span role="status" className="ml-auto text-xs">
            {pending ? (
              <span className="text-muted-foreground">{t('saving')}</span>
            ) : error ? null : slot.score && !dirty ? (
              <>
                <span className="text-win font-semibold">✓</span> {t('saved')}
              </>
            ) : filled ? (
              <span className="text-warn font-medium">{t('unsaved')}</span>
            ) : null}
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <Players names={slot.home} start={start.home} />
          <div className="flex items-center gap-1">
            {SIDES.map((side, i) => (
              <Fragment key={side}>
                {i > 0 && <span className="text-muted-foreground">–</span>}
                <Input
                  name={side}
                  value={draft[side]}
                  onChange={(e) => {
                    setDraft((prev) => ({ ...prev, [side]: e.target.value }));
                    setError(null);
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={!open}
                  aria-label={t('scoreLabel', { slot: label, team: teams[i].name })}
                  aria-invalid={violations.some((v) => !v.side || v.side === side) || undefined}
                  className="font-display h-11 w-14 text-center text-xl tabular-nums md:text-xl"
                />
              </Fragment>
            ))}
          </div>
          <Players names={slot.away} start={start.away} alignEnd />
        </div>
        {violations.length > 0 && (
          <ul className="text-loss flex flex-col gap-0.5 text-sm">
            {violations.map((v, i) => (
              <li key={i}>
                {/* A relay change can break a later leg: say which. */}
                {v.slotNo && v.slotNo !== slot.slotNo ? `${tl('leg', { no: v.slotNo })}: ` : ''}
                {ts(`violations.${v.code}`, v.params)}
              </li>
            ))}
          </ul>
        )}
        {editable && waitsFor !== null && (
          <p className="text-muted-foreground text-sm">{ts('violations.LEG_OUT_OF_ORDER', { leg: waitsFor })}</p>
        )}
        {open && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {error && (
              <p role="alert" className="text-destructive mr-auto text-sm">
                {t(`errors.${error}`)}
              </p>
            )}
            <Button type="submit" size="sm" variant={dirty ? 'default' : 'outline'} disabled={!canSave}>
              {pending ? t('saving') : error ? t('retry') : t('save')}
            </Button>
          </div>
        )}
      </form>
    </li>
  );
}
