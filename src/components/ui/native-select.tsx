import * as React from 'react';
import { cn } from 'cn';

// Opaque in dark mode (the input tint mixed over the popover colour) so the
// browser draws the option list on a dark surface instead of its default.
const nativeSelectVariants =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 dark:bg-[color-mix(in_oklab,var(--input)_30%,var(--popover))]';

function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return <select data-slot="native-select" className={cn(nativeSelectVariants, className)} {...props} />;
}

export { NativeSelect };
