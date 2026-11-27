import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getFinalizedView } from '@/server/services/views';
import { PageHeader } from '@/components/layout/app-shell';
import { FinalizedTable } from '@/components/finalized/finalized-table';
import { InitiativeSheetHost } from '@/components/initiative/initiative-sheet-host';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Iniciativas finalizadas' };

/**
 * Iniciativas finalizadas (spec 005, RF-18): las que cerraron Producción. Salen
 * del tablero operativo y se consultan aquí, con su historial por fase.
 */
export default async function FinalizedPage({
  searchParams,
}: {
  searchParams: Promise<{ iniciativa?: string; q?: string; tab?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const query = params.q?.slice(0, 120);
  const rows = await getFinalizedView(getDataStore(), { query });

  return (
    <>
      <PageHeader
        title="Iniciativas finalizadas"
        description="Histórico de lo que llegó a Producción: notas de cada fase, aprobaciones de área y talla de esfuerzo."
      />

      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <FinalizedTable rows={rows} query={query ?? ''} />
      </div>

      <InitiativeSheetHost initiativeId={params.iniciativa} session={session} tab={params.tab ?? 'history'} />
    </>
  );
}
