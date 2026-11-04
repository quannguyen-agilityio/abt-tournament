'use client';

import { GripVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  EMPTY_DRAFT,
  applyDraft,
  chooseCaptainInDraft,
  draftChanges,
  draftSize,
  moveInDraft,
  normalizeDraft,
  type BoardDraft,
  type BoardPlayer,
  type BoardTeam,
} from '@/lib/team-board';
import { sortRoster } from '@/lib/teams';
import { saveTeamBoard } from './actions';
import { TeamHeader } from './team-forms';

const SELECT_CLASS = 'h-7 w-32 px-1.5 text-xs';

/** Drop target key for players without a team. */
const NO_TEAM = '';
const DRAG_TYPE = 'application/x-abt-season-player';

/**
 * Asks before the page is left while `message` is set: on reload or close (the browser's own
 * prompt) and on a click on a link to another page of the app.
 */
function useLeaveWarning(message: string | null) {
  useEffect(() => {
    if (!message) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // Capture phase, so it runs before the link's own client-side navigation.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname === location.pathname) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [message]);
}

function PlayerItem({
  player,
  team,
  teams,
  disabled,
  onMove,
  onCaptain,
}: {
  player: BoardPlayer;
  team: BoardTeam | null;
  teams: BoardTeam[];
  disabled: boolean;
  onMove: (teamId: string) => void;
  onCaptain: () => void;
}) {
  const t = useTranslations('Admin.teams');
  const isCaptain = !!team && team.captainId === player.id;
  const withdrawn = player.status === 'withdrawn';

  return (
    <li
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, player.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`hover:bg-muted/60 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 ${disabled ? '' : 'cursor-grab active:cursor-grabbing'} ${withdrawn ? 'opacity-60' : ''}`}
    >
      <GripVertical aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
      <b className="font-display w-7 shrink-0">R{player.rank}</b>
      <span className="min-w-32 flex-1 truncate">{player.fullName}</span>
      {withdrawn && (
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">{t('withdrawn')}</span>
      )}
      <span className="text-muted-foreground w-8 text-right text-xs tabular-nums">{player.skillPoints}</span>
      {team &&
        (isCaptain ? (
          <span className="bg-brand-soft text-primary rounded-full px-2 py-0.5 text-xs font-medium">
            {t('captain')}
          </span>
        ) : (
          !withdrawn && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={disabled}
              aria-label={t('makeCaptainLabel', { name: player.fullName })}
              className="text-muted-foreground font-normal"
              onClick={onCaptain}
            >
              {t('makeCaptain')}
            </Button>
          )
        ))}
      <NativeSelect
        value={player.teamId ?? NO_TEAM}
        disabled={disabled}
        aria-label={t('moveLabel', { name: player.fullName })}
        className={`${SELECT_CLASS} ml-auto`}
        onChange={(e) => onMove(e.target.value)}
      >
        {teams.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
        <option value={NO_TEAM}>{t('noTeam')}</option>
      </NativeSelect>
    </li>
  );
}

function DropZone({
  label,
  onDropPlayer,
  disabled,
  children,
}: {
  label: string;
  onDropPlayer: (playerId: string) => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <section
      aria-label={label}
      onDragOver={(e) => {
        if (disabled || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const playerId = e.dataTransfer.getData(DRAG_TYPE);
        if (playerId) onDropPlayer(playerId);
      }}
      className={`bg-surface flex min-w-0 flex-col rounded-[10px] border transition-colors ${over ? 'border-primary ring-primary/30 ring-3' : 'border-border'}`}
    >
      {children}
    </section>
  );
}

/**
 * Teams with their rosters. Players move by drag and drop, or with the "move to" select on each row
 * (the keyboard way). Moves and captain choices only change a draft on the page, until Save sends
 * them all in one request; Discard goes back to the saved board.
 */
export function TeamBoard({
  seasonId,
  teams: savedTeams,
  players: savedPlayers,
}: {
  seasonId: string;
  teams: BoardTeam[];
  players: BoardPlayer[];
}) {
  const t = useTranslations('Admin.teams');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [rawDraft, setDraft] = useState<BoardDraft>(EMPTY_DRAFT);
  // Normalized against the saved board on every render, so a refresh rebases the draft.
  const draft = normalizeDraft(savedTeams, savedPlayers, rawDraft);
  const changes = draftSize(draft);
  const { teams, players } = applyDraft(savedTeams, savedPlayers, draft);
  useLeaveWarning(changes > 0 ? t('leaveConfirm') : null);

  function move(playerId: string, teamId: string) {
    const player = players.find((p) => p.id === playerId);
    if (!player || (player.teamId ?? NO_TEAM) === teamId) return;
    setDraft(moveInDraft(draft, playerId, teamId || null));
  }

  function makeCaptain(teamId: string, playerId: string) {
    setDraft(chooseCaptainInDraft(draft, teamId, playerId));
  }

  function save() {
    startTransition(async () => {
      const result = await saveTeamBoard(seasonId, draftChanges(draft));
      const ok = !!result && 'ok' in result;
      setError(!ok);
      if (ok) setDraft(EMPTY_DRAFT);
    });
  }

  function discard() {
    setError(false);
    setDraft(EMPTY_DRAFT);
  }

  const rosterOf = (teamId: string | null) => sortRoster(players.filter((p) => p.teamId === teamId));
  const unassigned = rosterOf(null);

  const list = (roster: BoardPlayer[], team: BoardTeam | null) =>
    roster.length === 0 ? (
      <p className="text-muted-foreground p-4 text-sm">{t('emptyTeam')}</p>
    ) : (
      <ol className="flex flex-col p-2">
        {roster.map((player) => (
          <PlayerItem
            key={player.id}
            player={player}
            team={team}
            teams={teams}
            disabled={pending}
            onMove={(teamId) => move(player.id, teamId)}
            onCaptain={() => team && makeCaptain(team.id, player.id)}
          />
        ))}
      </ol>
    );

  return (
    <div className="flex flex-col gap-4">
      {(changes > 0 || error) && (
        <section
          aria-label={t('unsaved', { count: changes })}
          className="border-warn/40 bg-surface sticky top-16 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border p-3 shadow-sm"
        >
          <p role="status" className="text-warn text-sm font-medium">
            {t('unsaved', { count: changes })}
          </p>
          {error && (
            <p role="alert" className="text-destructive basis-full text-sm sm:order-last">
              {t('errors.saveFailed')}
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={discard}>
              {t('discard')}
            </Button>
            <Button type="button" size="sm" disabled={pending || changes === 0} onClick={save}>
              {pending ? t('saving') : t('save')}
            </Button>
          </div>
        </section>
      )}
      {teams.length === 0 ? (
        <p className="border-border bg-surface text-muted-foreground rounded-[10px] border p-6 text-sm">{t('empty')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {teams.map((team) => {
            const roster = rosterOf(team.id);
            const savedEmpty = !savedPlayers.some((p) => p.teamId === team.id);
            return (
              <DropZone
                key={team.id}
                label={team.name}
                disabled={pending}
                onDropPlayer={(playerId) => move(playerId, team.id)}
              >
                <TeamHeader seasonId={seasonId} team={team} empty={savedEmpty && roster.length === 0} />
                <p className="text-muted-foreground px-4 pt-2 text-xs">
                  {t('rosterCount', { count: roster.filter((p) => p.status === 'active').length })}
                </p>
                {list(roster, team)}
              </DropZone>
            );
          })}
        </div>
      )}
      {(unassigned.length > 0 || teams.length > 0) && (
        <DropZone label={t('unassigned')} disabled={pending} onDropPlayer={(playerId) => move(playerId, NO_TEAM)}>
          <h2 className="border-border font-display border-b p-4 text-xl font-bold">
            {t('unassigned')} <span className="text-muted-foreground tabular-nums">· {unassigned.length}</span>
          </h2>
          {list(unassigned, null)}
        </DropZone>
      )}
    </div>
  );
}
