import type { Department, HelpStatus, HelpType, PriorityLevel, PriorityReason, StopReason } from '@/domain/enums';
import type {
  ActivityLogEntry,
  Dependency,
  Initiative,
  InitiativeLink,
  OverrideMetadata,
  SessionContext,
  StageChecklistItem,
  User,
  WorkflowStage,
} from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { evaluateGate } from './gate';
import { computeSle, type SleReading } from './sle';
import { notFound } from './errors';

/**
 * Proyecciones de solo lectura que consumen las vistas.
 *
 * El navegador solo recibe estos objetos: nunca entidades mutables del store ni
 * el store mismo (AGENTS.md §4.2). Todo se calcula en el servidor.
 */

export interface PersonView {
  id: string;
  name: string;
  department: Department;
}

export interface DependencyChip {
  id: string;
  department: Department;
  status: HelpStatus;
  helpType: HelpType;
  isBlocking: boolean;
}

export interface OverrideMark {
  reason: string;
  riskAccepted: string;
  authorizedBy: string;
  authorizedByRole: string;
  fromStageName: string;
  toStageName: string;
  pendingLabels: string[];
  createdAt: string;
}

export interface InitiativeCardView {
  id: string;
  title: string;
  description: string;
  priority: PriorityLevel;
  priorityReason: PriorityReason;
  stageId: number;
  stageName: string;
  ownerDepartment: Department;
  assignee: PersonView | null;
  currentTask: string | null;
  links: InitiativeLink[];
  isBlocked: boolean;
  stopReason: StopReason | null;
  blockedDescription: string | null;
  sle: SleReading;
  gate: { completed: number; total: number };
  dependencies: DependencyChip[];
  pendingBlockingCount: number;
  pendingCount: number;
  lastOverride: OverrideMark | null;
  isArchived: boolean;
  updatedAt: string;
}

export interface BoardColumnView {
  stage: WorkflowStage;
  cards: InitiativeCardView[];
  wipCount: number;
  wipLimit: number;
  isSaturated: boolean;
  overBy: number;
  /** Permanencia neta media real de las iniciativas presentes en la columna. */
  averageNetMs: number;
}

function personOf(user: User | undefined): PersonView | null {
  return user ? { id: user.id, name: user.name, department: user.department } : null;
}

function overrideMarkOf(
  entries: ActivityLogEntry[],
  stagesById: Map<number, WorkflowStage>,
): OverrideMark | null {
  const overrides = entries.filter((entry) => entry.actionType === 'EXCEPTION_OVERRIDE');
  const last = overrides.at(-1);
  if (!last?.overrideMetadata) return null;
  const metadata: OverrideMetadata = last.overrideMetadata;
  return {
    reason: metadata.reason,
    riskAccepted: metadata.riskAccepted,
    authorizedBy: metadata.authorizedBy,
    authorizedByRole: metadata.authorizedByRole,
    fromStageName: (last.fromStageId && stagesById.get(last.fromStageId)?.name) || '—',
    toStageName: (last.toStageId && stagesById.get(last.toStageId)?.name) || '—',
    pendingLabels: metadata.pendingItems.map((item) => item.label),
    createdAt: last.createdAt,
  };
}

interface CardContext {
  stagesById: Map<number, WorkflowStage>;
  usersById: Map<string, User>;
  dependenciesByInitiative: Map<string, Dependency[]>;
  logByInitiative: Map<string, ActivityLogEntry[]>;
  gateByInitiative: Map<string, { completed: number; total: number }>;
  now: Date;
}

function buildCard(initiative: Initiative, context: CardContext): InitiativeCardView {
  const stage = context.stagesById.get(initiative.currentStageId);
  const dependencies = context.dependenciesByInitiative.get(initiative.id) ?? [];
  const pending = dependencies.filter((dependency) => dependency.status === 'PENDING');

  return {
    id: initiative.id,
    title: initiative.title,
    description: initiative.description,
    priority: initiative.priority,
    priorityReason: initiative.priorityReason,
    stageId: initiative.currentStageId,
    stageName: stage?.name ?? '—',
    ownerDepartment: initiative.ownerDepartment,
    assignee: personOf(initiative.currentAssigneeId ? context.usersById.get(initiative.currentAssigneeId) : undefined),
    currentTask: initiative.currentTask,
    links: initiative.links,
    isBlocked: initiative.isBlocked,
    stopReason: initiative.stopReason,
    blockedDescription: initiative.blockedDescription,
    sle: computeSle(initiative, stage ?? fallbackStage(initiative.currentStageId), context.now),
    gate: context.gateByInitiative.get(initiative.id) ?? { completed: 0, total: 0 },
    dependencies: dependencies
      .slice()
      .sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING'))
      .map((dependency) => ({
        id: dependency.id,
        department: dependency.targetDepartment,
        status: dependency.status,
        helpType: dependency.helpType,
        isBlocking: dependency.isBlocking,
      })),
    pendingBlockingCount: pending.filter((dependency) => dependency.isBlocking).length,
    pendingCount: pending.length,
    lastOverride: overrideMarkOf(context.logByInitiative.get(initiative.id) ?? [], context.stagesById),
    isArchived: initiative.isArchived,
    updatedAt: initiative.updatedAt,
  };
}

