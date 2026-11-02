// Name matching and slugs for the ABT 2026 import.

/** Compare key: NFC, trimmed, single spaces, lower case (Vietnamese locale). */
export function nameKey(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

/** `^[a-z0-9]+(-[a-z0-9]+)*$` slug: accents stripped, `đ` → `d`. */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slugs that occur more than once, as `slug (name, name)` descriptions. */
export function duplicateSlugs(names: readonly string[]): string[] {
  const bySlug = new Map<string, string[]>();
  for (const name of names) {
    const slug = slugify(name);
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), name]);
  }
  return [...bySlug].filter(([, list]) => list.length > 1).map(([slug, list]) => `${slug} (${list.join(', ')})`);
}
