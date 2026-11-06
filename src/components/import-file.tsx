'use client';

import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ImportTemplate } from '@/lib/import-workbook';

/** What the import file pickers take: an Excel workbook (the template) or a CSV. */
export const IMPORT_FILE_ACCEPT =
  '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

/** CSV text of an import file: a workbook is converted, anything else is read as text. */
export async function readImportFile(file: File): Promise<string> {
  if (!/\.xlsx$/i.test(file.name)) return file.text();
  const { workbookToCsv } = await import('@/lib/import-workbook');
  return workbookToCsv(await file.arrayBuffer());
}

/** Downloads `template` as an Excel workbook, built in the browser so no server round trip is needed. */
export function ImportTemplateLink({
  template,
  filename,
  children,
}: {
  template: ImportTemplate;
  filename: string;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const { templateWorkbook, XLSX_TYPE } = await import('@/lib/import-workbook');
      const url = URL.createObjectURL(new Blob([await templateWorkbook(template)], { type: XLSX_TYPE }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="link"
      className="hidden h-auto self-start px-0 lg:inline-flex"
      pending={pending}
      disabled={pending}
      onClick={() => void download()}
    >
      {!pending && <DownloadIcon aria-hidden />}
      {children}
    </Button>
  );
}
