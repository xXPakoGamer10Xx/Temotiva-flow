import Link from 'next/link';
import type { Route } from 'next';
import { requireSession } from '@/lib/session';
import { DEPARTMENT_LABELS, HELP_STATUS_LABELS } from '@/domain/labels';
import { getDataStore } from '@/server/repositories';
import { getNotifications, type NotificationView } from '@/server/services/views';
import { AppShell } from '@/components/layout/app-shell';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@/components/ui/primitives';
import { HelpTypeBadge } from '@/components/shared/signals';
import { InitiativeDialogHost } from '@/components/initiative/initiative-dialog-host';
import { formatRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notificaciones' };

/**
 * Centro de notificaciones in-app (D9). No hay tabla de notificaciones: es
 * estado derivado de las solicitudes de ayuda pendientes.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ iniciativa?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const { received, sent } = await getNotifications(getDataStore(), session);

  return (
    <AppShell session={session}>
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Notificaciones</h1>
          <p className="text-xs text-muted-foreground">
            Solicitudes de ayuda dirigidas a {DEPARTMENT_LABELS[session.department]} y las que has abierto tú.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Recibidas ({received.length})</CardTitle>
            <CardDescription>Pendientes de respuesta de tu departamento.</CardDescription>
          </CardHeader>
          <CardContent>
            {received.length === 0 ? (
              <EmptyState title="Nada pendiente" description="Ningún departamento está esperando por vosotros." />
            ) : (
              <ul className="space-y-2.5">
                {received.map((item) => (
                  <NotificationRow key={item.dependency.id} item={item} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enviadas ({sent.length})</CardTitle>
            <CardDescription>Solicitudes que has abierto tú, con su estado actual.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent.length === 0 ? (
              <EmptyState title="No has pedido ayuda todavía" />
            ) : (
              <ul className="space-y-2.5">
                {sent.map((item) => (
                  <NotificationRow key={item.dependency.id} item={item} showStatus />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <InitiativeDialogHost initiativeId={params.iniciativa} session={session} />
    </AppShell>
  );
}

function NotificationRow({ item, showStatus = false }: { item: NotificationView; showStatus?: boolean }) {
  const { dependency } = item;

  return (
    <li>
      <Link
        href={`/notifications?iniciativa=${item.initiativeId}` as Route}
        scroll={false}
        className="block space-y-1.5 rounded-lg border border-border p-3 transition-colors hover:border-primary/45"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">{item.initiativeId}</span>
          <span className="text-sm font-medium">{item.initiativeTitle}</span>
          <Badge tone="neutral">{item.stageName}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HelpTypeBadge helpType={dependency.helpType} isBlocking={dependency.isBlocking} />
          {showStatus ? (
            <Badge
              tone={
                dependency.status === 'PENDING' ? 'warning' : dependency.status === 'RESOLVED' ? 'success' : 'neutral'
              }
            >
              {HELP_STATUS_LABELS[dependency.status]}
            </Badge>
          ) : (
            <Badge tone="neutral">de {dependency.requestedBy?.name ?? '—'}</Badge>
          )}
          <span className="text-[11px] text-muted-foreground">{formatRelative(dependency.createdAt)}</span>
        </div>

        <p className="text-xs text-muted-foreground">{dependency.description}</p>
      </Link>
    </li>
  );
}
