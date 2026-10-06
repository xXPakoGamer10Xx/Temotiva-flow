import Link from 'next/link';
import type { Route } from 'next';
import { requireSession } from '@/lib/session';
import { HELP_STATUS_LABELS, departmentsLabel } from '@/domain/labels';
import { getDataStore } from '@/server/repositories';
import { getNotifications, type NotificationView } from '@/server/services/views';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge, Card, EmptyState, SectionLabel } from '@/components/ui/primitives';
import { HelpTypeBadge } from '@/components/shared/signals';
import { InitiativeSheetHost } from '@/components/initiative/initiative-sheet-host';
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
    <>
      <PageHeader
        title="Notificaciones"
        description={`Solicitudes de ayuda dirigidas a ${departmentsLabel(session.departments)} y las que has abierto tú.`}
      />

      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="space-y-2">
            <SectionLabel>Recibidas · {received.length} pendientes</SectionLabel>
            {received.length === 0 ? (
              <EmptyState
                mascot
                title="Nada pendiente"
                description="Cuando otro departamento te pida ayuda desde una iniciativa, la verás aquí con un contador en el menú. Hoy nadie está esperando por vosotros."
              />
            ) : (
              <ul className="space-y-2">
                {received.map((item) => (
                  <NotificationRow key={item.dependency.id} item={item} />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <SectionLabel>Enviadas · {sent.length} en total</SectionLabel>
            {sent.length === 0 ? (
              <EmptyState
                title="No has pedido ayuda todavía"
                description="Abre una iniciativa y, en la pestaña Dependencias 🆘, pide información, una validación, una decisión o recursos a otro departamento."
              />
            ) : (
              <ul className="space-y-2">
                {sent.map((item) => (
                  <NotificationRow key={item.dependency.id} item={item} showStatus />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <InitiativeSheetHost initiativeId={params.iniciativa} session={session} />
    </>
  );
}

function NotificationRow({ item, showStatus = false }: { item: NotificationView; showStatus?: boolean }) {
  const { dependency } = item;

  return (
    <li>
      <Card className="card-hover p-0">
        <Link
          href={`/notifications?iniciativa=${item.initiativeId}` as Route}
          scroll={false}
          className="block space-y-1.5 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-fg-subtle">{item.initiativeId}</span>
            <span className="text-sm font-medium">{item.initiativeTitle}</span>
            <Badge tone="neutral">{item.stageName}</Badge>
            <span className="ml-auto text-xs text-fg-subtle">{formatRelative(dependency.createdAt)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
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
          </div>

          <p className="text-xs leading-relaxed text-fg-muted">{dependency.description}</p>
        </Link>
      </Card>
    </li>
  );
}
