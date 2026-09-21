import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getFlowMetrics } from '@/server/services/metrics';
import { AppShell } from '@/components/layout/app-shell';
import { HeadlineTiles, OverrideChart, StageTimeChart, StopCausesChart } from '@/components/executive/charts';
import { InitiativeDialogHost } from '@/components/initiative/initiative-dialog-host';

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
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Panel de dirección</h1>
          <p className="text-xs text-muted-foreground">
            Salud del proceso, no de las personas: dónde se atasca el flujo, por qué se para y cuánto se está forzando
            la compuerta.
          </p>
        </header>

        <HeadlineTiles headline={metrics.headline} />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <StageTimeChart stages={metrics.stages} />
          </div>
          <StopCausesChart causes={metrics.stopCauses} />
          <OverrideChart overrides={metrics.overrides} />
        </div>
      </div>

      <InitiativeDialogHost initiativeId={params.iniciativa} session={session} />
    </AppShell>
  );
}
