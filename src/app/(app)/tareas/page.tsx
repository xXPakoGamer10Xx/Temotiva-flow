import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getTasksView } from '@/server/services/dept-tasks';
import { PageHeader } from '@/components/layout/app-shell';
import { TasksBoard } from '@/components/tasks/tasks-board';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tareas' };

/**
 * Tareas de área. El responsable crea y asigna; el equipo las mueve entre
 * Por hacer, En curso y Hecha.
 */
export default async function TasksPage() {
  const session = await requireSession();
  const view = await getTasksView(getDataStore(), session);

  return (
    <>
      <PageHeader
        title="Tareas"
        description="Lo que el responsable de tu área reparte al equipo. Muévelas de columna según avances."
      />
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <TasksBoard {...view} myUserId={session.userId} />
      </div>
    </>
  );
}
