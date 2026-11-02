import { routing } from '../../i18n/routing';

export const ADMIN_HOME = '/admin';
export const LOGIN_PATH = '/admin/login';
export const CHANGE_PASSWORD_PATH = '/admin/change-password';

const ADMIN_PATH = new RegExp(`^/(${routing.locales.join('|')})(/admin(?:/.*)?)$`);

/**
 * For a locale-prefixed admin path that needs a signed-in user, returns its locale and the
 * locale-less path; `null` for public pages and the login page itself.
 */
export function protectedAdminPath(pathname: string): { locale: string; path: string } | null {
  const match = ADMIN_PATH.exec(pathname);
  if (!match) return null;
  const path = match[2].replace(/\/+$/, '') || ADMIN_HOME;
  if (path === LOGIN_PATH) return null;
  return { locale: match[1], path };
}

/**
 * Where to go after signing in. Only locale-less admin paths are accepted, so a crafted `next`
 * cannot send the user to another site or back to the login page.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== 'string') return ADMIN_HOME;
  const [path] = next.split(/[?#]/);
  if (path !== ADMIN_HOME && !path.startsWith(`${ADMIN_HOME}/`)) return ADMIN_HOME;
  if (path === LOGIN_PATH || path.includes('//') || path.includes('\\')) return ADMIN_HOME;
  return next;
}
