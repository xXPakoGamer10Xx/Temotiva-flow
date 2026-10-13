import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { departmentsLabel } from '@/domain/labels';
import { getDataStore } from '@/server/repositories';
import { getMyWork, type MyWorkItem } from '@/server/services/views';
import { PageHeader } from '@/components/layout/app-shell';
import { EmptyState, SectionLabel } from '@/components/ui/primitives';
import { BoardCard } from '@/components/board/board-card';
import { InitiativeSheetHost } from '@/components/initiative/initiative-sheet-host';
import { NewInitiativeButton } from '@/components/initiative/new-initiative-dialog';

/** Motivos visibles por tarjeta; el resto se ve al abrir la ficha. */
const MAX_REASONS = 3;

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi trabajo' };

/**
 * Mi trabajo: lo primero que ve cada persona al entrar. Primero lo que otros
 * esperan de mí (desbloquea a otras áreas), luego lo asignado, lo parado que me
 * afecta y lo que mi área tiene sin persona. Las definiciones viven en
 * `getMyWork` y coinciden con los filtros del tablero.
 */
export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ iniciativa?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const view = await getMyWork(getDataStore(), session);
  const total = view.waiting.length + view.mine.length + view.blocked.length + view.unassignedInMyArea.length;

  return (
    <>
      <PageHeader
        title="Mi trabajo"
        description={`Lo que te toca a ti y a ${session.departments.length > 3 ? 'tus áreas' : departmentsLabel(session.departments)}, ordenado por prioridad.`}
        actions={<NewInitiativeButton />}
      />

      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {total === 0 ? (
            <EmptyState
              mascot
              title="Nada pendiente por tu parte 🟢"
              description="No tienes iniciativas asignadas, nadie espera una respuesta de tu área y no hay paradas que te afecten."
              action={
                <Link href="/board" className="text-xs font-medium text-accent-text underline-offset-4 hover:underline">
                  Ver el tablero completo
                </Link>
              }
            />
          ) : (
            <>
              <Section
                title="Esperando de mí"
                hint="Solicitudes 🆘 a tu área y requisitos de compuerta que solo tu área puede marcar."
                empty="Nadie está esperando una respuesta tuya."
                items={view.waiting}
                showReasons
              />
              <Section
                title="Asignadas a mí"
                empty="No tienes iniciativas asignadas."
                items={view.mine}
              />
              <Section
                title="Bloqueadas que me afectan"
                hint="Paradas que son tuyas, de tu área o esperan una solicitud que abriste."
                empty="Ninguna parada te afecta."
                items={view.blocked}
              />
              <Section
                title="De mi área sin asignar"
                hint="Llegaron a tu área al cambiar de fase y nadie las ha tomado todavía."
                empty="Todo lo de tu área tiene persona asignada."
                items={view.unassignedInMyArea}
              />
            </>
          )}
        </div>
      </div>

      <InitiativeSheetHost initiativeId={params.iniciativa} session={session} />
    </>
  );
}

function Section({
  title,
  hint,
  empty,
  items,
  showReasons = false,
}: {
  title: string;
  hint?: string;
  empty: string;
  items: MyWorkItem[];
  showReasons?: boolean;
}) {
  return (
    <section className="space-y-2">
      <div>
        <SectionLabel>
          {title} · <span className="tabular-nums">{items.length}</span>
        </SectionLabel>
        {hint ? <p className="mt-0.5 text-xs text-fg-muted">{hint}</p> : null}
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-fg-muted">{empty}</p>
      ) : (
        <ul className="gap-2 [column-fill:balance] sm:columns-2 lg:columns-3">
          {items.map((item) => (
            <li key={item.card.id} className="mb-2 break-inside-avoid">
              <BoardCard
                card={item.card}
                basePath="/mi-trabajo"
                footer={
                  showReasons && item.waitingReasons.length > 0 ? (
                    <ul className="space-y-1">
                      {item.waitingReasons.slice(0, MAX_REASONS).map((reason) => (
                        <li key={reason} className="line-clamp-2 text-xs leading-relaxed text-fg-muted [overflow-wrap:anywhere]">
                          {reason}
                        </li>
                      ))}
                      {item.waitingReasons.length > MAX_REASONS ? (
                        <li className="text-xs text-fg-subtle">
                          +{item.waitingReasons.length - MAX_REASONS} más en la ficha
                        </li>
                      ) : null}
                    </ul>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
