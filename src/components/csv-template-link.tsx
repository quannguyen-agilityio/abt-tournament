'use client';

import { DownloadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Downloads `csv` as `filename`, built in the browser so no server round trip is needed. */
export function CsvTemplateLink({
  csv,
  filename,
  children,
}: {
  csv: string;
  filename: string;
  children: React.ReactNode;
}) {
  function download() {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <Button type="button" variant="link" className="h-auto self-start px-0" onClick={download}>
      <DownloadIcon aria-hidden />
      {children}
    </Button>
  );
}
