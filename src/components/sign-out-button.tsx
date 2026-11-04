'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

/** Submit button for a sign-out form; shows a spinner while the action runs. Must render inside the <form>. */
export function SignOutButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" className={className} pending={pending}>
      {children}
    </Button>
  );
}
