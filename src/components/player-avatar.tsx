import Image from 'next/image';
import { cn } from '@/lib/utils';

/** The initial of the given name, which Vietnamese puts last ("Nguyễn Văn An" → "A"). */
const initial = (name: string) => (name.trim().split(/\s+/).at(-1) ?? '').charAt(0).toUpperCase();

/**
 * The player's photo, or the initial of their given name. `size` is in pixels; the text size comes
 * from `className`. Photos are served as stored (`unoptimized`), so no remote host has to be set up.
 */
export function PlayerAvatar({
  name,
  src,
  alt,
  size,
  className,
}: {
  name: string;
  src: string | null;
  /** Empty when the name is shown next to the avatar. */
  alt: string;
  size: number;
  className?: string;
}) {
  const box = cn('bg-surface-2 font-display shrink-0 rounded-full', className);
  if (src) {
    return <Image src={src} alt={alt} width={size} height={size} unoptimized className={cn(box, 'object-cover')} />;
  }
  return (
    <span aria-hidden className={cn(box, 'grid place-items-center font-bold')} style={{ width: size, height: size }}>
      {initial(name)}
    </span>
  );
}
