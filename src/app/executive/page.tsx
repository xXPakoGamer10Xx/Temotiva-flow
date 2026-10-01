import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getFlowMetrics } from '@/server/services/metrics';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { HeadlineTiles, OverrideChart, StageTimeChart, StopCausesChart } from '@/components/executive/charts';
import { InitiativeSheetHost } from '@/components/initiative/initiative-sheet-host';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Panel de dirección' };

/** Vista 4 — Panel de Flujo de Dirección. */
export default async function ExecutivePage({
  searchParams,
}: {
  searchParams: Promise<{ iniciativa?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const metrics = await getFlowMetrics(getDataStore());

  return (
    <AppShell session={session}>
      <PageHeader
        title="Panel de dirección"
        description="Salud del proceso, no de las personas: dónde se atasca el flujo, por qué se para y cuánto se fuerza la compuerta."
      />

      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-3">
          <HeadlineTiles headline={metrics.headline} />
          <StageTimeChart stages={metrics.stages} />
          <div className="grid gap-3 lg:grid-cols-2">
            <StopCausesChart causes={metrics.stopCauses} />
            <OverrideChart overrides={metrics.overrides} />
          </div>
        </div>
      </div>

      <InitiativeSheetHost initiativeId={params.iniciativa} session={session} />
    </AppShell>
  );
}
