// Public Supabase settings, safe for the browser. Next.js inlines NEXT_PUBLIC_* values at build
// time only when they are read as literal `process.env.NAME` expressions, so keep them spelled out.
export function supabasePublicEnv() {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

export function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local, see README.`);
  }
  return value;
}
