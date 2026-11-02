'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

type Theme = 'system' | 'light' | 'dark';

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

// The inline script in the root layout sets data-theme before paint; the DOM attribute is the source of truth.
function readTheme(): Theme {
  const value = document.documentElement.getAttribute('data-theme');
  return value === 'light' || value === 'dark' ? value : 'system';
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
    document.cookie = 'theme=; path=/; max-age=0; SameSite=Lax';
  } else {
    root.setAttribute('data-theme', theme);
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  }
}

export function ThemeToggle() {
  const t = useTranslations('Theme');
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme);
  const Icon = ICONS[theme];
  const title = t('title', { mode: t(theme) });

  return (
    <Button variant="outline" onClick={() => applyTheme(NEXT[theme])} aria-label={title} title={title}>
      <Icon aria-hidden />
      <span className="hidden sm:inline">{t(theme)}</span>
    </Button>
  );
}
