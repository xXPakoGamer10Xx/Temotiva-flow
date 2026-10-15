import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getFeedbackView } from '@/server/services/feedback';
import { canManageFeedback } from '@/server/services/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { FeedbackBoard } from '@/components/feedback/feedback-board';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Feedback' };

/**
 * Feedback del equipo sobre la app, la web o la plataforma. Todos lo envían;
 * solo los responsables de área y Dirección marcan su estado.
 */
export default async function FeedbackPage() {
  const session = await requireSession();
  const items = await getFeedbackView(getDataStore());

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Cuéntanos qué mejorarías de la app, la web o la plataforma. Los responsables de área marcan qué se está haciendo."
      />
      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <FeedbackBoard items={items} canManage={canManageFeedback(session)} />
        </div>
      </div>
    </>
  );
}
