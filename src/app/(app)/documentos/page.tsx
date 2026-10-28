import { DEPARTMENTS } from '@/domain/enums';
import { requireSession } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import { getAreaLinksView } from '@/server/services/area-links';
import { getDocumentsView } from '@/server/services/documents';
import { PageHeader } from '@/components/layout/app-shell';
import { AreaLinks } from '@/components/documents/area-links';
import { DocumentsLibrary } from '@/components/documents/documents-library';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documentos' };

/**
 * Biblioteca de documentos por área: archivos subidos y enlaces a Google Docs.
 * Cada persona ve los de sus áreas; los archivos los comparten los responsables
 * de área y Dirección.
 */
export default async function DocumentsPage() {
  const session = await requireSession();
  const store = getDataStore();
  const [view, links] = await Promise.all([getDocumentsView(store, session), getAreaLinksView(store, session)]);
  const ownDepartments = session.role === 'EXECUTIVE' ? [...DEPARTMENTS] : session.departments;

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Todo el material de tu área en un solo sitio: archivos y enlaces a Google Docs. Los responsables de área pueden compartir los archivos con otras personas, áreas o toda la empresa."
      />
      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Tabs defaultValue="links">
            <TabsList>
              <TabsTrigger value="links">Enlaces ({links.length})</TabsTrigger>
              <TabsTrigger value="files">Archivos ({view.documents.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="links" className="space-y-6">
              <AreaLinks links={links} addDepartments={ownDepartments} myDepartments={session.departments} />
            </TabsContent>
            <TabsContent value="files" className="space-y-6">
              <DocumentsLibrary {...view} myDepartments={session.departments} uploadDepartments={ownDepartments} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
