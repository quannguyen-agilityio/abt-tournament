'use client';

import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

// Chrome/Edge/Android fire this and let a page trigger the install dialog; iOS Safari has no such API,
// so there the banner only explains the manual "Add to Home Screen" steps.
type InstallPromptEvent = Event & { prompt: () => Promise<void> };

type Mode = 'hidden' | 'prompt' | 'ios';

const DISMISS_KEY = 'install-banner-dismissed-at';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

let deferredPrompt: InstallPromptEvent | null = null;
let dismissed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function readDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  // iPadOS 13+ reports itself as a Mac, so tell it apart by touch support.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

// Webviews inside Zalo/Messenger/Facebook cannot add to the home screen at all.
function isInAppBrowser(): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Zalo|Line\/|Messenger/i.test(navigator.userAgent);
}

function subscribe(onChange: () => void) {
  dismissed = readDismissed();
  const onPrompt = (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  };
  const onInstalled = () => {
    deferredPrompt = null;
    notify();
  };
  listeners.add(onChange);
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

function getMode(): Mode {
  if (dismissed || isStandalone()) return 'hidden';
  if (deferredPrompt) return 'prompt';
  if (isIos() && !isInAppBrowser()) return 'ios';
  return 'hidden';
}

export function InstallBanner() {
  const t = useTranslations('InstallBanner');
  const mode = useSyncExternalStore(subscribe, getMode, () => 'hidden' as Mode);
  const [showSteps, setShowSteps] = useState(false);

  if (mode === 'hidden') return null;

  function dismiss() {
    dismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode: the banner just comes back next visit.
    }
    notify();
  }

  async function install() {
    if (mode === 'ios') {
      setShowSteps((open) => !open);
      return;
    }
    const prompt = deferredPrompt;
    if (!prompt) return;
    deferredPrompt = null;
    await prompt.prompt();
    notify();
  }

  return (
    <div
      role="region"
      aria-label={t('title')}
      // Phones and tablets only: the desktop layout has no home screen to add to.
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="border-border bg-card text-card-foreground mx-auto max-w-xl rounded-xl border p-3 shadow-lg">
        <div className="flex items-center gap-3">
          <Download aria-hidden className="text-primary size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('title')}</p>
            <p className="text-muted-foreground text-xs">{mode === 'ios' ? t('iosHint') : t('hint')}</p>
          </div>
          <Button size="sm" onClick={install} aria-expanded={mode === 'ios' ? showSteps : undefined}>
            {mode === 'ios' ? t('howTo') : t('install')}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label={t('dismiss')}>
            <X aria-hidden />
          </Button>
        </div>
        {mode === 'ios' && showSteps && (
          <ol className="border-border mt-3 space-y-2 border-t pt-3 text-sm">
            <li className="flex items-center gap-2">
              <Share aria-hidden className="text-primary size-4 shrink-0" />
              {t('step1')}
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus aria-hidden className="text-primary size-4 shrink-0" />
              {t('step2')}
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
