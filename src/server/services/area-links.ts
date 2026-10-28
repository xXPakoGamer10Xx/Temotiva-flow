import { randomUUID } from 'node:crypto';
import { DEPARTMENTS } from '@/domain/enums';
import type { Department } from '@/domain/enums';
import { ALLOWED_LINK_HOSTS, MAX_LINK_TITLE, MAX_LINK_URL, MIN_LINK_TITLE } from '@/domain/rules';
import type { AreaLink, SessionContext } from '@/domain/types';
import { belongsTo } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { forbidden, invalid, notFound } from './errors';
import { canRemoveAreaLink, canWorkInArea } from './rbac';

/**
 * Enlaces a documentos externos (Google Docs, Drive...) por área.
 *
 * Cada enlace pertenece a un área: lo ven sus miembros y Dirección, y lo añade
 * cualquier miembro. Solo se guardan URLs https a hosts de Google, para que un
 * enlace nunca sea `javascript:` ni lleve a un sitio arbitrario. Baja lógica.
 */

/** Devuelve la URL normalizada o lanza si no es un enlace https a un host permitido. */
export function normalizeLinkUrl(raw: string): string {
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_LINK_URL) throw invalid('Pega la dirección del documento.');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw invalid('La dirección del documento no es válida.');
  }
  const hosts: readonly string[] = ALLOWED_LINK_HOSTS;
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password) {
    throw invalid('Solo se admiten enlaces https de Google Docs, Sheets, Slides o Drive.');
  }
  return url.toString();
}

export function canViewAreaLink(session: SessionContext, link: AreaLink): boolean {
  return !link.isRemoved && canWorkInArea(session, link.department);
}

export interface AddAreaLinkInput {
  title: string;
  url: string;
  /** Área dueña; por defecto, la principal de quien lo añade. */
  department?: Department;
  now?: Date;
}

export async function addAreaLink(store: DataStore, session: SessionContext, input: AddAreaLinkInput): Promise<AreaLink> {
  const now = input.now ?? new Date();
  const department = input.department ?? session.departments[0];
  if (!department || !DEPARTMENTS.includes(department)) throw invalid('Elige el área del documento.');
  if (!canWorkInArea(session, department)) throw forbidden('Solo puedes añadir enlaces a tus propias áreas.');

  const title = input.title.trim();
  if (title.length < MIN_LINK_TITLE) throw invalid('Ponle un título al documento.');
  if (title.length > MAX_LINK_TITLE) throw invalid(`El título no puede superar ${MAX_LINK_TITLE} caracteres.`);
  const url = normalizeLinkUrl(input.url);

  const link = await store.insertAreaLink({
    id: randomUUID(),
    title,
    url,
    department,
    createdBy: session.userId,
    createdAt: now.toISOString(),
    isRemoved: false,
    removedBy: null,
    removedAt: null,
  });
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'LINK_ADDED',
    fieldName: 'area_links',
    newValue: { linkId: link.id, title, department },
    at: now,
  });
  return link;
}

export async function removeAreaLink(
  store: DataStore,
  session: SessionContext,
  input: { linkId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const link = await store.areaLinkById(input.linkId);
  // Sin acceso se responde "no existe".
  if (!link || !canViewAreaLink(session, link)) throw notFound('El enlace no existe o ya se retiró.');
  if (!canRemoveAreaLink(session, link)) {
    throw forbidden('Solo quien añadió el enlace, el responsable del área o Dirección pueden retirarlo.');
  }
  await store.markAreaLinkRemoved(link.id, session.userId, now.toISOString());
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'LINK_REMOVED',
    fieldName: 'area_links',
    oldValue: { linkId: link.id, title: link.title },
    at: now,
  });
}

export interface AreaLinkView {
  id: string;
  title: string;
  url: string;
  department: Department;
  createdByName: string;
  createdAt: string;
  isOwnArea: boolean;
  canRemove: boolean;
}

/** Las filas llegan al cliente sin correos ni identificadores internos de quien las retira. */
export async function getAreaLinksView(store: DataStore, session: SessionContext): Promise<AreaLinkView[]> {
  const [links, users] = await Promise.all([store.listAreaLinks(), store.listUsers()]);
  const userName = new Map(users.map((user) => [user.id, user.name]));
  return links
    .filter((link) => canViewAreaLink(session, link))
    .map((link) => ({
      id: link.id,
      title: link.title,
      url: link.url,
      department: link.department,
      createdByName: userName.get(link.createdBy) ?? 'Persona retirada',
      createdAt: link.createdAt,
      isOwnArea: belongsTo(session, link.department),
      canRemove: canRemoveAreaLink(session, link),
    }));
}
