'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export type SideAction = {
  key: string;
  label: string;
  /** Shown below the header while the action is toggled on. */
  panel: ReactNode;
};

/** The match header's side actions (substitute, ...): each button toggles its panel below the header. */
export function SideActions({ actions }: { actions: SideAction[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = actions.find((a) => a.key === openKey);
  if (actions.length === 0) return null;
  return (
    <>
      <div className="ml-auto flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.key}
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={open?.key === action.key}
            onClick={() => setOpenKey(open?.key === action.key ? null : action.key)}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {open && <div className="basis-full">{open.panel}</div>}
    </>
  );
}
