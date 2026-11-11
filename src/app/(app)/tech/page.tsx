import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { canSeeTechSprint, getTechSprintView } from '@/server/services/tech-sprint';
import { PageHeader } from '@/components/layout/app-shell';
import { TechSprintBoard } from '@/components/tech/tech-sprint-board';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sprint Tech' };

/** Día de calendario del equipo (misma zona horaria que el resto de la app). */
function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

/**
 * Sprint de Tech: vista de project manager sobre las tareas del área. Solo la
 * ven Tech y Dirección; para el resto la ruta no existe.
 */
export default async function TechSprintPage({ searchParams }: { searchParams: Promise<{ sprint?: string | string[] }> }) {
  const session = await requireSession();
  if (!canSeeTechSprint(session)) notFound();

  const { sprint } = await searchParams;
  const view = await getTechSprintView(getDataStore(), session, {
    sprintId: typeof sprint === 'string' ? sprint : null,
    today: todayKey(),
    githubConfigured: Boolean(process.env.GITHUB_WEBHOOK_SECRET?.trim()),
  });

  return (
    <>
      <PageHeader
        title="Sprint Tech"
        description="Quién lleva qué, cuántas horas y para cuándo. Los PR de GitHub mueven las tareas solos."
      />
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <TechSprintBoard {...view} myUserId={session.userId} />
      </div>
    </>
  );
}
