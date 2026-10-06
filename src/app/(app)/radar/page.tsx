import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getRadarRows } from '@/server/services/views';
import { PageHeader } from '@/components/layout/app-shell';
import { RadarTable } from '@/components/radar/radar-table';
import { InitiativeSheetHost } from '@/components/initiative/initiative-sheet-host';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Radar de esperas' };

/** Vista 2 — Radar de Esperas. */
export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ iniciativa?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const rows = await getRadarRows(getDataStore());

  return (
    <>
      <PageHeader
        title="Radar de esperas"
        description="Qué está esperando cada iniciativa hoy, y a quién. Primero las paradas."
      />

      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <RadarTable rows={rows} />
      </div>

      <InitiativeSheetHost initiativeId={params.iniciativa} session={session} />
    </>
  );
}
