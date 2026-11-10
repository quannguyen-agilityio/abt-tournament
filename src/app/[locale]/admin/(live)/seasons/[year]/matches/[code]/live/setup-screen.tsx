'use client';

import { ArrowLeftRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Side } from '@/domain/lineup';
import { fixedServingSide, type LiveState, type SetupPayload, type SlotSetup } from '@/domain/live';
import type { Score } from '@/domain/score';
import { Link } from '@/i18n/navigation';
import { draftComplete, draftPayload, initialDraft, setupPreview, type SetupDraft } from '@/lib/live-scorer';
import { cn } from '@/lib/utils';
import { CourtDiagram } from './court';
import type { Teams } from './overlays';
import styles from './scorer.module.css';

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');
const SIDES: readonly Side[] = ['home', 'away'];
const bold = (chunks: React.ReactNode) => <b>{chunks}</b>;

export type SetupScreenProps = {
  code: string;
  courtName: string | null;
  setup: SlotSetup;
  /** How many sets or legs the match has, for `Set 2/5`. */
  total: number;
  /** The label of the slot type (group sets). */
  typeLabel: string | null;
  /** This leg's milestone (relay). */
  milestone: number;
  teams: Teams;
  nameOf: (player: string) => string;
  /** "Sửa thiết lập": the current choices and the score that stays. */
  edit?: { current: SetupPayload; score: Score };
  /** Relay leg change: the ended leg, for the ends. */
  previousState?: LiveState;
  matchHref: string;
  onSave: (payload: SetupPayload) => void;
  onCancel?: () => void;
};

/**
 * L-B: set or relay leg setup (spec-phase-2 §4.1, §8.1). Four steps: ends, serving team, server,
 * receiver. The serving team is skipped when it is fixed (handicap, L1; relay leg change, L4) and
 * the ends at a relay leg change (L3).
 */
