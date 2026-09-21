import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getRadarRows } from '@/server/services/views';
import { AppShell } from '@/components/layout/app-shell';
import { RadarTable } from '@/components/radar/radar-table';
import { InitiativeDialogHost } from '@/components/initiative/initiative-dialog-host';

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
    <AppShell session={session}>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Radar de esperas</h1>
          <p className="text-xs text-muted-foreground">
            Qué está esperando cada iniciativa hoy, y a quién. Ordenado por urgencia: primero las paradas.
          </p>
        </header>

        <RadarTable rows={rows} />
      </div>

      <InitiativeDialogHost initiativeId={params.iniciativa} session={session} />
    </AppShell>
  );
}