function fallbackStage(id: number): WorkflowStage {
  return {
    id,
    key: 'IDEATION',
    name: '—',
    orderIndex: 0,
    defaultOwnerDepartment: 'PRODUCT',
    sleHours: 1,
    wipLimit: 0,
    isActive: false,
    purpose: '',
  };
}

async function buildContext(
  store: DataStore,
  initiatives: Initiative[],
  now: Date,
): Promise<CardContext> {
  const [stages, users, dependencies, log] = await Promise.all([
    store.listStages(),
    store.listUsers(),
    store.listDependencies(),
    store.listActivityLog(),
  ]);

  const dependenciesByInitiative = new Map<string, Dependency[]>();
  for (const dependency of dependencies) {
    const list = dependenciesByInitiative.get(dependency.initiativeId) ?? [];
    list.push(dependency);
    dependenciesByInitiative.set(dependency.initiativeId, list);
  }

  const logByInitiative = new Map<string, ActivityLogEntry[]>();
  for (const entry of log) {
    if (!entry.initiativeId) continue;
    const list = logByInitiative.get(entry.initiativeId) ?? [];
    list.push(entry);
    logByInitiative.set(entry.initiativeId, list);
  }

  const gateByInitiative = new Map<string, { completed: number; total: number }>();
  await Promise.all(
    initiatives.map(async (initiative) => {
      const gate = await evaluateGate(store, initiative);
      gateByInitiative.set(initiative.id, { completed: gate.completedCount, total: gate.mandatoryCount });
    }),
  );

  return {
    stagesById: new Map(stages.map((stage) => [stage.id, stage])),
    usersById: new Map(users.map((user) => [user.id, user])),
    dependenciesByInitiative,
    logByInitiative,
    gateByInitiative,
    now,
  };
}

/** Vista 1 — Tablero de flujo. Una columna por fase, con WIP y SLE medio real. */
export async function getBoardView(
  store: DataStore,
  options: { now?: Date; includeArchived?: boolean } = {},
): Promise<BoardColumnView[]> {
  const now = options.now ?? new Date();
  const [stages, initiatives] = await Promise.all([
    store.listStages(),
    store.listInitiatives({ includeArchived: options.includeArchived }),
  ]);
  const context = await buildContext(store, initiatives, now);
  const cards = initiatives.map((initiative) => buildCard(initiative, context));

  return stages.map((stage) => {
    const columnCards = cards
      .filter((card) => card.stageId === stage.id)
      .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || b.sle.ratio - a.sle.ratio);
    const wipCount = columnCards.filter((card) => !card.isArchived).length;
    const averageNetMs =
      columnCards.length === 0
        ? 0
        : columnCards.reduce((total, card) => total + card.sle.netMs, 0) / columnCards.length;

    return {
      stage,
      cards: columnCards,
      wipCount,
      wipLimit: stage.wipLimit,
      // El WIP es informativo: advierte, nunca impide mover una iniciativa (D5).
      isSaturated: wipCount > stage.wipLimit,
      overBy: Math.max(0, wipCount - stage.wipLimit),
      averageNetMs,
    };
  });
}

function priorityWeight(priority: PriorityLevel): number {
  return { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 }[priority];
}

export type FlowState = 'BLOCKED' | 'PARALLEL' | 'MOVING';

export interface RadarRow {
  initiativeId: string;
  title: string;
  stageName: string;
  ownerDepartment: Department;
  assignee: PersonView | null;
  currentTask: string | null;
  priority: PriorityLevel;
  priorityReason: PriorityReason;
  dependencies: {
    id: string;
    department: Department;
    helpType: HelpType;
    isBlocking: boolean;
    description: string;
    createdAt: string;
  }[];
  flowState: FlowState;
  stopReason: StopReason | null;
  blockedDescription: string | null;
  sle: SleReading;
}

