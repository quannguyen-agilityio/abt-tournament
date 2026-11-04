import 'server-only';

import { updateTag } from 'next/cache';

/**
 * Cache tag on every cached public read (`public-season-db.ts`, `seasons-db.ts`). One tag for all of
 * them: admin writes are rare next to public reads, and one tag cannot miss a page that shows the row.
 */
export const PUBLIC_DATA_TAG = 'public-data';

/**
 * Call from every admin Server Action that writes data. Expires the cached public reads, so the next
 * render reads the database, and, like `refresh()`, re-renders the current page and clears the client
 * router cache (other pages kept by `staleTimes` are fetched again too).
 */
export function invalidatePublicData() {
  updateTag(PUBLIC_DATA_TAG);
}
