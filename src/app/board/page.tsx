import type { Department } from '@/domain/enums';
import { DEPARTMENTS } from '@/domain/enums';
import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getBoardView, type BoardFilter } from '@/server/services/views';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { EmptyState } from '@/components/ui/primitives';
import { BoardColumn } from '@/components/board/board-column';
import { BoardFilters } from '@/components/board/board-filters';
import { InitiativeSheetHost } from '@/components/initiative/initiative-sheet-host';
import { NewInitiativeButton } from '@/components/initiative/new-initiative-dialog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tablero de flujo' };

interface BoardSearchParams {
  iniciativa?: string;
  archivadas?: string;
  dep?: string;
  estado?: string;
  q?: string;
}

/** Vista 1 — Tablero de flujo (Kanban de iniciativas). */
export default async function BoardPage({ searchParams }: { searchParams: Promise<BoardSearchParams> }) {
  const session = await requireSession();
  const params = await searchParams;

  const department = DEPARTMENTS.includes(params.dep as Department) ? (params.dep as Department) : undefined;
  const flow = params.estado === 'parada' || params.estado === 'riesgo' ? params.estado : undefined;
  const filter: BoardFilter = { department, flow, query: params.q };
  const includeArchived = params.archivadas === '1';

  const store = getDataStore();
  const [columns, unfiltered] = await Promise.all([
    getBoardView(store, { includeArchived, filter }),
    getBoardView(store, { includeArchived }),
  ]);

  const allCards = unfiltered.flatMap((column) => column.cards);
  const counts = {
    total: allCards.length,
    blocked: allCards.filter((card) => card.isBlocked).length,
    atRisk: allCards.filter((card) => card.sle.state !== 'ON_TIME').length,
    byDepartment: Object.fromEntries(
      DEPARTMENTS.map((value) => [
        value,
        allCards.filter(
          (card) =>
            card.ownerDepartment === value ||
            card.dependencies.some((dependency) => dependency.status === 'PENDING' && dependency.department === value),
        ).length,
      ]),
    ) as Record<Department, number>,
  };

  const visible = columns.reduce((total, column) => total + column.cards.length, 0);
  const saturated = columns.filter((column) => column.isSaturated).length;

  // Se conserva el filtro al abrir una ficha, para poder volver a lo mismo.
  const queryString = new URLSearchParams(
    Object.entries({ dep: params.dep, estado: params.estado, q: params.q, archivadas: params.archivadas })
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([key, value]) => [key, value]),
  ).toString();

  return (
    <AppShell session={session}>
      <PageHeader
        title="Tablero de flujo"
        description={
          <>
            {visible === counts.total
              ? `${counts.total} iniciativas en 7 fases secuenciales`
              : `${visible} de ${counts.total} iniciativas visibles`}
            {saturated > 0 ? ` · ${saturated} fase(s) por encima del WIP recomendado` : ''}
          </>
        }
        actions={<NewInitiativeButton />}
      >
        <BoardFilters counts={counts} />
      </PageHeader>

      {counts.total === 0 ? (
        <div className="px-4 py-8 sm:px-6">
          <EmptyState
            mascot
            title="Todavía no hay iniciativas"
            description="Una iniciativa es una unidad de valor que recorre 7 fases, de Ideación a Producción. Crea la primera y aparecerá aquí, en la columna de Ideación."
            action={<NewInitiativeButton />}
          />
        </div>
      ) : null}

      <div className="scrollbar-slim flex-1 snap-x snap-proximity overflow-x-auto scroll-px-4 px-4 pb-6 pt-3 sm:px-6">
        <div className="flex h-full min-w-max gap-3">
          {columns.map((column) => (
            <BoardColumn key={column.stage.id} column={column} basePath="/board" query={queryString} />
          ))}
        </div>
      </div>

      <InitiativeSheetHost initiativeId={params.iniciativa} session={session} />
    </AppShell>
  );
}