/** Vista 2 — Radar de Esperas: qué está esperando cada iniciativa, hoy. */
export async function getRadarRows(store: DataStore, options: { now?: Date } = {}): Promise<RadarRow[]> {
  const now = options.now ?? new Date();
  const [stages, initiatives, dependencies, users] = await Promise.all([
    store.listStages(),
    store.listInitiatives(),
    store.listDependencies(),
    store.listUsers(),
  ]);

  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));
  const usersById = new Map(users.map((user) => [user.id, user]));

  return initiatives
    .map((initiative) => {
      const stage = stagesById.get(initiative.currentStageId);
      const pending = dependencies.filter(
        (dependency) => dependency.initiativeId === initiative.id && dependency.status === 'PENDING',
      );

      const flowState: FlowState = initiative.isBlocked ? 'BLOCKED' : pending.length > 0 ? 'PARALLEL' : 'MOVING';

      return {
        initiativeId: initiative.id,
        title: initiative.title,
        stageName: stage?.name ?? '—',
        ownerDepartment: initiative.ownerDepartment,
        assignee: personOf(initiative.currentAssigneeId ? usersById.get(initiative.currentAssigneeId) : undefined),
        currentTask: initiative.currentTask,
        priority: initiative.priority,
        priorityReason: initiative.priorityReason,
        dependencies: pending.map((dependency) => ({
          id: dependency.id,
          department: dependency.targetDepartment,
          helpType: dependency.helpType,
          isBlocking: dependency.isBlocking,
          description: dependency.description,
          createdAt: dependency.createdAt,
        })),
        flowState,
        stopReason: initiative.stopReason,
        blockedDescription: initiative.blockedDescription,
        sle: computeSle(initiative, stage ?? fallbackStage(initiative.currentStageId), now),
      };
    })
    .sort((a, b) => {
      const weight = { BLOCKED: 3, PARALLEL: 2, MOVING: 1 } as const;
      return weight[b.flowState] - weight[a.flowState] || b.sle.ratio - a.sle.ratio;
    });
}

export interface GateItemView {
  id: string;
  label: string;
  description: string | null;
  responsibleDepartment: Department;
  isMandatory: boolean;
  isCompleted: boolean;
  completedBy: PersonView | null;
  completedAt: string | null;
  /** Solicitud de ayuda abierta que ya cubre este requisito, si la hay. */
  linkedDependencyId: string | null;
}

