import type { Department } from '@/domain/enums';
import { DEPARTMENTS } from '@/domain/enums';
import { REQUEST_BLOCKING_LABEL_LINKED, REQUEST_BLOCKING_LABEL_STANDALONE } from '@/domain/labels';
import type {
  DepartmentRequestView,
  DepartmentRequestsView,
  InitiativeDependencyView,
} from '@/server/services/department-requests';

/**
 * Lógica de presentación del buzón de Dependencias (spec 001): une las dos
 * fuentes y aplica los filtros de la interfaz. Trabaja solo sobre filas que el
 * servidor ya autorizó: filtrar aquí es comodidad, nunca seguridad (RF-12).
 */

export type InboxTab = 'INCOMING' | 'OUTGOING' | 'ALL';
export type InboxStatusFilter = 'OPEN' | 'ALL' | 'PENDING' | 'IN_PROGRESS' | 'CLOSED';

export interface InboxFilters {
  tab: InboxTab;
  status: InboxStatusFilter;
  department: Department | 'ALL';
  onlyBlocking: boolean;
  query: string;
}

export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  tab: 'INCOMING',
  status: 'OPEN',
  department: 'ALL',
  onlyBlocking: false,
  query: '',
};

/** Estado común a las dos fuentes: una dependencia de iniciativa nunca está «en curso». */
type CommonStatus = 'PENDING' | 'IN_PROGRESS' | 'CLOSED';

interface InboxItemBase {
  id: string;
  createdAt: string;
  isIncoming: boolean;
  isOutgoing: boolean;
  isBlocking: boolean;
  status: CommonStatus;
  departments: [Department, Department];
  searchText: string;
}

export type InboxItem =
  | (InboxItemBase & { kind: 'request'; request: DepartmentRequestView })
  | (InboxItemBase & { kind: 'initiative'; dependency: InitiativeDependencyView });

/** Minúsculas y sin tildes, para que «clinica» encuentre «clínica». */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function buildInboxItems(
  view: Pick<DepartmentRequestsView, 'requests' | 'initiativeDependencies'>,
): InboxItem[] {
  const requests: InboxItem[] = view.requests.map((request) => ({
    kind: 'request',
    request,
    id: request.id,
    createdAt: request.createdAt,
    isIncoming: request.isIncoming,
    isOutgoing: request.isOutgoing,
    isBlocking: request.blocksInitiative,
    status: request.status === 'RESOLVED' ? 'CLOSED' : request.status,
    departments: [request.sourceDepartment, request.targetDepartment],
    searchText: normalize(
      [request.title, request.description, request.initiativeId ?? '', request.initiativeTitle ?? ''].join(' '),
    ),
  }));

  const dependencies: InboxItem[] = view.initiativeDependencies.map((dependency) => ({
    kind: 'initiative',
    dependency,
    id: dependency.id,
    createdAt: dependency.createdAt,
    isIncoming: dependency.isIncoming,
    isOutgoing: dependency.isOutgoing,
    isBlocking: dependency.isBlocking,
    status: dependency.status === 'PENDING' ? 'PENDING' : 'CLOSED',
    departments: [dependency.ownerDepartment, dependency.targetDepartment],
    searchText: normalize([dependency.description, dependency.initiativeId, dependency.initiativeTitle].join(' ')),
  }));

  return [...requests, ...dependencies].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function matchesTab(item: InboxItem, tab: InboxTab): boolean {
  if (tab === 'INCOMING') return item.isIncoming;
  if (tab === 'OUTGOING') return item.isOutgoing;
  return true;
}

function matchesStatus(item: InboxItem, status: InboxStatusFilter): boolean {
  if (status === 'ALL') return true;
  if (status === 'OPEN') return item.status !== 'CLOSED';
  return item.status === status;
}

/** Todos los filtros salvo la bandeja: base de los contadores de cada pestaña. */
function matchesRest(item: InboxItem, filters: InboxFilters): boolean {
  const query = normalize(filters.query.trim());
  return (
    matchesStatus(item, filters.status) &&
    (filters.department === 'ALL' || item.departments.includes(filters.department)) &&
    (!filters.onlyBlocking || item.isBlocking) &&
    (query === '' || item.searchText.includes(query))
  );
}

export function filterInboxItems(items: InboxItem[], filters: InboxFilters): InboxItem[] {
  return items.filter((item) => matchesTab(item, filters.tab) && matchesRest(item, filters));
}

export function countByTab(items: InboxItem[], filters: InboxFilters): Record<InboxTab, number> {
  const rest = items.filter((item) => matchesRest(item, filters));
  return {
    INCOMING: rest.filter((item) => item.isIncoming).length,
    OUTGOING: rest.filter((item) => item.isOutgoing).length,
    ALL: rest.length,
  };
}

/** Áreas presentes en las filas autorizadas, en el orden canónico. */
export function involvedDepartments(items: InboxItem[]): Department[] {
  const present = new Set(items.flatMap((item) => item.departments));
  return DEPARTMENTS.filter((department) => present.has(department));
}

/** Rótulo del indicador informativo (RF-9): ninguno promete detener el SLE. */
export function requestBlockingLabel(request: Pick<DepartmentRequestView, 'blocksInitiative' | 'initiativeId'>): string | null {
  if (!request.blocksInitiative) return null;
  return request.initiativeId ? REQUEST_BLOCKING_LABEL_LINKED : REQUEST_BLOCKING_LABEL_STANDALONE;
}
