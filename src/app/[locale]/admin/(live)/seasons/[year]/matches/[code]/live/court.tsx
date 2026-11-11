'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { Side } from '@/domain/lineup';
import type { Court } from '@/domain/live';
import { courtSpot, type SetupPreview } from '@/lib/live-scorer';
import { ShuttleIcon } from '@/components/shuttle-icon';
import { cn } from '@/lib/utils';
import styles from './scorer.module.css';

export type CourtProps = {
  /** Positions, server and receiver as `replay()` or `setupPreview()` give them. */
  view: Pick<SetupPreview, 'left' | 'positions' | 'server' | 'receiver'>;
  colors: Record<Side, string>;
  /** Player id to the name shown on the tag. */
  nameOf: (player: string) => string;
  /** A player tag the scorer can tap (setup); the others are plain. */
  onPick?: (side: Side, player: string) => void;
  /** Which tags are tappable now. */
  canPick?: (side: Side, player: string) => boolean;
  /** The tag shown as chosen. */
  picked?: string | null;
  /** The injured player, struck through. */
  injured?: string | null;
  ariaLabel?: string;
  className?: string;
};

const COURTS: readonly Court[] = ['right', 'left'];
const SIDES: readonly Side[] = ['home', 'away'];
const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

/**
 * The court from above, net in the middle (§8.1 L-C). Each team's right and left courts are from its
 * own point of view, so the diagram mirrors when the ends change. Tags are keyed by player, so they
 * slide to their new court after a rally.
 */
export function CourtDiagram({
  view,
  colors,
  nameOf,
  onPick,
  canPick,
  picked,
  injured,
  ariaLabel,
  className,
}: CourtProps) {
  const t = useTranslations('Admin.live');
  const markerId = useId();
  const { left, positions, server, receiver } = view;
  const cell = (ref: { side: Side; court: Court }) => courtSpot(left, ref.side, ref.court);
  const serverSpot = server && cell(server);
  const receiverSpot = receiver && cell(receiver);
  const point = (from: { x: number; y: number }, to: { x: number; y: number }, at: number) => ({
    x: from.x + (to.x - from.x) * at,
    y: from.y + (to.y - from.y) * at,
  });
  const arrowFrom = serverSpot && receiverSpot && point(serverSpot, receiverSpot, 0.3);
  const arrowTo = serverSpot && receiverSpot && point(serverSpot, receiverSpot, 0.7);

  return (
    <div
      className={cn(styles.court, className)}
      style={{ '--cl': colors[left], '--cr': colors[other(left)] } as React.CSSProperties}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <div className={cn(styles.half, styles.hl)} />
      <div className={cn(styles.half, styles.hr)} />
      <div className={styles.mid} />
      <div className={styles.netline} />
      {serverSpot && (
        <i
          className={cn(styles.hlcell, styles.s)}
          style={{ left: `${serverSpot.x - 25}%`, top: `${serverSpot.y - 25}%` }}
          aria-hidden="true"
        />
      )}
      {receiverSpot && (
        <i
          className={cn(styles.hlcell, styles.r)}
          style={{ left: `${receiverSpot.x - 25}%`, top: `${receiverSpot.y - 25}%` }}
          aria-hidden="true"
        />
      )}
      {arrowFrom && arrowTo && (
        <svg className={styles.arrow} aria-hidden="true">
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="9"
              markerHeight="9"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M0 1 10 5 0 9z" fill="currentColor" />
            </marker>
          </defs>
          <line
            x1={`${arrowFrom.x}%`}
            y1={`${arrowFrom.y}%`}
            x2={`${arrowTo.x}%`}
            y2={`${arrowTo.y}%`}
            markerEnd={`url(#${markerId})`}
          />
        </svg>
      )}
      {SIDES.flatMap((side) =>
        COURTS.map((court) => {
          const spot = courtSpot(left, side, court);
          return (
            <span
              key={`${side}-${court}`}
              className={styles.lbl}
              aria-hidden="true"
              style={{ left: `${spot.x - 22}%`, top: `${spot.y - 24}%` }}
            >
              {t(court)}
            </span>
          );
        }),
      )}
      {SIDES.flatMap((side) =>
        COURTS.map((court) => {
          const player = positions[side][court];
          const spot = courtSpot(left, side, court);
          const isServer = server?.side === side && server.player === player;
          const isReceiver = receiver?.side === side && receiver.player === player;
          const className = cn(
            styles.ptag,
            isServer && styles.srv,
            isReceiver && styles.rcv,
            picked === player && styles.pick,
            injured === player && styles.inj,
          );
          const style = { left: `${spot.x}%`, top: `${spot.y}%`, '--tc': colors[side] } as React.CSSProperties;
          const content = (
            <>
              <ShuttleIcon className={styles.sh} size={14} />
              <span className={styles.nm}>{nameOf(player)}</span>
            </>
          );
          if (!onPick) {
            return (
              <div key={player} className={className} style={style} aria-hidden="true">
                {content}
              </div>
            );
          }
          return (
            <button
              key={player}
              type="button"
              className={className}
              style={style}
              disabled={!(canPick?.(side, player) ?? true)}
              aria-label={nameOf(player)}
              aria-pressed={picked === player}
              onClick={() => onPick(side, player)}
            >
              {content}
            </button>
          );
        }),
      )}
    </div>
  );
}
