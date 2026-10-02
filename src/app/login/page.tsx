import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { isDevAuthEnabled, isGoogleConfigured } from '@/lib/auth';
import { getSessionContext } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { USER_ROLE_LABELS, departmentsLabel } from '@/domain/labels';
import { BrandMark } from '@/components/shared/brand-mark';
import { LoginPanel } from './login-panel';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Acceso' };

export default async function LoginPage() {
  const session = await getSessionContext();
  if (session) redirect('/board');

  // El listado de desarrollo solo se calcula si el acceso de desarrollo existe.
  const devProfiles = isDevAuthEnabled
    ? (await getDataStore().listUsers())
        .filter((user) => user.isActive)
        .map((user) => ({
          email: user.email,
          name: user.name,
          description: `${departmentsLabel(user.departments)} · ${USER_ROLE_LABELS[user.role]}`,
        }))
    : [];

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark className="size-12" />
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight">Temotiva Flow</h1>
            <p className="text-xs text-fg-muted">Gestión y trazabilidad de iniciativas interdisciplinares</p>
          </div>
        </div>

        <LoginPanel
          googleConfigured={isGoogleConfigured}
          devAuthEnabled={isDevAuthEnabled}
          devProfiles={devProfiles}
        />

        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-fg-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          El acceso está restringido a las personas dadas de alta en el sistema. Si tu cuenta no aparece o fue dada de
          baja, la entrada se deniega por defecto. Contenido confidencial de Temotiva.
        </p>
      </div>
    </div>
  );
}
