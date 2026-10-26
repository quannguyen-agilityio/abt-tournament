import { cookies } from 'next/headers';
import type { AdminRole } from '../admin-nav';

export type Viewer = {
  displayName: string;
  email: string;
  role: AdminRole;
};

/**
 * Stand-in for the signed-in user until auth lands (issue #12 replaces this
 * with the Supabase session). Always a fake BTC user; outside production the
 * `abt-dev-role=referee` cookie switches to a referee for local testing.
 */
export async function getViewer(): Promise<Viewer> {
  const devRole = (await cookies()).get('abt-dev-role')?.value;
  const role: AdminRole = process.env.NODE_ENV !== 'production' && devRole === 'referee' ? 'referee' : 'btc';

  return role === 'referee'
    ? { displayName: 'Trọng tài Mẫu', email: 'referee@example.com', role }
    : { displayName: 'BTC Mẫu', email: 'btc@example.com', role };
}