export interface DependencyView {
  id: string;
  targetDepartment: Department;
  helpType: HelpType;
  isBlocking: boolean;
  description: string;
  status: HelpStatus;
  requestedBy: PersonView | null;
  resolvedBy: PersonView | null;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AuditEntryView {
  id: string;
  actionType: ActivityLogEntry['actionType'];
  actor: PersonView | null;
  fromStageName: string | null;
  toStageName: string | null;
  createdAt: string;
  detail: string;
  overrideMetadata: OverrideMetadata | null;
}

export interface InitiativeDetailView {
  card: InitiativeCardView;
  stage: WorkflowStage;
  nextStage: WorkflowStage | null;
  gate: { items: GateItemView[]; completed: number; total: number; isComplete: boolean };
  dependencies: DependencyView[];
  audit: AuditEntryView[];
  creator: PersonView | null;
  departmentMembers: PersonView[];
  createdAt: string;
}

/** Vista 3 — Ficha 360° de la iniciativa (4 pestañas). */
export async function getInitiativeDetail(
  store: DataStore,
  initiativeId: string,
  options: { now?: Date } = {},
): Promise<InitiativeDetailView> {
  const now = options.now ?? new Date();
  const initiative = await store.initiativeById(initiativeId);
  if (!initiative) throw notFound(`No existe la iniciativa ${initiativeId}.`);

  const [stages, users, dependencies, log, gate] = await Promise.all([
    store.listStages(),
    store.listUsers(),
    store.listDependencies(initiativeId),
    store.listActivityLog(initiativeId),
    evaluateGate(store, initiative),
  ]);

  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const stage = stagesById.get(initiative.currentStageId) ?? fallbackStage(initiative.currentStageId);
  const nextStage = stages.find((candidate) => candidate.orderIndex === stage.orderIndex + 1) ?? null;

  const context = await buildContext(store, [initiative], now);
  const card = buildCard(initiative, context);

  const pendingDependencies = dependencies.filter((dependency) => dependency.status === 'PENDING');

  const gateItems: GateItemView[] = gate.items.map((state) => ({
    id: state.item.id,
    label: state.item.label,
    description: state.item.description,
    responsibleDepartment: state.item.responsibleDepartment,
    isMandatory: state.item.isMandatory,
    isCompleted: state.isCompleted,
    completedBy: personOf(state.completedBy ? usersById.get(state.completedBy) : undefined),
    completedAt: state.completedAt,
    linkedDependencyId:
      pendingDependencies.find((dependency) => dependency.targetDepartment === state.item.responsibleDepartment)?.id ??
      null,
  }));

  return {
    card,
    stage,
    nextStage,
    gate: {
      items: gateItems,
      completed: gate.completedCount,
      total: gate.mandatoryCount,
      isComplete: gate.isComplete,
    },
    dependencies: dependencies.map((dependency) => ({
      id: dependency.id,
      targetDepartment: dependency.targetDepartment,
      helpType: dependency.helpType,
      isBlocking: dependency.isBlocking,
      description: dependency.description,
      status: dependency.status,
      requestedBy: personOf(usersById.get(dependency.requestedBy)),
      resolvedBy: personOf(dependency.resolvedBy ? usersById.get(dependency.resolvedBy) : undefined),
      resolutionNotes: dependency.resolutionNotes,
      createdAt: dependency.createdAt,
      resolvedAt: dependency.resolvedAt,
    })),
    // Caja negra en orden cronológico inverso (TemoFlow.md §3.3).
    audit: log
      .slice()
      .reverse()
      .map((entry) => ({
        id: entry.id,
        actionType: entry.actionType,
        actor: personOf(usersById.get(entry.userId)),
        fromStageName: entry.fromStageId ? (stagesById.get(entry.fromStageId)?.name ?? null) : null,
        toStageName: entry.toStageId ? (stagesById.get(entry.toStageId)?.name ?? null) : null,
        createdAt: entry.createdAt,
        detail: describeEntry(entry),
        overrideMetadata: entry.overrideMetadata,
      })),
    creator: personOf(usersById.get(initiative.createdBy)),
    departmentMembers: users
      .filter((user) => user.isActive && user.department === initiative.ownerDepartment)
      .map((user) => ({ id: user.id, name: user.name, department: user.department })),
    createdAt: initiative.createdAt,
  };
}

function describeEntry(entry: ActivityLogEntry): string {
  const value = entry.newValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as Record<string, unknown>;
  if (typeof record.label === 'string') return record.label;
  if (typeof record.reason === 'string') return record.reason;
  if (typeof record.note === 'string') return record.note;
  if (typeof record.description === 'string') return record.description;
  if (typeof record.resolutionNotes === 'string') return record.resolutionNotes;
  if (typeof record.title === 'string') return record.title;
  return '';
}

export interface NotificationView {
  dependency: DependencyView;
  initiativeId: string;
  initiativeTitle: string;
  stageName: string;
}

/**
 * Centro de notificaciones (D9): no es una tabla, es estado derivado —
 * las solicitudes pendientes dirigidas al departamento de quien mira.
 */
export async function getNotifications(
  store: DataStore,
  session: SessionContext,
): Promise<{ received: NotificationView[]; sent: NotificationView[] }> {
  const [initiatives, dependencies, users, stages] = await Promise.all([
    store.listInitiatives({ includeArchived: true }),
    store.listDependencies(),
    store.listUsers(),
    store.listStages(),
  ]);

  const initiativesById = new Map(initiatives.map((initiative) => [initiative.id, initiative]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));

  const toView = (dependency: Dependency): NotificationView | null => {
    const initiative = initiativesById.get(dependency.initiativeId);
    if (!initiative) return null;
    return {
      dependency: {
        id: dependency.id,
        targetDepartment: dependency.targetDepartment,
        helpType: dependency.helpType,
        isBlocking: dependency.isBlocking,
        description: dependency.description,
        status: dependency.status,
        requestedBy: personOf(usersById.get(dependency.requestedBy)),
        resolvedBy: personOf(dependency.resolvedBy ? usersById.get(dependency.resolvedBy) : undefined),
        resolutionNotes: dependency.resolutionNotes,
        createdAt: dependency.createdAt,
        resolvedAt: dependency.resolvedAt,
      },
      initiativeId: initiative.id,
      initiativeTitle: initiative.title,
      stageName: stagesById.get(initiative.currentStageId)?.name ?? '—',
    };
  };

  const received = dependencies
    .filter((dependency) => dependency.status === 'PENDING' && dependency.targetDepartment === session.department)
    .map(toView)
    .filter((view): view is NotificationView => view !== null);

  const sent = dependencies
    .filter((dependency) => dependency.requestedBy === session.userId)
    .map(toView)
    .filter((view): view is NotificationView => view !== null);

  return { received, sent };
}

export type { StageChecklistItem };
