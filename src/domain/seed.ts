import type {
  ActivityLogEntry,
  ChecklistValue,
  Dependency,
  Initiative,
  StageChecklistItem,
  User,
  WorkflowStage,
} from './types';
import { SEED_CHECKLIST_ITEMS, SEED_STAGES, STAGE_ID_BY_KEY, checklistItemId } from './workflow';
import type { StageKey, StopReason } from './enums';

/**
 * Estado inicial del sistema: personas ficticias y 9 iniciativas activas (mas
 * una archivada) repartidas por las 7 fases, con dependencias abiertas,
 * paradas vigentes, un avance excepcional ya registrado y su caja negra.
 *
 * SEGURIDAD.md §9.4: datos de demostracion estrictamente ficticios. Ningun
 * dato real de empleados, clientes ni pacientes.
 *
 * Los instantes se calculan relativos a `now` para que los relojes de SLE
 * esten vivos en cualquier momento en que se arranque la aplicacion.
 */

export interface SeedData {
  users: User[];
  stages: WorkflowStage[];
  checklistItems: StageChecklistItem[];
  initiatives: Initiative[];
  checklistValues: ChecklistValue[];
  dependencies: Dependency[];
  activityLog: ActivityLogEntry[];
}

/** Claves legibles de los usuarios semilla; sus `id` son UUID como exige el DDL. */
export const SEED_USER_IDS = {
  clara: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0101',
  nuria: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0102',
  bruno: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0103',
  ana: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0201',
  marc: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0202',
  rosa: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0301',
  diego: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0401',
  irene: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0402',
  victor: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0501',
  sonia: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0502',
  hugo: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0503',
  lidia: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0601',
  oscar: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0701',
  marta: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0801',
  beatriz: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0901',
  jorge: '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0902',
} as const;

const ORG_CREATED_AT = '2026-01-05T09:00:00.000Z';

