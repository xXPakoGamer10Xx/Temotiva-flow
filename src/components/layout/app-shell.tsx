import type { SessionContext } from '@/domain/types';
import { USER_ROLE_LABELS, departmentsLabel } from '@/domain/labels';
import { getDataStore } from '@/server/repositories';
import { getNotifications } from '@/server/services/views';
import { canManagePeople } from '@/server/services/rbac';
import { CommandCenter, type PaletteInitiative } from '@/components/command/command-center';
import { NewInitiativeDialog } from '@/components/initiative/new-initiative-dialog';
import { WelcomeGuide } from '@/components/help/welcome-guide';
import { MobileNav } from './mobile-nav';
import { Sidebar, type SidebarLink } from './sidebar';

/**
 * Marco de la aplicación: navegación lateral, barra para pantallas estrechas y
 * la capa de teclado (paleta de comandos y atajos), que necesita el índice de
 * iniciativas para poder saltar a cualquiera por su ID.
 */
export async function AppShell({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  const store = getDataStore();
  const [{ received }, initiatives, stages] = await Promise.all([
    getNotifications(store, session),
    store.listInitiatives(),
    store.listStages(),
  ]);

  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const paletteInitiatives: PaletteInitiative[] = initiatives.map((initiative) => ({
    id: initiative.id,
    title: initiative.title,
    stageName: stageNames.get(initiative.currentStageId) ?? '—',
    ownerDepartment: initiative.ownerDepartment,
    isBlocked: initiative.isBlocked,
  }));

  const links: SidebarLink[] = [
    { href: '/board', label: 'Tablero', icon: 'board', shortcut: 'G B' },
    { href: '/radar', label: 'Radar de esperas', icon: 'radar', shortcut: 'G R' },
    { href: '/executive', label: 'Dirección', icon: 'executive', shortcut: 'G D' },
    { href: '/notifications', label: 'Notificaciones', icon: 'notifications', badge: received.length },
    { href: '/ayuda', label: 'Ayuda', icon: 'help', shortcut: 'G H' },
    // Los responsables también gestionan personas, solo que de sus áreas.
    ...(canManagePeople(session)
      ? [{ href: '/team', label: 'Equipo', icon: 'team' as const, shortcut: 'G A' }]
      : []),
  ];

  const user = {
    name: session.name,
    email: session.email,
    department: departmentsLabel(session.departments),
    role: USER_ROLE_LABELS[session.role],
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar links={links} user={user} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MobileNav links={links} userName={session.name} />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>

      <NewInitiativeDialog />
      <WelcomeGuide userId={session.userId} role={session.role} />
      <CommandCenter initiatives={paletteInitiatives} canManagePeople={canManagePeople(session)} />
    </div>
  );
}

/** Cabecera de página: título, una línea de contexto y las acciones de la vista. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-medium tracking-tight">{title}</h1>
          {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
