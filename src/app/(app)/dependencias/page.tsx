import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getDepartmentRequestsView } from '@/server/services/department-requests';
import { PageHeader } from '@/components/layout/app-shell';
import { DepartmentRequestsBoard } from '@/components/dependencies/department-requests-board';
import { InitiativeSheetHost } from '@/components/initiative/initiative-sheet-host';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dependencias' };

/**
 * Buzón de Dependencias (spec 001): peticiones entre áreas y, en solo lectura,
 * las dependencias 🆘 de iniciativa que afectan a la sesión. El Need-to-Know
 * se aplica en `getDepartmentRequestsView`: el cliente solo recibe lo autorizado.
 */
export default async function DependenciesPage({
  searchParams,
}: {
  searchParams: Promise<{ iniciativa?: string; tab?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const view = await getDepartmentRequestsView(getDataStore(), session);

  return (
    <>
      <PageHeader
        title="Dependencias"
        description="Peticiones de ayuda entre áreas: lo que piden a tu equipo y lo que tu equipo pide a otras."
      />
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <DepartmentRequestsBoard {...view} />
      </div>
      <InitiativeSheetHost initiativeId={params.iniciativa} session={session} tab={params.tab} />
    </>
  );
}
