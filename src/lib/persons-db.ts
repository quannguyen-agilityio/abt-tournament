import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import type { ImportPerson } from './player-import';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const PAGE_SIZE = 1000;

/** Every person, read page by page: PostgREST returns at most 1000 rows per request. `null` when a read fails. */
export async function loadPersons(supabase: Supabase): Promise<ImportPerson[] | null> {
  const persons: ImportPerson[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('person')
      .select('id, full_name, slug, gender')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) return null;
    for (const p of data) persons.push({ id: p.id, fullName: p.full_name, slug: p.slug, gender: p.gender });
    if (data.length < PAGE_SIZE) return persons;
  }
}
