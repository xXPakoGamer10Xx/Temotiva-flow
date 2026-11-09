import type { Department, StageKey } from '@/domain/enums';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import type { PushEventKind, PushMessage } from '@/domain/push';
import { SEED_STAGES } from '@/domain/workflow';

/**
 * Plantillas de los avisos push (spec 002 §6 y §10).
 *
 * Contenido mínimo: el texto sale en la pantalla de bloqueo y pasa por los
 * servicios push de Google, Apple o Mozilla. Por eso cada contexto solo admite
 * identificadores, áreas, fases y cifras. No hay sitio para títulos,
 * descripciones, notas ni nombres de personas. Y aunque un llamador pasara la
 * fila completa, las plantillas solo leen estos campos.
 */
export interface PushMessageContext {
  TASK_ASSIGNED: { taskId: string; department: Department; initiativeId: string | null };
  INITIATIVE_ASSIGNED: { initiativeId: string };
  DEPENDENCY_INCOMING: { dependencyId: string; initiativeId: string; fromDepartment: Department; toDepartment: Department };
  REQUEST_INCOMING: { requestId: string; fromDepartment: Department; toDepartment: Department };
  DEPENDENCY_RESOLVED: { dependencyId: string; initiativeId: string; byDepartment: Department };
  REQUEST_RESOLVED: { requestId: string; byDepartment: Department };
  ENTERED_BOARD: { initiativeId: string; stageKey: StageKey; department: Department };
  INITIATIVE_CREATED: { initiativeId: string; department: Department };
  OVERRIDE: { initiativeId: string; department: Department };
  BLOCKED: { initiativeId: string; department: Department };
  /** `percent` del SLE neto consumido (75 = 75 %). */
  SLE_AT_RISK: { initiativeId: string; stageKey: StageKey; percent: number };
}

type Template<K extends PushEventKind> = (ctx: PushMessageContext[K]) => Omit<PushMessage, 'kind'>;

/** Las 7 fases son cerradas y sus nombres no se editan: se leen de la definición fija. */
const STAGE_NAMES = Object.fromEntries(SEED_STAGES.map((stage) => [stage.key, stage.name])) as Record<StageKey, string>;

const area = (department: Department): string => DEPARTMENT_LABELS[department];
const boardUrl = (initiativeId: string): string => `/board?iniciativa=${encodeURIComponent(initiativeId)}`;

const TEMPLATES: { [K in PushEventKind]: Template<K> } = {
  TASK_ASSIGNED: (c) => ({
    title: 'Tienes una tarea nueva',
    body: c.initiativeId ? `${area(c.department)} · ${c.initiativeId}` : area(c.department),
    url: '/tareas',
    tag: `TASK_ASSIGNED:${c.taskId}`,
  }),
  INITIATIVE_ASSIGNED: (c) => ({
    title: `Te han asignado ${c.initiativeId}`,
    body: 'Toca para abrir la iniciativa',
    url: boardUrl(c.initiativeId),
    tag: `INITIATIVE_ASSIGNED:${c.initiativeId}`,
  }),
  DEPENDENCY_INCOMING: (c) => ({
    title: `🆘 Petición de ${area(c.fromDepartment)} · ${c.initiativeId}`,
    body: `Para ${area(c.toDepartment)}`,
    url: '/notifications',
    tag: `DEPENDENCY_INCOMING:${c.dependencyId}`,
  }),
  REQUEST_INCOMING: (c) => ({
    title: `🆘 Nueva petición de ${area(c.fromDepartment)}`,
    body: `Para ${area(c.toDepartment)}`,
    url: '/dependencias',
    tag: `REQUEST_INCOMING:${c.requestId}`,
  }),
  DEPENDENCY_RESOLVED: (c) => ({
    title: `✅ ${area(c.byDepartment)} resolvió tu petición · ${c.initiativeId}`,
    body: 'Toca para ver la respuesta',
    url: boardUrl(c.initiativeId),
    tag: `DEPENDENCY_RESOLVED:${c.dependencyId}`,
  }),
  REQUEST_RESOLVED: (c) => ({
    title: `✅ ${area(c.byDepartment)} resolvió tu petición`,
    body: 'Toca para ver la respuesta',
    url: '/dependencias',
    tag: `REQUEST_RESOLVED:${c.requestId}`,
  }),
  ENTERED_BOARD: (c) => ({
    title: `${c.initiativeId} entra en tu tablero`,
    body: `${STAGE_NAMES[c.stageKey]} · ${area(c.department)}`,
    url: boardUrl(c.initiativeId),
    tag: `ENTERED_BOARD:${c.initiativeId}`,
  }),
  INITIATIVE_CREATED: (c) => ({
    title: `Nueva iniciativa en tu tablero · ${c.initiativeId}`,
    body: area(c.department),
    url: boardUrl(c.initiativeId),
    tag: `INITIATIVE_CREATED:${c.initiativeId}`,
  }),
  OVERRIDE: (c) => ({
    title: `⚠️ Avance excepcional en ${c.initiativeId}`,
    body: area(c.department),
    url: boardUrl(c.initiativeId),
    tag: `OVERRIDE:${c.initiativeId}`,
  }),
  BLOCKED: (c) => ({
    title: `⛔ ${c.initiativeId} está parada`,
    body: area(c.department),
    url: boardUrl(c.initiativeId),
    tag: `BLOCKED:${c.initiativeId}`,
  }),
  SLE_AT_RISK: (c) => ({
    title: `⏳ ${c.initiativeId} al ${Math.min(100, Math.floor(c.percent))} % de su SLE`,
    body: STAGE_NAMES[c.stageKey],
    url: boardUrl(c.initiativeId),
    tag: `SLE_AT_RISK:${c.initiativeId}:${c.stageKey}`,
  }),
};

export function buildPushMessage<K extends PushEventKind>(kind: K, ctx: PushMessageContext[K]): PushMessage {
  const template = TEMPLATES[kind] as Template<K>;
  const { title, body, url, tag } = template(ctx);
  return { kind, title, body, url, tag };
}
