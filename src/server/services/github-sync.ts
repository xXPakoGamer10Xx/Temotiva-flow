import type { PullRequestState, TaskStatus } from '@/domain/enums';
import { TECH_TASK_PREFIX } from '@/domain/rules';
import type { DeptTask, TaskPullRequest } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';

/**
 * Sincronización con GitHub: un pull request que cita una o varias claves de
 * tarea (`TEC-12`) en su rama, título o descripción mueve esas tareas.
 *
 *   PR en borrador        → En curso
 *   PR abierto / listo     → En revisión
 *   PR fusionado           → Hecha
 *   PR cerrado sin fusión  → vuelve a En curso (si estaba En revisión)
 *
 * Una tarea Hecha nunca retrocede por un PR nuevo: solo se anota el PR.
 *
 * Caja negra: estos cambios no los hace una persona con sesión, así que no se
 * firman en `activity_log` (su `user_id` debe ser la sesión validada,
 * SEGURIDAD.md §6). El rastro queda en la propia tarea (`pullRequest`) y en el
 * historial de GitHub.
 */

const MAX_TITLE = 300;

export interface PullRequestEvent {
  action: string;
  repo: string;
  number: number;
  url: string;
  title: string;
  body: string;
  branch: string;
  draft: boolean;
  merged: boolean;
}

/** Acciones de `pull_request` que cambian algo para nosotros. */
const HANDLED_ACTIONS = new Set(['opened', 'reopened', 'edited', 'ready_for_review', 'converted_to_draft', 'closed']);

/** Claves de tarea citadas en cualquier texto, sin duplicados y en mayúsculas. */
export function extractTaskCodes(...texts: string[]): string[] {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${TECH_TASK_PREFIX}[-_ ]?(\\d{1,6})(?![0-9])`, 'gi');
  const codes = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(pattern)) codes.add(`${TECH_TASK_PREFIX}-${Number(match[1])}`);
  }
  return [...codes];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Extrae lo necesario del payload de GitHub; `null` si no es un evento útil. */
export function parsePullRequestPayload(payload: unknown): PullRequestEvent | null {
  if (!isRecord(payload) || !isRecord(payload.pull_request) || !isRecord(payload.repository)) return null;
  const pr = payload.pull_request;
  const head = isRecord(pr.head) ? pr.head : {};
  const number = typeof pr.number === 'number' ? pr.number : Number.NaN;
  const url = str(pr.html_url);
  if (!Number.isInteger(number) || !url.startsWith('https://github.com/')) return null;
  return {
    action: str(payload.action),
    repo: str(payload.repository.full_name),
    number,
    url,
    title: str(pr.title).slice(0, MAX_TITLE),
    body: str(pr.body),
    branch: str(head.ref),
    draft: pr.draft === true,
    merged: pr.merged === true,
  };
}

export function pullRequestState(event: PullRequestEvent): PullRequestState {
  if (event.merged) return 'MERGED';
  if (event.action === 'closed') return 'CLOSED';
  return event.draft ? 'DRAFT' : 'OPEN';
}

/** Estado de la tarea tras el evento; `null` = no se mueve. */
export function nextTaskStatus(task: DeptTask, state: PullRequestState, samePr: boolean): TaskStatus | null {
  if (task.status === 'DONE') return null;
  switch (state) {
    case 'MERGED':
      return 'DONE';
    case 'OPEN':
      return 'REVIEW';
    case 'DRAFT':
      return task.status === 'TODO' || task.status === 'REVIEW' ? 'DOING' : null;
    case 'CLOSED':
      return samePr && task.status === 'REVIEW' ? 'DOING' : null;
  }
}

export interface SyncResult {
  /** Tareas que cambiaron (de estado o de PR anotado). */
  updated: number;
  /** Claves citadas que no corresponden a ninguna tarea de Tech viva. */
  unknown: number;
}

export async function syncPullRequest(store: DataStore, event: PullRequestEvent, now: Date = new Date()): Promise<SyncResult> {
  if (!HANDLED_ACTIONS.has(event.action)) return { updated: 0, unknown: 0 };
  const codes = extractTaskCodes(event.branch, event.title, event.body);
  if (codes.length === 0) return { updated: 0, unknown: 0 };

  const byCode = new Map(
    (await store.listDeptTasks())
      .filter((task) => task.code && task.department === 'TECH' && !task.isArchived)
      .map((task) => [task.code as string, task]),
  );
  const state = pullRequestState(event);
  const pullRequest: TaskPullRequest = {
    repo: event.repo,
    number: event.number,
    url: event.url,
    title: event.title,
    state,
    updatedAt: now.toISOString(),
  };

  let updated = 0;
  let unknown = 0;
  for (const code of codes) {
    const task = byCode.get(code);
    if (!task) {
      unknown += 1;
      continue;
    }
    const current = task.pullRequest;
    const samePr = current !== null && current.repo === event.repo && current.number === event.number;
    // Cerrar sin fusionar otro PR no pisa uno que sigue vivo en la tarea.
    const keepCurrent = !samePr && state === 'CLOSED' && (current?.state === 'OPEN' || current?.state === 'DRAFT');
    const status = nextTaskStatus(task, state, samePr);
    const prChanged =
      !keepCurrent && (!samePr || current.state !== state || current.title !== event.title || current.url !== event.url);
    if (!prChanged && (status === null || status === task.status)) continue;

    await store.updateDeptTask(task.id, {
      ...(prChanged ? { pullRequest } : {}),
      ...(status && status !== task.status ? { status } : {}),
      updatedAt: now.toISOString(),
    });
    updated += 1;
  }
  return { updated, unknown };
}
