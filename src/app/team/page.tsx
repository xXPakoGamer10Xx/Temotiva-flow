import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { AppShell } from '@/components/layout/app-shell';
import { AccessManager } from '@/components/admin/access-manager';
import { StageSettings } from '@/components/admin/stage-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Accesos y parámetros' };

/**
 * Administración: allowlist de acceso y parámetros del flujo.
 * Ambas capacidades son exclusivas de Dirección y se revalidan en el servidor
 * dentro de cada Server Action, no solo aquí.
 */
export default async function TeamPage() {
  const session = await requireSession();
  if (session.role !== 'EXECUTIVE') redirect('/board');

  const store = getDataStore();
  const [users, stages] = await Promise.all([store.listUsers(), store.listStages()]);

  return (
    <AppShell session={session}>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Accesos y parámetros</h1>
          <p className="text-xs text-muted-foreground">
            Quién puede entrar al sistema y con qué rol, y los objetivos de tiempo y carga de cada fase.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Lista de acceso</CardTitle>
            <CardDescription>
              Solo estas personas pueden iniciar sesión. Si un correo no está aquí o está de baja, el acceso se deniega
              por defecto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccessManager
              rows={users.map((user) => ({
                id: user.id,
                name: user.name,
                email: user.email,
                department: user.department,
                role: user.role,
                isActive: user.isActive,
              }))}
              currentUserId={session.userId}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parámetros de las fases</CardTitle>
            <CardDescription>
              El SLE se mide en horas netas de reloj (el tiempo en parada no cuenta). El límite de WIP es informativo:
              advierte de saturación, nunca impide mover una iniciativa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StageSettings stages={stages} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
