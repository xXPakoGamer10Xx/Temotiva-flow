import type { Department, StageKey, UserRole } from '@/domain/enums';
import type { Initiative, SessionContext, User } from '@/domain/types';
import { SEED_CHECKLIST_ITEMS, SEED_STAGES, STAGE_ID_BY_KEY } from '@/domain/workflow';
import { InMemoryDataStore } from '@/server/repositories/in-memory';
import { requirementFor, signoffsFor } from '@/domain/signoffs';

/**
 * Utilidades de prueba: un DataStore real en memoria (sin snapshot en disco) y
 * sesiones simuladas por rol.
 *
 * SEGURIDAD.md §4.2.5: estas sesiones existen SOLO para ejercitar reglas puras.
 * Jamás son un mecanismo de acceso a la aplicación.
 */

export const TEST_NOW = new Date('2026-09-21T12:00:00.000Z');

export const HOUR = 60 * 60 * 1000;

export function hoursBefore(hours: number, now: Date = TEST_NOW): string {
  return new Date(now.getTime() - hours * HOUR).toISOString();
}

let userSequence = 0;

export function makeUser(overrides: Partial<User> = {}): User {
  userSequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(userSequence).padStart(12, '0')}`,
    name: `Persona ${userSequence}`,
    email: `persona${userSequence}@ejemplo.com`,
    departments: ['PRODUCT'],
    role: 'MEMBER',
    isActive: true,
    isAnonymized: false,
    createdAt: hoursBefore(1000),
    ...overrides,
  };
}

export function sessionOf(user: User): SessionContext {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    departments: user.departments,
    role: user.role,
  };
}

export function makeSession(departments: Department | Department[], role: UserRole): SessionContext {
  const list = Array.isArray(departments) ? departments : [departments];
  return sessionOf(makeUser({ departments: list, role }));
}

export function makeInitiative(overrides: Partial<Initiative> = {}): Initiative {
  return {
    id: 'TEMO-500',
    title: 'Iniciativa de prueba con título suficiente',
    description: 'Descripción de prueba.',
    priority: 'NORMAL',
    priorityReason: 'ROADMAP',
    currentStageId: STAGE_ID_BY_KEY.FEASIBILITY,
    ownerDepartment: 'LEGAL',
    currentAssigneeId: null,
    createdBy: '00000000-0000-4000-8000-000000000000',
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 0,
    currentTask: null,
    links: [],
    isArchived: false,
    skippedStageIds: [],
    stageEnteredAt: hoursBefore(10),
    createdAt: hoursBefore(100),
    updatedAt: hoursBefore(10),
    ...overrides,
  };
}

export interface TestContext {
  store: InMemoryDataStore;
  users: Record<string, User>;
}

/**
 * Store con las 7 fases y sus compuertas reales, las personas indicadas y las
 * iniciativas que pida cada prueba. Sin dependencias ni log previos.
 */
export function makeTestStore(initiatives: Initiative[] = [makeInitiative()], users: User[] = []): TestContext {
  const store = new InMemoryDataStore({
    users,
    stages: SEED_STAGES.map((stage) => ({ ...stage })),
    checklistItems: SEED_CHECKLIST_ITEMS.map((item) => ({ ...item })),
    initiatives,
    checklistValues: [],
    dependencies: [],
    activityLog: [],
  });

  return {
    store,
    users: Object.fromEntries(users.map((user) => [user.id, user])),
  };
}

/**
 * Cierra la compuerta de la fase indicada: registra todas las aprobaciones de
 * área de la matriz (con su requisito extra cumplido) y marca la guía.
 * La iniciativa tiene que estar en esa fase.
 */
export async function completeGate(
  store: InMemoryDataStore,
  initiativeId: string,
  stageKey: StageKey,
  completedBy: string,
): Promise<void> {
  const items = await store.listChecklistItems(STAGE_ID_BY_KEY[stageKey]);
  for (const item of items) {
    await store.upsertChecklistValue({
      initiativeId,
      checklistId: item.id,
      isCompleted: true,
      completedBy,
      completedAt: hoursBefore(1),
    });
  }
  for (const { department } of signoffsFor(stageKey)) {
    await approveSignoff(store, initiativeId, stageKey, department, completedBy);
  }
}

/** Registra una aprobación de área válida (sin pasar por el servicio ni el RBAC). */
export async function approveSignoff(
  store: InMemoryDataStore,
  initiativeId: string,
  stageKey: StageKey,
  department: Department,
  approvedBy: string,
): Promise<void> {
  const requirement = requirementFor(stageKey, department);
  const stored = await store.upsertStageSignoff(
    {
      initiativeId,
      stageId: STAGE_ID_BY_KEY[stageKey],
      department,
      isApproved: true,
      approvedBy,
      approvedAt: hoursBefore(1),
      note: null,
      noObservations: requirement === 'NOTE_OR_NO_OBSERVATIONS',
      tshirtSize: requirement === 'TSHIRT' ? 'M' : null,
      updatedAt: hoursBefore(1),
    },
    { expectedStageId: STAGE_ID_BY_KEY[stageKey] },
  );
  if (!stored) throw new Error(`La iniciativa ${initiativeId} no está abierta en ${stageKey}`);
}

/** Nota de avance válida para las pruebas que no se centran en ella. */
export const TEST_ADVANCE_NOTE = 'Fase cerrada: entregables revisados y aprobados por las áreas.';
