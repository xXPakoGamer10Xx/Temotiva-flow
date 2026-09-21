import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getBoardView } from '@/server/services/views';
import { AppShell } from '@/components/layout/app-shell';
import { BoardColumn } from '@/components/board/board-column';
import { InitiativeDialogHost } from '@/components/initiative/initiative-dialog-host';
import { NewInitiativeDialog } from '@/components/initiative/new-initiative-dialog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tablero de flujo' };

/** Vista 1 — Tablero de flujo (Kanban de iniciativas). */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ iniciativa?: string; archivadas?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const includeArchived = params.archivadas === '1';
  const columns = await getBoardView(getDataStore(), { includeArchived });

  const totalActive = columns.reduce((total, column) => total + column.wipCount, 0);
  const saturated = columns.filter((column) => column.isSaturated).length;

  return (
    <AppShell session={session}>
      <div className="flex h-full flex-col gap-4 px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Tablero de flujo</h1>
            <p className="text-xs text-muted-foreground">
              {totalActive} iniciativas activas en 7 fases secuenciales
              {saturated > 0 ? ` · ${saturated} fase(s) por encima del WIP recomendado` : ''}
            </p>
          </div>
          <NewInitiativeDialog />
        </header>

        <div className="scrollbar-slim -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {columns.map((column) => (
            <BoardColumn key={column.stage.id} column={column} basePath="/board" />
          ))}
        </div>
      </div>

      <InitiativeDialogHost initiativeId={params.iniciativa} session={session} />
    </AppShell>
  );
}
