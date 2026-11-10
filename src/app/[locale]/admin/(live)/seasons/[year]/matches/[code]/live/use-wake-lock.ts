import { useEffect, useState, useSyncExternalStore } from 'react';

const subscribeNone = () => () => {};
const wakeLockMissing = () => !('wakeLock' in navigator);
const assumeSupported = () => false;

/**
 * Keeps the screen awake while `enabled` (spec-phase-2 §8.0): requests a screen Wake Lock, asks for it
 * again whenever the page becomes visible (the browser releases it when the tab hides) and releases it
 * on unmount. `on` once held, `off` when the browser cannot or will not keep the screen awake, `null`
 * while the first request is out.
 */
export function useWakeLock(enabled: boolean): 'on' | 'off' | null {
  const unsupported = useSyncExternalStore(subscribeNone, wakeLockMissing, assumeSupported);
  const [held, setHeld] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled || unsupported) return;
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const request = () => {
      navigator.wakeLock.request('screen').then(
        (lock) => {
          if (cancelled) {
            void lock.release();
            return;
          }
          sentinel = lock;
          setHeld(true);
          lock.addEventListener('release', () => {
            if (sentinel === lock) setHeld(false);
          });
        },
        () => {
          if (!cancelled) setHeld(false);
        },
      );
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) request();
    };

    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [enabled, unsupported]);

  if (!enabled) return null;
  if (unsupported) return 'off';
  return held === null ? null : held ? 'on' : 'off';
}
