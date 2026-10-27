'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { DRAW_COLUMNS, MAX_DRAW_ROWS, type DrawPlanKind, type DrawPlanRow } from '@/lib/team-draw';
import { MAX_TEAM_NAME_LENGTH } from '@/lib/teams';
import {
  applyTeamDraw,
  previewTeamDraw,
  type DrawApplyState,
  type DrawError,
  type DrawPreviewState,
} from './draw-actions';

const KIND_CHIP: Record<DrawPlanKind, string> = {
  assign: 'bg-primary/10 text-primary',
  unchanged: 'bg-muted text-muted-foreground',
  invalid: 'bg-destructive/10 text-destructive',
};

const KINDS: DrawPlanKind[] = ['assign', 'unchanged', 'invalid'];

type Preview = Extract<DrawPreviewState, { ok: true }>;

function Chip({ kind, children }: { kind: DrawPlanKind; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${KIND_CHIP[kind]}`}
    >
      {children}
    </span>
  );
}

function Details({ row }: { row: DrawPlanRow }) {
  const t = useTranslations('Admin.teams.draw');
  switch (row.kind) {
    case 'invalid':
      return (
        <div className="flex flex-col gap-0.5">
          <p className="text-destructive font-medium">{t('invalidNote')}</p>
          <ul className="text-muted-foreground list-disc pl-4">
            {row.errors.map((error) => (
              <li key={error}>{t(`rowErrors.${error}`, { max: MAX_TEAM_NAME_LENGTH })}</li>
            ))}
          </ul>
        </div>
      );
    case 'assign':
      return (
        <p>
          {row.fromTeam ?? t('noTeam')} → <b>{row.teamName}</b>
          {row.newTeam && <span className="text-muted-foreground"> · {t('newTeam')}</span>}
        </p>
      );
    case 'unchanged':
      return <p className="text-muted-foreground">{t('unchangedNote', { team: row.teamName })}</p>;
  }
}

export function TeamDrawImport({ seasonId }: { seasonId: string }) {
  const t = useTranslations('Admin.teams.draw');
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<DrawError | null>(null);
  const [applied, setApplied] = useState<{ applied: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function formFor(text: string): FormData {
    const formData = new FormData();
    formData.set('seasonId', seasonId);
    formData.set('csv', text);
    return formData;
  }

  function runPreview() {
    startTransition(async () => {
      const result: DrawPreviewState = await previewTeamDraw(undefined, formFor(csv));
      setApplied(null);
      if (!result || 'error' in result) {
        setPreview(null);
        setError(result?.error ?? 'failed');
        return;
      }
      setError(null);
      setPreview(result);
    });
  }

  function apply() {
    if (!preview) return;
    startTransition(async () => {
      const result: DrawApplyState = await applyTeamDraw(undefined, formFor(preview.csv));
      if (result && 'ok' in result) {
        setApplied({ applied: result.applied, skipped: result.skipped });
        setPreview(null);
        setCsv('');
        setError(null);
        if (fileInput.current) fileInput.current.value = '';
      } else {
        setError(result?.error ?? 'failed');
      }
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setCsv(await file.text());
    setPreview(null);
  }

  return (
    <div className="contents">
      <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t('open')}
      </Button>
      {open && (
        <section
          aria-label={t('title')}
          className="border-border bg-surface order-last flex min-w-0 basis-full flex-col gap-4 rounded-[10px] border p-5"
        >
          <h2 className="font-display text-xl font-bold">{t('title')}</h2>
          <p className="text-muted-foreground text-sm wrap-anywhere">
            {t('hint', { header: DRAW_COLUMNS.join(','), rows: MAX_DRAW_ROWS })}
          </p>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('file')}
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="text-sm font-normal"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('csv')}
              <textarea
                value={csv}
                rows={6}
                spellCheck={false}
                placeholder={t('csvPlaceholder')}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-2.5 py-2 font-mono text-sm font-normal outline-none focus-visible:ring-3"
                onChange={(e) => {
                  setCsv(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <div>
              <Button type="button" disabled={pending || csv.trim() === ''} onClick={runPreview}>
                {pending && !preview ? t('previewing') : t('preview')}
              </Button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {t(`errors.${error}`)}
            </p>
          )}
          {applied && (
            <p role="status" className="text-sm font-medium">
              {t('result', applied)}
            </p>
          )}

          {preview && (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-wrap gap-2">
                {KINDS.map((kind) => (
                  <li key={kind}>
                    <Chip kind={kind}>
                      {t(`kind.${kind}`)}: {preview.plan.counts[kind]}
                    </Chip>
                  </li>
                ))}
                {preview.plan.newTeams.length > 0 && (
                  <li>
                    <Chip kind="assign">
                      {t('newTeams', { names: preview.plan.newTeams.map((n) => n.name).join(', ') })}
                    </Chip>
                  </li>
                )}
              </ul>
              <div className="border-border relative overflow-x-auto rounded-[10px] border">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs uppercase">
                      {(['line', 'name', 'status', 'details'] as const).map((column) => (
                        <th key={column} scope="col" className="px-3 py-2 font-medium">
                          {t(`columns.${column}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.plan.rows.map((row) => (
                      <tr key={row.line} className="border-border border-t align-top">
                        <td className="px-3 py-2 tabular-nums">{row.line}</td>
                        <td className="px-3 py-2 font-medium">{row.name || '—'}</td>
                        <td className="px-3 py-2">
                          <Chip kind={row.kind}>{t(`kind.${row.kind}`)}</Chip>
                        </td>
                        <td className="px-3 py-2">
                          <Details row={row} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <Button type="button" disabled={pending || !preview.plan.canApply} onClick={apply}>
                  {pending && preview.plan.canApply
                    ? t('applying')
                    : t('apply', { count: preview.plan.assignments.length })}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
