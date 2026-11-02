'use client';

import { GripVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useOptimistic, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { sortRoster } from '@/lib/teams';
import { moveTeamPlayer, setTeamCaptain, type TeamActionState } from './actions';
import { TeamHeader } from './team-forms';

export type BoardPlayer = {
  id: string;
  fullName: string;
  rank: number;
  skillPoints: number;
  status: 'active' | 'withdrawn';
  teamId: string | null;
};

export type BoardTeam = { id: string; name: string; color: string; captainId: string | null };

const SELECT_CLASS =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-7 w-32 min-w-0 rounded-lg border bg-transparent px-1.5 text-xs outline-none focus-visible:ring-3';

/** Drop target key for players without a team. */
const NO_TEAM = '';
const DRAG_TYPE = 'application/x-abt-season-player';

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
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
      <select
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
      </select>
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
 * (the keyboard way). Moves show at once and are confirmed by the server refresh.
 */
export function TeamBoard({
  seasonId,
  teams,
  players,
}: {
  seasonId: string;
  teams: BoardTeam[];
  players: BoardPlayer[];
}) {
  const t = useTranslations('Admin.teams');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [shown, moveShown] = useOptimistic(players, (state, move: { playerId: string; teamId: string | null }) =>
    state.map((p) => (p.id === move.playerId ? { ...p, teamId: move.teamId } : p)),
  );

  function run(action: () => Promise<TeamActionState>) {
    startTransition(async () => {
      const result = await action();
      setError(!result || !('ok' in result));
    });
  }

  function move(playerId: string, teamId: string) {
    const player = shown.find((p) => p.id === playerId);
    if (!player || (player.teamId ?? NO_TEAM) === teamId) return;
    run(async () => {
      moveShown({ playerId, teamId: teamId || null });
      return moveTeamPlayer(undefined, form({ seasonId, seasonPlayerId: playerId, teamId }));
    });
  }

  function makeCaptain(teamId: string, playerId: string) {
    run(() => setTeamCaptain(undefined, form({ seasonId, teamId, seasonPlayerId: playerId })));
  }

  const rosterOf = (teamId: string | null) => sortRoster(shown.filter((p) => p.teamId === teamId));
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
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t('errors.failed')}
        </p>
      )}
      {teams.length === 0 ? (
        <p className="border-border bg-surface text-muted-foreground rounded-[10px] border p-6 text-sm">{t('empty')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {teams.map((team) => {
            const roster = rosterOf(team.id);
            return (
              <DropZone
                key={team.id}
                label={team.name}
                disabled={pending}
                onDropPlayer={(playerId) => move(playerId, team.id)}
              >
                <TeamHeader seasonId={seasonId} team={team} empty={roster.length === 0} />
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