export function SetupScreen(props: SetupScreenProps) {
  const { code, courtName, setup, total, typeLabel, milestone, teams, nameOf, edit, previousState, matchHref } = props;
  const t = useTranslations('Admin.live.setup');
  const tl = useTranslations('Admin.live');
  const relay = setup.kind === 'relay';
  const legChange = relay && setup.slot_no > 1;
  const fixed = fixedServingSide(setup);
  const minStep = legChange ? 2 : 0;

  const [draft, setDraft] = useState<SetupDraft>(() => initialDraft(setup, edit?.current, previousState));
  const [step, setStep] = useState(minStep);

  const complete = draftComplete(setup, draft);
  const preview = setupPreview(setup, draft);
  const serving = draft.serving;
  const skipped = (i: number) => i < minStep || (i === 1 && fixed !== null);
  const picked =
    step === 2 && draft.server !== null ? draft.server : step === 3 && draft.receiver !== null ? draft.receiver : null;
  const colors: Record<Side, string> = { home: teams.home.color, away: teams.away.color };

  const canPick = (side: Side) =>
    step === 1 || (step === 2 && side === serving) || (step === 3 && serving !== null && side === other(serving));
  const choose = (side: Side, player: string) => {
    if (step === 1) {
      setDraft({ ...draft, serving: side, server: null, receiver: null });
      setStep(2);
    } else if (step === 2 && side === serving) {
      setDraft({ ...draft, server: player, receiver: edit ? draft.receiver : null });
      setStep(3);
    } else if (step === 3 && serving && side === other(serving)) {
      setDraft({ ...draft, receiver: player });
    }
  };
  const goTo = (i: number) => {
    if (!skipped(i) && (edit || i <= step)) setStep(i);
  };
  const back = () => setStep(Math.max(minStep, step === 2 && fixed ? 0 : step - 1));

  const slotLabel = relay ? t('eyebrowLeg', { n: setup.slot_no, total }) : t('eyebrowSet', { n: setup.slot_no, total });
  const title = edit
    ? t(relay ? 'editTitleLeg' : 'editTitleSet', { n: setup.slot_no })
    : !relay
      ? t('titleSet', { n: setup.slot_no, type: typeLabel ?? '' })
      : legChange
        ? t('titleLegChange', { n: setup.slot_no, total })
        : t('titleLeg1', { total });
  const stepLabels = [t('stepEnds'), t('stepServe'), t('stepServer'), t('stepReceiver')];

  const save = () => {
    const payload = draftPayload(setup, draft);
    if (payload) props.onSave(payload);
  };

  const startScore = serving === null ? 0 : setup.start[serving];
  const courtWord = tl(startScore % 2 ? 'leftFull' : 'rightFull');
  const parityWord = tl(startScore % 2 ? 'odd' : 'even');
  const explain =
    draft.server === null || serving === null
      ? t('exNone')
      : t.rich('exServer', { c: courtWord, n: startScore, p: parityWord, b: bold });
  const receiverLine =
    draft.receiver !== null && serving !== null
      ? t.rich('exRecv', { r: nameOf(draft.receiver), c: courtWord, b: bold })
      : null;

  const ctaLabel = !complete
    ? t('needMore')
    : edit
      ? t('saveSetup')
      : relay
        ? t('startLeg', { n: setup.slot_no })
        : t('startSet');
  const fixedTeam = fixed ? teams[fixed].name : null;

  const stepPanel = () => {
    if (step === 0) {
      const left = draft.ends.left;
      const right = other(left);
      return (
        <>
          <h2 className={styles.eyebrow}>{t('endsPick')}</h2>
          <div className={styles.endsrow}>
            {[left, right].map((side, i) => (
              <div key={side} className="contents">
                {i === 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto flex-col"
                    onClick={() => setDraft({ ...draft, ends: { left: right } })}
                    aria-label={t('swap')}
                  >
                    <ArrowLeftRight aria-hidden className="size-6" />
                    <small>{t('swap')}</small>
                  </Button>
                )}
                <div className={styles.e} style={{ '--tc': teams[side].color } as React.CSSProperties}>
                  <small>{t(i === 0 ? 'leftEnd' : 'rightEnd')}</small>
                  <span>{teams[side].name}</span>
                </div>
              </div>
            ))}
          </div>
          <Button type="button" className={cn(styles.btnLg, 'mt-2.5')} onClick={() => setStep(fixed ? 2 : 1)}>
            {t('next')}
          </Button>
        </>
      );
    }
    if (step === 1) {
      return (
        <>
          <h2 className={styles.eyebrow}>{t('pickServe')}</h2>
          <div className={styles.choice}>
            {SIDES.map((side) => (
              <button
                key={side}
                type="button"
                style={{ '--tc': teams[side].color } as React.CSSProperties}
                aria-pressed={serving === side}
                onClick={() => choose(side, '')}
              >
                {teams[side].name}
                <small>{t('pointsN', { n: setup.start[side] })}</small>
              </button>
            ))}
          </div>
        </>
      );
    }
    const side = step === 2 ? serving! : other(serving!);
    const chosen = step === 2 ? draft.server : draft.receiver;
    return (
      <>
        <h2 className={styles.eyebrow}>{t(step === 2 ? 'pickServer' : 'pickRecv', { team: teams[side].name })}</h2>
        <div className={styles.choice}>
          {setup.pairs[side].map((player) => (
            <button
              key={player}
              type="button"
              style={{ '--tc': teams[side].color } as React.CSSProperties}
              aria-pressed={chosen === player}
              onClick={() => choose(side, player)}
            >
              {nameOf(player)}
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <>
      <div className={styles.su}>
        <div>
          <div className={styles.eyebrow}>{[code, courtName, slotLabel].filter(Boolean).join(' · ')}</div>
          <h1>{title}</h1>
          <Link href={matchHref} className={cn(styles.linkbtn, 'inline-block px-0')}>
            ← {tl('backToMatch')}
          </Link>
        </div>
        {legChange && (
          <div className={styles.bannerEnds}>
            <ArrowLeftRight aria-hidden />
            <div>
              <b>{t('relayBanner')}</b>
              <span className="text-sm">
                {t('relayBannerSub', {
                  n: setup.slot_no,
                  total,
                  m: milestone,
                  a: setup.start.home,
                  b: setup.start.away,
                })}
              </span>
            </div>
          </div>
        )}
        {edit && (
          <div className={styles.explain} role="note">
            {t.rich('editNote', { home: edit.score.home, away: edit.score.away, b: bold })}
          </div>
        )}
        <div className={styles.sp}>
          {SIDES.map((side) => {
            const start = setup.start[side];
            return (
              <div key={side} className={styles.t} style={{ '--tc': teams[side].color } as React.CSSProperties}>
                <b>
                  {teams[side].name}
                  {!legChange && start > 0 && <span className={styles.hc}>{t('hcStart', { n: start })}</span>}
                </b>
                <span className={styles.v}>{start}</span>
                <small>{legChange ? t('cumul') : start > 0 ? t('hcStart', { n: start }) : t('noHc')}</small>
              </div>
            );
          })}
        </div>
        <nav className={styles.steps} aria-label={t('stepsLabel')}>
          {stepLabels.map((label, i) => (
            <button
              key={label}
              type="button"
              className={cn(i < step ? styles.done : i === step && styles.now, skipped(i) && styles.lock)}
              aria-current={i === step ? 'step' : undefined}
              disabled={skipped(i)}
              onClick={() => goTo(i)}
            >
              <b>{i < step ? '✓' : i + 1}</b>
              {label}
            </button>
          ))}
        </nav>
        <div className={cn(styles.panel, 'p-2.5')}>
          <CourtDiagram
            view={preview}
            colors={colors}
            nameOf={nameOf}
            picked={picked}
            canPick={canPick}
            onPick={choose}
          />
        </div>
        {legChange && (
          <div className={cn(styles.panel, 'grid gap-1.5 px-3 py-2.5')}>
            <div className={styles.eyebrow}>{t('newPairs')}</div>
            {SIDES.map((side) => (
              <div key={side} className="text-sm">
                <span className={styles.swatch} style={{ background: teams[side].color }} /> <b>{teams[side].name}</b>:{' '}
                {setup.pairs[side].map(nameOf).join(' · ')}
              </div>
            ))}
          </div>
        )}
        {fixed && fixedTeam && (
          <div className={cn(styles.panel, 'text-warn px-3 py-2.5 text-sm font-semibold')}>
            <span className={styles.swatch} style={{ background: teams[fixed].color }} />{' '}
            {legChange ? `${t('fixedServeLeg')}: ${fixedTeam}` : t('hcServe', { team: fixedTeam })}
          </div>
        )}
        <div className={styles.explain}>
          {explain}
          {receiverLine && (
            <>
              <br />
              {receiverLine}
            </>
          )}
        </div>
        <div className={cn(styles.panel, 'p-3')}>{stepPanel()}</div>
        {step > minStep && (
          <button type="button" className={cn(styles.linkbtn, 'justify-self-start')} onClick={back}>
            ← {t('back')}
          </button>
        )}
      </div>
      <div className={styles.suCta}>
        <div className={styles.in}>
          <Button type="button" className={styles.btnXl} disabled={!complete} onClick={save}>
            {ctaLabel}
          </Button>
          {edit && props.onCancel && (
            <Button type="button" variant="outline" className={styles.btnLg} onClick={props.onCancel}>
              {t('cancel')}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
