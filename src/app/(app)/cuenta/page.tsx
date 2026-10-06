import { KeyRound, ShieldCheck } from 'lucide-react';
import { requireSession } from '@/lib/session';
import { DEPARTMENT_LABELS, USER_ROLE_LABELS } from '@/domain/labels';
import { getDataStore } from '@/server/repositories';
import { PageHeader } from '@/components/layout/app-shell';
import { AccountForm } from '@/components/admin/account-form';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives';
import { DepartmentDot } from '@/components/shared/signals';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi cuenta' };

/**
 * Panel de cuenta, disponible para cualquier rol.
 *
 * Gestiona lo que es tuyo (tu nombre visible) y muestra en claro lo que no lo
 * es: el correo con el que entras, tu rol y tus áreas los decide quien gestiona
 * el equipo. La contraseña no aparece porque el sistema no guarda ninguna: la
 * custodia tu cuenta de Google (DESIGN.md D2).
 */
export default async function AccountPage() {
  const session = await requireSession();
  const profile = await getDataStore().userById(session.userId);

  return (
    <>
      <PageHeader title="Mi cuenta" description="Tus datos de perfil y cómo entras al sistema." />

      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Perfil</CardTitle>
              <CardDescription>
                Tu nombre es lo que ven tus compañeras y compañeros en tarjetas, compuertas y trazabilidad.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccountForm name={session.name} email={session.email} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rol y áreas</CardTitle>
              <CardDescription>
                Definen qué puedes hacer. Los cambia quien gestiona tu equipo, no tú: es lo que evita que alguien se
                conceda permisos a sí mismo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-fg-muted">Rol</span>
                <Badge tone={session.role === 'EXECUTIVE' ? 'accent' : session.role === 'LEAD' ? 'info' : 'neutral'}>
                  {USER_ROLE_LABELS[session.role]}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-fg-muted">Áreas</span>
                {session.departments.map((department) => (
                  <Badge key={department} tone="neutral">
                    <DepartmentDot department={department} />
                    {DEPARTMENT_LABELS[department]}
                  </Badge>
                ))}
              </div>

              <p className="text-xs text-fg-subtle">
                {session.role === 'MEMBER'
                  ? 'Marcas los requisitos de compuerta de tus áreas, abres y resuelves solicitudes de ayuda y avanzas fases con la compuerta completa.'
                  : session.role === 'LEAD'
                    ? 'Además das de alta a miembros de tus áreas, firmas avances excepcionales y configuras las compuertas de tu departamento.'
                    : 'Alcance total sobre personas, roles, áreas y parámetros del sistema.'}
              </p>

              {profile ? (
                <p className="text-xs text-fg-subtle">Con acceso desde {formatDate(profile.createdAt)}.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acceso y contraseña</CardTitle>
              <CardDescription>Cómo se protege tu entrada al sistema.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs leading-relaxed text-fg-muted">
              <p className="flex items-start gap-2">
                <KeyRound className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
                <span>
                  Temotiva Flow <strong className="font-medium text-fg">no guarda contraseñas</strong>. Entras con tu
                  cuenta de Google, que es quien custodia la contraseña y el segundo factor. Para cambiarla, ve a{' '}
                  <a
                    href="https://myaccount.google.com/security"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent-text hover:underline"
                  >
                    la seguridad de tu cuenta de Google
                  </a>
                  .
                </span>
              </p>
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
                <span>
                  Tu correo (<span className="font-mono">{session.email}</span>) es la llave: solo entra si está en la
                  lista de acceso y activo. Si necesitas cambiarlo, pídeselo a quien gestione tu equipo.
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
