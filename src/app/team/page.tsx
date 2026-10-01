import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import {
  assignableRoles,
  canAnonymizeUser,
  canManagePeople,
  canManageUser,
  canConfigureSystem,
  managementScope,
} from '@/server/services/rbac';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { AccessManager, type AccessRow } from '@/components/admin/access-manager';
import { StageSettings } from '@/components/admin/stage-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Equipo y accesos' };

/**
 * Equipo: alta, edición y baja de personas con jerarquía descendente, más los
 * parámetros del flujo (exclusivos de Dirección).
 *
 * Lo que se ve aquí depende del alcance de quien mira: Dirección ve la
 * organización entera, un responsable ve a la gente de sus áreas. Los permisos
 * se revalidan dentro de cada Server Action, no solo al pintar la página.
 */
export default async function TeamPage() {
  const session = await requireSession();
  if (!canManagePeople(session)) redirect('/cuenta');

  const store = getDataStore();
  const [users, stages] = await Promise.all([store.listUsers(), store.listStages()]);

  const scope = managementScope(session);
  const visible = scope === 'ALL' ? users : users.filter((user) => user.departments.some((d) => scope.includes(d)));

  const rows: AccessRow[] = visible.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    departments: user.departments,
    role: user.role,
    isActive: user.isActive,
    isAnonymized: user.isAnonymized,
    canManage: canManageUser(session, user),
  }));

  return (
    <AppShell session={session}>
      <PageHeader
        title="Equipo y accesos"
        description={
          scope === 'ALL'
            ? 'Quién puede entrar, con qué rol y en qué áreas, y los objetivos de tiempo y carga de cada fase.'
            : 'Las personas de las áreas que llevas. Puedes sumar miembros y darlos de baja.'
        }
      />

      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Personas</CardTitle>
              <CardDescription>
                La lista es la puerta: si un correo no está aquí o está de baja, el acceso se deniega por defecto.
                Dirección da de alta a cualquiera y reparte las áreas; cada responsable suma miembros a las suyas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccessManager
                rows={rows}
                scope={{
                  departments: scope === 'ALL' ? null : scope,
                  assignableRoles: assignableRoles(session),
                  canAnonymize: canAnonymizeUser(session),
                  currentUserId: session.userId,
                }}
              />
            </CardContent>
          </Card>

          {canConfigureSystem(session) ? (
            <Card>
              <CardHeader>
                <CardTitle>Parámetros de las fases</CardTitle>
                <CardDescription>
                  El SLE se mide en horas netas de reloj (el tiempo en parada no cuenta). El límite de WIP es
                  informativo: advierte de saturación, nunca impide mover una iniciativa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StageSettings stages={stages} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
