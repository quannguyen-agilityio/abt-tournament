import type { Metadata } from 'next';
import { Barlow_Condensed, Be_Vietnam_Pro } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import '../globals.css';

const beVietnamPro = Be_Vietnam_Pro({
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'vietnamese'],
});

const barlowCondensed = Barlow_Condensed({
  variable: '--font-barlow',
  weight: ['600', '700', '800'],
  subsets: ['latin', 'vietnamese'],
});

// Runs before first paint so the stored theme never flashes. Read here (not via cookies()) to keep the layout static.
const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=(light|dark)(?:;|$)/);if(m)document.documentElement.setAttribute("data-theme",m[1])}catch(e){}})()`;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('title'), description: t('description') };
}

export default async function RootLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${beVietnamPro.variable} ${barlowCondensed.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
