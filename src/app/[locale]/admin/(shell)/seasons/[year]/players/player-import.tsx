'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  MAX_IMPORT_ROWS,
  REQUIRED_COLUMNS,
  type Candidate,
  type Change,
  type PlanKind,
  type PlanRow,
} from '@/lib/player-import';
import { MAX_PLAYER_NAME_LENGTH, MAX_SKILL_POINTS } from '@/lib/season-players';
import {
  applyPlayerImport,
  previewPlayerImport,
  type ImportApplyState,
  type ImportError,
  type ImportPreviewState,
} from './import-actions';

const SELECT_CLASS =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30 h-8 w-full min-w-48 rounded-lg border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-3';

const KIND_CHIP: Record<PlanKind, string> = {
  new: 'bg-primary/10 text-primary',
  changed: 'bg-accent text-accent-foreground',
  unchanged: 'bg-muted text-muted-foreground',
  invalid: 'bg-destructive/10 text-destructive',
  ambiguous: 'bg-destructive/10 text-destructive',
};

const KINDS: PlanKind[] = ['new', 'changed', 'unchanged', 'invalid', 'ambiguous'];

type Resolutions = Record<number, string>;
type Preview = Extract<ImportPreviewState, { ok: true }>;

function Chip({ kind, children }: { kind: PlanKind; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${KIND_CHIP[kind]}`}
    >
      {children}
    </span>
  );
}

function ChangeText({ change }: { change: Change }) {
  const t = useTranslations('Admin.players');
  const show = (value: string | number | null) => {
    if (value === null) return '—';
    if (change.field === 'gender') return t(`gender.${value as 'male' | 'female'}`);
    if (change.field === 'memberType') return t(`memberType.${value as 'employee' | 'intern' | 'guest'}`);
    return String(value);
  };
  return (
    <span className="whitespace-nowrap">
      {t(`import.fields.${change.field}`)} {show(change.from)} → {show(change.to)}
    </span>
  );
}

function ChoiceSelect({
  line,
  candidates,
  value,
  disabled,
  onChange,
}: {
  line: number;
  candidates: Candidate[];
  value: string;
  disabled: boolean;
  onChange: (choice: string) => void;
}) {
  const t = useTranslations('Admin.players.import');
  return (
    <select
      required
      value={value}
      disabled={disabled}
      aria-label={t('chooseLabel', { line })}
      aria-invalid={value === '' || undefined}
      className={SELECT_CLASS}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        {t('choose')}
      </option>
      {candidates.map((c) => (
        <option key={c.id} value={c.id}>
          {c.fullName} ({c.slug}){c.inSeason ? ` · ${t('inSeason')}` : ''}
        </option>
      ))}
      <option value="new">{t('createNew')}</option>
    </select>
  );
}

function Details({
  row,
  maxRank,
  candidates,
  choice,
  disabled,
  onChoose,
}: {
  row: PlanRow;
  maxRank: number;
  candidates: Candidate[] | undefined;
  choice: string;
  disabled: boolean;
  onChoose: (choice: string) => void;
}) {
  const t = useTranslations('Admin.players.import');
  // A row the BTC already resolved keeps its select so the choice can still be changed.
  const select = candidates && (
    <ChoiceSelect line={row.line} candidates={candidates} value={choice} disabled={disabled} onChange={onChoose} />
  );
  switch (row.kind) {
    case 'invalid':
      return (
        <div className="flex flex-col gap-0.5">
          <p className="text-destructive font-medium">{t('invalidNote')}</p>
          <ul className="text-muted-foreground list-disc pl-4">
            {row.errors.map((error) => (
              <li key={error}>
                {t(`rowErrors.${error}`, {
                  max: error === 'fullName' ? MAX_PLAYER_NAME_LENGTH : MAX_SKILL_POINTS,
                  maxRank,
                })}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'ambiguous':
      return select;
    case 'new':
      return (
        <div className="flex flex-col gap-1">
          <p>
            {row.newPerson ? t('newPerson') : t('existingPerson')}
            <span className="text-muted-foreground"> · {t('slug', { slug: row.slug })}</span>
          </p>
          {select}
        </div>
      );
    case 'changed':
      return (
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap gap-x-4 gap-y-0.5">
            {row.changes.map((change) => (
              <ChangeText key={change.field} change={change} />
            ))}
          </p>
          {select}
        </div>
      );
    case 'unchanged':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">{t('unchangedNote')}</p>
          {select}
        </div>
      );
  }
}

export function PlayerImport({ seasonId, maxRank }: { seasonId: string; maxRank: number }) {
  const t = useTranslations('Admin.players.import');
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resolutions, setResolutions] = useState<Resolutions>({});
  // Candidates of every row that ever needed a choice, so a resolved row can still be changed.
  const [candidates, setCandidates] = useState<Record<number, Candidate[]>>({});
  const [error, setError] = useState<ImportError | null>(null);
  const [applied, setApplied] = useState<{ applied: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function formFor(text: string, choices: Resolutions): FormData {
    const formData = new FormData();
    formData.set('seasonId', seasonId);
    formData.set('csv', text);
    formData.set('resolutions', JSON.stringify(choices));
    return formData;
  }

  function runPreview(text: string, choices: Resolutions, known: Record<number, Candidate[]>) {
    startTransition(async () => {
      const result: ImportPreviewState = await previewPlayerImport(undefined, formFor(text, choices));
      setApplied(null);
      if (!result || 'error' in result) {
        setPreview(null);
        setError(result?.error ?? 'failed');
        return;
      }
      const next = { ...known };
      for (const row of result.plan.rows) if (row.kind === 'ambiguous') next[row.line] = row.candidates;
      setCandidates(next);
      setResolutions(choices);
      setError(null);
      setPreview(result);
    });
  }

  function choose(line: number, choice: string) {
    if (!preview) return;
    runPreview(preview.csv, { ...resolutions, [line]: choice }, candidates);
  }

  function apply() {
    if (!preview) return;
    startTransition(async () => {
      const result: ImportApplyState = await applyPlayerImport(undefined, formFor(preview.csv, resolutions));
      if (result && 'ok' in result) {
        setApplied({ applied: result.applied, skipped: result.skipped });
        setPreview(null);
        setResolutions({});
        setCandidates({});
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
            {t('hint', {
              header: REQUIRED_COLUMNS.join(','),
              maxRank,
              max: MAX_SKILL_POINTS,
              rows: MAX_IMPORT_ROWS,
            })}
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
              <Button type="button" disabled={pending || csv.trim() === ''} onClick={() => runPreview(csv, {}, {})}>
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
                      {t(`counts.${kind}`)}: {preview.plan.counts[kind]}
                    </Chip>
                  </li>
                ))}
              </ul>
              <div className="border-border relative overflow-x-auto rounded-[10px] border">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
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
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2">
                          <Chip kind={row.kind}>{t(`kind.${row.kind}`)}</Chip>
                        </td>
                        <td className="px-3 py-2">
                          <Details
                            row={row}
                            maxRank={maxRank}
                            candidates={candidates[row.line]}
                            choice={resolutions[row.line] ?? ''}
                            disabled={pending}
                            onChoose={(choice) => choose(row.line, choice)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <Button type="button" disabled={pending || !preview.plan.canApply} onClick={apply}>
                  {pending && preview.plan.canApply ? t('applying') : t('apply', { count: preview.plan.ops.length })}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
