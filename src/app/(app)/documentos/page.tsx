import { DEPARTMENTS } from '@/domain/enums';
import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getDocumentsView } from '@/server/services/documents';
import { PageHeader } from '@/components/layout/app-shell';
import { DocumentsLibrary } from '@/components/documents/documents-library';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documentos' };

/**
 * Biblioteca de documentos por área. Cada persona ve los de sus áreas y los que
 * se comparten con ella; solo los responsables de área y Dirección comparten.
 */
export default async function DocumentsPage() {
  const session = await requireSession();
  const view = await getDocumentsView(getDataStore(), session);

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Todo el material de tu área en un solo sitio. Los responsables de área pueden compartirlo con otras personas, áreas o toda la empresa."
      />
      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <DocumentsLibrary
            {...view}
            myDepartments={session.departments}
            uploadDepartments={session.role === 'EXECUTIVE' ? [...DEPARTMENTS] : session.departments}
          />
        </div>
      </div>
    </>
  );
}
