import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { routing } from '@/i18n/routing';
import { requireBtc } from '@/lib/auth/session';
import { joinUsers } from '@/lib/auth/users';
import { createAdminClient } from '@/lib/supabase/admin';
import { CreateUserForm } from './create-user-form';
import { UserRowActions } from './user-row-actions';

async function Users({ params }: Pick<PageProps<'/[locale]/admin/users'>, 'params'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const viewer = await requireBtc();
  const t = await getTranslations('Admin');

  // Service role: it reads every profile and the Auth user list (the only source of emails). Only
  // reached after requireBtc().
  const admin = createAdminClient();
  const [{ data: list, error: listError }, { data: profiles, error: profilesError }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from('profile').select('user_id, display_name, role, must_change_password, is_active'),
  ]);
  if (listError || profilesError) throw listError ?? profilesError;
  const rows = joinUsers(list.users, profiles ?? [], locale);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold">{t('users.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('users.count', { count: rows.length })}</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('users.tableLabel')}</caption>
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-xs tracking-[0.1em] uppercase">
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('users.name')}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('users.email')}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('role')}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('users.status')}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('users.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-3 py-6 text-center">
                    {t('users.empty')}
                  </td>
                </tr>
              )}
              {rows.map((u) => {
                const isSelf = u.id === viewer.id;
                return (
                  <tr key={u.id} className="border-border border-b align-top last:border-b-0">
                    <th scope="row" className="px-3 py-2.5 text-left font-semibold">
                      {u.displayName}
                      {isSelf && <span className="text-muted-foreground ml-1 font-normal">{t('users.you')}</span>}
                    </th>
                    <td className="px-3 py-2.5 break-all">{u.email}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          u.role === 'btc'
                            ? 'bg-brand-soft text-primary inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap'
                            : 'bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap'
                        }
                      >
                        {u.role === 'btc' ? t('roleBtc') : t('roleReferee')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {!u.isActive ? (
                        <span className="text-destructive text-xs font-medium whitespace-nowrap">
                          {t('users.statusInactive')}
                        </span>
                      ) : u.mustChangePassword ? (
                        <span className="text-warn text-xs font-medium whitespace-nowrap">
                          {t('users.statusMustChange')}
                        </span>
                      ) : (
                        <span className="text-win text-xs font-medium whitespace-nowrap">
                          {t('users.statusActive')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <UserRowActions userId={u.id} name={u.displayName} isActive={u.isActive} isSelf={isSelf} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <CreateUserForm />
      </div>
    </div>
  );
}

export default function UsersPage({ params }: PageProps<'/[locale]/admin/users'>) {
  return (
    <Suspense>
      <Users params={params} />
    </Suspense>
  );
}