function seedUsers(): User[] {
  return [
    {
      id: SEED_USER_IDS.marta,
      name: 'Marta Coll',
      email: 'marta.coll@temotiva.com',
      // La CEO participa en el comité transversal por Producto y por RRHH.
      departments: ['PRODUCT', 'HR'],
      role: 'EXECUTIVE',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.victor,
      name: 'Víctor Pardo',
      email: 'victor.pardo@temotiva.com',
      departments: ['TECH', 'CYBER'],
      role: 'EXECUTIVE',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.clara,
      name: 'Clara Osorio',
      email: 'clara.osorio@temotiva.com',
      departments: ['PRODUCT'],
      role: 'LEAD',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.nuria,
      name: 'Nuria Vela',
      email: 'nuria.vela@temotiva.com',
      departments: ['PRODUCT'],
      role: 'MEMBER',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.bruno,
      name: 'Bruno Aguado',
      email: 'bruno.aguado@temotiva.com',
      departments: ['PRODUCT'],
      role: 'MEMBER',
      isActive: false,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.ana,
      name: 'Ana Belmonte',
      email: 'ana.belmonte@temotiva.com',
      departments: ['PSYCHOLOGY'],
      role: 'LEAD',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.marc,
      name: 'Marc Ferrer',
      email: 'marc.ferrer@temotiva.com',
      departments: ['PSYCHOLOGY'],
      role: 'MEMBER',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.rosa,
      name: 'Rosa Iglesias',
      email: 'rosa.iglesias@temotiva.com',
      departments: ['LEGAL'],
      role: 'LEAD',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.diego,
      name: 'Diego Sanz',
      email: 'diego.sanz@temotiva.com',
      departments: ['DESIGN'],
      role: 'LEAD',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.irene,
      name: 'Irene Cobo',
      email: 'irene.cobo@temotiva.com',
      departments: ['DESIGN'],
      role: 'MEMBER',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.sonia,
      name: 'Sonia Regueiro',
      email: 'sonia.regueiro@temotiva.com',
      departments: ['TECH'],
      role: 'LEAD',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.hugo,
      name: 'Hugo Nieves',
      email: 'hugo.nieves@temotiva.com',
      departments: ['TECH'],
      role: 'MEMBER',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.lidia,
      name: 'Lidia Franco',
      email: 'lidia.franco@temotiva.com',
      departments: ['QA'],
      role: 'LEAD',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.beatriz,
      name: 'Beatriz Lorenzo',
      email: 'beatriz.lorenzo@temotiva.com',
      // Caso de responsable multi-área: lleva RRHH y Finanzas a la vez.
      departments: ['HR', 'FINANCE'],
      role: 'LEAD',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.jorge,
      name: 'Jorge Ibáñez',
      email: 'jorge.ibanez@temotiva.com',
      departments: ['MARKETING'],
      role: 'MEMBER',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
    {
      id: SEED_USER_IDS.oscar,
      name: 'Óscar Duarte',
      email: 'oscar.duarte@temotiva.com',
      departments: ['CYBER'],
      role: 'LEAD',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    },
  ];

  const initialAdmin = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (initialAdmin && !users.some((u) => u.email.toLowerCase() === initialAdmin)) {
    users.unshift({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Administración',
      email: initialAdmin,
      departments: [
        'PRODUCT',
        'PSYCHOLOGY',
        'LEGAL',
        'DESIGN',
        'TECH',
        'QA',
        'CYBER',
        'HR',
        'FINANCE',
        'MARKETING',
      ],
      role: 'EXECUTIVE',
      isActive: true,
      isAnonymized: false,
      createdAt: ORG_CREATED_AT,
    });
  }

  return users;
}

const HOUR_MS = 60 * 60 * 1000;

export function buildSeedData(now: Date = new Date()): SeedData {
  const base = now.getTime();
  const hoursAgo = (hours: number): string => new Date(base - hours * HOUR_MS).toISOString();

  let logSequence = 0;
  const activityLog: ActivityLogEntry[] = [];

  const log = (entry: Omit<ActivityLogEntry, 'id'>): void => {
    logSequence += 1;
    activityLog.push({ ...entry, id: `LOG-${String(logSequence).padStart(4, '0')}` });
  };

  /** Registra la cadena de transiciones que llevo a una iniciativa hasta su fase actual. */
  const logHistory = (
    initiativeId: string,
    userId: string,
    createdHoursAgo: number,
    transitions: { from: StageKey; to: StageKey; atHoursAgo: number; durationHours: number; blockedHours?: number }[],
  ): void => {
    log({
      initiativeId,
      userId,
      actionType: 'INITIATIVE_CREATED',
      fromStageId: null,
      toStageId: STAGE_ID_BY_KEY.IDEATION,
      fieldName: null,
      oldValue: null,
      newValue: null,
      overrideMetadata: null,
      createdAt: hoursAgo(createdHoursAgo),
    });

    for (const transition of transitions) {
      const blockedHours = transition.blockedHours ?? 0;
      log({
        initiativeId,
        userId,
        actionType: 'STAGE_TRANSITION',
        fromStageId: STAGE_ID_BY_KEY[transition.from],
        toStageId: STAGE_ID_BY_KEY[transition.to],
        fieldName: 'current_stage_id',
        oldValue: { stageKey: transition.from },
        newValue: {
          stageKey: transition.to,
          durationMs: transition.durationHours * HOUR_MS,
          blockedMs: blockedHours * HOUR_MS,
          netDurationMs: (transition.durationHours - blockedHours) * HOUR_MS,
        },
        overrideMetadata: null,
        createdAt: hoursAgo(transition.atHoursAgo),
      });
    }
  };

  const initiatives: Initiative[] = [];
  const checklistValues: ChecklistValue[] = [];
  const dependencies: Dependency[] = [];

  /** Paradas ya cerradas, para que el panel de dirección tenga historia real. */
  const logPastStops = (
    initiativeId: string,
    userId: string,
    stops: { reason: StopReason; fromHoursAgo: number; toHoursAgo: number; description: string }[],
  ): void => {
    for (const stop of stops) {
      log({
        initiativeId,
        userId,
        actionType: 'BLOCKED_SET',
        fromStageId: null,
        toStageId: null,
        fieldName: 'is_blocked',
        oldValue: { isBlocked: false },
        newValue: { isBlocked: true, stopReason: stop.reason, description: stop.description },
        overrideMetadata: null,
        createdAt: hoursAgo(stop.fromHoursAgo),
      });
      log({
        initiativeId,
        userId,
        actionType: 'BLOCKED_CLEARED',
        fromStageId: null,
        toStageId: null,
        fieldName: 'is_blocked',
        oldValue: { isBlocked: true, stopReason: stop.reason },
        newValue: {
          isBlocked: false,
          blockedMsInStage: (stop.fromHoursAgo - stop.toHoursAgo) * HOUR_MS,
          automatic: false,
        },
        overrideMetadata: null,
        createdAt: hoursAgo(stop.toHoursAgo),
      });
    }
  };

  /** Marca como completados los primeros `count` items de la compuerta de una fase. */
  const completeChecklist = (
    initiativeId: string,
    stageKey: StageKey,
    completed: { orderIndex: number; by: string; hoursAgo: number }[],
  ): void => {
    const items = SEED_CHECKLIST_ITEMS.filter((item) => item.stageId === STAGE_ID_BY_KEY[stageKey]);
    for (const item of items) {
      const done = completed.find((entry) => checklistItemId(stageKey, entry.orderIndex) === item.id);
      checklistValues.push({
        initiativeId,
        checklistId: item.id,
        isCompleted: Boolean(done),
        completedBy: done ? done.by : null,
        completedAt: done ? hoursAgo(done.hoursAgo) : null,
      });
      if (done) {
        log({
          initiativeId,
          userId: done.by,
          actionType: 'CHECKLIST_UPDATED',
          fromStageId: null,
          toStageId: null,
          fieldName: 'is_completed',
          oldValue: { checklistId: item.id, isCompleted: false },
          newValue: { checklistId: item.id, isCompleted: true, label: item.label },
          overrideMetadata: null,
          createdAt: hoursAgo(done.hoursAgo),
        });
      }
    }
  };

  // ---------------------------------------------------------------------------
  // TEMO-90 — archivada (ciclo cerrado, se conserva para la caja negra)
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-90',
    title: 'Rediseño del onboarding emocional v1',
    description:
      'Primera versión del onboarding con escala de estado de ánimo y consentimiento explícito de datos de salud.',
    priority: 'NORMAL',
    priorityReason: 'ROADMAP',
    currentStageId: STAGE_ID_BY_KEY.PROD,
    ownerDepartment: 'TECH',
    currentAssigneeId: SEED_USER_IDS.hugo,
    createdBy: SEED_USER_IDS.clara,
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 0,
    currentTask: 'Cerrada y archivada tras 30 días en producción',
    links: [{ kind: 'NOTION', label: 'Retrospectiva', url: 'https://notion.so/temotiva/onboarding-v1' }],
    isArchived: true,
    stageEnteredAt: hoursAgo(760),
    createdAt: hoursAgo(1600),
    updatedAt: hoursAgo(700),
  });
  completeChecklist('TEMO-90', 'PROD', [
    { orderIndex: 1, by: SEED_USER_IDS.hugo, hoursAgo: 758 },
    { orderIndex: 2, by: SEED_USER_IDS.sonia, hoursAgo: 756 },
    { orderIndex: 3, by: SEED_USER_IDS.sonia, hoursAgo: 754 },
    { orderIndex: 4, by: SEED_USER_IDS.clara, hoursAgo: 750 },
  ]);
  logHistory('TEMO-90', SEED_USER_IDS.clara, 1600, [
    { from: 'IDEATION', to: 'FEASIBILITY', atHoursAgo: 1450, durationHours: 150 },
    { from: 'FEASIBILITY', to: 'CO_DESIGN', atHoursAgo: 1400, durationHours: 50 },
    { from: 'CO_DESIGN', to: 'READY', atHoursAgo: 1280, durationHours: 120 },
    { from: 'READY', to: 'DEV', atHoursAgo: 1210, durationHours: 70 },
    { from: 'DEV', to: 'QA', atHoursAgo: 900, durationHours: 310, blockedHours: 40 },
    { from: 'QA', to: 'PROD', atHoursAgo: 760, durationHours: 100, blockedHours: 60 },
  ]);
  logPastStops('TEMO-90', SEED_USER_IDS.hugo, [
    {
      reason: 'BLOQUEO_TECNICO',
      fromHoursAgo: 1000,
      toHoursAgo: 960,
      description: 'Pipeline de despliegue roto tras el cambio de proveedor de CI.',
    },
    {
      reason: 'ESPERANDO_VALIDACION',
      fromHoursAgo: 860,
      toHoursAgo: 800,
      description: 'Pendiente de la firma clínica del copy de bienvenida.',
    },
  ]);
  log({
    initiativeId: 'TEMO-90',
    userId: SEED_USER_IDS.clara,
    actionType: 'INITIATIVE_ARCHIVED',
    fromStageId: null,
    toStageId: null,
    fieldName: 'is_archived',
    oldValue: { isArchived: false },
    newValue: { isArchived: true, reason: 'Ciclo cerrado tras 30 días estable en producción' },
    overrideMetadata: null,
    createdAt: hoursAgo(700),
  });

  // ---------------------------------------------------------------------------
  // TEMO-96 — Producción
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-96',
    title: 'Cifrado en reposo del diario emocional',
    description:
      'Cifrado por tenant de las entradas de journaling y rotación de claves gestionada desde el KMS corporativo.',
    priority: 'HIGH',
    priorityReason: 'SECURITY_INCIDENT',
    currentStageId: STAGE_ID_BY_KEY.PROD,
    ownerDepartment: 'TECH',
    currentAssigneeId: SEED_USER_IDS.sonia,
    createdBy: SEED_USER_IDS.oscar,
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 0,
    currentTask: 'Verificación de sanidad en vivo',
    links: [
      { kind: 'REPO', label: 'temotiva/api', url: 'https://github.com/temotiva/api/pull/482' },
      { kind: 'NOTION', label: 'Plan de rotación de claves', url: 'https://notion.so/temotiva/kms-rotation' },
    ],
    isArchived: false,
    stageEnteredAt: hoursAgo(14),
    createdAt: hoursAgo(980),
    updatedAt: hoursAgo(6),
  });
  completeChecklist('TEMO-96', 'PROD', [
    { orderIndex: 1, by: SEED_USER_IDS.sonia, hoursAgo: 13 },
    { orderIndex: 3, by: SEED_USER_IDS.hugo, hoursAgo: 9 },
  ]);
  logHistory('TEMO-96', SEED_USER_IDS.oscar, 980, [
    { from: 'IDEATION', to: 'FEASIBILITY', atHoursAgo: 880, durationHours: 100 },
    { from: 'FEASIBILITY', to: 'CO_DESIGN', atHoursAgo: 840, durationHours: 40 },
    { from: 'CO_DESIGN', to: 'READY', atHoursAgo: 720, durationHours: 120 },
    { from: 'READY', to: 'DEV', atHoursAgo: 660, durationHours: 60 },
    { from: 'DEV', to: 'QA', atHoursAgo: 120, durationHours: 540, blockedHours: 96 },
    { from: 'QA', to: 'PROD', atHoursAgo: 14, durationHours: 70, blockedHours: 24 },
  ]);

  logPastStops('TEMO-96', SEED_USER_IDS.sonia, [
    {
      reason: 'FALTA_CAPACIDAD',
      fromHoursAgo: 420,
      toHoursAgo: 330,
      description: 'Sin capacidad en el equipo de backend hasta cerrar el sprint anterior.',
    },
    {
      reason: 'EXTERNO',
      fromHoursAgo: 60,
      toHoursAgo: 36,
      description: 'Esperando la ventana de mantenimiento del proveedor de KMS.',
    },
  ]);

  // ---------------------------------------------------------------------------
  // TEMO-98 — Desarrollo, dependencia NO bloqueante (avanzando en paralelo)
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-98',
    title: 'Colas asíncronas para el diario emocional',
    description:
      'Procesamiento en segundo plano de las entradas de journaling y de los resúmenes semanales del asistente.',
    priority: 'NORMAL',
    priorityReason: 'ROADMAP',
    currentStageId: STAGE_ID_BY_KEY.DEV,
    ownerDepartment: 'TECH',
    currentAssigneeId: SEED_USER_IDS.hugo,
    createdBy: SEED_USER_IDS.sonia,
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 18 * HOUR_MS,
    currentTask: 'Setup de colas BullMQ',
    links: [{ kind: 'REPO', label: 'temotiva/api', url: 'https://github.com/temotiva/api/pull/501' }],
    isArchived: false,
    stageEnteredAt: hoursAgo(186),
    createdAt: hoursAgo(700),
    updatedAt: hoursAgo(20),
  });
  completeChecklist('TEMO-98', 'DEV', [
    { orderIndex: 1, by: SEED_USER_IDS.sonia, hoursAgo: 60 },
    { orderIndex: 2, by: SEED_USER_IDS.hugo, hoursAgo: 40 },
  ]);
  logHistory('TEMO-98', SEED_USER_IDS.sonia, 700, [
    { from: 'IDEATION', to: 'FEASIBILITY', atHoursAgo: 560, durationHours: 140 },
    { from: 'FEASIBILITY', to: 'CO_DESIGN', atHoursAgo: 500, durationHours: 60 },
    { from: 'CO_DESIGN', to: 'READY', atHoursAgo: 330, durationHours: 170 },
    { from: 'READY', to: 'DEV', atHoursAgo: 186, durationHours: 100, blockedHours: 30 },
  ]);
  dependencies.push({
    id: 'DEP-0001',
    initiativeId: 'TEMO-98',
    requestedBy: SEED_USER_IDS.hugo,
    targetDepartment: 'QA',
    helpType: 'RESOURCE',
    isBlocking: false,
    description: 'Necesitamos un entorno de staging con Redis dedicado para validar los reintentos de la cola.',
    checklistItemId: null,
    status: 'PENDING',
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: hoursAgo(30),
    resolvedAt: null,
  });
  log({
    initiativeId: 'TEMO-98',
    userId: SEED_USER_IDS.hugo,
    actionType: 'DEPENDENCY_CREATED',
    fromStageId: null,
    toStageId: null,
    fieldName: null,
    oldValue: null,
    newValue: { dependencyId: 'DEP-0001', targetDepartment: 'QA', helpType: 'RESOURCE', isBlocking: false },
    overrideMetadata: null,
    createdAt: hoursAgo(30),
  });

  logPastStops('TEMO-98', SEED_USER_IDS.hugo, [
    {
      reason: 'BLOQUEO_TECNICO',
      fromHoursAgo: 150,
      toHoursAgo: 132,
      description: 'Incompatibilidad de la librería de colas con la versión de Node del runtime.',
    },
  ]);

  // ---------------------------------------------------------------------------
  // TEMO-101 — Ready (DoR)
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-101',
    title: 'Medición de clima emocional B2B con privacidad diferencial',
    description:
      'Panel agregado de clima emocional para organizaciones cliente, sin posibilidad de reidentificar a personas empleadas.',
    priority: 'HIGH',
    priorityReason: 'B2B_CLIENT',
    currentStageId: STAGE_ID_BY_KEY.READY,
    ownerDepartment: 'PRODUCT',
    currentAssigneeId: SEED_USER_IDS.clara,
    createdBy: SEED_USER_IDS.marta,
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 0,
    currentTask: 'Cierre del contrato de API y criterios de aceptación',
    links: [
      { kind: 'FIGMA', label: 'Panel de clima emocional', url: 'https://figma.com/file/temotiva/clima-b2b' },
      { kind: 'NOTION', label: 'Concept Brief', url: 'https://notion.so/temotiva/clima-b2b-brief' },
    ],
    isArchived: false,
    stageEnteredAt: hoursAgo(58),
    createdAt: hoursAgo(520),
    updatedAt: hoursAgo(5),
  });
  completeChecklist('TEMO-101', 'READY', [
    { orderIndex: 1, by: SEED_USER_IDS.sonia, hoursAgo: 40 },
    { orderIndex: 2, by: SEED_USER_IDS.lidia, hoursAgo: 28 },
    { orderIndex: 5, by: SEED_USER_IDS.clara, hoursAgo: 12 },
  ]);
  logHistory('TEMO-101', SEED_USER_IDS.marta, 520, [
    { from: 'IDEATION', to: 'FEASIBILITY', atHoursAgo: 400, durationHours: 120 },
    { from: 'FEASIBILITY', to: 'CO_DESIGN', atHoursAgo: 330, durationHours: 70, blockedHours: 20 },
    { from: 'CO_DESIGN', to: 'READY', atHoursAgo: 58, durationHours: 272, blockedHours: 48 },
  ]);
  dependencies.push({
    id: 'DEP-0002',
    initiativeId: 'TEMO-101',
    requestedBy: SEED_USER_IDS.clara,
    targetDepartment: 'LEGAL',
    helpType: 'VALIDATION',
    isBlocking: false,
    description:
      'Validar que el umbral mínimo de 12 personas por agregado es suficiente para descartar reidentificación.',
    checklistItemId: null,
    status: 'RESOLVED',
    resolutionNotes: 'Conforme con umbral de 12 y ruido laplaciano. Debe constar en el registro de tratamientos.',
    resolvedBy: SEED_USER_IDS.rosa,
    createdAt: hoursAgo(52),
    resolvedAt: hoursAgo(26),
  });
  log({
    initiativeId: 'TEMO-101',
    userId: SEED_USER_IDS.clara,
    actionType: 'DEPENDENCY_CREATED',
    fromStageId: null,
    toStageId: null,
    fieldName: null,
    oldValue: null,
    newValue: { dependencyId: 'DEP-0002', targetDepartment: 'LEGAL', helpType: 'VALIDATION', isBlocking: false },
    overrideMetadata: null,
    createdAt: hoursAgo(52),
  });
  log({
    initiativeId: 'TEMO-101',
    userId: SEED_USER_IDS.rosa,
    actionType: 'DEPENDENCY_RESOLVED',
    fromStageId: null,
    toStageId: null,
    fieldName: null,
    oldValue: { status: 'PENDING' },
    newValue: { dependencyId: 'DEP-0002', status: 'RESOLVED' },
    overrideMetadata: null,
    createdAt: hoursAgo(26),
  });

  logPastStops('TEMO-101', SEED_USER_IDS.clara, [
    {
      reason: 'ESPERANDO_VALIDACION',
      fromHoursAgo: 340,
      toHoursAgo: 292,
      description: 'Pendiente del dictamen de privacidad sobre el umbral de agregación.',
    },
  ]);

  // ---------------------------------------------------------------------------
  // TEMO-104 — Co-Diseño, PARADA por decisión de Producto + 2 dependencias
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-104',
    title: 'Protocolo SOS de relajación somática nocturna',
    description:
      'Protocolo guiado de respiración y anclaje corporal para picos de ansiedad nocturnos, con derivación a recursos de crisis.',
    priority: 'HIGH',
    priorityReason: 'B2B_CLIENT',
    currentStageId: STAGE_ID_BY_KEY.CO_DESIGN,
    ownerDepartment: 'DESIGN',
    currentAssigneeId: SEED_USER_IDS.irene,
    createdBy: SEED_USER_IDS.ana,
    isBlocked: true,
    stopReason: 'ESPERANDO_DECISION',
    blockedDescription: 'Producto debe decidir si el protocolo se ofrece también en la versión gratuita.',
    // Parada inducida por la dependencia bloqueante DEP-0005, no declarada a mano.
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: hoursAgo(19),
    blockedStartedAt: hoursAgo(19),
    blockedMsInStage: 6 * HOUR_MS,
    currentTask: 'Wireframes del onboarding del protocolo',
    links: [{ kind: 'FIGMA', label: 'Protocolo SOS · prototipo', url: 'https://figma.com/file/temotiva/sos-somatico' }],
    isArchived: false,
    stageEnteredAt: hoursAgo(96),
    createdAt: hoursAgo(430),
    updatedAt: hoursAgo(19),
  });
  completeChecklist('TEMO-104', 'CO_DESIGN', [
    { orderIndex: 1, by: SEED_USER_IDS.irene, hoursAgo: 60 },
    { orderIndex: 4, by: SEED_USER_IDS.diego, hoursAgo: 34 },
  ]);
  logHistory('TEMO-104', SEED_USER_IDS.ana, 430, [
    { from: 'IDEATION', to: 'FEASIBILITY', atHoursAgo: 260, durationHours: 170 },
    { from: 'FEASIBILITY', to: 'CO_DESIGN', atHoursAgo: 96, durationHours: 164, blockedHours: 30 },
  ]);
  dependencies.push({
    id: 'DEP-0003',
    initiativeId: 'TEMO-104',
    requestedBy: SEED_USER_IDS.irene,
    targetDepartment: 'LEGAL',
    helpType: 'VALIDATION',
    isBlocking: false,
    description: 'Validación del Art. 9 sobre el registro de episodios de ansiedad nocturna.',
    checklistItemId: null,
    status: 'PENDING',
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: hoursAgo(44),
    resolvedAt: null,
  });
  dependencies.push({
    id: 'DEP-0004',
    initiativeId: 'TEMO-104',
    requestedBy: SEED_USER_IDS.irene,
    targetDepartment: 'PSYCHOLOGY',
    helpType: 'INFORMATION',
    isBlocking: false,
    description: 'Copy definitivo de bienvenida y del cierre del protocolo (sin textos provisionales).',
    checklistItemId: null,
    status: 'PENDING',
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: hoursAgo(41),
    resolvedAt: null,
  });
  dependencies.push({
    id: 'DEP-0005',
    initiativeId: 'TEMO-104',
    requestedBy: SEED_USER_IDS.diego,
    targetDepartment: 'PRODUCT',
    helpType: 'DECISION',
    isBlocking: true,
    description: '¿El protocolo SOS entra en el plan gratuito o queda reservado al plan B2B?',
    checklistItemId: null,
    status: 'PENDING',
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: hoursAgo(19),
    resolvedAt: null,
  });
  for (const [dependencyId, hours, target, helpType, blocking] of [
    ['DEP-0003', 44, 'LEGAL', 'VALIDATION', false],
    ['DEP-0004', 41, 'PSYCHOLOGY', 'INFORMATION', false],
    ['DEP-0005', 19, 'PRODUCT', 'DECISION', true],
  ] as const) {
    log({
      initiativeId: 'TEMO-104',
      userId: SEED_USER_IDS.irene,
      actionType: 'DEPENDENCY_CREATED',
      fromStageId: null,
      toStageId: null,
      fieldName: null,
      oldValue: null,
      newValue: { dependencyId, targetDepartment: target, helpType, isBlocking: blocking },
      overrideMetadata: null,
      createdAt: hoursAgo(hours),
    });
  }
  log({
    initiativeId: 'TEMO-104',
    userId: SEED_USER_IDS.diego,
    actionType: 'BLOCKED_SET',
    fromStageId: null,
    toStageId: null,
    fieldName: 'is_blocked',
    oldValue: { isBlocked: false },
    newValue: {
      isBlocked: true,
      stopReason: 'ESPERANDO_DECISION',
      description: 'Producto debe decidir si el protocolo se ofrece también en la versión gratuita.',
    },
    overrideMetadata: null,
    createdAt: hoursAgo(19),
  });

  // ---------------------------------------------------------------------------
  // TEMO-107 — QA, con avance excepcional registrado en su historial
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-107',
    title: 'Consentimiento granular de datos de salud (Art. 9)',
    description:
      'Separación del consentimiento de tratamiento clínico, analítica agregada y entrenamiento de modelos, revocable en un toque.',
    priority: 'CRITICAL',
    priorityReason: 'REGULATORY_RISK',
    currentStageId: STAGE_ID_BY_KEY.QA,
    ownerDepartment: 'QA',
    currentAssigneeId: SEED_USER_IDS.lidia,
    createdBy: SEED_USER_IDS.rosa,
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 4 * HOUR_MS,
    currentTask: 'Regresión E2E sobre los cuatro estados de consentimiento',
    links: [
      { kind: 'NOTION', label: 'Dictamen DPO', url: 'https://notion.so/temotiva/consentimiento-art9' },
      { kind: 'REPO', label: 'temotiva/app', url: 'https://github.com/temotiva/app/pull/377' },
    ],
    isArchived: false,
    stageEnteredAt: hoursAgo(41),
    createdAt: hoursAgo(600),
    updatedAt: hoursAgo(3),
  });
  completeChecklist('TEMO-107', 'QA', [
    { orderIndex: 1, by: SEED_USER_IDS.lidia, hoursAgo: 20 },
    { orderIndex: 3, by: SEED_USER_IDS.oscar, hoursAgo: 8 },
  ]);
  logHistory('TEMO-107', SEED_USER_IDS.rosa, 600, [
    { from: 'IDEATION', to: 'FEASIBILITY', atHoursAgo: 520, durationHours: 80 },
    { from: 'FEASIBILITY', to: 'CO_DESIGN', atHoursAgo: 430, durationHours: 90, blockedHours: 12 },
    { from: 'CO_DESIGN', to: 'READY', atHoursAgo: 300, durationHours: 130 },
    { from: 'READY', to: 'DEV', atHoursAgo: 240, durationHours: 60 },
    { from: 'DEV', to: 'QA', atHoursAgo: 41, durationHours: 199, blockedHours: 36 },
  ]);
  log({
    initiativeId: 'TEMO-107',
    userId: SEED_USER_IDS.victor,
    actionType: 'EXCEPTION_OVERRIDE',
    fromStageId: STAGE_ID_BY_KEY.DEV,
    toStageId: STAGE_ID_BY_KEY.QA,
    fieldName: 'current_stage_id',
    oldValue: { stageKey: 'DEV' },
    newValue: { stageKey: 'QA' },
    overrideMetadata: {
      reason:
        'El cliente piloto B2B necesita el consentimiento granular en staging antes del comité del viernes; el backend queda congelado.',
      riskAccepted:
        'Posible retrabajo de la pantalla de revocación si Ciberseguridad exige doble confirmación en el borrado.',
      authorizedBy: 'Víctor Pardo',
      authorizedByEmail: 'victor.pardo@temotiva.com',
      authorizedByRole: 'EXECUTIVE',
      pendingItems: [
        {
          id: checklistItemId('DEV', 4),
          label: 'Sin secretos ni PII/PHI en logs',
          responsibleDepartment: 'CYBER',
        },
      ],
      signature: 'CONFIRMAR EXCEPCION',
      ip: '10.20.0.14',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    },
    createdAt: hoursAgo(41),
  });

  logPastStops('TEMO-107', SEED_USER_IDS.lidia, [
    {
      reason: 'ESPERANDO_DECISION',
      fromHoursAgo: 260,
      toHoursAgo: 224,
      description: 'Dirección debía decidir si la revocación borra también los agregados.',
    },
    {
      reason: 'ESPERANDO_VALIDACION',
      fromHoursAgo: 120,
      toHoursAgo: 96,
      description: 'Ciberseguridad revisando las trazas antes de exponer a QA.',
    },
  ]);

  // ---------------------------------------------------------------------------
  // TEMO-109 — Viabilidad, SLE excedido
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-109',
    title: 'Clasificación MDR del acompañante conversacional',
    description:
      'Determinar si el acompañante conversacional se mantiene como producto de bienestar o entra en el ámbito MDR/SaMD.',
    priority: 'CRITICAL',
    priorityReason: 'REGULATORY_RISK',
    currentStageId: STAGE_ID_BY_KEY.FEASIBILITY,
    ownerDepartment: 'LEGAL',
    currentAssigneeId: SEED_USER_IDS.rosa,
    createdBy: SEED_USER_IDS.marta,
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 0,
    currentTask: 'Dictamen MDR',
    links: [{ kind: 'NOTION', label: 'Expediente regulatorio', url: 'https://notion.so/temotiva/mdr-samd' }],
    isArchived: false,
    stageEnteredAt: hoursAgo(63),
    createdAt: hoursAgo(210),
    updatedAt: hoursAgo(10),
  });
  completeChecklist('TEMO-109', 'FEASIBILITY', [{ orderIndex: 3, by: SEED_USER_IDS.sonia, hoursAgo: 30 }]);
  logHistory('TEMO-109', SEED_USER_IDS.marta, 210, [
    { from: 'IDEATION', to: 'FEASIBILITY', atHoursAgo: 63, durationHours: 147 },
  ]);

  // ---------------------------------------------------------------------------
  // TEMO-112 — Viabilidad, PARADA por dependencia bloqueante a Tech
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-112',
    title: 'Portabilidad y exportación de datos del usuario',
    description:
      'Exportación completa de journaling, escalas y consentimientos en formato legible por máquina, bajo derecho de portabilidad.',
    priority: 'NORMAL',
    priorityReason: 'REGULATORY_RISK',
    currentStageId: STAGE_ID_BY_KEY.FEASIBILITY,
    ownerDepartment: 'LEGAL',
    currentAssigneeId: null,
    createdBy: SEED_USER_IDS.rosa,
    isBlocked: true,
    stopReason: 'ESPERANDO_INFORMACION',
    blockedDescription: 'Sin el inventario de tablas con datos personales no se puede cerrar el alcance de la exportación.',
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: hoursAgo(27),
    blockedStartedAt: hoursAgo(27),
    blockedMsInStage: 0,
    currentTask: 'Alcance del expediente de portabilidad',
    links: [],
    isArchived: false,
    stageEnteredAt: hoursAgo(34),
    createdAt: hoursAgo(150),
    updatedAt: hoursAgo(27),
  });
  completeChecklist('TEMO-112', 'FEASIBILITY', []);
  logHistory('TEMO-112', SEED_USER_IDS.rosa, 150, [
    { from: 'IDEATION', to: 'FEASIBILITY', atHoursAgo: 34, durationHours: 116, blockedHours: 12 },
  ]);
  dependencies.push({
    id: 'DEP-0006',
    initiativeId: 'TEMO-112',
    requestedBy: SEED_USER_IDS.rosa,
    targetDepartment: 'TECH',
    helpType: 'INFORMATION',
    isBlocking: true,
    description: 'Inventario de tablas y campos con datos personales para delimitar el alcance de la exportación.',
    checklistItemId: null,
    status: 'PENDING',
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: hoursAgo(27),
    resolvedAt: null,
  });
  log({
    initiativeId: 'TEMO-112',
    userId: SEED_USER_IDS.rosa,
    actionType: 'DEPENDENCY_CREATED',
    fromStageId: null,
    toStageId: null,
    fieldName: null,
    oldValue: null,
    newValue: { dependencyId: 'DEP-0006', targetDepartment: 'TECH', helpType: 'INFORMATION', isBlocking: true },
    overrideMetadata: null,
    createdAt: hoursAgo(27),
  });
  log({
    initiativeId: 'TEMO-112',
    userId: SEED_USER_IDS.rosa,
    actionType: 'BLOCKED_SET',
    fromStageId: null,
    toStageId: null,
    fieldName: 'is_blocked',
    oldValue: { isBlocked: false },
    newValue: { isBlocked: true, stopReason: 'ESPERANDO_INFORMACION', dependencyId: 'DEP-0006' },
    overrideMetadata: null,
    createdAt: hoursAgo(27),
  });

  // ---------------------------------------------------------------------------
  // TEMO-114 — Ideación
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-114',
    title: 'Journaling guiado con ACT para picos de ansiedad',
    description:
      'Secuencia de journaling estructurado basada en terapia de aceptación y compromiso, activada tras un pico de ansiedad registrado.',
    priority: 'NORMAL',
    priorityReason: 'ROADMAP',
    currentStageId: STAGE_ID_BY_KEY.IDEATION,
    ownerDepartment: 'PRODUCT',
    currentAssigneeId: SEED_USER_IDS.nuria,
    createdBy: SEED_USER_IDS.ana,
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 0,
    currentTask: 'Concept Brief y métrica de impacto',
    links: [{ kind: 'NOTION', label: 'Borrador de brief', url: 'https://notion.so/temotiva/act-journaling' }],
    isArchived: false,
    stageEnteredAt: hoursAgo(50),
    createdAt: hoursAgo(50),
    updatedAt: hoursAgo(9),
  });
  completeChecklist('TEMO-114', 'IDEATION', [
    { orderIndex: 2, by: SEED_USER_IDS.ana, hoursAgo: 20 },
    { orderIndex: 3, by: SEED_USER_IDS.marc, hoursAgo: 14 },
  ]);
  logHistory('TEMO-114', SEED_USER_IDS.ana, 50, []);

  // ---------------------------------------------------------------------------
  // TEMO-115 — Ideación, prioridad crítica por incidencia de seguridad
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-115',
    title: 'Doble factor obligatorio para cuentas de organización',
    description:
      'Segundo factor obligatorio para las personas administradoras de cuentas B2B tras el intento de acceso detectado el mes pasado.',
    priority: 'CRITICAL',
    priorityReason: 'SECURITY_INCIDENT',
    currentStageId: STAGE_ID_BY_KEY.IDEATION,
    ownerDepartment: 'PRODUCT',
    currentAssigneeId: null,
    createdBy: SEED_USER_IDS.oscar,
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 0,
    currentTask: 'Definición del alcance con Ciberseguridad',
    links: [],
    isArchived: false,
    stageEnteredAt: hoursAgo(12),
    createdAt: hoursAgo(12),
    updatedAt: hoursAgo(12),
  });
  completeChecklist('TEMO-115', 'IDEATION', []);
  logHistory('TEMO-115', SEED_USER_IDS.oscar, 12, []);

  // ---------------------------------------------------------------------------
  // TEMO-118 — Co-Diseño
  // ---------------------------------------------------------------------------
  initiatives.push({
    id: 'TEMO-118',
    title: 'Rediseño accesible de la escala de estado de ánimo',
    description:
      'Nueva escala de registro emocional con soporte de lector de pantalla, alto contraste y lenguaje no clínico.',
    priority: 'NORMAL',
    priorityReason: 'INTERNAL_IMPROVEMENT',
    currentStageId: STAGE_ID_BY_KEY.CO_DESIGN,
    ownerDepartment: 'DESIGN',
    currentAssigneeId: SEED_USER_IDS.diego,
    createdBy: SEED_USER_IDS.diego,
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 0,
    currentTask: 'Revisión de contraste y foco con lector de pantalla',
    links: [{ kind: 'FIGMA', label: 'Escala accesible', url: 'https://figma.com/file/temotiva/escala-accesible' }],
    isArchived: false,
    stageEnteredAt: hoursAgo(30),
    createdAt: hoursAgo(320),
    updatedAt: hoursAgo(7),
  });
  completeChecklist('TEMO-118', 'CO_DESIGN', [
    { orderIndex: 1, by: SEED_USER_IDS.diego, hoursAgo: 22 },
    { orderIndex: 2, by: SEED_USER_IDS.marc, hoursAgo: 16 },
    { orderIndex: 3, by: SEED_USER_IDS.ana, hoursAgo: 15 },
    { orderIndex: 4, by: SEED_USER_IDS.diego, hoursAgo: 7 },
  ]);
  logHistory('TEMO-118', SEED_USER_IDS.diego, 320, [
    { from: 'IDEATION', to: 'FEASIBILITY', atHoursAgo: 200, durationHours: 120 },
    { from: 'FEASIBILITY', to: 'CO_DESIGN', atHoursAgo: 30, durationHours: 170, blockedHours: 24 },
  ]);

  activityLog.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    users: seedUsers(),
    stages: SEED_STAGES.map((stage) => ({ ...stage })),
    checklistItems: SEED_CHECKLIST_ITEMS.map((item) => ({ ...item })),
    initiatives,
    checklistValues,
    dependencies,
    activityLog,
  };
}
